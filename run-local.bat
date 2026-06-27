@echo off
setlocal
cd /d "%~dp0"

where python >nul 2>nul
if %errorlevel%==0 (
  echo http://localhost:8080/ を開いてください。
  python -m http.server 8080 --bind 127.0.0.1
  exit /b %errorlevel%
)

where py >nul 2>nul
if %errorlevel%==0 (
  echo http://localhost:8080/ を開いてください。
  py -m http.server 8080 --bind 127.0.0.1
  exit /b %errorlevel%
)

echo Python が見つかりません。
echo VS Code の Live Server、または GitHub Pages / Netlify / Vercel で公開してください。
pause
exit /b 1
