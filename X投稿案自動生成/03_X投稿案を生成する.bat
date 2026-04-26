@echo off
cd /d "%~dp0"

echo Generating X posts...
echo.

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm.cmd was not found.
  echo Please make sure Node.js is installed.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo First setup. Installing packages...
  call npm.cmd install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

call npm.cmd run generate
if errorlevel 1 (
  echo Generation failed.
  echo Check .env and the note URL text file.
  pause
  exit /b 1
)

echo.
echo Done. Opening output folder...
if not exist "output" mkdir "output"
explorer "%CD%\output"
pause
