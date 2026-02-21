# update-server.ps1 — entity-server / entity-cli 바이너리 업데이트
#
# 사용법:
#   .\scripts\update-server.ps1             # 도움말
#   .\scripts\update-server.ps1 version     # 현재 버전 + 최신 버전 확인
#   .\scripts\update-server.ps1 latest      # 최신 버전으로 업데이트
#   .\scripts\update-server.ps1 1.5.0       # 특정 버전으로 업데이트

param([string]$Action = "")

$ErrorActionPreference = "Stop"

$REPO        = "ehfuse/entity-server"
$BINARIES    = @("entity-server", "entity-cli")
$PLATFORM    = "windows"
$ARCH_TAG    = "x64"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

# ── 현재 버전 확인 ────────────────────────────────────────────────────────────

function Get-CurrentVer {
    $BinPath = Join-Path $ProjectRoot "entity-server.exe"
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

# ── 설치 ──────────────────────────────────────────────────────────────────────

function Install-Version([string]$TargetVer) {
    $TargetVer = $TargetVer -replace '^v', ''
    $CurrentVer = Get-CurrentVer

    Write-Host ""
    Write-Host "📦 entity-server v$TargetVer 다운로드 중... ($PLATFORM-$ARCH_TAG)"
    Write-Host ""

    foreach ($Bin in $BINARIES) {
        $FileName = "$Bin-$PLATFORM-$ARCH_TAG.exe"
        $Url      = "https://github.com/$REPO/releases/download/v$TargetVer/$FileName"
        $Dest     = Join-Path $ProjectRoot "$Bin.exe"
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

    Write-Host ""
    Write-Host "✅ 업데이트 완료: v$CurrentVer → v$TargetVer"
    Write-Host "   서버를 재시작하면 새 버전이 적용됩니다."
}

# ── 서브커맨드 분기 ───────────────────────────────────────────────────────────

switch ($Action) {
    "" {
        Write-Host "update-server.ps1 — entity-server / entity-cli 바이너리 업데이트"
        Write-Host ""
        Write-Host "사용법:"
        Write-Host "  .\scripts\update-server.ps1 version        현재 버전 + 최신 버전 확인"
        Write-Host "  .\scripts\update-server.ps1 latest         최신 버전으로 업데이트"
        Write-Host "  .\scripts\update-server.ps1 <버전>         특정 버전으로 업데이트"
        Write-Host ""
        Write-Host "예시:"
        Write-Host "  .\scripts\update-server.ps1 version"
        Write-Host "  .\scripts\update-server.ps1 latest"
        Write-Host "  .\scripts\update-server.ps1 1.5.0"
    }
    "version" {
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
    "latest" {
        Write-Host "🔍 최신 버전 확인 중..."
        $Latest = Get-LatestVer
        Install-Version $Latest
    }
    default {
        Install-Version $Action
    }
}
