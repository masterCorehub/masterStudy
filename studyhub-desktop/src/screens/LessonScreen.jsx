import { lazy, Suspense, useEffect, useReducer, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import confetti from "canvas-confetti";
import { SCREEN_IDS } from "../app/screenIds";
import { RichTextEditor } from "../components/RichTextEditor";
import {
  createLessonNoteDraft,
  lessonNoteDraftReducer,
  prepareLessonNoteSave,
} from "../domain/lessonNoteDraft";
import { LanguageLabModal } from "../features/language-lab/LanguageLabModal";
import { useStudyStore } from "../store/useStore";
import { Icon } from "../ui/Icon";
import { parseYoutubeUrl } from "../utils/youtubeUtils";
import { getLocalFilePath, getLocalFileUrl } from "../utils/localFileUrl";
import { ShareModal } from "../components/ShareModal";

const PdfGuidedReadingModal = lazy(() =>
  import("../features/pdf-guided/PdfGuidedReadingModal"),
);

const stripHtml = (value) => value.replace(/<[^>]*>?/gm, "").trim();

const getLessonDuration = (lesson) =>
  lesson?.duration || lesson?.durationLabel || "Tempo livre";
const getLessonKind = (lesson) => lesson?.type || lesson?.kindLabel || "Aula";
const isHubLesson = (lesson) =>
  lesson?.contentMode === "hub" ||
  (!lesson?.youtubeUrl &&
    !lesson?.externalUrl &&
    !lesson?.filePath &&
    !lesson?.pdfPath &&
    !lesson?.audioPath &&
    !(lesson?.extraMedia?.length > 0));

const getMediaIcon = (type) => {
  switch (type) {
    case "external":
      return "link";
    case "youtube":
      return "smart_display";
    case "local_video":
      return "movie";
    case "local_file":
      return "draft";
    case "pdf":
      return "picture_as_pdf";
    case "audio":
      return "headphones";
    default:
      return "attachment";
  }
};

const getDisplayFileName = (value, fallback = "Arquivo") => {
  const source = String(value || "").trim();
  if (!source) return fallback;
  if (/^https?:\/\//i.test(source)) {
    try {
      const url = new URL(source);
      const name = url.pathname.split("/").filter(Boolean).pop();
      return name ? decodeURIComponent(name) : fallback;
    } catch {
      return fallback;
    }
  }
  const localPath = getLocalFilePath(source) || source;
  return localPath.split(/[\\/]/).pop() || fallback;
};

const BASE_PANEL_TABS = [
  { id: "trilha", label: "Trilha", icon: "format_list_bulleted" },
  { id: "notas", label: "Anotações", icon: "edit_note" },
  { id: "flashcards", label: "Flashcards", icon: "style" },
  { id: "recursos", label: "Materiais", icon: "folder_open" },
];

function PanelTabButton({ tab, activeTab, onClick }) {
  const active = tab.id === activeTab;
  return (
    <button
      className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-2 py-3 text-[11px] font-bold uppercase tracking-wide transition-all ${
        active
          ? "bg-[color:var(--primary)] text-white shadow-[0_10px_24px_rgba(139,92,246,0.22)]"
          : "text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-bright)] hover:text-[color:var(--primary)]"
      }`}
      type="button"
      onClick={() => onClick(tab.id)}
    >
      <Icon className="text-[18px]" name={tab.icon} />
      <span className="truncate">{tab.label}</span>
    </button>
  );
}

function EmptyState({ icon, title, text }) {
  return (
    <div className="flex min-h-[160px] flex-col items-center justify-center rounded-2xl border border-dashed border-[color:var(--outline-variant)]/70 bg-[color:var(--surface)]/50 p-6 text-center">
      <Icon
        className="mb-3 text-[32px] text-[color:var(--outline)]"
        name={icon}
      />
      <p className="font-semibold text-[color:var(--on-surface)]">{title}</p>
      <p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">
        {text}
      </p>
    </div>
  );
}

function LinkedCard({
  icon,
  title,
  count,
  description,
  actionLabel,
  onAction,
}) {
  return (
    <article className="flex min-h-[136px] flex-col justify-between rounded-2xl border border-[color:var(--outline-variant)]/45 bg-[color:var(--surface)]/70 p-5 shadow-[0_16px_42px_rgba(46,48,64,0.05)]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color:var(--primary)]/10 text-[color:var(--primary)]">
            <Icon className="text-[20px]" name={icon} />
          </span>
          <div>
            <h3 className="text-sm font-bold text-[color:var(--on-surface)]">
              {title}
            </h3>
            <p className="mt-1 text-xs font-medium text-[color:var(--on-surface-variant)]">
              {description}
            </p>
          </div>
        </div>
        <span className="rounded-full bg-[color:var(--surface-bright)] px-3 py-1 text-xs font-bold text-[color:var(--primary)]">
          {count}
        </span>
      </div>
      {onAction ? (
        <button
          className="mt-4 w-fit rounded-xl bg-[color:var(--primary)]/10 px-4 py-2 text-sm font-bold text-[color:var(--primary)] transition-colors hover:bg-[color:var(--primary)] hover:text-white"
          type="button"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      ) : null}
    </article>
  );
}

function LessonSummaryList({
  title,
  icon,
  items,
  emptyText,
  onItemClick,
  actionLabel,
  onAction,
  renderItemActions,
}) {
  return (
    <section className="rounded-[28px] border border-[color:var(--outline-variant)]/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(247,248,252,0.94))] dark:bg-[linear-gradient(180deg,var(--surface-bright),var(--surface-lowest))] p-5 shadow-[0_18px_44px_rgba(46,48,64,0.05)]">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-2xl bg-[color:var(--primary)]/10 text-[color:var(--primary)]">
            <Icon className="text-[18px]" name={icon} />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[color:var(--primary)]/80">
              Resumo da aula
            </p>
            <h3 className="mt-1 text-base font-bold text-[color:var(--on-surface)]">
              {title}
            </h3>
            <p className="mt-1 text-xs font-medium text-[color:var(--on-surface-variant)]">
              {items.length} itens vinculados
            </p>
          </div>
        </div>
        {onAction ? (
          <button
            className="shrink-0 rounded-full border border-[color:var(--primary)]/16 bg-[color:var(--primary)]/8 px-3 py-1.5 text-xs font-bold text-[color:var(--primary)] transition-colors hover:bg-[color:var(--primary)] hover:text-white"
            type="button"
            onClick={onAction}
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
      <div className="space-y-2">
        {items.length > 0 ? (
          items.map((item) => (
            <article
              key={item.id}
              className="rounded-2xl border border-[color:var(--outline-variant)]/28 bg-white/80 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition-colors hover:border-[color:var(--primary)]/35 hover:bg-[color:var(--primary)]/6 dark:bg-[color:var(--surface-high)] dark:shadow-none"
            >
              <button
                className="flex w-full items-start gap-3 text-left"
                type="button"
                onClick={() => onItemClick?.(item)}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[color:var(--primary)]/8 text-[color:var(--primary)]">
                  <Icon className="text-[18px]" name={item.icon || icon} />
                </span>
                <span className="min-w-0 flex-1 pt-0.5">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.14em] text-[color:var(--on-surface-variant)]/80">
                    Criacao vinculada
                  </span>
                  <span className="block truncate text-[15px] font-bold text-[color:var(--on-surface)]">
                    {item.title}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-[color:var(--on-surface-variant)]">
                    {item.subtitle}
                  </span>
                </span>
              </button>
              {renderItemActions ? (
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  {renderItemActions(item)}
                </div>
              ) : null}
            </article>
          ))
        ) : (
          <EmptyState
            icon={icon}
            title={emptyText}
            text="Ainda nao ha conteudos vinculados nesta aula."
          />
        )}
      </div>
    </section>
  );
}
function LessonLinkedItemModal({
  item,
  onClose,
  onEditNote,
  onSeekToTime,
  onToggleTaskStatus,
  onReviewDeck,
  onOpenDeckEditor,
  editingDeckCardId,
  editingDeckCardFront,
  editingDeckCardBack,
  onStartDeckCardEdit,
  onDeckCardFieldChange,
  onSaveDeckCardEdit,
  onCancelDeckCardEdit,
  onDeleteDeckCard,
}) {
  if (!item) return null;

  const renderTaskDate = (value) => {
    if (!value) return null;
    return value;
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <button
          aria-label="Fechar janela"
          className="absolute inset-0"
          type="button"
          onClick={onClose}
        />
        <motion.div
          className="relative z-10 flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[color:var(--background)] shadow-[0_24px_70px_rgba(17,17,23,0.34)]"
          initial={{ y: 24, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 24, opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          <div className="flex items-start justify-between gap-4 border-b border-[color:var(--outline-variant)]/35 bg-[color:var(--surface)] px-6 py-5">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--primary)]">
                {item.type === "note"
                  ? "Anotação vinculada"
                  : item.type === "deck"
                    ? "Flashcards vinculados"
                    : "Tarefa vinculada"}
              </p>
              <h3 className="mt-2 truncate text-2xl font-bold text-[color:var(--on-surface)]">
                {item.title}
              </h3>
              {item.meta ? (
                <p className="mt-2 text-sm text-[color:var(--on-surface-variant)]">
                  {item.meta}
                </p>
              ) : null}
            </div>
            <button
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[color:var(--outline-variant)]/45 bg-[color:var(--background)] text-[color:var(--on-surface-variant)] transition-colors hover:text-[color:var(--error)]"
              type="button"
              onClick={onClose}
            >
              <Icon className="text-[20px]" name="close" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-6 custom-scrollbar">
            {item.type === "note" ? (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className="rounded-full bg-[color:var(--primary)] px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90"
                    type="button"
                    onClick={() => onEditNote?.(item)}
                  >
                    Editar anotação
                  </button>
                  {item.timestamp !== null && item.timestamp !== undefined ? (
                    <button
                      className="rounded-full bg-[color:var(--primary)]/10 px-4 py-2 text-sm font-bold text-[color:var(--primary)] transition-colors hover:bg-[color:var(--primary)] hover:text-white"
                      type="button"
                      onClick={() => onSeekToTime?.(item.timestamp)}
                    >
                      Ir para {item.time}
                    </button>
                  ) : null}
                  {item.module ? (
                    <span className="rounded-full bg-[color:var(--surface)] px-4 py-2 text-sm font-semibold text-[color:var(--on-surface-variant)]">
                      {item.module}
                    </span>
                  ) : null}
                </div>
                <div className="min-h-[280px] overflow-hidden rounded-[26px] border border-[color:var(--outline-variant)]/35 bg-[color:var(--surface)]">
                  <RichTextEditor
                    content={item.content || ""}
                    onChange={() => {}}
                    onTimeClick={onSeekToTime}
                    readOnly
                  />
                </div>
              </div>
            ) : null}

            {item.type === "deck" ? (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[color:var(--primary)]/10 px-4 py-2 text-sm font-bold text-[color:var(--primary)]">
                    {item.cards?.length || 0} cartoes
                  </span>
                  <button
                    className="rounded-full bg-[color:var(--primary)] px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90"
                    type="button"
                    onClick={() => onReviewDeck?.(item)}
                  >
                    Revisar
                  </button>
                  <button
                    className="rounded-full border border-[color:var(--outline-variant)]/45 bg-[color:var(--surface)] px-4 py-2 text-sm font-bold text-[color:var(--on-surface)] transition-colors hover:text-[color:var(--primary)]"
                    type="button"
                    onClick={() => onOpenDeckEditor?.(item)}
                  >
                    Editor completo
                  </button>
                </div>
                {item.cards?.length ? (
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {item.cards.map((card, index) => (
                      <article
                        key={card.id}
                        className="rounded-[24px] border border-[color:var(--outline-variant)]/35 bg-[color:var(--surface)] p-5"
                      >
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[color:var(--primary)]">
                          Cartao {index + 1}
                        </p>
                        <div className="mt-4 space-y-4">
                          {editingDeckCardId === card.id ? (
                            <>
                              <div>
                                <p className="text-xs font-bold uppercase tracking-wide text-[color:var(--on-surface-variant)]">
                                  Frente
                                </p>
                                <textarea
                                  className="mt-2 min-h-[96px] w-full rounded-2xl border border-[color:var(--outline-variant)]/40 bg-[color:var(--background)] px-4 py-3 text-sm text-[color:var(--on-surface)] outline-none focus:border-[color:var(--primary)]"
                                  value={editingDeckCardFront}
                                  onChange={(event) =>
                                    onDeckCardFieldChange?.("front", event.target.value)
                                  }
                                />
                              </div>
                              <div>
                                <p className="text-xs font-bold uppercase tracking-wide text-[color:var(--tertiary)]">
                                  Verso
                                </p>
                                <textarea
                                  className="mt-2 min-h-[120px] w-full rounded-2xl border border-[color:var(--outline-variant)]/40 bg-[color:var(--background)] px-4 py-3 text-sm text-[color:var(--on-surface)] outline-none focus:border-[color:var(--primary)]"
                                  value={editingDeckCardBack}
                                  onChange={(event) =>
                                    onDeckCardFieldChange?.("back", event.target.value)
                                  }
                                />
                              </div>
                              <div className="flex flex-wrap justify-end gap-2">
                                <button
                                  className="rounded-full px-4 py-2 text-sm font-bold text-[color:var(--on-surface-variant)] transition-colors hover:text-[color:var(--error)]"
                                  type="button"
                                  onClick={onCancelDeckCardEdit}
                                >
                                  Cancelar
                                </button>
                                <button
                                  className="rounded-full bg-[color:var(--primary)] px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90"
                                  type="button"
                                  onClick={() => onSaveDeckCardEdit?.(item.id, card.id)}
                                >
                                  Salvar
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              <div>
                                <p className="text-xs font-bold uppercase tracking-wide text-[color:var(--on-surface-variant)]">
                                  Frente
                                </p>
                                <p className="mt-2 text-sm leading-7 text-[color:var(--on-surface)]">
                                  {card.front || "Sem frente"}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs font-bold uppercase tracking-wide text-[color:var(--tertiary)]">
                                  Verso
                                </p>
                                <p className="mt-2 text-sm leading-7 text-[color:var(--on-surface-variant)]">
                                  {card.back || "Sem verso"}
                                </p>
                              </div>
                              <div className="flex flex-wrap justify-end gap-2">
                                <button
                                  className="rounded-full border border-[color:var(--outline-variant)]/45 bg-[color:var(--background)] px-4 py-2 text-sm font-bold text-[color:var(--on-surface)] transition-colors hover:text-[color:var(--primary)]"
                                  type="button"
                                  onClick={() => onStartDeckCardEdit?.(card)}
                                >
                                  Editar
                                </button>
                                <button
                                  className="rounded-full border border-[color:var(--outline-variant)]/45 bg-[color:var(--background)] px-4 py-2 text-sm font-bold text-[color:var(--error)] transition-colors hover:bg-[color:var(--error)] hover:text-white"
                                  type="button"
                                  onClick={() => onDeleteDeckCard?.(item.id, card.id)}
                                >
                                  Excluir
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon="style"
                    title="Baralho vazio"
                    text="Este baralho foi criado, mas ainda nao possui cartoes."
                  />
                )}
              </div>
            ) : null}

            {item.type === "task" ? (
              <div className="space-y-5">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-[color:var(--surface)] px-4 py-2 text-sm font-semibold text-[color:var(--on-surface-variant)]">
                    {item.status || "pending"}
                  </span>
                  <button
                    className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${item.status === "completed" ? "border border-[color:var(--outline-variant)]/45 bg-[color:var(--background)] text-[color:var(--on-surface-variant)] hover:text-[color:var(--primary)]" : "bg-[color:var(--success)] text-white hover:opacity-90"}`}
                    type="button"
                    onClick={() => onToggleTaskStatus?.(item)}
                  >
                    {item.status === "completed" ? "Reabrir tarefa" : "Marcar como concluida"}
                  </button>
                  <span className="rounded-full bg-[color:var(--surface)] px-4 py-2 text-sm font-semibold text-[color:var(--on-surface-variant)]">
                    Prioridade {item.priority || "medium"}
                  </span>
                  {renderTaskDate(item.dueDate) ? (
                    <span className="rounded-full bg-[color:var(--surface)] px-4 py-2 text-sm font-semibold text-[color:var(--on-surface-variant)]">
                      Prazo {renderTaskDate(item.dueDate)}
                    </span>
                  ) : null}
                </div>
                <section className="rounded-[24px] border border-[color:var(--outline-variant)]/35 bg-[color:var(--surface)] p-5">
                  <p className="text-xs font-bold uppercase tracking-wide text-[color:var(--primary)]">
                    Descrição
                  </p>
                  <p className="mt-3 text-sm leading-7 text-[color:var(--on-surface-variant)]">
                    {item.description || "Sem descrição"}
                  </p>
                </section>
                {item.notes ? (
                  <section className="overflow-hidden rounded-[24px] border border-[color:var(--outline-variant)]/35 bg-[color:var(--surface)]">
                    <div className="border-b border-[color:var(--outline-variant)]/35 px-5 py-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-[color:var(--primary)]">
                        Notas da tarefa
                      </p>
                    </div>
                    <div className="min-h-[220px]">
                      <RichTextEditor
                        content={item.notes}
                        onChange={() => {}}
                        onTimeClick={onSeekToTime}
                        readOnly
                      />
                    </div>
                  </section>
                ) : null}
                {item.subtasks?.length ? (
                  <section className="rounded-[24px] border border-[color:var(--outline-variant)]/35 bg-[color:var(--surface)] p-5">
                    <p className="text-xs font-bold uppercase tracking-wide text-[color:var(--primary)]">
                      Subtarefas
                    </p>
                    <div className="mt-4 space-y-3">
                      {item.subtasks.map((subtask) => (
                        <div
                          key={subtask.id}
                          className="flex items-center gap-3 rounded-2xl bg-[color:var(--background)] px-4 py-3"
                        >
                          <Icon
                            className={
                              subtask.completed
                                ? "text-[color:var(--success)]"
                                : "text-[color:var(--outline)]"
                            }
                            filled={subtask.completed}
                            name={
                              subtask.completed
                                ? "check_circle"
                                : "radio_button_unchecked"
                            }
                          />
                          <span className="text-sm text-[color:var(--on-surface)]">
                            {subtask.title || "Subtarefa sem título"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            ) : null}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export function LessonScreen({ onNavigate }) {
  const mediaRef = useRef(null);
  const [hubTab, setHubTab] = useState("notas");
  const [activeTab, setActiveTab] = useState("trilha");
  const [isPanelOpen, setIsPanelOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return false;
  });
  const [noteDraft, dispatchNoteDraft] = useReducer(
    lessonNoteDraftReducer,
    null,
    () => createLessonNoteDraft(null),
  );
  const [flashcardFront, setFlashcardFront] = useState("");
  const [flashcardBack, setFlashcardBack] = useState("");
  const [selectedDeckId, setSelectedDeckId] = useState("");
  const [isCreatingDeck, setIsCreatingDeck] = useState(false);
  const [newDeckTitle, setNewDeckTitle] = useState("");
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [showAddMediaModal, setShowAddMediaModal] = useState(false);
  const [showLessonShareModal, setShowLessonShareModal] = useState(false);
  const [newMediaLink, setNewMediaLink] = useState("");
  const [newMediaTitle, setNewMediaTitle] = useState("");
  const [newMediaType, setNewMediaType] = useState("youtube");
  const [newMediaFilePath, setNewMediaFilePath] = useState("");
  const [showCompletionPopup, setShowCompletionPopup] = useState(false);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    status: "pending",
    priority: "medium",
    dueDate: "",
    category: "",
    type: "task",
    estimatedMinutes: 25,
  });
  const [selectedPanelItem, setSelectedPanelItem] = useState(null);
  const [editingDeckCardId, setEditingDeckCardId] = useState(null);
  const [editingDeckCardFront, setEditingDeckCardFront] = useState("");
  const [editingDeckCardBack, setEditingDeckCardBack] = useState("");
  const [showLanguageLab, setShowLanguageLab] = useState(false);
  const [guidedPdfMedia, setGuidedPdfMedia] = useState(null);
  const [selectedHubMedia, setSelectedHubMedia] = useState(null);

  const activeCourseId = useStudyStore((state) => state.activeCourseId);
  const activeModuleId = useStudyStore((state) => state.activeModuleId);
  const activeLessonId = useStudyStore((state) => state.activeLessonId);
  const setActiveDeck = useStudyStore((state) => state.setActiveDeck);
  const courses = useStudyStore((state) => state.courses);
  const flashcardDecks = useStudyStore((state) => state.flashcardDecks);
  const notesList = useStudyStore((state) => state.notes?.list || []);
  const tasksList = useStudyStore((state) => state.tasks?.list || []);
  const updateTask = useStudyStore((state) => state.updateTask);
  const updateFlashcard = useStudyStore((state) => state.updateFlashcard);
  const deleteFlashcard = useStudyStore((state) => state.deleteFlashcard);
  const immersionSeekTo = useStudyStore((state) => state.immersionSeekTo);
  const clearImmersionSeek = useStudyStore((state) => state.clearImmersionSeek);
  const toggleLessonComplete = useStudyStore(
    (state) => state.toggleLessonComplete,
  );
  const noteText =
    noteDraft.lessonId === activeLessonId ? noteDraft.content : "";
  const noteTitle =
    noteDraft.lessonId === activeLessonId ? noteDraft.title : "";
  const setNoteText = (content) =>
    dispatchNoteDraft({ type: "contentChanged", content });
  const setNoteTitle = (title) =>
    dispatchNoteDraft({ type: "titleChanged", title });

  const activeCourse = courses.find((course) => course.id === activeCourseId);
  const activeModule = activeCourse?.modules?.find(
    (module) => module.id === activeModuleId,
  );
  const sidebarLessons = activeModule?.lessons || activeCourse?.lessons || [];
  const data =
    sidebarLessons.find((lesson) => lesson.id === activeLessonId) || {};
  const currentLessonIndex = sidebarLessons.findIndex(
    (lesson) => lesson.id === activeLessonId,
  );
  const hasPrev = currentLessonIndex > 0;
  const hasNext =
    currentLessonIndex >= 0 && currentLessonIndex < sidebarLessons.length - 1;

  const relatedNotes = notesList.filter(
    (note) => !note.parentNoteId && note.sourceLessonId === activeLessonId,
  );
  const relatedDecks = flashcardDecks.filter(
    (deck) => deck.sourceLessonId === activeLessonId,
  );
  const relatedTasks = tasksList.filter(
    (task) => task.sourceLessonId === activeLessonId,
  );

  const handleCreateNestedNoteInLesson = (title = "Nova nota interna") => {
    const childId = `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const store = useStudyStore.getState();
    const vaultId = activeCourseId ? `course-${activeCourseId}` : "global";
    store.setActiveVaultId?.(vaultId);
    store.addNote({
      id: childId,
      title: title || "Nova nota interna",
      content: "",
      markdownContent: "",
      parentNoteId: noteDraft.noteId || null,
      sourceKind: "nested-note",
      itemType: "note",
      category: "Nota interna",
      vaultId,
      sourceCourseId: activeCourseId || null,
      sourceModuleId: activeModuleId || null,
      sourceLessonId: activeLessonId || null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return childId;
  };

  const handleNestedNoteClickInLesson = (childId) => {
    if (!childId) return;
    const store = useStudyStore.getState();
    const vaultId = activeCourseId ? `course-${activeCourseId}` : "global";
    store.setActiveVaultId?.(vaultId);
    store.setActiveNote(childId);
    onNavigate?.(SCREEN_IDS.NOTE_EDITOR);
  };
  const relatedDrawing = data.drawing
    ? [
        {
          id: "drawing",
          title: "Desenho da aula",
          subtitle: "Lousa salva desta aula",
          icon: "draw",
        },
      ]
    : [];
  const lessonNotes = [...relatedNotes];
  const lessonDecks = [...relatedDecks];
  const lessonTasks = [...relatedTasks];
  const lessonResources = [
    ...(data.pdfPath
      ? [
          {
            id: "pdf",
            title: "PDF principal",
            subtitle: getDisplayFileName(data.pdfPath, "PDF principal"),
            icon: "picture_as_pdf",
          },
        ]
      : []),
    ...(data.audioPath
      ? [
          {
            id: "audio",
            title: "Áudio principal",
            subtitle: data.audioPath,
            icon: "headphones",
          },
        ]
      : []),
    ...(data.filePath
      ? [
          {
            id: "video",
            title: "Arquivo principal",
            subtitle: data.filePath,
            icon: "movie",
          },
        ]
      : []),
    ...(data.youtubeUrl
      ? [
          {
            id: "youtube",
            title: "Link do YouTube",
            subtitle: data.youtubeUrl,
            icon: "smart_display",
          },
        ]
      : []),
    ...(data.externalUrl
      ? [
          {
            id: "external",
            title: "Conteúdo externo",
            subtitle: data.externalUrl,
            icon: "link",
          },
        ]
      : []),
    ...(data.extraMedia || []).map((media) => ({
      id: media.id,
      title: media.title,
      subtitle:
        media.type === "youtube" || /^https?:\/\//i.test(media.url || "")
          ? media.url
          : getDisplayFileName(media.url, media.title || "Arquivo"),
      icon: getMediaIcon(media.type),
    })),
  ];

  const allMedia = [];
  if (data.externalUrl)
    allMedia.push({
      id: "external",
      type: "external",
      url: data.externalUrl,
      title: "Conteúdo externo",
    });
  if (data.youtubeUrl)
    allMedia.push({
      id: "yt",
      type: "youtube",
      url: data.youtubeUrl,
      title: "Vídeo principal",
    });
  if (data.filePath)
    allMedia.push({
      id: "local",
      type: "local_video",
      url: data.filePath,
      title: "Vídeo local",
    });
  if (data.pdfPath)
    allMedia.push({
      id: "pdf",
      type: "pdf",
      url: data.pdfPath,
      title: "Material PDF",
    });
  if (data.audioPath)
    allMedia.push({
      id: "audio",
      type: "audio",
      url: data.audioPath,
      title: "Áudio",
    });
  if (data.extraMedia?.length) {
    allMedia.push(
      ...data.extraMedia.map((media) => ({
        ...media,
        type: media.type || "youtube",
      })),
    );
  }

  const currentMedia = allMedia[activeMediaIndex] || null;
  const selectedModalItem =
    selectedPanelItem?.type === "note"
      ? relatedNotes.find((note) => note.id === selectedPanelItem.id)
      : selectedPanelItem?.type === "deck"
        ? relatedDecks.find((deck) => deck.id === selectedPanelItem.id)
        : selectedPanelItem?.type === "task"
          ? relatedTasks.find((task) => task.id === selectedPanelItem.id)
          : null;
  const hubMode = isHubLesson(data);
  const lessonProgress =
    sidebarLessons.length > 0 && currentLessonIndex >= 0
      ? Math.round(((currentLessonIndex + 1) / sidebarLessons.length) * 100)
      : 0;

  const displayPanelTabs = hubMode
    ? [{ id: "trilha", label: "Trilha", icon: "format_list_bulleted" }]
    : BASE_PANEL_TABS;

  useEffect(() => {
    setActiveMediaIndex(0);
    setGuidedPdfMedia(null);
  }, [data.id]);

  useEffect(() => {
    dispatchNoteDraft({ type: "lessonChanged", lessonId: activeLessonId });
  }, [activeLessonId]);

  useEffect(() => {
    if (!displayPanelTabs.some((t) => t.id === activeTab)) {
      setActiveTab("trilha");
    }
  }, [displayPanelTabs, activeTab]);

  useEffect(() => {
    if (immersionSeekTo === null || immersionSeekTo === undefined) return;

    const mediaElement = mediaRef.current;
    if (!mediaElement) return;

    const applySeek = () => {
      mediaElement.currentTime = immersionSeekTo;
      clearImmersionSeek();
      mediaElement
        .play()
        .catch((error) => console.error("Error playing media:", error));
    };

    if (mediaElement.readyState >= 1) {
      applySeek();
      return;
    }

    mediaElement.addEventListener("loadedmetadata", applySeek, { once: true });
    return () =>
      mediaElement.removeEventListener("loadedmetadata", applySeek);
  }, [immersionSeekTo, currentMedia?.id, clearImmersionSeek]);

  useEffect(() => {
    if (!selectedPanelItem) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setSelectedPanelItem(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedPanelItem]);

  useEffect(() => {
    setEditingDeckCardId(null);
    setEditingDeckCardFront("");
    setEditingDeckCardBack("");
  }, [selectedPanelItem?.id, selectedPanelItem?.type]);

  const getCurrentTime = () => {
    if (mediaRef.current) return mediaRef.current.currentTime;
    return null;
  };

  const handleTimeClick = (time) => {
    if (mediaRef.current) {
      mediaRef.current.currentTime = time;
      mediaRef.current
        .play()
        .catch((error) => console.error("Error playing media:", error));
      return;
    }

    alert(
      "A marcação de tempo funciona diretamente com vídeos locais e áudio. Para YouTube, é preciso integração extra com a API.",
    );
  };

  const goNext = () => {
    if (hasNext) {
      useStudyStore
        .getState()
        .setActiveLesson(sidebarLessons[currentLessonIndex + 1].id);
    }
  };

  const goPrev = () => {
    if (hasPrev) {
      useStudyStore
        .getState()
        .setActiveLesson(sidebarLessons[currentLessonIndex - 1].id);
    }
  };

  const completeLesson = () => {
    if (!activeCourseId || !activeModuleId || !activeLessonId) return;

    const isCompleting = data.status !== "completed";
    toggleLessonComplete(activeCourseId, activeModuleId, activeLessonId);

    if (isCompleting) {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ["#8b5cf6", "#a78bfa", "#c084fc", "#16a34a"],
      });
      setShowCompletionPopup(true);
    }
  };

  const toggleTaskStatus = (task) => {
    if (!task?.id) return;
    const isCompleted = task.status === "completed";
    updateTask(task.id, {
      status: isCompleted ? "pending" : "completed",
      completedAt: isCompleted ? null : Date.now(),
    });
  };

  const openDeckReview = (deck) => {
    if (!deck?.id) return;
    setActiveDeck(deck.id);
    setSelectedPanelItem(null);
    onNavigate?.(SCREEN_IDS.FLASHCARDS);
  };

  const openDeckEditor = (deck) => {
    if (!deck?.id) return;
    setActiveDeck(deck.id);
    setSelectedPanelItem(null);
    onNavigate?.(SCREEN_IDS.CREATE_FLASHCARDS);
  };

  const startDeckCardEdit = (card) => {
    setEditingDeckCardId(card.id);
    setEditingDeckCardFront(card.front || "");
    setEditingDeckCardBack(card.back || "");
  };

  const cancelDeckCardEdit = () => {
    setEditingDeckCardId(null);
    setEditingDeckCardFront("");
    setEditingDeckCardBack("");
  };

  const saveDeckCardEdit = (deckId, cardId) => {
    if (!deckId || !cardId) return;
    updateFlashcard(deckId, cardId, {
      front: editingDeckCardFront,
      back: editingDeckCardBack,
    });
    cancelDeckCardEdit();
  };

  const handleDeleteDeckCard = (deckId, cardId) => {
    if (!deckId || !cardId) return;
    if (!window.confirm("Excluir este cartao?")) return;
    deleteFlashcard(deckId, cardId);
    if (editingDeckCardId === cardId) {
      cancelDeckCardEdit();
    }
  };

  const saveNote = () => {
    const operation = prepareLessonNoteSave({
      draft: noteDraft,
      lesson: data,
      courseId: activeCourseId,
      moduleId: activeModuleId,
      moduleTitle: activeModule?.title,
      currentTime: getCurrentTime(),
      newNoteId: `lesson-note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    });
    if (!operation) return;

    const store = useStudyStore.getState();
    if (operation.kind === "update") {
      store.updateNote(operation.noteId, operation.values);
    } else {
      store.addNote(operation.values);
    }
    dispatchNoteDraft({
      type: "saved",
      noteId: operation.noteId,
      title: operation.values.title,
    });
  };

  // Auto-save lesson note debounced (800ms after typing stops when draft is dirty)
  useEffect(() => {
    if (!noteDraft?.isDirty) return;
    const hasContent = Boolean(
      stripHtml(noteDraft.content) || (noteDraft.drawings && noteDraft.drawings.length)
    );
    if (!hasContent) return;

    const timer = setTimeout(() => {
      saveNote();
    }, 800);

    return () => clearTimeout(timer);
  }, [noteDraft?.content, noteDraft?.title, noteDraft?.drawings, noteDraft?.isDirty]);

  // Flush unsaved draft changes on unmount or lesson navigation
  const noteDraftRef = useRef(noteDraft);
  useEffect(() => {
    noteDraftRef.current = noteDraft;
  }, [noteDraft]);

  useEffect(() => {
    return () => {
      const current = noteDraftRef.current;
      if (
        current?.isDirty &&
        (stripHtml(current.content) || (current.drawings && current.drawings.length))
      ) {
        const operation = prepareLessonNoteSave({
          draft: current,
          lesson: data,
          courseId: activeCourseId,
          moduleId: activeModuleId,
          moduleTitle: activeModule?.title,
          currentTime: getCurrentTime(),
          newNoteId: `lesson-note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        });
        if (operation) {
          const store = useStudyStore.getState();
          if (operation.kind === "update") {
            store.updateNote(operation.noteId, operation.values);
          } else {
            store.addNote(operation.values);
          }
        }
      }
    };
  }, []);

  const startNewNote = () => {
    dispatchNoteDraft({ type: "newNote" });
    setSelectedPanelItem(null);
  };

  const editNote = (note) => {
    dispatchNoteDraft({
      type: "noteOpened",
      lessonId: activeLessonId,
      note,
    });
    setSelectedPanelItem(null);
    if (!hubMode) {
      setActiveTab("notas");
      setIsPanelOpen(true);
    }
  };

  const createDeck = () => {
    if (!newDeckTitle.trim()) return;

    const newDeckId = `deck-${Date.now()}`;
    useStudyStore.getState().addFlashcardDeck({
      id: newDeckId,
      title: newDeckTitle,
      description: "Criado na aula",
      color: "var(--primary)",
      icon: "school",
      sourceCourseId: activeCourseId,
      sourceModuleId: activeModuleId,
      sourceLessonId: activeLessonId,
    });
    setSelectedDeckId(newDeckId);
    setIsCreatingDeck(false);
    setNewDeckTitle("");
  };

  const addFlashcard = () => {
    if (!flashcardFront.trim() || !flashcardBack.trim()) {
      alert("Preencha Frente e Verso!");
      return;
    }

    let targetDeckId = selectedDeckId;
    const store = useStudyStore.getState();

    if (!targetDeckId) {
      const courseTitle = activeCourse?.title || "Baralho Geral";
      const existingDeck = store.flashcardDecks.find(
        (deck) => deck.title === courseTitle,
      );

      if (existingDeck) {
        targetDeckId = existingDeck.id;
      } else {
        targetDeckId = `deck-${Date.now()}`;
        store.addFlashcardDeck({
          id: targetDeckId,
          title: courseTitle,
          description: "Criado automaticamente.",
          color: "var(--primary)",
          icon: "school",
          sourceCourseId: activeCourseId,
          sourceModuleId: activeModuleId,
          sourceLessonId: activeLessonId,
        });
      }

      setSelectedDeckId(targetDeckId);
    }

    store.addFlashcard(targetDeckId, {
      front: flashcardFront,
      back: flashcardBack,
      sourceLessonId: activeLessonId,
    });
    setFlashcardFront("");
    setFlashcardBack("");
    alert("Flashcard adicionado!");
  };

  const addExtraMedia = () => {
    const resourceValue =
      newMediaType === "youtube"
        ? newMediaLink.trim()
        : newMediaFilePath.trim();
    if (!resourceValue) return;

    const newMedia = {
      id: `extra-${Date.now()}`,
      type: newMediaType,
      url: resourceValue,
      title:
        newMediaTitle.trim() ||
        (newMediaType === "pdf"
          ? `PDF extra ${(data.extraMedia?.length || 0) + 1}`
          : newMediaType === "audio"
            ? `Áudio extra ${(data.extraMedia?.length || 0) + 1}`
            : newMediaType === "local_file"
              ? `Arquivo extra ${(data.extraMedia?.length || 0) + 1}`
              : `Recurso extra ${(data.extraMedia?.length || 0) + 1}`),
    };
    const updatedExtra = [...(data.extraMedia || []), newMedia];
    useStudyStore
      .getState()
      .updateLesson(activeCourseId, activeModuleId, activeLessonId, {
        extraMedia: updatedExtra,
      });
    setNewMediaLink("");
    setNewMediaTitle("");
    setNewMediaType("youtube");
    setNewMediaFilePath("");
    setActiveMediaIndex(allMedia.length);
  };

  const pickLessonResourceFile = async (type) => {
    if (!window.studyhubDesktop?.selectFile) {
      alert("A seleção nativa de arquivos só funciona no app Desktop.");
      return;
    }

    const filters =
      type === "audio"
        ? [{ name: "Áudio", extensions: ["mp3", "wav", "ogg", "m4a"] }]
        : type === "pdf"
          ? [{ name: "PDF", extensions: ["pdf"] }]
          : [{ name: "Arquivos", extensions: ["*"] }];

    const selectedPath = await window.studyhubDesktop.selectFile({ filters });
    if (selectedPath) {
      setNewMediaFilePath(selectedPath);
      setNewMediaLink(selectedPath);
    }
  };

  const removeExtraMedia = (mediaId) => {
    const updatedExtra = (data.extraMedia || []).filter(
      (media) => media.id !== mediaId,
    );
    useStudyStore
      .getState()
      .updateLesson(activeCourseId, activeModuleId, activeLessonId, {
        extraMedia: updatedExtra,
      });
    setActiveMediaIndex((index) =>
      Math.max(0, Math.min(index, allMedia.length - 2)),
    );
  };

  const openWhiteboard = () => {
    if (window.studyhubDesktop?.openWhiteboardWindow) {
      window.studyhubDesktop.openWhiteboardWindow({
        courseId: activeCourseId,
        moduleId: activeModuleId,
        lessonId: activeLessonId,
      });
    } else {
      // In the browser, reuse the current app window instead of requiring a
      // native Electron child window.
      onNavigate?.(SCREEN_IDS.WHITEBOARD);
    }
  };

  const updateLanguageLesson = (updates) => {
    if (!activeCourseId || !activeModuleId || !activeLessonId) return;
    const store = useStudyStore.getState();
    const currentLesson = store.courses
      .find((course) => course.id === activeCourseId)
      ?.modules?.find((module) => module.id === activeModuleId)
      ?.lessons?.find((lesson) => lesson.id === activeLessonId);
    store.updateLesson(activeCourseId, activeModuleId, activeLessonId, {
      ...updates,
      ...(updates?.languageLab
        ? {
            languageLab: {
              ...(currentLesson?.languageLab || {}),
              ...updates.languageLab,
            },
          }
        : {}),
    });
  };

  const openGuidedPdf = (media) => {
    if (media?.type !== "pdf" || !media.url) return;
    mediaRef.current?.pause();
    setShowLanguageLab(false);
    setGuidedPdfMedia({
      id: media.id || "pdf",
      path: media.url,
      title: media.title || "Material PDF",
    });
  };

  const updateGuidedPdfState = (readingState) => {
    if (!activeCourseId || !activeModuleId || !activeLessonId || !guidedPdfMedia?.id) return;
    const store = useStudyStore.getState();
    const currentLesson = store.courses
      .find((course) => course.id === activeCourseId)
      ?.modules?.find((module) => module.id === activeModuleId)
      ?.lessons?.find((lesson) => lesson.id === activeLessonId);
    store.updateLesson(activeCourseId, activeModuleId, activeLessonId, {
      pdfReadingState: {
        ...(currentLesson?.pdfReadingState || {}),
        [guidedPdfMedia.id]: readingState,
      },
    });
  };

  const createLanguageFlashcard = async ({
    front,
    back,
    segment,
    audioClipPath,
    sourceMediaPath,
    sourceMediaKind,
  }) => {
    const store = useStudyStore.getState();
    let targetDeck = store.flashcardDecks.find(
      (deck) => deck.sourceLessonId === activeLessonId && deck.languageLab,
    );

    if (!targetDeck) {
      const deckId = `deck-language-${Date.now()}`;
      store.addFlashcardDeck({
        id: deckId,
        title: `Idiomas · ${data.title || "Aula"}`,
        deckTitle: `Idiomas · ${data.title || "Aula"}`,
        category: activeCourse?.title || "Idiomas",
        eyebrow: "Mineração de frases",
        description: "Frases criadas a partir do Modo Idiomas.",
        languageLab: true,
        sourceCourseId: activeCourseId,
        sourceModuleId: activeModuleId,
        sourceLessonId: activeLessonId,
        sourceLessonTitle: data.title || "Aula",
      });
      targetDeck = { id: deckId };
    }

    store.addFlashcard(targetDeck.id, {
      front,
      back,
      audioPath: audioClipPath || null,
      timestamp: segment?.start ?? null,
      transcriptSegmentId: segment?.id || null,
      sourceRange: segment
        ? { start: segment.start, end: segment.end }
        : null,
      sourceMediaPath,
      sourceMediaKind,
      sourceCourseId: activeCourseId,
      sourceModuleId: activeModuleId,
      sourceLessonId: activeLessonId,
      sourceLessonTitle: data.title || "Aula",
    });
  };

  const openWebResource = (url) => {
    if (!url) return;
    const normalizedUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    if (window.studyhubDesktop?.openExternal) {
      window.studyhubDesktop.openExternal(normalizedUrl);
    } else {
      window.open(normalizedUrl, "_blank", "noopener,noreferrer");
    }
  };

  const handleHubMedia = (media, index) => {
    setSelectedHubMedia(media);
    setActiveMediaIndex(index);
    setHubTab("materiais");
  };

  const primaryHubMedia =
    allMedia.find((media) => media.type === "external") ||
    allMedia.find((media) => media.type === "youtube") ||
    allMedia[0] ||
    null;

  const getHubMediaMeta = (media) => {
    if (media.type === "external" || media.type === "youtube") {
      try {
        return new URL(
          /^https?:\/\//i.test(media.url) ? media.url : `https://${media.url}`,
        ).hostname.replace(/^www\./, "");
      } catch {
        return "Link externo";
      }
    }
    if (media.type === "pdf") {
      return getDisplayFileName(media.url, "PDF");
    }
    if (media.type === "audio") return "Arquivo de áudio";
    if (media.type === "local_video") return "Vídeo local";
    return "Arquivo da aula";
  };

  const getHubMediaAction = (media) => {
    if (media.type === "external" || media.type === "youtube") return "Abrir";
    if (media.type === "pdf") return "Abrir";
    return "Ver";
  };

  const renderMediaPlayer = () => {
    if (hubMode) {
      return (
        <div className="h-full w-full overflow-y-auto bg-[linear-gradient(160deg,rgba(139,92,246,0.13),rgba(139,92,246,0.025)_42%,transparent_70%)] p-4 text-[color:var(--on-surface)] custom-scrollbar sm:p-6">
          <div className="mx-auto flex min-h-full max-w-6xl flex-col gap-6 pb-20">
            <header className="overflow-hidden rounded-[28px] border border-[color:var(--primary)]/20 bg-[color:var(--surface)] shadow-[0_20px_55px_rgba(46,48,64,0.09)]">
              <div className="p-6 lg:p-8">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full bg-[color:var(--primary)]/12 px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.14em] text-[color:var(--primary)]">
                    <Icon className="text-[16px]" name="hub" />
                    Hub da aula
                  </span>
                </div>
                <h2 className="max-w-3xl text-2xl font-extrabold leading-tight text-[color:var(--on-surface)] sm:text-3xl">
                  {data.title || "Central de estudo da aula"}
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--on-surface-variant)] sm:text-[15px]">
                  {data.description ||
                    "Acesse o conteúdo principal e mantenha anotações, materiais e revisões desta aula em um só lugar."}
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-[color:var(--outline-variant)]/30 pt-6">
                  {primaryHubMedia ? (
                    <button
                      className="inline-flex items-center gap-2 rounded-2xl bg-[color:var(--primary)] px-5 py-3.5 text-sm font-extrabold text-white shadow-[0_14px_28px_rgba(139,92,246,0.24)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_34px_rgba(139,92,246,0.30)]"
                      type="button"
                      onClick={() =>
                        handleHubMedia(
                          primaryHubMedia,
                          allMedia.indexOf(primaryHubMedia),
                        )
                      }
                    >
                      <Icon className="text-[20px]" name="open_in_new" />
                      {primaryHubMedia.type === "external" ||
                      primaryHubMedia.type === "youtube"
                        ? "Abrir conteúdo"
                        : "Abrir primeiro material"}
                    </button>
                  ) : null}
                  <button
                    className="inline-flex items-center gap-2 rounded-2xl border border-[color:var(--outline-variant)]/55 bg-[color:var(--background)] px-5 py-3.5 text-sm font-bold text-[color:var(--on-surface)] transition-all hover:border-[color:var(--primary)]/45 hover:text-[color:var(--primary)]"
                    type="button"
                    onClick={() => setShowAddMediaModal(true)}
                  >
                    <Icon className="text-[20px]" name="add_link" />
                    Adicionar material
                  </button>

                  <div className="mx-2 hidden h-8 w-px bg-[color:var(--outline-variant)]/40 md:block" />

                  <button
                    className={`inline-flex items-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-bold transition-all ${
                      hubTab === "notas"
                        ? "bg-[color:var(--primary)]/10 text-[color:var(--primary)] border-[color:var(--primary)]/30 border"
                        : "border border-[color:var(--outline-variant)]/55 bg-[color:var(--background)] text-[color:var(--on-surface)] hover:border-[color:var(--primary)]/45 hover:text-[color:var(--primary)]"
                    }`}
                    type="button"
                    onClick={() => setHubTab("notas")}
                  >
                    <Icon className="text-[20px]" name="edit_note" />
                    Anotações
                  </button>

                  <button
                    className={`inline-flex items-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-bold transition-all ${
                      hubTab === "flashcards"
                        ? "bg-[color:var(--primary)]/10 text-[color:var(--primary)] border-[color:var(--primary)]/30 border"
                        : "border border-[color:var(--outline-variant)]/55 bg-[color:var(--background)] text-[color:var(--on-surface)] hover:border-[color:var(--primary)]/45 hover:text-[color:var(--primary)]"
                    }`}
                    type="button"
                    onClick={() => setHubTab("flashcards")}
                  >
                    <Icon className="text-[20px]" name="style" />
                    Flashcards
                  </button>

                  <button
                    className={`inline-flex items-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-bold transition-all ${
                      hubTab === "materiais"
                        ? "bg-[color:var(--primary)]/10 text-[color:var(--primary)] border-[color:var(--primary)]/30 border"
                        : "border border-[color:var(--outline-variant)]/55 bg-[color:var(--background)] text-[color:var(--on-surface)] hover:border-[color:var(--primary)]/45 hover:text-[color:var(--primary)]"
                    }`}
                    type="button"
                    onClick={() => setHubTab("materiais")}
                  >
                    <Icon className="text-[20px]" name="folder_open" />
                    Materiais
                  </button>

                  <button
                    className="inline-flex items-center gap-2 rounded-2xl border border-[color:var(--outline-variant)]/55 bg-[color:var(--background)] px-5 py-3.5 text-sm font-bold text-[color:var(--on-surface)] transition-all hover:border-[color:var(--primary)]/45 hover:text-[color:var(--primary)]"
                    type="button"
                    onClick={() => setShowAddTaskModal(true)}
                  >
                    <Icon className="text-[20px]" name="add_task" />
                    Tarefa
                  </button>
                </div>
              </div>
            </header>

            {selectedHubMedia && (
              <div className="min-h-[600px] h-[650px] overflow-hidden rounded-[28px] border border-[color:var(--outline-variant)]/45 bg-[color:var(--surface)] shadow-[0_16px_42px_rgba(46,48,64,0.06)] flex flex-col mb-6">
                <div className="flex items-center justify-between border-b border-[color:var(--outline-variant)]/30 bg-[color:var(--surface-container-low)] px-6 py-3 shrink-0">
                  <span className="text-sm font-bold text-[color:var(--on-surface)] flex items-center gap-2 truncate">
                    <Icon name={getMediaIcon(selectedHubMedia.type)} className="text-[18px] text-[color:var(--primary)] shrink-0" />
                    {selectedHubMedia.title || "Visualizador de Material"}
                  </span>
                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    {(selectedHubMedia.type === "external" || selectedHubMedia.type === "youtube" || selectedHubMedia.url?.startsWith("http")) && (
                      <button
                        type="button"
                        onClick={() => openWebResource(selectedHubMedia.url)}
                        className="text-xs font-bold text-[color:var(--primary)] hover:underline flex items-center gap-1"
                      >
                        <Icon name="open_in_new" className="text-[14px]" />
                        Abrir externamente
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedHubMedia(null)}
                      className="flex items-center gap-1 rounded-xl bg-[color:var(--surface)] border border-[color:var(--outline-variant)]/40 px-3 py-1 text-xs font-bold text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)] hover:bg-[color:var(--outline-variant)]/20 transition-colors shadow-sm"
                      title="Fechar visualizador"
                    >
                      <Icon name="close" className="text-[14px]" />
                      Fechar
                    </button>
                  </div>
                </div>

                <div className="flex-1 w-full h-full relative bg-black/5 overflow-hidden">
                  {selectedHubMedia.type === "pdf" ? (
                    <embed
                      className="h-full w-full border-none"
                      src={getLocalFileUrl(selectedHubMedia.url || selectedHubMedia.filePath || data.pdfPath)}
                      type="application/pdf"
                    />
                  ) : selectedHubMedia.type === "youtube" ? (
                    <iframe
                      className="h-full w-full border-none"
                      src={parseYoutubeUrl(selectedHubMedia.url)}
                      title={selectedHubMedia.title || "Vídeo do YouTube"}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  ) : selectedHubMedia.type === "local_video" || selectedHubMedia.type === "audio" ? (
                    <video
                      className="h-full w-full object-contain bg-black"
                      controls
                      autoPlay
                      src={getLocalFileUrl(selectedHubMedia.url || selectedHubMedia.filePath)}
                    />
                  ) : (
                    <iframe
                      className="h-full w-full border-none bg-white"
                      src={/^https?:\/\//i.test(selectedHubMedia.url) ? selectedHubMedia.url : `https://${selectedHubMedia.url}`}
                      title={selectedHubMedia.title || "Conteúdo Externo"}
                    />
                  )}
                </div>
              </div>
            )}

            <div className="flex-1">
              {hubTab === "notas" && (
                <div className="flex flex-col min-h-[850px] overflow-hidden rounded-[28px] border border-[color:var(--outline-variant)]/45 bg-[color:var(--surface)] shadow-[0_16px_42px_rgba(46,48,64,0.06)]">
                  <div className="border-b border-[color:var(--outline-variant)]/35 bg-[color:var(--surface)] p-5">
                    <input
                      className="w-full bg-transparent text-xl font-extrabold text-[color:var(--on-surface)] outline-none placeholder:text-[color:var(--on-surface-variant)]/40"
                      placeholder="Título da anotação da aula..."
                      type="text"
                      value={noteTitle}
                      onChange={(event) => setNoteTitle(event.target.value)}
                    />
                  </div>
                  <div className="flex-1 flex flex-col min-h-[700px]">
                    <RichTextEditor
                      key={`hub-note-${activeLessonId}-${noteDraft.noteId || 'new'}`}
                      content={noteText}
                      drawings={noteDraft.drawings || []}
                      onDrawingsChange={(drawings) =>
                        dispatchNoteDraft({ type: "drawingsChanged", drawings })
                      }
                      getCurrentTime={getCurrentTime}
                      onChange={setNoteText}
                      onTimeClick={handleTimeClick}
                      onCreateNestedNote={handleCreateNestedNoteInLesson}
                      onNestedNoteClick={handleNestedNoteClickInLesson}
                      placeholder="Escreva suas anotações principais aqui..."
                      documentMode={true}
                      displaySettings={{ maxWidth: 'full', lineMarking: 'none', pageLayout: 'infinite' }}
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--outline-variant)]/35 bg-[color:var(--surface)] p-5">
                    <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto custom-scrollbar">
                      {relatedNotes.map((note) => (
                        <button
                          key={note.id}
                          className={`max-w-[190px] shrink-0 truncate rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
                            note.id === noteDraft.noteId
                              ? "bg-[color:var(--primary)]/15 text-[color:var(--primary)]"
                              : "bg-[color:var(--background)] text-[color:var(--on-surface-variant)] hover:text-[color:var(--primary)]"
                          }`}
                          type="button"
                          onClick={() => editNote(note)}
                        >
                          {note.title}
                        </button>
                      ))}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {noteDraft.noteId ? (
                        <button
                          className="rounded-xl border border-[color:var(--outline-variant)]/55 px-4 py-2 text-sm font-bold text-[color:var(--on-surface-variant)] transition-colors hover:text-[color:var(--primary)]"
                          type="button"
                          onClick={startNewNote}
                        >
                          Nova anotação
                        </button>
                      ) : null}
                      <button
                        className="flex items-center gap-2 rounded-xl bg-[color:var(--primary)] px-5 py-2.5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(139,92,246,0.22)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={!stripHtml(noteText) || !noteDraft.isDirty}
                        type="button"
                        onClick={saveNote}
                      >
                        <Icon className="text-[17px]" name="save" />
                        {noteDraft.noteId ? "Salvar alterações" : "Salvar anotação"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {hubTab === "flashcards" && (
                <div className="grid gap-6">
                  <div className="rounded-[28px] border border-[color:var(--outline-variant)]/45 bg-[color:var(--surface)] p-6 shadow-[0_16px_42px_rgba(46,48,64,0.06)]">
                    <h3 className="mb-6 flex items-center gap-2 text-xl font-extrabold text-[color:var(--on-surface)]">
                      <Icon
                        className="text-[color:var(--primary)]"
                        name="style"
                      />
                      Novo Flashcard
                    </h3>
                    <div className="space-y-4">
                      <textarea
                        className="h-32 w-full resize-none rounded-2xl border border-[color:var(--outline-variant)]/45 bg-[color:var(--background)] p-4 text-[color:var(--on-surface)] outline-none transition-colors focus:border-[color:var(--primary)]"
                        placeholder="Pergunta ou conceito..."
                        value={flashcardFront}
                        onChange={(e) => setFlashcardFront(e.target.value)}
                      />
                      <textarea
                        className="h-32 w-full resize-none rounded-2xl border border-[color:var(--outline-variant)]/45 bg-[color:var(--background)] p-4 text-[color:var(--on-surface)] outline-none transition-colors focus:border-[color:var(--tertiary)]"
                        placeholder="Resposta ou explicação..."
                        value={flashcardBack}
                        onChange={(e) => setFlashcardBack(e.target.value)}
                      />
                      <button
                        className="w-full rounded-2xl bg-[color:var(--primary)] py-4 text-sm font-extrabold text-white shadow-[0_10px_24px_rgba(139,92,246,0.22)] transition-opacity hover:opacity-90"
                        type="button"
                        onClick={addFlashcard}
                      >
                        Adicionar cartão à aula
                      </button>
                    </div>
                  </div>

                  {relatedDecks.length > 0 && (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {relatedDecks.map((deck) => (
                        <button
                          key={deck.id}
                          className="group flex flex-col items-start gap-4 rounded-[28px] border border-[color:var(--outline-variant)]/45 bg-[color:var(--surface)] p-6 text-left transition-all hover:border-[color:var(--primary)]/45 hover:shadow-xl"
                          type="button"
                          onClick={() => openDeckReview(deck)}
                        >
                          <div className="flex w-full items-center justify-between">
                            <Icon
                              className="text-[28px] text-[color:var(--primary)]"
                              name="style"
                            />
                            <span className="rounded-full bg-[color:var(--primary)]/10 px-3 py-1 text-xs font-extrabold text-[color:var(--primary)]">
                              {deck.cards?.length || 0} cards
                            </span>
                          </div>
                          <h4 className="line-clamp-2 text-lg font-extrabold leading-tight">
                            {deck.title}
                          </h4>
                          <div className="mt-auto flex w-full items-center justify-between pt-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--on-surface-variant)]">
                              Revisar agora
                            </span>
                            <Icon
                              className="text-[18px] transition-transform group-hover:translate-x-1"
                              name="arrow_forward"
                            />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {hubTab === "materiais" && (
                <div className="grid gap-6">
                  <div className="rounded-[28px] border border-[color:var(--outline-variant)]/45 bg-[color:var(--surface)] p-6 shadow-[0_16px_42px_rgba(46,48,64,0.06)]">
                    <div className="mb-6 flex items-center justify-between">
                      <h3 className="flex items-center gap-2 text-xl font-extrabold text-[color:var(--on-surface)]">
                        <Icon
                          className="text-[color:var(--primary)]"
                          name="folder_open"
                        />
                        Materiais da Aula
                      </h3>
                      <button
                        className="rounded-xl bg-[color:var(--primary)]/10 px-4 py-2 text-xs font-bold text-[color:var(--primary)] hover:bg-[color:var(--primary)] hover:text-white"
                        type="button"
                        onClick={() => setShowAddMediaModal(true)}
                      >
                        Adicionar Material
                      </button>
                    </div>

                    {allMedia.length > 0 ? (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {allMedia.map((media, index) => (
                          <button
                            key={media.id}
                            className="group flex items-center gap-3 rounded-2xl border border-[color:var(--outline-variant)]/35 bg-[color:var(--background)] p-4 text-left transition-all hover:border-[color:var(--primary)]/45 hover:shadow-md"
                            type="button"
                            onClick={() => handleHubMedia(media, index)}
                          >
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[color:var(--primary)]/12 text-[color:var(--primary)]">
                              <Icon
                                className="text-[24px]"
                                name={getMediaIcon(media.type)}
                              />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-extrabold text-[color:var(--on-surface)]">
                                {media.title}
                              </p>
                              <p className="truncate text-[10px] uppercase tracking-wider text-[color:var(--on-surface-variant)]">
                                {getHubMediaMeta(media)}
                              </p>
                            </div>
                            <Icon
                              className="text-[18px] text-[color:var(--primary)] transition-transform group-hover:translate-x-1"
                              name="arrow_forward"
                            />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex min-h-[200px] flex-col items-center justify-center rounded-2xl border border-dashed border-[color:var(--outline-variant)]/60 bg-[color:var(--background)] p-8 text-center">
                        <Icon
                          className="mb-4 text-[40px] text-[color:var(--outline)]"
                          name="add_link"
                        />
                        <p className="text-sm font-extrabold text-[color:var(--on-surface)]">
                          Nenhum material conectado
                        </p>
                        <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">
                          Adicione links, vídeos ou PDFs para esta aula.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (currentMedia?.type === "youtube") {
      return (
        <div className="relative h-full w-full">
          <iframe
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="h-full w-full border-0"
            src={parseYoutubeUrl(currentMedia.url)}
            title={currentMedia.title}
          />
          <button
            className="absolute right-4 top-4 flex items-center gap-2 rounded-xl bg-black/70 px-4 py-2 text-sm font-bold text-white opacity-0 backdrop-blur-md transition-opacity hover:bg-black group-hover:opacity-100"
            type="button"
            onClick={() => {
              if (window.studyhubDesktop?.openExternal) {
                window.studyhubDesktop.openExternal(currentMedia.url);
              } else {
                window.open(currentMedia.url, "_blank");
              }
            }}
          >
            <Icon className="text-[16px]" name="open_in_new" />
            Abrir no YouTube
          </button>
        </div>
      );
    }

    if (currentMedia?.type === "local_video") {
      return (
        <video
          ref={mediaRef}
          className="h-full w-full bg-black object-contain outline-none"
          controls
          src={getLocalFileUrl(currentMedia.url)}
        />
      );
    }

    if (currentMedia?.type === "pdf") {
      return (
        <div className="flex h-full w-full items-center justify-center bg-[#eceef5] p-6">
          <div className="flex max-w-md flex-col items-center rounded-[28px] border border-[#dbe2ea] bg-white px-8 py-10 text-center shadow-[0_18px_44px_rgba(15,23,42,0.08)]">
            <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-[color:var(--primary)]/10 text-[color:var(--primary)]">
              <Icon className="text-[30px]" name="picture_as_pdf" />
            </span>
            <h3 className="mt-5 text-lg font-black text-[#0f172a]">
              {currentMedia.title || "Material PDF"}
            </h3>
            <p className="mt-2 text-sm leading-6 text-[#64748b]">
              Este PDF agora abre no visualizador padrão do Linux.
            </p>
            <button
              className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-[color:var(--primary)] px-5 py-3 text-sm font-extrabold text-white"
              type="button"
              onClick={() => {
                const filePath = getLocalFilePath(currentMedia.url);
                if (filePath && window.studyhubDesktop?.openPath) {
                  window.studyhubDesktop.openPath(filePath);
                }
              }}
            >
              <Icon className="text-[18px]" name="open_in_new" />
              Abrir PDF
            </button>
          </div>
        </div>
      );
    }

    if (currentMedia?.type === "audio") {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center bg-[#111117] text-white">
          <Icon className="mb-6 text-[64px] text-white/25" name="headphones" />
          <audio
            ref={mediaRef}
            className="w-[82%] outline-none"
            controls
            src={getLocalFileUrl(currentMedia.url)}
          />
        </div>
      );
    }

    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-[color:var(--surface-high)] text-[color:var(--on-surface-variant)]">
        <Icon className="mb-4 text-[64px]" name="movie" />
        <p className="font-medium">Nenhuma mídia associada a esta aula.</p>
      </div>
    );
  };

  const renderLessonItem = (lesson, index) => {
    const isCurrent = lesson.id === activeLessonId;
    const isCompleted = lesson.status === "completed";
    const isLocked = lesson.status === "locked";

    return (
      <button
        key={lesson.id}
        className={`group flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition-all ${
          isCurrent
            ? "border-[color:var(--primary)]/45 bg-[color:var(--primary)]/10"
            : "border-transparent bg-[color:var(--surface)]/70 hover:border-[color:var(--outline-variant)]/70 hover:bg-[color:var(--surface)]"
        } ${isLocked ? "opacity-60" : ""}`}
        disabled={isLocked}
        type="button"
        onClick={() => {
          useStudyStore.getState().setActiveLesson(lesson.id);
        }}
      >
        <span
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
            isCompleted
              ? "bg-[color:var(--success)]/12 text-[color:var(--success)]"
              : isCurrent
                ? "bg-[color:var(--primary)] text-white"
                : "bg-[color:var(--surface-bright)] text-[color:var(--on-surface-variant)] group-hover:text-[color:var(--primary)]"
          }`}
        >
          <Icon
            className="text-[17px]"
            filled={isCompleted || isCurrent}
            name={isCompleted ? "check" : isLocked ? "lock" : "play_arrow"}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={`line-clamp-2 text-sm font-bold ${isCurrent ? "text-[color:var(--primary)]" : "text-[color:var(--on-surface)]"}`}
          >
            {index + 1}. {lesson.title}
          </span>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-xs text-[color:var(--on-surface-variant)]">
              <Icon
                className="text-[14px]"
                name={
                  getLessonKind(lesson) === "Vídeo"
                    ? "smart_display"
                    : "description"
                }
              />
              {getLessonKind(lesson)} · {getLessonDuration(lesson)}
            </span>
            {isCurrent && (
              <button
                className={`flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[10px] font-extrabold uppercase tracking-wider transition-all ${
                  isCompleted
                    ? "bg-[color:var(--success)]/12 text-[color:var(--success)]"
                    : "bg-[color:var(--primary)] text-white shadow-sm hover:opacity-90"
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  completeLesson();
                }}
                type="button"
              >
                <Icon className="text-[14px]" filled={isCompleted} name="check_circle" />
                {isCompleted ? "Concluída" : "Concluir"}
              </button>
            )}
          </div>
        </span>
      </button>
    );
  };

  const renderPanelContent = () => {
    if (activeTab === "trilha") {
      return (
        <div className="flex h-full flex-col">
          <div className="border-b border-[color:var(--outline-variant)]/35 bg-[color:var(--surface)] px-5 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-[color:var(--primary)]">
                  Trilha do módulo
                </p>
                <h3 className="mt-1 truncate font-bold text-[color:var(--on-surface)]">
                  {activeModule?.title || "Aulas"}
                </h3>
              </div>
              <span className="shrink-0 rounded-full bg-[color:var(--primary)]/10 px-3 py-1 text-xs font-bold text-[color:var(--primary)]">
                {currentLessonIndex + 1}/{sidebarLessons.length}
              </span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-[color:var(--outline-variant)]/35">
              <div
                className="h-full rounded-full bg-[color:var(--primary)] transition-all"
                style={{ width: `${lessonProgress}%` }}
              />
            </div>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-4 custom-scrollbar">
            {sidebarLessons.map(renderLessonItem)}
          </div>
        </div>
      );
    }

    if (activeTab === "notas") {
      return (
        <div className="flex h-full min-h-0 flex-col">
          {selectedPanelItem?.type === "note" &&
          relatedNotes.some((note) => note.id === selectedPanelItem.id) ? (
            <div className="border-b border-[color:var(--outline-variant)]/35 bg-[color:var(--surface)] p-4">
              {(() => {
                const note = relatedNotes.find(
                  (item) => item.id === selectedPanelItem.id,
                );
                return note ? (
                  <div className="rounded-2xl border border-[color:var(--outline-variant)]/35 bg-[color:var(--background)] p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-[color:var(--primary)]">
                      Anotação aberta
                    </p>
                    <h4 className="mt-1 text-base font-bold text-[color:var(--on-surface)]">
                      {note.title}
                    </h4>
                    <p className="mt-2 text-sm text-[color:var(--on-surface-variant)]">
                      {stripHtml(note.content).slice(0, 220) || "Sem conteúdo"}
                    </p>
                  </div>
                ) : null;
              })()}
            </div>
          ) : null}
          <div className="border-b border-[color:var(--outline-variant)]/35 bg-[color:var(--surface)] p-4">
            <input
              className="w-full rounded-xl border border-[color:var(--outline-variant)]/45 bg-[color:var(--background)] px-4 py-3 font-semibold text-[color:var(--on-surface)] outline-none transition-colors placeholder:text-[color:var(--on-surface-variant)]/60 focus:border-[color:var(--primary)]"
              placeholder="Título da anotação..."
              type="text"
              value={noteTitle}
              onChange={(event) => setNoteTitle(event.target.value)}
            />
          </div>
          <div className="min-h-[550px] flex-1 flex flex-col bg-[color:var(--background)]">
            <RichTextEditor
              key={`panel-note-${activeLessonId}-${noteDraft.noteId || 'new'}`}
              content={noteText}
              drawings={noteDraft.drawings || []}
              onDrawingsChange={(drawings) =>
                dispatchNoteDraft({ type: "drawingsChanged", drawings })
              }
              getCurrentTime={getCurrentTime}
              onChange={setNoteText}
              onTimeClick={handleTimeClick}
              onCreateNestedNote={handleCreateNestedNoteInLesson}
              onNestedNoteClick={handleNestedNoteClickInLesson}
              placeholder="Digite suas notas aqui. Use o relógio para marcar o tempo do vídeo."
              documentMode={true}
              displaySettings={{ maxWidth: 'full', lineMarking: 'none', pageLayout: 'infinite' }}
            />
          </div>
          <div className="border-t border-[color:var(--outline-variant)]/35 bg-[color:var(--surface)] p-4">
            {relatedNotes.length > 0 ? (
              <div className="mb-3 flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                {relatedNotes.slice(0, 4).map((note) => (
                  <button
                    key={note.id}
                    className="max-w-[170px] shrink-0 truncate rounded-full bg-[color:var(--background)] px-3 py-1.5 text-xs font-semibold text-[color:var(--on-surface-variant)] hover:text-[color:var(--primary)]"
                    type="button"
                    onClick={() => editNote(note)}
                  >
                    {note.title}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-[color:var(--on-surface-variant)]">
                {noteDraft.isDirty ? (
                  <>
                    <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                    Salvando alterações...
                  </>
                ) : noteDraft.noteId ? (
                  <>
                    <Icon className="text-emerald-500 text-sm" name="cloud_done" />
                    Salvo automaticamente
                  </>
                ) : (
                  `${stripHtml(noteText).length} caracteres`
                )}
              </span>
              <div className="flex items-center gap-2">
                {noteDraft.noteId ? (
                  <button
                    className="rounded-xl border border-[color:var(--outline-variant)]/55 px-3 py-2 text-sm font-bold text-[color:var(--on-surface-variant)] transition-colors hover:text-[color:var(--primary)]"
                    type="button"
                    onClick={startNewNote}
                  >
                    Nova
                  </button>
                ) : null}
                <button
                  className="flex items-center gap-2 rounded-xl bg-[color:var(--primary)] px-4 py-2 text-sm font-bold text-white shadow-[0_10px_24px_rgba(139,92,246,0.22)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={!stripHtml(noteText) && (!noteDraft.drawings || !noteDraft.drawings.length)}
                  type="button"
                  onClick={saveNote}
                >
                  <Icon className="text-[16px]" name={noteDraft.isDirty ? "save" : "check"} />
                  {noteDraft.isDirty ? (noteDraft.noteId ? "Salvar alterações" : "Salvar") : "Salvo"}
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (selectedPanelItem?.type === "task") {
      const task = relatedTasks.find(
        (item) => item.id === selectedPanelItem.id,
      );
      return task ? (
        <div className="flex h-full min-h-0 flex-col p-4 custom-scrollbar">
          <div className="rounded-2xl border border-[color:var(--outline-variant)]/35 bg-[color:var(--surface)] p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[color:var(--primary)]">
              Tarefa aberta
            </p>
            <h4 className="mt-1 text-base font-bold text-[color:var(--on-surface)]">
              {task.title}
            </h4>
            <p className="mt-2 text-sm text-[color:var(--on-surface-variant)]">
              {task.description || "Sem descri??o"}
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-[color:var(--on-surface-variant)]">
              <span className="rounded-full bg-[color:var(--background)] px-3 py-1">
                {task.status || "pending"}
              </span>
              <span className="rounded-full bg-[color:var(--background)] px-3 py-1">
                {task.priority || "medium"}
              </span>
              {task.dueDate ? (
                <span className="rounded-full bg-[color:var(--background)] px-3 py-1">
                  {task.dueDate}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null;
    }

    if (activeTab === "flashcards") {
      return (
        <div className="flex h-full min-h-0 flex-col">
          {selectedPanelItem?.type === "deck" &&
          relatedDecks.some((deck) => deck.id === selectedPanelItem.id) ? (
            <div className="border-b border-[color:var(--outline-variant)]/35 bg-[color:var(--surface)] p-4">
              {(() => {
                const deck = relatedDecks.find(
                  (item) => item.id === selectedPanelItem.id,
                );
                return deck ? (
                  <div className="rounded-2xl border border-[color:var(--outline-variant)]/35 bg-[color:var(--background)] p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-[color:var(--primary)]">
                      Baralho aberto
                    </p>
                    <h4 className="mt-1 text-base font-bold text-[color:var(--on-surface)]">
                      {deck.title}
                    </h4>
                    <p className="mt-2 text-sm text-[color:var(--on-surface-variant)]">
                      {deck.cards?.length || 0} cartões neste baralho.
                    </p>
                  </div>
                ) : null;
              })()}
            </div>
          ) : null}
          <div className="border-b border-[color:var(--outline-variant)]/35 bg-[color:var(--surface)] p-4">
            <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-[color:var(--on-surface-variant)]">
              Baralho
            </label>
            {isCreatingDeck ? (
              <div className="flex gap-2">
                <input
                  className="min-w-0 flex-1 rounded-xl border border-[color:var(--outline-variant)]/45 bg-[color:var(--background)] px-3 py-2 text-sm outline-none focus:border-[color:var(--primary)]"
                  placeholder="Nome do baralho..."
                  type="text"
                  value={newDeckTitle}
                  onChange={(event) => setNewDeckTitle(event.target.value)}
                />
                <button
                  className="rounded-xl bg-[color:var(--primary)] px-3 py-2 text-xs font-bold text-white"
                  type="button"
                  onClick={createDeck}
                >
                  OK
                </button>
                <button
                  className="rounded-xl px-2 text-[color:var(--on-surface-variant)] hover:text-[color:var(--error)]"
                  type="button"
                  onClick={() => setIsCreatingDeck(false)}
                >
                  <Icon className="text-[18px]" name="close" />
                </button>
              </div>
            ) : (
              <select
                className="w-full rounded-xl border border-[color:var(--outline-variant)]/45 bg-[color:var(--background)] px-3 py-3 text-sm font-semibold text-[color:var(--on-surface)] outline-none focus:border-[color:var(--primary)]"
                value={selectedDeckId}
                onChange={(event) => {
                  if (event.target.value === "new") {
                    setIsCreatingDeck(true);
                  } else {
                    setSelectedDeckId(event.target.value);
                  }
                }}
              >
                <option value="">Automático: baralho do curso</option>
                <option value="new">+ Criar novo baralho</option>
                {flashcardDecks.map((deck) => (
                  <option key={deck.id} value={deck.id}>
                    {deck.title}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto p-4 custom-scrollbar">
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[color:var(--primary)]">
                <Icon className="text-[14px]" name="front_hand" />
                Frente
              </span>
              <textarea
                className="h-36 w-full resize-none rounded-2xl border border-[color:var(--outline-variant)]/45 bg-[color:var(--surface)] p-4 text-sm text-[color:var(--on-surface)] outline-none transition-colors placeholder:text-[color:var(--on-surface-variant)]/55 focus:border-[color:var(--primary)]"
                placeholder="Qual é a ideia principal desta aula?"
                value={flashcardFront}
                onChange={(event) => setFlashcardFront(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[color:var(--tertiary)]">
                <Icon className="text-[14px]" name="turn_left" />
                Verso
              </span>
              <textarea
                className="h-36 w-full resize-none rounded-2xl border border-[color:var(--outline-variant)]/45 bg-[color:var(--surface)] p-4 text-sm text-[color:var(--on-surface)] outline-none transition-colors placeholder:text-[color:var(--on-surface-variant)]/55 focus:border-[color:var(--tertiary)]"
                placeholder="Resposta curta e revisável."
                value={flashcardBack}
                onChange={(event) => setFlashcardBack(event.target.value)}
              />
            </label>
            {relatedDecks.length > 0 ? (
              <div className="rounded-2xl bg-[color:var(--surface)] p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-[color:var(--on-surface-variant)]">
                  Baralhos criados nesta aula
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {relatedDecks.map((deck) => (
                    <button
                      key={deck.id}
                      className="rounded-full bg-[color:var(--primary)]/10 px-3 py-1.5 text-xs font-bold text-[color:var(--primary)]"
                      type="button"
                      onClick={() =>
                        setSelectedPanelItem({ type: "deck", id: deck.id })
                      }
                    >
                      {deck.title}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="border-t border-[color:var(--outline-variant)]/35 bg-[color:var(--surface)] p-4">
            <button
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--primary)] py-3 text-sm font-bold text-white shadow-[0_10px_24px_rgba(139,92,246,0.22)] transition-opacity hover:opacity-90"
              type="button"
              onClick={addFlashcard}
            >
              <Icon className="text-[18px]" name="add_circle" />
              Adicionar cartão
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex h-full min-h-0 flex-col overflow-y-auto p-4 custom-scrollbar">
        <div className="space-y-4">
          <div className="min-h-[420px] overflow-hidden rounded-2xl border border-[color:var(--outline-variant)]/45 bg-[color:var(--surface)]">
            {data.pdfPath ? (
              <embed
                className="h-full w-full"
                src={getLocalFileUrl(data.pdfPath)}
                type="application/pdf"
              />
            ) : (
              <EmptyState
                icon="picture_as_pdf"
                title="Sem PDF vinculado"
                text="Quando houver um PDF, ele aparecer? aqui."
              />
            )}
          </div>

          <div className="rounded-2xl border border-[color:var(--outline-variant)]/45 bg-[color:var(--surface)] p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-[color:var(--primary)]">
                  Mídias
                </p>
                <h3 className="font-bold text-[color:var(--on-surface)]">
                  Materiais da aula
                </h3>
              </div>
              <button
                className="rounded-xl bg-[color:var(--primary)]/10 px-3 py-2 text-xs font-bold text-[color:var(--primary)] hover:bg-[color:var(--primary)] hover:text-white"
                type="button"
                onClick={() => setShowAddMediaModal(true)}
              >
                Adicionar
              </button>
            </div>

            {allMedia.length > 0 ? (
              <div className="space-y-2">
                {allMedia.map((media, index) => (
                  <button
                    key={media.id}
                    className="flex w-full items-center gap-3 rounded-xl bg-[color:var(--background)] p-3 text-left transition-colors hover:bg-[color:var(--primary)]/8"
                    type="button"
                    onClick={() => setActiveMediaIndex(index)}
                  >
                    <Icon
                      className="shrink-0 text-[color:var(--primary)]"
                      name={getMediaIcon(media.type)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-[color:var(--on-surface)]">
                        {media.title}
                      </span>
                      <span className="block truncate text-xs text-[color:var(--on-surface-variant)]">
                        {media.url}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[color:var(--on-surface-variant)]">
                Nenhuma m?dia vinculada ainda.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="screen-fade-in flex h-full flex-1 overflow-hidden bg-[color:var(--background)]">
      <main className="min-w-0 flex-1 overflow-y-auto custom-scrollbar">
        <div
          className={`mx-auto flex w-full flex-col gap-6 px-5 py-6 lg:px-8 xl:px-10 ${isPanelOpen ? "max-w-[1140px]" : "max-w-[1320px]"}`}
        >
          <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <button
                className="mb-3 flex items-center gap-2 text-sm font-bold text-[color:var(--on-surface-variant)] transition-colors hover:text-[color:var(--primary)]"
                type="button"
                onClick={() => onNavigate?.(SCREEN_IDS.MODULES)}
              >
                <Icon className="text-[18px]" name="arrow_back" />
                Voltar ao módulo
              </button>
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium text-[color:var(--on-surface-variant)]">
                <span className="truncate">
                  {activeCourse?.title || "Curso"}
                </span>
                <Icon
                  className="text-[16px] text-[color:var(--outline)]"
                  name="chevron_right"
                />
                <span className="truncate">
                  {activeModule?.title || "Módulo"}
                </span>
                <Icon
                  className="text-[16px] text-[color:var(--outline)]"
                  name="chevron_right"
                />
                <span className="font-extrabold text-[color:var(--on-surface)] truncate">
                  {data.title || "Aula"}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                className="flex w-fit items-center gap-2 rounded-2xl border border-[color:var(--outline-variant)]/55 bg-[color:var(--surface)] px-4 py-3 text-sm font-bold text-[color:var(--primary)] shadow-md transition-all hover:border-[color:var(--primary)]/40 hover:bg-[color:var(--primary)]/10"
                type="button"
                onClick={() => setShowLessonShareModal(true)}
              >
                <Icon className="text-[18px]" name="group_add" />
                Compartilhar aula
              </button>
              {currentMedia?.type === "pdf" ? (
                <button
                  className="flex w-fit items-center gap-2 rounded-2xl border border-[color:var(--primary)]/35 bg-[color:var(--surface)] px-4 py-3 text-sm font-bold text-[color:var(--primary)] shadow-md transition-all hover:bg-[color:var(--primary)] hover:text-white"
                  type="button"
                  onClick={() => openGuidedPdf(currentMedia)}
                >
                  <Icon className="text-[18px]" name="auto_stories" />
                  Leitura guiada
                </button>
              ) : null}
              <button
                className="flex w-fit items-center gap-2 rounded-2xl border border-[color:var(--primary)]/35 bg-[color:var(--surface)] px-4 py-3 text-sm font-bold text-[color:var(--primary)] shadow-md transition-all hover:bg-[color:var(--primary)] hover:text-white"
                type="button"
                onClick={() => {
                  mediaRef.current?.pause();
                  setGuidedPdfMedia(null);
                  setShowLanguageLab(true);
                }}
              >
                <Icon className="text-[18px]" name="translate" />
                Modo Idiomas
              </button>
              <button
                className="flex w-fit items-center gap-2 rounded-2xl border border-[color:var(--outline-variant)]/55 bg-[color:var(--primary)] px-4 py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-[color:var(--primary)]/90"
                type="button"
                onClick={() => onNavigate?.(SCREEN_IDS.IMMERSION)}
              >
                <Icon className="text-[18px]" name="fullscreen" />
                Modo Imersão
              </button>
            </div>
          </header>

          <section
            className={`group overflow-hidden rounded-[28px] shadow-[0_24px_70px_rgba(17,17,23,0.22)] ${hubMode ? "bg-[color:var(--surface)]" : "bg-black"}`}
          >
            <div
              className={
                hubMode ? "min-h-[560px] w-full" : "aspect-video w-full"
              }
            >
              {renderMediaPlayer()}
            </div>
          </section>

          {!hubMode ? <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
            {allMedia.map((media, index) => (
              <button
                key={media.id}
                className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold transition-all ${
                  index === activeMediaIndex
                    ? "border-[color:var(--primary)] bg-[color:var(--primary)] text-white"
                    : "border-[color:var(--outline-variant)]/55 bg-[color:var(--surface)] text-[color:var(--on-surface-variant)] hover:text-[color:var(--primary)]"
                }`}
                type="button"
                onClick={() => setActiveMediaIndex(index)}
              >
                <Icon className="text-[17px]" name={getMediaIcon(media.type)} />
                <span className="max-w-[180px] truncate">{media.title}</span>
              </button>
            ))}
            <button
              className="flex shrink-0 items-center gap-2 rounded-full border border-dashed border-[color:var(--outline)]/70 bg-[color:var(--surface)] px-4 py-2 text-sm font-bold text-[color:var(--primary)] transition-colors hover:bg-[color:var(--primary)] hover:text-white"
              type="button"
              onClick={() => setShowAddMediaModal(true)}
            >
              <Icon className="text-[17px]" name="add" />
              Mídia
            </button>
          </div> : null}

          {/* Segunda parte da secao removida conforme solicitado (Aula X, Resumo, Lousa) */}

          <nav className="flex flex-col gap-3 border-t border-[color:var(--outline-variant)]/45 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <button
              className="flex items-center justify-center gap-2 rounded-2xl border border-[color:var(--outline-variant)]/55 bg-[color:var(--surface)] px-5 py-4 text-sm font-bold text-[color:var(--on-surface)] transition-colors hover:text-[color:var(--primary)] disabled:cursor-not-allowed disabled:opacity-35"
              disabled={!hasPrev}
              type="button"
              onClick={goPrev}
            >
              <Icon className="text-[18px]" name="arrow_back" />
              Aula anterior
            </button>
            <button
              className="flex items-center justify-center gap-2 rounded-2xl bg-[color:var(--primary)] px-6 py-4 text-sm font-bold text-white shadow-[0_14px_26px_rgba(139,92,246,0.22)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
              disabled={!hasNext}
              type="button"
              onClick={goNext}
            >
              Próxima aula
              <Icon className="text-[18px]" name="arrow_forward" />
            </button>
          </nav>
        </div>
      </main>

      <LessonLinkedItemModal
        item={
          selectedModalItem
            ? {
                ...selectedModalItem,
                type: selectedPanelItem?.type,
                meta:
                  selectedPanelItem?.type === "note"
                    ? selectedModalItem.sourceLessonTitle || selectedModalItem.time
                    : selectedPanelItem?.type === "deck"
                      ? selectedModalItem.description || "Baralho criado nesta aula"
                      : selectedModalItem.category || selectedModalItem.module || "Tarefa da aula",
              }
            : null
        }
        onClose={() => setSelectedPanelItem(null)}
        onEditNote={editNote}
        onDeckCardFieldChange={(field, value) => {
          if (field === "front") setEditingDeckCardFront(value);
          if (field === "back") setEditingDeckCardBack(value);
        }}
        onDeleteDeckCard={handleDeleteDeckCard}
        onOpenDeckEditor={openDeckEditor}
        onReviewDeck={openDeckReview}
        onSaveDeckCardEdit={saveDeckCardEdit}
        onSeekToTime={handleTimeClick}
        onStartDeckCardEdit={startDeckCardEdit}
        onToggleTaskStatus={toggleTaskStatus}
        editingDeckCardBack={editingDeckCardBack}
        editingDeckCardFront={editingDeckCardFront}
        editingDeckCardId={editingDeckCardId}
        onCancelDeckCardEdit={cancelDeckCardEdit}
      />

      {showLessonShareModal ? (
        <ShareModal
          entityType="lesson"
          entityId={data.id || activeLessonId}
          title={data.title || "Aula"}
          payload={{
            schemaVersion: 1,
            course: activeCourse
              ? { id: activeCourse.id, title: activeCourse.title }
              : null,
            module: activeModule
              ? { id: activeModule.id, title: activeModule.title }
              : null,
            lesson: data,
            notes: lessonNotes,
            tasks: lessonTasks,
            decks: lessonDecks,
          }}
          onClose={() => setShowLessonShareModal(false)}
        />
      ) : null}

      <AnimatePresence>
        {showLanguageLab ? (
          <LanguageLabModal
            courseTitle={activeCourse?.title || "Curso"}
            lesson={data}
            moduleTitle={activeModule?.title || "Módulo"}
            onClose={() => setShowLanguageLab(false)}
            onCreateFlashcard={createLanguageFlashcard}
            onUpdateLesson={updateLanguageLesson}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {guidedPdfMedia ? (
          <Suspense
            fallback={
              <div className="fixed inset-0 z-[320] flex items-center justify-center bg-[#f0f1f7] text-[color:var(--primary)]">
                <div className="text-center">
                  <Icon className="text-[42px]" name="auto_stories" />
                  <p className="mt-3 font-bold">Abrindo leitura guiada...</p>
                </div>
              </div>
            }
          >
            <PdfGuidedReadingModal
              key={`${data.id}:${guidedPdfMedia.id}:${guidedPdfMedia.path}`}
              initialState={data.pdfReadingState?.[guidedPdfMedia.id]}
              pdfPath={guidedPdfMedia.path}
              pdfTitle={guidedPdfMedia.title}
              onClose={() => setGuidedPdfMedia(null)}
              onStateChange={updateGuidedPdfState}
            />
          </Suspense>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isPanelOpen ? (
          <>
            <motion.button
              aria-label="Fechar painel"
              className="absolute inset-0 z-20 bg-black/20 backdrop-blur-[2px] lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              type="button"
              onClick={() => setIsPanelOpen(false)}
            />
            <motion.aside
              className="absolute inset-y-0 right-0 z-30 flex w-[min(430px,92vw)] shrink-0 flex-col border-l border-[color:var(--outline-variant)]/45 bg-[color:var(--background)] shadow-[-24px_0_64px_rgba(17,17,23,0.12)] lg:relative lg:z-0 lg:w-[400px] xl:w-[420px]"
              initial={{ x: 430 }}
              animate={{ x: 0 }}
              exit={{ x: 430 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              <div className="flex items-center justify-between border-b border-[color:var(--outline-variant)]/45 bg-[color:var(--surface)] px-4 py-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-[color:var(--primary)]">
                    Painel da aula
                  </p>
                  <p className="text-sm font-semibold text-[color:var(--on-surface-variant)]">
                    {hubMode ? "Trilha de estudos" : "Trilha e materiais"}
                  </p>
                </div>
                <button
                  className="flex h-10 w-10 items-center justify-center rounded-full text-[color:var(--on-surface-variant)] transition-colors hover:bg-[color:var(--background)] hover:text-[color:var(--primary)]"
                  type="button"
                  onClick={() => setIsPanelOpen(false)}
                >
                  <Icon name="close" />
                </button>
              </div>
              {displayPanelTabs.length > 1 && (
                <div className={`grid grid-cols-${displayPanelTabs.length} gap-2 border-b border-[color:var(--outline-variant)]/45 bg-[color:var(--surface)] p-3`}>
                  {displayPanelTabs.map((tab) => (
                    <PanelTabButton
                      key={tab.id}
                      activeTab={activeTab}
                      tab={tab}
                      onClick={setActiveTab}
                    />
                  ))}
                </div>
              )}
              <div className="min-h-0 flex-1 overflow-hidden">
                {renderPanelContent()}
              </div>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showAddMediaModal ? (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <motion.div
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-lg rounded-[2rem] border border-[color:var(--outline-variant)]/35 bg-[color:var(--surface)] p-6 shadow-2xl"
              exit={{ opacity: 0, scale: 0.96 }}
              initial={{ opacity: 0, scale: 0.96 }}
            >
              <div className="mb-6 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-xl font-bold text-[color:var(--on-surface)]">
                  <Icon
                    className="text-[color:var(--primary)]"
                    name="video_library"
                  />
                  Gerenciar mídias
                </h3>
                <button
                  className="flex h-10 w-10 items-center justify-center rounded-full text-[color:var(--on-surface-variant)] hover:text-[color:var(--error)]"
                  type="button"
                  onClick={() => setShowAddMediaModal(false)}
                >
                  <Icon name="close" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-bold uppercase tracking-wide text-[color:var(--on-surface-variant)]">
                      Título do recurso
                    </label>
                    <input
                      className="w-full rounded-xl border border-[color:var(--outline-variant)]/45 bg-[color:var(--background)] px-4 py-3 text-sm text-[color:var(--on-surface)] outline-none focus:border-[color:var(--primary)]"
                      placeholder="Ex: PDF da aula, resumo, planilha..."
                      type="text"
                      value={newMediaTitle}
                      onChange={(event) => setNewMediaTitle(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wide text-[color:var(--on-surface-variant)]">
                      Tipo
                    </label>
                    <select
                      className="w-full rounded-xl border border-[color:var(--outline-variant)]/45 bg-[color:var(--background)] px-4 py-3 text-sm text-[color:var(--on-surface)] outline-none focus:border-[color:var(--primary)]"
                      value={newMediaType}
                      onChange={(event) => {
                        setNewMediaType(event.target.value);
                        setNewMediaLink("");
                        setNewMediaFilePath("");
                      }}
                    >
                      <option value="youtube">Link do YouTube</option>
                      <option value="pdf">PDF</option>
                      <option value="audio">Áudio</option>
                      <option value="local_file">Arquivo local</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wide text-[color:var(--on-surface-variant)]">
                      {newMediaType === "youtube"
                        ? "Link do YouTube"
                        : "Arquivo selecionado"}
                    </label>
                    {newMediaType !== "youtube" ? (
                      <div className="space-y-3">
                        <input
                          className="w-full rounded-xl border border-[color:var(--outline-variant)]/45 bg-[color:var(--background)] px-4 py-3 text-sm text-[color:var(--on-surface)] outline-none"
                          placeholder="Escolha um arquivo"
                          readOnly
                          type="text"
                          value={newMediaFilePath}
                        />
                        <button
                          className="rounded-xl border border-[color:var(--outline-variant)]/45 bg-[color:var(--surface)] px-4 py-3 text-sm font-bold text-[color:var(--on-surface)] hover:border-[color:var(--primary)]/50 hover:text-[color:var(--primary)]"
                          type="button"
                          onClick={() => pickLessonResourceFile(newMediaType)}
                        >
                          Selecionar arquivo
                        </button>
                      </div>
                    ) : (
                      <input
                        className="w-full rounded-xl border border-[color:var(--outline-variant)]/45 bg-[color:var(--background)] px-4 py-3 text-sm text-[color:var(--on-surface)] outline-none focus:border-[color:var(--primary)]"
                        placeholder="https://youtube.com/..."
                        type="text"
                        value={newMediaLink}
                        onChange={(event) =>
                          setNewMediaLink(event.target.value)
                        }
                      />
                    )}
                  </div>
                </div>

                {data.extraMedia?.length ? (
                  <div>
                    <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-[color:var(--on-surface-variant)]">
                      Mídias adicionadas
                    </h4>
                    <div className="max-h-48 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                      {data.extraMedia.map((media) => (
                        <div
                          key={media.id}
                          className="flex items-center gap-3 rounded-2xl border border-[color:var(--outline-variant)]/35 bg-[color:var(--background)] p-3"
                        >
                          <Icon
                            className="shrink-0 text-[color:var(--primary)]"
                            name={getMediaIcon(media.type)}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-[color:var(--on-surface)]">
                              {media.title}
                            </p>
                            <p className="truncate text-xs text-[color:var(--on-surface-variant)]">
                              {media.url}
                            </p>
                          </div>
                          <button
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[color:var(--error)] hover:bg-[color:var(--error)]/10"
                            type="button"
                            onClick={() => removeExtraMedia(media.id)}
                          >
                            <Icon className="text-[18px]" name="delete" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div>
                  <button
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--primary)] py-3 text-sm font-bold text-white"
                    type="button"
                    onClick={addExtraMedia}
                  >
                    <Icon className="text-[18px]" name="add" />
                    Adicionar recurso
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        ) : null}

        {showCompletionPopup ? (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4 backdrop-blur-md">
            <motion.div
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="flex w-full max-w-md flex-col items-center rounded-[2rem] border border-[color:var(--outline-variant)]/35 bg-[color:var(--surface)] p-8 text-center shadow-2xl"
              initial={{ opacity: 0, scale: 0.9, y: 18 }}
            >
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[color:var(--success)]/12 text-[color:var(--success)]">
                <Icon className="text-[40px]" name="emoji_events" />
              </div>
              <h2 className="text-2xl font-bold text-[color:var(--on-surface)]">
                Aula concluída!
              </h2>
              <p className="mb-8 mt-2 text-[color:var(--on-surface-variant)]">
                Ótimo trabalho. Você avançou mais um pedaço da trilha.
              </p>
              <div className="flex w-full flex-col gap-3">
                <button
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--primary)] py-4 font-bold text-white transition-opacity hover:opacity-90"
                  type="button"
                  onClick={() => {
                    if (hasNext) {
                      goNext();
                      setShowCompletionPopup(false);
                    } else {
                      onNavigate?.(SCREEN_IDS.MODULES);
                    }
                  }}
                >
                  Ir para próxima aula
                  <Icon name="arrow_forward" />
                </button>
                <button
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--background)] py-4 font-bold text-[color:var(--on-surface)] transition-colors hover:text-[color:var(--primary)]"
                  type="button"
                  onClick={() => onNavigate?.(SCREEN_IDS.MODULES)}
                >
                  <Icon name="grid_view" />
                  Voltar ao módulo
                </button>
              </div>
            </motion.div>
          </div>
        ) : null}

        {showAddTaskModal ? (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <motion.div
              animate={{ opacity: 1, scale: 1 }}
              className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-[2rem] border border-[color:var(--outline-variant)]/35 bg-[color:var(--surface)] p-6 shadow-2xl"
              initial={{ opacity: 0, scale: 0.96 }}
            >
              <div className="mb-4 flex items-center justify-between border-b border-[color:var(--outline-variant)]/35 p-4">
                <h2 className="flex items-center gap-2 text-xl font-bold text-[color:var(--on-surface)]">
                  <Icon
                    className="text-2xl text-[color:var(--primary)]"
                    name="add_task"
                  />
                  Nova tarefa
                </h2>
                <button
                  className="flex h-10 w-10 items-center justify-center rounded-full text-[color:var(--on-surface-variant)] hover:text-[color:var(--error)]"
                  type="button"
                  onClick={() => setShowAddTaskModal(false)}
                >
                  <Icon name="close" />
                </button>
              </div>
              <form
                className="flex flex-col gap-6 overflow-y-auto px-2 pb-4 custom-scrollbar"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!newTask.title.trim()) return;
                  useStudyStore.getState().addTask({
                    ...newTask,
                    sourceCourseId: activeCourseId,
                    sourceModuleId: activeModuleId,
                    sourceLessonId: activeLessonId,
                  });
                  setNewTask({
                    title: "",
                    description: "",
                    status: "pending",
                    priority: "medium",
                    dueDate: "",
                    category: "",
                    type: "task",
                    estimatedMinutes: 25,
                  });
                  setShowAddTaskModal(false);
                }}
              >
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-bold uppercase text-[color:var(--on-surface-variant)]">
                    Título
                  </span>
                  <input
                    required
                    className="w-full rounded-xl border border-[color:var(--outline-variant)]/45 bg-[color:var(--background)] px-4 py-3 text-sm text-[color:var(--on-surface)] outline-none focus:border-[color:var(--primary)]"
                    placeholder="Revisar conceitos da aula..."
                    type="text"
                    value={newTask.title}
                    onChange={(event) =>
                      setNewTask({ ...newTask, title: event.target.value })
                    }
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-bold uppercase text-[color:var(--on-surface-variant)]">
                    Descrição
                  </span>
                  <textarea
                    className="h-24 w-full resize-none rounded-xl border border-[color:var(--outline-variant)]/45 bg-[color:var(--background)] px-4 py-3 text-sm text-[color:var(--on-surface)] outline-none focus:border-[color:var(--primary)]"
                    placeholder="Detalhes opcionais..."
                    value={newTask.description}
                    onChange={(event) =>
                      setNewTask({
                        ...newTask,
                        description: event.target.value,
                      })
                    }
                  />
                </label>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <label className="flex flex-col gap-2">
                    <span className="text-xs font-bold uppercase text-[color:var(--on-surface-variant)]">
                      Tipo
                    </span>
                    <select
                      className="rounded-xl border border-[color:var(--outline-variant)]/45 bg-[color:var(--background)] px-4 py-3 text-sm outline-none focus:border-[color:var(--primary)]"
                      value={newTask.type}
                      onChange={(event) =>
                        setNewTask({ ...newTask, type: event.target.value })
                      }
                    >
                      <option value="task">Tarefa</option>
                      <option value="exam">Prova</option>
                      <option value="assignment">Trabalho</option>
                      <option value="presentation">Apresentação</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className="text-xs font-bold uppercase text-[color:var(--on-surface-variant)]">
                      Prioridade
                    </span>
                    <select
                      className="rounded-xl border border-[color:var(--outline-variant)]/45 bg-[color:var(--background)] px-4 py-3 text-sm outline-none focus:border-[color:var(--primary)]"
                      value={newTask.priority}
                      onChange={(event) =>
                        setNewTask({ ...newTask, priority: event.target.value })
                      }
                    >
                      <option value="low">Baixa</option>
                      <option value="medium">Média</option>
                      <option value="high">Alta</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className="text-xs font-bold uppercase text-[color:var(--on-surface-variant)]">
                      Minutos estimados
                    </span>
                    <input
                      className="rounded-xl border border-[color:var(--outline-variant)]/45 bg-[color:var(--background)] px-4 py-3 text-sm outline-none focus:border-[color:var(--primary)]"
                      max="10"
                      min="1"
                      type="number"
                      value={newTask.estimatedMinutes}
                      onChange={(event) =>
                        setNewTask({
                          ...newTask,
                          estimatedMinutes: parseInt(event.target.value) || 1,
                        })
                      }
                    />
                  </label>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="flex flex-col gap-2">
                    <span className="text-xs font-bold uppercase text-[color:var(--on-surface-variant)]">
                      Vencimento
                    </span>
                    <input
                      className="rounded-xl border border-[color:var(--outline-variant)]/45 bg-[color:var(--background)] px-4 py-3 text-sm outline-none focus:border-[color:var(--primary)]"
                      type="date"
                      value={newTask.dueDate}
                      onChange={(event) =>
                        setNewTask({ ...newTask, dueDate: event.target.value })
                      }
                    />
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className="text-xs font-bold uppercase text-[color:var(--on-surface-variant)]">
                      Categoria
                    </span>
                    <input
                      className="rounded-xl border border-[color:var(--outline-variant)]/45 bg-[color:var(--background)] px-4 py-3 text-sm outline-none focus:border-[color:var(--primary)]"
                      placeholder="Ex: revisão"
                      type="text"
                      value={newTask.category}
                      onChange={(event) =>
                        setNewTask({ ...newTask, category: event.target.value })
                      }
                    />
                  </label>
                </div>
                <div className="mt-2 flex gap-4">
                  <button
                    className="flex-1 rounded-xl bg-[color:var(--background)] py-3 font-bold text-[color:var(--on-surface)] hover:text-[color:var(--error)]"
                    type="button"
                    onClick={() => setShowAddTaskModal(false)}
                  >
                    Cancelar
                  </button>
                  <button
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[color:var(--primary)] py-3 font-bold text-white hover:opacity-90"
                    type="submit"
                  >
                    <Icon name="save" />
                    Salvar tarefa
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      {!isPanelOpen && (
        <button
          className="fixed right-4 top-[50%] z-40 flex h-12 w-12 translate-y-[-50%] items-center justify-center rounded-full border border-[color:var(--outline-variant)]/55 bg-[color:var(--surface)] text-[color:var(--on-surface-variant)] shadow-lg transition-all hover:bg-[color:var(--primary)] hover:text-white"
          type="button"
          onClick={() => setIsPanelOpen(true)}
          title="Mostrar painel"
        >
          <Icon className="text-[20px]" name="right_panel_open" />
        </button>
      )}
    </div>
  );
}
