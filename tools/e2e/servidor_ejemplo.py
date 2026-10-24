"""Servidor de ejemplo para las pruebas de navegador y las capturas del README.

Sirve el panel tal cual está en el repo y responde a /api/* con datos INVENTADOS (nada real, nada sale
a ninguna Raspberry ni a ningún nodo). Uso: python tools/e2e/servidor_ejemplo.py [puerto]
"""
import http.server
import json
import math
import mimetypes
import random
import sys
import time
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]

# ruta pública -> fichero del repo (config.js es el de ejemplo: nunca el de nadie)
ARCHIVOS = {
    '/': 'dashboard.html', '/dashboard.html': 'dashboard.html', '/login.html': 'bridge/login.html',
    '/meshcore-ble-gateway.js': 'bridge/meshcore-ble-gateway.js', '/meshcore-ble-guard.js': 'bridge/meshcore-ble-guard.js',
    '/config.js': 'config.example.js', '/sw.js': 'pwa/sw.js', '/manifest.webmanifest': 'pwa/manifest.webmanifest',
    '/icon-192.png': 'pwa/icon-192.png', '/icon-512.png': 'pwa/icon-512.png', '/apple-touch-icon.png': 'pwa/apple-touch-icon.png',
}


def crear_datos(ahora=None):
    """Paquetes oídos (8 días), medidas del repetidor (5 días, con huecos) y estado, todo inventado."""
    random.seed(7)
    ahora = ahora or time.time()
    rx, t = [], ahora - 8 * 86400
    while t < ahora:
        hora = time.localtime(t).tm_hour
        t += random.expovariate((12 + 30 * max(0, math.sin((hora - 7) / 16 * math.pi))) / 3600)
        cerca = random.random() < 0.45
        snr = random.gauss(11, 2.5) if cerca else random.gauss(-2, 4.5)
        rssi = random.gauss(-66, 5) if cerca else random.gauss(-108, 7)
        rx.append({'at': round(t, 1), 'idx': 2, 'snr': round(max(-18, min(16, snr)) * 4) / 4,
                   'rssi': int(max(-130, min(-40, rssi))), 'len': random.randint(20, 120)})
    hist, t, up = [], ahora - 5 * 86400, 3 * 86400
    rf = rd = df = dd = 0
    ar = tx = 0.0
    while t < ahora:
        t += 900
        up += 900
        h = time.localtime(t).tm_hour
        sol = max(0, math.sin((h - 7) / 12 * math.pi))
        f, d = int(8 + 28 * sol + random.random() * 6), int(3 + 11 * sol + random.random() * 3)
        rf += f
        rd += d
        df, dd = (df + int(f * .55)) % 65536, (dd + int(d * .1)) % 65536
        ar += 900 * (0.03 + 0.06 * sol + random.random() * .01)
        tx += 900 * (0.004 + 0.012 * sol)
        if ahora - 4 * 86400 < t < ahora - 3.2 * 86400 or ahora - 30 * 3600 < t < ahora - 20 * 3600:
            continue   # dos huecos sin medidas
        pico = abs(t - (ahora - 2 * 86400 - 5 * 3600)) < 1000
        hist.append({'at': t, 'bat_mv': int(4040 + 150 * sol + random.gauss(0, 6)), 'duty_cycle': 0.4 + 0.8 * sol + random.random() * 0.2,
                     'uptime': up, 'noise_floor': -103 if pico else -112 + random.randint(-2, 2), 'nb_recv': rf + rd,
                     'nb_sent': int(up / 60), 'recv_flood': rf, 'recv_direct': rd, 'dups_flood': df, 'dups_direct': dd,
                     'airtime_rx': int(ar), 'airtime_tx': int(tx), 'pubkey': 'aa' * 32})
    estado = {'ok': True, 'relay': True, 'relay_since': ahora - 3600, 'wios': [
        {'idx': 1, 'state': 'offline', 'connected': False, 'ready': False, 'name': 'MeshCore-WIO1',
         'last_failure': 'no responde: ¿apagado o sin batería?', 'push_seq': 0},
        {'idx': 2, 'state': 'offline', 'connected': False, 'ready': False, 'name': 'MeshCore-WIO2', 'push_seq': 0}],
        'rak': {'idx': 'rak', 'state': 'offline', 'connected': False, 'name': 'REPETIDOR-EJEMPLO'}}
    return rx, hist, estado


RX, HIST, ESTADO = crear_datos()


class Manejador(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _enviar(self, cuerpo, tipo, codigo=200):
        self.send_response(codigo)
        self.send_header('Content-Type', tipo)
        self.send_header('Content-Length', str(len(cuerpo)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(cuerpo)

    def _json(self, obj, codigo=200):
        self._enviar(json.dumps(obj).encode(), 'application/json', codigo)

    def do_GET(self):
        ruta = self.path.split('?')[0]
        if ruta in ARCHIVOS:
            f = RAIZ / ARCHIVOS[ruta]
            tipo = mimetypes.guess_type(str(f))[0] or 'application/octet-stream'
            return self._enviar(f.read_bytes(), tipo + ('; charset=utf-8' if tipo.startswith('text') or 'javascript' in tipo else ''))
        ahora = time.time()
        if ruta == '/api/ble/status':
            return self._json(ESTADO)
        if ruta == '/api/ble/rxlog':
            return self._json({'ok': True, 'total': len(RX), 'max': 30000, 'samples': RX[-4000:]})
        if ruta == '/api/ble/rxlog/horas':
            por = {}
            for m in RX:
                por.setdefault(int(m['at'] // 3600) * 3600, []).append(m['snr'])
            horas = [{'t': h, 'n': len(v), 'snr': sorted(v)[len(v) // 2]} for h, v in sorted(por.items())]
            return self._json({'ok': True, 'desde': RX[0]['at'], 'total': len(RX), 'horas': horas})
        if ruta == '/api/ble/history':
            return self._json({'ok': True, 'target': {'idx': 2, 'pubkey': 'aa' * 32}, 'every_seconds': 900,
                               'last_sample_at': HIST[-1]['at'], 'last_error': '', 'samples': HIST})
        if ruta == '/api/ble/caja':
            return self._json({'ok': True, 'temp': '23.4', 'usb': 'on'})
        if ruta == '/api/auth/whoami':
            return self._json({'ok': True, 'user': 'ejemplo', 'abierta': int(ahora) - 3600, 'caduca': int(ahora) + 6 * 86400})
        if ruta.startswith('/api/'):
            return self._json({'error': 'ejemplo: no disponible'}, 503)
        return self._enviar(b'no encontrado', 'text/plain', 404)

    def do_POST(self):
        self._json({'error': 'ejemplo: solo lectura'}, 503)


def crear_servidor(puerto=0):
    """Devuelve (servidor, puerto). Con puerto 0 elige uno libre."""
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', puerto), Manejador)
    return srv, srv.server_address[1]


if __name__ == '__main__':
    srv, puerto = crear_servidor(int(sys.argv[1]) if len(sys.argv) > 1 else 8111)
    print('servidor de ejemplo en http://127.0.0.1:%d' % puerto, flush=True)
    srv.serve_forever()
