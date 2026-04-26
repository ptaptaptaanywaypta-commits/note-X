@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ==========================================
echo X投稿案を生成します
echo ==========================================
echo.
echo 1. input\ここにnote記事URLを貼る.txt からURLを読み込みます。
echo 2. OpenAI APIで投稿案を生成します。
echo 3. output フォルダに保存します。
echo.

if not exist "node_modules" (
  echo 初回準備中です。少し待ってください...
  call npm.cmd install
  if errorlevel 1 (
    echo.
    echo npm install に失敗しました。
    pause
    exit /b 1
  )
)

call npm.cmd run generate
if errorlevel 1 (
  echo.
  echo 生成に失敗しました。
  echo .env と input\ここにnote記事URLを貼る.txt を確認してください。
  pause
  exit /b 1
)

echo.
echo 完了しました。output フォルダを開きます。
start "" "%~dp0output"
if exist "%~dp0output\まず見る_X投稿案.md" (
  start "" "%~dp0output\まず見る_X投稿案.md"
)
pause
