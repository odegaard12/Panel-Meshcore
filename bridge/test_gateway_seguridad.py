"""Endurecimiento del gateway: numeros que el firmware lee distinto, opcodes
fuera de lista, IP falsa en X-Real-IP, sesiones de usuarios borrados, tamanos
maximos y push_seq que no se dispara con cada paquete oido."""
import asyncio
import base64
import os
import sys
import tempfile
from types import SimpleNamespace

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
TMP = tempfile.mkdtemp()
os.environ['MESHCORE_BLE_TOKEN'] = 't'
os.environ['MESHCORE_HISTORY_FILE'] = os.path.join(TMP, 'h.jsonl')
os.environ['MESHCORE_RXLOG_FILE'] = os.path.join(TMP, 'rx.jsonl')
os.environ['MESHCORE_SESSION_SECRET_FILE'] = os.path.join(TMP, 'secret')
os.environ['MESHCORE_HTPASSWD'] = os.path.join(TMP, 'htpasswd')

from aiohttp.test_utils import TestClient, TestServer  # noqa: E402
import meshcore_ble_gateway_v3 as gw  # noqa: E402
import meshcore_auth as auth_mod  # noqa: E402

H = {'X-MeshCore-Token': 't'}
enviados = []


async def falso(idx, frame, timeout=8, stream_until=None):
    enviados.append(frame)
    return bytes([6, 0]) + b'TAG1' + bytes(4)

gw.g.command = falso
gw.g.ws = object()


def b64(raw):
    return base64.b64encode(raw).decode()


# 1. '1_0' es 10 para Python y 1 para el atof del firmware (50 % de ciclo).
assert gw.politica_cli('set af 1_0', True)[0] == 400
assert gw.politica_cli('set af 1e1', True)[0] == 400
assert gw.politica_cli('set tx 2_0', True)[0] == 400
assert gw.politica_cli('set af 9', True) is None
assert gw.politica_cli('set freq 869.525', True) is None

# 3. X-Real-IP solo vale si llama nginx (loopback).
falsa = {'X-Real-IP': '1.2.3.4'}
assert gw._client_ip(SimpleNamespace(remote='203.0.113.50', headers=falsa)) == '203.0.113.50'
assert gw._client_ip(SimpleNamespace(remote='127.0.0.1', headers=falsa)) == '1.2.3.4'
assert gw._client_ip(SimpleNamespace(remote='::1', headers={})) == '::1'

# 4. Una sesion firmada deja de valer si el usuario sale del htpasswd.
with open(os.environ['MESHCORE_HTPASSWD'], 'w') as fh:
    fh.write('oscar:$apr1$abc$def\n')
cookie = auth_mod.make_session('oscar')
assert auth_mod.read_session(cookie) == 'oscar'
with open(os.environ['MESHCORE_HTPASSWD'], 'w') as fh:
    fh.write('otro:$apr1$abc$def\n')
assert auth_mod.read_session(cookie) is None

# 17. Los paquetes oidos (0x88) no avisan de mensajes nuevos; 0x83 si.
antes = gw.g.push_seq[1]
asyncio.run(gw.g.receive({'op': 'push', 'idx': 1, 'frame': b64(bytes([0x88, 8, 0xA0, 1, 2]))}))
assert gw.g.push_seq[1] == antes and len(gw.g.rx_log) == 1
asyncio.run(gw.g.receive({'op': 'push', 'idx': 1, 'frame': b64(bytes([0x83]))}))
assert gw.g.push_seq[1] == antes + 1


async def main():
    vistos = {}

    def check(user, password, ip='-'):
        vistos['password'] = password
        return False
    auth_mod.check_password = check

    async with TestClient(TestServer(gw.app)) as c:
        async def st(url, **kw):
            r = await c.post(url, headers=H, **kw)
            return r.status

        # 2. Allowlist de opcodes en /command.
        assert await st('/api/ble/wio/1/command', json={'frame': b64(bytes([0x14]))}) == 200
        assert await st('/api/ble/wio/1/command', json={'frame': b64(bytes([0x0A]))}) == 200
        assert await st('/api/ble/wio/1/command', json={'frame': b64(bytes([0x20, 1]))}) == 403
        assert await st('/api/ble/wio/1/command', json={'frame': b64(bytes([0x33]))}) == 403
        assert await st('/api/ble/wio/1/command', json={'frame': ''}) == 403
        # SEND_TXT_MSG solo con txt_type 0 o 1.
        assert await st('/api/ble/wio/1/command', json={'frame': b64(bytes([2, 2, 0]) + bytes(10))}) == 403
        assert await st('/api/ble/wio/1/command', json={'frame': b64(bytes([2]))}) == 403

        # 7. Password recortada a 64 y cuerpo maximo de 64 KB.
        r = await c.post('/api/auth/login', headers=H, json={'username': 'x', 'password': 'p' * 500})
        assert r.status == 401 and vistos['password'] == 'p' * 64
        assert await st('/api/auth/login', data='x' * (70 * 1024)) == 413
        # data de /binary_req: como mucho 256 caracteres hex (128 bytes).
        enviados.clear()
        assert await st('/api/ble/wio/1/binary_req',
                        json={'pubkey': 'aa' * 32, 'req_type': 6, 'data': 'bb' * 1000}) == 200
        assert len(enviados[-1]) == 1 + 32 + 1 + 128

        # 8. Version en /healthz.
        r = await c.get('/healthz')
        assert (await r.json())['version'] == gw.PANEL_VERSION
    print('OK')

asyncio.run(main())
