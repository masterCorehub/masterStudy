import { useEffect, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import { useStudyStore } from "../store/useStore";

const NOTE_THEMES = {
  yellow: { background: "#fff2a8", foreground: "#3b3212", border: "#e5ca55" },
  rose: { background: "#ffd6df", foreground: "#4a1e2a", border: "#efa0b3" },
  blue: { background: "#cfeeff", foreground: "#15374a", border: "#81c7ea" },
  green: { background: "#cdf5d8", foreground: "#163b22", border: "#80d89a" },
  purple: { background: "#e7d9ff", foreground: "#382257", border: "#bba0e8" },
  slate: { background: "#e2e8f0", foreground: "#253142", border: "#aebaca" },
};

export function StickyNoteWidgetScreen({ noteId }) {
  const note = useStudyStore((state) =>
    (state.stickyNotes || []).find((item) => item.id === noteId),
  );
  const updateNote = useStudyStore((state) => state.updateStickyNote);
  const contentRef = useRef(null);
  const [storageReady, setStorageReady] = useState(
    () => !window.studyhubDesktop?.studyDatabase,
  );

  useEffect(() => {
    const handleStorageStatus = (event) => {
      if (["saved", "error"].includes(event.detail?.status)) {
        setStorageReady(true);
      }
    };
    window.addEventListener("studyhub-storage-status", handleStorageStatus);
    const fallback = window.setTimeout(() => setStorageReady(true), 1500);
    return () => {
      window.clearTimeout(fallback);
      window.removeEventListener("studyhub-storage-status", handleStorageStatus);
    };
  }, []);

  useEffect(() => {
    if (!note) return;
    window.studyhubDesktop?.stickyNotes?.setAlwaysOnTop?.(
      Boolean(note.alwaysOnTop),
    );
  }, [note?.alwaysOnTop]);

  useEffect(() => {
    contentRef.current?.focus();
  }, []);

  if (!note) {
    return (
      <main className="flex h-screen w-screen items-center justify-center rounded-2xl bg-amber-100 p-6 text-center text-sm font-bold text-amber-950">
        Esta nota não existe mais.
      </main>
    );
  }

  const theme = NOTE_THEMES[note.color] || NOTE_THEMES.yellow;
  const commitUpdate = (updates) => {
    updateNote(note.id, updates);
    window.studyhubDesktop?.stickyNotes?.broadcastChange?.({
      type: "updated",
      noteId: note.id,
      updates,
    });
  };

  const toggleAlwaysOnTop = () => {
    const alwaysOnTop = !note.alwaysOnTop;
    commitUpdate({ alwaysOnTop });
    window.studyhubDesktop?.stickyNotes?.setAlwaysOnTop?.(alwaysOnTop);
  };

  return (
    <main
      className="sticky-note-widget-screen h-screen w-screen select-none overflow-hidden bg-transparent p-2"
      style={{ WebkitAppRegion: "drag" }}
    >
      <article
        className="flex h-full w-full flex-col overflow-hidden rounded-2xl border shadow-2xl"
        style={{
          backgroundColor: theme.background,
          borderColor: theme.border,
          color: theme.foreground,
        }}
      >
        <header className="flex h-11 shrink-0 items-center justify-between border-b border-black/10 px-3">
          <div className="flex min-w-0 items-center gap-2 text-xs font-black uppercase tracking-[0.13em] opacity-65">
            <Icon className="text-[17px]" filled name="sticky_note_2" />
            <span className="truncate">StudyHub</span>
          </div>
          <div
            className="flex items-center gap-0.5"
            style={{ WebkitAppRegion: "no-drag" }}
          >
            <button
              aria-label={note.alwaysOnTop ? "Desativar sempre no topo" : "Manter sempre no topo"}
              className={`flex h-7 w-7 items-center justify-center rounded-full transition hover:bg-black/10 ${note.alwaysOnTop ? "bg-black/10" : "opacity-55"}`}
              disabled={!storageReady}
              onClick={toggleAlwaysOnTop}
              title={note.alwaysOnTop ? "Sempre no topo ativado" : "Manter sempre no topo"}
              type="button"
            >
              <Icon className="text-[16px]" filled={note.alwaysOnTop} name="keep" />
            </button>
            <button
              aria-label="Abrir o StudyHub"
              className="flex h-7 w-7 items-center justify-center rounded-full opacity-55 transition hover:bg-black/10 hover:opacity-100"
              onClick={() => window.studyhubDesktop?.openMainWindow?.()}
              title="Abrir o StudyHub"
              type="button"
            >
              <Icon className="text-[16px]" name="launch" />
            </button>
            <button
              aria-label="Minimizar"
              className="flex h-7 w-7 items-center justify-center rounded-full opacity-55 transition hover:bg-black/10 hover:opacity-100"
              onClick={() => window.studyhubDesktop?.windowControls?.minimize?.()}
              title="Minimizar"
              type="button"
            >
              <Icon className="text-[16px]" name="remove" />
            </button>
            <button
              aria-label="Fechar"
              className="flex h-7 w-7 items-center justify-center rounded-full opacity-55 transition hover:bg-red-500/15 hover:text-red-700 hover:opacity-100"
              onClick={() => window.studyhubDesktop?.windowControls?.close?.()}
              title="Fechar a janela (não apaga a nota)"
              type="button"
            >
              <Icon className="text-[16px]" name="close" />
            </button>
          </div>
        </header>

        <div
          className="flex min-h-0 flex-1 flex-col px-4 pb-3 pt-3"
          style={{ WebkitAppRegion: "no-drag" }}
        >
          <input
            aria-label="Título da nota"
            className="w-full border-0 bg-transparent p-0 text-lg font-black placeholder:text-current placeholder:opacity-35 focus:ring-0"
            maxLength={120}
            disabled={!storageReady}
            onChange={(event) => commitUpdate({ title: event.target.value })}
            placeholder="Título"
            value={note.title}
          />
          <textarea
            aria-label="Conteúdo da nota"
            className="mt-2 min-h-0 w-full flex-1 resize-none border-0 bg-transparent p-0 text-sm leading-6 placeholder:text-current placeholder:opacity-35 focus:ring-0"
            maxLength={10000}
            disabled={!storageReady}
            onChange={(event) => commitUpdate({ content: event.target.value })}
            placeholder="Escreva alguma coisa…"
            ref={contentRef}
            spellCheck
            value={note.content}
          />
          <div className="mt-2 flex items-center gap-1 border-t border-black/10 pt-2 text-[10px] font-bold opacity-45">
            <Icon className="text-[13px]" name={storageReady ? "cloud_done" : "sync"} />
            {storageReady ? "Salvo automaticamente" : "Sincronizando…"}
          </div>
        </div>
      </article>
    </main>
  );
}
