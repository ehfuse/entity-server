# Sync entity index schema

param(
    [string]$Target = "",
    [switch]$Apply,
    [switch]$WithData
)

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $ProjectRoot

# Load language from .env
$Language = "ko"
if (Test-Path ".env") {
    $EnvLine = Get-Content ".env" | Where-Object { $_ -match '^LANGUAGE=' }
    if ($EnvLine) { $Language = $EnvLine -replace '^LANGUAGE=', '' }
}

# Show usage if no arguments
if (-not $Target) {
    if ($Language -eq "en") {
        Write-Host "Sync Entity Index Schema"
        Write-Host "========================"
        Write-Host ""
        Write-Host "Synchronize index table schema with entity configuration."
        Write-Host ""
        Write-Host "Usage: .\sync.ps1 <EntityName>|-All [-Apply] [-WithData]"
        Write-Host ""
        Write-Host "Arguments:"
        Write-Host "  EntityName  Name of the entity to sync (required)"
        Write-Host "  -All        Sync all entities in entities/"
        Write-Host ""
        Write-Host "Options:"
        Write-Host "  -Apply     Apply changes to database (default: dry-run)"
        Write-Host "  -WithData  Sync schema and backfill index rows from existing data"
        Write-Host ""
        Write-Host "Examples:"
        Write-Host "  .\sync.ps1 user              # Preview changes for user entity"
        Write-Host "  .\sync.ps1 user -Apply       # Apply changes for user entity"
        Write-Host "  .\sync.ps1 user -Apply -WithData  # Apply + backfill"
        Write-Host "  .\sync.ps1 -All              # Preview for all entities"
        Write-Host "  .\sync.ps1 -All -Apply       # Apply for all entities"
        Write-Host "  .\sync.ps1 license -Apply    # Sync license entity schema"
    } else {
        Write-Host "엔티티 인덱스 스키마 동기화"
        Write-Host "======================="
        Write-Host ""
        Write-Host "엔티티 설정과 인덱스 테이블 스키마를 동기화합니다."
        Write-Host ""
        Write-Host "사용법: .\sync.ps1 <엔티티명>|-All [-Apply] [-WithData]"
        Write-Host ""
        Write-Host "인자:"
        Write-Host "  엔티티명  동기화할 엔티티 이름 (필수)"
        Write-Host "  -All      entities/ 내 전체 엔티티 동기화"
        Write-Host ""
        Write-Host "옵션:"
        Write-Host "  -Apply     데이터베이스에 변경사항 적용 (기본값: 미리보기)"
        Write-Host "  -WithData  스키마 동기화 + 기존 데이터 인덱스 백필"
        Write-Host ""
        Write-Host "예제:"
        Write-Host "  .\sync.ps1 user              # user 엔티티 변경사항 미리보기"
        Write-Host "  .\sync.ps1 user -Apply       # user 엔티티 변경사항 적용"
        Write-Host "  .\sync.ps1 user -Apply -WithData  # 적용 + 기존 데이터 백필"
        Write-Host "  .\sync.ps1 -All              # 전체 엔티티 미리보기"
        Write-Host "  .\sync.ps1 -All -Apply       # 전체 엔티티 적용"
        Write-Host "  .\sync.ps1 license -Apply    # license 엔티티 스키마 동기화"
    }
    exit 0
}

# Validate --with-data requires --apply
if ($WithData -and -not $Apply) {
    if ($Language -eq "en") {
        Write-Host "❌ -WithData requires -Apply"
    } else {
        Write-Host "❌ -WithData 는 -Apply 와 함께 사용해야 합니다"
    }
    exit 1
}

# Require prebuilt CLI binary
$CliBin = Join-Path $ProjectRoot "entity-cli.exe"
if (-not (Test-Path $CliBin)) {
    if ($Language -eq "en") {
        Write-Host "❌ entity-cli.exe not found"
    } else {
        Write-Host "❌ entity-cli.exe 파일이 없습니다"
    }
    exit 1
}

function Invoke-SyncEntity {
    param([string]$EntityName)
    $Args = @("sync-index", "--entity=$EntityName")
    if ($Apply)    { $Args += "--apply" }
    if ($WithData) { $Args += "--with-data" }
    Write-Host "[sync] $EntityName"
    & $CliBin @Args
    return $LASTEXITCODE -eq 0
}

if ($Target -eq "-All" -or $Target -eq "--all") {
    $EntityFiles = Get-ChildItem -Path (Join-Path $ProjectRoot "entities") -Filter "*.json" -Recurse |
        Select-Object -ExpandProperty BaseName | Sort-Object -Unique

    if ($EntityFiles.Count -eq 0) {
        if ($Language -eq "en") {
            Write-Host "❌ No entity config files found in entities/"
        } else {
            Write-Host "❌ entities/ 에 엔티티 설정 파일이 없습니다"
        }
        exit 1
    }

    $TotalCount   = $EntityFiles.Count
    $SuccessCount = 0
    $FailedCount  = 0

    foreach ($Entity in $EntityFiles) {
        if (Invoke-SyncEntity $Entity) {
            $SuccessCount++
        } else {
            $FailedCount++
        }
    }

    $ApplyLabel = if ($Apply) { "apply" } else { "dry-run" }
    $ModeLabel  = if ($WithData) { "with-data" } else { "index-only" }
    Write-Host ""
    Write-Host "[summary] target=all mode=$ModeLabel apply=$ApplyLabel total=$TotalCount success=$SuccessCount failed=$FailedCount"

    if ($FailedCount -gt 0) { exit 1 }
} else {
    $ok = Invoke-SyncEntity $Target
    $ApplyLabel = if ($Apply) { "apply" } else { "dry-run" }
    $ModeLabel  = if ($WithData) { "with-data" } else { "index-only" }
    if ($ok) {
        Write-Host ""
        Write-Host "[summary] target=$Target mode=$ModeLabel apply=$ApplyLabel total=1 success=1 failed=0"
    } else {
        Write-Host ""
        Write-Host "[summary] target=$Target mode=$ModeLabel apply=$ApplyLabel total=1 success=0 failed=1"
        exit 1
    }
}
