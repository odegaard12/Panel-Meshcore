"""El escaneo BLE no congela el bucle del relay (22/10/2026: 43 s parado y la Pi cortaba
el enlace por falta de pong) y la huella del certificado de wss:// se interpreta bien."""
import asyncio
import importlib
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
HUELLA = 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99'

# 1. Con huella, wss:// la fija; sin huella, verifica el certificado como cualquier web.
os.environ['MESHCORE_GATEWAY_FINGERPRINT'] = HUELLA
import meshcore_ble_relay as r  # noqa: E402
assert type(r.GATEWAY_SSL).__name__ == 'Fingerprint', r.GATEWAY_SSL
assert r.GATEWAY_SSL.fingerprint == bytes.fromhex(HUELLA.replace(':', ''))
del os.environ['MESHCORE_GATEWAY_FINGERPRINT']
importlib.reload(r)
assert r.GATEWAY_SSL is True

# 2. Un escaneo que bloquea el hilo (como WinRT) no para el bucle de asyncio.
r._known_addresses = lambda: {}   # sin direcciones guardadas de este PC
r._escanear = lambda addr, names, seg: (time.sleep(1.5), None)[1]


async def main():
    w = r.Wio(1, ('MeshCore-PRUEBA', 'PRUEBA'))
    peor = 0.0

    async def vigia():
        nonlocal peor
        loop = asyncio.get_running_loop()
        while True:
            t = loop.time()
            await asyncio.sleep(0.05)
            peor = max(peor, loop.time() - t - 0.05)

    v = asyncio.create_task(vigia())
    assert await w.discover() is None
    v.cancel()
    assert peor < 0.5, f'el bucle se paró {peor:.2f} s durante el escaneo'

    # 3. Si el escaneo encuentra el nodo, vuelve una dirección usable.
    r._escanear = lambda addr, names, seg: ('AA:BB:CC:DD:EE:01', 'MeshCore-PRUEBA')
    dev = await w.discover()
    assert dev.address == 'AA:BB:CC:DD:EE:01' and dev.name == 'MeshCore-PRUEBA'
    print('OK')

asyncio.run(main())
