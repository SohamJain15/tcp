#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
SQL_SANDBOX_DIR="${REPO_ROOT}/infrastructure/sql-sandbox"
COMPOSE_FILE="${SQL_SANDBOX_DIR}/docker-compose.yml"
ENV_FILE="${SQL_SANDBOX_DIR}/.env"
MYSQL_CONFIG_FILE="${SQL_SANDBOX_DIR}/mysql.cnf"

require_sql_sandbox_files() {
  if [[ ! -f "${ENV_FILE}" ]]; then
    echo "Missing ${ENV_FILE}. Copy infrastructure/sql-sandbox/.env.example to .env and set both passwords." >&2
    exit 1
  fi

  if [[ ! -f "${COMPOSE_FILE}" ]]; then
    echo "Missing SQL sandbox compose file: ${COMPOSE_FILE}" >&2
    exit 1
  fi

  if [[ ! -f "${MYSQL_CONFIG_FILE}" ]]; then
    echo "Missing ${MYSQL_CONFIG_FILE}. Create it on the server with:" >&2
    echo "  cp infrastructure/sql-sandbox/mysql.cnf.example infrastructure/sql-sandbox/mysql.cnf" >&2
    exit 1
  fi
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker is required to manage the SQL sandbox." >&2
    exit 1
  fi

  if ! docker info >/dev/null 2>&1; then
    echo "Docker is installed but the daemon is not available." >&2
    echo "On Linux, run: sudo systemctl enable --now docker" >&2
    exit 1
  fi
}

compose_cmd() {
  docker compose \
    --project-directory "${SQL_SANDBOX_DIR}" \
    --env-file "${ENV_FILE}" \
    --file "${COMPOSE_FILE}" \
    "$@"
}

wait_for_sql_sandbox() {
  for _ in {1..30}; do
    health_state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' tcp-sql-sandbox 2>/dev/null || true)"
    case "${health_state}" in
      healthy)
        return 0
        ;;
      unhealthy)
        echo "The SQL sandbox health check reported unhealthy." >&2
        return 1
        ;;
    esac
    sleep 2
  done

  echo "Timed out waiting for the SQL sandbox health check." >&2
  return 1
}
