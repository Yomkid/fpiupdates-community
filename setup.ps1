$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
function Invoke-Checked {
  param([scriptblock]$Command)
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code $LASTEXITCODE" }
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 22.12+ or 24 LTS first.' }
[version]$nodeVersion = (& node -p 'process.versions.node')
if ($nodeVersion -lt [version]'22.12.0') { throw 'This project requires Node.js 22.12 or newer. Upgrade Node.js, reopen PowerShell, then rerun this script.' }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Install and start Docker Desktop first.' }
if (-not (Test-Path 'backend/.env')) { Copy-Item 'backend/.env.example' 'backend/.env' }
Invoke-Checked { docker compose up -d --wait db }
Set-Location backend
Invoke-Checked { npm.cmd ci }
Invoke-Checked { npm.cmd run prisma:generate }
Invoke-Checked { npm.cmd run db:migrate }
Invoke-Checked { npm.cmd run build }
Set-Location ../frontend
Invoke-Checked { npm.cmd ci }
Invoke-Checked { npm.cmd run build }
Set-Location ..
Write-Host 'Open http://localhost:5173 in your browser.'
Invoke-Checked { node scripts/start.mjs }
