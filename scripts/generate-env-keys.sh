#!/bin/bash
# 환경 변수 키/시크릿 생성 스크립트
# ENCRYPTION_KEY, JWT_SECRET 랜덤 값 생성

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# LANGUAGE 환경변수를 우선 사용하고, 없으면 .env에서 로드
if [ -z "${LANGUAGE:-}" ] && [ -f "$PROJECT_ROOT/.env" ]; then
    LANGUAGE=$(grep '^LANGUAGE=' "$PROJECT_ROOT/.env" | tail -n 1 | cut -d '=' -f2 || true)
fi
LANGUAGE=${LANGUAGE:-ko}

show_help() {
    if [ "$LANGUAGE" = "en" ]; then
        cat <<'EOF'
Generate Environment Keys/Secrets
===================================

Generates random values for ENCRYPTION_KEY and JWT_SECRET.

Note: API keys (api_keys entity) are managed via DB commands:
      ./scripts/api-key.sh add --role=admin --apply

Usage: ./scripts/generate-env-keys.sh [--create|--export|--apply]

Options:
    --create      Print copy/paste format for .env
    --export      Print shell export format
    --apply       Apply values directly to project .env

Examples:
    ./scripts/generate-env-keys.sh --create
    ./scripts/generate-env-keys.sh --export
    ./scripts/generate-env-keys.sh --apply
EOF
    else
        cat <<'EOF'
환경 변수 키/시크릿 생성
=======================

ENCRYPTION_KEY, JWT_SECRET 랜덤 값을 생성합니다.

참고: API 키(api_keys 엔티티)는 DB 명령으로 관리합니다:
      ./scripts/api-key.sh add --role=admin --apply

사용법: ./scripts/generate-env-keys.sh [--create|--export|--apply]

옵션:
    --create      .env 복붙 형식으로 출력
    --export      export 형식으로 출력
    --apply       프로젝트 루트 .env 파일에 즉시 반영

예제:
    ./scripts/generate-env-keys.sh --create
    ./scripts/generate-env-keys.sh --export
    ./scripts/generate-env-keys.sh --apply
EOF
    fi
}

if [[ $# -eq 0 ]]; then
    show_help
    exit 0
fi

OUTPUT_MODE=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --create)
            OUTPUT_MODE="dotenv"
            shift
            ;;
        --export)
            OUTPUT_MODE="export"
            shift
            ;;
        --apply)
            OUTPUT_MODE="apply-env"
            shift
            ;;
        *)
            if [ "$LANGUAGE" = "en" ]; then
                echo "❌ Unknown option: $1"
            else
                echo "❌ 알 수 없는 옵션: $1"
            fi
            echo ""
            show_help
            exit 1
            ;;
    esac
done

gen_hex() {
    local bytes="$1"
    if command -v openssl >/dev/null 2>&1; then
        openssl rand -hex "$bytes"
    else
        head -c "$bytes" /dev/urandom | od -An -tx1 | tr -d ' \n'
    fi
}

ENCRYPTION_KEY="$(gen_hex 16)"
JWT_SECRET="$(gen_hex 32)"

if [[ "$OUTPUT_MODE" == "export" ]]; then
    cat <<EOF
export ENCRYPTION_KEY=$ENCRYPTION_KEY
export JWT_SECRET=$JWT_SECRET
EOF
elif [[ "$OUTPUT_MODE" == "dotenv" ]]; then
    cat <<EOF
# $( [ "$LANGUAGE" = "en" ] && echo "Copy & paste to .env" || echo ".env에 복사해서 붙여넣기" )
ENCRYPTION_KEY=$ENCRYPTION_KEY
JWT_SECRET=$JWT_SECRET
EOF
else
    # --apply
    ENV_FILE="$PROJECT_ROOT/.env"
    touch "$ENV_FILE"

    upsert_env_key() {
        local key="$1"
        local value="$2"
        if grep -q "^${key}=" "$ENV_FILE"; then
            sed -i "s|^${key}=.*$|${key}=${value}|" "$ENV_FILE"
        else
            echo "${key}=${value}" >> "$ENV_FILE"
        fi
    }

    upsert_env_key "ENCRYPTION_KEY" "$ENCRYPTION_KEY"
    upsert_env_key "JWT_SECRET" "$JWT_SECRET"

    if [ "$LANGUAGE" = "en" ]; then
        echo "✓ Updated: $ENV_FILE"
        echo "  - ENCRYPTION_KEY"
        echo "  - JWT_SECRET"
    else
        echo "✓ 업데이트 완료: $ENV_FILE"
        echo "  - ENCRYPTION_KEY"
        echo "  - JWT_SECRET"
    fi
fi
