import test from "node:test";
import assert from "node:assert/strict";
import {
  restoreTasksNavigation,
  migrateTasksNavigation,
} from "./sidebarNavigation.js";

test("Reativar Tarefas preserva ordem personalizada e outras entradas ocultas", () => {
  const state = {
    sidebarOrder: ["books", "courses", "dashboard"],
    sidebarHiddenItems: ["tasks", "projects"],
  };
  const restored = restoreTasksNavigation(state);
  assert.deepEqual(restored, {
    sidebarOrder: ["books", "courses", "tasks", "dashboard"],
    sidebarHiddenItems: ["projects"],
  });
  assert.deepEqual(state.sidebarOrder, ["books", "courses", "dashboard"]);
  assert.deepEqual(restoreTasksNavigation(restored), restored);
});

test("Snapshot antigo também reativa Tarefas, mas personalizações posteriores são respeitadas", () => {
  const migrated = migrateTasksNavigation({
    sidebarHiddenItems: ["tasks", "books"],
  });
  assert.equal(migrated.sidebarNavigationVersion, 1);
  assert.deepEqual(migrated.sidebarHiddenItems, ["books"]);
  const personalized = { ...migrated, sidebarHiddenItems: ["tasks", "books"] };
  assert.equal(migrateTasksNavigation(personalized), personalized);
});
