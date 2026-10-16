"""El login acepta hashes bcrypt de htpasswd (-B) y sigue aceptando apr1."""
import os, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
d = tempfile.mkdtemp()
f = os.path.join(d, 'htpasswd')
os.environ['MESHCORE_HTPASSWD'] = f
os.environ['MESHCORE_SESSION_SECRET_FILE'] = os.path.join(d, 'secreto')
import meshcore_auth as a

# Usuario con bcrypt y otro con apr1 (contrasenas de prueba, no reales).
subprocess.run(['htpasswd', '-B', '-b', '-c', f, 'nuevo', 'prueba-bcrypt'], check=True, capture_output=True)
apr1 = subprocess.run(['openssl', 'passwd', '-apr1', 'prueba-apr1'], capture_output=True, check=True).stdout.decode().strip()
open(f, 'a').write('viejo:' + apr1 + '\n')

assert a.check_password('nuevo', 'prueba-bcrypt', '203.0.113.1')
assert not a.check_password('nuevo', 'mal', '203.0.113.2')
assert a.check_password('viejo', 'prueba-apr1', '203.0.113.3')
assert not a.check_password('nadie', 'prueba-bcrypt', '203.0.113.4')
# El bloqueo por IP sigue valiendo con bcrypt
for _ in range(a.MAX_FAILS):
    a.check_password('nuevo', 'mal', '203.0.113.9')
assert not a.check_password('nuevo', 'prueba-bcrypt', '203.0.113.9'), 'bloqueo ignorado'
print('OK bcrypt + apr1 + bloqueo')
