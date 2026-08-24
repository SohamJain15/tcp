#!/usr/bin/env bash
set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/sql-sandbox-common.sh"

require_sql_sandbox_files

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "Automatic reboot startup is configured with systemd and is supported on Linux only." >&2
  exit 1
fi

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemctl is required to enable Docker at boot." >&2
  exit 1
fi

if [[ "${EUID}" -eq 0 ]]; then
  systemctl enable --now docker
else
  sudo systemctl enable --now docker
fi

require_docker
compose_cmd up -d
wait_for_sql_sandbox
compose_cmd ps

echo "Docker is enabled at boot and the SQL sandbox uses restart: unless-stopped."
