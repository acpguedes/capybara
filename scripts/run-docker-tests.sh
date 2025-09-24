#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/docker-compose.yml"
SERVICE_NAME="web-extension"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required but was not found in PATH." >&2
  exit 1
fi

COMPOSE_COMMAND=(docker compose)

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "docker-compose.yml not found at $COMPOSE_FILE" >&2
  exit 1
fi

if [ "$#" -gt 0 ]; then
  exec "${COMPOSE_COMMAND[@]}" -f "$COMPOSE_FILE" run --rm "$SERVICE_NAME" "$@"
else
  exec "${COMPOSE_COMMAND[@]}" -f "$COMPOSE_FILE" run --rm "$SERVICE_NAME" npm run test
fi
