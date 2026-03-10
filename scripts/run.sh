#!/bin/bash
# Entity Server - Run Script

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

SERVER_CONFIG="$PROJECT_ROOT/configs/server.json"
DATABASE_CONFIG="$PROJECT_ROOT/configs/database.json"
RUN_DIR="$PROJECT_ROOT/.run"
PID_FILE="$RUN_DIR/entity-server.pid"
STDOUT_LOG="$PROJECT_ROOT/logs/server.out.log"
SERVER_BIN="$PROJECT_ROOT/bin/entity-server"
if [ ! -f "$SERVER_BIN" ] && [ -f "$PROJECT_ROOT/entity-server" ]; then
    SERVER_BIN="$PROJECT_ROOT/entity-server"
fi

mkdir -p "$RUN_DIR" "$PROJECT_ROOT/logs"

# Load language from .env
if [ -f .env ]; then
    LANGUAGE=$(grep '^LANGUAGE=' .env | cut -d '=' -f2)
fi
LANGUAGE=${LANGUAGE:-ko}

get_server_value() {
    local key="$1"
    local fallback="$2"
    local value

    if [ "$key" = "port" ]; then
        local env_port
        env_port="${SERVER_PORT:-${PORT:-}}"
        if [ -z "$env_port" ] && [ -f .env ]; then
            env_port=$(grep '^SERVER_PORT=' .env | tail -n 1 | cut -d '=' -f2-)
            if [ -z "$env_port" ]; then
                env_port=$(grep '^PORT=' .env | tail -n 1 | cut -d '=' -f2-)
            fi
        fi
        env_port=$(echo "$env_port" | tr -d '[:space:]')
        if [[ "$env_port" =~ ^[0-9]+$ ]] && [ "$env_port" -gt 0 ]; then
            echo "$env_port"
            return
        fi
    fi

    value=$(grep -E "\"$key\"[[:space:]]*:" "$SERVER_CONFIG" | head -n 1 | sed -E 's/.*:[[:space:]]*"?([^",}]+)"?.*/\1/')
    value=$(echo "$value" | tr -d '[:space:]')
    if [ -z "$value" ]; then
        echo "$fallback"
    else
        echo "$value"
    fi
}

is_running() {
    local port_pid
    port_pid=$(find_pid_by_port)

    if [ ! -f "$PID_FILE" ]; then
        if [ -n "$port_pid" ] && kill -0 "$port_pid" 2>/dev/null; then
            return 0
        fi
        if is_port_in_use; then
            return 0
        fi
        return 1
    fi
    local pid
    pid=$(cat "$PID_FILE" 2>/dev/null)
    if [ -z "$pid" ]; then
        if [ -n "$port_pid" ] && kill -0 "$port_pid" 2>/dev/null; then
            return 0
        fi
        if is_port_in_use; then
            return 0
        fi
        return 1
    fi
    if kill -0 "$pid" 2>/dev/null; then
        return 0
    fi

    if [ -n "$port_pid" ] && kill -0 "$port_pid" 2>/dev/null; then
        return 0
    fi

    if is_port_in_use; then
        return 0
    fi

    return 1
}

find_pid_by_port() {
    local port
    port=$(get_server_value "port" "3400")
    ss -ltnp 2>/dev/null | grep ":$port " | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | head -n 1
}

is_port_in_use() {
    local port
    port=$(get_server_value "port" "3400")
    ss -ltn 2>/dev/null | grep -q ":$port "
}

show_port_in_use_message() {
    local port
    port=$(get_server_value "port" "3400")
    if [ "$LANGUAGE" = "en" ]; then
        echo "❌ Port $port is already in use, but the owning PID could not be identified."
        echo "Check with: ss -ltnp | grep :$port"
        echo "Or: lsof -iTCP:$port -sTCP:LISTEN -n -P"
    else
        echo "❌ 포트 $port 가 이미 사용 중이지만, 점유 PID를 식별할 수 없습니다."
        echo "확인: ss -ltnp | grep :$port"
        echo "또는: lsof -iTCP:$port -sTCP:LISTEN -n -P"
    fi
}

stop_pid_with_confirm() {
    local pid="$1"
    local reason="$2"

    if [ -z "$pid" ]; then
        return 1
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
        return 1
    fi

    local proc_info
    proc_info=$(ps -p "$pid" -o pid,user,etime,args --no-headers 2>/dev/null | head -1)
    if [ "$LANGUAGE" = "en" ]; then
        echo "Running process ($reason):"
        echo "  PID   USER     ELAPSED  COMMAND"
        echo "  $proc_info"
        echo ""
        read -r -p "Stop this process? [y/N]: " input
    else
        echo "실행 중인 프로세스($reason):"
        echo "  PID   USER     실행시간  COMMAND"
        echo "  $proc_info"
        echo ""
        read -r -p "이 프로세스를 중지할까요? [y/N]: " input
    fi
    input=$(echo "$input" | tr '[:upper:]' '[:lower:]')
    if [ "$input" != "y" ] && [ "$input" != "yes" ]; then
        if [ "$LANGUAGE" = "en" ]; then
            echo "Canceled."
        else
            echo "취소되었습니다."
        fi
        return 0
    fi

    kill "$pid" 2>/dev/null
    for _ in $(seq 1 30); do
        if ! kill -0 "$pid" 2>/dev/null; then
            rm -f "$PID_FILE"
            if [ "$LANGUAGE" = "en" ]; then
                echo "✅ Server stopped (pid: $pid)"
            else
                echo "✅ 서버가 중지되었습니다 (pid: $pid)"
            fi
            return 0
        fi
        sleep 0.1
    done

    kill -9 "$pid" 2>/dev/null
    rm -f "$PID_FILE"
    if [ "$LANGUAGE" = "en" ]; then
        echo "⚠️  Server force-stopped (pid: $pid)"
    else
        echo "⚠️  서버를 강제 종료했습니다 (pid: $pid)"
    fi
    return 0
}

stop_server() {
    if [ ! -f "$PID_FILE" ]; then
        local port_pid
        port_pid=$(find_pid_by_port)
        if [ -n "$port_pid" ]; then
            stop_pid_with_confirm "$port_pid" "port fallback"
            return $?
        fi
        if is_port_in_use; then
            show_port_in_use_message
            return 1
        fi
        if [ "$LANGUAGE" = "en" ]; then
            echo "ℹ️  Server is not running (pid file not found)."
        else
            echo "ℹ️  서버가 실행 중이 아닙니다 (pid 파일 없음)."
        fi
        return 0
    fi

    local pid
    pid=$(cat "$PID_FILE" 2>/dev/null)
    if [ -z "$pid" ]; then
        rm -f "$PID_FILE"
        local port_pid
        port_pid=$(find_pid_by_port)
        if [ -n "$port_pid" ]; then
            stop_pid_with_confirm "$port_pid" "port fallback"
            return $?
        fi
        if [ "$LANGUAGE" = "en" ]; then
            echo "ℹ️  Empty pid file removed."
        else
            echo "ℹ️  비어있는 pid 파일을 정리했습니다."
        fi
        return 0
    fi

    if ! kill -0 "$pid" 2>/dev/null; then
        rm -f "$PID_FILE"
        local port_pid
        port_pid=$(find_pid_by_port)
        if [ -n "$port_pid" ]; then
            stop_pid_with_confirm "$port_pid" "port fallback"
            return $?
        fi
        if is_port_in_use; then
            show_port_in_use_message
            return 1
        fi
        if [ "$LANGUAGE" = "en" ]; then
            echo "ℹ️  Stale pid file removed (process not found)."
        else
            echo "ℹ️  실행 중인 프로세스가 없어 stale pid 파일을 정리했습니다."
        fi
        return 0
    fi

    stop_pid_with_confirm "$pid" "pid file"
    return $?
}

show_status() {
    if is_running; then
		local status_pid
		status_pid=$(find_pid_by_port)
        "$SERVER_BIN" banner-status RUNNING
        if [ "$LANGUAGE" = "en" ]; then
			if [ -n "$status_pid" ]; then
				echo "PID: $status_pid (detected by port)"
			fi
            echo "Stop: ./run.sh stop"
        else
			if [ -n "$status_pid" ]; then
				echo "PID: $status_pid (포트 기준 감지)"
			fi
            echo "중지: ./run.sh stop"
        fi
    else
        "$SERVER_BIN" banner-status STOPPED
        if [ "$LANGUAGE" = "en" ]; then
            echo "Start: ./run.sh start"
        else
            echo "시작: ./run.sh start"
        fi
    fi
}

# Show usage if no arguments
if [ $# -eq 0 ]; then
    if [ "$LANGUAGE" = "en" ]; then
        echo "Entity Server - Run Script"
        echo "=========================="
        echo ""
        echo "Force configs/server.json environment and configs/database.json default group, then start compiled server binary."
        echo ""
        echo "Usage: $0 <mode>"
        echo ""
        echo "Modes:"
        echo "  dev   environment=development, database.default=development, then run binary"
        echo "  start environment=production, database.default=production, then run in background"
        echo "  stop  stop background server started by this script"
        echo "  status show server status"
        echo ""
        echo "Examples:"
        echo "  $0 dev     # Start in development mode"
        echo "  $0 start   # Start in production mode (background)"
        echo "  $0 stop    # Stop server"
        echo "  $0 status  # Show status"
    else
        echo "Entity Server - 실행 스크립트"
        echo "==========================="
        echo ""
        echo "configs/server.json의 environment와 configs/database.json의 default를 강제 설정하고 바이너리를 실행합니다."
        echo ""
        echo "사용법: $0 <모드>"
        echo ""
        echo "모드:"
        echo "  dev   environment=development, database.default=development 강제 후 바이너리 실행"
        echo "  start environment=production, database.default=production 강제 후 백그라운드 실행"
        echo "  stop  run.sh로 백그라운드 실행한 서버 중지"
        echo "  status 서버 상태 조회"
        echo ""
        echo "예제:"
        echo "  $0 dev     # 개발 모드로 시작"
        echo "  $0 start   # 프로덕션 모드로 시작(백그라운드)"
        echo "  $0 stop    # 서버 중지"
        echo "  $0 status  # 상태 조회"
    fi
    exit 0
fi

MODE="$1"

if [ ! -f "$SERVER_CONFIG" ]; then
    if [ "$LANGUAGE" = "en" ]; then
        echo "❌ configs/server.json not found"
    else
        echo "❌ configs/server.json 파일이 없습니다"
    fi
    exit 1
fi

if [ ! -f "$DATABASE_CONFIG" ]; then
    if [ "$LANGUAGE" = "en" ]; then
        echo "❌ configs/database.json not found"
    else
        echo "❌ configs/database.json 파일이 없습니다"
    fi
    exit 1
fi

if [ ! -f "$SERVER_BIN" ]; then
    if [ "$LANGUAGE" = "en" ]; then
        echo "❌ entity-server binary not found (bin/entity-server or ./entity-server)"
    else
        echo "❌ entity-server 바이너리 파일이 없습니다 (bin/entity-server 또는 ./entity-server)"
    fi
    exit 1
fi

case "$MODE" in
    dev|development)
        if is_running; then
            local running_pid
            running_pid=$(find_pid_by_port)
            if [ -n "$running_pid" ]; then
                if [ "$LANGUAGE" = "en" ]; then
                    echo "❌ Server already running (pid: $running_pid). Stop first: ./run.sh stop"
                else
                    echo "❌ 이미 서버가 실행 중입니다 (pid: $running_pid). 먼저 중지하세요: ./run.sh stop"
                fi
            else
                show_port_in_use_message
            fi
            exit 1
        fi

        if ! grep -Eq '"development"[[:space:]]*:' "$DATABASE_CONFIG"; then
            if [ "$LANGUAGE" = "en" ]; then
                echo "❌ database group 'development' not found in configs/database.json"
            else
                echo "❌ configs/database.json에 'development' 그룹이 없습니다"
            fi
            exit 1
        fi

        sed -E -i 's/("environment"[[:space:]]*:[[:space:]]*")[^"]+(")/\1development\2/' "$SERVER_CONFIG"
        sed -E -i 's/("default"[[:space:]]*:[[:space:]]*")[^"]+(")/\1development\2/' "$DATABASE_CONFIG"
        "$SERVER_BIN"
        ;;
        
    start)
        if is_running; then
            local running_pid
            running_pid=$(find_pid_by_port)
            if [ -n "$running_pid" ]; then
                if [ "$LANGUAGE" = "en" ]; then
                    echo "❌ Server already running (pid: $running_pid). Stop first: ./run.sh stop"
                else
                    echo "❌ 이미 서버가 실행 중입니다 (pid: $running_pid). 먼저 중지하세요: ./run.sh stop"
                fi
            else
                show_port_in_use_message
            fi
            exit 1
        fi

        if ! grep -Eq '"production"[[:space:]]*:' "$DATABASE_CONFIG"; then
            if [ "$LANGUAGE" = "en" ]; then
                echo "❌ database group 'production' not found in configs/database.json"
            else
                echo "❌ configs/database.json에 'production' 그룹이 없습니다"
            fi
            exit 1
        fi

        sed -E -i 's/("environment"[[:space:]]*:[[:space:]]*")[^"]+(")/\1production\2/' "$SERVER_CONFIG"
        sed -E -i 's/("default"[[:space:]]*:[[:space:]]*")[^"]+(")/\1production\2/' "$DATABASE_CONFIG"

        "$SERVER_BIN" banner
        nohup "$SERVER_BIN" >> "$STDOUT_LOG" 2>&1 &
        SERVER_PID=$!
        echo "$SERVER_PID" > "$PID_FILE"

        sleep 0.3
        if kill -0 "$SERVER_PID" 2>/dev/null; then
            if [ "$LANGUAGE" = "en" ]; then
                echo "✅ Entity Server started in background (pid: $SERVER_PID)"
                echo "Status: ./run.sh status"
            else
                echo "✅ Entity Server가 백그라운드에서 시작되었습니다 (pid: $SERVER_PID)"
                echo "상태: ./run.sh status"
                echo "중지: ./run.sh stop"
            fi
        else
            rm -f "$PID_FILE"
            if [ "$LANGUAGE" = "en" ]; then
                echo "❌ Failed to start Entity Server in background"
                echo "Check logs: $STDOUT_LOG"
            else
                echo "❌ Entity Server 백그라운드 시작에 실패했습니다"
                echo "로그 확인: $STDOUT_LOG"
            fi
            exit 1
        fi
        ;;

    stop)
        stop_server
        ;;

    status)
        show_status
        ;;
        
    *)
        if [ "$LANGUAGE" = "en" ]; then
            echo "❌ Unknown mode: $MODE"
            echo "Run '$0' for usage information"
        else
            echo "❌ 알 수 없는 모드: $MODE"
            echo "'$0'로 사용법을 확인하세요"
        fi
        exit 1
        ;;
    esac
