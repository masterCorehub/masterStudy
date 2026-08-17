#!/usr/bin/env bash
set -euo pipefail

DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
INSTALL_DIR="$DATA_HOME/studyhub"
APPLICATIONS_DIR="$DATA_HOME/applications"

for component in \
  studyhub-quick-note.desktop \
  studyhub-quick-draw.desktop \
  studyhub-translator.desktop \
  studyhub-translator-ocr.desktop; do
  if command -v gdbus >/dev/null 2>&1; then
    gdbus call --session --dest org.kde.kglobalaccel --object-path /kglobalaccel \
      --method org.kde.KGlobalAccel.unregister "$component" _launch \
      >/dev/null 2>&1 || true
  fi
done

rm -f \
  "$APPLICATIONS_DIR/studyhub.desktop" \
  "$APPLICATIONS_DIR/studyhub-quick-note.desktop" \
  "$APPLICATIONS_DIR/studyhub-quick-draw.desktop" \
  "$APPLICATIONS_DIR/studyhub-translator.desktop" \
  "$APPLICATIONS_DIR/studyhub-translator-ocr.desktop" \
  "$DATA_HOME/icons/hicolor/256x256/apps/studyhub.png"
rm -rf "$INSTALL_DIR"

command -v update-desktop-database >/dev/null 2>&1 && \
  update-desktop-database "$APPLICATIONS_DIR" >/dev/null 2>&1 || true
printf 'StudyHub removido. Seus dados pessoais foram preservados.\n'

