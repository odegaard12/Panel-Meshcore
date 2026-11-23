"""Endurecimiento 1.39: solo JSON, POST de otras webs, tope de emisión, banda, CLI y sesiones."""
import asyncio
import base64
import os
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
d = tempfile.mkdtemp()
os.environ['MESHCORE_BLE_TOKEN'] = 't'
os.environ['MESHCORE_HISTORY_FILE'] = os.path.join(d, 'h.jsonl')
os.environ['MESHCORE_SESSION_SECRET_FILE'] = os.path.join(d, 's')
os.environ['MESHCORE_REVOKED_FILE'] = os.path.join(d, 'r.json')
os.environ['MESHCORE_HTPASSWD'] = os.path.join(d, 'htpasswd')
with open(os.environ['MESHCORE_HTPASSWD'], 'w') as fh:
    fh.write('usuario:$apr1$abc$def\n')

from aiohttp.test_utils import TestClient, TestServer  # noqa: E402
import meshcore_auth as au  # noqa: E402
import meshcore_ble_gateway as gw  # noqa: E402

H = {'X-MeshCore-Token': 't'}


async def falso(idx, frame, timeout=8, stream_until=None):
    return b'\x00'

gw.g.ws = object()
real_command = gw.RelayGateway.command

# --- política CLI: get cerrado y sin caracteres de control ---
p = gw.politica_cli
assert p('get radio', False) is None and p('get name', False) is None
assert p('get prv.key', False)[0] == 403 and p('get guest.password', False)[0] == 403
assert p('ver\nreboot', False)[0] == 400 and p('get name\tx', False)[0] == 400

# --- banda de /ajuste: la señal entera dentro de 869,40-869,65 ---
v = gw.validar_ajuste
assert v({'radio': {'freq': 869.525, 'bw': 250, 'sf': 11, 'cr': 5}})
for f, bw in ((868.1, 125), (869.6, 250), (869.42, 62.5)):
    try:
        v({'radio': {'freq': f, 'bw': bw, 'sf': 11, 'cr': 5}})
    except ValueError:
        continue
    raise AssertionError((f, bw))

# --- sesiones: cerrar sesión anula la cookie; bloqueo por usuario y por /64 ---
ck = au.make_session('usuario')
assert au.read_session(ck) == 'usuario'
au.revoke(ck)
assert au.read_session(ck) is None
time.sleep(1.1)  # misma caducidad al segundo = misma cookie
assert au.read_session(au.make_session('usuario')) == 'usuario'
assert au._clave_ip('2001:db8:1:2:aaaa::1') == au._clave_ip('2001:db8:1:2:bbbb::9')
assert au._clave_ip('1.2.3.4') == '1.2.3.4'
for i in range(au.MAX_FAILS_USER):
    au._note_failure(f'203.0.113.{i}', 'victima')
assert au.locked_out('198.51.100.9', 'victima') and not au.locked_out('198.51.100.9', 'otro')


async def main():
    async with TestClient(TestServer(gw.app)) as c:
        gw.g.command = falso
        # text/plain: 415 (antes se aceptaba y servía para CSRF sin preflight)
        r = await c.post('/api/ble/wio/1/hora', headers=H, data='{}')
        assert r.status == 415, r.status
        # POST marcado por el navegador como de otra web: 403
        r = await c.post('/api/ble/wio/1/hora', headers={**H, 'Sec-Fetch-Site': 'same-site'}, json={})
        assert r.status == 403, r.status
        r = await c.get('/api/ble/status', headers=H)
        assert r.status == 200 and r.headers.get('Cache-Control') == 'no-store'
        # login: solo JSON
        r = await c.post('/api/auth/login', headers=H, data='username=a&password=b')
        assert r.status == 415, r.status
        # el relay no puede crear canales ni meter objetos en el estado
        await gw.g.receive({'op': 'status', 'idx': 1, 'status': {'name': 'x' * 999, 'raro': {'a': 1}}})
        assert len(gw.g.status[1]['name']) == 200 and 'raro' not in gw.g.status[1]
        try:
            await gw.g.receive({'op': 'status', 'idx': 7, 'status': {}})
            raise AssertionError('canal 7 aceptado')
        except ValueError:
            pass

    # tope de emisión: a la 31.ª trama que emite en un minuto, 429
    class Ws:
        async def send_json(self, msg):
            fut = gw.g.pending[msg['id']]
            fut.set_result(b'\x00')
    gw.g.command = real_command.__get__(gw.g)
    gw.g.ws = Ws()
    gw.g._tx_hechas.clear()
    async with TestClient(TestServer(gw.app)) as c:
        texto = base64.b64encode(bytes([3, 0, 0]) + int(time.time()).to_bytes(4, 'little') + b'hola').decode()
        for i in range(gw.EMISION_MAX_MIN):
            r = await c.post('/api/ble/wio/1/command', headers=H, json={'frame': texto})
            assert r.status == 200, (i, r.status, await r.text())
        r = await c.post('/api/ble/wio/1/command', headers=H, json={'frame': texto})
        assert r.status == 429, r.status
        # leer (batería) no cuenta como emisión
        r = await c.post('/api/ble/wio/1/command', headers=H, json={'frame': base64.b64encode(bytes([0x14])).decode()})
        assert r.status == 200, r.status

asyncio.run(main())
print('OK endurecimiento (JSON, otra web, emisión, banda, CLI, sesiones)')
