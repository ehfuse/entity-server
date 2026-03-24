#!/bin/bash
# update-server.sh — entity-server / entity-cli 바이너리 및 파일 업데이트
#
# 사용법:
#   ./scripts/update-server.sh             # 도움말 + 현재 버전 + 최신 버전 확인
#   ./scripts/update-server.sh latest      # 최신 버전으로 업데이트
#   ./scripts/update-server.sh 1.5.0       # 특정 버전으로 업데이트
#
# 업데이트 대상:
#   - 바이너리: entity-server, entity-cli
#   - 파일: scripts/  samples/  (configs/ entities/ docs/ 제외)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
REPO="ehfuse/entity-server"
BINARIES=("entity-server" "entity-cli")
DIST_DIRS=("scripts" "samples")

_find_running_pid() {
    local pid_file="$PROJECT_ROOT/.run/entity-server.pid"
    if [ -f "$pid_file" ]; then
        local pid
        pid=$(cat "$pid_file" 2>/dev/null)
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            echo "$pid"
            return 0
        fi
    fi

    pgrep -f "${PROJECT_ROOT}/(bin/)?entity-server( |$)" | head -n 1
}

_ensure_server_stopped() {
    local pid
    pid="$(_find_running_pid)"

    if [ -z "$pid" ]; then
        return 0
    fi

    echo ""
    echo "⚠️  현재 Entity Server가 실행 중입니다."
    ps -p "$pid" -o pid,etime,cmd --no-headers 2>/dev/null || true
    echo ""
    read -r -p "업데이트를 위해 서버를 중지할까요? [y/N]: " input
    input=$(echo "$input" | tr '[:upper:]' '[:lower:]')

    if [ "$input" != "y" ] && [ "$input" != "yes" ]; then
        echo "❌ 업데이트를 취소했습니다."
        exit 1
    fi

    if [ -x "$PROJECT_ROOT/scripts/run.sh" ]; then
        "$PROJECT_ROOT/scripts/run.sh" stop || true
    else
        kill "$pid" 2>/dev/null || true
    fi

    sleep 0.2
    pid="$(_find_running_pid)"
    if [ -n "$pid" ]; then
        echo "❌ 서버 중지에 실패했습니다. 업데이트를 중단합니다."
        exit 1
    fi

    echo "✅ 서버 중지 완료"
}

# ── 플랫폼 감지 ───────────────────────────────────────────────────────────────

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
    Linux)  PLATFORM="linux" ;;
    Darwin) PLATFORM="darwin" ;;
    *)
        echo "❌ 지원하지 않는 OS: $OS"
        echo "   Windows 는 scripts\\update-server.ps1 을 사용하세요."
        exit 1
        ;;
esac

case "$ARCH" in
    x86_64)        ARCH_TAG="x64" ;;
    aarch64|arm64) ARCH_TAG="arm64" ;;
    *)
        echo "❌ 지원하지 않는 아키텍처: $ARCH"
        exit 1
        ;;
esac

# ── 현재 버전 확인 ────────────────────────────────────────────────────────────

_current_ver() {
    local bin="$PROJECT_ROOT/bin/entity-server"
    local ver=""
    if [ ! -x "$bin" ] && [ -x "$PROJECT_ROOT/entity-server" ]; then
        bin="$PROJECT_ROOT/entity-server"
    fi
    if [ -x "$bin" ]; then
        ver=$("$bin" --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)
        if [ -z "$ver" ]; then
            ver=$("$bin" version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)
        fi
        if [ -z "$ver" ] && command -v strings >/dev/null 2>&1; then
            ver=$(strings "$bin" 2>/dev/null | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+' | head -1 | sed 's/^v//' || true)
        fi
        if [ -n "$ver" ]; then
            echo "$ver"
        else
            echo "(알 수 없음)"
        fi
    else
        echo "(없음)"
    fi
}

# ── 최신 버전 조회 ────────────────────────────────────────────────────────────

_latest_ver() {
    local ver
    if command -v curl >/dev/null 2>&1; then
        ver="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
            | grep '"tag_name"' | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
    elif command -v wget >/dev/null 2>&1; then
        ver="$(wget -qO- "https://api.github.com/repos/${REPO}/releases/latest" \
            | grep '"tag_name"' | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
    else
        echo "❌ curl 또는 wget 이 필요합니다." >&2
        exit 1
    fi
    if [ -z "$ver" ]; then
        echo "❌ 최신 버전을 가져오지 못했습니다. 네트워크 연결을 확인하세요." >&2
        exit 1
    fi
    echo "$ver"
}

_print_version_status() {
    local current latest

    echo "🔍 버전 확인 중..."
    current="$(_current_ver)"
    latest="$(_latest_ver)"

    echo ""
    echo "  현재 버전: v${current}"
    echo "  최신 버전: v${latest}"
    echo ""
    if [ "$current" = "$latest" ]; then
        echo "✅ 최신 버전입니다."
    else
        echo "💡 업데이트 가능: ./scripts/update-server.sh latest"
    fi
}

# ── 다운로드 ──────────────────────────────────────────────────────────────────

_download() {
    local url="$1"
    local dest="$2"
    local tmp="${dest}.tmp"

    if command -v curl >/dev/null 2>&1; then
        curl -fsSL --retry 3 -o "$tmp" "$url"
    elif command -v wget >/dev/null 2>&1; then
        wget -q -O "$tmp" "$url"
    else
        echo "❌ curl 또는 wget 이 필요합니다."
        exit 1
    fi

    mv "$tmp" "$dest"
    chmod +x "$dest"
}

_download_plain() {
    local url="$1"
    local dest="$2"
    local tmp="${dest}.tmp"

    if command -v curl >/dev/null 2>&1; then
        curl -fsSL --retry 3 -o "$tmp" "$url"
    elif command -v wget >/dev/null 2>&1; then
        wget -q -O "$tmp" "$url"
    else
        echo "❌ curl 또는 wget 이 필요합니다."
        exit 1
    fi

    mv "$tmp" "$dest"
}

_install() {
    local target_ver="${1#v}"   # v 접두사 제거
    local current_ver
    current_ver="$(_current_ver)"

    _ensure_server_stopped

    echo ""
    echo "📦 entity-server v${target_ver} 다운로드 중... (${PLATFORM}-${ARCH_TAG})"
    echo ""

    # 바이너리 다운로드
    mkdir -p "$PROJECT_ROOT/bin"

    for BIN in "${BINARIES[@]}"; do
        local file="${BIN}-${PLATFORM}-${ARCH_TAG}"
        local url="https://github.com/${REPO}/releases/download/v${target_ver}/${file}"
        local dest="$PROJECT_ROOT/bin/$BIN"

        printf "  ↓ %-32s" "$file"
        if _download "$url" "$dest" 2>/dev/null; then
            echo "✓"
        else
            echo "✗ 실패"
            echo "    URL: $url"
            exit 1
        fi
    done

    # scripts / samples 업데이트
    _install_dist "$target_ver"

    echo ""
    echo "✅ 업데이트 완료: v${current_ver} → v${target_ver}"
    echo "   서버를 재시작하면 새 버전이 적용됩니다."
}

# ── dist 파일 업데이트 (scripts / samples) ──────────────────────────────────────

_install_dist() {
    local target_ver="$1"
    local file="dist.tar.gz"
    local url="https://github.com/${REPO}/releases/download/v${target_ver}/${file}"
    local fallback_url="https://github.com/${REPO}/archive/refs/tags/v${target_ver}.tar.gz"
    local tmp_tar="/tmp/entity-server-dist-${target_ver}.tar.gz"
    local tmp_dir="/tmp/entity-server-dist-${target_ver}"
    local downloaded_from="release asset"

    printf "  ↓ %-32s" "$file"
    if ! _download "$url" "$tmp_tar" 2>/dev/null; then
        if _download_plain "$fallback_url" "$tmp_tar" 2>/dev/null; then
            downloaded_from="repository tag archive"
            echo "✓ (fallback)"
        else
            echo "✗ 실패 (업데이트 스킵)"
            echo "    release asset: $url"
            echo "    fallback tag archive: $fallback_url"
            echo "    ⚠️  dist 패키지를 가져오지 못했습니다. 바이너리만 업데이트됨."
            return 0
        fi
    else
        echo "✓"
    fi

    rm -rf "$tmp_dir"
    mkdir -p "$tmp_dir"
    tar -xzf "$tmp_tar" -C "$tmp_dir" 2>/dev/null

    # 아카이브 내부 디렉토리 구조 자동 탐지 (top-level 또는 서브디렉토리)
    local src_root="$tmp_dir"
    local found_dir="false"
    for dir in "${DIST_DIRS[@]}"; do
        if [ -d "${tmp_dir}/${dir}" ]; then
            found_dir="true"
            break
        fi
    done
    if [ "$found_dir" = "false" ]; then
        # tar가 서브디렉토리 하나로 풌주는 경우 (예: entity-server-1.5.0/)
        local subdir
        subdir="$(ls -1 "$tmp_dir" | head -1)"
        if [ -n "$subdir" ] && [ -d "${tmp_dir}/${subdir}" ]; then
            src_root="${tmp_dir}/${subdir}"
        fi
    fi

    echo ""
    echo "  dist 소스: $downloaded_from"
    echo "  파일 동기화 (configs/ entities/ 제외):"
    for DIR in "${DIST_DIRS[@]}"; do
        local src="${src_root}/${DIR}"
        local dest="${PROJECT_ROOT}/${DIR}"
        if [ -d "$src" ]; then
            rm -rf "$dest"
            cp -r "$src" "$dest"
            printf "    ✔ %-20s\n" "${DIR}/"
        else
            printf "    – %-20s (릴리스에 없음, 스킵)\n" "${DIR}/"
        fi
    done

    rm -rf "$tmp_dir" "$tmp_tar"
}

# ── 서브커맨드 분기 ───────────────────────────────────────────────────────────

ARG="${1:-}"

case "$ARG" in
    "")
        echo "update-server.sh — entity-server / entity-cli 바이너리 및 파일 업데이트"
        echo ""
        echo "사용법:"
        echo "  ./scripts/update-server.sh latest         최신 버전으로 업데이트"
        echo "  ./scripts/update-server.sh <버전>         특정 버전으로 업데이트"
        echo ""
        echo "업데이트 대상:"
        echo "  바이너리   entity-server  entity-cli"
        echo "  파일    scripts/  samples/"
        echo "  제외     configs/  entities/  docs/  (local 설정 보존)"
        echo ""
        echo "예시:"
        echo "  ./scripts/update-server.sh latest"
        echo "  ./scripts/update-server.sh 1.5.0"
        echo ""
        _print_version_status
        ;;

    "latest")
        echo "🔍 최신 버전 확인 중..."
        LATEST="$(_latest_ver)"
        _install "$LATEST"
        ;;

    *)
        _install "$ARG"
        ;;
esac
