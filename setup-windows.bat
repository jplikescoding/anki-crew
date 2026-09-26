@echo off
rem Double-click setup for Windows. Finds Python (installing it if needed),
rem then runs the two-question setup in publisher\setup.py.
setlocal
title Anki Crew setup
cd /d "%~dp0publisher"
echo Anki Crew setup
echo.

call :findpy
if not defined PY (
    echo Installing Python - this takes a minute or two...
    winget install -e --id Python.Python.3.12 --scope user --silent --accept-package-agreements --accept-source-agreements
    call :findpy
)
if not defined PY (
    echo.
    echo Couldn't install Python automatically.
    echo Install it from https://www.python.org/downloads/ then double-click this file again.
    goto :done
)
echo [ok] Python ready

"%PY%" setup.py --easy

:done
echo.
pause
exit /b

rem Sets PY to a real Python 3.9+ or leaves it empty. Asks Python for its own
rem path, which skips the Microsoft Store "python" stub (it prints nothing),
rem then looks where winget installs it, since this window's PATH is stale.
:findpy
set "PY="
set "PROBE=import sys; sys.version_info >= (3, 9) and print(sys.executable)"
for /f "delims=" %%P in ('py -3 -c "%PROBE%" 2^>nul') do set "PY=%%P"
if defined PY exit /b
for /f "delims=" %%P in ('python -c "%PROBE%" 2^>nul') do set "PY=%%P"
if defined PY exit /b
for /d %%D in ("%LOCALAPPDATA%\Programs\Python\Python3*") do if exist "%%D\python.exe" set "PY=%%D\python.exe"
exit /b
