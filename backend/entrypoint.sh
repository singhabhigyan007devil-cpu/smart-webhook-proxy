#!/bin/bash
set -e

echo "Running Alembic Database Migrations..."
# Run migrations using the alembic.ini config
alembic -c alembic.ini upgrade head

echo "Starting Backend Application..."
# Execute the original CMD passed from the Dockerfile
exec "$@"
