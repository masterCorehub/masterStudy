import { useMemo, useState } from "react";
import {
  buildAcademicCalendarEvents,
  toAcademicDateKey,
} from "../domain/academic";
import {
  getCalendarEventMove,
  getCalendarMonthDays,
  isCalendarEventCompleted,
} from "../domain/calendarView";
import { useStudyStore } from "../store/useStore";
import { Icon } from "../ui/Icon";
import { useCurrentDate } from "../utils/useCurrentDate";
import { CalendarTaskModal } from "./CalendarTaskModal";
import "./AcademicCalendar.css";

const VIEW_OPTIONS = [
  { id: "month", label: "Mês" },
  { id: "week", label: "Semana" },
  { id: "day", label: "Dia" },
];
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const TYPE_ICONS = {
  class: "school",
  exam: "quiz",
  project: "assignment",
  task: "task_alt",
  review: "style",
  class_note: "edit_note",
  "study-session": "menu_book",
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
const dateFromKey = (value) => new Date(`${value}T12:00:00`);
const capitalize = (text) =>
  text.charAt(0).toLocaleUpperCase("pt-BR") + text.slice(1);
const monthLabel = (date) =>
  capitalize(
    date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
  );
const shortDate = (value) =>
  dateFromKey(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
const dayLabel = (date) =>
  capitalize(
    date.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }),
  );
const sameDate = (left, right) =>
  toAcademicDateKey(left) === toAcademicDateKey(right);

function CalendarEvent({
  event,
  variant = "month",
  todayKey,
  onClick,
  movable = false,
  onDragStart,
  onDragEnd,
}) {
  const completed = isCalendarEventCompleted(event);
  const task = event.source === "task" || event.type === "task";
  const status = event.status || event.original?.status;
  const taskStatus = ["cancelled", "canceled"].includes(status)
    ? "Cancelada"
    : completed
      ? "Concluída"
      : status === "in_progress"
        ? "Em andamento"
        : "Pendente";
  const urgent =
    ["task", "exam", "project"].includes(event.source) &&
    !completed &&
    event.date <= todayKey;
  return (
    <button
      type="button"
      className={`academic-calendar-event academic-calendar-event--${variant}${urgent ? " is-urgent" : ""}${completed ? " is-completed" : ""}`}
      style={{ "--event-color": event.color || "var(--primary)" }}
      draggable={movable}
      data-event-id={event.id}
      aria-label={`${task ? `Tarefa ${taskStatus.toLocaleLowerCase("pt-BR")} · ` : ""}${event.title} · ${shortDate(event.date)}${event.startTime ? ` · ${event.startTime}` : ""}`}
      title={`${event.title}${event.subjectName ? ` · ${event.subjectName}` : ""}${event.startTime ? ` · ${event.startTime}` : ""}`}
      onClick={(click) => {
        click.stopPropagation();
        onClick?.(event);
      }}
      onDragStart={(drag) => {
        drag.stopPropagation();
        drag.dataTransfer.effectAllowed = "move";
        drag.dataTransfer.setData("text/plain", event.id);
        onDragStart?.(event);
      }}
      onDragEnd={(drag) => {
        drag.stopPropagation();
        onDragEnd?.();
      }}
    >
      {variant !== "month" ? (
        <Icon
          name={
            task && completed
              ? "check_circle"
              : TYPE_ICONS[event.type] || "event"
          }
          className="academic-calendar-event-icon"
        />
      ) : null}
      <span className="academic-calendar-event-content">
        <strong>{event.title}</strong>
        {task ? (
          <span
            className={`academic-calendar-task-status${completed ? " is-done" : ""}`}
          >
            <Icon
              name={completed ? "check_circle" : "radio_button_unchecked"}
            />
            <span>Tarefa · {taskStatus}</span>
          </span>
        ) : null}
        {event.startTime || (variant !== "month" && event.subjectName) ? (
          <span className="academic-calendar-event-meta">
            {event.startTime ? (
              <time>
                {event.startTime}
                {variant !== "month" && event.endTime
                  ? `–${event.endTime}`
                  : ""}
              </time>
            ) : null}
            {variant !== "month" &&
            event.subjectName &&
            event.subjectName !== event.title ? (
              <span>{event.subjectName}</span>
            ) : null}
          </span>
        ) : null}
      </span>
      {completed && variant !== "month" ? (
        <Icon
          name="check_circle"
          className="academic-calendar-completed-icon"
        />
      ) : null}
    </button>
  );
}

function MiniCalendar({ cursor, selectedDate, currentDate, onSelect, onMove }) {
  return (
    <details className="academic-calendar-mini">
      <summary>
        <Icon name="calendar_month" /> Navegar por data{" "}
        <Icon name="expand_more" />
      </summary>
      <div className="academic-calendar-mini-inner">
        <header>
          <strong>{monthLabel(cursor)}</strong>
          <span>
            <button
              type="button"
              aria-label="Mês anterior no seletor"
              onClick={() => onMove(-1)}
            >
              <Icon name="chevron_left" />
            </button>
            <button
              type="button"
              aria-label="Próximo mês no seletor"
              onClick={() => onMove(1)}
            >
              <Icon name="chevron_right" />
            </button>
          </span>
        </header>
        <div className="academic-calendar-mini-grid">
          {WEEKDAYS.map((day) => (
            <small key={day}>{day[0]}</small>
          ))}
          {getCalendarMonthDays(cursor).map((day) => (
            <button
              key={toAcademicDateKey(day)}
              type="button"
              aria-label={dayLabel(day)}
              aria-pressed={sameDate(day, selectedDate)}
              aria-current={sameDate(day, currentDate) ? "date" : undefined}
              className={`${day.getMonth() !== cursor.getMonth() ? "is-outside " : ""}${sameDate(day, selectedDate) ? "is-selected " : ""}${sameDate(day, currentDate) ? "is-today" : ""}`}
              onClick={() => onSelect(day)}
            >
              {day.getDate()}
            </button>
          ))}
        </div>
      </div>
    </details>
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
  const todayKey = toAcademicDateKey(currentDate);
  const [view, setView] = useState(compact ? "day" : "month");
  const [cursor, setCursor] = useState(() => currentDate);
  const [selectedDate, setSelectedDate] = useState(() => currentDate);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [draggedEventId, setDraggedEventId] = useState(null);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState(() =>
    initialSubjectId === "all" ? null : new Set([initialSubjectId]),
  );
  const [taskModalDate, setTaskModalDate] = useState(null);
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
  const monthDays = useMemo(() => getCalendarMonthDays(cursor), [cursor]);
  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) =>
        addDays(startOfWeek(selectedDate), index),
      ),
    [selectedDate],
  );
  const range = useMemo(() => {
    if (compact) return { start: currentDate, end: addDays(currentDate, 30) };
    if (view === "day") return { start: selectedDate, end: selectedDate };
    if (view === "week") return { start: weekDays[0], end: weekDays[6] };
    return { start: monthDays[0], end: monthDays.at(-1) };
  }, [compact, currentDate, monthDays, selectedDate, view, weekDays]);
  const events = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
    return buildAcademicCalendarEvents(
      { academic, tasks, flashcardDecks, studyItems },
      {
        semesterId: activeSemesterId,
        startDate: toAcademicDateKey(range.start),
        endDate: toAcademicDateKey(range.end),
      },
    ).filter(
      (event) =>
        (!event.subjectId || visibleSubjectIds.has(event.subjectId)) &&
        (!normalizedSearch ||
          `${event.title} ${event.subjectName || ""}`
            .toLocaleLowerCase("pt-BR")
            .includes(normalizedSearch)),
    );
  }, [
    academic,
    tasks,
    flashcardDecks,
    studyItems,
    activeSemesterId,
    range,
    search,
    visibleSubjectIds,
  ]);

  // Map permite consultar os eventos de um dia sem filtrar a lista inteira em cada célula.
  const eventsByDate = useMemo(() => {
    const grouped = new Map();
    for (const event of events) {
      if (!grouped.has(event.date)) grouped.set(event.date, []);
      grouped.get(event.date).push(event);
    }
    return grouped;
  }, [events]);
  const selectedEvents =
    eventsByDate.get(toAcademicDateKey(selectedDate)) || [];
  const upcomingDeadlines = useMemo(
    () =>
      buildAcademicCalendarEvents(
        { academic, tasks, flashcardDecks },
        {
          semesterId: activeSemesterId,
          startDate: todayKey,
          endDate: toAcademicDateKey(addDays(currentDate, 90)),
        },
      )
        .filter(
          (event) =>
            ["task", "exam", "project"].includes(event.source) &&
            !isCalendarEventCompleted(event) &&
            (!event.subjectId || visibleSubjectIds.has(event.subjectId)),
        )
        .slice(0, 5),
    [
      academic,
      tasks,
      flashcardDecks,
      activeSemesterId,
      todayKey,
      currentDate,
      visibleSubjectIds,
    ],
  );

  const openAddTask = (date = selectedDate) =>
    setTaskModalDate(typeof date === "string" ? date : toAcademicDateKey(date));
  const selectDay = (day) => {
    setSelectedDate(day);
    setCursor(new Date(day.getFullYear(), day.getMonth(), 1, 12));
  };
  const moveMonth = (direction) => {
    const nextMonth = new Date(
      cursor.getFullYear(),
      cursor.getMonth() + direction,
      1,
      12,
    );
    const lastDay = new Date(
      nextMonth.getFullYear(),
      nextMonth.getMonth() + 1,
      0,
    ).getDate();
    selectDay(
      new Date(
        nextMonth.getFullYear(),
        nextMonth.getMonth(),
        Math.min(selectedDate.getDate(), lastDay),
        12,
      ),
    );
  };
  const move = (direction) =>
    view === "month"
      ? moveMonth(direction)
      : selectDay(addDays(selectedDate, direction * (view === "week" ? 7 : 1)));
  const toggleSubject = (id) =>
    setSelectedSubjectIds((current) => {
      // Copiar o Set preserva a referência anterior e permite ao React detectar a mudança.
      const next = new Set(current || subjects.map((subject) => subject.id));
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const movable = (event) =>
    Boolean(onEventMove && getCalendarEventMove(event, event.date));
  const dropOnDate = (date) => {
    const dateKey = typeof date === "string" ? date : toAcademicDateKey(date);
    const event = events.find((item) => item.id === draggedEventId);
    setDraggedEventId(null);
    if (event && movable(event) && event.date !== dateKey)
      onEventMove?.(event, dateKey);
  };
  const eventProps = (event) => ({
    event,
    todayKey,
    onClick: onEventClick,
    movable: movable(event),
    onDragStart: (item) => setDraggedEventId(item.id),
    onDragEnd: () => setDraggedEventId(null),
  });
  const title =
    view === "month"
      ? monthLabel(cursor)
      : view === "week"
        ? `${shortDate(toAcademicDateKey(weekDays[0]))} — ${shortDate(toAcademicDateKey(weekDays[6]))}`
        : dayLabel(selectedDate);

  if (compact)
    return (
      <section className="academic-calendar-compact">
        <header>
          <div>
            <small>Agenda</small>
            <h3>{monthLabel(currentDate)}</h3>
          </div>
          <button type="button" onClick={() => selectDay(currentDate)}>
            Hoje
          </button>
        </header>
        <div className="academic-calendar-compact-events">
          {events.slice(0, 7).map((event) => (
            <div key={event.id}>
              <time>{shortDate(event.date)}</time>
              <CalendarEvent variant="list" {...eventProps(event)} />
            </div>
          ))}
          {!events.length ? (
            <p className="academic-calendar-empty">
              Nenhum compromisso próximo.
            </p>
          ) : null}
        </div>
      </section>
    );

  return (
    <section className="academic-calendar" aria-label="Calendário acadêmico">
      <header className="academic-calendar-toolbar">
        <div className="academic-calendar-heading">
          <small>Agenda</small>
          <h2>{title}</h2>
        </div>
        <div className="academic-calendar-navigation">
          <button
            type="button"
            aria-label="Período anterior"
            onClick={() => move(-1)}
          >
            <Icon name="chevron_left" />
          </button>
          <button
            type="button"
            aria-label="Próximo período"
            onClick={() => move(1)}
          >
            <Icon name="chevron_right" />
          </button>
          <button
            type="button"
            className="academic-calendar-today"
            onClick={() => selectDay(currentDate)}
          >
            Hoje
          </button>
        </div>
        <div className="academic-calendar-actions">
          <div
            className="academic-calendar-views"
            aria-label="Visualização do calendário"
          >
            {VIEW_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={view === option.id}
                onClick={() => setView(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="academic-calendar-icon-button"
            aria-label={
              searchOpen ? "Fechar busca de eventos" : "Buscar eventos"
            }
            aria-expanded={searchOpen}
            onClick={() => {
              setSearchOpen(!searchOpen);
              if (searchOpen) setSearch("");
            }}
          >
            <Icon name={searchOpen ? "close" : "search"} />
          </button>
          <button
            type="button"
            className="academic-calendar-add"
            onClick={() => openAddTask()}
          >
            <Icon name="add" />
            <span>Nova tarefa</span>
          </button>
        </div>
      </header>
      {searchOpen ? (
        <div className="academic-calendar-search">
          <Icon name="search" />
          <input
            type="search"
            autoFocus
            aria-label="Buscar evento"
            placeholder="Buscar por título ou disciplina…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <span>{events.length} resultado(s)</span>
        </div>
      ) : null}
      <div className="academic-calendar-layout">
        <div className="academic-calendar-main">
          {view === "month" ? (
            <div
              className="academic-calendar-month"
              data-week-count={monthDays.length / 7}
            >
              <div className="academic-calendar-weekdays">
                {WEEKDAYS.map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>
              <div
                className="academic-calendar-month-grid"
                style={{ "--week-count": monthDays.length / 7 }}
              >
                {monthDays.map((day) => {
                  const key = toAcademicDateKey(day);
                  const dayEvents = eventsByDate.get(key) || [];
                  const outside = day.getMonth() !== cursor.getMonth();
                  const isToday = sameDate(day, currentDate);
                  const selected = sameDate(day, selectedDate);
                  return (
                    <div
                      key={key}
                      data-date={key}
                      className={`academic-calendar-day${outside ? " is-outside" : ""}${isToday ? " is-today" : ""}${selected ? " is-selected" : ""}${draggedEventId ? " is-drop-target" : ""}`}
                      onClick={() => selectDay(day)}
                      onDragOver={(event) => {
                        if (draggedEventId) event.preventDefault();
                      }}
                      onDrop={() => dropOnDate(key)}
                    >
                      <div className="academic-calendar-day-header">
                        <button
                          type="button"
                          className="academic-calendar-date"
                          aria-label={`Selecionar ${dayLabel(day)}`}
                          aria-pressed={selected}
                          aria-current={isToday ? "date" : undefined}
                          onClick={(event) => {
                            event.stopPropagation();
                            selectDay(day);
                          }}
                        >
                          {day.getDate()}
                        </button>
                        <button
                          type="button"
                          className="academic-calendar-day-add"
                          aria-label={`Adicionar tarefa em ${key}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            openAddTask(day);
                          }}
                        >
                          <Icon name="add" />
                        </button>
                      </div>
                      <div className="academic-calendar-day-events">
                        {dayEvents.slice(0, 3).map((event) => (
                          <CalendarEvent
                            key={event.id}
                            {...eventProps(event)}
                          />
                        ))}
                        {dayEvents.length > 3 ? (
                          <button
                            type="button"
                            className="academic-calendar-more"
                            onClick={(event) => {
                              event.stopPropagation();
                              selectDay(day);
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
            <div className="academic-calendar-week-scroll">
              <div className="academic-calendar-week">
                {weekDays.map((day) => {
                  const key = toAcademicDateKey(day);
                  const dayEvents = eventsByDate.get(key) || [];
                  return (
                    <section
                      key={key}
                      data-date={key}
                      className={sameDate(day, currentDate) ? "is-today" : ""}
                      onDragOver={(event) => {
                        if (draggedEventId) event.preventDefault();
                      }}
                      onDrop={() => dropOnDate(key)}
                    >
                      <button
                        className="academic-calendar-week-heading"
                        type="button"
                        onClick={() => {
                          selectDay(day);
                          setView("day");
                        }}
                      >
                        <small>{WEEKDAYS[day.getDay()]}</small>
                        <strong>{day.getDate()}</strong>
                        <span>
                          {dayEvents.length
                            ? `${dayEvents.length} compromisso(s)`
                            : "Livre"}
                        </span>
                      </button>
                      <div>
                        {dayEvents.map((event) => (
                          <CalendarEvent
                            key={event.id}
                            variant="list"
                            {...eventProps(event)}
                          />
                        ))}
                      </div>
                      <button
                        type="button"
                        className="academic-calendar-week-add"
                        aria-label={`Adicionar tarefa em ${key}`}
                        onClick={() => openAddTask(day)}
                      >
                        <Icon name="add" /> Adicionar
                      </button>
                    </section>
                  );
                })}
              </div>
            </div>
          ) : null}
          {view === "day" ? (
            <section
              className="academic-calendar-agenda"
              onDragOver={(event) => {
                if (draggedEventId) event.preventDefault();
              }}
              onDrop={() => dropOnDate(selectedDate)}
            >
              <header>
                <Icon name="event_note" />
                <div>
                  <h3>Compromissos do dia</h3>
                  <p>
                    {selectedEvents.length
                      ? `${selectedEvents.length} compromisso(s) · ${dayLabel(selectedDate)}`
                      : "Um espaço para organizar o que vem a seguir."}
                  </p>
                </div>
                <button type="button" onClick={() => openAddTask()}>
                  Adicionar tarefa
                </button>
              </header>
              {selectedEvents.map((event) => (
                <div className="academic-calendar-agenda-row" key={event.id}>
                  <time>{event.startTime || "Dia todo"}</time>
                  <CalendarEvent variant="agenda" {...eventProps(event)} />
                </div>
              ))}
              {!selectedEvents.length ? (
                <div className="academic-calendar-agenda-empty">
                  <Icon name="event_available" />
                  <strong>Dia livre</strong>
                  <p>Nenhum compromisso nesta data.</p>
                  <button type="button" onClick={() => openAddTask()}>
                    <Icon name="add" /> Criar uma tarefa
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}
          {search && !events.length ? (
            <p className="academic-calendar-search-empty">
              Nenhum evento encontrado. Tente outro título ou confira os filtros
              de disciplinas.
            </p>
          ) : null}
        </div>
        <aside className="academic-calendar-sidebar">
          {view !== "day" ? (
            <section className="academic-calendar-day-preview">
              <header>
                <div>
                  <small>Dia selecionado</small>
                  <h3>{dayLabel(selectedDate)}</h3>
                </div>
                <span>{selectedEvents.length}</span>
              </header>
              <div className="academic-calendar-selected-events">
                {selectedEvents.slice(0, 4).map((event) => (
                  <CalendarEvent
                    key={event.id}
                    variant="list"
                    {...eventProps(event)}
                  />
                ))}
              </div>
              {!selectedEvents.length ? (
                <p className="academic-calendar-empty">
                  Nenhum compromisso nesta data.
                </p>
              ) : null}
              <button
                type="button"
                className="academic-calendar-day-link"
                onClick={() => setView("day")}
              >
                Ver agenda do dia <Icon name="arrow_forward" />
              </button>
            </section>
          ) : null}
          <section
            className="academic-calendar-deadlines"
            aria-label="Próximos prazos"
          >
            <header>
              <h3>Próximos prazos</h3>
              <button
                type="button"
                aria-label="Criar tarefa nos prazos"
                onClick={() => openAddTask()}
              >
                <Icon name="add" />
              </button>
            </header>
            {upcomingDeadlines.map((event) => (
              <button
                key={event.id}
                type="button"
                className={`academic-calendar-deadline${event.date === todayKey ? " is-due-today" : ""}`}
                onClick={() => onEventClick?.(event)}
              >
                <span className="academic-calendar-deadline-date">
                  <Icon name={event.date === todayKey ? "schedule" : "event"} />
                  {event.date === todayKey ? "Hoje" : shortDate(event.date)}
                  {event.startTime ? ` · ${event.startTime}` : ""}
                </span>
                <strong>{event.title}</strong>
                {event.subjectName ? <small>{event.subjectName}</small> : null}
              </button>
            ))}
            {!upcomingDeadlines.length ? (
              <p className="academic-calendar-empty">
                <Icon name="check_circle" /> Nenhum prazo pendente nos próximos
                90 dias.
              </p>
            ) : null}
          </section>
          <details className="academic-calendar-subjects">
            <summary>
              <Icon name="filter_list" /> Disciplinas{" "}
              <span>
                {
                  subjects.filter((subject) =>
                    visibleSubjectIds.has(subject.id),
                  ).length
                }
                /{subjects.length}
              </span>
              <Icon name="expand_more" />
            </summary>
            <div>
              {subjects.map((subject) => (
                <label key={subject.id} title={subject.name}>
                  <input
                    type="checkbox"
                    checked={visibleSubjectIds.has(subject.id)}
                    onChange={() => toggleSubject(subject.id)}
                  />
                  <span
                    className="academic-calendar-subject-dot"
                    style={{
                      backgroundColor: subject.color || "var(--primary)",
                    }}
                  />
                  <span>{subject.name}</span>
                </label>
              ))}
              {!subjects.length ? (
                <p className="academic-calendar-empty">
                  Nenhuma disciplina neste semestre.
                </p>
              ) : null}
              {onAddSubject ? (
                <button type="button" onClick={onAddSubject}>
                  <Icon name="add" /> Adicionar disciplina
                </button>
              ) : null}
            </div>
          </details>
          <MiniCalendar
            cursor={cursor}
            selectedDate={selectedDate}
            currentDate={currentDate}
            onMove={moveMonth}
            onSelect={selectDay}
          />
        </aside>
      </div>
      {taskModalDate ? (
        <CalendarTaskModal
          initialDate={taskModalDate}
          initialSubjectId={initialSubjectId === "all" ? "" : initialSubjectId}
          onClose={() => setTaskModalDate(null)}
        />
      ) : null}
    </section>
  );
}
