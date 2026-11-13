"""Pantalla de iPhone con muesca: la barra de navegación no tapa los títulos ni se sale de la pantalla.

El navegador de pruebas no simula env(safe-area-inset-*): se sustituyen por los valores de un iPhone con
isla dinámica (47 px arriba, 34 px abajo) al servir la página. Uso: python tools/e2e/test_iphone.py
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
ARRIBA = 47
srv, puerto = crear_servidor(0)
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = 'http://127.0.0.1:%d/' % puerto

PANTALLAS = [
    ('Panel', "showTab('equipos')", None),
    ('Chat', "showTab('chat')", None),
    ('Analítica', "showTab('stats')", '#tab-stats .statsTitle'),
    ('Gestión', "showTab('gestion')", '#tab-gestion .statsTitle'),
    ('Red y notas', "showTab('red')", '#tab-red .statsTitle'),
]
malos = []


def con_muesca(route):
    resp = route.fetch()
    cuerpo = resp.text().replace('env(safe-area-inset-top)', '%dpx' % ARRIBA).replace('env(safe-area-inset-bottom)', '34px')
    cabeceras = {k: v for k, v in resp.headers.items() if k.lower() != 'content-length'}
    route.fulfill(status=resp.status, headers=cabeceras, body=cuerpo)


with sync_playwright() as p:
    b = p.chromium.launch(channel=os.environ.get('E2E_CANAL') or None)
    # Sin service worker: si no, las pantallas siguientes salen de su caché y se saltan la sustitución.
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, service_workers='block')
    for nombre, accion, titulo in PANTALLAS:
        pg = ctx.new_page()
        pg.route('**/*', lambda r: con_muesca(r) if r.request.url.rstrip('/') == URL.rstrip('/') else r.continue_())
        pg.add_init_script(DATOS)
        pg.goto(URL)
        pg.wait_for_timeout(2500)
        pg.evaluate(accion)
        pg.wait_for_timeout(1000)
        m = pg.evaluate("""(t) => {
            const h = document.querySelector('header').getBoundingClientRect();
            const el = t && document.querySelector(t);
            return {top: h.top, bottom: h.bottom, titulo: el ? el.getBoundingClientRect().top : null,
                    ancho: document.documentElement.scrollWidth, vw: innerWidth};
        }""", titulo)
        if m['top'] < ARRIBA:
            malos.append('%s: la barra de navegación queda bajo la muesca (top %d < %d)' % (nombre, m['top'], ARRIBA))
        if m['titulo'] is not None and m['titulo'] < m['bottom']:
            malos.append('%s: la barra tapa el título (título %d < barra %d)' % (nombre, m['titulo'], m['bottom']))
        if m['ancho'] > m['vw']:
            malos.append('%s: la página se desplaza en horizontal (%d > %d)' % (nombre, m['ancho'], m['vw']))
        pg.close()
    b.close()
srv.shutdown()

for x in malos:
    print('FALLO', x)
print('RESULTADO:', 'TODO BIEN' if not malos else '%d FALLOS' % len(malos))
sys.exit(1 if malos else 0)
