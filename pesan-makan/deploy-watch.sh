#!/usr/bin/env bash
# Deploy watcher for pesan-makan — polls GHCR for new image digests and redeploys.
# Runs every N seconds (systemd timer). One env per invocation via $1.
set -euo pipefail

ENV_NAME="${1:-}"
if [[ -z "$ENV_NAME" ]]; then
  echo "usage: $0 <dev|beta|stable>" >&2
  exit 2
fi

REPO_DIR="${REPO_DIR:-$HOME/pesan-makan/pesan-makan}"
IMAGE="ghcr.io/rianharyadi/internal-makanan:${ENV_NAME}"
STATE_DIR="${STATE_DIR:-$HOME/.cache/pesan-makan-deploy}"
STATE_FILE="$STATE_DIR/${ENV_NAME}.digest"

mkdir -p "$STATE_DIR"

# Resolve current local image digest (what's actually running)
local_digest=""
if podman image inspect "$IMAGE" >/dev/null 2>&1; then
  local_digest=$(podman image inspect "$IMAGE" --format '{{.Digest}}' 2>/dev/null || true)
fi

# Resolve remote digest without pulling (registry HEAD via skopeo or podman)
remote_digest=""
if command -v skopeo >/dev/null 2>&1; then
  remote_digest=$(skopeo inspect "docker://$IMAGE" --format '{{.Digest}}' 2>/dev/null || true)
else
  # Fallback: pull and compare — heavier but works anywhere podman exists.
  if podman pull "$IMAGE" >/dev/null 2>&1; then
    remote_digest=$(podman image inspect "$IMAGE" --format '{{.Digest}}' 2>/dev/null || true)
  fi
fi

if [[ -z "$remote_digest" ]]; then
  echo "[$ENV_NAME] remote image not reachable — skipping" >&2
  exit 0
fi

# Already known (no change since last successful deploy)
last_digest=""
[[ -f "$STATE_FILE" ]] && last_digest=$(cat "$STATE_FILE")

if [[ "$remote_digest" == "$last_digest" ]]; then
  exit 0
fi

echo "[$ENV_NAME] new build detected: $remote_digest (was: ${last_digest:-none})"

cd "$REPO_DIR"

# Pull the fresh image
podman pull "$IMAGE"

# Recreate only this env's app container (db unchanged, keeps its data volume)
podman compose up -d --no-deps "app-${ENV_NAME}"

# Run database migrations against this env's Postgres
./run-migrations.sh "$ENV_NAME" || echo "[$ENV_NAME] migration step failed (non-fatal)"

# Record success so we don't redeploy the same digest repeatedly
echo "$remote_digest" > "$STATE_FILE"
echo "[$ENV_NAME] deploy complete → $remote_digest"
