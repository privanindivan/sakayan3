@echo off
:loop
cls
echo === Apify Progress ===
findstr "Progress Batch Done failed" C:\Users\jj\AppData\Local\Temp\apify_details.log
timeout /t 15 /nobreak >nul
goto loop
