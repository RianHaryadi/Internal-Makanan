#!/usr/bin/env bash
# One-shot setup for pesan-makan multi-env deploy on the SSH box (server-337).
# Idempotent — safe to re-run. Installs systemd user timer + initial compose stack.
set -euo pipefail

APP_DIR="$HOME/pesan-makan/pesan-makan"
GHCR_IMAGE="ghcr.io/rianharyadi/internal-makanan"

echo "== 1/5 ensure repo + files =="
cd "$APP_DIR"

echo "== 2/5 generate/verify .env (POSTGRES_PASSWORD) =="
if [[ ! -f "$APP_DIR/.env" ]]; then
  PW=$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)
  printf "POSTGRES_PASSWORD=%s\n" "$PW" > "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  echo "  generated .env"
else
  echo "  .env already present"
fi

echo "== 3/5 login to GHCR (if not already) =="
if podman login ghcr.io -u "$GHCR_USER" --password-stdin < <(printf '%s' "$GHCR_TOKEN") 2>/dev/null; then
  echo "  logged in"
else
  echo "  WARN: GHCR login failed — anonymous pull may work for public packages; continuing"
fi

echo "== 4/5 pull images + start all 3 envs =="
for ENV in stable beta dev; do
  podman pull "$GHCR_IMAGE:$ENV" || echo "  WARN: $ENV image not available yet (will be pulled on first CI build)"
done
podman compose up -d

echo "== 5/5 install systemd user timer =="
mkdir -p "$HOME/.config/systemd/user"
cat > "$HOME/.config/systemd/user/pesan-makan-deploy.service" <<EOF
[Unit]
Description=pesan-makan deploy watcher (polls GHCR + redeploys)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=$APP_DIR/deploy-watch-all.sh
EOF

cat > "$HOME/.config/systemd/user/pesan-makan-deploy.timer" <<EOF
[Unit]
Description=poll pesan-makan GHCR every 60s

[Timer]
OnBootSec=30s
OnUnitActiveSec=60s
AccuracySec=5s

[Install]
WantedBy=timers.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now pesan-makan-deploy.timer

echo ""
echo "✅ Setup complete."
echo "   envs: stable→3100, beta→3110, dev→3105"
echo "   watcher: systemctl --user status pesan-makan-deploy.timer"
echo "   images: $GHCR_IMAGE:{stable,beta,dev}"
