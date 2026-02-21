#!/bin/bash
# update-server.sh — entity-server / entity-cli 바이너리 업데이트
#
# 사용법:
#   ./scripts/update-server.sh             # 도움말
#   ./scripts/update-server.sh version     # 현재 버전 + 최신 버전 확인
#   ./scripts/update-server.sh latest      # 최신 버전으로 업데이트
#   ./scripts/update-server.sh 1.5.0       # 특정 버전으로 업데이트

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
REPO="ehfuse/entity-server"
BINARIES=("entity-server" "entity-cli")

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
    local bin="$PROJECT_ROOT/entity-server"
    if [ -x "$bin" ]; then
        "$bin" --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || echo "(알 수 없음)"
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

_install() {
    local target_ver="${1#v}"   # v 접두사 제거
    local current_ver
    current_ver="$(_current_ver)"

    echo ""
    echo "📦 entity-server v${target_ver} 다운로드 중... (${PLATFORM}-${ARCH_TAG})"
    echo ""

    for BIN in "${BINARIES[@]}"; do
        local file="${BIN}-${PLATFORM}-${ARCH_TAG}"
        local url="https://github.com/${REPO}/releases/download/v${target_ver}/${file}"
        local dest="$PROJECT_ROOT/$BIN"

        printf "  ↓ %-32s" "$file"
        if _download "$url" "$dest" 2>/dev/null; then
            echo "✓"
        else
            echo "✗ 실패"
            echo "    URL: $url"
            exit 1
        fi
    done

    echo ""
    echo "✅ 업데이트 완료: v${current_ver} → v${target_ver}"
    echo "   서버를 재시작하면 새 버전이 적용됩니다."
}

# ── 서브커맨드 분기 ───────────────────────────────────────────────────────────

ARG="${1:-}"

case "$ARG" in
    "")
        echo "update-server.sh — entity-server / entity-cli 바이너리 업데이트"
        echo ""
        echo "사용법:"
        echo "  ./scripts/update-server.sh version        현재 버전 + 최신 버전 확인"
        echo "  ./scripts/update-server.sh latest         최신 버전으로 업데이트"
        echo "  ./scripts/update-server.sh <버전>         특정 버전으로 업데이트"
        echo ""
        echo "예시:"
        echo "  ./scripts/update-server.sh version"
        echo "  ./scripts/update-server.sh latest"
        echo "  ./scripts/update-server.sh 1.5.0"
        ;;

    "version")
        echo "🔍 버전 확인 중..."
        CURRENT="$(_current_ver)"
        LATEST="$(_latest_ver)"
        echo ""
        echo "  현재 버전: v${CURRENT}"
        echo "  최신 버전: v${LATEST}"
        echo ""
        if [ "$CURRENT" = "$LATEST" ]; then
            echo "✅ 최신 버전입니다."
        else
            echo "💡 업데이트 가능: ./scripts/update-server.sh latest"
        fi
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
