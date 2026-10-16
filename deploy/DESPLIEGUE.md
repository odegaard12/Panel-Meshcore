# Despliegue en Raspberry Pi

Probado en una Raspberry Pi 4B con Debian 13 (trixie), headless. Puede compartir la Pi con
otros servicios. La Pi no usa Bluetooth: el gateway solo recibe al relay del PC.

## Servicios y puertos

| Servicio | Puerto | Función |
|---|---|---|
| `nginx` | **443** | TLS + login del panel (auth_request contra el gateway). Única vía al panel |
| `nginx` | **7443** | TLS + el mismo login delante de la terminal web |
| `meshcore-panel` | 8765 (solo `127.0.0.1`) | `http.server` que entrega `www/`. Detrás de nginx |
| `meshcore-ble-gateway` | 8780 (`MESHCORE_BIND`) | API, histórico, registro de radio y login. Exige `X-MeshCore-Token` (el relay entra directo; el resto, por nginx) |
| `meshcore-terminal` | 7681 (solo `127.0.0.1`) | `ttyd`: shell de la Pi. Solo por nginx 7443 |

Pensado para tu red local. Si lo expones a internet, ponlo detrás de una capa de acceso
(VPN, Cloudflare Access...): la terminal da acceso total a la Pi.

### `MESHCORE_BIND`

Dirección en la que escucha el gateway (variable de entorno del servicio
`meshcore-ble-gateway`). El relay del PC tiene que llegar a ella, así que por defecto escucha
en la LAN. Si el relay entra por un túnel o VPN que termina en la propia Pi, ponla en
`127.0.0.1` y el puerto 8780 deja de verse desde la red:

```bash
sudo systemctl edit meshcore-ble-gateway    # [Service] Environment=MESHCORE_BIND=127.0.0.1
sudo systemctl restart meshcore-ble-gateway
```

## Seguridad

- **Login**: `bridge/meshcore_auth.py` valida contra `/etc/nginx/meshcore-tls/htpasswd`
  (bcrypt `$2y$` o apr1) y firma una cookie de sesión (HMAC-SHA256, 30 días). Bloqueo de 5 min
  tras 8 fallos por IP, y nginx limita el login a 10 intentos/min por IP (429). Las sesiones de
  un usuario caducan al borrarlo del `htpasswd`.
- **La misma cookie vale para la terminal** (las cookies no distinguen puertos).
- **Cuidado con la terminal**: el shell es de tu usuario; si tiene `sudo` sin contraseña, quien
  entre controla la Pi. `ttyd` corre con `-O` (check-origin): solo acepta WebSocket del mismo
  origen.
- **Cabeceras** en panel y terminal: `Content-Security-Policy`, `Strict-Transport-Security`
  (HSTS), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`. Leaflet se carga con SRI.
- **`client_max_body_size`** acotado en nginx: no acepta cuerpos grandes.
- **`X-Real-IP`** solo se cree si la petición viene de nginx (127.0.0.1); desde fuera se ignora,
  así no se puede falsear la IP para saltarse el bloqueo de login.
- El token del gateway solo se acepta por cabecera (nunca `?token=`, acabaría en logs).
- Comandos al repetidor filtrados por `politica_cli` (catálogo, límites legales con validación
  numérica estricta y confirmación). Los comandos crudos pasan por una allowlist.
- Todo texto que llega de la radio se escapa antes de pintarlo; la exportación CSV neutraliza
  fórmulas.
- No hay base de datos SQL: histórico, registro de radio y sesiones son ficheros.

Cambiar la contraseña (bcrypt; la pide por teclado, no queda en `ps` ni en el historial):
```bash
sudo htpasswd -B /etc/nginx/meshcore-tls/htpasswd TU_USUARIO
```

## Estructura en la Pi

```
~/panel-meshcore/                   <- el repo
~/meshcore-panel/www/
  index.html                        <- copia de dashboard.html
  config.js                         <- TU configuración (no va al repo)
  login.html, *.js
~/.meshcore-ble-token               <- token del gateway (600)
~/.meshcore-history.jsonl           <- histórico del repetidor (cada 15 min)
~/.meshcore-rxlog.jsonl             <- registro de radio (últimos 4000 paquetes)
/etc/nginx/meshcore-tls/            <- cert, key y htpasswd
```

## Detalles que costaron

- **Una config de nginx vacía es válida**: por eso `apply-nginx.sh` comprueba el contenido
  antes y el servicio después, con backup y vuelta atrás.
- **El companion necesita el saludo `APP_START`** tras reiniciarse para mandar avisos; el
  gateway lo envía antes de cada medida, así el histórico no depende de tener el panel abierto.
- **Bluetooth con PIN**: el firmware companion exige emparejar con PIN (123456 de fábrica);
  el relay lo hace con WinRT. Sin PIN el UART da `Insufficient Authentication`.
- **Un solo relay a la vez**: con dos, el gateway echa al anterior cada vez que entra el otro.
- **`ttyd` no está en apt de Debian 13**: se instala el binario estático de las releases.

## Actualizar

Desde la Pi, en el repo: `git pull`, `cp dashboard.html ~/meshcore-panel/www/index.html`
(y los `bridge/*.js` a `www/`). nginx o el gateway solo si cambian:
`bash deploy/apply-nginx.sh` / `sudo systemctl restart meshcore-ble-gateway`.

## Diagnóstico

```bash
systemctl is-active meshcore-panel meshcore-ble-gateway meshcore-terminal nginx
curl -s http://127.0.0.1:8780/healthz          # "relay": true si el PC está enganchado
sudo ss -tlnp | grep -E ':7681|:8765|:7443'    # ttyd y http.server solo en 127.0.0.1
tail -3 ~/.meshcore-history.jsonl               # últimas medidas del repetidor
```
