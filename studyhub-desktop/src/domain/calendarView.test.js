import test from "node:test";
import assert from "node:assert/strict";
import {
  getCalendarMonthDays,
  getCalendarEventMove,
  isCalendarEventCompleted,
} from "./calendarView.js";
import { toAcademicDateKey } from "./academic.js";

test("Mês usa cinco linhas quando necessário e preserva as datas adjacentes", () => {
  const days = getCalendarMonthDays(new Date(2026, 9, 8));
  assert.equal(days.length, 35);
  assert.equal(toAcademicDateKey(days[0]), "2026-09-27");
  assert.equal(toAcademicDateKey(days.at(-1)), "2026-10-31");
  assert.equal(days.filter((day) => day.getMonth() === 9).length, 31);
});

test("Calendário mantém seis semanas quando o mês exige e inclui fevereiro bissexto", () => {
  assert.equal(getCalendarMonthDays(new Date(2026, 7, 1)).length, 42);
  const february = getCalendarMonthDays(new Date(2028, 1, 1));
  assert.equal(february.filter((day) => day.getMonth() === 1).length, 29);
  for (let index = 1; index < february.length; index++) {
    const previous = new Date(february[index - 1]);
    previous.setDate(previous.getDate() + 1);
    assert.equal(
      toAcademicDateKey(previous),
      toAcademicDateKey(february[index]),
    );
  }
});

test("Arraste escreve no campo lido pela tarefa, projeto e sessão de estudo", () => {
  const event = { original: { id: "entity" } };
  assert.deepEqual(
    getCalendarEventMove({ ...event, source: "project" }, "2026-10-09"),
    {
      collection: "projects",
      id: "entity",
      updates: { dueDate: "2026-10-09" },
    },
  );
  assert.deepEqual(
    getCalendarEventMove({ ...event, source: "task" }, new Date(2026, 9, 9)),
    { collection: "tasks", id: "entity", updates: { dueDate: "2026-10-09" } },
  );
  assert.deepEqual(
    getCalendarEventMove({ ...event, source: "study-session" }, "2026-10-09"),
    {
      collection: "studySessions",
      id: "entity",
      updates: { date: "2026-10-09" },
    },
  );
  for (const source of ["class", "note", "review", "unknown"])
    assert.equal(
      getCalendarEventMove({ ...event, source }, "2026-10-09"),
      null,
    );
  assert.equal(getCalendarEventMove({ source: "task" }, "2026-10-09"), null);
});

test("Prazos concluídos ou cancelados podem ser excluídos da lista de pendências", () => {
  assert.equal(
    isCalendarEventCompleted({ original: { status: "completed" } }),
    true,
  );
  assert.equal(isCalendarEventCompleted({ status: "cancelled" }), true);
  assert.equal(isCalendarEventCompleted({ status: "pending" }), false);
});
