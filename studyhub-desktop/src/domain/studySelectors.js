import { getLocalDateKey } from "../utils/dateUtils.js";

const DAY = 24 * 60 * 60 * 1000;

export function flattenLessons(courses = []) {
  return courses.flatMap((course) => {
    // Include top-level lessons attached to the course, plus lessons inside modules
    const topLevel = (course.lessons || []).map((lesson) => ({
      ...lesson,
      courseId: course.id,
      courseTitle: course.title,
      moduleId: null,
      moduleTitle: null,
    }));
    const fromModules = (course.modules || []).flatMap((module) => (module.lessons || []).map((lesson) => ({
      ...lesson,
      courseId: course.id,
      courseTitle: course.title,
      moduleId: module.id,
      moduleTitle: module.title,
    })));
    return [...topLevel, ...fromModules];
  });
}

export function taskContext(task = {}) {
  return task.context || {
    courseId: task.courseId || task.sourceCourseId || null,
    moduleId: task.moduleId || task.sourceModuleId || null,
    lessonId: task.lessonId || task.sourceLessonId || null,
    workId: task.workId || null,
  };
}

export function dueFlashcards(decks = [], now = Date.now()) {
  return decks.flatMap((deck) => (deck.cards || []).map((card) => ({ ...card, deckId: deck.id, deckTitle: deck.title || deck.deckTitle || "Deck" }))).filter((card) => !card.dueDate || card.dueDate <= now);
}

export function selectTodayData(state, now = Date.now()) {
  const courses = state.courses || [];
  const lessons = flattenLessons(courses);
  const activeLesson = lessons.find((lesson) => lesson.id === state.activeLessonId) || null;
  const tasks = (state.tasks?.list || []).filter((task) => task.status !== "completed");
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const weekLimit = new Date(today.getTime() + 7 * DAY);
  const urgentTasks = tasks.filter((task) => {
    if (!task.dueDate) return false;
    const date = new Date(`${task.dueDate}T00:00:00`);
    return date < weekLimit;
  }).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)) || (a.priority === "high" ? -1 : 1));
  const dueCards = dueFlashcards(state.flashcardDecks, now);
  const sessionsToday = (state.focusSessions || []).filter((session) => {
    const date = new Date(session.startedAt || 0);
    return date.toDateString() === today.toDateString() && session.status === "completed";
  });
  const focusSeconds = sessionsToday.reduce((sum, session) => sum + Number(session.actualSeconds || 0), 0);
  const currentPlan = (state.studyPlans || []).filter((plan) => plan.date === getLocalDateKey(today) && plan.status !== "completed");
  return {
    activeLesson,
    urgentTasks,
    dueCards,
    sessionsToday,
    focusSeconds,
    currentPlan,
    totalCourses: courses.length,
    hasContent: lessons.length > 0,
  };
}

export function buildSearchIndex(state) {
  const lessons = flattenLessons(state.courses || []);
  const notes = (state.studyItems || []).filter((item) => !item.parentNoteId && item.sourceKind !== "nested-note");
  const tasks = state.tasks?.list || [];
  const decks = state.flashcardDecks || [];
  const commands = [
    // 📝 Criação & Conteúdo
    ["Criar nova nota", "Ação", "notes", "edit_note", "create-note"],
    ["Criar nova tarefa", "Ação", "tasks", "add_task", "create-task"],
    ["Criar novo curso", "Ação", "create_course", "school"],
    ["Cadastrar nova disciplina", "Ação", "disciplines", "menu_book", "create-discipline"],
    ["Criar novo deck de flashcards", "Ação", "create_flashcards", "style"],
    ["Capturar link / anotação rápida", "Ação", "knowledge_hub", "bookmark_add", "quick-capture"],
    ["Nova entrada no diário", "Ação", "journal", "auto_stories"],
    ["Novo projeto de programação", "Ação", "projects", "terminal", "create-project"],

    // ⏱️ Foco, Estudo & Revisão
    ["Iniciar Pomodoro (25 min)", "Foco", "pomodoro", "timer", "start-pomodoro"],
    ["Revisar cartões e flashcards", "Revisão", "flashcards", "psychology"],
    ["Modo Imersão (Estudo Focado)", "Foco", "immersion", "headphones"],
    ["Abrir tela Hoje (Dashboard)", "Navegar", "today", "dashboard"],
    ["Abrir Cursos e Módulos", "Navegar", "dashboard", "school"],
    ["Abrir Central Acadêmica", "Navegar", "academic", "history_edu"],
    ["Abrir Disciplinas", "Navegar", "disciplines", "menu_book"],
    ["Abrir Hub de Conhecimento", "Navegar", "knowledge_hub", "hub"],
    ["Abrir Vault de Materiais", "Navegar", "notes", "folder_open"],
    ["Abrir Biblioteca de Livros e PDFs", "Navegar", "books", "menu_book"],
    ["Abrir Quadro Branco (Whiteboard)", "Navegar", "whiteboard", "draw"],
    ["Abrir Code Lab (Programação)", "Navegar", "code_lab", "code"],
    ["Abrir Tarefas", "Navegar", "tasks", "task_alt"],
    ["Abrir Projetos", "Navegar", "projects", "terminal"],
    ["Abrir Diário", "Navegar", "journal", "auto_stories"],
    ["Abrir aula atual em andamento", "Navegar", "lesson", "play_circle"],

    // ⚙️ Sistema & Ferramentas
    ["Abrir Tradutor e OCR", "Ferramenta", "translator", "translate", "open-translator"],
    ["Abrir Configurações", "Sistema", "settings", "settings", "open-settings"],
    ["Alternar tema Claro / Escuro", "Aparência", "toggle-theme", "palette", "toggle-theme"],
    // Temas Claros
    ["Tema Claro: Clean Pearl", "Aparência", "theme-light", "light_mode", "set-theme:light"],
    ["Tema Claro: Catppuccin Latte", "Aparência", "theme-latte", "pets", "set-theme:catppuccin-latte"],
    ["Tema Claro: Rosé Pine Dawn", "Aparência", "theme-rose-dawn", "spa", "set-theme:rose-pine-dawn"],
    ["Tema Claro: Matcha Latte", "Aparência", "theme-matcha-latte", "park", "set-theme:matcha-latte"],
    ["Tema Claro: Nordic Snow", "Aparência", "theme-nord-light", "ac_unit", "set-theme:nord-light"],
    ["Tema Claro: Tokyo Day (Sakura)", "Aparência", "theme-tokyo-day", "local_florist", "set-theme:tokyo-day"],
    ["Tema Claro: Ocean Breeze", "Aparência", "theme-ocean", "water", "set-theme:ocean-breeze"],
    ["Tema Claro: Solarized Light", "Aparência", "theme-solarized", "wb_sunny", "set-theme:solarized-light"],
    ["Tema Claro: Café & Sepia Paper", "Aparência", "theme-sepia", "local_cafe", "set-theme:warm-sepia"],
    // Temas Escuros
    ["Tema Escuro: Midnight OLED (Preto Puro)", "Aparência", "theme-oled", "nightlight_round", "set-theme:midnight-oled"],
    ["Tema Escuro: Dracula Studio", "Aparência", "theme-dracula", "auto_awesome", "set-theme:dracula"],
    ["Tema Escuro: Catppuccin Mocha", "Aparência", "theme-catppuccin", "pets", "set-theme:catppuccin-mocha"],
    ["Tema Escuro: Tokyo Night", "Aparência", "theme-tokyo", "flash_on", "set-theme:tokyo-night"],
    ["Tema Escuro: Nordic Frost", "Aparência", "theme-nord", "ac_unit", "set-theme:nord"],
    ["Tema Escuro: Matcha & Forest", "Aparência", "theme-matcha", "park", "set-theme:matcha-forest"],
    ["Tema Escuro: Rosé Pine", "Aparência", "theme-rose", "spa", "set-theme:rose-pine"],
    ["Tema Escuro: Cyber Matrix", "Aparência", "theme-matrix", "terminal", "set-theme:cyber-matrix"],
    ["Tema Escuro: Slate Obsidian", "Aparência", "theme-dark", "dark_mode", "set-theme:dark"],
    ["Tema: Automático (Sistema)", "Aparência", "theme-system", "brightness_auto", "set-theme:system"],
    ["Exportar backup da biblioteca", "Sistema", "export", "file_download", "export"],
    ["Importar backup da biblioteca", "Sistema", "import", "file_upload", "import"],
    ["Desfazer última importação", "Sistema", "undo-import", "history", "undo-import"],
  ].map(([title, type, screen, icon, action]) => ({
    id: `command-${screen}-${title}`,
    title,
    type,
    screen,
    icon: icon || "bolt",
    action: action || null,
    search: `${title} ${type} ${screen} comando atalho`
  }));
  return [
    ...commands,
    ...(state.courses || []).map((item) => ({ id: item.id, title: item.title, type: "Curso", screen: "modules", courseId: item.id, search: `${item.title} ${item.description || ""}` })),
    ...lessons.map((item) => ({ id: item.id, title: item.title, type: "Aula", screen: "lesson", courseId: item.courseId, moduleId: item.moduleId, lessonId: item.id, search: `${item.title} ${item.courseTitle} ${item.moduleTitle}` })),
    ...notes.map((item) => ({ id: item.id, title: item.title || "Nota", type: "Nota", screen: "notes", noteId: item.id, search: `${item.title || ""} ${item.content || ""} ${(item.tags || []).join(" ")}` })),
    ...tasks.map((item) => ({ id: item.id, title: item.title, type: "Tarefa", screen: "tasks", taskId: item.id, search: `${item.title} ${item.description || ""}` })),
    ...decks.map((item) => ({ id: item.id, title: item.title || item.deckTitle || "Deck", type: "Deck", screen: "flashcards", deckId: item.id, search: `${item.title || item.deckTitle || ""}` })),
    ...((state.academic?.subjects || []).map((item) => ({ id: item.id, title: item.name, type: "Disciplina", screen: "academic_subject", academicSubjectId: item.id, search: `${item.name || ""} ${item.code || ""} ${item.professor || ""}` }))),
    ...((state.academic?.exams || []).map((item) => ({ id: item.id, title: item.title, type: "Prova", screen: "academic", search: `${item.title || ""} ${(item.topics || []).join(" ")}` }))),
    ...((state.academic?.references || []).map((item) => ({ id: item.id, title: item.title, type: "Referência", screen: "academic", search: `${item.title || ""} ${item.authors || ""} ${(item.tags || []).join(" ")}` }))),
  ];
}

export function scheduleTaskSessions(tasks = [], options = {}) {
  const dailyPomodoros = Math.max(1, options.dailyPomodoros || 2);
  const today = new Date(options.now || Date.now());
  today.setHours(0, 0, 0, 0);
  const sessions = [];
  const pending = tasks.filter((task) => task.status !== "completed" && task.dueDate && Number(task.estimatedPomodoros || 0) > 0).sort((a, b) => (a.priority === "high" ? -1 : 1) - (b.priority === "high" ? -1 : 1) || String(a.dueDate).localeCompare(String(b.dueDate)));
  for (const task of pending) {
    let remaining = Number(task.estimatedPomodoros || 0);
    const deadline = new Date(`${task.dueDate}T00:00:00`);
    for (let date = new Date(today); remaining > 0 && date <= deadline; date.setDate(date.getDate() + 1)) {
      const dateKey = getLocalDateKey(date);
      const used = sessions.filter((session) => session.date === dateKey).length;
      const available = Math.max(0, dailyPomodoros - used);
      for (let index = 0; index < available && remaining > 0; index += 1) {
        sessions.push({ id: `plan-${task.id}-${dateKey}-${index}`, taskId: task.id, date: dateKey, status: "planned", order: index });
        remaining -= 1;
      }
    }
  }
  return sessions;
}
