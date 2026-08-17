#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
VERSION="$(node -p "require('$PROJECT_DIR/package.json').version")"
STAGE_DIR="$PROJECT_DIR/release/StudyHub-linux-x86_64"
ARCHIVE="$PROJECT_DIR/release/StudyHub-${VERSION}-linux-x86_64.tar.gz"

cd "$PROJECT_DIR"
npm run dist:linux

rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"
install -m 0755 "$PROJECT_DIR/release/StudyHub-${VERSION}-x86_64.AppImage" "$STAGE_DIR/StudyHub.AppImage"
install -m 0755 "$PROJECT_DIR/packaging/linux/install.sh" "$STAGE_DIR/install.sh"
install -m 0755 "$PROJECT_DIR/packaging/linux/uninstall.sh" "$STAGE_DIR/uninstall.sh"
install -m 0644 "$PROJECT_DIR/packaging/linux/README.txt" "$STAGE_DIR/README.txt"
install -m 0644 "$PROJECT_DIR/electron/assets/studyhub-icon.png" "$STAGE_DIR/studyhub.png"

tar -C "$PROJECT_DIR/release" -czf "$ARCHIVE" "$(basename "$STAGE_DIR")"
printf '%s\n' "$ARCHIVE"

