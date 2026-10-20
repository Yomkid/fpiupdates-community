param(
    [string]$OldProject = (Join-Path $HOME 'Documents\GitHub\FpiUpdates-v0.13.0\fpiupdates')
)
$ErrorActionPreference = 'Stop'
$newProject = $PSScriptRoot
function Invoke-Checked {
    param([scriptblock]$Command)
    & $Command
    if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code $LASTEXITCODE. Upgrade stopped." }
}
if (!(Test-Path (Join-Path $OldProject 'backend\.env'))) { throw 'Previous backend/.env not found. Supply -OldProject with the correct path.' }
$backupDirectory = Join-Path $newProject 'backups'
New-Item -ItemType Directory -Force -Path $backupDirectory | Out-Null
$backupPath = Join-Path $backupDirectory ("fpiupdates-before-v014-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.sql')
Set-Location $OldProject
Invoke-Checked { docker compose up -d --wait db }
Invoke-Checked { docker compose exec -T db pg_dump -U fpiupdates -d fpiupdates -f /tmp/fpiupdates-before-v014.sql }
Invoke-Checked { docker compose cp db:/tmp/fpiupdates-before-v014.sql $backupPath }
if (!(Test-Path $backupPath) -or (Get-Item $backupPath).Length -eq 0) { throw 'Database backup is missing or empty. Upgrade stopped.' }
Write-Host "Database backup saved: $backupPath"
if (!(Test-Path (Join-Path $newProject 'backend\.env'))) { Copy-Item (Join-Path $OldProject 'backend\.env') (Join-Path $newProject 'backend\.env') }
$oldFrontendEnv = Join-Path $OldProject 'frontend\.env'
$newFrontendEnv = Join-Path $newProject 'frontend\.env'
if ((Test-Path $oldFrontendEnv) -and !(Test-Path $newFrontendEnv)) { Copy-Item -LiteralPath $oldFrontendEnv -Destination $newFrontendEnv }
# Preserve the previously tested port mapping and database-volume configuration.
Copy-Item (Join-Path $OldProject 'compose.yaml') (Join-Path $newProject 'compose.yaml')
$oldMedia = Join-Path $OldProject 'backend\.uploads'
$newMedia = Join-Path $newProject 'backend\.uploads'
if ((Test-Path $oldMedia) -and !(Test-Path $newMedia)) { Copy-Item -LiteralPath $oldMedia -Destination $newMedia -Recurse }
# A custom absolute MEDIA_DIRECTORY remains valid through the copied .env.
Set-Location $newProject
& (Join-Path $newProject 'setup.ps1')
