#!/bin/bash

# Cleanup expired history rows by history_ttl

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

ENTITY_CLI_BIN="$PROJECT_ROOT/bin/entity-cli"
if [ ! -f "$ENTITY_CLI_BIN" ] && [ -f "$PROJECT_ROOT/entity-cli" ]; then
    ENTITY_CLI_BIN="$PROJECT_ROOT/entity-cli"
fi

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
if [ ! -f "$ENTITY_CLI_BIN" ]; then
    if [ "$LANGUAGE" = "en" ]; then
        echo "❌ entity-cli not found (bin/entity-cli or ./entity-cli)"
    else
        echo "❌ entity-cli 파일이 없습니다 (bin/entity-cli 또는 ./entity-cli)"
    fi
    exit 1
fi

# Pass-through to CLI
"$ENTITY_CLI_BIN" cleanup-history "$@"
