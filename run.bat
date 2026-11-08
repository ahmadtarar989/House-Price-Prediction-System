@echo off
title Housing Data Pipeline Dashboard

cd /d "%~dp0"

set "PYTHON=%~dp0.venv\Scripts\python.exe"

if not exist "%PYTHON%" (
    echo ERROR: .venv ka Python nahi mila.
    echo Expected location: %PYTHON%
    echo.
    echo Pehle ye commands chalayein:
    echo   py -3.12 -m venv .venv
    echo   .venv\Scripts\python.exe -m pip install -r requirements.txt
    pause
    exit /b
)

echo Starting Housing Data Pipeline Dashboard...

start "Dashboard Server" "%PYTHON%" main.py serve

timeout /t 5 /nobreak >nul

start "" "http://127.0.0.1:5000"

echo.
echo Dashboard browser mein khul gaya hai.
echo Server band karne ke liye "Dashboard Server" wali window band kar dein.
pause
