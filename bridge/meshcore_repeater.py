#!/usr/bin/env python3
"""Gestion remota de repetidores MeshCore desde el panel.

Este modulo SOLO construye y analiza tramas. No abre BLE ni habla con el
gateway: eso lo hace el relay. Asi se puede probar entero sin hardware.

Fuentes (no inventado):
  - meshcore-py, la libreria oficial: commands/messaging.py, commands/binary.py,
    commands/base.py y packets.py. De ahi salen los codigos y el orden exacto de
    los campos de cada trama.
  - docs/cli_commands.md del repo meshcore-dev/MeshCore, para el catalogo de
    comandos que acepta un repetidor y cuales exigen admin.

=== CLI LOCAL vs CLI REMOTO: no son lo mismo ===

CLI local (RUN_CLI_COMMAND, 0x42): se lo mandas al nodo que tienes enganchado
por BLE o USB. El firmware companion de los WIO NO lo implementa: responde
ERROR. Solo lo tienen repetidores y room servers por serie.

CLI remoto (este modulo): viaja como un MENSAJE DE TEXTO por la malla hasta el
repetidor, usando SEND_TXT_MSG (0x02) con un txt_type especial. El WIO solo hace
de puerta de entrada: el comando lo ejecuta el repetidor al otro lado de la
radio. Por eso funciona aunque el WIO sea companion.

El txt_type depende del tipo del destinatario (visto en send_cmd de la libreria
oficial):
  - destino REPEATER (adv_type 2) -> CLI_DATA (0x01)
  - destino CHAT/companion (adv_type 1) -> CLI_CMD (0x03)

=== Longitud de la clave publica: la trampa ===

No todas las tramas quieren la misma longitud, y equivocarse da errores mudos:
  - login, logout, status y binary_req  -> clave COMPLETA, 32 bytes
  - mensajes de texto (y por tanto el CLI remoto) -> PREFIJO de 6 bytes
"""
from __future__ import annotations

import os
import random
import time
from dataclasses import dataclass

# --- codigos de la app companion (packets.py de meshcore-py) ---
CMD_SEND_TXT_MSG = 0x02
CMD_GET_CONTACTS = 0x04
CMD_SEND_LOGIN = 0x1A
CMD_SEND_STATUS_REQ = 0x1B
CMD_LOGOUT = 0x1D
CMD_BINARY_REQ = 0x32

# tipos de texto
TXT_PLAIN = 0x00
TXT_CLI_DATA = 0x01
TXT_SIGNED_PLAIN = 0x02
TXT_CLI_CMD = 0x03

# tipos de advert (para decidir el txt_type)
ADV_CHAT = 0x01
ADV_REPEATER = 0x02
ADV_ROOM = 0x03

# subtipos de peticion binaria
BIN_STATUS = 0x01
BIN_KEEP_ALIVE = 0x02
BIN_TELEMETRY = 0x03
BIN_MMA = 0x04
BIN_ACL = 0x05
BIN_NEIGHBOURS = 0x06

# respuestas que interesan
RESP_MSG_SENT = 6
PUSH_LOGIN_SUCCESS = 0x85
PUSH_LOGIN_FAILED = 0x86
PUSH_STATUS_RESPONSE = 0x87
PUSH_BINARY_RESPONSE = 0x8C


class FrameError(ValueError):
    pass


def _pubkey(value: str | bytes, length: int) -> bytes:
    """Normaliza una clave publica y comprueba que tiene la longitud pedida."""
    raw = bytes.fromhex(value) if isinstance(value, str) else bytes(value)
    if len(raw) < length:
        raise FrameError(f'clave publica demasiado corta: {len(raw)} bytes, hacen falta {length}')
    return raw[:length]


# ---------------------------------------------------------------- riesgo
SAFE = 'safe'            # solo lee, no cambia nada
EFFECT = 'effect'        # cambia algo reversible o emite trafico
CONFIRM = 'confirm'      # pide confirmacion explicita del usuario
BLOCKED = 'blocked'      # no se expone desde el panel


@dataclass(frozen=True)
class RepeaterCommand:
    cli: str
    label: str
    risk: str
    admin: bool
    note: str = ''


# Catalogo tomado de docs/cli_commands.md del repo oficial. Lo que no aparece
# ahi no se inventa: si un firmware concreto no lo soporta, respondera error.
CATALOG: tuple[RepeaterCommand, ...] = (
    RepeaterCommand('ver', 'Version de firmware', SAFE, False),
    RepeaterCommand('board', 'Modelo de placa', SAFE, False),
    RepeaterCommand('clock', 'Reloj del nodo (UTC)', SAFE, False),
    RepeaterCommand('neighbors', 'Vecinos oidos (8 adverts recientes)', SAFE, False),
    RepeaterCommand('get tx', 'Potencia TX actual', SAFE, False),
    RepeaterCommand('get freq', 'Frecuencia actual', SAFE, False),

    RepeaterCommand('advert', 'Emitir advert por inundacion', EFFECT, False,
                    'genera trafico en toda la malla'),
    RepeaterCommand('advert.zerohop', 'Emitir advert solo a vecinos', EFFECT, False),
    RepeaterCommand('clock sync', 'Sincronizar reloj con el nodo local', EFFECT, False),
    RepeaterCommand('discover.neighbors', 'Buscar vecinos a cero saltos', EFFECT, False),

    RepeaterCommand('set tx', 'Cambiar potencia TX', CONFIRM, True,
                    'exige reiniciar para aplicar; subir de mas puede ser ilegal'),
    RepeaterCommand('set freq', 'Cambiar frecuencia', CONFIRM, True,
                    'exige reiniciar; si te sales del canal de la red pierdes el nodo'),
    RepeaterCommand('time', 'Fijar reloj a un epoch', CONFIRM, True),
    RepeaterCommand('reboot', 'Reiniciar el repetidor', CONFIRM, True,
                    'no contesta: se pierde el enlace unos segundos'),

    # Expuestos pero deliberadamente bloqueados en el panel.
    RepeaterCommand('password', 'Cambiar contrasena de admin', BLOCKED, True,
                    'si se pierde, el nodo solo se recupera fisicamente'),
    RepeaterCommand('erase', 'Borrado de fabrica', BLOCKED, True,
                    'destructivo e irreversible; ademas es solo por serie'),
    RepeaterCommand('poweroff', 'Apagar el nodo', BLOCKED, True,
                    'sin acceso fisico no se vuelve a encender'),
    RepeaterCommand('start ota', 'Actualizacion OTA', BLOCKED, True,
                    'ver flujo de firmware antes de habilitarlo'),
)

BY_CLI = {c.cli: c for c in CATALOG}


def classify(cli: str) -> RepeaterCommand | None:
    """Clasifica un comando por su primera palabra significativa."""
    cli = cli.strip()
    if cli in BY_CLI:
        return BY_CLI[cli]
    for cmd in CATALOG:
        if cli.startswith(cmd.cli + ' '):
            return cmd
    return None


# ---------------------------------------------------------------- tramas
def frame_get_contacts(since: int = 0) -> bytes:
    """Lista de contactos conocidos: de ahi sale la clave del repetidor."""
    return bytes([CMD_GET_CONTACTS]) + int(since).to_bytes(4, 'little')


def frame_login(pubkey: str | bytes, password: str) -> bytes:
    """0x1A + clave completa (32) + contrasena."""
    return bytes([CMD_SEND_LOGIN]) + _pubkey(pubkey, 32) + password.encode('utf-8')


def frame_logout(pubkey: str | bytes) -> bytes:
    """0x1D + clave completa (32)."""
    return bytes([CMD_LOGOUT]) + _pubkey(pubkey, 32)


def frame_status_req(pubkey: str | bytes) -> bytes:
    """0x1B + clave completa (32). Responde con un push STATUS_RESPONSE."""
    return bytes([CMD_SEND_STATUS_REQ]) + _pubkey(pubkey, 32)


def frame_binary_req(pubkey: str | bytes, req_type: int, payload: bytes = b'') -> bytes:
    """0x32 + clave completa (32) + subtipo + carga."""
    return bytes([CMD_BINARY_REQ]) + _pubkey(pubkey, 32) + bytes([req_type]) + payload


def frame_neighbours(pubkey: str | bytes, count: int = 255, offset: int = 0,
                     order_by: int = 0, prefix_len: int = 4,
                     nonce: int | None = None) -> bytes:
    """Peticion binaria de vecinos. La carga sigue a req_neighbours_async."""
    if nonce is None:
        nonce = random.randint(1, 0xFFFFFFFF)
    payload = (b'\x00'                                   # version
               + count.to_bytes(1, 'little')
               + offset.to_bytes(2, 'little')
               + order_by.to_bytes(1, 'little')
               + prefix_len.to_bytes(1, 'little')
               + nonce.to_bytes(4, 'little'))
    return frame_binary_req(pubkey, BIN_NEIGHBOURS, payload)


def frame_cli(pubkey: str | bytes, cli: str, dst_type: int = ADV_REPEATER,
              timestamp: int | None = None) -> bytes:
    """CLI remoto: viaja como mensaje de texto hasta el repetidor.

    0x02 + txt_type + intento(0) + timestamp(4 LE) + prefijo de clave(6) + texto
    Ojo: aqui la clave son 6 bytes, no 32.
    """
    if timestamp is None:
        timestamp = int(time.time())
    txt_type = TXT_CLI_CMD if dst_type == ADV_CHAT else TXT_CLI_DATA
    return (bytes([CMD_SEND_TXT_MSG, txt_type, 0x00])
            + int(timestamp).to_bytes(4, 'little')
            + _pubkey(pubkey, 6)
            + cli.encode('utf-8'))


def frame_cli_checked(pubkey: str | bytes, cli: str, dst_type: int = ADV_REPEATER,
                      confirmed: bool = False, timestamp: int | None = None) -> bytes:
    """Como frame_cli pero aplicando la politica de riesgo.

    El panel nunca debe poder mandar un erase o un password por accidente, y un
    reboot solo sale si el usuario lo ha confirmado explicitamente.
    """
    info = classify(cli)
    if info is None:
        raise FrameError(f'comando no reconocido: {cli!r}. '
                         'No se envian comandos fuera del catalogo documentado.')
    if info.risk == BLOCKED:
        raise FrameError(f'comando bloqueado en el panel: {info.cli} ({info.note})')
    if info.risk == CONFIRM and not confirmed:
        raise FrameError(f'{info.cli} requiere confirmacion explicita del usuario'
                         + (f': {info.note}' if info.note else ''))
    return frame_cli(pubkey, cli, dst_type=dst_type, timestamp=timestamp)


# ---------------------------------------------------------------- respuestas
def parse_contacts(frames: list[bytes]) -> list[dict]:
    """Extrae los contactos de una tanda de tramas CONTACT (tipo 3).

    Formato tomado de reader.py: 32 clave, 1 tipo, 1 flags, 1 plen, 64 ruta,
    32 nombre, 4 ultimo advert, 4 lat, 4 lon, 4 lastmod.
    """
    out = []
    for raw in frames:
        if not raw or raw[0] != 3 or len(raw) < 148:
            continue
        plen = raw[35]
        hops = None if plen == 255 else (plen & 0x3F)
        out.append({
            'public_key': raw[1:33].hex(),
            'adv_type': raw[33],
            'hops': hops,
            'name': raw[100:132].decode('utf-8', 'ignore').replace('\0', '').strip(),
            'last_advert': int.from_bytes(raw[132:136], 'little'),
            'lat': int.from_bytes(raw[136:140], 'little', signed=True) / 1e6,
            'lon': int.from_bytes(raw[140:144], 'little', signed=True) / 1e6,
        })
    return out


def find_repeaters(contacts: list[dict]) -> list[dict]:
    return [c for c in contacts if c.get('adv_type') == ADV_REPEATER]


def parse_login_result(raw: bytes) -> dict:
    if not raw:
        return {'ok': False, 'error': 'respuesta vacia'}
    if raw[0] == PUSH_LOGIN_SUCCESS:
        return {'ok': True}
    if raw[0] == PUSH_LOGIN_FAILED:
        return {'ok': False, 'error': 'contrasena rechazada por el repetidor'}
    return {'ok': False, 'error': f'respuesta inesperada 0x{raw[0]:02x}'}


def is_push(raw: bytes) -> bool:
    return bool(raw) and bool(raw[0] & 0x80)
