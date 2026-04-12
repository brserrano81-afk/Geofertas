$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $root 'logs\runtime'
$pidFiles = @(
    (Join-Path $runtimeDir 'proxy.pid'),
    (Join-Path $runtimeDir 'worker-evolution.pid')
)

foreach ($pidFile in $pidFiles) {
    if (-not (Test-Path $pidFile)) {
        continue
    }

    $rawPid = Get-Content $pidFile -ErrorAction SilentlyContinue
    if (-not $rawPid) {
        Remove-Item $pidFile -Force
        continue
    }

    $proc = Get-Process -Id ([int]$rawPid) -ErrorAction SilentlyContinue
    if ($proc) {
        Stop-Process -Id $proc.Id -Force
        Write-Host "Processo encerrado: PID $($proc.Id)"
    }

    Remove-Item $pidFile -Force
}

Write-Host 'Stack Evolution parada.'
