# Nota rápida StudyHub para KDE Plasma

Este é o primeiro widget nativo do KDE Plasma para anotações rápidas.

## Teste seguro (recomendado)

Se o comando existir no seu sistema, teste primeiro sem adicionar ao painel:

```bash
plasmoidviewer /home/ale/Downloads/StudyHub/studyhub-desktop/integrations/kde-studyhub-note
```

## Instalação local

```bash
kpackagetool6 --type Plasma/Applet --install integrations/kde-studyhub-note
```

Depois, clique com o botão direito no painel → **Adicionar widgets** → procure por **Nota rápida StudyHub**.

Em versões antigas do Plasma, use `kpackagetool5` no lugar de `kpackagetool6`.

O botão **Abrir StudyHub** usa o endereço `studyhub://quick-note`; a próxima etapa é registrar esse protocolo no AppImage e sincronizar o conteúdo diretamente com o SQLite do StudyHub.

Para remover com segurança:

```bash
kpackagetool6 --type Plasma/Applet --remove com.studyhub.note
```
