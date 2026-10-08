import { useEffect, useState } from "react";

export function BookImportSelection({ files, disabled, onImport }) {
  const [selected, setSelected] = useState(() => new Set(files.map(file => file.relativePath)));
  useEffect(() => setSelected(new Set(files.map(file => file.relativePath))), [files]);
  return <div className="mt-3">
    <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-[color:var(--on-surface-variant)]"><span>{selected.size} de {files.length} selecionado(s)</span><button type="button" disabled={disabled} onClick={() => setSelected(new Set(files.map(file => file.relativePath)))}>Selecionar todos</button><button type="button" disabled={disabled} onClick={() => setSelected(new Set())}>Limpar seleção</button></div>
    <ul className="max-h-52 overflow-y-auto space-y-1 text-xs text-[color:var(--on-surface)]">{files.map(file => <li key={file.relativePath}><label className="flex cursor-pointer items-start gap-2 rounded-lg p-2 hover:bg-[color:var(--surface-container)]"><input type="checkbox" disabled={disabled} checked={selected.has(file.relativePath)} onChange={event => setSelected(previous => { const next = new Set(previous); if (event.target.checked) next.add(file.relativePath); else next.delete(file.relativePath); return next; })} className="mt-0.5 shrink-0 accent-[color:var(--primary)]" /><span className="break-all">{file.displayPath || file.relativePath || file.name}</span></label></li>)}</ul>
    <button type="button" disabled={disabled || !selected.size} onClick={() => onImport(files.filter(file => selected.has(file.relativePath)))} className="mt-3 rounded-lg bg-[color:var(--primary)] px-3 py-2 text-xs font-semibold text-[color:var(--on-primary)] disabled:opacity-50">Importar {selected.size} livro(s)</button>
    <p className="mt-2 text-xs text-[color:var(--on-surface-variant)]">Depois de iniciar, você pode fechar esta janela e continuar usando o app.</p>
  </div>;
}
