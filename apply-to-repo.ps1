param([Parameter(Mandatory = $true)][string]$Repository)
$ErrorActionPreference = 'Stop'
$destination = (Resolve-Path -LiteralPath $Repository).Path
if (!(Test-Path (Join-Path $destination '.git'))) { throw 'Repository must be the existing Git project root.' }
if ($destination -eq $PSScriptRoot) { throw 'Select the existing repository, not this extracted release.' }
$status = & git -C $destination status --porcelain
if ($LASTEXITCODE -ne 0 -or $status) { throw 'Commit or stash your existing changes before applying this release.' }
$branch = 'upgrade/v0.29.2-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
& git -C $destination switch -c $branch
if ($LASTEXITCODE -ne 0) { throw 'Could not create the upgrade branch.' }
& robocopy.exe $PSScriptRoot $destination /E /R:1 /W:1 /XJ /XD .git node_modules dist .test-dist uploads .uploads .local-mail backups /XF .env .env.* *.zip *.log
if ($LASTEXITCODE -ge 8) { throw 'Source copy failed. Review the upgrade branch.' }
& git -C $destination status --short
Write-Host "Changes copied to branch $branch. Review, test and commit them. Nothing has been pushed."
