#!/bin/bash

# Add or reset a single entity tables

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Load language from .env
if [ -f .env ]; then
    LANGUAGE=$(grep '^LANGUAGE=' .env | cut -d '=' -f2)
fi
LANGUAGE=${LANGUAGE:-ko}

show_help() {
    if [ "$LANGUAGE" = "en" ]; then
        echo "Init Entity Tables"
        echo "=================="
        echo ""
        echo "Add, reset, or truncate one entity's data/index/history tables."
        echo ""
        echo "Usage: $0 --entity=<name> [--reset|--truncate] [--apply]"
        echo ""
        echo "Options:"
        echo "  --entity=<name>  Entity name (required)"
        echo "  --reset          Drop this entity tables and recreate"
        echo "  --truncate       Delete all rows and reset AUTO_INCREMENT=1"
        echo "  --apply          Execute (default is dry-run)"
        echo ""
        echo "Examples:"
        echo "  $0 --entity=license --apply"
        echo "  $0 --entity=account --reset --apply"
        echo "  $0 --entity=account --truncate --apply"
    else
        echo "단일 엔티티 테이블 초기화"
        echo "====================="
        echo ""
        echo "하나의 엔티티(data/index/history) 테이블을 추가/재생성/비우기(truncate) 합니다."
        echo ""
        echo "사용법: $0 --entity=<name> [--reset|--truncate] [--apply]"
        echo ""
        echo "옵션:"
        echo "  --entity=<name>  엔티티명 (필수)"
        echo "  --reset          해당 엔티티 테이블 드롭 후 재생성"
        echo "  --truncate       데이터 전체 삭제 + AUTO_INCREMENT=1 초기화"
        echo "  --apply          실제 실행 (기본은 dry-run)"
        echo ""
        echo "예제:"
        echo "  $0 --entity=license --apply"
        echo "  $0 --entity=account --reset --apply"
        echo "  $0 --entity=account --truncate --apply"
    fi
}

if [ $# -eq 0 ]; then
    show_help
    exit 0
fi

# Require prebuilt CLI binary
if [ ! -f "$PROJECT_ROOT/bin/entity-cli" ]; then
    if [ "$LANGUAGE" = "en" ]; then
        echo "❌ bin/entity-cli not found"
    else
        echo "❌ bin/entity-cli 파일이 없습니다"
    fi
    exit 1
fi

# Pass-through to CLI
"$PROJECT_ROOT/bin/entity-cli" init-entity "$@"
