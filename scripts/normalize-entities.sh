#!/bin/bash

# 엔티티 JSON 파일 정규화 (기본값 제거, 키 순서 정렬)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Load language from .env
if [ -f .env ]; then
    LANGUAGE=$(grep '^LANGUAGE=' .env | cut -d '=' -f2)
fi
LANGUAGE=${LANGUAGE:-ko}

# 인자 없이 실행하면 도움말 표시
if [ $# -eq 0 ]; then
    if [ "$LANGUAGE" = "en" ]; then
        echo "Normalize Entity JSON"
        echo "====================="
        echo ""
        echo "Remove redundant default values and reorder keys in entity JSON files."
        echo "Also auto-creates missing required entities (api_keys, rbac_roles, and account/user when JWT is enabled)."
        echo ""
        echo "Usage: $0 [options]"
        echo ""
        echo "Options:"
        echo "  --apply            Apply changes (default is dry-run)"
        echo "  --entity=<name>    Normalize a single entity only"
        echo ""
        echo "Normalization rules:"
        echo "  - Remove enabled:true (default)"
        echo "  - Remove hard_delete:false (default)"
        echo "  - Remove optimistic_lock:false (default)"
        echo "  - Remove optimistic_lock:true when global_optimistic_lock=true"
        echo "  - Remove license_scope:true when global_license_scope=true"
        echo "  - Remove cache.enabled:true (default within cache block)"
        echo "  - Remove explicit fk entries auto-inferred from *_seq (e.g. user_seq: user.seq)"
        echo "  - Remove explicit types entries when equal to inferred field type"
        echo "  - Reorder index field keys to canonical order"
        echo "  - Reorder top-level keys to canonical order"
        echo ""
        echo "Required entities (auto-created if missing, full mode only):"
        echo "  - api_keys    → entities/Auth/api_keys.json"
        echo "  - rbac_roles  → entities/Auth/rbac_roles.json"
        echo "  - account     → entities/Auth/account.json (JWT enabled only)"
        echo "  - user        → entities/User/user.json (JWT enabled only)"
        echo ""
        echo "Examples:"
        echo "  $0                        # Dry-run all entities"
        echo "  $0 --apply                # Normalize all + create missing required entities"
        echo "  $0 --entity=account          # Dry-run for account entity"
        echo "  $0 --entity=account --apply  # Normalize account entity"
    else
        echo "엔티티 JSON 정규화"
        echo "=================="
        echo ""
        echo "엔티티 JSON 파일에서 불필요한 기본값을 제거하고 키 순서를 정렬합니다."
        echo "전체 모드에서는 필수 엔티티(api_keys, rbac_roles, JWT 사용 시 account/user)가 없으면 자동 생성합니다."
        echo ""
        echo "사용법: $0 [옵션]"
        echo ""
        echo "옵션:"
        echo "  --apply            실제 파일 수정 (기본은 dry-run)"
        echo "  --entity=<이름>    단일 엔티티만 정규화"
        echo ""
        echo "정규화 규칙:"
        echo "  - enabled:true 제거 (기본값)"
        echo "  - hard_delete:false 제거 (기본값)"
        echo "  - optimistic_lock:false 제거 (기본값)"
        echo "  - optimistic_lock:true 제거 (전역 설정과 동일할 경우)"
        echo "  - license_scope:true 제거 (전역 설정과 동일할 경우)"
        echo "  - cache.enabled:true 제거 (cache 블록 내 기본값)"
        echo "  - *_seq 자동추론과 동일한 명시 fk 제거 (예: user_seq: user.seq)"
        echo "  - 자동추론 타입과 동일한 types 명시 제거"
        echo "  - index 필드 키 순서 정규화"
        echo "  - 최상위 키 순서 정규화"
        echo ""
        echo "필수 엔티티 자동 생성 (전체 모드, 없을 경우):"
        echo "  - api_keys   → entities/Auth/api_keys.json"
        echo "  - rbac_roles → entities/Auth/rbac_roles.json"
        echo "  - account    → entities/Auth/account.json (JWT 활성 시)"
        echo "  - user       → entities/User/user.json (JWT 활성 시)"
        echo ""
        echo "예제:"
        echo "  $0                        # 전체 엔티티 dry-run 미리보기"
        echo "  $0 --apply                # 전체 정규화 + 필수 엔티티 없으면 생성"
        echo "  $0 --entity=account          # account 엔티티 dry-run"
        echo "  $0 --entity=account --apply  # account 엔티티 정규화"
    fi
    exit 0
fi

# Require prebuilt CLI binary
if [ ! -f "$PROJECT_ROOT/bin/entity-cli" ]; then
    if [ "$LANGUAGE" = "en" ]; then
        echo "❌ bin/entity-cli not found. Run scripts/build.sh first."
    else
        echo "❌ bin/entity-cli 파일이 없습니다. scripts/build.sh 를 먼저 실행하세요."
    fi
    exit 1
fi

APPLY_FLAG=""
ENTITY_FLAG=""

for arg in "$@"; do
    case "$arg" in
        --apply)
            APPLY_FLAG="--apply"
            ;;
        --entity=*)
            ENTITY_FLAG="$arg"
            ;;
        *)
            if [ "$LANGUAGE" = "en" ]; then
                echo "❌ Unknown option: $arg"
                echo "Run '$0' with no arguments for usage"
            else
                echo "❌ 알 수 없는 옵션: $arg"
                echo "'$0' 를 인자 없이 실행하면 사용법을 확인할 수 있습니다"
            fi
            exit 1
            ;;
    esac
done

CMD=("$PROJECT_ROOT/bin/entity-cli" normalize-entities)
[ -n "$ENTITY_FLAG" ] && CMD+=("$ENTITY_FLAG")
[ -n "$APPLY_FLAG" ] && CMD+=("$APPLY_FLAG")

exec "${CMD[@]}"
