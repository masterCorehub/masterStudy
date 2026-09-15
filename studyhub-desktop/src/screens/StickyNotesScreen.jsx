import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import { useStudyStore } from "../store/useStore";

const COLORS = [
  {
    id: "yellow",
    label: "Amarelo",
    dot: "bg-amber-300",
    card: "border-amber-300/70 bg-amber-50 dark:border-amber-700/60 dark:bg-amber-950/35",
  },
  {
    id: "rose",
    label: "Rosa",
    dot: "bg-rose-300",
    card: "border-rose-300/70 bg-rose-50 dark:border-rose-700/60 dark:bg-rose-950/35",
  },
  {
    id: "blue",
    label: "Azul",
    dot: "bg-sky-300",
    card: "border-sky-300/70 bg-sky-50 dark:border-sky-700/60 dark:bg-sky-950/35",
  },
  {
    id: "green",
    label: "Verde",
    dot: "bg-emerald-300",
    card: "border-emerald-300/70 bg-emerald-50 dark:border-emerald-700/60 dark:bg-emerald-950/35",
  },
  {
    id: "purple",
    label: "Roxo",
    dot: "bg-violet-300",
    card: "border-violet-300/70 bg-violet-50 dark:border-violet-700/60 dark:bg-violet-950/35",
  },
  {
    id: "slate",
    label: "Cinza",
    dot: "bg-slate-400",
    card: "border-slate-300/70 bg-slate-50 dark:border-slate-600/70 dark:bg-slate-800/70",
  },
];

const COLOR_BY_ID = Object.fromEntries(
  COLORS.map((color) => [color.id, color]),
);

const formatUpdatedAt = (timestamp) => {
  const date = new Date(timestamp || Date.now());
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return `Hoje, ${new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date)}`;
  }
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

function StickyCard({ note, autoFocus, onDelete }) {
  const updateNote = useStudyStore((state) => state.updateStickyNote);
  const duplicateNote = useStudyStore((state) => state.duplicateStickyNote);
  const titleRef = useRef(null);
  const contentRef = useRef(null);
  const [showColors, setShowColors] = useState(false);

  useEffect(() => {
    if (autoFocus) titleRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const textarea = contentRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.max(150, textarea.scrollHeight)}px`;
  }, [note.content]);

  const color = COLOR_BY_ID[note.color] || COLOR_BY_ID.yellow;

  const commitUpdate = (updates) => {
    updateNote(note.id, updates);
    window.studyhubDesktop?.stickyNotes?.broadcastChange?.({
      type: "updated",
      noteId: note.id,
      updates,
    });
  };

  const openDesktopNote = () => {
    window.studyhubDesktop?.stickyNotes?.open?.(note.id, {
      alwaysOnTop: Boolean(note.alwaysOnTop),
    });
  };

  return (
    <article
      className={`group relative flex min-h-[270px] break-inside-avoid flex-col rounded-lg border shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${color.card}`}
    >
      <div className="flex items-center justify-between border-b border-black/5 px-3 py-2 dark:border-white/10">
        <div className="relative">
          <button
            aria-label="Alterar cor"
            className="flex h-8 items-center gap-2 rounded px-2 text-xs font-bold text-[color:var(--on-surface-variant)] hover:bg-black/5 dark:hover:bg-white/10"
            onClick={() => setShowColors((value) => !value)}
            title="Alterar cor"
            type="button"
          >
            <span
              className={`h-3 w-3 rounded-full ring-1 ring-black/10 ${color.dot}`}
            />
            <Icon className="text-[16px]" name="expand_more" />
          </button>
          {showColors ? (
            <div className="absolute left-0 top-10 z-30 flex gap-1.5 rounded-lg border border-[color:var(--outline-variant)] bg-[color:var(--surface-container-lowest)] p-2 shadow-xl">
              {COLORS.map((option) => (
                <button
                  aria-label={option.label}
                  className={`h-7 w-7 rounded-full ${option.dot} ${note.color === option.id ? "ring-2 ring-[color:var(--primary)] ring-offset-2 ring-offset-[color:var(--surface-container-lowest)]" : "hover:scale-110"}`}
                  key={option.id}
                  onClick={() => {
                    commitUpdate({ color: option.id });
                    setShowColors(false);
                  }}
                  title={option.label}
                  type="button"
                />
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-0.5">
          <button
            aria-label="Mostrar fora do aplicativo"
            className="flex h-8 w-8 items-center justify-center rounded text-[color:var(--primary)] opacity-75 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
            onClick={openDesktopNote}
            title="Destacar na mesa do macOS"
            type="button"
          >
            <Icon className="text-[18px]" name="open_in_new" />
          </button>
          <button
            aria-label={note.pinned ? "Remover do Hoje" : "Fixar no Hoje"}
            className={`flex h-8 w-8 items-center justify-center rounded transition ${note.pinned ? "text-[color:var(--primary)]" : "text-[color:var(--on-surface-variant)] opacity-60 hover:opacity-100"}`}
            onClick={() => commitUpdate({ pinned: !note.pinned })}
            title={note.pinned ? "Remover da aba Hoje" : "Fixar na aba Hoje"}
            type="button"
          >
            <Icon className="text-[18px]" filled={note.pinned} name="keep" />
          </button>
          <button
            aria-label={note.archived ? "Desarquivar" : "Arquivar"}
            className="flex h-8 w-8 items-center justify-center rounded text-[color:var(--on-surface-variant)] opacity-60 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
            onClick={() => commitUpdate({ archived: !note.archived })}
            title={note.archived ? "Desarquivar" : "Arquivar"}
            type="button"
          >
            <Icon
              className="text-[18px]"
              name={note.archived ? "unarchive" : "archive"}
            />
          </button>
          <button
            aria-label="Duplicar nota"
            className="flex h-8 w-8 items-center justify-center rounded text-[color:var(--on-surface-variant)] opacity-60 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
            onClick={() => duplicateNote(note.id)}
            title="Duplicar"
            type="button"
          >
            <Icon className="text-[18px]" name="content_copy" />
          </button>
          <button
            aria-label="Excluir nota"
            className="flex h-8 w-8 items-center justify-center rounded text-[color:var(--on-surface-variant)] opacity-60 transition hover:bg-red-500/10 hover:text-red-600 hover:opacity-100"
            onClick={() => onDelete(note)}
            title="Mover para a lixeira"
            type="button"
          >
            <Icon className="text-[18px]" name="close" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col px-4 pb-3 pt-3">
        <input
          aria-label="Título da nota"
          className="w-full border-0 bg-transparent p-0 text-base font-black text-[color:var(--on-surface)] placeholder:text-[color:var(--on-surface-variant)]/50 focus:ring-0"
          maxLength={120}
          onChange={(event) =>
            commitUpdate({ title: event.target.value })
          }
          placeholder="Título"
          ref={titleRef}
          value={note.title}
        />
        <textarea
          aria-label="Conteúdo da nota"
          className="mt-2 min-h-[150px] w-full flex-1 resize-none overflow-hidden border-0 bg-transparent p-0 text-sm leading-6 text-[color:var(--on-surface)] placeholder:text-[color:var(--on-surface-variant)]/55 focus:ring-0"
          maxLength={10000}
          onChange={(event) =>
            commitUpdate({ content: event.target.value })
          }
          placeholder="Escreva alguma coisa…"
          ref={contentRef}
          value={note.content}
        />
        <div className="mt-3 flex items-center justify-between border-t border-black/5 pt-2 text-[10px] font-medium text-[color:var(--on-surface-variant)]/70 dark:border-white/10">
          <span>Salvo automaticamente</span>
          <span>{formatUpdatedAt(note.updatedAt)}</span>
        </div>
      </div>
    </article>
  );
}

export function StickyNotesScreen() {
  const notes = useStudyStore((state) => state.stickyNotes || []);
  const addNote = useStudyStore((state) => state.addStickyNote);
  const deleteNote = useStudyStore((state) => state.deleteStickyNote);
  const [query, setQuery] = useState("");
  const [view, setView] = useState("active");
  const [colorFilter, setColorFilter] = useState("all");
  const [lastCreatedId, setLastCreatedId] = useState(null);

  const archivedCount = notes.filter((note) => note.archived).length;
  const activeCount = notes.length - archivedCount;

  const visibleNotes = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    return [...notes]
      .filter((note) => (view === "archived" ? note.archived : !note.archived))
      .filter((note) => colorFilter === "all" || note.color === colorFilter)
      .filter(
        (note) =>
          !needle ||
          `${note.title} ${note.content}`
            .toLocaleLowerCase("pt-BR")
            .includes(needle),
      )
      .sort(
        (left, right) =>
          Number(right.pinned) - Number(left.pinned) ||
          Number(right.updatedAt) - Number(left.updatedAt),
      );
  }, [colorFilter, notes, query, view]);

  const handleAdd = () => {
    const id = addNote({
      color: colorFilter === "all" ? "yellow" : colorFilter,
    });
    setView("active");
    setQuery("");
    setLastCreatedId(id);
  };

  const handleDelete = (note) => {
    const label =
      note.title.trim() || note.content.trim().slice(0, 40) || "esta nota";
    if (window.confirm(`Mover “${label}” para a lixeira?`)) {
      deleteNote(note.id);
      window.studyhubDesktop?.stickyNotes?.broadcastChange?.({
        type: "deleted",
        noteId: note.id,
      });
    }
  };

  return (
    <main className="campus-page overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col px-5 py-7 lg:px-10">
        <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--primary)]">
              <Icon className="text-[18px]" name="sticky_note_2" filled />
              Captura rápida
            </div>
            <h2 className="text-3xl font-black tracking-tight text-[color:var(--on-surface)]">
              Sticky Notes
            </h2>
            <p className="mt-2 text-sm text-[color:var(--on-surface-variant)]">
              Post-its para ideias, lembretes e informações que precisam ficar à
              vista.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="flex min-w-[280px] items-center gap-2 rounded-lg border border-[color:var(--outline-variant)] bg-[color:var(--surface-container-lowest)] px-3 py-2.5 shadow-sm focus-within:border-[color:var(--primary)]">
              <Icon
                className="text-[19px] text-[color:var(--on-surface-variant)]"
                name="search"
              />
              <input
                className="w-full border-0 bg-transparent p-0 text-sm text-[color:var(--on-surface)] placeholder:text-[color:var(--on-surface-variant)] focus:ring-0"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar nos post-its"
                type="search"
                value={query}
              />
              {query ? (
                <button
                  aria-label="Limpar busca"
                  onClick={() => setQuery("")}
                  type="button"
                >
                  <Icon className="text-[17px]" name="close" />
                </button>
              ) : null}
            </label>
            <button
              className="flex items-center justify-center gap-2 rounded-lg bg-[color:var(--primary)] px-5 py-2.5 text-sm font-bold text-[color:var(--on-primary)] shadow-sm transition hover:opacity-90"
              onClick={handleAdd}
              type="button"
            >
              <Icon className="text-[19px]" name="add" />
              Novo post-it
            </button>
          </div>
        </header>

        <section className="mt-7 flex flex-col gap-3 border-b border-[color:var(--outline-variant)] pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-1 rounded-lg bg-[color:var(--surface-container-low)] p-1">
            <button
              className={`rounded-md px-4 py-2 text-xs font-bold transition ${view === "active" ? "bg-[color:var(--surface-container-lowest)] text-[color:var(--primary)] shadow-sm" : "text-[color:var(--on-surface-variant)]"}`}
              onClick={() => setView("active")}
              type="button"
            >
              Notas <span className="ml-1 opacity-60">{activeCount}</span>
            </button>
            <button
              className={`rounded-md px-4 py-2 text-xs font-bold transition ${view === "archived" ? "bg-[color:var(--surface-container-lowest)] text-[color:var(--primary)] shadow-sm" : "text-[color:var(--on-surface-variant)]"}`}
              onClick={() => setView("archived")}
              type="button"
            >
              Arquivadas{" "}
              <span className="ml-1 opacity-60">{archivedCount}</span>
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-bold text-[color:var(--on-surface-variant)]">
              Cor:
            </span>
            <button
              className={`rounded-full border px-3 py-1.5 text-xs font-bold ${colorFilter === "all" ? "border-[color:var(--primary)] bg-[color:var(--primary)] text-[color:var(--on-primary)]" : "border-[color:var(--outline-variant)] text-[color:var(--on-surface-variant)]"}`}
              onClick={() => setColorFilter("all")}
              type="button"
            >
              Todas
            </button>
            {COLORS.map((color) => (
              <button
                aria-label={`Filtrar por ${color.label}`}
                className={`h-7 w-7 rounded-full ${color.dot} ${colorFilter === color.id ? "ring-2 ring-[color:var(--primary)] ring-offset-2 ring-offset-[color:var(--surface)]" : "opacity-75 hover:opacity-100"}`}
                key={color.id}
                onClick={() => setColorFilter(color.id)}
                title={color.label}
                type="button"
              />
            ))}
          </div>
        </section>

        {!visibleNotes.length ? (
          <section className="flex min-h-[430px] flex-col items-center justify-center text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[color:var(--surface-container)] text-[color:var(--primary)]">
              <Icon
                className="text-4xl"
                name={
                  query
                    ? "search_off"
                    : view === "archived"
                      ? "archive"
                      : "sticky_note_2"
                }
              />
            </div>
            <h3 className="mt-5 text-xl font-black text-[color:var(--on-surface)]">
              {query
                ? "Nenhum post-it encontrado"
                : view === "archived"
                  ? "Nada arquivado"
                  : "Seu mural está vazio"}
            </h3>
            <p className="mt-2 max-w-sm text-sm leading-6 text-[color:var(--on-surface-variant)]">
              {query
                ? "Tente buscar por outra palavra ou remover o filtro de cor."
                : view === "archived"
                  ? "As notas que você arquivar ficarão organizadas aqui."
                  : "Crie um post-it para registrar algo sem interromper o que está fazendo."}
            </p>
            {!query && view === "active" ? (
              <button
                className="mt-5 rounded-lg bg-[color:var(--primary)] px-5 py-2.5 text-sm font-bold text-[color:var(--on-primary)]"
                onClick={handleAdd}
                type="button"
              >
                Criar primeiro post-it
              </button>
            ) : null}
          </section>
        ) : (
          <section className="mt-6 columns-1 gap-4 sm:columns-2 xl:columns-3 2xl:columns-4">
            {visibleNotes.map((note) => (
              <div className="mb-4" key={note.id}>
                <StickyCard
                  autoFocus={note.id === lastCreatedId}
                  note={note}
                  onDelete={handleDelete}
                />
              </div>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
