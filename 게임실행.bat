@echo off
chcp 65001 >nul
title 스노우 그릴
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [오류] Node.js 가 설치되어 있지 않습니다.
  echo        https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요.
  echo.
  start "" https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo 처음 실행이라 필요한 파일을 설치합니다. 1~2분 걸릴 수 있어요...
  call npm install
  if errorlevel 1 (
    echo.
    echo [오류] 설치에 실패했습니다. 인터넷 연결을 확인하고 다시 실행하세요.
    pause
    exit /b 1
  )
)

echo.
echo ==========================================
echo   스노우 그릴 서버를 시작합니다
echo   PC     : http://localhost:5173
echo   휴대폰 : 아래 Network 주소 (같은 Wi-Fi)
echo   종료   : 이 창을 닫거나 Ctrl + C
echo ==========================================
echo.
call npm run dev -- --open
pause
