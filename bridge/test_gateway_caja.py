"""La ruta de la caja exige token y, sin Home Assistant configurado, responde ok:false (el panel la oculta)."""
import asyncio
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ['MESHCORE_BLE_TOKEN'] = 't'
os.environ['MESHCORE_HISTORY_FILE'] = os.path.join(tempfile.mkdtemp(), 'h.jsonl')
for k in ('MESHCORE_HA_URL', 'MESHCORE_HA_TOKEN', 'MESHCORE_HA_CAJA', 'MESHCORE_HA_USB'):
    os.environ.pop(k, None)

from aiohttp.test_utils import TestClient, TestServer  # noqa: E402
import meshcore_ble_gateway as gw  # noqa: E402


async def main():
    async with TestClient(TestServer(gw.app)) as c:
        r = await c.get('/api/ble/caja')
        assert r.status in (401, 403), r.status
        r = await c.get('/api/ble/caja', headers={'X-MeshCore-Token': 't'})
        j = await r.json()
        assert r.status == 200 and j['ok'] is False, j

asyncio.run(main())
print('caja OK')
