#!/usr/bin/env python3
"""Autenticacion del panel: formulario propio en vez del popup del navegador.

Por que no auth_basic: el popup nativo no se puede estilar, no se puede cerrar
sesion sin trucos y en movil es especialmente feo. Aqui nginx delega en
auth_request contra /api/auth/verify y, cuando falla, sirve /login.html.

Las credenciales siguen siendo las mismas que ya habia: el fichero htpasswd con
hash apr1 salteado. No se guarda ninguna contrasena en claro en ningun sitio.
La verificacion se hace llamando a openssl con la sal almacenada y comparando en
tiempo constante, asi no hace falta anadir passlib ni bcrypt al venv.

La cookie de sesion es un HMAC-SHA256 sobre usuario y caducidad, firmado con un
secreto de 32 bytes que se genera solo la primera vez. No lleva dentro ningun
dato sensible y el servidor no guarda estado: si se pierde el secreto, todas las
sesiones caducan de golpe, que es el comportamiento deseado.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import ipaddress
import json
import os
import secrets
import subprocess
import time
from pathlib import Path

HTPASSWD = Path(os.getenv('MESHCORE_HTPASSWD', '/etc/nginx/meshcore-tls/htpasswd'))
SECRET_FILE = Path(os.getenv('MESHCORE_SESSION_SECRET_FILE',
                             str(Path.home() / '.meshcore-session-secret')))
COOKIE_NAME = 'meshcore_session'
SESSION_HOURS = float(os.getenv('MESHCORE_SESSION_HOURS', '168'))  # 7 dias

# Freno simple a la fuerza bruta: no es un sistema anti-DDoS, solo evita que se
# puedan probar miles de contrasenas por segundo contra un hash apr1.
MAX_FAILS = 8
LOCKOUT_SECONDS = 300
# Por usuario, además de por IP: rotando IP (IPv6 o proxies) no frenaba nada. Más alto que
# el de IP para que un extraño no pueda dejar fuera al dueño con 8 intentos.
MAX_FAILS_USER = 30
_fails: dict[str, list[float]] = {}
REVOKED_FILE = Path(os.getenv('MESHCORE_REVOKED_FILE', str(Path.home() / '.meshcore-sesiones-cerradas.json')))


def _secret() -> bytes:
    if SECRET_FILE.exists():
        raw = SECRET_FILE.read_bytes().strip()
        # Formato actual: hex. Los secretos antiguos eran bytes en bruto y al
        # releerlos .strip() se comia los bytes de "espacio" de los extremos:
        # si el aleatorio empezaba o acababa en uno (~5 %), la sesion recien
        # firmada con el valor sin recortar dejaba de valer.
        try:
            if len(raw) == 64:
                return bytes.fromhex(raw.decode('ascii'))
        except (UnicodeDecodeError, ValueError):
            pass
        if raw:
            return raw
    raw = secrets.token_bytes(32)
    SECRET_FILE.parent.mkdir(parents=True, exist_ok=True)
    # 0o600 desde la creacion: con write+chmod habia un instante legible por todos.
    fd = os.open(SECRET_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'wb') as fh:
        fh.write(raw.hex().encode('ascii'))
    return raw


def _stored_hash(user: str) -> str | None:
    try:
        for line in HTPASSWD.read_text().splitlines():
            if not line.strip() or ':' not in line:
                continue
            name, _, digest = line.partition(':')
            if name == user:
                return digest.strip()
    except OSError:
        return None
    return None


def _primer_usuario() -> str | None:
    try:
        for line in HTPASSWD.read_text().splitlines():
            if ':' in line and line.strip():
                return line.partition(':')[0]
    except OSError:
        return None
    return None


def _firma(user: str, expiry: int) -> bytes:
    # El hash de la contraseña entra en la firma (sin ir en la cookie): al
    # cambiar la contraseña, todas las sesiones abiertas dejan de valer.
    payload = f'{user}|{expiry}|{_stored_hash(user) or ""}'
    return hmac.new(_secret(), payload.encode(), hashlib.sha256).digest()


def _clave_ip(ip: str) -> str:
    # IPv6: cada casa tiene un /64 entero; por dirección suelta se rotaba sin fin.
    try:
        a = ipaddress.ip_address(ip)
    except ValueError:
        return ip
    if a.version == 6:
        if a.ipv4_mapped:
            return str(a.ipv4_mapped)
        return str(ipaddress.ip_network(f'{a}/64', strict=False))
    return str(a)


def _recientes(clave: str) -> int:
    now = time.time()
    recent = [t for t in _fails.get(clave, []) if now - t < LOCKOUT_SECONDS]
    if not recent:
        _fails.pop(clave, None)   # sin esto el dict guardaba para siempre cada IP que falló una vez
        return 0
    _fails[clave] = recent
    return len(recent)


def locked_out(ip: str, user: str | None = None) -> bool:
    if _recientes(_clave_ip(ip)) >= MAX_FAILS:
        return True
    return bool(user) and _recientes('u:' + user[:64]) >= MAX_FAILS_USER


def _note_failure(ip: str, user: str | None = None) -> None:
    _fails.setdefault(_clave_ip(ip), []).append(time.time())
    if user:
        _fails.setdefault('u:' + user[:64], []).append(time.time())


def check_password(user: str, password: str, ip: str = '-') -> bool:
    if locked_out(ip, user):
        return False
    digest = _stored_hash(user)
    # Se calcula igual aunque el usuario no exista, para no filtrar por tiempo
    # de respuesta cuales son validos: con un usuario inexistente se verifica
    # contra el primero del fichero (mismo tipo de hash, mismo coste) y se
    # da por fallido pase lo que pase.
    if digest is None:
        otro = _primer_usuario()
        if otro and (_stored_hash(otro) or '').startswith(('$2y$', '$2b$', '$2a$')):
            try:
                subprocess.run(['htpasswd', '-i', '-v', str(HTPASSWD), otro],
                               input=b'\x00' + password.encode(), capture_output=True, timeout=10)
            except (OSError, subprocess.TimeoutExpired):
                pass
            _note_failure(ip, user)
            return False
    reference = digest or '$apr1$xxxxxxxx$xxxxxxxxxxxxxxxxxxxxxx'
    # bcrypt (htpasswd -B): mucho mas lento de romper que apr1, que es MD5. Lo
    # verifica htpasswd leyendo la contrasena por stdin (nunca en la linea de
    # ordenes, donde la veria cualquiera con ps).
    if reference.startswith(('$2y$', '$2b$', '$2a$')):
        try:
            out = subprocess.run(['htpasswd', '-i', '-v', str(HTPASSWD), user],
                                 input=password.encode(), capture_output=True, timeout=10)
            ok = out.returncode == 0
        except (OSError, subprocess.TimeoutExpired):
            ok = False
        if ok:
            _fails.pop(_clave_ip(ip), None)
        else:
            _note_failure(ip, user)
        return ok
    parts = reference.split('$')
    if len(parts) < 4 or parts[1] != 'apr1':
        _note_failure(ip, user)
        return False
    salt = parts[2]
    try:
        out = subprocess.run(
            ['openssl', 'passwd', '-apr1', '-salt', salt, '-stdin'],
            input=password.encode(), capture_output=True, timeout=5)
    except (OSError, subprocess.TimeoutExpired):
        _note_failure(ip, user)
        return False
    calculated = out.stdout.decode().strip()
    ok = bool(digest) and hmac.compare_digest(calculated, reference)
    if not ok:
        _note_failure(ip, user)
    else:
        _fails.pop(_clave_ip(ip), None)
    return ok


def _huella(cookie: str) -> str:
    return hashlib.sha256(cookie.encode()).hexdigest()


def _revocadas() -> dict:
    try:
        return json.loads(REVOKED_FILE.read_text())
    except (OSError, ValueError):
        return {}


def revoke(cookie: str | None) -> None:
    """Cerrar sesión anula esa cookie en el servidor (antes solo se borraba en el navegador)."""
    if not cookie:
        return
    try:
        expiry = int(base64.urlsafe_b64decode(cookie.encode()).decode().rsplit('|', 2)[1])
    except Exception:
        return
    now = time.time()
    vivas = {h: e for h, e in _revocadas().items() if e > now}
    vivas[_huella(cookie)] = expiry
    tmp = REVOKED_FILE.with_suffix('.tmp')
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as fh:
        json.dump(vivas, fh)
    os.replace(tmp, REVOKED_FILE)


def make_session(user: str) -> str:
    expiry = int(time.time() + SESSION_HOURS * 3600)
    payload = f'{user}|{expiry}'
    sig = _firma(user, expiry)
    token = payload.encode() + b'|' + base64.urlsafe_b64encode(sig)
    return base64.urlsafe_b64encode(token).decode()


def read_session(cookie: str | None, max_age_s: float | None = None) -> str | None:
    """Devuelve el usuario si la sesion es valida y no ha caducado.

    max_age_s: además, que no se abriera hace más de eso (la terminal con sudo
    pide una sesión reciente aunque la del panel dure días)."""
    if not cookie:
        return None
    try:
        raw = base64.urlsafe_b64decode(cookie.encode()).decode()
        user, expiry_s, sig_s = raw.rsplit('|', 2)
        expiry = int(expiry_s)
    except Exception:
        return None
    if time.time() > expiry:
        return None
    if max_age_s is not None and time.time() - (expiry - SESSION_HOURS * 3600) > max_age_s:
        return None
    expected = _firma(user, expiry)
    try:
        given = base64.urlsafe_b64decode(sig_s.encode())
    except Exception:
        return None
    if not hmac.compare_digest(expected, given):
        return None
    if _huella(cookie) in _revocadas():
        return None
    # Borrar a alguien del htpasswd tiene que echarlo ya, no a los 7 dias.
    if _stored_hash(user) is None:
        return None
    return user


def session_info(cookie: str | None) -> dict | None:
    """{'user','abierta','caduca'} (segundos Unix) si la sesion vale; para «Tu sesion» en Gestion."""
    user = read_session(cookie)
    if not user:
        return None
    try:
        expiry = int(base64.urlsafe_b64decode(cookie.encode()).decode().rsplit('|', 2)[1])
    except Exception:
        return None
    return {'user': user, 'caduca': expiry, 'abierta': expiry - int(SESSION_HOURS * 3600)}


def cookie_max_age() -> int:
    return int(SESSION_HOURS * 3600)
