# Cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versiones
según [SemVer](https://semver.org/lang/es/).

## [1.1.3] - 2026-10-17

### Cambiado
- Mapa: los marcadores son puntos lisos del color de cada tipo, sin emoji;
  la leyenda igual. Tu repetidor se ve algo más grande.

## [1.1.2] - 2026-10-17

### Cambiado
- Fuera los emoji de botones, títulos y capas del mapa, y los cuadros de
  icono de Equipos. El filtro por WIO del chat se oculta (casi nunca hacía
  falta). Capturas del README al día.

## [1.1.1] - 2026-10-16

### Cambiado
- Aspecto más sobrio: sin cuadros de icono, sin franjas laterales ni sombras
  flotantes. Los botones del chat llevan texto (Descargar, Borrar, Ampliar)
  y desaparece el atajo a Analítica desde el chat.
- El repositorio pasa a llamarse Panel-Meshcore.

## [1.1.0] - 2026-10-16

### Cambiado
- Piel nueva del panel: tipografía y colores coherentes, pestañas más limpias,
  métricas legibles, chat tipo mensajería (mensajes seguidos agrupados,
  compositor fijo), mapa con interruptores de capas y popups con el tema,
  analítica con gráficas más finas.

### Corregido
- El relay se quedaba en «error» tras un timeout y el gateway dejaba de
  preguntar al repetidor para siempre: «conectado» refleja ahora el enlace
  Bluetooth real.
- Motivo legible si el Bluetooth del PC está apagado o no hay adaptador.

## [1.0.1] - 2026-10-16

### Corregido
- Sesiones que a veces no valían recién creadas (~5 % de las veces): el
  secreto de sesión se guarda ahora en hexadecimal; al releer los antiguos en
  bruto se recortaban bytes de los extremos. Los secretos ya existentes se
  siguen leyendo igual, nadie pierde la sesión.

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
