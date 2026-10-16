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
import os
import secrets
import subprocess
import time
from pathlib import Path

HTPASSWD = Path(os.getenv('MESHCORE_HTPASSWD', '/etc/nginx/meshcore-tls/htpasswd'))
SECRET_FILE = Path(os.getenv('MESHCORE_SESSION_SECRET_FILE',
                             str(Path.home() / '.meshcore-session-secret')))
COOKIE_NAME = 'meshcore_session'
SESSION_HOURS = float(os.getenv('MESHCORE_SESSION_HOURS', '720'))  # 30 dias

# Freno simple a la fuerza bruta: no es un sistema anti-DDoS, solo evita que se
# puedan probar miles de contrasenas por segundo contra un hash apr1.
MAX_FAILS = 8
LOCKOUT_SECONDS = 300
_fails: dict[str, list[float]] = {}


def _secret() -> bytes:
    if SECRET_FILE.exists():
        raw = SECRET_FILE.read_bytes().strip()
        if raw:
            return raw
    raw = secrets.token_bytes(32)
    SECRET_FILE.parent.mkdir(parents=True, exist_ok=True)
    # 0o600 desde la creacion: con write+chmod habia un instante legible por todos.
    fd = os.open(SECRET_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'wb') as fh:
        fh.write(raw)
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


def locked_out(ip: str) -> bool:
    now = time.time()
    recent = [t for t in _fails.get(ip, []) if now - t < LOCKOUT_SECONDS]
    _fails[ip] = recent
    return len(recent) >= MAX_FAILS


def _note_failure(ip: str) -> None:
    _fails.setdefault(ip, []).append(time.time())


def check_password(user: str, password: str, ip: str = '-') -> bool:
    if locked_out(ip):
        return False
    digest = _stored_hash(user)
    # Se calcula igual aunque el usuario no exista, para no filtrar por tiempo
    # de respuesta cuales son validos.
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
            _fails.pop(ip, None)
        else:
            _note_failure(ip)
        return ok
    parts = reference.split('$')
    if len(parts) < 4 or parts[1] != 'apr1':
        _note_failure(ip)
        return False
    salt = parts[2]
    try:
        out = subprocess.run(
            ['openssl', 'passwd', '-apr1', '-salt', salt, '-stdin'],
            input=password.encode(), capture_output=True, timeout=5)
    except (OSError, subprocess.TimeoutExpired):
        _note_failure(ip)
        return False
    calculated = out.stdout.decode().strip()
    ok = bool(digest) and hmac.compare_digest(calculated, reference)
    if not ok:
        _note_failure(ip)
    else:
        _fails.pop(ip, None)
    return ok


def make_session(user: str) -> str:
    expiry = int(time.time() + SESSION_HOURS * 3600)
    payload = f'{user}|{expiry}'
    sig = hmac.new(_secret(), payload.encode(), hashlib.sha256).digest()
    token = payload.encode() + b'|' + base64.urlsafe_b64encode(sig)
    return base64.urlsafe_b64encode(token).decode()


def read_session(cookie: str | None) -> str | None:
    """Devuelve el usuario si la sesion es valida y no ha caducado."""
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
    payload = f'{user}|{expiry}'
    expected = hmac.new(_secret(), payload.encode(), hashlib.sha256).digest()
    try:
        given = base64.urlsafe_b64decode(sig_s.encode())
    except Exception:
        return None
    if not hmac.compare_digest(expected, given):
        return None
    # Borrar a alguien del htpasswd tiene que echarlo ya, no a los 30 dias.
    if _stored_hash(user) is None:
        return None
    return user


def cookie_max_age() -> int:
    return int(SESSION_HOURS * 3600)
