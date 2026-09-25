#!/usr/bin/env bash
# Sequential verification runner for Microcosm.
#
# Runs every gate in order, one at a time, writing a heartbeat so the run is
# observable and survivable: the process is detached from the invoking shell, so
# an SSH drop or a closed terminal does not kill it the way it killed the earlier
# cloudflared renders. Re-running resumes by re-running; each stage is idempotent.

set -uo pipefail

REPO=/opt/microcosm-x
LOG=/var/log/microcosm-verify.log
HEARTBEAT=/var/run/microcosm-verify.heartbeat
STATE=/var/lib/microcosm/verify-state.tsv
STAGES=/opt/microcosm-x/scripts/verify-stages.txt

mkdir -p "$(dirname "$STATE")"
: > "$STATE"

beat() { date -u +%Y-%m-%dT%H:%M:%SZ > "$HEARTBEAT"; }

say() { printf '%s  %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a "$LOG"; }

run_stage() {
  local id="$1" desc="$2"; shift 2
  say "START  $id  $desc"
  beat
  local start end rc
  start=$(date +%s)
  if "$@" >>"$LOG" 2>&1; then rc=0; else rc=$?; fi
  end=$(date +%s)
  printf '%s\t%s\t%s\t%s\n' "$id" "$rc" "$((end - start))s" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$STATE"
  if [ "$rc" -eq 0 ]; then
    say "PASS   $id  ($((end - start))s)"
  else
    say "FAIL   $id  rc=$rc ($((end - start))s)"
  fi
  beat
  return 0
}

# keep the SSH path warm and prove liveness even while idle between stages
ping_loop() {
  while true; do
    local code
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:8791/api/health 2>/dev/null || echo 000)
    printf '%s ping api=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$code" >> /var/log/microcosm-ping.log
    beat
    sleep 30
  done
}

say "=== sequential verification run starting (pid $$) ==="
ping_loop &
PING_PID=$!
trap 'kill $PING_PID 2>/dev/null' EXIT

# ---- stage 1: contracts ----
run_stage contracts "Foundry contract suite" make test-contracts

# ---- stage 2: policy engine ----
run_stage policy "Space policy engine" npm run test:policy

# ---- stage 3: MCP server ----
run_stage mcp "MCP tool server" npm run test:mcp

# ---- stage 4: REST/SSE server ----
run_stage server "REST + SSE server" npm run test:server

# ---- stage 5: SDK ----
run_stage sdk "typed SDK" bash -c 'cd packages/sdk && npm test'

# ---- stage 6: full make test (canonical aggregate) ----
run_stage make-test "full aggregate suite" make test

# ---- stage 7: proof ledger ----
run_stage proof-ledger "41 claims across 8 gates" node scripts/verify-proof-ledger.mjs

# ---- stage 8: frontend typecheck + build ----
run_stage web-build "Charcoal typecheck and production build" bash -c 'cd apps/charcoal && npx tsc --noEmit -p tsconfig.json && npx next build'

# ---- stage 9: end-to-end browser acceptance ----
run_stage e2e "Playwright end-to-end" bash -c 'cd apps/charcoal && sudo -n env PATH="$PATH" npx playwright test'

# ---- stage 10: live deployment state ----
run_stage live "live services, public app, vercel app, indexer" bash -c '
  set -e
  for s in microcosm-server microcosm-ui; do
    printf "service %s active=%s enabled=%s\n" "$s" "$(systemctl is-active $s)" "$(systemctl is-enabled $s)"
    [ "$(systemctl is-active $s)" = active ]
  done
  for u in http://127.0.0.1:8791/api/health \
           https://mcosm.vercel.app/app \
           https://mcosm.vercel.app/api/health \
           https://reputation-university-abstract-gotta.trycloudflare.com/app ; do
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "$u")
    printf "probe %s -> %s\n" "$u" "$code"
    [ "$code" = 200 ]
  done
  curl -s --max-time 20 http://127.0.0.1:8791/api/spaces/space-procurement-001/indexer
  printf "\n"
'

FAILED=$(awk -F'\t' '$2 != 0 {print $1}' "$STATE" | tr '\n' ' ')
TOTAL=$(wc -l < "$STATE")
if [ -z "$FAILED" ]; then
  say "=== ALL $TOTAL STAGES PASSED ==="
else
  say "=== $TOTAL STAGES RAN; FAILED: $FAILED ==="
fi
beat
rm -f "$HEARTBEAT"
