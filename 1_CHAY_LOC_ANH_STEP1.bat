@echo off
cd /d "%~dp0"
title PET LEAD AI - STEP 1 RUNNER

:: 1. Uu tien tim phien ban Python 3.11 co san thu vien onnxruntime
set "PY_BIN="
py -3.11 -c "import onnxruntime" >nul 2>&1
if not errorlevel 1 (
    set "PY_BIN=py -3.11"
    goto :run
)

if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" (
    "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" -c "import onnxruntime" >nul 2>&1
    if not errorlevel 1 (
        set "PY_BIN="%LOCALAPPDATA%\Programs\Python\Python311\python.exe""
        goto :run
    )
)

python -c "import onnxruntime" >nul 2>&1
if not errorlevel 1 (
    set "PY_BIN=python"
    goto :run
)

py -c "import sys" >nul 2>&1
if not errorlevel 1 (
    set "PY_BIN=py"
    goto :run
)

python -c "import sys" >nul 2>&1
if not errorlevel 1 (
    set "PY_BIN=python"
    goto :run
)

echo [ERROR] Khong tim thay Python tren he thong!
echo Vui long cai dat Python tu https://www.python.org/
pause
exit /b 1

:run
%PY_BIN% step1_follower_harvester\python_pipeline\run_step1_interactive.py %*
echo.
pause

