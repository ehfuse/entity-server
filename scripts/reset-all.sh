#!/bin/bash

set -e
set -o pipefail

# Reset all entity tables and seed default data

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
RESET_LOG=""

cleanup() {
    if [ -n "$RESET_LOG" ] && [ -f "$RESET_LOG" ]; then
        rm -f "$RESET_LOG"
    fi
}

trap cleanup EXIT

cd "$PROJECT_ROOT"

ENTITY_CLI_BIN="$PROJECT_ROOT/bin/entity-cli"
if [ ! -f "$ENTITY_CLI_BIN" ] && [ -f "$PROJECT_ROOT/entity-cli" ]; then
    ENTITY_CLI_BIN="$PROJECT_ROOT/entity-cli"
fi

# Load language from .env
if [ -f .env ]; then
    LANGUAGE=$(grep '^LANGUAGE=' .env | cut -d '=' -f2 || true)
fi
LANGUAGE=${LANGUAGE:-ko}

warn_running_server_reload_needed() {
    local run_pid_file="$PROJECT_ROOT/.run/entity-server.pid"
    local server_pid=""

    if [ -f "$run_pid_file" ]; then
        server_pid=$(cat "$run_pid_file" 2>/dev/null || true)
    fi

    if [ -n "$server_pid" ] && kill -0 "$server_pid" 2>/dev/null; then
        echo ""
        echo "=================================================="
        if [ "$LANGUAGE" = "en" ]; then
            echo "⚠️  Entity Server is still running with the previous in-memory API key map."
            echo "   CLI reset-all updates the DB only, so restart the server before using the new API key:"
            echo ""
            echo "   ./scripts/run.sh stop"
            echo "   ./scripts/run.sh start"
        else
            echo "⚠️  Entity Server가 이전 메모리 API 키 맵으로 계속 실행 중입니다."
            echo "   CLI reset-all 은 DB만 갱신하므로, 새 API 키를 사용하기 전에 서버를 재시작해야 합니다:"
            echo ""
            echo "   ./scripts/run.sh stop"
            echo "   ./scripts/run.sh start"
        fi
        echo "=================================================="
        echo ""
    fi
}

get_env_value() {
    local key="$1"
    local value="${!key}"

    if [ -n "$value" ]; then
        echo "$value"
        return
    fi

    if [ -f .env ]; then
        value=$(grep -E "^${key}=" .env | tail -n 1 | cut -d '=' -f2-)
        echo "$value"
    fi
}

get_database_default_group() {
    grep -E '"default"[[:space:]]*:' "$PROJECT_ROOT/configs/database.json" \
        | head -n 1 \
        | sed -E 's/.*:[[:space:]]*"([^"]+)".*/\1/'
}

get_database_group_field() {
    local group="$1"
    local field="$2"

    awk -v group="$group" -v field="$field" '
        $0 ~ "^[[:space:]]*\"" group "\"[[:space:]]*:[[:space:]]*\\{" { in_group=1; next }
        in_group && $0 ~ "^[[:space:]]*}" { exit }
        in_group && $0 ~ "^[[:space:]]*\"" field "\"[[:space:]]*:" {
            match($0, /"[^"]+"[[:space:]]*:[[:space:]]*"([^"]+)"/, arr)
            if (arr[1] != "") {
                print arr[1]
            }
            exit
        }
    ' "$PROJECT_ROOT/configs/database.json"
}

resolve_database_name() {
    local group="$1"
    local raw_value
    raw_value=$(get_database_group_field "$group" "database")

    if [[ "$raw_value" =~ ^\$\{([A-Z0-9_]+)\}$ ]]; then
        get_env_value "${BASH_REMATCH[1]}"
        return
    fi

    echo "$raw_value"
}

print_target_database() {
    local group
    local database_name

    group=$(get_database_default_group)
    database_name=$(resolve_database_name "$group")

    echo ""
    if [ "$LANGUAGE" = "en" ]; then
        echo "Target database group: ${group:-<unknown>}"
        echo "Target database name : ${database_name:-<unknown>}"
    else
        echo "대상 DB 그룹 : ${group:-<unknown>}"
        echo "대상 DB 이름 : ${database_name:-<unknown>}"
    fi
    echo ""
}

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
if [ ! -f "$ENTITY_CLI_BIN" ]; then
    if [ "$LANGUAGE" = "en" ]; then
        echo "❌ entity-cli not found (bin/entity-cli or ./entity-cli)"
    else
        echo "❌ entity-cli 파일이 없습니다 (bin/entity-cli 또는 ./entity-cli)"
    fi
    exit 1
fi

# Execute based on flag
case "$1" in
    --dry-run)
        print_target_database
        "$ENTITY_CLI_BIN" reset-all
        ;;
    --force|--apply)
        print_target_database
        # 필수 엔티티 없으면 자동 생성 (api_keys, rbac_roles, account, user)
        if [ "$LANGUAGE" = "en" ]; then
            echo "⚙️  Checking required entities..."
        else
            echo "⚙️  필수 엔티티 확인 중..."
        fi
        LANGUAGE="$LANGUAGE" "$SCRIPT_DIR/normalize-entities.sh" --apply

        RESET_LOG=$(mktemp)
        if [ "$1" = "--force" ]; then
            set +e
            "$ENTITY_CLI_BIN" reset-all --apply --force 2>&1 | tee "$RESET_LOG"
            RESET_STATUS=${PIPESTATUS[0]}
            set -e
        else
            set +e
            "$ENTITY_CLI_BIN" reset-all --apply 2>&1 | tee "$RESET_LOG"
            RESET_STATUS=${PIPESTATUS[0]}
            set -e
        fi

        if [ "$RESET_STATUS" -ne 0 ]; then
            exit "$RESET_STATUS"
        fi

        if ! grep -q "Reset completed successfully!" "$RESET_LOG"; then
            exit 0
        fi

        # 새로 생성된 API 키 조회 후 .env 업데이트
        FIRST_SEQ=$("$ENTITY_CLI_BIN" api-key list 2>/dev/null | awk 'NR>4 && /^[0-9]/ {print $1; exit}')
        API_KEY_OUTPUT=""
        if [ -n "$FIRST_SEQ" ]; then
            API_KEY_OUTPUT=$("$ENTITY_CLI_BIN" api-key show --seq="$FIRST_SEQ" --reveal-secret 2>/dev/null)
        fi
        NEW_API_KEY=$(echo "$API_KEY_OUTPUT" | grep -E '^key_value' | awk '{print $NF}' || true)
        NEW_HMAC=$(echo "$API_KEY_OUTPUT" | grep -E '^hmac_secret' | awk '{print $NF}' || true)

        if [ -n "$NEW_API_KEY" ] && [ -n "$NEW_HMAC" ]; then
            warn_running_server_reload_needed

            # 게이트웨이 .env 자동 업데이트 (개발 환경: entity-app-server/ 폴더가 같은 레벨에 있을 때만)
            GW_DIR="$(dirname "$PROJECT_ROOT")/entity-app-server"
            GW_ENV="$GW_DIR/.env"
            GW_UPDATED=0
            if [ -d "$GW_DIR" ] && [ -f "$GW_ENV" ]; then
                sed -i "s|^ENTITY_API_KEY=.*|ENTITY_API_KEY=$NEW_API_KEY|" "$GW_ENV"
                sed -i "s|^ENTITY_HMAC_SECRET=.*|ENTITY_HMAC_SECRET=$NEW_HMAC|" "$GW_ENV"
                GW_UPDATED=1
            fi

            echo ""
            echo "=================================================="
            if [ "$LANGUAGE" = "en" ]; then
                echo "🔑 New API Key generated:"
            else
                echo "🔑 새 API 키가 생성되었습니다:"
            fi
            echo ""
            echo "   ENTITY_API_KEY     = $NEW_API_KEY"
            echo "   ENTITY_HMAC_SECRET = $NEW_HMAC"
            echo ""
            if [ "$GW_UPDATED" = "1" ]; then
                if [ "$LANGUAGE" = "en" ]; then
                    echo "   ✓ Updated: entity-app-server/.env"
                else
                    echo "   ✓ 업데이트 완료: entity-app-server/.env"
                fi
                echo ""
            fi
            echo "=================================================="
            echo ""
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
