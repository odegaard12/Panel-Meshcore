# Gateway y relay BLE de MeshCore

El navegador no usa Web Bluetooth: habla por HTTPS con el gateway de la Raspberry, y el
gateway habla con los companion a través del relay.

- **Gateway** (`meshcore_ble_gateway.py`, en la Pi): API, histórico, registro de radio y
  login. No abre Bluetooth: solo recibe al relay.
- **Relay** (`meshcore_ble_relay.py`, en un PC con Bluetooth cerca de los companion): es el
  único dueño de las conexiones BLE y las retransmite al gateway por WebSocket con token.
- Las conexiones siguen vivas aunque se cierre o recargue el navegador.

## Instalación en la Raspberry

```bash
cd ~/panel-meshcore
bash bridge/install-pi.sh
systemctl status meshcore-ble-gateway --no-pager
curl -s http://127.0.0.1:8780/healthz
```

El token queda en `~/.meshcore-ble-token`.

## Relay en Windows

Instala Python 3.11+, copia el token de la Pi a `%USERPROFILE%\.meshcore-ble-token`
(`scp usuario@<IP-de-tu-Pi>:~/.meshcore-ble-token $env:USERPROFILE\`) y, desde `bridge/`:

```powershell
.\install-windows.ps1
$env:MESHCORE_GATEWAY_WS = 'ws://<IP-de-tu-Pi>:8780/api/ble/relay'
$env:MESHCORE_WIO1_NAME  = 'nombre-BLE-del-companion-1'
.\instalar-vigilante.ps1
```

El vigilante se registra en el Programador de tareas y relanza el relay si cae.

## Relay en Linux/macOS

No hay tarea programada: lánzalo a mano o con tu propio servicio. Variables:
`MESHCORE_BLE_TOKEN`, `MESHCORE_GATEWAY_WS`, `MESHCORE_WIO1_NAME`, `MESHCORE_WIO2_NAME`
(ejemplo completo en el [README](../README.md#instalación)).

## Notas

- Un solo relay a la vez: si entra otro, el gateway echa al anterior.
- Los companion exigen emparejar con PIN (`123456` de fábrica). Sin PIN da
  `Insufficient Authentication`.
