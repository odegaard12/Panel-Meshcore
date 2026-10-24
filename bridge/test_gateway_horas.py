"""/api/ble/rxlog/horas: paquetes por hora para el mapa de calor de Analítica,
sin mandar el registro entero."""
import asyncio
import os
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
TMP = tempfile.mkdtemp()
os.environ['MESHCORE_BLE_TOKEN'] = 't'
os.environ['MESHCORE_HISTORY_FILE'] = os.path.join(TMP, 'h.jsonl')
os.environ['MESHCORE_RXLOG_FILE'] = os.path.join(TMP, 'rx.jsonl')
os.environ['MESHCORE_SESSION_SECRET_FILE'] = os.path.join(TMP, 'secret')
os.environ['MESHCORE_HTPASSWD'] = os.path.join(TMP, 'htpasswd')

from aiohttp.test_utils import TestClient, TestServer  # noqa: E402
import meshcore_ble_gateway as gw  # noqa: E402

H = {'X-MeshCore-Token': 't'}
hora = int(time.time() // 3600) * 3600
gw.g.rx_log.clear()
gw.g.rx_log.extend([
    {'at': hora - 7200 + 10, 'idx': 1, 'snr': 4.0, 'rssi': -100, 'len': 30},
    {'at': hora - 7200 + 20, 'idx': 1, 'snr': 8.0, 'rssi': -90, 'len': 30},
    {'at': hora - 7200 + 30, 'idx': 1, 'snr': -2.0, 'rssi': -110, 'len': 30},
    {'at': hora - 10 * 86400, 'idx': 1, 'snr': 1.0, 'rssi': -100, 'len': 30},   # fuera de 7 días
    {'at': 'basura'},                                                            # no rompe nada
])

# La ventana de 7 días del mapa de calor necesita cabida: ~1 semana de tráfico.
assert gw.RX_LOG_MAX >= 20000, gw.RX_LOG_MAX


async def main():
    async with TestClient(TestServer(gw.app)) as c:
        assert (await c.get('/api/ble/rxlog/horas')).status == 401        # exige token
        j = await (await c.get('/api/ble/rxlog/horas?dias=7', headers=H)).json()
        assert j['ok'] and j['total'] == 5, j
        assert j['desde'] == hora - 10 * 86400                              # el registro más viejo, aunque no entre
        assert len(j['horas']) == 1, j
        h = j['horas'][0]
        assert h['t'] == hora - 7200 and h['n'] == 3 and h['snr'] == 4.0, h  # mediana de -2, 4, 8
        j = await (await c.get('/api/ble/rxlog/horas?dias=30', headers=H)).json()
        assert len(j['horas']) == 2, j
        assert (await c.get('/api/ble/rxlog/horas?dias=x', headers=H)).status == 200   # basura = 7 días
        assert (await c.get('/api/ble/rxlog/horas?dias=99999', headers=H)).status == 200
    print('OK')

asyncio.run(main())
