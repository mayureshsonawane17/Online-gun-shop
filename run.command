#!/bin/bash
cd "$(dirname "$0")"

PORT=8080
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null ; then
    echo "Server already running on port $PORT"
else
    echo "Starting local server on port $PORT..."
    python3 -m http.server $PORT &
    sleep 1
fi

open "http://localhost:$PORT/gun-shop.html"
echo "Opened Gun Shop at http://localhost:$PORT/gun-shop.html"

