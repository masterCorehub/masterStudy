import { useEffect, useRef, useCallback, useState } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder, lineNumbers, highlightActiveLineGutter, highlightActiveLine, drawSelection, rectangularSelection, highlightSpecialChars } from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { defaultKeymap, indentWithTab, history, historyKeymap, undo, redo } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, indentOnInput, HighlightStyle } from "@codemirror/language";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { tags } from "@lezer/highlight";
import { createLivePreviewPlugin } from "./plugins/livePreviewPlugin";
import { createHashtagPlugin } from "./plugins/hashtagPlugin";
import { shortcutLabel } from "../../utils/keyboardShortcuts";

/**
 * Tema personalizado do editor Markdown estilo Obsidian para o masterStudy.
 * Usa as variáveis CSS do design system (--background, --on-surface, etc.)
 */
const campusFlowEditorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "15px",
    fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
    backgroundColor: "transparent",
    color: "var(--on-surface)",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-content": {
    caretColor: "var(--primary)",
    padding: "16px 0",
    lineHeight: "1.8",
    fontFamily: "'Plus Jakarta Sans', 'Inter', monospace",
    minHeight: "100%",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--primary)",
    borderLeftWidth: "2px",
  },
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--primary) 20%, transparent) !important",
  },
  ".cm-activeLine": {
    backgroundColor: "color-mix(in srgb, var(--primary) 5%, transparent)",
    borderRadius: "4px",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "var(--primary)",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--on-surface-variant)",
    border: "none",
    fontSize: "12px",
    minWidth: "40px",
    opacity: "0.5",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    padding: "0 8px 0 4px",
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    fontSize: "11px",
  },
  ".cm-scroller": {
    overflow: "auto",
    scrollbarWidth: "thin",
    scrollbarColor: "var(--outline-variant) transparent",
  },
  ".cm-placeholder": {
    color: "var(--on-surface-variant)",
    opacity: "0.5",
    fontStyle: "italic",
  },
  // Foldable sections
  ".cm-foldGutter": {
    width: "16px",
  },
  // Search panel
  ".cm-panels": {
    backgroundColor: "var(--surface)",
    color: "var(--on-surface)",
    borderBottom: "1px solid var(--outline-variant)",
  },
  ".cm-panels.cm-panels-top": {
    borderBottom: "1px solid var(--outline-variant)",
  },
  ".cm-searchMatch": {
    backgroundColor: "color-mix(in srgb, var(--tertiary) 25%, transparent)",
    borderRadius: "2px",
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "color-mix(in srgb, var(--tertiary) 40%, transparent)",
  },
  // Tooltip / autocomplete
  ".cm-tooltip": {
    backgroundColor: "var(--surface-high)",
    color: "var(--on-surface)",
    border: "1px solid var(--outline-variant)",
    borderRadius: "8px",
    boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
    overflow: "hidden",
  },
  ".cm-tooltip-autocomplete": {
    "& > ul > li": {
      padding: "6px 12px",
      fontSize: "13px",
    },
    "& > ul > li[aria-selected]": {
      backgroundColor: "color-mix(in srgb, var(--primary) 15%, transparent)",
      color: "var(--on-surface)",
    },
  },
  // Custom Tag Styling
  ".cm-hashtag": {
    backgroundColor: "color-mix(in srgb, var(--primary) 15%, transparent)",
    color: "var(--primary)",
    borderRadius: "12px",
    padding: "2px 8px",
    fontSize: "0.9em",
    fontWeight: "500",
    display: "inline-block",
  },
});

/**
 * Highlight de sintaxe Markdown personalizado para estilo Obsidian
 */
const campusFlowHighlightStyle = HighlightStyle.define([
  { tag: tags.heading1, fontWeight: "700", fontSize: "1.8em", color: "var(--on-surface)", lineHeight: "1.3" },
  { tag: tags.heading2, fontWeight: "700", fontSize: "1.5em", color: "var(--on-surface)", lineHeight: "1.3" },
  { tag: tags.heading3, fontWeight: "600", fontSize: "1.25em", color: "var(--on-surface)", lineHeight: "1.4" },
  { tag: tags.heading4, fontWeight: "600", fontSize: "1.1em", color: "var(--on-surface-variant)" },
  { tag: tags.heading5, fontWeight: "600", fontSize: "1em", color: "var(--on-surface-variant)" },
  { tag: tags.heading6, fontWeight: "500", fontSize: "0.95em", color: "var(--on-surface-variant)" },
  { tag: tags.strong, fontWeight: "700", color: "var(--on-surface)" },
  { tag: tags.emphasis, fontStyle: "italic", color: "var(--on-surface)" },
  { tag: tags.strikethrough, textDecoration: "line-through", color: "var(--on-surface-variant)" },
  { tag: tags.link, color: "var(--primary)", textDecoration: "underline" },
  { tag: tags.url, color: "var(--primary)", opacity: "0.7", fontSize: "0.9em" },
  { tag: tags.monospace, fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: "0.9em", backgroundColor: "color-mix(in srgb, var(--primary) 8%, transparent)", padding: "2px 6px", borderRadius: "4px" },
  { tag: tags.quote, color: "var(--on-surface-variant)", fontStyle: "italic", borderLeft: "3px solid var(--primary)" },
  { tag: tags.list, color: "var(--primary)" },
  { tag: tags.meta, color: "var(--on-surface-variant)", opacity: "0.6" },
  { tag: tags.processingInstruction, color: "var(--tertiary)", fontWeight: "600" },
  { tag: tags.comment, color: "var(--on-surface-variant)", opacity: "0.5" },
  { tag: tags.string, color: "#a3be8c" },
  { tag: tags.number, color: "#d08770" },
  { tag: tags.keyword, color: "#b48ead" },
  { tag: tags.function(tags.variableName), color: "#88c0d0" },
]);

/**
 * Extensão para autocomplete de wikilinks [[
 */
function wikilinkCompletion(notesList = []) {
  return autocompletion({
    override: [
      (context) => {
        const before = context.matchBefore(/\[\[[^\]]*$/);
        if (!before) return null;

        const query = before.text.slice(2).toLowerCase();
        const options = notesList
          .filter((note) => note.title?.toLowerCase().includes(query))
          .slice(0, 15)
          .map((note) => ({
            label: note.title || "Sem título",
            type: "text",
            apply: `[[${note.title}]]`,
            detail: note.path || note.module || "",
            boost: note.pinned ? 1 : 0,
          }));

        return {
          from: before.from,
          options,
          validFor: /^[^\]]*$/,
        };
      },
    ],
  });
}

/**
 * Extensão para autocomplete de tags #
 */
function tagCompletion(allTags = []) {
  return autocompletion({
    override: [
      (context) => {
        const before = context.matchBefore(/#[\w\u00C0-\u024F-]*$/);
        if (!before) return null;

        const query = before.text.slice(1).toLowerCase();
        const options = allTags
          .filter((tag) => tag.toLowerCase().includes(query))
          .slice(0, 10)
          .map((tag) => ({
            label: `#${tag}`,
            type: "keyword",
            apply: `#${tag} `,
          }));

        return {
          from: before.from,
          options,
          validFor: /^#[\w\u00C0-\u024F-]*$/,
        };
      },
    ],
  });
}

/**
 * MarkdownEditor — Editor Markdown principal estilo Obsidian
 *
 * @param {Object} props
 * @param {string} props.value - Conteúdo Markdown
 * @param {function} props.onChange - Callback quando o conteúdo muda
 * @param {string} props.placeholder - Texto placeholder
 * @param {boolean} props.showLineNumbers - Mostrar números de linha
 * @param {boolean} props.readOnly - Modo somente leitura
 * @param {Array} props.notesList - Lista de notas para autocomplete de wikilinks
 * @param {Array} props.allTags - Lista de tags para autocomplete
 * @param {function} props.onWikilinkClick - Callback quando um wikilink é clicado
 * @param {function} props.onSave - Callback para salvar (Cmd/Ctrl+S)
 * @param {React.Ref} props.editorRef - Ref externa para acessar a instância do editor
 */
export function MarkdownEditor({
  value = "",
  onChange,
  placeholder: placeholderText = "Comece a escrever suas notas em Markdown...",
  showLineNumbers = false,
  readOnly = false,
  notesList = [],
  allTags = [],
  onWikilinkClick,
  onSave,
  editorRef: externalRef,
  livePreview = false,
  className = "",
}) {
  const containerRef = useRef(null);
  const viewRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [lineCount, setLineCount] = useState(0);

  // Keep callback refs updated
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

  // Atualiza contadores de palavras/caracteres
  const updateCounts = useCallback((doc) => {
    const text = doc.toString();
    setCharCount(text.length);
    setLineCount(doc.lines);
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    setWordCount(words);
  }, []);

  // Cria a instância do editor
  useEffect(() => {
    if (!containerRef.current) return;

    const saveKeymap = keymap.of([
      {
        key: "Mod-s",
        run: () => {
          onSaveRef.current?.();
          return true;
        },
      },
      {
        key: "Mod-b",
        run: (view) => {
          wrapSelection(view, "**");
          return true;
        },
      },
      {
        key: "Mod-i",
        run: (view) => {
          wrapSelection(view, "*");
          return true;
        },
      },
      {
        key: "Mod-Shift-x",
        run: (view) => {
          wrapSelection(view, "~~");
          return true;
        },
      },
      {
        key: "Mod-e",
        run: (view) => {
          wrapSelection(view, "`");
          return true;
        },
      },
      {
        key: "Mod-k",
        run: (view) => {
          insertLink(view);
          return true;
        },
      },
    ]);

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const newContent = update.state.doc.toString();
        onChangeRef.current?.(newContent);
        updateCounts(update.state.doc);
      }
    });

    const extensions = [
      ...(livePreview ? [createLivePreviewPlugin(onWikilinkClick)] : []),
      createHashtagPlugin(),
      campusFlowEditorTheme,
      syntaxHighlighting(campusFlowHighlightStyle),
      markdown({ base: markdownLanguage }),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      drawSelection(),
      rectangularSelection(),
      highlightSpecialChars(),
      highlightSelectionMatches(),
      bracketMatching(),
      indentOnInput(),
      history(),
      placeholder(placeholderText),
      saveKeymap,
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
        ...completionKeymap,
        indentWithTab,
      ]),
      updateListener,
      EditorView.lineWrapping,
      wikilinkCompletion(notesList),
      EditorView.domEventHandlers({
        drop(event, view) {
          const files = event.dataTransfer?.files;
          if (files && files.length > 0) {
            const file = Array.from(files).find((f) => f.type.startsWith("image/"));
            if (file) {
              event.preventDefault();
              const reader = new FileReader();
              reader.onloadend = () => {
                const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
                const insertPos = pos !== null ? pos : view.state.doc.length;
                view.dispatch({
                  changes: { from: insertPos, insert: `\n![${file.name}](${reader.result})\n` },
                });
              };
              reader.readAsDataURL(file);
              return true;
            }
          }
          return false;
        },
        paste(event, view) {
          const items = event.clipboardData?.items;
          if (items) {
            const imageItem = Array.from(items).find((item) => item.type.startsWith("image/"));
            if (imageItem) {
              const file = imageItem.getAsFile();
              if (file) {
                event.preventDefault();
                const reader = new FileReader();
                reader.onloadend = () => {
                  const { from } = view.state.selection.main;
                  view.dispatch({
                    changes: { from, insert: `![${file.name}](${reader.result})` },
                  });
                };
                reader.readAsDataURL(file);
                return true;
              }
            }
          }
          return false;
        },
      }),
    ];

    if (showLineNumbers) {
      extensions.push(lineNumbers());
    }

    if (readOnly) {
      extensions.push(EditorState.readOnly.of(true));
    }

    const state = EditorState.create({
      doc: value,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;
    if (externalRef) {
      if (typeof externalRef === "function") externalRef(view);
      else externalRef.current = view;
    }

    updateCounts(state.doc);

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLineNumbers, readOnly]);

  // Sincroniza valor externo com o editor
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentContent = view.state.doc.toString();
    if (value !== currentContent) {
      view.dispatch({
        changes: {
          from: 0,
          to: currentContent.length,
          insert: value,
        },
      });
    }
  }, [value]);

  return (
    <div className={`markdown-editor-wrapper flex flex-col h-full ${className}`}>
      {/* Editor Area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden markdown-editor-cm"
        onClick={() => viewRef.current?.focus()}
      />

      {/* Status Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--outline-variant)] text-xs text-[var(--on-surface-variant)] opacity-60 select-none shrink-0">
        <div className="flex items-center gap-4">
          <span>{wordCount} palavras</span>
          <span>{charCount} caracteres</span>
          <span>{lineCount} linhas</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded bg-[var(--surface-high)] text-[10px] font-mono">{shortcutLabel("Mod+S")}</kbd>
            Salvar
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded bg-[var(--surface-high)] text-[10px] font-mono">{shortcutLabel("Mod+B")}</kbd>
            Negrito
          </span>
          <span>Markdown</span>
        </div>
      </div>
    </div>
  );
}

// ─── Utility functions ───────────────────────────────────────────────

/**
 * Envolve a seleção atual com marcadores Markdown
 */
function wrapSelection(view, marker) {
  const { from, to } = view.state.selection.main;
  const selectedText = view.state.sliceDoc(from, to);

  if (from === to) {
    // Sem seleção: insere marcadores com cursor no meio
    const insert = `${marker}${marker}`;
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + marker.length },
    });
  } else {
    // Com seleção: envolve o texto
    const insert = `${marker}${selectedText}${marker}`;
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + marker.length, head: from + marker.length + selectedText.length },
    });
  }
}

/**
 * Insere um link Markdown na posição atual
 */
function insertLink(view) {
  const { from, to } = view.state.selection.main;
  const selectedText = view.state.sliceDoc(from, to);

  if (selectedText) {
    const insert = `[${selectedText}](url)`;
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + selectedText.length + 3, head: from + selectedText.length + 6 },
    });
  } else {
    const insert = "[texto](url)";
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + 1, head: from + 6 },
    });
  }
}

/**
 * API pública para inserir texto no editor
 */
export function insertAtCursor(view, text) {
  if (!view) return;
  const { from } = view.state.selection.main;
  view.dispatch({
    changes: { from, to: from, insert: text },
    selection: { anchor: from + text.length },
  });
  view.focus();
}

/**
 * API pública para inserir um heading
 */
export function insertHeading(view, level = 1) {
  if (!view) return;
  const prefix = "#".repeat(level) + " ";
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  
  // Remove heading existente na linha
  const currentText = line.text;
  const cleanText = currentText.replace(/^#{1,6}\s*/, "");
  
  view.dispatch({
    changes: { from: line.from, to: line.to, insert: prefix + cleanText },
  });
  view.focus();
}

/**
 * API pública para inserir lista
 */
export function insertList(view, ordered = false) {
  if (!view) return;
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const prefix = ordered ? "1. " : "- ";
  
  view.dispatch({
    changes: { from: line.from, to: line.from, insert: prefix },
  });
  view.focus();
}

/**
 * API pública para inserir checkbox
 */
export function insertCheckbox(view) {
  if (!view) return;
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  
  view.dispatch({
    changes: { from: line.from, to: line.from, insert: "- [ ] " },
  });
  view.focus();
}

/**
 * API pública para inserir bloco de código
 */
export function insertCodeBlock(view, language = "") {
  if (!view) return;
  const { from, to } = view.state.selection.main;
  const selectedText = view.state.sliceDoc(from, to);
  const insert = `\n\`\`\`${language}\n${selectedText || ""}\n\`\`\`\n`;
  
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + 4 + language.length + 1 },
  });
  view.focus();
}

/**
 * API pública para inserir blockquote
 */
export function insertBlockquote(view) {
  if (!view) return;
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  
  view.dispatch({
    changes: { from: line.from, to: line.from, insert: "> " },
  });
  view.focus();
}

/**
 * API pública para inserir tabela
 */
export function insertTable(view, cols = 3, rows = 3) {
  if (!view) return;
  const { from } = view.state.selection.main;
  
  const header = "| " + Array(cols).fill("Coluna").map((c, i) => `${c} ${i + 1}`).join(" | ") + " |";
  const separator = "| " + Array(cols).fill("---").join(" | ") + " |";
  const bodyRows = Array(rows).fill("| " + Array(cols).fill("   ").join(" | ") + " |");
  
  const table = "\n" + [header, separator, ...bodyRows].join("\n") + "\n";
  
  view.dispatch({
    changes: { from, to: from, insert: table },
  });
  view.focus();
}

/**
 * API pública para inserir imagem
 */
export function insertImage(view, url = "", alt = "imagem") {
  if (!view) return;
  const { from } = view.state.selection.main;
  const insert = `![${alt}](${url})`;
  
  view.dispatch({
    changes: { from, to: from, insert },
  });
  view.focus();
}

/**
 * API pública para inserir wikilink
 */
export function insertWikilink(view, noteTitle = "") {
  if (!view) return;
  const { from } = view.state.selection.main;
  const insert = noteTitle ? `[[${noteTitle}]]` : "[[]]";
  
  view.dispatch({
    changes: { from, to: from, insert },
    selection: { anchor: from + 2 + (noteTitle ? noteTitle.length + 2 : 0) },
  });
  view.focus();
}
