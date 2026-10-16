"""Entradas raras al gateway: 400/404 en vez de 500, la politica legal tambien
por /command en crudo, y el historico solo acepta la respuesta a su peticion."""
import asyncio
import base64
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ['MESHCORE_BLE_TOKEN'] = 't'
os.environ['MESHCORE_HISTORY_FILE'] = os.path.join(tempfile.mkdtemp(), 'h.jsonl')

from aiohttp.test_utils import TestClient, TestServer  # noqa: E402
import meshcore_ble_gateway_v3 as gw  # noqa: E402

H = {'X-MeshCore-Token': 't'}
enviados = []


async def falso(idx, frame, timeout=8, stream_until=None):
    enviados.append(frame)
    return bytes([6, 0]) + b'TAG1' + bytes(4)

gw.g.command = falso
gw.g.ws = object()


def cli_frame(texto):
    return base64.b64encode(bytes([2, 1, 0]) + bytes(4) + bytes(6) + texto.encode()).decode()


async def main():
    async with TestClient(TestServer(gw.app)) as c:
        async def st(metodo, url, **kw):
            r = await getattr(c, metodo)(url, headers=H, **kw)
            return r.status

        assert await st('post', '/api/ble/wio/x/command', json={}) == 404
        assert await st('post', '/api/ble/wio/3/command', json={}) == 404
        assert await st('post', '/api/ble/wio/1/command', data='no json') == 400
        assert await st('post', '/api/ble/wio/1/command', json=[1, 2]) == 400
        assert await st('post', '/api/ble/wio/1/command', json={'frame': '%%%'}) == 400
        assert await st('post', '/api/ble/wio/1/binary_req',
                        json={'pubkey': 'aa' * 32, 'req_type': 'x'}) == 400
        # CLI en crudo: la misma politica que /remote_cmd.
        assert await st('post', '/api/ble/wio/1/command', json={'frame': cli_frame('set af 1')}) == 403
        assert await st('post', '/api/ble/wio/1/command', json={'frame': cli_frame('password x')}) == 403
        assert await st('post', '/api/ble/wio/1/command', json={'frame': cli_frame('reboot')}) == 409
        assert await st('post', '/api/ble/wio/1/command', json={'frame': cli_frame('get radio')}) == 200
        assert await st('post', '/api/ble/wio/1/remote_cmd',
                        json={'pubkey': 'aa' * 6, 'cmd': 'set tx nan', 'confirmed': True}) == 400
        # Un mensaje de texto normal (txt_type 0) no pasa por la politica.
        normal = base64.b64encode(bytes([2, 0, 0]) + bytes(10) + b'reboot').decode()
        assert await st('post', '/api/ble/wio/1/command', json={'frame': normal}) == 200

    # Historico: una BINARY_RESPONSE con otro tag no se guarda como estado.
    gw.g.status[1] = {'connected': True}
    gw.monitor.target = {'idx': 1, 'pubkey': 'aa' * 32}
    ajena = bytes([0x8C, 0]) + b'OTRO' + bytes(60)
    buena = bytes([0x8C, 0]) + b'TAG1' + (3700).to_bytes(2, 'little') + bytes(58)
    orig_sleep = asyncio.sleep

    llamadas = {'n': 0}

    async def rapido(_s):
        llamadas['n'] += 1
        frame = ajena if llamadas['n'] == 1 else buena
        gw.g.last_push_by_type[1][0x8C] = {'frame': base64.b64encode(frame).decode(),
                                           'at': 1e12 + llamadas['n']}
        await orig_sleep(0)
    gw.asyncio.sleep = rapido
    try:
        await gw.monitor.sample_once()
    finally:
        gw.asyncio.sleep = orig_sleep
    muestras = gw.monitor.read()
    assert len(muestras) == 1 and muestras[0]['bat_mv'] == 3700, muestras
    print('OK')

asyncio.run(main())
