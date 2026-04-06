@echo off
title Rayzen AI — Dev Start
cd /d "C:\Projects\rayzen-ai"

echo.
echo  Rayzen AI — Subindo ambiente...
echo  (dados do banco preservados nos volumes Docker)
echo.

REM Sobe infra sem recriar volumes — dados preservados
docker compose up -d postgres redis litellm
if %errorlevel% neq 0 (
    echo.
    echo  ERRO: Docker nao respondeu. Verifique se o Docker Desktop esta aberto.
    pause
    exit /b 1
)

echo.
echo  Aguardando PostgreSQL...
timeout /t 5 /nobreak >nul

REM Abre tres terminais, um para cada processo
start "Rayzen — API" cmd /k "cd /d C:\Projects\rayzen-ai && pnpm dev:api"
timeout /t 2 /nobreak >nul
start "Rayzen — Web" cmd /k "cd /d C:\Projects\rayzen-ai && pnpm dev:web"
timeout /t 2 /nobreak >nul
start "Rayzen — Agent" cmd /k "cd /d C:\Projects\rayzen-ai && pnpm dev:agent"

echo.
echo  Tres terminais abertos.
echo.
echo  API   → http://localhost:3001
echo  Web   → http://localhost:3000
echo  Docs  → http://localhost:3001/docs
echo  Redis → redis://localhost:6379
echo.
echo  Para parar tudo: feche os terminais e rode docker compose stop
echo.
pause
