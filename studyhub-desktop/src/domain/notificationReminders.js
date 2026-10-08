export function getTimedTaskReminders(tasks, now) {
  return tasks.filter(task => {
    if (task.completed || task.status === 'completed' || !task.dueDate || !task.dueTime) return false;
    const due = new Date(`${task.dueDate}T${task.dueTime}`).getTime();
    return Number.isFinite(due) && due <= now && now - due < 86400000;
  }).map(task => ({
    id: `task-time:${task.id}:${task.dueDate}:${task.dueTime}`,
    title: task.title || 'Tarefa agendada',
    message: `Horário da tarefa: ${task.dueTime}. Confira seu planejamento.`,
    screen: 'today',
    tone: 'warning',
  }));
}

export async function deliverReminderOnce({ key, payload, storage, storageKey, inFlight, send, now = Date.now() }) {
  const readSent = () => { try { return JSON.parse(storage.getItem(storageKey) || '{}') || {}; } catch { return {}; } };
  if (readSent()[key] || inFlight.has(key)) return;
  inFlight.add(key);
  try {
    const result = await send(payload);
    if (!result?.shown) return;
    // Relê o cache depois do await para preservar entregas simultâneas.
    const recent = Object.fromEntries(Object.entries(readSent()).filter(([, timestamp]) => now - Number(timestamp) < 8 * 86400000));
    storage.setItem(storageKey, JSON.stringify({ ...recent, [key]: now }));
  } finally { inFlight.delete(key); }
}
