"""Un WIO que no responde debe mostrar el motivo tambien durante los reintentos
(antes disconnect() lo pisaba y el panel veia un 'connecting' eterno)."""
import asyncio, sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import meshcore_ble_relay as r

r.RETRY = 0.05
import tempfile
r.PAUSA_FILE = r.Path(tempfile.mkdtemp()) / "pausa.json"   # no leer la pausa real de quien lo ejecuta
estados = []


class Falso(r.Wio):
    intentos = 0

    async def connect(self):
        Falso.intentos += 1
        self.set_state(r.SCANNING)
        self.set_state(r.CONNECTING)
        raise asyncio.TimeoutError()


async def main():
    w = Falso(2, ('X',))
    w.on_change = lambda _i: estados.append(dict(w.status()))
    stop = asyncio.Event()
    t = asyncio.create_task(r.keep(w, stop))
    await asyncio.sleep(0.4)
    stop.set(); t.cancel()
    ult = estados[-1]
    print('intentos:', Falso.intentos)
    print('ultimo estado:', ult['state'], '| last_failure:', ult['last_failure'])
    i0 = next(i for i, e in enumerate(estados) if e['last_failure'])
    en_transito = [e for e in estados[i0:] if e['state'] in ('scanning', 'connecting', 'reconnecting')]
    print('estados en transito tras el 1er fallo:', len(en_transito))
    print('motivo visible durante reintentos:', all(e['last_failure'] for e in en_transito))
    globals().update(en_transito=en_transito)

asyncio.run(main())


assert Falso.intentos > 1 and all(e['last_failure'] for e in en_transito)

