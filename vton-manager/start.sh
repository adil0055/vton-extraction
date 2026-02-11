#!/bin/bash

# Kill ports if running (optional, but good for restart)
fuser -k 8001/tcp
fuser -k 5173/tcp

# Start Backend
echo "Starting Backend..."
cd backend
source venv/bin/activate 2>/dev/null || true # If venv exists
# If no venv, just run with python3 if packages installed globally or in user
# But better to use the current env.
# Assuming packages are installed in the current environment.
uvicorn main:app --reload --host 0.0.0.0 --port 8001 &
BACKEND_PID=$!

cd ..

# Start Frontend
echo "Starting Frontend..."
cd frontend
npm run dev -- --host &
FRONTEND_PID=$!

echo "App running."
echo "Backend: http://localhost:8001"
echo "Frontend: http://localhost:5173"
echo "Press Ctrl+C to stop."

wait $BACKEND_PID $FRONTEND_PID
