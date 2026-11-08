#!/bin/bash

# Entity CLI wrapper script

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BIN_PATH="$PROJECT_ROOT/bin/entity-cli"
if [ ! -f "$BIN_PATH" ] && [ -f "$PROJECT_ROOT/entity-cli" ]; then
    BIN_PATH="$PROJECT_ROOT/entity-cli"
fi

# Load language from .env
if [ -f "$PROJECT_ROOT/.env" ]; then
    LANGUAGE=$(grep '^LANGUAGE=' "$PROJECT_ROOT/.env" | cut -d '=' -f2)
fi
LANGUAGE=${LANGUAGE:-ko}

# Require prebuilt CLI binary
if [ ! -f "$BIN_PATH" ]; then
    if [ "$LANGUAGE" = "en" ]; then
        echo "❌ entity-cli not found (bin/entity-cli or ./entity-cli)"
    else
        echo "❌ entity-cli 파일이 없습니다 (bin/entity-cli 또는 ./entity-cli)"
    fi
    exit 1
fi

# Run the CLI tool
cd "$PROJECT_ROOT"
ENTITY_CLI_NAME="cli" "$BIN_PATH" "$@"
