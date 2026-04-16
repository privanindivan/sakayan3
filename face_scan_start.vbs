Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c cd /d C:\Users\jj\Downloads\cook && node scripts\face_scan_runner.js >> C:\Users\jj\Downloads\cook\face_scan.log 2>&1", 0, False
