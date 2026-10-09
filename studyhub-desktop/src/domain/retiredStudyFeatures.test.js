import test from "node:test";
import assert from "node:assert/strict";
import { retireStudyTimer } from "./retiredStudyFeatures.js";

test("retiring the timer preserves task data and explicit minute estimates", () => {
  const source = {
    tasks: { list: [
      { id: "legacy", title: "Study", estimatedPomodoros: 3 },
      { id: "minutes", estimatedPomodoros: 2, estimatedMinutes: 40, status: "completed" },
    ] },
    dashboardWidgets: [{ id: "focus" }, { id: "tasks" }],
    sidebarQuickActions: ["calendar", "pomodoro"],
    favoriteCommands: ["command-pomodoro-start", "command-note-new"],
    appSettings: { pomodoroAutoBreak: true, notificationsEnabled: true },
  };
  const result = retireStudyTimer(source);
  assert.deepEqual(result.dashboardWidgets, [{ id: "tasks" }]);
  assert.equal(result.tasks.list[0].estimatedMinutes, 75);
  assert.equal(result.tasks.list[1].estimatedMinutes, 40);
  assert.equal(result.tasks.list[1].status, "completed");
  assert.equal("estimatedPomodoros" in result.tasks.list[0], false);
  assert.deepEqual(result.sidebarQuickActions, ["calendar"]);
  assert.deepEqual(result.favoriteCommands, ["command-note-new"]);
  assert.deepEqual(result.appSettings, { notificationsEnabled: true });
  assert.deepEqual(retireStudyTimer(result), result);
  assert.equal(source.tasks.list[0].estimatedPomodoros, 3);
});
