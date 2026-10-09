import { StickyMarkdown } from "../components/StickyMarkdown";
import { useEffect, useMemo, useRef, useState } from "react";
import { dashboardFlowLanes } from "../domain/dashboardFlow";
import { parseWaterTarget, waterTrackerForDate } from "../domain/waterTracker";
import { selectTodayTasks } from "../domain/taskDates";
import { SCREEN_IDS } from "../app/screenIds";
import { getAcademicSemesterData } from "../domain/academic";
import { dueFlashcards } from "../domain/studySelectors";

import { useStudyStore } from "../store/useStore";
import { Icon } from "../ui/Icon";
import { getLocalDateKey } from "../utils/dateUtils";
import { useCurrentDate } from "../utils/useCurrentDate";

const QUICK_NOTE_PALETTES = [
  { id: "yellow", label: "Amarelo", dot: "#fbbf24" },
  { id: "rose", label: "Rosé Suave", dot: "#f43f5e" },
  { id: "blue", label: "Azul", dot: "#38bdf8" },
  { id: "green", label: "Verde", dot: "#34d399" },
  { id: "purple", label: "Roxo", dot: "#a78bfa" },
  { id: "slate", label: "Cinza", dot: "#94a3b8" },
];

const EMPTY_DASHBOARD_WIDGETS = [];

const QUICK_NOTE_COLOR_MAP = {
  theme: {
    bg: "bg-[color:var(--surface-container-low)]",
    border: "border-[color:var(--outline-variant)]/60",
    header:
      "bg-[color:var(--surface-container)] border-[color:var(--outline-variant)]/40",
    accent: "text-[color:var(--primary)]",
    text: "text-[color:var(--on-surface)]",
    placeholder: "placeholder:text-[color:var(--on-surface-variant)]/50",
  },
  amber: {
    bg: "bg-amber-500/10 dark:bg-amber-950/30",
    border: "border-amber-500/30 dark:border-amber-500/20",
    header: "bg-amber-500/15 border-amber-500/25",
    accent: "text-amber-600 dark:text-amber-400",
    text: "text-[color:var(--on-surface)]",
    placeholder:
      "placeholder:text-amber-700/50 dark:placeholder:text-amber-200/40",
  },
  lavender: {
    bg: "bg-purple-500/10 dark:bg-purple-950/30",
    border: "border-purple-500/30 dark:border-purple-500/20",
    header: "bg-purple-500/15 border-purple-500/25",
    accent: "text-purple-600 dark:text-purple-400",
    text: "text-[color:var(--on-surface)]",
    placeholder:
      "placeholder:text-purple-700/50 dark:placeholder:text-purple-200/40",
  },
  cyan: {
    bg: "bg-cyan-500/10 dark:bg-cyan-950/30",
    border: "border-cyan-500/30 dark:border-cyan-500/20",
    header: "bg-cyan-500/15 border-cyan-500/25",
    accent: "text-cyan-600 dark:text-cyan-400",
    text: "text-[color:var(--on-surface)]",
    placeholder:
      "placeholder:text-cyan-700/50 dark:placeholder:text-cyan-200/40",
  },
  emerald: {
    bg: "bg-emerald-500/10 dark:bg-emerald-950/30",
    border: "border-emerald-500/30 dark:border-emerald-500/20",
    header: "bg-emerald-500/15 border-emerald-500/25",
    accent: "text-emerald-600 dark:text-emerald-400",
    text: "text-[color:var(--on-surface)]",
    placeholder:
      "placeholder:text-emerald-700/50 dark:placeholder:text-emerald-200/40",
  },
  rose: {
    bg: "bg-rose-500/10 dark:bg-rose-950/30",
    border: "border-rose-500/30 dark:border-rose-500/20",
    header: "bg-rose-500/15 border-rose-500/25",
    accent: "text-rose-600 dark:text-rose-400",
    text: "text-[color:var(--on-surface)]",
    placeholder:
      "placeholder:text-rose-700/50 dark:placeholder:text-rose-200/40",
  },
  yellow: {
    bg: "bg-amber-500/10 dark:bg-amber-950/30",
    border: "border-amber-500/30 dark:border-amber-500/20",
    header: "bg-amber-500/15 border-amber-500/25",
    accent: "text-amber-600 dark:text-amber-400",
    text: "text-[color:var(--on-surface)]",
    placeholder:
      "placeholder:text-amber-700/50 dark:placeholder:text-amber-200/40",
  },
  blue: {
    bg: "bg-sky-500/10 dark:bg-sky-950/30",
    border: "border-sky-500/30 dark:border-sky-500/20",
    header: "bg-sky-500/15 border-sky-500/25",
    accent: "text-sky-600 dark:text-sky-400",
    text: "text-[color:var(--on-surface)]",
    placeholder: "placeholder:text-sky-700/50 dark:placeholder:text-sky-200/40",
  },
  green: {
    bg: "bg-emerald-500/10 dark:bg-emerald-950/30",
    border: "border-emerald-500/30 dark:border-emerald-500/20",
    header: "bg-emerald-500/15 border-emerald-500/25",
    accent: "text-emerald-600 dark:text-emerald-400",
    text: "text-[color:var(--on-surface)]",
    placeholder:
      "placeholder:text-emerald-700/50 dark:placeholder:text-emerald-200/40",
  },
  purple: {
    bg: "bg-violet-500/10 dark:bg-violet-950/30",
    border: "border-violet-500/30 dark:border-violet-500/20",
    header: "bg-violet-500/15 border-violet-500/25",
    accent: "text-violet-600 dark:text-violet-400",
    text: "text-[color:var(--on-surface)]",
    placeholder:
      "placeholder:text-violet-700/50 dark:placeholder:text-violet-200/40",
  },
  slate: {
    bg: "bg-slate-500/10 dark:bg-slate-900/50",
    border: "border-slate-500/30 dark:border-slate-500/20",
    header: "bg-slate-500/15 border-slate-500/25",
    accent: "text-slate-600 dark:text-slate-300",
    text: "text-[color:var(--on-surface)]",
    placeholder:
      "placeholder:text-slate-700/50 dark:placeholder:text-slate-200/40",
  },
};

function QuickNoteWidgetCard({
  note,
  onChange,
  onUnpin,
  onOpenStickyNotes,
  onOpenDesktop,
}) {
  const [showPalette, setShowPalette] = useState(false);
  const cardRef = useRef(null);
  const resizeGesture = useRef(null);
  const [previewSize, setPreviewSize] = useState(null);
  const size = previewSize || note.dashboardSize || { width: null, height: 240 };
  const clampSize = (width, height) => ({
    width: Math.min(cardRef.current?.parentElement?.clientWidth || width, Math.max(240, width)),
    height: Math.max(180, Math.min(800, height)),
  });
  const startResize = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = cardRef.current.getBoundingClientRect();
    resizeGesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, width: rect.width, height: rect.height };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const resize = (event) => {
    const start = resizeGesture.current;
    if (!start || start.id !== event.pointerId) return;
    setPreviewSize(clampSize(start.width + event.clientX - start.x, start.height + event.clientY - start.y));
  };
  const finishResize = (event) => {
    const start = resizeGesture.current;
    if (!start || start.id !== event.pointerId) return;
    // Salva apenas ao soltar a alça, evitando gravar a cada movimento do mouse.
    if (event.type !== "pointercancel") onChange(note.id, { dashboardSize: clampSize(start.width + event.clientX - start.x, start.height + event.clientY - start.y) });
    resizeGesture.current = null;
    setPreviewSize(null);
  };
  const resizeWithKeyboard = (event) => {
    const offsets = { ArrowLeft: [-24, 0], ArrowRight: [24, 0], ArrowUp: [0, -24], ArrowDown: [0, 24] };
    if (!offsets[event.key]) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = cardRef.current.getBoundingClientRect();
    const [dx, dy] = offsets[event.key];
    onChange(note.id, { dashboardSize: clampSize(rect.width + dx, rect.height + dy) });
  };
  const colorKey =
    note.color && QUICK_NOTE_COLOR_MAP[note.color] ? note.color : "yellow";
  const color = QUICK_NOTE_COLOR_MAP[colorKey];

  return (
    <article
      ref={cardRef}
      data-today-note={note.id}
      style={{ width: size.width || "100%", maxWidth: "100%", height: size.height }}
      className={`today-resizable-note relative flex min-h-[180px] flex-col overflow-hidden rounded-2xl border shadow-md ${color.bg} ${color.border} ${color.text}`}
    >
      <header
        className={`flex shrink-0 items-center gap-2 border-b px-3.5 py-2.5 transition-colors ${color.header}`}
      >
        <Icon name="sticky_note_2" className={`text-[18px] ${color.accent}`} />
        <input
          value={note.title || ""}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => onChange(note.id, { title: event.target.value })}
          className="min-w-0 flex-1 border-0 bg-transparent p-0 text-xs font-black outline-none focus:ring-0 placeholder:opacity-50"
          placeholder="Título da anotação"
        />

        {/* Color Palette Selector */}
        <div className="relative">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setShowPalette((v) => !v)}
            className="rounded-lg p-1 text-[color:var(--on-surface-variant)] opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition-all"
            title="Mudar cor da nota adesiva"
          >
            <Icon name="palette" className="text-[16px]" />
          </button>

          {showPalette ? (
            <div
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute right-0 top-full mt-1.5 z-30 flex items-center gap-1.5 rounded-xl border border-[color:var(--outline-variant)]/60 bg-[color:var(--surface)] p-1.5 shadow-xl animate-in zoom-in-95 duration-100"
            >
              {QUICK_NOTE_PALETTES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onChange(note.id, { color: p.id });
                    setShowPalette(false);
                  }}
                  className={`h-5 w-5 rounded-full border-2 transition-transform hover:scale-110 ${
                    colorKey === p.id
                      ? "border-[color:var(--on-surface)] scale-110 shadow-sm"
                      : "border-transparent"
                  }`}
                  style={{ backgroundColor: p.dot }}
                  title={p.label}
                />
              ))}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onOpenDesktop(note)}
          className="rounded-lg p-1 text-[color:var(--on-surface-variant)] opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition-all"
          title="Destacar na mesa do macOS"
        >
          <Icon name="open_in_new" className="text-[17px]" />
        </button>
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onOpenStickyNotes}
          className="rounded-lg p-1 text-[color:var(--on-surface-variant)] opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition-all"
          title="Abrir Sticky Notes"
        >
          <Icon name="add" className="text-[18px]" />
        </button>
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onUnpin(note)}
          className="rounded-lg p-1 text-[color:var(--on-surface-variant)] opacity-60 hover:opacity-100 hover:bg-red-500/10 hover:text-red-600 transition-all"
          title="Remover da tela Hoje"
        >
          <Icon name="keep_off" className="text-[17px]" />
        </button>
      </header>
      <StickyMarkdown content={note.content || ''} onChange={content => onChange(note.id, { content })} textareaProps={{ 'aria-label': `Conteúdo de ${note.title || 'anotação'}`, placeholder: 'Ideias, lembretes e metas rápidas...', className: `min-h-0 flex-1 resize-none border-0 bg-transparent p-4 text-sm font-medium leading-relaxed outline-none focus:ring-0 ${color.placeholder}` }} />
      <footer className="flex shrink-0 items-center justify-between px-3 pb-2 gap-2">
        <button type="button" className="text-[11px] opacity-70 hover:opacity-100" onClick={() => onChange(note.id, { dashboardSize: { width: null, height: 240 } })}>Restaurar tamanho</button>
        <button type="button" aria-label={`Redimensionar ${note.title || "anotação"}`} title="Arraste para redimensionar ou use as setas do teclado" className="today-note-resize-handle rounded p-1" onPointerDown={startResize} onPointerMove={resize} onPointerUp={finishResize} onPointerCancel={finishResize} onKeyDown={resizeWithKeyboard}>
          <Icon name="south_east" className="text-[18px]" />
        </button>
      </footer>
    </article>
  );
}

const DASHBOARD_WIDGET_META = {
  schedule: { label: "Agenda da semana", icon: "calendar_today" },
  summary: { label: "Resumo do dia", icon: "insights" },
  deadlines: { label: "Próximos prazos", icon: "event_upcoming" },
  habits: { label: "Hábitos", icon: "task_alt" },
  water: { label: "Hidratação", icon: "water_drop" },
  flashcards: { label: "Revisão de flashcards", icon: "style" },
  tasks: { label: "Tarefas de hoje", icon: "check_circle" },
};

function HabitsPanel({ size, onResize, children }) {
  const frame = useRef(null);
  const gesture = useRef(null);
  const [preview, setPreview] = useState(null);
  const [minimum, setMinimum] = useState(180);
  const [listLimit, setListLimit] = useState(240);
  const effective = preview || size;
  useEffect(() => {
    const root = frame.current;
    const measure = () => {
      const header = root.querySelector('.today-panel-header');
      const form = root.querySelector('.today-add-form');
      const list = root.querySelector('.today-list');
      // Measure up to three complete habits, including wrapped titles/history.
      const rows = Array.from(root.querySelectorAll('.today-habit')).slice(0, 3);
      const firstThree = rows.length ? rows.at(-1).offsetTop + rows.at(-1).offsetHeight - rows[0].offsetTop : 0;
      const limit = Math.max(180, firstThree);
      setListLimit(limit);
      setMinimum(Math.ceil((header?.offsetHeight || 0) + (form?.offsetHeight || 0) + Math.min(list?.scrollHeight || 0, limit) + 70));
    };
    const observer = new ResizeObserver(measure);
    const mutations = new MutationObserver(measure);
    observer.observe(root);
    root.querySelectorAll('.today-panel-header, .today-add-form, .today-habit').forEach(el => observer.observe(el));
    mutations.observe(root.querySelector('.today-list'), { subtree: true, childList: true, characterData: true });
    measure();
    return () => { observer.disconnect(); mutations.disconnect(); };
  }, [children]);
  const clamp = (width, height) => ({
    width: Math.min(frame.current.parentElement.clientWidth, Math.max(240, width)),
    height: Math.max(minimum, Math.min(900, height)),
  });
  const start = event => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = frame.current.getBoundingClientRect();
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, width: rect.width, height: rect.height };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const nextSize = event => clamp(gesture.current.width + event.clientX - gesture.current.x, gesture.current.height + event.clientY - gesture.current.y);
  const finish = event => {
    if (gesture.current?.id !== event.pointerId) return;
    // Persist once per gesture, avoiding writes on every pointer movement.
    if (event.type !== 'pointercancel') onResize(nextSize(event));
    gesture.current = null;
    setPreview(null);
  };
  return <div ref={frame} className={`today-habits-resizable ${effective?.height ? 'is-sized' : ''}`} style={{ '--habits-list-limit': `${listLimit}px`, width: effective?.width || '100%', maxWidth: '100%', height: effective?.height ? Math.max(minimum, effective.height) : 'auto' }}>
    <WidgetPanel>{children}<div className="today-habits-size-controls">
      <button type="button" onClick={() => { setPreview(null); onResize(null); }} aria-label="Restaurar tamanho automático dos hábitos" title="Tamanho automático"><Icon name="fit_screen" /></button>
      <button type="button" className="today-note-resize-handle" aria-label="Redimensionar hábitos" title="Arraste ou use as setas do teclado" onPointerDown={start} onPointerMove={event => { if (gesture.current?.id === event.pointerId) setPreview(nextSize(event)); }} onPointerUp={finish} onPointerCancel={finish} onKeyDown={event => {
        const delta = { ArrowLeft: [-24, 0], ArrowRight: [24, 0], ArrowUp: [0, -24], ArrowDown: [0, 24] }[event.key];
        if (!delta) return;
        event.preventDefault(); event.stopPropagation();
        const rect = frame.current.getBoundingClientRect();
        onResize(clamp(rect.width + delta[0], rect.height + delta[1]));
      }}><Icon name="drag_handle" /></button>
    </div></WidgetPanel>
  </div>;
}

function WidgetPanel({ className = "", children }) {
  return (
    <article className={`today-panel ${className}`}>
      {/* Natural height stays independent of the surrounding grid cell. */}
      <div className="today-panel-layout">{children}</div>
    </article>
  );
}

function DashboardWidgetShell({
  config,
  label,
  editing,
  draggedId,
  dropTarget,
  onDragStart,
  onPreview,
  onDragEnd,
  onDrop,
  onStep,
  onToggle,
  children,
}) {
  const gesture = useRef(null);
  const preview = useRef(null);
  const finish = () => {
    gesture.current = null;
    preview.current = null;
    onDragEnd();
  };
  useEffect(() => {
    if (!editing) {
      gesture.current = null;
      preview.current = null;
    }
  }, [editing]);
  if (!config || config.visible === false) return null;
  const meta = DASHBOARD_WIDGET_META[config.id] || {
    label: label || "Sticky Note",
    icon: "sticky_note_2",
  };
  const start = (event) => {
    if (event.button !== 0) return;
    gesture.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    onDragStart({
      id: config.id,
      label: meta.label,
      x: event.clientX,
      y: event.clientY,
    });
    event.preventDefault();
  };
  const move = (event) => {
    if (gesture.current !== event.pointerId) return;
    const element = document.elementFromPoint(event.clientX, event.clientY);
    const target = element?.closest("[data-dashboard-widget-id]");
    const lane = element?.closest("[data-dashboard-lane]");
    let next = null;
    if (target && target.dataset.dashboardWidgetId !== config.id) {
      const rect = target.getBoundingClientRect();
      next = {
        id: target.dataset.dashboardWidgetId,
        placement:
          event.clientY < rect.top + rect.height / 2 ? "before" : "after",
        lane: lane?.dataset.dashboardLane,
      };
    } else if (!target && lane) {
      // Dropping in a gap inserts beside the nearest card, not at the end.
      const cards = [
        ...lane.querySelectorAll("[data-dashboard-widget-id]"),
      ].filter((card) => card.dataset.dashboardWidgetId !== config.id);
      const following = cards.find((card) => {
        const rect = card.getBoundingClientRect();
        return event.clientY < rect.top + rect.height / 2;
      });
      const neighbor = following || cards.at(-1);
      next = {
        id: neighbor?.dataset.dashboardWidgetId || null,
        placement: following ? "before" : "after",
        lane: lane.dataset.dashboardLane,
      };
    }
    preview.current = next;
    onPreview({ target: next, x: event.clientX, y: event.clientY });
    // Continue scrolling the actual page when a pointer approaches its edge.
    let scroller = event.currentTarget.parentElement;
    while (
      scroller &&
      !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)
    )
      scroller = scroller.parentElement;
    if (scroller) {
      const bounds = scroller.getBoundingClientRect();
      if (event.clientY > bounds.bottom - 40) scroller.scrollTop += 12;
      if (event.clientY < bounds.top + 40) scroller.scrollTop -= 12;
    }
  };
  const end = (event) => {
    if (gesture.current !== event.pointerId) return;
    if (preview.current)
      onDrop(
        config.id,
        preview.current.id,
        preview.current.placement,
        preview.current.lane,
      );
    finish();
  };
  return (
    <div
      className={`today-flow-widget ${editing ? "is-organizing" : ""} ${draggedId === config.id ? "is-dragging" : ""} ${dropTarget?.id === config.id ? `drop-${dropTarget.placement}` : ""}`}
      data-dashboard-widget-id={config.id}
    >
      {editing ? (
        <div
          className="today-flow-controls"
          aria-label={`Organizar ${meta.label}`}
        >
          <button
            type="button"
            className="today-flow-drag"
            title={`Arrastar ${meta.label}`}
            aria-label={`Arrastar ${meta.label}`}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={finish}
            onLostPointerCapture={() => {
              if (gesture.current != null) finish();
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") finish();
              if (["ArrowUp", "ArrowDown"].includes(event.key)) {
                event.preventDefault();
                onStep(config.id, event.key === "ArrowDown" ? 1 : -1);
              }
            }}
          >
            <Icon name="drag_indicator" />
          </button>
          <button
            type="button"
            title="Mover para cima"
            onClick={() => onStep(config.id, -1)}
          >
            <Icon name="arrow_upward" />
          </button>
          <button
            type="button"
            title="Mover para baixo"
            onClick={() => onStep(config.id, 1)}
          >
            <Icon name="arrow_downward" />
          </button>
          <button
            type="button"
            title="Trocar coluna"
            onClick={() =>
              onDrop(
                config.id,
                null,
                "after",
                config.lane === "main" ? "side" : "main",
              )
            }
          >
            <Icon name="swap_horiz" />
          </button>
          <button
            type="button"
            title="Ocultar widget"
            onClick={() => onToggle(config.id)}
          >
            <Icon name="visibility_off" />
          </button>
        </div>
      ) : null}
      <div className="today-flow-content">{children}</div>
    </div>
  );
}

const parseDateString = (value) => {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string" && value.includes("T")) return new Date(value);
  return new Date(`${value}T12:00:00`);
};

const formatDate = (value) => {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  }).format(parseDateString(value));
};

export function CampusFlowDashboardScreen({ onNavigate }) {
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDate, setNewTaskDate] = useState(() => getLocalDateKey());
  const [newTaskTime, setNewTaskTime] = useState("");
  const [showTaskSchedule, setShowTaskSchedule] = useState(false);
  const [newHabitTitle, setNewHabitTitle] = useState("");
  const [showWaterSettingsModal, setShowWaterSettingsModal] = useState(false);
  const [selectedWeekday, setSelectedWeekday] = useState(() => {
    const day = new Date().getDay();
    return day >= 1 && day <= 5 ? day : 1;
  });
  const [editingWidgets, setEditingWidgets] = useState(false);
  const [showWidgetCatalog, setShowWidgetCatalog] = useState(false);
  useEffect(() => {
    if (!showWidgetCatalog) return;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setShowWidgetCatalog(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [showWidgetCatalog]);
  const [dragState, setDragState] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const academicState = useStudyStore((state) => state.academic);
  const tasks = useStudyStore((state) => state.tasks?.list || []);
  const habits = useStudyStore((state) => state.habits?.list || []);
  const addTask = useStudyStore((state) => state.addTask);
  const addNote = useStudyStore((state) => state.addNote);
  const updateTask = useStudyStore((state) => state.updateTask);
  const deleteTask = useStudyStore((state) => state.deleteTask);
  const addHabit = useStudyStore((state) => state.addHabit);
  const toggleHabit = useStudyStore((state) => state.toggleHabit);
  const deleteHabit = useStudyStore((state) => state.deleteHabit);
  const notesList = useStudyStore((state) => state.notes?.list || []);
  const setActiveNote = useStudyStore((state) => state.setActiveNote);
  const focusSessions = useStudyStore((state) => state.focusSessions || []);
  const setActiveTask = useStudyStore((state) => state.setActiveTask);
  const setActiveAcademicSubject = useStudyStore(
    (state) => state.setActiveAcademicSubject,
  );
  const flashcardDecks = useStudyStore((state) => state.flashcardDecks || []);
  const setActiveDeck = useStudyStore((state) => state.setActiveDeck);
  const stickyNotes = useStudyStore((state) => state.stickyNotes || []);
  const updateStickyNote = useStudyStore((state) => state.updateStickyNote);
  const dashboardWidgetsState = useStudyStore(
    (state) => state.dashboardWidgets || EMPTY_DASHBOARD_WIDGETS,
  );
  const dashboardWidgets = useMemo(
    () =>
      dashboardWidgetsState.filter(
        (widget) => !widget.id.startsWith("quick-note:") && widget.id !== "focus",
      ),
    [dashboardWidgetsState],
  );
  const reorderDashboardWidgetFlow = useStudyStore(
    (state) => state.reorderDashboardWidgetFlow,
  );
  const stepDashboardWidgetFlow = useStudyStore(
    (state) => state.stepDashboardWidgetFlow,
  );
  const toggleDashboardWidget = useStudyStore(
    (state) => state.toggleDashboardWidget,
  );
  const resetDashboardWidgets = useStudyStore(
    (state) => state.resetDashboardWidgets,
  );
  const habitsPanelSize = useStudyStore(state => state.appSettings?.habitsPanelSize);
  const updateAppSettings = useStudyStore(state => state.updateAppSettings);
  const waterTrackerState = useStudyStore((state) => state.waterTracker);
  const addWaterIntake = useStudyStore((state) => state.addWaterIntake);
  const resetWaterIntake = useStudyStore((state) => state.resetWaterIntake);
  const updateWaterSettings = useStudyStore(
    (state) => state.updateWaterSettings,
  );
  const addAcademicEntity = useStudyStore((state) => state.addAcademicEntity);
  const updateAcademicEntity = useStudyStore(
    (state) => state.updateAcademicEntity,
  );
  const deleteAcademicEntity = useStudyStore(
    (state) => state.deleteAcademicEntity,
  );
  const academic = useMemo(
    () => getAcademicSemesterData(academicState),
    [academicState],
  );
  const flowLanes = useMemo(
    () => dashboardFlowLanes(dashboardWidgets),
    [dashboardWidgets],
  );
  const pinnedStickyNotes = useMemo(
    () => stickyNotes.filter((note) => note.pinned && !note.archived),
    [stickyNotes],
  );
  const subjectById = useMemo(
    () => new Map(academic.subjects.map((subject) => [subject.id, subject])),
    [academic.subjects],
  );

  const pending = tasks
    .filter((task) => task.status !== "completed")
    .sort((a, b) =>
      String(a.dueDate || "9999").localeCompare(String(b.dueDate || "9999")),
    );
  const urgentTask = pending.find((task) => task.dueDate);
  const urgentTaskSubject = urgentTask
    ? subjectById.get(urgentTask.academicSubjectId || urgentTask.subjectId)
    : null;
  const currentDate = useCurrentDate();
  const todayWeekday = currentDate.getDay();

  const weekDays = [1, 2, 3, 4, 5]; // Segunda a Sexta
  const weekClasses = weekDays.map((dayIndex) => {
    const classes = academic.subjects
      .filter(
        (subject) =>
          !subject.isArchived &&
          (subject.schedule?.days || []).some(
            (day) => Number(day) === dayIndex,
          ),
      )
      .sort((a, b) =>
        String(a.schedule?.startTime || "99:99").localeCompare(
          String(b.schedule?.startTime || "99:99"),
        ),
      );
    return { dayIndex, classes };
  });

  const todayKey = getLocalDateKey(currentDate);
  const todayIso = getLocalDateKey(currentDate);
  const waterTracker = waterTrackerForDate(waterTrackerState, todayIso);
  const waterTarget = waterTracker.targetMl || 2000;
  const waterConsumed = waterTracker.consumedMl || 0;
  const cupSizeMl = waterTracker.cupSizeMl || 250;
  const bottleSizeMl = waterTracker.bottleSizeMl || 500;
  const waterPercent = Math.min(
    100,
    Math.round((waterConsumed / waterTarget) * 100),
  );

  const handleCreateSubjectNote = (subject, customDateKey = null) => {
    if (!subject) return;

    const dateKeyToUse = customDateKey || todayKey;
    const classDateObj = new Date(`${dateKeyToUse}T12:00:00`);

    const existingNote = (notesList || []).find(
      (item) =>
        item.academicSubjectId === subject.id && item.date === dateKeyToUse,
    );

    if (existingNote) {
      setActiveNote(existingNote.id);
      setActiveAcademicSubject(subject.id);
      onNavigate?.(SCREEN_IDS.NOTE_EDITOR);
      return;
    }

    const dateFormatted = new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(classDateObj);

    const dateLabel = new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(classDateObj);

    const noteTitle = `Nota da aula — ${dateFormatted} · ${subject.name}`;
    const newNoteId = `note-${Date.now()}`;

    addNote({
      id: newNoteId,
      title: noteTitle,
      content: `<h1>${noteTitle}</h1><p><strong>Disciplina:</strong> ${subject.name}<br><strong>Data:</strong> ${dateLabel}</p><h2>Conteúdo da Aula</h2><ul><li><p></p></li></ul>`,
      academicSubjectId: subject.id,
      category: "Nota de aula",
      date: dateKeyToUse,
      updatedAt: classDateObj.getTime(),
      createdAt: classDateObj.getTime(),
    });

    setActiveNote(newNoteId);
    setActiveAcademicSubject(subject.id);
    onNavigate?.(SCREEN_IDS.NOTE_EDITOR);
  };

  const toggleAttendance = (subjectId, status, customDateKey = null) => {
    const dateKeyToUse = customDateKey || todayKey;
    const existing = (academic.attendance || []).find(
      (entry) => entry.subjectId === subjectId && entry.date === dateKeyToUse,
    );

    let nextAttendanceStatus = null;
    if (existing) {
      // Legacy attendance uses "attended" for the same present state.
      const currentStatus = existing.status === "attended" ? "present" : existing.status;
      if (currentStatus === status) {
        deleteAcademicEntity("attendance", existing.id);
        nextAttendanceStatus = null;
      } else {
        updateAcademicEntity("attendance", existing.id, {
          status,
          date: dateKeyToUse,
          subjectId,
        });
        nextAttendanceStatus = status;
      }
    } else {
      addAcademicEntity("attendance", {
        subjectId,
        semesterId: academic.activeSemesterId,
        date: dateKeyToUse,
        status,
      });
      nextAttendanceStatus = status;
    }

    // Sync classLogs
    const existingLogs = academic.classLogs || [];
    const dateLogForSubject = existingLogs.find(
      (log) => log.subjectId === subjectId && log.date === dateKeyToUse,
    );
    const mappedLogStatus =
      nextAttendanceStatus === "present"
        ? "attended"
        : nextAttendanceStatus === "absent"
          ? "absent"
          : "pending";

    if (dateLogForSubject) {
      updateAcademicEntity("classLogs", dateLogForSubject.id, {
        attendanceStatus: mappedLogStatus,
      });
    } else if (nextAttendanceStatus) {
      const subject = academic.subjects.find((s) => s.id === subjectId);
      const subjectLogs = existingLogs.filter((l) => l.subjectId === subjectId);
      const lessonNumber = subjectLogs.length + 1;
      const subjectName = subject?.name || "Disciplina";

      addAcademicEntity("classLogs", {
        subjectId,
        semesterId: academic.activeSemesterId,
        date: dateKeyToUse,
        title: `Aula ${lessonNumber} - ${subjectName}`,
        topic: `Aula ${lessonNumber} - ${subjectName}`,
        status: "completed",
        attendanceStatus: mappedLogStatus,
      });
    }
  };
  const studiedMinutes = Math.round(
    focusSessions
      .filter((session) => {
        const date = new Date(
          session.endedAt ||
            session.completedAt ||
            session.date ||
            session.startedAt ||
            0,
        );
        return (
          Number.isFinite(date.getTime()) && getLocalDateKey(date) === todayKey
        );
      })
      .reduce(
        (total, session) =>
          total +
          Number(
            session.actualSeconds != null
              ? session.actualSeconds / 60
              : session.durationMinutes || session.minutes || 0,
          ),
        0,
      ),
  );
  const todayTasks = selectTodayTasks(tasks, todayKey);
  const completedTasks = todayTasks.filter(
    (task) => task.status === "completed",
  ).length;
  const completedHabits = habits.filter((habit) =>
    (habit.completedDates || []).includes(todayKey),
  ).length;
  const selectedClasses =
    weekClasses.find((day) => day.dayIndex === selectedWeekday)?.classes || [];
  const selectedDate = new Date(currentDate);
  selectedDate.setDate(
    currentDate.getDate() - ((todayWeekday + 6) % 7) + selectedWeekday - 1,
  );
  const selectedDateKey = getLocalDateKey(selectedDate);
  const habitWeek = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(currentDate);
    date.setDate(currentDate.getDate() - ((todayWeekday + 6) % 7) + index);
    return {
      key: getLocalDateKey(date),
      label: ["S", "T", "Q", "Q", "S", "S", "D"][index],
    };
  });

  const dueCards = useMemo(
    () => dueFlashcards(flashcardDecks),
    [flashcardDecks],
  );
  const reviewDeck = useMemo(() => {
    if (!dueCards.length) return null;
    const dueCountByDeck = dueCards.reduce((acc, card) => {
      acc.set(card.deckId, (acc.get(card.deckId) || 0) + 1);
      return acc;
    }, new Map());

    return (
      flashcardDecks
        .map((deck) => ({
          deck,
          dueCount: dueCountByDeck.get(deck.id) || 0,
        }))
        .filter((item) => item.dueCount > 0)
        .sort(
          (a, b) =>
            b.dueCount - a.dueCount ||
            String(a.deck.title || a.deck.deckTitle || "").localeCompare(
              String(b.deck.title || b.deck.deckTitle || ""),
            ),
        )[0] || null
    );
  }, [dueCards, flashcardDecks]);

  const openTask = (task) => {
    if (!task) return onNavigate?.(SCREEN_IDS.TASKS);
    setActiveTask(task.id);
    onNavigate?.(SCREEN_IDS.TASK_DETAILS);
  };

  const openSubject = (subject) => {
    setActiveAcademicSubject(subject.id);
    onNavigate?.(SCREEN_IDS.ACADEMIC_SUBJECT);
  };

  const openReviewDeck = () => {
    if (!reviewDeck?.deck?.id) return;
    setActiveDeck(reviewDeck.deck.id);
    onNavigate?.(SCREEN_IDS.FLASHCARDS);
  };

  const openStickyNotes = () => {
    setShowWidgetCatalog(false);
    onNavigate?.(SCREEN_IDS.STICKY_NOTES);
  };

  const updateDashboardStickyNote = (noteId, updates) => {
    updateStickyNote(noteId, updates);
    window.studyhubDesktop?.stickyNotes?.broadcastChange?.({
      type: "updated",
      noteId,
      updates,
    });
  };

  const unpinDashboardStickyNote = (note) => {
    if (!note) return;
    updateDashboardStickyNote(note.id, { pinned: false });
  };

  const openDesktopStickyNote = (note) => {
    window.studyhubDesktop?.stickyNotes?.open?.(note.id, {
      alwaysOnTop: Boolean(note.alwaysOnTop),
    });
  };



  const widgetContent = {
    summary: (
      <>
        <WidgetPanel className="today-overview">
          <header className="today-panel-header">
            <h2>
              <Icon name="dashboard" /> Panorama do dia
            </h2>
            <span className="today-caption">Seu progresso</span>
          </header>
          <div className="today-metrics">
            <div>
              <strong>
                {completedTasks}
                {todayTasks.length ? <small>/{todayTasks.length}</small> : null}
              </strong>
              <span>Tarefas concluídas</span>
            </div>
            <div>
              <strong>
                {studiedMinutes}
                <small> min</small>
              </strong>
              <span>Foco hoje</span>
            </div>
            <div>
              <strong>
                {completedHabits}
                {habits.length ? <small>/{habits.length}</small> : null}
              </strong>
              <span>Hábitos feitos</span>
            </div>
          </div>
        </WidgetPanel>
      </>
    ),
    schedule: (
      <>
        <WidgetPanel>
          <header className="today-panel-header">
            <h2>
              <Icon name="calendar_today" /> Agenda da semana
            </h2>
            <button
              type="button"
              className="today-link"
              onClick={() => onNavigate?.(SCREEN_IDS.ACADEMIC)}
            >
              Abrir agenda <Icon name="arrow_outward" />
            </button>
          </header>
          <div
            className="today-weekdays"
            role="group"
            aria-label="Dia da agenda"
          >
            {weekClasses.map(({ dayIndex, classes }) => (
              <button
                key={dayIndex}
                type="button"
                aria-pressed={selectedWeekday === dayIndex}
                onClick={() => setSelectedWeekday(dayIndex)}
              >
                <span>{["", "Seg", "Ter", "Qua", "Qui", "Sex"][dayIndex]}</span>
                <small>
                  {classes.length
                    ? `${classes.length} aula${classes.length > 1 ? "s" : ""}`
                    : "Livre"}
                </small>
              </button>
            ))}
          </div>
          <div className="today-list">
            {selectedClasses.length ? (
              selectedClasses.map((subject) => (
                <div key={subject.id} className="today-row today-class-row">
                  <time>
                    {subject.schedule?.startTime || "—"}
                    <small>{subject.schedule?.endTime || ""}</small>
                  </time>
                  <button
                    type="button"
                    className="today-row-title"
                    onClick={() => openSubject(subject)}
                  >
                    <strong>{subject.name || subject.title}</strong>
                    <small>
                      {subject.schedule?.room || subject.room || "Disciplina"}
                    </small>
                  </button>
                  <button
                    type="button"
                    className="today-icon-button"
                    title={`Registrar presença em ${subject.name || subject.title}`}
                    aria-label={`Registrar presença em ${subject.name || subject.title}`}
                    aria-pressed={academic.attendance.some(
                      (entry) => entry.subjectId === subject.id && entry.date === selectedDateKey &&
                        (entry.status === "present" || entry.status === "attended"),
                    )}
                    onClick={() => toggleAttendance(subject.id, "present", selectedDateKey)}
                  >
                    <Icon name="how_to_reg" />
                  </button>
                  <button
                    type="button"
                    className="today-icon-button"
                    title={`Marcar falta em ${subject.name || subject.title}`}
                    aria-pressed={academic.attendance.some(
                      (entry) =>
                        entry.subjectId === subject.id &&
                        entry.date === selectedDateKey &&
                        entry.status === "absent",
                    )}
                    onClick={() =>
                      toggleAttendance(subject.id, "absent", selectedDateKey)
                    }
                  >
                    <Icon name="person_off" />
                  </button>
                  <button
                    type="button"
                    className="today-icon-button"
                    title={`Anotar aula de ${subject.name || subject.title}`}
                    onClick={() =>
                      handleCreateSubjectNote(subject, selectedDateKey)
                    }
                  >
                    <Icon name="edit_note" />
                  </button>
                </div>
              ))
            ) : (
              <div className="today-empty">
                <Icon name="event_available" />
                <div>
                  <strong>Sem aulas neste dia</strong>
                  <span>Um espaço para estudar no seu ritmo.</span>
                </div>
              </div>
            )}
          </div>
        </WidgetPanel>
      </>
    ),
    deadlines: (
      <>
        <WidgetPanel className="today-mini-panel">
          <header className="today-panel-header">
            <h2>
              <Icon name="flag" /> Próximo prazo
            </h2>
          </header>
          {urgentTask ? (
            <button
              type="button"
              className="today-row-title"
              onClick={() => openTask(urgentTask)}
            >
              <strong>{urgentTask.title}</strong>
              <small>
                {formatDate(urgentTask.dueDate)}
                {urgentTaskSubject ? ` · ${urgentTaskSubject.name}` : ""}
              </small>
            </button>
          ) : (
            <p className="today-quiet">
              <strong>Tudo tranquilo por aqui</strong>
              <span>Nenhum prazo pendente.</span>
            </p>
          )}
        </WidgetPanel>
      </>
    ),
    flashcards: (
      <>
        <WidgetPanel className="today-mini-panel">
          <header className="today-panel-header">
            <h2>
              <Icon name="style" /> Revisão
            </h2>
            <span className="today-badge">{dueCards.length}</span>
          </header>
          {reviewDeck ? (
            <button
              type="button"
              className="today-row-title"
              onClick={openReviewDeck}
            >
              <strong>
                {reviewDeck.deck.title ||
                  reviewDeck.deck.deckTitle ||
                  "Seu deck"}
              </strong>
              <small>{reviewDeck.dueCount} cartões para revisar →</small>
            </button>
          ) : (
            <p className="today-quiet">
              <strong>Flashcards em dia</strong>
              <span>Nenhuma revisão pendente.</span>
            </p>
          )}
        </WidgetPanel>
      </>
    ),
    tasks: (
      <>
        <WidgetPanel className="">
          <header className="today-panel-header">
            <h2>
              <Icon name="checklist" /> Tarefas de hoje{" "}
              <span className="today-badge">
                {todayTasks.length
                  ? `${completedTasks}/${todayTasks.length}`
                  : "Hoje"}
              </span>
            </h2>
            <button
              type="button"
              className="today-link"
              onClick={() => onNavigate?.(SCREEN_IDS.TASKS)}
            >
              Ver todas <Icon name="arrow_outward" />
            </button>
          </header>
          <div className="today-list">
            {todayTasks.length ? (
              todayTasks.map((task) => {
                const done = task.status === "completed";
                return (
                  <div
                    key={task.id}
                    className={`today-row ${done ? "is-done" : ""}`}
                  >
                    <button
                      type="button"
                      className="today-check"
                      aria-label={`${done ? "Reabrir" : "Concluir"} tarefa ${task.title}`}
                      aria-pressed={done}
                      onClick={() =>
                        updateTask(task.id, {
                          status: done ? "pending" : "completed",
                          completedDate: done ? null : todayKey,
                        })
                      }
                    >
                      {done ? <Icon name="check" /> : null}
                    </button>
                    <button
                      type="button"
                      className="today-row-title"
                      onClick={() => openTask(task)}
                    >
                      <strong>{task.title}</strong>
                      {task.dueTime ? <small className="today-task-time"><Icon name="schedule" />{task.dueTime}</small> : null}
                      {!done && task.dueDate < todayKey ? (
                        <small className="today-overdue">
                          Prazo vencido · {formatDate(task.dueDate)}
                        </small>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      className="today-icon-button"
                      aria-label={`Excluir tarefa ${task.title}`}
                      onClick={() => deleteTask(task.id)}
                    >
                      <Icon name="close" />
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="today-empty">
                <Icon name="task_alt" />
                <div>
                  <strong>O que merece sua atenção hoje?</strong>
                  <span>Adicione sua primeira tarefa abaixo.</span>
                </div>
              </div>
            )}
          </div>
          <form
            className="today-add-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!newTaskTitle.trim()) return;
              addTask({
                title: newTaskTitle.trim(),
                status: "pending",
                dueDate: newTaskDate || todayKey,
                dueTime: newTaskTime || null,
                isTodayTask: (newTaskDate || todayKey) <= todayKey,
              });
              setNewTaskTitle("");
              setNewTaskDate(todayKey);
              setNewTaskTime("");
              setShowTaskSchedule(false);
            }}
          >
            <Icon name="add" />
            <input
              aria-label="Nova tarefa para hoje"
              placeholder="Adicionar tarefa para hoje..."
              value={newTaskTitle}
              onChange={(event) => setNewTaskTitle(event.target.value)}
            />
            <button
              type="button"
              className={`today-schedule-button ${showTaskSchedule ? "is-active" : ""}`}
              aria-label="Definir data e horário da tarefa"
              title="Definir data e horário"
              onClick={() => setShowTaskSchedule((visible) => !visible)}
            ><Icon name="schedule" /></button>
            {showTaskSchedule ? <span className="today-schedule-popover">
              <label>Data <input type="date" value={newTaskDate} onChange={(event) => setNewTaskDate(event.target.value)} /></label>
              <label>Horário <input type="time" value={newTaskTime} onChange={(event) => setNewTaskTime(event.target.value)} /></label>
            </span> : null}
            <button type="submit" disabled={!newTaskTitle.trim()}>
              Adicionar
            </button>
          </form>
        </WidgetPanel>
      </>
    ),
    habits: (
      <>
        <HabitsPanel size={habitsPanelSize} onResize={size => updateAppSettings({ habitsPanelSize: size })}>
          <header className="today-panel-header">
            <h2>
              <Icon name="routine" /> Hábitos
            </h2>
            <span className="today-badge">
              {habits.length ? `${completedHabits}/${habits.length}` : "Hoje"}
            </span>
          </header>
          <div className="today-list">
            {habits.length ? (
              habits.map((habit) => {
                const done = (habit.completedDates || []).includes(todayKey);
                return (
                  <div key={habit.id} className="today-habit">
                    <div className={`today-row ${done ? "is-done" : ""}`}>
                      <button
                        type="button"
                        className="today-check"
                        aria-label={`${done ? "Desmarcar" : "Concluir"} hábito ${habit.title}`}
                        aria-pressed={done}
                        onClick={() => toggleHabit(habit.id, todayKey)}
                      >
                        {done ? <Icon name="check" /> : null}
                      </button>
                      <strong className="today-habit-title">
                        {habit.title}
                      </strong>
                      <button
                        type="button"
                        className="today-icon-button"
                        aria-label={`Excluir hábito ${habit.title}`}
                        onClick={() => deleteHabit(habit.id)}
                      >
                        <Icon name="close" />
                      </button>
                    </div>
                    <div
                      className="today-habit-history"
                      role="group"
                      aria-label={`Histórico de ${habit.title}`}
                    >
                      {habitWeek.map((day) => (
                        <button
                          key={day.key}
                          type="button"
                          title={`${habit.title} · ${day.key}`}
                          aria-label={`${habit.title} em ${day.key}`}
                          aria-pressed={(habit.completedDates || []).includes(
                            day.key,
                          )}
                          aria-current={
                            day.key === todayKey ? "date" : undefined
                          }
                          onClick={() => toggleHabit(habit.id, day.key)}
                        >
                          {day.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="today-empty">
                <div>
                  <strong>Pequenos passos, todo dia.</strong>
                  <span>Comece com um hábito simples.</span>
                </div>
              </div>
            )}
          </div>
          <form
            className="today-add-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!newHabitTitle.trim()) return;
              addHabit(newHabitTitle.trim(), "#f4b873");
              setNewHabitTitle("");
            }}
          >
            <input
              aria-label="Novo hábito"
              placeholder="Novo hábito..."
              value={newHabitTitle}
              onChange={(event) => setNewHabitTitle(event.target.value)}
            />
            <button
              type="submit"
              aria-label="Adicionar hábito"
              disabled={!newHabitTitle.trim()}
            >
              <Icon name="add" />
            </button>
          </form>
        </HabitsPanel>
      </>
    ),
    water: (
      <>
        <WidgetPanel className="today-water">
          <div className="today-water-label">
            <Icon name="water_drop" />
            <div>
              <h2>Hidratação</h2>
              <span className="today-caption">
                {waterConsumed} de {waterTarget} ml
              </span>
            </div>
          </div>
          <div className="today-water-progress">
            <div
              className="today-progress"
              role="progressbar"
              aria-label="Meta de hidratação"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={waterPercent}
            >
              <span style={{ width: `${waterPercent}%` }} />
            </div>
            <span className="today-caption">
              {waterPercent}% da meta diária
            </span>
          </div>
          <div className="today-water-actions">
            <button
              type="button"
              className="campus-secondary-button"
              onClick={() => addWaterIntake(cupSizeMl)}
            >
              + {cupSizeMl} ml
            </button>
            <button
              type="button"
              className="campus-secondary-button"
              onClick={() => addWaterIntake(bottleSizeMl)}
            >
              + {bottleSizeMl} ml
            </button>
            <button
              type="button"
              className="today-icon-button"
              aria-label="Configurações de Hidratação"
              onClick={() => setShowWaterSettingsModal(true)}
            >
              <Icon name="tune" />
            </button>
          </div>
        </WidgetPanel>
      </>
    ),
  };
  for (const note of pinnedStickyNotes)
    widgetContent[`sticky-note:${note.id}`] = (
      <QuickNoteWidgetCard
        note={note}
        onChange={updateDashboardStickyNote}
        onUnpin={unpinDashboardStickyNote}
        onOpenStickyNotes={openStickyNotes}
        onOpenDesktop={openDesktopStickyNote}
      />
    );
  const renderWidget = (config) => (
    <DashboardWidgetShell
      key={config.id}
      config={config}
      label={
        pinnedStickyNotes.find((note) => `sticky-note:${note.id}` === config.id)
          ?.title
      }
      editing={editingWidgets}
      draggedId={dragState?.id}
      dropTarget={dropTarget}
      onDragStart={setDragState}
      onPreview={(preview) => {
        setDropTarget(preview.target);
        setDragState((state) =>
          state ? { ...state, x: preview.x, y: preview.y } : null,
        );
      }}
      onDragEnd={() => {
        setDragState(null);
        setDropTarget(null);
      }}
      onDrop={reorderDashboardWidgetFlow}
      onStep={stepDashboardWidgetFlow}
      onToggle={toggleDashboardWidget}
    >
      {widgetContent[config.id]}
    </DashboardWidgetShell>
  );
  return (
    <main className="campus-page campus-dashboard">
      <div className="campus-page-inner">
        <div className="campus-dashboard-shell">
          <div className="campus-dashboard-customize-bar">
            <div>
              <h1 className="text-2xl font-black text-[color:var(--on-surface)]">
                Hoje
              </h1>
              <p className="today-date">
                {currentDate.toLocaleDateString("pt-BR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}{" "}
                · Um passo de cada vez.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {editingWidgets ? (
                <button
                  type="button"
                  className="campus-primary-button"
                  onClick={() => {
                    setEditingWidgets(false);
                    setDragState(null);
                    setDropTarget(null);
                  }}
                >
                  <Icon name="done" /> Concluir organização
                </button>
              ) : null}
              <button
                type="button"
                className="today-personalize"
                onClick={() => setShowWidgetCatalog(true)}
              >
                <Icon name="tune" /> Personalizar
              </button>
            </div>
          </div>
          <div
            className={`today-flow ${editingWidgets ? "is-organizing" : ""}`}
          >
            <section
              className={`today-flow-lane ${dropTarget?.lane === "main" && !dropTarget.id ? "is-drop-empty" : ""}`}
              data-dashboard-lane="main"
              aria-label="Planejamento do dia"
            >
              {flowLanes.main.map(renderWidget)}
              {!flowLanes.main.length ? (
                <p className="today-flow-empty">
                  Sua coluna principal está livre.
                </p>
              ) : null}
            </section>
            <aside
              className={`today-flow-lane ${dropTarget?.lane === "side" && !dropTarget.id ? "is-drop-empty" : ""}`}
              data-dashboard-lane="side"
              aria-label="Rotina e acompanhamento"
            >
              {flowLanes.side.map(renderWidget)}
              {!flowLanes.side.length ? (
                <p className="today-flow-empty">
                  Sua coluna de apoio está livre.
                </p>
              ) : null}
            </aside>
          </div>
        </div>
      </div>
      {dragState ? (
        <div
          className="today-drag-ghost"
          style={{ left: dragState.x + 12, top: dragState.y + 12 }}
        >
          <Icon name="drag_indicator" />
          {dragState.label}
        </div>
      ) : null}

      {showWidgetCatalog ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              setShowWidgetCatalog(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Widgets da tela Hoje"
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-[color:var(--surface)] p-6 shadow-2xl"
          >
            <header className="flex items-start justify-between gap-4">
              <div>
                <span className="campus-eyebrow">Personalização</span>
                <h2 className="mt-1 text-xl font-black">
                  Widgets da tela Hoje
                </h2>
                <p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">
                  Escolha o que aparece no painel. No modo de edição, arraste
                  para reorganizar.
                </p>
              </div>
              <button
                type="button"
                aria-label="Fechar catálogo de widgets"
                onClick={() => setShowWidgetCatalog(false)}
                className="rounded-xl p-2 hover:bg-[color:var(--surface-container-high)]"
              >
                <Icon name="close" />
              </button>
            </header>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={openStickyNotes}
                className="flex items-center gap-3 rounded-2xl border border-dashed border-amber-500/50 bg-amber-500/[0.06] p-4 text-left text-amber-700 hover:bg-amber-500/10 dark:text-amber-300"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15">
                  <Icon name="sticky_note_2" />
                </span>
                <span>
                  <strong className="block text-sm">
                    Gerenciar Sticky Notes
                  </strong>
                  <small>Fixe uma nota para mostrar no Hoje</small>
                </span>
              </button>
              {dashboardWidgets.map((widget) => {
                const quickNote = widget.id.startsWith("sticky-note:")
                  ? pinnedStickyNotes.find(
                      (note) => `sticky-note:${note.id}` === widget.id,
                    )
                  : null;
                const meta =
                  DASHBOARD_WIDGET_META[widget.id] ||
                  (quickNote
                    ? {
                        label: quickNote.title || "Anotação rápida",
                        icon: "sticky_note_2",
                      }
                    : { label: widget.id, icon: "widgets" });
                return (
                  <button
                    key={widget.id}
                    type="button"
                    onClick={() => toggleDashboardWidget(widget.id)}
                    className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${widget.visible === false ? "border-[color:var(--outline-variant)]/25 opacity-60" : "border-[color:var(--primary)]/30 bg-[color:var(--primary)]/5"}`}
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--surface-container-high)] text-[color:var(--primary)]">
                      <Icon name={meta.icon} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block text-sm">{meta.label}</strong>
                      <small className="text-[color:var(--on-surface-variant)]">
                        {widget.visible === false ? "Oculto" : "Visível"}
                      </small>
                    </span>
                    <Icon
                      name={
                        widget.visible === false
                          ? "visibility_off"
                          : "visibility"
                      }
                    />
                  </button>
                );
              })}
            </div>
            {pinnedStickyNotes.length ? (
              <section className="mt-6 border-t border-[color:var(--outline-variant)]/20 pt-5">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <span className="campus-eyebrow">Sticky Notes fixadas</span>
                    <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">
                      Remover daqui não apaga a nota.
                    </p>
                  </div>
                  <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-black text-amber-700 dark:text-amber-300">
                    {pinnedStickyNotes.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {pinnedStickyNotes.map((note) => (
                    <div
                      key={note.id}
                      className="flex items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] p-3"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
                        <Icon name="sticky_note_2" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-sm">
                          {note.title || "Anotação sem título"}
                        </strong>
                        <small className="block truncate text-[color:var(--on-surface-variant)]">
                          {note.content || "Sem conteúdo"}
                        </small>
                      </span>
                      <button
                        type="button"
                        className="rounded-xl p-2 text-[color:var(--on-surface-variant)] hover:bg-amber-500/10 hover:text-amber-700"
                        title={`Remover ${note.title || "anotação"} do Hoje`}
                        onClick={() => unpinDashboardStickyNote(note)}
                      >
                        <Icon name="keep_off" className="text-[18px]" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
            <footer className="mt-6 flex justify-between gap-3 border-t border-[color:var(--outline-variant)]/20 pt-4">
              <button
                type="button"
                className="campus-secondary-button"
                onClick={resetDashboardWidgets}
              >
                <Icon name="restart_alt" /> Restaurar padrão
              </button>
              <button
                type="button"
                className="campus-primary-button"
                onClick={() => {
                  setShowWidgetCatalog(false);
                  setEditingWidgets(true);
                }}
              >
                <Icon name="swap_vert" /> Organizar widgets
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {showWaterSettingsModal && (
        <WaterSettingsModal
          waterTracker={waterTracker}
          onClose={() => setShowWaterSettingsModal(false)}
          onSave={updateWaterSettings}
          onReset={resetWaterIntake}
        />
      )}
    </main>
  );
}

function WaterSettingsModal({ waterTracker, onClose, onSave, onReset }) {
  const [targetMl, setTargetMl] = useState(waterTracker.targetMl || 2000);
  const [targetError, setTargetError] = useState("");
  const [cupSizeMl, setCupSizeMl] = useState(waterTracker.cupSizeMl || 250);
  const [bottleSizeMl, setBottleSizeMl] = useState(
    waterTracker.bottleSizeMl || 500,
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    const validTarget = parseWaterTarget(targetMl);
    if (validTarget === null) {
      setTargetError("Informe uma meta entre 0,5 e 15 L (500 a 15000 ml).");
      e.currentTarget.querySelector("#water-target")?.focus();
      return;
    }

    onSave({
      targetMl: validTarget,
      cupSizeMl: Number(cupSizeMl) || 250,
      bottleSizeMl: Number(bottleSizeMl) || 500,
    });
    onClose();
  };

  const parsedTargetMl = parseWaterTarget(targetMl);
  const displayLiters = parsedTargetMl === null ? null : parsedTargetMl / 1000;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="neo-raised bg-[color:var(--surface)] w-full max-w-md rounded-3xl p-6 sm:p-8 shadow-2xl border border-[color:var(--outline-variant)]/20 relative overflow-hidden">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-[color:var(--outline-variant)]/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/15 text-cyan-500 flex items-center justify-center shadow-inner">
              <Icon name="water_drop" className="text-[22px]" />
            </div>
            <div>
              <h2 className="text-lg font-black text-[color:var(--on-surface)]">
                Configurações de Hidratação
              </h2>
              <p className="text-xs text-[color:var(--on-surface-variant)]">
                Personalize sua meta e atalhos diários
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-container-high)]"
          >
            <Icon name="close" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* Target Intake */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="water-target" className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider">
                Meta Diária de Água
              </label>
              <span className="text-xs font-black text-cyan-500">
                {displayLiters === null ? "—" : `${displayLiters.toLocaleString("pt-BR")} L (${parsedTargetMl} ml)`}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1.5 mb-3">
              {[2000, 3000, 4000, 5000, 6000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => { setTargetMl(amt); setTargetError(""); }}
                  className={`py-2 text-[11px] font-extrabold rounded-xl border transition-all ${
                    parsedTargetMl === amt
                      ? "bg-cyan-500 text-white border-cyan-500 shadow-md shadow-cyan-500/20"
                      : "bg-[color:var(--surface-container-low)] text-[color:var(--on-surface)] border-[color:var(--outline-variant)]/30 hover:border-cyan-500/50"
                  }`}
                >
                  {amt / 1000} L
                </button>
              ))}
            </div>
            <div className="relative flex items-center">
              <input
                id="water-target"
                type="text"
                inputMode="decimal"
                required
                aria-invalid={Boolean(targetError)}
                aria-describedby="water-target-help water-target-error"
                value={targetMl}
                onChange={(e) => { setTargetMl(e.target.value); setTargetError(""); }}
                placeholder="Ex: 4 L ou 4000 ml"
                className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl pl-4 pr-36 py-3 text-sm font-bold text-[color:var(--on-surface)] outline-none focus:border-cyan-500"
              />
              <span className="absolute right-4 text-xs font-bold text-[color:var(--on-surface-variant)] opacity-70">
                Litros (L) ou ml
              </span>
            </div>
            <p id="water-target-help" className="mt-2 text-xs text-[color:var(--on-surface-variant)]">
              De 0,5 a 15 L (500 a 15000 ml). Ex.: 4,5 L ou 4500 ml.
            </p>
            <p id="water-target-error" role={targetError ? "alert" : undefined} className="mt-1 text-xs text-red-500">
              {targetError}
            </p>
          </div>

          {/* Quick Shortcuts: Bottle Size */}
          <div>
            <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-2">
              Tamanho da Garrafa (Atalho 1 - Garrafa)
            </label>
            <div className="grid grid-cols-3 gap-2 mb-2">
              {[500, 750, 1000].map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setBottleSizeMl(sz)}
                  className={`py-2 text-xs font-extrabold rounded-xl border transition-all ${
                    Number(bottleSizeMl) === sz
                      ? "bg-cyan-500 text-white border-cyan-500 shadow-md shadow-cyan-500/20"
                      : "bg-[color:var(--surface-container-low)] text-[color:var(--on-surface)] border-[color:var(--outline-variant)]/30 hover:border-cyan-500/50"
                  }`}
                >
                  {sz >= 1000 ? `${sz / 1000} L` : `${sz} ml`}
                </button>
              ))}
            </div>
            <div className="relative flex items-center">
              <input
                type="number"
                min="100"
                max="5000"
                step="50"
                value={bottleSizeMl}
                onChange={(e) => setBottleSizeMl(e.target.value)}
                placeholder="Personalizado (ml)"
                className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-2 text-xs font-bold text-[color:var(--on-surface)] outline-none focus:border-cyan-500"
              />
              <span className="absolute right-4 text-[11px] font-bold text-[color:var(--on-surface-variant)] opacity-70">
                ml customizado
              </span>
            </div>
          </div>

          {/* Quick Shortcuts: Cup Size */}
          <div>
            <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-2">
              Tamanho do Copo (Atalho 2 - Copo)
            </label>
            <div className="grid grid-cols-3 gap-2 mb-2">
              {[200, 250, 300].map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setCupSizeMl(sz)}
                  className={`py-2 text-xs font-extrabold rounded-xl border transition-all ${
                    Number(cupSizeMl) === sz
                      ? "bg-cyan-500 text-white border-cyan-500 shadow-md shadow-cyan-500/20"
                      : "bg-[color:var(--surface-container-low)] text-[color:var(--on-surface)] border-[color:var(--outline-variant)]/30 hover:border-cyan-500/50"
                  }`}
                >
                  {sz} ml
                </button>
              ))}
            </div>
            <div className="relative flex items-center">
              <input
                type="number"
                min="50"
                max="2000"
                step="10"
                value={cupSizeMl}
                onChange={(e) => setCupSizeMl(e.target.value)}
                placeholder="Personalizado (ml)"
                className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-2 text-xs font-bold text-[color:var(--on-surface)] outline-none focus:border-cyan-500"
              />
              <span className="absolute right-4 text-[11px] font-bold text-[color:var(--on-surface-variant)] opacity-70">
                ml customizado
              </span>
            </div>
          </div>

          {/* Reset button */}
          <div className="pt-2 border-t border-[color:var(--outline-variant)]/20 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                if (confirm("Deseja zerar a contagem de água de hoje?")) {
                  onReset();
                  onClose();
                }
              }}
              className="text-xs font-bold text-red-500 hover:underline flex items-center gap-1"
            >
              <Icon name="refresh" className="text-[14px]" />
              Zerar consumo de hoje
            </button>
          </div>

          {/* Submit */}
          <div className="flex gap-3 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl bg-[color:var(--surface-container-high)] text-[color:var(--on-surface)] font-bold text-xs uppercase tracking-wider hover:opacity-80"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 py-3 rounded-xl bg-cyan-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-cyan-500/25 hover:bg-cyan-600 transition-colors"
            >
              Salvar Alterações
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
