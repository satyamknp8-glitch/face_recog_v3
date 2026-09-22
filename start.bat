@echo off
start cmd /k "cd webapp\backend && venv\Scripts\activate && uvicorn api:app --reload --port 8000"
start cmd /k "cd webapp\frontend && npm run dev"
timeout /t 3
start http://localhost:5173