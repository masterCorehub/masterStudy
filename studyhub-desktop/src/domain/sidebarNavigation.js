export const DEFAULT_SIDEBAR_ORDER = [
  "dashboard",
  "courses",
  "tasks",
  "projects",
  "books",
  "materials",
  "journal",
  "sticky-notes",
  "knowledge",
  "reviews",
];

/** Reativa Tarefas uma vez na atualização, preservando as outras preferências. */
export function restoreTasksNavigation(state = {}) {
  const order = Array.isArray(state.sidebarOrder)
    ? [...state.sidebarOrder]
    : [...DEFAULT_SIDEBAR_ORDER];
  if (!order.includes("tasks")) {
    const coursesIndex = order.indexOf("courses");
    order.splice(coursesIndex >= 0 ? coursesIndex + 1 : 1, 0, "tasks");
  }
  return {
    sidebarOrder: order,
    sidebarHiddenItems: (state.sidebarHiddenItems || []).filter(
      (key) => key !== "tasks",
    ),
  };
}

export function migrateTasksNavigation(state = {}) {
  if (state.sidebarNavigationVersion >= 1) return state;
  // Snapshots SQLite e backups não passam pela versão do persist do Zustand.
  return {
    ...state,
    ...restoreTasksNavigation(state),
    sidebarNavigationVersion: 1,
  };
}
