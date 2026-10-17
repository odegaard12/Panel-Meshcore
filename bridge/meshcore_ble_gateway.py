#!/usr/bin/env python3
"""Gateway MeshCore, modo relay-only.

La Raspberry expone la API HTTP/WebSocket. Un ordenador cercano es el dueno
fisico del enlace BLE con WIO1/WIO2 y se engancha aqui como relay. La Pi no
escanea ni abre BLE en este modo, evitando la contienda con BlueZ.

Autenticacion: este proceso escucha en 0.0.0.0:8780 y valida X-MeshCore-Token.
La frontera real de cara al usuario es nginx (TLS + auth basic); el token solo
impide que alguien llame al gateway saltandose nginx.
"""
from __future__ import annotations

import asyncio
import binascii
import collections
import base64
import contextlib
import json
import math
import os
import re
import secrets
import time
from pathlib import Path

import aiohttp
from aiohttp import web

import meshcore_auth as auth_mod
import meshcore_repeater as rep

# Sub-banda g3 de ERC/REC 70-03 (CNAF UN-30 en Espana): 869,40-869,65 MHz,
# 500 mW PRA y 10 % de ciclo de trabajo. Con 62,5 kHz de ancho, el centro
# tiene que quedar a 31,25 kHz de cada borde.
BANDA_MHZ = (869.40 + 0.03125, 869.65 - 0.03125)
TX_MAX_DBM = 22  # tope del SX1262 del RAK4630 y de los WIO


def politica_cli(cmd: str, confirmed: bool):
    """None si se puede mandar; si no, (codigo HTTP, motivo)."""
    c = cmd.strip()
    if not c:
        return 400, 'comando vacio'
    partes = c.split()
    if c.startswith(('set af ', 'set dutycycle ', 'set tx ', 'set freq ')) and len(partes) > 2:
        # float() de Python acepta '1_0' (=10), 'inf' o '1e3', pero el atof
        # del firmware lee '1_0' como 1 (50 % de ciclo): solo decimales simples.
        if not re.fullmatch(r'-?\d+(\.\d+)?', partes[2]):
            return 400, f'valor no valido: {partes[2]}'
        if not math.isfinite(float(partes[2])):
            return 400, f'valor no valido: {partes[2]}'
    # Los dos ajustes que limitan el ciclo de trabajo: se dejan pasar solo si
    # lo dejan dentro del 10 % legal (duty = 1/(1+af); af 9 = 10 %).
    if c.startswith(('set af ', 'set dutycycle ')):
        try:
            valor = float(partes[2])
        except (IndexError, ValueError):
            return 400, 'falta el valor numerico'
        legal = valor >= 9 if partes[1] == 'af' else 0 < valor <= 10
        if not legal:
            return 403, (f'{c} dejaria el ciclo de trabajo por encima del 10 % legal '
                         '(usa af >= 9 o dutycycle <= 10)')
        return None if confirmed else (409, f'CONFIRMAR: {c} - cambia el ciclo de trabajo del repetidor')
    info = rep.classify(c)
    if info is None:
        # Las consultas de solo lectura fuera del catalogo (get radio,
        # get name, get repeat...) no cambian nada en el nodo.
        if c.startswith('get '):
            return None
        return 403, f'comando no permitido desde el panel: {c!r} (fuera del catalogo)'
    if info.risk == rep.BLOCKED:
        return 403, f'bloqueado desde el panel: {info.cli} ({info.note})'
    if info.cli == 'set tx':
        try:
            dbm = float(partes[2])
        except (IndexError, ValueError):
            return 400, 'set tx necesita la potencia en dBm, p. ej. set tx 20'
        if dbm > TX_MAX_DBM:
            return 403, f'set tx {dbm:g} dBm supera el maximo del equipo ({TX_MAX_DBM} dBm)'
    if info.cli == 'set freq':
        try:
            mhz = float(partes[2])
        except (IndexError, ValueError):
            return 400, 'set freq necesita la frecuencia en MHz'
        if not BANDA_MHZ[0] <= mhz <= BANDA_MHZ[1]:
            return 403, (f'{mhz} MHz se sale de la sub-banda 869,40-869,65 MHz '
                         '(la unica con 500 mW y 10 % de ciclo en EU868)')
    if info.risk == rep.CONFIRM and not confirmed:
        return 409, f'CONFIRMAR: {info.cli} - {info.note or info.label}'
    return None

PANEL_VERSION = '1.12.1'
PORT = int(os.getenv('MESHCORE_BLE_GATEWAY_PORT', '8780'))
# 0.0.0.0 por defecto porque el relay del PC entra por la LAN. Si el relay
# corre en la propia Pi, MESHCORE_BIND=127.0.0.1 deja el puerto solo para nginx.
BIND = os.getenv('MESHCORE_BIND', '0.0.0.0')

# Opcodes que el panel manda por /command (meshcore-ble-gateway.js y
# dashboard.html). Lo demas (reset de fabrica, cambiar clave, radio...) no
# tiene por que pasar por aqui: 403.
COMMAND_OPCODES = {
    0x01,  # APP_START
    0x02,  # SEND_TXT_MSG (solo PLAIN y CLI_DATA, ver command())
    0x03,  # SEND_CHANNEL_TXT_MSG
    0x04,  # GET_CONTACTS
    0x0A,  # SYNC_NEXT_MESSAGE
    0x14,  # GET_BATTERY
    0x17,  # EXPORT_PRIVATE_KEY (copia de seguridad desde el panel)
}
TOKEN_FILE = Path(os.getenv('MESHCORE_BLE_TOKEN_FILE', str(Path.home() / '.meshcore-ble-token')))
TOKEN = os.getenv('MESHCORE_BLE_TOKEN', '')

# Tramas push que el nodo manda por su cuenta (bit 0x80). La mas importante es
# MESSAGES_WAITING: el panel la usa para saber que tiene que vaciar la cola.
PUSH_MESSAGES_WAITING = 0x83
MAX_PUSH_HISTORY = 32


def token() -> str:
    global TOKEN
    if TOKEN:
        return TOKEN
    if TOKEN_FILE.exists():
        TOKEN = TOKEN_FILE.read_text().strip()
    if not TOKEN:
        TOKEN = secrets.token_urlsafe(32)
        TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
        # 0o600 desde la creacion: con write+chmod habia un instante legible por todos.
        fd = os.open(TOKEN_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, 'w') as fh:
            fh.write(TOKEN + '\n')
    return TOKEN


def _privado(path: Path) -> None:
    # El registro RF y el historico dicen cuando y que oye la radio: solo el dueno.
    with contextlib.suppress(OSError):
        path.chmod(0o600)


def auth(req) -> bool:
    # Solo por cabecera: en la URL (?token=) acabaria en logs e historiales.
    supplied = req.headers.get('X-MeshCore-Token', '')
    return secrets.compare_digest(supplied, token())


def b64(raw: bytes) -> str:
    return base64.b64encode(raw).decode()


def unb64(text: str) -> bytes:
    return base64.b64decode(text.encode(), validate=True)


# Canales relay: los dos WIO. El repetidor no anuncia Bluetooth: se gestiona
# por LoRa a traves de un WIO (login + CLI remoto, peticiones binarias).
CHANNELS = (1, 2)


# Push notifications relevantes para el login/CLI remotos (PacketType de
# meshcore_py): LOGIN_SUCCESS/LOGIN_FAILED confirman si la contraseña vale.
# La respuesta real de un comando CLI remoto llega por el canal normal de
# mensajes (SYNC_NEXT_MSG), no por aqui.
RX_LOG_MAX = 4000
# El registro RF vivia solo en memoria: cada reinicio del gateway lo vaciaba.
RX_LOG_FILE = Path(os.getenv('MESHCORE_RXLOG_FILE', str(Path.home() / '.meshcore-rxlog.jsonl')))
PUSH_LOG_RX_DATA = 0x88
PUSH_LOGIN_SUCCESS = 0x85
PUSH_LOGIN_FAILED = 0x86


async def cuerpo(req) -> dict:
    """Cuerpo JSON de la peticion; 400 si no es un objeto JSON (antes: 500)."""
    try:
        body = await req.json()
    except (ValueError, UnicodeDecodeError):
        raise web.HTTPBadRequest(text='el cuerpo no es JSON valido')
    if not isinstance(body, dict):
        raise web.HTTPBadRequest(text='el cuerpo tiene que ser un objeto JSON')
    return body


def trama(texto) -> bytes:
    try:
        return unb64(str(texto))
    except (binascii.Error, ValueError):
        raise web.HTTPBadRequest(text='frame no es base64 valido')


def hexpad(pubkey_hex: str, length: int) -> bytes:
    try:
        raw = bytes.fromhex(pubkey_hex)
    except ValueError:
        raise ValueError('pubkey invalida')
    if len(raw) < length:
        raw = raw + bytes(length - len(raw))
    return raw[:length]


def blank(idx) -> dict:
    name = f'WIO{idx}'
    return {'idx': idx, 'state': 'offline', 'connected': False, 'ready': False,
            'name': name, 'transport': 'none', 'error': ''}


class RelayGateway:
    def __init__(self):
        self.ws = None
        self.status = {k: blank(k) for k in CHANNELS}
        self.pending: dict[str, asyncio.Future] = {}
        self.lock = asyncio.Lock()
        # contador monotono por canal: el panel compara con el que vio la ultima
        # vez para saber si hay avisos nuevos sin tener que sondear a ciegas.
        self.push_seq = {k: 0 for k in CHANNELS}
        self.messages_waiting = {k: False for k in CHANNELS}
        self.last_push_at = {k: 0.0 for k in CHANNELS}
        self.last_push_type = {k: None for k in CHANNELS}
        # Las respuestas a peticiones binarias (estado/telemetria de un nodo
        # remoto) llegan como push, no como respuesta al comando: hay que
        # guardar la trama entera, no solo su tipo, para poder parsearla.
        self.last_push_by_type = {k: {} for k in CHANNELS}
        # Cada paquete que el nodo oye por radio llega como push 0x88 con su
        # SNR y RSSI. Es el unico sitio donde hay medidas RF por paquete, asi
        # que se acumulan aqui: el panel solo veria las de su propia sesion.
        self.rx_log = collections.deque(maxlen=RX_LOG_MAX)
        self._rx_sin_recortar = 0
        self._cargar_rx_log()
        self.relay_since = 0.0

    def _cargar_rx_log(self):
        with contextlib.suppress(Exception):
            for linea in RX_LOG_FILE.read_text().splitlines():
                with contextlib.suppress(Exception):
                    self.rx_log.append(json.loads(linea))
            self._reescribir_rx_log()

    def _reescribir_rx_log(self):
        # Se recorta al maximo de la deque; se hace al arrancar y cada
        # RX_LOG_MAX paquetes, no en cada uno.
        with contextlib.suppress(Exception):
            RX_LOG_FILE.write_text(''.join(json.dumps(m, separators=(',', ':')) + '\n' for m in self.rx_log))
            _privado(RX_LOG_FILE)
        self._rx_sin_recortar = 0

    def _guardar_rx(self, m: dict):
        self.rx_log.append(m)
        with contextlib.suppress(Exception):
            with RX_LOG_FILE.open('a') as fh:
                fh.write(json.dumps(m, separators=(',', ':')) + '\n')
        self._rx_sin_recortar += 1
        if self._rx_sin_recortar >= RX_LOG_MAX:
            self._reescribir_rx_log()

    async def attach(self, ws):
        async with self.lock:
            old, self.ws = self.ws, ws
            self.relay_since = time.time()
            if old and old is not ws:
                try:
                    await old.close(code=1012, message=b'new relay')
                except Exception:
                    pass

    @staticmethod
    def _key(raw_idx):
        return int(raw_idx)

    async def detach(self, ws):
        async with self.lock:
            if self.ws is not ws:
                return
            self.ws = None
            self.relay_since = 0.0
            for idx in CHANNELS:
                name = self.status[idx].get('name') or blank(idx)['name']
                self.status[idx] = {**blank(idx), 'name': name, 'error': 'relay desconectado'}
            for fut in list(self.pending.values()):
                if not fut.done():
                    fut.set_exception(RuntimeError('relay desconectado'))
            self.pending.clear()

    async def receive(self, msg: dict):
        op = msg.get('op')
        if op == 'hello':
            for entry in msg.get('wios', []):
                key = self._key(entry['idx'])
                self.status[key] = {**entry, 'idx': key, 'transport': 'relay'}
            return
        if op == 'status':
            key = self._key(msg['idx'])
            self.status[key] = {**msg['status'], 'idx': key, 'transport': 'relay'}
            return
        if op == 'push':
            idx = self._key(msg['idx'])
            raw = unb64(msg.get('frame', ''))
            # push_seq avisa al panel de que vacie la cola de mensajes: con
            # cada paquete oido (0x88) la vaciaba sin parar y para nada.
            if not raw or raw[0] != PUSH_LOG_RX_DATA:
                self.push_seq[idx] += 1
            self.last_push_at[idx] = time.time()
            self.last_push_type[idx] = raw[0] if raw else None
            if raw:
                self.last_push_by_type[idx][raw[0]] = {'frame': b64(raw), 'at': time.time()}
            if raw and raw[0] == PUSH_LOG_RX_DATA and len(raw) >= 3:
                snr = int.from_bytes(raw[1:2], 'little', signed=True) / 4
                rssi = int.from_bytes(raw[2:3], 'little', signed=True)
                self._guardar_rx({'at': round(time.time(), 1), 'idx': idx,
                                  'snr': snr, 'rssi': rssi, 'len': len(raw) - 3})
            if raw and raw[0] == PUSH_MESSAGES_WAITING:
                self.messages_waiting[idx] = True
            return
        if op == 'reply':
            fut = self.pending.get(str(msg.get('id')))
            if fut and not fut.done():
                if msg.get('ok'):
                    if 'frames' in msg:
                        fut.set_result([unb64(f) for f in msg.get('frames', [])])
                    else:
                        fut.set_result(unb64(msg.get('frame', '')))
                else:
                    fut.set_exception(RuntimeError(str(msg.get('error', 'relay error'))))

    async def command(self, idx, frame: bytes, timeout: float = 8, stream_until: set[int] | None = None):
        if not self.ws:
            raise RuntimeError('relay BLE no conectado')
        rid = secrets.token_hex(8)
        fut = asyncio.get_running_loop().create_future()
        self.pending[rid] = fut
        msg = {'op': 'cmd', 'id': rid, 'idx': idx, 'frame': b64(frame)}
        if stream_until:
            msg['stream_until'] = list(stream_until)
        try:
            # Dentro del try: si el envio falla, el futuro no se queda en pending.
            await self.ws.send_json(msg)
            return await asyncio.wait_for(fut, timeout)
        finally:
            self.pending.pop(rid, None)

    def wio(self, idx: int) -> dict:
        return {**self.status[idx],
                'push_seq': self.push_seq[idx],
                'messages_waiting': self.messages_waiting[idx],
                'last_push_at': self.last_push_at[idx],
                'last_push_type': self.last_push_type[idx]}

    def snapshot(self) -> dict:
        return {'ok': True, 'relay': bool(self.ws), 'relay_since': self.relay_since,
                'wios': [self.wio(1), self.wio(2)]}


g = RelayGateway()


def parse_status_bytes(data: bytes, offset: int = 0) -> dict:
    """Contadores de un repetidor (mismo layout que parse_status de meshcore_py)."""
    def u16(o): return int.from_bytes(data[offset+o:offset+o+2], 'little')
    def i16(o): return int.from_bytes(data[offset+o:offset+o+2], 'little', signed=True)
    def u32(o): return int.from_bytes(data[offset+o:offset+o+4], 'little')
    uptime, air_tx = u32(20), u32(16)
    return {
        'bat_mv': u16(0), 'tx_queue': u16(2), 'noise_floor': i16(4), 'last_rssi': i16(6),
        'nb_recv': u32(8), 'nb_sent': u32(12), 'airtime_tx': air_tx, 'uptime': uptime,
        'sent_flood': u32(24), 'sent_direct': u32(28),
        'recv_flood': u32(32), 'recv_direct': u32(36),
        'last_snr': i16(42) / 4, 'dups_direct': u16(44), 'dups_flood': u16(46),
        'airtime_rx': u32(48),
        'duty_cycle': (air_tx / uptime * 100) if uptime else None,
    }


class Monitor:
    """Serie temporal del repetidor: la Pi esta 24/7, el movil no.

    Cada SAMPLE_EVERY pide STATUS por LoRa al objetivo aprendido desde el panel
    y anade una linea al JSONL. Asi hay historico de bateria y duty cycle sin
    depender de que alguien tenga el panel abierto.
    """
    SAMPLE_EVERY = float(os.getenv('MESHCORE_MONITOR_SECONDS', '900'))
    MAX_LINES = 20000  # ~7 meses a 15 min; se recorta por el principio

    def __init__(self):
        self.path = Path(os.getenv('MESHCORE_HISTORY_FILE', str(Path.home() / '.meshcore-history.jsonl')))
        self.target_file = Path(str(self.path) + '.target')
        self.target = None  # {'idx': 1|2, 'pubkey': hex}
        self.last_sample_at = 0.0
        self.last_error = ''
        if self.target_file.exists():
            with contextlib.suppress(Exception):
                self.target = json.loads(self.target_file.read_text())

    def remember(self, idx, pubkey_hex: str):
        pubkey_hex = (pubkey_hex or '').strip()
        if len(pubkey_hex) < 12:
            return
        new = {'idx': idx, 'pubkey': pubkey_hex}
        if new != self.target:
            self.target = new
            with contextlib.suppress(Exception):
                self.target_file.write_text(json.dumps(new))

    def append(self, sample: dict):
        line = json.dumps(sample, separators=(',', ':'))
        with contextlib.suppress(Exception):
            with self.path.open('a') as fh:
                fh.write(line + '\n')
            _privado(self.path)
            self._trim()

    def _trim(self):
        with contextlib.suppress(Exception):
            lines = self.path.read_text().splitlines()
            if len(lines) > self.MAX_LINES:
                self.path.write_text('\n'.join(lines[-self.MAX_LINES:]) + '\n')

    def read(self, limit: int = 500) -> list:
        if not self.path.exists():
            return []
        out = []
        with contextlib.suppress(Exception):
            for line in self.path.read_text().splitlines()[-limit:]:
                with contextlib.suppress(Exception):
                    out.append(json.loads(line))
        return out

    async def sample_once(self):
        if not self.target or not g.ws:
            return
        pubkey = self.target['pubkey']
        # El repetidor es el mismo lo pregunte quien lo pregunte: si el WIO
        # aprendido esta caido se usa el otro, en vez de dejar el historico
        # parado sin avisar (paso del 21 al 24/09 con WIO2 fuera).
        preferido = self.target['idx']
        candidatos = [preferido] + [i for i in (1, 2) if i != preferido]
        idx = next((i for i in candidatos if g.status.get(i, {}).get('connected')), None)
        if idx is None:
            self.last_error = 'ningun WIO conectado para preguntar al repetidor'
            return
        # Tras reiniciarse (p. ej. sin bateria) el WIO no manda avisos hasta el
        # saludo APP_START, y la respuesta del repetidor llega como aviso. Antes
        # solo saludaba el panel: sin nadie mirando, el historico se paraba.
        with contextlib.suppress(Exception):
            await g.command(idx, bytes([1, 3, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20]) + b'mccli')
        seen_before = g.last_push_by_type[idx].get(0x8C, {}).get('at', 0)
        frame = bytes([0x32]) + hexpad(pubkey, 32) + bytes([1])
        try:
            enviado = await g.command(idx, frame)
        except Exception as exc:
            # TimeoutError no trae texto: sin esto el panel veia un error vacio.
            self.last_error = str(exc) or 'el WIO no contesta (timeout)'
            return
        # RESP_SENT: 6, flood, tag(4), timeout(4). Sin tag no se puede casar.
        tag = enviado[2:6] if enviado and enviado[0] == 6 and len(enviado) >= 6 else None
        # La respuesta llega como push: se espera a que aparezca una nueva.
        for _ in range(20):
            await asyncio.sleep(1.5)
            entry = g.last_push_by_type[idx].get(0x8C)
            if entry and entry['at'] > seen_before:
                raw = unb64(entry['frame'])
                if tag is not None and raw[2:6] != tag:
                    continue
                if len(raw) >= 58:
                    sample = parse_status_bytes(raw[6:])
                    # Recien reiniciado el repetidor, airtime/uptime da duties
                    # absurdos: la muestra vale (bateria) pero sin duty. El
                    # panel ya ignora duty_cycle null.
                    if sample['uptime'] < 3600:
                        sample['duty_cycle'] = None
                    sample['at'] = time.time()
                    sample['pubkey'] = pubkey
                    self.append(sample)
                    self.last_sample_at = sample['at']
                    self.last_error = ''
                return
        self.last_error = 'sin respuesta del repetidor'

    async def loop(self):
        # Primera muestra al minuto de arrancar: esperando los 15 min enteros,
        # cada reinicio (cada despliegue) retrasaba la medida y un día con
        # varios despliegues se quedó 23 h sin medir el repetidor.
        await asyncio.sleep(min(60.0, self.SAMPLE_EVERY))
        while True:
            with contextlib.suppress(Exception):
                await self.sample_once()
            with contextlib.suppress(Exception):
                await avisos.revisar(self.read(1))
            # Si falló (p. ej. tras arrancar aún no hay WIO), reintenta al minuto.
            await asyncio.sleep(min(60.0, self.SAMPLE_EVERY) if self.last_error else self.SAMPLE_EVERY)


def problemas(ultima: dict | None, ahora: float, bat_min_mv: int, sin_datos_s: float) -> dict:
    """Qué va mal según la última muestra del repetidor: {clave: texto}."""
    if not ultima:
        return {}
    out = {}
    edad = ahora - float(ultima.get('at') or 0)
    if sin_datos_s > 0 and edad > sin_datos_s:  # 0 = aviso apagado
        out['sin_datos'] = 'Sin datos del repetidor hace %d h (¿PC o WIO apagados?)' % (edad // 3600)
    mv = ultima.get('bat_mv')
    if isinstance(mv, (int, float)) and 0 < mv < bat_min_mv:
        out['bateria'] = 'Batería del repetidor baja: %.2f V (¿USB de la regleta apagado?)' % (mv / 1000)
    return out


class Avisos:
    """Avisa por ntfy al empezar y al acabar cada problema, no en cada muestra.

    Apagado si no hay MESHCORE_NTFY_URL (URL completa del tema).
    """

    def __init__(self):
        self.url = os.getenv('MESHCORE_NTFY_URL', '')
        self.token = os.getenv('MESHCORE_NTFY_TOKEN', '')
        self.bat_min = int(os.getenv('MESHCORE_ALERT_BAT_MV', '3800'))
        self.sin_datos = float(os.getenv('MESHCORE_ALERT_STALE_HOURS', '3')) * 3600
        # Persistido: sin esto cada reinicio (cada despliegue) repetía el aviso.
        self.estado = Path(os.getenv('MESHCORE_HISTORY_FILE', str(Path.home() / '.meshcore-history.jsonl')) + '.avisos')
        self.activos: dict = {}
        with contextlib.suppress(Exception):
            self.activos = json.loads(self.estado.read_text())

    async def revisar(self, muestras: list):
        if not self.url:
            return
        ahora_mal = problemas(muestras[-1] if muestras else None, time.time(), self.bat_min, self.sin_datos)
        for clave, texto in ahora_mal.items():
            if clave not in self.activos:
                await self._enviar(texto, 'warning')
        for clave in set(self.activos) - set(ahora_mal):
            await self._enviar('Resuelto: ' + self.activos[clave], 'white_check_mark')
        if ahora_mal != self.activos:
            with contextlib.suppress(Exception):
                self.estado.write_text(json.dumps(ahora_mal))
        self.activos = ahora_mal

    async def _enviar(self, texto: str, etiqueta: str):
        headers = {'Title': 'Panel MeshCore', 'Tags': etiqueta}
        if self.token:
            headers['Authorization'] = 'Bearer ' + self.token
        async with aiohttp.ClientSession() as s:
            await s.post(self.url, data=texto.encode(), headers=headers, timeout=aiohttp.ClientTimeout(total=15))


avisos = Avisos()


monitor = Monitor()


async def guard(req):
    if not auth(req):
        raise web.HTTPUnauthorized(text='bad token')


async def status(req):
    await guard(req)
    return web.json_response(g.snapshot())


async def connect(req):
    await guard(req)
    idx = int(req.match_info['idx'])
    if idx not in (1, 2):
        raise web.HTTPNotFound()
    # APP_START hace de handshake y de sonda: si contesta, el enlace sirve.
    frame = bytes([1, 3, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20]) + b'mccli'
    try:
        await g.command(idx, frame)
    except Exception as exc:
        raise web.HTTPServiceUnavailable(text=str(exc))
    # No se fuerza connected=True a mano: se devuelve lo que el relay reporta,
    # que es la unica fuente de verdad del estado del enlace.
    return web.json_response(g.wio(idx))


async def command(req):
    await guard(req)
    idx = int(req.match_info['idx'])
    if idx not in (1, 2):
        raise web.HTTPNotFound()
    body = await cuerpo(req)
    frame = trama(body.get('frame', ''))
    if not frame or frame[0] not in COMMAND_OPCODES:
        raise web.HTTPForbidden(text=f'opcode no permitido por /command: {frame[0] if frame else None}')
    if frame[0] == 0x17 and os.getenv('MESHCORE_ALLOW_KEY_EXPORT') != '1':
        # Con solo la cookie (o el token) se podía sacar la clave privada del WIO.
        raise web.HTTPForbidden(text='exportar la clave privada está desactivado (MESHCORE_ALLOW_KEY_EXPORT=1 en el gateway)')
    if frame[0] == 2 and (len(frame) < 2 or frame[1] not in (0, 1)):
        # txt_type 0 = texto normal, 1 = CLI_DATA; el resto no lo usa el panel.
        raise web.HTTPForbidden(text='tipo de mensaje no permitido')
    if frame[0] == 2 and frame[1] == 1:
        # Formato: 2, txt_type, intento, ts(4), destino(6), texto.
        veto = politica_cli(frame[13:].decode('utf-8', 'replace'), bool(body.get('confirmed')))
        if veto:
            code, motivo = veto
            error = {400: web.HTTPBadRequest, 403: web.HTTPForbidden, 409: web.HTTPConflict}[code]
            raise error(text=motivo)
    try:
        out = await g.command(idx, frame)
    except Exception as exc:
        raise web.HTTPServiceUnavailable(text=str(exc))
    # Cada comando servido limpia el aviso: el panel acaba de hablar con el nodo.
    g.messages_waiting[idx] = False
    return web.json_response({'ok': True, 'frame': b64(out), **g.wio(idx)})


async def contacts(req):
    await guard(req)
    idx = int(req.match_info['idx'])
    if idx not in (1, 2):
        raise web.HTTPNotFound()
    # GET_CONTACTS (0x04) contesta con START, N x CONTACT, END: se para en END (tipo 4).
    try:
        frames = await g.command(idx, bytes([0x04]), timeout=15, stream_until={4})
    except Exception as exc:
        raise web.HTTPServiceUnavailable(text=str(exc))
    return web.json_response({'ok': True, 'frames': [b64(f) for f in frames]})


async def wio_login(req):
    """SEND_LOGIN (26): manda la contraseña de admin a un contacto remoto (el
    RAK) por LoRa, a traves de este WIO. Asi es como la app oficial de
    MeshCore gestiona un repetidor sin tocar su Bluetooth: nunca hace falta
    emparejar el RAK, solo tener un companion (un WIO) ya conectado.
    """
    await guard(req)
    idx = int(req.match_info['idx'])
    if idx not in (1, 2):
        raise web.HTTPNotFound()
    body = await cuerpo(req)
    try:
        dst = hexpad(str(body.get('pubkey', '')), 32)
    except ValueError as exc:
        raise web.HTTPBadRequest(text=str(exc))
    password = str(body.get('password', ''))
    frame = bytes([26]) + dst + password.encode('utf-8')
    try:
        out = await g.command(idx, frame)
    except Exception as exc:
        raise web.HTTPServiceUnavailable(text=str(exc))
    if out and out[0] == 1:
        raise web.HTTPBadRequest(text='el nodo rechazo el envio del login')
    # Solo confirma que el mensaje salio; LOGIN_SUCCESS/FAILED llega despues
    # como push (ver last_push_type en /status).
    return web.json_response({'ok': True, **g.wio(idx)})


async def wio_binary_req(req):
    """CMD_SEND_BINARY_REQ (0x32): pide a un nodo remoto su estado, telemetria,
    vecinos o ACL por LoRa. No hace falta login: son datos publicos del nodo.

    Formato: 0x32 + pubkey destino (32 bytes) + tipo de peticion (1 byte).
    La respuesta NO vuelve como reply al comando: llega despues como push
    (STATUS_RESPONSE 0x87 o BINARY_RESPONSE 0x8C), por eso el panel consulta
    last_push_by_type en /status despues de mandar esto.
    """
    await guard(req)
    idx = int(req.match_info['idx'])
    if idx not in (1, 2):
        raise web.HTTPNotFound()
    body = await cuerpo(req)
    try:
        dst = hexpad(str(body.get('pubkey', '')), 32)
    except ValueError as exc:
        raise web.HTTPBadRequest(text=str(exc))
    try:
        req_type = int(body.get('req_type', 1))
    except (TypeError, ValueError):
        raise web.HTTPBadRequest(text='req_type debe ser un entero')
    if req_type not in (1, 2, 3, 4, 5, 6):
        raise web.HTTPBadRequest(text='tipo de peticion binaria desconocido')
    # NEIGHBOURS y similares llevan parametros extra detras del tipo.
    extra = b''
    if body.get('data'):
        try:
            extra = bytes.fromhex(str(body['data'])[:256])
        except ValueError:
            raise web.HTTPBadRequest(text='campo data no es hex valido')
    frame = bytes([0x32]) + dst + bytes([req_type]) + extra
    try:
        out = await g.command(idx, frame)
    except Exception as exc:
        raise web.HTTPServiceUnavailable(text=str(exc))
    if out and out[0] == 1:
        raise web.HTTPBadRequest(text='el nodo rechazo la peticion binaria')
    # El panel "ensena" al gateway a quien vigilar: la primera consulta manual
    # fija el objetivo del muestreo periodico que alimenta el historico.
    if req_type == 1:
        monitor.remember(idx, body.get('pubkey', ''))
    # El tag de RESP_SENT (6, flood, tag(4), ...) viaja en la respuesta
    # 0x8C: el panel lo usa para no confundirla con la de otra peticion.
    tag = out[2:6].hex() if out and out[0] == 6 and len(out) >= 6 else None
    return web.json_response({'ok': True, 'tag': tag, **g.wio(idx)})


async def elevation(req):
    """Proxy de altitudes (Open-Meteo). Va por la Pi para no depender de CORS
    ni de que el navegador tenga salida a internet; solo reenvia coordenadas.
    """
    await guard(req)
    try:
        lat_v = [float(x) for x in req.query.get('lats', '').split(',')]
        lon_v = [float(x) for x in req.query.get('lons', '').split(',')]
    except ValueError:
        raise web.HTTPBadRequest(text='lats/lons deben ser numeros separados por comas')
    if not lat_v or len(lat_v) != len(lon_v) or len(lat_v) > 100 \
            or not all(-90 <= a <= 90 for a in lat_v) or not all(-180 <= o <= 180 for o in lon_v):
        raise web.HTTPBadRequest(text='coordenadas fuera de rango o mas de 100 puntos')
    lats = ','.join(f'{a:.6f}' for a in lat_v)
    lons = ','.join(f'{o:.6f}' for o in lon_v)
    url = f'https://api.open-meteo.com/v1/elevation?latitude={lats}&longitude={lons}'
    try:
        async with aiohttp.ClientSession() as sess:
            async with sess.get(url, timeout=aiohttp.ClientTimeout(total=20)) as resp:
                data = await resp.json()
    except Exception as exc:
        raise web.HTTPBadGateway(text=f'servicio de altitudes no disponible: {exc}')
    return web.json_response(data)


async def history(req):
    """Serie temporal del repetidor recogida por la Pi (bateria, duty cycle...)."""
    await guard(req)
    try:
        limit = max(1, min(int(req.query.get('limit', '500')), 20000))
    except ValueError:
        limit = 500
    return web.json_response({
        'ok': True,
        'target': monitor.target,
        'every_seconds': monitor.SAMPLE_EVERY,
        'last_sample_at': monitor.last_sample_at,
        'last_error': monitor.last_error,
        'samples': monitor.read(limit),
    })


async def history_sample_now(req):
    """Fuerza una muestra ya, sin esperar al siguiente ciclo."""
    await guard(req)
    await monitor.sample_once()
    return web.json_response({'ok': True, 'last_error': monitor.last_error,
                              'last_sample_at': monitor.last_sample_at})


async def wio_pushes(req):
    """Ultimas tramas push recibidas por tipo, para leer respuestas asincronas."""
    await guard(req)
    idx = int(req.match_info['idx'])
    if idx not in (1, 2):
        raise web.HTTPNotFound()
    return web.json_response({'ok': True, 'pushes': {str(k): v for k, v in g.last_push_by_type[idx].items()}})


async def wio_trace(req):
    """CMD_SEND_TRACE_PATH (36): traceroute real de MeshCore. Se manda por el
    WIO propio (no a un contacto remoto) y la malla lo reenvia en flood; cada
    repetidor que lo toca añade su hash+SNR. La respuesta llega despues como
    push TRACE_DATA (0x89), igual que las peticiones binarias.

    Formato: 0x24 + tag(4 LE) + auth_code(4 LE) + flags(1) [+ path]. El
    firmware rechaza en silencio si el paquete no supera 10 bytes exactos
    (MyMesh.cpp:1620), asi que sin 'path' se rellena a 11 con un 0x00.
    """
    await guard(req)
    idx = int(req.match_info['idx'])
    if idx not in (1, 2):
        raise web.HTTPNotFound()
    body = await cuerpo(req)
    try:
        tag = int(body.get('tag', 0)) & 0xFFFFFFFF
    except (TypeError, ValueError):
        raise web.HTTPBadRequest(text='tag debe ser un entero')
    # El firmware manda el paquete por sendDirect() con la ruta que le des —
    # no la descubre solo. Sin repetidores en la ruta nunca vuelve nada.
    path_hex = str(body.get('path', ''))
    try:
        path_bytes = bytes.fromhex(path_hex) if path_hex else b''
    except ValueError:
        raise web.HTTPBadRequest(text='path no es hex valido')
    if len(path_bytes) > 64:
        raise web.HTTPBadRequest(text='path demasiado largo (max. 64 saltos)')
    frame = bytes([36]) + tag.to_bytes(4, 'little') + (0).to_bytes(4, 'little') + bytes([0]) + path_bytes
    if len(frame) <= 10:
        frame += bytes([0])
    try:
        out = await g.command(idx, frame)
    except Exception as exc:
        raise web.HTTPServiceUnavailable(text=str(exc))
    if out and out[0] == 1:
        raise web.HTTPBadRequest(text='el nodo rechazo el traceroute')
    return web.json_response({'ok': True, 'tag': tag, **g.wio(idx)})


async def wio_remote_cmd(req):
    """SEND_TXT_MSG (2) con TxtType.CLI_DATA: un comando CLI de texto dirigido
    a un contacto remoto ya logueado. La respuesta llega como mensaje privado
    normal (se lee con el chat / SYNC_NEXT_MSG), no aqui.
    """
    await guard(req)
    idx = int(req.match_info['idx'])
    if idx not in (1, 2):
        raise web.HTTPNotFound()
    body = await cuerpo(req)
    try:
        dst = hexpad(str(body.get('pubkey', '')), 6)
    except ValueError as exc:
        raise web.HTTPBadRequest(text=str(exc))
    # Se envía exactamente lo que se ha comprobado (antes iba sin strip).
    cmd = str(body.get('cmd', ''))[:120].strip()
    veto = politica_cli(cmd, bool(body.get('confirmed')))
    if veto:
        code, motivo = veto
        error = {400: web.HTTPBadRequest, 403: web.HTTPForbidden, 409: web.HTTPConflict}[code]
        raise error(text=motivo)
    ts = int(time.time())
    frame = bytes([2, 1, 0]) + ts.to_bytes(4, 'little') + dst + cmd.encode('utf-8')
    try:
        out = await g.command(idx, frame)
    except Exception as exc:
        raise web.HTTPServiceUnavailable(text=str(exc))
    if out and out[0] == 1:
        raise web.HTTPBadRequest(text='el nodo rechazo el envio del comando')
    return web.json_response({'ok': True, **g.wio(idx)})


async def relay(req):
    if not auth(req):
        raise web.HTTPUnauthorized()
    ws = web.WebSocketResponse(heartbeat=20)
    await ws.prepare(req)
    await g.attach(ws)
    try:
        async for msg in ws:
            if msg.type is web.WSMsgType.TEXT:
                try:
                    await g.receive(json.loads(msg.data))
                except Exception:
                    pass
    finally:
        await g.detach(ws)
    return ws


async def health(_req):
    return web.json_response({'ok': True, 'mode': 'relay-only', 'relay': bool(g.ws),
                              'version': PANEL_VERSION})



# ---------------------------------------------------------------- autenticacion
# nginx delega aqui con auth_request en vez de usar auth_basic, para poder servir
# un formulario propio en lugar del popup del navegador.

def _client_ip(req) -> str:
    # El primer valor de X-Forwarded-For lo escribe el propio cliente: con el
    # cambiandolo en cada intento nunca saltaba el bloqueo por IP. X-Real-IP
    # lo pone nginx con $remote_addr y machaca lo que mande el cliente, pero
    # solo vale si quien llama ES nginx (loopback): llamando directo a :8780
    # cualquiera podria inventarse la IP y saltarse el bloqueo.
    if req.remote in ('127.0.0.1', '::1'):
        return req.headers.get('X-Real-IP') or req.remote
    return req.remote or '-'


async def auth_login(req):
    # Solo por nginx (que inyecta el token): el puerto 8780 escucha en la LAN
    # para el rele, y sin esto se podia probar contrasenas sin pasar por nginx.
    await guard(req)
    try:
        body = await req.json()
    except (ValueError, UnicodeDecodeError):
        # Solo JSON malo: el 413 de client_max_size tiene que salir como 413.
        return web.json_response({'error': 'peticion invalida'}, status=400)
    if not isinstance(body, dict):
        return web.json_response({'error': 'peticion invalida'}, status=400)
    ip = _client_ip(req)
    user = str(body.get('username', ''))
    if auth_mod.locked_out(ip):
        return web.json_response(
            {'error': 'Demasiados intentos fallidos. Espera unos minutos.'}, status=429)
    # openssl/htpasswd tardan: en un hilo para no parar el bucle (y el relay).
    if not await asyncio.to_thread(auth_mod.check_password, user,
                                   str(body.get('password', ''))[:64], ip):
        print(f'auth: intento fallido usuario={user!r} ip={ip}', flush=True)
        return web.json_response({'error': 'Usuario o contrasena incorrectos.'}, status=401)
    print(f'auth: sesion iniciada usuario={user!r} ip={ip}', flush=True)
    resp = web.json_response({'ok': True, 'user': user})
    resp.set_cookie(auth_mod.COOKIE_NAME, auth_mod.make_session(user),
                    max_age=auth_mod.cookie_max_age(), httponly=True,
                    secure=True, samesite='Lax', path='/')
    return resp


async def auth_verify(req):
    """Subpeticion interna de nginx: 200 deja pasar, 401 manda al login."""
    user = auth_mod.read_session(req.cookies.get(auth_mod.COOKIE_NAME))
    if not user:
        raise web.HTTPUnauthorized()
    return web.Response(text='', headers={'X-MeshCore-User': user})


async def auth_logout(req):
    resp = web.json_response({'ok': True})
    resp.del_cookie(auth_mod.COOKIE_NAME, path='/')
    return resp


async def auth_whoami(req):
    user = auth_mod.read_session(req.cookies.get(auth_mod.COOKIE_NAME))
    return web.json_response({'ok': bool(user), 'user': user})


async def rxlog(req):
    """Medidas RF por paquete oido (SNR/RSSI), acumuladas desde el arranque."""
    await guard(req)
    try:
        limit = int(req.query.get('limit', 2000))
    except ValueError:
        limit = 2000
    limit = max(1, min(limit, RX_LOG_MAX))
    samples = list(g.rx_log)[-limit:]
    return web.json_response({'ok': True, 'total': len(g.rx_log),
                              'max': RX_LOG_MAX, 'samples': samples})


def ips_permitidas() -> set:
    return {ip.strip() for ip in os.getenv('MESHCORE_ALLOWED_IPS', '').split(',') if ip.strip()}


@web.middleware
async def solo_ips_permitidas(req, handler):
    """Con MESHCORE_ALLOWED_IPS, el puerto del gateway solo atiende a esas IP
    (el PC del relay) y a la propia Pi (nginx). Sin ella, a todos (con token)."""
    permitidas = ips_permitidas()
    if permitidas and req.remote not in ('127.0.0.1', '::1') and req.remote not in permitidas:
        raise web.HTTPForbidden(text='IP no permitida (MESHCORE_ALLOWED_IPS)')
    return await handler(req)


app = web.Application(client_max_size=64 * 1024,  # ninguna peticion legitima pasa de unos KB
                      middlewares=[solo_ips_permitidas])
app.router.add_get('/api/ble/status', status)
app.router.add_post('/api/ble/wio/{idx:[12]}/connect', connect)
app.router.add_post('/api/ble/wio/{idx:[12]}/command', command)
app.router.add_post('/api/ble/wio/{idx:[12]}/contacts', contacts)
app.router.add_post('/api/ble/wio/{idx:[12]}/login', wio_login)
app.router.add_post('/api/ble/wio/{idx:[12]}/remote_cmd', wio_remote_cmd)
app.router.add_post('/api/ble/wio/{idx:[12]}/binary_req', wio_binary_req)
app.router.add_post('/api/ble/wio/{idx:[12]}/trace', wio_trace)
app.router.add_get('/api/ble/wio/{idx:[12]}/pushes', wio_pushes)
app.router.add_get('/api/ble/rxlog', rxlog)
app.router.add_get('/api/ble/history', history)
app.router.add_get('/api/ble/elevation', elevation)
app.router.add_post('/api/ble/history/sample', history_sample_now)


async def _start_monitor(app_):
    app_['monitor_task'] = asyncio.create_task(monitor.loop())


async def _stop_monitor(app_):
    task = app_.get('monitor_task')
    if task:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task


app.on_startup.append(_start_monitor)
app.on_cleanup.append(_stop_monitor)
app.router.add_get('/api/ble/relay', relay)
app.router.add_get('/healthz', health)
app.router.add_post('/api/auth/login', auth_login)
app.router.add_get('/api/auth/verify', auth_verify)
app.router.add_post('/api/auth/logout', auth_logout)
app.router.add_get('/api/auth/whoami', auth_whoami)

if __name__ == '__main__':
    token()
    print(f'MeshCore relay-only gateway listening on {BIND}:{PORT}', flush=True)
    web.run_app(app, host=BIND, port=PORT)
