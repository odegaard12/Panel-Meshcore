# Cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versiones
según [SemVer](https://semver.org/lang/es/).

## [1.0.0] - 2026-10-16

Primera versión pública.

### Añadido

- **Equipos**: estado de companion y repetidor (batería con tendencia, duty cycle, ruido,
  paquetes), medido por radio cada 15 min aunque nadie tenga el panel abierto.
- **Gestión remota** del repetidor por LoRa con política legal: bloquea lo destructivo, pide
  confirmación en lo arriesgado y no deja salirse de la banda ERC/REC 70-03.
- **Chat** de canales y privados con historial.
- **Mapa**: vecinos, análisis de enlace con perfil y Fresnel, traceroute, grafo y regiones.
- **Analítica**: SNR/RSSI por paquete, actividad por hora e histórico.
- **Terminal** web opcional tras el mismo login.
- **Relay** BLE para PC con reconexión automática; el gateway de la Pi es solo relay.
- **Login** con bcrypt y cookie firmada.
- **`config.js` privado** fuera del repo y **guardia de privacidad** (`tools/check_privado.py`).

### Seguridad y correcciones de esta versión

- Token del gateway solo por cabecera, nunca en la URL.
- Límite de intentos de login.
- Cabeceras CSP y HSTS.
- Allowlist de comandos crudos al repetidor.
- Validación numérica estricta en los límites legales.
- Las sesiones caducan al borrar el usuario.
- SRI en Leaflet.
- `ttyd` con comprobación de origen.
- El relay no se cuelga con emparejamientos colgados ni se queda en error tras un timeout.
- Cola de avisos acotada.
- El chat vuelve tras reiniciar un companion.

[1.0.0]: https://github.com/odegaard12/panel-meshcore/releases/tag/v1.0.0
