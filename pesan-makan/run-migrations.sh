#!/usr/bin/env bash
# Run Drizzle migrations for one environment's database.
# Migrations ship inside the built image; we exec them against the env's db container.
set -euo pipefail

ENV_NAME="${1:-}"
if [[ -z "$ENV_NAME" ]]; then
  echo "usage: $0 <dev|beta|stable>" >&2
  exit 2
fi

DB_CONTAINER="pesan-makan-db-${ENV_NAME}-1"
APP_CONTAINER="pesan-makan-app-${ENV_NAME}-1"

# Resolve container names regardless of compose project prefix
DB_CONTAINER=$(podman ps --format '{{.Names}}' | grep -E "db-${ENV_NAME}" | head -1 || true)
APP_CONTAINER=$(podman ps --format '{{.Names}}' | grep -E "app-${ENV_NAME}" | head -1 || true)

if [[ -z "$DB_CONTAINER" ]]; then
  echo "[$ENV_NAME] db container not found — skipping migration" >&2
  exit 0
fi

# The migration SQL lives in the image at /app/.next/... — but standalone build
# doesn't include it. Instead we ship migrations in the repo and exec them here.
MIGRATIONS_DIR="$HOME/pesan-makan/pesan-makan/src/db/migrations"
if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  echo "[$ENV_NAME] no migrations dir — nothing to run" >&2
  exit 0
fi

# Apply any *.sql migration files via psql inside the db container.
# We only apply files not yet recorded (simple idempotent guard via a migrations table).
podman exec -i "$DB_CONTAINER" psql -U pesan -d pesan_makan -c \
  "CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now());" >/dev/null

for f in "$MIGRATIONS_DIR"/*.sql; do
  [[ -e "$f" ]] || continue
  name=$(basename "$f")
  already=$(podman exec "$DB_CONTAINER" psql -U pesan -d pesan_makan -tAc \
    "SELECT 1 FROM _migrations WHERE name='$name';" 2>/dev/null || true)
  if [[ "$already" == "1" ]]; then
    continue
  fi
  echo "[$ENV_NAME] applying migration: $name"
  # strip drizzle '--> statement-breakpoint' markers and run
  sed 's/--> statement-breakpoint//g' "$f" | podman exec -i "$DB_CONTAINER" psql -U pesan -d pesan_makan
  podman exec "$DB_CONTAINER" psql -U pesan -d pesan_makan -c \
    "INSERT INTO _migrations(name) VALUES ('$name');" >/dev/null
done

echo "[$ENV_NAME] migrations up to date"
