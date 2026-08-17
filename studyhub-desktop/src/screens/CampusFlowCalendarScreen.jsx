import { useMemo, useState } from "react";
import { SCREEN_IDS } from "../app/screenIds";
import { AcademicCalendar } from "../components/AcademicCalendar";
import { CalendarTaskModal } from "../components/CalendarTaskModal";
import { buildAcademicCalendarEvents, getAcademicSemesterData, toAcademicDateKey } from "../domain/academic";
import { useStudyStore } from "../store/useStore";
import { Icon } from "../ui/Icon";

const addDays = (date, amount) => {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
};

const weekStart = (date) => {
  const result = new Date(date);
  result.setHours(12, 0, 0, 0);
  result.setDate(result.getDate() - result.getDay());
  return result;
};

export function CampusFlowCalendarScreen({ onNavigate }) {
  const academicState = useStudyStore((state) => state.academic);
  const tasks = useStudyStore((state) => state.tasks);
  const decks = useStudyStore((state) => state.flashcardDecks);
  const studyItems = useStudyStore((state) => state.studyItems);
  const updateTask = useStudyStore((state) => state.updateTask);
  const updateAcademicEntity = useStudyStore((state) => state.updateAcademicEntity);
  const setActiveTask = useStudyStore((state) => state.setActiveTask);
  const setActiveAcademicSubject = useStudyStore((state) => state.setActiveAcademicSubject);
  const academic = useMemo(() => getAcademicSemesterData(academicState), [academicState]);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [isMobileTaskModalOpen, setIsMobileTaskModalOpen] = useState(false);
  const start = weekStart(selectedDate);
  const week = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1, 12);
  const monthEnd = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0, 12);
  const events = useMemo(
    () =>
      buildAcademicCalendarEvents(
        { academic: academicState, tasks, flashcardDecks: decks, studyItems },
        {
          semesterId: academic.activeSemesterId,
          startDate: toAcademicDateKey(monthStart),
          endDate: toAcademicDateKey(monthEnd),
        },
      ),
    [academic.activeSemesterId, academicState, decks, monthEnd.getTime(), monthStart.getTime(), tasks, studyItems],
  );
  const dayEvents = events
    .filter((event) => event.date === toAcademicDateKey(selectedDate))
    .sort((a, b) => String(a.startTime || "99:99").localeCompare(String(b.startTime || "99:99")));

  const setActiveNote = useStudyStore((state) => state.setActiveNote);

  const openEvent = (event) => {
    if (!event) return;
    if (event.source === "task" || event.type === "task") {
      setActiveTask(event.original?.id || event.sourceId || event.id);
      onNavigate?.(SCREEN_IDS.TASK_DETAILS);
      return;
    }
    if (event.source === "note" || event.type === "note" || event.type === "class_note" || event.noteId) {
      const noteId = event.original?.id || event.sourceId || event.noteId || event.id;
      if (noteId) {
        setActiveNote(noteId);
        if (event.subjectId) {
          setActiveAcademicSubject(event.subjectId);
        }
        onNavigate?.(SCREEN_IDS.NOTE_EDITOR);
        return;
      }
    }
    if (event.subjectId) {
      setActiveAcademicSubject(event.subjectId);
      onNavigate?.(SCREEN_IDS.ACADEMIC_SUBJECT);
    }
  };

  const moveEvent = (event, date) => {
    const id = event.original?.id || event.sourceId;
    if (!id || !date) return;
    // Normalize date to canonical YYYY-MM-DD key before persisting
    const normalizedDate = typeof date === "string" ? date : toAcademicDateKey(date);

    if (event.source === "task") {
      updateTask(id, { dueDate: normalizedDate });
      return;
    }
    const collection = event.source === "exam" ? "exams" : event.source === "project" ? "projects" : "events";
    updateAcademicEntity(collection, id, { date: normalizedDate });
  };

  return (
    <main className="campus-calendar-page">
      <div className="campus-calendar-desktop">
        <AcademicCalendar
          semesterId={academic.activeSemesterId}
          onEventClick={openEvent}
          onEventMove={moveEvent}
        />
      </div>

      <div className="campus-calendar-mobile">
        <header>
          <div>
            <h1>{selectedDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</h1>
            <button type="button" onClick={() => setSelectedDate(new Date())}>Hoje</button>
          </div>
          <nav>
            {week.map((day) => {
              const active = toAcademicDateKey(day) === toAcademicDateKey(selectedDate);
              return (
                <button key={toAcademicDateKey(day)} type="button" onClick={() => setSelectedDate(day)}>
                  <small>{["D", "S", "T", "Q", "Q", "S", "S"][day.getDay()]}</small>
                  <span className={active ? "active" : ""}>{day.getDate()}</span>
                </button>
              );
            })}
          </nav>
        </header>
        <section className="campus-mobile-timeline">
          {dayEvents.map((event) => (
            <button key={event.id} className="campus-mobile-event" type="button" onClick={() => openEvent(event)}>
              <time>{event.startTime || "Dia todo"}</time>
              <article style={{ "--event-color": event.color || "#1e293b" }}>
                <h2>{event.title}</h2>
                <p><Icon name={event.room ? "location_on" : "school"} /> {event.room || event.subjectName || "Compromisso acadêmico"}</p>
                <span>{event.subjectName || event.type}</span>
              </article>
            </button>
          ))}
          {!dayEvents.length ? (
            <div className="campus-mobile-calendar-empty">
              <Icon name="event_available" />
              <strong>Dia livre</strong>
              <span>Nenhum compromisso nesta data.</span>
              <button
                type="button"
                onClick={() => setIsMobileTaskModalOpen(true)}
                className="mt-3 flex items-center gap-1.5 rounded-xl bg-[color:var(--primary)] px-4 py-2 text-xs font-bold text-[color:var(--on-primary)] shadow-sm"
              >
                <Icon name="add" className="text-sm" />
                <span>Adicionar Tarefa</span>
              </button>
            </div>
          ) : null}
        </section>
        <button
          className="campus-calendar-fab"
          type="button"
          onClick={() => setIsMobileTaskModalOpen(true)}
          aria-label="Nova tarefa"
        >
          <Icon name="add" />
        </button>
      </div>

      {isMobileTaskModalOpen ? (
        <CalendarTaskModal
          initialDate={toAcademicDateKey(selectedDate)}
          onClose={() => setIsMobileTaskModalOpen(false)}
        />
      ) : null}
    </main>
  );
}
