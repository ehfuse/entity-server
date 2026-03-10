#!/bin/bash
# RBAC 역할 관리 스크립트 (CLI 바이너리 직접 호출)
# 서버가 중단된 상태에서도 사용 가능합니다.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BIN_PATH="$PROJECT_ROOT/bin/entity-cli"

cd "$PROJECT_ROOT"

# Load language from .env
if [ -f .env ]; then
    LANGUAGE=$(grep '^LANGUAGE=' .env | cut -d '=' -f2)
fi
LANGUAGE=${LANGUAGE:-ko}

show_help() {
    if [ "$LANGUAGE" = "en" ]; then
        echo "RBAC Role Management (CLI mode)"
        echo "================================"
        echo ""
        echo "Manage rbac_roles entity directly via CLI binary."
        echo "Server does NOT need to be running."
        echo ""
        echo "Usage: $0 <subcommand> [options]"
        echo ""
        echo "Subcommands:"
        echo "  list              List RBAC roles"
        echo "  add               Create a new role"
        echo "  delete            Delete a role by name or seq"
        echo "  help              Show this help"
        echo ""
        echo "list options:"
        echo "  --limit=<n>       Max rows to show (default: 50)"
        echo ""
        echo "add options:"
        echo "  --name=<name>     Role name (required, unique)"
        echo "  --permissions=<j> Permissions JSON array (default: [\"entity:read\",\"entity:list\"])"
        echo "  --description=<t> Description"
        echo "  --apply           Execute (default is dry-run)"
        echo ""
        echo "delete options:"
        echo "  --name=<name>     Role name to delete"
        echo "  --seq=<n>         Role seq to delete"
        echo "  --apply           Execute (default is dry-run)"
        echo ""
        echo "Examples:"
        echo "  $0 list"
        echo "  $0 add --name=readonly --permissions='[\"entity:read\",\"entity:list\"]' --apply"
        echo "  $0 add --name=fullaccess --permissions='[\"*\"]' --description=\"Full access\" --apply"
        echo "  $0 delete --name=readonly --apply"
        echo "  $0 delete --seq=5 --apply"
    else
        echo "RBAC 역할 관리 (CLI 모드)"
        echo "======================"
        echo ""
        echo "CLI 바이너리로 rbac_roles 엔티티를 직접 조작합니다."
        echo "서버가 실행 중이지 않아도 사용 가능합니다."
        echo ""
        echo "사용법: $0 <하위명령> [옵션]"
        echo ""
        echo "하위 명령:"
        echo "  list              RBAC 역할 목록 조회"
        echo "  add               새 역할 추가"
        echo "  delete            역할 삭제 (이름 또는 seq 지정)"
        echo "  help              도움말 출력"
        echo ""
        echo "list 옵션:"
        echo "  --limit=<n>       최대 출력 행 수 (기본: 50)"
        echo ""
        echo "add 옵션:"
        echo "  --name=<이름>      역할 이름 (필수, unique)"
        echo "  --permissions=<j> 권한 JSON 배열 (기본: [\"entity:read\",\"entity:list\"])"
        echo "  --description=<t> 설명"
        echo "  --apply           실제 실행 (기본: dry-run)"
        echo ""
        echo "delete 옵션:"
        echo "  --name=<이름>      삭제할 역할 이름"
        echo "  --seq=<n>         삭제할 역할 seq"
        echo "  --apply           실제 실행 (기본: dry-run)"
        echo ""
        echo "예제:"
        echo "  $0 list"
        echo "  $0 add --name=readonly --permissions='[\"entity:read\",\"entity:list\"]' --apply"
        echo "  $0 add --name=fullaccess --permissions='[\"*\"]' --description=\"전체 권한\" --apply"
        echo "  $0 delete --name=readonly --apply"
        echo "  $0 delete --seq=5 --apply"
    fi
}

# 인자 없으면 도움말
if [ $# -eq 0 ]; then
    show_help
    exit 0
fi

# CLI 바이너리 존재 확인
if [ ! -f "$BIN_PATH" ]; then
    if [ "$LANGUAGE" = "en" ]; then
        echo "❌ bin/entity-cli not found. Run: ./scripts/build.sh"
    else
        echo "❌ bin/entity-cli 파일이 없습니다. 먼저 ./scripts/build.sh 를 실행하세요."
    fi
    exit 1
fi

SUBCOMMAND="$1"
shift

case "$SUBCOMMAND" in
    list|show|add|delete)
        ENTITY_CLI_NAME="rbac-role" "$BIN_PATH" rbac-role "$SUBCOMMAND" "$@"
        ;;
    help|-h|--help)
        show_help
        ;;
    *)
        if [ "$LANGUAGE" = "en" ]; then
            echo "❌ Unknown subcommand: $SUBCOMMAND"
        else
            echo "❌ 알 수 없는 하위 명령: $SUBCOMMAND"
        fi
        echo ""
        show_help
        exit 1
        ;;
esac
