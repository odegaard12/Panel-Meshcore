"""Un WIO en pausa («lo he apagado») no se busca; al reanudarlo se busca enseguida."""
import asyncio
import os
import sys
import tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import meshcore_ble_relay as r

r.PAUSA_FILE = r.Path(tempfile.mkdtemp()) / 'pausa.json'
r.RETRY = 0.05
intentos = []


class Contador(r.Wio):
    async def _conectar(self):
        intentos.append(1)
        raise RuntimeError('apagado')


async def main():
    w = Contador(2, ('MeshCore-PRUEBA', 'PRUEBA'))
    w.pausado = True
    stop = asyncio.Event()
    t = asyncio.create_task(r.keep(w, stop))
    await asyncio.sleep(0.3)
    assert not intentos, intentos
    w.pausado = False
    w.despertar.set()
    await asyncio.sleep(0.3)
    assert intentos, 'al reanudar debe buscarlo'
    stop.set(); w.despertar.set()
    await asyncio.wait([t], timeout=2)
    r._guardar_pausa(2, True)
    assert r._pausas() == {'2': True}

asyncio.run(main())
print('pausa OK')
