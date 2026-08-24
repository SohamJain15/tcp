#!/usr/bin/env bash
set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/sql-sandbox-common.sh"

require_sql_sandbox_files
require_docker
compose_cmd ps

running_services="$(compose_cmd ps --services --filter status=running)"
if printf '%s\n' "${running_services}" | grep -qx 'sql-sandbox'; then
  expected_port="$(sed -n 's/^SQL_SANDBOX_PUBLISHED_PORT=//p' "${ENV_FILE}" | tail -n 1)"
  expected_port="${expected_port:-3307}"
  actual_port="$(docker port tcp-sql-sandbox 3306/tcp 2>/dev/null || true)"

  if printf '%s\n' "${actual_port}" | grep -Fqx "127.0.0.1:${expected_port}"; then
    echo "SQL sandbox status: running (127.0.0.1:${expected_port})"
    exit 0
  fi

  echo "SQL sandbox container is running, but loopback port 127.0.0.1:${expected_port} is not published." >&2
  echo "Recreate it with: npm run sql-sandbox:down && npm run sql-sandbox:up" >&2
  exit 1
fi

echo "SQL sandbox status: not running" >&2
exit 1
