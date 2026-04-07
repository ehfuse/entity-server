# cleanup-history.ps1 — history_ttl 기준 이력 정리
#
# 사용법:
#   .\scripts\cleanup-history.ps1                        # 도움말
#   .\scripts\cleanup-history.ps1 --apply                # 전체 이력 정리 실행
#   .\scripts\cleanup-history.ps1 --entity=account       # dry-run (특정 엔티티)
#   .\scripts\cleanup-history.ps1 --entity=account --apply

param(
    [string]$Entity = "",
    [switch]$Apply
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

# LANGUAGE 로드
$Lang = $env:LANGUAGE
if (-not $Lang) {
    $EnvFile = Join-Path $ProjectRoot ".env"
    if (Test-Path $EnvFile) {
        $line = Get-Content $EnvFile | Where-Object { $_ -match '^LANGUAGE=' } | Select-Object -Last 1
        if ($line) { $Lang = $line -replace '^LANGUAGE=', '' }
    }
}
if (-not $Lang) { $Lang = "ko" }

function Show-Help {
    if ($Lang -eq "en") {
        Write-Host "History TTL Cleanup"
        Write-Host "==================="
        Write-Host ""
        Write-Host "Usage: .\scripts\cleanup-history.ps1 [-Entity <name>] [-Apply]"
        Write-Host ""
        Write-Host "Options:"
        Write-Host "  -Entity <name>   Cleanup only one entity history"
        Write-Host "  -Apply           Execute delete (default: dry-run)"
    } else {
        Write-Host "히스토리 TTL 정리"
        Write-Host "================"
        Write-Host ""
        Write-Host "사용법: .\scripts\cleanup-history.ps1 [-Entity <이름>] [-Apply]"
        Write-Host ""
        Write-Host "옵션:"
        Write-Host "  -Entity <이름>   특정 엔티티 히스토리만 정리"
        Write-Host "  -Apply           실제 삭제 실행 (기본: dry-run)"
    }
}

# 인자 없으면 도움말
if (-not $Apply -and -not $Entity) {
    Show-Help
    exit 0
}

$CliBin = Join-Path $ProjectRoot "entity-cli.exe"
if (-not (Test-Path $CliBin)) {
    if ($Lang -eq "en") { Write-Error "❌ entity-cli.exe not found" }
    else                { Write-Error "❌ entity-cli.exe 파일이 없습니다" }
    exit 1
}

$Args = @("cleanup-history")
if ($Entity) { $Args += "--entity=$Entity" }
if ($Apply)  { $Args += "--apply" }

& $CliBin @Args
