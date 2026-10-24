#!/usr/bin/env bash
# Pasa todos los tests. PYTHON=ruta/al/python del venv si aiohttp/bleak no están en el sistema.
set -u
cd "$(dirname "$0")/.."
PY="${PYTHON:-python3}"
fallos=()
corre() { echo "== $*"; "$@" || fallos+=("$*"); }

for t in bridge/test_*.py; do corre "$PY" "$t"; done
corre node bridge/test_gateway_js.js
corre node tools/test_legal.js dashboard.html
corre node tools/test_chat_nombres.js
corre node tools/test_analitica_calculos.js
corre "$PY" tools/check-ids.py dashboard.html
corre "$PY" tools/check_pwa.py
corre "$PY" tools/check_privado.py

if [ ${#fallos[@]} -gt 0 ]; then
  printf '\nFALLAN %d:\n' "${#fallos[@]}"; printf '  %s\n' "${fallos[@]}"; exit 1
fi
echo; echo "Todo OK"
