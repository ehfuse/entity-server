# Init Entity Tables - Windows PowerShell
# Add, reset, or truncate one entity's data/index/history tables

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

Set-Location $ProjectRoot

# Load language from .env
$Language = "ko"
$EnvFile = Join-Path $ProjectRoot ".env"
if (Test-Path $EnvFile) {
    $LangLine = Get-Content $EnvFile | Where-Object { $_ -match '^LANGUAGE=' } | Select-Object -First 1
    if ($LangLine) { $Language = $LangLine -replace '^LANGUAGE=', '' }
}

function Show-Help {
    if ($Language -eq "en") {
        Write-Host "Init Entity Tables"
        Write-Host "=================="
        Write-Host ""
        Write-Host "Add, reset, or truncate one entity's data/index/history tables."
        Write-Host ""
        Write-Host "Usage: .\entity.ps1 --entity=<name> [--reset|--truncate] [--apply]"
        Write-Host ""
        Write-Host "Options:"
        Write-Host "  --entity=<name>  Entity name (required)"
        Write-Host "  --reset          Drop this entity tables and recreate"
        Write-Host "  --truncate       Delete all rows and reset AUTO_INCREMENT=1"
        Write-Host "  --apply          Execute (default is dry-run)"
        Write-Host ""
        Write-Host "Examples:"
        Write-Host "  .\entity.ps1 --entity=license --apply"
        Write-Host "  .\entity.ps1 --entity=account --reset --apply"
        Write-Host "  .\entity.ps1 --entity=account --truncate --apply"
    } else {
        Write-Host "단일 엔티티 테이블 초기화"
        Write-Host "====================="
        Write-Host ""
        Write-Host "하나의 엔티티(data/index/history) 테이블을 추가/재생성/비우기(truncate) 합니다."
        Write-Host ""
        Write-Host "사용법: .\entity.ps1 --entity=<name> [--reset|--truncate] [--apply]"
        Write-Host ""
        Write-Host "옵션:"
        Write-Host "  --entity=<name>  엔티티명 (필수)"
        Write-Host "  --reset          해당 엔티티 테이블 드롭 후 재생성"
        Write-Host "  --truncate       데이터 전체 삭제 + AUTO_INCREMENT=1 초기화"
        Write-Host "  --apply          실제 실행 (기본은 dry-run)"
        Write-Host ""
        Write-Host "예제:"
        Write-Host "  .\entity.ps1 --entity=license --apply"
        Write-Host "  .\entity.ps1 --entity=account --reset --apply"
        Write-Host "  .\entity.ps1 --entity=account --truncate --apply"
    }
}

if ($args.Count -eq 0) {
    Show-Help
    exit 0
}

$CliBin = Join-Path $ProjectRoot "bin\entity-cli.exe"
if (-not (Test-Path $CliBin)) {
    if ($Language -eq "en") { Write-Host "X bin/entity-cli.exe not found" }
    else { Write-Host "X bin/entity-cli.exe 파일이 없습니다" }
    exit 1
}

# Pass-through to CLI
& $CliBin init-entity @args
