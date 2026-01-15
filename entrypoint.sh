#!/bin/bash

# Entrypoint script for AIOStreams deployment

set -e

# Environment validation
if [[ -z "$SECRET_KEY" ]]; then
    echo "Warning: SECRET_KEY is not set. The application may not function correctly."
fi

if [[ -z "$DATABASE_URI" ]]; then
    echo "Warning: DATABASE_URI is not set. The application may not function correctly."
fi

# Create data directory if it doesn't exist (for SQLite)
if [ ! -d "data" ]; then
    echo "Creating data directory..."
    mkdir -p data
fi

# Start the application
echo "Starting AIOStreams..."
exec node packages/server/dist/server.js