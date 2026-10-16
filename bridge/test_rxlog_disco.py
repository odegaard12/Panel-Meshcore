"""El registro RF sobrevive a un reinicio del gateway y el fichero no crece sin fin."""
import asyncio, base64, os, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
d = tempfile.mkdtemp()
os.environ['MESHCORE_RXLOG_FILE'] = os.path.join(d, 'rx.jsonl')
os.environ['MESHCORE_HISTORY_FILE'] = os.path.join(d, 'h.jsonl')
os.environ['MESHCORE_BLE_TOKEN'] = 't'
import meshcore_ble_gateway_v3 as gw

gw.RX_LOG_MAX = 5
push = lambda snr4: {'op': 'push', 'idx': 2, 'frame': base64.b64encode(bytes([0x88, snr4 & 255, 0xBA, 1, 2])).decode()}


async def main():
    g1 = gw.RelayGateway()
    g1.rx_log = gw.collections.deque(maxlen=5)
    for i in range(12):
        await g1.receive(push(i * 4))
    lineas = open(os.environ['MESHCORE_RXLOG_FILE']).read().splitlines()
    assert len(lineas) <= 2 * 5, len(lineas)          # se recorta cada RX_LOG_MAX
    g2 = gw.RelayGateway()                             # "reinicio"
    assert [m['snr'] for m in g2.rx_log][-1] == 11, list(g2.rx_log)
    assert len(open(os.environ['MESHCORE_RXLOG_FILE']).read().splitlines()) == len(g2.rx_log)
    print('OK', len(g2.rx_log), 'paquetes recuperados tras reiniciar')

asyncio.run(main())
