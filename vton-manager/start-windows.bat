@echo off
echo ========================================
echo VTON Manager - Windows Startup Script
echo ========================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python from https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during installation
    pause
    exit /b 1
)

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo [1/4] Setting up Backend...
cd backend

REM Create virtual environment if it doesn't exist
if not exist "venv" (
    echo Creating Python virtual environment...
    python -m venv venv
)

REM Activate virtual environment
call venv\Scripts\activate.bat

REM Install backend dependencies
echo Installing backend dependencies...
pip install -r requirements.txt

echo.
echo [2/4] Setting up Frontend...
cd ..\frontend

REM Install frontend dependencies if node_modules doesn't exist
if not exist "node_modules" (
    echo Installing frontend dependencies...
    npm install
)

echo.
echo [3/4] Starting Backend Server...
cd ..\backend
call venv\Scripts\activate.bat
start "VTON Backend" cmd /k "uvicorn main:app --reload --host 0.0.0.0 --port 8001"

echo.
echo [4/4] Starting Frontend Server...
cd ..\frontend
start "VTON Frontend" cmd /k "npm run dev"

echo.
echo ========================================
echo Application is starting!
echo ========================================
echo Backend:  http://localhost:8001
echo Frontend: http://localhost:5173
echo.
echo Two new windows have opened for backend and frontend.
echo Close those windows to stop the servers.
echo ========================================
pause
