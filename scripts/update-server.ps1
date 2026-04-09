# update-server.ps1 — entity-server / entity-cli 바이너리 및 파일 업데이트
#
# 사용법:
#   .\scripts\update-server.ps1             # 도움말 + 현재 버전 + 최신 버전 확인
#   .\scripts\update-server.ps1 latest      # 최신 버전으로 업데이트
#   .\scripts\update-server.ps1 1.5.0       # 특정 버전으로 업데이트
#
# 업데이트 대상:
#   - 바이너리: entity-server, entity-cli
#   - 파일: scripts/  samples/  (configs/ entities/ docs/ 제외)

param([string]$Action = "")

$ErrorActionPreference = "Stop"

$REPO        = "ehfuse/entity-server"
$BINARIES    = @("entity-server", "entity-cli")
$DIST_DIRS   = @("scripts", "samples")
$PLATFORM    = "windows"
$ARCH_TAG    = "x64"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

function Get-RunningServerPid {
    $PidFile = Join-Path $ProjectRoot ".run\entity-server.pid"
    if (Test-Path $PidFile) {
        $pidValue = (Get-Content $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1).Trim()
        if ($pidValue -match '^\d+$') {
            try {
                $p = Get-Process -Id ([int]$pidValue) -ErrorAction Stop
                if ($p) { return [int]$pidValue }
            } catch {}
        }
    }

    $proc = Get-Process -Name "entity-server" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($proc) { return [int]$proc.Id }
    return $null
}

function Ensure-ServerStopped {
    $pidValue = Get-RunningServerPid
    if (-not $pidValue) { return }

    Write-Host ""
    Write-Host "⚠️  현재 Entity Server가 실행 중입니다."
    try {
        $p = Get-Process -Id $pidValue -ErrorAction Stop
        Write-Host ("PID: {0}  Name: {1}  Start: {2}" -f $p.Id, $p.ProcessName, $p.StartTime)
    } catch {}
    Write-Host ""

    $answer = Read-Host "업데이트를 위해 서버를 중지할까요? [y/N]"
    if ($answer -notmatch '^[Yy](es)?$') {
        Write-Host "❌ 업데이트를 취소했습니다."
        exit 1
    }

    $RunScript = Join-Path $ProjectRoot "scripts\run.ps1"
    if (Test-Path $RunScript) {
        try {
            & $RunScript stop
        } catch {}
    } else {
        try {
            Stop-Process -Id $pidValue -Force -ErrorAction Stop
        } catch {}
    }

    Start-Sleep -Milliseconds 200
    $still = Get-RunningServerPid
    if ($still) {
        Write-Host "❌ 서버 중지에 실패했습니다. 업데이트를 중단합니다."
        exit 1
    }

    Write-Host "✅ 서버 중지 완료"
}

# ── 현재 버전 확인 ────────────────────────────────────────────────────────────

function Get-CurrentVer {
    $BinPath = Join-Path $ProjectRoot "bin\entity-server.exe"
    if (-not (Test-Path $BinPath)) {
        $LegacyBin = Join-Path $ProjectRoot "entity-server.exe"
        if (Test-Path $LegacyBin) { $BinPath = $LegacyBin }
    }
    if (Test-Path $BinPath) {
        try {
            $out = & $BinPath --version 2>$null
            if ($out -match '(\d+\.\d+\.\d+)') { return $Matches[1] }
        } catch {}
    }
    return "(없음)"
}

# ── 최신 버전 조회 ────────────────────────────────────────────────────────────

function Get-LatestVer {
    try {
        $resp = Invoke-RestMethod "https://api.github.com/repos/$REPO/releases/latest"
        return $resp.tag_name -replace '^v', ''
    } catch {
        Write-Error "❌ 최신 버전을 가져오지 못했습니다: $_"
        exit 1
    }
}

function Show-VersionStatus {
    Write-Host "🔍 버전 확인 중..."
    $Current = Get-CurrentVer
    $Latest  = Get-LatestVer
    Write-Host ""
    Write-Host "  현재 버전: v$Current"
    Write-Host "  최신 버전: v$Latest"
    Write-Host ""
    if ($Current -eq $Latest) {
        Write-Host "✅ 최신 버전입니다."
    } else {
        Write-Host "💡 업데이트 가능: .\scripts\update-server.ps1 latest"
    }
}

# ── 설치 ──────────────────────────────────────────────────────────────────────

function Install-Version([string]$TargetVer) {
    $TargetVer = $TargetVer -replace '^v', ''
    $CurrentVer = Get-CurrentVer

    Ensure-ServerStopped

    Write-Host ""
    Write-Host "📦 entity-server v$TargetVer 다운로드 중... ($PLATFORM-$ARCH_TAG)"
    Write-Host ""

    foreach ($Bin in $BINARIES) {
        $FileName = "$Bin-$PLATFORM-$ARCH_TAG.exe"
        $Url      = "https://github.com/$REPO/releases/download/v$TargetVer/$FileName"
        $BinDir   = Join-Path $ProjectRoot "bin"
        if (-not (Test-Path $BinDir)) {
            New-Item -ItemType Directory -Path $BinDir | Out-Null
        }
        $Dest     = Join-Path $BinDir "$Bin.exe"
        $Tmp      = "$Dest.tmp"

        Write-Host ("  ↓ {0,-35}" -f $FileName) -NoNewline
        try {
            Invoke-WebRequest -Uri $Url -OutFile $Tmp -UseBasicParsing
            Move-Item -Force $Tmp $Dest
            Write-Host "✓"
        } catch {
            Write-Host "✗ 실패"
            Write-Host "    URL: $Url"
            Write-Host "    오류: $_"
            if (Test-Path $Tmp) { Remove-Item $Tmp -Force }
            exit 1
        }
    }

    Install-Dist $TargetVer

    Write-Host ""
    Write-Host "✅ 업데이트 완료: v$CurrentVer → v$TargetVer"
    Write-Host "   서버를 재시작하면 새 버전이 적용됩니다."
}

function Sync-ScriptsDir([string]$Src, [string]$Dest) {
    if (Test-Path $Dest) {
        Remove-Item -Recurse -Force $Dest
    }
    New-Item -ItemType Directory -Path $Dest | Out-Null

    $Scripts = Get-ChildItem -Path $Src -Filter *.ps1 -File -ErrorAction SilentlyContinue
    foreach ($Script in $Scripts) {
        Copy-Item -Force $Script.FullName (Join-Path $Dest $Script.Name)
    }
}

# ── dist 파일 업데이트 (scripts / samples) ──────────────────────────────────

function Install-Dist([string]$TargetVer) {
    $TargetVer = $TargetVer -replace '^v', ''
    $FileName = "dist.tar.gz"
    $Url = "https://github.com/$REPO/releases/download/v$TargetVer/$FileName"
    $TmpTar = Join-Path $env:TEMP ("entity-server-dist-$TargetVer.tar.gz")
    $TmpDir = Join-Path $env:TEMP ("entity-server-dist-$TargetVer")

    Write-Host ("  ↓ {0,-35}" -f $FileName) -NoNewline
    try {
        Invoke-WebRequest -Uri $Url -OutFile $TmpTar -UseBasicParsing
        Write-Host "✓"
    } catch {
        Write-Host "✗ 실패 (업데이트 스킵)"
        Write-Host "    URL: $Url"
        Write-Host "    ⚠️  dist.tar.gz 가 릴리스에 없습니다. 바이너리만 업데이트됩니다."
        return
    }

    if (Test-Path $TmpDir) {
        Remove-Item -Recurse -Force $TmpDir
    }
    New-Item -ItemType Directory -Path $TmpDir | Out-Null

    # tar.exe 사용 (Windows 10+/PowerShell 5+ 기본 포함 환경 가정)
    $TarCmd = Get-Command tar -ErrorAction SilentlyContinue
    if (-not $TarCmd) {
        Write-Host "    ⚠️  tar 명령을 찾지 못해 dist 동기화를 건너뜁니다."
        if (Test-Path $TmpTar) { Remove-Item -Force $TmpTar }
        return
    }

    try {
        & tar -xzf $TmpTar -C $TmpDir
    } catch {
        Write-Host "    ⚠️  dist 압축 해제 실패: $_"
        if (Test-Path $TmpTar) { Remove-Item -Force $TmpTar }
        if (Test-Path $TmpDir) { Remove-Item -Recurse -Force $TmpDir }
        return
    }

    $SrcRoot = $TmpDir
    $HasTopLevel = $false
    foreach ($Dir in $DIST_DIRS) {
        if (Test-Path (Join-Path $TmpDir $Dir)) {
            $HasTopLevel = $true
            break
        }
    }

    if (-not $HasTopLevel) {
        $FirstSubdir = Get-ChildItem -Path $TmpDir -Directory | Select-Object -First 1
        if ($FirstSubdir) {
            $SrcRoot = $FirstSubdir.FullName
        }
    }

    Write-Host ""
    Write-Host "  파일 동기화 (configs/ entities/ docs/ 제외):"
    foreach ($Dir in $DIST_DIRS) {
        $Src = Join-Path $SrcRoot $Dir
        $Dest = Join-Path $ProjectRoot $Dir
        if (Test-Path $Src) {
            if ($Dir -eq "scripts") {
                Sync-ScriptsDir $Src $Dest
            } else {
                if (Test-Path $Dest) {
                    Remove-Item -Recurse -Force $Dest
                }
                Copy-Item -Recurse -Force $Src $Dest
            }
            Write-Host ("    ✔ {0,-20}" -f ("$Dir/"))
        } else {
            Write-Host ("    – {0,-20} (릴리스에 없음, 스킵)" -f ("$Dir/"))
        }
    }

    if (Test-Path $TmpTar) { Remove-Item -Force $TmpTar }
    if (Test-Path $TmpDir) { Remove-Item -Recurse -Force $TmpDir }
}

# ── 서브커맨드 분기 ───────────────────────────────────────────────────────────

switch ($Action) {
    "" {
        Write-Host "update-server.ps1 — entity-server / entity-cli 바이너리 및 파일 업데이트"
        Write-Host ""
        Write-Host "사용법:"
        Write-Host "  .\scripts\update-server.ps1 latest         최신 버전으로 업데이트"
        Write-Host "  .\scripts\update-server.ps1 <버전>         특정 버전으로 업데이트"
        Write-Host ""
        Write-Host "업데이트 대상:"
        Write-Host "  바이너리   entity-server  entity-cli"
        Write-Host "  파일    scripts/  samples/"
        Write-Host "  제외     configs/  entities/  docs/  (local 설정 보존)"
        Write-Host ""
        Write-Host "예시:"
        Write-Host "  .\scripts\update-server.ps1 latest"
        Write-Host "  .\scripts\update-server.ps1 1.5.0"
        Write-Host ""
        Show-VersionStatus
    }
    "latest" {
        Write-Host "🔍 최신 버전 확인 중..."
        $Latest = Get-LatestVer
        Install-Version $Latest
    }
    default {
        Install-Version $Action
    }
}
