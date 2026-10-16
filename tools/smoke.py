"""Recorrido completo del panel con estado guardado realista y datos reales (proxy
de solo lectura). Pulsa todo lo que no sea destructivo y recoge errores JS,
promesas rechazadas, recursos 404 y codigo inyectado que llegue a ejecutarse.

Uso: con tools/dev_proxy.py en marcha, python tools/smoke.py. Sale con 1 si hay
errores. El estado guardado importa: dos regresiones solo salian con el
localStorage de un navegador ya usado, no con uno limpio."""
import json
import sys
from playwright.sync_api import sync_playwright

EVIL = '<img src=x onerror="window.__pwned=(window.__pwned||0)+1">'
vecinos = [{'name': EVIL, 'lat': 40.45, 'lon': -3.65, 'advType': 2, 'hops': 0, 'pubkey': 'aa' * 32, 'lastAdvert': 1790200000},
           {'name': 'REPETIDOR-MONTE', 'lat': 40.45, 'lon': -3.65, 'advType': 2, 'hops': None, 'pubkey': 'bb' * 32},
           {'name': 'LI.LSB Expo', 'lat': 38.77, 'lon': -9.1, 'advType': 2, 'hops': 5, 'pubkey': 'cc' * 32},
           {'name': 'sinpos', 'advType': 1, 'hops': 2, 'pubkey': 'dd' * 32}]
chat = [{'cls': 'in', 'who': 'Canal 0', 'text': 'hola ' + EVIL, 'meta': 'hoy · SNR 12 dB · vía MeshCore-WIO2 ' + EVIL,
         'dedupKey': 'k1', 'kind': 'chan0'}] * 3
estado = {'batt': 20, 'mv': 3480, 'freq': 869.618, 'bw': 62.5, 'sf': 7, 'cr': 6, 'name': EVIL, 'tx': 22,
          'seen': 1790200000000}
init = ("localStorage.setItem('meshcore-neighbors-1',%s);localStorage.setItem('meshcore-neighbors-2',%s);"
        "localStorage.setItem('meshcore-chat-log',%s);localStorage.setItem('meshcore-w1-state',%s);"
        "localStorage.setItem('meshcore-w2-state',%s);localStorage.setItem('meshcore-w2-pos','{\"lat\":40.42,\"lon\":-3.70}');"
        "localStorage.setItem('meshcore-devtab','w1');") % tuple(json.dumps(json.dumps(x)) for x in (
            {'ts': 1, 'contacts': vecinos}, {'ts': 1, 'contacts': vecinos[:2]}, chat, estado, estado))

errores, fallos_red = [], []
pulsados = []
NO_PULSAR = ('export', 'descargar', 'borrar', 'clear', 'fullscreen', 'completa', 'logout', 'salir')
with sync_playwright() as p:
    b = p.chromium.launch(channel='msedge')
    for ancho in (1366, 390):
        pg = b.new_page(viewport={'width': ancho, 'height': 850})
        pg.on('pageerror', lambda e: errores.append(f'[{ancho}] {e}'))
        pg.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text
              and errores.append(f'[{ancho}] consola: {m.text[:160]}'))
        pg.on('response', lambda r: r.status == 404 and fallos_red.append(r.url))
        pg.on('dialog', lambda d: d.dismiss())
        pg.add_init_script(init)
        pg.goto('http://127.0.0.1:8099/index.html')
        pg.wait_for_timeout(5000)
        for tab in ['equipos', 'chat', 'mapa', 'stats', 'red']:
            pg.click(f'nav.tabs button[data-tab="{tab}"]')
            pg.wait_for_timeout(600)
            pg.evaluate(f"document.querySelectorAll('#tab-{tab} details').forEach(d=>d.open=true)")
            if tab == 'equipos':
                grupos = ['.devTab[data-dev="rak"]', '.devTab[data-dev="w1"]', '.devTab[data-dev="w2"]']
            else:
                grupos = [None]
            for g in grupos:
                if g:
                    pg.click(g); pg.wait_for_timeout(300)
                for btn in pg.query_selector_all(f'#tab-{tab} button'):
                    try:
                        if not btn.is_visible() or not btn.is_enabled():
                            continue
                        txt = (btn.get_attribute('id') or '') + ' ' + btn.inner_text()
                        if any(x in txt.lower() for x in NO_PULSAR):
                            continue
                        btn.click(timeout=2000); pulsados.append(f'{ancho}:{tab}')
                        pg.wait_for_timeout(150)
                    except Exception as e:
                        if 'detached' not in str(e) and 'not visible' not in str(e).lower():
                            errores.append(f'[{ancho}] click {txt.strip()[:40]}: {str(e)[:80]}')
        pg.wait_for_timeout(3000)
        ancho_doc = pg.evaluate('document.documentElement.scrollWidth')
        if ancho_doc > ancho + 2:
            errores.append(f'[{ancho}] desborde horizontal: {ancho_doc}px')
        pwned = pg.evaluate('window.__pwned||0')
        if pwned:
            errores.append(f'[{ancho}] XSS ejecutado {pwned} veces')
        pg.close()
    b.close()
print('ERRORES:', len(errores))
for e in dict.fromkeys(errores):
    print(' -', e)
import collections; print('pulsados:', dict(collections.Counter(pulsados)))
print('404:', sorted(set(fallos_red)) or 'ninguno')
sys.exit(1 if errores or fallos_red else 0)
