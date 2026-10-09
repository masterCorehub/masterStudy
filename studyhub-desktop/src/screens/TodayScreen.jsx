import { useMemo, useState } from "react";
import { Icon } from "../ui/Icon";
import { SCREEN_IDS } from "../app/screenIds";
import { useStudyStore } from "../store/useStore";

import {
  selectTodayData,
  scheduleTaskSessions,
} from "../domain/studySelectors";
import {
  buildAcademicCalendarEvents,
  calculateAttendance,
  getAcademicRecommendations,
  getAcademicSemesterData,
} from "../domain/academic";
import { AcademicCalendar } from "../components/AcademicCalendar";

import { getLocalDateKey } from "../utils/dateUtils";
import { useCurrentDate } from "../utils/useCurrentDate";

const formatFocus = (seconds) =>
  `${Math.floor(seconds / 3600) ? `${Math.floor(seconds / 3600)}h ` : ""}${Math.floor((seconds % 3600) / 60)}min`;

export function TodayScreen({ onNavigate }) {
  const currentDate = useCurrentDate();
  const state = useStudyStore((store) => store);




  const replaceStudyPlans = useStudyStore((store) => store.replaceStudyPlans);
  const addAcademicEntity = useStudyStore((store) => store.addAcademicEntity);
  const updateAcademicEntity = useStudyStore((store) => store.updateAcademicEntity);
  const deleteAcademicEntity = useStudyStore((store) => store.deleteAcademicEntity);
  const addNote = useStudyStore((store) => store.addNote);
  const setActiveNote = useStudyStore((store) => store.setActiveNote);
  const setActiveAcademicSubject = useStudyStore(
    (store) => store.setActiveAcademicSubject,
  );
  const setActiveDeck = useStudyStore((store) => store.setActiveDeck);
  const setActiveTask = useStudyStore((store) => store.setActiveTask);
  const [studyMinutes, setStudyMinutes] = useState(50);
  const [showCreateNoteModal, setShowCreateNoteModal] = useState(false);
  const [initialNoteSubjectId, setInitialNoteSubjectId] = useState("");
  const data = useMemo(() => selectTodayData(state), [state]);
  const activeAcademic = useMemo(
    () => getAcademicSemesterData(state.academic),
    [state.academic],
  );
  const recommendations = useMemo(
    () =>
      getAcademicRecommendations(state, {
        semesterId: activeAcademic.activeSemesterId,
        durationMinutes: studyMinutes,
      }),
    [activeAcademic.activeSemesterId, state, studyMinutes],
  );
  const goalMinutes = Number(state.dailyFocusGoalMinutes || 50);
  const progress = Math.min(
    100,
    Math.round((data.focusSeconds / (goalMinutes * 60)) * 100),
  );
  const upcomingAcademicEvents = useMemo(() => {
    const today = new Date(currentDate);
    today.setHours(12, 0, 0, 0);
    const end = new Date(today);
    end.setDate(end.getDate() + 14);
    return buildAcademicCalendarEvents(
      {
        academic: state.academic,
        tasks: state.tasks,
        flashcardDecks: state.flashcardDecks,
        studyItems: state.studyItems,
      },
      {
        semesterId: activeAcademic.activeSemesterId,
        startDate: getLocalDateKey(today),
        endDate: getLocalDateKey(end),
      },
    );
  }, [
    activeAcademic.activeSemesterId,
    state.academic,
    state.flashcardDecks,
    state.tasks,
    state.studyItems,
    currentDate,
  ]);
  const nextClass = upcomingAcademicEvents.find(
    (event) => event.type === "class",
  );
  const nextDeadline = upcomingAcademicEvents.find((event) =>
    ["task", "exam", "project"].includes(event.source),
  );
  const dateLabel = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(currentDate);
  const todayKey = getLocalDateKey(currentDate);
  const todayWeekday = currentDate.getDay();

  const [selectedScheduleDateKey, setSelectedScheduleDateKey] = useState(todayKey);

  const activeScheduleDateKey = selectedScheduleDateKey || todayKey;
  const activeScheduleDate = useMemo(() => {
    const d = new Date(`${activeScheduleDateKey}T12:00:00`);
    return Number.isNaN(d.getTime()) ? currentDate : d;
  }, [activeScheduleDateKey, currentDate]);
  const activeScheduleWeekday = activeScheduleDate.getDay();

  const isTodayActive = activeScheduleDateKey === todayKey;
  const isYesterdayActive = activeScheduleDateKey === getLocalDateKey(new Date(currentDate.getTime() - 86400000));

  const recentDaysList = useMemo(() => {
    const list = [];
    const weekdayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    for (let i = 0; i <= 6; i++) {
      const d = new Date(currentDate.getTime() - i * 86400000);
      const key = getLocalDateKey(d);
      const weekday = d.getDay();
      const label = i === 0 ? "Hoje" : i === 1 ? "Ontem" : i === 2 ? "Anteontem" : `${weekdayNames[weekday]} (${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")})`;
      list.push({ offset: i, key, weekday, label, date: d });
    }
    return list;
  }, [currentDate]);

  const classesToday = activeAcademic.subjects
    .filter(
      (subject) =>
        !subject.isArchived &&
        ((subject.schedule?.days || []).includes(activeScheduleWeekday) ||
          (activeAcademic.attendance || []).some(
            (a) => a.subjectId === subject.id && a.date === activeScheduleDateKey,
          ) ||
          (state.academic?.classLogs || []).some(
            (l) => l.subjectId === subject.id && l.date === activeScheduleDateKey,
          )),
    )
    .map((subject) => {
      const existingAttendance = (activeAcademic.attendance || []).find(
        (entry) =>
          entry.subjectId === subject.id && entry.date === activeScheduleDateKey,
      );
      const existingLog = (state.academic?.classLogs || []).find(
        (log) =>
          log.subjectId === subject.id && log.date === activeScheduleDateKey,
      );

      const existing = existingAttendance || existingLog;
      const status =
        existingAttendance?.status ||
        (existingLog?.attendanceStatus === "attended" || existingLog?.attendanceStatus === "present"
          ? "present"
          : existingLog?.attendanceStatus === "absent"
            ? "absent"
            : existingLog?.attendanceStatus === "late"
              ? "late"
              : null);

      const mappedExisting = existing
        ? {
            ...existing,
            status,
          }
        : null;

      const attendance = calculateAttendance(
        activeAcademic.attendance || [],
        subject,
        state.academic?.classLogs || [],
      );
      const semesterStart = new Date(
        `${activeAcademic.semester.startDate || activeScheduleDateKey}T12:00:00`,
      );
      const semesterEnd = new Date(
        `${activeAcademic.semester.endDate || activeScheduleDateKey}T12:00:00`,
      );
      const start = new Date(`${activeScheduleDateKey}T12:00:00`);
      const totalClasses = Math.max(
        0,
        (subject.schedule?.days || []).reduce((total, day) => {
          for (
            let date = new Date(
              Math.max(start.getTime(), semesterStart.getTime()),
            );
            date <= semesterEnd;
            date.setDate(date.getDate() + 1)
          ) {
            if (date.getDay() === Number(day)) total += 1;
          }
          return total;
        }, 0),
      );
      const allowedAbsences = Math.floor(
        totalClasses * (1 - Number(subject.minimumAttendance ?? 75) / 100),
      );
      return {
        subject,
        existing: mappedExisting,
        attendance,
        remainingClasses: totalClasses,
        remainingAbsences: Math.max(0, allowedAbsences - attendance.absences),
      };
    });

  const allSubjectsAttendance = useMemo(() => {
    return activeAcademic.subjects.map((subject) => {
      const attendance = calculateAttendance(
        activeAcademic.attendance || [],
        subject,
        state.academic?.classLogs || [],
      );
      const existingAttendance = (activeAcademic.attendance || []).find(
        (entry) => entry.subjectId === subject.id && entry.date === activeScheduleDateKey,
      );
      const existingLog = (state.academic?.classLogs || []).find(
        (log) => log.subjectId === subject.id && log.date === activeScheduleDateKey,
      );
      const existingToday = existingAttendance
        ? {
            ...existingAttendance,
            status: existingAttendance.status,
          }
        : existingLog
          ? {
              ...existingLog,
              status:
                existingLog.attendanceStatus === "attended" || existingLog.attendanceStatus === "present"
                  ? "present"
                  : existingLog.attendanceStatus === "absent"
                    ? "absent"
                    : existingLog.attendanceStatus === "late"
                      ? "late"
                      : null,
            }
          : null;

      const semesterStart = new Date(
        `${activeAcademic.semester.startDate || todayKey}T12:00:00`,
      );
      const semesterEnd = new Date(
        `${activeAcademic.semester.endDate || todayKey}T12:00:00`,
      );
      const days = subject.schedule?.days || [];
      let totalClasses = 0;
      if (
        days.length > 0 &&
        !Number.isNaN(semesterStart.getTime()) &&
        !Number.isNaN(semesterEnd.getTime())
      ) {
        for (
          let d = new Date(semesterStart);
          d <= semesterEnd;
          d.setDate(d.getDate() + 1)
        ) {
          if (days.includes(d.getDay())) totalClasses++;
        }
      }
      const minimumPct = Number(subject.minimumAttendance ?? 75);
      const maxAbsencesAllowed =
        totalClasses > 0
          ? Math.floor(totalClasses * (1 - minimumPct / 100))
          : 4;
      const remainingAbsences = Math.max(
        0,
        maxAbsencesAllowed - attendance.absences,
      );

      return {
        subject,
        attendance,
        existingToday,
        totalClasses,
        maxAbsencesAllowed,
        remainingAbsences,
        isAtRisk:
          attendance.total > 0 &&
          (attendance.attendanceRate < minimumPct ||
            attendance.attendanceRate < minimumPct + 5),
        isCritical:
          attendance.total > 0 && attendance.attendanceRate < minimumPct,
      };
    });
  }, [
    activeAcademic.subjects,
    activeAcademic.attendance,
    activeAcademic.semester,
    state.academic?.classLogs,
    activeScheduleDateKey,
    todayKey,
  ]);

  const registerTodayAttendance = (subjectId, status, targetDate = activeScheduleDateKey) => {
    const existingAttendance = (activeAcademic.attendance || []).find(
      (entry) => entry.subjectId === subjectId && entry.date === targetDate,
    );
    const existingLogs = state.academic?.classLogs || [];
    const todayLogForSubject = existingLogs.find(
      (log) => log.subjectId === subjectId && log.date === targetDate,
    );

    const currentStatus =
      existingAttendance?.status ||
      (todayLogForSubject?.attendanceStatus === "attended" || todayLogForSubject?.attendanceStatus === "present"
        ? "present"
        : todayLogForSubject?.attendanceStatus === "absent"
          ? "absent"
          : null);

    const isCurrentSame = currentStatus === status;
    const nextStatus = isCurrentSame ? null : status;

    if (existingAttendance) {
      if (nextStatus === null) {
        deleteAcademicEntity("attendance", existingAttendance.id);
      } else {
        updateAcademicEntity("attendance", existingAttendance.id, {
          status: nextStatus,
        });
      }
    } else if (nextStatus !== null) {
      addAcademicEntity("attendance", {
        subjectId,
        semesterId: activeAcademic.activeSemesterId,
        date: targetDate,
        status: nextStatus,
      });
    }

    // Automatically create or update class log for target date
    const existingLogs = state.academic?.classLogs || [];
    const todayLogForSubject = existingLogs.find(
      (log) => log.subjectId === subjectId && log.date === targetDate,
    );
    const attendanceStatus =
      nextStatus === "present"
        ? "attended"
        : nextStatus === "absent"
          ? "absent"
          : "pending";

    if (todayLogForSubject) {
      updateAcademicEntity("classLogs", todayLogForSubject.id, {
        attendanceStatus,
      });
    } else if (nextStatus !== null) {
      const subjectLogs = existingLogs.filter((l) => l.subjectId === subjectId);
      const lessonNumber = subjectLogs.length + 1;
      const targetSubject = activeAcademic.subjects.find((s) => s.id === subjectId);
      const subjectName = targetSubject?.name || "Disciplina";

      addAcademicEntity("classLogs", {
        subjectId,
        semesterId: activeAcademic.activeSemesterId,
        lessonNumber,
        title: `Aula ${lessonNumber} - ${subjectName}`,
        date: targetDate,
        status: "completed",
        attendanceStatus,
        contentSummary: "",
        topics: [],
        homework: "",
      });
    }
  };

  const handleMarkPresenceAndOpenNote = (subject) => {
    if (!subject) return;

    registerTodayAttendance(subject.id, "present");

    const dateFormatted = new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date());

    const noteTitle = `Anotações de ${subject.name} - ${dateFormatted}`;
    const newNoteId = `note-${Date.now()}`;

    addNote({
      id: newNoteId,
      title: noteTitle,
      content: `# ${noteTitle}\n**Disciplina:** ${subject.name}\n**Data:** ${dateLabel}\n**Presença:** Registrada ✓\n\n## Conteúdo da Aula\n\n- `,
      academicSubjectId: subject.id,
      updatedAt: Date.now(),
      createdAt: Date.now(),
    });

    setActiveNote(newNoteId);
    setActiveAcademicSubject(subject.id);
    onNavigate?.(SCREEN_IDS.NOTE_EDITOR);
  };

  const handleCreateSubjectNote = (subject) => {
    const targetSubject = subject || classesToday[0]?.subject || activeAcademic.subjects[0];
    if (!targetSubject) {
      onNavigate?.(SCREEN_IDS.NOTE_EDITOR);
      return;
    }

    const dateFormatted = new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date());

    const noteTitle = `Anotações de ${targetSubject.name} - ${dateFormatted}`;
    const newNoteId = `note-${Date.now()}`;

    addNote({
      id: newNoteId,
      title: noteTitle,
      content: `# ${noteTitle}\n**Disciplina:** ${targetSubject.name}\n**Data:** ${dateLabel}\n\n## Conteúdo da Aula\n\n- `,
      academicSubjectId: targetSubject.id,
      updatedAt: Date.now(),
      createdAt: Date.now(),
    });

    setActiveNote(newNoteId);
    setActiveAcademicSubject(targetSubject.id);
    onNavigate?.(SCREEN_IDS.NOTE_EDITOR);
  };

  const handleOpenNoteModal = (subjectId = "") => {
    setInitialNoteSubjectId(
      subjectId ||
        classesToday[0]?.subject.id ||
        activeAcademic.subjects[0]?.id ||
        "",
    );
    setShowCreateNoteModal(true);
  };

  const handleSaveClassNote = (noteData) => {
    const existingLogs = state.academic?.classLogs || [];
    const todayLogForSubject = existingLogs.find(
      (log) => log.subjectId === noteData.subjectId && log.date === noteData.date,
    );

    if (todayLogForSubject) {
      updateAcademicEntity("classLogs", todayLogForSubject.id, {
        title: noteData.title,
        attendanceStatus:
          noteData.attendanceStatus !== "none"
            ? noteData.attendanceStatus
            : "attended",
        contentSummary: noteData.contentSummary,
        topics: noteData.topics,
        homework: noteData.homework,
      });
    } else {
      const lessonNumber =
        existingLogs.filter((l) => l.subjectId === noteData.subjectId).length + 1;

      addAcademicEntity("classLogs", {
        subjectId: noteData.subjectId,
        semesterId: activeAcademic.activeSemesterId,
        lessonNumber,
        title: noteData.title,
        date: noteData.date,
        status: "completed",
        attendanceStatus:
          noteData.attendanceStatus !== "none"
            ? noteData.attendanceStatus
            : "attended",
        contentSummary: noteData.contentSummary,
        topics: noteData.topics,
        homework: noteData.homework,
      });
    }

    if (noteData.attendanceStatus && noteData.attendanceStatus !== "none") {
      const existingAtt = (activeAcademic.attendance || []).find(
        (entry) => entry.subjectId === noteData.subjectId && entry.date === noteData.date,
      );
      if (existingAtt) {
        updateAcademicEntity("attendance", existingAtt.id, { status: noteData.attendanceStatus });
      } else {
        addAcademicEntity("attendance", {
          subjectId: noteData.subjectId,
          semesterId: activeAcademic.activeSemesterId,
          date: noteData.date,
          status: noteData.attendanceStatus,
        });
      }
    }
  };

  const openRecommendation = (recommendation, startFocus = false) => {
    if (recommendation.kind === "review" && recommendation.sourceId) {
      setActiveDeck(recommendation.sourceId);
      onNavigate?.(SCREEN_IDS.FLASHCARDS);
      return;
    }
    if (
      (recommendation.kind === "task" || recommendation.kind === "project") &&
      recommendation.sourceId
    ) {

      if (recommendation.kind === "task") {
        setActiveTask(recommendation.sourceId);
        onNavigate?.(SCREEN_IDS.TASK_DETAILS);
      } else {
        onNavigate?.(SCREEN_IDS.TASKS);
      }
      return;
    }
    if (recommendation.subjectId) {
      setActiveAcademicSubject(recommendation.subjectId);
      onNavigate?.(SCREEN_IDS.ACADEMIC_SUBJECT);
    }
  };

  return (
    <main className="flex-1 overflow-y-auto bg-[color:var(--background)] px-6 py-8 md:px-10">
      <div className="mx-auto max-w-6xl space-y-7">
        <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[.18em] text-[color:var(--primary)]">
              Hoje · {dateLabel}
            </p>
            <h1 className="mt-2 text-3xl font-black text-[color:var(--on-surface)]">
              Seu próximo passo de estudo
            </h1>
            <p className="mt-2 text-sm text-[color:var(--on-surface-variant)]">
              Tudo o que merece atenção agora, em um só lugar.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleCreateSubjectNote()}
              className="rounded-xl bg-[color:var(--primary)] px-4 py-3 text-sm font-black text-white neo-raised flex items-center gap-2 shadow-md hover:opacity-90 transition-all"
            >
              <Icon name="edit_note" className="text-lg" />
              Nota da Aula
            </button>
            <button
              type="button"
              onClick={() => onNavigate?.(SCREEN_IDS.NOTE_EDITOR)}
              className="rounded-xl px-4 py-3 text-sm font-black text-[color:var(--primary)] neo-raised"
            >
              <Icon name="add" /> Nota rápida
            </button>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          <button
            type="button"
            onClick={() => {
              if (nextClass?.subjectId)
                setActiveAcademicSubject(nextClass.subjectId);
              onNavigate?.(
                nextClass?.subjectId
                  ? SCREEN_IDS.ACADEMIC_SUBJECT
                  : SCREEN_IDS.ACADEMIC,
              );
            }}
            className="group flex items-center gap-4 rounded-[24px] p-5 text-left neo-raised transition-transform hover:-translate-y-0.5"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[color:var(--primary)]/10 text-[color:var(--primary)]">
              <Icon name="school" className="text-[24px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-black uppercase tracking-[.15em] text-[color:var(--primary)]">
                Próxima aula
              </span>
              <span className="mt-1 block truncate text-base font-black">
                {nextClass?.subjectName || "Nenhuma aula próxima"}
              </span>
              <span className="mt-1 block text-xs text-[color:var(--on-surface-variant)]">
                {nextClass
                  ? `${nextClass.date}${nextClass.startTime ? ` · ${nextClass.startTime}` : ""}`
                  : "Confira sua grade de horários"}
              </span>
            </span>
            <Icon
              name="arrow_forward"
              className="text-[color:var(--primary)] transition-transform group-hover:translate-x-1"
            />
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.(SCREEN_IDS.TASKS)}
            className="group flex items-center gap-4 rounded-[24px] p-5 text-left neo-raised transition-transform hover:-translate-y-0.5"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[color:var(--error)]/10 text-[color:var(--error)]">
              <Icon
                name={nextDeadline?.type === "exam" ? "quiz" : "task_alt"}
                className="text-[24px]"
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-black uppercase tracking-[.15em] text-[color:var(--error)]">
                Próximo prazo
              </span>
              <span className="mt-1 block truncate text-base font-black">
                {nextDeadline?.title || "Nenhum prazo próximo"}
              </span>
              <span className="mt-1 block text-xs text-[color:var(--on-surface-variant)]">
                {nextDeadline
                  ? `${nextDeadline.subjectName || "Sem disciplina"} · ${nextDeadline.date}`
                  : "Você está em dia"}
              </span>
            </span>
            <Icon
              name="arrow_forward"
              className="text-[color:var(--error)] transition-transform group-hover:translate-x-1"
            />
          </button>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.4fr_.8fr]">
          <article className="rounded-[2rem] bg-[color:var(--primary)] p-7 text-white shadow-xl shadow-violet-500/20">
            <p className="text-xs font-black uppercase tracking-[.18em] text-white/70">
              Continuar de onde parou
            </p>
            {data.activeLesson ? (
              <button
                type="button"
                onClick={() => onNavigate?.(SCREEN_IDS.LESSON)}
                className="mt-5 block text-left"
              >
                <h2 className="text-2xl font-black">
                  {data.activeLesson.title}
                </h2>
                <p className="mt-2 text-sm text-white/80">
                  {data.activeLesson.courseTitle} ·{" "}
                  {data.activeLesson.moduleTitle}
                </p>
                <span className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-black text-[color:var(--primary)]">
                  Abrir aula <Icon name="arrow_forward" />
                </span>
              </button>
            ) : (
              <div className="mt-5">
                <h2 className="text-2xl font-black">
                  {data.hasContent
                    ? "Escolha uma aula para começar"
                    : "Crie seu primeiro curso"}
                </h2>
                <p className="mt-2 max-w-xl text-sm text-white/80">
                  {data.hasContent
                    ? "A próxima aula fica disponível aqui depois que você abrir um conteúdo."
                    : "Organize seus materiais e transforme-os em uma trilha de estudo."}
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate?.(SCREEN_IDS.DASHBOARD)}
                  className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-black text-[color:var(--primary)]"
                >
                  {data.hasContent ? "Ver cursos" : "Criar curso"}{" "}
                  <Icon name="arrow_forward" />
                </button>
              </div>
            )}
          </article>
          <article className="rounded-[2rem] p-7 neo-raised">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[.18em] text-[color:var(--primary)]">
                  Meta de foco
                </p>
                <h2 className="mt-2 text-3xl font-black">{progress}%</h2>
              </div>
              <Icon
                name="local_fire_department"
                className="text-4xl text-[color:var(--primary)]"
              />
            </div>
            <div className="mt-6 h-3 overflow-hidden rounded-full bg-[color:var(--background)]">
              <div
                className="h-full rounded-full bg-[color:var(--primary)] transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-3 text-sm text-[color:var(--on-surface-variant)]">
              {formatFocus(data.focusSeconds)} de {goalMinutes} min concluídos
              hoje.
            </p>
            <button
              type="button"
              onClick={() =>
                replaceStudyPlans(
                  scheduleTaskSessions(state.tasks?.list || [], {
                    dailySessions: Math.max(1, Math.round(goalMinutes / 25)),
                  }),
                )
              }
              className="mt-4 text-xs font-black text-[color:var(--primary)]"
            >
              Gerar plano a partir dos prazos
            </button>
          </article>
        </section>

        <section className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
          <article className="rounded-[2rem] p-6 neo-raised">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <p className="text-xs font-black uppercase tracking-[.16em] text-[color:var(--primary)]">
                  Faculdade · {activeAcademic.semester.name}
                </p>
                <h2 className="mt-1 text-xl font-black">O que estudar agora</h2>
                <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">
                  Prioridades explicadas a partir dos seus prazos e desempenho.
                </p>
              </div>
              <div className="flex rounded-xl p-1 neo-inset">
                {[25, 50, 90].map((minutes) => (
                  <button
                    key={minutes}
                    className={`rounded-lg px-2.5 py-2 text-[10px] font-black ${studyMinutes === minutes ? "bg-[color:var(--primary)] text-white" : "text-[color:var(--on-surface-variant)]"}`}
                    type="button"
                    onClick={() => setStudyMinutes(minutes)}
                  >
                    {minutes} min
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-5 space-y-2">
              {recommendations.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-2xl p-3 neo-inset"
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.rank <= 1 ? "bg-[color:var(--error)]/10 text-[color:var(--error)]" : item.rank === 2 ? "bg-amber-500/15 text-amber-600" : "bg-[color:var(--primary)]/10 text-[color:var(--primary)]"}`}
                  >
                    <Icon
                      name={
                        item.kind === "exam"
                          ? "quiz"
                          : item.kind === "review"
                            ? "style"
                            : item.kind === "academic-risk"
                              ? "warning"
                              : "task_alt"
                      }
                    />
                  </span>
                  <button
                    className="min-w-0 flex-1 text-left"
                    type="button"
                    onClick={() => openRecommendation(item)}
                  >
                    <span className="block truncate text-sm font-black">
                      {item.title}
                    </span>
                    <span className="block truncate text-[11px] text-[color:var(--on-surface-variant)]">
                      {item.reason}
                    </span>
                  </button>
                  <button
                    className="rounded-xl p-2 text-[color:var(--primary)] neo-raised"
                    type="button"
                    title={`Estudar por ${studyMinutes} minutos`}
                    onClick={() => openRecommendation(item, true)}
                  >
                    <Icon className="text-[17px]" name="arrow_forward" />
                  </button>
                </div>
              ))}
              {!recommendations.length ? (
                <button
                  type="button"
                  onClick={() => onNavigate?.(SCREEN_IDS.ACADEMIC)}
                  className="w-full rounded-xl p-5 text-center text-sm text-[color:var(--on-surface-variant)] neo-inset"
                >
                  Cadastre matérias, provas e trabalhos para receber
                  recomendações.
                </button>
              ) : null}
            </div>
          </article>
          <AcademicCalendar
            compact
            semesterId={activeAcademic.activeSemesterId}
          />
        </section>

        {activeAcademic.subjects.length > 0 && (
          <section className="rounded-[2rem] p-6 neo-raised">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[.16em] text-[color:var(--primary)]">
                  Frequência & Anotações
                </p>
                <h2 className="mt-1 text-xl font-black text-[color:var(--on-surface)] flex items-center gap-2">
                  <span>
                    {isTodayActive ? "Aulas de Hoje" : isYesterdayActive ? "Aulas de Ontem" : `Aulas de ${activeScheduleDateKey.split("-").reverse().join("/")}`}
                  </span>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[color:var(--primary)]/10 text-[color:var(--primary)] border border-[color:var(--primary)]/20">
                    {classesToday.length} aula(s)
                  </span>
                </h2>
                <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">
                  Selecione o dia e marque presença ou falta com feedback visual imediato.
                </p>
              </div>

              {/* Seletor de Dias (Hoje, Ontem, Dias Anteriores e Calendário) */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap items-center bg-[color:var(--surface-container-high)] p-1 rounded-2xl border border-[color:var(--outline-variant)]/20 gap-1">
                  {recentDaysList.slice(0, 4).map((dayItem) => {
                    const isSelected = activeScheduleDateKey === dayItem.key;
                    return (
                      <button
                        key={dayItem.key}
                        type="button"
                        onClick={() => setSelectedScheduleDateKey(dayItem.key)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                          isSelected
                            ? "bg-[color:var(--primary)] text-white shadow-sm scale-105"
                            : "text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)] hover:bg-[color:var(--surface)]"
                        }`}
                      >
                        {dayItem.label}
                      </button>
                    );
                  })}

                  {/* Input de Data Personalizada */}
                  <div className="flex items-center gap-1 pl-1 border-l border-[color:var(--outline-variant)]/20">
                    <input
                      type="date"
                      value={activeScheduleDateKey}
                      onChange={(e) => {
                        if (e.target.value) {
                          setSelectedScheduleDateKey(e.target.value);
                        }
                      }}
                      className="bg-transparent text-xs font-bold text-[color:var(--on-surface)] px-2 py-1 rounded-lg border border-[color:var(--outline-variant)]/30 focus:outline-none focus:border-[color:var(--primary)] cursor-pointer"
                      title="Escolher outra data"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenNoteModal(classesToday[0]?.subject?.id || activeAcademic.subjects[0]?.id)}
                  className="rounded-xl bg-[color:var(--primary)] px-3.5 py-2 text-xs font-black text-white flex items-center gap-1.5 shadow-sm hover:opacity-90 transition-all"
                >
                  <Icon name="edit_note" className="text-base" />
                  + Criar Nota de Aula
                </button>
              </div>
            </div>

            {classesToday.length > 0 ? (
              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                {classesToday.map(
                  ({
                    subject,
                    existing,
                    attendance,
                    remainingClasses,
                    remainingAbsences,
                  }) => {
                    const classNotesToday = (state.academic?.classLogs || []).filter(
                      (log) => log.subjectId === subject.id && log.date === activeScheduleDateKey,
                    );
                    const isAbsent = existing?.status === "absent";
                    const isPresent = existing?.status === "present" || existing?.status === "attended";

                    return (
                      <article
                        key={subject.id}
                        className={`rounded-2xl p-4 flex flex-col justify-between transition-all duration-300 ${
                          isAbsent
                            ? "bg-rose-500/10 border-2 border-rose-500/50 shadow-lg shadow-rose-500/10"
                            : isPresent
                              ? "bg-emerald-500/10 border-2 border-emerald-500/50 shadow-lg shadow-emerald-500/10"
                              : "neo-inset border border-transparent"
                        }`}
                      >
                        <div>
                          {isAbsent ? (
                            <div className="mb-3 p-2.5 rounded-xl bg-rose-600 text-white flex items-center justify-between font-black text-xs shadow-md animate-fadeIn">
                              <span className="flex items-center gap-1.5">
                                <Icon name="cancel" className="text-base text-white" />
                                Falta registrada {isTodayActive ? "hoje" : isYesterdayActive ? "ontem" : `em ${activeScheduleDateKey.split("-").reverse().join("/")}`} nesta aula
                              </span>
                              <span className="text-[10px] bg-white text-rose-700 px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider">
                                FALTOU ✗
                              </span>
                            </div>
                          ) : isPresent ? (
                            <div className="mb-3 p-2.5 rounded-xl bg-emerald-600 text-white flex items-center justify-between font-black text-xs shadow-md animate-fadeIn">
                              <span className="flex items-center gap-1.5">
                                <Icon name="check_circle" className="text-base text-white" />
                                Presença confirmada {isTodayActive ? "hoje" : isYesterdayActive ? "ontem" : `em ${activeScheduleDateKey.split("-").reverse().join("/")}`} nesta aula
                              </span>
                              <span className="text-[10px] bg-white text-emerald-700 px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider">
                                PRESENTE ✓
                              </span>
                            </div>
                          ) : null}

                          <div className="flex items-start gap-3">
                            <span
                              className="mt-1 h-3 w-3 shrink-0 rounded-full"
                              style={{ backgroundColor: subject.color }}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-black text-[color:var(--on-surface)]">{subject.name}</p>
                              <p className="text-xs text-[color:var(--on-surface-variant)]">
                                {subject.schedule?.startTime ||
                                  "Horário não informado"}
                                {subject.room ? ` · ${subject.room}` : ""}
                              </p>
                            </div>
                            <span className="text-right text-[10px] font-bold text-[color:var(--on-surface-variant)]">
                              {remainingClasses} aulas
                              <br />
                              {remainingAbsences} faltas restantes
                            </span>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[color:var(--outline-variant)]/10">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-xs font-black ${
                                isAbsent
                                  ? "text-rose-600 dark:text-rose-400"
                                  : isPresent
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-[color:var(--on-surface-variant)]"
                              }`}
                            >
                              {isAbsent
                                ? "Falta registrada"
                                : isPresent
                                  ? "Presença confirmada"
                                  : existing?.status === "late"
                                    ? "Atraso registrado"
                                    : `${attendance.absences} faltas no semestre`}
                            </span>
                            {classNotesToday.length > 0 && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[color:var(--primary)]/10 text-[color:var(--primary)] text-[11px] font-bold">
                                <Icon name="description" className="text-xs" />
                                {classNotesToday.length} nota(s)
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => registerTodayAttendance(subject.id, "present", activeScheduleDateKey)}
                              className={`rounded-xl px-3 py-1.5 text-xs font-black transition-all flex items-center gap-1 ${
                                isPresent
                                  ? "bg-emerald-600 text-white shadow-md"
                                  : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25"
                              }`}
                            >
                              <Icon name={isPresent ? "check_circle" : "how_to_reg"} className="text-sm" />
                              {isPresent ? "Presença ✓" : "Presença"}
                            </button>

                            <button
                              type="button"
                              onClick={() => registerTodayAttendance(subject.id, "absent", activeScheduleDateKey)}
                              className={`rounded-xl px-3 py-1.5 text-xs font-black transition-all flex items-center gap-1 ${
                                isAbsent
                                  ? "bg-rose-600 text-white shadow-md"
                                  : "bg-rose-500/15 text-rose-600 dark:text-rose-400 hover:bg-rose-500/25"
                              }`}
                            >
                              <Icon name={isAbsent ? "cancel" : "block"} className="text-sm" />
                              {isAbsent ? "Falta ✗" : "Falta"}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleCreateSubjectNote(subject)}
                              className="rounded-xl bg-[color:var(--primary)]/15 hover:bg-[color:var(--primary)]/25 px-3 py-1.5 text-xs font-black text-[color:var(--primary)] transition-all flex items-center gap-1"
                            >
                              <Icon name="edit_note" className="text-sm" />
                              Nota da Aula
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  },
                )}
              </div>
            ) : (
              <div className="mt-5 p-6 rounded-2xl neo-inset text-center flex flex-col items-center justify-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[color:var(--surface-container-high)] flex items-center justify-center text-[color:var(--on-surface-variant)]">
                  <Icon name="event_busy" className="text-2xl" />
                </div>
                <div>
                  <p className="font-black text-sm text-[color:var(--on-surface)]">
                    Nenhuma aula regular agendada no horário fixo para {isTodayActive ? "hoje" : isYesterdayActive ? "ontem" : activeScheduleDateKey.split("-").reverse().join("/")}
                  </p>
                  <p className="text-xs text-[color:var(--on-surface-variant)] mt-1">
                    Deseja registrar presença ou falta avulsa para alguma matéria nesta data?
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap justify-center gap-2 max-w-2xl">
                  {activeAcademic.subjects.map((sub) => {
                    const existingAttendance = (activeAcademic.attendance || []).find(
                      (a) => a.subjectId === sub.id && a.date === activeScheduleDateKey
                    );
                    const existingLog = (state.academic?.classLogs || []).find(
                      (l) => l.subjectId === sub.id && l.date === activeScheduleDateKey
                    );
                    const isPres = existingAttendance?.status === "present" || existingAttendance?.status === "attended" || existingLog?.attendanceStatus === "attended" || existingLog?.attendanceStatus === "present";
                    const isAbs = existingAttendance?.status === "absent" || existingLog?.attendanceStatus === "absent";
                    return (
                      <div key={sub.id} className="flex items-center gap-2 p-2 px-3 rounded-xl bg-[color:var(--surface)] border border-[color:var(--outline-variant)]/20 shadow-sm">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: sub.color }} />
                        <span className="text-xs font-bold text-[color:var(--on-surface)] max-w-[120px] truncate">{sub.name}</span>
                        <div className="flex items-center gap-1 ml-1">
                          <button
                            type="button"
                            onClick={() => registerTodayAttendance(sub.id, "present", activeScheduleDateKey)}
                            className={`px-2 py-1 rounded-lg text-[11px] font-black transition-all ${
                              isPres ? "bg-emerald-600 text-white shadow-sm" : "bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25"
                            }`}
                          >
                            {isPres ? "Presente ✓" : "Presença"}
                          </button>
                          <button
                            type="button"
                            onClick={() => registerTodayAttendance(sub.id, "absent", activeScheduleDateKey)}
                            className={`px-2 py-1 rounded-lg text-[11px] font-black transition-all ${
                              isAbs ? "bg-rose-600 text-white shadow-sm" : "bg-rose-500/15 text-rose-600 hover:bg-rose-500/25"
                            }`}
                          >
                            {isAbs ? "Falta ✗" : "Falta"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Widget de Frequência das Matérias */}
        {activeAcademic.subjects.length > 0 && (
          <section className="rounded-[2rem] p-6 neo-raised">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[.16em] text-[color:var(--primary)]">
                  Frequência Geral das Disciplinas
                </p>
                <h2 className="mt-1 text-xl font-black text-[color:var(--on-surface)] flex items-center gap-2">
                  <span>Monitor de Presenças</span>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[color:var(--primary)]/10 text-[color:var(--primary)] border border-[color:var(--primary)]/20">
                    {activeAcademic.subjects.length} matéria(s)
                  </span>
                </h2>
                <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">
                  Acompanhe sua porcentagem de frequência e controle a margem de faltas por disciplina.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate?.(SCREEN_IDS.ACADEMIC)}
                className="rounded-xl px-4 py-2 text-xs font-bold text-[color:var(--primary)] neo-inset hover:bg-[color:var(--primary)]/10 transition-all flex items-center gap-1.5 self-start sm:self-auto"
              >
                <span>Ver Grade Acadêmica</span>
                <Icon name="arrow_forward" className="text-sm" />
              </button>
            </div>

            {/* Banner de Risco de Frequência */}
            {allSubjectsAttendance.some((item) => item.isAtRisk) && (
              <div className="mt-4 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-3 text-amber-700 dark:text-amber-300">
                <Icon name="warning" className="text-xl text-amber-500 shrink-0" />
                <div className="text-xs font-bold">
                  <span>Atenção: </span>
                  <span className="font-medium">
                    Você possui disciplina(s) próximas ou abaixo do limite mínimo de 75% de frequência. Fique atento para não reprovar por falta!
                  </span>
                </div>
              </div>
            )}

            {/* Grid de Matérias */}
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {allSubjectsAttendance.map(
                ({
                  subject,
                  attendance,
                  existingToday,
                  maxAbsencesAllowed,
                  remainingAbsences,
                  isCritical,
                  isAtRisk,
                }) => {
                  const rate = Math.round(attendance.attendanceRate);
                  const statusColor = isCritical
                    ? "bg-[color:var(--error)] text-white"
                    : isAtRisk
                      ? "bg-amber-500 text-white"
                      : "bg-emerald-500 text-white";

                  return (
                    <article
                      key={subject.id}
                      className="rounded-2xl p-4 neo-inset flex flex-col justify-between hover:border-[color:var(--primary)]/30 transition-all group"
                    >
                      <div>
                        {/* Header da Matéria */}
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveAcademicSubject(subject.id);
                              onNavigate?.(SCREEN_IDS.ACADEMIC_SUBJECT);
                            }}
                            className="flex items-center gap-2 min-w-0 text-left hover:opacity-80 transition-opacity"
                          >
                            <span
                              className="w-3 h-3 rounded-full shrink-0"
                              style={{ backgroundColor: subject.color || "#8b5cf6" }}
                            />
                            <span className="font-black text-sm text-[color:var(--on-surface)] truncate group-hover:text-[color:var(--primary)]">
                              {subject.name}
                            </span>
                          </button>

                          <span
                            className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ${statusColor}`}
                          >
                            {rate}%
                          </span>
                        </div>

                        {/* Barra de Progresso de Frequência */}
                        <div className="space-y-1 mb-3">
                          <div className="relative h-2.5 w-full bg-[color:var(--surface-container-highest)] rounded-full overflow-hidden">
                            {/* Marcador dos 75% limite mínimo */}
                            <div
                              className="absolute top-0 bottom-0 w-0.5 bg-amber-500/80 z-10"
                              style={{ left: "75%" }}
                              title="Limite mínimo (75%)"
                            />
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                isCritical
                                  ? "bg-[color:var(--error)]"
                                  : isAtRisk
                                    ? "bg-amber-500"
                                    : "bg-emerald-500"
                              }`}
                              style={{ width: `${rate}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-[10px] text-[color:var(--on-surface-variant)] font-bold">
                            <span>0%</span>
                            <span className="text-amber-600 dark:text-amber-400">Min: 75%</span>
                            <span>100%</span>
                          </div>
                        </div>

                        {/* Estatísticas resumidas */}
                        <div className="grid grid-cols-2 gap-2 text-[11px] mb-3 bg-[color:var(--surface)]/40 p-2.5 rounded-xl border border-[color:var(--outline-variant)]/10">
                          <div>
                            <span className="block text-[10px] font-bold text-[color:var(--on-surface-variant)] uppercase">
                              Presenças
                            </span>
                            <span className="font-extrabold text-[color:var(--on-surface)]">
                              {attendance.attended} aulas
                            </span>
                          </div>
                          <div>
                            <span className="block text-[10px] font-bold text-[color:var(--on-surface-variant)] uppercase">
                              Faltas
                            </span>
                            <span
                              className={`font-extrabold ${
                                attendance.absences > 0
                                  ? isCritical
                                    ? "text-[color:var(--error)]"
                                    : "text-amber-600 dark:text-amber-400"
                                  : "text-[color:var(--on-surface)]"
                              }`}
                            >
                              {attendance.absences} (máx: {maxAbsencesAllowed})
                            </span>
                          </div>
                        </div>

                        {/* Status de Margem de Faltas */}
                        <div className="text-[11px] font-bold text-center mb-3">
                          {remainingAbsences > 0 ? (
                            <span className="text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg inline-block w-full">
                              Pode faltar +{remainingAbsences} aula(s)
                            </span>
                          ) : (
                            <span className="text-[color:var(--error)] bg-[color:var(--error)]/10 px-2.5 py-1 rounded-lg inline-block w-full">
                              ⚠️ Limite de faltas esgotado!
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Ações Rápidas do Dia */}
                      <div className="pt-2 border-t border-[color:var(--outline-variant)]/10 flex items-center justify-between gap-1.5">
                        <span className="text-[10px] font-bold text-[color:var(--on-surface-variant)] truncate">
                          {existingToday
                            ? existingToday.status === "absent"
                              ? isYesterdayActive ? "Falta ontem ✗" : isTodayActive ? "Falta hoje ✗" : "Falta ✗"
                              : isYesterdayActive ? "Presença ontem ✓" : isTodayActive ? "Presença hoje ✓" : "Presença ✓"
                            : isYesterdayActive ? "Ontem:" : isTodayActive ? "Hoje:" : `${activeScheduleDateKey.split("-").reverse().slice(0, 2).join("/")}:`}
                        </span>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => registerTodayAttendance(subject.id, "present", activeScheduleDateKey)}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all flex items-center gap-1 ${
                              existingToday?.status === "present" || existingToday?.status === "attended"
                                ? "bg-emerald-600 text-white shadow-md"
                                : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25"
                            }`}
                            title="Marcar presença"
                          >
                            <Icon name="check" className="text-xs" />
                            Presença
                          </button>

                          <button
                            type="button"
                            onClick={() => registerTodayAttendance(subject.id, "absent", activeScheduleDateKey)}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all flex items-center gap-1 ${
                              existingToday?.status === "absent"
                                ? "bg-rose-600 text-white shadow-md"
                                : "bg-rose-500/15 text-rose-600 dark:text-rose-400 hover:bg-rose-500/25"
                            }`}
                            title="Marcar falta"
                          >
                            <Icon name="close" className="text-xs" />
                            Falta
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                },
              )}
            </div>
          </section>
        )}

        <section className="grid gap-5 lg:grid-cols-2">
          <article className="rounded-[2rem] p-6 neo-raised">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[.16em] text-[color:var(--error)]">
                  Prioridades
                </p>
                <h2 className="mt-1 text-xl font-black">Tarefas urgentes</h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate?.(SCREEN_IDS.TASKS)}
                className="text-xs font-black text-[color:var(--primary)]"
              >
                Ver todas
              </button>
            </div>
            <div className="mt-5 space-y-2">
              {data.urgentTasks.slice(0, 4).map((task) => (
                <button
                  type="button"
                  key={task.id}
                  onClick={() => {
                    setActiveTask(task.id);
                    onNavigate?.(SCREEN_IDS.TASK_DETAILS);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl p-3 text-left neo-inset"
                >
                  <Icon
                    name={
                      task.priority === "high" ? "priority_high" : "task_alt"
                    }
                    className="text-[color:var(--error)]"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">
                    {task.title}
                  </span>
                  <span className="text-xs text-[color:var(--on-surface-variant)]">
                    {task.dueDate || "Sem prazo"}
                  </span>
                </button>
              ))}
              {!data.urgentTasks.length ? (
                <p className="rounded-xl p-5 text-center text-sm text-[color:var(--on-surface-variant)] neo-inset">
                  Nenhum prazo urgente. Use este espaço para avançar no
                  conteúdo.
                </p>
              ) : null}
            </div>
          </article>
          <article className="rounded-[2rem] p-6 neo-raised">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[.16em] text-[color:var(--tertiary)]">
                  Memória
                </p>
                <h2 className="mt-1 text-xl font-black">Revisões de hoje</h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate?.(SCREEN_IDS.FLASHCARDS)}
                className="text-xs font-black text-[color:var(--primary)]"
              >
                Revisar
              </button>
            </div>
            <div className="mt-5 rounded-2xl p-5 neo-inset">
              <p className="text-4xl font-black text-[color:var(--primary)]">
                {data.dueCards.length}
              </p>
              <p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">
                cartões aguardando revisão
              </p>
              <button
                type="button"
                onClick={() => onNavigate?.(SCREEN_IDS.FLASHCARDS)}
                className="mt-4 rounded-xl bg-[color:var(--primary)] px-4 py-2 text-sm font-black text-white"
              >
                Abrir fila
              </button>
            </div>
          </article>
        </section>
      </div>

      {/* Class Note Modal */}
      {showCreateNoteModal && (
        <CreateClassNoteModal
          subjects={activeAcademic.subjects}
          initialSubjectId={initialNoteSubjectId}
          todayKey={todayKey}
          dateLabel={dateLabel}
          onClose={() => setShowCreateNoteModal(false)}
          onSave={handleSaveClassNote}
          onNavigateToSubject={(subjectId) => {
            setActiveAcademicSubject(subjectId);
            onNavigate?.(SCREEN_IDS.ACADEMIC_SUBJECT);
          }}
        />
      )}
    </main>
  );
}

function CreateClassNoteModal({
  subjects,
  initialSubjectId,
  todayKey,
  dateLabel,
  onClose,
  onSave,
  onNavigateToSubject,
}) {
  const [subjectId, setSubjectId] = useState(
    initialSubjectId || subjects[0]?.id || "",
  );
  const selectedSubject =
    subjects.find((s) => s.id === subjectId) || subjects[0];

  const [date, setDate] = useState(todayKey);
  const [title, setTitle] = useState(
    selectedSubject
      ? `Anotações de ${selectedSubject.name}`
      : `Anotações da Aula`,
  );
  const [contentSummary, setContentSummary] = useState("");
  const [topics, setTopics] = useState("");
  const [homework, setHomework] = useState("");
  const [attendanceStatus, setAttendanceStatus] = useState("attended");
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSubjectChange = (newSubjectId) => {
    setSubjectId(newSubjectId);
    const sub = subjects.find((s) => s.id === newSubjectId);
    if (sub && (!title || title.startsWith("Anotações de"))) {
      setTitle(`Anotações de ${sub.name}`);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!subjectId) return;

    onSave({
      subjectId,
      date,
      title: title.trim() || `Aula de ${selectedSubject?.name || "Disciplina"}`,
      contentSummary: contentSummary.trim(),
      topics: topics.trim()
        ? topics.split(",").map((t) => t.trim()).filter(Boolean)
        : [],
      homework: homework.trim(),
      attendanceStatus,
    });

    setSavedSuccess(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-xl rounded-3xl bg-[color:var(--surface)] p-6 shadow-2xl border border-[color:var(--outline-variant)]/20 relative overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[color:var(--outline-variant)]/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[color:var(--primary)]/10 text-[color:var(--primary)] flex items-center justify-center">
              <Icon name="edit_note" className="text-2xl" />
            </div>
            <div>
              <h3 className="text-lg font-black text-[color:var(--on-surface)]">
                Criar Nota da Aula
              </h3>
              <p className="text-xs text-[color:var(--on-surface-variant)]">
                Registre o conteúdo visto na aula diretamente na disciplina
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-container-high)]"
          >
            <Icon name="close" />
          </button>
        </div>

        {savedSuccess ? (
          <div className="py-8 flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-[color:var(--tertiary)]/20 text-[color:var(--tertiary)] flex items-center justify-center">
              <Icon name="check_circle" className="text-4xl" />
            </div>
            <h4 className="text-xl font-black text-[color:var(--on-surface)]">
              Nota criada com sucesso!
            </h4>
            <p className="text-sm text-[color:var(--on-surface-variant)] max-w-md">
              A nota da aula de{" "}
              <strong className="text-[color:var(--on-surface)]">
                {selectedSubject?.name}
              </strong>{" "}
              foi salva na data{" "}
              <strong className="text-[color:var(--on-surface)]">
                {date}
              </strong>
              .
            </p>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl bg-[color:var(--surface-container-high)] text-[color:var(--on-surface)] text-sm font-bold hover:bg-[color:var(--surface-container-highest)]"
              >
                Concluir
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNavigateToSubject(subjectId);
                }}
                className="px-5 py-2.5 rounded-xl bg-[color:var(--primary)] text-white text-sm font-bold shadow-md hover:opacity-90 flex items-center gap-2"
              >
                <Icon name="open_in_new" className="text-sm" />
                Ver na Disciplina
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="flex-1 overflow-y-auto pt-4 space-y-4 pr-1"
          >
            {/* Subject selector */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[color:var(--on-surface-variant)] mb-1.5">
                Matéria / Disciplina *
              </label>
              <select
                value={subjectId}
                onChange={(e) => handleSubjectChange(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 text-sm font-bold text-[color:var(--on-surface)] outline-none focus:border-[color:var(--primary)]"
              >
                {subjects.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name} {sub.code ? `(${sub.code})` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Date and Attendance in 2 cols */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[color:var(--on-surface-variant)] mb-1.5">
                  Data da Aula *
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 rounded-xl bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 text-sm font-bold text-[color:var(--on-surface)] outline-none focus:border-[color:var(--primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[color:var(--on-surface-variant)] mb-1.5">
                  Presença na Aula
                </label>
                <select
                  value={attendanceStatus}
                  onChange={(e) => setAttendanceStatus(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 text-sm font-bold text-[color:var(--on-surface)] outline-none focus:border-[color:var(--primary)]"
                >
                  <option value="attended">Presença Registrada</option>
                  <option value="late">Atraso</option>
                  <option value="absent">Falta</option>
                  <option value="none">Não registrar frequência</option>
                </select>
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[color:var(--on-surface-variant)] mb-1.5">
                Título da Anotação / Aula
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Introdução ao Capítulo 3..."
                className="w-full px-4 py-2.5 rounded-xl bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 text-sm font-bold text-[color:var(--on-surface)] outline-none focus:border-[color:var(--primary)] placeholder:text-[color:var(--on-surface-variant)]/60"
              />
            </div>

            {/* Content summary */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[color:var(--on-surface-variant)] mb-1.5">
                Anotações e Conteúdo da Aula
              </label>
              <textarea
                rows={4}
                value={contentSummary}
                onChange={(e) => setContentSummary(e.target.value)}
                placeholder="Escreva aqui os principais pontos explicados pelo professor, dúvidas, resumos..."
                className="w-full px-4 py-3 rounded-xl bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 text-sm text-[color:var(--on-surface)] outline-none focus:border-[color:var(--primary)] placeholder:text-[color:var(--on-surface-variant)]/60 resize-y"
              />
            </div>

            {/* Topics */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[color:var(--on-surface-variant)] mb-1.5">
                Tópicos Abordados (separados por vírgula)
              </label>
              <input
                type="text"
                value={topics}
                onChange={(e) => setTopics(e.target.value)}
                placeholder="Ex: Derivadas parciais, Regra da cadeia, Exercícios 1 a 5"
                className="w-full px-4 py-2.5 rounded-xl bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 text-sm text-[color:var(--on-surface)] outline-none focus:border-[color:var(--primary)] placeholder:text-[color:var(--on-surface-variant)]/60"
              />
            </div>

            {/* Homework / Tasks */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[color:var(--on-surface-variant)] mb-1.5">
                Tarefas / Dever de Casa indicados
              </label>
              <input
                type="text"
                value={homework}
                onChange={(e) => setHomework(e.target.value)}
                placeholder="Ex: Ler capítulo 4 para a próxima aula"
                className="w-full px-4 py-2.5 rounded-xl bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 text-sm text-[color:var(--on-surface)] outline-none focus:border-[color:var(--primary)] placeholder:text-[color:var(--on-surface-variant)]/60"
              />
            </div>

            {/* Actions */}
            <div className="pt-4 flex justify-end gap-3 border-t border-[color:var(--outline-variant)]/20">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-container-high)]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-[color:var(--primary)] text-white text-sm font-bold shadow-lg shadow-[color:var(--primary)]/20 hover:opacity-90 flex items-center gap-2"
              >
                <Icon name="save" className="text-lg" />
                Salvar Nota da Aula
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
