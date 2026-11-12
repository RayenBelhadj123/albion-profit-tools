@echo off
setlocal
cd /d "%~dp0"
if not exist ".next\standalone\server.js" (
  echo Local production build not found. Run: npm run build
  pause
  exit /b 1
)
set HOSTNAME=127.0.0.1
set PORT=3000
node ".next\standalone\server.js"
