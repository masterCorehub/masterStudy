import { useEffect, useMemo, useState, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SCREEN_IDS } from "../app/screenIds";
import { AcademicCalendar } from "../components/AcademicCalendar";
import {
  buildAcademicCalendarEvents,
  buildAdaptiveStudyPlan,
  getAcademicSubjectHub,
  redistributeMissedStudySessions,
  toAcademicDateKey,
} from "../domain/academic";
import { usePomodoroStore } from "../store/usePomodoroStore";
import { useStudyStore } from "../store/useStore";
import { Icon } from "../ui/Icon";
import { markdownToNoteHtml } from "../domain/aiStudio";
import { sanitizeGeneratedHtml } from "../utils/sanitizeHtml";

const TABS = [
  { id: "overview", label: "Visão geral", icon: "space_dashboard" },
  { id: "lessons", label: "Aulas", icon: "play_lesson" },
  { id: "notes", label: "Anotações", icon: "edit_note" },
  { id: "resources", label: "Arquivos e links", icon: "folder_open" },
  { id: "tasks", label: "Tarefas e trabalhos", icon: "task_alt" },
  { id: "assessments", label: "Provas e notas", icon: "monitoring" },
  { id: "flashcards", label: "Flashcards", icon: "style" },
  { id: "plan", label: "Plano e IA", icon: "auto_awesome" },
];

const DAYS = [
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
];

const inputClass =
  "w-full rounded-xl border border-[color:var(--outline-variant)]/45 bg-[color:var(--background)] px-4 py-3 text-sm font-semibold outline-none focus:border-[color:var(--primary)]";

const stripHtml = (value = "") =>
  String(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>|<\/h\d>|<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const formatDate = (value) => {
  if (!value) return "Sem data";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const fileName = (path = "") => path.split(/[\\/]/).pop() || path;

function EmptyState({ icon, title, text, action, actionLabel }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-[26px] border border-dashed border-[color:var(--outline-variant)]/55 bg-[color:var(--background)] p-7 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[color:var(--primary)]/10 text-[color:var(--primary)]">
        <Icon className="text-3xl" name={icon} />
      </span>
      <h3 className="mt-4 text-lg font-black">{title}</h3>
      <p className="mt-1 max-w-lg text-sm leading-6 text-[color:var(--on-surface-variant)]">
        {text}
      </p>
      {action ? (
        <button
          className="mt-5 rounded-xl bg-[color:var(--primary)] px-5 py-3 text-sm font-black text-white"
          type="button"
          onClick={action}
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function MetricCard({ icon, label, value, hint, color = "var(--primary)" }) {
  return (
    <article className="rounded-[24px] bg-[color:var(--surface)] p-5 neo-raised">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
            {label}
          </p>
          <p className="mt-2 text-2xl font-black">{value}</p>
          {hint ? (
            <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">
              {hint}
            </p>
          ) : null}
        </div>
        <span
          className="flex h-11 w-11 items-center justify-center rounded-2xl"
          style={{ backgroundColor: `${color}18`, color }}
        >
          <Icon name={icon} />
        </span>
      </div>
    </article>
  );
}

function Modal({ title, eyebrow, children, onClose }) {
  return (
    <motion.div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={onClose}
    >
      <motion.div
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-[28px] bg-[color:var(--surface)] p-6 shadow-2xl"
        initial={{ y: 18, scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 18, scale: 0.98 }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-[color:var(--primary)]">
              {eyebrow}
            </p>
            <h2 className="mt-1 text-2xl font-black">{title}</h2>
          </div>
          <button
            className="flex h-10 w-10 items-center justify-center rounded-full neo-raised"
            type="button"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

function CollapsibleSection({
  title,
  eyebrow,
  icon,
  defaultOpen = true,
  children,
  action,
  className = "",
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section
      className={`rounded-[28px] bg-[color:var(--surface)] p-5 sm:p-6 neo-raised transition-all ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left focus:outline-none group"
        >
          {icon ? (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color:var(--primary)]/10 text-[color:var(--primary)] group-hover:scale-105 transition-transform">
              <Icon name={icon} />
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            {eyebrow ? (
              <p className="text-xs font-black uppercase tracking-wider text-[color:var(--primary)] truncate">
                {eyebrow}
              </p>
            ) : null}
            <h3 className="text-lg sm:text-xl font-black truncate">{title}</h3>
          </div>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--background)] neo-inset text-[color:var(--on-surface-variant)] group-hover:text-[color:var(--primary)] transition-colors">
            <Icon name={isOpen ? "expand_less" : "expand_more"} />
          </span>
        </button>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="pt-5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

export function AcademicSubjectScreen({ onNavigate }) {
  const activeSubjectId = useStudyStore(
    (state) => state.activeAcademicSubjectId,
  );
  const academic = useStudyStore((state) => state.academic);
  const courses = useStudyStore((state) => state.courses);
  const studyItems = useStudyStore((state) => state.studyItems);
  const tasks = useStudyStore((state) => state.tasks);
  const flashcardDecks = useStudyStore((state) => state.flashcardDecks);
  const focusSessions = useStudyStore((state) => state.focusSessions);
  const setActiveCourse = useStudyStore((state) => state.setActiveCourse);
  const setActiveModule = useStudyStore((state) => state.setActiveModule);
  const setActiveLesson = useStudyStore((state) => state.setActiveLesson);
  const setActiveNote = useStudyStore((state) => state.setActiveNote);
  const setActiveDeck = useStudyStore((state) => state.setActiveDeck);
  const addNote = useStudyStore((state) => state.addNote);
  const addTask = useStudyStore((state) => state.addTask);
  const updateTask = useStudyStore((state) => state.updateTask);
  const deleteTask = useStudyStore((state) => state.deleteTask);
  const setActiveTask = useStudyStore((state) => state.setActiveTask);
  const addAcademicEntity = useStudyStore((state) => state.addAcademicEntity);
  const updateAcademicEntity = useStudyStore(
    (state) => state.updateAcademicEntity,
  );
  const deleteAcademicEntity = useStudyStore(
    (state) => state.deleteAcademicEntity,
  );
  const linkCourse = useStudyStore(
    (state) => state.linkCourseToAcademicSubject,
  );
  const unlinkCourse = useStudyStore(
    (state) => state.unlinkCourseFromAcademicSubject,
  );
  const createCourseForSubject = useStudyStore(
    (state) => state.createCourseForAcademicSubject,
  );
  const setStudyPreferences = useStudyStore(
    (state) => state.setAcademicStudyPreferences,
  );
  const setAiSourcePermissions = useStudyStore(
    (state) => state.setAcademicAiSourcePermissions,
  );
  const setAiChatHistory = useStudyStore(
    (state) => state.setAcademicAiChatHistory,
  );
  const replaceStudySessions = useStudyStore(
    (state) => state.replaceAcademicStudySessions,
  );

  const [tab, setTab] = useState("overview");
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [showLinks, setShowLinks] = useState(false);
  const [modal, setModal] = useState(null);
  const [resourceForm, setResourceForm] = useState({
    title: "",
    type: "link",
    url: "",
    path: "",
    tags: "",
  });
  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    dueDate: "",
    priority: "medium",
    type: "task",
    subtasks: [],
  });

  const addSubtask = () => {
    setTaskForm((prev) => ({
      ...prev,
      subtasks: [...(prev.subtasks || []), { id: Date.now(), title: "", completed: false }],
    }));
  };

  const updateSubtask = (index, title) => {
    setTaskForm((prev) => {
      const newSubtasks = [...(prev.subtasks || [])];
      newSubtasks[index] = { ...newSubtasks[index], title };
      return { ...prev, subtasks: newSubtasks };
    });
  };

  const removeSubtask = (index) => {
    setTaskForm((prev) => ({
      ...prev,
      subtasks: (prev.subtasks || []).filter((_, i) => i !== index),
    }));
  };

  const [showCreateNoteMenu, setShowCreateNoteMenu] = useState(false);
  const createNoteMenuRef = useRef(null);
  useEffect(() => {
    if (!showCreateNoteMenu) return undefined;
    function onDocMouseDown(e) {
      if (!createNoteMenuRef.current) return;
      if (!createNoteMenuRef.current.contains(e.target)) setShowCreateNoteMenu(false);
    }
    function onDocKey(e) {
      if (e.key === "Escape") setShowCreateNoteMenu(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onDocKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onDocKey);
    };
  }, [showCreateNoteMenu]);
  const [sessionMinutes, setSessionMinutes] = useState(50);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [availabilityDraft, setAvailabilityDraft] = useState([]);
  const [aiStatus, setAiStatus] = useState(null);
  const [aiSources, setAiSources] = useState([]);
  const [selectedSourceIds, setSelectedSourceIds] = useState([]);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiNotice, setAiNotice] = useState("");
  const [aiOperation, setAiOperation] = useState("");
  const [aiStartedAt, setAiStartedAt] = useState(0);
  const [aiElapsed, setAiElapsed] = useState(0);
  const [aiRequestId, setAiRequestId] = useState("");
  const [generatedPreview, setGeneratedPreview] = useState(null);

  const stateSnapshot = useMemo(
    () => ({
      academic,
      courses,
      studyItems,
      tasks,
      flashcardDecks,
      focusSessions,
    }),
    [academic, courses, flashcardDecks, focusSessions, studyItems, tasks],
  );
  const hub = useMemo(
    () => getAcademicSubjectHub(stateSnapshot, activeSubjectId),
    [activeSubjectId, stateSnapshot],
  );

  useEffect(() => {
    if (!hub) return;
    setAvailabilityDraft(hub.academic.studyPreferences?.availability || []);
    setSessionMinutes(hub.academic.studyPreferences?.sessionMinutes || 50);
    setSelectedExamId((current) => current || hub.exams[0]?.id || "");
  }, [hub?.subject.id]);

  useEffect(() => {
    if (tab !== "plan" || !hub || !window.studyhubDesktop?.academicAI) return;
    let active = true;
    Promise.all([
      window.studyhubDesktop.academicAI.status(),
      window.studyhubDesktop.academicAI.listSources(hub.subject.id),
    ])
      .then(([status, sources]) => {
        if (!active) return;
        setAiStatus(status);
        setAiSources(Array.isArray(sources) ? sources : []);
      })
      .catch(
        (error) =>
          active &&
          setAiError(error.message || "Falha ao carregar a IA local."),
      );
    return () => {
      active = false;
    };
  }, [hub?.subject.id, tab]);

  useEffect(() => {
    if (!aiBusy || !aiStartedAt) {
      setAiElapsed(0);
      return undefined;
    }
    const updateElapsed = () =>
      setAiElapsed(Math.max(0, Math.floor((Date.now() - aiStartedAt) / 1_000)));
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1_000);
    return () => window.clearInterval(timer);
  }, [aiBusy, aiStartedAt]);

  if (!hub) {
    return (
      <main className="flex flex-1 items-center justify-center bg-[color:var(--background)] p-8">
        <EmptyState
          icon="school"
          title="Matéria não encontrada"
          text="Ela pode ter sido arquivada ou removida."
          action={() => onNavigate?.(SCREEN_IDS.ACADEMIC)}
          actionLabel="Voltar para Faculdade"
        />
      </main>
    );
  }

  const { subject } = hub;
  const selectedAiModel = (aiStatus?.models || []).some(
    (model) => model.name === hub.academic.studyPreferences?.aiModel,
  )
    ? hub.academic.studyPreferences.aiModel
    : aiStatus?.models?.[0]?.name || "";
  const selectedAiModelInfo = (aiStatus?.models || []).find(
    (model) => model.name === selectedAiModel,
  );
  const selectedAiModelGb = Number(selectedAiModelInfo?.size || 0) / 1024 ** 3;
  const linkedIds = new Set(subject.linkedCourseIds || []);
  const nextItem = hub.upcoming[0];
  const pendingTasks = hub.tasks.filter((task) => task.status !== "completed");
  const dueCards = hub.decks.reduce(
    (total, deck) =>
      total +
      (deck.cards || []).filter(
        (card) => !card.dueDate || card.dueDate <= Date.now(),
      ).length,
    0,
  );

  const openLesson = (lesson) => {
    setActiveCourse(lesson.courseId);
    setActiveModule(lesson.moduleId);
    setActiveLesson(lesson.id);
    onNavigate?.(SCREEN_IDS.LESSON);
  };

  const [localView, setLocalView] = useState(null); // { kind: 'note'|'flashcards'|'resource', id, data }

  const openNote = (note) => {
    // If this note is a drawing note, open the whiteboard instead
    const isDrawing = note?.itemType === "drawing" || note?.noteType === "drawing" || note?.type === "drawing" || note?.sourceKind === "drawing-note";
    if (isDrawing) {
      setActiveNote(note.id);
      if (typeof window !== "undefined") {
        const params = new URLSearchParams({
          screen: SCREEN_IDS.WHITEBOARD,
          mode: "library-drawing",
          noteId: note.id,
        });
        window.history.replaceState(null, "", `?${params.toString()}`);
      }
      onNavigate?.(SCREEN_IDS.WHITEBOARD);
      return;
    }

    // Open the note inline within the subject view instead of navigating away
    setActiveNote(note.id);
    setLocalView({ kind: "note", id: note.id, data: note });
  };

  const createSubjectNote = (
    content = "",
    title = `Anotação de ${subject.name}`,
  ) => {
    const id = `note-${Date.now()}`;
    addNote({
      id,
      title,
      content,
      itemType: "note",
      sourceKind: "academic-note",
      sourceCourseId: subject.linkedCourseIds?.[0] || null,
      academicSubjectId: subject.id,
      academicSemesterId: subject.semesterId,
      tags: [subject.name],
      attachments: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    setActiveNote(id);
    onNavigate?.(SCREEN_IDS.NOTE_EDITOR);
  };

  const createSubjectDrawing = () => {
    const id = `note-${Date.now()}`;
    addNote({
      id,
      title: "Novo desenho",
      content: "<p>Desenho salvo na biblioteca.</p>",
      itemType: "drawing",
      noteType: "drawing",
      sourceKind: "drawing-note",
      academicSubjectId: subject.id,
      academicSemesterId: subject.semesterId,
      tags: [subject.name],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    setActiveNote(id);
    if (typeof window !== "undefined") {
      const params = new URLSearchParams({
        screen: SCREEN_IDS.WHITEBOARD,
        mode: "library-drawing",
        noteId: id,
      });
      window.history.replaceState(null, "", `?${params.toString()}`);
    }
    setShowCreateNoteMenu(false);
    onNavigate?.(SCREEN_IDS.WHITEBOARD);
  };

  const createSubjectHub = () => {
    const courseId = createCourseForSubject(subject.id);
    if (!courseId) return;
    setActiveCourse(courseId);
    onNavigate?.(SCREEN_IDS.MODULES);
  };

  const saveResource = (event) => {
    event.preventDefault();
    const location =
      resourceForm.type === "file" ? resourceForm.path : resourceForm.url;
    if (!resourceForm.title.trim() || !location) return;
    addAcademicEntity("resources", {
      subjectId: subject.id,
      semesterId: subject.semesterId,
      title: resourceForm.title.trim(),
      type: resourceForm.type,
      path: resourceForm.type === "file" ? resourceForm.path : "",
      url: resourceForm.type === "link" ? resourceForm.url.trim() : "",
      tags: resourceForm.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    });
    setResourceForm({ title: "", type: "link", url: "", path: "", tags: "" });
    setModal(null);
  };

  const pickResourceFile = async () => {
    const selected = await window.studyhubDesktop?.selectFile?.({
      properties: ["openFile"],
    });
    const path = Array.isArray(selected) ? selected[0] : selected;
    if (path)
      setResourceForm((current) => ({
        ...current,
        path,
        title: current.title || fileName(path),
      }));
  };

  const saveTask = (event) => {
    event.preventDefault();
    if (!taskForm.title.trim()) return;
    addTask({
      ...taskForm,
      title: taskForm.title.trim(),
      academicSubjectId: subject.id,
      academicSemesterId: subject.semesterId,
      courseId: subject.linkedCourseIds?.[0] || null,
      estimatedPomodoros: Math.max(1, Math.ceil(sessionMinutes / 25)),
    });
    setTaskForm({
      title: "",
      description: "",
      dueDate: "",
      priority: "medium",
      type: "task",
      subtasks: [],
    });
    setModal(null);
  };

  const saveAvailability = () => {
    setStudyPreferences({ availability: availabilityDraft, sessionMinutes });
  };

  const setDayAvailability = (weekday, enabled) => {
    setAvailabilityDraft((current) => {
      const existing = current.find(
        (window) => Number(window.weekday) === weekday,
      );
      if (!enabled)
        return current.filter((window) => Number(window.weekday) !== weekday);
      if (existing) return current;
      return [
        ...current,
        {
          id: `availability-${weekday}`,
          weekday,
          startTime: weekday === 0 || weekday === 6 ? "09:00" : "19:00",
          endTime: weekday === 0 || weekday === 6 ? "12:00" : "21:00",
          enabled: true,
        },
      ];
    });
  };

  const updateAvailability = (weekday, key, value) => {
    setAvailabilityDraft((current) =>
      current.map((window) =>
        Number(window.weekday) === weekday
          ? { ...window, [key]: value }
          : window,
      ),
    );
  };

  const generateAdaptivePlan = () => {
    const exam = hub.exams.find((item) => item.id === selectedExamId);
    if (!exam) return;
    if (!availabilityDraft.length) {
      setAiError(
        "Configure pelo menos um horário disponível antes de gerar o plano.",
      );
      return;
    }
    const busyEvents = buildAcademicCalendarEvents(stateSnapshot, {
      semesterId: subject.semesterId,
      startDate: toAcademicDateKey(new Date()),
      endDate: exam.date,
    }).filter((event) => event.source !== "study-session");
    const result = buildAdaptiveStudyPlan(exam, {
      semesterId: subject.semesterId,
      preferences: { availability: availabilityDraft, sessionMinutes },
      busyEvents,
      existingSessions: hub.studySessions.filter(
        (session) => session.examId !== exam.id,
      ),
    });
    replaceStudySessions(exam.id, result.sessions);
    setStudyPreferences({ availability: availabilityDraft, sessionMinutes });
    setAiError(
      result.unscheduledCount
        ? `${result.unscheduledCount} sessão(ões) não couberam nos horários disponíveis.`
        : "",
    );
  };

  const redistribute = () => {
    const exam = hub.exams.find((item) => item.id === selectedExamId);
    if (!exam) return;
    const examSessions = hub.studySessions.filter(
      (session) => session.examId === exam.id,
    );
    const result = redistributeMissedStudySessions(exam, examSessions, {
      preferences: { availability: availabilityDraft, sessionMinutes },
      busyEvents: buildAcademicCalendarEvents(stateSnapshot, {
        semesterId: subject.semesterId,
        startDate: toAcademicDateKey(new Date()),
        endDate: exam.date,
      }).filter((event) => event.source !== "study-session"),
    });
    replaceStudySessions(exam.id, result.sessions);
    setAiError(
      result.remaining
        ? `${result.remaining} sessão(ões) continuam sem horário livre.`
        : "",
    );
  };

  const startSession = (session) => {
    const taskId = `task-session-${session.id}`;
    if (!tasks.list.some((task) => task.id === taskId)) {
      addTask({
        id: taskId,
        title: session.title,
        type: "study",
        status: "pending",
        dueDate: session.date,
        academicStudySessionId: session.id,
        academicSubjectId: subject.id,
        academicSemesterId: subject.semesterId,
        estimatedPomodoros: Math.max(
          1,
          Math.ceil(session.durationMinutes / 25),
        ),
      });
    }
    const pomodoro = usePomodoroStore.getState();
    pomodoro.clearSelectedTasks();
    pomodoro.toggleTaskSelection(taskId);
    pomodoro.updateSettings({ focusTime: session.durationMinutes });
    pomodoro.setMode("focus");
    onNavigate?.(SCREEN_IDS.POMODORO);
  };

  const sourceCandidates = [
    ...hub.notes.flatMap((note) => [
      {
        id: `note:${note.id}`,
        kind: "note",
        title: note.title,
        noteId: note.id,
        content: stripHtml(note.content),
        locator: "Anotação",
      },
      ...(note.attachments || [])
        .filter((path) => /\.(pdf|txt|md)$/i.test(path))
        .map((path) => ({
          id: `file:${path}`,
          kind: "file",
          title: `${note.title} · ${fileName(path)}`,
          path,
          locator: "Anexo da anotação",
        })),
    ]),
    ...hub.lessons.flatMap((lesson) => [
      ...(lesson.description
        ? [
            {
              id: `lesson:${lesson.id}`,
              kind: "lesson",
              title: lesson.title,
              lessonId: lesson.id,
              content: stripHtml(lesson.description),
              locator: lesson.moduleTitle,
            },
          ]
        : []),
      ...(lesson.transcript
        ? [
            {
              id: `transcript:${lesson.id}`,
              kind: "transcript",
              title: `Transcrição · ${lesson.title}`,
              lessonId: lesson.id,
              content: stripHtml(lesson.transcript),
              locator: lesson.moduleTitle,
            },
          ]
        : []),
      ...(lesson.pdfPath
        ? [
            {
              id: `file:${lesson.pdfPath}`,
              kind: "file",
              title: `${lesson.title} · PDF`,
              path: lesson.pdfPath,
              locator: lesson.moduleTitle,
            },
          ]
        : []),
      ...(lesson.extraMedia || [])
        .filter(
          (media) => media.type === "pdf" || /\.pdf$/i.test(media.url || ""),
        )
        .map((media) => ({
          id: `file:${media.url}`,
          kind: "file",
          title: media.title || fileName(media.url),
          path: media.url,
          locator: lesson.title,
        })),
    ]),
    ...hub.resources
      .filter((resource) => resource.type === "file")
      .map((resource) => ({
        id: `file:${resource.path}`,
        kind: "file",
        title: resource.title,
        path: resource.path,
        locator: "Arquivo da matéria",
      })),
  ];

  const startLocalAi = async () => {
    setAiBusy(true);
    setAiError("");
    setAiNotice("");
    setAiOperation("Iniciando o Ollama");
    setAiStartedAt(Date.now());
    try {
      const status = await window.studyhubDesktop?.academicAI?.start?.();
      setAiStatus(status);
      if (!status?.available) {
        setAiError(status?.message || "Não foi possível iniciar o Ollama.");
      }
    } catch (error) {
      setAiError(error.message || "Não foi possível iniciar o Ollama.");
    } finally {
      setAiBusy(false);
      setAiOperation("");
      setAiStartedAt(0);
    }
  };

  const indexSelectedSources = async () => {
    if (!selectedSourceIds.length || !window.studyhubDesktop?.academicAI)
      return;
    setAiBusy(true);
    setAiError("");
    setAiNotice("");
    setAiOperation("Indexando fontes");
    setAiStartedAt(Date.now());
    try {
      const selected = sourceCandidates.filter((source) =>
        selectedSourceIds.includes(source.id),
      );
      const result = await window.studyhubDesktop.academicAI.indexSources({
        subjectId: subject.id,
        semesterId: subject.semesterId,
        sources: selected,
      });
      const refreshed = await window.studyhubDesktop.academicAI.listSources(
        subject.id,
      );
      setAiSources(Array.isArray(refreshed) ? refreshed : []);
      setAiSourcePermissions(
        subject.id,
        (Array.isArray(refreshed) ? refreshed : []).map((source) => ({
          sourceKey: source.sourceKey,
          kind: source.kind,
          title: source.title,
          path: source.path || null,
          semesterId: source.semesterId,
        })),
      );
      setSelectedSourceIds([]);
      const failed = (result?.results || []).filter((item) => !item.ok);
      const indexed = (result?.results || []).filter((item) => item.ok);
      setAiNotice(
        failed.length
          ? `${indexed.length} fonte(s) indexada(s). ${failed.length} falharam: ${failed.map((item) => item.error).join(" ")}`
          : `${indexed.length} fonte(s) indexada(s) com sucesso.`,
      );
    } catch (error) {
      setAiError(error.message || "Não foi possível indexar os conteúdos.");
    } finally {
      setAiBusy(false);
      setAiOperation("");
      setAiStartedAt(0);
    }
  };

  const removeIndexedSource = async (sourceKey) => {
    if (!window.studyhubDesktop?.academicAI) return;
    setAiBusy(true);
    setAiError("");
    setAiNotice("");
    setAiOperation("Removendo fonte");
    setAiStartedAt(Date.now());
    try {
      await window.studyhubDesktop.academicAI.removeSource(sourceKey);
      const refreshed = await window.studyhubDesktop.academicAI.listSources(
        subject.id,
      );
      setAiSources(Array.isArray(refreshed) ? refreshed : []);
      setAiSourcePermissions(
        subject.id,
        (Array.isArray(refreshed) ? refreshed : []).map((source) => ({
          sourceKey: source.sourceKey,
          kind: source.kind,
          title: source.title,
          path: source.path || null,
          semesterId: source.semesterId,
        })),
      );
    } catch (error) {
      setAiError(error.message || "Não foi possível remover a fonte.");
    } finally {
      setAiBusy(false);
      setAiOperation("");
      setAiStartedAt(0);
    }
  };

  const askAi = async () => {
    const questionText = aiQuestion.trim();
    if (!questionText || !window.studyhubDesktop?.academicAI) return;
    const requestId = `academic-ask-${Date.now()}`;
    const userMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: questionText,
      createdAt: Date.now(),
    };

    const currentHistory = (academic.aiChatHistories || {})[subject.id] || [];
    const updatedWithUser = [...currentHistory, userMessage];
    setAiChatHistory(subject.id, updatedWithUser);
    setAiQuestion("");

    setAiBusy(true);
    setAiError("");
    setAiNotice("");
    setAiOperation("Consultando suas fontes");
    setAiStartedAt(Date.now());
    setAiRequestId(requestId);

    try {
      const historyPayload = currentHistory.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      const response = await window.studyhubDesktop.academicAI.ask({
        subjectId: subject.id,
        semesterId: subject.semesterId,
        question: questionText,
        history: historyPayload,
        model: selectedAiModel,
        requestId,
      });

      setAiAnswer(response);
      const assistantMessage = {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: response.answer || response.message,
        citations: response.citations || [],
        grounded: response.grounded,
        createdAt: Date.now(),
      };

      setAiChatHistory(subject.id, [...updatedWithUser, assistantMessage]);

      if (response.retrievalMode === "subject-fallback") {
        setAiNotice(
          "A pergunta não teve correspondência exata; a IA consultou as fontes autorizadas desta matéria de forma ampliada.",
        );
      } else if (response.continuationCount > 0) {
        setAiNotice(
          `A resposta atingiu o limite inicial e foi continuada automaticamente ${response.continuationCount} vez(es).`,
        );
      }
      if (response.truncated) {
        setAiError(
          "A resposta continua incompleta mesmo após as continuações automáticas. Tente pedir uma resposta dividida em partes menores.",
        );
      }
    } catch (error) {
      setAiError(error.message || "A IA local não conseguiu responder.");
    } finally {
      setAiBusy(false);
      setAiOperation("");
      setAiStartedAt(0);
      setAiRequestId("");
    }
  };

  const generateWithAi = async (kind) => {
    if (!window.studyhubDesktop?.academicAI) return;
    const requestId = `academic-generate-${Date.now()}`;
    setAiBusy(true);
    setAiError("");
    setAiNotice("");
    setAiOperation("Gerando conteúdo acadêmico");
    setAiStartedAt(Date.now());
    setAiRequestId(requestId);
    try {
      const response = await window.studyhubDesktop.academicAI.generate({
        subjectId: subject.id,
        semesterId: subject.semesterId,
        kind,
        model: selectedAiModel,
        requestId,
      });
      setGeneratedPreview({ kind, ...response });
      if (response.continuationCount > 0) {
        setAiNotice(
          `O conteúdo foi continuado automaticamente ${response.continuationCount} vez(es) até ser concluído.`,
        );
      }
      if (response.truncated) {
        setAiError(
          "A geração continua incompleta mesmo após as continuações automáticas. Reduza a quantidade de conteúdo ou divida o pedido.",
        );
      }
    } catch (error) {
      setAiError(error.message || "Não foi possível gerar o conteúdo.");
    } finally {
      setAiBusy(false);
      setAiOperation("");
      setAiStartedAt(0);
      setAiRequestId("");
    }
  };

  const cancelAiOperation = async () => {
    if (!aiRequestId || !window.studyhubDesktop?.academicAI) return;
    await window.studyhubDesktop.academicAI.cancel(aiRequestId);
    setAiNotice("Operação cancelada.");
  };

  const saveGeneratedPreview = () => {
    if (!generatedPreview?.content) return;
    if (generatedPreview.kind === "flashcards") {
      let cards = generatedPreview.data?.cards;
      if (!Array.isArray(cards)) {
        cards = generatedPreview.content
          .split("\n")
          .map((line) => line.split("::"))
          .filter((parts) => parts.length >= 2)
          .map(([front, ...back]) => ({
            front: front.trim(),
            back: back.join("::").trim(),
          }));
      }
      if (cards?.length) {
        useStudyStore.getState().addFlashcardDeck({
          title: `IA · ${subject.name}`,
          academicSubjectId: subject.id,
          academicSemesterId: subject.semesterId,
          sourceKind: "academic-ai",
          cards: cards.map((card, index) => ({
            id: `ai-card-${Date.now()}-${index}`,
            front: card.front || card.question,
            back: card.back || card.answer,
            interval: 0,
            repetition: 0,
            easeFactor: 2.5,
            dueDate: Date.now(),
          })),
        });
      }
    } else {
      createSubjectNote(
        `<h2>${generatedPreview.title || "Conteúdo gerado pela IA"}</h2><p>${generatedPreview.content.replace(/\n/g, "</p><p>")}</p>`,
        generatedPreview.title || `IA · ${subject.name}`,
      );
    }
    setGeneratedPreview(null);
  };

  const lessonResources = hub.lessons.flatMap((lesson) => [
    ...(lesson.pdfPath
      ? [
          {
            id: `${lesson.id}-pdf`,
            type: "file",
            title: `PDF · ${lesson.title}`,
            path: lesson.pdfPath,
            lesson,
          },
        ]
      : []),
    ...(lesson.filePath
      ? [
          {
            id: `${lesson.id}-video`,
            type: "file",
            title: `Vídeo · ${lesson.title}`,
            path: lesson.filePath,
            lesson,
          },
        ]
      : []),
    ...(lesson.audioPath
      ? [
          {
            id: `${lesson.id}-audio`,
            type: "file",
            title: `Áudio · ${lesson.title}`,
            path: lesson.audioPath,
            lesson,
          },
        ]
      : []),
    ...(lesson.youtubeUrl
      ? [
          {
            id: `${lesson.id}-youtube`,
            type: "link",
            title: `YouTube · ${lesson.title}`,
            url: lesson.youtubeUrl,
            lesson,
          },
        ]
      : []),
    ...(lesson.externalUrl
      ? [
          {
            id: `${lesson.id}-external`,
            type: "link",
            title: `Conteúdo externo · ${lesson.title}`,
            url: lesson.externalUrl,
            lesson,
          },
        ]
      : []),
    ...(lesson.extraMedia || []).map((media) => ({
      id: media.id || `${lesson.id}-${media.url}`,
      type: /^https?:/i.test(media.url || "") ? "link" : "file",
      title: media.title || fileName(media.url),
      url: /^https?:/i.test(media.url || "") ? media.url : "",
      path: /^https?:/i.test(media.url || "") ? "" : media.url,
      lesson,
    })),
  ]);

  const openResource = (resource) => {
    if (resource.url) window.studyhubDesktop?.openExternal?.(resource.url);
    else if (resource.path) window.studyhubDesktop?.openPath?.(resource.path);
  };

  const renderOverview = () => (
    <div className="space-y-6">
      <CollapsibleSection
        title="Métricas & Desempenho"
        eyebrow="Resumo da matéria"
        icon="monitoring"
        defaultOpen={true}
      >
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            icon="monitoring"
            label="Média atual"
            value={
              hub.gradeSummary.completedWeight
                ? hub.gradeSummary.currentAverage.toFixed(1)
                : "—"
            }
            hint={
              hub.gradeSummary.neededAverage !== null &&
              hub.gradeSummary.completedWeight
                ? `Precisa de ${hub.gradeSummary.neededAverage.toFixed(1)} no restante`
                : "Adicione suas avaliações"
            }
            color={subject.color}
          />
          <MetricCard
            icon="how_to_reg"
            label="Frequência"
            value={`${hub.attendanceSummary.attendanceRate.toFixed(0)}%`}
            hint={
              hub.attendanceSummary.atRisk
                ? "Atenção: próximo do limite"
                : `Mínimo ${hub.attendanceSummary.minimum}%`
            }
            color={hub.attendanceSummary.atRisk ? "#ef4444" : "#10b981"}
          />
          <MetricCard
            icon="school"
            label="Conteúdo concluído"
            value={`${hub.progress}%`}
            hint={`${hub.completedLessons}/${hub.lessons.length} aulas`}
            color="#3b82f6"
          />
          <MetricCard
            icon="timer"
            label="Foco nesta semana"
            value={`${hub.weeklyFocusMinutes} min`}
            hint={`Meta ${subject.weeklyStudyGoalMinutes || 120} min`}
            color="#f59e0b"
          />
        </div>
      </CollapsibleSection>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
        <CollapsibleSection
          title="Calendário da Matéria"
          eyebrow="Agenda & Eventos"
          icon="calendar_month"
          defaultOpen={true}
        >
          <AcademicCalendar
            compact
            semesterId={subject.semesterId}
            initialSubjectId={subject.id}
          />
        </CollapsibleSection>

        <CollapsibleSection
          title="Prioridades da Matéria"
          eyebrow="Próximos passos"
          icon="track_changes"
          defaultOpen={true}
        >
          <div className="space-y-3">
            {hub.upcoming.slice(0, 5).map((item) => (
              <div
                key={`${item.source}-${item.id}`}
                className="flex items-center gap-3 rounded-2xl p-3 neo-inset"
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                  style={{
                    backgroundColor: `${subject.color}18`,
                    color: subject.color,
                  }}
                >
                  <Icon
                    name={
                      item.source === "exam"
                        ? "quiz"
                        : item.source === "project"
                          ? "assignment"
                          : "task_alt"
                    }
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black">
                    {item.title}
                  </span>
                  <span className="block text-xs text-[color:var(--on-surface-variant)]">
                    {formatDate(item.date)}
                  </span>
                </span>
              </div>
            ))}
            {!hub.upcoming.length ? (
              <p className="rounded-2xl p-6 text-center text-sm text-[color:var(--on-surface-variant)] neo-inset">
                Nenhuma entrega próxima.
              </p>
            ) : null}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="relative" ref={createNoteMenuRef}>
              <button
                className="w-full rounded-xl bg-[color:var(--primary)] px-4 py-3 text-xs font-black text-white"
                type="button"
                onClick={() => setShowCreateNoteMenu((v) => !v)}
                aria-haspopup="true"
                aria-expanded={showCreateNoteMenu}
              >
                <Icon className="mr-2 text-[18px]" name="add" />
                Nova anotação
              </button>

              {showCreateNoteMenu ? (
                <div className="absolute right-0 z-10 mt-2 w-44 rounded-xl border border-[color:var(--outline-variant)]/30 bg-[color:var(--surface)] p-2 neo-raised">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-bold hover:bg-[color:var(--background)]"
                    onClick={() => {
                      setShowCreateNoteMenu(false);
                      createSubjectNote();
                    }}
                  >
                    <Icon name="note_add" /> Nota
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-bold hover:bg-[color:var(--background)]"
                    onClick={() => {
                      createSubjectDrawing();
                    }}
                  >
                    <Icon name="draw" /> Desenhar
                  </button>
                </div>
              ) : null}
            </div>

            <button
              className="rounded-xl px-4 py-3 text-xs font-black text-[color:var(--primary)] neo-raised"
              type="button"
              onClick={() => setModal("task")}
            >
              Nova tarefa
            </button>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="IA Acadêmica e Chat da Matéria"
          subtitle="Tire dúvidas sobre os materiais e consulte a conversa salva da disciplina"
          icon="auto_awesome"
          badge={
            ((academic.aiChatHistories || {})[subject.id] || []).length
              ? `${((academic.aiChatHistories || {})[subject.id] || []).length} mensagem(ns)`
              : undefined
          }
          defaultOpen={true}
        >
          {renderAiSection()}
        </CollapsibleSection>
      </div>
    </div>
  );

  const renderLessons = () => (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-[color:var(--primary)]">
            Conteúdo conectado
          </p>
          <h2 className="mt-1 text-2xl font-black">Aulas e módulos</h2>
          <p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">
            O conteúdo continua no hub original e aparece aqui sem cópias.
          </p>
        </div>
        <button
          className="rounded-xl px-4 py-3 text-sm font-black text-[color:var(--primary)] neo-raised"
          type="button"
          onClick={() => setShowLinks((value) => !value)}
        >
          <Icon className="mr-2 text-[18px]" name="link" />
          Gerenciar vínculos
        </button>
      </div>
      {showLinks ? (
        <section className="rounded-[26px] bg-[color:var(--surface)] p-5 neo-raised">
          <h3 className="font-black">Hubs vinculados</h3>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {courses.map((course) => {
              const checked = linkedIds.has(course.id);
              return (
                <label
                  key={course.id}
                  className="flex cursor-pointer items-center gap-3 rounded-2xl bg-[color:var(--background)] p-3"
                >
                  <input
                    className="rounded text-[color:var(--primary)]"
                    type="checkbox"
                    checked={checked}
                    onChange={(event) =>
                      event.target.checked
                        ? linkCourse(subject.id, course.id)
                        : unlinkCourse(subject.id, course.id)
                    }
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">
                    {course.title}
                  </span>
                  <span className="text-xs text-[color:var(--on-surface-variant)]">
                    {course.progress || 0}%
                  </span>
                </label>
              );
            })}
            {!courses.length ? (
              <p className="text-sm text-[color:var(--on-surface-variant)]">
                Você ainda não criou nenhum hub.
              </p>
            ) : null}
          </div>
          <button
            className="mt-4 rounded-xl bg-[color:var(--primary)] px-4 py-2.5 text-xs font-black text-white"
            type="button"
            onClick={createSubjectHub}
          >
            Criar hub para a matéria
          </button>
        </section>
      ) : null}
      {hub.courses.length ? (
        <div className="space-y-5">
          {hub.courses.map((course) => (
            <section
              key={course.id}
              className="rounded-[28px] bg-[color:var(--surface)] p-5 neo-raised"
            >
              <button
                className="flex w-full items-center justify-between gap-4 text-left"
                type="button"
                onClick={() => {
                  setActiveCourse(course.id);
                  onNavigate?.(SCREEN_IDS.MODULES);
                }}
              >
                <span>
                  <span className="block text-lg font-black">
                    {course.title}
                  </span>
                  <span className="mt-1 block text-xs text-[color:var(--on-surface-variant)]">
                    {course.modules?.length || 0} módulos ·{" "}
                    {course.progress || 0}% concluído
                  </span>
                </span>
                <Icon name="arrow_forward" />
              </button>
              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                {(course.modules || []).map((module) => (
                  <div
                    key={module.id}
                    className="rounded-2xl bg-[color:var(--background)] p-4"
                  >
                    <h4 className="font-black">{module.title}</h4>
                    <div className="mt-3 space-y-2">
                      {(module.lessons || []).map((lesson) => (
                        <button
                          key={lesson.id}
                          className="flex w-full items-center gap-3 rounded-xl p-3 text-left neo-inset"
                          type="button"
                          onClick={() =>
                            openLesson({
                              ...lesson,
                              courseId: course.id,
                              moduleId: module.id,
                            })
                          }
                        >
                          <Icon
                            className={
                              lesson.status === "completed"
                                ? "text-emerald-500"
                                : "text-[color:var(--primary)]"
                            }
                            name={
                              lesson.status === "completed"
                                ? "check_circle"
                                : "play_circle"
                            }
                          />
                          <span className="min-w-0 flex-1 truncate text-sm font-bold">
                            {lesson.title}
                          </span>
                          <Icon
                            className="text-[16px] text-[color:var(--on-surface-variant)]"
                            name="chevron_right"
                          />
                        </button>
                      ))}
                      {!module.lessons?.length ? (
                        <p className="py-3 text-xs text-[color:var(--on-surface-variant)]">
                          Módulo sem aulas.
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          icon="hub"
          title="Nenhum hub vinculado"
          text="Vincule um curso existente ou crie um hub vazio para organizar módulos e aulas desta matéria."
          action={createSubjectHub}
          actionLabel="Criar hub da matéria"
        />
      )}
    </div>
  );

  const renderNotes = () => (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-[color:var(--primary)]">
            Conhecimento
          </p>
          <h2 className="mt-1 text-2xl font-black">Anotações da matéria</h2>
        </div>
        <button
          className="rounded-xl bg-[color:var(--primary)] px-4 py-3 text-sm font-black text-white"
          type="button"
          onClick={() => createSubjectNote()}
        >
          <Icon className="mr-2 text-[18px]" name="add" />
          Nova anotação
        </button>
      </div>
      {hub.notes.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {hub.notes.map((note) => (
            <button
              key={note.id}
              className="rounded-[24px] bg-[color:var(--surface)] p-5 text-left neo-raised"
              type="button"
              onClick={() => openNote(note)}
            >
              <div className="flex items-start justify-between gap-3">
                <Icon
                  className="text-2xl text-[color:var(--primary)]"
                  name="description"
                />
                <span className="text-[10px] font-bold text-[color:var(--on-surface-variant)]">
                  {new Date(
                    note.updatedAt || note.createdAt,
                  ).toLocaleDateString("pt-BR")}
                </span>
              </div>
              <h3 className="mt-4 line-clamp-2 font-black">{note.title}</h3>
              <p className="mt-2 line-clamp-3 text-sm leading-6 text-[color:var(--on-surface-variant)]">
                {stripHtml(note.content) || "Nota vazia"}
              </p>
              <div className="mt-4 flex flex-wrap gap-1">
                {(note.tags || []).slice(0, 4).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-[color:var(--primary)]/10 px-2 py-1 text-[10px] font-bold text-[color:var(--primary)]"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          icon="edit_note"
          title="Nenhuma anotação"
          text="Crie uma anotação já vinculada a esta matéria e ao semestre atual."
          action={() => createSubjectNote()}
          actionLabel="Criar anotação"
        />
      )}
    </div>
  );

  const renderResources = () => {
    const all = [...hub.resources, ...lessonResources];
    return (
      <div className="space-y-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-[color:var(--primary)]">
              Biblioteca
            </p>
            <h2 className="mt-1 text-2xl font-black">
              Arquivos, links e referências
            </h2>
          </div>
          <button
            className="rounded-xl bg-[color:var(--primary)] px-4 py-3 text-sm font-black text-white"
            type="button"
            onClick={() => setModal("resource")}
          >
            <Icon className="mr-2 text-[18px]" name="add_link" />
            Adicionar recurso
          </button>
        </div>
        {all.length || hub.references.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {all.map((resource) => (
              <article
                key={resource.id}
                className="group rounded-[24px] bg-[color:var(--surface)] p-5 neo-raised"
              >
                <div className="flex items-start justify-between">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[color:var(--primary)]/10 text-[color:var(--primary)]">
                    <Icon
                      name={
                        resource.type === "link"
                          ? "link"
                          : /\.pdf$/i.test(resource.path || "")
                            ? "picture_as_pdf"
                            : "draft"
                      }
                    />
                  </span>
                  {resource.subjectId ? (
                    <button
                      className="p-2 text-[color:var(--error)] opacity-0 group-hover:opacity-100"
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Tem certeza que deseja remover "${resource.title}"?`)) {
                          deleteAcademicEntity("resources", resource.id);
                        }
                      }}
                    >
                      <Icon className="text-[18px]" name="delete" />
                    </button>
                  ) : null}
                </div>
                <h3 className="mt-4 line-clamp-2 font-black">
                  {resource.title}
                </h3>
                <p className="mt-1 truncate text-xs text-[color:var(--on-surface-variant)]">
                  {resource.url || resource.path}
                </p>
                <button
                  className="mt-4 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black text-[color:var(--primary)] neo-raised"
                  type="button"
                  onClick={() => setLocalView({ kind: "resource", id: resource.id, data: resource })}
                >
                  <Icon className="text-[16px]" name="open_in_new" />
                  Abrir
                </button>
              </article>
            ))}
            {hub.references.map((reference) => (
              <article
                key={reference.id}
                className="rounded-[24px] bg-[color:var(--surface)] p-5 neo-raised"
              >
                <span className="text-[10px] font-black uppercase text-[color:var(--primary)]">
                  Referência · {reference.type}
                </span>
                <h3 className="mt-3 font-black">{reference.title}</h3>
                <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">
                  {reference.authors || "Autor não informado"} ·{" "}
                  {reference.year || "s.d."}
                </p>
                {reference.url ? (
                  <button
                    className="mt-4 text-xs font-black text-[color:var(--primary)]"
                    type="button"
                    onClick={() =>
                      window.studyhubDesktop?.openExternal?.(reference.url)
                    }
                  >
                    Abrir referência
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="folder_open"
            title="Biblioteca vazia"
            text="Adicione PDFs, documentos e links. Os arquivos das aulas também aparecem automaticamente aqui."
            action={() => setModal("resource")}
            actionLabel="Adicionar recurso"
          />
        )}
      </div>
    );
  };

  const renderTasks = () => (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-[color:var(--primary)]">
            Execução
          </p>
          <h2 className="mt-1 text-2xl font-black">Tarefas e trabalhos</h2>
        </div>
        <button
          className="rounded-xl bg-[color:var(--primary)] px-4 py-3 text-sm font-black text-white"
          type="button"
          onClick={() => setModal("task")}
        >
          <Icon className="mr-2 text-[18px]" name="add_task" />
          Nova tarefa
        </button>
      </div>
      {hub.tasks.length || hub.projects.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {hub.tasks.map((task) => (
            <article
              key={task.id}
              className={`rounded-[24px] bg-[color:var(--surface)] p-5 neo-raised ${
                task.status === "completed"
                  ? "border border-emerald-500/25 bg-emerald-500/10"
                  : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <Icon
                  className={
                    task.status === "completed"
                      ? "text-emerald-500"
                      : "text-[color:var(--primary)]"
                  }
                  name={
                    task.status === "completed" ? "check_circle" : "task_alt"
                  }
                />
                <div className="min-w-0 flex-1">
                  <h3
                    className={`font-black ${task.status === "completed" ? "line-through opacity-60" : ""}`}
                  >
                    {task.title}
                  </h3>
                  <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">
                    {task.dueDate
                      ? `Entrega ${formatDate(task.dueDate)}`
                      : "Sem prazo"}{" "}
                    ·{" "}
                    {task.priority === "high"
                      ? "Alta prioridade"
                      : task.priority === "low"
                        ? "Baixa prioridade"
                        : "Prioridade média"}
                  </p>
                </div>
              </div>
              {task.description ? (
                <p className="mt-4 text-sm leading-6 text-[color:var(--on-surface-variant)]">
                  {task.description}
                </p>
              ) : null}

              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black text-[color:var(--primary)] neo-raised"
                  onClick={() => {
                    const pomodoro = usePomodoroStore.getState();
                    pomodoro.clearSelectedTasks();
                    pomodoro.toggleTaskSelection(task.id);
                    pomodoro.setMode("focus");
                    pomodoro.startTimer();
                    onNavigate?.(SCREEN_IDS.POMODORO);
                  }}
                >
                  <Icon name="timer" /> Iniciar foco
                </button>

                <button
                  type="button"
                  className="rounded-xl px-3 py-2 text-xs font-black"
                  onClick={() => {
                    setActiveTask(task.id);
                    onNavigate?.(SCREEN_IDS.TASK_DETAILS);
                  }}
                >
                  <Icon name="edit" /> Editar
                </button>

                <button
                  type="button"
                  className="rounded-xl px-3 py-2 text-xs font-black"
                  onClick={() => updateTask(task.id, { status: task.status === "completed" ? "pending" : "completed" })}
                  title="Alternar concluída"
                >
                  <Icon name={task.status === "completed" ? "radio_button_unchecked" : "check"} />
                </button>

                <button
                  type="button"
                  className="rounded-xl px-3 py-2 text-xs font-black text-[color:var(--error)]"
                  onClick={() => {
                    if (!window.confirm(`Excluir a tarefa "${task.title}"?`)) return;
                    deleteTask(task.id);
                  }}
                >
                  <Icon name="delete" />
                </button>
              </div>
            </article>
          ))}
          {hub.projects.map((project) => (
            <article
              key={project.id}
              className="rounded-[24px] bg-[color:var(--surface)] p-5 neo-raised relative"
            >
              <p className="text-[10px] font-black uppercase text-[color:var(--primary)]">
                Trabalho em grupo
              </p>
              <button
                className="absolute right-3 top-3 p-2 text-[color:var(--error)]"
                type="button"
                onClick={() => {
                  if (!window.confirm(`Excluir o projeto "${project.title}"?`)) return;
                  deleteAcademicEntity("projects", project.id);
                }}
                aria-label={`Excluir projeto ${project.title}`}
              >
                <Icon name="delete" />
              </button>
              <h3 className="mt-2 font-black">{project.title}</h3>
              <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">
                Entrega {formatDate(project.dueDate)}
              </p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-[color:var(--background)]">
                <div
                  className="h-full bg-[color:var(--primary)]"
                  style={{ width: `${project.progress || 0}%` }}
                />
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon="task_alt"
          title="Tudo em dia"
          text="Crie tarefas da matéria para acompanhar prazos e iniciar sessões de foco."
          action={() => setModal("task")}
          actionLabel="Criar tarefa"
        />
      )}
    </div>
  );

  const renderAssessments = () => (
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="rounded-[28px] bg-[color:var(--surface)] p-6 neo-raised">
        <h2 className="text-xl font-black">Provas</h2>
        <div className="mt-5 space-y-3">
          {hub.exams
            .sort((a, b) => String(a.date).localeCompare(String(b.date)))
            .map((exam) => (
              <div key={exam.id} className="rounded-2xl p-4 neo-inset">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-black">{exam.title}</h3>
                    <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">
                      {formatDate(exam.date)}
                    </p>
                  </div>
                  <span className="rounded-full bg-[color:var(--primary)]/10 px-3 py-1 text-[10px] font-black text-[color:var(--primary)]">
                    {(exam.topics || []).length} tópicos
                  </span>
                </div>
              </div>
            ))}
          {!hub.exams.length ? (
            <p className="py-8 text-center text-sm text-[color:var(--on-surface-variant)]">
              Nenhuma prova cadastrada.
            </p>
          ) : null}
        </div>
      </section>
      <section className="rounded-[28px] bg-[color:var(--surface)] p-6 neo-raised">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black">Notas</h2>
          <span
            className="text-2xl font-black"
            style={{ color: subject.color }}
          >
            {hub.gradeSummary.completedWeight
              ? hub.gradeSummary.currentAverage.toFixed(1)
              : "—"}
          </span>
        </div>
        <div className="mt-5 space-y-3">
          {hub.grades.map((grade) => (
            <div
              key={grade.id}
              className="flex items-center gap-3 rounded-2xl p-4 neo-inset"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-black">{grade.title}</span>
                <span className="block text-xs text-[color:var(--on-surface-variant)]">
                  Peso {grade.weight || 0}%
                </span>
              </span>
              <strong>
                {grade.score}/{grade.maxScore}
              </strong>
            </div>
          ))}
          {!hub.grades.length ? (
            <p className="py-8 text-center text-sm text-[color:var(--on-surface-variant)]">
              Adicione avaliações na Central Acadêmica.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );

  const renderFlashcards = () => (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-black uppercase tracking-wider text-[color:var(--primary)]">
          Repetição espaçada
        </p>
        <h2 className="mt-1 text-2xl font-black">Flashcards da matéria</h2>
        <p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">
          {dueCards} cartões aguardando revisão.
        </p>
      </div>
      {hub.decks.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {hub.decks.map((deck) => {
            const due = (deck.cards || []).filter(
              (card) => !card.dueDate || card.dueDate <= Date.now(),
            ).length;
            return (
              <button
                key={deck.id}
                className="rounded-[24px] bg-[color:var(--surface)] p-5 text-left neo-raised"
                type="button"
                onClick={() => {
                  // Open flashcards inline inside the subject view
                  setActiveDeck(deck.id);
                  setLocalView({ kind: "flashcards", id: deck.id, data: deck });
                }}
              >
                <div className="flex items-center justify-between">
                  <Icon
                    className="text-3xl text-[color:var(--primary)]"
                    name="style"
                  />
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-black ${due ? "bg-amber-500/15 text-amber-600" : "bg-emerald-500/15 text-emerald-600"}`}
                  >
                    {due} pendentes
                  </span>
                </div>
                <h3 className="mt-5 font-black">{deck.title}</h3>
                <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">
                  {deck.cards?.length || 0} cartões
                </p>
              </button>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon="style"
          title="Nenhum baralho vinculado"
          text="Crie flashcards a partir de anotações, questões ou com a IA acadêmica local."
          action={() => setTab("plan")}
          actionLabel="Abrir IA acadêmica"
        />
      )}
    </div>
  );

  const renderPlan = () => {
    const selectedExam = hub.exams.find((exam) => exam.id === selectedExamId);
    const sessions = hub.studySessions
      .filter((session) => !selectedExamId || session.examId === selectedExamId)
      .sort((a, b) =>
        `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`),
      );
    const hasMissed = sessions.some(
      (session) =>
        session.generated &&
        session.status !== "completed" &&
        session.date < toAcademicDateKey(new Date()),
    );
    return (
      <div className="space-y-6">
        <div className="grid gap-6 xl:grid-cols-[.9fr_1.1fr]">
          <section className="rounded-[28px] bg-[color:var(--surface)] p-6 neo-raised">
            <p className="text-xs font-black uppercase tracking-wider text-[color:var(--primary)]">
              Disponibilidade
            </p>
            <h2 className="mt-1 text-xl font-black">
              Quando você pode estudar?
            </h2>
            <div className="mt-5 space-y-3">
              {DAYS.map((day) => {
                const window = availabilityDraft.find(
                  (item) => Number(item.weekday) === day.value,
                );
                return (
                  <div
                    key={day.value}
                    className="grid grid-cols-[54px_1fr_1fr] items-center gap-2"
                  >
                    <label className="flex items-center gap-2 text-xs font-black">
                      <input
                        type="checkbox"
                        checked={Boolean(window)}
                        onChange={(event) =>
                          setDayAvailability(day.value, event.target.checked)
                        }
                      />
                      {day.label}
                    </label>
                    <input
                      disabled={!window}
                      className={inputClass}
                      type="time"
                      value={window?.startTime || "19:00"}
                      onChange={(event) =>
                        updateAvailability(
                          day.value,
                          "startTime",
                          event.target.value,
                        )
                      }
                    />
                    <input
                      disabled={!window}
                      className={inputClass}
                      type="time"
                      value={window?.endTime || "21:00"}
                      onChange={(event) =>
                        updateAvailability(
                          day.value,
                          "endTime",
                          event.target.value,
                        )
                      }
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-5 flex items-center gap-2">
              <span className="text-xs font-black">Sessão:</span>
              {[25, 50, 90].map((minutes) => (
                <button
                  key={minutes}
                  className={`rounded-xl px-3 py-2 text-xs font-black ${sessionMinutes === minutes ? "bg-[color:var(--primary)] text-white" : "neo-raised"}`}
                  type="button"
                  onClick={() => setSessionMinutes(minutes)}
                >
                  {minutes} min
                </button>
              ))}
            </div>
            <button
              className="mt-5 w-full rounded-xl px-4 py-3 text-sm font-black text-[color:var(--primary)] neo-raised"
              type="button"
              onClick={saveAvailability}
            >
              Salvar disponibilidade
            </button>
          </section>
          <section className="rounded-[28px] bg-[color:var(--surface)] p-6 neo-raised">
            <p className="text-xs font-black uppercase tracking-wider text-[color:var(--primary)]">
              Planejamento adaptativo
            </p>
            <h2 className="mt-1 text-xl font-black">Preparação para prova</h2>
            {hub.exams.length ? (
              <>
                <select
                  className={`${inputClass} mt-5`}
                  value={selectedExamId}
                  onChange={(event) => setSelectedExamId(event.target.value)}
                >
                  {hub.exams.map((exam) => (
                    <option key={exam.id} value={exam.id}>
                      {exam.title} · {formatDate(exam.date)}
                    </option>
                  ))}
                </select>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    className="rounded-xl bg-[color:var(--primary)] px-4 py-3 text-xs font-black text-white"
                    type="button"
                    onClick={generateAdaptivePlan}
                  >
                    <Icon className="mr-1 text-[17px]" name="auto_schedule" />
                    {sessions.length ? "Regenerar plano" : "Gerar plano"}
                  </button>
                  {hasMissed ? (
                    <button
                      className="rounded-xl bg-amber-500/15 px-4 py-3 text-xs font-black text-amber-700"
                      type="button"
                      onClick={redistribute}
                    >
                      <Icon className="mr-1 text-[17px]" name="event_repeat" />
                      Redistribuir perdidas
                    </button>
                  ) : null}
                </div>
                <div className="mt-5 max-h-[330px] space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      className={`flex items-center gap-3 rounded-2xl p-3 ${session.status === "completed" ? "bg-emerald-500/10" : session.date < toAcademicDateKey(new Date()) ? "bg-amber-500/10" : "neo-inset"}`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          updateAcademicEntity("studySessions", session.id, {
                            status:
                              session.status === "completed"
                                ? "pending"
                                : "completed",
                            completedAt:
                              session.status === "completed"
                                ? null
                                : Date.now(),
                          })
                        }
                      >
                        <Icon
                          className={
                            session.status === "completed"
                              ? "text-emerald-500"
                              : "text-[color:var(--primary)]"
                          }
                          name={
                            session.status === "completed"
                              ? "check_circle"
                              : "radio_button_unchecked"
                          }
                        />
                      </button>
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block truncate text-sm font-black ${session.status === "completed" ? "line-through opacity-60" : ""}`}
                        >
                          {session.title}
                        </span>
                        <span className="block text-[10px] text-[color:var(--on-surface-variant)]">
                          {formatDate(session.date)} · {session.startTime}–
                          {session.endTime}
                        </span>
                      </span>
                      <button
                        className="rounded-xl p-2 text-[color:var(--primary)] neo-raised"
                        type="button"
                        onClick={() => startSession(session)}
                        title="Iniciar foco"
                      >
                        <Icon className="text-[17px]" name="timer" />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-5 rounded-2xl p-6 text-center text-sm text-[color:var(--on-surface-variant)] neo-inset">
                Cadastre uma prova para gerar um plano.
              </p>
            )}
          </section>
        </div>
  const renderAiSection = () => (
        <section className="rounded-[28px] bg-[color:var(--surface)] p-6 neo-raised">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-[color:var(--primary)]">
                Privado e local
              </p>
              <h2 className="mt-1 text-2xl font-black">IA acadêmica</h2>
              <p className="mt-1 max-w-2xl text-sm text-[color:var(--on-surface-variant)]">
                Somente os conteúdos marcados abaixo entram no índice local.
                Nada é enviado para serviços em nuvem.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {aiStatus?.available && aiStatus.models?.length ? (
                <select
                  aria-label="Modelo local da IA"
                  className="rounded-xl border border-[color:var(--outline-variant)]/40 bg-[color:var(--background)] px-3 py-2 text-xs font-black outline-none"
                  value={selectedAiModel}
                  onChange={(event) =>
                    setStudyPreferences({ aiModel: event.target.value })
                  }
                >
                  {aiStatus.models.map((model) => (
                    <option key={model.name} value={model.name}>
                      {model.name}
                    </option>
                  ))}
                </select>
              ) : (
                <button
                  disabled={aiBusy}
                  className="rounded-xl bg-amber-500/15 px-3 py-2 text-xs font-black text-amber-700 disabled:opacity-50"
                  type="button"
                  onClick={startLocalAi}
                >
                  {aiBusy ? "Iniciando..." : "Iniciar Ollama"}
                </button>
              )}
              <span
                className={`rounded-full px-3 py-2 text-xs font-black ${aiStatus?.available ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-700"}`}
              >
                {aiStatus?.available
                  ? `${aiStatus.models?.length || 0} modelo(s) disponível(is)`
                  : "Ollama não disponível"}
              </span>
            </div>
          </div>
          {selectedAiModelGb >= 8 ? (
            <div className="mt-4 flex items-start gap-3 rounded-2xl bg-amber-500/10 p-4 text-amber-800">
              <Icon className="mt-0.5 text-xl" name="memory" />
              <div>
                <p className="text-sm font-black">
                  Modelo local pesado ({selectedAiModelGb.toFixed(1)} GB)
                </p>
                <p className="mt-1 text-xs leading-5">
                  A primeira resposta pode levar alguns minutos enquanto o
                  modelo é carregado. Depois ele permanecerá ativo por 15
                  minutos. Se já tiver um modelo menor instalado, você pode
                  escolhê-lo acima.
                </p>
              </div>
            </div>
          ) : null}
          {aiBusy ? (
            <div
              className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-[color:var(--primary)]/10 p-4"
              role="status"
            >
              <Icon
                className="animate-spin text-xl text-[color:var(--primary)]"
                name="progress_activity"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black">
                  {aiOperation || "Processando"}
                </span>
                <span className="block text-xs text-[color:var(--on-surface-variant)]">
                  {aiElapsed}s decorridos
                  {aiRequestId && aiElapsed < 20
                    ? " · preparando o modelo local"
                    : ""}
                </span>
              </span>
              {aiRequestId ? (
                <button
                  className="rounded-xl bg-[color:var(--surface)] px-4 py-2 text-xs font-black text-[color:var(--error)] neo-raised"
                  type="button"
                  onClick={cancelAiOperation}
                >
                  Cancelar
                </button>
              ) : null}
            </div>
          ) : null}
          {!aiSources.length ? (
            <p className="mt-4 rounded-2xl bg-sky-500/10 p-4 text-sm font-bold text-sky-700">
              A IA responde somente com fontes autorizadas. Selecione e indexe
              ao menos uma anotação, descrição de aula ou PDF abaixo.
            </p>
          ) : null}
          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="font-black">Selecionar fontes</h3>
                <span className="text-xs text-[color:var(--on-surface-variant)]">
                  {aiSources.length} indexadas
                </span>
              </div>
              <div className="mt-3 max-h-[280px] space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                {sourceCandidates.map((source) => {
                  const indexed = aiSources.some(
                    (item) => item.sourceKey === source.id,
                  );
                  return (
                    <label
                      key={source.id}
                      className="flex cursor-pointer items-center gap-3 rounded-2xl bg-[color:var(--background)] p-3"
                    >
                      <input
                        disabled={indexed}
                        type="checkbox"
                        checked={
                          indexed || selectedSourceIds.includes(source.id)
                        }
                        onChange={(event) =>
                          setSelectedSourceIds((current) =>
                            event.target.checked
                              ? [...current, source.id]
                              : current.filter((id) => id !== source.id),
                          )
                        }
                      />
                      <Icon
                        className="text-[18px] text-[color:var(--primary)]"
                        name={
                          source.kind === "file"
                            ? "picture_as_pdf"
                            : "description"
                        }
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-bold">
                        {source.title}
                      </span>
                      {indexed ? (
                        <button
                          className="rounded-lg px-2 py-1 text-[10px] font-black text-[color:var(--error)] hover:bg-[color:var(--error)]/10"
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            if (window.confirm(`Tem certeza que deseja remover "${source.title}" das fontes de IA?`)) {
                              removeIndexedSource(source.id);
                            }
                          }}
                        >
                          Remover
                        </button>
                      ) : null}
                    </label>
                  );
                })}
                {!sourceCandidates.length ? (
                  <p className="rounded-2xl p-5 text-center text-sm text-[color:var(--on-surface-variant)] neo-inset">
                    Adicione notas ou PDFs à matéria.
                  </p>
                ) : null}
              </div>
              <button
                disabled={!selectedSourceIds.length || aiBusy}
                className="mt-3 w-full rounded-xl bg-[color:var(--primary)] px-4 py-3 text-sm font-black text-white disabled:opacity-40"
                type="button"
                onClick={indexSelectedSources}
              >
                {aiBusy
                  ? "Processando..."
                  : `Indexar ${selectedSourceIds.length || ""} selecionado(s)`}
              </button>
            </div>
            <div>
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-black">Conversa com a IA</h3>
                {((academic.aiChatHistories || {})[subject.id] || []).length > 0 ? (
                  <button
                    className="flex items-center gap-1 text-xs font-bold text-[color:var(--error)] hover:underline"
                    type="button"
                    onClick={() => {
                      if (window.confirm("Deseja apagar o histórico de conversa desta matéria?")) {
                        setAiChatHistory(subject.id, []);
                      }
                    }}
                  >
                    <Icon className="text-sm" name="delete" />
                    Limpar histórico
                  </button>
                ) : null}
              </div>

              {((academic.aiChatHistories || {})[subject.id] || []).length > 0 ? (
                <div className="mt-3 max-h-[350px] space-y-3 overflow-y-auto rounded-2xl bg-[color:var(--background)] p-4 custom-scrollbar">
                  {((academic.aiChatHistories || {})[subject.id] || []).map((message) => (
                    <div
                      key={message.id}
                      className={`flex flex-col ${message.role === "user" ? "items-end" : "items-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl p-3.5 text-sm leading-6 ${
                          message.role === "user"
                            ? "bg-[color:var(--primary)] text-white shadow-md"
                            : "bg-[color:var(--surface)] text-[color:var(--on-surface)] neo-raised"
                        }`}
                      >
                        <div
                          className="prose prose-sm max-w-none space-y-2"
                          dangerouslySetInnerHTML={{
                            __html: sanitizeGeneratedHtml(
                              markdownToNoteHtml(message.content),
                            ),
                          }}
                        />
                        {message.citations?.length ? (
                          <div className="mt-3 border-t border-[color:var(--outline-variant)]/25 pt-2">
                            <p className="text-[10px] font-black uppercase opacity-75">
                              Fontes:
                            </p>
                            {message.citations.map((citation, index) => (
                              <p
                                key={`${citation.sourceId}-${index}`}
                                className={`mt-0.5 text-xs font-bold ${message.role === "user" ? "text-white/90" : "text-[color:var(--primary)]"}`}
                              >
                                [{index + 1}] {citation.title}
                                {citation.locator ? ` · ${citation.locator}` : ""}
                              </p>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              <textarea
                className={`${inputClass} mt-3 min-h-[90px] resize-none`}
                placeholder="Pergunte algo sobre os arquivos desta matéria (pressione Enter para enviar)..."
                value={aiQuestion}
                onChange={(event) => setAiQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    if (aiQuestion.trim() && !aiBusy && aiStatus?.available && aiSources.length) {
                      askAi();
                    }
                  }
                }}
              />
              <button
                disabled={
                  !aiQuestion.trim() ||
                  aiBusy ||
                  !aiStatus?.available ||
                  !aiSources.length
                }
                className="mt-3 rounded-xl bg-[color:var(--primary)] px-5 py-3 text-sm font-black text-white disabled:opacity-40"
                type="button"
                onClick={askAi}
              >
                <Icon className="mr-2 text-[18px]" name="send" />
                Enviar pergunta
              </button>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {[
              { kind: "summary", label: "Gerar resumo", icon: "summarize" },
              { kind: "questions", label: "Gerar questões", icon: "quiz" },
              { kind: "flashcards", label: "Gerar flashcards", icon: "style" },
              {
                kind: "study-plan",
                label: "Sugerir plano",
                icon: "auto_schedule",
              },
            ].map((action) => (
              <button
                key={action.kind}
                disabled={aiBusy || !aiStatus?.available || !aiSources.length}
                className="rounded-xl px-4 py-3 text-xs font-black text-[color:var(--primary)] neo-raised disabled:opacity-40"
                type="button"
                onClick={() => generateWithAi(action.kind)}
              >
                <Icon className="mr-1 text-[17px]" name={action.icon} />
                {action.label}
              </button>
            ))}
          </div>
          {aiError ? (
            <p className="mt-4 rounded-xl bg-[color:var(--error)]/10 p-3 text-sm font-bold text-[color:var(--error)]">
              {aiError}
            </p>
          ) : null}
          {aiNotice ? (
            <p className="mt-4 rounded-xl bg-emerald-500/10 p-3 text-sm font-bold text-emerald-700">
              {aiNotice}
            </p>
          ) : null}
        </section>
  );

  const renderPlan = () => {
    const selectedExam = hub.exams.find((exam) => exam.id === selectedExamId);
    const sessions = hub.studySessions
      .filter((session) => !selectedExamId || session.examId === selectedExamId)
      .sort((a, b) =>
        `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`),
      );
    const hasMissed = sessions.some(
      (session) =>
        session.generated &&
        session.status !== "completed" &&
        session.date < toAcademicDateKey(new Date()),
    );
    return (
      <div className="space-y-6">
        <div className="grid gap-6 xl:grid-cols-[.9fr_1.1fr]">
          <section className="rounded-[28px] bg-[color:var(--surface)] p-6 neo-raised">
            <p className="text-xs font-black uppercase tracking-wider text-[color:var(--primary)]">
              Disponibilidade
            </p>
            <h2 className="mt-1 text-xl font-black">
              Quando você pode estudar?
            </h2>
            <div className="mt-5 space-y-3">
              {DAYS.map((day) => {
                const window = availabilityDraft.find(
                  (item) => Number(item.weekday) === day.value,
                );
                return (
                  <div
                    key={day.value}
                    className="grid grid-cols-[54px_1fr_1fr] items-center gap-2"
                  >
                    <label className="flex items-center gap-2 text-xs font-black">
                      <input
                        type="checkbox"
                        checked={Boolean(window)}
                        onChange={(event) =>
                          setDayAvailability(day.value, event.target.checked)
                        }
                      />
                      {day.label}
                    </label>
                    <input
                      disabled={!window}
                      className={inputClass}
                      type="time"
                      value={window?.startTime || "19:00"}
                      onChange={(event) =>
                        updateAvailability(
                          day.value,
                          "startTime",
                          event.target.value,
                        )
                      }
                    />
                    <input
                      disabled={!window}
                      className={inputClass}
                      type="time"
                      value={window?.endTime || "21:00"}
                      onChange={(event) =>
                        updateAvailability(
                          day.value,
                          "endTime",
                          event.target.value,
                        )
                      }
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-5 flex items-center gap-2">
              <span className="text-xs font-black">Sessão:</span>
              {[25, 50, 90].map((minutes) => (
                <button
                  key={minutes}
                  className={`rounded-xl px-3 py-2 text-xs font-black ${sessionMinutes === minutes ? "bg-[color:var(--primary)] text-white" : "neo-raised"}`}
                  type="button"
                  onClick={() => setSessionMinutes(minutes)}
                >
                  {minutes} min
                </button>
              ))}
            </div>
            <button
              className="mt-5 w-full rounded-xl px-4 py-3 text-sm font-black text-[color:var(--primary)] neo-raised"
              type="button"
              onClick={saveAvailability}
            >
              Salvar disponibilidade
            </button>
          </section>
          <section className="rounded-[28px] bg-[color:var(--surface)] p-6 neo-raised">
            <p className="text-xs font-black uppercase tracking-wider text-[color:var(--primary)]">
              Planejamento adaptativo
            </p>
            <h2 className="mt-1 text-xl font-black">Preparação para prova</h2>
            {hub.exams.length ? (
              <>
                <select
                  className={`${inputClass} mt-5`}
                  value={selectedExamId}
                  onChange={(event) => setSelectedExamId(event.target.value)}
                >
                  {hub.exams.map((exam) => (
                    <option key={exam.id} value={exam.id}>
                      {exam.title} · {formatDate(exam.date)}
                    </option>
                  ))}
                </select>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    className="rounded-xl bg-[color:var(--primary)] px-4 py-3 text-xs font-black text-white"
                    type="button"
                    onClick={generateAdaptivePlan}
                  >
                    <Icon className="mr-1 text-[17px]" name="auto_schedule" />
                    {sessions.length ? "Regenerar plano" : "Gerar plano"}
                  </button>
                  {hasMissed ? (
                    <button
                      className="rounded-xl bg-amber-500/15 px-4 py-3 text-xs font-black text-amber-700"
                      type="button"
                      onClick={redistribute}
                    >
                      <Icon className="mr-1 text-[17px]" name="event_repeat" />
                      Redistribuir perdidas
                    </button>
                  ) : null}
                </div>
                <div className="mt-5 max-h-[330px] space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      className={`flex items-center gap-3 rounded-2xl p-3 ${session.status === "completed" ? "bg-emerald-500/10" : session.date < toAcademicDateKey(new Date()) ? "bg-amber-500/10" : "neo-inset"}`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          updateAcademicEntity("studySessions", session.id, {
                            status:
                              session.status === "completed"
                                ? "pending"
                                : "completed",
                            completedAt:
                              session.status === "completed"
                                ? null
                                : Date.now(),
                          })
                        }
                      >
                        <Icon
                          className={
                            session.status === "completed"
                              ? "text-emerald-500"
                              : "text-[color:var(--primary)]"
                          }
                          name={
                            session.status === "completed"
                              ? "check_circle"
                              : "radio_button_unchecked"
                          }
                        />
                      </button>
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block truncate text-sm font-black ${session.status === "completed" ? "line-through opacity-60" : ""}`}
                        >
                          {session.title}
                        </span>
                        <span className="block text-[10px] text-[color:var(--on-surface-variant)]">
                          {formatDate(session.date)} · {session.startTime}–
                          {session.endTime}
                        </span>
                      </span>
                      <button
                        className="rounded-xl p-2 text-[color:var(--primary)] neo-raised"
                        type="button"
                        onClick={() => startSession(session)}
                        title="Iniciar foco"
                      >
                        <Icon className="text-[17px]" name="timer" />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-5 rounded-2xl p-6 text-center text-sm text-[color:var(--on-surface-variant)] neo-inset">
                Cadastre uma prova para gerar um plano.
              </p>
            )}
          </section>
        </div>
        {renderAiSection()}
      </div>
    );
  };

  const content =
    tab === "overview"
      ? renderOverview()
      : tab === "lessons"
        ? renderLessons()
        : tab === "notes"
          ? renderNotes()
          : tab === "resources"
            ? renderResources()
            : tab === "tasks"
              ? renderTasks()
              : tab === "assessments"
                ? renderAssessments()
                : tab === "flashcards"
                  ? renderFlashcards()
                  : renderPlan();

  return (
    <main className="flex-1 overflow-y-auto bg-[color:var(--background)] custom-scrollbar">
      <section className="relative overflow-hidden border-b border-[color:var(--outline-variant)]/20 px-5 pb-7 pt-6 sm:px-8">
        <div
          className="pointer-events-none absolute inset-0 opacity-10"
          style={{
            background: `radial-gradient(circle at 85% 0%, ${subject.color}, transparent 48%)`,
          }}
        />
        <div className="relative mx-auto max-w-[1500px]">
          <div className="flex items-center justify-between gap-4">
            <button
              className="inline-flex items-center gap-2 text-sm font-black text-[color:var(--on-surface-variant)] hover:text-[color:var(--primary)]"
              type="button"
              onClick={() => onNavigate?.(SCREEN_IDS.ACADEMIC)}
            >
              <Icon name="arrow_back" />
              Faculdade
            </button>
            <button
              className="flex items-center gap-1.5 rounded-xl bg-[color:var(--surface)] px-3 py-1.5 text-xs font-black text-[color:var(--on-surface-variant)] neo-raised hover:text-[color:var(--primary)] transition-colors"
              type="button"
              onClick={() => setHeaderCollapsed((prev) => !prev)}
              title={headerCollapsed ? "Expandir detalhes da matéria" : "Minimizar cabeçalho"}
            >
              <Icon className="text-base" name={headerCollapsed ? "unfold_more" : "unfold_less"} />
              <span className="hidden sm:inline">
                {headerCollapsed ? "Expandir cabeçalho" : "Minimizar"}
              </span>
            </button>
          </div>

          <AnimatePresence initial={false}>
            {!headerCollapsed && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="mt-4 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
                  <div className="flex items-start gap-4">
                    <span
                      className="flex h-14 w-14 sm:h-16 sm:w-16 shrink-0 items-center justify-center rounded-[22px] text-white shadow-lg"
                      style={{ backgroundColor: subject.color }}
                    >
                      <Icon className="text-2xl sm:text-3xl" name="school" />
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="text-xs font-black uppercase tracking-[0.16em]"
                          style={{ color: subject.color }}
                        >
                          {
                            hub.academic.semesters.find(
                              (semester) => semester.id === subject.semesterId,
                            )?.name
                          }
                        </span>
                        {subject.code ? (
                          <span className="rounded-full bg-[color:var(--surface)] px-2 py-1 text-[10px] font-black text-[color:var(--on-surface-variant)]">
                            {subject.code}
                          </span>
                        ) : null}
                      </div>
                      <h1 className="mt-1 text-2xl font-black sm:text-4xl">
                        {subject.name}
                      </h1>
                      <div className="mt-2 sm:mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs sm:text-sm text-[color:var(--on-surface-variant)]">
                        <span>
                          <Icon className="mr-1 text-[17px]" name="person" />
                          {subject.professor || "Professor não informado"}
                        </span>
                        <span>
                          <Icon className="mr-1 text-[17px]" name="location_on" />
                          {subject.room ||
                            subject.schedule?.room ||
                            "Sala não informada"}
                        </span>
                        <span>
                          <Icon
                            className="mr-1 text-[17px]"
                            name="workspace_premium"
                          />
                          {subject.credits || 0} créditos
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-2xl bg-[color:var(--surface)] px-3 py-2 sm:px-4 sm:py-3 text-xs font-black neo-raised">
                      {pendingTasks.length} tarefas abertas
                    </span>
                    <span className="rounded-2xl bg-[color:var(--surface)] px-3 py-2 sm:px-4 sm:py-3 text-xs font-black neo-raised">
                      {nextItem
                        ? `Próximo: ${formatDate(nextItem.date)}`
                        : "Agenda livre"}
                    </span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {headerCollapsed && (
            <div className="mt-2 flex items-center gap-3">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
                style={{ backgroundColor: subject.color }}
              >
                <Icon className="text-lg" name="school" />
              </span>
              <h1 className="text-xl font-black truncate">{subject.name}</h1>
            </div>
          )}

          <nav className="mt-4 sm:mt-6 flex gap-2 overflow-x-auto pb-1 custom-scrollbar scroll-smooth">
            {TABS.map((item) => (
              <button
                key={item.id}
                className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 sm:px-4 sm:py-3 text-xs font-black transition-colors ${tab === item.id ? "text-white shadow-lg" : "bg-[color:var(--surface)] text-[color:var(--on-surface-variant)] neo-raised"}`}
                style={
                  tab === item.id
                    ? { backgroundColor: subject.color }
                    : undefined
                }
                type="button"
                onClick={() => setTab(item.id)}
              >
                <Icon className="text-[17px]" name={item.icon} />
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </section>
      <div className="mx-auto max-w-[1500px] p-5 pb-24 sm:p-8">{content}</div>

      <AnimatePresence>
        {modal === "resource" ? (
          <Modal
            eyebrow="Biblioteca da matéria"
            title="Adicionar arquivo ou link"
            onClose={() => setModal(null)}
          >
            <form className="mt-6 space-y-4" onSubmit={saveResource}>
              <label className="block text-xs font-black uppercase text-[color:var(--on-surface-variant)]">
                Título
                <input
                  className={`${inputClass} mt-2 normal-case`}
                  required
                  value={resourceForm.title}
                  onChange={(event) =>
                    setResourceForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                {["link", "file"].map((type) => (
                  <button
                    key={type}
                    className={`rounded-xl px-4 py-3 text-sm font-black ${resourceForm.type === type ? "bg-[color:var(--primary)] text-white" : "neo-raised"}`}
                    type="button"
                    onClick={() =>
                      setResourceForm((current) => ({ ...current, type }))
                    }
                  >
                    <Icon
                      className="mr-1"
                      name={type === "link" ? "link" : "draft"}
                    />
                    {type === "link" ? "Link" : "Arquivo"}
                  </button>
                ))}
              </div>
              {resourceForm.type === "link" ? (
                <label className="block text-xs font-black uppercase text-[color:var(--on-surface-variant)]">
                  Endereço
                  <input
                    className={`${inputClass} mt-2 normal-case`}
                    required
                    type="url"
                    value={resourceForm.url}
                    onChange={(event) =>
                      setResourceForm((current) => ({
                        ...current,
                        url: event.target.value,
                      }))
                    }
                  />
                </label>
              ) : (
                <div>
                  <button
                    className="w-full rounded-xl px-4 py-4 text-sm font-black text-[color:var(--primary)] neo-raised"
                    type="button"
                    onClick={pickResourceFile}
                  >
                    <Icon className="mr-2" name="attach_file" />
                    {resourceForm.path
                      ? fileName(resourceForm.path)
                      : "Selecionar arquivo"}
                  </button>
                </div>
              )}
              <label className="block text-xs font-black uppercase text-[color:var(--on-surface-variant)]">
                Tags
                <input
                  className={`${inputClass} mt-2 normal-case`}
                  value={resourceForm.tags}
                  onChange={(event) =>
                    setResourceForm((current) => ({
                      ...current,
                      tags: event.target.value,
                    }))
                  }
                  placeholder="prova, leitura, importante"
                />
              </label>
              <button
                className="w-full rounded-xl bg-[color:var(--primary)] px-4 py-3 text-sm font-black text-white"
                type="submit"
              >
                Salvar recurso
              </button>
            </form>
          </Modal>
        ) : null}
        {modal === "task" ? (
          <Modal
            eyebrow={subject.name}
            title="Nova tarefa"
            onClose={() => setModal(null)}
          >
            <form className="mt-6 space-y-4" onSubmit={saveTask}>
              <input
                className={inputClass}
                required
                placeholder="Título da tarefa"
                value={taskForm.title}
                onChange={(event) =>
                  setTaskForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
              <textarea
                className={`${inputClass} min-h-[100px] resize-none`}
                placeholder="Descrição"
                value={taskForm.description}
                onChange={(event) =>
                  setTaskForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <input
                  className={inputClass}
                  type="date"
                  value={taskForm.dueDate}
                  onChange={(event) =>
                    setTaskForm((current) => ({
                      ...current,
                      dueDate: event.target.value,
                    }))
                  }
                />
                <select
                  className={inputClass}
                  value={taskForm.priority}
                  onChange={(event) =>
                    setTaskForm((current) => ({
                      ...current,
                      priority: event.target.value,
                    }))
                  }
                >
                  <option value="low">Baixa prioridade</option>
                  <option value="medium">Prioridade média</option>
                  <option value="high">Alta prioridade</option>
                </select>
              </div>
              <select
                className={inputClass}
                value={taskForm.type}
                onChange={(event) =>
                  setTaskForm((current) => ({
                    ...current,
                    type: event.target.value,
                  }))
                }
              >
                <option value="task">Tarefa</option>
                <option value="assignment">Trabalho</option>
                <option value="presentation">Apresentação</option>
                <option value="exam">Preparação para prova</option>
              </select>
              <div className="space-y-3">
                <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--on-surface-variant)]">
                  Subtarefas
                </span>
                <div className="space-y-2">
                  {(taskForm.subtasks || []).map((subtask, index) => (
                    <div key={subtask.id} className="flex gap-2">
                      <input
                        className={`${inputClass} !h-10`}
                        placeholder="Nova subtarefa..."
                        value={subtask.title}
                        onChange={(e) => updateSubtask(index, e.target.value)}
                      />
                      <button
                        type="button"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-500 hover:bg-red-100"
                        onClick={() => removeSubtask(index)}
                      >
                        <Icon name="close" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[color:var(--outline-variant)] py-3 text-xs font-bold hover:bg-[color:var(--surface-container)]"
                    onClick={addSubtask}
                  >
                    <Icon className="text-sm" name="add" /> Adicionar subtarefa
                  </button>
                </div>
              </div>
              <button
                className="w-full rounded-xl bg-[color:var(--primary)] px-4 py-3 text-sm font-black text-white"
                type="submit"
              >
                Criar tarefa
              </button>
            </form>
          </Modal>
        ) : null}
        {generatedPreview ? (
          <Modal
            eyebrow="Revisar antes de salvar"
            title={generatedPreview.title || "Conteúdo gerado"}
            onClose={() => setGeneratedPreview(null)}
          >
            <div className="mt-6 max-h-[52vh] overflow-y-auto whitespace-pre-wrap rounded-2xl bg-[color:var(--background)] p-5 text-sm leading-7 custom-scrollbar">
              {generatedPreview.content}
            </div>
            <div className="mt-5 flex gap-3">
              <button
                className="flex-1 rounded-xl px-4 py-3 text-sm font-black neo-raised"
                type="button"
                onClick={() => setGeneratedPreview(null)}
              >
                Descartar
              </button>
              <button
                className="flex-1 rounded-xl bg-[color:var(--primary)] px-4 py-3 text-sm font-black text-white"
                type="button"
                onClick={saveGeneratedPreview}
              >
                Salvar no masterStudy
              </button>
            </div>
          </Modal>
        ) : null}

        {localView ? (
          <Modal
            eyebrow={subject.name}
            title={
              localView.kind === "note"
                ? localView.data?.title || "Anotação"
                : localView.kind === "flashcards"
                  ? localView.data?.title || "Flashcards"
                  : localView.data?.title || "Recurso"
            }
            onClose={() => setLocalView(null)}
          >
            <div className="mt-4">
              {localView.kind === "note" ? (
                <div className="space-y-4">
                  <p className="text-sm text-[color:var(--on-surface-variant)] whitespace-pre-wrap">
                    {stripHtml(localView.data?.content) || "Nenhum conteúdo"}
                  </p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      className="flex-1 rounded-xl px-4 py-3 text-sm font-black neo-raised"
                      onClick={() => setLocalView(null)}
                    >
                      Fechar
                    </button>
                    <button
                      type="button"
                      className="flex-1 rounded-xl bg-[color:var(--primary)] px-4 py-3 text-sm font-black text-white"
                      onClick={() => {
                        setLocalView(null);
                        onNavigate?.(SCREEN_IDS.NOTE_EDITOR);
                      }}
                    >
                      Abrir editor
                    </button>
                  </div>
                </div>
              ) : localView.kind === "flashcards" ? (
                <div className="space-y-4">
                  <p className="text-sm text-[color:var(--on-surface-variant)]">
                    {localView.data?.cards?.length || 0} cartões · {(localView.data?.cards || []).filter(c => !c.dueDate || c.dueDate <= Date.now()).length} para revisar
                  </p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      className="flex-1 rounded-xl px-4 py-3 text-sm font-black neo-raised"
                      onClick={() => setLocalView(null)}
                    >
                      Fechar
                    </button>
                    <button
                      type="button"
                      className="flex-1 rounded-xl bg-[color:var(--primary)] px-4 py-3 text-sm font-black text-white"
                      onClick={() => {
                        setActiveDeck(localView.id);
                        setLocalView(null);
                        onNavigate?.(SCREEN_IDS.FLASHCARDS);
                      }}
                    >
                      Revisar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-[color:var(--on-surface-variant)] truncate break-words">
                    {localView.data?.url || localView.data?.path || "Sem local"}
                  </p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      className="flex-1 rounded-xl px-4 py-3 text-sm font-black neo-raised"
                      onClick={() => setLocalView(null)}
                    >
                      Fechar
                    </button>
                    <button
                      type="button"
                      className="flex-1 rounded-xl bg-[color:var(--primary)] px-4 py-3 text-sm font-black text-white"
                      onClick={() => {
                        setLocalView(null);
                        if (localView.data?.url) window.studyhubDesktop?.openExternal?.(localView.data.url);
                        else if (localView.data?.path) window.studyhubDesktop?.openPath?.(localView.data.path);
                      }}
                    >
                      Abrir recurso
                    </button>
                  </div>
                </div>
              )}
            </div>
          </Modal>
        ) : null}

      </AnimatePresence>
    </main>
  );
}
