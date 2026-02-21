# Entity CLI wrapper script (Windows PowerShell)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$BinPath = Join-Path $ProjectRoot "bin\entity-cli.exe"

# Load language from .env
$Language = "ko"
$EnvFile = Join-Path $ProjectRoot ".env"
if (Test-Path $EnvFile) {
    $LangLine = Get-Content $EnvFile | Where-Object { $_ -match '^LANGUAGE=' } | Select-Object -First 1
    if ($LangLine) { $Language = $LangLine -replace '^LANGUAGE=', '' }
}

# Require prebuilt CLI binary
if (-not (Test-Path $BinPath)) {
    if ($Language -eq "en") { Write-Host "X bin/entity-cli.exe not found" }
    else { Write-Host "X bin/entity-cli.exe 파일이 없습니다" }
    exit 1
}

Set-Location $ProjectRoot
$env:ENTITY_CLI_NAME = "cli"
& $BinPath @args
