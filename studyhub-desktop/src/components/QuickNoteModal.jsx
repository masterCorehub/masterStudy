import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "../ui/Icon";
import { useStudyStore } from "../store/useStore";
import { SCREEN_IDS } from "../app/screenIds";

export function QuickNoteModal({ onClose, onNavigate, minimal = false }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);
  
  const studyItems = useStudyStore((state) => state.studyItems) || [];
  const notes = studyItems.filter(item => item.type === "note");
  
  const addNote = useStudyStore((state) => state.addNote);
  const setActiveNote = useStudyStore((state) => state.setActiveNote);

  const filteredNotes = notes.filter(n => n.title?.toLowerCase().includes(query.toLowerCase()) || n.content?.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    inputRef.current?.focus();
    
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleOpenNote = (noteId) => {
    // The global notes search should open the selected note in the same
    // focused quick-note window, instead of navigating the main shell.
    if (window.studyhubDesktop?.openNoteEditorWindow) {
      window.studyhubDesktop.openNoteEditorWindow(noteId);
      onClose();
      return;
    }
    if (typeof window !== "undefined") {
      const params = new URLSearchParams({
        screen: SCREEN_IDS.NOTE_EDITOR,
        noteId,
      });
      window.history.replaceState(null, "", `?${params.toString()}`);
    }
    setActiveNote(noteId);
    onNavigate?.(SCREEN_IDS.NOTE_EDITOR);
    onClose();
  };

  const handleCreateNote = () => {
    if (!query.trim()) return;
    const newNoteId = `note-${Date.now()}`;
    const newNote = {
      id: newNoteId,
      title: query,
      content: "",
      type: "note",
      time: "Agora",
    };
    addNote(newNote);
    handleOpenNote(newNoteId);
  };

  return (
    <div className={`note-search-modal fixed inset-0 z-[9999] flex items-start justify-center ${minimal ? "pt-0" : "pt-[15vh] bg-[color:var(--surface)]/60 backdrop-blur-md"}`}>
      <div className="absolute inset-0" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: -20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -20 }}
        transition={{ duration: 0.15 }}
        className="relative w-full max-w-2xl bg-[color:var(--surface-bright)] rounded-2xl shadow-2xl border border-[color:var(--outline-variant)]/30 overflow-hidden flex flex-col"
      >
        <div className="flex items-center px-4 h-16 border-b border-[color:var(--outline-variant)]/30">
          <Icon name="search" className="text-2xl text-[color:var(--on-surface-variant)] mr-3" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent border-none outline-none text-xl text-[color:var(--on-surface)] placeholder:text-[color:var(--on-surface-variant)]/50 font-medium"
            placeholder="Pesquisar notas ou criar nova..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (filteredNotes.length > 0 && query.trim() !== "") {
                  handleOpenNote(filteredNotes[0].id);
                } else if (query.trim()) {
                  handleCreateNote();
                }
              }
            }}
          />
        </div>
        
        <div className="max-h-[60vh] overflow-y-auto custom-scrollbar p-2">
          {filteredNotes.length > 0 ? (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--on-surface-variant)]/70 px-3 py-2">
                Notas {query.trim() ? "encontradas" : "recentes"}
              </span>
              {filteredNotes.slice(0, 15).map((note) => (
                <button
                  key={note.id}
                  onClick={() => handleOpenNote(note.id)}
                  className="flex flex-col items-start px-4 py-3 rounded-xl hover:bg-[color:var(--primary)]/10 hover:text-[color:var(--primary)] text-left transition-colors group outline-none focus:bg-[color:var(--primary)]/10 focus:text-[color:var(--primary)]"
                >
                  <span className="font-semibold text-sm text-[color:var(--on-surface)] group-hover:text-[color:var(--primary)] group-focus:text-[color:var(--primary)]">
                    {note.title || "Sem título"}
                  </span>
                  <span className="text-xs text-[color:var(--on-surface-variant)] truncate w-full mt-1">
                    {note.content?.replace(/<[^>]+>/g, '') || "Sem conteúdo"}
                  </span>
                </button>
              ))}
              {query.trim() && !filteredNotes.some(n => n.title?.toLowerCase() === query.toLowerCase()) && (
                <button
                  onClick={handleCreateNote}
                  className="mt-2 flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[color:var(--primary)]/10 text-[color:var(--primary)] text-left transition-colors font-semibold outline-none focus:bg-[color:var(--primary)]/10"
                >
                  <Icon name="add" />
                  Criar "{query}"
                </button>
              )}
            </div>
          ) : query.trim() ? (
            <div className="flex flex-col items-center justify-center py-10 text-[color:var(--on-surface-variant)]">
              <Icon name="note_add" className="text-4xl mb-3 opacity-50" />
              <p className="text-sm font-medium">Nenhuma nota encontrada.</p>
              <button 
                onClick={handleCreateNote}
                className="mt-4 px-4 py-2 bg-[color:var(--primary)]/10 text-[color:var(--primary)] font-bold rounded-lg hover:bg-[color:var(--primary)]/20 transition-colors"
              >
                Pressione Enter para criar "{query}"
              </button>
            </div>
          ) : (
            <div className="py-8 text-center text-sm font-medium text-[color:var(--on-surface-variant)]/50">
              Digite para pesquisar notas ou criar uma nova.
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
