@echo off
setlocal
title Spirefall
cd /d "%~dp0"

rem ============================================================
rem  Spirefall one-click launcher (Windows)
rem  - first run: installs dependencies automatically
rem  - starts the game server (:8787) and the web client (:5173)
rem    in this console, then opens the browser when ready
rem  - closing this window (or Ctrl+C) stops everything
rem ============================================================

where node >nul 2>nul
if errorlevel 1 (
  echo [Spirefall] Node.js was not found. Install Node.js 20 or newer from https://nodejs.org/ then run this file again.
  pause
  exit /b 1
)

rem Pin the ports so a stray PORT environment variable cannot move them.
set "PORT=8787"

if not exist "node_modules\" (
  echo [Spirefall] First run: installing dependencies, this can take a minute...
  call npm install
  if errorlevel 1 (
    echo [Spirefall] npm install failed. Check your network and run this file again.
    pause
    exit /b 1
  )
)

echo [Spirefall] Starting servers. Keep this window open while playing; close it to stop.
start /b cmd /c "title Spirefall game server && node --import file:///%~dp0node_modules/tsx/dist/loader.mjs server/server.ts"
start /b cmd /c "title Spirefall web client && npx vite --host 0.0.0.0"

powershell -NoProfile -Command "$u='http://localhost:5173'; $ok=$false; foreach($i in 1..120){ try{ $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 $u; if($r.StatusCode -eq 200){ $ok=$true; break } }catch{}; Start-Sleep -Milliseconds 500 }; if($ok){ Start-Process $u } else { Write-Host '[Spirefall] Client did not come up on port 5173. Open http://localhost:5173 manually.' }"

echo.
echo [Spirefall] Ready: http://localhost:5173  (game server on port 8787)
echo [Spirefall] LAN players: open http://YOUR-IP:5173 and join with the room code.
echo [Spirefall] Close this window to stop the servers.
pause
