@echo off
setlocal
title Mosque Management System - Launcher

:: -----------------------------------------------------------------------------
:: MOSQUE MANAGEMENT SYSTEM - UNIFIED LAUNCHER
:: -----------------------------------------------------------------------------
:: This script handles the full startup sequence:
:: 1. Updates dependencies
:: 2. Initializes the database
:: 3. Starts the server and opens the dashboard
:: -----------------------------------------------------------------------------

echo [+] Starting Mosque Management System...
cd /d "%~dp0"

:: TIP: To sync updates from GitHub when you're ready, you can add 
:: "git pull origin main" as the first command after '@echo off'.

echo [+] Checking for system updates (npm install)...
call npm install --no-fund --no-audit

echo [+] Ensuring Database is ready...
node database/init.js

echo [+] Starting Server...
:: Start the server in a new minimized window or in background
start /min "MMS Server" npm start

:: Give the server a few seconds to wake up
timeout /t 3 /nobreak > nul

echo [+] Opening Chrome Dashboard...
:: Launch Chrome in App Mode
start chrome.exe --app="http://localhost:3000"

echo.
echo [!] MMS is now running in the background.
echo [!] To stop the system, close the "MMS Server" terminal window.
echo.
pause
