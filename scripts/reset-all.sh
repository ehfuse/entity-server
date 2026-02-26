#!/bin/bash

# Reset all entity tables and seed default data

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Load language from .env
if [ -f .env ]; then
    LANGUAGE=$(grep '^LANGUAGE=' .env | cut -d '=' -f2)
fi
LANGUAGE=${LANGUAGE:-ko}

# Show usage if no arguments
if [ $# -eq 0 ]; then
    if [ "$LANGUAGE" = "en" ]; then
        echo "Reset All Entity Tables"
        echo "======================="
        echo ""
        echo "Drop all entity tables and recreate with default data."
        echo ""
        echo "Usage: $0 [OPTIONS]"
        echo ""
        echo "Options:"
        echo "  --dry-run  Preview mode - show what will be deleted"
        echo "  --apply    Apply changes with confirmation prompt"
        echo "  --force    Apply changes without confirmation"
        echo ""
        echo "Examples:"
        echo "  $0 --dry-run    # See what will happen"
        echo "  $0 --apply      # Execute with confirmation"
        echo "  $0 --force      # Execute immediately (dangerous!)"
    else
        echo "모든 엔티티 테이블 초기화"
        echo "====================="
        echo ""
        echo "모든 entity 테이블을 삭제하고 기본 데이터로 재생성합니다."
        echo ""
        echo "사용법: $0 [옵션]"
        echo ""
        echo "옵션:"
        echo "  --dry-run  미리보기 모드 - 삭제될 테이블 확인"
        echo "  --apply    확인 후 실행"
        echo "  --force    확인 없이 즉시 실행"
        echo ""
        echo "예제:"
        echo "  $0 --dry-run    # 미리보기"
        echo "  $0 --apply      # 확인 후 실행"
        echo "  $0 --force      # 즉시 실행 (위험!)"
    fi
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

# Execute based on flag
case "$1" in
    --dry-run)
        "$PROJECT_ROOT/bin/entity-cli" reset-all
        ;;
    --force|--apply)
        # 필수 엔티티 없으면 자동 생성 (api_keys, rbac_roles, account, user)
        if [ "$LANGUAGE" = "en" ]; then
            echo "⚙️  Checking required entities..."
        else
            echo "⚙️  필수 엔티티 확인 중..."
        fi
        LANGUAGE="$LANGUAGE" "$SCRIPT_DIR/normalize-entities.sh" --apply
        if [ "$1" = "--force" ]; then
            "$PROJECT_ROOT/bin/entity-cli" reset-all --apply --force
        else
            "$PROJECT_ROOT/bin/entity-cli" reset-all --apply
        fi
        ;;
    *)
        if [ "$LANGUAGE" = "en" ]; then
            echo "❌ Unknown option: $1"
            echo "Run '$0' for usage information"
        else
            echo "❌ 알 수 없는 옵션: $1"
            echo "'$0'로 사용법을 확인하세요"
        fi
        exit 1
        ;;
esac
