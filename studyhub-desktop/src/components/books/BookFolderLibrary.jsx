import { useEffect, useRef, useState } from "react";
import { startBookImport, useBookImportJob } from "../../services/book-import-job";
import { BookImportSelection } from "./BookImportSelection";
import { bookFileType } from "../../domain/bookMetadata";
import { Icon } from "../../ui/Icon";
import { loadBookLibraryFolder, saveBookLibraryFolder } from "../../services/book-files";
import { nativeFolderFiles, uploadedFolderFiles, readFolderFiles } from "../../services/book-library";

export function BookFolderLibrary({ targetCategoryId = null, onBusyChange }) {
  const [folder, setFolder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const job = useBookImportJob();
  const inputRef = useRef(null);
  const selectionIntent = useRef("link");
  const running = useRef(false);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => {
    let active = true;
    loadBookLibraryFolder().then(saved => { if (active) setFolder(saved || null); })
      .catch(() => { if (active) setError("Não foi possível carregar a pasta vinculada. Tente vinculá-la novamente."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const previewFiles = (selected, files) => {
    const supported = [...new Map(files.filter(file => bookFileType(file.name)).map(file => [file.relativePath, file])).values()];
    setPreview({ folder: selected, files: supported });
    setMessage(`${supported.length} livro(s) encontrado(s). Escolha quais importar.`);
  };
  const importSelected = files => {
    try {
      startBookImport({ folder: preview.folder, files, scanFiles: preview.files, targetCategoryId, kind: "folder" });
      setPreview(null); setMessage("Importação iniciada. Você pode fechar esta janela.");
    } catch (failure) { setError(failure.message); }
  };

  const run = async (action) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setPreview(null);
    try { await action(); }
    catch (failure) { setError(failure.message || "Não foi possível acessar a pasta. Vincule-a novamente."); setMessage(""); }
    finally { running.current = false; setBusy(false); }
  };
  const makeFolder = (name, mode, extra = {}) => ({
    id: `folder-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`,
    name, mode, ...extra,
  });
  const chooseFolder = () => {
    if (!window.studyhubDesktop?.selectDirectory && !window.showDirectoryPicker) {
      selectionIntent.current = "link";
      inputRef.current.click();
      return;
    }
    run(async () => {
      let selected;
      let files;
      if (window.studyhubDesktop?.selectDirectory) {
        const result = await window.studyhubDesktop.selectDirectory();
        if (!result) return;
        selected = folder?.mode === "desktop" && folder.linkedFolderPath === result.dirPath
          ? folder : makeFolder(result.rootName, "desktop", { linkedFolderPath: result.dirPath });
        files = nativeFolderFiles(result);
      } else {
        let handle;
        try { handle = await window.showDirectoryPicker({ mode: "read" }); }
        catch (failure) { if (failure.name === "AbortError") return; throw failure; }
        selected = folder?.handle && await folder.handle.isSameEntry(handle) ? folder : makeFolder(handle.name, "browser-handle", { handle });
        files = await readFolderFiles(selected);
      }
      await saveBookLibraryFolder(selected);
      setFolder(selected);
      previewFiles(selected, files);
    });
  };
  const synchronize = () => {
    if (folder.mode === "browser-files") {
      selectionIntent.current = "sync";
      inputRef.current.click();
      return;
    }
    run(async () => previewFiles(folder, await readFolderFiles(folder)));
  };
  const uploadFolder = event => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    run(async () => {
      const name = files[0].webkitRelativePath.split("/")[0] || "Livros";
      if (selectionIntent.current === "sync" && name !== folder?.name) throw new Error(`Selecione a pasta “${folder.name}” para sincronizar, ou use Trocar pasta.`);
      const selected = folder?.mode === "browser-files" && folder.name === name ? folder : makeFolder(name, "browser-files");
      await saveBookLibraryFolder(selected);
      setFolder(selected);
      previewFiles(selected, uploadedFolderFiles(files));
    });
  };

  return <section className="mb-6 rounded-xl border border-[color:var(--outline-variant)] bg-[color:var(--surface-container-low)] p-4" aria-label="Biblioteca por pasta" aria-busy={busy}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3"><Icon name="folder_open" className="text-[color:var(--primary)]" /><div className="min-w-0"><h2 className="text-sm font-semibold text-[color:var(--on-surface)]">{folder ? `Pasta: ${folder.name}` : "Sua pasta de livros"}</h2><p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">{folder?.mode === "browser-files" ? "Selecione a mesma pasta ao sincronizar neste navegador." : "PDFs e EPUBs, incluindo subpastas. Seus livros e anotações ficam preservados."}</p></div></div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || loading} onClick={chooseFolder} className="rounded-lg border border-[color:var(--outline-variant)] px-3 py-2 text-xs text-[color:var(--on-surface)] disabled:opacity-50">{folder ? "Trocar pasta" : "Importar pasta"}</button>
        {folder ? <button type="button" disabled={busy || loading} onClick={synchronize} className="flex items-center gap-2 rounded-lg bg-[color:var(--primary)] px-3 py-2 text-xs font-semibold text-[color:var(--on-primary)] disabled:opacity-50"><Icon name="sync" className={busy ? "animate-spin text-[16px]" : "text-[16px]"} />{busy ? "Sincronizando…" : "Sincronizar pasta"}</button> : null}
      </div>
    </div>
    <input ref={inputRef} type="file" webkitdirectory="" multiple className="hidden" aria-label="Pasta de livros" onChange={uploadFolder} />
    {message ? <p aria-live="polite" className="mt-3 text-xs text-[color:var(--on-surface-variant)]">{message}</p> : null}
    {error ? <p role="alert" className="mt-3 text-xs text-[color:var(--error)]">{error}</p> : null}
    {preview && <BookImportSelection files={preview.files} disabled={busy || job?.status === "running"} onImport={importSelected} />}
    {folder?.lastSyncAt && !busy ? <p className="mt-2 text-[10px] text-[color:var(--on-surface-variant)]">Última verificação: {new Date(folder.lastSyncAt).toLocaleString("pt-BR")}</p> : null}
  </section>;
}
