import test from "node:test";
import assert from "node:assert/strict";
import {
  getTaskCompletionDate,
  selectTodayTasks,
  taskCompletionUpdates,
} from "./taskDates.js";

test("Hoje mostra apenas prazo de hoje ou conclusão de hoje, ignorando flags antigas", () => {
  const tasks = [
    { id: "late", dueDate: "2026-10-07", isTodayTask: true },
    { id: "today", dueDate: "2026-10-08" },
    { id: "tomorrow", dueDate: "2026-10-09", isTodayTask: true },
    { id: "undated", isTodayTask: true },
    {
      id: "done-yesterday",
      status: "completed",
      dueDate: "2026-10-07",
      completedDate: "2026-10-07",
    },
    {
      id: "done-today",
      status: "completed",
      dueDate: "2026-10-07",
      completedDate: "2026-10-08",
    },
    {
      id: "done-early",
      status: "completed",
      dueDate: "2026-10-10",
      completedAt: new Date(2026, 9, 8, 12).getTime(),
    },
    {
      id: "reopened",
      status: "pending",
      dueDate: "2026-10-07",
      completedDate: "2026-10-08",
    },
  ];
  assert.deepEqual(
    selectTodayTasks(tasks, "2026-10-08").map((t) => t.id),
    ["today", "done-today", "done-early"],
  );
});

test("A conclusão é datada, preservada em edições e removida ao reabrir", () => {
  const now = new Date(2026, 9, 8, 23, 30).getTime();
  const patch = taskCompletionUpdates(
    { status: "pending" },
    { status: "completed" },
    now,
  );
  assert.equal(patch.completedDate, "2026-10-08");
  assert.equal(patch.completedAt, now);
  assert.deepEqual(
    taskCompletionUpdates({ status: "completed" }, { title: "Editada" }, now),
    { title: "Editada" },
  );
  assert.deepEqual(
    taskCompletionUpdates(
      { status: "completed" },
      { status: "completed" },
      now,
    ),
    { status: "completed" },
  );
  assert.deepEqual(
    taskCompletionUpdates({ status: "completed" }, { status: "pending" }, now),
    { status: "pending", completedAt: null, completedDate: null },
  );
  assert.equal(
    getTaskCompletionDate({ status: "completed", completedAt: "inválida" }),
    null,
  );
});
