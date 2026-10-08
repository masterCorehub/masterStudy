import { toAcademicDateKey } from "./academic.js";

/** Completa semanas de domingo a sábado, sem acrescentar uma sexta linha vazia. */
export function getCalendarMonthDays(value) {
  const start = new Date(value.getFullYear(), value.getMonth(), 1, 12);
  const firstWeekday = start.getDay();
  const daysInMonth = new Date(
    value.getFullYear(),
    value.getMonth() + 1,
    0,
  ).getDate();
  const count = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  start.setDate(1 - firstWeekday);
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

export function isCalendarEventCompleted(event) {
  return ["completed", "done", "cancelled", "canceled"].includes(
    event.status || event.original?.status,
  );
}

// Cada origem tem seu campo persistido. Notas e aulas recorrentes não são prazos editáveis.
const MOVABLE_SOURCES = {
  task: { collection: "tasks", field: "dueDate" },
  project: { collection: "projects", field: "dueDate" },
  exam: { collection: "exams", field: "date" },
  event: { collection: "events", field: "date" },
  "study-session": { collection: "studySessions", field: "date" },
};

export function getCalendarEventMove(event, date) {
  const target = MOVABLE_SOURCES[event?.source];
  const id = event?.original?.id || event?.sourceId;
  const dateKey = toAcademicDateKey(date);
  if (!target || !id || !dateKey) return null;
  return {
    collection: target.collection,
    id,
    updates: { [target.field]: dateKey },
  };
}
