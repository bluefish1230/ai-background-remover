@echo off
setlocal

set "PORT=3000"
set "BUNDLED_NODE=C:\Users\user\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if exist "%BUNDLED_NODE%" (
  "%BUNDLED_NODE%" server.js
  goto :eof
)

where node >nul 2>nul
if %errorlevel%==0 (
  node server.js
  goto :eof
)

echo Node.js was not found.
echo Please install Node.js from https://nodejs.org/ or run this inside Codex.
pause
