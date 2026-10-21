@echo off
chcp 65001 >nul
echo ========================================================
echo  🐾 PET LEAD AI - TOOL 2: AI VISION & DOG CLASSIFIER
echo  Mo hinh YOLOv8-cls (dog-model.onnx) & Gatekeeper
echo ========================================================
echo.

set SCRIPT_DIR=%~dp0Pet_Lead_AI_System\step1_follower_harvester\python_pipeline
cd /d "%SCRIPT_DIR%"

if exist "run_step1_interactive.py" (
    echo Dang khoi dong bo tham dinh AI thi giac...
    python run_step1_interactive.py
) else (
    echo [LOI] Khong tim thay run_step1_interactive.py
)

pause
