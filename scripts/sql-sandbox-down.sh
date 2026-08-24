#!/usr/bin/env bash
set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/sql-sandbox-common.sh"

require_sql_sandbox_files
require_docker

# Deliberately preserve the MySQL volume. Use Docker Compose directly with -v only
# when the dedicated sandbox data must be destroyed and recreated.
compose_cmd down
