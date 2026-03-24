# Generate Environment Keys/Secrets - Windows PowerShell
# Generates ENCRYPTION_KEY and JWT_SECRET random values
param(
    [switch]$Create,
    [switch]$Export,
    [switch]$Apply
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

# Load language from .env (env var takes priority)
$Language = $env:LANGUAGE
if (-not $Language) {
    $EnvFile = Join-Path $ProjectRoot ".env"
    if (Test-Path $EnvFile) {
        $LangLine = Get-Content $EnvFile | Where-Object { $_ -match '^LANGUAGE=' } | Select-Object -Last 1
        if ($LangLine) { $Language = $LangLine -replace '^LANGUAGE=', '' }
    }
}
if (-not $Language) { $Language = "ko" }

function Show-Help {
    if ($Language -eq "en") {
        Write-Host "Generate Environment Keys/Secrets"
        Write-Host "==================================="
        Write-Host ""
        Write-Host "Generates random values for ENCRYPTION_KEY and JWT_SECRET."
        Write-Host ""
        Write-Host "Note: API keys (api_keys entity) are managed via DB commands:"
        Write-Host "      .\scripts\api-key.ps1 add --role=admin --apply"
        Write-Host ""
        Write-Host "Usage: .\generate-env-keys.ps1 [-Create|-Export|-Apply]"
        Write-Host ""
        Write-Host "Options:"
        Write-Host "    -Create      Print copy/paste format for .env"
        Write-Host "    -Export      Print shell export format"
        Write-Host "    -Apply       Apply values directly to project .env"
        Write-Host ""
        Write-Host "Examples:"
        Write-Host "    .\generate-env-keys.ps1 -Create"
        Write-Host "    .\generate-env-keys.ps1 -Export"
        Write-Host "    .\generate-env-keys.ps1 -Apply"
    } else {
        Write-Host "환경 변수 키/시크릿 생성"
        Write-Host "======================="
        Write-Host ""
        Write-Host "ENCRYPTION_KEY, JWT_SECRET 랜덤 값을 생성합니다."
        Write-Host ""
        Write-Host "참고: API 키(api_keys 엔티티)는 DB 명령으로 관리합니다:"
        Write-Host "      .\scripts\api-key.ps1 add --role=admin --apply"
        Write-Host ""
        Write-Host "사용법: .\generate-env-keys.ps1 [-Create|-Export|-Apply]"
        Write-Host ""
        Write-Host "옵션:"
        Write-Host "    -Create      .env 복붙 형식으로 출력"
        Write-Host "    -Export      export 형식으로 출력"
        Write-Host "    -Apply       프로젝트 루트 .env 파일에 즉시 반영"
        Write-Host ""
        Write-Host "예제:"
        Write-Host "    .\generate-env-keys.ps1 -Create"
        Write-Host "    .\generate-env-keys.ps1 -Export"
        Write-Host "    .\generate-env-keys.ps1 -Apply"
    }
}

if (-not $Create -and -not $Export -and -not $Apply) {
    Show-Help
    exit 0
}

function New-RandomHex {
    param([int]$Bytes)
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $buf = New-Object byte[] $Bytes
    $rng.GetBytes($buf)
    return ($buf | ForEach-Object { $_.ToString("x2") }) -join ""
}

$EncryptionKey = New-RandomHex 16
$JwtSecret = New-RandomHex 32

if ($Export) {
    Write-Host "SET ENCRYPTION_KEY=$EncryptionKey"
    Write-Host "SET JWT_SECRET=$JwtSecret"
    Write-Host ""
    Write-Host "# PowerShell:"
    Write-Host "`$env:ENCRYPTION_KEY=`"$EncryptionKey`""
    Write-Host "`$env:JWT_SECRET=`"$JwtSecret`""
} elseif ($Create) {
    if ($Language -eq "en") { Write-Host "# Copy & paste to .env" }
    else { Write-Host "# .env에 복사해서 붙여넣기" }
    Write-Host "ENCRYPTION_KEY=$EncryptionKey"
    Write-Host "JWT_SECRET=$JwtSecret"
} elseif ($Apply) {
    $EnvFile = Join-Path $ProjectRoot ".env"
    if (-not (Test-Path $EnvFile)) { New-Item -ItemType File -Path $EnvFile | Out-Null }

    function Update-EnvKey {
        param([string]$File, [string]$Key, [string]$Value)
        $content = Get-Content $File
        $found = $false
        $newContent = $content | ForEach-Object {
            if ($_ -match "^$Key=") {
                $found = $true
                "$Key=$Value"
            } else { $_ }
        }
        if (-not $found) { $newContent += "$Key=$Value" }
        $newContent | Set-Content $File
    }

    Update-EnvKey $EnvFile "ENCRYPTION_KEY" $EncryptionKey
    Update-EnvKey $EnvFile "JWT_SECRET" $JwtSecret

    if ($Language -eq "en") {
        Write-Host "OK Updated: $EnvFile"
        Write-Host "  - ENCRYPTION_KEY"
        Write-Host "  - JWT_SECRET"
    } else {
        Write-Host "OK 업데이트 완료: $EnvFile"
        Write-Host "  - ENCRYPTION_KEY"
        Write-Host "  - JWT_SECRET"
    }
}
