#!/bin/bash

# Register entity-server as a systemd service using the current project path.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Load language from .env
if [ -f "$PROJECT_ROOT/.env" ]; then
    LANGUAGE=$(sed -n 's/^LANGUAGE=//p' "$PROJECT_ROOT/.env" | tail -n 1)
fi
LANGUAGE=${LANGUAGE:-ko}

SERVICE_NAME="entity-server"
RUN_USER="$(id -un)"
RUN_GROUP="$(id -gn)"
SERVER_CONFIG="$PROJECT_ROOT/configs/server.json"
SERVER_BIN="$PROJECT_ROOT/bin/entity-server"
if [ ! -f "$SERVER_BIN" ] && [ -f "$PROJECT_ROOT/entity-server" ]; then
    SERVER_BIN="$PROJECT_ROOT/entity-server"
fi

load_namespace() {
    local namespace="${SERVER_NAMESPACE:-${NAMESPACE:-}}"
    if [ -z "$namespace" ] && [ -f "$SERVER_CONFIG" ]; then
        namespace=$(sed -n 's/.*"namespace"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$SERVER_CONFIG" | head -n 1)
    fi
    namespace=$(echo "$namespace" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9_-]/-/g')
    if [ -z "$namespace" ]; then
        namespace="default"
    fi
    SERVICE_NAME="${namespace}-entity-server"
}

load_namespace

if [ ! -x "$PROJECT_ROOT/scripts/run.sh" ]; then
    chmod +x "$PROJECT_ROOT/scripts/run.sh"
fi

if [ ! -f "$SERVER_BIN" ]; then
    if [ "$LANGUAGE" = "en" ]; then
        echo "❌ entity-server not found (bin/entity-server or ./entity-server)"
        echo "Run ./scripts/build.sh first."
    else
        echo "❌ entity-server 파일이 없습니다 (bin/entity-server 또는 ./entity-server)"
        echo "먼저 ./scripts/build.sh 를 실행하세요."
    fi
    exit 1
fi

UNIT_PATH="/etc/systemd/system/${SERVICE_NAME}.service"

if [ "$EUID" -ne 0 ]; then
    if command -v sudo >/dev/null 2>&1; then
        exec sudo "$0"
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

if [ "$LANGUAGE" = "en" ]; then
    echo "✅ Service registered: $SERVICE_NAME"
    echo "   Unit: $UNIT_PATH"
    echo "   User: $RUN_USER"
    echo "   Start:  ./run.sh start"
    echo "   Stop:   ./run.sh stop"
    echo "   Status: ./run.sh status"
else
    echo "✅ 서비스 등록 완료: $SERVICE_NAME"
    echo "   Unit: $UNIT_PATH"
    echo "   User: $RUN_USER"
    echo "   시작:  ./run.sh start"
    echo "   중지:  ./run.sh stop"
    echo "   상태:  ./run.sh status"
fi