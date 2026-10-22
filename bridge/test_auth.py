#!/usr/bin/env python3
"""Pruebas del modulo de autenticacion. No necesitan hardware BLE."""
import os, sys, tempfile, time, pathlib

tmp = tempfile.mkdtemp()
# htpasswd de juguete: misma sal y hash reales que genera openssl
import subprocess
salt = 'TestSalt'
h = subprocess.run(['openssl','passwd','-apr1','-salt',salt,'-stdin'],
                   input=b'secreta123', capture_output=True).stdout.decode().strip()
hp = pathlib.Path(tmp,'htpasswd'); hp.write_text(f'usuario:{h}\n')
os.environ['MESHCORE_HTPASSWD'] = str(hp)
os.environ['MESHCORE_SESSION_SECRET_FILE'] = str(pathlib.Path(tmp,'secret'))

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import meshcore_auth as auth

fails = []
def check(name, cond):
    print(('  OK   ' if cond else '  FALLO') + '  ' + name)
    if not cond: fails.append(name)

print('=== contrasenas ===')
check('contrasena correcta pasa', auth.check_password('usuario','secreta123','1.1.1.1'))
check('contrasena incorrecta falla', not auth.check_password('usuario','mala','2.2.2.2'))
check('usuario inexistente falla', not auth.check_password('nadie','secreta123','3.3.3.3'))
check('contrasena vacia falla', not auth.check_password('usuario','','4.4.4.4'))

print('=== sesiones ===')
tok = auth.make_session('usuario')
check('sesion recien creada es valida', auth.read_session(tok) == 'usuario')
check('cookie vacia es invalida', auth.read_session('') is None)
check('cookie basura es invalida', auth.read_session('no-es-base64!!') is None)
check('cookie manipulada es invalida', auth.read_session(tok[:-4]+'AAAA') is None)

import base64
raw = base64.urlsafe_b64decode(tok.encode()).decode()
u, exp, sig = raw.rsplit('|',2)
forged_payload = f'{u}|{int(time.time())+99999}'
forged = base64.urlsafe_b64encode((forged_payload+'|'+sig).encode()).decode()
check('caducidad alargada sin firma valida es rechazada', auth.read_session(forged) is None)

os.environ['MESHCORE_SESSION_HOURS'] = '0'
import importlib; importlib.reload(auth)
os.environ['MESHCORE_HTPASSWD'] = str(hp)
expired = auth.make_session('usuario')
time.sleep(1.1)
check('sesion caducada es rechazada', auth.read_session(expired) is None)

print('=== freno a fuerza bruta ===')
importlib.reload(auth)
ip = '9.9.9.9'
for _ in range(auth.MAX_FAILS):
    auth.check_password('usuario','mala',ip)
check('tras N fallos la IP queda bloqueada', auth.locked_out(ip))
check('la correcta tambien se rechaza estando bloqueado',
      not auth.check_password('usuario','secreta123',ip))
check('otra IP no se ve afectada', auth.check_password('usuario','secreta123','8.8.8.8'))

print('=== seguridad 1.28 ===')
auth.SESSION_HOURS = 168   # la prueba de caducidad lo dejó a 0
tok = auth.make_session('usuario')
check('sesion reciente vale con max_age de 2 h', auth.read_session(tok, max_age_s=7200) == 'usuario')
viejo = auth.time.time
auth.time.time = lambda: viejo() + 3 * 3600
check('sesion de hace 3 h no vale para la terminal (2 h)', auth.read_session(tok, max_age_s=7200) is None)
check('la misma sesion sigue valiendo para el panel', auth.read_session(tok) == 'usuario')
auth.time.time = viejo
h2 = subprocess.run(['openssl','passwd','-apr1','-salt','OtraSal1','-stdin'],
                    input=b'nueva456', capture_output=True).stdout.decode().strip()
hp.write_text('usuario:'+h2+chr(10))
check('cambiar la contrasena invalida las sesiones abiertas', auth.read_session(tok) is None)
check('una sesion nueva vale tras el cambio', auth.read_session(auth.make_session('usuario')) == 'usuario')
auth._fails['7.7.7.7'] = [0.0]
auth.locked_out('7.7.7.7')
check('las IP sin fallos recientes se purgan', '7.7.7.7' not in auth._fails)

print()
if fails:
    print(f'FALLARON {len(fails)}: {fails}'); sys.exit(1)
print('TODAS LAS PRUEBAS PASAN')
