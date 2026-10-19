# Cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versiones
según [SemVer](https://semver.org/lang/es/).

## [1.21.0] - 2026-10-19

### Cambiado
- Teléfono: la hoja del Panel se arrastra con una barra y se queda en cuatro
  alturas (mínima con solo las fichas, baja, media y alta, siempre por debajo
  de la pastilla de arriba); tocar la barra va pasando de una a otra.
- «¿Qué significa cada dato?»: una línea por dato con su resumen y la
  explicación completa al pulsarlo.
- Red y notas: cada apartado plegado con su título y subtítulo (el primero
  abierto); el índice abre directamente el suyo.

## [1.20.1] - 2026-10-19

### Corregido
- Chat: los mensajes recibidos van pegados a la izquierda (arrastraban el
  hueco del círculo de la inicial, quitado antes).

### Cambiado
- Teléfono: la caja de escribir del chat cabe en una fila (canal, texto y
  Enviar) y en Analítica la cifra impar ocupa la fila entera.

## [1.20.0] - 2026-10-19

### Cambiado
- La ficha «Mapa» del panel pasa a llamarse «Ajustes del mapa» («Ajustes»
  en el teléfono) y se ordena en tres bloques: «Qué se ve en el mapa»,
  «Vecinos (lo que oyen tus WIO)», con un solo «Actualizar vecinos» por el
  WIO conectado y la tabla, el grafo, el CSV y las regiones juntos, y
  «Enlace con un nodo», con el traceroute y medir distancia. «Datos de la
  estación» pasa a la ficha del repetidor.
- Teléfono: el índice de Red y notas es una fila de botones en vez de ocupar
  la primera pantalla, y la página ya no se sale por la derecha.

### Corregido
- El mapa dejaba rectángulos negros al cambiar de ficha o al abrir la hoja
  en el teléfono: ahora se recoloca.
- Red y notas ya no remite a las pestañas «Equipos y Mapa», que no existen.

## [1.19.0] - 2026-10-19

### Añadido
- Botón en la ficha de cada WIO: «Lo he apagado: deja de buscarlo» y «Lo he
  encendido: búscalo». El relay deja ese companion en pausa (sin escanear ni
  competir por el Bluetooth) y lo recuerda tras reiniciar
  (~/.meshcore-relay-pausa.json); un WIO en pausa se ve en gris, no como
  error. Ruta nueva POST /api/ble/wio/{1|2}/pausa.

## [1.18.0] - 2026-10-19

### Cambiado
- Un companion que el relay no tiene configurado ya no aparece en el panel
  (ni pestaña, ni fila de estado, ni opciones): con uno solo no se ven
  errores falsos.
- Repetidor más claro: «Leer el repetidor (estado, telemetría, histórico)» y
  «Cambiar el repetidor (con su contraseña de admin)», y la caja de
  respuestas debajo de ambos, con su título.
- Fuera el botón «Exportar clave» de los WIO (desactivado por defecto desde
  1.4.1) y la ayuda de la batería ya no da por hecho una placa solar.

## [1.17.2] - 2026-10-19

### Corregido
- El relay se arregla solo cuando un companion conecta pero «no tiene» el
  servicio de MeshCore: siempre lee los servicios del propio aparato (no la
  copia que guarda Windows) y, cada 3 fallos seguidos, rehace el
  emparejamiento con el PIN sin que haya que tocar nada.

## [1.17.1] - 2026-10-19

### Corregido
- Relay: si el companion conecta pero no aparece el servicio de MeshCore
  (Characteristic 6e400003… was not found), el motivo lo explica y dice qué
  hacer (apagar y encender; si sigue, volver a emparejar en Windows).
- README al día: la pestaña Equipos es ahora el Panel con el mapa dentro, y
  «Problemas comunes» cubre el servicio BLE no encontrado, el PIN que no
  empareja y el repetidor «sin señal».

## [1.17.0] - 2026-10-19

### Añadido
- Temperatura de la caja del repetidor en el Panel, leída de Home Assistant
  por el gateway (ruta /api/ble/caja, protegida, consulta cada 60 s):
  verde por debajo de 40 °C, ámbar desde 40 °C o con el USB cortado, rojo
  desde 45 °C. Si el USB de la regleta está apagado, el mapa lo marca junto al
  repetidor. Opcional: MESHCORE_HA_URL, MESHCORE_HA_TOKEN, MESHCORE_HA_CAJA
  (sensor de temperatura) y MESHCORE_HA_USB (enchufe que alimenta la caja);
  sin ellas la métrica no aparece.

## [1.16.0] - 2026-10-18

### Cambiado
- Panel y mapa en uno: el mapa completo (capas, líneas de enlace, traceroute)
  es el fondo del Panel, y sus capas y herramientas (vecinos por radio,
  análisis de enlace, alcance, herramientas) están en la pestaña «Mapa» del
  panel izquierdo. Se quita la pestaña Mapa de arriba.
- Los paneles laterales suben a la altura de la pastilla superior; en el
  teléfono el panel es una hoja inferior y se quitan controles que estorban.
- Chat: pulsar un mensaje lleva el mapa al nodo que lo envió (saltos y
  distancia a tu repetidor); si no anuncia posición, el chat lo dice.

## [1.15.0] - 2026-10-18

### Cambiado
- Sin barra superior: la marca y las pestañas van en una pastilla centrada
  que flota sobre el contenido; fuera el subtítulo.
- La pestaña Equipos pasa a llamarse Panel.
- Barras laterales flotantes en Mapa y Red y notas, como los paneles del
  Panel; el chat integra su lista de canales y contactos sin caja dentro de
  caja.

## [1.14.0] - 2026-10-18

### Cambiado
- Chat sobre el mapa: el mismo mapa de Equipos de fondo y la conversación
  (canales, privados y contactos) flotando a la derecha; en el móvil, hoja
  inferior.
- Cabecera del diseño nuevo: pestañas en pastillas, la activa resaltada.
- Si el repetidor lleva más de una hora sin medirse, en el mapa su icono y su
  etiqueta pasan a ámbar («sin señal del repetidor · hace X») y las líneas a
  los vecinos se vuelven grises y discontinuas.

### Corregido
- En Red y notas los enlaces de la barra lateral ya no muestran interruptores.

## [1.13.0] - 2026-10-18

### Cambiado
- Equipos sobre el mapa: el mapa (mismos fondos de Esri e iconos) llena la
  pestaña con el repetidor, los WIO y los vecinos coloreados por saltos, y
  encima flotan el panel del repetidor/WIO (con su diagnóstico y gestión
  remota de siempre), el estado y la leyenda. En el móvil el panel es una
  hoja inferior. El mapa completo con sus herramientas sigue en Mapa.

## [1.12.1] - 2026-10-17

### Quitado
- La portada de `docs/` (1.12.0): el proyecto se presenta en el propio
  repositorio. Queda en el historial de git.

## [1.12.0] - 2026-10-17

### Añadido
- Portada del proyecto en `docs/index.html` (lista para GitHub Pages): qué
  es, cómo llega la señal del navegador al mástil, qué hace, las pestañas con
  capturas reales, la instalación y las preguntas frecuentes. Incluye la
  comprobación de duty cycle legal (ERC 70-03) con la misma cuenta que el
  panel. Hecha con taste-skill; fotos de Wikimedia Commons con su crédito.

## [1.11.1] - 2026-10-17

### Corregido
- Un WIO enlazado por Bluetooth que no contesta a los comandos ya no sale
  en verde con «Conectado por el PC»: el punto se pone ámbar, el estado dice
  «Enlazado, pero no contesta (reintentando)» y el registro explica qué hacer.
- La lectura automática de cada WIO se guarda: al recargar ya no vuelve el
  «último estado conocido (hace 29 días)» si el WIO está vivo.
- La barra de estado busca cada WIO por su número (un solo companion).

## [1.11.0] - 2026-10-17

### Cambiado
- Equipos: junto a «Conectar» se ve el motivo real que da el relay
  («Sin conectar: no empareja con el PIN…», «no responde…»), en ámbar si hay
  problema, en vez de «Sin enlace (puente)». Barra de estado sin
  separadores desiguales en el móvil.

### Corregido
- Relay: si el emparejamiento con PIN falla, el motivo lo dice (quitar el
  WIO del Bluetooth de Windows y volver a emparejarlo) en vez de «no
  responde: ¿apagado o sin batería?».
- El panel busca cada WIO por su número en el estado del relay: con un solo
  companion configurado ya no se cruzaban.

## [1.10.0] - 2026-10-17

### Cambiado
- Revisión con el linter y el inspector de taste-skill, aplicando lo que
  vale para un panel: sin sombras en reposo ni línea bajo la cabecera,
  monoespaciada solo en las salidas reales (ahora `<pre>`), ningún texto por
  debajo de 13 px, más contraste en los textos secundarios, sin emoji en los
  avisos («Bien:» / «Ojo:» en la comprobación legal) y 100dvh en móvil.
- Fuera el recordatorio de exportar la clave del WIO: está desactivado por
  defecto desde 1.4.1.

## [1.9.2] - 2026-10-17

### Cambiado
- Sin recuadros de 1 px ni líneas separadoras: tarjetas, métricas, barra de
  estado y barra del chat se separan por un escalón de tono. El contador del
  chat deja la monoespaciada. Lo elegido en la barra del chat se marca en
  tono neutro, no morado.

## [1.9.1] - 2026-10-17

### Corregido
- Si la medida del repetidor falla (p. ej. justo tras arrancar todavía no
  hay WIO conectado), se reintenta cada minuto en vez de esperar 15.

## [1.9.0] - 2026-10-17

### Cambiado
- Barra lateral del chat más clara: arriba los canales (Todo, Public,
  Canal 1, Canal 2), debajo solo las conversaciones privadas, y el resto de
  contactos solo al buscar. Lo que eliges queda marcado, filtra el chat
  (pulsar un privado muestra solo esa conversación) y es el destino del
  mensaje.

### Corregido
- El gateway pregunta al repetidor al minuto de arrancar. Antes esperaba
  15 min y cada reinicio volvía a empezar la cuenta: un día con varios
  despliegues se quedó 23 h sin medir.

## [1.8.0] - 2026-10-17

### Añadido
- Contactos del chat como lista de conversaciones: arriba quien te ha
  escrito o a quien escribiste, con el último mensaje («Tú: …») y la hora;
  se actualiza al recibir o enviar un privado.

## [1.7.0] - 2026-10-17

### Seguridad
- MESHCORE_ALLOWED_IPS: el puerto del gateway solo atiende a esas IP (el PC
  del relay) y a la propia Pi. El resto de la red recibe 403 aunque tenga el
  token. El README explica qué cambiar si se cambia de PC.

### Cambiado
- MESHCORE_ALERT_STALE_HOURS=0 apaga el aviso de «sin datos del repetidor».

## [1.6.0] - 2026-10-17

### Añadido
- Chat: columna de contactos con buscador (en pantallas anchas). Pulsar un
  contacto lo pone como destino privado y queda marcado. Los repetidores no
  salen como destino: a ellos se les habla por la gestión remota.

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
