"""Proxy de pruebas: sirve el panel desde la carpeta actual y reenvia solo las
consultas GET de /api/ble/ al gateway real. Todo POST se bloquea: un panel de
pruebas no debe vaciar la cola de mensajes del WIO ni emitir por radio.

Uso:  python tools/dev_proxy.py <fichero-token>   (desde la carpeta con index.html)
Gateway: MESHCORE_GATEWAY (por defecto http://raspberrypi.local:8780)."""
import http.server
import os
import pathlib
import sys
import urllib.error
import urllib.request

GATEWAY = os.getenv('MESHCORE_GATEWAY', 'http://raspberrypi.local:8780')
TOKEN = pathlib.Path(sys.argv[1]).read_text().strip()


class H(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if not self.path.startswith('/api/ble/'):
            return super().do_GET()
        req = urllib.request.Request(GATEWAY + self.path, headers={'X-MeshCore-Token': TOKEN})
        try:
            with urllib.request.urlopen(req, timeout=25) as resp:
                body, code = resp.read(), resp.status
        except urllib.error.HTTPError as exc:
            body, code = exc.read(), exc.code
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        self.send_response(503)
        self.end_headers()

    def log_message(self, *a):
        pass


http.server.ThreadingHTTPServer(('127.0.0.1', 8099), H).serve_forever()
