import { useBookImportJob, dismissBookImportJob } from "../../services/book-import-job";

export function BookImportProgress() {
  const job = useBookImportJob();
  if (!job) return null;
  const running = job.status === "running";
  return <aside aria-label="Progresso da importação de livros" className="fixed bottom-4 right-4 z-[70] w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-[color:var(--outline-variant)] bg-[color:var(--surface-container)] p-3 text-[color:var(--on-surface)] shadow-xl">
    <div className="flex items-center justify-between gap-2"><strong className="text-xs">{running ? "Importando livros" : job.status === "done" ? "Importação concluída" : "Falha na importação"}</strong>{!running && <button aria-label="Dispensar progresso da importação" onClick={dismissBookImportJob}>✕</button>}</div>
    <p role="status" className="mt-2 text-xs text-[color:var(--on-surface-variant)]">{running ? `${job.current} de ${job.total} · ${job.name}` : job.report ? `${job.report.added} adicionado(s) · ${job.report.updated} atualizado(s) · ${job.report.unchanged} já na biblioteca · ${job.report.missing} ausente(s) · ${job.report.errors.length} falha(s)` : job.error}</p>
    {running && <><progress aria-label="Livros processados" value={Math.max(0, job.current - 1)} max={job.total} className="mt-2 h-1.5 w-full accent-[color:var(--primary)]" /><p className="mt-1 text-[10px] text-[color:var(--on-surface-variant)]">Pode navegar pelo app. Mantenha o aplicativo aberto até concluir.</p></>}
    {!!job.report?.errors.length && <details className="mt-2 text-xs"><summary className="cursor-pointer">Ver arquivos com erro</summary><ul className="mt-2 max-h-32 overflow-auto">{job.report.errors.map((item, index) => <li key={index}>{item.name}: {item.message}</li>)}</ul></details>}
  </aside>;
}
