#!/usr/bin/env bash
# Loops over all three environments and delegates to deploy-watch.sh.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

for ENV in stable beta dev; do
  "$SCRIPT_DIR/deploy-watch.sh" "$ENV" || echo "[$ENV] deploy-watch failed" >&2
done
