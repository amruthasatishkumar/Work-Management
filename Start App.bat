@echo off
echo Starting Work Management App...
echo.

:: Start backend
start "Backend (API)" cmd /k "cd /d "%~dp0work-management\backend" && set PATH=%PATH%;C:\Program Files\nodejs && set NODE_OPTIONS=--no-warnings && npx ts-node-dev --transpile-only src/index.ts"

:: Wait a moment for backend to initialize
timeout /t 3 /nobreak >nul

:: Start frontend
start "Frontend (UI)" cmd /k "cd /d "%~dp0work-management\frontend" && set PATH=%PATH%;C:\Program Files\nodejs && npm run dev"

echo.
echo Both servers starting...
echo   Backend API: http://localhost:3001
echo   Frontend UI: http://localhost:5173
echo.
echo Opening browser in 5 seconds...
timeout /t 5 /nobreak >nul
start http://localhost:5173
