# Entity Server - Run Script (Windows PowerShell)
param(
    [Parameter(Position=0)]
    [string]$Mode = ""
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

Set-Location $ProjectRoot

$ServerConfig = Join-Path $ProjectRoot "configs\server.json"
$DatabaseConfig = Join-Path $ProjectRoot "configs\database.json"
$RunDir = Join-Path $ProjectRoot ".run"
$PidFile = Join-Path $RunDir "entity-server.pid"
$StdoutLog = Join-Path $ProjectRoot "logs\server.out.log"

if (-not (Test-Path $RunDir)) { New-Item -ItemType Directory -Path $RunDir | Out-Null }
if (-not (Test-Path (Join-Path $ProjectRoot "logs"))) { New-Item -ItemType Directory -Path (Join-Path $ProjectRoot "logs") | Out-Null }

# Load language from .env
$Language = "ko"
$EnvFile = Join-Path $ProjectRoot ".env"
if (Test-Path $EnvFile) {
    $LangLine = Get-Content $EnvFile | Where-Object { $_ -match '^LANGUAGE=' } | Select-Object -First 1
    if ($LangLine) { $Language = $LangLine -replace '^LANGUAGE=', '' }
}

function Is-Running {
    if (-not (Test-Path $PidFile)) { return $false }
    $pid = (Get-Content $PidFile -ErrorAction SilentlyContinue).Trim()
    if (-not $pid) { return $false }
    try {
        $proc = Get-Process -Id ([int]$pid) -ErrorAction Stop
        return $true
    } catch { return $false }
}

function Stop-Server {
    if (-not (Test-Path $PidFile)) {
        if ($Language -eq "en") { Write-Host "i  Server is not running (pid file not found)." }
        else { Write-Host "i  서버가 실행 중이 아닙니다 (pid 파일 없음)." }
        return
    }
    $pid = (Get-Content $PidFile -ErrorAction SilentlyContinue).Trim()
    if (-not $pid) {
        Remove-Item $PidFile -Force
        if ($Language -eq "en") { Write-Host "i  Empty pid file removed." }
        else { Write-Host "i  비어있는 pid 파일을 정리했습니다." }
        return
    }
    try {
        $proc = Get-Process -Id ([int]$pid) -ErrorAction Stop
        $procInfo = "$($proc.Id)  $($proc.UserName)  $($proc.StartTime)  $($proc.ProcessName)"
        if ($Language -eq "en") {
            Write-Host "Running process:"
            Write-Host "  PID   ELAPSED  COMMAND"
            Write-Host "  $procInfo"
            Write-Host ""
            $input = Read-Host "Stop this process? [y/N]"
        } else {
            Write-Host "실행 중인 프로세스:"
            Write-Host "  PID   실행시간  COMMAND"
            Write-Host "  $procInfo"
            Write-Host ""
            $input = Read-Host "이 프로세스를 중지할까요? [y/N]"
        }
        if ($input -notmatch '^[Yy](es)?$') {
            if ($Language -eq "en") { Write-Host "Canceled." }
            else { Write-Host "취소되었습니다." }
            return
        }
        Stop-Process -Id ([int]$pid) -Force
        Remove-Item $PidFile -Force
        if ($Language -eq "en") { Write-Host "OK Server stopped (pid: $pid)" }
        else { Write-Host "OK 서버가 중지되었습니다 (pid: $pid)" }
    } catch {
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
        if ($Language -eq "en") { Write-Host "i  Stale pid file removed (process not found)." }
        else { Write-Host "i  실행 중인 프로세스가 없어 stale pid 파일을 정리했습니다." }
    }
}

function Show-Status {
    $ServerBin = Join-Path $ProjectRoot "bin\entity-server.exe"
    if (Is-Running) {
        & $ServerBin banner-status RUNNING
        if ($Language -eq "en") { Write-Host "Stop: .\run.ps1 stop" }
        else { Write-Host "중지: .\run.ps1 stop" }
    } else {
        & $ServerBin banner-status STOPPED
        if ($Language -eq "en") { Write-Host "Start: .\run.ps1 start" }
        else { Write-Host "시작: .\run.ps1 start" }
    }
}

if (-not $Mode) {
    if ($Language -eq "en") {
        Write-Host "Entity Server - Run Script"
        Write-Host "=========================="
        Write-Host ""
        Write-Host "Force configs/server.json environment and configs/database.json default group, then start compiled server binary."
        Write-Host ""
        Write-Host "Usage: .\run.ps1 <mode>"
        Write-Host ""
        Write-Host "Modes:"
        Write-Host "  dev    environment=development, database.default=development, then run binary"
        Write-Host "  start  environment=production, database.default=production, then run in background"
        Write-Host "  stop   stop background server started by this script"
        Write-Host "  status show server status"
        Write-Host ""
        Write-Host "Examples:"
        Write-Host "  .\run.ps1 dev"
        Write-Host "  .\run.ps1 start"
        Write-Host "  .\run.ps1 stop"
        Write-Host "  .\run.ps1 status"
    } else {
        Write-Host "Entity Server - 실행 스크립트"
        Write-Host "==========================="
        Write-Host ""
        Write-Host "configs/server.json의 environment와 configs/database.json의 default를 강제 설정하고 바이너리를 실행합니다."
        Write-Host ""
        Write-Host "사용법: .\run.ps1 <모드>"
        Write-Host ""
        Write-Host "모드:"
        Write-Host "  dev    environment=development, database.default=development 강제 후 바이너리 실행"
        Write-Host "  start  environment=production, database.default=production 강제 후 백그라운드 실행"
        Write-Host "  stop   run.ps1로 백그라운드 실행한 서버 중지"
        Write-Host "  status 서버 상태 조회"
        Write-Host ""
        Write-Host "예제:"
        Write-Host "  .\run.ps1 dev"
        Write-Host "  .\run.ps1 start"
        Write-Host "  .\run.ps1 stop"
        Write-Host "  .\run.ps1 status"
    }
    exit 0
}

if (-not (Test-Path $ServerConfig)) {
    if ($Language -eq "en") { Write-Host "X configs/server.json not found" }
    else { Write-Host "X configs/server.json 파일이 없습니다" }
    exit 1
}
if (-not (Test-Path $DatabaseConfig)) {
    if ($Language -eq "en") { Write-Host "X configs/database.json not found" }
    else { Write-Host "X configs/database.json 파일이 없습니다" }
    exit 1
}
$ServerBin = Join-Path $ProjectRoot "bin\entity-server.exe"
if (-not (Test-Path $ServerBin)) {
    if ($Language -eq "en") { Write-Host "X bin/entity-server.exe not found" }
    else { Write-Host "X bin/entity-server.exe 파일이 없습니다" }
    exit 1
}

function Update-JsonField {
    param([string]$File, [string]$Key, [string]$Value)
    $content = Get-Content $File -Raw
    $content = $content -replace "(`"$Key`"\s*:\s*`")[^`"]+(`")", "`${1}$Value`${2}"
    Set-Content $File $content -NoNewline
}

switch ($Mode) {
    { $_ -in @("dev", "development") } {
        if (Is-Running) {
            $pid = (Get-Content $PidFile).Trim()
            if ($Language -eq "en") { Write-Host "X Server already running (pid: $pid). Stop first: .\run.ps1 stop" }
            else { Write-Host "X 이미 서버가 실행 중입니다 (pid: $pid). 먼저 중지하세요: .\run.ps1 stop" }
            exit 1
        }
        $dbContent = Get-Content $DatabaseConfig -Raw
        if ($dbContent -notmatch '"development"\s*:') {
            if ($Language -eq "en") { Write-Host "X database group 'development' not found in configs/database.json" }
            else { Write-Host "X configs/database.json에 'development' 그룹이 없습니다" }
            exit 1
        }
        Update-JsonField $ServerConfig "environment" "development"
        Update-JsonField $DatabaseConfig "default" "development"
        & $ServerBin
    }

    "start" {
        if (Is-Running) {
            $pid = (Get-Content $PidFile).Trim()
            if ($Language -eq "en") { Write-Host "X Server already running (pid: $pid). Stop first: .\run.ps1 stop" }
            else { Write-Host "X 이미 서버가 실행 중입니다 (pid: $pid). 먼저 중지하세요: .\run.ps1 stop" }
            exit 1
        }
        $dbContent = Get-Content $DatabaseConfig -Raw
        if ($dbContent -notmatch '"production"\s*:') {
            if ($Language -eq "en") { Write-Host "X database group 'production' not found in configs/database.json" }
            else { Write-Host "X configs/database.json에 'production' 그룹이 없습니다" }
            exit 1
        }
        Update-JsonField $ServerConfig "environment" "production"
        Update-JsonField $DatabaseConfig "default" "production"
        & $ServerBin banner
        $proc = Start-Process -FilePath $ServerBin -RedirectStandardOutput $StdoutLog -RedirectStandardError $StdoutLog -WindowStyle Hidden -PassThru
        $proc.Id | Set-Content $PidFile
        Start-Sleep -Milliseconds 300
        try {
            $check = Get-Process -Id $proc.Id -ErrorAction Stop
            if ($Language -eq "en") {
                Write-Host "OK Entity Server started in background (pid: $($proc.Id))"
                Write-Host "Status: .\run.ps1 status"
            } else {
                Write-Host "OK Entity Server가 백그라운드에서 시작되었습니다 (pid: $($proc.Id))"
                Write-Host "상태: .\run.ps1 status"
                Write-Host "중지: .\run.ps1 stop"
            }
        } catch {
            Remove-Item $PidFile -Force
            if ($Language -eq "en") {
                Write-Host "X Failed to start Entity Server in background"
                Write-Host "Check logs: $StdoutLog"
            } else {
                Write-Host "X Entity Server 백그라운드 시작에 실패했습니다"
                Write-Host "로그 확인: $StdoutLog"
            }
            exit 1
        }
    }

    "stop" { Stop-Server }

    "status" { Show-Status }

    default {
        if ($Language -eq "en") {
            Write-Host "X Unknown mode: $Mode"
            Write-Host "Run '.\run.ps1' for usage information"
        } else {
            Write-Host "X 알 수 없는 모드: $Mode"
            Write-Host "'.\run.ps1'로 사용법을 확인하세요"
        }
        exit 1
    }
}
