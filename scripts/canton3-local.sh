#!/usr/bin/env bash
# Tacit — local Canton 3.x participant + v2 JSON Ledger API.
#
# This is the LOCAL REHEARSAL for devnet: the app's cantonV2 adapter (v2 JSON
# Ledger API + party allocation + DAR upload) runs against this exactly as it
# will against devnet — only TACIT_V2_API_URL + TACIT_V2_AUTH change. Proving the
# path here means devnet is a one-env-var flip.
#
# Usage:
#   npm run canton3:local            # foreground; Ctrl-C to stop
# Then, in another shell, run the app in canton3-local mode:
#   TACIT_LEDGER_MODE=canton3-local \
#   TACIT_V2_API_URL=http://localhost:7575 \
#   TACIT_V2_AUTH=none \
#   PORT=3100 npm start
#
# Requires: JDK 17 + Daml SDK 3.4.11 on PATH.
#   export PATH="/opt/homebrew/opt/openjdk@17/bin:$HOME/.daml/bin:$PATH"
#   export JAVA_HOME="/opt/homebrew/opt/openjdk@17"
#
# NOTE: Canton 3.x starts a participant + sequencer + mediator — budget ~3-4 GB
# RAM. On a memory-starved laptop use a VM; this script is the same either way.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DAR="$ROOT/daml3/.daml/dist/tacit-0.1.0.dar"
LEDGER_PORT="${TACIT_CANTON_PORT:-6865}"
JSON_PORT="${TACIT_JSON_API_PORT:-7575}"

if ! command -v daml >/dev/null 2>&1; then
  echo "❌ daml not on PATH. Run: export PATH=\"/opt/homebrew/opt/openjdk@17/bin:\$HOME/.daml/bin:\$PATH\"" >&2
  exit 1
fi

if [ ! -f "$DAR" ]; then
  echo "▶ Building the v2 templates DAR first…"
  ( cd "$ROOT/daml3" && daml build )
fi

echo "▶ Starting Canton 3.x sandbox"
echo "    ledger API  : localhost:$LEDGER_PORT"
echo "    JSON API v2 : http://localhost:$JSON_PORT   (auth: none — dev only)"
echo "    DAR         : $DAR"
echo "    (Ctrl-C to stop)"
exec daml sandbox \
  --port "$LEDGER_PORT" \
  --json-api-port "$JSON_PORT" \
  --json-api-port-file /tmp/tacit-canton3-jsonapi.port \
  --dar "$DAR" \
  --wall-clock-time
