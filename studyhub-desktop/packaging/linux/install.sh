#!/usr/bin/env bash
set -euo pipefail

PACKAGE_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
APPIMAGE_SOURCE="$PACKAGE_DIR/StudyHub.AppImage"
INSTALL_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/studyhub"
APPLICATIONS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
ICON_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/256x256/apps"
APPIMAGE_TARGET="$INSTALL_DIR/StudyHub.AppImage"

if [[ ! -f "$APPIMAGE_SOURCE" ]]; then
  printf 'Erro: StudyHub.AppImage não foi encontrado ao lado do instalador.\n' >&2
  exit 1
fi

mkdir -p "$INSTALL_DIR" "$APPLICATIONS_DIR" "$ICON_DIR"
install -m 0755 "$APPIMAGE_SOURCE" "$APPIMAGE_TARGET"
install -m 0644 "$PACKAGE_DIR/studyhub.png" "$ICON_DIR/studyhub.png"

write_desktop_action() {
  local file_name="$1"
  local display_name="$2"
  local action="$3"
  cat > "$APPLICATIONS_DIR/$file_name" <<EOF
[Desktop Entry]
Type=Application
Name=$display_name
Exec=env APPIMAGELAUNCHER_DISABLE=1 STUDYHUB_ACTION=$action $APPIMAGE_TARGET --no-sandbox --ozone-platform=x11
Icon=studyhub
NoDisplay=true
StartupNotify=false
EOF
}

cat > "$APPLICATIONS_DIR/studyhub.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=StudyHub
Comment=Central pessoal de aprendizagem
Exec=env APPIMAGELAUNCHER_DISABLE=1 $APPIMAGE_TARGET --no-sandbox --ozone-platform=x11
Icon=studyhub
Categories=Education;
StartupWMClass=com.studyhub
StartupNotify=true
EOF

write_desktop_action "studyhub-quick-note.desktop" "StudyHub — Nota rápida" "quick-note"
write_desktop_action "studyhub-quick-draw.desktop" "StudyHub — Desenho rápido" "quick-draw"
write_desktop_action "studyhub-translator.desktop" "StudyHub — Tradutor" "translator"
write_desktop_action "studyhub-translator-ocr.desktop" "StudyHub — Capturar e traduzir" "translator-ocr"

command -v update-desktop-database >/dev/null 2>&1 && \
  update-desktop-database "$APPLICATIONS_DIR" >/dev/null 2>&1 || true
command -v gtk-update-icon-cache >/dev/null 2>&1 && \
  gtk-update-icon-cache -f "${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor" >/dev/null 2>&1 || true

desktop="${XDG_CURRENT_DESKTOP:-${DESKTOP_SESSION:-}}"
if [[ "$desktop" == *KDE* || "$desktop" == *Plasma* || "$desktop" == *plasma* ]]; then
  if command -v gdbus >/dev/null 2>&1; then
    register_kde_shortcut() {
      local component="$1" name="$2" friendly="$3" key="$4"
      gdbus call --session --dest org.kde.kglobalaccel --object-path /kglobalaccel \
        --method org.kde.KGlobalAccel.doRegister \
        "['$component','_launch','$friendly','$name']" >/dev/null 2>&1 || true
      gdbus call --session --dest org.kde.kglobalaccel --object-path /kglobalaccel \
        --method org.kde.KGlobalAccel.setForeignShortcut \
        "['$component','_launch','$friendly','$name']" "[$key]" >/dev/null 2>&1 || true
    }
    register_kde_shortcut "studyhub-quick-note.desktop" "Nota rápida" "StudyHub — Nota rápida" 234881073
    register_kde_shortcut "studyhub-quick-draw.desktop" "Desenho rápido" "StudyHub — Desenho rápido" 234881074
    register_kde_shortcut "studyhub-translator.desktop" "Tradutor" "StudyHub — Tradutor" 234881075
    register_kde_shortcut "studyhub-translator-ocr.desktop" "Capturar e traduzir" "StudyHub — Capturar e traduzir" 234881076
  fi
fi

printf '\nStudyHub instalado com sucesso.\n'
printf 'Abra "StudyHub" no menu de aplicativos.\n'
printf 'Atalhos sugeridos: Ctrl+Shift+Alt+1, 2, 3 e 4.\n'
if [[ "$desktop" != *KDE* && "$desktop" != *Plasma* && "$desktop" != *plasma* ]]; then
  printf 'No Wayland, autorize atalhos e captura quando o ambiente gráfico solicitar.\n'
fi
