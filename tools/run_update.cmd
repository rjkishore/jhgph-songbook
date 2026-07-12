@echo off
REM ── NJP weekly chord updater ──────────────────────────────────────────────
REM Scans the chord sites for newly added songs, refreshes songs.json,
REM commits it, and tries to push. Logs everything to update.log.
REM Run manually by double-clicking, or via the scheduled task "NJP Chord Update".

setlocal
set REPO=D:\RK Software\Chords
set TOOLS=%REPO%\tools
set LOG=%TOOLS%\update.log
set PY=C:\Users\Admin\AppData\Local\Microsoft\WindowsApps\python.exe

echo ================================================= >> "%LOG%"
echo Run started: %DATE% %TIME% >> "%LOG%"

cd /d "%TOOLS%"
"%PY%" update.py >> "%LOG%" 2>&1

REM Commit the refreshed data (safe even if nothing changed)
cd /d "%REPO%"
git add songs.json >> "%LOG%" 2>&1
git commit -m "Auto-update: refresh song chords (%DATE%)" >> "%LOG%" 2>&1
git push >> "%LOG%" 2>&1

echo Run finished: %DATE% %TIME% >> "%LOG%"
echo. >> "%LOG%"
endlocal
