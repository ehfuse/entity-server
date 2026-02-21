# normalize-entities.ps1 — 엔티티 JSON 정규화
#
# 사용법:
#   .\scripts\normalize-entities.ps1                        # 도움말
#   .\scripts\normalize-entities.ps1 -Apply                 # 전체 정규화
#   .\scripts\normalize-entities.ps1 -Entity account        # account dry-run
#   .\scripts\normalize-entities.ps1 -Entity account -Apply # account 정규화

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
        Write-Host "Normalize Entity JSON"
        Write-Host "====================="
        Write-Host ""
        Write-Host "Remove redundant default values and reorder keys in entity JSON files."
        Write-Host "Also auto-creates missing required entities (api_keys, rbac_roles, and account/user when JWT is enabled)."
        Write-Host ""
        Write-Host "Usage: .\scripts\normalize-entities.ps1 [-Entity <name>] [-Apply]"
        Write-Host ""
        Write-Host "Options:"
        Write-Host "  -Apply           Apply changes (default is dry-run)"
        Write-Host "  -Entity <name>   Normalize a single entity only"
        Write-Host ""
        Write-Host "Examples:"
        Write-Host "  .\scripts\normalize-entities.ps1                         # Dry-run all"
        Write-Host "  .\scripts\normalize-entities.ps1 -Apply                  # Normalize all"
        Write-Host "  .\scripts\normalize-entities.ps1 -Entity account         # Dry-run account"
        Write-Host "  .\scripts\normalize-entities.ps1 -Entity account -Apply  # Normalize account"
    } else {
        Write-Host "엔티티 JSON 정규화"
        Write-Host "=================="
        Write-Host ""
        Write-Host "엔티티 JSON 파일에서 불필요한 기본값을 제거하고 키 순서를 정렬합니다."
        Write-Host "전체 모드에서는 필수 엔티티(api_keys, rbac_roles, JWT 사용 시 account/user)가 없으면 자동 생성합니다."
        Write-Host ""
        Write-Host "사용법: .\scripts\normalize-entities.ps1 [-Entity <이름>] [-Apply]"
        Write-Host ""
        Write-Host "옵션:"
        Write-Host "  -Apply           실제 파일 수정 (기본은 dry-run)"
        Write-Host "  -Entity <이름>   단일 엔티티만 정규화"
        Write-Host ""
        Write-Host "예제:"
        Write-Host "  .\scripts\normalize-entities.ps1                         # 전체 dry-run"
        Write-Host "  .\scripts\normalize-entities.ps1 -Apply                  # 전체 정규화"
        Write-Host "  .\scripts\normalize-entities.ps1 -Entity account         # account dry-run"
        Write-Host "  .\scripts\normalize-entities.ps1 -Entity account -Apply  # account 정규화"
    }
}

# 인자 없으면 도움말
if (-not $Apply -and -not $Entity) {
    Show-Help
    exit 0
}

$CliBin = Join-Path $ProjectRoot "entity-cli.exe"
if (-not (Test-Path $CliBin)) {
    if ($Lang -eq "en") { Write-Error "❌ entity-cli.exe not found. Run scripts\build.sh first." }
    else                { Write-Error "❌ entity-cli.exe 파일이 없습니다. scripts\build.sh 를 먼저 실행하세요." }
    exit 1
}

$Args = @("normalize-entities")
if ($Entity) { $Args += "--entity=$Entity" }
if ($Apply)  { $Args += "--apply" }

& $CliBin @Args
