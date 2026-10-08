import { useMemo } from "react";
import { SCREEN_IDS } from "../app/screenIds";
import { AcademicCalendar } from "../components/AcademicCalendar";
import { getAcademicSemesterData } from "../domain/academic";
import { getCalendarEventMove } from "../domain/calendarView";
import { useStudyStore } from "../store/useStore";

export function CampusFlowCalendarScreen({ onNavigate }) {
  const academicState = useStudyStore((state) => state.academic);
  const academic = useMemo(
    () => getAcademicSemesterData(academicState),
    [academicState],
  );
  const updateTask = useStudyStore((state) => state.updateTask);
  const updateAcademicEntity = useStudyStore(
    (state) => state.updateAcademicEntity,
  );
  const setActiveTask = useStudyStore((state) => state.setActiveTask);
  const setActiveAcademicSubject = useStudyStore(
    (state) => state.setActiveAcademicSubject,
  );
  const setActiveNote = useStudyStore((state) => state.setActiveNote);

  const openEvent = (event) => {
    if (!event) return;
    if (event.source === "task" || event.type === "task") {
      setActiveTask(event.original?.id || event.sourceId || event.id);
      onNavigate?.(SCREEN_IDS.TASK_DETAILS);
    } else if (
      event.source === "note" ||
      event.type === "class_note" ||
      event.noteId
    ) {
      setActiveNote(
        event.original?.id || event.sourceId || event.noteId || event.id,
      );
      if (event.subjectId) setActiveAcademicSubject(event.subjectId);
      onNavigate?.(SCREEN_IDS.NOTE_EDITOR);
    } else if (event.subjectId) {
      setActiveAcademicSubject(event.subjectId);
      onNavigate?.(SCREEN_IDS.ACADEMIC_SUBJECT);
    }
  };

  const moveEvent = (event, date) => {
    // Cada origem define o campo correto, compartilhando a regra com o arraste.
    const move = getCalendarEventMove(event, date);
    if (!move) return;
    if (move.collection === "tasks") updateTask(move.id, move.updates);
    else updateAcademicEntity(move.collection, move.id, move.updates);
  };

  return (
    <main className="campus-calendar-page">
      <div className="campus-calendar-content">
        <AcademicCalendar
          semesterId={academic.activeSemesterId}
          onEventClick={openEvent}
          onEventMove={moveEvent}
        />
      </div>
    </main>
  );
}
