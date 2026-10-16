#!/usr/bin/env python3
"""Comprueba que todo #id fijo que usa el JS existe en el HTML.

Uso: python3 tools/check-ids.py dashboard.html bridge/meshcore-ble-gateway.js
Sale con codigo 1 si hay referencias rotas. Pasarlo antes de desplegar: al
redisenar Equipos desaparecieron card-w1/card-w2/card-rak, el JS los seguia
buscando y el panel entero dejaba de actualizarse sin ningun aviso.
"""
import re
import sys

html = open(sys.argv[1], encoding='utf-8').read()
js = ''.join(open(p, encoding='utf-8').read() for p in sys.argv[2:])
todo = html + js
ids = set(re.findall(r'\bid="([^"]+)"', html))
ids |= set(re.findall(r"id=\\?['\"]([\w-]+)\\?['\"]", todo))

rotos = []
for m in re.finditer(r"""(\$\(|querySelector\(|getElementById\()\s*['"](#?)([\w-]+)['"]\s*\)""", todo):
    fn, almohadilla, ref = m.groups()
    if fn != 'getElementById(' and not almohadilla:
        continue
    if ref not in ids:
        rotos.append(f'#{ref}  (linea {todo[:m.start()].count(chr(10)) + 1})')

# Selectores armados con una variable: '#w'+idx+'-log', '#card-w'+idx...
vistos = set()
for m in re.finditer(r"\$\('#([\w-]*)'\s*\+\s*(\w+)\s*(?:\+\s*'([\w-]*)')?\)", todo):
    pre, var, suf = m.group(1), m.group(2), m.group(3) or ''
    if any(pre + v + suf in ids for v in ('1', '2', 'rak')) or (pre, suf) in vistos:
        continue
    vistos.add((pre, suf))
    rotos.append(f'#{pre}<{var}>{suf}  (linea {todo[:m.start()].count(chr(10)) + 1})')

for r in rotos:
    print('ROTO', r)
print('referencias rotas:', len(rotos))
sys.exit(1 if rotos else 0)
