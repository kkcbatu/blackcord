@echo off
cd /d "%~dp0desktop"
set CSC_IDENTITY_AUTO_DISCOVERY=false
npm install
npm run dist
pause
