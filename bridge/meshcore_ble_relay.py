#!/usr/bin/env python3
"""Relay BLE de MeshCore: el PC es el dueno fisico del enlace con WIO1/WIO2.

Se conecta al gateway de la Raspberry por WebSocket y le presta sus radios. La Pi
nunca abre BLE, asi se evita la contienda con BlueZ
(org.bluez.Error.InProgress).

Tres reglas que este fichero tiene que respetar si o si:

1. Las tramas push del nodo (primer byte con el bit 0x80) NO son respuesta a
   ningun comando: son avisos espontaneos, sobre todo MESSAGES_WAITING (0x83).
   Van por una cola aparte y se reenvian al gateway. Mezclarlas con las
   respuestas hacia que se descartaran y que el chat entrante no llegara nunca.
2. Antes de escribir un comando se vacia solo la cola de RESPUESTAS, nunca la de
   push, y se deja constancia en el log de cuantas se tiraron. Una respuesta
   huerfana de un comando que expiro desincroniza el emparejamiento
   peticion/respuesta si se queda ahi.
3. Todo lo que toca el cliente BLE (connect, command, disconnect) pasa por el
   mismo lock. Sin eso el bucle de reconexion cerraba el cliente en mitad de un
   comando en vuelo.
"""
from __future__ import annotations

import asyncio
import base64
import contextlib
import json
import logging
import logging.handlers
import os
from pathlib import Path

import aiohttp
from bleak import BleakClient, BleakScanner
from bleak.backends.device import BLEDevice

UART_WRITE = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'
UART_NOTIFY = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'

NAMES = {
    # Nombre BLE de cada WIO (MESHCORE_WIO1_NAME / MESHCORE_WIO2_NAME). Se acepta
    # tambien sin el prefijo MeshCore-, que algunos firmwares no anuncian.
    1: (os.getenv('MESHCORE_WIO1_NAME', 'MeshCore-WIO1'), os.getenv('MESHCORE_WIO1_NAME', 'MeshCore-WIO1').replace('MeshCore-', '')),
    2: (os.getenv('MESHCORE_WIO2_NAME', 'MeshCore-WIO2'), os.getenv('MESHCORE_WIO2_NAME', 'MeshCore-WIO2').replace('MeshCore-', '')),
    # El repetidor (RAK) no esta aqui: no anuncia Bluetooth, se gestiona por
    # LoRa a traves de un WIO. Buscarlo solo ocupaba la radio con escaneos.
}

GATEWAY_WS = os.getenv('MESHCORE_GATEWAY_WS', 'ws://raspberrypi.local:8780/api/ble/relay')
TOKEN = os.getenv('MESHCORE_BLE_TOKEN', '')
PAIR = os.getenv('MESHCORE_BLE_PAIR', '1') == '1'
SCAN_SECONDS = float(os.getenv('MESHCORE_BLE_SCAN_SECONDS', '6'))
RETRY = float(os.getenv('MESHCORE_BLE_RECONNECT_SECONDS', '3'))
BACKOFF_MAX = float(os.getenv('MESHCORE_BLE_BACKOFF_MAX_SECONDS', '60'))
PAIR_TIMEOUT = float(os.getenv('MESHCORE_BLE_PAIR_TIMEOUT_SECONDS', '30'))
# El firmware companion de MeshCore protege el UART con un PIN fijo (123456 de
# fabrica). bleak solo sabe emparejar "sin PIN" (Just Works): el vinculo queda
# en nivel 2 y el UART contesta Insufficient Authentication. Ver pair_with_pin.
BLE_PIN = os.getenv('MESHCORE_BLE_PIN', '123456')
ADDR_FILE = Path(os.getenv('MESHCORE_BLE_ADDR_FILE', str(Path.home() / '.meshcore-ble-addresses.json')))

# Con MESHCORE_LOG_FILE el log va a su propio fichero UTF-8 con rotacion. Antes
# PowerShell lo redirigia en UTF-16 al mismo fichero que las lineas del
# supervisor (UTF-8): salia mezclado y no se podia ni buscar en el.
_log_file = os.getenv('MESHCORE_LOG_FILE', '').strip()
logging.basicConfig(level=os.getenv('MESHCORE_LOG_LEVEL', 'INFO'),
                    format='%(asctime)s %(levelname)s %(message)s',
                    handlers=[logging.handlers.RotatingFileHandler(
                        _log_file, maxBytes=2_000_000, backupCount=3, encoding='utf-8')]
                    if _log_file else None)
log = logging.getLogger('meshcore-ble-relay')

# Estados publicados al panel. La UI debe pintar exactamente esto y no inventar
# un "conectado" propio cuando solo existe el objeto de javascript.
OFFLINE = 'offline'
SCANNING = 'scanning'
CONNECTING = 'connecting'
CONNECTED = 'connected'
READY = 'ready'
ERROR = 'error'
RECONNECTING = 'reconnecting'

PUSH_QUEUE_MAX = 500


def _known_addresses() -> dict:
    try:
        return json.loads(ADDR_FILE.read_text(encoding='utf-8'))
    except Exception:
        return {}


def _remember_address(key, address: str) -> None:
    known = _known_addresses()
    if known.get(str(key)) == address:
        return
    known[str(key)] = address
    with contextlib.suppress(Exception):
        ADDR_FILE.write_text(json.dumps(known, indent=1), encoding='utf-8')


async def pair_with_pin(address: str, label: str, forzar: bool = False) -> None:
    """Deja el vinculo de Windows en nivel 3 (cifrado + autenticacion) con el PIN.

    Si ya lo esta no hace nada. Si hay un vinculo flojo (nivel <= 2, el que deja
    bleak) lo deshace y lo rehace con PIN. Con forzar lo rehace aunque Windows lo
    vea en nivel 3: pasa cuando el nodo pierde su lado del vinculo (p. ej. al
    quedarse sin bateria) y Windows no se entera. Fuera de Windows no aplica.
    """
    try:
        from winrt.windows.devices.bluetooth import BluetoothLEDevice
        from winrt.windows.devices.enumeration import DeviceInformation, DevicePairingKinds
    except ImportError:
        return
    dev = await BluetoothLEDevice.from_bluetooth_address_async(int(address.replace(':', ''), 16))
    if dev is None:
        return
    info = await DeviceInformation.create_from_id_async(dev.device_id)
    if info.pairing.is_paired and int(info.pairing.protection_level) >= 3 and not forzar:
        return
    if forzar:
        log.info('%s: vinculo no reconocido por el nodo, se rehace con PIN', label)
    if info.pairing.is_paired:
        await info.pairing.unpair_async()
        info = await DeviceInformation.create_from_id_async(dev.device_id)

    def on_request(_sender, args):
        if args.pairing_kind == DevicePairingKinds.PROVIDE_PIN:
            args.accept_with_pin(BLE_PIN)
        else:
            args.accept()

    custom = info.pairing.custom
    token = custom.add_pairing_requested(on_request)
    try:
        result = await custom.pair_async(
            DevicePairingKinds.CONFIRM_ONLY | DevicePairingKinds.PROVIDE_PIN
            | DevicePairingKinds.CONFIRM_PIN_MATCH | DevicePairingKinds.DISPLAY_PIN)
    finally:
        custom.remove_pairing_requested(token)
    log.info('%s: emparejado con PIN -> estado %s', label, int(result.status))


def b64(raw: bytes) -> str:
    return base64.b64encode(raw).decode('ascii')


def unb64(text: str) -> bytes:
    return base64.b64decode(text.encode('ascii'), validate=True)


class Wio:
    def __init__(self, idx: int, names: tuple[str, ...]):
        self.idx = idx
        self.names = names
        self.client: BleakClient | None = None
        self.device = None
        self.state = OFFLINE
        self.last_error = ''
        # El motivo del ultimo fallo sobrevive a los estados de paso
        # (scanning/connecting) de cada reintento, hasta que conecte.
        self.last_failure = ''
        self.rehacer_vinculo = False
        self.responses: asyncio.Queue[bytes] = asyncio.Queue()
        # Con tope: sin gateway la cola crecia sin fin y al reconectar
        # soltaba avisos de hace horas.
        self.pushes: asyncio.Queue[bytes] = asyncio.Queue(maxsize=PUSH_QUEUE_MAX)
        self.lock = asyncio.Lock()
        self.on_change = None
        # Fallos seguidos y aviso para cortar la espera: ver keep().
        self.fallos = 0
        self.despertar = asyncio.Event()

    @property
    def label(self) -> str:
        return f'WIO{self.idx}'

    @property
    def connected(self) -> bool:
        return bool(self.client and self.client.is_connected)

    def set_state(self, state: str, error: str = '') -> None:
        if state == self.state and error == self.last_error:
            return
        self.state = state
        self.last_error = error
        log.info('%s -> %s%s', self.label, state, f' ({error})' if error else '')
        if self.on_change:
            self.on_change(self.idx)

    def status(self) -> dict:
        return {
            'idx': self.idx,
            'state': self.state,
            # connected = enlace BLE real, no el resultado del ultimo comando: con
            # el estado, un timeout dejaba ERROR, el gateway dejaba de mandar
            # comandos y el estado ya no volvia nunca a READY (16/10/2026).
            'connected': self.connected and self.state != OFFLINE,
            'ready': self.state == READY,
            'name': getattr(self.device, 'name', None) or self.names[0],
            'device_id': getattr(self.device, 'address', None),
            'error': self.last_error,
            'last_failure': self.last_failure,
        }

    def _notify(self, _sender, data: bytearray) -> None:
        raw = bytes(data)
        if not raw:
            return
        if raw[0] & 0x80:
            if self.pushes.full():
                # Se tira el mas viejo: el aviso nuevo es el que importa.
                with contextlib.suppress(asyncio.QueueEmpty):
                    self.pushes.get_nowait()
            self.pushes.put_nowait(raw)
        else:
            self.responses.put_nowait(raw)

    async def discover(self):
        self.set_state(SCANNING)
        env_key = f'MESHCORE_WIO{self.idx}_ADDRESS'
        addr = os.getenv(env_key, '').strip() or _known_addresses().get(str(self.idx), '')
        if addr:
            with contextlib.suppress(Exception):
                found = await BleakScanner.find_device_by_address(addr, timeout=SCAN_SECONDS)
                if found:
                    return found
        wanted = {name.lower() for name in self.names}
        for dev in await BleakScanner.discover(timeout=SCAN_SECONDS):
            name = (dev.name or '').strip().lower()
            if name in wanted or any(name.startswith(x.lower()) for x in self.names):
                return dev
        # Si Windows ya tiene el nodo conectado, este deja de anunciarse y
        # ningun escaneo lo ve: por direccion WinRT lo alcanza igual.
        if addr:
            return BLEDevice(addr, self.names[0], None)
        return None

    async def connect(self) -> None:
        async with self.lock:
            if self.connected:
                return
            device = await self.discover()
            if not device:
                self.set_state(OFFLINE, 'no encontrado en el escaneo')
                raise RuntimeError(f'{self.label} no encontrado')
            self.set_state(CONNECTING)
            log.info('%s: %s (%s)', self.label, device.name, getattr(device, 'address', '?'))
            if PAIR:
                try:
                    # Sin tope, un pair_async de Windows que no termina dejaba
                    # este lock cogido para siempre y el relay entero colgado
                    # (socket del gateway en CLOSE_WAIT, 08/10/2026).
                    await asyncio.wait_for(
                        pair_with_pin(device.address, self.label, forzar=self.rehacer_vinculo),
                        PAIR_TIMEOUT)
                    self.pair_fallido = False
                except Exception as exc:
                    self.pair_fallido = True
                    log.warning('%s: emparejamiento con PIN fallido: %s', self.label, exc or 'sin respuesta')
                self.rehacer_vinculo = False
            client = BleakClient(device, timeout=30, pair=False)
            await client.connect()
            try:
                await client.start_notify(UART_NOTIFY, self._notify)
            except Exception as exc:
                with contextlib.suppress(Exception):
                    await client.disconnect()
                # Sin UART o sin autenticacion con un vinculo "bueno" segun
                # Windows: el nodo ha olvidado el suyo. El siguiente intento lo rehace.
                texto = str(exc)
                if 'not found' in texto or 'Authentication' in texto:
                    self.rehacer_vinculo = True
                raise
            self.client, self.device = client, device
            self.last_failure = ''
            _remember_address(self.idx, device.address)
            self.set_state(CONNECTED)

    async def disconnect(self) -> None:
        # Con el lock: si no, el bucle de reconexion cierra el cliente mientras
        # hay un comando escrito y esperando respuesta.
        async with self.lock:
            client, self.client, self.device = self.client, None, None
            if client:
                with contextlib.suppress(Exception):
                    await client.disconnect()
            if self.state != OFFLINE:
                self.set_state(OFFLINE)

    async def command(self, frame: bytes, timeout: float = 7.0, stream_until: set[int] | None = None):
        """Envia un comando. Sin stream_until, espera UNA respuesta y la devuelve.

        Con stream_until, GET_CONTACTS y similares contestan con varias tramas
        seguidas (START, N x dato, END) en vez de una sola: se acumulan todas
        hasta ver una trama cuyo primer byte esta en stream_until, y se
        devuelve la lista completa (incluida esa ultima).
        """
        async with self.lock:
            if not self.connected:
                raise RuntimeError(f'{self.label} no conectado ({self.state})')
            stale = 0
            while not self.responses.empty():
                with contextlib.suppress(asyncio.QueueEmpty):
                    self.responses.get_nowait()
                    stale += 1
            if stale:
                log.warning('%s: descartadas %d respuestas huerfanas antes del comando',
                            self.label, stale)
            await self.client.write_gatt_char(UART_WRITE, frame, response=False)
            loop = asyncio.get_running_loop()
            if stream_until is None:
                try:
                    reply = await asyncio.wait_for(self.responses.get(), timeout)
                except asyncio.TimeoutError:
                    self.set_state(ERROR, 'timeout esperando respuesta')
                    raise
                if self.state in (CONNECTED, ERROR, READY):
                    self.set_state(READY)
                return reply
            frames: list[bytes] = []
            deadline = loop.time() + timeout
            while True:
                remaining = deadline - loop.time()
                if remaining <= 0:
                    self.set_state(ERROR, 'timeout esperando respuesta (stream)')
                    raise asyncio.TimeoutError()
                try:
                    reply = await asyncio.wait_for(self.responses.get(), remaining)
                except asyncio.TimeoutError:
                    self.set_state(ERROR, 'timeout esperando respuesta (stream)')
                    raise
                frames.append(reply)
                if reply and reply[0] in stream_until:
                    break
                if len(frames) > 1000:
                    break  # cordura: un nodo hablando sin parar no debe colgar esto para siempre
            # Tambien desde ERROR: un timeout suelto dejaba el error pegado
            # (connected=False en el panel) aunque el enlace siguiera vivo.
            if self.state in (CONNECTED, ERROR, READY):
                self.set_state(READY)
            return frames


async def pump_pushes(wio: Wio, ws, stop: asyncio.Event) -> None:
    """Reenvia al gateway los avisos espontaneos del nodo."""
    while not stop.is_set():
        raw = await wio.pushes.get()
        with contextlib.suppress(Exception):
            await ws.send_json({'op': 'push', 'idx': wio.idx, 'frame': b64(raw)})


async def keep(wio: Wio, stop: asyncio.Event) -> None:
    """Mantiene el enlace vivo sin pisar comandos en vuelo."""
    first = True
    while not stop.is_set():
        motivo = ''
        try:
            if not first:
                wio.set_state(RECONNECTING)
            await wio.connect()
            first = False
            wio.fallos = 0
            while wio.connected and not stop.is_set():
                await asyncio.sleep(2)
            if not stop.is_set():
                log.info('%s: enlace caido', wio.label)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            motivo = str(exc) or type(exc).__name__
            # Por direccion un nodo apagado no da "no encontrado": da un timeout
            # sin texto. Se traduce a algo que el panel pueda ensenar.
            if getattr(wio, 'pair_fallido', False):
                # Visto el 17/10: el PIN no se acepta y luego todo es timeout.
                motivo = 'no empareja con el PIN: quítalo del Bluetooth de Windows y vuelve a emparejarlo'
            elif isinstance(exc, (asyncio.TimeoutError, TimeoutError)) or 'Timeout' in motivo:
                motivo = 'no responde: ¿apagado o sin batería?'
            elif 'not powered on' in motivo or 'POWERED_OFF' in motivo:
                motivo = 'el Bluetooth del PC está apagado'
            elif 'was not found' in motivo and '6e4000' in motivo:
                # Visto el 19/10: conecta pero no aparece el servicio UART de MeshCore
                # (Windows guarda los servicios viejos, o el WIO está a medio arrancar).
                motivo = 'conecta pero no da el servicio de MeshCore: apágalo y enciéndelo; si sigue, quítalo del Bluetooth de Windows y vuelve a emparejarlo'
            elif 'No Bluetooth adapters' in motivo or 'NO_BLUETOOTH' in motivo:
                motivo = 'el PC no tiene adaptador Bluetooth'
            wio.set_state(ERROR, motivo)
        await wio.disconnect()
        # disconnect() deja OFFLINE sin motivo; se conserva el del fallo para
        # que el panel lo vea en vez de un "connecting" eterno.
        if motivo:
            wio.last_failure = motivo
            wio.set_state(OFFLINE, motivo)
            wio.fallos += 1
        # Un nodo que no aparece (un WIO apagado o sin
        # bateria) se buscaba cada 9 s: 6 s de escaneo cada vez en la misma
        # radio que usan los WIO conectados. Ahora la espera se dobla hasta
        # BACKOFF_MAX, y un comando del panel para ese nodo la corta.
        espera = min(RETRY * 2 ** min(wio.fallos, 10), BACKOFF_MAX) if wio.fallos > 1 else RETRY
        wio.despertar.clear()
        with contextlib.suppress(asyncio.TimeoutError):
            await asyncio.wait_for(wio.despertar.wait(), espera)


async def session(wios: dict[int, Wio], stop: asyncio.Event, http: aiohttp.ClientSession) -> None:
    async with http.ws_connect(GATEWAY_WS, headers={'X-MeshCore-Token': TOKEN}, heartbeat=20) as ws:
        log.info('gateway conectado: %s', GATEWAY_WS)

        def announce(idx: int) -> None:
            with contextlib.suppress(Exception):
                asyncio.create_task(ws.send_json({'op': 'status', 'idx': idx,
                                                  'status': wios[idx].status()}))

        for wio in wios.values():
            wio.on_change = announce
            # Lo acumulado sin gateway ya es viejo: el panel no lo quiere.
            while not wio.pushes.empty():
                wio.pushes.get_nowait()

        async def atender(req: dict) -> None:
            # Cada comando en su task: un WIO reconectando (lock cogido) ya no
            # bloquea los comandos del otro WIO.
            idx = int(req['idx'])
            rid = str(req['id'])
            stream_until = req.get('stream_until')
            try:
                if idx not in wios:
                    raise RuntimeError('WIO%s no configurado en este relay' % idx)
                if not wios[idx].connected:
                    wios[idx].despertar.set()
                if stream_until:
                    frames = await wios[idx].command(
                        unb64(req['frame']), timeout=15, stream_until=set(stream_until))
                    resp = {'op': 'reply', 'id': rid, 'ok': True, 'frames': [b64(f) for f in frames]}
                else:
                    out = await wios[idx].command(unb64(req['frame']))
                    resp = {'op': 'reply', 'id': rid, 'ok': True, 'frame': b64(out)}
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                log.info('WIO%s comando fallido: %s', idx, exc)
                resp = {'op': 'reply', 'id': rid, 'ok': False, 'error': str(exc)}
            with contextlib.suppress(Exception):
                await ws.send_json(resp)

        en_vuelo: set[asyncio.Task] = set()
        tasks = [asyncio.create_task(keep(w, stop)) for w in wios.values()]
        tasks += [asyncio.create_task(pump_pushes(w, ws, stop)) for w in wios.values()]
        await ws.send_json({'op': 'hello', 'wios': [w.status() for w in wios.values()]})
        try:
            async for msg in ws:
                if msg.type is not aiohttp.WSMsgType.TEXT:
                    continue
                req = json.loads(msg.data)
                if req.get('op') != 'cmd':
                    continue
                t = asyncio.create_task(atender(req))
                en_vuelo.add(t)
                t.add_done_callback(en_vuelo.discard)
        finally:
            for wio in wios.values():
                wio.on_change = None
            tasks += list(en_vuelo)
            for task in tasks:
                task.cancel()
            # Con tope: una llamada de WinRT que ignora la cancelacion (o un
            # lock cogido por ella) colgaba aqui y el relay no volvia a
            # conectar con el gateway nunca.
            await asyncio.wait(tasks, timeout=10)
            for wio in wios.values():
                with contextlib.suppress(Exception):
                    await asyncio.wait_for(wio.disconnect(), 5)


async def main() -> None:
    if not TOKEN:
        raise SystemExit('Falta MESHCORE_BLE_TOKEN')
    # MESHCORE_WIO2_NAME='' (vacío) = solo un companion: ni se busca el segundo.
    wios = {idx: Wio(idx, names) for idx, names in NAMES.items() if names[0]}
    stop = asyncio.Event()
    async with aiohttp.ClientSession() as http:
        while not stop.is_set():
            try:
                await session(wios, stop, http)
            except Exception as exc:
                log.warning('gateway: %s', exc)
            await asyncio.sleep(RETRY)


if __name__ == '__main__':
    with contextlib.suppress(KeyboardInterrupt):
        asyncio.run(main())
