#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PANEL="$HOME/meshcore-panel"
VENV="$ROOT/bridge/.venv"
USER_NAME="$(id -un)"
SUDO='sudo'

echo '== paquetes BLE =='
$SUDO apt-get update -qq
$SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y -qq python3-venv python3-pip bluetooth bluez nginx
$SUDO systemctl enable --now bluetooth

python3 -m venv "$VENV" 2>/dev/null || true
"$VENV/bin/pip" install -q -r "$ROOT/bridge/requirements.txt"

mkdir -p "$PANEL/www"
cp "$ROOT/bridge/meshcore-ble-gateway.js" "$PANEL/www/meshcore-ble-gateway.js"
cp "$ROOT/bridge/meshcore-ble-guard.js" "$PANEL/www/meshcore-ble-guard.js"
cp "$ROOT/bridge/login.html" "$PANEL/www/login.html"
# dashboard.html ya trae sus <script> del guard y del gateway: no se parchea.

TOKEN_FILE="$HOME/.meshcore-ble-token"
if [ ! -s "$TOKEN_FILE" ]; then
  umask 077
  python3 - <<'PY' > "$TOKEN_FILE"
import secrets
print(secrets.token_urlsafe(32))
PY
fi
chmod 600 "$TOKEN_FILE"
TOKEN="$(cat "$TOKEN_FILE")"

$SUDO tee /etc/systemd/system/meshcore-ble-gateway.service >/dev/null <<EOF
[Unit]
Description=Panel MeshCore - gateway BLE
After=bluetooth.target network-online.target
Wants=bluetooth.target network-online.target

[Service]
Type=simple
User=$USER_NAME
WorkingDirectory=$ROOT
Environment=MESHCORE_BLE_TOKEN_FILE=$TOKEN_FILE
ExecStart=$VENV/bin/python $ROOT/bridge/meshcore_ble_gateway_v3.py
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

# El gateway valida el login contra el htpasswd de nginx: grupo compartido para
# que pueda leerlo sin abrir el fichero a todo el sistema.
$SUDO groupadd -f meshcore
$SUDO usermod -aG meshcore "$USER_NAME"
$SUDO usermod -aG meshcore www-data
[ -f /etc/nginx/meshcore-tls/htpasswd ] && $SUDO chgrp meshcore /etc/nginx/meshcore-tls/htpasswd && $SUDO chmod 640 /etc/nginx/meshcore-tls/htpasswd
$SUDO mkdir -p /etc/systemd/system/meshcore-ble-gateway.service.d
printf '[Service]
SupplementaryGroups=meshcore
' | $SUDO tee /etc/systemd/system/meshcore-ble-gateway.service.d/override.conf >/dev/null

$SUDO systemctl daemon-reload
$SUDO systemctl enable meshcore-ble-gateway.service
$SUDO systemctl restart meshcore-ble-gateway.service
sleep 1

if ! $SUDO systemctl is-active --quiet meshcore-ble-gateway.service; then
  echo 'ERROR: meshcore-ble-gateway no arranca. Journal:' >&2
  $SUDO systemctl status meshcore-ble-gateway.service --no-pager -n 40 >&2 || true
  $SUDO journalctl -u meshcore-ble-gateway.service -n 60 --no-pager >&2 || true
  exit 1
fi

# Antes aqui se inyectaba en nginx un /api/ble/ con el token y SIN
# auth_request: cualquiera en la red usaba la API sin login. La config de
# nginx la pone ahora solo deploy/apply-nginx.sh.
echo '== nginx: se configura con deploy/install.sh (no desde aqui) =='

if ! curl -fsS http://127.0.0.1:8780/healthz >/dev/null; then
  echo 'ERROR: gateway escucha pero healthz falla:' >&2
  $SUDO journalctl -u meshcore-ble-gateway.service -n 30 --no-pager >&2 || true
  exit 1
fi
$SUDO systemctl is-active meshcore-ble-gateway bluetooth nginx
echo 'Gateway activo (solo relay): el navegador no usa BLE/serie directo; el relay del PC es el unico dueno de los WIO.'
echo 'Siguiente paso: bash deploy/install.sh (panel, TLS, terminal y nginx).'
