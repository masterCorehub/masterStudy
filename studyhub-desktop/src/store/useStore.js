import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  ACADEMIC_COLLECTIONS,
  createEmptyAcademicData,
  normalizeAcademicData,
} from "../domain/academic";
import { getLocalDateKey } from "../utils/dateUtils";
import {
  DEFAULT_JOURNAL_SETTINGS,
  normalizeImportantQuote,
  normalizeJournalEntries,
  normalizeJournalEntry,
  normalizeJournalSettings,
} from "../domain/journal";

const isReadOnlySharedItem = (item) =>
  Boolean(
    item?.sharedWithMe &&
      item?.sharingPermission !== "editor" &&
      item?.sharedReadOnly !== false,
  );

const migrateDashboardQuickNotes = (state = {}) => {
  if (Array.isArray(state.dashboardQuickNotes)) return state.dashboardQuickNotes;
  const legacyContent = String(state.dashboardQuickNote || "").trim();
  if (!legacyContent) return [];
  return [
    {
      id: "dashboard-quick-note-legacy",
      title: "Anotação rápida",
      content: state.dashboardQuickNote,
      x: 16,
      y: 16,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];
};

const DEFAULT_DASHBOARD_WIDGETS = [
  { id: "schedule", visible: true, size: 12, rowSpan: 5, x: 0, y: 0 },
  { id: "summary", visible: true, size: 4, rowSpan: 2, x: 0, y: 5 },
  { id: "focus", visible: true, size: 4, rowSpan: 2, x: 4, y: 5 },
  { id: "deadlines", visible: true, size: 4, rowSpan: 2, x: 8, y: 5 },
  { id: "habits", visible: true, size: 8, rowSpan: 6, x: 0, y: 10 },
  { id: "water", visible: true, size: 4, rowSpan: 5, x: 8, y: 10 },
  { id: "flashcards", visible: true, size: 4, rowSpan: 2, x: 8, y: 15 },
  { id: "tasks", visible: true, size: 8, rowSpan: 5, x: 0, y: 16 },
];

const normalizeDashboardWidgets = (widgets) => {
  const saved = new Map(
    (Array.isArray(widgets) ? widgets : []).map((widget) => [widget.id, widget]),
  );
  const normalized = DEFAULT_DASHBOARD_WIDGETS.map((fallback) => ({
    ...fallback,
    ...(saved.get(fallback.id) || {}),
    id: fallback.id,
  }));
  return [
    ...normalized,
    ...(Array.isArray(widgets)
      ? widgets.filter((widget) => widget.id !== "quick-notes" && !DEFAULT_DASHBOARD_WIDGETS.some((item) => item.id === widget.id))
      : []),
  ];
};

const ensureQuickNoteWidgets = (widgets, quickNotes = []) => {
  const normalized = normalizeDashboardWidgets(widgets);
  const noteIds = new Set((quickNotes || []).map((note) => `quick-note:${note.id}`));
  const existing = new Set(normalized.map((widget) => widget.id));
  const dynamic = (quickNotes || [])
    .map((note, index) => ({
      id: `quick-note:${note.id}`,
      visible: true,
      size: 4,
      rowSpan: 3,
      x: (index % 3) * 4,
      y: index < 3 ? 7 : 21 + Math.floor((index - 3) / 3) * 3,
    }))
    .filter((widget) => !existing.has(widget.id));
  return [
    ...normalized.filter(
      (widget) => !widget.id.startsWith("quick-note:") || noteIds.has(widget.id),
    ),
    ...dynamic,
  ];
};

const dashboardWidgetsOverlap = (left, right) =>
  Number(left.x || 0) < Number(right.x || 0) + Number(right.size || 12) &&
  Number(left.x || 0) + Number(left.size || 12) > Number(right.x || 0) &&
  Number(left.y || 0) < Number(right.y || 0) + Number(right.rowSpan || 3) &&
  Number(left.y || 0) + Number(left.rowSpan || 3) > Number(right.y || 0);

const findFreeDashboardWidgetPosition = (widget, occupied, preferred = null) => {
  const width = Number(widget.size || 12);
  const fits = (candidate) =>
    candidate.x >= 0 &&
    candidate.x + width <= 12 &&
    !occupied.some((placed) => dashboardWidgetsOverlap(candidate, placed));
  if (preferred) {
    const candidate = {
      ...widget,
      x: Math.max(0, Math.min(12 - width, Number(preferred.x || 0))),
      y: Math.max(0, Number(preferred.y || 0)),
    };
    if (fits(candidate)) return candidate;
  }
  const searchLimit = Math.max(
    24,
    ...occupied.map((placed) => Number(placed.y || 0) + Number(placed.rowSpan || 3) + 12),
  );
  for (let y = 0; y <= searchLimit; y += 1) {
    for (let x = 0; x <= 12 - width; x += 1) {
      const candidate = { ...widget, x, y };
      if (fits(candidate)) return candidate;
    }
  }
  return { ...widget, x: 0, y: searchLimit + 1 };
};

const resolveDashboardWidgetCollisions = (
  widgets,
  primaryId,
  primaryWidget,
  preferredForCollision = null,
) => {
  const placedById = new Map([[primaryId, primaryWidget]]);
  const occupied = [primaryWidget];
  let usedPreferred = false;
  widgets.forEach((widget) => {
    if (widget.id === primaryId) return;
    if (widget.visible === false) {
      placedById.set(widget.id, widget);
      return;
    }
    const normalized = {
      ...widget,
      x: Number(widget.x || 0),
      y: Number(widget.y || 0),
      size: Number(widget.size || 12),
      rowSpan: Number(widget.rowSpan || 3),
    };
    if (!occupied.some((placed) => dashboardWidgetsOverlap(normalized, placed))) {
      placedById.set(widget.id, normalized);
      occupied.push(normalized);
      return;
    }
    const relocated = findFreeDashboardWidgetPosition(
      normalized,
      occupied,
      usedPreferred ? null : preferredForCollision,
    );
    usedPreferred = true;
    placedById.set(widget.id, relocated);
    occupied.push(relocated);
  });
  return widgets.map((widget) => placedById.get(widget.id) || widget);
};

const recalculateCourse = (course) => {
  let totalLessons = 0;
  let completedLessons = 0;
  // Count lessons inside modules
  course.modules.forEach((mod) => {
    totalLessons += (mod.lessons || []).length;
    completedLessons += (mod.lessons || []).filter(
      (l) => l.status === "completed",
    ).length;
  });
  // Also count top-level lessons attached directly to the course
  totalLessons += (course.lessons || []).length;
  completedLessons += (course.lessons || []).filter(
    (l) => l.status === "completed",
  ).length;

  const progress =
    totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
  return {
    ...course,
    progress,
    stats: { ...course.stats, materials: totalLessons },
  };
};

const createCourseRecord = (courseData = {}, requestedId = null) => ({
  ...courseData,
  id:
    requestedId ||
    courseData.id ||
    `course-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  modules: Array.isArray(courseData.modules) ? courseData.modules : [],
  // Support top-level lessons so courses can have lessons without modules
  lessons: Array.isArray(courseData.lessons) ? courseData.lessons : [],
  progress: Number(courseData.progress || 0),
  tutor: courseData.tutor || {
    name: "Você",
    role: "Instrutor",
    image: "",
  },
  stats: courseData.stats || { materials: 0, xp: 0 },
  tools: courseData.tools || {
    flashcards: {
      title: "Flashcards",
      description: "Revise conteúdos importantes",
      pendingLabel: "0 cartões pendentes",
    },
    notes: { title: "Minhas Notas" },
  },
});

const updateLessonInCourses = (
  courses,
  courseId,
  moduleId,
  lessonId,
  lessonUpdater,
) =>
  courses.map((course) => {
    if (course.id !== courseId) return course;
    if (isReadOnlySharedItem(course)) return course;

    // If moduleId is provided, update inside that module
    if (moduleId) {
      const updatedCourse = {
        ...course,
        modules: course.modules.map((mod) => {
          if (mod.id !== moduleId) return mod;
          return {
            ...mod,
            lessons: (mod.lessons || []).map((lesson) =>
              lesson.id === lessonId ? lessonUpdater(lesson) : lesson,
            ),
          };
        }),
      };
      return recalculateCourse(updatedCourse);
    }

    // No moduleId: update top-level course lessons
    const updatedCourse = {
      ...course,
      lessons: (course.lessons || []).map((lesson) =>
        lesson.id === lessonId ? lessonUpdater(lesson) : lesson,
      ),
    };

    return recalculateCourse(updatedCourse);
  });

const defaultImmersionPanels = {
  video: {
    id: "video",
    label: "Aula",
    icon: "smart_display",
    visible: true,
    x: 24,
    y: 24,
    w: 760,
    h: 420,
  },
  notes: {
    id: "notes",
    label: "Anotacoes",
    icon: "edit_note",
    visible: true,
    x: 810,
    y: 24,
    w: 360,
    h: 520,
  },
  pdf: {
    id: "pdf",
    label: "PDF",
    icon: "picture_as_pdf",
    visible: true,
    x: 24,
    y: 468,
    w: 500,
    h: 300,
  },
  audio: {
    id: "audio",
    label: "Audio",
    icon: "headphones",
    visible: true,
    x: 548,
    y: 468,
    w: 380,
    h: 300,
  },
  flashcards: {
    id: "flashcards",
    label: "Flashcards",
    icon: "style",
    visible: false,
    x: 810,
    y: 560,
    w: 320,
    h: 300,
  },
  tasks: {
    id: "tasks",
    label: "Tarefas",
    icon: "task_alt",
    visible: true,
    x: 1150,
    y: 560,
    w: 340,
    h: 360,
  },
  drawing: {
    id: "drawing",
    label: "Desenho",
    icon: "draw",
    visible: false,
    x: 1150,
    y: 24,
    w: 320,
    h: 300,
  },
  resources: {
    id: "resources",
    label: "Recursos",
    icon: "folder_open",
    visible: false,
    x: 1150,
    y: 348,
    w: 320,
    h: 300,
  },
};

const defaultImmersionPresets = [
  {
    id: "preset-focus",
    name: "Foco na aula",
    builtIn: true,
    zOrder: [
      "video",
      "notes",
      "pdf",
      "audio",
      "flashcards",
      "tasks",
      "drawing",
      "resources",
    ],
    isCanvasFullscreen: false,
    panels: defaultImmersionPanels,
  },
  {
    id: "preset-reading",
    name: "Leitura + audio",
    builtIn: true,
    zOrder: [
      "pdf",
      "audio",
      "notes",
      "tasks",
      "video",
      "flashcards",
      "drawing",
      "resources",
    ],
    isCanvasFullscreen: false,
    panels: {
      ...defaultImmersionPanels,
      video: { ...defaultImmersionPanels.video, visible: false },
      pdf: { ...defaultImmersionPanels.pdf, x: 24, y: 24, w: 760, h: 620 },
      audio: { ...defaultImmersionPanels.audio, x: 810, y: 24, w: 360, h: 220 },
      notes: {
        ...defaultImmersionPanels.notes,
        x: 810,
        y: 268,
        w: 360,
        h: 360,
      },
      tasks: {
        ...defaultImmersionPanels.tasks,
        x: 1190,
        y: 24,
        w: 300,
        h: 300,
        visible: false,
      },
    },
  },
  {
    id: "preset-whiteboard",
    name: "Quadro em foco",
    builtIn: true,
    zOrder: [
      "notes",
      "video",
      "pdf",
      "audio",
      "tasks",
      "flashcards",
      "drawing",
      "resources",
    ],
    isCanvasFullscreen: true,
    panels: {
      ...defaultImmersionPanels,
      video: { ...defaultImmersionPanels.video, visible: false },
      pdf: { ...defaultImmersionPanels.pdf, visible: false },
      audio: { ...defaultImmersionPanels.audio, visible: false },
      flashcards: { ...defaultImmersionPanels.flashcards, visible: false },
      tasks: { ...defaultImmersionPanels.tasks, visible: false },
      drawing: { ...defaultImmersionPanels.drawing, visible: false },
      resources: { ...defaultImmersionPanels.resources, visible: false },
      notes: {
        ...defaultImmersionPanels.notes,
        x: 1120,
        y: 40,
        w: 340,
        h: 540,
      },
    },
  },
];

const STUDY_ITEM_NOTE_TYPES = new Set(["note", "drawing"]);

const createCollaborationId = (prefix) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createEmptyCollaboration = () => ({
  profile: {
    id: "local-user",
    name: "Você",
    email: "",
    avatarUrl: "",
  },
  workspaces: [
    {
      id: "personal-space",
      name: "Meu StudyHub",
      description: "Espaço pessoal",
      kind: "personal",
      ownerId: "local-user",
      createdAt: Date.now(),
    },
  ],
  members: [
    {
      id: "member-local-user",
      workspaceId: "personal-space",
      userId: "local-user",
      name: "Você",
      email: "",
      role: "owner",
      status: "active",
      joinedAt: Date.now(),
    },
  ],
  shares: [],
  invitations: [],
  activity: [],
  sync: {
    provider: "local",
    status: "offline",
    lastSyncedAt: null,
    pendingChanges: 0,
  },
});

const sortStudyItems = (items) =>
  [...items].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) {
      return a.pinned ? -1 : 1;
    }
    return (
      (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0)
    );
  });

const filterOutLinkedItems = (items = [], { courseIds = new Set(), moduleIds = new Set(), lessonIds = new Set() }) => {
  return items.filter((item) => {
    if (item.courseId && courseIds.has(item.courseId)) return false;
    if (item.sourceCourseId && courseIds.has(item.sourceCourseId)) return false;

    if (item.moduleId && moduleIds.has(item.moduleId)) return false;
    if (item.sourceModuleId && moduleIds.has(item.sourceModuleId)) return false;

    if (item.lessonId && lessonIds.has(item.lessonId)) return false;
    if (item.sourceLessonId && lessonIds.has(item.sourceLessonId)) return false;
    if (lessonIds.has(item.id)) return false;

    return true;
  });
};

const inferStudyItemType = (item = {}) => {
  if (item.itemType) return item.itemType;
  if (item.type && STUDY_ITEM_NOTE_TYPES.has(item.type)) return item.type;
  if (item.noteType === "drawing") return "drawing";
  return "note";
};

const inferStudyItemLibrarySection = (itemType, sourceKind) => {
  if (itemType === "drawing") {
    return sourceKind === "quick-draw" ? "quick-drawings" : "drawings";
  }
  if (sourceKind === "quick-note") return "quick-notes";
  return "notes";
};

const normalizeStudyItem = (item = {}) => {
  const now = Date.now();
  const itemType = inferStudyItemType(item);
  const sourceKind =
    item.sourceKind || (itemType === "drawing" ? "drawing-note" : "note");

  return {
    id: item.id || `study-item-${now}`,
    itemType,
    type: itemType,
    noteType: itemType === "drawing" ? "drawing" : item.noteType || "note",
    sourceKind,
    librarySection:
      item.librarySection || inferStudyItemLibrarySection(itemType, sourceKind),
    isArchived: Boolean(item.isArchived),
    pinned: Boolean(item.pinned),
    accent: item.accent || "primary",
    title:
      item.title ??
      (itemType === "drawing"
        ? sourceKind === "quick-draw"
          ? "Desenho rapido"
          : "Desenho"
        : sourceKind === "quick-note"
          ? "Nota rapida"
          : "Anotacao"),
    content: item.content || "",
    drawings: item.drawings || [],
    category:
      item.category ||
      (itemType === "drawing"
        ? "Desenho"
        : sourceKind === "quick-note"
          ? "Nota rapida"
          : "Anotacao Livre"),
    module: item.module || "Geral",
    tags: item.tags || [],
    time: item.time || "Agora",
    timestamp: item.timestamp ?? null,
    sourceCourseId: item.sourceCourseId || null,
    sourceModuleId: item.sourceModuleId || null,
    sourceLessonId: item.sourceLessonId || null,
    sourceLessonTitle: item.sourceLessonTitle || "",
    createdAt: item.createdAt || now,
    updatedAt: item.updatedAt || item.createdAt || now,
    displaySettings: item.displaySettings || {
      maxWidth: "standard", // 'standard' (920px) ou 'full' (100%)
      lineMarking: "none", // 'none', 'ruled', 'grid'
      pageLayout: "infinite", // 'infinite', 'paged'
    },
    metadata: item.metadata || {},
    reference: item.reference || {},
    path: item.path || "",
    markdownContent: item.markdownContent || "",
    ...item,
    itemType,
    type: itemType,
    noteType: itemType === "drawing" ? "drawing" : item.noteType || "note",
    sourceKind,
  };
};

const deriveLegacyNotes = (studyItems = []) => {
  const list = sortStudyItems(
    studyItems.filter(
      (item) => STUDY_ITEM_NOTE_TYPES.has(item.itemType) && !item.isArchived,
    ),
  );

  return {
    totalNotes: list.length,
    totalModules: 1,
    list,
  };
};

const migrateStudyItems = (state) => {
  if (Array.isArray(state?.studyItems) && state.studyItems.length > 0) {
    return sortStudyItems(state.studyItems.map(normalizeStudyItem));
  }

  const legacyNotes = Array.isArray(state?.notes?.list) ? state.notes.list : [];
  return sortStudyItems(legacyNotes.map(normalizeStudyItem));
};

const migrateAcademicContexts = (state = {}) => {
  const academic = normalizeAcademicData(state.academic);
  const subjectByCourse = new Map();
  for (const subject of academic.subjects) {
    for (const courseId of subject.linkedCourseIds || []) {
      if (!subjectByCourse.has(courseId))
        subjectByCourse.set(courseId, subject);
    }
  }
  const contextFor = (item = {}) => {
    const explicitId = item.academicSubjectId || item.subjectId;
    const explicitSubject = academic.subjects.find(
      (subject) => subject.id === explicitId,
    );
    if (!explicitSubject && item.academicContextExplicit) return item;
    const courseId =
      item.sourceCourseId || item.courseId || item.context?.courseId || null;
    const subject = explicitSubject || subjectByCourse.get(courseId);
    if (!subject) return item;
    return {
      ...item,
      academicSubjectId: subject.id,
      academicSemesterId: subject.semesterId,
    };
  };
  const tasks = (state.tasks?.list || []).map(contextFor);
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const lessonCourse = new Map(
    (state.courses || []).flatMap((course) =>
      (course.modules || []).flatMap((module) =>
        (module.lessons || []).map((lesson) => [lesson.id, course.id]),
      ),
    ),
  );
  const focusSessions = (state.focusSessions || []).map((session) => {
    if (session.academicSubjectId) return session;
    const task = taskById.get(session.taskId);
    if (task?.academicSubjectId) {
      return {
        ...session,
        academicSubjectId: task.academicSubjectId,
        academicSemesterId: task.academicSemesterId,
      };
    }
    const subject = subjectByCourse.get(lessonCourse.get(session.lessonId));
    return subject
      ? {
          ...session,
          academicSubjectId: subject.id,
          academicSemesterId: subject.semesterId,
        }
      : session;
  });
  return {
    academic,
    studyItems: (state.studyItems || []).map(contextFor),
    tasks: { ...(state.tasks || {}), list: tasks },
    flashcardDecks: (state.flashcardDecks || []).map(contextFor),
    focusSessions,
  };
};

export const DEFAULT_KNOWLEDGE_ITEMS = [];

export const useStudyStore = create(
  persist(
    (set) => ({
      courses: [],
      flashcardDecks: [],
      flashcardReviewHistory: [],
      noteTemplates: [
        {
          id: "template-1",
          title: "Método Cornell",
          description: "Estrutura clássica de Palavras-chave, Notas e Resumo.",
          icon: "view_agenda",
          content:
            "<h2>Tópico: </h2><p></p><hr><h3>Palavras-chave</h3><ul><li>...</li></ul><hr><h3>Anotações</h3><ul><li>...</li></ul><hr><h3>Resumo</h3><p>...</p>",
        },
        {
          id: "template-2",
          title: "Perguntas e Respostas",
          description: "Ótimo para estudos dinâmicos e preparação para provas.",
          icon: "question_answer",
          content:
            "<h2>Q: Qual é a pergunta?</h2><p><strong>R: </strong>A resposta é...</p><hr><h2>Q: Qual é a próxima?</h2><p><strong>R: </strong>...</p>",
        },
      ],
      studyItems: [],
      notes: { totalNotes: 0, list: [] },
      tasks: { list: [] },
      habits: { list: [] },
      books: { list: [] },
      activeBookId: null,
      noteVersions: [],
      focusSessions: [],
      studyPlans: [],
      importTransactions: [],
      academic: createEmptyAcademicData(),
      collaboration: createEmptyCollaboration(),
      journalEntries: [],
      importantQuotes: [],
      journalSettings: DEFAULT_JOURNAL_SETTINGS,
      dashboard: { progress: 0, activity: [] },
      dashboardQuickNote: "",
      dashboardQuickNotes: [],
      dashboardWidgets: DEFAULT_DASHBOARD_WIDGETS,
      dailyFocusGoalMinutes: 50,
      waterTracker: {
        date: "",
        targetMl: 2000,
        consumedMl: 0,
        updatedAt: 0,
      },

      activeCourseId: null,
      activeModuleId: null,
      activeLessonId: null,
      activeWorkId: null,
      activeDeckId: null,
      activeNoteId: null,
      // Obsidian-style notes vault state
      activeVaultId: "global", // ID of the currently active notes vault
      customVaults: [],        // User-created custom vaults [{ id, name, icon, color, description, createdAt }]
      vaultFolders: [],        // Array of { id, name, path, parentId, vaultId, createdAt }
      openTabs: [],            // Array of { id, title, isDirty, pinned, itemType }
      activeTabId: null,       // ID of the active tab
      vaultSearchQuery: "",    // Current search in vault explorer  
      activeTag: null,         // Currently active tag filter
      vocabulary: {}, // Record<string, "seen" | "learning">
      activeSidePanel: "backlinks",  // "backlinks" | "graph" | "ai" | "tags" | null
      editorViewMode: "live",  // "live" | "source" | "preview" | "split"
      activeTaskId: null,
      activeProjectId: null,
      activeAcademicSubjectId: null,
      activeJournalEntryId: null,
      quickNoteTemplateId: null,
      quickNoteShortcut: "CommandOrControl+Shift+Alt+1",
      quickDrawShortcut: "CommandOrControl+Shift+Alt+2",
      translatorTextShortcut: "CommandOrControl+Shift+Alt+3",
      translatorOcrShortcut: "CommandOrControl+Shift+Alt+4",
      aiFlashcardShortcut: "CommandOrControl+Shift+Alt+5",
      immersionPresets: defaultImmersionPresets,
      immersionStepIndex: 0,
      immersionMediaTime: 0,
      immersionSeekTo: null,
      isDarkMode: false,
      themePreference: "system",
      sidebarOrder: [
        "dashboard",
        "courses",
        "projects",
        "books",
        "materials",
        "journal",
        "knowledge",
        "reviews",
      ],
      sidebarHiddenItems: [],
      sidebarQuickActions: ["calendar", "tasks", "pomodoro"],
      knowledgeItems: DEFAULT_KNOWLEDGE_ITEMS,
      activeKnowledgeItemId: null,
      appSettings: {
        notificationsEnabled: true,
        soundEnabled: true,
        pomodoroAutoBreak: false,
        taskDueReminders: true,
      },
      isSettingsModalOpen: false,
      settingsModalInitialTab: "sidebar",
      favoriteCommands: [
        "command-today-Abrir tela Hoje (Dashboard)",
        "command-note_editor-Criar nova nota",
        "command-pomodoro-Iniciar Pomodoro (25 min)",
        "command-flashcards-Revisar cartões e flashcards (Anki)",
      ],
      favoriteSlashCommands: ["h1", "bullet", "table", "callout_tip", "code", "mermaid"],

      // Vocabulary Actions
      toggleWordStatus: (word) => set((state) => {
        const vocab = { ...(state.vocabulary || {}) };
        const cleanWord = String(word).trim().toLowerCase();
        if (!cleanWord) return state;
        
        const currentStatus = vocab[cleanWord];
        if (currentStatus === "seen") {
          vocab[cleanWord] = "learning";
        } else if (currentStatus === "learning") {
          delete vocab[cleanWord];
        } else {
          vocab[cleanWord] = "seen";
        }
        
        return { vocabulary: vocab };
      }),
      markWordAsSeen: (word) => set((state) => {
        const vocab = { ...(state.vocabulary || {}) };
        const cleanWord = String(word).trim().toLowerCase();
        if (cleanWord) vocab[cleanWord] = "seen";
        return { vocabulary: vocab };
      }),

      // Actions
      addWaterIntake: (amountMl = 250) => set((state) => {
        const todayKey = getLocalDateKey();
        const existingTarget = state.waterTracker?.targetMl || 2000;
        const existingCup = state.waterTracker?.cupSizeMl || 250;
        const existingBottle = state.waterTracker?.bottleSizeMl || 500;

        const current = state.waterTracker && state.waterTracker.date === todayKey
          ? state.waterTracker
          : {
              ...(state.waterTracker || {}),
              date: todayKey,
              targetMl: existingTarget,
              cupSizeMl: existingCup,
              bottleSizeMl: existingBottle,
              consumedMl: 0,
            };

        const normalizedAmount = Number(amountMl);
        if (!Number.isFinite(normalizedAmount) || normalizedAmount === 0) return state;
        const now = Date.now();
        const isDuplicateAction =
          Number(current.lastIntakeAmount) === normalizedAmount &&
          now - Number(current.lastIntakeAt || 0) < 800;
        if (isDuplicateAction) return state;
        const newConsumed = Math.max(0, Number(current.consumedMl || 0) + normalizedAmount);
        return {
          waterTracker: {
            ...current,
            date: todayKey,
            consumedMl: newConsumed,
            lastIntakeAmount: normalizedAmount,
            lastIntakeAt: now,
            updatedAt: now,
          }
        };
      }),
      resetWaterIntake: () => set((state) => {
        const todayKey = getLocalDateKey();
        return {
          waterTracker: {
            ...(state.waterTracker || {}),
            date: todayKey,
            targetMl: state.waterTracker?.targetMl || 2000,
            cupSizeMl: state.waterTracker?.cupSizeMl || 250,
            bottleSizeMl: state.waterTracker?.bottleSizeMl || 500,
            consumedMl: 0,
            updatedAt: Date.now(),
          }
        };
      }),
      setWaterTarget: (targetMl) => set((state) => {
        const todayKey = getLocalDateKey();
        let parsed = parseFloat(String(targetMl).replace(/[^\d.]/g, ""));
        if (!Number.isFinite(parsed) || parsed <= 0) parsed = 2000;
        if (parsed <= 15) parsed = parsed * 1000;
        const validTarget = Math.max(500, Math.min(15000, Math.round(parsed)));

        const current = state.waterTracker && state.waterTracker.date === todayKey
          ? state.waterTracker
          : {
              ...(state.waterTracker || {}),
              date: todayKey,
              targetMl: validTarget,
              consumedMl: 0,
            };
        return {
          waterTracker: {
            ...current,
            targetMl: validTarget,
            date: todayKey,
            updatedAt: Date.now(),
          }
        };
      }),
      updateWaterSettings: (newSettings = {}) => set((state) => {
        const todayKey = getLocalDateKey();
        let rawTarget = newSettings.targetMl;
        let parsedTarget = parseFloat(String(rawTarget).replace(/[^\d.]/g, ""));
        if (!Number.isFinite(parsedTarget) || parsedTarget <= 0) {
          parsedTarget = state.waterTracker?.targetMl || 2000;
        } else if (parsedTarget <= 15) {
          parsedTarget = parsedTarget * 1000;
        }
        const validTarget = Math.max(500, Math.min(15000, Math.round(parsedTarget)));

        const current = state.waterTracker && state.waterTracker.date === todayKey
          ? state.waterTracker
          : {
              ...(state.waterTracker || {}),
              date: todayKey,
              consumedMl: 0,
            };
        return {
          waterTracker: {
            ...current,
            ...newSettings,
            targetMl: validTarget,
            cupSizeMl: Number(newSettings.cupSizeMl) || current.cupSizeMl || 250,
            bottleSizeMl: Number(newSettings.bottleSizeMl) || current.bottleSizeMl || 500,
            date: todayKey,
            updatedAt: Date.now(),
          }
        };
      }),
      addJournalEntry: (entry = {}) => {
        const now = Date.now();
        const id =
          String(entry.id || "").trim() ||
          `journal-${now}-${Math.random().toString(36).slice(2, 8)}`;
        const journalEntry = normalizeJournalEntry({
          ...entry,
          id,
          createdAt: entry.createdAt || now,
          updatedAt: now,
        });
        set((state) => ({
          journalEntries: normalizeJournalEntries([
            journalEntry,
            ...(state.journalEntries || []),
          ]),
          activeJournalEntryId: id,
        }));
        return id;
      },
      updateJournalEntry: (entryId, updates = {}) =>
        set((state) => ({
          journalEntries: normalizeJournalEntries(
            (state.journalEntries || []).map((entry) =>
              entry.id === entryId
                ? normalizeJournalEntry({
                    ...entry,
                    ...updates,
                    id: entry.id,
                    createdAt: entry.createdAt,
                    updatedAt: Date.now(),
                  })
                : entry,
            ),
          ),
        })),
      deleteJournalEntry: (entryId) =>
        set((state) => ({
          journalEntries: (state.journalEntries || []).filter(
            (entry) => entry.id !== entryId,
          ),
          activeJournalEntryId:
            state.activeJournalEntryId === entryId
              ? null
              : state.activeJournalEntryId,
        })),
      toggleJournalFavorite: (entryId) =>
        set((state) => ({
          journalEntries: normalizeJournalEntries(
            (state.journalEntries || []).map((entry) =>
              entry.id === entryId
                ? { ...entry, favorite: !entry.favorite, updatedAt: Date.now() }
                : entry,
            ),
          ),
        })),
      updateJournalSettings: (updates = {}) =>
        set((state) => ({
          journalSettings: normalizeJournalSettings({
            ...state.journalSettings,
            ...updates,
          }),
        })),
      addImportantQuote: (text) => {
        const val = String(text || "").trim();
        if (!val) return;
        set((state) => {
          const existing = state.importantQuotes || [];
          if (existing.some((q) => q.text === val)) return state;
          const newQuote = normalizeImportantQuote({ text: val });
          return { importantQuotes: [...existing, newQuote] };
        });
      },
      removeImportantQuote: (id) =>
        set((state) => ({
          importantQuotes: (state.importantQuotes || []).filter((q) => q.id !== id),
        })),
      setDashboardQuickNote: (text) => set({ dashboardQuickNote: text }),
      addDashboardQuickNote: (note = {}) => {
        const id = note.id || `dashboard-note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        set((state) => {
          const dashboardQuickNotes = [
            ...migrateDashboardQuickNotes(state),
            {
              id,
              title: note.title || "Nova anotação",
              content: note.content || "",
              x: Number(note.x || 0),
              y: Number(note.y || 0),
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ];
          return {
            dashboardQuickNotes,
            dashboardWidgets: ensureQuickNoteWidgets(state.dashboardWidgets, dashboardQuickNotes),
          };
        });
        return id;
      },
      updateDashboardQuickNote: (noteId, updates) =>
        set((state) => ({
          dashboardQuickNotes: migrateDashboardQuickNotes(state).map((note) =>
            note.id === noteId
              ? { ...note, ...updates, id: note.id, updatedAt: Date.now() }
              : note,
          ),
        })),
      deleteDashboardQuickNote: (noteId) =>
        set((state) => {
          const dashboardQuickNotes = migrateDashboardQuickNotes(state).filter(
            (note) => note.id !== noteId,
          );
          return {
            dashboardQuickNotes,
            dashboardWidgets: ensureQuickNoteWidgets(state.dashboardWidgets, dashboardQuickNotes),
          };
        }),
      moveDashboardWidget: (sourceId, targetId) =>
        set((state) => {
          const widgets = normalizeDashboardWidgets(state.dashboardWidgets);
          const sourceIndex = widgets.findIndex((widget) => widget.id === sourceId);
          const targetIndex = widgets.findIndex((widget) => widget.id === targetId);
          if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return state;
          const next = [...widgets];
          const [moved] = next.splice(sourceIndex, 1);
          next.splice(targetIndex, 0, moved);
          return { dashboardWidgets: next };
        }),
      setDashboardWidgetSize: (widgetId, size) =>
        set((state) => {
          const widgets = normalizeDashboardWidgets(state.dashboardWidgets);
          const source = widgets.find((widget) => widget.id === widgetId);
          if (!source) return state;
          const nextSize = [4, 6, 8, 12].includes(Number(size)) ? Number(size) : source.size;
          const candidate = { ...source, size: nextSize, x: Math.min(Number(source.x || 0), 12 - nextSize) };
          return {
            dashboardWidgets: resolveDashboardWidgetCollisions(
              widgets,
              widgetId,
              candidate,
            ),
          };
        }),
      setDashboardWidgetHeight: (widgetId, rowSpan) =>
        set((state) => {
          const widgets = normalizeDashboardWidgets(state.dashboardWidgets);
          const source = widgets.find((widget) => widget.id === widgetId);
          if (!source) return state;
          const candidate = { ...source, rowSpan: Math.max(2, Math.min(10, Number(rowSpan) || source.rowSpan || 3)) };
          return {
            dashboardWidgets: resolveDashboardWidgetCollisions(
              widgets,
              widgetId,
              candidate,
            ),
          };
        }),
      positionDashboardWidget: (widgetId, x, y) =>
        set((state) => {
          const widgets = normalizeDashboardWidgets(state.dashboardWidgets);
          const source = widgets.find((widget) => widget.id === widgetId);
          if (!source) return state;
          const nextX = Math.max(0, Math.min(12 - Number(source.size || 12), Number(x) || 0));
          const nextY = Math.max(0, Number(y) || 0);
          const candidate = { ...source, x: nextX, y: nextY };
          return {
            dashboardWidgets: resolveDashboardWidgetCollisions(
              widgets,
              widgetId,
              candidate,
              { x: Number(source.x || 0), y: Number(source.y || 0) },
            ),
          };
        }),
      toggleDashboardWidget: (widgetId) =>
        set((state) => {
          const widgets = normalizeDashboardWidgets(state.dashboardWidgets);
          const target = widgets.find((widget) => widget.id === widgetId);
          if (!target) return state;
          if (target.visible !== false) {
            return {
              dashboardWidgets: widgets.map((widget) =>
                widget.id === widgetId ? { ...widget, visible: false } : widget,
              ),
            };
          }
          const occupied = widgets.filter(
            (widget) => widget.id !== widgetId && widget.visible !== false,
          );
          const visibleTarget = findFreeDashboardWidgetPosition(
            { ...target, visible: true },
            occupied,
            target,
          );
          return {
            dashboardWidgets: widgets.map((widget) =>
              widget.id === widgetId ? visibleTarget : widget,
            ),
          };
        }),
      resetDashboardWidgets: () =>
        set((state) => ({
          dashboardWidgets: ensureQuickNoteWidgets(
            DEFAULT_DASHBOARD_WIDGETS.map((widget) => ({ ...widget })),
            migrateDashboardQuickNotes(state),
          ),
        })),
      toggleDarkMode: () => set((state) => ({ isDarkMode: !state.isDarkMode })),
      setThemePreference: (preference) => set((state) => {
        const darkThemes = [
          "dark",
          "midnight-oled",
          "dracula",
          "catppuccin-mocha",
          "tokyo-night",
          "nord",
          "matcha-forest",
          "rose-pine",
          "cyber-matrix",
        ];
        const lightThemes = [
          "light",
          "catppuccin-latte",
          "rose-pine-dawn",
          "matcha-latte",
          "nord-light",
          "tokyo-day",
          "ocean-breeze",
          "solarized-light",
          "warm-sepia",
        ];
        const validThemes = ["system", ...lightThemes, ...darkThemes];
        const nextPref = validThemes.includes(preference) ? preference : "system";
        const isDark = darkThemes.includes(nextPref);
        const isLight = lightThemes.includes(nextPref);
        return {
          themePreference: nextPref,
          isDarkMode: isDark ? true : isLight ? false : state.isDarkMode,
        };
      }),
      setActiveCourse: (id) => set({ activeCourseId: id }),
      setActiveModule: (id) => set({ activeModuleId: id }),
      setActiveLesson: (id) => set({ activeLessonId: id }),
      setActiveDeck: (id) => set({ activeDeckId: id }),
      setActiveNote: (id) => set({ activeNoteId: id }),
      setActiveTask: (id) => set({ activeTaskId: id || null }),
      setActiveProject: (id) => set({ activeProjectId: id || null }),
      setActiveAcademicSubject: (id) =>
        set({ activeAcademicSubjectId: id || null }),
      setActiveJournalEntry: (id) =>
        set({ activeJournalEntryId: id || null }),
      updateCollaborationProfile: (updates) =>
        set((state) => ({
          collaboration: {
            ...createEmptyCollaboration(),
            ...(state.collaboration || {}),
            profile: {
              ...createEmptyCollaboration().profile,
              ...(state.collaboration?.profile || {}),
              ...updates,
            },
          },
        })),
      createCollaborationWorkspace: (workspaceData = {}) => {
        const workspaceId = workspaceData.id || createCollaborationId("space");
        set((state) => {
          const collaboration = {
            ...createEmptyCollaboration(),
            ...(state.collaboration || {}),
          };
          const now = Date.now();
          const workspace = {
            id: workspaceId,
            name: String(workspaceData.name || "Novo espaço").trim() || "Novo espaço",
            description: String(workspaceData.description || "").trim(),
            kind: "shared",
            ownerId: collaboration.profile?.id || "local-user",
            createdAt: now,
            updatedAt: now,
            ...workspaceData,
            id: workspaceId,
          };
          return {
            collaboration: {
              ...collaboration,
              workspaces: [workspace, ...(collaboration.workspaces || [])],
              members: [
                {
                  id: createCollaborationId("member"),
                  workspaceId,
                  userId: collaboration.profile?.id || "local-user",
                  name: collaboration.profile?.name || "Você",
                  email: collaboration.profile?.email || "",
                  role: "owner",
                  status: "active",
                  joinedAt: now,
                },
                ...(collaboration.members || []),
              ],
            },
          };
        });
        return workspaceId;
      },
      createShareInvitation: ({
        entityType,
        entityId,
        title,
        permission = "viewer",
        email = "",
        workspaceId = "personal-space",
      } = {}) => {
        const invitationId = createCollaborationId("invite");
        set((state) => {
          const base = createEmptyCollaboration();
          const collaboration = {
            ...base,
            ...(state.collaboration || {}),
          };
          const now = Date.now();
          const invite = {
            id: invitationId,
            workspaceId,
            entityType: String(entityType || "item"),
            entityId: String(entityId || ""),
            title: String(title || "Conteúdo compartilhado"),
            email: String(email || "").trim().toLowerCase(),
            permission: ["viewer", "commenter", "editor"].includes(permission)
              ? permission
              : "viewer",
            status: "pending",
            createdAt: now,
            expiresAt: now + 7 * 24 * 60 * 60 * 1000,
          };
          const share = {
            id: createCollaborationId("share"),
            workspaceId,
            entityType: invite.entityType,
            entityId: invite.entityId,
            title: invite.title,
            permission: invite.permission,
            targetEmail: invite.email,
            status: "pending-server",
            createdAt: now,
            updatedAt: now,
          };
          return {
            collaboration: {
              ...collaboration,
              shares: [share, ...(collaboration.shares || [])],
              invitations: [invite, ...(collaboration.invitations || [])],
              activity: [
                {
                  id: createCollaborationId("activity"),
                  type: "share_created",
                  title: `Convite criado para ${invite.title}`,
                  entityType: invite.entityType,
                  entityId: invite.entityId,
                  createdAt: now,
                },
                ...(collaboration.activity || []),
              ].slice(0, 200),
            },
          };
        });
        return invitationId;
      },
      revokeShareInvitation: (invitationId) =>
        set((state) => {
          const collaboration = {
            ...createEmptyCollaboration(),
            ...(state.collaboration || {}),
          };
          const invite = (collaboration.invitations || []).find(
            (item) => item.id === invitationId,
          );
          return {
            collaboration: {
              ...collaboration,
              invitations: (collaboration.invitations || []).map((item) =>
                item.id === invitationId
                  ? { ...item, status: "revoked", revokedAt: Date.now() }
                  : item,
              ),
              shares: (collaboration.shares || []).map((item) =>
                item.id === invite?.shareId ||
                (invite && item.entityId === invite.entityId && item.targetEmail === invite.email)
                  ? { ...item, status: "revoked", updatedAt: Date.now() }
                  : item,
              ),
            },
          };
        }),
      updateSharedPermission: (sharedEntityId, permission, status = "accepted") =>
        set((state) => {
          const readOnly = permission !== "editor" || status === "revoked";
          const matches = (item) =>
            String(item?.sharedEntityId || "") === String(sharedEntityId || "");
          const update = (item) =>
            matches(item)
              ? {
                  ...item,
                  sharingPermission: permission || "viewer",
                  sharedReadOnly: readOnly,
                  sharingStatus: status,
                  sharingUpdatedAt: Date.now(),
                }
              : item;
          const academic = normalizeAcademicData(state.academic);
          return {
            studyItems: state.studyItems.map(update),
            notes: { ...state.notes, list: state.notes.list.map(update) },
            tasks: { ...state.tasks, list: state.tasks.list.map(update) },
            courses: state.courses.map(update),
            flashcardDecks: state.flashcardDecks.map(update),
            academic: {
              ...academic,
              subjects: academic.subjects.map(update),
              projects: academic.projects.map(update),
              resources: academic.resources.map(update),
            },
          };
        }),
      addAcademicSemester: (semester) =>
        set((state) => {
          const academic = normalizeAcademicData(state.academic);
          const now = Date.now();
          const requestedId = String(semester.id || "").trim();
          const id =
            requestedId &&
            !academic.semesters.some((item) => item.id === requestedId)
              ? requestedId
              : `semester-${now}-${Math.random().toString(36).slice(2, 7)}`;
          const nextSemester = {
            id,
            name:
              String(semester.name || "Novo semestre").trim() ||
              "Novo semestre",
            startDate: semester.startDate || "",
            endDate: semester.endDate || "",
            status: semester.status || "active",
            createdAt: now,
            updatedAt: now,
          };
          return {
            academic: {
              ...academic,
              semesters: [nextSemester, ...academic.semesters],
              activeSemesterId: id,
              semester: nextSemester,
            },
          };
        }),
      setActiveAcademicSemester: (semesterId) =>
        set((state) => {
          const academic = normalizeAcademicData(state.academic);
          const semester = academic.semesters.find(
            (item) => item.id === semesterId,
          );
          if (!semester) return state;
          return {
            academic: {
              ...academic,
              activeSemesterId: semester.id,
              semester,
            },
          };
        }),
      updateAcademicSemester: (semesterIdOrUpdates, maybeUpdates) =>
        set((state) => {
          const academic = normalizeAcademicData(state.academic);
          const semesterId =
            typeof semesterIdOrUpdates === "string"
              ? semesterIdOrUpdates
              : academic.activeSemesterId;
          const updates =
            typeof semesterIdOrUpdates === "string"
              ? maybeUpdates || {}
              : semesterIdOrUpdates || {};
          const semesters = academic.semesters.map((semester) =>
            semester.id === semesterId
              ? {
                  ...semester,
                  ...updates,
                  id: semester.id,
                  updatedAt: Date.now(),
                }
              : semester,
          );
          const activeSemester =
            semesters.find(
              (semester) => semester.id === academic.activeSemesterId,
            ) || semesters[0];
          return {
            academic: {
              ...academic,
              semesters,
              activeSemesterId: activeSemester.id,
              semester: activeSemester,
            },
          };
        }),
      addAcademicEntity: (collection, entity) =>
        set((state) => {
          if (!ACADEMIC_COLLECTIONS.includes(collection)) return state;
          const academic = normalizeAcademicData(state.academic);
          const semesterId = academic.semesters.some(
            (semester) => semester.id === entity.semesterId,
          )
            ? entity.semesterId
            : academic.activeSemesterId;
          return {
            academic: {
              ...academic,
              [collection]: [
                {
                  id:
                    entity.id ||
                    `${collection}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                  ...entity,
                  semesterId,
                },
                ...academic[collection],
              ],
            },
          };
        }),
      updateAcademicEntity: (collection, entityId, updates) =>
        set((state) => {
          if (!ACADEMIC_COLLECTIONS.includes(collection)) return state;
          const academic = normalizeAcademicData(state.academic);
          const current = academic[collection].find((entity) => entity.id === entityId);
          if (isReadOnlySharedItem(current)) return state;
          return {
            academic: {
              ...academic,
              [collection]: academic[collection].map((entity) =>
                entity.id === entityId
                  ? { ...entity, ...updates, updatedAt: Date.now() }
                  : entity,
              ),
            },
          };
        }),
      deleteAcademicEntity: (collection, entityId) =>
        set((state) => {
          if (!ACADEMIC_COLLECTIONS.includes(collection)) return state;
          const academic = normalizeAcademicData(state.academic);
          const current = academic[collection].find((entity) => entity.id === entityId);
          if (isReadOnlySharedItem(current)) return state;
          if (collection === "subjects") {
            return {
              academic: {
                ...academic,
                subjects: academic.subjects.map((subject) =>
                  subject.id === entityId
                    ? {
                        ...subject,
                        isArchived: true,
                        archivedAt: Date.now(),
                        updatedAt: Date.now(),
                      }
                    : subject,
                ),
              },
              activeAcademicSubjectId:
                state.activeAcademicSubjectId === entityId
                  ? null
                  : state.activeAcademicSubjectId,
            };
          }
          const nextAcademic = {
            ...academic,
            [collection]: academic[collection].filter(
              (entity) => entity.id !== entityId,
            ),
          };
          return {
            academic: nextAcademic,
            activeProjectId:
              collection === "projects" && state.activeProjectId === entityId
                ? null
                : state.activeProjectId,
          };
        }),
      restoreAcademicSubject: (subjectId) =>
        set((state) => {
          const academic = normalizeAcademicData(state.academic);
          return {
            academic: {
              ...academic,
              subjects: academic.subjects.map((subject) =>
                subject.id === subjectId
                  ? {
                      ...subject,
                      isArchived: false,
                      archivedAt: null,
                      updatedAt: Date.now(),
                    }
                  : subject,
              ),
            },
          };
        }),
      purgeAcademicSubject: (subjectId) =>
        set((state) => {
          const academic = normalizeAcademicData(state.academic);
          const nextAcademic = {
            ...academic,
            subjects: academic.subjects.filter(
              (subject) => subject.id !== subjectId,
            ),
          };
          for (const key of ACADEMIC_COLLECTIONS) {
            if (key === "subjects") continue;
            nextAcademic[key] = nextAcademic[key].filter(
              (entity) => entity.subjectId !== subjectId,
            );
          }
          return {
            academic: nextAcademic,
            activeAcademicSubjectId:
              state.activeAcademicSubjectId === subjectId
                ? null
                : state.activeAcademicSubjectId,
          };
        }),
      setAcademicStudyPreferences: (updates) =>
        set((state) => {
          const academic = normalizeAcademicData(state.academic);
          return {
            academic: {
              ...academic,
              studyPreferences: {
                ...academic.studyPreferences,
                ...updates,
              },
            },
          };
        }),
      setAcademicAiSourcePermissions: (subjectId, permissions) =>
        set((state) => {
          const academic = normalizeAcademicData(state.academic);
          return {
            academic: {
              ...academic,
              aiSourcePermissions: [
                ...academic.aiSourcePermissions.filter(
                  (permission) => permission.subjectId !== subjectId,
                ),
                ...permissions.map((permission) => ({
                  ...permission,
                  subjectId,
                  grantedAt: permission.grantedAt || Date.now(),
                })),
              ],
            },
          };
        }),
      setAcademicAiChatHistory: (subjectId, history) =>
        set((state) => {
          const academic = normalizeAcademicData(state.academic);
          return {
            academic: {
              ...academic,
              aiChatHistories: {
                ...(academic.aiChatHistories || {}),
                [subjectId]: history,
              },
            },
          };
        }),
      replaceAcademicStudySessions: (examId, sessions) =>
        set((state) => {
          const academic = normalizeAcademicData(state.academic);
          return {
            academic: {
              ...academic,
              studySessions: [
                ...academic.studySessions.filter(
                  (session) => session.examId !== examId,
                ),
                ...sessions,
              ],
            },
          };
        }),
      addFocusSession: (session) =>
        set((state) => {
          const sessionId = session.id || `focus-${Date.now()}`;
          if (state.focusSessions.some((item) => item.id === sessionId)) {
            return state;
          }
          const task = state.tasks?.list?.find(
            (item) => item.id === session.taskId,
          );
          const academicSubjectId =
            session.academicSubjectId ||
            task?.academicSubjectId ||
            task?.subjectId ||
            null;
          const subject = normalizeAcademicData(state.academic).subjects.find(
            (item) => item.id === academicSubjectId,
          );
          return {
            focusSessions: [
              {
                id: sessionId,
                status: "completed",
                plannedSeconds: 0,
                actualSeconds: 0,
                startedAt: Date.now(),
                ...session,
                academicSubjectId: academicSubjectId || null,
                academicSemesterId:
                  session.academicSemesterId ||
                  task?.academicSemesterId ||
                  subject?.semesterId ||
                  null,
              },
              ...state.focusSessions,
            ].slice(0, 500),
          };
        }),
      updateFocusSession: (id, updates) =>
        set((state) => ({
          focusSessions: state.focusSessions.map((item) =>
            item.id === id ? { ...item, ...updates } : item,
          ),
        })),
      // Remove all focus session history
      clearFocusSessions: () => set(() => ({ focusSessions: [] })),
      addStudyPlan: (plan) =>
        set((state) => ({
          studyPlans: [
            ...state.studyPlans,
            {
              id:
                plan.id ||
                `plan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              createdAt: Date.now(),
              ...plan,
            },
          ],
        })),
      replaceStudyPlans: (plans) => set({ studyPlans: plans }),
      addImportTransaction: (transaction) =>
        set((state) => ({
          importTransactions: [
            {
              id: transaction.id || `import-${Date.now()}`,
              createdAt: Date.now(),
              ...transaction,
            },
            ...state.importTransactions,
          ].slice(0, 20),
        })),
      removeImportTransaction: (id) =>
        set((state) => ({
          importTransactions: state.importTransactions.filter(
            (item) => item.id !== id,
          ),
        })),
      undoImportTransaction: (id) =>
        set((state) => {
          const transaction = state.importTransactions.find(
            (item) => item.id === id,
          );
          if (!transaction?.beforeCourses) return state;
          return {
            courses: transaction.beforeCourses,
            importTransactions: state.importTransactions.filter(
              (item) => item.id !== id,
            ),
          };
        }),
      addNoteVersion: (noteId, content, title = "") =>
        set((state) => ({
          noteVersions: [
            {
              id: `note-version-${Date.now()}`,
              noteId,
              content,
              title,
              createdAt: Date.now(),
            },
            ...state.noteVersions,
          ].slice(0, 500),
        })),
      restoreNoteVersion: (noteId, versionId) =>
        set((state) => {
          const version = state.noteVersions.find(
            (item) => item.id === versionId && item.noteId === noteId,
          );
          if (!version) return state;
          const nextItems = sortStudyItems(
            state.studyItems.map((item) =>
              item.id === noteId
                ? {
                    ...item,
                    title: version.title || item.title,
                    content: version.content,
                    updatedAt: Date.now(),
                  }
                : item,
            ),
          );
          return { studyItems: nextItems, notes: deriveLegacyNotes(nextItems) };
        }),
      setQuickNoteTemplate: (templateId) =>
        set({ quickNoteTemplateId: templateId || null }),
      setQuickShortcuts: ({
        quickNoteShortcut,
        quickDrawShortcut,
        translatorTextShortcut,
        translatorOcrShortcut,
        aiFlashcardShortcut,
      }) =>
        set((state) => ({
          quickNoteShortcut:
            quickNoteShortcut ||
            state.quickNoteShortcut ||
            "CommandOrControl+Shift+Alt+1",
          quickDrawShortcut:
            quickDrawShortcut ||
            state.quickDrawShortcut ||
            "CommandOrControl+Shift+Alt+2",
          translatorTextShortcut:
            translatorTextShortcut ||
            state.translatorTextShortcut ||
            "CommandOrControl+Shift+Alt+3",
          translatorOcrShortcut:
            translatorOcrShortcut ||
            state.translatorOcrShortcut ||
            "CommandOrControl+Shift+Alt+4",
          aiFlashcardShortcut:
            aiFlashcardShortcut ||
            state.aiFlashcardShortcut ||
            "CommandOrControl+Shift+Alt+5",
        })),
      setImmersionStepIndex: (index) => set({ immersionStepIndex: index }),
      setImmersionMediaTime: (time) => set({ immersionMediaTime: time }),
      requestImmersionSeek: (time) => set({ immersionSeekTo: time }),
      clearImmersionSeek: () => set({ immersionSeekTo: null }),
      createImmersionPreset: (presetData) =>
        set((state) => ({
          immersionPresets: [
            ...state.immersionPresets,
            {
              id: `immersion-preset-${Date.now()}`,
              builtIn: false,
              createdAt: Date.now(),
              ...presetData,
            },
          ],
        })),
      updateImmersionPreset: (presetId, updates) =>
        set((state) => ({
          immersionPresets: state.immersionPresets.map((preset) =>
            preset.id === presetId ? { ...preset, ...updates } : preset,
          ),
        })),
      deleteImmersionPreset: (presetId) =>
        set((state) => ({
          immersionPresets: state.immersionPresets.filter(
            (preset) => preset.id !== presetId || preset.builtIn,
          ),
        })),
      saveLessonImmersionState: (
        courseId,
        moduleId,
        lessonId,
        immersionState,
      ) =>
        set((state) => ({
          courses: updateLessonInCourses(
            state.courses,
            courseId,
            moduleId,
            lessonId,
            (lesson) => ({
              ...lesson,
              immersionState: {
                ...(lesson.immersionState || {}),
                ...immersionState,
                updatedAt: Date.now(),
              },
            }),
          ),
        })),

      addNoteLEGACY: (noteData) =>
        set((state) => ({
          notes: {
            totalNotes: state.notes.totalNotes + 1,
            totalModules: state.notes.totalModules || 1,
            list: [
              {
                id: noteData.id || `note-${Date.now()}`,
                time: noteData.time || "Agora",
                accent: "primary",
                title: noteData.title || "Anotação Rápida",
                ...noteData,
              },
              ...state.notes.list,
            ],
          },
        })),

      updateNoteLEGACY: (noteId, updates) =>
        set((state) => ({
          notes: {
            ...state.notes,
            list: state.notes.list.map((n) =>
              n.id === noteId ? { ...n, ...updates, updatedAt: Date.now() } : n,
            ),
          },
        })),

      togglePinNoteLEGACY: (noteId) =>
        set((state) => ({
          notes: {
            ...state.notes,
            list: state.notes.list
              .map((n) => (n.id === noteId ? { ...n, pinned: !n.pinned } : n))
              .sort((a, b) => {
                // Sort by pinned first, then by time/id
                if (a.pinned === b.pinned) return 0;
                return a.pinned ? -1 : 1;
              }),
          },
        })),

      deleteNoteLEGACY: (noteId) =>
        set((state) => ({
          notes: {
            ...state.notes,
            totalNotes: Math.max(0, state.notes.totalNotes - 1),
            list: state.notes.list.filter((n) => n.id !== noteId),
          },
          activeNoteId:
            state.activeNoteId === noteId ? null : state.activeNoteId,
        })),

      addStudyItem: (itemData) =>
        set((state) => {
          const nextItems = sortStudyItems([
            normalizeStudyItem(itemData),
            ...state.studyItems,
          ]);

          return {
            studyItems: nextItems,
            notes: deriveLegacyNotes(nextItems),
          };
        }),

      updateStudyItem: (itemId, updates) =>
        set((state) => {
          const nextItems = sortStudyItems(
            state.studyItems.map((item) =>
              item.id === itemId
                ? normalizeStudyItem({
                    ...item,
                    ...updates,
                    updatedAt: updates.updatedAt || Date.now(),
                  })
                : item,
            ),
          );

          return {
            studyItems: nextItems,
            notes: deriveLegacyNotes(nextItems),
          };
        }),

      archiveStudyItem: (itemId) =>
        set((state) => {
          const nextItems = sortStudyItems(
            state.studyItems.map((item) =>
              item.id === itemId
                ? normalizeStudyItem({
                    ...item,
                    isArchived: true,
                    archivedAt: Date.now(),
                    updatedAt: Date.now(),
                  })
                : item,
            ),
          );

          return {
            studyItems: nextItems,
            notes: deriveLegacyNotes(nextItems),
            activeNoteId:
              state.activeNoteId === itemId ? null : state.activeNoteId,
          };
        }),

      restoreStudyItem: (itemId) =>
        set((state) => {
          const nextItems = sortStudyItems(
            state.studyItems.map((item) =>
              item.id === itemId
                ? normalizeStudyItem({
                    ...item,
                    isArchived: false,
                    archivedAt: null,
                    updatedAt: Date.now(),
                  })
                : item,
            ),
          );

          return {
            studyItems: nextItems,
            notes: deriveLegacyNotes(nextItems),
          };
        }),

      deleteStudyItem: (itemId) =>
        set((state) => {
          const current = state.studyItems.find((item) => item.id === itemId);
          if (isReadOnlySharedItem(current)) return state;
          const nextItems = sortStudyItems(
            state.studyItems.filter((item) => item.id !== itemId),
          );

          return {
            studyItems: nextItems,
            notes: deriveLegacyNotes(nextItems),
            activeNoteId:
              state.activeNoteId === itemId ? null : state.activeNoteId,
          };
        }),

      addNote: (noteData) =>
        set((state) => {
          const nextItems = sortStudyItems([
            normalizeStudyItem(noteData),
            ...state.studyItems,
          ]);

          return {
            studyItems: nextItems,
            notes: deriveLegacyNotes(nextItems),
          };
        }),

      updateNote: (noteId, updates) =>
        set((state) => {
          const current = state.studyItems.find((item) => item.id === noteId);
          if (isReadOnlySharedItem(current)) return state;
          const nextItems = sortStudyItems(
            state.studyItems.map((item) =>
              item.id === noteId
                ? normalizeStudyItem({
                    ...item,
                    ...updates,
                    updatedAt: updates.updatedAt || Date.now(),
                  })
                : item,
            ),
          );

          return {
            studyItems: nextItems,
            notes: deriveLegacyNotes(nextItems),
          };
        }),

      togglePinNote: (noteId) =>
        set((state) => {
          const nextItems = sortStudyItems(
            state.studyItems.map((item) =>
              item.id === noteId
                ? normalizeStudyItem({
                    ...item,
                    pinned: !item.pinned,
                    updatedAt: Date.now(),
                  })
                : item,
            ),
          );

          return {
            studyItems: nextItems,
            notes: deriveLegacyNotes(nextItems),
          };
        }),

      deleteNote: (noteId) =>
        set((state) => {
          const current = state.studyItems.find((item) => item.id === noteId);
          if (isReadOnlySharedItem(current)) return state;
          const nextItems = sortStudyItems(
            state.studyItems.filter((item) => item.id !== noteId),
          );

          return {
            studyItems: nextItems,
            notes: deriveLegacyNotes(nextItems),
            activeNoteId:
              state.activeNoteId === noteId ? null : state.activeNoteId,
          };
        }),

      deleteMultipleItems: (ids, types) =>
        set((state) => {
          // Types array corresponds to ids array. We handle 'note' and 'folder' types.
          const idsToDelete = new Set(ids);
          const folderIdsToDelete = new Set(
            ids.filter((_, idx) => types[idx] === 'folder')
          );
          const itemIdsToDelete = new Set(
            ids.filter((_, idx) => types[idx] === 'note')
          );
          
          let nextState = {};
          
          if (itemIdsToDelete.size > 0) {
            const nextItems = sortStudyItems(
              state.studyItems.filter((item) => !itemIdsToDelete.has(item.id))
            );
            nextState.studyItems = nextItems;
            nextState.notes = deriveLegacyNotes(nextItems);
            if (itemIdsToDelete.has(state.activeNoteId)) {
              nextState.activeNoteId = null;
            }
          }
          
          if (folderIdsToDelete.size > 0) {
            nextState.vaultFolders = (state.vaultFolders || []).filter(
              (folder) => !folderIdsToDelete.has(folder.id)
            );
          }
          
          return nextState;
        }),

      // ─── Vault / Folder Management ──────────────────────────────

      setActiveVaultId: (vaultId) => set(() => ({
        activeVaultId: vaultId || "global",
        activeNoteId: null,
      })),

      addCustomVault: (vaultData) => set((state) => {
        const newVault = {
          id: vaultData.id || `custom-vault-${Date.now()}`,
          name: vaultData.name || "Novo Cofre",
          description: vaultData.description || "",
          icon: vaultData.icon || "folder_special",
          color: vaultData.color || "#6366f1",
          createdAt: Date.now(),
        };
        return {
          customVaults: [...(state.customVaults || []), newVault],
          activeVaultId: newVault.id,
        };
      }),

      updateCustomVault: (vaultId, updates) => set((state) => ({
        customVaults: (state.customVaults || []).map((v) =>
          v.id === vaultId ? { ...v, ...updates } : v
        ),
      })),

      deleteCustomVault: (vaultId) => set((state) => ({
        customVaults: (state.customVaults || []).filter((v) => v.id !== vaultId),
        activeVaultId: state.activeVaultId === vaultId ? "global" : state.activeVaultId,
      })),

      addVaultFolder: (folderData) => set((state) => {
        const newFolder = {
          id: folderData.id || `folder-${Date.now()}`,
          name: folderData.name || "Nova Pasta",
          path: folderData.path || "",
          parentId: folderData.parentId || null,
          vaultId: folderData.vaultId || state.activeVaultId || "global",
          createdAt: Date.now(),
        };
        return { vaultFolders: [...(state.vaultFolders || []), newFolder] };
      }),

      renameVaultFolder: (folderId, newName) => set((state) => ({
        vaultFolders: (state.vaultFolders || []).map((f) =>
          f.id === folderId ? { ...f, name: newName } : f
        ),
      })),

      deleteVaultFolder: (folderId) => set((state) => ({
        vaultFolders: (state.vaultFolders || []).filter((f) => f.id !== folderId),
      })),

      moveNoteToFolder: (noteId, folderPath) => set((state) => {
        const nextItems = state.studyItems.map((item) =>
          item.id === noteId
            ? { ...item, path: folderPath, updatedAt: Date.now() }
            : item
        );
        return {
          studyItems: nextItems,
          notes: deriveLegacyNotes(nextItems),
        };
      }),

      // ─── Tab Management ─────────────────────────────────────────

      setActiveTabId: (tabId) => set({ activeTabId: tabId, activeNoteId: tabId }),

      openTab: (noteData) => set((state) => {
        // Don't add duplicate tabs
        if ((state.openTabs || []).some((t) => t.id === noteData.id)) {
          return { activeTabId: noteData.id, activeNoteId: noteData.id };
        }
        const newTab = {
          id: noteData.id,
          title: noteData.title || "Sem título",
          isDirty: false,
          pinned: false,
          itemType: noteData.itemType || "note",
        };
        return {
          openTabs: [...(state.openTabs || []), newTab],
          activeTabId: noteData.id,
          activeNoteId: noteData.id,
        };
      }),

      closeTab: (tabId) => set((state) => {
        const filtered = (state.openTabs || []).filter((t) => t.id !== tabId);
        let nextActive = state.activeTabId;
        if (state.activeTabId === tabId) {
          const idx = (state.openTabs || []).findIndex((t) => t.id === tabId);
          nextActive = filtered[Math.max(0, idx - 1)]?.id || null;
        }
        return {
          openTabs: filtered,
          activeTabId: nextActive,
          activeNoteId: nextActive,
        };
      }),

      reorderTabs: (newOrder) => set(() => ({
        openTabs: newOrder,
      })),

      setTabDirty: (tabId, isDirty) => set((state) => ({
        openTabs: (state.openTabs || []).map((t) =>
          t.id === tabId ? { ...t, isDirty } : t
        ),
      })),

      toggleTabPin: (tabId) => set((state) => ({
        openTabs: (state.openTabs || []).map((t) =>
          t.id === tabId ? { ...t, pinned: !t.pinned } : t
        ),
      })),

      updateTabTitle: (tabId, title) => set((state) => ({
        openTabs: (state.openTabs || []).map((t) =>
          t.id === tabId ? { ...t, title } : t
        ),
      })),

      // ─── Editor View State ──────────────────────────────────────

      setEditorViewMode: (mode) => set(() => ({ editorViewMode: mode })),
      setActiveSidePanel: (panel) => set(() => ({ activeSidePanel: panel })),
      setVaultSearchQuery: (query) => set(() => ({ vaultSearchQuery: query })),
      setActiveTag: (tag) => set(() => ({ activeTag: tag })),

      // ─── Sidebar & App Settings Actions ─────────────────────────
      setSidebarOrder: (order) => set({ sidebarOrder: order }),
      toggleSidebarItemVisibility: (key) => set((state) => {
        const hidden = state.sidebarHiddenItems || [];
        const isHidden = hidden.includes(key);
        return {
          sidebarHiddenItems: isHidden ? hidden.filter(k => k !== key) : [...hidden, key],
        };
      }),
      resetSidebarConfig: () => set({
        sidebarOrder: [
          "dashboard",
          "courses",
          "projects",
          "books",
          "materials",
          "journal",
          "knowledge",
          "reviews",
        ],
        sidebarHiddenItems: [],
        sidebarQuickActions: ["calendar", "tasks", "pomodoro"],
      }),
      updateAppSettings: (updates) => set((state) => ({
        appSettings: { ...(state.appSettings || {}), ...updates },
      })),
      openSettingsModal: (initialTab = "sidebar") => set({
        isSettingsModalOpen: true,
        settingsModalInitialTab: initialTab,
      }),
      closeSettingsModal: () => set({ isSettingsModalOpen: false }),

      toggleFavoriteCommand: (commandId) => set((state) => {
        const current = new Set(state.favoriteCommands || []);
        if (current.has(commandId)) {
          current.delete(commandId);
        } else {
          current.add(commandId);
        }
        return { favoriteCommands: Array.from(current) };
      }),

      toggleFavoriteSlashCommand: (slashId) => set((state) => {
        const current = new Set(state.favoriteSlashCommands || []);
        if (current.has(slashId)) {
          current.delete(slashId);
        } else {
          current.add(slashId);
        }
        return { favoriteSlashCommands: Array.from(current) };
      }),

      // ─── Knowledge Hub & Quick Capture Actions ──────────────────
      setActiveKnowledgeItemId: (id) => set({ activeKnowledgeItemId: id }),
      
      addKnowledgeItem: (item) => set((state) => {
        const newItem = {
          id: item.id || `kitem-${Date.now()}`,
          title: item.title || "Sem título",
          sourceUrl: item.sourceUrl || "",
          sourceType: item.sourceType || "web",
          sourceHost: item.sourceHost || (item.sourceUrl ? (() => {
            try { return new URL(item.sourceUrl).hostname.toUpperCase(); } catch { return "LINK"; }
          })() : "NOTA"),
          thumbnailUrl: item.thumbnailUrl || "",
          capturedAt: item.capturedAt || Date.now(),
          rawContent: item.rawContent || "",
          summaryConcise: item.summaryConcise || "",
          summaryDetailed: item.summaryDetailed || "",
          timestamps: item.timestamps || [],
          markdownNotes: item.markdownNotes || "",
          tags: Array.isArray(item.tags) ? item.tags : [],
          academicSubjectId: item.academicSubjectId || null,
          courseId: item.courseId || null,
          quizzes: item.quizzes || [],
        };
        return {
          knowledgeItems: [newItem, ...(state.knowledgeItems || [])],
        };
      }),

      updateKnowledgeItem: (id, updates) => set((state) => ({
        knowledgeItems: (state.knowledgeItems || []).map((item) =>
          item.id === id ? { ...item, ...updates, updatedAt: Date.now() } : item
        ),
      })),

      deleteKnowledgeItem: (id) => set((state) => ({
        knowledgeItems: (state.knowledgeItems || []).filter((item) => item.id !== id),
        activeKnowledgeItemId: state.activeKnowledgeItemId === id ? null : state.activeKnowledgeItemId,
      })),

      addQuizToKnowledgeItem: (itemId, quiz) => set((state) => ({
        knowledgeItems: (state.knowledgeItems || []).map((item) => {
          if (item.id !== itemId) return item;
          const newQuiz = {
            id: quiz.id || `quiz-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            question: quiz.question || "Pergunta",
            options: quiz.options || ["Opção 1", "Opção 2"],
            answerIndex: typeof quiz.answerIndex === "number" ? quiz.answerIndex : 0,
            explanation: quiz.explanation || "",
            difficulty: quiz.difficulty || "medium",
            dueDate: Date.now(),
            repetition: 0,
            interval: 1,
            easeFactor: 2.5,
          };
          return {
            ...item,
            quizzes: [...(item.quizzes || []), newQuiz],
          };
        }),
      })),

      deleteQuizFromKnowledgeItem: (itemId, quizId) => set((state) => ({
        knowledgeItems: (state.knowledgeItems || []).map((item) => {
          if (item.id !== itemId) return item;
          return {
            ...item,
            quizzes: (item.quizzes || []).filter((q) => q.id !== quizId),
          };
        }),
      })),

      answerKnowledgeQuiz: (itemId, quizId, quality) => set((state) => {
        const reviewedAt = Date.now();
        return {
          knowledgeItems: (state.knowledgeItems || []).map((item) => {
            if (item.id !== itemId) return item;
            return {
              ...item,
              quizzes: (item.quizzes || []).map((quiz) => {
                if (quiz.id !== quizId) return quiz;
                let { interval = 0, repetition = 0, easeFactor = 2.5 } = quiz;
                if (quality < 3) {
                  repetition = 0;
                  interval = 1;
                } else if (repetition === 0) {
                  interval = 1;
                  repetition = 1;
                } else if (repetition === 1) {
                  interval = 6;
                  repetition = 2;
                } else {
                  interval = Math.max(1, Math.round(interval * easeFactor));
                  repetition += 1;
                }
                easeFactor = Math.max(
                  1.3,
                  easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
                );
                const dueDate = reviewedAt + interval * 24 * 60 * 60 * 1000;
                return {
                  ...quiz,
                  interval,
                  repetition,
                  easeFactor,
                  dueDate,
                  lastReviewedAt: reviewedAt,
                };
              }),
            };
          }),
        };
      }),

      exportKnowledgeItemToVault: (itemId, targetVaultId = "global", folderId = null) => {
        let createdNote = null;
        set((state) => {
          const item = (state.knowledgeItems || []).find((k) => k.id === itemId);
          if (!item) return state;

          const noteId = `note-kitem-${Date.now()}`;
          const tagsHeader = item.tags && item.tags.length > 0 ? `tags:\n${item.tags.map(t => `  - ${t}`).join('\n')}\n` : '';
          const mdContent = `---
title: "${item.title.replace(/"/g, '\\"')}"
source: "${item.sourceUrl || ''}"
type: "${item.sourceType}"
captured: "${new Date(item.capturedAt).toISOString()}"
${tagsHeader}---

# ${item.title}

> 🔗 **Fonte:** [${item.sourceHost || item.sourceUrl || 'Nota'}](${item.sourceUrl || '#'})

## 💡 Resumo Conciso
${item.summaryConcise || 'Sem resumo conciso.'}

## 📖 Resumo Detalhado
${item.summaryDetailed || 'Sem resumo detalhado.'}

---

## ✍️ Anotações Pessoais
${item.markdownNotes || '*(Sem anotações adicionais)*'}
`;

          createdNote = {
            id: noteId,
            title: item.title,
            itemType: "note",
            type: "note",
            noteType: "note",
            vaultId: targetVaultId,
            folderId: folderId || null,
            path: "",
            markdownContent: mdContent,
            content: mdContent,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };

          return {
            studyItems: [createdNote, ...(state.studyItems || [])],
          };
        });

        return createdNote;
      },

      addTask: (taskData) =>
        set((state) => {
          const academic = normalizeAcademicData(state.academic);
          const courseId = taskData.courseId || taskData.sourceCourseId || null;
          const subject =
            academic.subjects.find(
              (item) =>
                item.id === (taskData.academicSubjectId || taskData.subjectId),
            ) ||
            academic.subjects.find((item) =>
              (item.linkedCourseIds || []).includes(courseId),
            );
          return {
            tasks: {
              list: [
                {
                  id:
                    taskData.id ||
                    `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                  status: "pending",
                  priority: "medium",
                  createdAt: Date.now(),
                  context: {
                    courseId,
                    moduleId:
                      taskData.moduleId || taskData.sourceModuleId || null,
                    lessonId:
                      taskData.lessonId || taskData.sourceLessonId || null,
                    workId: taskData.workId || null,
                  },
                  ...taskData,
                  academicSubjectId:
                    subject?.id || taskData.academicSubjectId || null,
                  academicSemesterId:
                    subject?.semesterId || taskData.academicSemesterId || null,
                },
                ...state.tasks.list,
              ],
            },
          };
        }),

      updateTask: (taskId, updates) =>
        set((state) => {
          const current = state.tasks.list.find((task) => task.id === taskId);
          if (isReadOnlySharedItem(current)) return state;
          return {
            tasks: {
              list: state.tasks.list.map((t) =>
                t.id === taskId ? { ...t, ...updates, updatedAt: Date.now() } : t,
              ),
            },
          };
        }),

      deleteTask: (taskId) =>
        set((state) => {
          const current = state.tasks.list.find((task) => task.id === taskId);
          if (isReadOnlySharedItem(current)) return state;
          return {
            tasks: {
              list: state.tasks.list.filter((t) => t.id !== taskId),
            },
            activeTaskId:
              state.activeTaskId === taskId ? null : state.activeTaskId,
          };
        }),

      addHabit: (title, color) =>
        set((state) => ({
          habits: {
            list: [
              ...(state.habits?.list || []),
              {
                id: `hab-${Date.now()}`,
                title,
                color: color || '#3b82f6',
                createdAt: Date.now(),
                completedDates: [],
              },
            ],
          },
        })),

      toggleHabit: (habitId, dateStr) =>
        set((state) => ({
          habits: {
            list: (state.habits?.list || []).map((h) => {
              if (h.id !== habitId) return h;
              const completed = h.completedDates || [];
              const isDone = completed.includes(dateStr);
              return {
                ...h,
                completedDates: isDone
                  ? completed.filter((d) => d !== dateStr)
                  : [...completed, dateStr],
              };
            }),
          },
        })),

      deleteHabit: (habitId) =>
        set((state) => ({
          habits: {
            list: (state.habits?.list || []).filter((h) => h.id !== habitId),
          },
        })),

      addBook: (bookData) =>
        set((state) => {
          const newBook = {
            id: `book-${Date.now()}`,
            createdAt: Date.now(),
            readPages: 0,
            status: "TO READ",
            summary: "",
            notes: [],
            quotes: [],
            chapters: [],
            goals: [],
            history: [],
            review: {},
            ...bookData
          };
          return {
            books: {
              list: [...(state.books?.list || []), newBook]
            }
          };
        }),
      
      setActiveBook: (bookId) => set({ activeBookId: bookId }),
      
      updateBook: (bookId, updates) =>
        set((state) => ({
          books: {
            list: (state.books?.list || []).map(b => 
              b.id === bookId ? { ...b, ...updates, updatedAt: Date.now() } : b
            )
          }
        })),
        
      deleteBook: (bookId) =>
        set((state) => ({
          books: {
            list: (state.books?.list || []).filter(b => b.id !== bookId)
          }
        })),

      // --- READER ACTIONS ---
      updateReaderPosition: (bookId, position) =>
        set((state) => ({
          books: {
            list: (state.books?.list || []).map(b =>
              b.id === bookId ? { ...b, lastPosition: position, updatedAt: Date.now() } : b
            )
          }
        })),

      addHighlight: (bookId, highlight) =>
        set((state) => ({
          books: {
            list: (state.books?.list || []).map(b =>
              b.id === bookId
                ? { ...b, highlights: [highlight, ...(b.highlights || [])], updatedAt: Date.now() }
                : b
            )
          }
        })),

      removeHighlight: (bookId, highlightId) =>
        set((state) => ({
          books: {
            list: (state.books?.list || []).map(b =>
              b.id === bookId
                ? { ...b, highlights: (b.highlights || []).filter(h => h.id !== highlightId), updatedAt: Date.now() }
                : b
            )
          }
        })),

      addBookmark: (bookId, bookmark) =>
        set((state) => ({
          books: {
            list: (state.books?.list || []).map(b =>
              b.id === bookId
                ? { ...b, bookmarks: [bookmark, ...(b.bookmarks || [])], updatedAt: Date.now() }
                : b
            )
          }
        })),

      removeBookmark: (bookId, bookmarkId) =>
        set((state) => ({
          books: {
            list: (state.books?.list || []).map(b =>
              b.id === bookId
                ? { ...b, bookmarks: (b.bookmarks || []).filter(bm => bm.id !== bookmarkId), updatedAt: Date.now() }
                : b
            )
          }
        })),

      toggleFavorite: (bookId, pageNum, cfi = null) =>
        set((state) => {
          const book = (state.books?.list || []).find(b => b.id === bookId);
          if (!book) return state;
          const favorites = book.favorites || [];
          const existing = favorites.find(f => cfi ? f.cfi === cfi : f.page === pageNum);
          const newFavorites = existing
            ? favorites.filter(f => f.id !== existing.id)
            : [{ id: `fav-${Date.now()}`, page: pageNum, cfi, createdAt: Date.now() }, ...favorites];
          return {
            books: {
              list: (state.books?.list || []).map(b =>
                b.id === bookId ? { ...b, favorites: newFavorites, updatedAt: Date.now() } : b
              )
            }
          };
        }),

      updateReaderSettings: (bookId, settings) =>
        set((state) => ({
          books: {
            list: (state.books?.list || []).map(b =>
              b.id === bookId
                ? { ...b, readerSettings: { ...(b.readerSettings || {}), ...settings }, updatedAt: Date.now() }
                : b
            )
          }
        })),




      addNoteTemplate: (template) =>
        set((state) => ({
          noteTemplates: [
            ...state.noteTemplates,
            {
              ...template,
              id: `template-${Date.now()}`,
              isCustom: true, // Identifies it as user-created
            },
          ],
        })),

      updateNoteTemplate: (templateId, updates) =>
        set((state) => ({
          noteTemplates: state.noteTemplates.map((t) =>
            t.id === templateId ? { ...t, ...updates } : t,
          ),
        })),

      deleteNoteTemplate: (templateId) =>
        set((state) => ({
          noteTemplates: state.noteTemplates.filter((t) => t.id !== templateId),
          quickNoteTemplateId:
            state.quickNoteTemplateId === templateId
              ? null
              : state.quickNoteTemplateId,
        })),

      addCourse: (courseData) => {
        const course = createCourseRecord(courseData);
        set((state) => ({ courses: [...state.courses, course] }));
        return course.id;
      },
      linkCourseToAcademicSubject: (subjectId, courseId) =>
        set((state) => {
          const academic = normalizeAcademicData(state.academic);
          if (!state.courses.some((course) => course.id === courseId))
            return state;
          return {
            academic: {
              ...academic,
              subjects: academic.subjects.map((subject) => {
                if (subject.id !== subjectId) return subject;
                const linkedCourseIds = [
                  ...new Set([...(subject.linkedCourseIds || []), courseId]),
                ];
                return {
                  ...subject,
                  linkedCourseIds,
                  courseId: linkedCourseIds[0] || null,
                  updatedAt: Date.now(),
                };
              }),
            },
          };
        }),
      unlinkCourseFromAcademicSubject: (subjectId, courseId) =>
        set((state) => {
          const academic = normalizeAcademicData(state.academic);
          return {
            academic: {
              ...academic,
              subjects: academic.subjects.map((subject) => {
                if (subject.id !== subjectId) return subject;
                const linkedCourseIds = (subject.linkedCourseIds || []).filter(
                  (id) => id !== courseId,
                );
                return {
                  ...subject,
                  linkedCourseIds,
                  courseId: linkedCourseIds[0] || null,
                  updatedAt: Date.now(),
                };
              }),
            },
          };
        }),
      createCourseForAcademicSubject: (subjectId) => {
        let createdCourseId = null;
        set((state) => {
          const academic = normalizeAcademicData(state.academic);
          const subject = academic.subjects.find(
            (item) => item.id === subjectId,
          );
          if (!subject) return state;
          const course = createCourseRecord({
            title: subject.name,
            description: `Hub de conteúdo acadêmico de ${subject.name}`,
            category: "Faculdade",
            academicSubjectId: subject.id,
            academicSemesterId: subject.semesterId,
          });
          createdCourseId = course.id;
          return {
            courses: [...state.courses, course],
            academic: {
              ...academic,
              subjects: academic.subjects.map((item) =>
                item.id === subjectId
                  ? {
                      ...item,
                      linkedCourseIds: [
                        ...new Set([
                          ...(item.linkedCourseIds || []),
                          course.id,
                        ]),
                      ],
                      courseId: item.courseId || course.id,
                      updatedAt: Date.now(),
                    }
                  : item,
              ),
            },
            activeCourseId: course.id,
          };
        });
        return createdCourseId;
      },

      addModule: (courseId, moduleData) =>
        set((state) => ({
          courses: state.courses.map((course) => {
            if (course.id === courseId && !isReadOnlySharedItem(course)) {
              let updatedCourse = {
                ...course,
                modules: [
                  ...course.modules,
                  {
                    ...moduleData,
                    id: `mod-${Date.now()}`,
                    lessons: [],
                    documents: [],
                    works: [],
                  },
                ],
              };
              return recalculateCourse(updatedCourse);
            }
            return course;
          }),
        })),

      updateModule: (courseId, moduleId, updates) =>
        set((state) => ({
          courses: state.courses.map((course) => {
            if (course.id === courseId) {
              let updatedCourse = {
                ...course,
                modules: course.modules.map((mod) =>
                  mod.id === moduleId ? { ...mod, ...updates } : mod,
                ),
              };
              return recalculateCourse(updatedCourse);
            }
            return course;
          }),
        })),

      addWork: (courseId, moduleId, workData) =>
        set((state) => ({
          courses: state.courses.map((course) =>
            course.id !== courseId || isReadOnlySharedItem(course)
              ? course
              : {
                  ...course,
                  modules: course.modules.map((module) =>
                    module.id !== moduleId
                      ? module
                      : {
                          ...module,
                          works: [
                            ...(module.works || []),
                            {
                              id: `work-${Date.now()}`,
                              title: "Novo trabalho",
                              description: "",
                              dueDate: "",
                              subject: "",
                              teacher: "",
                              type: "Relatorio",
                              priority: "medium",
                              status: "planning",
                              progress: 0,
                              members: [],
                              files: [],
                              tasks: [],
                              writing: {
                                content: "",
                                structure: [
                                  "Introducao",
                                  "Desenvolvimento",
                                  "Conclusao",
                                ],
                                citationStyle: "ABNT",
                                references: "",
                              },
                              presentation: {
                                script: "",
                                estimatedMinutes: 0,
                                checklist: [],
                                speakerOrder: [],
                              },
                              messages: [],
                              decisions: [],
                              collaboration: {
                                provider: "local",
                                shareId: null,
                                role: "owner",
                                syncStatus: "local-only",
                              },
                              createdAt: Date.now(),
                              updatedAt: Date.now(),
                              ...workData,
                            },
                          ],
                        },
                  ),
                },
          ),
        })),

      updateWork: (courseId, moduleId, workId, updates) =>
        set((state) => ({
          courses: state.courses.map((course) =>
            course.id !== courseId || isReadOnlySharedItem(course)
              ? course
              : {
                  ...course,
                  modules: course.modules.map((module) =>
                    module.id !== moduleId
                      ? module
                      : {
                          ...module,
                          works: (module.works || []).map((work) =>
                            work.id === workId
                              ? { ...work, ...updates, updatedAt: Date.now() }
                              : work,
                          ),
                        },
                  ),
                },
          ),
        })),

      deleteWork: (courseId, moduleId, workId) =>
        set((state) => ({
          courses: state.courses.map((course) =>
            course.id !== courseId || isReadOnlySharedItem(course)
              ? course
              : {
                  ...course,
                  modules: course.modules.map((module) =>
                    module.id !== moduleId
                      ? module
                      : {
                          ...module,
                          works: (module.works || []).filter(
                            (work) => work.id !== workId,
                          ),
                        },
                  ),
                },
          ),
          activeWorkId:
            state.activeWorkId === workId ? null : state.activeWorkId,
        })),

      setActiveWork: (workId) => set({ activeWorkId: workId }),

      addLesson: (courseId, moduleId, lessonData) =>
        set((state) => ({
          courses: state.courses.map((course) => {
            if (course.id === courseId) {
              const newLesson = {
                ...lessonData,
                id: `lesson-${Date.now()}`,
                status: "pending",
              };

              // If moduleId provided, add inside that module
              if (moduleId) {
                let updatedCourse = {
                  ...course,
                  modules: course.modules.map((mod) => {
                    if (mod.id === moduleId) {
                      return {
                        ...mod,
                        lessons: [...(mod.lessons || []), newLesson],
                      };
                    }
                    return mod;
                  }),
                };
                return recalculateCourse(updatedCourse);
              }

              // No moduleId: add as a top-level course lesson
              let updatedCourse = {
                ...course,
                lessons: [...(course.lessons || []), newLesson],
              };

              return recalculateCourse(updatedCourse);
            }
            return course;
          }),
        })),

      saveLessonDrawing: (
        courseId,
        moduleId,
        lessonId,
        drawingDataUrl,
        drawingScene = null,
      ) =>
        set((state) => ({
          courses: updateLessonInCourses(
            state.courses,
            courseId,
            moduleId,
            lessonId,
            (lesson) => ({
              ...lesson,
              drawing: drawingDataUrl,
              ...(drawingScene ? { drawingScene } : {}),
            }),
          ),
        })),

      updateLesson: (courseId, moduleId, lessonId, updates) =>
        set((state) => ({
          courses: updateLessonInCourses(
            state.courses,
            courseId,
            moduleId,
            lessonId,
            (lesson) => ({ ...lesson, ...updates }),
          ),
        })),

      syncImportCourse: (courseTitle, parsedModules) =>
        set((state) => {
          let updatedCourses = [...state.courses];
          let existingCourseIndex = updatedCourses.findIndex(
            (c) => c.title === courseTitle,
          );
          let existingCourse =
            existingCourseIndex >= 0
              ? { ...updatedCourses[existingCourseIndex] }
              : null;

          if (!existingCourse) {
            existingCourse = {
              id: `course-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              title: courseTitle,
              subtitle: "Importado Inteligente",
              progress: 0,
              modules: [],
              stats: { materials: 0, xp: 0 },
              tutor: {
                name: "Sistema",
                role: "Organizador",
                image:
                  "https://lh3.googleusercontent.com/aida-public/AB6AXuCHzYK12YEOLmbR7liZNjFxcj0N2yjPBJP6NvecDc5Php0puvb4UCZltId42aChsv2BcTqXQ9088_qMcbkhtKi7fn9yjCPAMEFJ-JgYQH8Atho-uAuG8nFa-c0RwpzIMivvZ7P5Q9O5tz7JkaRWByjoV96L5u5mxRHpx6GSrd8tm70Bw0ynESS-G5_sTmkKw9yng4X5J9Gp_lwF2Mu7l-7rKmL6BgqxL39XElywXNgyY159gb38BWufv9_F9ndiIHj2Lm0RZJGKLfg",
              },
              tools: {
                flashcards: {
                  title: "Flashcards",
                  description: "Revise",
                  pendingLabel: "0 cartões",
                },
                notes: { title: "Minhas Notas" },
              },
            };
            updatedCourses.push(existingCourse);
            existingCourseIndex = updatedCourses.length - 1;
          } else {
            existingCourse.modules = [...existingCourse.modules];
          }

          parsedModules.forEach((pm) => {
            let existingModule = existingCourse.modules.find(
              (m) => m.title === pm.title,
            );
            if (!existingModule) {
              existingModule = {
                id: `mod-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                title: pm.title,
                lessons: [],
              };
              existingCourse.modules.push(existingModule);
            } else {
              existingModule.lessons = [...existingModule.lessons];
            }

            pm.lessons.forEach((pl) => {
              let existingLesson = existingModule.lessons.find(
                (l) => l.title === pl.title,
              );
              if (!existingLesson) {
                existingModule.lessons.push({
                  id: `lesson-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  title: pl.title,
                  kindLabel: pl.kindLabel,
                  contentMode: pl.contentMode || "media",
                  durationLabel: "Auto",
                  filePath: pl.filePath,
                  pdfPath: pl.pdfPath,
                  audioPath: pl.audioPath,
                  transcript: pl.transcript,
                  status: "pending",
                  index: pl.index || existingModule.lessons.length + 1,
                });
                existingCourse.stats.materials += 1;
              } else {
                if (!existingLesson.filePath && pl.filePath)
                  existingLesson.filePath = pl.filePath;
                if (!existingLesson.pdfPath && pl.pdfPath)
                  existingLesson.pdfPath = pl.pdfPath;
                if (!existingLesson.audioPath && pl.audioPath)
                  existingLesson.audioPath = pl.audioPath;
                if (!existingLesson.contentMode && pl.contentMode)
                  existingLesson.contentMode = pl.contentMode;
                if (!existingLesson.transcript && pl.transcript)
                  existingLesson.transcript = pl.transcript;
              }
            });

            existingModule.lessons.sort(
              (a, b) => (a.index || 0) - (b.index || 0),
            );
          });

          updatedCourses[existingCourseIndex] = existingCourse;
          return { courses: updatedCourses };
        }),

      deleteCourse: (courseId) =>
        set((state) => {
          const course = state.courses.find((candidate) => candidate.id === courseId);
          if (isReadOnlySharedItem(course)) return state;
          const courseIds = new Set([courseId]);
          const moduleIds = new Set((course?.modules || []).map((module) => module.id));
          const lessonIds = new Set([
            ...(course?.lessons || []).map((lesson) => lesson.id),
            ...(course?.modules || []).flatMap((module) =>
              (module.lessons || []).map((lesson) => lesson.id),
            ),
          ]);
          const academic = normalizeAcademicData(state.academic);

          const nextStudyItems = sortStudyItems(
            filterOutLinkedItems(state.studyItems, { courseIds, moduleIds, lessonIds }),
          );
          const nextDecks = filterOutLinkedItems(state.flashcardDecks, { courseIds, moduleIds, lessonIds });
          const nextTaskList = filterOutLinkedItems(state.tasks?.list || [], { courseIds, moduleIds, lessonIds });

          return {
            courses: state.courses.filter((candidate) => candidate.id !== courseId),
            studyItems: nextStudyItems,
            notes: deriveLegacyNotes(nextStudyItems),
            flashcardDecks: nextDecks,
            tasks: { ...(state.tasks || {}), list: nextTaskList },
            academic: {
              ...academic,
              subjects: academic.subjects.map((subject) => {
                const linkedCourseIds = (subject.linkedCourseIds || []).filter(
                  (linkedId) => linkedId !== courseId,
                );
                if (
                  linkedCourseIds.length === (subject.linkedCourseIds || []).length &&
                  subject.courseId !== courseId
                ) {
                  return subject;
                }
                return {
                  ...subject,
                  linkedCourseIds,
                  courseId: subject.courseId === courseId ? null : subject.courseId,
                  updatedAt: Date.now(),
                };
              }),
            },
            activeCourseId:
              state.activeCourseId === courseId ? null : state.activeCourseId,
            activeModuleId: moduleIds.has(state.activeModuleId)
              ? null
              : state.activeModuleId,
            activeLessonId: lessonIds.has(state.activeLessonId)
              ? null
              : state.activeLessonId,
          };
        }),

      deleteModule: (courseId, moduleId) =>
        set((state) => {
          const course = state.courses.find((candidate) => candidate.id === courseId);
          const targetModule = (course?.modules || []).find((m) => m.id === moduleId);
          const moduleIds = new Set([moduleId]);
          const lessonIds = new Set(
            (targetModule?.lessons || []).map((lesson) => lesson.id),
          );

          const nextStudyItems = sortStudyItems(
            filterOutLinkedItems(state.studyItems, { moduleIds, lessonIds }),
          );
          const nextDecks = filterOutLinkedItems(state.flashcardDecks, { moduleIds, lessonIds });
          const nextTaskList = filterOutLinkedItems(state.tasks?.list || [], { moduleIds, lessonIds });

          return {
            courses: state.courses.map((c) => {
              if (c.id === courseId && !isReadOnlySharedItem(c)) {
                let updatedCourse = {
                  ...c,
                  modules: (c.modules || []).filter((m) => m.id !== moduleId),
                };
                return recalculateCourse(updatedCourse);
              }
              return c;
            }),
            studyItems: nextStudyItems,
            notes: deriveLegacyNotes(nextStudyItems),
            flashcardDecks: nextDecks,
            tasks: { ...(state.tasks || {}), list: nextTaskList },
            activeModuleId:
              state.activeModuleId === moduleId ? null : state.activeModuleId,
            activeLessonId: lessonIds.has(state.activeLessonId)
              ? null
              : state.activeLessonId,
          };
        }),

      deleteLesson: (courseId, moduleId, lessonId) =>
        set((state) => {
          const lessonIds = new Set([lessonId]);

          const nextStudyItems = sortStudyItems(
            filterOutLinkedItems(state.studyItems, { lessonIds }),
          );
          const nextDecks = filterOutLinkedItems(state.flashcardDecks, { lessonIds });
          const nextTaskList = filterOutLinkedItems(state.tasks?.list || [], { lessonIds });

          return {
            courses: state.courses.map((course) => {
              if (course.id === courseId && !isReadOnlySharedItem(course)) {
                if (moduleId) {
                  let updatedCourse = {
                    ...course,
                    modules: (course.modules || []).map((mod) => {
                      if (mod.id === moduleId) {
                        return {
                          ...mod,
                          lessons: (mod.lessons || []).filter(
                            (l) => l.id !== lessonId,
                          ),
                        };
                      }
                      return mod;
                    }),
                  };
                  return recalculateCourse(updatedCourse);
                }

                let updatedCourse = {
                  ...course,
                  lessons: (course.lessons || []).filter((l) => l.id !== lessonId),
                };
                return recalculateCourse(updatedCourse);
              }
              return course;
            }),
            studyItems: nextStudyItems,
            notes: deriveLegacyNotes(nextStudyItems),
            flashcardDecks: nextDecks,
            tasks: { ...(state.tasks || {}), list: nextTaskList },
            activeLessonId:
              state.activeLessonId === lessonId ? null : state.activeLessonId,
          };
        }),

      addFlashcardDeck: (deckData) =>
        set((state) => {
          const academic = normalizeAcademicData(state.academic);
          const subject =
            academic.subjects.find(
              (item) =>
                item.id === (deckData.academicSubjectId || deckData.subjectId),
            ) ||
            academic.subjects.find((item) =>
              (item.linkedCourseIds || []).includes(deckData.sourceCourseId),
            );
          return {
            flashcardDecks: [
              ...state.flashcardDecks,
              {
                id: deckData.id || `deck-${Date.now()}`,
                ...deckData,
                academicSubjectId:
                  subject?.id || deckData.academicSubjectId || null,
                academicSemesterId:
                  subject?.semesterId || deckData.academicSemesterId || null,
                cards: deckData.cards || [],
                dailyProgress: 0,
                dailyProgressLabel: "0/0 Revistos",
                retentionBars: [0, 0, 0, 0, 0, 0, 0],
                schedule: [],
              },
            ],
          };
        }),

      updateFlashcardDeck: (deckId, deckData) =>
        set((state) => ({
          flashcardDecks: state.flashcardDecks.map((deck) => {
            if (deck.id !== deckId) return deck;
            return {
              ...deck,
              ...deckData,
              id: deck.id,
              cards: deckData.cards || deck.cards || [],
            };
          }),
        })),

      addFlashcard: (deckId, cardData) =>
        set((state) => ({
          flashcardDecks: state.flashcardDecks.map((deck) => {
            if (deck.id === deckId) {
              return {
                ...deck,
                cards: [
                  ...deck.cards,
                  {
                    ...cardData,
                    id: `card-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                    interval: 0,
                    repetition: 0,
                    easeFactor: 2.5,
                    dueDate: Date.now(),
                  },
                ],
              };
            }
            return deck;
          }),
        })),

      reviewFlashcard: (deckId, cardId, quality) =>
        set((state) => {
          const reviewedAt = Date.now();
          let review = null;
          const flashcardDecks = state.flashcardDecks.map((deck) => {
            if (deck.id !== deckId) return deck;
            return {
              ...deck,
              cards: deck.cards.map((card) => {
                if (card.id !== cardId) return card;
                let { interval = 0, repetition = 0, easeFactor = 2.5 } = card;
                if (quality < 3) {
                  repetition = 0;
                  interval = 1;
                } else if (repetition === 0) {
                  interval = 1;
                  repetition = 1;
                } else if (repetition === 1) {
                  interval = 6;
                  repetition = 2;
                } else {
                  interval = Math.max(1, Math.round(interval * easeFactor));
                  repetition += 1;
                }
                easeFactor = Math.max(
                  1.3,
                  easeFactor +
                    (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
                );
                const dueDate = reviewedAt + interval * 24 * 60 * 60 * 1000;
                review = {
                  id: `review-${reviewedAt}`,
                  deckId,
                  cardId,
                  quality,
                  rating:
                    quality < 3
                      ? "again"
                      : quality === 3
                        ? "hard"
                        : quality === 4
                          ? "good"
                          : "easy",
                  intervalDays: interval,
                  easeFactor,
                  dueAt: dueDate,
                  reviewedAt,
                };
                return { ...card, interval, repetition, easeFactor, dueDate };
              }),
            };
          });
          return {
            flashcardDecks,
            flashcardReviewHistory: review
              ? [review, ...state.flashcardReviewHistory].slice(0, 1000)
              : state.flashcardReviewHistory,
          };
        }),

      deleteFlashcardDeck: (deckId) =>
        set((state) => ({
          flashcardDecks: state.flashcardDecks.filter((d) => d.id !== deckId),
          activeDeckId:
            state.activeDeckId === deckId ? null : state.activeDeckId,
        })),

      deleteFlashcard: (deckId, cardId) =>
        set((state) => ({
          flashcardDecks: state.flashcardDecks.map((deck) => {
            if (deck.id === deckId) {
              return {
                ...deck,
                cards: deck.cards.filter((c) => c.id !== cardId),
              };
            }
            return deck;
          }),
        })),

      updateFlashcard: (deckId, cardId, cardData) =>
        set((state) => ({
          flashcardDecks: state.flashcardDecks.map((deck) => {
            if (deck.id === deckId) {
              return {
                ...deck,
                cards: deck.cards.map((c) =>
                  c.id === cardId ? { ...c, ...cardData } : c,
                ),
              };
            }
            return deck;
          }),
        })),

      addNoteLEGACY_V2: (note) =>
        set((state) => ({
          notes: {
            totalNotes: state.notes.totalNotes + 1,
            list: [
              {
                ...note,
                id: note.id || `note-${Date.now()}`,
                title: note.title || "Anotação Rápida",
                content: note.content || "",
                module: note.module || "Geral",
                time: note.time || "Agora",
                timestamp: note.timestamp ?? null,
                pinned: false,
                accent: note.accent || "primary",
                createdAt: Date.now(),
                updatedAt: Date.now(),
              },
              ...state.notes.list,
            ],
          },
        })),

      toggleLessonComplete: (courseId, moduleId, lessonId) =>
        set((state) => {
          let wasCompleted = false;
          let lessonTitle = "Aula";

          const updatedCourses = state.courses.map((course) => {
            if (course.id === courseId) {
              const updatedModules = course.modules.map((mod) => {
                if (mod.id === moduleId) {
                  const updatedLessons = (mod.lessons || []).map((l) => {
                    if (l.id === lessonId) {
                      wasCompleted = l.status === "completed";
                      lessonTitle = l.title;
                      return {
                        ...l,
                        status: wasCompleted ? "not_started" : "completed",
                      };
                    }
                    return l;
                  });
                  return { ...mod, lessons: updatedLessons };
                }
                return mod;
              });
              let updatedCourse = {
                ...course,
                modules: updatedModules,
                stats: {
                  ...course.stats,
                  xp: course.stats.xp + (wasCompleted ? -50 : 50),
                },
              };
              return recalculateCourse(updatedCourse);
            }
            return course;
          });

          const newActivity = [
            {
              id: `activity-${Date.now()}`,
              icon: wasCompleted ? "remove_circle_outline" : "check_circle",
              iconColor: wasCompleted ? "text-gray-500" : "text-green-600",
              title: wasCompleted
                ? `Desmarcou a aula ${lessonTitle}`
                : `Concluiu a aula ${lessonTitle}`,
              subtitle: "Agora mesmo",
            },
            ...state.dashboard.activity,
          ].slice(0, 5);

          return {
            courses: updatedCourses,
            dashboard: {
              ...state.dashboard,
              progress: Math.min(
                100,
                state.dashboard.progress + (wasCompleted ? -5 : 5),
              ),
              activity: newActivity,
            },
          };
        }),
    }),
    {
      name: "studyhub-storage-v2",
      version: 18,
      migrate: (persistedState) => {
        const studyItems = migrateStudyItems(persistedState);
        const contextual = migrateAcademicContexts({
          ...persistedState,
          studyItems,
        });

        return {
          ...persistedState,
          ...contextual,
          collaboration: {
            ...createEmptyCollaboration(),
            ...(persistedState.collaboration || {}),
          },
          journalEntries: normalizeJournalEntries(
            persistedState.journalEntries || [],
          ),
          importantQuotes: (persistedState.importantQuotes || []).map(normalizeImportantQuote),
          journalSettings: normalizeJournalSettings(
            persistedState.journalSettings || {},
          ),
          activeJournalEntryId:
            persistedState.activeJournalEntryId || null,
          notes: deriveLegacyNotes(contextual.studyItems),
          noteVersions: persistedState.noteVersions || [],
          flashcardReviewHistory: persistedState.flashcardReviewHistory || [],
          studyPlans: persistedState.studyPlans || [],
          importTransactions: persistedState.importTransactions || [],
          dashboardQuickNotes: migrateDashboardQuickNotes(persistedState),
          dashboardWidgets: ensureQuickNoteWidgets(
            persistedState.dashboardWidgets,
            migrateDashboardQuickNotes(persistedState),
          ),
          activeAcademicSubjectId:
            persistedState.activeAcademicSubjectId || null,
          knowledgeItems: Array.isArray(persistedState.knowledgeItems)
            ? persistedState.knowledgeItems.filter(
                (k) =>
                  k &&
                  !["kitem-csharp-delegates", "kitem-love-hotel", "kitem-lambda-conceito"].includes(k.id),
              )
            : [],
          activeKnowledgeItemId: persistedState.activeKnowledgeItemId || null,
          quickNoteShortcut: [
            "CommandOrControl+Alt+N",
            "CommandOrControl+Alt+L",
            "CommandOrControl+Shift+Alt+L",
            "CommandOrControl+Shift+Alt+F8",
            "CommandOrControl+Shift+Alt+1",
            "Super+Shift+1",
          ].includes(persistedState.quickNoteShortcut)
            ? "CommandOrControl+Shift+Alt+1"
            : persistedState.quickNoteShortcut,
          quickDrawShortcut: [
            "CommandOrControl+Alt+D",
            "CommandOrControl+Shift+Alt+D",
            "CommandOrControl+Shift+Alt+F9",
            "CommandOrControl+Shift+Alt+2",
            "Super+Shift+2",
          ].includes(persistedState.quickDrawShortcut)
            ? "CommandOrControl+Shift+Alt+2"
            : persistedState.quickDrawShortcut,
          translatorTextShortcut: [
            "CommandOrControl+Alt+T",
            "CommandOrControl+Shift+Alt+T",
            "CommandOrControl+Shift+Alt+F10",
            "CommandOrControl+Shift+Alt+3",
            "Super+Shift+3",
          ].includes(persistedState.translatorTextShortcut)
            ? "CommandOrControl+Shift+Alt+3"
            : persistedState.translatorTextShortcut,
          translatorOcrShortcut: [
            "CommandOrControl+Alt+O",
            "CommandOrControl+Shift+Alt+O",
            "CommandOrControl+Shift+Alt+F11",
            "CommandOrControl+Shift+Alt+4",
            "Super+Shift+4",
          ].includes(persistedState.translatorOcrShortcut)
            ? "CommandOrControl+Shift+Alt+4"
            : persistedState.translatorOcrShortcut,
        };
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (Array.isArray(state.knowledgeItems)) {
          state.knowledgeItems = state.knowledgeItems.filter(
            (k) =>
              k &&
              !["kitem-csharp-delegates", "kitem-love-hotel", "kitem-lambda-conceito"].includes(k.id),
          );
        } else {
          state.knowledgeItems = [];
        }
        const studyItems = migrateStudyItems(state);
        const contextual = migrateAcademicContexts({ ...state, studyItems });
        state.studyItems = contextual.studyItems;
        state.notes = deriveLegacyNotes(contextual.studyItems);
        state.tasks = contextual.tasks;
        state.flashcardDecks = contextual.flashcardDecks;
        state.focusSessions = contextual.focusSessions;
        state.dashboardQuickNotes = migrateDashboardQuickNotes(state);
        state.dashboardWidgets = ensureQuickNoteWidgets(
          state.dashboardWidgets,
          state.dashboardQuickNotes,
        );
        state.academic = contextual.academic;
        state.collaboration = {
          ...createEmptyCollaboration(),
          ...(state.collaboration || {}),
        };
        state.journalEntries = normalizeJournalEntries(
          state.journalEntries || [],
        );
        state.journalSettings = normalizeJournalSettings(
          state.journalSettings || {},
        );
      },
    },
  ),
);
