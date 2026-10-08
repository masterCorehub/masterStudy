import React, { useEffect, useRef, useState } from "react";
import { Icon } from "../../ui/Icon";

export function BookFileImport({
  filePath,
  fileName,
  onImport,
  onBusyChange,
  refresh = false,
}) {
  const input = useRef(null);
  const operation = useRef(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(
    () => () => {
      operation.current++;
    },
    [],
  );

  const importFile = async (source, name, refreshCover = false) => {
    const id = ++operation.current;
    setBusy(true);
    onBusyChange?.(true);
    setFailed(false);
    setNotice("Lendo capa e dados do livro…");
    try {
      // Load the engines only when importing, keeping the library lightweight.
      const { extractBookMetadata } = await import(
        "../../services/book-metadata"
      );
      const metadata = await extractBookMetadata(source, name);
      if (operation.current !== id) return;
      await onImport({ source, metadata, refreshCover });
      if (operation.current !== id) return;
      setNotice(
        [
          "Dados do arquivo preenchidos. Você pode ajustá-los abaixo.",
          ...metadata.warnings,
        ].join(" "),
      );
    } catch (error) {
      if (operation.current !== id) return;
      setFailed(true);
      setNotice(error.message);
    } finally {
      if (operation.current === id) {
        setBusy(false);
        onBusyChange?.(false);
      }
    }
  };
  const choose = async () => {
    if (!window.studyhubDesktop?.selectFile) {
      input.current?.click();
      return;
    }
    try {
      const result = await window.studyhubDesktop.selectFile({
        properties: ["openFile"],
        filters: [{ name: "Livros (PDF, EPUB)", extensions: ["pdf", "epub"] }],
      });
      const source = Array.isArray(result)
        ? result[0]
        : typeof result === "string"
          ? result
          : result?.filePath || result?.filePaths?.[0];
      if (source) await importFile(source);
    } catch (error) {
      setFailed(true);
      setNotice(error.message);
    }
  };

  return (
    <div className="rounded-xl border border-[color:var(--outline-variant)] bg-[color:var(--surface-container-low)] p-3 text-[color:var(--on-surface)]">
      <input
        ref={input}
        type="file"
        accept=".pdf,.epub"
        aria-label="Arquivo do livro"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) importFile(file);
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Icon name="auto_stories" className="text-[color:var(--primary)]" />
        <span
          className="min-w-0 flex-1 truncate text-sm"
          title={fileName || ""}
        >
          {fileName || "Importe um PDF ou EPUB"}
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={choose}
          className="rounded-lg bg-[color:var(--primary)] px-3 py-2 text-xs font-semibold text-[color:var(--on-primary)] disabled:opacity-50"
        >
          {busy
            ? "Lendo…"
            : filePath || fileName
              ? "Alterar arquivo"
              : "Escolher arquivo"}
        </button>
        {refresh && filePath && (
          <button
            type="button"
            disabled={busy}
            onClick={() => importFile(filePath, fileName, true)}
            className="rounded-lg border border-[color:var(--outline-variant)] px-3 py-2 text-xs disabled:opacity-50"
          >
            Extrair capa e páginas
          </button>
        )}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-[color:var(--on-surface-variant)]">
        Capa, título, autor e páginas são preenchidos quando disponíveis no
        arquivo. Você também pode cadastrar um livro físico manualmente.
      </p>
      {notice && (
        <p
          role={failed ? "alert" : "status"}
          className={`mt-2 text-xs leading-relaxed ${failed ? "text-[color:var(--error)]" : "text-[color:var(--primary)]"}`}
        >
          {notice}
        </p>
      )}
    </div>
  );
}
