@echo off
setlocal
set "NODE_OPTIONS="
set "NODE_PATH="
if not exist "%~dp0runtime\node.exe" (
  echo Bundled runtime is missing. Extract the complete Albion Transport archive first.
  pause
  exit /b 1
)
"%~dp0runtime\node.exe" "%~dp0portable\stop.mjs" %*
if errorlevel 1 (
  echo Stop was not confirmed. Read the error above and check the launcher window.
  pause
  exit /b 1
)
