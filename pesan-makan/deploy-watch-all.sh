#!/usr/bin/env bash
# deploy-watch-all.sh — deploy every environment hosted on this machine.
#
# Same shape as before: one deploy-watch.sh invocation per environment.
#
# The one change is the exit status. The old version swallowed every
# failure (`|| echo "..."`), so the systemd unit always reported success
# and a broken deploy was invisible in `systemctl --user status` and in
# the journal's failure accounting. Now a failed environment makes the
# unit fail, which is what journald is there for.
#
# DEPLOY_ENVS (space separated) overrides the environment list, for
# machines that host only some of them.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

: "${DEPLOY_ENVS:=stable beta dev}"

rc=0
for ENV in $DEPLOY_ENVS; do
    if ! "$SCRIPT_DIR/deploy-watch.sh" "$ENV"; then
        echo "[$ENV] deploy-watch failed" >&2
        rc=1
    fi
done

exit "$rc"
