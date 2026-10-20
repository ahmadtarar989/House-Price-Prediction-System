@echo off
title House Price Prediction Dashboard

cd /d "%~dp0"

set "PYTHON=%~dp0..\..\.venv\Scripts\python.exe"

if not exist "%PYTHON%" (
    echo ERROR: Python file nahi mili.
    echo Expected location: %PYTHON%
    pause
    exit /b
)

echo Starting House Price Prediction Dashboard...

start "Dashboard Server" "%PYTHON%" main.py serve

timeout /t 5 /nobreak >nul

start "" "http://127.0.0.1:5000"

pause