import { useMemo, useState } from "react";
import { Icon } from "../ui/Icon";
import { useStudyStore } from "../store/useStore";

const TYPE_META = {
  study_item: ["Nota ou material", "description"],
  task: ["Tarefa", "task_alt"],
  book: ["Livro", "menu_book"],
  habit: ["Hábito", "repeat"],
  journal: ["Entrada do diário", "auto_stories"],
  quick_note: ["Anotação rápida", "sticky_note_2"],
  sticky_note: ["Sticky Note", "sticky_note_2"],
  knowledge: ["Captura", "hub"],
  flashcard_deck: ["Baralho", "style"],
  academic: ["Item acadêmico", "school"],
  system: ["Sistema", "settings"],
};

const ACTION_META = {
  deleted: ["Movido para a lixeira", "delete", "text-amber-600"],
  restored: ["Restaurado", "restore", "text-emerald-600"],
  permanently_deleted: ["Excluído definitivamente", "delete_forever", "text-red-600"],
  trash_emptied: ["Lixeira esvaziada", "delete_sweep", "text-red-600"],
};

const formatDate = (timestamp) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp));

export function TrashHistoryScreen() {
  const [tab, setTab] = useState("trash");
  const [query, setQuery] = useState("");
  const trash = useStudyStore((state) => state.universalTrash || []);
  const history = useStudyStore((state) => state.universalHistory || []);
  const restore = useStudyStore((state) => state.restoreTrashItem);
  const remove = useStudyStore((state) => state.permanentlyDeleteTrashItem);
  const emptyTrash = useStudyStore((state) => state.emptyUniversalTrash);
  const clearHistory = useStudyStore((state) => state.clearUniversalHistory);

  const source = tab === "trash" ? trash : history;
  const visibleItems = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    if (!needle) return source;
    return source.filter((item) => {
      const typeLabel = TYPE_META[item.entityType]?.[0] || item.entityType;
      return `${item.title} ${typeLabel}`.toLocaleLowerCase("pt-BR").includes(needle);
    });
  }, [query, source]);

  const handlePermanentDelete = (item) => {
    if (window.confirm(`Excluir “${item.title}” definitivamente? Esta ação não pode ser desfeita.`)) remove(item.id);
  };

  const handleClear = () => {
    if (tab === "trash") {
      if (trash.length && window.confirm(`Excluir definitivamente os ${trash.length} itens da lixeira?`)) emptyTrash();
    } else if (history.length && window.confirm("Limpar todo o histórico de ações?")) {
      clearHistory();
    }
  };

  return (
    <main className="campus-page overflow-y-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8 lg:px-10">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--primary)]">Segurança dos dados</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-[color:var(--on-surface)]">Lixeira e histórico universal</h2>
            <p className="mt-2 max-w-2xl text-sm text-[color:var(--on-surface-variant)]">
              Recupere conteúdos excluídos e acompanhe as ações recentes realizadas no masterStudy.
            </p>
          </div>
          <button
            className="rounded border border-red-500/30 px-4 py-2.5 text-sm font-bold text-red-600 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={tab === "trash" ? !trash.length : !history.length}
            onClick={handleClear}
            type="button"
          >
            <Icon className="mr-2 align-middle" name={tab === "trash" ? "delete_sweep" : "history_toggle_off"} />
            {tab === "trash" ? "Esvaziar lixeira" : "Limpar histórico"}
          </button>
        </header>

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-[color:var(--outline-variant)] bg-[color:var(--surface-container-lowest)] p-4">
            <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--on-surface-variant)]">Na lixeira</span>
            <strong className="mt-2 block text-3xl text-[color:var(--on-surface)]">{trash.length}</strong>
          </div>
          <div className="rounded-lg border border-[color:var(--outline-variant)] bg-[color:var(--surface-container-lowest)] p-4">
            <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--on-surface-variant)]">Ações registradas</span>
            <strong className="mt-2 block text-3xl text-[color:var(--on-surface)]">{history.length}</strong>
          </div>
          <div className="rounded-lg border border-[color:var(--outline-variant)] bg-[color:var(--surface-container-lowest)] p-4">
            <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--on-surface-variant)]">Prazo de recuperação</span>
            <strong className="mt-2 block text-3xl text-[color:var(--on-surface)]">30 dias</strong>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-[color:var(--outline-variant)] bg-[color:var(--surface-container-lowest)]">
          <div className="flex flex-col gap-3 border-b border-[color:var(--outline-variant)] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex rounded bg-[color:var(--surface-container)] p-1">
              {[['trash', 'Lixeira', 'delete'], ['history', 'Histórico', 'history']].map(([id, label, icon]) => (
                <button key={id} className={`rounded px-4 py-2 text-sm font-bold ${tab === id ? 'bg-[color:var(--surface-container-lowest)] text-[color:var(--primary)] shadow-sm' : 'text-[color:var(--on-surface-variant)]'}`} onClick={() => setTab(id)} type="button">
                  <Icon className="mr-2 align-middle text-[18px]" name={icon} />{label}
                </button>
              ))}
            </div>
            <label className="flex min-w-64 items-center gap-2 rounded border border-[color:var(--outline-variant)] bg-[color:var(--surface-container-low)] px-3 py-2">
              <Icon className="text-[18px] text-[color:var(--on-surface-variant)]" name="search" />
              <input className="w-full border-0 bg-transparent text-sm outline-none" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar itens e ações" value={query} />
            </label>
          </div>

          {!visibleItems.length ? (
            <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
              <Icon className="text-5xl text-[color:var(--outline)]" name={query ? "search_off" : tab === "trash" ? "delete_outline" : "history"} />
              <h3 className="mt-4 text-lg font-black text-[color:var(--on-surface)]">{query ? "Nenhum resultado" : tab === "trash" ? "A lixeira está vazia" : "Nenhuma ação registrada"}</h3>
              <p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">{tab === "trash" ? "Os próximos itens excluídos poderão ser restaurados aqui." : "Exclusões e restaurações aparecerão nesta linha do tempo."}</p>
            </div>
          ) : (
            <div className="divide-y divide-[color:var(--outline-variant)]">
              {visibleItems.map((item) => {
                const [typeLabel, typeIcon] = TYPE_META[item.entityType] || [item.entityType, "draft"];
                const actionMeta = ACTION_META[item.action] || ["Ação registrada", "history", "text-[color:var(--primary)]"];
                const remainingDays = Math.max(0, Math.ceil(((item.expiresAt || Date.now()) - Date.now()) / 86400000));
                return (
                  <article className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center" key={item.id}>
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-[color:var(--surface-container)] text-[color:var(--primary)]"><Icon name={tab === "trash" ? typeIcon : actionMeta[1]} /></span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-bold text-[color:var(--on-surface)]">{item.title}</h3>
                      <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">
                        <span className={tab === "history" ? actionMeta[2] : ""}>{tab === "trash" ? typeLabel : actionMeta[0]}</span>
                        <span className="mx-2">•</span>{formatDate(item.deletedAt || item.timestamp)}
                        {tab === "trash" ? <><span className="mx-2">•</span>{remainingDays} dias restantes</> : null}
                      </p>
                    </div>
                    {tab === "trash" ? (
                      <div className="flex gap-2">
                        <button className="rounded bg-[color:var(--primary)] px-3 py-2 text-xs font-bold text-white hover:opacity-90" onClick={() => restore(item.id)} type="button"><Icon className="mr-1 align-middle text-[17px]" name="restore" />Restaurar</button>
                        <button aria-label={`Excluir ${item.title} definitivamente`} className="rounded border border-red-500/30 px-3 py-2 text-red-600 hover:bg-red-500/10" onClick={() => handlePermanentDelete(item)} title="Excluir definitivamente" type="button"><Icon name="delete_forever" /></button>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
