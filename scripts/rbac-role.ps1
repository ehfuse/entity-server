# RBAC Role Management Script (CLI mode) - Windows PowerShell
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
        Write-Host "RBAC Role Management (CLI mode)"
        Write-Host "================================"
        Write-Host ""
        Write-Host "Manage rbac_roles entity directly via CLI binary."
        Write-Host "Server does NOT need to be running."
        Write-Host ""
        Write-Host "Usage: .\rbac-role.ps1 <subcommand> [options]"
        Write-Host ""
        Write-Host "Subcommands:"
        Write-Host "  list              List RBAC roles"
        Write-Host "  add               Create a new role"
        Write-Host "  delete            Delete a role by name or seq"
        Write-Host "  help              Show this help"
        Write-Host ""
        Write-Host "list options:"
        Write-Host "  --limit=<n>       Max rows to show (default: 50)"
        Write-Host ""
        Write-Host "add options:"
        Write-Host "  --name=<name>     Role name (required, unique)"
        Write-Host '  --permissions=<j> Permissions JSON array (default: ["entity:read","entity:list"])'
        Write-Host "  --description=<t> Description"
        Write-Host "  --apply           Execute (default is dry-run)"
        Write-Host ""
        Write-Host "delete options:"
        Write-Host "  --name=<name>     Role name to delete"
        Write-Host "  --seq=<n>         Role seq to delete"
        Write-Host "  --apply           Execute (default is dry-run)"
        Write-Host ""
        Write-Host "Examples:"
        Write-Host "  .\rbac-role.ps1 list"
        Write-Host '  .\rbac-role.ps1 add --name=readonly --permissions=["entity:read","entity:list"] --apply'
        Write-Host '  .\rbac-role.ps1 add --name=fullaccess --permissions=["*"] --description="Full access" --apply'
        Write-Host "  .\rbac-role.ps1 delete --name=readonly --apply"
        Write-Host "  .\rbac-role.ps1 delete --seq=5 --apply"
    } else {
        Write-Host "RBAC 역할 관리 (CLI 모드)"
        Write-Host "======================"
        Write-Host ""
        Write-Host "CLI 바이너리로 rbac_roles 엔티티를 직접 조작합니다."
        Write-Host "서버가 실행 중이지 않아도 사용 가능합니다."
        Write-Host ""
        Write-Host "사용법: .\rbac-role.ps1 <하위명령> [옵션]"
        Write-Host ""
        Write-Host "하위 명령:"
        Write-Host "  list              RBAC 역할 목록 조회"
        Write-Host "  add               새 역할 추가"
        Write-Host "  delete            역할 삭제 (이름 또는 seq 지정)"
        Write-Host "  help              도움말 출력"
        Write-Host ""
        Write-Host "list 옵션:"
        Write-Host "  --limit=<n>       최대 출력 행 수 (기본: 50)"
        Write-Host ""
        Write-Host "add 옵션:"
        Write-Host "  --name=<이름>      역할 이름 (필수, unique)"
        Write-Host '  --permissions=<j> 권한 JSON 배열 (기본: ["entity:read","entity:list"])'
        Write-Host "  --description=<t> 설명"
        Write-Host "  --apply           실제 실행 (기본: dry-run)"
        Write-Host ""
        Write-Host "delete 옵션:"
        Write-Host "  --name=<이름>      삭제할 역할 이름"
        Write-Host "  --seq=<n>         삭제할 역할 seq"
        Write-Host "  --apply           실제 실행 (기본: dry-run)"
        Write-Host ""
        Write-Host "예제:"
        Write-Host "  .\rbac-role.ps1 list"
        Write-Host '  .\rbac-role.ps1 add --name=readonly --permissions=["entity:read","entity:list"] --apply'
        Write-Host '  .\rbac-role.ps1 add --name=fullaccess --permissions=["*"] --description="전체 권한" --apply'
        Write-Host "  .\rbac-role.ps1 delete --name=readonly --apply"
        Write-Host "  .\rbac-role.ps1 delete --seq=5 --apply"
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

$remainingArgs = $args

switch ($SubCommand) {
    { $_ -in @("list", "show", "add", "delete") } {
        $env:ENTITY_CLI_NAME = "rbac-role"
        & $BinPath rbac-role $SubCommand @remainingArgs
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
