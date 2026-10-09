// Keep saved task durations while retiring timer-specific preferences and actions.
export function retireStudyTimer(state = {}) {
  const result = { ...state };
  if (state.appSettings) {
    const settings = { ...state.appSettings };
    delete settings.pomodoroAutoBreak;
    result.appSettings = settings;
  }
  for (const key of ["sidebarQuickActions", "sidebarOrder", "sidebarHiddenItems", "favoriteCommands"]) {
    if (Array.isArray(state[key])) {
      result[key] = state[key].filter((item) => !String(item).toLowerCase().includes("pomodoro"));
    }
  }
  if (Array.isArray(state.dashboardWidgets)) {
    result.dashboardWidgets = state.dashboardWidgets.filter((widget) => widget.id !== "focus");
  }
  if (state.tasks?.list) {
    result.tasks = {
      ...state.tasks,
      list: state.tasks.list.map((task) => {
        const { estimatedPomodoros, ...rest } = task;
        // Old estimates used 25-minute cycles; retain their duration in minutes.
        return estimatedPomodoros == null ? rest : {
          ...rest,
          estimatedMinutes: Number(task.estimatedMinutes) > 0
            ? Number(task.estimatedMinutes)
            : Math.max(0, Number(estimatedPomodoros) || 0) * 25,
        };
      }),
    };
  }
  return result;
}
