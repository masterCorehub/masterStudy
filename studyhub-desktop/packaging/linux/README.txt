STUDYHUB PARA LINUX (x86-64)
================================

INSTALAÇÃO

1. Extraia todo o conteúdo deste pacote.
2. Abra um terminal na pasta extraída.
3. Execute:

   chmod +x install.sh
   ./install.sh

4. Abra "StudyHub" pelo menu de aplicativos.

COMPATIBILIDADE

- KDE Plasma/Wayland: usa Spectacle, quando disponível, para captura silenciosa.
- GNOME e outros Wayland: usa o portal de captura do sistema; uma confirmação
  de compartilhamento pode ser exibida por segurança.
- X11/XWayland: atalhos globais são registrados diretamente pelo aplicativo.
- OCR em português e inglês funciona localmente.
- Tradução de texto requer conexão com a internet.

ATALHOS PADRÃO

Ctrl+Shift+Alt+1  Nota rápida
Ctrl+Shift+Alt+2  Desenho rápido
Ctrl+Shift+Alt+3  Tradutor
Ctrl+Shift+Alt+4  Capturar e traduzir

No Wayland, o ambiente gráfico controla os atalhos globais. Caso eles não sejam
aceitos automaticamente, abra as configurações de teclado do sistema e associe
as quatro ações "StudyHub — ..." às combinações desejadas.

DEPENDÊNCIAS OPCIONAIS

- KDE Spectacle: captura silenciosa no KDE/Wayland.
- Python 3 e FFmpeg: recursos avançados do laboratório de idiomas.
- Ollama: tutor local do laboratório de programação.

DESINSTALAÇÃO

Execute ./uninstall.sh. Cursos, notas e configurações pessoais são preservados
em ~/.config/studyhub-desktop para evitar perda acidental de dados.

