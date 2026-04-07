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
SERVER_NAME="Entity Server"

# Load language from .env
if [ -f .env ]; then
    LANGUAGE=$(grep '^LANGUAGE=' .env | cut -d '=' -f2)
fi
LANGUAGE=${LANGUAGE:-ko}

has_command() {
    command -v "$1" >/dev/null 2>&1
}

# PID 프로세스명을 읽습니다.
get_pid_name() {
    local pid="$1"
    local result=""

    result=$(ps -p "$pid" -o comm= 2>/dev/null | awk '{print $1}' || true)
    if [ -n "$result" ]; then
        echo "$result" | tr '[:upper:]' '[:lower:]'
        return
    fi

    if has_command powershell.exe; then
        powershell.exe -NoProfile -Command "(Get-Process -Id $pid -ErrorAction SilentlyContinue).ProcessName" \
            2>/dev/null | tr -d '\r' | tr '[:upper:]' '[:lower:]' || true
    fi
}

# PID 명령행을 읽습니다.
get_pid_cmdline() {
    local pid="$1"

    if [ -r "/proc/$pid/cmdline" ]; then
        tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true
        return
    fi

    local result
    result=$(ps -p "$pid" -o args= 2>/dev/null || true)
    if [ -n "$result" ]; then
        echo "$result"
        return
    fi

    if has_command powershell.exe; then
        powershell.exe -NoProfile -Command "(Get-WmiObject Win32_Process -Filter 'ProcessId = $pid').CommandLine" \
            2>/dev/null | tr -d '\r' | tr '\\' '/' || true
    fi
}

# PID 작업 디렉터리를 읽습니다.
get_pid_cwd() {
    local pid="$1"

    readlink -f "/proc/$pid/cwd" 2>/dev/null || true
}

# 포트 점유 프로세스 상세 정보를 출력합니다.
print_port_process_details() {
    local pid=""
    local process_name=""
    local cmdline=""

    while read -r pid; do
        pid=$(echo "$pid" | tr -d '[:space:]')
        [ -z "$pid" ] && continue

        process_name=$(get_pid_name "$pid")
        cmdline=$(get_pid_cmdline "$pid")
        [ -z "$process_name" ] && process_name="unknown"
        [ -z "$cmdline" ] && cmdline="(command line unavailable)"

        if [ "$LANGUAGE" = "en" ]; then
            echo "   PID: $pid | NAME: $process_name"
            echo "   CMD: $cmdline"
        else
            echo "   PID: $pid | NAME: $process_name"
            echo "   CMD: $cmdline"
        fi
    done < <(find_server_pids)
}

# PID가 실제 실행 중인지 Windows 폴백까지 포함해 확인합니다.
is_pid_running() {
    local pid="$1"

    if [ -z "$pid" ]; then
        return 1
    fi

    if kill -0 "$pid" 2>/dev/null; then
        return 0
    fi

    if has_command powershell.exe; then
        powershell.exe -NoProfile -Command "if (Get-Process -Id $pid -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" \
            >/dev/null 2>&1
        return $?
    fi

    return 1
}

# PID를 종료하고 남아 있으면 강제 종료까지 진행합니다.
force_stop_pid() {
    local pid="$1"

    if [ -z "$pid" ]; then
        return 1
    fi

    kill "$pid" 2>/dev/null || true
    if is_pid_running "$pid" && has_command powershell.exe; then
        powershell.exe -NoProfile -Command "Stop-Process -Id $pid -ErrorAction SilentlyContinue" >/dev/null 2>&1 || true
    fi

    for _ in $(seq 1 30); do
        if ! is_pid_running "$pid"; then
            return 0
        fi
        sleep 0.1
    done

    kill -9 "$pid" 2>/dev/null || true
    if is_pid_running "$pid" && has_command powershell.exe; then
        powershell.exe -NoProfile -Command "Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue" >/dev/null 2>&1 || true
    fi

    for _ in $(seq 1 20); do
        if ! is_pid_running "$pid"; then
            return 0
        fi
        sleep 0.1
    done

    return 1
}

# Windows PowerShell로 listen 중인 포트의 PID를 조회합니다.
find_pid_by_port_powershell() {
    local port="$1"
    if ! has_command powershell.exe; then
        return 0
    fi

    powershell.exe -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess" \
        2>/dev/null | tr -d '\r' | awk '/^[0-9]+$/ { print }' | sort -u
}

# netstat 출력에서 포트 점유 PID를 조회합니다.
find_pid_by_port_netstat() {
    local port="$1"
    if ! has_command netstat; then
        return 0
    fi

    netstat -ano 2>/dev/null | awk -v target=":$port" '
        $1 ~ /^TCP/ && index($2, target) && $NF ~ /^[0-9]+$/ { print $NF }
    ' | sort -u
}

# PID가 현재 프로젝트의 Entity Server 프로세스인지 확인합니다.
is_managed_server_pid() {
    local pid="$1"
    local process_name=""

    if ! is_pid_running "$pid"; then
        return 1
    fi

    process_name=$(get_pid_name "$pid")
    [[ "$process_name" == "entity-server" || "$process_name" == "entity-server.exe" ]]
}

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

get_database_default_group() {
    local value
    value=$(grep -E '"default"[[:space:]]*:' "$DATABASE_CONFIG" | head -n 1 | sed -E 's/.*:[[:space:]]*"([^"]+)".*/\1/')
    echo "$value"
}

list_database_groups() {
    grep -E '^[[:space:]]*"[^"]+"[[:space:]]*:[[:space:]]*\{' "$DATABASE_CONFIG" \
        | sed -E 's/^[[:space:]]*"([^"]+)"[[:space:]]*:[[:space:]]*\{.*/\1/' \
        | grep -v '^groups$' \
    | awk 'BEGIN { first = 1 } { if (!first) printf ", "; printf "%s", $0; first = 0 } END { printf "\n" }'
}

print_missing_database_group_error() {
    local expected_group="$1"
    local line_no="$2"
    local current_default
    local available_groups

    current_default=$(get_database_default_group)
    available_groups=$(list_database_groups)

    if [ "$LANGUAGE" = "en" ]; then
        echo "❌ database group '$expected_group' not found"
        echo "   at: scripts/run.sh:$line_no"
        echo "   config: $DATABASE_CONFIG"
        echo "   current default: ${current_default:-<empty>}"
        echo "   available groups: ${available_groups:-<none>}"
        echo "   cause: run.sh $MODE hardcodes '$expected_group' as the target default group."
    else
        echo "❌ configs/database.json에 '$expected_group' 그룹이 없습니다"
        echo "   위치: scripts/run.sh:$line_no"
        echo "   설정파일: $DATABASE_CONFIG"
        echo "   현재 default: ${current_default:-<empty>}"
        echo "   사용 가능한 groups: ${available_groups:-<none>}"
        echo "   원인: run.sh $MODE 모드는 '$expected_group' 그룹을 기본 DB 그룹으로 강제하도록 작성되어 있습니다."
    fi
}

sync_database_default_for_environment() {
    local environment_value
    environment_value=$(get_server_value "environment" "development")

    if [ "$environment_value" != "production" ]; then
        return 0
    fi

    # 현재 default 그룹이 database.json 안에 존재하면 그대로 유지
    local current_default
    current_default=$(get_database_default_group)
    if [ -n "$current_default" ] && grep -Eq "\"${current_default}\"[[:space:]]*:" "$DATABASE_CONFIG"; then
        return 0
    fi

    # 현재 default 그룹이 없을 때만 production으로 fallback
    if ! grep -Eq '"production"[[:space:]]*:' "$DATABASE_CONFIG"; then
        print_missing_database_group_error "production" "$1"
        return 1
    fi

    sed -E -i 's/("default"[[:space:]]*:[[:space:]]*")[^"]+(")/\1production\2/' "$DATABASE_CONFIG"
    return 0
}

find_server_pids() {
    local port
    port=$(get_server_value "port" "3400")

    if has_command ss; then
        ss -ltnp 2>/dev/null | sed -n "s/.*:$port .*pid=\([0-9]\+\).*/\1/p" | sort -u
        return
    fi

    local detected_pid
    detected_pid="$(find_pid_by_port_powershell "$port")"
    if [ -n "$detected_pid" ]; then
        echo "$detected_pid" | awk '/^[0-9]+$/ { print }' | sort -u
        return
    fi

    detected_pid="$(find_pid_by_port_netstat "$port")"
    if [ -n "$detected_pid" ]; then
        echo "$detected_pid" | awk '/^[0-9]+$/ { print }' | sort -u
    fi
}

# pid 파일과 포트 기준으로 현재 서버 PID를 찾습니다.
find_active_server_pid() {
    local pid=""
    local port_pid=""

    if [ -f "$PID_FILE" ]; then
        pid=$(tr -d '[:space:]' < "$PID_FILE" 2>/dev/null)
        if [ -n "$pid" ] && is_managed_server_pid "$pid"; then
            echo "$pid"
            return
        fi
    fi

    while read -r port_pid; do
        port_pid=$(echo "$port_pid" | tr -d '[:space:]')
        [ -z "$port_pid" ] && continue
        if is_managed_server_pid "$port_pid"; then
            echo "$port_pid"
            return
        fi
    done < <(find_server_pids)
}

is_running() {
    [ -n "$(find_active_server_pid || true)" ]
}

is_port_in_use() {
    local port
    port=$(get_server_value "port" "3400")

    if [ -n "$(find_server_pids | head -n 1)" ]; then
        return 0
    fi

    if has_command ss; then
        ss -ltn 2>/dev/null | grep -q ":$port "
        return
    fi

    if has_command netstat; then
        netstat -ano 2>/dev/null | awk -v target=":$port" '
            $1 ~ /^TCP/ && index($2, target) { found = 1; exit }
            END { exit(found ? 0 : 1) }
        '
        return
    fi

    return 1
}

show_port_in_use_message() {
    local port
    port=$(get_server_value "port" "3400")
    if [ "$LANGUAGE" = "en" ]; then
        echo "❌ Port $port is already in use, but the owning PID could not be identified."
        echo "Check with: ss -ltnp | grep :$port"
        echo "Or: powershell Get-NetTCPConnection -LocalPort $port -State Listen"
        echo "Or: lsof -iTCP:$port -sTCP:LISTEN -n -P"
    else
        echo "❌ 포트 $port 가 이미 사용 중이지만, 점유 PID를 식별할 수 없습니다."
        echo "확인: ss -ltnp | grep :$port"
        echo "또는: powershell Get-NetTCPConnection -LocalPort $port -State Listen"
        echo "또는: lsof -iTCP:$port -sTCP:LISTEN -n -P"
    fi
}

# start/dev 용 포트 충돌 안내를 출력합니다.
show_start_port_in_use_message() {
    local port
    port=$(get_server_value "port" "3400")

    if [ "$LANGUAGE" = "en" ]; then
        echo "❌ Port $port is already in use. Stop the existing process first: ./run.sh stop"
    else
        echo "❌ 포트 $port 가 이미 사용 중입니다. 먼저 중지하세요: ./run.sh stop"
    fi

    print_port_process_details
}

show_unmanaged_server_message() {
    local port
    port=$(get_server_value "port" "3400")

    if [ "$LANGUAGE" = "en" ]; then
        echo "ℹ️  A process is using port $port, but it was not started by this project's pid file."
        echo "   For safety, run.sh stop does not kill processes based on port match alone."
    else
        echo "ℹ️  포트 $port 를 사용하는 프로세스가 있지만, 현재 프로젝트의 pid 파일로 시작한 서버가 아닙니다."
        echo "   안전을 위해 run.sh stop 은 포트 일치만으로 프로세스를 종료하지 않습니다."
    fi

    print_port_process_details
}

stop_pid_with_confirm() {
    local pid="$1"
    local reason="$2"

    if [ -z "$pid" ]; then
        return 1
    fi
    if ! is_pid_running "$pid"; then
        return 1
    fi

    local proc_info
    proc_info=$(ps -p "$pid" -o pid,user,etime,args --no-headers 2>/dev/null | head -1)
    if [ "$LANGUAGE" = "en" ]; then
        echo "Running process ($reason):"
        echo "  PID   USER     ELAPSED  COMMAND"
        echo "  $proc_info"
    else
        echo "실행 중인 프로세스($reason):"
        echo "  PID   USER     실행시간  COMMAND"
        echo "  $proc_info"
    fi

    if force_stop_pid "$pid"; then
        rm -f "$PID_FILE"
        if [ "$LANGUAGE" = "en" ]; then
            echo "✅ ${SERVER_NAME} stopped (pid: $pid)"
        else
            echo "✅ ${SERVER_NAME} 종료 완료 (PID: $pid)"
        fi
        return 0
    fi

    return 1
}

stop_server() {
    local pid=""

    pid=$(find_active_server_pid)
    rm -f "$PID_FILE"

    if [ -n "$pid" ]; then
        stop_pid_with_confirm "$pid" "active process"
        return $?
    fi

    if is_port_in_use; then
        show_unmanaged_server_message
        return 1
    fi

    if [ "$LANGUAGE" = "en" ]; then
        echo "ℹ️  ${SERVER_NAME} is not running."
    else
        echo "ℹ️  ${SERVER_NAME}가 실행 중이 아닙니다."
    fi

    return 0
}

show_status() {
    local status_pid=""

    status_pid=$(find_active_server_pid || true)
    if [ -n "$status_pid" ]; then
        "$SERVER_BIN" banner-status RUNNING
        if [ "$LANGUAGE" = "en" ]; then
            echo "PID: $status_pid (managed process)"
            echo "Stop: ./run.sh stop"
        else
            echo "PID: $status_pid (관리 대상 프로세스)"
            echo "중지: ./run.sh stop"
        fi
    else
        "$SERVER_BIN" banner-status STOPPED
        if is_port_in_use; then
            show_unmanaged_server_message
        fi
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
        echo "Uses the current configs/server.json as-is and starts the compiled server binary."
        echo ""
        echo "Usage: $0 <mode>"
        echo ""
        echo "Modes:"
        echo "  dev   environment=development, keep database.default, then run binary"
        echo "  start run current config in background without modifying configs"
        echo "  stop  stop background server started by this script"
        echo "  status show server status"
        echo ""
        echo "Examples:"
        echo "  $0 dev     # Start in development mode"
        echo "  $0 start   # Start current config in background"
        echo "  $0 stop    # Stop server"
        echo "  $0 status  # Show status"
    else
        echo "Entity Server - 실행 스크립트"
        echo "==========================="
        echo ""
        echo "현재 configs/server.json 설정을 그대로 사용해서 바이너리를 실행합니다."
        echo ""
        echo "사용법: $0 <모드>"
        echo ""
        echo "모드:"
        echo "  dev   environment=development로 설정하고 database.default는 유지한 채 바이너리 실행"
        echo "  start 설정파일을 수정하지 않고 현재 설정 그대로 백그라운드 실행"
        echo "  stop  run.sh로 백그라운드 실행한 서버 중지"
        echo "  status 서버 상태 조회"
        echo ""
        echo "예제:"
        echo "  $0 dev     # 개발 모드로 시작"
        echo "  $0 start   # 현재 설정 그대로 시작(백그라운드)"
        echo "  $0 stop    # 서버 중지"
        echo "  $0 status  # 상태 조회"
    fi

    echo ""
    if [ -f "$SERVER_CONFIG" ] && [ -f "$DATABASE_CONFIG" ] && [ -f "$SERVER_BIN" ]; then
        if [ "$LANGUAGE" = "en" ]; then
            echo "Current status:"
        else
            echo "현재 상태:"
        fi
        show_status
    else
        if [ "$LANGUAGE" = "en" ]; then
            echo "Current status: unavailable (missing config or server binary)"
        else
            echo "현재 상태: 확인 불가 (설정 파일 또는 서버 바이너리 없음)"
        fi
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
        echo "   Run ./scripts/update-server.sh to download the latest binary."
    else
        echo "❌ entity-server 바이너리 파일이 없습니다 (bin/entity-server 또는 ./entity-server)"
        echo "   ./scripts/update-server.sh 를 실행하여 바이너리를 다운로드하세요."
    fi
    exit 1
fi

case "$MODE" in
    dev|development)
        running_pid=$(find_active_server_pid || true)
        if [ -n "$running_pid" ]; then
            if [ "$LANGUAGE" = "en" ]; then
                echo "❌ Server already running (pid: $running_pid). Stop first: ./run.sh stop"
            else
                echo "❌ 이미 서버가 실행 중입니다 (pid: $running_pid). 먼저 중지하세요: ./run.sh stop"
            fi
            exit 1
        fi

        if is_port_in_use; then
            show_start_port_in_use_message
            exit 1
        fi

        sed -E -i 's/("environment"[[:space:]]*:[[:space:]]*")[^"]+(")/\1development\2/' "$SERVER_CONFIG"
        sync_database_default_for_environment "$LINENO" || exit 1
        "$SERVER_BIN"
        ;;
        
    start)
        running_pid=$(find_active_server_pid || true)
        if [ -n "$running_pid" ]; then
            if [ "$LANGUAGE" = "en" ]; then
                echo "❌ Server already running (pid: $running_pid). Stop first: ./run.sh stop"
            else
                echo "❌ 이미 서버가 실행 중입니다 (pid: $running_pid). 먼저 중지하세요: ./run.sh stop"
            fi
            exit 1
        fi

        if is_port_in_use; then
            show_start_port_in_use_message
            exit 1
        fi

        "$SERVER_BIN" banner
        nohup "$SERVER_BIN" >> "$STDOUT_LOG" 2>&1 &
        SERVER_PID=$!
        echo "$SERVER_PID" > "$PID_FILE"

        # 포트가 실제로 Listen 상태가 될 때까지 최대 5초 대기 (25 × 0.2s)
        start_ok=0
        for _ in $(seq 1 25); do
            sleep 0.2
            if ! kill -0 "$SERVER_PID" 2>/dev/null; then
                break  # 프로세스 사망
            fi
            if is_port_in_use; then
                start_ok=1
                break
            fi
        done

        if [ "$start_ok" -eq 1 ]; then
            if [ "$LANGUAGE" = "en" ]; then
                echo "✅ Entity Server started in background (pid: $SERVER_PID)"
                echo "Status: ./run.sh status"
                echo "Stop:   ./run.sh stop"
            else
                echo "✅ Entity Server가 백그라운드에서 시작되었습니다 (pid: $SERVER_PID)"
                echo "상태: ./run.sh status"
                echo "중지: ./run.sh stop"
            fi
        else
            rm -f "$PID_FILE"
            if [ "$LANGUAGE" = "en" ]; then
                echo "❌ Failed to start Entity Server in background"
                echo "Last log ($STDOUT_LOG):"
                tail -20 "$STDOUT_LOG" 2>/dev/null | sed 's/^/  /'
            else
                echo "❌ Entity Server 백그라운드 시작에 실패했습니다"
                echo "최근 로그 ($STDOUT_LOG):"
                tail -20 "$STDOUT_LOG" 2>/dev/null | sed 's/^/  /'
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
