# API Key Management Script (CLI mode) - Windows PowerShell
# Can be used even when the server is stopped.
param(
    [Parameter(Position=0)]
    [string]$SubCommand = ""
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$BinPath = Join-Path $ProjectRoot "bin\entity-cli.exe"

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
        Write-Host "API Key Management (CLI mode)"
        Write-Host "============================="
        Write-Host ""
        Write-Host "Manage api_keys entity directly via CLI binary."
        Write-Host "Server does NOT need to be running."
        Write-Host ""
        Write-Host "Usage: .\api-key.ps1 <subcommand> [options]"
        Write-Host ""
        Write-Host "Subcommands:"
        Write-Host "  list              List API keys"
        Write-Host "  add               Create a new API key (key/secret auto-generated)"
        Write-Host "  delete            Delete an API key by seq"
        Write-Host "  help              Show this help"
        Write-Host ""
        Write-Host "list options:"
        Write-Host "  --limit=<n>       Max rows to show (default: 20)"
        Write-Host ""
        Write-Host "add options:"
        Write-Host "  --role=<name>     Role name (default: admin)"
        Write-Host "  --entities=<json> Allowed entities JSON (default: [`"*`"])"
        Write-Host "  --description=<t> Description"
        Write-Host "  --user-seq=<n>    Associated user seq"
        Write-Host "  --apply           Execute (default is dry-run)"
        Write-Host ""
        Write-Host "delete options:"
        Write-Host "  --seq=<n>         API key seq to delete (required)"
        Write-Host "  --apply           Execute (default is dry-run)"
        Write-Host ""
        Write-Host "Examples:"
        Write-Host "  .\api-key.ps1 list"
        Write-Host "  .\api-key.ps1 list --limit=50"
        Write-Host "  .\api-key.ps1 add --role=admin --apply"
        Write-Host "  .\api-key.ps1 delete --seq=3 --apply"
    } else {
        Write-Host "API 키 관리 (CLI 모드)"
        Write-Host "===================="
        Write-Host ""
        Write-Host "CLI 바이너리로 api_keys 엔티티를 직접 조작합니다."
        Write-Host "서버가 실행 중이지 않아도 사용 가능합니다."
        Write-Host ""
        Write-Host "사용법: .\api-key.ps1 <하위명령> [옵션]"
        Write-Host ""
        Write-Host "하위 명령:"
        Write-Host "  list              API 키 목록 조회"
        Write-Host "  add               새 API 키 생성 (키/시크릿 자동 생성)"
        Write-Host "  delete            API 키 삭제 (seq 지정)"
        Write-Host "  help              도움말 출력"
        Write-Host ""
        Write-Host "list 옵션:"
        Write-Host "  --limit=<n>       최대 출력 행 수 (기본: 20)"
        Write-Host ""
        Write-Host "add 옵션:"
        Write-Host "  --role=<이름>     역할명 (기본: admin)"
        Write-Host "  --entities=<json> 허용 엔티티 JSON (기본: [`"*`"])"
        Write-Host "  --description=<t> 설명"
        Write-Host "  --user-seq=<n>    연결 사용자 seq"
        Write-Host "  --apply           실제 실행 (기본: dry-run)"
        Write-Host ""
        Write-Host "delete 옵션:"
        Write-Host "  --seq=<n>         삭제할 API 키 seq (필수)"
        Write-Host "  --apply           실제 실행 (기본: dry-run)"
        Write-Host ""
        Write-Host "예제:"
        Write-Host "  .\api-key.ps1 list"
        Write-Host "  .\api-key.ps1 list --limit=50"
        Write-Host "  .\api-key.ps1 add --role=admin --apply"
        Write-Host "  .\api-key.ps1 delete --seq=3 --apply"
    }
}

if (-not $SubCommand) {
    Show-Help
    exit 0
}

if (-not (Test-Path $BinPath)) {
    if ($Language -eq "en") { Write-Host "X bin/entity-cli.exe not found. Run: .\scripts\build.ps1" }
    else { Write-Host "X bin/entity-cli.exe 파일이 없습니다. 먼저 .\scripts\build.ps1 를 실행하세요." }
    exit 1
}

# Collect remaining args (all args after SubCommand)
$remainingArgs = $args

switch ($SubCommand) {
    { $_ -in @("list", "show", "add", "delete") } {
        $env:ENTITY_CLI_NAME = "api-key"
        & $BinPath api-key $SubCommand @remainingArgs
    }
    { $_ -in @("help", "-h", "--help") } {
        Show-Help
    }
    default {
        if ($Language -eq "en") { Write-Host "X Unknown subcommand: $SubCommand" }
        else { Write-Host "X 알 수 없는 하위 명령: $SubCommand" }
        Write-Host ""
        Show-Help
        exit 1
    }
}
