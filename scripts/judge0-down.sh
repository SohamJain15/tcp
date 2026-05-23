#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/judge0-common.sh"

ensure_compose_runtime_available
compose_cmd down -v
