#!/bin/bash

# Register entity-server as a systemd service using the current project path.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Load language from .env
if [ -f "$PROJECT_ROOT/.env" ]; then
    LANGUAGE=$(grep '^LANGUAGE=' "$PROJECT_ROOT/.env" | cut -d '=' -f2)
fi
LANGUAGE=${LANGUAGE:-ko}

SERVICE_NAME="entity-server"
RUN_USER="${SUDO_USER:-$(stat -c '%U' "$PROJECT_ROOT")}"
RUN_GROUP="$(id -gn "$RUN_USER" 2>/dev/null || true)"
START_NOW=true
INTERACTIVE=false
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
        echo "Install systemd service for Entity Server"
        echo "========================================"
        echo ""
        echo "Usage: $0 [options]"
        echo ""
        echo "Options:"
        echo "  --user=<user>      Service run user (default: project owner)"
        echo "  --group=<group>    Service run group (default: user's primary group)"
        echo "  --no-start         Enable only, do not start immediately"
        echo ""
        echo "Service name is auto-generated as '<namespace>-entity-server'."
        echo "Run without arguments to enter interactive mode."
    else
        echo "Entity Server systemd 서비스 등록"
        echo "==============================="
        echo ""
        echo "사용법: $0 [옵션]"
        echo ""
        echo "옵션:"
        echo "  --user=<사용자>    실행 사용자 (기본값: 프로젝트 소유자)"
        echo "  --group=<그룹>     실행 그룹 (기본값: 사용자 기본 그룹)"
        echo "  --no-start         enable만 수행, 즉시 start 하지 않음"
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
        --user=*)
            RUN_USER="${arg#*=}"
            ;;
        --group=*)
            RUN_GROUP="${arg#*=}"
            ;;
        --no-start)
            START_NOW=false
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

if [ "$INTERACTIVE" = true ]; then
    if [ "$LANGUAGE" = "en" ]; then
        echo "[interactive] systemd service setup"
        echo "service name: $SERVICE_NAME"
    else
        echo "[interactive] systemd 서비스 설정"
        echo "서비스명: $SERVICE_NAME"
    fi

    read -r -p "Run user [$RUN_USER]: " input
    if [ -n "$input" ]; then
        RUN_USER="$input"
    fi

    if [ -z "$RUN_GROUP" ]; then
        RUN_GROUP="$(id -gn "$RUN_USER" 2>/dev/null || true)"
    fi
    read -r -p "Run group [$RUN_GROUP]: " input
    if [ -n "$input" ]; then
        RUN_GROUP="$input"
    fi

    if [ "$LANGUAGE" = "en" ]; then
        read -r -p "Start service now? [Y/n]: " input
    else
        read -r -p "서비스를 즉시 시작할까요? [Y/n]: " input
    fi
    input=$(echo "$input" | tr '[:upper:]' '[:lower:]')
    if [ "$input" = "n" ] || [ "$input" = "no" ]; then
        START_NOW=false
    fi
fi

if [ "$RUN_GROUP" = "" ]; then
    RUN_GROUP="$(id -gn "$RUN_USER")"
fi

if ! id -u "$RUN_USER" >/dev/null 2>&1; then
    if [ "$LANGUAGE" = "en" ]; then
        echo "❌ User not found: $RUN_USER"
    else
        echo "❌ 사용자를 찾을 수 없습니다: $RUN_USER"
    fi
    exit 1
fi

if ! getent group "$RUN_GROUP" >/dev/null 2>&1; then
    if [ "$LANGUAGE" = "en" ]; then
        echo "❌ Group not found: $RUN_GROUP"
    else
        echo "❌ 그룹을 찾을 수 없습니다: $RUN_GROUP"
    fi
    exit 1
fi

if [ ! -x "$PROJECT_ROOT/scripts/run.sh" ]; then
    chmod +x "$PROJECT_ROOT/scripts/run.sh"
fi

if [ ! -f "$PROJECT_ROOT/bin/entity-server" ]; then
    if [ "$LANGUAGE" = "en" ]; then
        echo "❌ bin/entity-server not found"
        echo "Run ./scripts/build.sh first."
    else
        echo "❌ bin/entity-server 파일이 없습니다"
        echo "먼저 ./scripts/build.sh 를 실행하세요."
    fi
    exit 1
fi

UNIT_PATH="/etc/systemd/system/${SERVICE_NAME}.service"

if [ "$EUID" -ne 0 ]; then
    if command -v sudo >/dev/null 2>&1; then
        SUDO_ARGS=("--user=$RUN_USER" "--group=$RUN_GROUP")
        if [ "$START_NOW" = false ]; then
            SUDO_ARGS+=("--no-start")
        fi
        exec sudo "$0" "${SUDO_ARGS[@]}"
    fi
    if [ "$LANGUAGE" = "en" ]; then
        echo "❌ This script requires root privileges"
    else
        echo "❌ 이 스크립트는 root 권한이 필요합니다"
    fi
    exit 1
fi

cat > "$UNIT_PATH" <<EOF
[Unit]
Description=Entity Server
After=network.target

[Service]
Type=simple
User=$RUN_USER
Group=$RUN_GROUP
WorkingDirectory=$PROJECT_ROOT
EnvironmentFile=-$PROJECT_ROOT/.env
ExecStart=$PROJECT_ROOT/scripts/run.sh start
Restart=always
RestartSec=3
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"

if [ "$START_NOW" = true ]; then
    systemctl restart "$SERVICE_NAME"
fi

if [ "$LANGUAGE" = "en" ]; then
    echo "✅ Service registered: $SERVICE_NAME"
    echo "   Unit: $UNIT_PATH"
    echo "   Start:  sudo systemctl start $SERVICE_NAME"
    echo "   Stop:   sudo systemctl stop $SERVICE_NAME"
    echo "   Status: sudo systemctl status $SERVICE_NAME"
else
    echo "✅ 서비스 등록 완료: $SERVICE_NAME"
    echo "   Unit: $UNIT_PATH"
    echo "   시작:  sudo systemctl start $SERVICE_NAME"
    echo "   중지:  sudo systemctl stop $SERVICE_NAME"
    echo "   상태:  sudo systemctl status $SERVICE_NAME"
fi
