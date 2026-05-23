#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_DIR="$ROOT_DIR/infrastructure/judge0"
PROFILE="${JUDGE0_COLIMA_PROFILE:-judge0-x64}"
PORT="${JUDGE0_HOST_PORT:-2358}"
WORKER_REPLICAS="${JUDGE0_WORKER_REPLICAS:-3}"
JUDGE0_URL="http://127.0.0.1:$PORT"
RUNTIME_PROBE_BOX_ID="${JUDGE0_RUNTIME_PROBE_BOX_ID:-2147483000}"

host_os() {
  uname -s
}

host_arch() {
  uname -m
}

is_linux_x64_host() {
  [[ "$(host_os)" == "Linux" && ("$(host_arch)" == "x86_64" || "$(host_arch)" == "amd64") ]]
}

is_macos_arm64_host() {
  [[ "$(host_os)" == "Darwin" && "$(host_arch)" == "arm64" ]]
}

colima_profile_field() {
  local field_index="$1"
  local list_output
  list_output="$(colima list 2>/dev/null || true)"
  printf '%s\n' "$list_output" | awk -v profile="$PROFILE" -v field="$field_index" '$1 == profile { print $field; exit }'
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

ensure_compose_runtime_available() {
  if is_linux_x64_host; then
    require_command docker
    return
  fi

  if is_macos_arm64_host; then
    require_command colima
    return
  fi

  echo "Unsupported host for these Judge0 helpers: $(host_os) $(host_arch). Use a Linux x86_64 VM for full sandboxing." >&2
  exit 1
}

ensure_colima_profile_running() {
  local list_output
  list_output="$(colima list 2>/dev/null || true)"
  if ! printf '%s\n' "$list_output" | awk -v profile="$PROFILE" '$1 == profile && $2 == "Running" { found = 1 } END { exit found ? 0 : 1 }'; then
    echo "Colima profile '$PROFILE' is not running." >&2
    exit 1
  fi
}

run_in_compose_runtime() {
  if is_linux_x64_host; then
    (
      cd "$COMPOSE_DIR"
      "$@"
    )
    return
  fi

  ensure_colima_profile_running

  local remote_cmd
  printf -v remote_cmd '%q ' sudo "$@"
  colima ssh --profile "$PROFILE" -- bash -lc "cd '$COMPOSE_DIR' && $remote_cmd"
}

compose_cmd() {
  run_in_compose_runtime docker compose "$@"
}

container_id_for_service() {
  compose_cmd ps -q "$1" | tr -d '\r'
}

api_is_reachable() {
  curl -fsS "$JUDGE0_URL/languages" >/dev/null 2>&1
}

guest_cgroup_mode() {
  if is_linux_x64_host; then
    if [[ -f /sys/fs/cgroup/cgroup.controllers ]]; then
      echo "cgroup-v2"
    else
      echo "cgroup-v1"
    fi
    return
  fi

  if is_macos_arm64_host; then
    ensure_colima_profile_running
    colima ssh --profile "$PROFILE" -- bash -lc 'if [[ -f /sys/fs/cgroup/cgroup.controllers ]]; then echo cgroup-v2; else echo cgroup-v1; fi'
    return
  fi

  echo "unknown"
}

guest_arch() {
  if is_linux_x64_host; then
    uname -m
    return
  fi

  if is_macos_arm64_host; then
    local arch
    arch="$(colima_profile_field 3)"
    if [[ -n "$arch" ]]; then
      echo "$arch"
      return
    fi

    ensure_colima_profile_running
    colima ssh --profile "$PROFILE" -- uname -m
    return
  fi

  echo "unknown"
}

runtime_probe() {
  local server_container
  server_container="$(container_id_for_service server)"

  if [[ -z "$server_container" ]]; then
    echo "Judge0 server container is not running." >&2
    return 1
  fi

  local probe_payload token_response token probe_response normalized_response
  probe_payload='{"language_id":71,"source_code":"cHJpbnQoImp1ZGdlMC1ydW50aW1lLXByb2JlLW9rIik=","stdin":"","expected_output":"anVkZ2UwLXJ1bnRpbWUtcHJvYmUtb2sK","cpu_time_limit":2,"wall_time_limit":4,"memory_limit":32768,"enable_network":false,"redirect_stderr_to_stdout":false,"enable_per_process_and_thread_time_limit":false,"enable_per_process_and_thread_memory_limit":false,"base64_encoded":true}'

  if ! token_response="$(curl -fsS -X POST "$JUDGE0_URL/submissions?base64_encoded=true&wait=false" \
    -H "Content-Type: application/json" \
    -d "$probe_payload" 2>&1)"; then
    printf 'RUNTIME_PROBE=failed\n'
    printf 'ERROR=Judge0 runtime probe token request failed\n'
    printf 'DETAIL=%s\n' "$token_response"
    return 1
  fi

  token="$(printf '%s' "$token_response" | sed -n 's/.*"token":"\([^"]\+\)".*/\1/p')"
  if [[ -z "$token" ]]; then
    printf 'RUNTIME_PROBE=failed\n'
    printf 'ERROR=Judge0 runtime probe did not return a submission token\n'
    printf 'DETAIL=%s\n' "$token_response"
    return 1
  fi

  local attempt
  for attempt in $(seq 1 20); do
    if ! probe_response="$(curl -fsS "$JUDGE0_URL/submissions/$token?base64_encoded=false" 2>&1)"; then
      printf 'RUNTIME_PROBE=failed\n'
      printf 'ERROR=Judge0 runtime probe polling request failed\n'
      printf 'DETAIL=%s\n' "$probe_response"
      return 1
    fi

    normalized_response="$(printf '%s' "$probe_response" | tr -d '\r\n\t ')"
    if [[ "$normalized_response" == *'"status":{"id":1,'* || "$normalized_response" == *'"status":{"id":2,'* ]]; then
      sleep 1
      continue
    fi

    break
  done

  normalized_response="$(printf '%s' "$probe_response" | tr -d '\r\n\t ')"
  printf 'RUNTIME_PROBE_RESPONSE=%s\n' "$probe_response"

  if [[ "$normalized_response" == *'"status":{"id":3,'* && "$probe_response" == *'judge0-runtime-probe-ok'* ]]; then
    printf 'RUNTIME_PROBE=ok\n'
    return 0
  fi

  printf 'RUNTIME_PROBE=failed\n'
  if [[ "$probe_response" == *'/sys/fs/cgroup/'* || "$probe_response" == *'cgroup'* ]]; then
    printf 'ERROR=Judge0 reported a cgroup runtime failure\n'
  else
    printf 'ERROR=Judge0 runtime probe did not return an accepted result\n'
  fi
  return 1
}

wait_for_api() {
  local attempts="${1:-45}"

  for ((i = 1; i <= attempts; i += 1)); do
    if api_is_reachable; then
      return 0
    fi
    sleep 2
  done

  return 1
}

full_sandbox_supported_on_host() {
  if is_linux_x64_host; then
    return 0
  fi

  if is_macos_arm64_host; then
    [[ "$(guest_arch)" == "x86_64" ]]
    return
  fi

  return 1
}
