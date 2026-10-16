#!/usr/bin/env python3
"""Guardia antes de cada push: falla si el repo lleva datos de un despliegue real.

Busca formas, no datos concretos (este fichero es publico): IP privadas,
coordenadas con muchos decimales y ficheros de configuracion propios. Los
valores de ejemplo de config.example.js (Madrid, 40.4/-3.7) estan permitidos.
Uso: python tools/check_privado.py   (sale con 1 si encuentra algo)
"""
import re, subprocess, sys

PATRONES = {
    'IP privada': re.compile(r'\b(192\.168|10\.\d{1,3}|172\.(1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b'),
    'coordenada precisa': re.compile(r'(?<![\d.])-?[1-9]\d?\.\d{4,}(?![\d])'),
    'enlace de invitacion': re.compile(r't\.me/\+|chat\.whatsapp\.com/'),
}
PERMITIDO = re.compile(r'(?<![\d.])-?(40\.4|3\.7)\d*')   # ejemplo de config.example.js
NUNCA = ['config.js']

ficheros = subprocess.run(['git', 'ls-files'], capture_output=True, text=True, check=True).stdout.split()
fallos = [f'{f}: fichero de configuracion propio' for f in ficheros if f.split('/')[-1] in NUNCA]
for f in ficheros:
    if f == 'tools/check_privado.py' or f.endswith(('.png', '.jpg', '.uf2')):
        continue
    try:
        lineas = open(f, encoding='utf-8').read().splitlines()
    except (UnicodeDecodeError, FileNotFoundError):
        continue
    for n, linea in enumerate(lineas, 1):
        for nombre, rx in PATRONES.items():
            for m in rx.finditer(linea):
                if nombre == 'coordenada precisa' and PERMITIDO.fullmatch(m.group()):
                    continue
                fallos.append(f'{f}:{n}: {nombre}: {m.group()}')
print('\n'.join(fallos) if fallos else 'OK: sin datos de despliegue a la vista')
sys.exit(1 if fallos else 0)
