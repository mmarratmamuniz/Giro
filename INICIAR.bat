@echo off
title Finish Bebidas - Servidor Local
chcp 65001 > nul
cd /d "%~dp0"

echo.
echo  ==================================================
echo             FINISH BEBIDAS - SISTEMA
echo  ==================================================
echo.
echo [INFO] Inicializando o servidor local...
echo [INFO] O sistema abrira no seu navegador em instantes.
echo.
echo ==================================================
echo   👉 Acesse: http://localhost:8000
echo   👉 Para desligar o sistema, basta fechar esta janela.
echo ==================================================
echo.

:: Executa a abertura do navegador em segundo plano após um pequeno delay
start /b cmd /c "timeout /t 3 >nul && start http://localhost:8000"

:: Iniciar o servidor usando o Python Embutido (Standalone)
"python-embed\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
pause
