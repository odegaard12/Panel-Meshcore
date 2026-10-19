"""El relay se arregla solo: cada 3 fallos seguidos de conexión pide rehacer el emparejamiento."""
import asyncio
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import meshcore_ble_relay as r


class Falla(r.Wio):
    async def _conectar(self):
        raise RuntimeError('Characteristic 6e400003 was not found!')


async def main():
    w = Falla(1, ('MeshCore-PRUEBA', 'PRUEBA'))
    for n in range(1, 4):
        try:
            await w.connect()
        except RuntimeError:
            pass
        assert w.rehacer_vinculo == (n == 3), (n, w.rehacer_vinculo)
    assert w.fallos_seguidos == 3

asyncio.run(main())
print('autocura OK')
