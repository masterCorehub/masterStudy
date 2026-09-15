import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "../../ui/Icon";
import { shortcutLabel } from "../../utils/keyboardShortcuts";
import {
  insertHeading,
  insertList,
  insertCheckbox,
  insertCodeBlock,
  insertBlockquote,
  insertTable,
  insertImage,
  insertWikilink,
  insertAtCursor,
} from "./MarkdownEditor";

/**
 * MarkdownToolbar — Barra de ferramentas flutuante para o editor Markdown
 *
 * @param {Object} props
 * @param {Object} props.editorView - Instância do EditorView (CodeMirror)
 * @param {string} props.className - Classes CSS adicionais
 */
export function MarkdownToolbar({ editorView, className = "" }) {
  const [showHeadingMenu, setShowHeadingMenu] = useState(false);
  const [showInsertMenu, setShowInsertMenu] = useState(false);
  const headingRef = useRef(null);
  const insertRef = useRef(null);

  const handleBold = useCallback(() => {
    if (!editorView) return;
    const { from, to } = editorView.state.selection.main;
    const selected = editorView.state.sliceDoc(from, to);
    if (selected) {
      editorView.dispatch({
        changes: { from, to, insert: `**${selected}**` },
        selection: { anchor: from + 2, head: from + 2 + selected.length },
      });
    } else {
      editorView.dispatch({
        changes: { from, insert: "****" },
        selection: { anchor: from + 2 },
      });
    }
    editorView.focus();
  }, [editorView]);

  const handleItalic = useCallback(() => {
    if (!editorView) return;
    const { from, to } = editorView.state.selection.main;
    const selected = editorView.state.sliceDoc(from, to);
    if (selected) {
      editorView.dispatch({
        changes: { from, to, insert: `*${selected}*` },
        selection: { anchor: from + 1, head: from + 1 + selected.length },
      });
    } else {
      editorView.dispatch({
        changes: { from, insert: "**" },
        selection: { anchor: from + 1 },
      });
    }
    editorView.focus();
  }, [editorView]);

  const handleStrikethrough = useCallback(() => {
    if (!editorView) return;
    const { from, to } = editorView.state.selection.main;
    const selected = editorView.state.sliceDoc(from, to);
    if (selected) {
      editorView.dispatch({
        changes: { from, to, insert: `~~${selected}~~` },
        selection: { anchor: from + 2, head: from + 2 + selected.length },
      });
    } else {
      editorView.dispatch({
        changes: { from, insert: "~~~~" },
        selection: { anchor: from + 2 },
      });
    }
    editorView.focus();
  }, [editorView]);

  const handleInlineCode = useCallback(() => {
    if (!editorView) return;
    const { from, to } = editorView.state.selection.main;
    const selected = editorView.state.sliceDoc(from, to);
    if (selected) {
      editorView.dispatch({
        changes: { from, to, insert: `\`${selected}\`` },
        selection: { anchor: from + 1, head: from + 1 + selected.length },
      });
    } else {
      editorView.dispatch({
        changes: { from, insert: "``" },
        selection: { anchor: from + 1 },
      });
    }
    editorView.focus();
  }, [editorView]);

  const handleHighlight = useCallback(() => {
    if (!editorView) return;
    const { from, to } = editorView.state.selection.main;
    const selected = editorView.state.sliceDoc(from, to);
    if (selected) {
      editorView.dispatch({
        changes: { from, to, insert: `==${selected}==` },
        selection: { anchor: from + 2, head: from + 2 + selected.length },
      });
    } else {
      editorView.dispatch({
        changes: { from, insert: "====" },
        selection: { anchor: from + 2 },
      });
    }
    editorView.focus();
  }, [editorView]);

  const handleImageUpload = useCallback(() => {
    if (!editorView) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onloadend = () => {
          insertImage(editorView, reader.result, file.name);
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  }, [editorView]);

  const toolbarButtons = [
    // Formatting
    { icon: "format_bold", label: `Negrito (${shortcutLabel("Mod+B")})`, action: handleBold, group: "format" },
    { icon: "format_italic", label: `Itálico (${shortcutLabel("Mod+I")})`, action: handleItalic, group: "format" },
    { icon: "format_strikethrough", label: `Tachado (${shortcutLabel("Mod+Shift+X")})`, action: handleStrikethrough, group: "format" },
    { icon: "code", label: `Código inline (${shortcutLabel("Mod+E")})`, action: handleInlineCode, group: "format" },
    { icon: "format_ink_highlighter", label: "Destacar", action: handleHighlight, group: "format", color: "tertiary" },
    { type: "separator" },
    // Headings
    {
      icon: "title",
      label: "Título",
      action: () => setShowHeadingMenu((v) => !v),
      group: "heading",
      ref: headingRef,
      hasDropdown: true,
    },
    { type: "separator" },
    // Lists
    { icon: "format_list_bulleted", label: "Lista", action: () => insertList(editorView, false), group: "list" },
    { icon: "format_list_numbered", label: "Lista numerada", action: () => insertList(editorView, true), group: "list" },
    { icon: "check_box", label: "Checkbox", action: () => insertCheckbox(editorView), group: "list" },
    { type: "separator" },
    // Insert
    { icon: "format_quote", label: "Citação", action: () => insertBlockquote(editorView), group: "insert" },
    { icon: "data_object", label: "Bloco de código", action: () => insertCodeBlock(editorView), group: "insert" },
    { icon: "table_chart", label: "Tabela", action: () => insertTable(editorView), group: "insert" },
    { icon: "link", label: "Wikilink [[]]", action: () => insertWikilink(editorView), group: "insert" },
    {
      icon: "add_circle",
      label: "Inserir...",
      action: () => setShowInsertMenu((v) => !v),
      group: "more",
      ref: insertRef,
      hasDropdown: true,
    },
  ];

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      <div className="flex items-center gap-0.5 px-2 py-1 rounded-xl bg-[var(--surface)] border border-[var(--outline-variant)] shadow-lg">
        {toolbarButtons.map((btn, idx) => {
          if (btn.type === "separator") {
            return <div key={`sep-${idx}`} className="w-px h-5 bg-[var(--outline-variant)] mx-1" />;
          }

          return (
            <button
              key={btn.icon}
              ref={btn.ref}
              onClick={btn.action}
              title={btn.label}
              className={`
                w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150
                ${btn.color === "tertiary"
                  ? "text-[var(--tertiary)] hover:bg-[color-mix(in_srgb,var(--tertiary)_12%,transparent)]"
                  : "text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] hover:bg-[var(--surface-high)]"
                }
                active:scale-95
              `}
            >
              <Icon name={btn.icon} className="text-[18px]" />
              {btn.hasDropdown && (
                <Icon name="arrow_drop_down" className="text-[14px] -ml-1 opacity-50" />
              )}
            </button>
          );
        })}
      </div>

      {/* Heading dropdown */}
      <AnimatePresence>
        {showHeadingMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowHeadingMenu(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute top-full mt-2 left-1/3 z-50 bg-[var(--surface-high)] border border-[var(--outline-variant)] rounded-lg shadow-xl py-1 min-w-[140px]"
            >
              {[1, 2, 3, 4, 5, 6].map((level) => (
                <button
                  key={level}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-[var(--surface-highest)] transition-colors"
                  onClick={() => {
                    insertHeading(editorView, level);
                    setShowHeadingMenu(false);
                  }}
                >
                  <span className="font-mono text-[var(--on-surface-variant)] w-6">H{level}</span>
                  <span
                    className="font-semibold text-[var(--on-surface)]"
                    style={{ fontSize: `${1.4 - level * 0.12}em` }}
                  >
                    Título {level}
                  </span>
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Insert dropdown */}
      <AnimatePresence>
        {showInsertMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowInsertMenu(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute top-full mt-2 right-0 z-50 bg-[var(--surface-high)] border border-[var(--outline-variant)] rounded-lg shadow-xl py-1 min-w-[180px]"
            >
              {[
                { icon: "horizontal_rule", label: "Linha horizontal", action: () => insertAtCursor(editorView, "\n---\n") },
                { icon: "image", label: "Imagem", action: handleImageUpload },
                { icon: "functions", label: "Equação LaTeX", action: () => insertAtCursor(editorView, "\n$$\n\\text{equação}\n$$\n") },
                { icon: "schema", label: "Diagrama Mermaid", action: () => insertAtCursor(editorView, "\n```mermaid\ngraph TD\n    A-->B\n```\n") },
                { icon: "calendar_today", label: "Data atual", action: () => insertAtCursor(editorView, new Date().toLocaleDateString("pt-BR")) },
                { icon: "tag", label: "Tag #", action: () => insertAtCursor(editorView, "#") },
                { icon: "note_add", label: "Nota de rodapé", action: () => insertAtCursor(editorView, "[^1]\n\n[^1]: ") },
              ].map((item) => (
                <button
                  key={item.label}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[var(--on-surface)] hover:bg-[var(--surface-highest)] transition-colors"
                  onClick={() => {
                    item.action();
                    setShowInsertMenu(false);
                  }}
                >
                  <Icon name={item.icon} className="text-[16px] text-[var(--on-surface-variant)]" />
                  {item.label}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
