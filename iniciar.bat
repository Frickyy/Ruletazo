@echo off
REM Levanta el backend (FastAPI) y el frontend (Vite) de Ruletazo
start "Ruletazo - Backend" cmd /k "cd /d "%~dp0backend" && .venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000"
start "Ruletazo - Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"
