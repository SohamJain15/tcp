#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/judge0-common.sh"

require_command curl
ensure_compose_runtime_available

if ! full_sandbox_supported_on_host; then
  guest_arch_label="$(guest_arch 2>/dev/null || echo unknown)"
  guest_cgroup_label="$(guest_cgroup_mode 2>/dev/null || echo unavailable)"
  cat >&2 <<EOF
Full Judge0 sandboxing requires one of these supported runtimes:
- Linux x86_64 host
- Apple Silicon macOS with the '$PROFILE' Colima profile running as x86_64 and delegating Linux cgroups correctly

Current host: $(host_os) $(host_arch)
Current guest arch: $guest_arch_label
Current guest cgroup mode: $guest_cgroup_label

Bring the runtime into that shape or use a Linux x86_64 VM, then run:
  npm run judge0:up
  npm run judge0:test-sandbox
EOF
  exit 1
fi

compose_cmd up -d --force-recreate --scale worker="$WORKER_REPLICAS"

if ! wait_for_api 45; then
  echo "Judge0 API did not become reachable at $JUDGE0_URL" >&2
  exit 1
fi

if ! probe_output="$(runtime_probe 2>&1)"; then
  echo "Judge0 API is reachable, but the sandbox runtime probe failed." >&2
  printf '%s\n' "$probe_output" >&2
  echo "Judge0 is not ready for production-like sandbox execution." >&2
  exit 1
fi

printf '%s\n' "$probe_output"
echo "Judge0 worker replicas: $WORKER_REPLICAS"
echo "Judge0 is ready at http://localhost:$PORT"
