@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "output" mkdir "output"
start "" "%~dp0output"
if exist "%~dp0output\まず見る_X投稿案.md" (
  start "" "%~dp0output\まず見る_X投稿案.md"
)
