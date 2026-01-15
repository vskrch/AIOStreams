#!/bin/bash

# Entrypoint script for AIOStreams deployment on Heroku

set -e

# Environment validation
if [[ -z "$MY_ENV_VAR" ]]; then
    echo "Error: MY_ENV_VAR is not set."
    exit 1
fi

# Directory creation
if [ ! -d "my_directory" ]; then
    echo "Creating directory my_directory..."
    mkdir my_directory
fi

# Start the application
echo "Starting the application..."
exec python app.py