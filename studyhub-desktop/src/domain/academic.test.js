import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAcademicCalendarEvents,
  buildAdaptiveStudyPlan,
  buildExamPlan,
  calculateAttendance,
  calculateSubjectGrade,
  formatAcademicCitation,
  getAcademicRecommendations,
  getAcademicSemesterData,
  getAcademicSubjectHub,
  getUpcomingAcademicItems,
  getProjectProgress,
  normalizeAcademicData,
  normalizeAcademicStateSnapshot,
  redistributeMissedStudySessions,
} from "./academic.js";
import { extractAllTags, extractInlineTags, getNoteTags } from "./frontmatter.js";

test("migra os dados acadêmicos antigos para um semestre preservando vínculos", () => {
  const academic = normalizeAcademicData({
    semester: { name: "2025.2", startDate: "2025-08-01" },
    subjects: [{ id: "subject-1", name: "Cálculo" }],
    grades: [{ id: "grade-1", subjectId: "subject-1", score: 8 }],
    references: [{ id: "reference-1", title: "Livro" }],
  });

  assert.equal(academic.semesters.length, 1);
  assert.equal(academic.semester.name, "2025.2");
  assert.equal(academic.subjects[0].semesterId, academic.activeSemesterId);
  assert.equal(academic.grades[0].semesterId, academic.activeSemesterId);
  assert.equal(academic.references[0].semesterId, academic.activeSemesterId);
});

test("migra o histórico antigo da disciplina para um chat persistido", () => {
  const academic = normalizeAcademicData({
    aiChatHistories: {
      "subject-1": [{ role: "user", content: "O que é derivada?" }],
    },
  });

  assert.equal(academic.aiChats["subject-1"].length, 1);
  assert.equal(academic.aiChats["subject-1"][0].title, "Conversa anterior");
  assert.equal(academic.aiChats["subject-1"][0].messages[0].content, "O que é derivada?");
});

test("separa disciplinas e registros pelo semestre selecionado", () => {
  const academic = getAcademicSemesterData({
    semesters: [
      { id: "2025-2", name: "2025.2", status: "completed" },
      { id: "2026-1", name: "2026.1", status: "active" },
    ],
    activeSemesterId: "2026-1",
    subjects: [
      { id: "old-subject", name: "Álgebra", semesterId: "2025-2" },
      { id: "new-subject", name: "Cálculo", semesterId: "2026-1" },
    ],
    grades: [
      { id: "old-grade", subjectId: "old-subject", semesterId: "2025-2" },
      { id: "new-grade", subjectId: "new-subject", semesterId: "2026-1" },
    ],
  });

  assert.deepEqual(
    academic.subjects.map((item) => item.id),
    ["new-subject"],
  );
  assert.deepEqual(
    academic.grades.map((item) => item.id),
    ["new-grade"],
  );
  assert.equal(academic.semester.name, "2026.1");
});

test("calcula média ponderada e nota necessária", () => {
  const result = calculateSubjectGrade(
    [{ subjectId: "s", score: 8, maxScore: 10, weight: 40 }],
    { id: "s", passingGrade: 6 },
  );
  assert.equal(result.currentAverage, 8);
  assert.equal(result.completedWeight, 40);
  assert.equal(result.neededAverage.toFixed(2), "4.67");
});

test("calcula frequência e alerta de risco", () => {
  const entries = [
    { subjectId: "s", status: "present" },
    { subjectId: "s", status: "absent" },
    { subjectId: "s", status: "absent" },
    { subjectId: "s", status: "present" },
  ];
  const result = calculateAttendance(entries, {
    id: "s",
    minimumAttendance: 75,
  });
  assert.equal(result.attendanceRate, 50);
  assert.equal(result.percentage, 50);
  assert.equal(result.atRisk, true);
});

test("gera plano de prova terminando em simulado", () => {
  const plan = buildExamPlan(
    {
      id: "e",
      title: "Cálculo",
      date: "2026-08-10",
      topics: ["Limites", "Derivadas"],
    },
    { studyDays: 5 },
  );
  assert.equal(plan.length, 5);
  assert.equal(plan.at(-1).kind, "mock");
  assert.equal(plan.at(-1).date, "2026-08-09");
});

test("formata referências e progresso de projeto", () => {
  const citation = formatAcademicCitation(
    {
      authors: "Ana Silva",
      title: "Pesquisa",
      year: 2026,
      publisher: "Editora",
    },
    "abnt",
  );
  assert.match(citation, /ANA SILVA/);
  assert.equal(
    getProjectProgress({
      subtasks: [{ completed: true }, { completed: false }],
    }),
    50,
  );
});

test("migra courseId para vários vínculos e deriva o contexto acadêmico sem duplicar conteúdo", () => {
  const state = normalizeAcademicStateSnapshot({
    academic: {
      semesters: [{ id: "sem-1", name: "2026.1" }],
      activeSemesterId: "sem-1",
      subjects: [{ id: "subject-1", name: "Cálculo", courseId: "course-1" }],
    },
    courses: [
      {
        id: "course-1",
        title: "Hub de Cálculo",
        modules: [
          {
            id: "module-1",
            title: "Limites",
            lessons: [
              { id: "lesson-1", title: "Introdução", status: "completed" },
            ],
          },
        ],
      },
    ],
    tasks: {
      list: [
        { id: "task-1", title: "Lista", context: { courseId: "course-1" } },
      ],
    },
    studyItems: [{ id: "note-1", title: "Resumo", sourceCourseId: "course-1" }],
    flashcardDecks: [
      { id: "deck-1", title: "Derivadas", courseId: "course-1" },
    ],
    focusSessions: [
      {
        id: "focus-1",
        taskId: "task-1",
        actualSeconds: 1_500,
        endedAt: new Date("2026-07-07T20:00:00").getTime(),
      },
    ],
  });

  assert.deepEqual(state.academic.subjects[0].linkedCourseIds, ["course-1"]);
  assert.equal(state.tasks.list[0].academicSubjectId, "subject-1");
  assert.equal(state.studyItems[0].academicSemesterId, "sem-1");
  assert.equal(state.notes.list[0].academicSubjectId, "subject-1");
  assert.equal(state.flashcardDecks[0].academicSubjectId, "subject-1");
  assert.equal(state.focusSessions[0].academicSubjectId, "subject-1");

  const hub = getAcademicSubjectHub(
    state,
    "subject-1",
    new Date("2026-07-08T12:00:00"),
  );
  assert.equal(hub.courses.length, 1);
  assert.equal(hub.lessons.length, 1);
  assert.equal(hub.notes.length, 1);
  assert.equal(hub.tasks.length, 1);
  assert.equal(hub.decks.length, 1);
  assert.equal(hub.progress, 100);
  assert.equal(hub.weeklyFocusMinutes, 25);
});

test("reconstrói a biblioteca de notas de backups antigos", () => {
  const state = normalizeAcademicStateSnapshot({
    academic: {
      semesters: [{ id: "sem-1", name: "2026.1" }],
      activeSemesterId: "sem-1",
      subjects: [
        {
          id: "subject-1",
          name: "Cálculo",
          semesterId: "sem-1",
          courseId: "course-1",
        },
      ],
    },
    notes: {
      list: [
        {
          id: "legacy-note",
          title: "Nota antiga",
          sourceCourseId: "course-1",
        },
      ],
    },
  });

  assert.equal(state.studyItems.length, 1);
  assert.equal(state.studyItems[0].itemType, "note");
  assert.equal(state.notes.totalNotes, 1);
  assert.equal(state.notes.list[0].academicSubjectId, "subject-1");
  assert.equal(state.notes.list[0].academicSemesterId, "sem-1");
});

test("preserva a escolha explícita de deixar uma nota sem matéria", () => {
  const state = normalizeAcademicStateSnapshot({
    academic: {
      semesters: [
        { id: "sem-1", name: "2026.1" },
        { id: "sem-2", name: "2026.2" },
      ],
      activeSemesterId: "sem-1",
      subjects: [
        {
          id: "subject-1",
          name: "Cálculo",
          semesterId: "sem-1",
          courseId: "course-1",
        },
      ],
    },
    studyItems: [
      {
        id: "manual-note",
        sourceCourseId: "course-1",
        academicSubjectId: null,
        academicSemesterId: "sem-2",
        academicContextExplicit: true,
      },
    ],
  });

  assert.equal(state.studyItems[0].academicSubjectId, null);
  assert.equal(state.studyItems[0].academicSemesterId, "sem-2");
});

test("mantém a matéria da tarefa na linha do tempo", () => {
  const items = getUpcomingAcademicItems(
    { events: [], exams: [], projects: [] },
    [
      {
        id: "task-1",
        title: "Lista de exercícios",
        academicSubjectId: "subject-1",
        dueDate: "2099-05-10",
      },
    ],
    new Date("2099-05-01T12:00:00"),
  );

  assert.equal(items[0].subjectId, "subject-1");
  assert.equal(items[0].type, "task");
});

test("normaliza aulas recorrentes, tarefas, provas e revisões no calendário", () => {
  const events = buildAcademicCalendarEvents(
    {
      academic: {
        semesters: [
          {
            id: "sem-1",
            name: "2026.1",
            startDate: "2026-07-01",
            endDate: "2026-07-31",
          },
        ],
        activeSemesterId: "sem-1",
        subjects: [
          {
            id: "subject-1",
            semesterId: "sem-1",
            name: "Cálculo",
            schedule: { days: [1], startTime: "08:00", endTime: "10:00" },
            linkedCourseIds: ["course-1"],
          },
        ],
        exams: [
          {
            id: "exam-1",
            subjectId: "subject-1",
            semesterId: "sem-1",
            title: "P1",
            date: "2026-07-08",
          },
        ],
      },
      tasks: {
        list: [
          {
            id: "task-1",
            title: "Lista",
            courseId: "course-1",
            dueDate: "2026-07-07",
          },
        ],
      },
      flashcardDecks: [
        {
          id: "deck-1",
          title: "Limites",
          courseId: "course-1",
          cards: [
            {
              id: "card-1",
              dueDate: new Date("2026-07-09T12:00:00").getTime(),
            },
          ],
        },
      ],
    },
    {
      semesterId: "sem-1",
      startDate: "2026-07-05",
      endDate: "2026-07-10",
      now: new Date("2026-07-06T12:00:00"),
    },
  );

  assert.deepEqual(
    events.map((event) => [event.source, event.date]),
    [
      ["class", "2026-07-06"],
      ["task", "2026-07-07"],
      ["exam", "2026-07-08"],
      ["review", "2026-07-09"],
    ],
  );
});

test("preserva os tipos de tarefa para filtragem no calendário", () => {
  const events = buildAcademicCalendarEvents(
    {
      academic: {
        semesters: [{ id: "sem-1", name: "2026.1" }],
        activeSemesterId: "sem-1",
        subjects: [{ id: "subject-1", semesterId: "sem-1", name: "Cálculo" }],
      },
      tasks: {
        list: [
          {
            id: "task-1",
            title: "Trabalho",
            type: "assignment",
            subjectId: "subject-1",
            dueDate: "2099-05-10",
          },
          {
            id: "task-2",
            title: "Apresentação",
            type: "presentation",
            subjectId: "subject-1",
            dueDate: "2099-05-11",
          },
        ],
      },
    },
    { semesterId: "sem-1", startDate: "2099-05-01", endDate: "2099-05-31" },
  );

  assert.deepEqual(
    events.filter((item) => item.source === "task").map((item) => item.type),
    ["assignment", "presentation"],
  );
});

test("mostra no calendário tarefas rápidas criadas em Hoje mesmo sem matéria", () => {
  const events = buildAcademicCalendarEvents(
    {
      academic: {
        semesters: [{ id: "sem-1", name: "2026.1" }],
        activeSemesterId: "sem-1",
        subjects: [],
      },
      // The quick task flow normally persists this as { list }, while older
      // profiles and imports may provide the list directly.
      tasks: [
        {
          id: "today-task-1",
          title: "Revisar conteúdo",
          status: "pending",
          date: "2026-07-30",
        },
      ],
    },
    {
      semesterId: "sem-1",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      now: new Date("2026-07-30T12:00:00"),
    },
  );

  assert.deepEqual(
    events.filter((event) => event.source === "task").map((event) => [event.title, event.date]),
    [["Revisar conteúdo", "2026-07-30"]],
  );
});

test("prioriza recomendações acadêmicas na ordem definida", () => {
  const state = {
    academic: {
      semesters: [{ id: "sem-1", name: "2026.1" }],
      activeSemesterId: "sem-1",
      subjects: [
        {
          id: "subject-1",
          semesterId: "sem-1",
          name: "Cálculo",
          linkedCourseIds: ["course-1"],
          weeklyStudyGoalMinutes: 120,
        },
      ],
      exams: [
        {
          id: "exam-1",
          subjectId: "subject-1",
          title: "P1",
          date: "2026-07-10",
        },
      ],
    },
    courses: [],
    tasks: {
      list: [
        {
          id: "task-1",
          title: "Lista atrasada",
          courseId: "course-1",
          dueDate: "2026-07-05",
          status: "pending",
        },
      ],
    },
    flashcardDecks: [
      {
        id: "deck-1",
        title: "Limites",
        courseId: "course-1",
        cards: [{ id: "card-1", dueDate: 0 }],
      },
    ],
    focusSessions: [],
  };
  const recommendations = getAcademicRecommendations(state, {
    now: new Date("2026-07-06T12:00:00"),
    limit: 10,
  });

  assert.equal(recommendations[0].kind, "task");
  assert.match(recommendations[0].reason, /Atrasado/);
  assert.ok(
    recommendations.findIndex((item) => item.kind === "exam") <
      recommendations.findIndex((item) => item.kind === "review"),
  );
  assert.equal(recommendations.at(-1).kind, "weekly-goal");
});

test("gera plano adaptativo sem conflitos e reserva revisão e simulado", () => {
  const result = buildAdaptiveStudyPlan(
    {
      id: "exam-1",
      subjectId: "subject-1",
      semesterId: "sem-1",
      title: "P1",
      date: "2026-07-11",
      topics: [
        {
          id: "hard",
          title: "Derivadas",
          difficulty: 5,
          estimatedMinutes: 100,
        },
        { id: "easy", title: "Limites", difficulty: 2, estimatedMinutes: 50 },
      ],
    },
    {
      now: new Date("2026-07-06T12:00:00"),
      preferences: {
        sessionMinutes: 50,
        availability: [1, 2, 3, 4, 5].map((weekday) => ({
          weekday,
          startTime: "18:00",
          endTime: "21:00",
          enabled: true,
        })),
      },
      busyEvents: [
        { date: "2026-07-06", startTime: "18:00", endTime: "18:50" },
      ],
    },
  );

  assert.equal(result.needsAvailability, false);
  assert.equal(result.unscheduledCount, 0);
  assert.equal(result.sessions[0].topic, "Derivadas");
  assert.ok(
    !result.sessions.some(
      (session) =>
        session.date === "2026-07-06" && session.startTime === "18:00",
    ),
  );
  assert.equal(result.sessions.at(-2).kind, "review");
  assert.equal(result.sessions.at(-1).kind, "mock");
});

test("redistribui apenas sessões geradas e perdidas", () => {
  const sessions = [
    {
      id: "missed",
      generated: true,
      status: "pending",
      date: "2026-07-05",
      startTime: "18:00",
      durationMinutes: 50,
    },
    {
      id: "completed",
      generated: true,
      status: "completed",
      date: "2026-07-05",
      startTime: "19:00",
      durationMinutes: 50,
    },
    {
      id: "manual",
      generated: false,
      status: "pending",
      date: "2026-07-05",
      startTime: "20:00",
      durationMinutes: 50,
    },
  ];
  const result = redistributeMissedStudySessions(
    { id: "exam-1", date: "2026-07-10" },
    sessions,
    {
      now: new Date("2026-07-06T12:00:00"),
      preferences: {
        sessionMinutes: 50,
        availability: [
          { weekday: 1, startTime: "18:00", endTime: "21:00", enabled: true },
        ],
      },
    },
  );

  assert.equal(result.moved, 1);
  assert.equal(
    result.sessions.find((session) => session.id === "missed").date,
    "2026-07-06",
  );
  assert.equal(
    result.sessions.find((session) => session.id === "completed").date,
    "2026-07-05",
  );
  assert.equal(
    result.sessions.find((session) => session.id === "manual").date,
    "2026-07-05",
  );
});

test("extrai tags inline e de frontmatter estilo Obsidian", () => {
  const md = `---
title: Minha Nota
tags: [react, frontend]
---
# Introdução
Este é um teste com #javascript e #estudo/programacao.
Não deve pegar # Header ou ## Subheader.
`;
  const inline = extractInlineTags(md);
  assert.deepEqual(inline.sort(), ["estudo/programacao", "javascript"].sort());

  const all = extractAllTags(md);
  assert.deepEqual(all.sort(), ["estudo/programacao", "frontend", "javascript", "react"].sort());

  const note = {
    id: "n1",
    tags: ["typescript"],
    markdownContent: md,
  };
  const noteTags = getNoteTags(note);
  assert.deepEqual(noteTags.sort(), ["estudo/programacao", "frontend", "javascript", "react", "typescript"].sort());
});
