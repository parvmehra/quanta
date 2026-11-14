@echo off
echo Starting Quanta...
start cmd /k "cd backend && npm run dev"
start cmd /k "cd frontend && npm run dev"
echo Backend: http://localhost:3001   Frontend: http://localhost:5173
