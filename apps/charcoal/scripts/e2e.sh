#!/usr/bin/env bash
# Run the browser suite against a clean slate.
#
# Playwright aborts at webServer launch if a port is already held, and that
# happens before globalSetup gets a chance to run, so the ports are cleared here,
# before Playwright is invoked at all.
#
# This is not ceremony. `reuseExistingServer` used to let a fresh run adopt
# whatever was still listening, so a dev server left over from an interrupted run
# kept serving a stale bundle. The suite then failed for reasons unrelated to the
# code, which cost real time chasing a wallet-connect regression that did not
# exist. Both web servers now start fresh on every run; this guarantees it.
set -uo pipefail

PORTS=(3010 8788)
freed=0

port_held() {
  local port="$1"
  (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null && { exec 3>&- 3<&-; return 0; }
  return 1
}

for port in "${PORTS[@]}"; do
  if port_held "$port"; then
    echo "e2e: :$port was still held, clearing it"
    sudo -n fuser -k "$port/tcp" >/dev/null 2>&1 || fuser -k "$port/tcp" >/dev/null 2>&1 || true
    freed=1
  fi
done

if [ "$freed" = "1" ]; then
  for port in "${PORTS[@]}"; do
    for _ in $(seq 1 20); do
      port_held "$port" || break
      sleep 0.25
    done
    if port_held "$port"; then
      echo "e2e: WARNING :$port is still held; this run may adopt a stale server" >&2
    fi
  done
fi

cd "$(dirname "$0")/.." || exit 1
exec npx playwright test "$@"
