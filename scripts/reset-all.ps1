# Reset All Entity Tables - Windows PowerShell
# Drop all entity tables and recreate with default data
param(
    [switch]$DryRun,
    [switch]$Apply,
    [switch]$Force
)

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

if (-not $DryRun -and -not $Apply -and -not $Force) {
    if ($Language -eq "en") {
        Write-Host "Reset All Entity Tables"
        Write-Host "======================="
        Write-Host ""
        Write-Host "Drop all entity tables and recreate with default data."
        Write-Host ""
        Write-Host "Usage: .\reset-all.ps1 [OPTIONS]"
        Write-Host ""
        Write-Host "Options:"
        Write-Host "  -DryRun  Preview mode - show what will be deleted"
        Write-Host "  -Apply   Apply changes with confirmation prompt"
        Write-Host "  -Force   Apply changes without confirmation"
        Write-Host ""
        Write-Host "Examples:"
        Write-Host "  .\reset-all.ps1 -DryRun    # See what will happen"
        Write-Host "  .\reset-all.ps1 -Apply      # Execute with confirmation"
        Write-Host "  .\reset-all.ps1 -Force      # Execute immediately (dangerous!)"
    } else {
        Write-Host "모든 엔티티 테이블 초기화"
        Write-Host "====================="
        Write-Host ""
        Write-Host "모든 entity 테이블을 삭제하고 기본 데이터로 재생성합니다."
        Write-Host ""
        Write-Host "사용법: .\reset-all.ps1 [옵션]"
        Write-Host ""
        Write-Host "옵션:"
        Write-Host "  -DryRun  미리보기 모드 - 삭제될 테이블 확인"
        Write-Host "  -Apply   확인 후 실행"
        Write-Host "  -Force   확인 없이 즉시 실행"
        Write-Host ""
        Write-Host "예제:"
        Write-Host "  .\reset-all.ps1 -DryRun    # 미리보기"
        Write-Host "  .\reset-all.ps1 -Apply      # 확인 후 실행"
        Write-Host "  .\reset-all.ps1 -Force      # 즉시 실행 (위험!)"
    }
    exit 0
}

$CliBin = Join-Path $ProjectRoot "bin\entity-cli.exe"
if (-not (Test-Path $CliBin)) {
    if ($Language -eq "en") { Write-Host "X bin/entity-cli.exe not found" }
    else { Write-Host "X bin/entity-cli.exe 파일이 없습니다" }
    exit 1
}

if ($DryRun) {
    & $CliBin reset-all
} elseif ($Force -or $Apply) {
    # 필수 엔티티 없으면 자동 생성 (api_keys, rbac_roles, account, user)
    $NormalizePs1 = Join-Path $ScriptDir "normalize-entities.ps1"
    if ($Language -eq "en") { Write-Host "⚙️  Checking required entities..." }
    else { Write-Host "⚙️  필수 엔티티 확인 중..." }
    $env:LANGUAGE = $Language
    & $NormalizePs1 -Apply

    if ($Force) {
        & $CliBin reset-all --apply --force
    } else {
        & $CliBin reset-all --apply
    }
}
