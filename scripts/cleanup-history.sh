#!/bin/bash

# Cleanup expired history rows by history_ttl

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
        echo "History TTL Cleanup"
        echo "==================="
        echo ""
        echo "Usage: $0 [--entity=<name>] [--apply]"
        echo ""
        echo "Options:"
        echo "  --entity=<name>  Cleanup only one entity history"
        echo "  --apply          Execute delete (default: dry-run)"
    else
        echo "히스토리 TTL 정리"
        echo "================"
        echo ""
        echo "사용법: $0 [--entity=<name>] [--apply]"
        echo ""
        echo "옵션:"
        echo "  --entity=<name>  특정 엔티티 히스토리만 정리"
        echo "  --apply          실제 삭제 실행 (기본: dry-run)"
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
"$PROJECT_ROOT/bin/entity-cli" cleanup-history "$@"
