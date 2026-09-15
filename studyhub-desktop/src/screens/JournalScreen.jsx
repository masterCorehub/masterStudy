import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import { askWithWebLLM, isWebLlmAvailable } from "../services/webllm";
import { useStudyStore } from "../store/useStore";
import { getLocalDateKey } from "../utils/dateUtils";
import { getLocalFileUrl } from "../utils/localFileUrl";
import { markdownToNoteHtml } from "../domain/aiStudio";
import { sanitizeGeneratedHtml } from "../utils/sanitizeHtml";
import {
  collaborationCloud,
  collaborationCloudConfigured,
} from "../services/collaboration-cloud";
import {
  CONSUMED_CONTENT_TYPES,
  JOURNAL_ACCENTS,
  JOURNAL_ENTRY_TYPES,
  JOURNAL_MOODS,
  createJournalDraft,
  filterJournalEntries,
  getDailyJournalPrompt,
  getJournalMonthGrid,
  getJournalStats,
  journalWordCount,
  normalizeConsumedContent,
  normalizeImportantQuote,
} from "../domain/journal";

const WEEK_DAYS = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];

const moodById = new Map(JOURNAL_MOODS.map((mood) => [mood.id, mood]));
const typeById = new Map(JOURNAL_ENTRY_TYPES.map((type) => [type.id, type]));
const accentById = new Map(JOURNAL_ACCENTS.map((accent) => [accent.id, accent]));

const renderSafeMarkdown = (content = "") =>
  sanitizeGeneratedHtml(markdownToNoteHtml(content));

const formatDateLong = (dateKey) =>
  new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${dateKey}T12:00:00`));

const formatMonth = (monthKey) =>
  new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
    new Date(`${monthKey}-01T12:00:00`),
  );

const formatEntryTime = (timestamp) =>
  new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp || Date.now()));

const paddedGratitudes = (items = []) =>
  Array.from({ length: 3 }, (_, index) => String(items[index] || ""));

const editableEntry = (entry, fallbackDate = getLocalDateKey()) => {
  const source = entry || createJournalDraft(fallbackDate);
  return {
    entryDate: source.entryDate || fallbackDate,
    title: source.title || "",
    content: source.content || "",
    mood: source.mood || "neutral",
    energy: Number(source.energy || 3),
    sleepHours: Number(source.sleepHours ?? 7),
    type: source.type || "reflection",
    gratitudes: paddedGratitudes(source.gratitudes),
    highlight: source.highlight || "",
    intention: source.intention || "",
    prompt: source.prompt || "",
    tags: Array.isArray(source.tags) ? source.tags : [],
    favorite: Boolean(source.favorite),
    accent: source.accent || "rose",
    photos: Array.isArray(source.photos) ? source.photos.map((photo) => ({ ...photo })) : [],
    coverPhotoId: source.coverPhotoId || source.photos?.[0]?.id || null,
  };
};

const draftSnapshot = (draft) =>
  JSON.stringify({
    ...draft,
    tags: [...(draft.tags || [])],
    gratitudes: paddedGratitudes(draft.gratitudes),
    photos: (draft.photos || []).map((photo) => ({ ...photo })),
  });

const shiftMonth = (monthKey, amount) => {
  const date = new Date(`${monthKey}-01T12:00:00`);
  date.setMonth(date.getMonth() + amount);
  return getLocalDateKey(date).slice(0, 7);
};

const JOURNAL_PHOTO_LIMIT = 12;
const JOURNAL_PHOTO_MAX_BYTES = 15 * 1024 * 1024;
const PHOTO_MIME_BY_EXTENSION = {
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const photoMimeType = (name, fallback = "") => {
  if (String(fallback).startsWith("image/")) return fallback;
  return PHOTO_MIME_BY_EXTENSION[String(name || "").split(".").pop()?.toLowerCase()] || "";
};

const createPhotoId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? `journal-photo-${crypto.randomUUID()}`
    : `journal-photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const photoSource = (photo, signedUrls) => {
  if (signedUrls[photo?.id]) return signedUrls[photo.id];
  return photo?.localPath ? getLocalFileUrl(photo.localPath) : "";
};

function MiniCalendar({ month, entries, selectedDate, onMonthChange, onSelectDate }) {
  const days = useMemo(() => getJournalMonthGrid(month, entries), [entries, month]);

  return (
    <section className="journal-panel p-4" aria-label="Calendário do diário">
      <div className="mb-4 flex items-center justify-between">
        <button
          className="journal-icon-button"
          type="button"
          aria-label="Mês anterior"
          onClick={() => onMonthChange(shiftMonth(month, -1))}
        >
          <Icon name="chevron_left" />
        </button>
        <h2 className="text-sm font-bold capitalize text-[color:var(--journal-ink)]">
          {formatMonth(month)}
        </h2>
        <button
          className="journal-icon-button"
          type="button"
          aria-label="Próximo mês"
          onClick={() => onMonthChange(shiftMonth(month, 1))}
        >
          <Icon name="chevron_right" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {WEEK_DAYS.map((day) => (
          <span
            key={day}
            className="py-1 text-[9px] font-bold tracking-[0.08em] text-[color:var(--journal-muted)]"
          >
            {day}
          </span>
        ))}
        {days.map((day) => (
          <button
            key={day.dateKey}
            type="button"
            title={day.count ? `${day.count} entrada(s)` : "Criar entrada"}
            onClick={() => onSelectDate(day.dateKey)}
            className={`journal-calendar-day ${
              selectedDate === day.dateKey ? "is-selected" : ""
            } ${day.isToday ? "is-today" : ""} ${
              day.currentMonth ? "" : "is-outside"
            }`}
          >
            <span>{day.day}</span>
            {day.count ? (
              <span
                className="journal-calendar-dot"
                style={{ backgroundColor: moodById.get(day.moods[0])?.color }}
              />
            ) : null}
          </button>
        ))}
      </div>
    </section>
  );
}

function EntryHistory({ entries, activeId, onOpen }) {
  if (!entries.length) {
    return (
      <div className="journal-empty-history">
        <Icon name="history_edu" className="text-3xl" />
        <strong>Nenhuma entrada encontrada</strong>
        <span>Experimente outro filtro ou registre um novo momento.</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((entry) => {
        const mood = moodById.get(entry.mood) || JOURNAL_MOODS[2];
        const type = typeById.get(entry.type) || JOURNAL_ENTRY_TYPES[0];
        return (
          <button
            key={entry.id}
            type="button"
            onClick={() => onOpen(entry.id)}
            className={`journal-history-entry ${activeId === entry.id ? "is-active" : ""}`}
          >
            <span
              className="journal-history-accent"
              style={{ backgroundColor: accentById.get(entry.accent)?.color }}
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-bold text-[color:var(--journal-ink)]">
                  {entry.title || "Entrada sem título"}
                </span>
                <span className="shrink-0 text-base" aria-label={mood.label}>
                  {mood.emoji}
                </span>
              </span>
              <span className="mt-1 line-clamp-2 text-xs leading-5 text-[color:var(--journal-muted)]">
                {entry.content || entry.highlight || "Um espaço esperando suas palavras."}
              </span>
              <span className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold text-[color:var(--journal-muted)]">
                <Icon name={type.icon} className="text-[13px]" />
                {new Intl.DateTimeFormat("pt-BR", {
                  day: "2-digit",
                  month: "short",
                }).format(new Date(`${entry.entryDate}T12:00:00`))}
                <span>•</span>
                {formatEntryTime(entry.updatedAt)}
                {entry.photos?.length ? <><span>•</span><Icon name="photo" className="text-[13px]" />{entry.photos.length}</> : null}
                {entry.favorite ? <Icon name="favorite" filled className="ml-auto text-[13px] text-[color:var(--journal-accent)]" /> : null}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ImportantQuotesView({ quotes, onAddQuote, onRemoveQuote, onClose }) {
  const [input, setInput] = useState("");
  const [copiedId, setCopiedId] = useState(null);

  const handleAdd = (e) => {
    e?.preventDefault();
    if (!input.trim()) return;
    onAddQuote(input.trim());
    setInput("");
  };

  const handleCopy = (id, text) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <section className="journal-editor-scroll flex-1 p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[color:var(--journal-line)] pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Icon name="star" filled className="text-amber-500 text-2xl" />
              <h2 className="text-2xl font-black text-[color:var(--journal-ink)]">FRASES IMPORTANTES ⭐</h2>
            </div>
            <p className="mt-1 text-xs text-[color:var(--journal-muted)]">
              Sua lista exclusiva de frases marcantes salvas. Total: <strong>{quotes.length} frase(s)</strong>.
            </p>
          </div>
          <button
            type="button"
            className="journal-outline-button text-xs py-2 px-3.5 flex items-center gap-1.5 font-bold"
            onClick={onClose}
          >
            <Icon name="arrow_back" /> Voltar ao Diário
          </button>
        </div>

        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            type="text"
            className="journal-filter-select flex-1 text-xs py-2 px-3"
            placeholder="Cole ou digite uma frase importante para guardar na lista..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button
            type="submit"
            className="journal-primary-button text-xs py-2 px-4 shrink-0 font-bold"
          >
            <Icon name="add" /> Adicionar Frase
          </button>
        </form>

        {!quotes.length ? (
          <div className="rounded-3xl border border-dashed border-[color:var(--journal-line)] bg-[color:var(--journal-canvas)]/40 p-12 text-center">
            <Icon name="star" filled className="mx-auto text-4xl text-amber-400 opacity-60" />
            <h3 className="mt-3 text-base font-bold text-[color:var(--journal-ink)]">Nenhuma frase salva na lista</h3>
            <p className="mt-1 text-xs text-[color:var(--journal-muted)] max-w-md mx-auto">
              No seu diário, selecione qualquer trecho com o mouse e clique em "Salvar em Frases Importantes" para copiar para cá!
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
            {quotes.map((quote) => (
              <div
                key={quote.id}
                className="journal-panel relative flex flex-col justify-between gap-4 p-5 shadow-sm transition-all hover:shadow-md border border-amber-400/35 bg-amber-500/10 rounded-2xl"
              >
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <Icon name="star" filled className="shrink-0 text-amber-500 text-base mt-0.5" />
                  <p className="text-sm font-semibold italic leading-relaxed text-[color:var(--journal-ink)] whitespace-pre-wrap break-words">
                    "{quote.text}"
                  </p>
                </div>
                <div className="flex items-center justify-between border-t border-amber-500/15 pt-3 text-xs">
                  <button
                    type="button"
                    className="text-amber-600 dark:text-amber-400 font-bold hover:underline flex items-center gap-1"
                    onClick={() => handleCopy(quote.id, quote.text)}
                  >
                    <Icon name={copiedId === quote.id ? "check" : "content_copy"} className="text-xs" />
                    {copiedId === quote.id ? "Copiado!" : "Copiar"}
                  </button>
                  <button
                    type="button"
                    className="journal-icon-button is-danger p-1 shrink-0"
                    title="Remover da lista de frases importantes"
                    onClick={() => onRemoveQuote(quote.id)}
                  >
                    <Icon name="close" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function MoodSelector({ value, onChange }) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {JOURNAL_MOODS.map((mood) => (
        <button
          key={mood.id}
          type="button"
          title={mood.label}
          aria-label={mood.label}
          aria-pressed={value === mood.id}
          onClick={() => onChange(mood.id)}
          className={`journal-mood-button ${value === mood.id ? "is-selected" : ""}`}
        >
          <span className="text-xl">{mood.emoji}</span>
          <span>{mood.label}</span>
        </button>
      ))}
    </div>
  );
}

function JournalPhotoCard({
  photo,
  source,
  featured,
  index,
  total,
  onOpen,
  onCaptionChange,
  onSetFeatured,
  onMove,
  onRemove,
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [source]);

  return (
    <article className={`journal-photo-card ${featured ? "is-featured" : ""}`}>
      <button
        type="button"
        className="journal-photo-preview"
        onClick={onOpen}
        aria-label={`Ampliar ${photo.name}`}
      >
        {source && !failed ? (
          <img src={source} alt={photo.caption || photo.name || "Foto do diário"} onError={() => setFailed(true)} />
        ) : (
          <span className="journal-photo-unavailable">
            <Icon name={photo.cloudObjectPath ? "cloud_off" : "image_not_supported"} />
            <small>{photo.cloudObjectPath ? "Carregando foto..." : "Foto disponível no dispositivo original"}</small>
          </span>
        )}
        {featured ? <span className="journal-photo-cover-label"><Icon name="star" filled /> Destaque</span> : null}
      </button>
      <div className="journal-photo-actions">
        <button type="button" onClick={onSetFeatured} title="Usar como foto de destaque" aria-label="Usar como foto de destaque"><Icon name="star" filled={featured} /></button>
        <button type="button" onClick={() => onMove(-1)} disabled={index === 0} title="Mover para trás" aria-label="Mover foto para trás"><Icon name="chevron_left" /></button>
        <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} title="Mover para frente" aria-label="Mover foto para frente"><Icon name="chevron_right" /></button>
        <button type="button" className="is-danger" onClick={onRemove} title="Remover foto" aria-label="Remover foto"><Icon name="delete" /></button>
      </div>
      <label className="journal-photo-caption">
        <Icon name="edit" />
        <input
          value={photo.caption || ""}
          maxLength={240}
          onChange={(event) => onCaptionChange(event.target.value)}
          placeholder="Escreva uma lembrança sobre esta foto..."
          aria-label={`Legenda de ${photo.name}`}
        />
      </label>
    </article>
  );
}

function JournalPhotoGallery({
  photos,
  coverPhotoId,
  signedUrls,
  uploading,
  message,
  onAdd,
  onOpen,
  onCaptionChange,
  onSetFeatured,
  onMove,
  onRemove,
}) {
  return (
    <section className="journal-reflection-section journal-photo-section">
      <div className="journal-section-title">
        <span><Icon name="photo_library" /> Fotos e lembranças</span>
        <span>{photos.length}/{JOURNAL_PHOTO_LIMIT}</span>
      </div>
      {photos.length ? (
        <div className="journal-photo-grid">
          {photos.map((photo, index) => (
            <JournalPhotoCard
              key={photo.id}
              photo={photo}
              source={photoSource(photo, signedUrls)}
              featured={photo.id === coverPhotoId}
              index={index}
              total={photos.length}
              onOpen={() => onOpen(photo.id)}
              onCaptionChange={(caption) => onCaptionChange(photo.id, caption)}
              onSetFeatured={() => onSetFeatured(photo.id)}
              onMove={(direction) => onMove(photo.id, direction)}
              onRemove={() => onRemove(photo.id)}
            />
          ))}
        </div>
      ) : (
        <button type="button" className="journal-photo-empty" onClick={onAdd} disabled={uploading}>
          <span><Icon name="add_photo_alternate" /></span>
          <strong>Guarde este momento com fotos</strong>
          <small>Adicione até {JOURNAL_PHOTO_LIMIT} imagens e escreva uma legenda para cada lembrança.</small>
        </button>
      )}
      <div className="journal-photo-toolbar">
        {photos.length ? (
          <button type="button" className="journal-soft-button" onClick={onAdd} disabled={uploading || photos.length >= JOURNAL_PHOTO_LIMIT}>
            <Icon name={uploading ? "progress_activity" : "add_photo_alternate"} className={uploading ? "animate-spin" : ""} />
            {uploading ? "Adicionando..." : "Adicionar fotos"}
          </button>
        ) : null}
        <span>JPG, PNG, WEBP ou GIF · até 15 MB por foto</span>
      </div>
      {message ? <p className={`journal-photo-message ${message.type === "error" ? "is-error" : ""}`}><Icon name={message.type === "error" ? "error" : "info"} /> {message.text}</p> : null}
    </section>
  );
}

function JournalPhotoLightbox({ photos, activeId, signedUrls, onClose, onChange }) {
  const index = photos.findIndex((photo) => photo.id === activeId);
  const photo = index >= 0 ? photos[index] : null;
  const source = photoSource(photo, signedUrls);

  useEffect(() => {
    if (!photo) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && photos.length > 1) {
        onChange(photos[(index - 1 + photos.length) % photos.length].id);
      }
      if (event.key === "ArrowRight" && photos.length > 1) {
        onChange(photos[(index + 1) % photos.length].id);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [index, onChange, onClose, photo, photos]);

  if (!photo) return null;
  const previous = photos[(index - 1 + photos.length) % photos.length];
  const next = photos[(index + 1) % photos.length];

  return (
    <div className="journal-lightbox" role="dialog" aria-modal="true" aria-label="Visualização da foto" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <button type="button" className="journal-lightbox-close" onClick={onClose} aria-label="Fechar"><Icon name="close" /></button>
      {photos.length > 1 ? <button type="button" className="journal-lightbox-nav is-previous" onClick={() => onChange(previous.id)} aria-label="Foto anterior"><Icon name="chevron_left" /></button> : null}
      <figure>
        {source ? <img src={source} alt={photo.caption || photo.name} /> : <div className="journal-lightbox-missing"><Icon name="broken_image" /><span>Não foi possível carregar esta foto.</span></div>}
        <figcaption>
          <strong>{photo.caption || "Uma lembrança deste dia"}</strong>
          <span>{index + 1} de {photos.length} · {photo.name}</span>
        </figcaption>
      </figure>
      {photos.length > 1 ? <button type="button" className="journal-lightbox-nav is-next" onClick={() => onChange(next.id)} aria-label="Próxima foto"><Icon name="chevron_right" /></button> : null}
    </div>
  );
}

function JournalInsights({ entries, stats, prompt, onUsePrompt, onNextPrompt }) {
  const monthKey = getLocalDateKey().slice(0, 7);
  const monthEntries = entries.filter((entry) => entry.entryDate.startsWith(monthKey));
  const moodCounts = JOURNAL_MOODS.map((mood) => ({
    ...mood,
    count: monthEntries.filter((entry) => entry.mood === mood.id).length,
  }));
  const moodMaximum = Math.max(1, ...moodCounts.map((mood) => mood.count));

  return (
    <aside className="journal-insights space-y-4">
      <section className="journal-panel journal-prompt-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <span className="journal-eyebrow">Pergunta do dia</span>
          <button className="journal-icon-button" type="button" onClick={onNextPrompt} title="Outra pergunta">
            <Icon name="refresh" />
          </button>
        </div>
        <Icon name="format_quote" className="mb-2 text-3xl text-[color:var(--journal-accent)]" />
        <p className="font-serif text-lg leading-7 text-[color:var(--journal-ink)]">{prompt}</p>
        <button type="button" className="journal-soft-button mt-5 w-full" onClick={onUsePrompt}>
          <Icon name="edit" className="text-[17px]" />
          Escrever sobre isso
        </button>
      </section>

      <section className="journal-panel p-5">
        <span className="journal-eyebrow">Seu ritmo</span>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="journal-stat-tile">
            <Icon name="local_fire_department" />
            <strong>{stats.currentStreak}</strong>
            <span>dias seguidos</span>
          </div>
          <div className="journal-stat-tile">
            <Icon name="calendar_month" />
            <strong>{stats.entriesThisMonth}</strong>
            <span>este mês</span>
          </div>
          <div className="journal-stat-tile">
            <Icon name="menu_book" />
            <strong>{stats.totalEntries}</strong>
            <span>entradas</span>
          </div>
          <div className="journal-stat-tile">
            <Icon name="notes" />
            <strong>{stats.totalWords.toLocaleString("pt-BR")}</strong>
            <span>palavras</span>
          </div>
        </div>
        {stats.longestStreak > 0 ? (
          <p className="mt-4 flex items-center gap-2 text-xs text-[color:var(--journal-muted)]">
            <Icon name="emoji_events" className="text-[16px]" />
            Maior sequência: <strong>{stats.longestStreak} dias</strong>
          </p>
        ) : null}
      </section>

      <section className="journal-panel p-5">
        <span className="journal-eyebrow">Mapa emocional do mês</span>
        <div className="mt-4 space-y-3">
          {moodCounts.map((mood) => (
            <div key={mood.id} className="grid grid-cols-[24px_1fr_18px] items-center gap-2 text-xs">
              <span>{mood.emoji}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-[color:var(--journal-line)]">
                <span
                  className="block h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${(mood.count / moodMaximum) * 100}%`, backgroundColor: mood.color }}
                />
              </span>
              <strong className="text-right text-[color:var(--journal-muted)]">{mood.count}</strong>
            </div>
          ))}
        </div>
      </section>

      <div className="flex items-center justify-center gap-2 px-3 text-center text-[11px] leading-5 text-[color:var(--journal-muted)]">
        <Icon name="lock" className="text-[15px]" />
        Seu diário é separado das notas e sincronizado somente com a sua conta.
      </div>
    </aside>
  );
}

export function JournalScreen() {
  const entries = useStudyStore((state) => state.journalEntries || []);
  const settings = useStudyStore((state) => state.journalSettings || {});
  const activeJournalEntryId = useStudyStore((state) => state.activeJournalEntryId);
  const addJournalEntry = useStudyStore((state) => state.addJournalEntry);
  const updateJournalEntry = useStudyStore((state) => state.updateJournalEntry);
  const deleteJournalEntry = useStudyStore((state) => state.deleteJournalEntry);
  const setActiveJournalEntry = useStudyStore((state) => state.setActiveJournalEntry);
  const updateJournalSettings = useStudyStore((state) => state.updateJournalSettings);
  const globalImportantQuotes = useStudyStore((state) => state.importantQuotes || []);
  const addImportantQuote = useStudyStore((state) => state.addImportantQuote);
  const removeImportantQuote = useStudyStore((state) => state.removeImportantQuote);

  const today = getLocalDateKey();
  const initialEntry =
    entries.find((entry) => entry.entryDate === today) || null;
  const initialDraft = editableEntry(initialEntry, today);
  const [editingId, setEditingId] = useState(initialEntry?.id || null);
  const [draft, setDraft] = useState(initialDraft);
  const [savedSnapshot, setSavedSnapshot] = useState(() => draftSnapshot(initialDraft));
  const [selectedDate, setSelectedDate] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [query, setQuery] = useState("");
  const [moodFilter, setMoodFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [showImportantQuotesModal, setShowImportantQuotesModal] = useState(false);

  const allQuotesList = useMemo(() => {
    const list = [...globalImportantQuotes];
    const seenTexts = new Set(list.map((q) => q.text.trim()));
    (entries || []).forEach((e) => {
      (e.importantQuotes || []).forEach((q) => {
        if (q.text?.trim() && !seenTexts.has(q.text.trim())) {
          seenTexts.add(q.text.trim());
          list.push({ id: q.id, text: q.text.trim() });
        }
      });
    });
    return list;
  }, [globalImportantQuotes, entries]);
  const [tagInput, setTagInput] = useState("");
  const [promptOffset, setPromptOffset] = useState(0);
  const [saveFeedback, setSaveFeedback] = useState("");
  const [sendingToApple, setSendingToApple] = useState(false);
  const [signedPhotoUrls, setSignedPhotoUrls] = useState({});
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [photoMessage, setPhotoMessage] = useState(null);
  const [lightboxPhotoId, setLightboxPhotoId] = useState(null);
  const [journalLocked, setJournalLocked] = useState(true);
  const [accountEmail, setAccountEmail] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [unlockingJournal, setUnlockingJournal] = useState(false);
  const [showJournalAi, setShowJournalAi] = useState(false);
  const [journalAiResponse, setJournalAiResponse] = useState("");
  const [journalAiError, setJournalAiError] = useState("");
  const [journalAiBusy, setJournalAiBusy] = useState(false);
  const [journalAiProgress, setJournalAiProgress] = useState("");
  const [journalAiConversation, setJournalAiConversation] = useState([]);
  const [journalAiReply, setJournalAiReply] = useState("");
  const [inlineAiBusy, setInlineAiBusy] = useState(false);
  const [inlineAiSuggestions, setInlineAiSuggestions] = useState([]);
  const [inlineAiCategory, setInlineAiCategory] = useState("continue");
  const [inlineAiCache, setInlineAiCache] = useState({});
  const [inlineAiError, setInlineAiError] = useState("");
  const feedbackTimer = useRef(null);
  const autoSaveTimer = useRef(null);
  const photoInputRef = useRef(null);

  const dirty = draftSnapshot(draft) !== savedSnapshot;
  const filteredEntries = useMemo(
    () =>
      filterJournalEntries(entries, {
        query,
        mood: moodFilter,
        type: typeFilter,
        favorite: favoritesOnly,
      }),
    [entries, favoritesOnly, moodFilter, query, typeFilter],
  );
  const stats = useMemo(() => getJournalStats(entries), [entries]);
  const prompt = useMemo(
    () => getDailyJournalPrompt(selectedDate || today, promptOffset),
    [promptOffset, selectedDate, today],
  );
  const wordCount = journalWordCount(draft.content);
  const selectedAccent = accentById.get(draft.accent) || JOURNAL_ACCENTS[0];
  const remotePhotoKey = useMemo(
    () => (draft.photos || []).map((photo) => `${photo.id}:${photo.cloudObjectPath}`).join("|"),
    [draft.photos],
  );

  useEffect(() => {
    const remotePhotos = (draft.photos || []).filter((photo) => photo.cloudObjectPath);
    if (!remotePhotos.length || !collaborationCloudConfigured) {
      setSignedPhotoUrls({});
      return undefined;
    }
    let active = true;
    Promise.all(
      remotePhotos.map(async (photo) => {
        try {
          const url = await collaborationCloud.createSignedFileUrl(photo.cloudObjectPath);
          return [photo.id, url];
        } catch {
          return [photo.id, ""];
        }
      }),
    ).then((resolved) => {
      if (active) setSignedPhotoUrls(Object.fromEntries(resolved));
    });
    return () => {
      active = false;
    };
  }, [remotePhotoKey]);

  useEffect(() => {
    if (!editingId || dirty) return;
    const current = entries.find((entry) => entry.id === editingId);
    if (!current) return;
    const nextDraft = editableEntry(current, today);
    const nextSnapshot = draftSnapshot(nextDraft);
    if (nextSnapshot !== savedSnapshot) {
      setDraft(nextDraft);
      setSavedSnapshot(nextSnapshot);
    }
  }, [dirty, editingId, entries, savedSnapshot, today]);

  const extractSummaryFromConversation = (conversation = []) => {
    const assistantMsgs = (conversation || []).filter((m) => m?.role === "assistant" && m.content?.trim());
    if (!assistantMsgs.length) return "";
    if (assistantMsgs.length === 1) return assistantMsgs[0].content.trim();
    return assistantMsgs.map((m) => m.content.trim()).join("\n\n---\n\n");
  };

  useEffect(() => {
    setShowJournalAi(false);
    setJournalAiResponse("");
    setJournalAiConversation(draft.aiReflections || []);
    setJournalAiReply("");
    setJournalAiError("");
  }, [editingId]);

  const handleOpenJournalAi = () => {
    setJournalAiError("");
    setShowJournalAi(true);
    if (draft.aiReflections?.length) {
      setJournalAiConversation(draft.aiReflections);
      const lastAssistant = [...draft.aiReflections].reverse().find((m) => m.role === "assistant");
      if (lastAssistant) setJournalAiResponse(lastAssistant.content);
    } else {
      setJournalAiConversation([]);
      setJournalAiResponse("");
      setJournalAiReply("");
      askJournalAi("");
    }
  };

  useEffect(() => {
    if (!dirty) return undefined;
    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  useEffect(() => () => window.clearTimeout(feedbackTimer.current), []);

  const removeRemotePhoto = async (photo) => {
    if (!photo?.cloudObjectPath || !collaborationCloudConfigured) return;
    try {
      await collaborationCloud.removeAccountFile({
        objectPath: photo.cloudObjectPath,
        fileObjectId: photo.cloudFileObjectId,
      });
    } catch (error) {
      setPhotoMessage({
        type: "error",
        text: error.message || "A foto foi removida da entrada, mas não do armazenamento remoto.",
      });
    }
  };

  const cleanupPendingPhotos = () => {
    const stored = editingId
      ? entries.find((entry) => entry.id === editingId)?.photos || []
      : [];
    const storedIds = new Set(stored.map((photo) => photo.id));
    (draft.photos || [])
      .filter((photo) => !storedIds.has(photo.id))
      .forEach((photo) => void removeRemotePhoto(photo));
  };

  const handleRemoveImportantQuoteFromEntry = (entryId, quoteId) => {
    const targetEntry = entries.find((e) => e.id === entryId);
    if (!targetEntry) return;
    const updatedQuotes = (targetEntry.importantQuotes || []).filter((q) => q.id !== quoteId);
    updateJournalEntry(entryId, { ...targetEntry, importantQuotes: updatedQuotes });
    if (editingId === entryId) {
      updateDraft({ importantQuotes: updatedQuotes });
    }
  };

  const canDiscardDraft = () => {
    if (!dirty) return true;
    const confirmed = window.confirm("Descartar as alterações não salvas desta entrada?");
    if (confirmed) cleanupPendingPhotos();
    return confirmed;
  };

  const openEntry = (entryId) => {
    if (entryId === editingId) return;
    if (!canDiscardDraft()) return;
    const entry = entries.find((item) => item.id === entryId);
    if (!entry) return;
    const nextDraft = editableEntry(entry, today);
    setEditingId(entry.id);
    setDraft(nextDraft);
    setSavedSnapshot(draftSnapshot(nextDraft));
    setSelectedDate(entry.entryDate);
    setMonth(entry.entryDate.slice(0, 7));
    setTagInput("");
    setPhotoMessage(null);
    setLightboxPhotoId(null);
    setActiveJournalEntry(entry.id);
  };

  const startNewEntry = (entryDate = selectedDate || today, type = settings.defaultEntryType) => {
    if (!canDiscardDraft()) return;
    const nextDraft = editableEntry(
      createJournalDraft(entryDate, { type: type || "reflection" }),
      entryDate,
    );
    setEditingId(null);
    setDraft(nextDraft);
    setSavedSnapshot(draftSnapshot(nextDraft));
    setSelectedDate(entryDate);
    setMonth(entryDate.slice(0, 7));
    setTagInput("");
    setPhotoMessage(null);
    setLightboxPhotoId(null);
    setActiveJournalEntry(null);
  };

  const handleSelectDate = (dateKey) => {
    const entry = entries
      .filter((item) => item.entryDate === dateKey)
      .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0))[0];
    if (entry) openEntry(entry.id);
    else startNewEntry(dateKey);
  };

  const updateDraft = (updates) => {
    setSaveFeedback("");
    setDraft((current) => ({ ...current, ...updates }));
  };

  const handleSave = (options = {}) => {
    const isAutoSave = Boolean(options?.isAutoSave);
    const normalizedTitle = draft.title.trim() || `Entrada de ${new Intl.DateTimeFormat("pt-BR", {
      day: "numeric",
      month: "long",
    }).format(new Date(`${draft.entryDate}T12:00:00`))}`;
    const payload = {
      ...draft,
      title: normalizedTitle,
      content: draft.content.trimEnd(),
      tags: [...new Set((draft.tags || []).map((tag) => tag.trim()).filter(Boolean))],
      gratitudes: paddedGratitudes(draft.gratitudes).map((item) => item.trim()),
      importantQuotes: (draft.importantQuotes || []).map(normalizeImportantQuote).filter((q) => q.text.trim()),
      photos: (draft.photos || []).map((photo) => ({ ...photo })),
      coverPhotoId: (draft.photos || []).some((photo) => photo.id === draft.coverPhotoId)
        ? draft.coverPhotoId
        : draft.photos?.[0]?.id || null,
    };
    const previousPhotos = editingId
      ? entries.find((entry) => entry.id === editingId)?.photos || []
      : [];
    const retainedPhotoIds = new Set(payload.photos.map((photo) => photo.id));
    const removedPhotos = previousPhotos.filter((photo) => !retainedPhotoIds.has(photo.id));
    let nextId = editingId;
    if (editingId) updateJournalEntry(editingId, payload);
    else nextId = addJournalEntry(payload);
    setEditingId(nextId);
    setActiveJournalEntry(nextId);
    setDraft(payload);
    setSavedSnapshot(draftSnapshot(payload));
    const nowTime = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date());
    setSaveFeedback(isAutoSave ? `Salvo automaticamente às ${nowTime}` : "Salvo agora");
    removedPhotos.forEach((photo) => void removeRemotePhoto(photo));
    window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => setSaveFeedback(""), 3000);
  };

  useEffect(() => {
    if (!dirty) return undefined;
    autoSaveTimer.current = window.setTimeout(() => {
      handleSave({ isAutoSave: true });
    }, 1500);
    return () => {
      window.clearTimeout(autoSaveTimer.current);
    };
  }, [dirty, draft]);

  const handleSaveQuoteFromSelection = () => {
    let selection = "";
    const textarea = document.querySelector(".journal-writing-area");
    if (
      textarea &&
      typeof textarea.selectionStart === "number" &&
      typeof textarea.selectionEnd === "number" &&
      textarea.selectionEnd > textarea.selectionStart
    ) {
      selection = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd).trim();
    }
    if (!selection) {
      selection = window.getSelection()?.toString()?.trim() || "";
    }

    if (selection) {
      addImportantQuote(selection);
      setSaveFeedback("Frase salva em Frases Importantes!");
      setTimeout(() => setSaveFeedback(""), 3000);
    } else {
      alert("Selecione um trecho de texto no seu diário com o mouse para guardá-lo na lista de Frases Importantes!");
    }
  };

  const handleRemoveQuoteEverywhere = (quoteId) => {
    removeImportantQuote(quoteId);
    (entries || []).forEach((entry) => {
      if (entry.importantQuotes?.some((q) => q.id === quoteId)) {
        const remaining = (entry.importantQuotes || []).filter((q) => q.id !== quoteId);
        updateJournalEntry(entry.id, { ...entry, importantQuotes: remaining, updatedAt: Date.now() });
      }
    });
  };

  const handleDelete = () => {
    if (!editingId) {
      startNewEntry(selectedDate);
      return;
    }
    if (!window.confirm("Excluir esta entrada do diário? Esta ação não pode ser desfeita.")) return;
    const remaining = entries.filter((entry) => entry.id !== editingId);
    const photosToRemove = new Map(
      [
        ...(entries.find((entry) => entry.id === editingId)?.photos || []),
        ...(draft.photos || []),
      ].map((photo) => [photo.id, photo]),
    );
    deleteJournalEntry(editingId);
    photosToRemove.forEach((photo) => void removeRemotePhoto(photo));
    const next = remaining[0];
    if (next) {
      const nextDraft = editableEntry(next, today);
      setEditingId(next.id);
      setDraft(nextDraft);
      setSavedSnapshot(draftSnapshot(nextDraft));
      setSelectedDate(next.entryDate);
      setActiveJournalEntry(next.id);
    } else {
      const nextDraft = editableEntry(createJournalDraft(today), today);
      setEditingId(null);
      setDraft(nextDraft);
      setSavedSnapshot(draftSnapshot(nextDraft));
      setSelectedDate(today);
      setActiveJournalEntry(null);
    }
  };

  const discardDraft = () => {
    cleanupPendingPhotos();
    const storedEntry = editingId
      ? entries.find((entry) => entry.id === editingId)
      : null;
    const nextDraft = editableEntry(
      storedEntry || createJournalDraft(selectedDate || today, {
        type: settings.defaultEntryType || "reflection",
      }),
      selectedDate || today,
    );
    setDraft(nextDraft);
    setSavedSnapshot(draftSnapshot(nextDraft));
    setTagInput("");
    setSaveFeedback("");
    setPhotoMessage(null);
    setLightboxPhotoId(null);
  };

  const addTag = () => {
    const tags = tagInput
      .split(/[,#]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
    if (!tags.length) return;
    updateDraft({
      tags: [...new Set([...(draft.tags || []), ...tags])].slice(0, 12),
    });
    setTagInput("");
  };

  const appendJournalPhotos = (photos) => {
    if (!photos.length) return;
    setSaveFeedback("");
    setDraft((current) => {
      const combined = [...(current.photos || []), ...photos].slice(0, JOURNAL_PHOTO_LIMIT);
      return {
        ...current,
        photos: combined,
        coverPhotoId: current.coverPhotoId || combined[0]?.id || null,
      };
    });
  };

  const uploadJournalPhoto = async (file, localPath = "") => {
    const mimeType = photoMimeType(file?.name, file?.type);
    if (!mimeType) throw new Error(`${file?.name || "Arquivo"}: formato de imagem não suportado.`);
    if (Number(file?.size || 0) > JOURNAL_PHOTO_MAX_BYTES) {
      throw new Error(`${file.name}: a foto excede 15 MB.`);
    }
    let cloudFile = null;
    let warning = "";
    if (collaborationCloudConfigured) {
      try {
        cloudFile = await collaborationCloud.uploadAccountFile(file);
      } catch (error) {
        if (!localPath) throw error;
        warning = `${file.name} ficou disponível somente neste computador: ${error.message}`;
      }
    } else if (!localPath) {
      throw new Error("Configure o Supabase para adicionar fotos pela versão web.");
    }
    return {
      photo: {
        id: createPhotoId(),
        name: file.name || localPath.split(/[\\/]/).pop() || "Foto",
        caption: "",
        localPath,
        cloudObjectPath: cloudFile?.object_path || cloudFile?.objectPath || "",
        cloudFileObjectId: cloudFile?.id || null,
        cloudBucketId: cloudFile?.bucket_id || cloudFile?.bucketId || null,
        mimeType: cloudFile?.mime_type || cloudFile?.mimeType || mimeType,
        size: Number(cloudFile?.size_bytes || file.size || 0),
        createdAt: Date.now(),
      },
      warning,
    };
  };

  const handlePickPhotos = async () => {
    const remaining = JOURNAL_PHOTO_LIMIT - (draft.photos?.length || 0);
    if (remaining <= 0) {
      setPhotoMessage({ type: "error", text: `Cada entrada pode ter até ${JOURNAL_PHOTO_LIMIT} fotos.` });
      return;
    }
    if (!window.studyhubDesktop?.selectFile) {
      photoInputRef.current?.click();
      return;
    }
    const selected = await window.studyhubDesktop.selectFile({
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Fotos", extensions: ["jpg", "jpeg", "png", "webp", "gif"] }],
    });
    const paths = (Array.isArray(selected) ? selected : selected ? [selected] : []).slice(0, remaining);
    if (!paths.length) return;
    setUploadingPhotos(true);
    setPhotoMessage(null);
    const added = [];
    const messages = [];
    try {
      for (const localPath of paths) {
        try {
          const name = String(localPath).split(/[\\/]/).pop() || "foto.jpg";
          const binary = await window.studyhubDesktop.readFileBinary(localPath);
          const bytes = new Uint8Array(binary);
          const mimeType = photoMimeType(name);
          const file = new File([bytes], name, { type: mimeType });
          const result = await uploadJournalPhoto(file, localPath);
          added.push(result.photo);
          if (result.warning) messages.push(result.warning);
        } catch (error) {
          messages.push(error.message || "Não foi possível adicionar uma das fotos.");
        }
      }
      appendJournalPhotos(added);
      setPhotoMessage({
        type: added.length ? "info" : "error",
        text: messages.length
          ? `${added.length} foto(s) adicionada(s). ${messages.join(" • ")}`
          : `${added.length} foto(s) adicionada(s). Clique em Salvar para confirmar.`,
      });
    } finally {
      setUploadingPhotos(false);
    }
  };

  const handleBrowserPhotos = async (event) => {
    const remaining = JOURNAL_PHOTO_LIMIT - (draft.photos?.length || 0);
    const files = [...(event.target.files || [])].slice(0, Math.max(0, remaining));
    event.target.value = "";
    if (!files.length) return;
    setUploadingPhotos(true);
    setPhotoMessage(null);
    const added = [];
    const errors = [];
    try {
      for (const file of files) {
        try {
          const result = await uploadJournalPhoto(file);
          added.push(result.photo);
        } catch (error) {
          errors.push(error.message || `${file.name}: falha no envio.`);
        }
      }
      appendJournalPhotos(added);
      setPhotoMessage({
        type: added.length ? "info" : "error",
        text: errors.length
          ? `${added.length} foto(s) adicionada(s). ${errors.join(" • ")}`
          : `${added.length} foto(s) adicionada(s). Clique em Salvar para confirmar.`,
      });
    } finally {
      setUploadingPhotos(false);
    }
  };

  const changePhotoCaption = (photoId, caption) => {
    setSaveFeedback("");
    setDraft((current) => ({
      ...current,
      photos: (current.photos || []).map((photo) =>
        photo.id === photoId ? { ...photo, caption } : photo,
      ),
    }));
  };

  const setFeaturedPhoto = (photoId) => updateDraft({ coverPhotoId: photoId });

  const moveJournalPhoto = (photoId, direction) => {
    setSaveFeedback("");
    setDraft((current) => {
      const photos = [...(current.photos || [])];
      const index = photos.findIndex((photo) => photo.id === photoId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= photos.length) return current;
      [photos[index], photos[target]] = [photos[target], photos[index]];
      return { ...current, photos };
    });
  };

  const removeJournalPhoto = (photoId) => {
    const photo = (draft.photos || []).find((item) => item.id === photoId);
    if (!photo) return;
    const isStored = Boolean(
      editingId &&
      entries.find((entry) => entry.id === editingId)?.photos?.some((item) => item.id === photoId),
    );
    if (!isStored) void removeRemotePhoto(photo);
    setSaveFeedback("");
    setDraft((current) => {
      const photos = (current.photos || []).filter((item) => item.id !== photoId);
      return {
        ...current,
        photos,
        coverPhotoId: current.coverPhotoId === photoId ? photos[0]?.id || null : current.coverPhotoId,
      };
    });
    if (lightboxPhotoId === photoId) setLightboxPhotoId(null);
    setPhotoMessage({ type: "info", text: "Foto removida. Salve a entrada para confirmar." });
  };

  const exportCurrentEntry = () => {
    const mood = moodById.get(draft.mood)?.label || "Não informado";
    const gratitudeLines = paddedGratitudes(draft.gratitudes)
      .filter((item) => item.trim())
      .map((item) => `- ${item.trim()}`)
      .join("\n");
    const photoLines = (draft.photos || [])
      .map((photo, index) => `- Foto ${index + 1}: ${photo.caption || photo.name}`)
      .join("\n");
    const quoteLines = (draft.importantQuotes || [])
      .filter((q) => q.text.trim())
      .map((q) => `- ⭐ "${q.text.trim()}"`)
      .join("\n");
    const aiSummaryText = (draft.aiSummary || extractSummaryFromConversation(draft.aiReflections))?.trim();
    const markdown = [
      `# ${draft.title.trim() || "Entrada do diário"}`,
      "",
      `**Data:** ${formatDateLong(draft.entryDate)}`,
      `**Humor:** ${mood} · **Energia:** ${draft.energy}/5 · **Sono:** ${draft.sleepHours}h`,
      draft.tags?.length ? `**Tags:** ${draft.tags.map((tag) => `#${tag}`).join(" ")}` : "",
      draft.prompt ? `\n> ${draft.prompt}` : "",
      "",
      draft.content,
      photoLines ? `\n## Fotos e lembranças\n${photoLines}` : "",
      gratitudeLines ? `\n## Gratidão\n${gratitudeLines}` : "",
      quoteLines ? `\n## Frases Importantes ⭐\n${quoteLines}` : "",
      aiSummaryText ? `\n## Reflexão e Resumo da IA 🤖\n${aiSummaryText}` : "",
      draft.highlight ? `\n## Momento que quero guardar\n${draft.highlight}` : "",
      draft.intention ? `\n## Intenção para amanhã\n${draft.intention}` : "",
    ].filter((line) => line !== "").join("\n");
    const fileName = (draft.title.trim() || `diario-${draft.entryDate}`)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${fileName || "entrada-diario"}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const sendCurrentEntryToApple = async () => {
    const title = draft.title?.trim() || "Entrada do diário";
    const gratitudeLines = paddedGratitudes(draft.gratitudes)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => `• ${item}`)
      .join("\n");
    const quoteLines = (draft.importantQuotes || [])
      .map((quote) => String(quote.text || "").trim())
      .filter(Boolean)
      .map((quote) => `• “${quote}”`)
      .join("\n");
    const body = [
      String(draft.content || "").trim(),
      `Data no StudyHub: ${formatDateLong(draft.entryDate)}`,
      `Humor: ${moodById.get(draft.mood)?.label || "Não informado"} · Energia: ${draft.energy}/5 · Sono: ${draft.sleepHours}h`,
      draft.tags?.length ? `Tags: ${draft.tags.map((tag) => `#${tag}`).join(" ")}` : "",
      gratitudeLines ? `Gratidão\n${gratitudeLines}` : "",
      quoteLines ? `Frases importantes\n${quoteLines}` : "",
      draft.highlight?.trim() ? `Momento que quero guardar\n${draft.highlight.trim()}` : "",
      draft.intention?.trim() ? `Intenção para amanhã\n${draft.intention.trim()}` : "",
    ].filter(Boolean).join("\n\n");
    setSendingToApple(true);
    try {
      await window.studyhubDesktop?.journal?.sendToApple?.({
        title,
        body,
        entryDate: draft.entryDate,
        mediaPaths: (draft.photos || []).map((photo) => photo.path).filter(Boolean),
      });
      setSaveFeedback("Entrada enviada ao Diário da Apple");
    } catch (error) {
      setSaveFeedback(error?.message || "Não foi possível enviar ao Diário da Apple");
    } finally {
      setSendingToApple(false);
    }
  };

  const usePrompt = () => {
    updateDraft({ prompt });
    document.querySelector(".journal-writing-area")?.focus();
  };

  const askJournalAi = async (reply = "") => {
    const content = String(draft.content || "").trim();
    if (!content) {
      setJournalAiError("Escreva algo na entrada antes de pedir uma reflexão.");
      return;
    }
    setJournalAiBusy(true);
    setJournalAiError("");
    setJournalAiResponse("");
    try {
      const systemPrompt = `Você é um assistente de apoio emocional e reflexão pessoal, acolhedor e prudente. Use conhecimento psicológico geral para ajudar a compreender emoções e padrões, sempre conectando com cuidado ao relato fornecido. Nunca faça diagnóstico, use rótulos clínicos, prescreva tratamento ou diga que é psicólogo. Não invente fatos. Acolha, ofereça uma perspectiva prática segura e faça no máximo uma pergunta aberta. Se houver sinais de risco imediato, violência, autoagressão ou intenção suicida, recomende procurar imediatamente o SAMU 192, emergência local, alguém de confiança e, no Brasil, o CVV 188. Seja breve, respeitoso e em português.`;
      const transcript = [...journalAiConversation, ...(reply.trim() ? [{ role: "user", content: reply.trim() }] : [])]
        .map((message) => `${message.role === "user" ? "Pessoa" : "Assistente"}: ${message.content}`)
        .join("\n\n");
      const prompt = `Título: ${draft.title || "Sem título"}\nData: ${draft.entryDate}\nHumor informado: ${moodById.get(draft.mood)?.label || "não informado"}\n\nRelato inicial:\n${content.slice(0, 12000)}${transcript ? `\n\nConversa até agora:\n${transcript}` : ""}`;
      const desktopAi = window.studyhubDesktop?.academicAI;

      if (desktopAi?.noteAction) {
        setJournalAiProgress("Conectando ao Ollama local...");
        const status = await desktopAi.status?.();
        if (!status?.available) {
          const started = await desktopAi.start?.();
          if (!started?.available) {
            throw new Error(started?.message || "O Ollama não está disponível. Inicie o Ollama e tente novamente.");
          }
        }
        const result = await desktopAi.noteAction({
          kind: "ask",
          title: "Reflexão do Diário",
          content: prompt,
          question: "Faça a reflexão acolhedora sobre a entrada do diário acima. Faça no máximo uma pergunta aberta para continuar a conversa.",
          history: journalAiConversation,
          journalMode: true,
          requestId: `journal-ai-${Date.now()}`,
        });
        const answer = String(result?.content || "").trim() || "Não foi possível gerar a reflexão no momento. Tente novamente.";
        setJournalAiConversation((current) => {
          const nextConv = [
            ...(current.length ? current : [{ role: "user", content }]),
            ...(reply.trim() ? [{ role: "user", content: reply.trim() }] : []),
            { role: "assistant", content: answer },
          ];
          updateDraft({
            aiReflections: nextConv,
            aiSummary: extractSummaryFromConversation(nextConv),
          });
          return nextConv;
        });
        setJournalAiResponse(answer);
      } else {
        if (!isWebLlmAvailable()) {
          throw new Error("Na versão web, a IA precisa de WebGPU. No aplicativo desktop, use o Ollama local.");
        }
        const response = await askWithWebLLM({
          system: systemPrompt,
          prompt: `${prompt}\n\nFaça no máximo uma pergunta aberta para continuar a conversa.`,
          history: journalAiConversation,
          onProgress: (progress) => setJournalAiProgress(progress?.text || "Preparando reflexão local..."),
        });
        setJournalAiConversation((current) => {
          const nextConv = [
            ...(current.length ? current : [{ role: "user", content }]),
            ...(reply.trim() ? [{ role: "user", content: reply.trim() }] : []),
            { role: "assistant", content: response },
          ];
          updateDraft({
            aiReflections: nextConv,
            aiSummary: extractSummaryFromConversation(nextConv),
          });
          return nextConv;
        });
        setJournalAiResponse(response);
      }
    } catch (error) {
      setJournalAiError(error.message || "Não foi possível iniciar a IA local.");
    } finally {
      setJournalAiBusy(false);
      setJournalAiProgress("");
    }
  };

  const handleSelectCategory = (targetCategory) => {
    setInlineAiCategory(targetCategory);
    // Selecionar o tipo apenas prepara o pedido. A IA só deve ser acionada
    // depois que o usuário confirmar no botão de gerar sugestões.
    setInlineAiSuggestions(inlineAiCache[targetCategory] || []);
  };

  const fetchInlineSuggestions = async (category = "continue", forceRefresh = false) => {
    setInlineAiCategory(category);

    if (!forceRefresh && inlineAiCache[category] && inlineAiCache[category].length > 0) {
      setInlineAiSuggestions(inlineAiCache[category]);
      return;
    }

    setInlineAiBusy(true);
    setInlineAiError("");
    try {
      const content = String(draft.content || "").trim();
      const desktopAi = window.studyhubDesktop?.academicAI;

      let categoryInstruction = "";
      if (category === "emotions") {
        categoryInstruction = "Gere 3 perguntas acolhedoras para o usuário aprofundar os sentimentos e emoções sobre o que relatou.";
      } else if (category === "next_steps") {
        categoryInstruction = "Gere 3 sugestões de reflexão sobre intenções, próximos passos ou o que fazer amanhã referente ao relato.";
      } else if (category === "complete") {
        categoryInstruction = "Gere 3 inícios de frase para o usuário continuar completando no diário (ex: 'Sinto que o aprendizado disso foi...', 'O que mais me impactou foi...').";
      } else {
        categoryInstruction = "Gere 3 sugestões de frases ou perguntas para o usuário continuar desenvolvendo o texto do diário.";
      }

      const previousItems = inlineAiCache[category] || [];
      const avoidInstruction = (forceRefresh && previousItems.length)
        ? `\nIMPORTANTE: Não repita as seguintes sugestões que já foram mostradas antes: [${previousItems.join("; ")}]. Gere 3 sugestões TOTALMENTE DIFERENTES e inéditas.`
        : "";

      const promptText = `Texto atual no diário:
"${content || "O diário está em branco no momento."}"
Humor informado: ${moodById.get(draft.mood)?.label || "neutro"}
Título: ${draft.title || "Sem título"}

Instrução: ${categoryInstruction}${avoidInstruction}
Responda APENAS com uma lista numerada contendo exatamente 3 itens curtos (uma frase por item, sem texto introdutório).`;

      let rawOutput = "";
      if (desktopAi?.noteAction) {
        const result = await desktopAi.noteAction({
          kind: "ask",
          title: "Sugestão de Escrita",
          content: promptText,
          question: "Retorne 3 sugestões curtas inéditas.",
          responseLength: "short",
          journalMode: true,
          requestId: `inline-journal-ai-${Date.now()}`,
        });
        rawOutput = result?.content || "";
      } else if (isWebLlmAvailable()) {
        rawOutput = await askWithWebLLM({
          system: "Você é um assistente de escrita de diário acolhedor. Retorne apenas a lista de 3 sugestões de escrita.",
          prompt: promptText,
        });
      }

      let parsedItems = [];
      if (rawOutput) {
        parsedItems = rawOutput
          .split("\n")
          .map((line) => line.replace(/^[\d\-*•.)\s]+/, "").trim())
          .filter((line) => line.length > 5 && !line.toLowerCase().startsWith("aqui est"))
          .slice(0, 3);
      }

      if (!parsedItems.length) {
        if (category === "emotions") {
          parsedItems = forceRefresh
            ? [
                "De que forma esse sentimento reverberou no seu corpo ou pensamentos?",
                "Se você pudesse acolher esse sentimento com carinho, o que diria?",
                "O que essa emoção está tentando te mostrar sobre o que é importante para você?"
              ]
            : [
                "Como você se sentiu no momento em que isso aconteceu?",
                "Há algum sentimento que você ainda não colocou em palavras?",
                "O que você precisa para se sentir em paz sobre isso agora?"
              ];
        } else if (category === "next_steps") {
          parsedItems = forceRefresh
            ? [
                "Existe algo que você prefere deixar para trás depois desse relato?",
                "Qual mensagem você gostaria de guardar no coração para amanhã?",
                "Como você pode se recompensar por ter superado esse momento?"
              ]
            : [
                "Qual é o primeiro passo simples para lidar com isso amanhã?",
                "Como você pode se cuidar melhor nas próximas horas?",
                "O que você aprendeu com essa situação para o seu futuro?"
              ];
        } else if (category === "complete") {
          parsedItems = forceRefresh
            ? [
                "Se eu pudesse mudar uma única coisa neste dia, seria...",
                "O que mais me surpreendeu em mim mesmo(a) foi...",
                "Prometo a mim mesmo(a) que a partir de agora vou..."
              ]
            : [
                "Pensando melhor sobre tudo isso, percebo que...",
                "O que eu mais gostaria que acontecesse agora é...",
                "Um detalhe importante que não posso esquecer é..."
              ];
        } else {
          parsedItems = forceRefresh
            ? [
                "Que outras pessoas tiveram papel relevante nesse momento?",
                "Como essa experiência altera sua visão sobre si mesmo(a)?",
                "O que faltou dizer para deixar este relato 100% completo?"
              ]
            : [
                "O que mais te marcou nesse acontecimento?",
                "Como essa situação afeta seu bem-estar atual?",
                "O que você gostaria de dizer para si mesmo sobre este dia?"
              ];
        }
      }

      setInlineAiSuggestions(parsedItems);
      setInlineAiCache((prev) => ({
        ...prev,
        [category]: parsedItems,
      }));
    } catch {
      const fallback = [
        "O que mais aconteceu de relevante hoje?",
        "Como você gostaria de continuar este relato?",
        "Qual é a principal lição que fica deste momento?"
      ];
      setInlineAiSuggestions(fallback);
      setInlineAiCache((prev) => ({ ...prev, [category]: fallback }));
    } finally {
      setInlineAiBusy(false);
    }
  };

  const handleInsertSuggestion = (suggestionText) => {
    setDraft((prev) => {
      const currentContent = prev.content || "";
      const separator = currentContent.trim() ? "\n\n" : "";
      return {
        ...prev,
        content: `${currentContent}${separator}${suggestionText}\n`,
      };
    });
    setTimeout(() => {
      document.querySelector(".journal-writing-area")?.focus();
    }, 50);
  };

  const unlockJournal = async (event) => {
    event.preventDefault();
    if (!accountEmail) {
      setPasswordError("Não foi possível identificar sua conta. Entre novamente no aplicativo.");
      return;
    }
    setUnlockingJournal(true);
    setPasswordError("");
    try {
      await collaborationCloud.signIn({ email: accountEmail, password: passwordInput });
      setJournalLocked(false);
      setPasswordInput("");
    } catch {
      setPasswordError("Senha da conta incorreta.");
      setPasswordInput("");
    } finally {
      setUnlockingJournal(false);
    }
  };

  useEffect(() => {
    const handleShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (event.repeat) return;
        if (dirty) handleSave();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [dirty, draft, editingId]);

  useEffect(() => {
    let mounted = true;
    collaborationCloud.getSession().then((session) => {
      if (mounted) setAccountEmail(session?.user?.email || "");
    }).catch(() => {
      if (mounted) setAccountEmail("");
    });
    // Remove a configuração antiga: a partir de agora a conta é a única fonte da senha.
    if (settings.passwordHash) updateJournalSettings({ passwordHash: "" });
    return () => { mounted = false; };
  }, []);

  if (journalLocked) {
    return (
      <main className="journal-screen flex min-h-0 flex-1 items-center justify-center p-6">
        <section className="journal-panel w-full max-w-md p-8 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[color:var(--journal-accent)]/15 text-[color:var(--journal-accent)]"><Icon name="lock" className="text-3xl" /></div>
          <span className="journal-eyebrow">Diário protegido</span>
          <h1 className="mt-2 text-2xl font-black text-[color:var(--journal-ink)]">Digite sua senha</h1>
          <p className="mt-2 text-sm text-[color:var(--journal-muted)]">Use a mesma senha da sua conta para acessar suas memórias.</p>
          <form className="mt-6 space-y-3 text-left" onSubmit={unlockJournal}>
            <input autoFocus type="password" value={passwordInput} onChange={(event) => setPasswordInput(event.target.value)} className="journal-filter-select w-full" placeholder="Senha da conta" aria-label="Senha da conta" autoComplete="current-password" required />
            {passwordError ? <p className="text-xs font-bold text-red-600">{passwordError}</p> : null}
            <button type="submit" className="journal-primary-button w-full justify-center" disabled={unlockingJournal || !accountEmail}><Icon name="lock_open" /> {unlockingJournal ? "Verificando..." : "Abrir diário"}</button>
          </form>
          <p className="mt-4 text-xs text-[color:var(--journal-muted)]">Esqueceu a senha? Recupere-a pela tela de acesso do aplicativo.</p>
        </section>
      </main>
    );
  }

  return (
    <main
      className="journal-screen flex h-full min-h-0 flex-1 flex-col overflow-hidden"
      style={{ "--journal-entry-accent": selectedAccent.color }}
    >
      <input
        ref={photoInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={handleBrowserPhotos}
      />
      <header className="journal-topbar">
        <div>
          <div className="flex items-center gap-2">
            <span className="journal-eyebrow">Espaço pessoal</span>
            <span className="journal-private-badge"><Icon name="lock" /> Privado</span>
          </div>
          <h1>Meu diário</h1>
        </div>
        <div className="flex items-center gap-2">
          {dirty ? <span className="hidden text-xs font-semibold text-[color:var(--journal-muted)] sm:inline">Alterações não salvas</span> : null}
          {saveFeedback ? <span className="hidden items-center gap-1 text-xs font-bold text-emerald-700 sm:flex"><Icon name="cloud_done" className="text-[16px]" /> {saveFeedback}</span> : null}
          <button type="button" className="journal-outline-button" onClick={() => startNewEntry(today)}>
            <Icon name="add" />
            <span className="hidden sm:inline">Nova entrada</span>
          </button>
          <button type="button" className="journal-primary-button" onClick={handleSave} disabled={!dirty}>
            <Icon name="save" />
            Salvar
          </button>
          <button type="button" className="journal-outline-button" onClick={sendCurrentEntryToApple} disabled={!draft.content?.trim() || sendingToApple} title="Criar uma entrada no Diário da Apple">
            <Icon name="menu_book" />
            <span className="hidden sm:inline">{sendingToApple ? "Enviando…" : "Enviar ao Diário"}</span>
          </button>
          <button type="button" className="journal-icon-button" title="Bloquear diário" aria-label="Bloquear diário" onClick={() => setJournalLocked(true)}>
            <Icon name="lock" />
          </button>
          <button type="button" className="journal-outline-button" onClick={handleOpenJournalAi}>
            <Icon name="auto_awesome" /> <span className="hidden sm:inline">Reflexão IA</span>
          </button>
          <button
            type="button"
            className={`journal-outline-button flex items-center gap-1.5 ${showImportantQuotesModal ? "border-amber-500 bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold" : ""}`}
            onClick={() => setShowImportantQuotesModal((v) => !v)}
          >
            <Icon name="star" filled className="text-amber-500" />
            <span className="hidden sm:inline">FRASES IMPORTANTES</span> ({allQuotesList.length})
          </button>
        </div>
      </header>

      <div className="journal-layout">
        <aside className="journal-history-column">
          <MiniCalendar
            month={month}
            entries={entries}
            selectedDate={selectedDate}
            onMonthChange={setMonth}
            onSelectDate={handleSelectDate}
          />

          <div className="journal-search-box">
            <Icon name="search" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar no diário..."
              aria-label="Buscar no diário"
            />
            {query ? <button type="button" onClick={() => setQuery("")} aria-label="Limpar busca"><Icon name="close" /></button> : null}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <select className="journal-filter-select" value={moodFilter} onChange={(event) => setMoodFilter(event.target.value)} aria-label="Filtrar por humor">
              <option value="all">Todos os humores</option>
              {JOURNAL_MOODS.map((mood) => <option key={mood.id} value={mood.id}>{mood.emoji} {mood.label}</option>)}
            </select>
            <select className="journal-filter-select" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Filtrar por tipo">
              <option value="all">Todos os tipos</option>
              {JOURNAL_ENTRY_TYPES.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
            </select>
          </div>
          <button
            type="button"
            onClick={() => setFavoritesOnly((value) => !value)}
            className={`journal-favorite-filter ${favoritesOnly ? "is-active" : ""}`}
          >
            <Icon name="favorite" filled={favoritesOnly} />
            Somente favoritos
            <span>{entries.filter((entry) => entry.favorite).length}</span>
          </button>

          <div className="flex items-center justify-between px-1 pt-1">
            <span className="journal-eyebrow">Histórico</span>
            <span className="text-[10px] font-semibold text-[color:var(--journal-muted)]">{filteredEntries.length} entrada(s)</span>
          </div>
          <div className="min-h-[220px] flex-1 overflow-y-auto pr-1">
            <EntryHistory entries={filteredEntries} activeId={editingId} onOpen={openEntry} />
          </div>
        </aside>

        {showImportantQuotesModal ? (
          <ImportantQuotesView
            quotes={allQuotesList}
            onAddQuote={(text) => {
              addImportantQuote(text);
              setSaveFeedback("Frase salva em Frases Importantes!");
              setTimeout(() => setSaveFeedback(""), 3000);
            }}
            onRemoveQuote={handleRemoveQuoteEverywhere}
            onClose={() => setShowImportantQuotesModal(false)}
          />
        ) : (
          <section className="journal-editor-scroll">
            <article className="journal-paper">
              <div className="journal-paper-accent" />
              <div className="journal-paper-header">
                <div className="min-w-0">
                  <label className="journal-eyebrow" htmlFor="journal-entry-date">Data da entrada</label>
                  <input
                    id="journal-entry-date"
                    type="date"
                    value={draft.entryDate}
                    onChange={(event) => {
                      const date = event.target.value || today;
                      updateDraft({ entryDate: date });
                      setSelectedDate(date);
                      setMonth(date.slice(0, 7));
                    }}
                    className="journal-date-input"
                  />
                  <p className="mt-1 capitalize text-sm text-[color:var(--journal-muted)]">{formatDateLong(draft.entryDate)}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    title="Exportar como Markdown"
                    aria-label="Exportar entrada como Markdown"
                    className="journal-icon-button"
                    onClick={exportCurrentEntry}
                  >
                    <Icon name="download" />
                  </button>
                  <button
                    type="button"
                    title={draft.favorite ? "Remover dos favoritos" : "Favoritar"}
                    aria-label={draft.favorite ? "Remover dos favoritos" : "Favoritar"}
                    className={`journal-icon-button ${draft.favorite ? "is-favorite" : ""}`}
                    onClick={() => updateDraft({ favorite: !draft.favorite })}
                  >
                    <Icon name="favorite" filled={draft.favorite} />
                  </button>
                  <button type="button" title="Excluir entrada" aria-label="Excluir entrada" className="journal-icon-button is-danger" onClick={handleDelete}>
                    <Icon name="delete" />
                  </button>
                </div>
              </div>

              <div className="journal-type-row" aria-label="Tipo de entrada">
                {JOURNAL_ENTRY_TYPES.map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => updateDraft({ type: type.id })}
                    className={draft.type === type.id ? "is-selected" : ""}
                  >
                    <Icon name={type.icon} />
                    {type.label}
                  </button>
                ))}
              </div>

              <input
                className="journal-title-input"
                value={draft.title}
                maxLength={120}
                onChange={(event) => updateDraft({ title: event.target.value })}
                placeholder="Dê um título a este momento..."
                aria-label="Título da entrada"
              />

              {draft.prompt ? (
                <div className="journal-used-prompt">
                  <Icon name="lightbulb" />
                  <span><strong>Ponto de partida:</strong> {draft.prompt}</span>
                  <button type="button" onClick={() => updateDraft({ prompt: "" })} aria-label="Remover pergunta"><Icon name="close" /></button>
                </div>
              ) : null}

              <textarea
                className="journal-writing-area"
                value={draft.content}
                onChange={(event) => updateDraft({ content: event.target.value })}
                placeholder="Respire fundo e escreva sem se julgar. Este espaço é só seu..."
                spellCheck
                aria-label="Texto da entrada"
              />
              <div className="flex items-center justify-between border-t border-[color:var(--journal-line)] pt-3 text-[11px] font-semibold text-[color:var(--journal-muted)] flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <span>{wordCount} {wordCount === 1 ? "palavra" : "palavras"}</span>
                  <span>{draft.content.length.toLocaleString("pt-BR")} caracteres</span>
                </div>
                <button
                  type="button"
                  className="journal-outline-button text-xs py-1 px-2.5 flex items-center gap-1.5 hover:text-amber-500 font-bold"
                  title="Selecione um trecho do seu texto e clique para salvar em Frases Importantes"
                  onClick={handleSaveQuoteFromSelection}
                >
                  <Icon name="star" filled className="text-amber-500" /> Salvar em Frases Importantes (⭐)
                </button>
              </div>

              {/* Sugestões da IA para continuar escrevendo (sem sair do texto) */}
              <div className="mt-4 rounded-2xl border border-[color:var(--journal-line)] bg-[color:var(--journal-canvas)]/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--journal-line)]/50 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[color:var(--journal-accent)]/15 text-[color:var(--journal-accent)]">
                      <Icon name="auto_awesome" className="text-[16px]" />
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--journal-ink)]">
                      Sugestões da IA para continuar escrevendo
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {[
                      { id: "continue", label: "💡 O que escrever?", icon: "edit_note" },
                      { id: "emotions", label: "🧘 Emoções", icon: "mood" },
                      { id: "next_steps", label: "🎯 Próximos passos", icon: "flag" },
                      { id: "complete", label: "📝 Inícios de frase", icon: "extension" },
                    ].map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        disabled={inlineAiBusy}
                        onClick={() => handleSelectCategory(cat.id)}
                        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
                          inlineAiCategory === cat.id
                            ? "bg-[color:var(--journal-accent)] text-white shadow-sm"
                            : "bg-[color:var(--journal-paper)] text-[color:var(--journal-muted)] hover:bg-[color:var(--journal-accent)]/10 hover:text-[color:var(--journal-ink)]"
                        }`}
                      >
                        <Icon name={cat.icon} className="text-[13px]" />
                        {cat.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={inlineAiBusy}
                      onClick={() => fetchInlineSuggestions(inlineAiCategory, false)}
                      className="flex items-center gap-1.5 rounded-lg bg-[color:var(--journal-accent)] px-3 py-1 text-[11px] font-bold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-50"
                    >
                      <Icon name="auto_awesome" className="text-[13px]" />
                      Gerar sugestões
                    </button>
                  </div>
                </div>

                {inlineAiBusy ? (
                  <div className="flex items-center justify-center gap-3 py-6 text-xs font-medium text-[color:var(--journal-muted)]">
                    <Icon name="progress_activity" className="animate-spin text-[18px] text-[color:var(--journal-accent)]" />
                    Analisando seu relato para gerar ideias de continuação...
                  </div>
                ) : inlineAiSuggestions.length > 0 ? (
                  <div className="mt-3 space-y-3">
                    <div className="space-y-2">
                      {inlineAiSuggestions.map((suggestion, index) => (
                        <div
                          key={index}
                          className="group flex items-center justify-between gap-3 rounded-xl border border-[color:var(--journal-line)]/60 bg-[color:var(--journal-paper)] p-3 text-xs leading-relaxed text-[color:var(--journal-ink)] transition-all hover:border-[color:var(--journal-accent)]/40 hover:shadow-sm"
                        >
                          <span className="flex-1 font-medium">"{suggestion}"</span>
                          <button
                            type="button"
                            onClick={() => handleInsertSuggestion(suggestion)}
                            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[color:var(--journal-accent)]/15 px-3 py-1.5 text-[11px] font-bold text-[color:var(--journal-accent)] transition-colors hover:bg-[color:var(--journal-accent)] hover:text-white"
                          >
                            <Icon name="add" className="text-[14px]" />
                            Inserir no texto
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        disabled={inlineAiBusy}
                        onClick={() => fetchInlineSuggestions(inlineAiCategory, true)}
                        className="flex items-center gap-1.5 text-[11px] font-bold text-[color:var(--journal-accent)] transition-opacity hover:opacity-80 disabled:opacity-50"
                      >
                        <Icon name="refresh" className="text-[14px]" />
                        Gerar outras sugestões para esta categoria
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-4 text-center">
                    <p className="text-xs text-[color:var(--journal-muted)]">
                      Clique abaixo ou em uma categoria acima para receber sugestões de frases e perguntas baseadas no seu relato!
                    </p>
                    <button
                      type="button"
                      onClick={() => fetchInlineSuggestions("continue", true)}
                      className="mt-2.5 inline-flex items-center gap-2 rounded-xl bg-[color:var(--journal-accent)]/15 px-4 py-2 text-xs font-bold text-[color:var(--journal-accent)] transition-colors hover:bg-[color:var(--journal-accent)] hover:text-white"
                    >
                      <Icon name="auto_awesome" className="text-[16px]" />
                      Gerar sugestões para o texto
                    </button>
                  </div>
                )}
              </div>

              <JournalPhotoGallery
                photos={draft.photos || []}
                coverPhotoId={draft.coverPhotoId}
                signedUrls={signedPhotoUrls}
                uploading={uploadingPhotos}
                message={photoMessage}
                onAdd={handlePickPhotos}
                onOpen={setLightboxPhotoId}
                onCaptionChange={changePhotoCaption}
                onSetFeatured={setFeaturedPhoto}
                onMove={moveJournalPhoto}
                onRemove={removeJournalPhoto}
              />

              <section className="journal-reflection-section">
                <div className="journal-section-title">
                  <span><Icon name="mood" /> Como você está?</span>
                  <span>{moodById.get(draft.mood)?.label}</span>
                </div>
                <MoodSelector value={draft.mood} onChange={(mood) => updateDraft({ mood })} />
                <div className="mt-5 grid gap-5 md:grid-cols-2">
                  <label className="journal-range-field">
                    <span><Icon name="bolt" /> Energia <strong>{draft.energy}/5</strong></span>
                    <input type="range" min="1" max="5" step="1" value={draft.energy} onChange={(event) => updateDraft({ energy: Number(event.target.value) })} />
                    <small><span>Esgotado</span><span>Cheio de energia</span></small>
                  </label>
                  <label className="journal-range-field">
                    <span><Icon name="bedtime" /> Sono <strong>{draft.sleepHours}h</strong></span>
                    <input type="range" min="0" max="12" step="0.5" value={draft.sleepHours} onChange={(event) => updateDraft({ sleepHours: Number(event.target.value) })} />
                    <small><span>Pouco</span><span>Restaurador</span></small>
                  </label>
                </div>
              </section>

              <section className="journal-reflection-section">
                <div className="journal-section-title">
                  <span><Icon name="volunteer_activism" /> Três coisas pelas quais agradeço</span>
                </div>
                <div className="space-y-2">
                  {paddedGratitudes(draft.gratitudes).map((gratitude, index) => (
                    <label key={index} className="journal-gratitude-row">
                      <span>{index + 1}</span>
                      <input
                        value={gratitude}
                        onChange={(event) => {
                          const next = paddedGratitudes(draft.gratitudes);
                          next[index] = event.target.value;
                          updateDraft({ gratitudes: next });
                        }}
                        placeholder={index === 0 ? "Uma pessoa, um momento ou algo simples..." : "Mais uma coisa boa de hoje..."}
                      />
                    </label>
                  ))}
                </div>
              </section>



              <section className="journal-reflection-section">
                <div className="flex items-center justify-between">
                  <div className="journal-section-title">
                    <span><Icon name="auto_awesome" className="text-purple-500" /> Reflexão e Resumo da IA</span>
                  </div>
                  <button
                    type="button"
                    className="journal-outline-button text-xs py-1 px-2.5 flex items-center gap-1"
                    onClick={handleOpenJournalAi}
                  >
                    <Icon name="chat" /> {(draft.aiSummary || draft.aiReflections?.length) ? "Abrir Conversa IA" : "Pedir Reflexão IA"}
                  </button>
                </div>

                {(draft.aiSummary || draft.aiReflections?.length) ? (
                  <div className="mt-3 rounded-2xl border border-purple-400/30 bg-purple-500/5 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                        <Icon name="psychology" /> Resumo da Conversa com IA
                      </span>
                      <button
                        type="button"
                        className="journal-icon-button is-danger p-1"
                        title="Remover reflexão da IA"
                        onClick={() => updateDraft({ aiSummary: "", aiReflections: [] })}
                      >
                        <Icon name="close" />
                      </button>
                    </div>
                    <div
                      className="campus-ai-markdown journal-ai-markdown text-xs leading-relaxed text-[color:var(--journal-ink)]"
                      dangerouslySetInnerHTML={{
                        __html: renderSafeMarkdown(draft.aiSummary || extractSummaryFromConversation(draft.aiReflections)),
                      }}
                    />
                    {draft.aiReflections?.length ? (
                      <div className="pt-2 text-[11px] font-semibold text-[color:var(--journal-muted)] flex items-center justify-between border-t border-purple-500/10">
                        <span>{draft.aiReflections.length} mensagem(ns) salvas</span>
                        <button
                          type="button"
                          className="text-purple-600 dark:text-purple-400 hover:underline cursor-pointer flex items-center gap-1 font-bold"
                          onClick={handleOpenJournalAi}
                        >
                          Continuar conversa <Icon name="arrow_forward" className="text-xs" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-[color:var(--journal-muted)] italic">
                    Nenhuma reflexão da IA salva nesta entrada. Clique no botão "Reflexão IA" para conversar com o assistente local.
                  </p>
                )}
              </section>

              <section className="grid gap-4 md:grid-cols-2">
                <label className="journal-text-field">
                  <span><Icon name="photo_camera" /> Momento que quero guardar</span>
                  <textarea value={draft.highlight} onChange={(event) => updateDraft({ highlight: event.target.value })} placeholder="O ponto alto do dia..." />
                </label>
                <label className="journal-text-field">
                  <span><Icon name="wb_twilight" /> Intenção para amanhã</span>
                  <textarea value={draft.intention} onChange={(event) => updateDraft({ intention: event.target.value })} placeholder="Amanhã quero..." />
                </label>
              </section>

              <section className="journal-tags-section">
                <div>
                  <span className="journal-section-title"><span><Icon name="sell" /> Tags</span></span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(draft.tags || []).map((tag) => (
                      <button key={tag} type="button" className="journal-tag" onClick={() => updateDraft({ tags: draft.tags.filter((item) => item !== tag) })} title="Remover tag">
                        #{tag} <Icon name="close" />
                      </button>
                    ))}
                    <div className="journal-tag-input">
                      <span>#</span>
                      <input
                        value={tagInput}
                        onChange={(event) => setTagInput(event.target.value)}
                        onBlur={addTag}
                        onKeyDown={(event) => {
                          if (["Enter", ","].includes(event.key)) {
                            event.preventDefault();
                            addTag();
                          }
                        }}
                        placeholder="adicionar"
                      />
                    </div>
                  </div>
                </div>
              </section>
              <div>
                <span className="journal-section-title"><span><Icon name="palette" /> Cor</span></span>
                <div className="mt-2 flex gap-2">
                  {JOURNAL_ACCENTS.map((accent) => (
                    <button
                      key={accent.id}
                      type="button"
                      title={accent.label}
                      aria-label={accent.label}
                      aria-pressed={draft.accent === accent.id}
                      className={`journal-accent-swatch ${draft.accent === accent.id ? "is-selected" : ""}`}
                      style={{ backgroundColor: accent.color }}
                      onClick={() => updateDraft({ accent: accent.id })}
                    />
                  ))}
                </div>
              </div>
            </article>

            <footer className="journal-editor-footer">
              <span><Icon name="info" /> A entrada só será alterada quando você clicar em Salvar.</span>
              <div className="flex gap-2">
                {dirty ? <button type="button" className="journal-outline-button" onClick={discardDraft}>Descartar</button> : null}
                <button type="button" className="journal-primary-button" onClick={handleSave} disabled={!dirty}><Icon name="save" /> Salvar entrada</button>
              </div>
            </footer>
          </section>
        )}

        <JournalInsights
          entries={entries}
          stats={stats}
          prompt={prompt}
          onUsePrompt={usePrompt}
          onNextPrompt={() => setPromptOffset((value) => value + 1)}
        />
      </div>
      <JournalPhotoLightbox
        photos={draft.photos || []}
        activeId={lightboxPhotoId}
        signedUrls={signedPhotoUrls}
        onClose={() => setLightboxPhotoId(null)}
        onChange={setLightboxPhotoId}
      />
      {showJournalAi ? (
        <div className="fixed inset-0 z-[135] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowJournalAi(false); }}>
          <section className="journal-panel w-full max-w-2xl p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div><span className="journal-eyebrow">Privado e local</span><h2 className="mt-1 text-xl font-black text-[color:var(--journal-ink)]">Reflexão com IA</h2><p className="mt-1 text-sm text-[color:var(--journal-muted)]">Uma leitura cuidadosa do que você escreveu, sem diagnóstico.</p></div>
              <button type="button" className="journal-icon-button" onClick={() => setShowJournalAi(false)} aria-label="Fechar"><Icon name="close" /></button>
            </div>
            <div className="mt-5 rounded-2xl border border-[color:var(--journal-line)] bg-[color:var(--journal-canvas)]/60 p-4 text-xs leading-5 text-[color:var(--journal-muted)]">No aplicativo desktop, a conversa usa o Ollama local. A IA faz perguntas de reflexão, mas não é psicóloga, não diagnostica e não substitui atendimento profissional.</div>
            {journalAiConversation.length ? <div className="mt-5 max-h-[48vh] space-y-3 overflow-y-auto pr-1">
              {journalAiConversation.map((message, index) => (
                <div key={`${message.role}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`journal-ai-chat-bubble max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-7 ${message.role === "user" ? "is-user whitespace-pre-wrap bg-[color:var(--journal-accent)]/15 text-[color:var(--journal-ink)]" : "is-assistant bg-[color:var(--journal-paper)] text-[color:var(--journal-ink)]"}`}>
                    <p className="mb-1 text-[10px] font-black uppercase tracking-[0.14em] text-[color:var(--journal-muted)]">{message.role === "user" ? "Você" : "Reflexão IA"}</p>
                    {message.role === "user" ? (
                      message.content
                    ) : (
                      <div
                        className="campus-ai-markdown journal-ai-markdown"
                        dangerouslySetInnerHTML={{
                          __html: renderSafeMarkdown(message.content),
                        }}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div> : null}
            {journalAiResponse ? <textarea value={journalAiReply} onChange={(event) => setJournalAiReply(event.target.value)} className="journal-filter-select mt-4 min-h-24 w-full resize-y" placeholder="Responda à pergunta da IA para continuar..." aria-label="Resposta para continuar a reflexão" /> : null}
            {journalAiError ? <p className="mt-4 rounded-xl bg-red-500/10 p-3 text-xs font-bold text-red-700 dark:text-red-300">{journalAiError}</p> : null}
            {journalAiBusy && journalAiProgress ? <p className="mt-4 text-xs text-[color:var(--journal-muted)]">{journalAiProgress}</p> : null}
            <div className="mt-5 flex items-center justify-between gap-2 flex-wrap">
              {journalAiConversation.length ? (
                <button
                  type="button"
                  className="journal-outline-button text-xs font-bold flex items-center gap-1.5 text-purple-600 dark:text-purple-400"
                  onClick={() => {
                    const summary = extractSummaryFromConversation(journalAiConversation);
                    updateDraft({
                      aiReflections: journalAiConversation,
                      aiSummary: summary,
                    });
                    handleSave();
                    setShowJournalAi(false);
                  }}
                >
                  <Icon name="bookmark" /> Salvar no Diário
                </button>
              ) : <div />}

              <div className="flex items-center gap-2">
                <button type="button" className="journal-outline-button" onClick={() => setShowJournalAi(false)}>
                  Fechar
                </button>
                {journalAiResponse ? (
                  <button
                    type="button"
                    className="journal-outline-button"
                    onClick={() => {
                      setJournalAiConversation([]);
                      setJournalAiResponse("");
                      setJournalAiReply("");
                      setJournalAiError("");
                      askJournalAi("");
                    }}
                  >
                    Nova reflexão
                  </button>
                ) : null}
                <button
                  type="button"
                  className="journal-primary-button"
                  onClick={() => {
                    const reply = journalAiReply;
                    setJournalAiReply("");
                    askJournalAi(reply);
                  }}
                  disabled={journalAiBusy || (journalAiResponse && !journalAiReply.trim())}
                >
                  <Icon name={journalAiBusy ? "progress_activity" : "auto_awesome"} />
                  {journalAiBusy ? "Analisando..." : journalAiResponse ? "Continuar conversa" : "Gerar reflexão"}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
