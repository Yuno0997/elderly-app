@echo off
setlocal

echo Stopping ngrok (if running)...
taskkill /F /IM ngrok.exe >nul 2>&1

echo Stopping backend Node processes (port 4000)...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":4000 .*LISTENING" ^| findstr ":4000"') do (
  taskkill /F /PID %%P >nul 2>&1
)

echo Stopping ngrok web interface (port 4040)...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":4040 .*LISTENING" ^| findstr ":4040"') do (
  taskkill /F /PID %%P >nul 2>&1
)

echo Optional: invalidating all login sessions...
choice /M "Invalidate ALL sessions (force logout everyone)?"
if errorlevel 2 goto :skipInvalidate
call npm -s run sessions:kill-all
:skipInvalidate
echo Done.
pause
exit /b 0