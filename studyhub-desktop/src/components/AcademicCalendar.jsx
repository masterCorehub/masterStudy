import { useMemo, useState } from "react";
import {
  buildAcademicCalendarEvents,
  toAcademicDateKey,
} from "../domain/academic";
import { useStudyStore } from "../store/useStore";
import { Icon } from "../ui/Icon";
import { useCurrentDate } from "../utils/useCurrentDate";
import { CalendarTaskModal } from "./CalendarTaskModal";

const VIEW_OPTIONS = [
  { id: "month", label: "Mês" },
  { id: "week", label: "Semana" },
  { id: "day", label: "Dia" },
];

const WEEKDAYS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

const TYPE_ICONS = {
  class: "school",
  event: "event",
  exam: "quiz",
  project: "assignment",
  task: "task_alt",
  assignment: "assignment",
  presentation: "present_to_all",
  study: "menu_book",
  review: "style",
  mock: "psychology_alt",
  "study-session": "schedule",
  class_note: "edit_note",
};

const addDays = (value, amount) => {
  const date = new Date(value);
  date.setDate(date.getDate() + amount);
  return date;
};

const startOfWeek = (value) => {
  const date = new Date(value);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - date.getDay());
  return date;
};

const startOfMonthGrid = (value) =>
  startOfWeek(new Date(value.getFullYear(), value.getMonth(), 1, 12));

const dateFromKey = (value) => new Date(`${value}T12:00:00`);

const sameDate = (left, right) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const monthLabel = (date) =>
  date.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

const shortDate = (value) =>
  dateFromKey(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });

function CalendarEvent({
  event,
  compact = false,
  onClick,
  movable,
  onDragStart,
  onDragEnd,
}) {
  const isUrgent =
    event.source === "task" &&
    event.original?.status !== "completed" &&
    event.date <= toAcademicDateKey(new Date());
  return (
    <button
      className={`group flex w-full min-w-0 items-center gap-1.5 overflow-hidden rounded-[3px] border-l-[3px] px-2 text-left font-bold transition-opacity hover:opacity-80 ${
        compact ? "min-h-8 py-1.5 text-[11px]" : "h-[22px] text-[10px]"
      } ${movable ? "cursor-grab active:cursor-grabbing" : ""}`}
      style={{
        borderLeftColor: isUrgent ? "#ef4444" : event.color,
        backgroundColor: isUrgent ? "#fee2e2" : `${event.color}1f`,
        color: isUrgent ? "#b91c1c" : "var(--on-surface)",
      }}
      type="button"
      draggable={movable}
      onDragStart={(dragEvent) => {
        // make drag recognizable across browsers and allow drop handlers to read the id
        try {
          dragEvent.dataTransfer.effectAllowed = "move";
          dragEvent.dataTransfer.setData("text/plain", event.id || "");
        } catch (e) {
          // ignore; some environments restrict dataTransfer
        }
        dragEvent.stopPropagation();
        onDragStart?.(event);
      }}
      onDragEnd={(dragEvent) => {
        dragEvent.stopPropagation();
        onDragEnd?.();
      }}
      onClick={(clickEvent) => {
        clickEvent.stopPropagation();
        onClick?.(event);
      }}
      title={`${event.title}${event.subjectName ? ` · ${event.subjectName}` : ""}`}
    >
      {compact ? (
        <Icon
          className="shrink-0 text-[14px]"
          name={TYPE_ICONS[event.type] || "event"}
        />
      ) : null}
      <span className="truncate">{event.title}</span>
      {compact && event.startTime ? (
        <span className="ml-auto shrink-0 font-semibold opacity-60">
          {event.startTime}
        </span>
      ) : null}
    </button>
  );
}

function MiniCalendar({ cursor, selectedDate, onSelect, onMove }) {
  const start = startOfMonthGrid(cursor);
  const days = Array.from({ length: 42 }, (_value, index) =>
    addDays(start, index),
  );
  const today = new Date();

  return (
    <section className="rounded-xl border border-[color:var(--outline-variant)]/45 bg-[color:var(--surface)] p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-extrabold capitalize text-[color:var(--on-surface)]">
          {monthLabel(cursor)}
        </h3>
        <div className="flex items-center gap-1">
          <button
            className="flex h-7 w-7 items-center justify-center rounded-md text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-container)]"
            type="button"
            onClick={() => onMove(-1)}
          >
            <Icon className="text-base" name="chevron_left" />
          </button>
          <button
            className="flex h-7 w-7 items-center justify-center rounded-md text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-container)]"
            type="button"
            onClick={() => onMove(1)}
          >
            <Icon className="text-base" name="chevron_right" />
          </button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-7 text-center">
        {WEEKDAYS.map((day) => (
          <span
            key={day}
            className="py-1 text-[9px] font-extrabold text-[color:var(--on-surface-variant)]"
          >
            {day[0]}
          </span>
        ))}
        {days.map((day) => {
          const outside = day.getMonth() !== cursor.getMonth();
          const selected = sameDate(day, selectedDate);
          const isToday = sameDate(day, today);
          return (
            <button
              key={toAcademicDateKey(day)}
              className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold ${
                selected
                  ? "bg-[color:var(--on-surface)] text-[color:var(--surface)]"
                  : isToday
                    ? "text-[color:var(--primary)] ring-1 ring-[color:var(--primary)]"
                    : outside
                      ? "text-[color:var(--outline)]"
                      : "text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-container)]"
              }`}
              type="button"
              onClick={() => onSelect(day)}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function AcademicCalendar({
  semesterId,
  initialSubjectId = "all",
  compact = false,
  onEventClick,
  onEventMove,
  onAddSubject,
}) {
  const academic = useStudyStore((state) => state.academic);
  const tasks = useStudyStore((state) => state.tasks);
  const flashcardDecks = useStudyStore((state) => state.flashcardDecks);
  const studyItems = useStudyStore((state) => state.studyItems);
  const currentDate = useCurrentDate();
  const [view, setView] = useState(compact ? "day" : "month");
  const [cursor, setCursor] = useState(() => currentDate);
  const [selectedDate, setSelectedDate] = useState(() => currentDate);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [draggedEventId, setDraggedEventId] = useState(null);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState(() =>
    initialSubjectId === "all" ? null : new Set([initialSubjectId]),
  );
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskModalDate, setTaskModalDate] = useState("");

  const openAddTask = (date) => {
    const key = date
      ? typeof date === "string"
        ? date
        : toAcademicDateKey(date)
      : toAcademicDateKey(selectedDate || currentDate);
    setTaskModalDate(key);
    setIsTaskModalOpen(true);
  };

  const activeSemesterId = semesterId || academic.activeSemesterId;
  const subjects = useMemo(
    () =>
      (academic.subjects || []).filter(
        (subject) =>
          subject.semesterId === activeSemesterId && !subject.isArchived,
      ),
    [academic.subjects, activeSemesterId],
  );
  const visibleSubjectIds = useMemo(
    () => selectedSubjectIds || new Set(subjects.map((subject) => subject.id)),
    [selectedSubjectIds, subjects],
  );

  const range = useMemo(() => {
    if (compact) {
      const start = new Date();
      start.setHours(12, 0, 0, 0);
      return { start, end: addDays(start, 30) };
    }
    if (view === "day") {
      return { start: selectedDate, end: selectedDate };
    }
    if (view === "week") {
      const start = startOfWeek(selectedDate);
      return { start, end: addDays(start, 6) };
    }
    const start = startOfMonthGrid(cursor);
    return { start, end: addDays(start, 41) };
  }, [compact, cursor, selectedDate, view]);

  const events = useMemo(() => {
    const all = buildAcademicCalendarEvents(
      { academic, tasks, flashcardDecks, studyItems },
      {
        semesterId: activeSemesterId,
        startDate: toAcademicDateKey(range.start),
        endDate: toAcademicDateKey(range.end),
      },
    );
    const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
    return all.filter(
      (event) =>
        (!event.subjectId || visibleSubjectIds.has(event.subjectId)) &&
        (!normalizedSearch ||
          `${event.title} ${event.subjectName || ""}`
            .toLocaleLowerCase("pt-BR")
            .includes(normalizedSearch)),
    );
  }, [
    academic,
    activeSemesterId,
    flashcardDecks,
    range.end,
    range.start,
    search,
    studyItems,
    tasks,
    visibleSubjectIds,
  ]);

  const upcomingDeadlines = useMemo(() => {
    const start = new Date();
    start.setHours(12, 0, 0, 0);
    const all = buildAcademicCalendarEvents(
      { academic, tasks, flashcardDecks },
      {
        semesterId: activeSemesterId,
        startDate: toAcademicDateKey(start),
        endDate: toAcademicDateKey(addDays(start, 90)),
      },
    );
    return all
      .filter(
        (event) =>
          ["task", "exam", "project"].includes(event.source) &&
          (!event.subjectId || visibleSubjectIds.has(event.subjectId)),
      )
      .slice(0, 6);
  }, [
    academic,
    activeSemesterId,
    flashcardDecks,
    tasks,
    visibleSubjectIds,
  ]);

  const eventsByDate = useMemo(() => {
    const grouped = new Map();
    for (const event of events) {
      if (!grouped.has(event.date)) grouped.set(event.date, []);
      grouped.get(event.date).push(event);
    }
    return grouped;
  }, [events]);

  const monthDays = useMemo(() => {
    const start = startOfMonthGrid(cursor);
    return Array.from({ length: 42 }, (_value, index) =>
      addDays(start, index),
    );
  }, [cursor]);
  const weekDays = useMemo(() => {
    const start = startOfWeek(selectedDate);
    return Array.from({ length: 7 }, (_value, index) =>
      addDays(start, index),
    );
  }, [selectedDate]);

  const move = (direction) => {
    if (view === "month") {
      setCursor(
        (current) =>
          new Date(
            current.getFullYear(),
            current.getMonth() + direction,
            1,
            12,
          ),
      );
      return;
    }
    setSelectedDate((current) =>
      addDays(current, direction * (view === "week" ? 7 : 1)),
    );
  };

  const moveMiniMonth = (direction) =>
    setCursor(
      (current) =>
        new Date(
          current.getFullYear(),
          current.getMonth() + direction,
          1,
          12,
        ),
    );

  const selectDay = (day) => {
    setSelectedDate(day);
    setCursor(new Date(day.getFullYear(), day.getMonth(), 1, 12));
    if (view === "month") return;
  };

  const toggleSubject = (subjectId) => {
    setSelectedSubjectIds((current) => {
      const base = current || new Set(subjects.map((item) => item.id));
      const next = new Set(base);
      if (next.has(subjectId)) next.delete(subjectId);
      else next.add(subjectId);
      return next;
    });
  };

  const movable = (event) =>
    Boolean(onEventMove) && !["class", "review"].includes(event.source);

  const dropOnDate = (date) => {
    // normalize incoming date (accept either Date or yyyy-mm-dd keys)
    const dateKey = typeof date === "string" ? date : toAcademicDateKey(date);
    const event = events.find((item) => item.id === draggedEventId);
    setDraggedEventId(null);
    if (!event) return;
    if (event.date === dateKey) return;
    onEventMove?.(event, dateKey);
  };

  if (compact) {
    const compactEvents = [...events]
      .sort((left, right) =>
        `${left.date} ${left.startTime || ""}`.localeCompare(
          `${right.date} ${right.startTime || ""}`,
        ),
      )
      .slice(0, 7);
    return (
      <section className="overflow-hidden rounded-[24px] border border-[color:var(--outline-variant)]/40 bg-[color:var(--surface)]">
        <div className="flex items-center justify-between border-b border-[color:var(--outline-variant)]/35 px-5 py-4">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[color:var(--on-surface-variant)]">
              Agenda
            </p>
            <h3 className="mt-1 text-lg font-extrabold capitalize">
              {monthLabel(selectedDate)}
            </h3>
          </div>
          <button
            className="rounded-lg border border-[color:var(--outline-variant)]/40 px-3 py-2 text-xs font-bold text-[color:var(--primary)]"
            type="button"
            onClick={() => {
              const today = new Date();
              setSelectedDate(today);
              setCursor(today);
            }}
          >
            Hoje
          </button>
        </div>
        <div className="space-y-2 p-5">
          {compactEvents.map((event) => (
            <div
              key={event.id}
              className="grid grid-cols-[52px_1fr] items-center gap-3"
            >
              <span className="text-[10px] font-bold text-[color:var(--on-surface-variant)]">
                {shortDate(event.date)}
              </span>
              <CalendarEvent
                compact
                event={event}
                movable={movable(event)}
                onClick={onEventClick}
                onDragStart={(item) => setDraggedEventId(item.id)}
              />
            </div>
          ))}
          {!compactEvents.length ? (
            <p className="py-10 text-center text-sm text-[color:var(--on-surface-variant)]">
              Nenhum compromisso próximo.
            </p>
          ) : null}
        </div>
      </section>
    );
  }

  const title =
    view === "month"
      ? monthLabel(cursor)
      : view === "week"
        ? `${shortDate(toAcademicDateKey(weekDays[0]))} — ${shortDate(toAcademicDateKey(weekDays[6]))}`
        : selectedDate.toLocaleDateString("pt-BR", {
            weekday: "long",
            day: "2-digit",
            month: "long",
          });

  return (
    <section className="overflow-hidden rounded-2xl border border-[color:var(--outline-variant)]/45 bg-[color:var(--surface-container-low)]">
      <header className="flex min-h-[64px] flex-wrap items-center justify-between gap-3 border-b border-[color:var(--outline-variant)]/45 bg-[color:var(--surface)] px-5 py-3">
        <div className="flex items-center gap-2">
          <h2 className="mr-3 text-xl font-extrabold capitalize text-[color:var(--on-surface)]">
            {title}
          </h2>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-md text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-container)]"
            type="button"
            onClick={() => move(-1)}
          >
            <Icon name="chevron_left" />
          </button>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-md text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-container)]"
            type="button"
            onClick={() => move(1)}
          >
            <Icon name="chevron_right" />
          </button>
          <button
            className="ml-2 rounded-md border border-[color:var(--outline-variant)]/50 px-3 py-1.5 text-[10px] font-extrabold text-[color:var(--on-surface-variant)] hover:text-[color:var(--primary)]"
            type="button"
            onClick={() => {
              const today = new Date();
              setSelectedDate(today);
              setCursor(today);
            }}
          >
            Hoje
          </button>
        </div>

        <div className="flex items-center gap-3">
          {searchOpen ? (
            <label className="flex items-center gap-2 rounded-lg border border-[color:var(--outline-variant)]/50 bg-[color:var(--surface)] px-3 py-1.5">
              <Icon
                className="text-base text-[color:var(--on-surface-variant)]"
                name="search"
              />
              <input
                autoFocus
                className="w-40 border-0 bg-transparent p-0 text-xs outline-none focus:ring-0"
                placeholder="Buscar evento"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          ) : null}
          <button
            type="button"
            onClick={() => openAddTask(selectedDate)}
            className="flex items-center gap-1.5 rounded-lg bg-[color:var(--primary)] px-3.5 py-1.5 text-xs font-bold text-[color:var(--on-primary)] shadow-sm transition-all hover:opacity-90 active:scale-95"
            title="Criar nova tarefa para a data selecionada"
          >
            <Icon name="add_task" className="text-sm" />
            <span>Nova Tarefa</span>
          </button>
          <div className="flex rounded-md border border-[color:var(--outline-variant)]/45 bg-[color:var(--surface-container)] p-0.5">
            {VIEW_OPTIONS.map((option) => (
              <button
                key={option.id}
                className={`rounded px-3 py-1.5 text-[10px] font-extrabold ${
                  view === option.id
                    ? "bg-[color:var(--surface)] text-[color:var(--on-surface)] shadow-sm"
                    : "text-[color:var(--on-surface-variant)]"
                }`}
                type="button"
                onClick={() => setView(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-md text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-container)]"
            type="button"
            onClick={() => {
              setSearchOpen((current) => !current);
              if (searchOpen) setSearch("");
            }}
            title="Buscar"
          >
            <Icon name={searchOpen ? "close" : "search"} />
          </button>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-md text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-container)]"
            type="button"
            onClick={() => setView("day")}
            title="Ver próximos prazos"
          >
            <Icon name="notifications" />
          </button>
        </div>
      </header>

      <div className="grid min-h-[660px] lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 overflow-x-auto bg-[color:var(--surface)]">
          {view === "month" ? (
            <div className="min-w-[720px]">
              <div className="grid grid-cols-7 border-b border-[color:var(--outline-variant)]/45 bg-[color:var(--surface-container)]">
                {WEEKDAYS.map((day) => (
                  <div
                    key={day}
                    className="py-2.5 text-center text-[9px] font-extrabold tracking-wider text-[color:var(--on-surface-variant)]"
                  >
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {monthDays.map((day) => {
                  const key = toAcademicDateKey(day);
                  const dayEvents = eventsByDate.get(key) || [];
                  const outside = day.getMonth() !== cursor.getMonth();
                  const isToday = sameDate(day, currentDate);
                  const selected = sameDate(day, selectedDate);
                  return (
                    <div
                      key={key}
                      className={`group/day relative min-h-[108px] border-b border-r border-[color:var(--outline-variant)]/40 p-2 transition-colors ${
                        outside
                          ? "bg-[color:var(--surface-container-low)]/55"
                          : "bg-[color:var(--surface)]"
                      } ${selected ? "bg-[color:var(--primary)]/[0.025]" : ""}`}
                      onClick={() => selectDay(day)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => dropOnDate(key)}
                    >
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openAddTask(day);
                          }}
                          className="flex h-5 w-5 items-center justify-center rounded-md bg-[color:var(--surface-container-high)] text-[color:var(--on-surface-variant)] opacity-0 transition-all hover:bg-[color:var(--primary)] hover:text-[color:var(--on-primary)] group-hover/day:opacity-100"
                          title={`Adicionar tarefa em ${key}`}
                        >
                          <Icon name="add" className="text-xs" />
                        </button>
                        <span
                          className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[10px] font-extrabold ${
                            isToday
                              ? "bg-[color:var(--on-surface)] text-[color:var(--surface)]"
                              : outside
                                ? "text-[color:var(--outline)]"
                                : "text-[color:var(--on-surface)]"
                          }`}
                        >
                          {day.getDate()}
                        </span>
                      </div>
                      <div className="mt-1 space-y-1">
                        {dayEvents.slice(0, 3).map((event) => (
                          <CalendarEvent
                            key={event.id}
                            event={event}
                            movable={movable(event)}
                            onClick={onEventClick}
                            onDragStart={(item) => setDraggedEventId(item.id)}
                            onDragEnd={() => setDraggedEventId(null)}
                          />
                        ))}
                        {dayEvents.length > 3 ? (
                          <button
                            className="px-1 text-[9px] font-bold text-[color:var(--primary)]"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedDate(day);
                              setView("day");
                            }}
                          >
                            + {dayEvents.length - 3} compromisso(s)
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {view === "week" ? (
            <div className="grid min-h-[660px] min-w-[720px] grid-cols-7">
              {weekDays.map((day) => {
                const key = toAcademicDateKey(day);
                const dayEvents = eventsByDate.get(key) || [];
                const isToday = sameDate(day, currentDate);
                return (
                  <div
                    key={key}
                    className="border-r border-[color:var(--outline-variant)]/40 bg-[color:var(--surface)]"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => dropOnDate(key)}
                  >
                    <button
                      className="flex w-full flex-col items-center border-b border-[color:var(--outline-variant)]/40 py-4"
                      type="button"
                      onClick={() => {
                        setSelectedDate(day);
                        setView("day");
                      }}
                    >
                      <span className="text-[9px] font-extrabold text-[color:var(--on-surface-variant)]">
                        {WEEKDAYS[day.getDay()]}
                      </span>
                      <span
                        className={`mt-1 flex h-8 w-8 items-center justify-center rounded-full text-sm font-extrabold ${
                          isToday
                            ? "bg-[color:var(--on-surface)] text-[color:var(--surface)]"
                            : ""
                        }`}
                      >
                        {day.getDate()}
                      </span>
                    </button>
                    <div className="space-y-2 p-2">
                      {dayEvents.map((event) => (
                        <CalendarEvent
                          key={event.id}
                          compact
                          event={event}
                          movable={movable(event)}
                          onClick={onEventClick}
                          onDragStart={(item) => setDraggedEventId(item.id)}
                          onDragEnd={() => setDraggedEventId(null)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {view === "day" ? (
            <div className="mx-auto max-w-3xl p-6 md:p-10">
              <div className="flex items-center justify-between border-b border-[color:var(--outline-variant)]/40 pb-5">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-[color:var(--on-surface-variant)]">
                    Agenda do dia
                  </p>
                  <h3 className="mt-1 text-2xl font-extrabold capitalize">
                    {selectedDate.toLocaleDateString("pt-BR", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}
                  </h3>
                </div>
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--on-surface)] text-lg font-extrabold text-[color:var(--surface)]">
                  {selectedDate.getDate()}
                </span>
              </div>
              <div
                className="mt-6 min-h-[420px] space-y-3"
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => dropOnDate(toAcademicDateKey(selectedDate))}
              >
                {(eventsByDate.get(toAcademicDateKey(selectedDate)) || [])
                  .sort((left, right) =>
                    String(left.startTime || "").localeCompare(
                      String(right.startTime || ""),
                    ),
                  )
                  .map((event) => (
                    <div
                      key={event.id}
                      className="grid grid-cols-[64px_1fr] items-start gap-4"
                    >
                      <span className="pt-2 text-right text-xs font-bold text-[color:var(--on-surface-variant)]">
                        {event.startTime || "Dia todo"}
                      </span>
                      <CalendarEvent
                        compact
                        event={event}
                        movable={movable(event)}
                        onClick={onEventClick}
                        onDragStart={(item) => setDraggedEventId(item.id)}
                      onDragEnd={() => setDraggedEventId(null)}
                      />
                    </div>
                  ))}
                {!eventsByDate.get(toAcademicDateKey(selectedDate))?.length ? (
                  <div className="flex min-h-[320px] flex-col items-center justify-center text-center">
                    <Icon
                      className="text-4xl text-[color:var(--outline)]"
                      name="event_available"
                    />
                    <p className="mt-3 text-sm font-bold text-[color:var(--on-surface-variant)]">
                      Nenhum compromisso neste dia.
                    </p>
                    <button
                      type="button"
                      onClick={() => openAddTask(selectedDate)}
                      className="mt-3 flex items-center gap-1.5 rounded-xl bg-[color:var(--primary)] px-4 py-2 text-xs font-bold text-[color:var(--on-primary)] shadow-sm transition-all hover:opacity-90 active:scale-95"
                    >
                      <Icon name="add" className="text-sm" />
                      <span>Adicionar Tarefa</span>
                    </button>
                  </div>
                ) : (
                  <div className="mt-6 flex justify-center border-t border-[color:var(--outline-variant)]/30 pt-4">
                    <button
                      type="button"
                      onClick={() => openAddTask(selectedDate)}
                      className="flex items-center gap-2 rounded-xl border border-dashed border-[color:var(--outline-variant)]/60 bg-[color:var(--surface-container-low)] px-4 py-2 text-xs font-bold text-[color:var(--on-surface-variant)] transition-all hover:border-[color:var(--primary)] hover:bg-[color:var(--surface)] hover:text-[color:var(--primary)]"
                    >
                      <Icon name="add_task" className="text-sm" />
                      <span>Adicionar tarefa neste dia</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>

        <aside className="space-y-5 border-l border-[color:var(--outline-variant)]/45 bg-[color:var(--surface-container-low)] p-5">
          <MiniCalendar
            cursor={cursor}
            selectedDate={selectedDate}
            onMove={moveMiniMonth}
            onSelect={selectDay}
          />

          <section className="rounded-xl border border-[color:var(--outline-variant)]/45 bg-[color:var(--surface)] p-4">
            <h3 className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[color:var(--on-surface)]">
              Disciplinas
            </h3>
            <div className="mt-3 space-y-2.5">
              {subjects.map((subject) => {
                const checked = visibleSubjectIds.has(subject.id);
                return (
                  <label
                    key={subject.id}
                    className="flex cursor-pointer items-center gap-2.5 text-xs font-semibold text-[color:var(--on-surface-variant)]"
                  >
                    <input
                      className="rounded border-[color:var(--outline)] text-[color:var(--on-surface)] focus:ring-[color:var(--primary)]"
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSubject(subject.id)}
                    />
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: subject.color || "#64748b" }}
                    />
                    <span className="truncate">{subject.name}</span>
                  </label>
                );
              })}
              {!subjects.length ? (
                <p className="text-xs text-[color:var(--on-surface-variant)]">
                  Nenhuma disciplina neste semestre.
                </p>
              ) : null}
            </div>
            {onAddSubject ? (
              <button
                className="mt-4 flex w-full items-center gap-2 border-t border-[color:var(--outline-variant)]/40 pt-3 text-xs font-bold text-[color:var(--on-surface-variant)] hover:text-[color:var(--primary)]"
                type="button"
                onClick={onAddSubject}
              >
                <Icon className="text-base" name="add" />
                Adicionar disciplina
              </button>
            ) : null}
          </section>

          <section>
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[color:var(--on-surface)]">
                Próximos prazos
              </h3>
              <button
                type="button"
                onClick={() => openAddTask(selectedDate)}
                className="flex items-center gap-1 text-[11px] font-bold text-[color:var(--primary)] hover:underline"
              >
                <Icon name="add" className="text-sm" />
                <span>Nova</span>
              </button>
            </div>
            <div className="mt-2 space-y-2">
              {upcomingDeadlines.map((event) => {
                const today = event.date === toAcademicDateKey(new Date());
                return (
                  <button
                    key={event.id}
                    className={`w-full rounded-md border p-3 text-left ${
                      today
                        ? "border-red-300 bg-red-50"
                        : "border-[color:var(--outline-variant)]/45 bg-[color:var(--surface)]"
                    }`}
                    type="button"
                    onClick={() => onEventClick?.(event)}
                  >
                    <span
                      className={`block text-[9px] font-extrabold ${
                        today
                          ? "text-red-600"
                          : "text-[color:var(--on-surface-variant)]"
                      }`}
                    >
                      {today ? "Hoje" : shortDate(event.date)}
                    </span>
                    <span className="mt-1 block truncate text-xs font-bold text-[color:var(--on-surface)]">
                      {event.title}
                    </span>
                  </button>
                );
              })}
              {!upcomingDeadlines.length ? (
                <p className="rounded-md border border-dashed border-[color:var(--outline-variant)]/45 p-4 text-center text-xs text-[color:var(--on-surface-variant)]">
                  Nenhum prazo próximo.
                </p>
              ) : null}
            </div>
          </section>
        </aside>
      </div>

      {isTaskModalOpen ? (
        <CalendarTaskModal
          initialDate={taskModalDate}
          initialSubjectId={initialSubjectId === "all" ? "" : initialSubjectId}
          onClose={() => setIsTaskModalOpen(false)}
        />
      ) : null}
    </section>
  );
}
