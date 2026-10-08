import { useEffect, useRef, useState } from "react";
import { BookFolderLibrary } from "./BookFolderLibrary";
import { BookDriveLibrary } from "./BookDriveLibrary";

export function BookImportDialog({ onClose, onFile, targetCategoryId, targetCategoryName }) {
  const [mode, setMode] = useState("file");
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const busyRef = useRef(false);
  busyRef.current = busy;
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.querySelector("button")?.focus();
    const keydown = event => {
      if (event.key === "Escape" && !busyRef.current) { event.preventDefault(); onClose(); }
      if (event.key === "Tab") {
        const focusable = [...ref.current.querySelectorAll("button:not(:disabled),input:not(:disabled),summary,select")].filter(element => element.getClientRects().length);
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, [onClose]);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section ref={ref} role="dialog" aria-modal="true" aria-labelledby="book-import-title" className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-[color:var(--outline-variant)] bg-[color:var(--surface)] p-5 text-[color:var(--on-surface)] shadow-xl">
      <div className="flex items-center justify-between gap-3"><h2 id="book-import-title" className="text-lg font-semibold">Importar livros</h2><button disabled={busy} onClick={onClose} aria-label="Fechar importação" className="rounded-lg px-3 py-2 hover:bg-[color:var(--surface-container)] disabled:opacity-40">✕</button></div>
      <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">Novos livros serão classificados como {targetCategoryName || "Sem categoria"}.</p>
      <div className="my-4 flex flex-wrap gap-2" aria-label="Origem da importação">{[["file", "Arquivo"], ["folder", "Pasta local"], ["drive", "Google Drive"]].map(([id, label]) => <button key={id} disabled={busy} aria-pressed={mode === id} onClick={() => setMode(id)} className={`rounded-lg px-3 py-2 text-sm disabled:opacity-40 ${mode === id ? "bg-[color:var(--primary)] text-[color:var(--on-primary)]" : "bg-[color:var(--surface-container)]"}`}>{label}</button>)}</div>
      {mode === "file" && <div className="rounded-xl bg-[color:var(--surface-container-low)] p-4"><p className="mb-3 text-sm text-[color:var(--on-surface-variant)]">Selecione um PDF ou EPUB. Capa e informações são extraídas do arquivo; você pode revisá-las antes de salvar.</p><button onClick={onFile} className="rounded-lg bg-[color:var(--primary)] px-3 py-2 text-sm font-semibold text-[color:var(--on-primary)]">Selecionar arquivo</button></div>}
      {mode === "folder" && <BookFolderLibrary targetCategoryId={targetCategoryId} onBusyChange={setBusy} />}
      {mode === "drive" && <BookDriveLibrary targetCategoryId={targetCategoryId} onBusyChange={setBusy} />}
    </section>
  </div>;
}
