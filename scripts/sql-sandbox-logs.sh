#!/usr/bin/env bash
set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/sql-sandbox-common.sh"

require_sql_sandbox_files
require_docker
compose_cmd logs --tail=100 --follow sql-sandbox
