@echo off
setlocal EnableDelayedExpansion

echo Closing existing ngrok (if any)...
taskkill /F /IM ngrok.exe >nul 2>&1

echo Closing existing backend on port 4000 (if any)...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":4000 .*LISTENING"') do (
  taskkill /F /PID %%P >nul 2>&1
)

if not exist ngrok.yml (
  echo ERROR: ngrok.yml configuration file not found!
  echo Please create ngrok.yml with your ngrok configuration.
  pause
  exit /b 1
)

set "NGROK_TOKEN="
if defined NGROK_AUTHTOKEN (
  set "NGROK_TOKEN=!NGROK_AUTHTOKEN!"
) else if exist "%~dp0ngrok.token" (
  for /f "usebackq delims=" %%T in ("%~dp0ngrok.token") do (
    set "NGROK_TOKEN=%%T"
    goto :have_ngrok_token
  )
)
:have_ngrok_token

if not defined XAMPP_HOME set "XAMPP_HOME=C:\xampp"
echo [1/5] Starting XAMPP Apache ^(if not already running^)...
if exist "!XAMPP_HOME!\apache\bin\httpd.exe" (
  tasklist /FI "IMAGENAME eq httpd.exe" 2>nul | find /I "httpd.exe" >nul
  if errorlevel 1 (
    echo     Launching httpd.exe from !XAMPP_HOME! ...
    set "HTTPD=!XAMPP_HOME!\apache\bin\httpd.exe"
    start "" /B "!HTTPD!"
    timeout /t 2 /nobreak >nul
  ) else (
    echo     Apache ^(httpd.exe^) is already running.
  )
) else (
  echo WARNING: Apache not found at !XAMPP_HOME!\apache\bin\httpd.exe
  echo     Set environment variable XAMPP_HOME to your XAMPP folder, or start Apache manually.
)

echo [2/5] Deploying frontend to XAMPP...
call npm -s run deploy:xampp
if errorlevel 1 goto :fail

echo Checking local Apache ^(XAMPP^) — same port as ngrok upstream...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\check-local-apache.ps1"
if errorlevel 1 (
  echo.
  echo WARNING: Local site did not respond. Ngrok will show 502 until Apache serves the app.
  echo   - Open XAMPP Control Panel and click Start for Apache.
  echo   - If Apache uses port 8080, create ngrok_upstream_port.txt with 8080 on one line and re-run.
  echo   - Test: open http://127.0.0.1/elderly-app/ ^(or :8080/elderly-app/^) in your browser.
  echo.
)

echo [3/5] Starting backend (port 4000)...
start "Elderly App Backend" /D "%~dp0" cmd /k "npm -s run start"

timeout /t 3 /nobreak >nul

set "NGROK_STARTED=0"
if not defined NGROK_TOKEN (
  echo [4/5] Skipping ngrok — no authtoken.
  echo     Set environment variable NGROK_AUTHTOKEN, or create ngrok.token in this folder
  echo     with your token on one line ^(Dashboard: https://dashboard.ngrok.com/get-started/your-authtoken^).
  echo     Your ngrok account must be verified ^(ERR_NGROK_4018^).
  goto :after_ngrok
)

echo [4/5] Starting ngrok tunnel...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\write-ngrok-config.ps1"
if errorlevel 1 (
  echo Failed to write ngrok.generated.yml
  goto :fail
)
REM Pass token on start (ngrok v3); ngrok.generated.yml matches optional ngrok_upstream_port.txt
set "NGROK_STARTED=1"
start "Elderly App ngrok" /D "%~dp0" cmd /k "tools\ngrok\ngrok.exe start --authtoken !NGROK_TOKEN! --config=ngrok.generated.yml elderly-app"

:after_ngrok
echo [5/5] Done.
echo - Local UI:  http://localhost/elderly-app/
echo - Backend:   http://localhost:4000/api/health
if "!NGROK_STARTED!"=="1" (
  echo - Ngrok URL: check the ngrok window or http://127.0.0.1:4040
) else (
  echo - Ngrok: not started ^(optional — use NGROK_AUTHTOKEN or ngrok.token^).
)
echo.
pause
exit /b 0

:fail
echo.
echo Failed. See output above.
pause
exit /b 1
