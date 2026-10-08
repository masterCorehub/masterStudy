import React, { useRef, useEffect } from "react";
import { Icon } from "../../ui/Icon";

export function FloatingStickyNote({ saveMode, noteForm, setNoteForm, onSave, onClose }) {
  const isQuote = saveMode === "quote";
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        onClose();
      }
    };
    const handleMessage = (e) => {
      if (e.data === "EPUB_CLICK") onClose();
    };
    
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("message", handleMessage);
    
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("message", handleMessage);
    };
  }, [onClose]);

  return (
    <div
      ref={containerRef}
      className="fixed bottom-12 right-6 z-[250] w-80 sm:w-96 bg-amber-50/95 dark:bg-[#252019]/95 text-amber-950 dark:text-amber-100 border border-amber-300/50 dark:border-amber-700/50 shadow-2xl rounded-3xl p-4 backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-bottom-4"
      style={{ WebkitAppRegion: "no-drag" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-amber-200/60 dark:border-amber-800/40">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-amber-200/80 dark:bg-amber-800/60 flex items-center justify-center text-amber-800 dark:text-amber-200 shadow-sm">
            <Icon name={isQuote ? "format_quote" : "push_pin"} className="text-[16px]" />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-amber-900 dark:text-amber-200">
              {isQuote ? "Citação em Destaque" : "Anotação • Pg. " + noteForm.page}
            </p>
            <p className="text-[10px] text-amber-700/80 dark:text-amber-400/80 font-medium">
              Escreva e continue lendo o livro
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-amber-200/60 dark:hover:bg-amber-800/40 text-amber-800 dark:text-amber-300 transition-colors"
        >
          <Icon name="close" className="text-[16px]" />
        </button>
      </div>

      <form onSubmit={onSave} className="flex flex-col gap-3">
        {/* Selected text preview if any */}
        {noteForm.selectedText && (
          <div className="p-2.5 bg-amber-100/80 dark:bg-amber-900/40 border-l-4 border-amber-500 rounded-r-xl text-xs italic text-amber-900 dark:text-amber-200 line-clamp-3 leading-relaxed">
            "{noteForm.selectedText}"
          </div>
        )}

        {/* Comment / Content */}
        {!isQuote && (
          <div>
            <textarea
              rows={3}
              autoFocus
              placeholder="Escreva suas observações, resumo ou ideias..."
              value={noteForm.content}
              onChange={e => setNoteForm(f => ({ ...f, content: e.target.value }))}
              className="w-full bg-amber-100/60 dark:bg-amber-900/30 border border-amber-300/40 dark:border-amber-700/40 rounded-xl px-3.5 py-2.5 text-xs text-amber-950 dark:text-amber-100 placeholder:text-amber-700/50 outline-none focus:border-amber-500 resize-none leading-relaxed transition-colors"
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-1 border-t border-amber-200/40 dark:border-amber-800/30">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-800 dark:text-amber-400">
            <Icon name="tag" className="text-[12px]" />
            <span>Página {noteForm.page}</span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-amber-800 dark:text-amber-300 hover:bg-amber-200/50 dark:hover:bg-amber-800/40 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 shadow-md transition-colors flex items-center gap-1.5"
            >
              <Icon name="check" className="text-[14px]" />
              {isQuote ? "Salvar citação" : "Salvar anotação"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
