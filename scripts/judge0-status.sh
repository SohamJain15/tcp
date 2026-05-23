#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/judge0-common.sh"

require_command curl
ensure_compose_runtime_available

host_label="$(host_os) $(host_arch)"
guest_arch_label="$(guest_arch 2>/dev/null || echo unknown)"
cgroup_mode="$(guest_cgroup_mode 2>/dev/null || echo unavailable)"
support_state="unsupported"
if full_sandbox_supported_on_host; then
  support_state="supported-host"
fi

echo "Host: $host_label"
echo "Guest arch: $guest_arch_label"
echo "Guest cgroup mode: $cgroup_mode"
echo "Full sandbox runtime support: $support_state"
echo "Configured Judge0 worker replicas: $WORKER_REPLICAS"
echo

echo "Judge0 containers:"
compose_cmd ps || true
echo

api_state="unreachable"
if api_is_reachable; then
  api_state="reachable"
fi
echo "API: $api_state ($JUDGE0_URL)"

runtime_state="not-bootstrapped"
runtime_details=""
if probe_output="$(runtime_probe 2>&1)"; then
  runtime_state="bootstrapped"
  runtime_details="$probe_output"
else
  runtime_details="$probe_output"
fi
echo "Runtime bootstrap: $runtime_state"
if [[ -n "$runtime_details" ]]; then
  printf '%s\n' "$runtime_details"
fi

if [[ "$api_state" == "reachable" && "$runtime_state" == "bootstrapped" && "$support_state" == "supported-host" ]]; then
  echo
  echo "Judge0 status: ready for full sandbox validation"
  exit 0
fi

echo
echo "Judge0 status: not ready for full sandbox validation"
exit 1
