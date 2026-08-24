#!/usr/bin/env bash
set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/sql-sandbox-common.sh"

require_sql_sandbox_files
require_docker
compose_cmd ps

running_services="$(compose_cmd ps --services --filter status=running)"
if printf '%s\n' "${running_services}" | grep -qx 'sql-sandbox'; then
  echo "SQL sandbox status: running"
  exit 0
fi

echo "SQL sandbox status: not running" >&2
exit 1
