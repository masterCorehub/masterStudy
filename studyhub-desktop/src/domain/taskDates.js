import { getLocalDateKey } from "../utils/dateUtils.js";

export function getTaskCompletionDate(task) {
  if (task.status !== "completed") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(task.completedDate || ""))
    return task.completedDate;
  const date = task.completedAt ? new Date(task.completedAt) : null;
  return date && !Number.isNaN(date.getTime()) ? getLocalDateKey(date) : null;
}

export function selectTodayTasks(tasks = [], todayKey = getLocalDateKey()) {
  // Flags antigas de "hoje" não substituem o prazo: elas ficam desatualizadas.
  return tasks
    .filter(
      (task) =>
        task.dueDate === todayKey || getTaskCompletionDate(task) === todayKey,
    )
    .sort(
      (a, b) =>
        Number(a.status === "completed") - Number(b.status === "completed"),
    );
}

export function taskCompletionUpdates(current, updates, now = Date.now()) {
  if (!updates.status || updates.status === current?.status) return updates;
  if (updates.status !== "completed")
    return { ...updates, completedAt: null, completedDate: null };
  const completedAt = updates.completedAt || now;
  // Registrar no store cobre a conclusão em Hoje, Tarefas e nos detalhes.
  return {
    ...updates,
    completedAt,
    completedDate:
      updates.completedDate || getLocalDateKey(new Date(completedAt)),
  };
}
