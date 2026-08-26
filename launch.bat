@echo off
title NestLedger
cd /d "%~dp0"

if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
)

echo Starting NestLedger...
npm run dev -- --open
