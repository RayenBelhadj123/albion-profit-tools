$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

function Stop-WithMessage([string] $Message) {
  Write-Host ""
  Write-Host $Message -ForegroundColor Red
  Write-Host ""
  exit 1
}

if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
  Stop-WithMessage "Node.js is not installed or is not on PATH. Install Node.js, then run start-local.bat again."
}

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) {
  Stop-WithMessage "npm is not available. Install Node.js with npm, then run start-local.bat again."
}

if (-not (Test-Path -LiteralPath ".env")) {
  if (Test-Path -LiteralPath ".env.example") {
    Copy-Item -LiteralPath ".env.example" -Destination ".env"
    Write-Host "Created .env from .env.example. Review DATABASE_URL if needed." -ForegroundColor Yellow
  } else {
    Stop-WithMessage "No .env file was found. Create one with DATABASE_URL, then try again."
  }
}

$databaseLine = Get-Content -LiteralPath ".env" | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
if (-not $databaseLine -or $databaseLine -match 'DATABASE_URL=\s*$') {
  Stop-WithMessage "DATABASE_URL is missing from .env. Configure PostgreSQL, then try again."
}

$databaseUrl = ($databaseLine -replace '^DATABASE_URL=', '').Trim().Trim('"')
$databaseHost = "127.0.0.1"
$databaseUrlForProcess = $databaseUrl
$wsl = Get-Command wsl.exe -ErrorAction SilentlyContinue
$wslDistros = if ($wsl) { @(& $wsl.Source --list --quiet 2>$null) } else { @() }
$wslDistroText = ($wslDistros -join " ") -replace "`0", ""
if ($wsl -and $wslDistroText -match 'Ubuntu') {
  Write-Host "Starting PostgreSQL in WSL Ubuntu..." -ForegroundColor Cyan
  & $wsl.Source -d Ubuntu -u root -- service postgresql start | Out-Null
}

$databaseReachable = Test-NetConnection -ComputerName $databaseHost -Port 5432 -WarningAction SilentlyContinue
if (-not $databaseReachable.TcpTestSucceeded -and $wsl -and $wslDistroText -match 'Ubuntu') {
  $wslAddressOutput = & $wsl.Source -d Ubuntu -- hostname -I 2>$null
  $wslAddress = (($wslAddressOutput -join " ") -replace "`0", "").Trim().Split(' ')[0]
  if ($wslAddress -match '^\d{1,3}(\.\d{1,3}){3}$') {
    $databaseHost = $wslAddress
    $databaseUrlForProcess = $databaseUrl.Replace('127.0.0.1', $wslAddress).Replace('localhost', $wslAddress)
    $env:DATABASE_URL = $databaseUrlForProcess
    Write-Host "Using WSL PostgreSQL at ${databaseHost}:5432" -ForegroundColor Cyan
    $databaseReachable = Test-NetConnection -ComputerName $databaseHost -Port 5432 -WarningAction SilentlyContinue
  }
}
if (-not $databaseReachable.TcpTestSucceeded -and $databaseHost -eq "127.0.0.1") {
  $postgresServices = Get-Service -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -match 'postgres|pgsql' -or $_.DisplayName -match 'postgres|pgsql'
  }
  $stoppedService = $postgresServices | Where-Object Status -eq "Stopped" | Select-Object -First 1
  if ($stoppedService) {
    try {
      Start-Service -Name $stoppedService.Name -ErrorAction Stop
      Start-Sleep -Seconds 2
      $databaseReachable = Test-NetConnection -ComputerName $databaseHost -Port 5432 -WarningAction SilentlyContinue
    } catch {
      Write-Host "Could not start PostgreSQL service '$($stoppedService.Name)'." -ForegroundColor Yellow
    }
  }
}

if (-not $databaseReachable.TcpTestSucceeded) {
  Stop-WithMessage "PostgreSQL is not reachable at $($databaseHost):5432. Check that PostgreSQL is installed and running."
}

# Keep every Prisma command on the endpoint that passed the reachability check.
$env:DATABASE_URL = $databaseUrlForProcess
Write-Host "Using PostgreSQL at ${databaseHost}:5432 for Prisma and the app" -ForegroundColor Cyan

if (-not (Test-Path -LiteralPath "node_modules")) {
  Write-Host "Installing dependencies..." -ForegroundColor Cyan
  & $npm.Source ci
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "Preparing Prisma..." -ForegroundColor Cyan
& $npm.Source run prisma:generate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& npx.cmd prisma migrate deploy
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& $npm.Source run prisma:seed
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$itemsSyncSucceeded = $false
for ($attempt = 1; $attempt -le 3; $attempt += 1) {
  Write-Host "Syncing Albion item catalog (attempt $attempt of 3)..." -ForegroundColor Cyan
  & $npm.Source run items:sync
  if ($LASTEXITCODE -eq 0) {
    $itemsSyncSucceeded = $true
    break
  }

  if ($attempt -lt 3) {
    Write-Host "Item sync lost the database connection; restarting PostgreSQL and retrying..." -ForegroundColor Yellow
    if ($wsl -and $wslDistroText -match 'Ubuntu') {
      & $wsl.Source -d Ubuntu -u root -- service postgresql start | Out-Null
    }
    Start-Sleep -Seconds 3
  }
}
if (-not $itemsSyncSucceeded) { exit 1 }

Write-Host "Starting Albion Transport at http://localhost:3000/black-market" -ForegroundColor Green
& $npm.Source run dev -- --hostname 127.0.0.1
exit $LASTEXITCODE
