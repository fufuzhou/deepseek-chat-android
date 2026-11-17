#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bash "$ROOT/scripts/build-web.sh"
cd "$ROOT"
gradle :app:assembleDebug --no-daemon
echo "$ROOT/app/build/outputs/apk/debug/app-debug.apk"
