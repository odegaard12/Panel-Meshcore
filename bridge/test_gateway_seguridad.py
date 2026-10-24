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
import meshcore_ble_gateway as gw  # noqa: E402
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
        assert await st('/api/ble/wio/1/command', json={'frame': b64(bytes([0x17]))}) == 403  # clave privada: apagado
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

        # 9. Un token con caracteres no ASCII es un 401, no un 500.
        r = await c.get('/api/ble/status', headers={'X-MeshCore-Token': 'café'.encode('utf-8').decode('latin-1')})
        assert r.status == 401, r.status

        # 10. La terminal (con sudo) pide una sesion abierta hace menos de 2 h
        # (nginx pasa ?max_horas=2); el panel acepta la misma sesion mientras dure.
        auth_mod.SESSION_HOURS = 168
        with open(os.environ['MESHCORE_HTPASSWD'], 'w') as fh:
            fh.write('oscar:$apr1$abc$def\n')
        ck = {'Cookie': f'{auth_mod.COOKIE_NAME}={auth_mod.make_session("oscar")}'}
        assert (await c.get('/api/auth/verify?max_horas=2', headers={**H, **ck})).status == 200
        # «Tu sesion» (Gestion): quien eres, cuando entraste y cuando caduca.
        j = await (await c.get('/api/auth/whoami', headers=ck)).json()
        assert j['ok'] and j['user'] == 'oscar' and j['caduca'] - j['abierta'] == 168 * 3600, j
        assert abs(j['abierta'] - auth_mod.time.time()) < 5, j
        assert (await (await c.get('/api/auth/whoami')).json())['ok'] is False
        real = auth_mod.time.time
        auth_mod.time.time = lambda: real() + 3 * 3600
        try:
            assert (await c.get('/api/auth/verify?max_horas=2', headers={**H, **ck})).status == 401
            assert (await c.get('/api/auth/verify', headers={**H, **ck})).status == 200
            assert (await c.get('/api/auth/verify?max_horas=x', headers={**H, **ck})).status == 200  # basura = sin limite
        finally:
            auth_mod.time.time = real
        # Cambiar la contrasena (el hash) invalida las sesiones abiertas.
        with open(os.environ['MESHCORE_HTPASSWD'], 'w') as fh:
            fh.write('oscar:$apr1$abc$otro\n')
        assert (await c.get('/api/auth/verify', headers={**H, **ck})).status == 401

        # 11. Pausa: si el relay cae a mitad del envio, 503 y no 500.
        class WsRoto:
            async def send_json(self, _):
                raise ConnectionResetError('cerrado')
        gw.g.ws = WsRoto()
        assert await st('/api/ble/wio/1/pausa', json={'on': True}) == 503

        # 12. Al caer el relay no queda estado suyo para el siguiente.
        gw.g.messages_waiting[1] = True
        gw.g.last_push_type[1] = 0x83
        gw.g.last_push_by_type[1] = {0x87: b'viejo'}
        await gw.g.detach(gw.g.ws)
        assert gw.g.messages_waiting[1] is False
        assert gw.g.last_push_type[1] is None
        assert gw.g.last_push_by_type[1] == {}
    print('OK')

asyncio.run(main())
