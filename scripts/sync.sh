#!/bin/bash

# Sync entity index schema

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
        echo "Sync Entity Index Schema"
        echo "========================"
        echo ""
        echo "Synchronize index table schema with entity configuration."
        echo ""
        echo "Usage: $0 <entity-name>|--all [--dry-run|--apply] [--index-only|--with-data]"
        echo ""
        echo "Arguments:"
        echo "  entity-name  Name of the entity to sync (required)"
        echo "  --all        Sync all entities in entities/"
        echo ""
        echo "Options:"
        echo "  --dry-run  Preview mode - show what will be changed"
        echo "  --apply    Apply changes to database"
        echo "  --index-only  Sync index schema only (default)"
        echo "  --with-data   Sync schema and backfill index rows from existing data"
        echo ""
        echo "Examples:"
        echo "  $0 user --dry-run    # Preview changes for user entity"
        echo "  $0 user --apply      # Apply changes for user entity"
        echo "  $0 user --apply --with-data  # Apply + backfill"
        echo "  $0 --all --dry-run   # Preview for all entities"
        echo "  $0 --all --apply     # Apply for all entities"
        echo "  $0 license --apply   # Sync license entity schema"
    else
        echo "엔티티 인덱스 스키마 동기화"
        echo "======================="
        echo ""
        echo "엔티티 설정과 인덱스 테이블 스키마를 동기화합니다."
        echo ""
        echo "사용법: $0 <엔티티명>|--all [--dry-run|--apply] [--index-only|--with-data]"
        echo ""
        echo "인자:"
        echo "  엔티티명  동기화할 엔티티 이름 (필수)"
        echo "  --all     entities/ 내 전체 엔티티 동기화"
        echo ""
        echo "옵션:"
        echo "  --dry-run  미리보기 모드 - 변경사항 확인"
        echo "  --apply    데이터베이스에 변경사항 적용"
        echo "  --index-only  인덱스 스키마만 동기화 (기본값)"
        echo "  --with-data   스키마 동기화 + 기존 데이터 인덱스 백필"
        echo ""
        echo "예제:"
        echo "  $0 user --dry-run    # user 엔티티 변경사항 미리보기"
        echo "  $0 user --apply      # user 엔티티 변경사항 적용"
        echo "  $0 user --apply --with-data  # 적용 + 기존 데이터 백필"
        echo "  $0 --all --dry-run   # 전체 엔티티 미리보기"
        echo "  $0 --all --apply     # 전체 엔티티 적용"
        echo "  $0 license --apply   # license 엔티티 스키마 동기화"
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

TARGET="$1"
APPLY_MODE="--dry-run"
SYNC_MODE="--index-only"

for arg in "${@:2}"; do
    case "$arg" in
        --dry-run|--apply)
            APPLY_MODE="$arg"
            ;;
        --index-only|--with-data)
            SYNC_MODE="$arg"
            ;;
        *)
            if [ "$LANGUAGE" = "en" ]; then
                echo "❌ Unknown option: $arg"
                echo "Run '$0' for usage information"
            else
                echo "❌ 알 수 없는 옵션: $arg"
                echo "'$0'로 사용법을 확인하세요"
            fi
            exit 1
            ;;
    esac
done

if [ "$SYNC_MODE" = "--with-data" ] && [ "$APPLY_MODE" != "--apply" ]; then
    if [ "$LANGUAGE" = "en" ]; then
        echo "❌ --with-data requires --apply"
    else
        echo "❌ --with-data 는 --apply 와 함께 사용해야 합니다"
    fi
    exit 1
fi

build_cmd() {
    local entity_name="$1"
    local cmd=("$PROJECT_ROOT/bin/entity-cli" sync-index --entity="$entity_name")
    if [ "$APPLY_MODE" = "--apply" ]; then
        cmd+=(--apply)
    fi
    if [ "$SYNC_MODE" = "--with-data" ]; then
        cmd+=(--with-data)
    fi
    echo "${cmd[@]}"
}

run_for_entity() {
    local entity_name="$1"
    local cmd
    cmd=$(build_cmd "$entity_name")
    echo "[sync] $entity_name"
    if eval "$cmd"; then
        return 0
    fi
    return 1
}

if [ "$TARGET" = "--all" ]; then
    mapfile -t ENTITIES < <(find "$PROJECT_ROOT/entities" -type f -name '*.json' -printf '%f\n' | sed 's/\.json$//' | sort -u)

    if [ ${#ENTITIES[@]} -eq 0 ]; then
        if [ "$LANGUAGE" = "en" ]; then
            echo "❌ No entity config files found in entities/"
        else
            echo "❌ entities/ 에 엔티티 설정 파일이 없습니다"
        fi
        exit 1
    fi

    total_count=${#ENTITIES[@]}
    success_count=0
    failed_count=0

    for entity in "${ENTITIES[@]}"; do
        if run_for_entity "$entity"; then
            success_count=$((success_count + 1))
        else
            failed_count=$((failed_count + 1))
        fi
    done

    echo ""
    echo "[summary] target=all mode=${SYNC_MODE#--} apply=${APPLY_MODE#--} total=${total_count} success=${success_count} failed=${failed_count}"

    if [ "$failed_count" -gt 0 ]; then
        exit 1
    fi
else
    if run_for_entity "$TARGET"; then
        echo ""
        echo "[summary] target=${TARGET} mode=${SYNC_MODE#--} apply=${APPLY_MODE#--} total=1 success=1 failed=0"
    else
        echo ""
        echo "[summary] target=${TARGET} mode=${SYNC_MODE#--} apply=${APPLY_MODE#--} total=1 success=0 failed=1"
        exit 1
    fi
fi
