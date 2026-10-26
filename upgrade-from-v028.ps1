param([Parameter(Mandatory = $true)][string]$OldProject, [switch]$PrepareOnly)
$ErrorActionPreference = 'Stop'
$newProject = $PSScriptRoot
$oldProjectPath = (Resolve-Path -LiteralPath $OldProject).Path
if ($oldProjectPath -eq $newProject) { throw 'Extract this release into a new folder first.' }
if (!(Test-Path (Join-Path $oldProjectPath 'backend/package.json'))) { throw 'OldProject must contain backend and frontend.' }
if (Test-Path 'C:\Program Files\nodejs\node.exe') { $env:Path = "C:\Program Files\nodejs;$env:Path" }
if (!(Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 22.12 or newer.' }
if ([version](& node -p 'process.versions.node') -lt [version]'22.12.0') { throw 'Select Node.js 22.12 or newer before continuing.' }
foreach ($relative in @('backend/.env', 'frontend/.env', 'frontend/.env.local', 'compose.yaml')) {
    $source = Join-Path $oldProjectPath $relative
    if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $newProject $relative) }
}
if ($PrepareOnly) {
    Write-Host 'Configuration copied. No database or application commands were run. Follow UPGRADE-v0.29.0.md.'
    return
}
$envFile = Join-Path $newProject 'backend/.env'
if (!(Test-Path $envFile)) { throw 'The previous backend/.env is missing. Configure a local database first.' }
$databaseLine = Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -Last 1
if (!$databaseLine) { throw 'DATABASE_URL is missing from backend/.env.' }
$databaseValue = (($databaseLine -split '=', 2)[1]).Trim().Trim('"').Trim("'")
try { $databaseUri = [uri]$databaseValue } catch { throw 'DATABASE_URL is invalid.' }
if ($databaseUri.Host -notin @('localhost', '127.0.0.1', '::1')) {
    throw 'This automatic upgrade only migrates a local database. Use -PrepareOnly and follow the production backup instructions for hosted databases.'
}
Set-Location $newProject
function Invoke-Checked { param([scriptblock]$Command) & $Command; if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code $LASTEXITCODE" } }
Invoke-Checked { docker compose up -d --wait db }
$containerId = (& docker compose ps -q db).Trim()
if (!$containerId) { throw 'Local database container not found.' }
$publishedPort = (& docker compose port db 5432).Trim()
$containerDatabase = (& docker compose exec -T db printenv POSTGRES_DB).Trim()
if (!$publishedPort -or $databaseUri.Port -ne [int]($publishedPort.Split(':')[-1]) -or
    [uri]::UnescapeDataString($databaseUri.AbsolutePath.TrimStart('/')) -ne $containerDatabase) {
    throw 'The configured local database does not match Compose db. Back up and migrate that database manually; no migration was run.'
}
$backupDirectory = Join-Path $newProject 'backups'
New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
$backupPath = Join-Path $backupDirectory ('before-v029-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.sql')
Invoke-Checked { docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /tmp/fpiupdates-before-v029.sql' }
Invoke-Checked { docker cp "${containerId}:/tmp/fpiupdates-before-v029.sql" $backupPath }
if ((Get-Item -LiteralPath $backupPath).Length -lt 100) { throw 'Database backup is empty; upgrade stopped.' }
Write-Host "Local database backup saved: $backupPath"
foreach ($relative in @('backend/uploads', 'backend/.uploads', 'backend/.local-mail')) {
    $source = Join-Path $oldProjectPath $relative
    if (Test-Path $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $newProject $relative) -Recurse -Force }
}
Invoke-Checked { npm.cmd ci }
Set-Location (Join-Path $newProject 'backend')
Invoke-Checked { npm.cmd ci }
Invoke-Checked { npm.cmd run prisma:generate }
Invoke-Checked { npm.cmd run db:migrate }
Invoke-Checked { npm.cmd run build }
Set-Location (Join-Path $newProject 'frontend')
Invoke-Checked { npm.cmd ci }
Invoke-Checked { npm.cmd run build }
Set-Location $newProject
Write-Host 'Upgrade complete. Stop the older app terminals with Ctrl+C before starting this release.'
Write-Host 'Start with: npm.cmd start'
Write-Host 'Read UPGRADE-v0.29.0.md before copying changes into your Git repository or deploying.'
