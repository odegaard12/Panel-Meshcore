"""La web app: manifiesto válido, iconos con su tamaño y un service worker que no guarda nada."""
import json
import os
import struct
import sys

raiz = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'pwa')
m = json.load(open(os.path.join(raiz, 'manifest.webmanifest'), encoding='utf-8'))
assert m['display'] == 'standalone' and m['start_url'] == '/' and m['icons'], m


def tam(png):
    with open(png, 'rb') as f:
        cab = f.read(24)
    assert cab[:8] == b'\x89PNG\r\n\x1a\n', png
    return struct.unpack('>II', cab[16:24])


for ic in m['icons']:
    w, h = ic['sizes'].split('x')
    assert tam(os.path.join(raiz, ic['src'].lstrip('/'))) == (int(w), int(h)), ic
assert tam(os.path.join(raiz, 'apple-touch-icon.png')) == (180, 180)
sw = open(os.path.join(raiz, 'sw.js'), encoding='utf-8').read()
assert 'caches' not in sw and '/api' not in sw, 'el worker no debe guardar ni tocar la API'
print('pwa OK')
