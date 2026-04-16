@echo off
cd /d C:\Users\jj\Downloads\cook

REM --- Next.js on port 3000 ---
netstat -ano | find ":3000 " | find "LISTENING" >nul 2>&1
if errorlevel 1 (
    start "Sakayan :3000" /min cmd /c "cd /d C:\Users\jj\Downloads\cook && npm run dev >> dev.log 2>&1"
    echo [%time%] Started Next.js on :3000
) else (
    echo [%time%] :3000 already running, skipped
)

REM --- Photo Review UI on port 7790 ---
netstat -ano | find ":7790 " | find "LISTENING" >nul 2>&1
if errorlevel 1 (
    start "Sakayan Photo Review :7790" /min cmd /c "cd /d C:\Users\jj\Downloads\cook && node scripts/photo_review_server.js >> scripts/photo_review.log 2>&1"
    echo [%time%] Started photo review on :7790
) else (
    echo [%time%] :7790 already running, skipped
)


