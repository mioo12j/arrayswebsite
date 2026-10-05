@echo off
rem ===== ARRAYS INGENIERIA ERP — double-click to open the app =====
title ARRAYS ERP
echo Starting ARRAYS ERP... this window will close automatically.
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0start-arrays.ps1"
exit
