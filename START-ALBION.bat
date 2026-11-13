@echo off
setlocal
set "NODE_OPTIONS="
set "NODE_PATH="
if not exist "%~dp0runtime\node.exe" (
  echo Bundled runtime is missing. Extract the complete Albion Transport archive first.
  pause
  exit /b 1
)
"%~dp0runtime\node.exe" "%~dp0portable\launcher.mjs" %*
if errorlevel 1 (
  echo Startup failed. Read the error above and keep your data folder.
  pause
  exit /b 1
)
