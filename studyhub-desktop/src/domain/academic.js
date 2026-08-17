import { getLocalDateKey } from "../utils/dateUtils.js";

export const ACADEMIC_COLLECTIONS = [
  "subjects",
  "events",
  "grades",
  "attendance",
  "exams",
  "projects",
  "questions",
  "references",
  "resources",
  "studySessions",
  "classLogs",
];

export const DEFAULT_ACADEMIC_SEMESTER_ID = "semester-current";
export const ACADEMIC_SEMESTER_STATUSES = ["active", "planned", "completed"];

export const DEFAULT_ACADEMIC_STUDY_PREFERENCES = {
  sessionMinutes: 50,
  availability: [],
};

const asArray = (value) => (Array.isArray(value) ? value : []);

const uniqueStrings = (values = []) => [
  ...new Set(values.map((value) => String(value || "").trim()).filter(Boolean)),
];

const clampNumber = (value, minimum, maximum, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
};

export const getSubjectLinkedCourseIds = (subject = {}) =>
  uniqueStrings([...asArray(subject.linkedCourseIds), subject.courseId]);

const normalizeSemesterStatus = (status, isArchived = false) => {
  if (isArchived) return "completed";
  return ACADEMIC_SEMESTER_STATUSES.includes(status) ? status : "active";
};

const createSemester = (semester = {}, id = DEFAULT_ACADEMIC_SEMESTER_ID) => ({
  id,
  name: String(semester.name || "Semestre atual").trim() || "Semestre atual",
  startDate: semester.startDate || "",
  endDate: semester.endDate || "",
  status: normalizeSemesterStatus(semester.status, semester.isArchived),
  createdAt: semester.createdAt ?? null,
  updatedAt: semester.updatedAt ?? null,
});

const normalizeSemesters = (academic = {}) => {
  const source =
    Array.isArray(academic.semesters) && academic.semesters.length
      ? academic.semesters
      : [academic.semester || {}];
  const usedIds = new Set();

  return source.map((semester, index) => {
    const fallbackId =
      index === 0 ? DEFAULT_ACADEMIC_SEMESTER_ID : `semester-${index + 1}`;
    const preferredId = String(semester?.id || fallbackId).trim() || fallbackId;
    let id = preferredId;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${preferredId}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);
    return createSemester(semester, id);
  });
};

export const createEmptyAcademicData = () => {
  const semester = createSemester();
  return {
    semesters: [semester],
    activeSemesterId: semester.id,
    // Kept as an active-semester alias for older backups and integrations.
    semester,
    subjects: [],
    events: [],
    grades: [],
    attendance: [],
    exams: [],
    projects: [],
    questions: [],
    references: [],
    resources: [],
    studySessions: [],
    classLogs: [],
    studyPreferences: { ...DEFAULT_ACADEMIC_STUDY_PREFERENCES },
    aiSourcePermissions: [],
  };
};

export const normalizeAcademicData = (academic = {}) => {
  const source =
    academic && typeof academic === "object" && !Array.isArray(academic)
      ? academic
      : {};
  const semesters = normalizeSemesters(source);
  const semesterIds = new Set(semesters.map((semester) => semester.id));
  const activeSemesterId = semesterIds.has(source.activeSemesterId)
    ? source.activeSemesterId
    : semesters.find((semester) => semester.status === "active")?.id ||
      semesters[0].id;
  const semester =
    semesters.find((item) => item.id === activeSemesterId) || semesters[0];
  const rawSubjects = Array.isArray(source.subjects) ? source.subjects : [];
  const subjects = rawSubjects.map((subject) => {
    const linkedCourseIds = getSubjectLinkedCourseIds(subject);
    return {
      ...subject,
      linkedCourseIds,
      // Keep the legacy alias while old screens/backups still read it.
      courseId: linkedCourseIds[0] || null,
      difficulty: clampNumber(subject.difficulty, 1, 5, 3),
      weeklyStudyGoalMinutes: clampNumber(
        subject.weeklyStudyGoalMinutes,
        0,
        10_080,
        120,
      ),
      isArchived: Boolean(subject.isArchived),
      semesterId: semesterIds.has(subject.semesterId)
        ? subject.semesterId
        : activeSemesterId,
    };
  });
  const subjectSemesters = new Map(
    subjects.map((subject) => [subject.id, subject.semesterId]),
  );
  const collections = Object.fromEntries(
    ACADEMIC_COLLECTIONS.filter((key) => key !== "subjects").map((key) => [
      key,
      (Array.isArray(source[key]) ? source[key] : []).map((entity) => ({
        ...entity,
        semesterId:
          subjectSemesters.get(entity.subjectId) ||
          (semesterIds.has(entity.semesterId)
            ? entity.semesterId
            : activeSemesterId),
      })),
    ]),
  );

  return {
    ...source,
    semesters,
    activeSemesterId,
    semester,
    subjects,
    ...collections,
    aiChatHistories:
      source.aiChatHistories && typeof source.aiChatHistories === "object"
        ? source.aiChatHistories
        : {},
    aiSourcePermissions: asArray(source.aiSourcePermissions).filter(
      (permission) => permission?.sourceKey && permission?.subjectId,
    ),
    studyPreferences: {
      ...DEFAULT_ACADEMIC_STUDY_PREFERENCES,
      ...(source.studyPreferences || {}),
      sessionMinutes: clampNumber(
        source.studyPreferences?.sessionMinutes,
        15,
        180,
        DEFAULT_ACADEMIC_STUDY_PREFERENCES.sessionMinutes,
      ),
      availability: asArray(source.studyPreferences?.availability)
        .map((window) => ({
          id:
            window.id ||
            `availability-${window.weekday}-${window.startTime}-${window.endTime}`,
          weekday: clampNumber(window.weekday, 0, 6, 1),
          startTime: window.startTime || "19:00",
          endTime: window.endTime || "21:00",
          enabled: window.enabled !== false,
        }))
        .filter((window) => window.startTime < window.endTime),
    },
  };
};

export function getAcademicSemesterData(academic = {}, semesterId) {
  const normalized = normalizeAcademicData(academic);
  const selectedSemesterId = normalized.semesters.some(
    (semester) => semester.id === semesterId,
  )
    ? semesterId
    : normalized.activeSemesterId;
  const semester =
    normalized.semesters.find((item) => item.id === selectedSemesterId) ||
    normalized.semesters[0];

  const semesterSubjects = normalized.subjects.filter(
    (subject) =>
      subject.semesterId === selectedSemesterId && !subject.isArchived,
  );
  const visibleSubjectIds = new Set(
    semesterSubjects.map((subject) => subject.id),
  );

  return {
    ...normalized,
    activeSemesterId: selectedSemesterId,
    semester,
    ...Object.fromEntries(
      ACADEMIC_COLLECTIONS.map((key) => [
        key,
        key === "subjects"
          ? semesterSubjects
          : normalized[key].filter(
              (entity) =>
                entity.semesterId === selectedSemesterId &&
                (!entity.subjectId || visibleSubjectIds.has(entity.subjectId)),
            ),
      ]),
    ),
  };
}

export function calculateSubjectGrade(grades = [], subject = {}) {
  const subjectGrades = grades.filter(
    (grade) => grade.subjectId === subject.id && Number(grade.maxScore) > 0,
  );
  const weightedPoints = subjectGrades.reduce((sum, grade) => {
    const normalized = (Number(grade.score || 0) / Number(grade.maxScore)) * 10;
    return sum + normalized * Number(grade.weight || 0);
  }, 0);
  const completedWeight = subjectGrades.reduce(
    (sum, grade) => sum + Number(grade.weight || 0),
    0,
  );
  const currentAverage =
    completedWeight > 0 ? weightedPoints / completedWeight : 0;
  const passingGrade = Number(subject.passingGrade ?? 6);
  const remainingWeight = Math.max(0, 100 - completedWeight);
  const neededAverage =
    remainingWeight > 0
      ? Math.max(0, (passingGrade * 100 - weightedPoints) / remainingWeight)
      : null;

  return {
    currentAverage,
    completedWeight,
    remainingWeight,
    neededAverage,
    projectedFinal: weightedPoints / 100,
  };
}

export function calculateAttendance(entries = [], subject = {}, classLogs = []) {
  const attendanceByDate = new Map();
  let noDateIndex = 0;

  (entries || [])
    .filter((entry) => entry.subjectId === subject.id)
    .forEach((entry) => {
      const key = entry.date || `nodate_${noDateIndex++}`;
      const statusMapped =
        entry.status === "attended" || entry.status === "present"
          ? "present"
          : entry.status;
      attendanceByDate.set(key, statusMapped);
    });

  (classLogs || [])
    .filter((log) => log.subjectId === subject.id)
    .forEach((log) => {
      if (log.date && !attendanceByDate.has(log.date)) {
        const st =
          log.attendanceStatus === "attended" || log.attendanceStatus === "present"
            ? "present"
            : log.attendanceStatus === "absent"
              ? "absent"
              : log.attendanceStatus;
        if (st) attendanceByDate.set(log.date, st);
      }
    });

  const records = Array.from(attendanceByDate.values());
  const absences = records.filter((st) => st === "absent").length;
  const late = records.filter((st) => st === "late").length;
  const attended = records.length - absences;
  const attendanceRate = records.length
    ? (attended / records.length) * 100
    : 100;
  const minimum = Number(subject.minimumAttendance ?? 75);
  return {
    total: records.length,
    absences,
    late,
    attended,
    attendanceRate,
    percentage: attendanceRate,
    minimum,
    atRisk: records.length > 0 && attendanceRate < minimum + 5,
  };
}

const toDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export function buildExamPlan(exam, options = {}) {
  const studyDays = Math.max(
    2,
    Number(options.studyDays || exam.studyDays || 5),
  );
  const examDate = new Date(`${exam.date}T12:00:00`);
  if (Number.isNaN(examDate.getTime())) return [];
  const topics = (exam.topics || [])
    .map((topic) => (typeof topic === "string" ? topic : topic.title))
    .filter(Boolean);
  const safeTopics = topics.length ? topics : ["Revisão geral"];
  const plan = [];

  for (let offset = studyDays; offset >= 1; offset -= 1) {
    const date = new Date(examDate);
    date.setDate(date.getDate() - offset);
    const dayIndex = studyDays - offset;
    const isLastDay = offset === 1;
    const topic = safeTopics[dayIndex % safeTopics.length];
    plan.push({
      id: `exam-plan-${exam.id}-${toDateKey(date)}-${dayIndex}`,
      date: toDateKey(date),
      title: isLastDay
        ? `Simulado e revisão final: ${exam.title}`
        : `Estudar: ${topic}`,
      topic,
      kind: isLastDay
        ? "mock"
        : dayIndex >= safeTopics.length
          ? "review"
          : "study",
      completed: false,
    });
  }

  return plan;
}

export function formatAcademicCitation(reference, style = "abnt") {
  const authors = String(reference.authors || "Autor desconhecido").trim();
  const title = String(reference.title || "Sem título").trim();
  const year = String(reference.year || "s.d.").trim();
  const publisher = String(reference.publisher || "").trim();
  const url = String(reference.url || reference.doi || "").trim();

  if (style === "apa") {
    return `${authors}. (${year}). ${title}.${publisher ? ` ${publisher}.` : ""}${url ? ` ${url}` : ""}`;
  }

  return `${authors.toUpperCase()}. ${title}.${publisher ? ` ${publisher},` : ""} ${year}.${url ? ` Disponível em: ${url}.` : ""}`;
}

export function getProjectProgress(project = {}) {
  const subtasks = project.subtasks || [];
  if (!subtasks.length) return Number(project.progress || 0);
  return Math.round(
    (subtasks.filter((item) => item.completed).length / subtasks.length) * 100,
  );
}

export function getUpcomingAcademicItems(
  academic,
  tasks = [],
  now = new Date(),
) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setDate(end.getDate() + 14);
  const items = [
    ...(academic.events || []).map((item) => ({ ...item, source: "event" })),
    ...(academic.exams || []).map((item) => ({
      ...item,
      title: item.title || "Prova",
      type: "exam",
      source: "exam",
    })),
    ...(academic.projects || []).map((item) => ({
      ...item,
      date: item.dueDate,
      type: "project",
      source: "project",
    })),
    ...tasks.map((item) => ({
      ...item,
      subjectId: item.subjectId || item.academicSubjectId || null,
      date: item.dueDate,
      type: item.type || "task",
      source: "task",
    })),
  ];

  return items
    .filter((item) => item.date)
    .filter((item) => {
      const date = new Date(`${item.date}T12:00:00`);
      return date >= today && date <= end;
    })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

export const toAcademicDateKey = (value = new Date()) => {
  // If already a Date instance, format it using local date components.
  if (value instanceof Date) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // If it's a plain YYYY-MM-DD string, treat it as a date-key already and return unchanged.
  if (typeof value === "string") {
    const isoDateOnly = /^\d{4}-\d{2}-\d{2}$/;
    if (isoDateOnly.test(value)) return value;
    // Otherwise try to parse other string formats (ISO with time, timestamps, etc.).
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // Fallback: coerce other types (numbers, etc.) to Date and format.
  const coerced = new Date(value);
  if (Number.isNaN(coerced.getTime())) return "";
  const year = coerced.getFullYear();
  const month = String(coerced.getMonth() + 1).padStart(2, "0");
  const day = String(coerced.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const fromDateKey = (value) => {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const addDateDays = (value, amount) => {
  const date = value instanceof Date ? new Date(value) : fromDateKey(value);
  if (!date) return null;
  date.setDate(date.getDate() + amount);
  return date;
};

const timeToMinutes = (value = "00:00") => {
  const [hours, minutes] = String(value).split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return hours * 60 + minutes;
};

const minutesToTime = (value) => {
  const safe = Math.max(0, Math.min(24 * 60 - 1, Math.round(value)));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(
    safe % 60,
  ).padStart(2, "0")}`;
};

const rangesOverlap = (startA, endA, startB, endB) =>
  startA < endB && startB < endA;

export function resolveAcademicSubjectId(item = {}, subjects = []) {
  const explicit = item.academicSubjectId || item.subjectId;
  if (explicit && subjects.some((subject) => subject.id === explicit)) {
    return explicit;
  }
  if (item.academicContextExplicit) return null;

  const courseId =
    item.sourceCourseId || item.courseId || item.context?.courseId || null;
  if (!courseId) return null;
  return (
    subjects.find((subject) =>
      getSubjectLinkedCourseIds(subject).includes(courseId),
    )?.id || null
  );
}

export function normalizeAcademicStateSnapshot(state = {}) {
  const academic = normalizeAcademicData(state.academic);
  const subjects = academic.subjects;
  const withContext = (item = {}) => {
    const subjectId = resolveAcademicSubjectId(item, subjects);
    const subject = subjects.find((candidate) => candidate.id === subjectId);
    return subject
      ? {
          ...item,
          academicSubjectId: subject.id,
          academicSemesterId: subject.semesterId,
        }
      : item;
  };
  const sourceStudyItems = asArray(state.studyItems).length
    ? asArray(state.studyItems)
    : asArray(state.notes?.list);
  const studyItems = sourceStudyItems.map((item) => {
    const itemType =
      item.itemType ||
      (item.noteType === "drawing" || item.type === "drawing"
        ? "drawing"
        : "note");
    return withContext({
      ...item,
      itemType,
      type: itemType,
      noteType: itemType === "drawing" ? "drawing" : item.noteType || "note",
      sourceKind:
        item.sourceKind || (itemType === "drawing" ? "drawing-note" : "note"),
    });
  });
  const visibleNotes = studyItems.filter((item) => !item.isArchived);
  const tasks = asArray(state.tasks?.list).map(withContext);
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const courseByLesson = lessonContext(asArray(state.courses));
  const focusSessions = asArray(state.focusSessions).map((session) => {
    if (session.academicSubjectId) return session;
    const task = taskById.get(session.taskId);
    if (task?.academicSubjectId) {
      return {
        ...session,
        academicSubjectId: task.academicSubjectId,
        academicSemesterId: task.academicSemesterId,
      };
    }
    const lesson = courseByLesson.get(session.lessonId);
    const subject = subjects.find((candidate) =>
      getSubjectLinkedCourseIds(candidate).includes(lesson?.courseId),
    );
    return subject
      ? {
          ...session,
          academicSubjectId: subject.id,
          academicSemesterId: subject.semesterId,
        }
      : session;
  });
  return {
    ...state,
    academic,
    studyItems,
    notes: {
      ...(state.notes || {}),
      totalNotes: visibleNotes.length,
      totalModules: state.notes?.totalModules || 1,
      list: visibleNotes,
    },
    tasks: { ...(state.tasks || {}), list: tasks },
    flashcardDecks: asArray(state.flashcardDecks).map(withContext),
    focusSessions,
    activeAcademicSubjectId: state.activeAcademicSubjectId || null,
  };
}

const lessonContext = (courses = []) =>
  new Map(
    courses.flatMap((course) => [
      // top-level course lessons
      ...asArray(course.lessons).map((lesson) => [lesson.id, { courseId: course.id, moduleId: null, lesson }]),
      // module lessons
      ...asArray(course.modules).flatMap((module) =>
        asArray(module.lessons).map((lesson) => [
          lesson.id,
          { courseId: course.id, moduleId: module.id, lesson },
        ]),
      ),
    ]),
  );

export function getAcademicSubjectHub(state = {}, subjectId, now = new Date()) {
  const academic = normalizeAcademicData(state.academic);
  const subject = academic.subjects.find((item) => item.id === subjectId);
  if (!subject) return null;

  const linkedCourseIds = new Set(getSubjectLinkedCourseIds(subject));
  const courses = asArray(state.courses).filter((course) =>
    linkedCourseIds.has(course.id),
  );
  const lessons = courses.flatMap((course) => {
    const topLevel = asArray(course.lessons).map((lesson) => ({
      ...lesson,
      courseId: course.id,
      courseTitle: course.title,
      moduleId: null,
      moduleTitle: null,
    }));
    const fromModules = asArray(course.modules).flatMap((module) =>
      asArray(module.lessons).map((lesson) => ({
        ...lesson,
        courseId: course.id,
        courseTitle: course.title,
        moduleId: module.id,
        moduleTitle: module.title,
      })),
    );
    return [...topLevel, ...fromModules];
  });
  const subjects = academic.subjects;
  const matchesSubject = (item) =>
    resolveAcademicSubjectId(item, subjects) === subject.id;
  const notes = asArray(state.studyItems).filter(
    (item) => !item.isArchived && !item.parentNoteId && item.sourceKind !== "nested-note" && matchesSubject(item),
  );
  const tasks = asArray(state.tasks?.list).filter(matchesSubject);
  const decks = asArray(state.flashcardDecks).filter(matchesSubject);
  const projects = academic.projects.filter(
    (item) => item.subjectId === subject.id,
  );
  const exams = academic.exams.filter((item) => item.subjectId === subject.id);
  const grades = academic.grades.filter(
    (item) => item.subjectId === subject.id,
  );
  const attendance = academic.attendance.filter(
    (item) => item.subjectId === subject.id,
  );
  const resources = academic.resources.filter(
    (item) => item.subjectId === subject.id,
  );
  const references = academic.references.filter(
    (item) => item.subjectId === subject.id,
  );
  const studySessions = academic.studySessions.filter(
    (item) => item.subjectId === subject.id,
  );
  const classLogs = asArray(academic.classLogs)
    .filter((item) => item.subjectId === subject.id)
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || (b.lessonNumber || 0) - (a.lessonNumber || 0));
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const lessonById = lessonContext(asArray(state.courses));
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  const day = weekStart.getDay();
  weekStart.setDate(weekStart.getDate() - (day === 0 ? 6 : day - 1));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const focusSessions = asArray(state.focusSessions).filter((session) => {
    const timestamp = session.endedAt || session.startedAt || 0;
    if (timestamp < weekStart.getTime() || timestamp >= weekEnd.getTime()) {
      return false;
    }
    if (session.academicSubjectId === subject.id) return true;
    const task = taskById.get(session.taskId);
    if (task && matchesSubject(task)) return true;
    const lesson = lessonById.get(session.lessonId);
    return lesson ? linkedCourseIds.has(lesson.courseId) : false;
  });
  const weeklyFocusMinutes = Math.round(
    focusSessions.reduce(
      (total, session) =>
        total + Number(session.actualSeconds || session.plannedSeconds || 0),
      0,
    ) / 60,
  );
  const completedLessons = lessons.filter(
    (lesson) => lesson.status === "completed",
  ).length;
  const progress = lessons.length
    ? Math.round((completedLessons / lessons.length) * 100)
    : courses.length
      ? Math.round(
          courses.reduce(
            (total, course) => total + Number(course.progress || 0),
            0,
          ) / courses.length,
        )
      : 0;
  const upcoming = [
    ...exams.map((item) => ({ ...item, date: item.date, source: "exam" })),
    ...projects.map((item) => ({
      ...item,
      date: item.dueDate,
      source: "project",
    })),
    ...tasks.map((item) => ({ ...item, date: item.dueDate, source: "task" })),
  ]
    .filter((item) => item.date && item.date >= toAcademicDateKey(now))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  return {
    academic,
    subject,
    courses,
    lessons,
    classLogs,
    notes,
    tasks,
    decks,
    projects,
    exams,
    grades,
    attendance,
    resources,
    references,
    studySessions,
    focusSessions,
    weeklyFocusMinutes,
    progress,
    completedLessons,
    upcoming,
    gradeSummary: calculateSubjectGrade(academic.grades, subject),
    attendanceSummary: calculateAttendance(academic.attendance, subject),
  };
}

const eventWithinRange = (event, startDate, endDate) =>
  Boolean(event.date && event.date >= startDate && event.date <= endDate);

const calendarEvent = (item, subject, overrides = {}) => {
  // Normalize date strings to YYYY-MM-DD so grouping and comparisons work
  const rawDate = overrides.date || item.date || item.dueDate || null;
  const date = rawDate ? toAcademicDateKey(rawDate) : null;
  return {
    id: overrides.id || `${overrides.source || "academic"}-${item.id}`,
    title: overrides.title || item.title || "Compromisso acadêmico",
    date,
    startTime: overrides.startTime ?? item.time ?? item.startTime ?? "",
    endTime: overrides.endTime ?? item.endTime ?? "",
    allDay:
      overrides.allDay ?? !(overrides.startTime ?? item.time ?? item.startTime),
    type: overrides.type || item.type || "event",
    source: overrides.source || "event",
    subjectId: overrides.subjectId || item.subjectId || subject?.id || null,
    subjectName:
      overrides.subjectName || item.subjectName || subject?.name || null,
    semesterId:
      overrides.semesterId || item.semesterId || subject?.semesterId || null,
    color: overrides.color || subject?.color || "#8b5cf6",
    status: overrides.status || item.status || null,
    original: item,
  };
};

export function buildAcademicCalendarEvents(state = {}, options = {}) {
  const normalized = normalizeAcademicData(state.academic);
  const academic = getAcademicSemesterData(
    normalized,
    options.semesterId || normalized.activeSemesterId,
  );
  const today = toAcademicDateKey(options.now || new Date());
  const startDate =
    options.startDate ||
    getLocalDateKey(addDateDays(today, -31)) ||
    today;
  const endDate =
    options.endDate ||
    getLocalDateKey(addDateDays(today, 62)) ||
    today;
  const subjects = academic.subjects.filter((subject) => !subject.isArchived);
  const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));
  const result = [];

  for (const subject of subjects) {
    const scheduleDays = asArray(subject.schedule?.days).map(Number);
    if (!scheduleDays.length) continue;
    const effectiveStart = [startDate, academic.semester.startDate]
      .filter(Boolean)
      .sort()
      .at(-1);
    const effectiveEnd = [endDate, academic.semester.endDate]
      .filter(Boolean)
      .sort()[0];
    let cursor = fromDateKey(effectiveStart);
    const last = fromDateKey(effectiveEnd);
    while (cursor && last && cursor <= last) {
      if (scheduleDays.includes(cursor.getDay())) {
        const date = toAcademicDateKey(cursor);
        result.push(
          calendarEvent(subject, subject, {
            id: `class-${subject.id}-${date}`,
            title: subject.name,
            date,
            startTime: subject.schedule?.startTime || "",
            endTime: subject.schedule?.endTime || "",
            type: "class",
            source: "class",
          }),
        );
      }
      cursor = addDateDays(cursor, 1);
    }
  }

  const pushCollection = (items, mapper) => {
    for (const item of items) {
      // Allow items without an explicit subject to appear on the calendar.
      // `subject` may be undefined/null and calendarEvent already tolerates that.
      const subject = subjectById.get(item.subjectId || item.academicSubjectId) || null;
      const event = mapper(item, subject);
      if (eventWithinRange(event, startDate, endDate)) result.push(event);
    }
  };
  pushCollection(academic.events, (item, subject) =>
    calendarEvent(item, subject, { source: "event" }),
  );
  pushCollection(academic.exams, (item, subject) =>
    calendarEvent(item, subject, { source: "exam", type: "exam" }),
  );
  pushCollection(academic.projects, (item, subject) =>
    calendarEvent(item, subject, {
      date: item.dueDate,
      source: "project",
      type: "project",
    }),
  );
  pushCollection(academic.studySessions, (item, subject) =>
    calendarEvent(item, subject, {
      source: "study-session",
      type: item.kind || "study",
      startTime: item.startTime || "",
      endTime:
        item.endTime ||
        minutesToTime(
          timeToMinutes(item.startTime) + Number(item.durationMinutes || 50),
        ),
    }),
  );

  // Tasks created from quick-entry surfaces (such as Hoje) can come from
  // either the persisted `{ list: [] }` shape or directly as an array. Keep
  // them visible even when they do not belong to a subject yet.
  const taskItems = Array.isArray(state.tasks)
    ? state.tasks
    : asArray(state.tasks?.list || state.tasks?.items);
  for (const task of taskItems) {
    // Include tasks even if no subject could be resolved — they should still
    // appear on the calendar if they have a due date.
    const taskDate = task.dueDate || task.date || task.deadline;
    if (!taskDate) continue;
    const subjectId = resolveAcademicSubjectId(task, subjects);
    const subject = subjectById.get(subjectId) || null;
    const event = calendarEvent(task, subject, {
      date: taskDate,
      startTime: task.dueTime || "",
      source: "task",
      type: task.type || "task",
      subjectId,
    });
    if (eventWithinRange(event, startDate, endDate)) result.push(event);
  }

  const classNotes = asArray(state.studyItems || state.notes?.list).filter(
    (item) => item.category === "Nota de aula"
  );
  pushCollection(classNotes, (item, subject) =>
    calendarEvent(item, subject, {
      date: item.createdAt ? getLocalDateKey(item.createdAt) : "",
      source: "note",
      type: "class_note",
      title: item.title,
    }),
  );

  for (const deck of asArray(state.flashcardDecks)) {
    const subjectId = resolveAcademicSubjectId(deck, subjects);
    const subject = subjectById.get(subjectId);
    if (!subject) continue;
    const dueByDate = new Map();
    // Only include reviews that are due today or earlier — exclude future scheduled reviews
    const todayKey = toAcademicDateKey(new Date());
    for (const card of asArray(deck.cards)) {
      const date = toAcademicDateKey(card.dueDate || Date.now());
      // skip invalid dates, dates beyond the calendar end range, and future reviews
      if (!date || date > endDate || date > todayKey) continue;
      const visibleDate = date < startDate ? startDate : date;
      dueByDate.set(visibleDate, (dueByDate.get(visibleDate) || 0) + 1);
    }
    for (const [date, count] of dueByDate) {
      result.push(
        calendarEvent(deck, subject, {
          id: `review-${deck.id}-${date}`,
          title: `${count} revisão${count === 1 ? "" : "ões"}: ${deck.title || "Flashcards"}`,
          date,
          source: "review",
          type: "review",
          subjectId,
        }),
      );
    }
  }

  return result.sort((a, b) =>
    `${a.date} ${a.startTime || "23:59"} ${a.title}`.localeCompare(
      `${b.date} ${b.startTime || "23:59"} ${b.title}`,
    ),
  );
}

export function getAcademicRecommendations(state = {}, options = {}) {
  const academic = getAcademicSemesterData(
    state.academic,
    options.semesterId || state.academic?.activeSemesterId,
  );
  const subjects = academic.subjects.filter((subject) => !subject.isArchived);
  const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));
  const today = toAcademicDateKey(options.now || new Date());
  const tomorrow = toAcademicDateKey(addDateDays(today, 1));
  const inSevenDays = toAcademicDateKey(addDateDays(today, 7));
  const durationMinutes = [25, 50, 90].includes(Number(options.durationMinutes))
    ? Number(options.durationMinutes)
    : 50;
  const items = [];
  const add = (rank, item) => items.push({ rank, durationMinutes, ...item });

  const deliveries = [
    ...asArray(state.tasks?.list)
      .filter((task) => task.status !== "completed" && task.dueDate)
      .map((task) => ({
        ...task,
        date: task.dueDate,
        subjectId: resolveAcademicSubjectId(task, subjects),
        kind: "task",
      })),
    ...academic.projects
      .filter((project) => project.status !== "completed" && project.dueDate)
      .map((project) => ({
        ...project,
        date: project.dueDate,
        kind: "project",
      })),
  ].filter((item) => subjectById.has(item.subjectId));

  for (const item of deliveries) {
    const subject = subjectById.get(item.subjectId);
    if (item.date < today) {
      add(0, {
        id: `overdue-${item.kind}-${item.id}`,
        kind: item.kind,
        title: item.title,
        reason: `Atrasado desde ${item.date} · ${subject.name}`,
        date: item.date,
        subjectId: subject.id,
        sourceId: item.id,
      });
    } else if (item.date <= tomorrow) {
      add(1, {
        id: `urgent-${item.kind}-${item.id}`,
        kind: item.kind,
        title: item.title,
        reason: `${item.date === today ? "Entrega hoje" : "Entrega amanhã"} · ${subject.name}`,
        date: item.date,
        subjectId: subject.id,
        sourceId: item.id,
      });
    }
  }

  for (const exam of academic.exams) {
    const subject = subjectById.get(exam.subjectId);
    if (
      !subject ||
      !exam.date ||
      exam.date < today ||
      exam.date > inSevenDays
    ) {
      continue;
    }
    const days = Math.max(
      0,
      Math.round((fromDateKey(exam.date) - fromDateKey(today)) / 86_400_000),
    );
    add(2, {
      id: `exam-${exam.id}`,
      kind: "exam",
      title: `Estudar para ${exam.title || "a prova"}`,
      reason: `${subject.name} · prova em ${days === 0 ? "hoje" : `${days} dia${days === 1 ? "" : "s"}`}`,
      date: exam.date,
      subjectId: subject.id,
      sourceId: exam.id,
    });
  }

  for (const subject of subjects) {
    const grade = calculateSubjectGrade(academic.grades, subject);
    const attendance = calculateAttendance(academic.attendance, subject);
    if (
      grade.completedWeight > 0 &&
      grade.currentAverage < Number(subject.passingGrade ?? 6)
    ) {
      add(3, {
        id: `grade-risk-${subject.id}`,
        kind: "academic-risk",
        title: `Reforçar ${subject.name}`,
        reason: `Média atual ${grade.currentAverage.toFixed(1)}; meta ${Number(subject.passingGrade ?? 6).toFixed(1)}`,
        subjectId: subject.id,
      });
    } else if (attendance.atRisk) {
      add(3, {
        id: `attendance-risk-${subject.id}`,
        kind: "academic-risk",
        title: `Revisar situação em ${subject.name}`,
        reason: `Frequência em ${attendance.attendanceRate.toFixed(0)}%`,
        subjectId: subject.id,
      });
    }
  }

  const nowTimestamp = (
    options.now instanceof Date
      ? options.now
      : new Date(options.now || Date.now())
  ).getTime();
  for (const deck of asArray(state.flashcardDecks)) {
    const subjectId = resolveAcademicSubjectId(deck, subjects);
    const subject = subjectById.get(subjectId);
    if (!subject) continue;
    const dueCount = asArray(deck.cards).filter(
      (card) => !card.dueDate || card.dueDate <= nowTimestamp,
    ).length;
    if (!dueCount) continue;
    add(4, {
      id: `review-${deck.id}`,
      kind: "review",
      title: `Revisar ${deck.title || "flashcards"}`,
      reason: `${dueCount} cartão${dueCount === 1 ? "" : "ões"} pendente${dueCount === 1 ? "" : "s"} · ${subject.name}`,
      subjectId,
      sourceId: deck.id,
      durationMinutes: 25,
    });
  }

  for (const subject of subjects) {
    const hub = getAcademicSubjectHub(
      state,
      subject.id,
      options.now || new Date(),
    );
    const goal = Number(subject.weeklyStudyGoalMinutes || 0);
    if (!goal || !hub || hub.weeklyFocusMinutes >= goal) continue;
    add(5, {
      id: `weekly-goal-${subject.id}`,
      kind: "weekly-goal",
      title: `Avançar em ${subject.name}`,
      reason: `${hub.weeklyFocusMinutes}/${goal} min da meta semanal`,
      subjectId: subject.id,
    });
  }

  return items
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        String(a.date || "9999-12-31").localeCompare(
          String(b.date || "9999-12-31"),
        ) ||
        a.durationMinutes - b.durationMinutes,
    )
    .slice(0, Number(options.limit || 6));
}

const enumerateStudySlots = ({
  startDate,
  endDate,
  availability,
  sessionMinutes,
  busyEvents = [],
}) => {
  const slots = [];
  let cursor = fromDateKey(startDate);
  const last = fromDateKey(endDate);
  while (cursor && last && cursor <= last) {
    const date = toAcademicDateKey(cursor);
    const windows = availability.filter(
      (window) =>
        window.enabled !== false && Number(window.weekday) === cursor.getDay(),
    );
    for (const window of windows) {
      let start = timeToMinutes(window.startTime);
      const windowEnd = timeToMinutes(window.endTime);
      while (start + sessionMinutes <= windowEnd) {
        const end = start + sessionMinutes;
        const blocked = busyEvents.some(
          (event) =>
            event.date === date &&
            event.startTime &&
            rangesOverlap(
              start,
              end,
              timeToMinutes(event.startTime),
              timeToMinutes(event.endTime || event.startTime) +
                (event.endTime ? 0 : Number(event.durationMinutes || 50)),
            ),
        );
        if (!blocked) {
          slots.push({
            date,
            startTime: minutesToTime(start),
            endTime: minutesToTime(end),
            durationMinutes: sessionMinutes,
          });
        }
        start = end;
      }
    }
    cursor = addDateDays(cursor, 1);
  }
  return slots;
};

export function buildAdaptiveStudyPlan(exam = {}, options = {}) {
  const today = toAcademicDateKey(options.now || new Date());
  const endDate = toAcademicDateKey(addDateDays(exam.date, -1));
  const preferences = {
    ...DEFAULT_ACADEMIC_STUDY_PREFERENCES,
    ...(options.preferences || {}),
  };
  const availability = asArray(preferences.availability).filter(
    (window) => window.enabled !== false,
  );
  if (!exam.date || endDate < today || !availability.length) {
    return {
      sessions: [],
      needsAvailability: !availability.length,
      unscheduledCount: asArray(exam.topics).length || 1,
    };
  }
  const sessionMinutes = clampNumber(
    options.sessionMinutes || preferences.sessionMinutes,
    15,
    180,
    50,
  );
  const topics = (asArray(exam.topics).length ? exam.topics : ["Revisão geral"])
    .map((topic, index) =>
      typeof topic === "string"
        ? {
            id: `topic-${index}`,
            title: topic,
            difficulty: Number(exam.difficulty || 3),
            estimatedMinutes: sessionMinutes,
          }
        : {
            id: topic.id || `topic-${index}`,
            title: topic.title || `Tópico ${index + 1}`,
            difficulty: clampNumber(
              topic.difficulty,
              1,
              5,
              exam.difficulty || 3,
            ),
            estimatedMinutes: clampNumber(
              topic.estimatedMinutes,
              15,
              2_000,
              sessionMinutes,
            ),
          },
    )
    .sort((a, b) => b.difficulty - a.difficulty);
  const queue = topics.flatMap((topic) =>
    Array.from(
      {
        length: Math.max(1, Math.ceil(topic.estimatedMinutes / sessionMinutes)),
      },
      (_value, index) => ({ ...topic, part: index + 1 }),
    ),
  );
  const plannedCount = queue.length + 2;
  const slots = enumerateStudySlots({
    startDate: today,
    endDate,
    availability,
    sessionMinutes,
    busyEvents: [
      ...asArray(options.busyEvents),
      ...asArray(options.existingSessions).map((session) => ({
        ...session,
        endTime:
          session.endTime ||
          minutesToTime(
            timeToMinutes(session.startTime) +
              Number(session.durationMinutes || sessionMinutes),
          ),
      })),
    ],
  });
  const count = Math.min(plannedCount, slots.length);
  const selectedSlots = [];
  for (let index = 0; index < count; index += 1) {
    const slotIndex =
      count === 1 ? 0 : Math.round((index * (slots.length - 1)) / (count - 1));
    const slot = slots[slotIndex];
    if (slot && !selectedSlots.includes(slot)) selectedSlots.push(slot);
  }
  const sessions = selectedSlots.map((slot, index) => {
    const studyCount = Math.max(0, selectedSlots.length - 2);
    const isMock =
      index === selectedSlots.length - 1 && selectedSlots.length > 1;
    const isReview = !isMock && index >= studyCount;
    const topic = queue[Math.min(index, Math.max(0, queue.length - 1))];
    const kind = isMock ? "mock" : isReview ? "review" : "study";
    const title = isMock
      ? `Simulado: ${exam.title || "prova"}`
      : isReview
        ? `Revisão final: ${exam.title || "prova"}`
        : `Estudar: ${topic?.title || "Revisão geral"}${topic?.part > 1 ? ` · parte ${topic.part}` : ""}`;
    return {
      id: `adaptive-${exam.id}-${slot.date}-${slot.startTime.replace(":", "")}-${index}`,
      examId: exam.id,
      subjectId: exam.subjectId,
      semesterId: exam.semesterId || options.semesterId,
      title,
      topicId: topic?.id || null,
      topic: topic?.title || "Revisão geral",
      kind,
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      durationMinutes: slot.durationMinutes,
      status: "pending",
      generated: true,
      createdAt: Date.now(),
    };
  });
  return {
    sessions,
    needsAvailability: false,
    unscheduledCount: Math.max(0, plannedCount - sessions.length),
  };
}

export function redistributeMissedStudySessions(
  exam = {},
  sessions = [],
  options = {},
) {
  const today = toAcademicDateKey(options.now || new Date());
  const missed = sessions.filter(
    (session) =>
      session.generated &&
      session.status !== "completed" &&
      session.date < today,
  );
  if (!missed.length) return { sessions, moved: 0, remaining: 0 };
  const preserved = sessions.filter((session) => !missed.includes(session));
  const preferences = {
    ...DEFAULT_ACADEMIC_STUDY_PREFERENCES,
    ...(options.preferences || {}),
  };
  const slots = enumerateStudySlots({
    startDate: today,
    endDate: toAcademicDateKey(addDateDays(exam.date, -1)),
    availability: asArray(preferences.availability),
    sessionMinutes: Number(preferences.sessionMinutes || 50),
    busyEvents: [
      ...asArray(options.busyEvents),
      ...preserved.map((session) => ({
        ...session,
        endTime:
          session.endTime ||
          minutesToTime(
            timeToMinutes(session.startTime) +
              Number(session.durationMinutes || 50),
          ),
      })),
    ],
  });
  const moved = missed.slice(0, slots.length).map((session, index) => ({
    ...session,
    ...slots[index],
    status: "pending",
    rescheduledAt: Date.now(),
  }));
  const remaining = missed.slice(slots.length).map((session) => ({
    ...session,
    status: "missed",
  }));
  return {
    sessions: [...preserved, ...moved, ...remaining].sort((a, b) =>
      `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`),
    ),
    moved: moved.length,
    remaining: remaining.length,
  };
}
