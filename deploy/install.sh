#!/bin/bash
# Monta el Panel MeshCore en una Raspberry Pi headless (Debian).
# Idempotente: se puede volver a lanzar sin romper nada.
#
# Orden:  1) bridge/install-pi.sh   (gateway, token y scripts del puente)
#         2) deploy/install.sh      (esto: panel, terminal web, TLS y nginx)
# Antes:  exporta PANEL_PASS con la contrasena del panel y de la terminal
#         (si no, se genera una aleatoria y se muestra al final).
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PANEL_DIR="$HOME/meshcore-panel"
USER_NAME="$(id -un)"
PI_IP="$(hostname -I | awk '{print $1}')"
PANEL_PASS="${PANEL_PASS:-$(openssl rand -base64 12)}"

[ -s "$HOME/.meshcore-ble-token" ] || { echo "ERROR: falta el token del gateway; lanza antes bridge/install-pi.sh" >&2; exit 1; }

echo ">> paquetes"
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq curl nginx openssl apache2-utils

echo ">> ttyd (no esta en apt de Debian 13)"
# Conviene fijar TTYD_SHA256 (sha256 de ttyd.aarch64 1.7.7): el binario da
# una shell con sudo, y sin hash cualquier cambio en la descarga entra tal cual.
TTYD_SHA256="${TTYD_SHA256:-b38acadd89d1d396a0f5649aa52c539edbad07f4bc7348b27b4f4b7219dd4165}"
if ! command -v ttyd >/dev/null; then
  TTYD_TMP="$(mktemp)"
  curl -fsSL -o "$TTYD_TMP" https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.aarch64
  if [ -n "$TTYD_SHA256" ]; then
    echo "$TTYD_SHA256  $TTYD_TMP" | sha256sum -c - || { rm -f "$TTYD_TMP"; echo "ERROR: el sha256 de ttyd no coincide" >&2; exit 1; }
  else
    echo "   AVISO: TTYD_SHA256 sin fijar, ttyd no se verifica"
  fi
  sudo install -m755 "$TTYD_TMP" /usr/local/bin/ttyd
  rm -f "$TTYD_TMP"
fi
ttyd --version

echo ">> ficheros del panel"
mkdir -p "$PANEL_DIR/www" "$PANEL_DIR/firmware"
cp "$REPO_DIR/dashboard.html" "$PANEL_DIR/www/index.html"
# Tu configuracion (nombres, posiciones): se crea una vez desde el ejemplo y
# no se vuelve a tocar. Editala en $PANEL_DIR/www/config.js.
[ -f "$PANEL_DIR/www/config.js" ] || cp "$REPO_DIR/config.example.js" "$PANEL_DIR/www/config.js"
cp "$REPO_DIR/firmware/FLASHEO.md" "$PANEL_DIR/firmware/" 2>/dev/null || true
echo "   (los .uf2 no vienen en git: dejalos en $PANEL_DIR/firmware/)"

echo ">> TLS + contrasena (bcrypt) para panel y terminal"
sudo mkdir -p /etc/nginx/meshcore-tls
if [ ! -f /etc/nginx/meshcore-tls/cert.pem ]; then
  sudo openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
    -keyout /etc/nginx/meshcore-tls/key.pem \
    -out /etc/nginx/meshcore-tls/cert.pem \
    -subj "/CN=$PI_IP" -addext "subjectAltName=IP:$PI_IP"
fi
if ! sudo test -s /etc/nginx/meshcore-tls/htpasswd; then
  # La contrasena va por stdin (-i), nunca en la linea de ordenes.
  printf '%s' "$PANEL_PASS" | sudo htpasswd -B -i -c /etc/nginx/meshcore-tls/htpasswd "$USER_NAME"
  NUEVA=1
fi
# El gateway valida contra este fichero: grupo compartido (lo crea install-pi.sh).
sudo chgrp meshcore /etc/nginx/meshcore-tls/htpasswd 2>/dev/null || sudo chgrp www-data /etc/nginx/meshcore-tls/htpasswd
sudo chmod 640 /etc/nginx/meshcore-tls/htpasswd

echo ">> unidades systemd (servidor del panel y terminal web)"
for u in meshcore-panel meshcore-terminal; do
  sed "s/__USER__/$USER_NAME/g" "$REPO_DIR/deploy/$u.service" | sudo tee "/etc/systemd/system/$u.service" >/dev/null
done
sudo systemctl daemon-reload
sudo systemctl enable --now meshcore-panel meshcore-terminal

echo ">> nginx (panel 443 y terminal 7443, con backup y vuelta atras)"
sudo systemctl enable --now nginx
bash "$REPO_DIR/deploy/apply-nginx.sh"

echo ">> estado"
systemctl is-active meshcore-panel meshcore-terminal meshcore-ble-gateway nginx

echo
echo "Listo."
echo "  Panel:    https://$PI_IP/        (login propio; la sesion vale tambien para la terminal)"
echo "  Terminal: https://$PI_IP:7443/"
if [ "${NUEVA:-0}" = 1 ]; then
  echo "  Usuario: $USER_NAME   Contrasena: $PANEL_PASS   (apuntala: no se vuelve a mostrar)"
fi
echo "  Certificado autofirmado: el navegador avisa una vez, aceptar."
