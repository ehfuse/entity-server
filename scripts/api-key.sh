#!/bin/bash
# API 키 관리 스크립트 (CLI 바이너리 직접 호출)
# 서버가 중단된 상태에서도 사용 가능합니다.
# HTTP API 방식은 api-keys.sh 를 사용하세요.

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
        echo "API Key Management (CLI mode)"
        echo "============================="
        echo ""
        echo "Manage api_keys entity directly via CLI binary."
        echo "Server does NOT need to be running."
        echo ""
        echo "Usage: $0 <subcommand> [options]"
        echo ""
        echo "Subcommands:"
        echo "  list              List API keys"
        echo "  add               Create a new API key (key/secret auto-generated)"
        echo "  delete            Delete an API key by seq"
        echo "  help              Show this help"
        echo ""
        echo "list options:"
        echo "  --limit=<n>       Max rows to show (default: 20)"
        echo ""
        echo "add options:"
        echo "  --role=<name>     Role name (default: admin)"
        echo "  --entities=<json> Allowed entities JSON (default: [\"*\"])"
        echo "  --description=<t> Description"
        echo "  --user-seq=<n>    Associated user seq"
        echo "  --apply           Execute (default is dry-run)"
        echo ""
        echo "delete options:"
        echo "  --seq=<n>         API key seq to delete (required)"
        echo "  --apply           Execute (default is dry-run)"
        echo ""
        echo "Examples:"
        echo "  $0 list"
        echo "  $0 list --limit=50"
        echo "  $0 add --role=admin --apply"
        echo "  $0 add --role=viewer --entities='[\"user\",\"product\"]' --description=\"Viewer key\" --apply"
        echo "  $0 add --role=admin --user-seq=1 --apply"
        echo "  $0 delete --seq=3 --apply"
    else
        echo "API 키 관리 (CLI 모드)"
        echo "===================="
        echo ""
        echo "CLI 바이너리로 api_keys 엔티티를 직접 조작합니다."
        echo "서버가 실행 중이지 않아도 사용 가능합니다."
        echo ""
        echo "사용법: $0 <하위명령> [옵션]"
        echo ""
        echo "하위 명령:"
        echo "  list              API 키 목록 조회"
        echo "  add               새 API 키 생성 (키/시크릿 자동 생성)"
        echo "  delete            API 키 삭제 (seq 지정)"
        echo "  help              도움말 출력"
        echo ""
        echo "list 옵션:"
        echo "  --limit=<n>       최대 출력 행 수 (기본: 20)"
        echo ""
        echo "add 옵션:"
        echo "  --role=<이름>     역할명 (기본: admin)"
        echo "  --entities=<json> 허용 엔티티 JSON (기본: [\"*\"])"
        echo "  --description=<t> 설명"
        echo "  --user-seq=<n>    연결 사용자 seq"
        echo "  --apply           실제 실행 (기본: dry-run)"
        echo ""
        echo "delete 옵션:"
        echo "  --seq=<n>         삭제할 API 키 seq (필수)"
        echo "  --apply           실제 실행 (기본: dry-run)"
        echo ""
        echo "예제:"
        echo "  $0 list"
        echo "  $0 list --limit=50"
        echo "  $0 add --role=admin --apply"
        echo "  $0 add --role=viewer --entities='[\"user\",\"product\"]' --description=\"뷰어 키\" --apply"
        echo "  $0 add --role=admin --user-seq=1 --apply"
        echo "  $0 delete --seq=3 --apply"
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
        ENTITY_CLI_NAME="api-key" "$BIN_PATH" api-key "$SUBCOMMAND" "$@"
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
