import React from "react";
import { Icon } from "../../ui/Icon";

const HIGHLIGHT_COLORS = [
  { id: "yellow", label: "Amarelo", bg: "#fef08a", text: "#713f12" },
  { id: "green",  label: "Verde",   bg: "#bbf7d0", text: "#14532d" },
  { id: "blue",   label: "Azul",    bg: "#bfdbfe", text: "#1e3a5f" },
  { id: "pink",   label: "Rosa",    bg: "#fbcfe8", text: "#831843" },
  { id: "orange", label: "Laranja", bg: "#fed7aa", text: "#7c2d12" },
];

export function ReaderSelectionMenu({ position, selectedText, hasExistingHighlight, onHighlight, onRemoveHighlight, onSaveAsNote, onSaveAsQuote, onCopy, onClose }) {
  if (!position) return null;

  return (
    <div
      className="fixed z-[200] flex flex-col gap-1 bg-[color:var(--surface)] border border-[color:var(--outline-variant)]/30 rounded-2xl shadow-2xl p-2 select-none"
      style={{ top: position.y, left: position.x, transform: "translate(-50%, -100%)", marginTop: "-8px" }}
      onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
      onClick={e => e.stopPropagation()}
    >
      {/* Highlight colors row + eraser */}
      <div className="flex items-center gap-1.5 px-1 pb-1 border-b border-[color:var(--outline-variant)]/20">
        {HIGHLIGHT_COLORS.map(c => (
          <button
            key={c.id}
            title={`Grifar ${c.label}`}
            onClick={() => onHighlight(c.id)}
            style={{ backgroundColor: c.bg }}
            className="w-6 h-6 rounded-full border-2 border-white/50 hover:scale-110 transition-transform shadow-sm"
          />
        ))}
        {hasExistingHighlight && (
          <button
            title="Apagar Grifo"
            onClick={onRemoveHighlight}
            className="w-6 h-6 rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center border border-red-300/40 hover:scale-110 transition-transform shadow-sm ml-0.5"
          >
            <Icon name="format_color_reset" className="text-[13px]" />
          </button>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-0.5">
        <button
          onClick={onSaveAsNote}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold text-[color:var(--on-surface)] hover:bg-[color:var(--surface-container-high)] transition-colors text-left"
        >
          <Icon name="sticky_note_2" className="text-[16px] text-[color:var(--primary)]" />
          Salvar como Anotação
        </button>

        <button
          onClick={onSaveAsQuote}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold text-[color:var(--on-surface)] hover:bg-[color:var(--surface-container-high)] transition-colors text-left"
        >
          <Icon name="format_quote" className="text-[16px] text-amber-500" />
          Salvar como Citação
        </button>

        {hasExistingHighlight && (
          <button
            onClick={onRemoveHighlight}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors text-left"
          >
            <Icon name="delete_outline" className="text-[16px] text-red-500" />
            Remover Grifo
          </button>
        )}

        <button
          onClick={onCopy}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold text-[color:var(--on-surface)] hover:bg-[color:var(--surface-container-high)] transition-colors text-left"
        >
          <Icon name="content_copy" className="text-[16px] text-[color:var(--on-surface-variant)]" />
          Copiar
        </button>
      </div>
    </div>
  );
}
