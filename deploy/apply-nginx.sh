#!/bin/bash
# Instala la config de nginx del panel de forma segura.
#
# Existe porque un sed mal escapado dejo la config a cero bytes, nginx recargo
# feliz (una config vacia es sintacticamente valida) y el panel se quedo sin
# listener en 443. nginx -t no protege de eso: hay que comprobar el contenido
# antes y el servicio despues.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$REPO_DIR/deploy/nginx-meshcore-panel.conf"
DST=/etc/nginx/sites-available/meshcore-panel.conf
LINK=/etc/nginx/sites-enabled/meshcore-panel.conf
TOKEN_FILE="${MESHCORE_BLE_TOKEN_FILE:-$HOME/.meshcore-ble-token}"
PI_IP="${PI_IP:-$(hostname -I | awk '{print $1}')}"
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

[ -f "$SRC" ] || { echo "ERROR: no existe $SRC" >&2; exit 1; }
[ -s "$TOKEN_FILE" ] || { echo "ERROR: token vacio o ausente en $TOKEN_FILE" >&2; exit 1; }
TOKEN=$(tr -d '\n' < "$TOKEN_FILE")

# Sustitucion con python: sed se rompe con las barras y comillas del token.
python3 - "$SRC" "$TMP" "$PI_IP" "$TOKEN" <<'PY'
import sys
src, dst, ip, token = sys.argv[1:5]
text = open(src, encoding='utf-8').read()
text = text.replace('__PI_IP__', ip).replace('__GATEWAY_TOKEN__', '"%s"' % token)
open(dst, 'w', encoding='utf-8').write(text)
PY

# Comprobaciones de cordura sobre el resultado ANTES de instalarlo.
for needed in 'listen 443 ssl' 'location /' 'proxy_pass'; do
  grep -q "$needed" "$TMP" || { echo "ERROR: la config generada no contiene '$needed'" >&2; exit 1; }
done
grep -q '__PI_IP__\|__GATEWAY_TOKEN__' "$TMP" && { echo "ERROR: quedan placeholders sin sustituir" >&2; exit 1; }
[ "$(wc -l < "$TMP")" -ge 20 ] || { echo "ERROR: config sospechosamente corta" >&2; exit 1; }

BACKUP=/etc/nginx/meshcore-panel.conf.$(date +%Y%m%d-%H%M%S).bak
[ -f "$DST" ] && sudo cp "$DST" "$BACKUP" && echo "backup: $BACKUP"

sudo cp "$TMP" "$DST"
sudo ln -sf "$DST" "$LINK"

rollback() {
  echo "ERROR: fallo al aplicar; volviendo atras" >&2
  [ -f "$BACKUP" ] && sudo cp "$BACKUP" "$DST"
  sudo nginx -t && sudo systemctl reload nginx
  exit 1
}

sudo nginx -t || rollback
sudo systemctl reload nginx || rollback
sleep 2

# nginx puede recargar con exito y aun asi no estar sirviendo el panel.
sudo ss -tln | grep -q ':443 ' || rollback
CODE=$(curl -sk -o /dev/null -w '%{http_code}' "https://127.0.0.1/" || echo 000)
case "$CODE" in
  200|302|401) echo "nginx OK (panel responde $CODE)" ;;
  *) echo "panel responde $CODE" >&2; rollback ;;
esac

# Terminal web (7443): solo cambia la IP; mismas comprobaciones y vuelta atras.
TSRC="$REPO_DIR/deploy/nginx-meshcore-terminal.conf"
TDST=/etc/nginx/sites-available/meshcore-terminal.conf
TLINK=/etc/nginx/sites-enabled/meshcore-terminal.conf
if [ -f "$TSRC" ]; then
  sed "s/__PI_IP__/$PI_IP/" "$TSRC" > "$TMP"
  grep -q 'listen 7443 ssl' "$TMP" && grep -q 'auth_request' "$TMP" && ! grep -q '__PI_IP__' "$TMP" \
    || { echo "ERROR: config de la terminal incompleta" >&2; exit 1; }
  TBACKUP=/etc/nginx/meshcore-terminal.conf.$(date +%Y%m%d-%H%M%S).bak
  [ -f "$TDST" ] && sudo cp "$TDST" "$TBACKUP" && echo "backup: $TBACKUP"
  sudo cp "$TMP" "$TDST"
  sudo ln -sf "$TDST" "$TLINK"
  trollback() {
    echo "ERROR: fallo en la terminal; volviendo atras" >&2
    [ -f "$TBACKUP" ] && sudo cp "$TBACKUP" "$TDST"
    sudo nginx -t && sudo systemctl reload nginx
    exit 1
  }
  sudo nginx -t || trollback
  sudo systemctl reload nginx || trollback
  sleep 2
  # Sin sesion tiene que mandar al login (302), nunca abrir la terminal (200).
  TCODE=$(curl -sk -o /dev/null -w '%{http_code}' "https://127.0.0.1:7443/" || echo 000)
  [ "$TCODE" = 302 ] && echo "terminal OK (sin sesion -> login)" || { echo "terminal responde $TCODE" >&2; trollback; }
fi
