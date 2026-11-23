"""Ajustes del WIO desde el panel: hora automatica y cambios de nombre, posicion, potencia y radio."""
import asyncio
import os
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ['MESHCORE_BLE_TOKEN'] = 't'
os.environ['MESHCORE_HISTORY_FILE'] = os.path.join(tempfile.mkdtemp(), 'h.jsonl')

from aiohttp.test_utils import TestClient, TestServer  # noqa: E402
import meshcore_ble_gateway as gw  # noqa: E402

H = {'X-MeshCore-Token': 't'}
enviados = []
reloj = {'dev': int(time.time()), 'responde': b'\x00'}


async def falso(idx, frame, timeout=8, stream_until=None):
    enviados.append(frame)
    if frame[0] == 0x05:
        return bytes([0x09]) + reloj['dev'].to_bytes(4, 'little')
    return reloj['responde']

gw.g.command = falso
gw.g.ws = object()

# --- validacion pura ---
v = gw.validar_ajuste
assert v({'nombre': 'WIO-1'})[0][1] == bytes([8]) + b'WIO-1'
assert v({'lat': 42.5, 'lon': -8.7})[0][1][0] == 0x0E
assert v({'tx_power': 14})[0][1] == bytes([0x0C, 14])
r = v({'radio': {'freq': 869.525, 'bw': 250, 'sf': 11, 'cr': 5}})[0][1]
assert r[0] == 0x0B and int.from_bytes(r[1:5], 'little') == 869525 and int.from_bytes(r[5:9], 'little') == 250000
for malo in ({}, {'nombre': ''}, {'nombre': 'x' * 32}, {'nombre': 'a\nb'}, {'lat': 91, 'lon': 0}, {'lat': 1},
             {'tx_power': 0}, {'tx_power': 23}, {'tx_power': 'x'},
             {'radio': {'freq': 433, 'bw': 250, 'sf': 11, 'cr': 5}},
             {'radio': {'freq': 869.5, 'bw': 100, 'sf': 11, 'cr': 5}},
             {'radio': {'freq': 869.5, 'bw': 250, 'sf': 13, 'cr': 5}},
             {'radio': {'freq': 869.5}}, {'radio': 3}):
    try:
        v(malo)
    except ValueError:
        continue
    raise AssertionError(f'se aceptó {malo}')


async def main():
    async with TestClient(TestServer(gw.app)) as c:
        async def post(url, **kw):
            r = await c.post(url, headers=H, **kw)
            return r.status, (await r.json() if r.status in (200, 502) else None)

        # sin token
        assert (await c.post('/api/ble/wio/1/hora')).status == 401
        # hora en punto: no se toca
        enviados.clear()
        st, j = await post('/api/ble/wio/1/hora')
        assert st == 200 and j['ajustada'] is False and [f[0] for f in enviados] == [0x05], (st, j, enviados)
        # hora desviada 5 minutos: se corrige
        reloj['dev'] = int(time.time()) - 300
        enviados.clear()
        st, j = await post('/api/ble/wio/1/hora')
        assert st == 200 and j['ajustada'] is True and abs(j['desvio_s'] + 300) <= 2
        assert enviados[1][0] == 0x06 and abs(int.from_bytes(enviados[1][1:5], 'little') - time.time()) <= 2
        # el nodo rechaza retroceder: se avisa, no se rompe
        reloj['responde'] = b'\x01'
        st, j = await post('/api/ble/wio/1/hora')
        assert st == 200 and j['ajustada'] is False and 'motivo' in j
        reloj['responde'] = b'\x00'
        # ajuste: exige confirmacion y valores validos
        enviados.clear()
        assert (await post('/api/ble/wio/2/ajuste', json={'nombre': 'X'}))[0] == 409
        assert (await post('/api/ble/wio/2/ajuste', json={'confirmed': True, 'tx_power': 99}))[0] == 400
        assert (await post('/api/ble/wio/2/ajuste', json={'confirmed': 'yes', 'tx_power': 5}))[0] == 409
        assert not enviados
        st, j = await post('/api/ble/wio/2/ajuste', json={'confirmed': True, 'nombre': 'WIO-2', 'tx_power': 10})
        assert st == 200 and j['hechos'] == ['nombre', 'potencia'] and [f[0] for f in enviados] == [0x08, 0x0C]
        # el nodo dice que no: 502 con lo ya hecho
        reloj['responde'] = b'\x01'
        st, j = await post('/api/ble/wio/2/ajuste', json={'confirmed': True, 'tx_power': 10})
        assert st == 502 and j['ok'] is False and j['fallo'] == 'potencia'
        # y por /command en crudo siguen prohibidos
        import base64
        for op in (0x06, 0x08, 0x0B, 0x0C, 0x0E):
            r = await c.post('/api/ble/wio/1/command', headers=H,
                             json={'frame': base64.b64encode(bytes([op]) + bytes(8)).decode()})
            assert r.status == 403, op

asyncio.run(main())
print('OK ajustes del WIO (validacion, hora, confirmacion, rechazos)')
