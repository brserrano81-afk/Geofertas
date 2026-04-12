$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $root 'logs\runtime'
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

function Resolve-NpmCliPath {
    $nodePath = (Get-Command node -ErrorAction Stop).Source
    $npmSource = (Get-Command npm -ErrorAction Stop).Source
    $candidates = @(
        (Join-Path (Split-Path $nodePath -Parent) 'node_modules\npm\bin\npm-cli.js'),
        (Join-Path (Split-Path $npmSource -Parent) 'node_modules\npm\bin\npm-cli.js')
    )

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return @{
                NodePath = $nodePath
                NpmCliPath = $candidate
            }
        }
    }

    throw "Nao consegui localizar o npm-cli.js. Verifique a instalacao do Node.js."
}

function Get-AliveProcess([string]$pidFile) {
    if (-not (Test-Path $pidFile)) {
        return $null
    }

    $rawPid = Get-Content $pidFile -ErrorAction SilentlyContinue
    if (-not $rawPid) {
        return $null
    }

    return Get-Process -Id ([int]$rawPid) -ErrorAction SilentlyContinue
}

function Start-StackProcess {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$ScriptName,
        [Parameter(Mandatory = $true)][string]$NodePath,
        [Parameter(Mandatory = $true)][string]$NpmCliPath
    )

    $pidFile = Join-Path $runtimeDir "$Name.pid"
    $outFile = Join-Path $runtimeDir "$Name.out.log"
    $errFile = Join-Path $runtimeDir "$Name.err.log"
    $existing = Get-AliveProcess $pidFile

    if ($existing) {
        Write-Host "[$Name] ja estava em execucao (PID $($existing.Id))."
        return
    }

    foreach ($logFile in @($outFile, $errFile)) {
        if (-not (Test-Path $logFile)) {
            continue
        }

        try {
            Clear-Content -Path $logFile -ErrorAction Stop
        } catch {
            $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
            $archivedLogFile = "$logFile.$timestamp"
            Move-Item -Path $logFile -Destination $archivedLogFile -Force -ErrorAction SilentlyContinue
        }
    }

    $proc = Start-Process `
        -FilePath $NodePath `
        -ArgumentList @($NpmCliPath, 'run', $ScriptName) `
        -WorkingDirectory $root `
        -RedirectStandardOutput $outFile `
        -RedirectStandardError $errFile `
        -PassThru

    Set-Content -Path $pidFile -Value $proc.Id
    Write-Host "[$Name] iniciado com PID $($proc.Id)."
}

$runtime = Resolve-NpmCliPath

Start-StackProcess -Name 'proxy' -ScriptName 'proxy' -NodePath $runtime.NodePath -NpmCliPath $runtime.NpmCliPath
Start-StackProcess -Name 'worker-evolution' -ScriptName 'worker:evolution' -NodePath $runtime.NodePath -NpmCliPath $runtime.NpmCliPath

Start-Sleep -Seconds 4

$envFile = Join-Path $root '.env'
$hasEvolutionConfigInDotEnv = $false
if (Test-Path $envFile) {
    $envLines = Get-Content $envFile -ErrorAction SilentlyContinue
    $hasEvolutionConfigInDotEnv = @(
        'EVOLUTION_API_BASE_URL=',
        'EVOLUTION_INSTANCE_ID=',
        'EVOLUTION_API_KEY=',
        'EVOLUTION_SEND_TEXT_URL='
    ) | ForEach-Object {
        $envLines -match "^$_"
    } | Where-Object { $_ } | Measure-Object | Select-Object -ExpandProperty Count
}

Write-Host ''
Write-Host 'Stack Evolution pronta.'
Write-Host "Logs: $runtimeDir"
if (-not $hasEvolutionConfigInDotEnv) {
    Write-Host 'Aviso: variaveis EVOLUTION_* nao foram encontradas no .env visivel desta pasta.'
    Write-Host 'Nesse modo, as respostas entram em pending_send/awaiting_send ate a configuracao final do envio.'
}
