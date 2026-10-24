"""Pruebas de navegador del panel, con datos inventados (servidor_ejemplo.py + datos_ejemplo.js).

Qué comprueba: que carga sin errores, que cada pestaña y cada sección muestra lo suyo, que pulsar todos los
botones no rompe nada (también con nombres y mensajes que intentan inyectar código), que no se desborda en
pantallas pequeñas, la página Gestión, el acceso, «reducir movimiento» y la accesibilidad (axe-core si está
instalado: npm install --prefix tools/e2e axe-core).

Uso: python tools/e2e/test_e2e.py     (E2E_CANAL=msedge para usar Edge en Windows)   Sale con 1 si algo falla.
"""
import os
import sys
import threading
from collections import Counter
from pathlib import Path

from playwright.sync_api import sync_playwright

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
from servidor_ejemplo import crear_servidor  # noqa: E402

DATOS = (AQUI / 'datos_ejemplo.js').read_text(encoding='utf-8')
AXE = AQUI / 'node_modules' / 'axe-core' / 'axe.min.js'
EVIL = '<img src=x onerror="window.__pwned=(window.__pwned||0)+1">'
EVIL_JS = EVIL.replace('"', '\\"')
DATOS_EVIL = DATOS + """
localStorage.setItem('meshcore-neighbors-1', JSON.stringify({ts: 1, contacts: [
  {name: '%s', lat: 40.45, lon: -3.65, advType: 2, hops: 0, pubkey: 'aa'.repeat(32), lastAdvert: 1790200000},
  {name: 'sin-posicion', advType: 1, hops: 2, pubkey: 'dd'.repeat(32)}]}));
localStorage.setItem('meshcore-chat-log', JSON.stringify([
  {cls: 'in', who: 'Canal 0', text: 'hola %s', meta: 'hoy · vía %s', dedupKey: 'k1', kind: 'chan0', at: Date.now() - 60000}]));
localStorage.setItem('meshcore-w1-state', JSON.stringify({batt: 20, mv: 3480, freq: 869.618, bw: 62.5, sf: 7, cr: 6, name: '%s', tx: 22, seen: Date.now()}));
""" % (EVIL_JS, EVIL_JS, EVIL_JS, EVIL_JS)

fallos = []


def ok(cond, msg):
    print(('OK    ' if cond else 'FALLO ') + msg, flush=True)
    if not cond:
        fallos.append(msg)


srv, puerto = crear_servidor(0)
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = 'http://127.0.0.1:%d/' % puerto

TABS = {'equipos': 'tab-equipos', 'chat': 'tab-chat', 'stats': 'tab-stats', 'gestion': 'tab-gestion', 'red': 'tab-red'}
ANALITICA = {'resumen': {'snrChart', 'mapaCalorChart', 'ruidoChart'}, 'senal': {'snrChart', 'rssiChart', 'snrHoraChart'},
             'trafico': {'mapaCalorChart', 'actChart', 'hopsChart', 'traficoChart'}, 'repetidor': {'aireChart', 'ruidoChart', 'repHistChart'}}
GESTION = {'repetidor': {'g-t-sesion', 'g-t-consola', 'g-t-legal'}, 'equipos': {'g-t-w1', 'g-t-w2', 'g-t-relay'},
           'acceso': {'g-t-ses', 'g-t-quien'}, 'datos': {'g-t-chat', 'g-t-mapa', 'g-t-panel'}}
SALTAR = {'g-logout', 'g-recargar'}   # navegan fuera o recargan

JS_BOTONES = """(t) => [...document.querySelectorAll('#tab-' + t + ' button')].filter(b =>
  b.getClientRects().length && !b.disabled && !b.classList.contains('devTab') && !b.closest('.statsTabs, #gestionTabs')).length"""
JS_CLIC = """([t, i]) => { const l = [...document.querySelectorAll('#tab-' + t + ' button')].filter(b =>
  b.getClientRects().length && !b.disabled && !b.classList.contains('devTab') && !b.closest('.statsTabs, #gestionTabs'));
  const b = l[i]; if (!b) return null; const id = b.id || b.textContent.trim().slice(0, 20); if (%s.includes(b.id)) return id; b.click(); return id; }""" % list(SALTAR)


def abrir(b, ancho=1440, alto=900, movil=False, datos=DATOS, movimiento='no-preference'):
    ctx = b.new_context(viewport={'width': ancho, 'height': alto}, device_scale_factor=1, is_mobile=movil,
                        accept_downloads=True, reduced_motion=movimiento)
    pg = ctx.new_page()
    pg.errores = []
    pg.on('pageerror', lambda e: pg.errores.append('JS: ' + str(e)[:200]))
    pg.on('console', lambda m: pg.errores.append('consola: ' + m.text[:200])
          if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    pg.on('dialog', lambda d: d.dismiss())
    pg.add_init_script(datos)
    pg.goto(URL)
    pg.wait_for_timeout(3200)
    return pg


def ir(pg, tab, esp=500):
    pg.evaluate("t => showTab(t)", tab)
    pg.wait_for_timeout(esp)


with sync_playwright() as p:
    b = p.chromium.launch(channel=os.environ.get('E2E_CANAL') or None)

    # ---------------------------------------------------------------- carga
    for ancho, alto, movil in ((1440, 900, False), (390, 844, True)):
        pg = abrir(b, ancho, alto, movil)
        ok(not pg.errores, 'carga a %d px sin errores %s' % (ancho, pg.errores[:2]))
        ok(pg.evaluate("!document.getElementById('splash') && !document.documentElement.classList.contains('cargando')"),
           'carga a %d px: la pantalla de carga se va' % ancho)
        pg.context.close()

    # ---------------------------------------------------------------- navegación y secciones
    pg = abrir(b)
    for t, tid in TABS.items():
        ir(pg, t)
        ok(pg.evaluate("document.querySelector('.tabview.on').id") == tid, 'la pestaña %s se muestra' % t)
    ir(pg, 'stats', 1500)
    for sub, esperado in ANALITICA.items():
        pg.click('#statsTabs button[data-sub="%s"]' % sub)
        pg.wait_for_timeout(1200)
        vis = set(pg.evaluate("[...document.querySelectorAll('#tab-stats .statcard')].filter(c => c.getClientRects().length).map(c => c.querySelector('svg').id)"))
        dib = pg.evaluate("[...document.querySelectorAll('#tab-stats .statcard')].filter(c => c.getClientRects().length).every(c => c.querySelector('svg').innerHTML.length > 400)")
        ok(vis == esperado and dib, 'Analítica/%s muestra y dibuja %s' % (sub, sorted(vis)))
    ok(pg.evaluate("document.querySelectorAll('#statsKpis .kpi').length") == 9, 'Analítica: nueve cifras (cada sección enseña las suyas)')
    ir(pg, 'gestion')
    for sub, esperado in GESTION.items():
        pg.click('#gestionTabs button[data-sub="%s"]' % sub)
        pg.wait_for_timeout(500)
        vis = set(pg.evaluate("[...document.querySelectorAll('#tab-gestion .statcard')].filter(c => c.getClientRects().length).map(c => c.getAttribute('aria-labelledby'))"))
        ok(vis == esperado, 'Gestión/%s muestra %s' % (sub, sorted(vis)))
    pg.focus('#gestionTabs button[data-sub="datos"]')
    pg.keyboard.press('ArrowRight')
    pg.wait_for_timeout(300)
    ok(pg.evaluate("document.getElementById('tab-gestion').dataset.sub") == 'repetidor', 'Gestión: el teclado da la vuelta a las secciones')
    ids = pg.evaluate("[...document.querySelectorAll('[id]')].map(e => e.id)")
    dup = [k for k, v in Counter(ids).items() if v > 1]
    ok(not dup, 'ids únicos en la página %s' % dup)
    ok(not pg.errores, 'navegación sin errores %s' % pg.errores[:2])
    pg.context.close()

    # ---------------------------------------------------------------- pulsar todo (con datos que intentan inyectar código)
    pg = abrir(b, datos=DATOS_EVIL)
    total = 0
    recorridos = [('equipos', "document.querySelector('.devTab[data-dev=\"%s\"]').click()" % d) for d in ('rak', 'w1', 'w2', 'mapa')]
    recorridos += [('chat', ''), ('red', '')]
    recorridos += [('stats', "statsIr('%s'); statsRedibuja()" % s) for s in ANALITICA]
    recorridos += [('gestion', "gestionIr('%s')" % s) for s in GESTION]
    for tab, antes in recorridos:
        ir(pg, tab, 700)
        if antes:
            pg.evaluate(antes)
            pg.wait_for_timeout(700)
        pg.evaluate("document.querySelectorAll('#tab-%s details').forEach(d => d.open = true)" % tab)
        n = pg.evaluate(JS_BOTONES, tab)
        for i in range(n):
            try:
                pg.evaluate(JS_CLIC, [tab, i])
                pg.wait_for_timeout(250)
            except Exception as e:
                pg.errores.append('clic: %s' % str(e)[:150])
            pg.keyboard.press('Escape')
            pg.evaluate("document.querySelectorAll('dialog[open]').forEach(d => d.close())")
            ir(pg, tab, 80)
        total += n
    pg.wait_for_timeout(2500)
    ok(total > 40, 'se pulsaron %d botones en todas las pantallas' % total)
    ok(not pg.errores, 'pulsar todo no da errores %s' % pg.errores[:3])
    ok(pg.evaluate("window.__pwned") in (None, 0), 'ningún nombre ni mensaje con código llegó a ejecutarse')
    pg.context.close()

    # ---------------------------------------------------------------- sin desbordes
    for ancho, alto, movil in ((360, 740, True), (390, 844, True), (768, 1024, False), (1440, 900, False)):
        pg = abrir(b, ancho, alto, movil)
        malos = []
        for t in TABS:
            ir(pg, t, 900)
            if pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth") > 1:
                malos.append(t)
        ok(not malos, 'sin desborde horizontal a %d px %s' % (ancho, malos))
        pg.context.close()

    # ---------------------------------------------------------------- Gestión: flujos
    pg = abrir(b)
    ir(pg, 'gestion')
    pg.evaluate("rakRemotePubkey = 'ab'.repeat(32); setRakRemoteReady(true); rlog('Sesión remota iniciada con MI-REPETIDOR.'); rlog('Comando enviado: get freq')")
    ok(pg.evaluate("document.getElementById('g-sesion-chip').textContent").strip().endswith('Sesión abierta'), 'Gestión: la sesión abierta se ve')
    ok(pg.evaluate("document.querySelectorAll('#g-resp .l:not(.vacio)').length") == 2, 'Gestión: las respuestas salen con su hora')
    pg.evaluate("document.getElementById('devpanel-w1').classList.add('pausado'); document.getElementById('btn-w1-pausa').hidden = false; document.getElementById('btn-w1-pausa').textContent = 'Lo he encendido: búscalo'; gestionSync()")
    ok('En pausa' in pg.evaluate("document.getElementById('g-w1-chip').textContent"), 'Gestión: un WIO en pausa se ve')
    pg.click('#gestionTabs button[data-sub="acceso"]')
    pg.evaluate("CFG.terminalUrl = 'https://192.0.2.1:7443/'; gestionAcceso()")
    pg.wait_for_timeout(900)
    txt = pg.evaluate("document.getElementById('g-sesion-txt').textContent")
    ok('ejemplo' in txt and 'caduca' in txt, 'Gestión: Tu sesión dice quién eres y cuándo caduca')
    ok('Puedes abrirla' in pg.evaluate("document.getElementById('g-term-chip').textContent"), 'Gestión: con sesión reciente se puede abrir la terminal')
    pg.click('#gestionTabs button[data-sub="datos"]')
    pg.wait_for_timeout(400)
    ok('10 mensajes' in pg.evaluate("document.getElementById('g-chat-n').textContent"), 'Gestión: cuenta los mensajes guardados')
    pg.click('#g-chat-borrar')
    pg.wait_for_timeout(300)
    ok('todo el chat' in pg.evaluate("document.querySelector('#dlgBorrar h3').textContent"), 'Gestión: borrar el chat pregunta por «todo el chat»')
    pg.click('#dlgNo')
    ok(pg.evaluate("JSON.parse(localStorage.getItem('meshcore-chat-log')).length") == 10, 'Gestión: cancelar no borra nada')
    pg.click('#g-olvidar')
    pg.wait_for_timeout(300)
    ok(pg.evaluate("document.getElementById('dlgPregunta').open"), 'Gestión: olvidar preferencias pide confirmación')
    pg.click('#dlgPNo')
    pg.click('#g-chat-borrar')
    pg.wait_for_timeout(300)
    pg.click('#dlgSi')
    pg.wait_for_timeout(400)
    ok(pg.evaluate("JSON.parse(localStorage.getItem('meshcore-chat-log') || '[]').length") == 0, 'Gestión: confirmar borra el chat guardado')
    ok(not pg.errores, 'Gestión sin errores %s' % pg.errores[:2])
    pg.context.close()

    # ---------------------------------------------------------------- Analítica: cifras exactas y avisos
    pg = abrir(b)
    ir(pg, 'stats', 2500)
    medio = pg.evaluate("document.querySelector('#statsKpis .kpiV').textContent")
    pg.wait_for_timeout(1500)
    fin = pg.evaluate("[...document.querySelectorAll('#statsKpis .kpiV')].map(k => k.textContent)")
    ok(all(x.strip() for x in fin) and medio is not None, 'Analítica: las cifras acaban con su texto exacto %s' % fin[:3])
    ok(pg.evaluate("document.querySelectorAll('#statsAlertas .alerta').length") >= 1, 'Analítica: la franja de avisos dice algo')
    pg.context.close()

    # ---------------------------------------------------------------- reducir movimiento
    pg = abrir(b, movimiento='reduce')
    ir(pg, 'stats', 1500)
    ok(pg.evaluate("getComputedStyle(document.querySelector('.tabview.on')).animationName") == 'none', 'reducir movimiento: sin animación de pestañas')
    ok(pg.evaluate("(() => { const e = document.querySelector('#snrChart .gbar path'); return e ? getComputedStyle(e).animationName : 'none'; })()") == 'none',
       'reducir movimiento: las barras no se animan')
    pg.context.close()

    # ---------------------------------------------------------------- página de acceso
    ctx = b.new_context(viewport={'width': 1440, 'height': 900})
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL + 'login.html')
    pg.wait_for_timeout(500)
    pg.fill('#u', 'ejemplo')
    pg.fill('#p', 'secreta')
    pg.click('#ojo')
    ok(pg.get_attribute('#p', 'type') == 'text', 'acceso: «Ver» muestra la contraseña')
    pg.click('#ojo')
    ok(pg.get_attribute('#p', 'type') == 'password', 'acceso: «Ocultar» la vuelve a esconder')
    pg.click('#b')
    pg.wait_for_timeout(500)
    ok(pg.evaluate("document.getElementById('m').classList.contains('on') && document.querySelector('.card').classList.contains('sacude')"),
       'acceso: un fallo se muestra y el formulario se sacude')
    ok(pg.input_value('#p') == '', 'acceso: la contraseña se vacía al fallar')
    ok(not errs, 'acceso sin errores %s' % errs[:2])
    ctx.close()

    # ---------------------------------------------------------------- accesibilidad (axe-core)
    if AXE.exists():
        ESTADOS = [('login', 'login.html', ''), ('panel-repetidor', '', "showTab('equipos')"),
                   ('panel-wio1', '', "showTab('equipos'); document.querySelector('.devTab[data-dev=w1]').click()"),
                   ('panel-mapa', '', "showTab('equipos'); document.querySelector('.devTab[data-dev=mapa]').click()"),
                   ('chat', '', "showTab('chat')"), ('red', '', "showTab('red')")]
        ESTADOS += [('analitica-' + s, '', "showTab('stats'); statsIr('%s'); statsRedibuja()" % s) for s in ANALITICA]
        ESTADOS += [('gestion-' + s, '', "showTab('gestion'); gestionIr('%s')" % s) for s in GESTION]
        malos = []
        for nombre, pagina, accion in ESTADOS:
            ctx = b.new_context(viewport={'width': 1440, 'height': 900})
            pg = ctx.new_page()
            pg.add_init_script(DATOS)
            pg.goto(URL + pagina)
            pg.wait_for_timeout(2500)
            if accion:
                pg.evaluate(accion)
                pg.wait_for_timeout(1800)
            pg.add_script_tag(path=str(AXE))
            res = pg.evaluate("""async () => (await axe.run(document, {resultTypes: ['violations'],
              runOnly: {type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']}}))
              .violations.map(v => v.id + ' (' + v.nodes.length + '): ' + v.nodes[0].target.join(' '))""")
            malos += ['%s -> %s' % (nombre, x) for x in res]
            ctx.close()
        ok(not malos, 'accesibilidad (axe-core) en %d pantallas %s' % (len(ESTADOS), malos[:4]))
    else:
        print('SALTADO accesibilidad: falta axe-core (npm install --prefix tools/e2e axe-core)')

    b.close()

print('\nRESULTADO:', 'TODO BIEN' if not fallos else '%d FALLOS' % len(fallos))
sys.exit(1 if fallos else 0)
