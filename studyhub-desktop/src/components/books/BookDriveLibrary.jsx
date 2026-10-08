import { useEffect, useRef, useState } from "react";
import { startBookImport, useBookImportJob } from "../../services/book-import-job";
import { BookImportSelection } from "./BookImportSelection";
import { loadDriveLibrary } from "../../services/book-files";
import { listDriveBooks } from "../../services/book-drive";


export function BookDriveLibrary({ targetCategoryId = null, onBusyChange }) {
  const [link, setLink] = useState("");
  const [saved, setSaved] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const running = useRef(false);
  const job = useBookImportJob();
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => {
    let active = true;
    loadDriveLibrary().then(value => { if (active && value) { setSaved(value); setLink(value.link); } })
      .catch(() => { if (active) setError("Não foi possível carregar a pasta do Drive vinculada."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const run = async action => {
    if (running.current) return;
    running.current = true; setBusy(true); setError(""); setMessage("");
    try { await action(); }
    catch (failure) { setError(failure.message || "Não foi possível importar do Drive."); }
    finally { running.current = false; setBusy(false); }
  };
  const list = () => listDriveBooks(link.trim(), { onProgress: count => setMessage(`Buscando livros… ${count} encontrado(s).`) });
  const importBooks = files => {
    try {
      startBookImport({ folder: preview.folder, files, scanFiles: preview.files, targetCategoryId, kind: "drive" });
      setSaved(preview.folder); setPreview(null); setMessage("Importação iniciada. Você pode fechar esta janela.");
    } catch (failure) { setError(failure.message); }
  };
  const showList = async () => {
    setPreview(null);
    const result = await list();
    setPreview(result);
    setMessage(`${result.files.length} livro(s) encontrado(s). Escolha quais importar.`);
  };
  return <section aria-label="Biblioteca do Google Drive" aria-busy={busy} className="mb-6 rounded-xl border border-[color:var(--outline-variant)] bg-[color:var(--surface-container-low)] p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="text-sm font-semibold text-[color:var(--on-surface)]">Google Drive{saved ? ` · ${saved.name}` : ""}</h2><p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">Sem chave ou login. Cole o link de um livro ou pasta com acesso “Qualquer pessoa com o link”. PDFs e EPUBs ficam disponíveis neste dispositivo.</p></div>
      {saved && <button disabled={busy || loading || link.trim() !== saved.link} onClick={() => run(showList)} className="rounded-lg border border-[color:var(--outline-variant)] px-3 py-2 text-xs disabled:opacity-50">Buscar novos livros</button>}
    </div>
    <form className="mt-3 flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); run(showList); }}>
      <input aria-label="Link público do Google Drive" type="url" required disabled={busy || loading} value={link} onChange={event => { setLink(event.target.value); setPreview(null); setMessage(""); }} placeholder="https://drive.google.com/drive/folders/…" className="min-w-0 flex-1 basis-64 rounded-lg border border-[color:var(--outline-variant)] bg-[color:var(--surface)] px-3 py-2 text-sm text-[color:var(--on-surface)]" />
      <button disabled={busy || loading} className="rounded-lg bg-[color:var(--primary)] px-3 py-2 text-xs font-semibold text-[color:var(--on-primary)] disabled:opacity-50">Buscar livros</button>
    </form>
    {preview && <BookImportSelection files={preview.files} disabled={busy || job?.status === "running"} onImport={importBooks} />}
    {message && <p aria-live="polite" className="mt-3 text-xs text-[color:var(--on-surface-variant)]">{message}</p>}
    {error && <p role="alert" className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-[color:var(--error)]">{error}</p>}
    <p className="mt-2 text-[10px] text-[color:var(--on-surface-variant)]">Busca novos livros sem substituir os já importados. Pastas com 50 ou mais itens devem ser divididas. No Mac, arquivos de até 150 MB; na web, até 4 MB.</p>
    {saved?.lastSyncAt && <p className="mt-2 text-[10px] text-[color:var(--on-surface-variant)]">Última verificação: {new Date(saved.lastSyncAt).toLocaleString("pt-BR")}</p>}
  </section>;
}
