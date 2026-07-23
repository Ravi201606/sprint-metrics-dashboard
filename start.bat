@echo off
setlocal

echo =====================================
echo   Sprint Metrics Dashboard Launcher
echo =====================================
echo.

echo [1/3] Checking for existing Node.js process...

tasklist /FI "IMAGENAME eq node.exe" | find /I "node.exe" >nul

if %ERRORLEVEL%==0 (
    echo Existing Node.js process found.
    echo Stopping application...
    taskkill /F /IM node.exe >nul 2>&1
    timeout /t 2 /nobreak >nul
    echo Application stopped.
) else (
    echo No running Node.js process found.
)

echo.
echo [2/3] Starting application...
start "Sprint Metrics Dashboard" cmd /k "npm start"

echo.
echo [3/3] Done.
echo Dashboard is starting in a new window.
echo.

endlocal