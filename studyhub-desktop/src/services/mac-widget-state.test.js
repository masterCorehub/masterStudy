import test from "node:test";
import assert from "node:assert/strict";
import { buildMacWidgetState } from "./mac-widget-state.js";

test("prepara tarefas pendentes e estado do Pomodoro para o widget do macOS", () => {
  const state = buildMacWidgetState(
    { tasks: { list: [
      { id: "done", title: "Feita", status: "completed", dueDate: "2026-08-16" },
      { id: "later", title: "Depois", status: "todo", dueDate: "2026-08-19" },
      { id: "late", title: "Atrasada", status: "todo", dueDate: "2026-08-16", priority: "high" },
    ] } },
    { mode: "focus", isActive: true, endTime: 1_800_000, timeLeft: 1200, selectedTasks: ["late"], pomodorosCompleted: 3 },
    new Date("2026-08-17T12:00:00-03:00").getTime(),
  );

  assert.deepEqual(state.tasks.map((task) => task.id), ["late", "later"]);
  assert.equal(state.tasks[0].overdue, true);
  assert.equal(state.pomodoro.taskTitle, "Atrasada");
  assert.equal(state.pomodoro.isActive, true);
});
