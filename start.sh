#!/bin/bash
set -e

echo "[START] Starting SEFAZ-PROXY..."
node api/sefaz-proxy.js &
SEFAZ_PID=$!

echo "[START] Starting EVOLUTION-WORKER..."
npm run worker:evolution &
WORKER_PID=$!

echo "[START] Both processes started (PIDs: $SEFAZ_PID, $WORKER_PID)"

# Handle graceful shutdown
trap "kill $SEFAZ_PID $WORKER_PID 2>/dev/null || true" SIGTERM SIGINT

# Wait for both processes
wait $SEFAZ_PID $WORKER_PID
