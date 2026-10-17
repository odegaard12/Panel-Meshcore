"""Avisos por ntfy: batería baja y repetidor sin datos, una vez al empezar y otra al resolverse."""
import asyncio
import os
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ['MESHCORE_BLE_TOKEN'] = 't'
os.environ['MESHCORE_HISTORY_FILE'] = os.path.join(tempfile.mkdtemp(), 'h.jsonl')

import meshcore_ble_gateway_v3 as gw  # noqa: E402

ahora = time.time()
assert gw.problemas(None, ahora, 3800, 3600) == {}
assert gw.problemas({'bat_mv': 4100, 'at': ahora}, ahora, 3800, 3600) == {}
assert set(gw.problemas({'bat_mv': 3700, 'at': ahora}, ahora, 3800, 3600)) == {'bateria'}
assert set(gw.problemas({'bat_mv': 4100, 'at': ahora - 7200}, ahora, 3800, 3600)) == {'sin_datos'}
assert gw.problemas({'bat_mv': 0, 'at': ahora}, ahora, 3800, 3600) == {}  # 0 = sin lectura

enviados = []
a = gw.Avisos()
a.url = 'http://ejemplo.invalid/tema'


async def falso(texto, etiqueta):
    enviados.append(texto)
a._enviar = falso


async def main():
    baja = [{'bat_mv': 3700, 'at': time.time()}]
    await a.revisar(baja)
    await a.revisar(baja)  # sigue baja: no repite
    await a.revisar([{'bat_mv': 4000, 'at': time.time()}])
asyncio.run(main())
assert len(enviados) == 2, enviados
assert enviados[0].startswith('Batería') and enviados[1].startswith('Resuelto'), enviados

sin_url = gw.Avisos()
sin_url.url = ''
asyncio.run(sin_url.revisar([{'bat_mv': 3000, 'at': 0}]))  # apagado: no peta ni envía
print('avisos OK')
