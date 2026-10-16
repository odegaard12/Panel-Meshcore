"""Un nodo que no aparece no debe escanearse sin parar: la espera entre intentos
se dobla hasta BACKOFF_MAX, y despertar la corta (un comando del panel)."""
import asyncio, sys
import os
import time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import meshcore_ble_relay_v2 as r

r.RETRY = 0.02
r.BACKOFF_MAX = 0.3


class Ausente(r.Wio):
    def __init__(self, *a):
        super().__init__(*a)
        self.horas = []

    async def connect(self):
        self.horas.append(time.monotonic())
        raise RuntimeError('WIO1 no encontrado')


async def main():
    w = Ausente(1, ('X',))
    stop = asyncio.Event()
    t = asyncio.create_task(r.keep(w, stop))
    await asyncio.sleep(1.2)
    n = len(w.horas)
    huecos = [b - a for a, b in zip(w.horas, w.horas[1:])]
    print('intentos en 1,2 s:', n, '| huecos:', [round(h, 2) for h in huecos])
    # Sin espera creciente saldrian ~60 intentos (uno cada 0,02 s).
    assert n <= 8, n
    assert max(huecos) <= r.BACKOFF_MAX + 0.1
    antes = len(w.horas)
    w.despertar.set()
    await asyncio.sleep(0.05)
    print('tras despertar:', len(w.horas) - antes, 'intento(s) inmediato(s)')
    assert len(w.horas) > antes
    stop.set(); t.cancel()
    await asyncio.gather(t, return_exceptions=True)

asyncio.run(main())
print('OK')
