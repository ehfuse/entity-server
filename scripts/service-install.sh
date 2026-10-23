#!/bin/bash

# Register entity-server as a systemd service using the current project path.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Load language and namespace from .env
# run.sh 와 동일한 서비스명을 산출하기 위해 SERVER_NAMESPACE/NAMESPACE 를 .env 에서 읽는다.
# (run.sh 는 .env 를 source 하므로, 여기서도 같은 값을 반영하지 않으면 서비스명이 어긋난다.)
if [ -f "$PROJECT_ROOT/.env" ]; then
    LANGUAGE=$(sed -n 's/^LANGUAGE=//p' "$PROJECT_ROOT/.env" | tail -n 1)
    if [ -z "${SERVER_NAMESPACE:-}" ]; then
        SERVER_NAMESPACE=$(sed -n 's/^SERVER_NAMESPACE=//p' "$PROJECT_ROOT/.env" | tail -n 1)
    fi
    if [ -z "${NAMESPACE:-}" ]; then
        NAMESPACE=$(sed -n 's/^NAMESPACE=//p' "$PROJECT_ROOT/.env" | tail -n 1)
    fi
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

# 이미 등록되어 있는지 먼저 확인한다. 등록돼 있으면 기존 ExecStart 와 함께 안내하고
# 재등록(덮어쓰기)으로 진행한다. (경로 변경 등으로 재설치가 필요한 경우가 있으므로 막지 않는다)
if systemctl list-unit-files 2>/dev/null | grep -q "^${SERVICE_NAME}\.service" || [ -f "$UNIT_PATH" ]; then
    existing_exec=$(systemctl show -p ExecStart --value "${SERVICE_NAME}.service" 2>/dev/null || true)
    if [ "$LANGUAGE" = "en" ]; then
        echo "ℹ️  Service '$SERVICE_NAME' is already registered. Re-installing (overwrite)."
        [ -n "$existing_exec" ] && echo "   current ExecStart: $existing_exec"
    else
        echo "ℹ️  '$SERVICE_NAME' 서비스가 이미 등록되어 있습니다. 재등록(덮어쓰기)합니다."
        [ -n "$existing_exec" ] && echo "   현재 ExecStart: $existing_exec"
    fi
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