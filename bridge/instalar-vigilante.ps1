# Instala en %LOCALAPPDATA%\PanelMeshCore el lanzador del relay y el
# vigilante, y registra la tarea programada que lo mantiene vivo: al iniciar
# sesion, al volver de suspension y cada 10 minutos.
#
# Lo ejecuta el usuario, no Claude: la app de Claude corre en un paquete MSIX
# y lo que escribe en AppData va a una copia virtual que el resto de Windows
# no ve (asi se perdieron los cambios de run-relay.ps1 del 24/09).
#
# Quitar la tarea:  Unregister-ScheduledTask -TaskName 'PanelMeshCore-Relay' -Confirm:$false
$ErrorActionPreference = 'Stop'
# Direccion del gateway de tu Pi (o MESHCORE_GATEWAY_WS en el entorno).
$GatewayWs = if ($env:MESHCORE_GATEWAY_WS) { $env:MESHCORE_GATEWAY_WS } else { 'ws://raspberrypi.local:8780/api/ble/relay' }
# Nombres BLE de tus WIO (MESHCORE_WIO1_NAME / MESHCORE_WIO2_NAME): se guardan en
# el lanzador para que el relay los encuentre aunque cambie su direccion.
$nombres = ''
foreach ($v in 'MESHCORE_WIO1_NAME', 'MESHCORE_WIO2_NAME') {
    $val = [Environment]::GetEnvironmentVariable($v)
    if ($val) { $nombres += "`$env:$v = '$val'`n" }
}
# Carpeta del lanzador (MESHCORE_RELAY_DIR para cambiarla): las apps empaquetadas
# (MSIX) escriben AppData en una copia virtual que el Programador de tareas no ve.
$dir    = if ($env:MESHCORE_RELAY_DIR) { $env:MESHCORE_RELAY_DIR } else { Join-Path $env:LOCALAPPDATA 'PanelMeshCore' }
$bridge = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = Join-Path $bridge '.venv\Scripts\python.exe'
$relay  = Join-Path $bridge 'meshcore_ble_relay.py'
New-Item -ItemType Directory -Force $dir | Out-Null

$run = @"
# Un solo relay a la vez: con dos (acceso Run + tarea al iniciar sesion, o dos
# vigilantes a la vez) se pelean por los WIO y el gateway va saltando de uno a otro.
`$unico = New-Object System.Threading.Mutex(`$false, 'Local\PanelMeshCoreRelay')
# Si el relay anterior murio de golpe el mutex queda abandonado: se hereda.
try { `$tengo = `$unico.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { `$tengo = `$true }
if (-not `$tengo) { exit }
`$ErrorActionPreference = 'Stop'
`$tokenPath = Join-Path `$env:USERPROFILE '.meshcore-ble-token'
`$env:MESHCORE_BLE_TOKEN = (Get-Content `$tokenPath -Raw).Trim()
`$env:MESHCORE_GATEWAY_WS = '$GatewayWs'
`$env:MESHCORE_BLE_PAIR = '1'
$nombres# El relay escribe su propio log UTF-8 con rotacion; aqui solo el supervisor.
`$env:MESHCORE_LOG_FILE = '$dir\relay.log'
`$sup = '$dir\relay-supervisor.log'
if ((Test-Path `$sup) -and ((Get-Item `$sup).Length -gt 2MB)) { Remove-Item `$sup -Force }
`$ErrorActionPreference = 'Continue'
while (`$true) {
    "`$(Get-Date -Format o) [supervisor] arrancando relay" | Add-Content -Path `$sup -Encoding UTF8
    & '$python' '$relay' 2>&1 | Out-File -FilePath `$sup -Append -Encoding utf8
    "`$(Get-Date -Format o) [supervisor] el relay termino (exit `$LASTEXITCODE), relanzando en 5s" | Add-Content -Path `$sup -Encoding UTF8
    Start-Sleep -Seconds 5
}
"@
Set-Content -Path "$dir\run-relay.ps1" -Value $run -Encoding UTF8
Set-Content -Path "$dir\run-relay.cmd" -Encoding ASCII -Value @(
    '@echo off'
    "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$dir\run-relay.ps1`""
)

$ensure = @"
# Arranca el relay solo si no esta ya corriendo. Se mira tambien el supervisor
# (run-relay): entre dos reintentos python no existe durante 5 s y sin esto se
# arrancaria un segundo relay en paralelo.
`$vivo = Get-CimInstance Win32_Process | Where-Object { `$_.CommandLine -and (`$_.CommandLine -match 'meshcore_ble_relay|run-relay') -and `$_.ProcessId -ne `$PID }
if (-not `$vivo) {
    "`$(Get-Date -Format o) [vigilante] relay caido, arrancando" | Add-Content -Path '$dir\relay-supervisor.log' -Encoding UTF8
    Start-Process -FilePath '$dir\run-relay.cmd' -WindowStyle Hidden
}
"@
Set-Content -Path "$dir\ensure-relay.ps1" -Value $ensure -Encoding UTF8
# powershell.exe con -WindowStyle Hidden aun enseña la consola ~1 s cada vez
# que la tarea lo lanza (cada 10 min). wscript no abre ventana y arranca
# PowerShell ya oculto (estilo 0).
Set-Content -Path "$dir\ensure-relay.vbs" -Encoding ASCII -Value (
    'CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""' +
    "$dir\ensure-relay.ps1" + '""", 0, False')

$u = "$env:USERDOMAIN\$env:USERNAME"
$accion = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "//B //Nologo `"$dir\ensure-relay.vbs`""
$tLogon = New-ScheduledTaskTrigger -AtLogOn -User $u
$tCada10 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 10)
# Vuelta de suspension moderna (Kernel-Power 507) o clasica (Power-Troubleshooter 1).
$cls = Get-CimClass -ClassName MSFT_TaskEventTrigger -Namespace Root/Microsoft/Windows/TaskScheduler
$sub = '<QueryList><Query Id="0" Path="System"><Select Path="System">*[System[(Provider[@Name=''Microsoft-Windows-Kernel-Power''] and EventID=507) or (Provider[@Name=''Microsoft-Windows-Power-Troubleshooter''] and EventID=1)]]</Select></Query></QueryList>'
$tDespertar = New-CimInstance -CimClass $cls -ClientOnly -Property @{ Enabled = $true; Subscription = $sub; Delay = 'PT30S' }
$ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 2)
$principal = New-ScheduledTaskPrincipal -UserId $u -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'PanelMeshCore-Relay' -Action $accion `
    -Trigger @($tLogon, $tCada10, $tDespertar) -Settings $ajustes -Principal $principal `
    -Description 'Mantiene vivo el relay BLE de MeshCore' -Force | Out-Null

# El acceso Run del registro queda de sobra: la tarea ya actua al iniciar sesion.
Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' `
    -Name 'PanelMeshCoreBleRelay' -ErrorAction SilentlyContinue

# El relay que ya corre usa el lanzador antiguo: se reinicia con el nuevo.
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'meshcore_ble_relay|run-relay' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
Start-ScheduledTask -TaskName 'PanelMeshCore-Relay'
Write-Host "Listo: tarea PanelMeshCore-Relay registrada y relay relanzado."
Write-Host "Log del relay: $dir\relay.log"
