#!/usr/bin/env bash
set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/sql-sandbox-common.sh"

require_sql_sandbox_files
require_docker
compose_cmd up -d
wait_for_sql_sandbox
compose_cmd ps

echo "SQL sandbox is running."
