# Cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versiones
según [SemVer](https://semver.org/lang/es/).

## [1.5.0] - 2026-10-17

### Añadido
- Chat: mensajes privados. El selector de destino lista los contactos que
  conocen los WIO («Privado a…»), y pulsar un privado recibido prepara la
  respuesta a esa persona.
- Los privados recibidos muestran el nombre del contacto en vez de los
  primeros caracteres de su clave.

## [1.4.1] - 2026-10-17

### Seguridad
- Exportar la clave privada de un WIO desde el panel queda desactivado por
  defecto (con la cookie o el token bastaba para sacarla). Se reactiva con
  MESHCORE_ALLOW_KEY_EXPORT=1 en el gateway.
- La sesión del panel dura 7 días en vez de 30 (MESHCORE_SESSION_HOURS).
- El comando CLI remoto se envía tal cual se ha comprobado, sin espacios
  delante que la política no veía.

## [1.4.0] - 2026-10-17

### Cambiado
- Los archivos pierden el número de versión en el nombre:
  `bridge/meshcore_ble_gateway.py` y `bridge/meshcore_ble_relay.py`.
  Los nombres viejos (`_v3`, `_v2`) se quedan como puente que lanza los
  nuevos, así que los servicios y tareas ya instalados siguen funcionando.

## [1.3.1] - 2026-10-17

### Seguridad
- El instalador verifica por defecto el sha256 oficial de ttyd 1.7.7: si la
  descarga no coincide, se para.

## [1.3.0] - 2026-10-17

### Añadido
- Avisos por ntfy desde el gateway: batería del repetidor baja
  (MESHCORE_ALERT_BAT_MV, 3800 por defecto) o sin datos del repetidor
  (MESHCORE_ALERT_STALE_HOURS, 3 h). Un aviso al empezar y otro al resolverse,
  sin repetirse aunque se reinicie el gateway. Apagado si no hay
  MESHCORE_NTFY_URL (URL completa del tema; token opcional en
  MESHCORE_NTFY_TOKEN).

## [1.2.1] - 2026-10-17

### Cambiado
- El segundo companion es opcional: con MESHCORE_WIO2_NAME vacío el relay
  ni lo busca, y un comando a un WIO no configurado da un error claro.

## [1.2.0] - 2026-10-17

### Cambiado
- Chat: se envía por el WIO que esté conectado, sin tener que elegirlo;
  en el compositor solo queda el canal.
- Analítica: menos colores. SNR en rojo/ámbar/verde, actividad en gris con
  las 3 horas de más tráfico en ámbar, saltos en dos tonos.

## [1.1.4] - 2026-10-17

### Cambiado
- Vuelven los iconos de antes en los marcadores y la leyenda del mapa.

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
