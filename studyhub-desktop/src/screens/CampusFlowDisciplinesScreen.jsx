import { useMemo, useState } from "react";
import { SCREEN_IDS } from "../app/screenIds";
import { calculateAttendance, calculateSubjectGrade, getAcademicSemesterData } from "../domain/academic";
import { useStudyStore } from "../store/useStore";
import { Icon } from "../ui/Icon";
import { ShareModal } from "../components/ShareModal";
import { IncomingSharesPanel } from "../components/IncomingSharesPanel";
import { getLocalDateKey } from "../utils/dateUtils";

const emptySubject = {
  name: "",
  code: "",
  professor: "",
  room: "",
  credits: 4,
  color: "#1e293b",
  minimumAttendance: 75,
  targetGrade: 7,
  linkedCourseIds: [],
};

export function CampusFlowDisciplinesScreen({ onNavigate }) {
  const academicState = useStudyStore((state) => state.academic);
  const addAcademicEntity = useStudyStore((state) => state.addAcademicEntity);
  const updateAcademicEntity = useStudyStore((state) => state.updateAcademicEntity);
  const deleteAcademicEntity = useStudyStore((state) => state.deleteAcademicEntity);
  const setActiveAcademicSubject = useStudyStore((state) => state.setActiveAcademicSubject);
  const collaboration = useStudyStore((state) => state.collaboration || {});
  const academic = useMemo(() => getAcademicSemesterData(academicState), [academicState]);
  const sharedSubjectIds = useMemo(
    () =>
      new Set(
        (collaboration.shares || [])
          .filter(
            (share) =>
              share.entityType === "subject" && share.status !== "revoked",
          )
          .map((share) => String(share.entityId)),
      ),
    [collaboration.shares],
  );

  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptySubject);
  const [editingId, setEditingId] = useState(null);

  const subjects = academic.subjects.filter(
    (subject) =>
      !subject.isArchived &&
      `${subject.name} ${subject.professor || ""}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")),
  );

  const openSubject = (subject) => {
    setActiveAcademicSubject(subject.id);
    onNavigate?.(SCREEN_IDS.ACADEMIC_SUBJECT);
  };

  const openNewForm = () => {
    setEditingId(null);
    setForm(emptySubject);
    setShowForm(true);
  };

  const openEditForm = (subject, e) => {
    e.stopPropagation();
    setEditingId(subject.id);
    setForm({
      name: subject.name || "",
      code: subject.code || "",
      professor: subject.professor || "",
      room: subject.room || "",
      credits: subject.credits || 4,
      color: subject.color || "#1e293b",
      minimumAttendance: subject.minimumAttendance || 75,
      targetGrade: subject.targetGrade || 7,
      schedule: subject.schedule || { days: [], startTime: "", endTime: "" },
    });
    setShowForm(true);
  };

  const saveSubject = (event) => {
    event.preventDefault();
    if (!form.name.trim()) return;

    if (editingId) {
      updateAcademicEntity("subjects", editingId, {
        ...form,
        schedule: form.schedule || { days: [], startTime: "", endTime: "" },
      });
    } else {
      addAcademicEntity("subjects", {
        ...form,
        semesterId: academic.activeSemesterId,
        schedule: form.schedule || { days: [], startTime: "", endTime: "" },
        weeklyStudyGoalMinutes: 120,
        difficulty: 3,
      });
    }
    setForm(emptySubject);
    setEditingId(null);
    setShowForm(false);
  };

  const archiveSubject = (subject, event) => {
    event.stopPropagation();
    if (!window.confirm(`Remover a disciplina “${subject.name}” da lista?\n\nEla será arquivada. Notas, tarefas, arquivos e cursos vinculados serão preservados.`)) return;
    deleteAcademicEntity("subjects", subject.id);
  };

  return (
    <main className="campus-disciplines-page">
      <div className="campus-disciplines-inner">
        <header>
          <div>
            <h1>Minhas Disciplinas</h1>
            <p>{academic.semester.name} — {subjects.length} Disciplinas Ativas</p>
          </div>
          <button className="campus-primary-button" type="button" onClick={openNewForm}><Icon name="add" /> Adicionar disciplina</button>
        </header>
        <section className="campus-discipline-toolbar">
          <label><Icon name="search" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar disciplina, professor..." /></label>
          <select defaultValue="active"><option value="active">Status: Ativas</option></select>
        </section>
        <IncomingSharesPanel
          types={["subject"]}
          description="Disciplinas aceitas entram no semestre ativo e mantêm notas, tarefas, materiais e baralhos enviados junto com elas."
        />
        <section className="campus-discipline-grid">
          {subjects.map((subject) => {
            const grade = calculateSubjectGrade(academic.grades, subject);
            const attendance = calculateAttendance(academic.attendance, subject, academic.classLogs);
            const attendancePct = Number.isFinite(attendance.attendanceRate)
              ? Math.round(attendance.attendanceRate)
              : 100;
            const upcoming = [...academic.exams, ...academic.projects]
              .filter((item) => item.subjectId === subject.id && item.date >= getLocalDateKey())
              .sort((a, b) => a.date.localeCompare(b.date))[0];
            return (
              <article key={subject.id} className="campus-discipline-card relative group" style={{ "--discipline-color": subject.color || "#1e293b" }} role="button" tabIndex={0} onClick={() => openSubject(subject)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openSubject(subject); } }}>
                <i />
                <header>
                  <div><h2>{subject.name}</h2><p>{subject.professor || "Professor não informado"}</p></div>
                  <div className="flex items-center gap-2">
                    {sharedSubjectIds.has(String(subject.id)) || subject.sharedWithMe ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-1 text-[9px] font-black normal-case tracking-normal text-blue-600" title="Disciplina compartilhada">
                        <Icon name="group" className="text-[12px]" />
                        Compartilhada
                      </span>
                    ) : null}
                    <button className="campus-card-icon-action" type="button" onClick={(e) => openEditForm(subject, e)} title="Editar disciplina e horários" aria-label={`Editar ${subject.name}`}>
                      <Icon name="edit" className="text-[16px]" />
                    </button>
                    <button className="campus-card-icon-action danger" type="button" onClick={(event) => archiveSubject(subject, event)} title="Arquivar disciplina" aria-label={`Arquivar ${subject.name}`}><Icon name="delete" className="text-[16px]" /></button>
                    <span>{subject.code || "DISC"}</span>
                  </div>
                </header>
                <div className="campus-discipline-metrics">
                  <span><small>Média atual</small><strong>{Number.isFinite(grade.average) ? grade.average.toFixed(1) : "—"}</strong></span>
                  <span><small>Frequência</small><strong>{attendancePct}%</strong><em><b style={{ width: `${Math.max(0, Math.min(100, attendancePct))}%` }} /></em></span>
                </div>
                <footer className={attendance.atRisk ? "danger" : ""}><Icon name={upcoming ? "event" : attendance.atRisk ? "warning" : "check_circle"} /> {upcoming ? `${upcoming.title} em ${new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" }).format(new Date(`${upcoming.date}T12:00:00`))}` : attendance.atRisk ? "Frequência abaixo do mínimo" : "Sem pendências urgentes"}</footer>
              </article>
            );
          })}
          {!subjects.length ? <button className="campus-create-card" type="button" onClick={openNewForm}><Icon name="add_circle" /><strong>Adicionar disciplina</strong><span>Comece cadastrando uma matéria deste semestre.</span></button> : null}
        </section>
      </div>
      <button className="campus-discipline-fab" type="button" onClick={openNewForm}><Icon name="add" /></button>
      {showForm ? (
        <div className="campus-task-modal" role="dialog" aria-modal="true">
          <form onSubmit={saveSubject}>
            <header><div><span className="campus-eyebrow">Semestre {academic.semester.name}</span><h2>{editingId ? "Editar disciplina e horários" : "Adicionar disciplina"}</h2></div><button type="button" onClick={() => setShowForm(false)}><Icon name="close" /></button></header>
            <label><span>Nome</span><input autoFocus required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
            <div className="campus-task-form-grid">
              <label><span>Código</span><input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} /></label>
              <label><span>Professor</span><input value={form.professor} onChange={(event) => setForm({ ...form, professor: event.target.value })} /></label>
              <label><span>Sala</span><input value={form.room} onChange={(event) => setForm({ ...form, room: event.target.value })} /></label>
              <label><span>Créditos</span><input min="1" type="number" value={form.credits} onChange={(event) => setForm({ ...form, credits: Number(event.target.value) })} /></label>
              <label><span>Cor</span><input type="color" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} /></label>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <span className="text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider">Dias das Aulas na Semana</span>
              <div className="flex gap-1.5 flex-wrap">
                {[
                  { day: 1, label: "Seg" },
                  { day: 2, label: "Ter" },
                  { day: 3, label: "Qua" },
                  { day: 4, label: "Qui" },
                  { day: 5, label: "Sex" },
                  { day: 6, label: "Sáb" },
                  { day: 0, label: "Dom" },
                ].map(({ day, label }) => {
                  const selectedDays = form.schedule?.days || [];
                  const isSelected = selectedDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => {
                        const newDays = isSelected
                          ? selectedDays.filter((d) => d !== day)
                          : [...selectedDays, day];
                        setForm({
                          ...form,
                          schedule: { ...(form.schedule || {}), days: newDays },
                        });
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        isSelected
                          ? "bg-[color:var(--primary)] text-white shadow-md scale-105"
                          : "bg-[color:var(--surface-container-high)] text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-container-highest)]"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="campus-task-form-grid mt-3">
              <label>
                <span>Horário Início</span>
                <input
                  type="time"
                  value={form.schedule?.startTime || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      schedule: { ...(form.schedule || {}), startTime: e.target.value },
                    })
                  }
                />
              </label>
              <label>
                <span>Horário Fim</span>
                <input
                  type="time"
                  value={form.schedule?.endTime || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      schedule: { ...(form.schedule || {}), endTime: e.target.value },
                    })
                  }
                />
              </label>
            </div>

            <footer><button type="button" onClick={() => setShowForm(false)}>Cancelar</button><button className="campus-primary-button" type="submit">Adicionar</button></footer>
          </form>
        </div>
      ) : null}
    </main>
  );
}

export function CampusFlowSubjectScreen({ onNavigate }) {
  const activeSubjectId = useStudyStore((state) => state.activeAcademicSubjectId);
  const academicState = useStudyStore((state) => state.academic);
  const courses = useStudyStore((state) => state.courses || []);
  const tasks = useStudyStore((state) => state.tasks?.list || []);
  const setActiveCourse = useStudyStore((state) => state.setActiveCourse);
  const setActiveLesson = useStudyStore((state) => state.setActiveLesson);
  const setActiveModule = useStudyStore((state) => state.setActiveModule);
  const academic = useMemo(() => getAcademicSemesterData(academicState), [academicState]);
  const subject = academic.subjects.find((item) => item.id === activeSubjectId);
  const [showShareModal, setShowShareModal] = useState(false);
  if (!subject) return <main className="campus-page"><div className="campus-library-page"><button onClick={() => onNavigate?.(SCREEN_IDS.DISCIPLINES)}>Voltar para disciplinas</button></div></main>;
  const linkedCourses = courses.filter((course) => (subject.linkedCourseIds || []).includes(course.id) || course.id === subject.courseId);
  const lessons = linkedCourses.flatMap((course) => {
    const topLevel = (course.lessons || []).map((lesson) => ({ ...lesson, module: null, course }));
    const fromModules = (course.modules || []).flatMap((module) => (module.lessons || []).map((lesson) => ({ ...lesson, module, course })));
    return [...topLevel, ...fromModules];
  });
  const grade = calculateSubjectGrade(academic.grades, subject);
  const attendance = calculateAttendance(academic.attendance, subject, academic.classLogs);
  const attendancePct = Number.isFinite(attendance.attendanceRate)
    ? Math.round(attendance.attendanceRate)
    : 100;
  const subjectTasks = tasks.filter((task) => task.academicSubjectId === subject.id || task.subjectId === subject.id);
  const resources = (academic.resources || []).filter((resource) => resource.subjectId === subject.id);

  const openLesson = (lesson) => {
    setActiveCourse(lesson.course.id);
    setActiveModule(lesson.module?.id || null);
    setActiveLesson(lesson.id);
    onNavigate?.(SCREEN_IDS.LESSON);
  };

  const handleCreateSubjectNote = () => {
    const store = useStudyStore.getState();
    const vaultId = `discipline-${subject.id}`;
    store.setActiveVaultId(vaultId);
    store.setActiveAcademicSubject?.(subject.id);
    const newNoteId = `note-${Date.now()}`;
    const newNote = {
      id: newNoteId,
      title: `Anotação · ${subject.name}`,
      itemType: "note",
      path: "",
      markdownContent: "",
      vaultId,
      academicSubjectId: subject.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    store.addStudyItem(newNote);
    store.openTab(newNote);
    onNavigate?.(SCREEN_IDS.NOTE_EDITOR);
  };

  return (
    <main className="campus-subject-page">
      <header className="campus-subject-topbar">
        <button type="button" onClick={() => onNavigate?.(SCREEN_IDS.DISCIPLINES)}><Icon name="arrow_back" /></button>
        <div><span>{subject.code || "Disciplina"}</span><h1>{subject.name}</h1></div>
        <div><button type="button" onClick={() => setShowShareModal(true)}><Icon name="group" /> Compartilhar</button><button type="button" onClick={handleCreateSubjectNote}><Icon name="note_add" /> Criar nota</button><button type="button" onClick={() => onNavigate?.(SCREEN_IDS.TASKS)}><Icon name="add_task" /> Tarefa</button></div>
      </header>
      <div className="campus-subject-content">
        <section className="campus-subject-main">
          <article className="campus-course-hero">
            <div className="campus-course-preview"><Icon name="play_arrow" /></div>
            <div><span>Disciplina em andamento</span><h2>{subject.name}</h2><p>{subject.professor || "Professor não informado"}{subject.room ? ` · Sala ${subject.room}` : ""}</p></div>
          </article>
          <section className="campus-syllabus">
            <header><h2>Conteúdo e aulas</h2><span>{lessons.filter((lesson) => lesson.completed).length}/{lessons.length} concluídas</span></header>
            <div>
              {lessons.map((lesson, index) => <button key={lesson.id} type="button" onClick={() => openLesson(lesson)}><Icon name={lesson.completed ? "check_circle" : index === 0 ? "play_circle" : "lock_open"} /><span><strong>{lesson.title}</strong><small>{lesson.module.title}</small></span><em>{lesson.duration || ""}</em></button>)}
              {!lessons.length ? <button type="button" onClick={() => onNavigate?.(SCREEN_IDS.DASHBOARD)}><Icon name="link" /><span><strong>Vincular curso existente</strong><small>Conecte aulas e materiais a esta disciplina.</small></span></button> : null}
            </div>
          </section>
          <section className="campus-subject-tasks"><header><h2>Próximas atividades</h2><button type="button" onClick={() => onNavigate?.(SCREEN_IDS.TASKS)}>Ver todas</button></header>{subjectTasks.slice(0, 4).map((task) => <article key={task.id}><Icon name="assignment" /><span><strong>{task.title}</strong><small>{task.dueDate || "Sem prazo"}</small></span></article>)}</section>
        </section>
        <aside className="campus-subject-side">
          <section className="campus-subject-metrics">
            <span><small>Média atual</small><strong>{Number.isFinite(grade.average) ? grade.average.toFixed(1) : "—"}</strong></span>
            <span><small>Frequência</small><strong>{attendancePct}%</strong></span>
          </section>
          <section><header><h2>Materiais</h2><span>{resources.length}</span></header>{resources.slice(0, 5).map((resource) => <button key={resource.id} type="button"><Icon name={resource.type === "link" ? "link" : "description"} /><span><strong>{resource.title}</strong><small>{resource.type || "Arquivo"}</small></span></button>)}{!resources.length ? <p>Nenhum material adicionado.</p> : null}</section>
          <section className="campus-whiteboard-preview"><header><h2><Icon name="draw" /> Lousa</h2></header><button type="button" onClick={() => onNavigate?.(SCREEN_IDS.WHITEBOARD)}><Icon name="open_in_new" /><span>Abrir lousa</span></button></section>
        </aside>
      </div>
      {showShareModal ? <ShareModal entityType="subject" entityId={subject.id} title={subject.name} payload={subject} onClose={() => setShowShareModal(false)} /> : null}
    </main>
  );
}
