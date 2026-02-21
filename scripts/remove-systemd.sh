#!/bin/bash

# Remove entity-server systemd service.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Load language from .env
if [ -f "$PROJECT_ROOT/.env" ]; then
    LANGUAGE=$(grep '^LANGUAGE=' "$PROJECT_ROOT/.env" | cut -d '=' -f2)
fi
LANGUAGE=${LANGUAGE:-ko}

SERVICE_NAME="entity-server"
INTERACTIVE=false
CONFIRMED=false
SERVER_CONFIG="$PROJECT_ROOT/configs/server.json"

load_namespace() {
    local namespace=""
    if [ -f "$SERVER_CONFIG" ]; then
        namespace=$(sed -n 's/.*"namespace"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$SERVER_CONFIG" | head -n 1)
    fi
    namespace=$(echo "$namespace" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9_-]/-/g')
    if [ -z "$namespace" ]; then
        namespace="default"
    fi
    SERVICE_NAME="${namespace}-entity-server"
}

load_namespace

show_help() {
    if [ "$LANGUAGE" = "en" ]; then
        echo "Remove systemd service for Entity Server"
        echo "======================================="
        echo ""
        echo "Usage: $0 [options]"
        echo ""
        echo "Service name is auto-generated as '<namespace>-entity-server'."
        echo "Run without arguments to enter interactive mode."
    else
        echo "Entity Server systemd 서비스 제거"
        echo "==============================="
        echo ""
        echo "사용법: $0"
        echo ""
        echo "서비스명은 '<namespace>-entity-server' 형식으로 자동 생성됩니다."
        echo "인수 없이 실행하면 인터랙티브 모드로 진입합니다."
    fi
}

if [ $# -eq 0 ]; then
    INTERACTIVE=true
fi

for arg in "$@"; do
    case "$arg" in
        --yes|-y)
            CONFIRMED=true
            ;;
        *)
            if [ "$LANGUAGE" = "en" ]; then
                echo "❌ Unknown option: $arg"
                echo "   Service name is fixed: $SERVICE_NAME"
            else
                echo "❌ 알 수 없는 옵션: $arg"
                echo "   서비스명은 자동 고정값입니다: $SERVICE_NAME"
            fi
            exit 1
            ;;
    esac
done

if [ "$INTERACTIVE" = true ] && [ "$CONFIRMED" = false ]; then
    if [ "$LANGUAGE" = "en" ]; then
        echo "[interactive] systemd service removal"
        echo "service name: $SERVICE_NAME"
    else
        echo "[interactive] systemd 서비스 제거"
        echo "서비스명: $SERVICE_NAME"
    fi

    if [ "$LANGUAGE" = "en" ]; then
        read -r -p "Remove service '$SERVICE_NAME'? [y/N]: " input
    else
        read -r -p "'$SERVICE_NAME' 서비스를 제거할까요? [y/N]: " input
    fi
    input=$(echo "$input" | tr '[:upper:]' '[:lower:]')
    if [ "$input" != "y" ] && [ "$input" != "yes" ]; then
        if [ "$LANGUAGE" = "en" ]; then
            echo "Canceled."
        else
            echo "취소되었습니다."
        fi
        exit 0
    fi
fi

UNIT_PATH="/etc/systemd/system/${SERVICE_NAME}.service"

if [ "$EUID" -ne 0 ]; then
    if command -v sudo >/dev/null 2>&1; then
        exec sudo "$0" --yes
    fi
    if [ "$LANGUAGE" = "en" ]; then
        echo "❌ This script requires root privileges"
    else
        echo "❌ 이 스크립트는 root 권한이 필요합니다"
    fi
    exit 1
fi

SERVICE_EXISTS=false
if systemctl list-unit-files | grep -q "^${SERVICE_NAME}\.service"; then
    SERVICE_EXISTS=true
fi
if [ ! -f "$UNIT_PATH" ] && [ "$SERVICE_EXISTS" = false ]; then
    if [ "$LANGUAGE" = "en" ]; then
        echo "ℹ️  Service '$SERVICE_NAME' is not registered."
        echo "   Nothing to remove."
        echo ""
        echo "   To register the service, run:"
        echo "   sudo $(dirname "$0")/install-systemd.sh"
    else
        echo "ℹ️  '$SERVICE_NAME' 서비스가 등록되어 있지 않습니다."
        echo "   제거할 항목이 없습니다."
        echo ""
        echo "   서비스를 등록하려면:"
        echo "   sudo $(dirname "$0")/install-systemd.sh"
    fi
    exit 0
fi

if [ "$SERVICE_EXISTS" = true ]; then
    systemctl stop "$SERVICE_NAME" 2>/dev/null || true
    systemctl disable "$SERVICE_NAME" 2>/dev/null || true
fi

if [ -f "$UNIT_PATH" ]; then
    rm -f "$UNIT_PATH"
fi

systemctl daemon-reload

if [ "$LANGUAGE" = "en" ]; then
    echo "✅ Service removed: $SERVICE_NAME"
    echo ""
    echo "   To re-register the service, run:"
    echo "   sudo $(dirname "$0")/install-systemd.sh"
else
    echo "✅ 서비스 제거 완료: $SERVICE_NAME"
    echo ""
    echo "   서비스를 다시 등록하려면:"
    echo "   sudo $(dirname "$0")/install-systemd.sh"
fi
