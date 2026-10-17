"""Un emparejamiento de Windows que nunca termina no debe dejar el lock del WIO
cogido: antes colgaba el relay entero (socket del gateway en CLOSE_WAIT)."""
import asyncio, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import meshcore_ble_relay as r

r.PAIR_TIMEOUT = 0.3
r.PAIR = True


async def colgado(*a, **k):
    await asyncio.sleep(3600)


class ClienteFalso:
    def __init__(self, *a, **k): pass
    async def connect(self): raise RuntimeError('sin nodo (prueba)')


class Dispositivo:
    address = 'AA:BB:CC:DD:EE:FF'
    name = 'MeshCore-WIO2'


async def main():
    r.pair_with_pin = colgado
    r.BleakClient = ClienteFalso
    w = r.Wio(2, ('MeshCore-WIO2',))

    async def descubre(): return Dispositivo()
    w.discover = descubre
    t0 = time.monotonic()
    try:
        await asyncio.wait_for(w.connect(), 5)
    except RuntimeError:
        pass
    dt = time.monotonic() - t0
    assert dt < 2, f'connect tardo {dt:.1f} s: el emparejamiento colgado no tiene tope'
    assert not w.lock.locked(), 'el lock del WIO se quedo cogido'
    await asyncio.wait_for(w.disconnect(), 1)   # antes: esperaba el lock para siempre
    print(f'OK: emparejamiento colgado cortado en {dt:.2f} s y lock libre')

asyncio.run(main())
