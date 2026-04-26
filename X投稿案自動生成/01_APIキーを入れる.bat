@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo .env をメモ帳で開きます。
echo OPENAI_API_KEY=... を入れて保存してください。
if not exist ".env" (
  copy ".env.example" ".env" >nul
)
notepad ".env"
