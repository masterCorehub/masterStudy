import { useMemo, useRef, useState } from "react";
import { motion, useDragControls } from "framer-motion";
import { SCREEN_IDS } from "../app/screenIds";
import {
  buildAcademicCalendarEvents,
  calculateAttendance,
  calculateSubjectGrade,
  getAcademicSemesterData,
} from "../domain/academic";
import { dueFlashcards } from "../domain/studySelectors";
import { usePomodoroStore } from "../store/usePomodoroStore";
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
    header: "bg-[color:var(--surface-container)] border-[color:var(--outline-variant)]/40",
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
    placeholder: "placeholder:text-amber-700/50 dark:placeholder:text-amber-200/40",
  },
  lavender: {
    bg: "bg-purple-500/10 dark:bg-purple-950/30",
    border: "border-purple-500/30 dark:border-purple-500/20",
    header: "bg-purple-500/15 border-purple-500/25",
    accent: "text-purple-600 dark:text-purple-400",
    text: "text-[color:var(--on-surface)]",
    placeholder: "placeholder:text-purple-700/50 dark:placeholder:text-purple-200/40",
  },
  cyan: {
    bg: "bg-cyan-500/10 dark:bg-cyan-950/30",
    border: "border-cyan-500/30 dark:border-cyan-500/20",
    header: "bg-cyan-500/15 border-cyan-500/25",
    accent: "text-cyan-600 dark:text-cyan-400",
    text: "text-[color:var(--on-surface)]",
    placeholder: "placeholder:text-cyan-700/50 dark:placeholder:text-cyan-200/40",
  },
  emerald: {
    bg: "bg-emerald-500/10 dark:bg-emerald-950/30",
    border: "border-emerald-500/30 dark:border-emerald-500/20",
    header: "bg-emerald-500/15 border-emerald-500/25",
    accent: "text-emerald-600 dark:text-emerald-400",
    text: "text-[color:var(--on-surface)]",
    placeholder: "placeholder:text-emerald-700/50 dark:placeholder:text-emerald-200/40",
  },
  rose: {
    bg: "bg-rose-500/10 dark:bg-rose-950/30",
    border: "border-rose-500/30 dark:border-rose-500/20",
    header: "bg-rose-500/15 border-rose-500/25",
    accent: "text-rose-600 dark:text-rose-400",
    text: "text-[color:var(--on-surface)]",
    placeholder: "placeholder:text-rose-700/50 dark:placeholder:text-rose-200/40",
  },
  yellow: {
    bg: "bg-amber-500/10 dark:bg-amber-950/30",
    border: "border-amber-500/30 dark:border-amber-500/20",
    header: "bg-amber-500/15 border-amber-500/25",
    accent: "text-amber-600 dark:text-amber-400",
    text: "text-[color:var(--on-surface)]",
    placeholder: "placeholder:text-amber-700/50 dark:placeholder:text-amber-200/40",
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
    placeholder: "placeholder:text-emerald-700/50 dark:placeholder:text-emerald-200/40",
  },
  purple: {
    bg: "bg-violet-500/10 dark:bg-violet-950/30",
    border: "border-violet-500/30 dark:border-violet-500/20",
    header: "bg-violet-500/15 border-violet-500/25",
    accent: "text-violet-600 dark:text-violet-400",
    text: "text-[color:var(--on-surface)]",
    placeholder: "placeholder:text-violet-700/50 dark:placeholder:text-violet-200/40",
  },
  slate: {
    bg: "bg-slate-500/10 dark:bg-slate-900/50",
    border: "border-slate-500/30 dark:border-slate-500/20",
    header: "bg-slate-500/15 border-slate-500/25",
    accent: "text-slate-600 dark:text-slate-300",
    text: "text-[color:var(--on-surface)]",
    placeholder: "placeholder:text-slate-700/50 dark:placeholder:text-slate-200/40",
  },
};

function QuickNoteWidgetCard({ note, onChange, onUnpin, onOpenStickyNotes, onOpenDesktop }) {
  const [showPalette, setShowPalette] = useState(false);
  const colorKey = note.color && QUICK_NOTE_COLOR_MAP[note.color] ? note.color : "yellow";
  const color = QUICK_NOTE_COLOR_MAP[colorKey];

  return (
    <article
      className={`flex h-full min-h-[180px] flex-col overflow-hidden rounded-2xl border shadow-md transition-all duration-200 ${color.bg} ${color.border} ${color.text}`}
    >
      <header className={`flex items-center gap-2 border-b px-3.5 py-2.5 transition-colors ${color.header}`}>
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
                    colorKey === p.id ? "border-[color:var(--on-surface)] scale-110 shadow-sm" : "border-transparent"
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
      <textarea
        value={note.content || ""}
        onChange={(event) => onChange(note.id, { content: event.target.value })}
        placeholder="Ideias, lembretes e metas rápidas..."
        className={`min-h-0 flex-1 resize-none border-0 bg-transparent p-4 text-sm font-medium leading-relaxed outline-none focus:ring-0 ${color.placeholder}`}
      />
    </article>
  );
}

const DASHBOARD_WIDGET_META = {
  schedule: { label: "Agenda da semana", icon: "calendar_today" },
  summary: { label: "Resumo do dia", icon: "insights" },
  focus: { label: "Foco rápido", icon: "timer" },
  deadlines: { label: "Próximos prazos", icon: "event_upcoming" },
  habits: { label: "Hábitos", icon: "task_alt" },
  water: { label: "Hidratação", icon: "water_drop" },
  flashcards: { label: "Revisão de flashcards", icon: "style" },
  tasks: { label: "Tarefas de hoje", icon: "check_circle" },
};

function DashboardWidgetShell({
  config,
  label,
  gridRef,
  editing,
  draggedId,
  onDragStart,
  onPreview,
  onPosition,
  onDragEnd,
  onResize,
  onResizeHeight,
  onToggle,
  children,
}) {
  const dragControls = useDragControls();
  const grabOffsetRef = useRef({ x: 0, y: 0 });
  if (!config || config.visible === false) return null;
  const meta = DASHBOARD_WIDGET_META[config.id] || (config.id.startsWith("sticky-note:")
    ? { label: label || "Sticky Note", icon: "sticky_note_2" }
    : { label: config.id, icon: "widgets" });
  const positionFromPoint = (point) => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return { x: Number(config.x || 0), y: Number(config.y || 0) };
    const columnGap = 24;
    const rowStep = 104;
    const columnStep = (rect.width - columnGap * 11) / 12 + columnGap;
    return {
      x: Math.max(0, Math.min(12 - Number(config.size || 12), Math.round((point.x - rect.left) / columnStep - grabOffsetRef.current.x))),
      y: Math.max(0, Math.round((point.y - rect.top) / rowStep - grabOffsetRef.current.y)),
    };
  };
  return (
    <motion.div
      layout="position"
      transition={{ layout: { type: "spring", stiffness: 420, damping: 38 } }}
      className={`campus-dashboard-widget ${editing ? "is-editing" : ""} ${draggedId === config.id ? "is-dragging" : ""}`}
      style={{
        gridColumn: `${Number(config.x || 0) + 1} / span ${config.size || 12}`,
        gridRow: `${Number(config.y || 0) + 1} / span ${config.rowSpan || 3}`,
      }}
      data-dashboard-widget-id={config.id}
      drag={editing}
      dragListener={false}
      dragControls={dragControls}
      dragMomentum={false}
      dragElastic={0.08}
      dragSnapToOrigin
      whileDrag={{ scale: 1.025, rotate: 0.35, zIndex: 80 }}
      onDragStart={(event) => {
        const gridRect = gridRef.current?.getBoundingClientRect();
        const widgetRect = event.currentTarget?.getBoundingClientRect?.();
        if (gridRect && widgetRect) {
          const columnStep = (gridRect.width - 24 * 11) / 12 + 24;
          grabOffsetRef.current = {
            x: Math.max(0, (event.clientX - widgetRect.left) / columnStep),
            y: Math.max(0, (event.clientY - widgetRect.top) / 104),
          };
        }
        onDragStart(config.id);
      }}
      onDrag={(_event, info) => {
        onPreview({ id: config.id, ...positionFromPoint(info.point), size: config.size, rowSpan: config.rowSpan });
        if (info.point.y < 90) window.scrollBy({ top: -12, behavior: "auto" });
        if (info.point.y > window.innerHeight - 90) window.scrollBy({ top: 12, behavior: "auto" });
      }}
      onDragEnd={(_event, info) => {
        const position = positionFromPoint(info.point);
        onPosition(config.id, position.x, position.y);
        onDragEnd();
      }}
    >
      {editing ? (
        <div className="campus-dashboard-widget-controls">
          <button
            type="button"
            className="campus-dashboard-widget-drag"
            onPointerDown={(event) => dragControls.start(event)}
            title="Segure e arraste para reorganizar"
          >
            <Icon name="drag_indicator" /> {meta.label}
          </button>
          <div className="campus-dashboard-widget-size-controls">
            <button type="button" onClick={() => onResize(config.id, [4, 6, 8, 12][Math.max(0, [4, 6, 8, 12].indexOf(Number(config.size)) - 1)])} disabled={Number(config.size) <= 4} title="Diminuir largura"><Icon name="remove" /></button>
            <span className="campus-dashboard-widget-dimension">{config.size}×{config.rowSpan || 3}</span>
            <button type="button" onClick={() => onResize(config.id, [4, 6, 8, 12][Math.min(3, [4, 6, 8, 12].indexOf(Number(config.size)) + 1)])} disabled={Number(config.size) >= 12} title="Aumentar largura"><Icon name="add" /></button>
            <button type="button" onClick={() => onResizeHeight(config.id, Number(config.rowSpan || 3) - 1)} disabled={Number(config.rowSpan || 3) <= 2} title="Diminuir altura"><Icon name="height" className="rotate-180" /></button>
            <button type="button" onClick={() => onResizeHeight(config.id, Number(config.rowSpan || 3) + 1)} disabled={Number(config.rowSpan || 3) >= 10} title="Aumentar altura"><Icon name="height" /></button>
            <button type="button" onClick={() => onToggle(config.id)} title="Ocultar widget">
              <Icon name="visibility_off" />
            </button>
          </div>
        </div>
      ) : null}
      <div className={`campus-dashboard-widget-content ${editing ? "pointer-events-none select-none" : ""}`}>{children}</div>
    </motion.div>
  );
}

const parseDateString = (value) => {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string' && value.includes("T")) return new Date(value);
  return new Date(`${value}T12:00:00`);
};

const formatDate = (value) => {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(
    parseDateString(value),
  );
};

const formatDateWithWeekday = (value) => {
  if (!value) return "Dia não informado";
  const [weekday, date] = new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  })
    .format(parseDateString(value))
    .split(",");
  return `${weekday.replace(".", "")},${date ? date : ""}`.trim();
};

export function CampusFlowDashboardScreen({ onNavigate }) {
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState("");
  const [newHabitTitle, setNewHabitTitle] = useState("");
  const [showWaterSettingsModal, setShowWaterSettingsModal] = useState(false);
  const [gridDisplayMode, setGridDisplayMode] = useState("bottle");
  const [editingWidgets, setEditingWidgets] = useState(false);
  const [showWidgetCatalog, setShowWidgetCatalog] = useState(false);
  const [draggedWidgetId, setDraggedWidgetId] = useState("");
  const [dragPreview, setDragPreview] = useState(null);
  const dashboardGridRef = useRef(null);
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
  const setActiveAcademicSubject = useStudyStore((state) => state.setActiveAcademicSubject);
  const courses = useStudyStore((state) => state.courses || []);
  const flashcardDecks = useStudyStore((state) => state.flashcardDecks || []);
  const setActiveDeck = useStudyStore((state) => state.setActiveDeck);
  const createCourseForAcademicSubject = useStudyStore(
    (state) => state.createCourseForAcademicSubject,
  );
  const setActiveCourse = useStudyStore((state) => state.setActiveCourse);
  const stickyNotes = useStudyStore((state) => state.stickyNotes || []);
  const updateStickyNote = useStudyStore((state) => state.updateStickyNote);
  const dashboardWidgetsState = useStudyStore(
    (state) => state.dashboardWidgets || EMPTY_DASHBOARD_WIDGETS,
  );
  const dashboardWidgets = useMemo(
    () => dashboardWidgetsState.filter((widget) => !widget.id.startsWith("quick-note:")),
    [dashboardWidgetsState],
  );
  const setDashboardWidgetSize = useStudyStore((state) => state.setDashboardWidgetSize);
  const setDashboardWidgetHeight = useStudyStore((state) => state.setDashboardWidgetHeight);
  const positionDashboardWidget = useStudyStore((state) => state.positionDashboardWidget);
  const toggleDashboardWidget = useStudyStore((state) => state.toggleDashboardWidget);
  const resetDashboardWidgets = useStudyStore((state) => state.resetDashboardWidgets);
  const waterTrackerState = useStudyStore((state) => state.waterTracker);
  const addWaterIntake = useStudyStore((state) => state.addWaterIntake);
  const resetWaterIntake = useStudyStore((state) => state.resetWaterIntake);
  const setWaterTarget = useStudyStore((state) => state.setWaterTarget);
  const updateWaterSettings = useStudyStore((state) => state.updateWaterSettings);
  const addAcademicEntity = useStudyStore((state) => state.addAcademicEntity);
  const updateAcademicEntity = useStudyStore((state) => state.updateAcademicEntity);
  const deleteAcademicEntity = useStudyStore((state) => state.deleteAcademicEntity);
  const state = useStudyStore((store) => store);
  const academic = useMemo(() => getAcademicSemesterData(academicState), [academicState]);
  const startTimer = usePomodoroStore((state) => state.startTimer);
  const widgetById = useMemo(
    () => new Map(dashboardWidgets.map((widget, index) => [widget.id, { ...widget, order: index }])),
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
    .sort((a, b) => String(a.dueDate || "9999").localeCompare(String(b.dueDate || "9999")));
  const urgentTask = pending[0];
  const urgentTaskSubject = urgentTask
    ? subjectById.get(urgentTask.academicSubjectId || urgentTask.subjectId)
    : null;
  const subjects = academic.subjects.filter((subject) => !subject.isArchived).slice(0, 3);
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
  const waterTracker = (waterTrackerState && waterTrackerState.date === todayIso)
    ? waterTrackerState
    : {
        ...(waterTrackerState || {}),
        date: todayIso,
        targetMl: waterTrackerState?.targetMl || 2000,
        cupSizeMl: waterTrackerState?.cupSizeMl || 250,
        bottleSizeMl: waterTrackerState?.bottleSizeMl || 500,
        consumedMl: 0,
      };
  const waterTarget = waterTracker.targetMl || 2000;
  const waterConsumed = waterTracker.consumedMl || 0;
  const cupSizeMl = waterTracker.cupSizeMl || 250;
  const bottleSizeMl = waterTracker.bottleSizeMl || 500;
  const waterPercent = Math.min(100, Math.round((waterConsumed / waterTarget) * 100));

  const handleMarkPresenceAndOpenNote = (subject, customDateKey = null) => {
    if (!subject) return;

    const dateKeyToUse = customDateKey || todayKey;
    const classDateObj = new Date(`${dateKeyToUse}T12:00:00`);

    const existing = (academic.attendance || []).find(
      (entry) => entry.subjectId === subject.id && entry.date === dateKeyToUse,
    );
    const isPresent = existing?.status === "present" || existing?.status === "attended";

    if (!isPresent) {
      if (existing) {
        deleteAcademicEntity("attendance", existing.id);
      }
      addAcademicEntity("attendance", {
        subjectId: subject.id,
        semesterId: academic.activeSemesterId,
        date: dateKeyToUse,
        status: "present",
      });
    }

    const existingLogs = academic.classLogs || [];
    const dateLogForSubject = existingLogs.find(
      (log) => log.subjectId === subject.id && log.date === dateKeyToUse,
    );

    if (!dateLogForSubject) {
      const subjectLogs = existingLogs.filter((l) => l.subjectId === subject.id);
      const lessonNumber = subjectLogs.length + 1;
      const subjectName = subject?.name || "Disciplina";

      addAcademicEntity("classLogs", {
        subjectId: subject.id,
        semesterId: academic.activeSemesterId,
        date: dateKeyToUse,
        topic: `Aula ${lessonNumber} - ${subjectName}`,
        status: "completed",
        attendanceStatus: "attended",
      });
    }

    const existingNote = (notesList || []).find(
      (item) => item.academicSubjectId === subject.id && item.date === dateKeyToUse,
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

    const noteTitle = `Anotações de ${subject.name} - ${dateFormatted}`;
    const newNoteId = `note-${Date.now()}`;

    addNote({
      id: newNoteId,
      title: noteTitle,
      content: `<h1>${noteTitle}</h1><p><strong>Disciplina:</strong> ${subject.name}<br><strong>Data:</strong> ${dateLabel}<br><strong>Presença:</strong> Registrada ✓</p><h2>Conteúdo da Aula</h2><ul><li><p></p></li></ul>`,
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

  const handleCreateSubjectNote = (subject, customDateKey = null) => {
    if (!subject) return;

    const dateKeyToUse = customDateKey || todayKey;
    const classDateObj = new Date(`${dateKeyToUse}T12:00:00`);

    const existingNote = (notesList || []).find(
      (item) => item.academicSubjectId === subject.id && item.date === dateKeyToUse,
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

    const noteTitle = `Anotações de ${subject.name} - ${dateFormatted}`;
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
      if (existing.status === status) {
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
    const mappedLogStatus = nextAttendanceStatus === "present" ? "attended" : nextAttendanceStatus === "absent" ? "absent" : "pending";

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
  const nextClass = useMemo(() => {
    const today = new Date(currentDate);
    today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setDate(end.getDate() + 21);

    return buildAcademicCalendarEvents(state, {
      semesterId: academic.activeSemesterId,
      startDate: getLocalDateKey(today),
      endDate: getLocalDateKey(end),
    })
      .filter((event) => event.type === "class")
      .sort((a, b) => {
        const dateCompare = String(a.date || "").localeCompare(String(b.date || ""));
        if (dateCompare !== 0) return dateCompare;
        return String(a.startTime || "99:99").localeCompare(String(b.startTime || "99:99"));
      })[0] || null;
  }, [academic.activeSemesterId, state, currentDate]);
  const weekStart = new Date(currentDate);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const studiedMinutes = Math.round(
    focusSessions
      .filter((session) => new Date(session.completedAt || session.date || 0) >= weekStart)
      .reduce((total, session) => total + Number(session.durationMinutes || session.minutes || 0), 0),
  );
  const dueCards = useMemo(() => dueFlashcards(flashcardDecks), [flashcardDecks]);
  const reviewDeck = useMemo(() => {
    if (!dueCards.length) return null;
    const dueCountByDeck = dueCards.reduce((acc, card) => {
      acc.set(card.deckId, (acc.get(card.deckId) || 0) + 1);
      return acc;
    }, new Map());

    return flashcardDecks
      .map((deck) => ({
        deck,
        dueCount: dueCountByDeck.get(deck.id) || 0,
      }))
      .filter((item) => item.dueCount > 0)
      .sort((a, b) => b.dueCount - a.dueCount || String(a.deck.title || a.deck.deckTitle || "").localeCompare(String(b.deck.title || b.deck.deckTitle || "")))[0] || null;
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

  const openOrCreateHub = (subject) => {
    const linkedCourse = courses.find(
      (course) =>
        (subject.linkedCourseIds || []).includes(course.id) ||
        subject.courseId === course.id,
    );
    const courseId =
      linkedCourse?.id || createCourseForAcademicSubject(subject.id);
    if (!courseId) return;
    setActiveCourse(courseId);
    onNavigate?.(SCREEN_IDS.MODULES);
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

  const widgetProps = (id) => ({
    config: widgetById.get(id),
    gridRef: dashboardGridRef,
    editing: editingWidgets,
    draggedId: draggedWidgetId,
    onDragStart: setDraggedWidgetId,
    onPreview: setDragPreview,
    onPosition: positionDashboardWidget,
    onDragEnd: () => { setDraggedWidgetId(""); setDragPreview(null); },
    onResize: setDashboardWidgetSize,
    onResizeHeight: setDashboardWidgetHeight,
    onToggle: toggleDashboardWidget,
  });

  const startQuickFocus = (minutes = 25) => {
    const pomodoro = usePomodoroStore.getState();
    pomodoro.updateSettings?.({ focusTime: minutes });
    pomodoro.setMode?.("focus");
    pomodoro.startTimer();
    onNavigate?.(SCREEN_IDS.POMODORO);
  };

  return (
    <main className="campus-page campus-dashboard">
      <div className="campus-page-inner">
        <div className="campus-dashboard-shell">
          <div className="campus-dashboard-customize-bar">
            <div>
              <h1 className="text-2xl font-black text-[color:var(--on-surface)]">Hoje</h1>
              <p className="text-xs text-[color:var(--on-surface-variant)]">Seu painel acadêmico pessoal</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="campus-secondary-button" onClick={() => setShowWidgetCatalog(true)}>
                <Icon name="widgets" /> Widgets
              </button>
              <button
                type="button"
                className={editingWidgets ? "campus-primary-button" : "campus-secondary-button"}
                onClick={() => setEditingWidgets((value) => !value)}
              >
                <Icon name={editingWidgets ? "done" : "dashboard_customize"} />
                {editingWidgets ? "Concluir" : "Editar layout"}
              </button>
            </div>
          </div>
          <div ref={dashboardGridRef} className="campus-dashboard-widget-grid">
            {dragPreview ? (
              <div
                className="campus-dashboard-widget-drop-preview"
                style={{
                  gridColumn: `${dragPreview.x + 1} / span ${dragPreview.size || 12}`,
                  gridRow: `${dragPreview.y + 1} / span ${dragPreview.rowSpan || 3}`,
                }}
              />
            ) : null}
          <section className="contents">
            <DashboardWidgetShell {...widgetProps("schedule")}>
            <section className="campus-weekly-schedule">
              <div className="flex items-end justify-between mb-4">
                <div>
                  <h2 className="text-xl font-black tracking-tight text-[color:var(--on-surface)] flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-[color:var(--primary)]/10 flex items-center justify-center text-[color:var(--primary)]">
                      <Icon name="calendar_today" className="text-[16px]" />
                    </div>
                    Agenda da Semana
                  </h2>
                  <p className="text-xs text-[color:var(--on-surface-variant)] mt-1 font-medium pl-9">
                    Suas aulas organizadas de segunda a sexta
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate?.(SCREEN_IDS.ACADEMIC)}
                  className="group flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[color:var(--surface)] border border-[color:var(--outline-variant)]/30 text-[12px] font-bold text-[color:var(--on-surface)] hover:border-[color:var(--primary)]/50 hover:text-[color:var(--primary)] transition-all shadow-sm"
                >
                  <span>Ver completa</span>
                  <Icon name="arrow_forward" className="text-[14px] group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 pb-0">
                {weekClasses.map((day) => {
                  const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
                  const isToday = todayWeekday === day.dayIndex;

                  const now = currentDate;
                  const currentDay = now.getDay();
                  const diff = day.dayIndex - currentDay;
                  const dateForDay = new Date(now);
                  dateForDay.setDate(now.getDate() + diff);
                  const dayNum = dateForDay.getDate();

                  return (
                    <div
                      key={day.dayIndex}
                      className={`flex flex-col gap-2.5 p-3 rounded-[20px] transition-all border ${
                        isToday
                          ? "bg-[color:var(--primary)]/5 border-[color:var(--primary)]/30 ring-4 ring-[color:var(--primary)]/5"
                          : "bg-[color:var(--surface)] border-[color:var(--outline-variant)]/20 hover:border-[color:var(--outline-variant)]/40"
                      }`}
                    >
                      <div className="flex items-center justify-between pb-2.5 border-b border-[color:var(--outline-variant)]/10">
                        <div className="flex items-center gap-2">
                          <div className={`flex flex-col items-center justify-center w-9 h-9 rounded-xl ${
                            isToday ? 'bg-[color:var(--primary)] text-white shadow-md shadow-[color:var(--primary)]/20' : 'bg-[color:var(--surface-container-high)] text-[color:var(--on-surface)]'
                          }`}>
                            <span className="text-[9px] font-black uppercase opacity-80 -mb-0.5">{dayNames[day.dayIndex]}</span>
                            <span className="text-sm font-black">{dayNum}</span>
                          </div>
                          {isToday && (
                            <span className="text-[10px] font-bold text-[color:var(--primary)] bg-[color:var(--primary)]/10 px-2 py-0.5 rounded-md">
                              Hoje
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2.5 overflow-y-auto max-h-[300px] custom-scrollbar pr-1 -mr-1">
                        {day.classes.length === 0 ? (
                          <div className="flex flex-col items-center justify-center gap-1.5 py-6 text-[color:var(--on-surface-variant)]/50">
                            <Icon name="event_busy" className="text-[28px] opacity-20" />
                            <span className="text-[13px] font-semibold">Dia livre</span>
                          </div>
                        ) : (
                          day.classes.map((subject) => {
                            const targetDayKey = getLocalDateKey(dateForDay);
                            const attendanceRecord = (academic.attendance || []).find(
                              (a) => a.subjectId === subject.id && a.date === targetDayKey,
                            );
                            const isPresent = attendanceRecord?.status === "present" || attendanceRecord?.status === "attended";
                            const isAbsent = attendanceRecord?.status === "absent";
                            const isPastDay = day.dayIndex < todayWeekday;
                            const isPastOrToday = day.dayIndex <= todayWeekday;

                            const classNote = (notesList || []).find(
                              (item) => item.academicSubjectId === subject.id && item.date === targetDayKey,
                            );
                            const hasNote = Boolean(classNote);

                            return (
                              <article
                                key={subject.id}
                                className={`group/card relative p-2.5 rounded-2xl transition-all ${
                                  isAbsent
                                    ? "bg-rose-500/10 border-2 border-rose-500/60 shadow-lg shadow-rose-500/10 ring-2 ring-rose-500/20"
                                    : isPresent
                                      ? "bg-emerald-500/10 border-2 border-emerald-500/60 shadow-lg shadow-emerald-500/10 ring-2 ring-emerald-500/20"
                                      : "bg-[color:var(--surface-container)] hover:bg-[color:var(--surface-container-high)] border border-[color:var(--outline-variant)]/10 hover:shadow-sm"
                                }`}
                              >
                                <div
                                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-3/4 rounded-r-full transition-colors"
                                  style={{ backgroundColor: subject.color || "var(--primary)" }}
                                />
                                
                                <button
                                  type="button"
                                  onClick={() => openSubject(subject)}
                                  className="w-full text-left pl-2.5 outline-none"
                                >
                                  <div className="flex items-center justify-between gap-1 mb-1 flex-wrap">
                                    <span className="text-[10px] font-black text-[color:var(--on-surface-variant)] flex items-center gap-1 bg-[color:var(--surface-container-highest)] px-1.5 py-0.5 rounded">
                                      <Icon name="schedule" className="text-[11px]" />
                                      {subject.schedule?.startTime || "—"} {subject.schedule?.endTime ? `às ${subject.schedule.endTime}` : ""}
                                    </span>

                                    {isPresent && (
                                      <span className="text-[10px] font-black text-white bg-emerald-600 px-2 py-0.5 rounded flex items-center gap-1 shadow-sm" title="Presença registrada">
                                        <Icon name="check_circle" className="text-[11px]" /> Presença ✓
                                      </span>
                                    )}
                                    {isAbsent && (
                                      <span className="text-[10px] font-black text-white bg-rose-600 px-2 py-0.5 rounded flex items-center gap-1 shadow-sm" title="Falta registrada">
                                        <Icon name="cancel" className="text-[11px]" /> Falta ✗
                                      </span>
                                    )}
                                    {isPastDay && !isPresent && !isAbsent && (
                                      <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded flex items-center gap-0.5" title="Sem registro de presença">
                                        <Icon name="help_outline" className="text-[11px]" /> S/ registro
                                      </span>
                                    )}
                                  </div>
                                  
                                  <h4 className="text-[13px] font-bold text-[color:var(--on-surface)] leading-tight mb-1 group-hover/card:text-[color:var(--primary)] transition-colors line-clamp-2">
                                    {subject.name}
                                  </h4>
                                  
                                  <div className="flex items-center gap-2 text-[11px] text-[color:var(--on-surface-variant)] font-medium">
                                    <div className="flex items-center gap-0.5 truncate">
                                      <Icon name="room" className="text-[12px] opacity-70" />
                                      <span className="truncate">{subject.schedule?.room || subject.room || "S/ sala"}</span>
                                    </div>
                                    {subject.code && (
                                      <div className="flex items-center gap-0.5 shrink-0">
                                        <Icon name="tag" className="text-[12px] opacity-70" />
                                        <span>{subject.code}</span>
                                      </div>
                                    )}
                                  </div>
                                </button>

                                {isPastOrToday && (
                                  <div className="flex flex-col gap-1.5 mt-2 pt-2 border-t border-[color:var(--outline-variant)]/10 pl-2.5">
                                    <div className="flex gap-1.5">
                                      <button
                                        type="button"
                                        title="Marcar presença nesta aula"
                                        onClick={() => toggleAttendance(subject.id, "present", targetDayKey)}
                                        className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-black transition-all ${
                                          isPresent
                                            ? "bg-emerald-600 text-white shadow-md ring-2 ring-emerald-600/20"
                                            : "bg-[color:var(--surface)] text-[color:var(--on-surface-variant)] hover:text-emerald-600 hover:bg-emerald-500/10 border border-[color:var(--outline-variant)]/20"
                                        }`}
                                      >
                                        <Icon name="check_circle" className="text-[14px]" />
                                        Presença
                                      </button>
                                      <button
                                        type="button"
                                        title="Marcar falta nesta aula"
                                        onClick={() => toggleAttendance(subject.id, "absent", targetDayKey)}
                                        className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-black transition-all ${
                                          isAbsent
                                            ? "bg-rose-600 text-white shadow-md ring-2 ring-rose-600/20"
                                            : "bg-[color:var(--surface)] text-[color:var(--on-surface-variant)] hover:text-rose-600 hover:bg-rose-500/10 border border-[color:var(--outline-variant)]/20"
                                        }`}
                                      >
                                        <Icon name="cancel" className="text-[14px]" />
                                        Falta
                                      </button>
                                    </div>
                                    <button
                                      type="button"
                                      title={hasNote ? "Abrir nota da aula" : "Criar nota da aula"}
                                      onClick={() => handleCreateSubjectNote(subject, targetDayKey)}
                                      className={`w-full flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                                        hasNote
                                          ? "bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-600/20 ring-offset-1 ring-offset-[color:var(--surface-container)]"
                                          : "bg-[color:var(--surface)] text-[color:var(--on-surface-variant)] hover:text-[color:var(--primary)] hover:bg-[color:var(--primary)]/10 border border-[color:var(--outline-variant)]/20"
                                      }`}
                                    >
                                      <Icon name={hasNote ? "description" : "edit_note"} className="text-[14px]" />
                                      {hasNote ? "Ver Nota da Aula" : "Nota da Aula"}
                                    </button>
                                  </div>
                                )}
                              </article>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
            </DashboardWidgetShell>
          </section>

          <DashboardWidgetShell {...widgetProps("summary")}>
            <article className="h-full rounded-3xl border border-[color:var(--outline-variant)]/15 bg-[color:var(--surface)] p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600"><Icon name="insights" /></span>
                <span className="text-[10px] font-black uppercase tracking-wider text-[color:var(--on-surface-variant)]">Resumo do dia</span>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                <div><strong className="block text-2xl font-black">{pending.length}</strong><span className="text-[10px] text-[color:var(--on-surface-variant)]">Pendentes</span></div>
                <div><strong className="block text-2xl font-black">{dueCards.length}</strong><span className="text-[10px] text-[color:var(--on-surface-variant)]">Revisões</span></div>
                <div><strong className="block text-2xl font-black">{studiedMinutes}</strong><span className="text-[10px] text-[color:var(--on-surface-variant)]">Min foco</span></div>
              </div>
            </article>
          </DashboardWidgetShell>

          <DashboardWidgetShell {...widgetProps("focus")}>
            <article className="h-full rounded-3xl bg-[color:var(--primary)] p-5 text-white shadow-lg">
              <div className="flex items-center gap-3"><Icon name="timer" className="text-3xl" /><div><p className="text-[10px] font-black uppercase tracking-wider opacity-70">Foco rápido</p><h3 className="font-black">Começar agora</h3></div></div>
              <div className="mt-5 grid grid-cols-3 gap-2">
                {[25, 50, 90].map((minutes) => <button key={minutes} type="button" onClick={() => startQuickFocus(minutes)} className="rounded-xl bg-white/10 px-2 py-2 text-xs font-black hover:bg-white/20">{minutes} min</button>)}
              </div>
            </article>
          </DashboardWidgetShell>

          <DashboardWidgetShell {...widgetProps("deadlines")}>
            <article className="h-full rounded-3xl border border-rose-500/20 bg-rose-500/[0.05] p-5 shadow-sm">
              <div className="flex items-center gap-3 text-rose-600"><Icon name="event_upcoming" className="text-2xl" /><h3 className="text-sm font-black uppercase tracking-wide">Próximo prazo</h3></div>
              {urgentTask ? <button type="button" onClick={() => openTask(urgentTask)} className="mt-4 w-full text-left"><strong className="block line-clamp-2 text-base">{urgentTask.title}</strong><span className="mt-1 block text-xs text-[color:var(--on-surface-variant)]">{urgentTaskSubject?.name || "Sem disciplina"} · {urgentTask.dueDate || "Sem data"}</span></button> : <p className="mt-4 text-sm text-[color:var(--on-surface-variant)]">Nenhum prazo urgente.</p>}
            </article>
          </DashboardWidgetShell>

          {pinnedStickyNotes.map((note) => (
            <DashboardWidgetShell key={note.id} {...widgetProps(`sticky-note:${note.id}`)} label={note.title}>
              <QuickNoteWidgetCard
                note={note}
                onChange={updateDashboardStickyNote}
                onUnpin={unpinDashboardStickyNote}
                onOpenStickyNotes={openStickyNotes}
                onOpenDesktop={openDesktopStickyNote}
              />
            </DashboardWidgetShell>
          ))}

          <div className="contents">
            <section className="contents">
              <DashboardWidgetShell {...widgetProps("habits")}>
              <section className="campus-habits-tracker">
              <div className="campus-section-heading mb-4">
                <h2>Rastreador de Hábitos</h2>
              </div>
              


              {/* Add Habit Form */}
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newHabitTitle.trim()) return;
                  const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
                  const randomColor = colors[Math.floor(Math.random() * colors.length)];
                  addHabit(newHabitTitle.trim(), randomColor);
                  setNewHabitTitle("");
                }}
                className="flex items-center gap-2 mb-6"
              >
                <input
                  type="text"
                  value={newHabitTitle}
                  onChange={(e) => setNewHabitTitle(e.target.value)}
                  placeholder="Criar um novo hábito incrível..."
                  className="flex-1 bg-[color:var(--surface)] border border-[color:var(--outline-variant)]/30 rounded-2xl text-[13px] px-4 py-3 outline-none focus:border-[color:var(--primary)] transition-colors shadow-sm"
                />
                <button
                  type="submit"
                  disabled={!newHabitTitle.trim()}
                  className="h-11 px-4 rounded-2xl bg-[color:var(--primary)] text-white font-bold text-xs flex items-center gap-2 hover:bg-[color:var(--primary)]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-sm"
                >
                  <Icon name="add" className="text-[18px]" />
                  Adicionar
                </button>
              </form>

              {/* Habits List */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {habits.length === 0 ? (
                  <div className="col-span-full py-8 text-center text-[color:var(--on-surface-variant)]/60 text-sm border-2 border-dashed border-[color:var(--outline-variant)]/20 rounded-3xl">
                    Sua jornada começa com o primeiro hábito. Adicione um acima!
                  </div>
                ) : (
                  habits.map(habit => {
                    const isDoneToday = (habit.completedDates || []).includes(todayKey);
                    
                    const todayDate = new Date();
                    const currentDayOfWeek = todayDate.getDay(); // 0 = Dom, 1 = Seg, 2 = Ter...
                    const distanceToMonday = (currentDayOfWeek + 6) % 7;
                    
                    const mondayDate = new Date(todayDate);
                    mondayDate.setDate(todayDate.getDate() - distanceToMonday);

                    const historyDays = [];
                    const DAY_NAMES = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

                    for (let i = 0; i < 7; i++) {
                      const d = new Date(mondayDate);
                      d.setDate(mondayDate.getDate() + i);
                      const key = getLocalDateKey(d);
                      const done = (habit.completedDates || []).includes(key);
                      const isToday = key === todayKey;
                      const dayNum = d.getDate();
                      historyDays.push({ key, done, isToday, dayInitial: DAY_NAMES[i], dayNum });
                    }
                    
                    let currentStreak = 0;
                    let streakActive = true;
                    let checkDate = new Date(todayDate);
                    while (streakActive && currentStreak < 365) {
                      const key = getLocalDateKey(checkDate);
                      if ((habit.completedDates || []).includes(key)) {
                        currentStreak++;
                        checkDate.setDate(checkDate.getDate() - 1);
                      } else if (currentStreak === 0 && key === todayKey) {
                        checkDate.setDate(checkDate.getDate() - 1);
                      } else {
                        streakActive = false;
                      }
                    }

                    return (
                      <article key={habit.id} className="bg-[color:var(--surface)] p-5 rounded-3xl border border-[color:var(--outline-variant)]/20 shadow-sm relative group flex flex-col gap-4 transition-transform hover:-translate-y-1">
                        <button
                          type="button"
                          onClick={() => deleteHabit(habit.id)}
                          className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 text-[color:var(--on-surface-variant)] hover:text-red-500 transition-opacity"
                          title="Excluir hábito"
                        >
                          <Icon name="delete" className="text-[18px]" />
                        </button>
                        
                        <div className="flex items-center justify-between gap-3 pr-6">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => toggleHabit(habit.id, todayKey)}
                              style={{ borderColor: isDoneToday ? habit.color : 'var(--outline-variant)', backgroundColor: isDoneToday ? habit.color : 'transparent' }}
                              className={`w-7 h-7 rounded-full border-[3px] flex items-center justify-center shrink-0 transition-all ${!isDoneToday ? 'hover:scale-110' : ''}`}
                            >
                              {isDoneToday && <Icon name="check" className="text-[16px] text-white" />}
                            </button>
                            <div>
                              <strong className={`block text-[15px] leading-tight ${isDoneToday ? 'text-[color:var(--on-surface-variant)] line-through opacity-70' : 'text-[color:var(--on-surface)]'}`}>
                                {habit.title}
                              </strong>
                              {currentStreak > 0 && (
                                <span className="text-[11px] font-bold text-orange-500 flex items-center gap-1 mt-1">
                                  <Icon name="local_fire_department" className="text-[12px]" />
                                  {currentStreak} {currentStreak === 1 ? 'dia seguido' : 'dias seguidos'}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-1 pt-3 border-t border-[color:var(--outline-variant)]/10">
                          {historyDays.map((day) => (
                            <button
                              key={day.key}
                              type="button"
                              onClick={() => toggleHabit(habit.id, day.key)}
                              className="flex flex-col items-center gap-1 flex-1 group/day cursor-pointer focus:outline-none"
                              title={`${day.key}${day.isToday ? ' (Hoje)' : ''}: ${day.done ? 'Concluído' : 'Clique para marcar/desmarcar'}`}
                            >
                              <span
                                className={`text-[9px] font-extrabold uppercase tracking-wider transition-all px-1 py-0.5 rounded-md ${
                                  day.isToday
                                    ? "text-emerald-500 bg-emerald-500/15 font-black ring-1 ring-emerald-500/30"
                                    : "text-[color:var(--on-surface-variant)] opacity-70 group-hover/day:opacity-100"
                                }`}
                              >
                                {day.dayInitial}
                              </span>
                              <span
                                className={`text-[10px] font-bold ${
                                  day.isToday ? "text-emerald-500" : "text-[color:var(--on-surface-variant)] opacity-80"
                                }`}
                              >
                                {day.dayNum}
                              </span>
                              <div 
                                className={`w-4 h-4 rounded-[4px] transition-all group-hover/day:scale-110 ${day.isToday ? "ring-2 ring-emerald-500/40" : ""}`}
                                style={{ backgroundColor: day.done ? habit.color : 'var(--surface-container-high)' }}
                              />
                            </button>
                          ))}
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </section>
            </DashboardWidgetShell>
          </section>

          <aside className="contents">
            <DashboardWidgetShell {...widgetProps("flashcards")}>
            {reviewDeck ? (
              <button
                className="campus-review-card"
                type="button"
                onClick={openReviewDeck}
              >
                <span className="campus-review-card-icon">
                  <Icon name="style" />
                </span>
                <span className="campus-review-card-copy">
                  <small>Flashcards para revisar</small>
                  <strong>{reviewDeck.deck.title || reviewDeck.deck.deckTitle || "Deck sem título"}</strong>
                  <span>{reviewDeck.dueCount} {reviewDeck.dueCount === 1 ? "cartão pendente" : "cartões pendentes"}</span>
                </span>
                <Icon name="arrow_forward" />
              </button>
            ) : (
              <article className="rounded-3xl border border-[color:var(--outline-variant)]/15 bg-[color:var(--surface)] p-5 text-center shadow-sm">
                <Icon name="style" className="text-3xl text-[color:var(--primary)]/50" />
                <h3 className="mt-2 text-sm font-black">Flashcards em dia</h3>
                <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">Nenhuma revisão pendente.</p>
              </article>
            )}
            </DashboardWidgetShell>

            <DashboardWidgetShell {...widgetProps("water")}>
            {/* Water Tracker Widget */}
            <article className="neo-raised flex flex-col rounded-3xl p-5 relative overflow-hidden bg-gradient-to-br from-cyan-500/10 via-blue-500/5 to-transparent border border-cyan-500/20 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-cyan-500/15 text-cyan-500 flex items-center justify-center shadow-inner">
                    <Icon name="water_drop" className="text-[18px]" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-[color:var(--on-surface)]">Hidratação do Dia</h3>
                    <span className="text-[11px] font-bold text-cyan-600 dark:text-cyan-400">Meta: {waterTarget} ml</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setShowWaterSettingsModal(true)}
                    className="p-1.5 rounded-lg text-[color:var(--on-surface-variant)] hover:bg-cyan-500/10 hover:text-cyan-500 transition-colors"
                    title="Configurações de Hidratação"
                  >
                    <Icon name="settings" className="text-[15px]" />
                  </button>
                  <button
                    type="button"
                    onClick={resetWaterIntake}
                    className="p-1.5 rounded-lg text-[color:var(--on-surface-variant)] hover:bg-red-500/10 hover:text-red-500 transition-colors"
                    title="Reiniciar dia"
                  >
                    <Icon name="refresh" className="text-[15px]" />
                  </button>
                </div>
              </div>

              {/* Progress & Wave Bar */}
              <div className="mb-4">
                <div className="flex justify-between items-baseline mb-1.5">
                  <span className="text-2xl font-black text-[color:var(--on-surface)] tracking-tight">
                    {(waterConsumed / 1000).toFixed(2)} <span className="text-xs font-bold text-[color:var(--on-surface-variant)] uppercase">L</span>
                  </span>
                  <span className="text-xs font-extrabold text-cyan-600 dark:text-cyan-400">
                    {waterPercent}% {waterPercent >= 100 && "🎉 Meta atingida!"}
                  </span>
                </div>
                <div className="h-3 w-full bg-cyan-500/10 rounded-full overflow-hidden p-0.5 border border-cyan-500/20">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full transition-all duration-500 shadow-sm"
                    style={{ width: `${waterPercent}%` }}
                  />
                </div>
              </div>

              {/* Visualizer Grid Mode Switcher */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider">
                  {gridDisplayMode === "cup" ? `Copos (${cupSizeMl}ml)` : `Garrafas (${bottleSizeMl >= 1000 ? `${bottleSizeMl / 1000}L` : `${bottleSizeMl}ml`})`}
                </span>
                <div className="flex bg-[color:var(--surface-container-high)] p-0.5 rounded-lg text-[10px] font-bold border border-[color:var(--outline-variant)]/20">
                  <button
                    type="button"
                    onClick={() => setGridDisplayMode("bottle")}
                    className={`px-2 py-0.5 rounded-md transition-all flex items-center gap-1 ${
                      gridDisplayMode === "bottle"
                        ? "bg-cyan-500 text-white shadow-sm"
                        : "text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]"
                    }`}
                  >
                    <Icon name="water_drop" className="text-[12px]" />
                    Garrafas
                  </button>
                  <button
                    type="button"
                    onClick={() => setGridDisplayMode("cup")}
                    className={`px-2 py-0.5 rounded-md transition-all flex items-center gap-1 ${
                      gridDisplayMode === "cup"
                        ? "bg-cyan-500 text-white shadow-sm"
                        : "text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]"
                    }`}
                  >
                    <Icon name="local_drink" className="text-[12px]" />
                    Copos
                  </button>
                </div>
              </div>

              {/* Water Visualizer Grid */}
              {(() => {
                const currentStepMl = gridDisplayMode === "cup" ? cupSizeMl : bottleSizeMl;
                const totalUnits = Math.max(4, Math.ceil(waterTarget / currentStepMl));
                const iconName = gridDisplayMode === "cup" ? "local_drink" : "water_drop";

                return (
                  <div className="grid grid-cols-4 gap-1.5 mb-4">
                    {Array.from({ length: totalUnits }).map((_, idx) => {
                      const isFilled = waterConsumed >= (idx + 1) * currentStepMl;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            if (isFilled) {
                              addWaterIntake(-currentStepMl);
                            } else {
                              addWaterIntake(currentStepMl);
                            }
                          }}
                          className={`h-9 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all ${
                            isFilled
                              ? "bg-gradient-to-t from-blue-500 to-cyan-400 text-white shadow-md shadow-cyan-500/20 scale-[1.02]"
                              : "bg-[color:var(--surface-container-high)] text-[color:var(--on-surface-variant)]/40 hover:bg-cyan-500/10 hover:text-cyan-500"
                          }`}
                          title={
                            isFilled
                              ? `${gridDisplayMode === "cup" ? "Copo" : "Garrafa"} ${idx + 1} (${currentStepMl}ml) - Clique para remover`
                              : `Adicionar ${currentStepMl}ml`
                          }
                        >
                          <Icon name={iconName} className="text-[15px]" />
                          <span className="text-[9px] font-black leading-none">{idx + 1}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Quick Actions */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => addWaterIntake(bottleSizeMl)}
                  className="flex-1 py-2 px-2 rounded-xl bg-cyan-500 text-white text-xs font-bold flex items-center justify-center gap-1 shadow-md shadow-cyan-500/25 hover:bg-cyan-600 transition-colors"
                  title={`Adicionar 1 Garrafa (${bottleSizeMl}ml)`}
                >
                  <Icon name="add" className="text-[14px]" />
                  <span>Garrafa +{bottleSizeMl >= 1000 ? `${bottleSizeMl / 1000}L` : `${bottleSizeMl}ml`}</span>
                </button>
                <button
                  type="button"
                  onClick={() => addWaterIntake(cupSizeMl)}
                  className="flex-1 py-2 px-2 rounded-xl bg-[color:var(--surface-container-high)] text-[color:var(--on-surface)] text-xs font-bold flex items-center justify-center gap-1 border border-[color:var(--outline-variant)]/20 hover:bg-cyan-500/10 hover:text-cyan-500 transition-colors"
                  title={`Adicionar 1 Copo (${cupSizeMl}ml)`}
                >
                  <Icon name="add" className="text-[14px]" />
                  <span>Copo +{cupSizeMl}ml</span>
                </button>
              </div>
            </article>
            </DashboardWidgetShell>

            <DashboardWidgetShell {...widgetProps("tasks")}>
            <article className="neo-raised flex flex-col rounded-3xl p-6 relative overflow-hidden bg-[color:var(--surface)] border border-[color:var(--outline-variant)]/10 min-h-[300px]">
              <div className="flex items-center justify-between mb-4 text-[color:var(--primary)]">
                <h3 className="text-sm font-bold tracking-wide uppercase flex items-center gap-2">
                  <span>Tarefas de Hoje</span>
                  {tasks.filter(t => (t.isTodayTask || !t.dueDate || t.dueDate <= todayKey || t.completedDate === todayKey)).length > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[color:var(--primary)]/10 text-[color:var(--primary)] font-black">
                      {tasks.filter(t => t.status === "completed" && (t.isTodayTask || !t.dueDate || t.dueDate <= todayKey || t.completedDate === todayKey)).length}/
                      {tasks.filter(t => (t.isTodayTask || !t.dueDate || t.dueDate <= todayKey || t.completedDate === todayKey)).length}
                    </span>
                  )}
                </h3>
                <Icon name="check_circle" />
              </div>
              
              <div className="flex flex-col gap-2 mb-4 max-h-[220px] overflow-y-auto custom-scrollbar pr-2">
                {(() => {
                  const todayTasks = tasks.filter(t => t.isTodayTask || !t.dueDate || t.dueDate <= todayKey || t.completedDate === todayKey)
                    .sort((a, b) => {
                      if (a.status === "completed" && b.status !== "completed") return 1;
                      if (a.status !== "completed" && b.status === "completed") return -1;
                      return (b.createdAt || 0) - (a.createdAt || 0);
                    });

                  if (todayTasks.length === 0) {
                    return (
                      <p className="text-[13px] text-[color:var(--on-surface-variant)]/60 italic text-center py-4">Nenhuma tarefa pendente!</p>
                    );
                  }

                  return todayTasks.map((task) => {
                    const isCompleted = task.status === "completed";
                    const isOverdue = !task.isTodayTask && task.dueDate && task.dueDate < todayKey && !isCompleted;

                    return (
                      <div key={task.id} className={`flex items-center justify-between gap-2 group p-1.5 rounded-xl transition-colors ${isCompleted ? "bg-[color:var(--surface-container-low)]/40" : "hover:bg-[color:var(--surface-container-low)]"}`}>
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => {
                              const nextStatus = isCompleted ? "pending" : "completed";
                              updateTask(task.id, {
                                status: nextStatus,
                                completedDate: nextStatus === "completed" ? todayKey : null,
                              });
                            }}
                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                              isCompleted
                                ? "bg-emerald-500 border-emerald-500 text-white shadow-sm"
                                : "border-[color:var(--outline-variant)] group-hover:border-[color:var(--primary)]"
                            }`}
                            title={isCompleted ? "Reabrir tarefa (desmarcar)" : "Marcar como concluída"}
                          >
                            {isCompleted ? (
                              <Icon name="check" className="text-[12px] stroke-[3]" />
                            ) : (
                              <div className="w-2.5 h-2.5 rounded-full bg-[color:var(--primary)] opacity-0 group-hover:opacity-20 transition-opacity" />
                            )}
                          </button>
                          <div className="flex flex-col min-w-0 flex-1">
                            {editingTaskId === task.id ? (
                              <input
                                type="text"
                                autoFocus
                                value={editingTaskTitle}
                                onChange={(e) => setEditingTaskTitle(e.target.value)}
                                onBlur={() => {
                                  if (editingTaskTitle.trim()) {
                                    updateTask(task.id, { title: editingTaskTitle.trim() });
                                  }
                                  setEditingTaskId(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    if (editingTaskTitle.trim()) {
                                      updateTask(task.id, { title: editingTaskTitle.trim() });
                                    }
                                    setEditingTaskId(null);
                                  } else if (e.key === "Escape") {
                                    setEditingTaskId(null);
                                  }
                                }}
                                className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--primary)] rounded-lg px-2 py-0.5 text-xs font-semibold text-[color:var(--on-surface)] outline-none"
                              />
                            ) : (
                              <span
                                onClick={() => {
                                  setEditingTaskId(task.id);
                                  setEditingTaskTitle(task.title);
                                }}
                                title="Clique para editar o texto da tarefa"
                                className={`text-sm leading-tight pt-0.5 line-clamp-2 cursor-pointer transition-colors ${
                                  isCompleted
                                    ? "line-through text-[color:var(--on-surface-variant)]/60"
                                    : "text-[color:var(--on-surface)] hover:text-[color:var(--primary)] hover:underline"
                                }`}
                              >
                                {task.title}
                              </span>
                            )}
                            {isOverdue && (
                              <span className="text-[10px] font-bold text-amber-500 flex items-center gap-0.5 mt-0.5">
                                <Icon name="warning" className="text-[11px]" /> Atrasada ({task.dueDate.split('-').reverse().slice(0, 2).join('/')})
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteTask(task.id)}
                          className="opacity-0 group-hover:opacity-100 text-[color:var(--on-surface-variant)] hover:text-red-500 transition-all p-1 rounded-md hover:bg-red-500/10 shrink-0"
                          title="Excluir tarefa"
                        >
                          <Icon name="close" className="text-[14px]" />
                        </button>
                      </div>
                    );
                  });
                })()}
              </div>
              
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newTaskTitle.trim()) return;
                  addTask({ title: newTaskTitle.trim(), status: 'pending', dueDate: todayKey, isTodayTask: true });
                  setNewTaskTitle("");
                }}
                className="flex items-center bg-[color:var(--surface-container-low)] rounded-xl p-1 pr-2 border border-[color:var(--outline-variant)]/20 focus-within:border-[color:var(--primary)]/50 transition-colors"
              >
                <input
                  type="text"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="Adicionar tarefa para hoje..."
                  className="flex-1 bg-transparent border-none text-[13px] px-3 py-2 outline-none"
                />
                <button
                  type="submit"
                  disabled={!newTaskTitle.trim()}
                  className="w-8 h-8 rounded-lg bg-[color:var(--primary)]/10 text-[color:var(--primary)] flex items-center justify-center hover:bg-[color:var(--primary)]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                >
                  <Icon name="add" className="text-[18px]" />
                </button>
              </form>
            </article>
            </DashboardWidgetShell>
          </aside>
        </div>
        </div>
        </div>
      </div>

      {showWidgetCatalog ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowWidgetCatalog(false); }}>
          <section className="w-full max-w-2xl rounded-3xl bg-[color:var(--surface)] p-6 shadow-2xl">
            <header className="flex items-start justify-between gap-4">
              <div><span className="campus-eyebrow">Personalização</span><h2 className="mt-1 text-xl font-black">Widgets da tela Hoje</h2><p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">Escolha o que aparece no painel. No modo de edição, arraste para reorganizar.</p></div>
              <button type="button" onClick={() => setShowWidgetCatalog(false)} className="rounded-xl p-2 hover:bg-[color:var(--surface-container-high)]"><Icon name="close" /></button>
            </header>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={openStickyNotes} className="flex items-center gap-3 rounded-2xl border border-dashed border-amber-500/50 bg-amber-500/[0.06] p-4 text-left text-amber-700 hover:bg-amber-500/10 dark:text-amber-300"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15"><Icon name="sticky_note_2" /></span><span><strong className="block text-sm">Gerenciar Sticky Notes</strong><small>Fixe uma nota para mostrar no Hoje</small></span></button>
              {dashboardWidgets.map((widget) => {
                const quickNote = widget.id.startsWith("sticky-note:")
                  ? pinnedStickyNotes.find((note) => `sticky-note:${note.id}` === widget.id)
                  : null;
                const meta = DASHBOARD_WIDGET_META[widget.id] || (quickNote
                  ? { label: quickNote.title || "Anotação rápida", icon: "sticky_note_2" }
                  : { label: widget.id, icon: "widgets" });
                return <button key={widget.id} type="button" onClick={() => toggleDashboardWidget(widget.id)} className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${widget.visible === false ? "border-[color:var(--outline-variant)]/25 opacity-60" : "border-[color:var(--primary)]/30 bg-[color:var(--primary)]/5"}`}><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--surface-container-high)] text-[color:var(--primary)]"><Icon name={meta.icon} /></span><span className="min-w-0 flex-1"><strong className="block text-sm">{meta.label}</strong><small className="text-[color:var(--on-surface-variant)]">{widget.visible === false ? "Oculto" : `Visível · ${widget.size}/12 colunas`}</small></span><Icon name={widget.visible === false ? "visibility_off" : "visibility"} /></button>;
              })}
            </div>
            {pinnedStickyNotes.length ? (
              <section className="mt-6 border-t border-[color:var(--outline-variant)]/20 pt-5">
                <div className="mb-3 flex items-center justify-between">
                  <div><span className="campus-eyebrow">Sticky Notes fixadas</span><p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">Remover daqui não apaga a nota.</p></div>
                  <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-black text-amber-700 dark:text-amber-300">{pinnedStickyNotes.length}</span>
                </div>
                <div className="space-y-2">
                  {pinnedStickyNotes.map((note) => (
                    <div key={note.id} className="flex items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] p-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300"><Icon name="sticky_note_2" /></span>
                      <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{note.title || "Anotação sem título"}</strong><small className="block truncate text-[color:var(--on-surface-variant)]">{note.content || "Sem conteúdo"}</small></span>
                      <button type="button" className="rounded-xl p-2 text-[color:var(--on-surface-variant)] hover:bg-amber-500/10 hover:text-amber-700" title={`Remover ${note.title || "anotação"} do Hoje`} onClick={() => unpinDashboardStickyNote(note)}><Icon name="keep_off" className="text-[18px]" /></button>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
            <footer className="mt-6 flex justify-between gap-3 border-t border-[color:var(--outline-variant)]/20 pt-4">
              <button type="button" className="campus-secondary-button" onClick={resetDashboardWidgets}><Icon name="restart_alt" /> Restaurar padrão</button>
              <button type="button" className="campus-primary-button" onClick={() => { setShowWidgetCatalog(false); setEditingWidgets(true); }}><Icon name="dashboard_customize" /> Organizar agora</button>
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
  const [cupSizeMl, setCupSizeMl] = useState(waterTracker.cupSizeMl || 250);
  const [bottleSizeMl, setBottleSizeMl] = useState(waterTracker.bottleSizeMl || 500);

  const handleSubmit = (e) => {
    e.preventDefault();
    let parsed = parseFloat(String(targetMl).replace(/[^\d.]/g, ""));
    if (!Number.isFinite(parsed) || parsed <= 0) parsed = 2000;
    if (parsed <= 15) parsed = parsed * 1000;
    const validTarget = Math.max(500, Math.min(15000, Math.round(parsed)));

    onSave({
      targetMl: validTarget,
      cupSizeMl: Number(cupSizeMl) || 250,
      bottleSizeMl: Number(bottleSizeMl) || 500,
    });
    onClose();
  };

  const parsedTargetNum = parseFloat(String(targetMl).replace(/[^\d.]/g, ""));
  const displayLiters = Number.isFinite(parsedTargetNum) && parsedTargetNum > 0
    ? (parsedTargetNum <= 15 ? parsedTargetNum : parsedTargetNum / 1000)
    : 2;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="neo-raised bg-[color:var(--surface)] w-full max-w-md rounded-3xl p-6 sm:p-8 shadow-2xl border border-[color:var(--outline-variant)]/20 relative overflow-hidden">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-[color:var(--outline-variant)]/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/15 text-cyan-500 flex items-center justify-center shadow-inner">
              <Icon name="water_drop" className="text-[22px]" />
            </div>
            <div>
              <h2 className="text-lg font-black text-[color:var(--on-surface)]">Configurações de Hidratação</h2>
              <p className="text-xs text-[color:var(--on-surface-variant)]">Personalize sua meta e atalhos diários</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-container-high)]">
            <Icon name="close" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* Target Intake */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider">
                Meta Diária de Água
              </label>
              <span className="text-xs font-black text-cyan-500">
                {displayLiters.toFixed(1).replace('.0', '')} L ({displayLiters * 1000} ml)
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1.5 mb-3">
              {[2000, 3000, 4000, 5000, 6000].map(amt => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setTargetMl(amt)}
                  className={`py-2 text-[11px] font-extrabold rounded-xl border transition-all ${
                    Number(targetMl) === amt || (parsedTargetNum <= 15 && parsedTargetNum * 1000 === amt)
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
                type="number"
                min="0.5"
                max="15"
                step="0.1"
                value={targetMl}
                onChange={e => setTargetMl(e.target.value)}
                placeholder="Ex: 5 ou 5000"
                className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 text-sm font-bold text-[color:var(--on-surface)] outline-none focus:border-cyan-500"
              />
              <span className="absolute right-4 text-xs font-bold text-[color:var(--on-surface-variant)] opacity-70">Litros (L) ou ml</span>
            </div>
          </div>

          {/* Quick Shortcuts: Bottle Size */}
          <div>
            <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-2">
              Tamanho da Garrafa (Atalho 1 - Garrafa)
            </label>
            <div className="grid grid-cols-3 gap-2 mb-2">
              {[500, 750, 1000].map(sz => (
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
                onChange={e => setBottleSizeMl(e.target.value)}
                placeholder="Personalizado (ml)"
                className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-2 text-xs font-bold text-[color:var(--on-surface)] outline-none focus:border-cyan-500"
              />
              <span className="absolute right-4 text-[11px] font-bold text-[color:var(--on-surface-variant)] opacity-70">ml customizado</span>
            </div>
          </div>

          {/* Quick Shortcuts: Cup Size */}
          <div>
            <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-2">
              Tamanho do Copo (Atalho 2 - Copo)
            </label>
            <div className="grid grid-cols-3 gap-2 mb-2">
              {[200, 250, 300].map(sz => (
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
                onChange={e => setCupSizeMl(e.target.value)}
                placeholder="Personalizado (ml)"
                className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-2 text-xs font-bold text-[color:var(--on-surface)] outline-none focus:border-cyan-500"
              />
              <span className="absolute right-4 text-[11px] font-bold text-[color:var(--on-surface-variant)] opacity-70">ml customizado</span>
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
