"""Regenera las capturas del README (docs/img) con el servidor de ejemplo: datos inventados, nada real.

Uso: python tools/e2e/capturas.py        (E2E_CANAL=msedge para usar Edge en Windows)
"""
import os
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
from servidor_ejemplo import crear_servidor  # noqa: E402

DATOS = (AQUI / 'datos_ejemplo.js').read_text(encoding='utf-8')
SALIDA = AQUI.parents[1] / 'docs' / 'img'

srv, puerto = crear_servidor(0)
threading.Thread(target=srv.serve_forever, daemon=True).start()

# nombre, qué hacer antes de la captura, espera (ms)
CAPTURAS = [
    ('equipos', "showTab('equipos'); document.querySelector('.devTab[data-dev=rak]').click()", 2500),
    ('mapa', "showTab('equipos'); document.querySelector('.devTab[data-dev=mapa]').click(); fitMapToEverything()", 3500),
    ('analitica', "showTab('stats'); statsIr('resumen'); statsRedibuja()", 3800),
    ('chat', "showTab('chat')", 2500),
    ('gestion', "localStorage.setItem('meshcore-gestion-sub', 'repetidor'); showTab('gestion'); gestionIr('repetidor'); "
                "rakRemotePubkey = 'ab'.repeat(32); setRakRemoteReady(true); rlog('Sesión remota iniciada con MI-REPETIDOR.'); "
                "rlog('Comando enviado: get freq'); rlog('869.525')", 1800),
]

with sync_playwright() as p:
    b = p.chromium.launch(channel=os.environ.get('E2E_CANAL') or None)
    for nombre, accion, espera in CAPTURAS:
        pg = b.new_page(viewport={'width': 1440, 'height': 900})
        pg.add_init_script(DATOS)
        pg.goto('http://127.0.0.1:%d/' % puerto)
        pg.wait_for_timeout(3500)
        pg.evaluate(accion)
        pg.wait_for_timeout(espera)
        pg.screenshot(path=str(SALIDA / (nombre + '.png')))
        print('hecha', nombre)
        pg.close()
    b.close()
