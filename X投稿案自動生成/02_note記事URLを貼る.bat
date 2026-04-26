@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "input" mkdir "input"
if not exist "input\ここにnote記事URLを貼る.txt" (
  echo ここにnote記事URLを貼って保存してください。> "input\ここにnote記事URLを貼る.txt"
)
notepad "input\ここにnote記事URLを貼る.txt"
