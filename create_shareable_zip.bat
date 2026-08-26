@echo off
title Create Shareable ZIP
cd /d "%~dp0"

echo Creating clean NestLedger package (excluding node_modules and cache)...

powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -Path 'src', 'public', 'index.html', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'launch.bat', 'vercel.json' -DestinationPath 'NestLedger-Clean.zip' -Force"

if exist "NestLedger-Clean.zip" (
    echo.
    echo ============================================================
    echo SUCCESS: NestLedger-Clean.zip has been created successfully!
    echo Location: %~dp0NestLedger-Clean.zip
    echo ============================================================
) else (
    echo.
    echo Failed to create ZIP file.
)

pause
