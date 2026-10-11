// Each day has its own clock: changing Monday must not erase Tuesday.
export function toggleHabitDate(habit, date, now = Date.now()) {
  const completed = !(habit.completedDates || []).includes(date);
  const previous = habit.completionChanges?.[date]?.updatedAt || 0;
  const updatedAt = Math.max(now, previous + 1);
  return {
    ...habit, updatedAt,
    completedDates: completed
      ? [...(habit.completedDates || []), date]
      : (habit.completedDates || []).filter(value => value !== date),
    completionChanges: {
      ...habit.completionChanges, [date]: { completed, updatedAt },
    },
  };
}

export function mergeHabitCompletion(local, remote, result) {
  const changes = {};
  const dates = new Set([
    ...(local.completedDates || []), ...(remote.completedDates || []),
    ...Object.keys(local.completionChanges || {}), ...Object.keys(remote.completionChanges || {}),
  ]);
  const completedDates = new Set(result.completedDates || []);
  for (const date of dates) {
    const left = local.completionChanges?.[date];
    const right = remote.completionChanges?.[date];
    const change = !left ? right : !right ? left : left.updatedAt >= right.updatedAt ? left : right;
    if (!change) continue; // Legacy days still use the ordinary three-way merge.
    changes[date] = { ...change };
    if (change.completed) completedDates.add(date);
    else completedDates.delete(date);
  }
  return { ...result, completedDates: [...completedDates].sort(), completionChanges: changes };
}
