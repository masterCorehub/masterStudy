const completedStatuses = new Set(["completed", "done", "concluida", "concluído"]);

const localDateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export function buildMacWidgetState(studyState, pomodoroState, now = Date.now()) {
  const today = localDateKey(new Date(now));
  const tasks = (studyState?.tasks?.list || [])
    .filter((task) => task?.id && !completedStatuses.has(String(task.status || "").toLowerCase()))
    .sort((left, right) => {
      const leftDate = left.dueDate || "9999-12-31";
      const rightDate = right.dueDate || "9999-12-31";
      if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);
      if (left.priority === "high" && right.priority !== "high") return -1;
      if (right.priority === "high" && left.priority !== "high") return 1;
      return String(left.title || "").localeCompare(String(right.title || ""));
    })
    .slice(0, 8)
    .map((task) => ({
      id: String(task.id),
      title: String(task.title || "Tarefa sem título"),
      dueDate: task.dueDate || null,
      priority: task.priority || null,
      overdue: Boolean(task.dueDate && task.dueDate < today),
    }));

  const selectedTaskId = pomodoroState?.selectedTasks?.[0];
  const selectedTask = (studyState?.tasks?.list || []).find((task) => task.id === selectedTaskId);
  const isActive = Boolean(pomodoroState?.isActive && pomodoroState?.endTime);

  return {
    updatedAt: now,
    tasks,
    pomodoro: {
      mode: pomodoroState?.mode || "focus",
      isActive,
      endTime: isActive ? Number(pomodoroState.endTime) : null,
      remainingSeconds: isActive ? 0 : Math.max(0, Number(pomodoroState?.timeLeft || 0)),
      taskTitle: selectedTask?.title || null,
      completedCount: Math.max(0, Number(pomodoroState?.pomodorosCompleted || 0)),
    },
  };
}
