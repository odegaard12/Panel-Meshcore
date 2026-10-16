#!/usr/bin/env python3
"""Pruebas de la gestion remota del repetidor. Sin hardware.

Lo importante: las tramas se comparan con las que construye la libreria oficial
meshcore-py, reimplementando su logica byte a byte. Si el formato cambia, esto
falla en vez de descubrirlo en campo.
"""
import pathlib, sys, time
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import meshcore_repeater as R

fails = []
def check(name, cond, extra=''):
    print(('  OK   ' if cond else '  FALLO') + '  ' + name + (('  ' + extra) if not cond and extra else ''))
    if not cond: fails.append(name)

PK = '11223344556677889900aabbccddeeff' * 2          # 32 bytes en hex
PKB = bytes.fromhex(PK)

print('=== longitudes de clave publica (la trampa clasica) ===')
f = R.frame_login(PK, 'password')
check('login usa clave completa de 32 bytes', f[1:33] == PKB)
check('login: opcode 0x1A', f[0] == 0x1A)
check('login lleva la contrasena al final', f[33:] == b'password')

f = R.frame_logout(PK)
check('logout: 0x1D + 32 bytes y nada mas', f == bytes([0x1D]) + PKB)

f = R.frame_status_req(PK)
check('status: 0x1B + 32 bytes', f == bytes([0x1B]) + PKB)

f = R.frame_cli(PK, 'ver', timestamp=1700000000)
check('CLI remoto usa PREFIJO de 6 bytes, no 32', f[7:13] == PKB[:6])
check('CLI remoto no mete los 32 bytes', len(f) == 3 + 4 + 6 + len('ver'))

print()
print('=== trama de CLI remoto byte a byte ===')
esperado = (bytes([0x02, 0x01, 0x00])
            + (1700000000).to_bytes(4, 'little')
            + PKB[:6] + b'ver')
check('repetidor -> txt_type CLI_DATA (0x01)', R.frame_cli(PK,'ver',R.ADV_REPEATER,1700000000) == esperado)
chat = R.frame_cli(PK, 'ver', R.ADV_CHAT, 1700000000)
check('companion -> txt_type CLI_CMD (0x03)', chat[1] == 0x03)
check('timestamp va en little endian', R.frame_cli(PK,'x',timestamp=1)[3:7] == b'\x01\x00\x00\x00')

print()
print('=== vecinos (peticion binaria) ===')
f = R.frame_neighbours(PK, count=255, offset=0, order_by=0, prefix_len=4, nonce=0xAABBCCDD)
check('binary_req: 0x32 + clave 32 + subtipo', f[0] == 0x32 and f[1:33] == PKB and f[33] == 0x06)
carga = f[34:]
check('carga: version 0', carga[0] == 0)
check('carga: count, offset(2), order_by, prefix_len',
      carga[1] == 255 and carga[2:4] == b'\x00\x00' and carga[4] == 0 and carga[5] == 4)
check('carga: nonce little endian', carga[6:10] == (0xAABBCCDD).to_bytes(4,'little'))
check('longitud total de la carga = 10', len(carga) == 10)

print()
print('=== politica de riesgo: lo destructivo no sale por accidente ===')
def rechaza(cli, **kw):
    try:
        R.frame_cli_checked(PK, cli, **kw); return False
    except R.FrameError:
        return True

check('erase bloqueado siempre', rechaza('erase', confirmed=True))
check('password bloqueado siempre', rechaza('password nueva', confirmed=True))
check('poweroff bloqueado siempre', rechaza('poweroff', confirmed=True))
check('start ota bloqueado siempre', rechaza('start ota', confirmed=True))
check('reboot sin confirmar se rechaza', rechaza('reboot'))
check('reboot confirmado pasa', not rechaza('reboot', confirmed=True))
check('set freq sin confirmar se rechaza', rechaza('set freq 869.618'))
check('set freq confirmado pasa', not rechaza('set freq 869.618', confirmed=True))
check('comando inventado se rechaza', rechaza('haz algo raro', confirmed=True))
check('ver (solo lectura) pasa sin confirmar', not rechaza('ver'))
check('neighbors pasa sin confirmar', not rechaza('neighbors'))
check('advert pasa sin confirmar', not rechaza('advert'))

print()
print('=== clasificacion ===')
check('get freq se clasifica como seguro', R.classify('get freq').risk == R.SAFE)
check('set freq con argumento se clasifica bien', R.classify('set freq 869.618').cli == 'set freq')
check('reboot exige admin', R.classify('reboot').admin is True)
check('clock no exige admin', R.classify('clock').admin is False)

print()
print('=== validacion de entrada ===')
try:
    R.frame_login('aabb', 'x'); corta = False
except R.FrameError:
    corta = True
check('clave demasiado corta da error claro', corta)

print()
print('=== analisis de respuestas ===')
check('login correcto', R.parse_login_result(bytes([0x85]))['ok'] is True)
check('login rechazado', R.parse_login_result(bytes([0x86]))['ok'] is False)
check('respuesta vacia no revienta', R.parse_login_result(b'')['ok'] is False)
check('detecta tramas push', R.is_push(bytes([0x83])) and not R.is_push(bytes([0x05])))

contacto = (bytes([3]) + PKB + bytes([R.ADV_REPEATER, 0, 2]) + bytes(64)
            + b'MI-REPETIDOR'.ljust(32, b'\0')
            + (1700000000).to_bytes(4,'little')
            + (40416800).to_bytes(4,'little',signed=True)
            + (-3703800).to_bytes(4,'little',signed=True)
            + (0).to_bytes(4,'little'))
cs = R.parse_contacts([contacto])
check('contacto analizado', len(cs) == 1)
if cs:
    check('nombre correcto', cs[0]['name'] == 'MI-REPETIDOR', repr(cs[0]['name']))
    check('saltos desde plen', cs[0]['hops'] == 2)
    check('se reconoce como repetidor', len(R.find_repeaters(cs)) == 1)
    check('latitud', abs(cs[0]['lat'] - 40.4168) < 1e-5)

print()
if fails:
    print(f'FALLARON {len(fails)}: {fails}'); sys.exit(1)
print('TODAS LAS PRUEBAS PASAN')

# --- verificacion cruzada contra meshcore-py si esta instalada ---------------
# No es obligatorio para que el modulo funcione, pero si la libreria oficial
# esta disponible se comprueba que ningun codigo se ha desviado del suyo.
try:
    from meshcore.packets import CommandType, TxtType, AdvType, BinaryReqType, PacketType
except Exception:
    print('\n(meshcore-py no instalada: se omite la verificacion cruzada)')
else:
    print('\n=== verificacion cruzada con meshcore-py oficial ===')
    cruz = [
        ('SEND_TXT_MSG',  R.CMD_SEND_TXT_MSG,   CommandType.SEND_TXT_MSG.value),
        ('GET_CONTACTS',  R.CMD_GET_CONTACTS,   CommandType.GET_CONTACTS.value),
        ('SEND_LOGIN',    R.CMD_SEND_LOGIN,     CommandType.SEND_LOGIN.value),
        ('SEND_STATUS',   R.CMD_SEND_STATUS_REQ,CommandType.SEND_STATUS_REQ.value),
        ('LOGOUT',        R.CMD_LOGOUT,         CommandType.LOGOUT.value),
        ('BINARY_REQ',    R.CMD_BINARY_REQ,     CommandType.BINARY_REQ.value),
        ('CLI_DATA',      R.TXT_CLI_DATA,       TxtType.CLI_DATA.value),
        ('CLI_CMD',       R.TXT_CLI_CMD,        TxtType.CLI_CMD.value),
        ('ADV_REPEATER',  R.ADV_REPEATER,       AdvType.REPEATER.value),
        ('ADV_CHAT',      R.ADV_CHAT,           AdvType.CHAT.value),
        ('BIN_NEIGHBOURS',R.BIN_NEIGHBOURS,     BinaryReqType.NEIGHBOURS.value),
        ('BIN_STATUS',    R.BIN_STATUS,         BinaryReqType.STATUS.value),
        ('LOGIN_SUCCESS', R.PUSH_LOGIN_SUCCESS, PacketType.LOGIN_SUCCESS.value),
        ('LOGIN_FAILED',  R.PUSH_LOGIN_FAILED,  PacketType.LOGIN_FAILED.value),
        ('STATUS_RESP',   R.PUSH_STATUS_RESPONSE, PacketType.STATUS_RESPONSE.value),
        ('BINARY_RESP',   R.PUSH_BINARY_RESPONSE, PacketType.BINARY_RESPONSE.value),
    ]
    for nombre, mio, oficial in cruz:
        check(f'{nombre} coincide con la libreria oficial', mio == oficial,
              f'mio=0x{mio:02x} oficial=0x{oficial:02x}')
    if fails:
        print(f'\nFALLARON {len(fails)}: {fails}'); sys.exit(1)
    print('\nTODO COINCIDE CON LA LIBRERIA OFICIAL')
