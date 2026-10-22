# Instalador del relay BLE de MeshCore para Windows.
#
# Arranca el relay al iniciar sesion mediante HKCU\...\CurrentVersion\Run.
# No usa schtasks ni Register-ScheduledTask (daban problemas de comillas y de
# permisos) y no necesita privilegios de administrador: todo vive bajo el perfil
# del usuario actual.

$ErrorActionPreference = 'Stop'

$Root      = Split-Path -Parent $PSCommandPath
$Venv      = Join-Path $Root '.venv'
$Python    = Join-Path $Venv 'Scripts\python.exe'
$RelayPy   = Join-Path $Root 'meshcore_ble_relay.py'
$TokenPath = Join-Path $env:USERPROFILE '.meshcore-ble-token'
$InstallDir = Join-Path $env:LOCALAPPDATA 'PanelMeshCore'
$LogPath   = Join-Path $InstallDir 'relay.log'
$RunPs1    = Join-Path $InstallDir 'run-relay.ps1'
$RunCmd    = Join-Path $InstallDir 'run-relay.cmd'
$RunKey    = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$RunName   = 'PanelMeshCoreBleRelay'
$GatewayWs = if ($env:MESHCORE_GATEWAY_WS) { $env:MESHCORE_GATEWAY_WS } else { 'wss://raspberrypi.local/api/ble/relay' }
# Huella SHA-256 del certificado de la Pi (en la Pi:
# openssl x509 -in /etc/nginx/meshcore-tls/cert.pem -noout -fingerprint -sha256)
$Huella = $env:MESHCORE_GATEWAY_FINGERPRINT
if ($GatewayWs -like 'wss://*' -and [string]::IsNullOrWhiteSpace($Huella)) { throw 'Falta MESHCORE_GATEWAY_FINGERPRINT: la huella del certificado de la Pi (ver comentario).' }

Write-Host '== comprobaciones =='
if (-not (Test-Path $RelayPy)) { throw "No encuentro el relay en $RelayPy. Ejecuta este script desde la carpeta bridge del repo." }
if (-not (Test-Path $TokenPath)) { throw "Falta el token. Copia el de la Raspberry (~/.meshcore-ble-token) a $TokenPath" }
$Token = (Get-Content $TokenPath -Raw).Trim()
if ([string]::IsNullOrWhiteSpace($Token)) { throw "El fichero de token $TokenPath esta vacio." }

Write-Host '== entorno python =='
if (-not (Test-Path $Python)) {
    if (Get-Command py -ErrorAction SilentlyContinue) { py -3 -m venv $Venv }
    elseif (Get-Command python -ErrorAction SilentlyContinue) { python -m venv $Venv }
    else { throw 'No hay Python. Instala Python 3.11 o superior y vuelve a ejecutar.' }
}
& $Python -m pip install --upgrade pip --quiet
& $Python -m pip install -r (Join-Path $Root 'requirements.txt') --quiet
if ($LASTEXITCODE -ne 0) { throw 'Fallo instalando las dependencias de Python.' }

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

# El script hijo lee el token en tiempo de ejecucion desde $env:USERPROFILE.
# Antes se escribia el literal %USERPROFILE%, que es sintaxis de cmd y
# PowerShell no expande: el relay moria nada mas arrancar sin dejar rastro.
Write-Host '== escribiendo lanzador =='
$SupLog = Join-Path $InstallDir 'relay-supervisor.log'
$runLines = @(
    '$ErrorActionPreference = ''Stop'''
    '$tokenPath = Join-Path $env:USERPROFILE ''.meshcore-ble-token'''
    '$env:MESHCORE_BLE_TOKEN = (Get-Content $tokenPath -Raw).Trim()'
    '$env:MESHCORE_GATEWAY_WS = ''' + $GatewayWs + ''''
    '$env:MESHCORE_GATEWAY_FINGERPRINT = ''' + $Huella + ''''
    '$env:MESHCORE_BLE_PAIR = ''1'''
    '# El relay escribe su propio log UTF-8 con rotacion; aqui solo el supervisor.'
    '$env:MESHCORE_LOG_FILE = ''' + $LogPath + ''''
    '$sup = ''' + $SupLog + ''''
    'if ((Test-Path $sup) -and ((Get-Item $sup).Length -gt 2MB)) { Remove-Item $sup -Force }'
    '# Con Stop, PowerShell convertia la primera linea de stderr en un error que'
    '# mataba el proceso. Y el bucle relanza si bleak/WinRT revienta en nativo.'
    '$ErrorActionPreference = ''Continue'''
    'while ($true) {'
    '    "$(Get-Date -Format o) [supervisor] arrancando relay" | Add-Content -Path $sup -Encoding UTF8'
    '    & ''' + $Python + ''' ''' + $RelayPy + ''' 2>&1 | Out-File -FilePath $sup -Append -Encoding utf8'
    '    "$(Get-Date -Format o) [supervisor] el relay termino (exit $LASTEXITCODE), relanzando en 5s" | Add-Content -Path $sup -Encoding UTF8'
    '    Start-Sleep -Seconds 5'
    '}'
)
Set-Content -Path $RunPs1 -Value $runLines -Encoding UTF8

$cmdLines = @(
    '@echo off'
    'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $RunPs1 + '"'
)
Set-Content -Path $RunCmd -Value $cmdLines -Encoding ASCII

Write-Host '== arranque automatico al iniciar sesion =='
New-Item -Path $RunKey -Force | Out-Null
Set-ItemProperty -Path $RunKey -Name $RunName -Value ('"' + $RunCmd + '"')

Write-Host '== parando instancia anterior si la hubiera =='
Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine -like '*meshcore_ble_relay*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Write-Host '== arrancando ahora =='
Start-Process -FilePath $RunCmd -WindowStyle Hidden
Start-Sleep -Seconds 6

$proc = Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine -like '*meshcore_ble_relay*' }

if (-not $proc) {
    Write-Host ''
    Write-Host 'ERROR: el relay no sigue vivo tras arrancarlo.' -ForegroundColor Red
    if (Test-Path $LogPath) {
        Write-Host "Ultimas lineas de $LogPath :" -ForegroundColor Yellow
        Get-Content $LogPath -Tail 25
    } else {
        Write-Host "No se ha creado ningun log en $LogPath" -ForegroundColor Yellow
    }
    exit 1
}

Write-Host ''
Write-Host 'Relay BLE instalado y corriendo.' -ForegroundColor Green
Write-Host ("  PID        : " + $proc.ProcessId)
Write-Host ("  Gateway    : " + $GatewayWs)
Write-Host ("  Log        : " + $LogPath)
Write-Host ("  Autoarranque: " + $RunKey + '\' + $RunName)
Write-Host ''
Write-Host 'Comprueba el estado en el panel: https://<IP-de-tu-Pi>/'
Write-Host 'Para desinstalar el autoarranque:'
Write-Host ("  Remove-ItemProperty -Path '" + $RunKey + "' -Name '" + $RunName + "'")
