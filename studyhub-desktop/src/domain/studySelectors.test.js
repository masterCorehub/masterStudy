import test from "node:test";
import assert from "node:assert/strict";
import { buildSearchIndex, dueFlashcards, scheduleTaskSessions, selectTodayData } from "./studySelectors.js";

test("selectTodayData reúne tarefas urgentes, cartões vencidos e foco do dia", () => {
  const now = new Date("2026-07-20T12:00:00Z").getTime();
  const data = selectTodayData({
    courses: [{ id: "course-1", title: "Curso", modules: [{ id: "module-1", title: "Módulo", lessons: [{ id: "lesson-1", title: "Aula" }] }] }],
    activeLessonId: "lesson-1",
    tasks: { list: [{ id: "task-1", title: "Prova", status: "pending", dueDate: "2026-07-20", priority: "high" }] },
    flashcardDecks: [{ id: "deck-1", title: "Deck", cards: [{ id: "card-1", dueDate: now - 1 }] }],
    focusSessions: [{ id: "focus-1", status: "completed", startedAt: now - 60_000, actualSeconds: 1500 }],
    studyPlans: [],
  }, now);
  assert.equal(data.activeLesson.courseTitle, "Curso");
  assert.equal(data.urgentTasks[0].id, "task-1");
  assert.equal(data.dueCards.length, 1);
  assert.equal(data.focusSeconds, 1500);
});

test("dueFlashcards e scheduleTaskSessions respeitam vencimento e capacidade diária", () => {
  const now = new Date("2026-07-20T12:00:00Z").getTime();
  assert.equal(dueFlashcards([{ id: "deck", cards: [{ id: "a", dueDate: now - 1 }, { id: "b", dueDate: now + 1000 }] }], now).length, 1);
  const sessions = scheduleTaskSessions([{ id: "task", title: "Tarefa", status: "pending", dueDate: "2026-07-22", estimatedPomodoros: 3 }], { now, dailyPomodoros: 2 });
  assert.equal(sessions.length, 3);
  assert.deepEqual(sessions.map((session) => session.date), ["2026-07-20", "2026-07-20", "2026-07-21"]);
});

test("buildSearchIndex inclui entidades e comandos", () => {
  const index = buildSearchIndex({
    courses: [{ id: "c", title: "JavaScript", modules: [] }],
    tasks: { list: [{ id: "task-1", title: "Tarefa" }] },
    studyItems: [{ id: "note-1", title: "Nota" }],
    flashcardDecks: [{ id: "deck-1", title: "Deck", cards: [] }],
    academic: { subjects: [{ id: "subject-1", name: "Matemática" }] },
  });
  assert.ok(index.some((item) => item.title === "JavaScript"));
  assert.ok(index.some((item) => item.title === "Criar nova nota"));
  assert.ok(index.some((item) => item.title === "Exportar backup da biblioteca"));
  assert.equal(index.find((item) => item.id === "c").courseId, "c");
  assert.equal(index.find((item) => item.id === "note-1").noteId, "note-1");
  assert.equal(index.find((item) => item.id === "task-1").taskId, "task-1");
  assert.equal(index.find((item) => item.id === "subject-1").screen, "academic_subject");
});
