"""Relay: un comando OK saca al WIO del ERROR que dejo un timeout, y la cola
de avisos tiene tope (se tira lo mas viejo)."""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import meshcore_ble_relay as r  # noqa: E402


class Cliente:
    is_connected = True

    def __init__(self, wio):
        self.wio = wio

    async def write_gatt_char(self, _uuid, frame, response=False):
        self.wio._notify(None, bytearray([5]))


async def main():
    w = r.Wio(1, ('X',))
    w.client = Cliente(w)
    w.set_state(r.ERROR, 'timeout esperando respuesta')
    assert await w.command(bytes([1])) == bytes([5])
    assert w.state == r.READY and w.last_error == '', w.status()

    for i in range(600):
        w._notify(None, bytearray([0x88, i % 256]))
    assert w.pushes.qsize() == r.PUSH_QUEUE_MAX
    assert w.pushes.get_nowait()[1] == 100  # los 100 primeros se tiraron
    print('OK')

asyncio.run(main())
