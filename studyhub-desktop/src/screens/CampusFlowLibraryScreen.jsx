import { useMemo, useState, useRef, useEffect } from "react";
import { SCREEN_IDS } from "../app/screenIds";
import {
  normalizeAcademicData,
  calculateAttendance,
  calculateSubjectGrade,
  getAcademicSemesterData,
} from "../domain/academic";
import { useStudyStore } from "../store/useStore";
import { Icon } from "../ui/Icon";
import { ShareModal } from "../components/ShareModal";
import { IncomingSharesPanel } from "../components/IncomingSharesPanel";
import { getLocalDateKey } from "../utils/dateUtils";
import {
  collaborationCloud,
  collaborationCloudConfigured,
} from "../services/collaboration-cloud";

const cleanText = (value = "") =>
  String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

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

export function CampusFlowCoursesScreen({ onNavigate, initialTab = "all" }) {
  const courses = useStudyStore((state) => state.courses || []);
  const setActiveCourse = useStudyStore((state) => state.setActiveCourse);
  const deleteCourse = useStudyStore((state) => state.deleteCourse);

  const academicState = useStudyStore((state) => state.academic);
  const addAcademicEntity = useStudyStore((state) => state.addAcademicEntity);
  const updateAcademicEntity = useStudyStore((state) => state.updateAcademicEntity);
  const deleteAcademicEntity = useStudyStore((state) => state.deleteAcademicEntity);
  const setActiveAcademicSubject = useStudyStore((state) => state.setActiveAcademicSubject);
  const academic = useMemo(() => getAcademicSemesterData(academicState), [academicState]);

  const collaboration = useStudyStore((state) => state.collaboration || {});
  const sharedCourseIds = useMemo(
    () =>
      new Set(
        (collaboration.shares || [])
          .filter(
            (share) =>
              share.entityType === "course" && share.status !== "revoked",
          )
          .map((share) => String(share.entityId)),
      ),
    [collaboration.shares],
  );
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

  const [activeTab, setActiveTab] = useState(initialTab); // "all" | "courses" | "disciplines"
  const [search, setSearch] = useState("");
  const [showSubjectForm, setShowSubjectForm] = useState(false);
  const [subjectForm, setSubjectForm] = useState(emptySubject);
  const [editingSubjectId, setEditingSubjectId] = useState(null);

  const filteredCourses = useMemo(() => {
    return courses.filter((course) => {
      const text = `${course.title || ""} ${course.code || ""} ${course.description || ""}`.toLowerCase();
      return text.includes(search.toLowerCase());
    });
  }, [courses, search]);

  const subjects = useMemo(() => {
    return (academic.subjects || []).filter(
      (subject) =>
        !subject.isArchived &&
        `${subject.name} ${subject.professor || ""} ${subject.code || ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    );
  }, [academic.subjects, search]);

  const removeCourse = (course, event) => {
    event.stopPropagation();
    if (!window.confirm(`Excluir o curso “${course.title}”?\n\nO curso será desvinculado das disciplinas. Notas, tarefas e arquivos não serão apagados.`)) return;
    deleteCourse(course.id);
  };

  const openSubject = (subject) => {
    setActiveAcademicSubject(subject.id);
    onNavigate?.(SCREEN_IDS.ACADEMIC_SUBJECT);
  };

  const openNewSubjectForm = () => {
    setEditingSubjectId(null);
    setSubjectForm(emptySubject);
    setShowSubjectForm(true);
  };

  useEffect(() => {
    const handleOpenAddDiscipline = () => {
      setActiveTab("disciplines");
      setEditingSubjectId(null);
      setSubjectForm(emptySubject);
      setShowSubjectForm(true);
    };
    window.addEventListener("studyhub-open-add-discipline", handleOpenAddDiscipline);
    return () => window.removeEventListener("studyhub-open-add-discipline", handleOpenAddDiscipline);
  }, []);

  const openEditSubjectForm = (subject, e) => {
    e.stopPropagation();
    setEditingSubjectId(subject.id);
    setSubjectForm({
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
    setShowSubjectForm(true);
  };

  const saveSubject = (event) => {
    event.preventDefault();
    if (!subjectForm.name.trim()) return;

    if (editingSubjectId) {
      updateAcademicEntity("subjects", editingSubjectId, {
        ...subjectForm,
        schedule: subjectForm.schedule || { days: [], startTime: "", endTime: "" },
      });
    } else {
      addAcademicEntity("subjects", {
        ...subjectForm,
        semesterId: academic.activeSemesterId,
        schedule: subjectForm.schedule || { days: [], startTime: "", endTime: "" },
        weeklyStudyGoalMinutes: 120,
        difficulty: 3,
      });
    }
    setSubjectForm(emptySubject);
    setEditingSubjectId(null);
    setShowSubjectForm(false);
  };

  const archiveSubject = (subject, event) => {
    event.stopPropagation();
    if (!window.confirm(`Remover a disciplina “${subject.name}” da lista?\n\nEla será arquivada. Notas, tarefas, arquivos e cursos vinculados serão preservados.`)) return;
    deleteAcademicEntity("subjects", subject.id);
  };

  return (
    <main className="campus-page">
      <div className="campus-library-page study-library-page">
        <header className="campus-library-header">
          <div>
            <span className="campus-eyebrow">Hub de Aprendizagem</span>
            <h1>Cursos e Disciplinas</h1>
            <p>Seu semestre e suas trilhas de aprendizagem.</p>
          </div>
          <details className="study-create-menu" onClick={event => { if (event.target.closest("button")) event.currentTarget.removeAttribute("open"); }}><summary className="campus-primary-button"><Icon name="add" />Adicionar<Icon name="expand_more" /></summary><div>
            <button
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-[color:var(--outline-variant)] bg-[color:var(--surface-container)] hover:bg-[color:var(--surface-container-high)] text-xs font-bold text-[color:var(--on-surface)] transition-all cursor-pointer shadow-xs"
              type="button"
              onClick={openNewSubjectForm}
            >
              <Icon name="add" className="text-sm text-[color:var(--primary)]" />
              <span>Nova Disciplina</span>
            </button>
            <button className="campus-primary-button" type="button" onClick={() => onNavigate?.(SCREEN_IDS.CREATE_COURSE)}>
              <Icon name="add" /> Novo Curso
            </button>
          </div></details>
        </header>

        {/* Toolbar com Filtros de Abas e Barra de Busca */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center bg-[color:var(--surface-container-low)] p-1 rounded-2xl border border-[color:var(--outline-variant)]/30">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === "all"
                  ? "bg-[color:var(--primary)] text-white shadow-xs"
                  : "text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]"
              }`}
            >
              <Icon name="dashboard" className="text-xs" />
              <span>Todos ({courses.length + subjects.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("courses")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === "courses"
                  ? "bg-[color:var(--primary)] text-white shadow-xs"
                  : "text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]"
              }`}
            >
              <Icon name="play_lesson" className="text-xs" />
              <span>Cursos ({courses.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("disciplines")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === "disciplines"
                  ? "bg-[color:var(--primary)] text-white shadow-xs"
                  : "text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]"
              }`}
            >
              <Icon name="menu_book" className="text-xs" />
              <span>Disciplinas ({subjects.length})</span>
            </button>
          </div>

          <label className="campus-search flex-1 max-w-md">
            <Icon name="search" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar curso, disciplina, aula ou professor..."
            />
          </label>
        </div>

        <IncomingSharesPanel
          types={["course", "lesson", "subject"]}
          description="Cursos, aulas e disciplinas aceitos entram diretamente na sua biblioteca."
        />

        {activeTab === "all" && !subjects.length && !filteredCourses.length && (
          <div className="study-library-empty"><Icon name="school" /><h2>{search ? "Nenhum resultado" : "Comece sua biblioteca"}</h2><p>{search ? "Tente outro nome de curso, disciplina ou professor." : "Use Adicionar para cadastrar uma disciplina ou um curso."}</p></div>
        )}

        {/* 1. SEÇÃO DE DISCIPLINAS (QUANDO ABA 'ALL' OU 'DISCIPLINES') */}
        {(activeTab === "disciplines" || (activeTab === "all" && subjects.length > 0)) && (
          <section className="space-y-3">
            {activeTab === "all" && (
              <div className="flex items-center justify-between border-b border-[color:var(--outline-variant)]/20 pb-2">
                <h2 className="text-sm font-black uppercase tracking-wider text-[color:var(--on-surface-variant)] flex items-center gap-2">
                  <Icon name="school" className="text-base text-[color:var(--primary)]" />
                  <span>Disciplinas Acadêmicas ({subjects.length})</span>
                </h2>
                <button
                  type="button"
                  onClick={openNewSubjectForm}
                  className="text-xs font-bold text-[color:var(--primary)] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Icon name="add" className="text-xs" /> Adicionar
                </button>
              </div>
            )}

            <div className="campus-discipline-grid">
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
                  <article
                    key={subject.id}
                    className="campus-discipline-card relative group"
                    style={{ "--discipline-color": subject.color || "#1e293b" }}
                    role="button"
                    tabIndex={0}
                    onClick={() => openSubject(subject)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openSubject(subject);
                      }
                    }}
                  >
                    <i />
                    <header>
                      <div>
                        <h2>{subject.name}</h2>
                        <p>{subject.professor || "Professor não informado"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {sharedSubjectIds.has(String(subject.id)) || subject.sharedWithMe ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-1 text-[9px] font-black normal-case tracking-normal text-blue-600"
                            title="Disciplina compartilhada"
                          >
                            <Icon name="group" className="text-[12px]" />
                            Compartilhada
                          </span>
                        ) : null}
                        <button
                          className="campus-card-icon-action"
                          type="button"
                          onClick={(e) => openEditSubjectForm(subject, e)}
                          title="Editar disciplina e horários"
                          aria-label={`Editar ${subject.name}`}
                        >
                          <Icon name="edit" className="text-[16px]" />
                        </button>
                        <button
                          className="campus-card-icon-action danger"
                          type="button"
                          onClick={(event) => archiveSubject(subject, event)}
                          title="Arquivar disciplina"
                          aria-label={`Arquivar ${subject.name}`}
                        >
                          <Icon name="delete" className="text-[16px]" />
                        </button>
                        {subject.code && <span>{subject.code}</span>}
                      </div>
                    </header>
                    <div className="campus-discipline-metrics">
                      <span>
                        <small>Média atual</small>
                        <strong>{Number.isFinite(grade.average) ? grade.average.toFixed(1) : "—"}</strong>
                      </span>
                      <span>
                        <small>Frequência</small>
                        <strong>{attendance.total > 0 ? `${attendancePct}%` : "—"}</strong>
                        <em>
                          <b style={{ width: `${attendance.total > 0 ? Math.max(0, Math.min(100, attendancePct)) : 0}%` }} />
                        </em>
                      </span>
                    </div>
                    <footer className={attendance.atRisk ? "danger" : ""}>
                      <Icon name={upcoming ? "event" : attendance.atRisk ? "warning" : "check_circle"} />
                      {upcoming
                        ? `${upcoming.title} em ${new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" }).format(new Date(`${upcoming.date}T12:00:00`))}`
                        : attendance.atRisk
                        ? "Frequência abaixo do mínimo"
                        : "Sem pendências urgentes"}
                    </footer>
                  </article>
                );
              })}

              {!subjects.length && activeTab === "disciplines" ? (
                <button className="campus-create-card" type="button" onClick={openNewSubjectForm}>
                  <Icon name="add_circle" />
                  <strong>Adicionar disciplina</strong>
                  <span>Cadastre matérias deste semestre, horários e professores.</span>
                </button>
              ) : null}
            </div>
          </section>
        )}

        {/* 2. SEÇÃO DE CURSOS (QUANDO ABA 'ALL' OU 'COURSES') */}
        {(activeTab === "courses" || (activeTab === "all" && filteredCourses.length > 0)) && (
          <section className="space-y-3 pt-2">
            {activeTab === "all" && (
              <div className="flex items-center justify-between border-b border-[color:var(--outline-variant)]/20 pb-2">
                <h2 className="text-sm font-black uppercase tracking-wider text-[color:var(--on-surface-variant)] flex items-center gap-2">
                  <Icon name="play_lesson" className="text-base text-[color:var(--primary)]" />
                  <span>Cursos e Vídeo-Aulas ({filteredCourses.length})</span>
                </h2>
                <button
                  type="button"
                  onClick={() => onNavigate?.(SCREEN_IDS.CREATE_COURSE)}
                  className="text-xs font-bold text-[color:var(--primary)] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Icon name="add" className="text-xs" /> Novo Curso
                </button>
              </div>
            )}

            <div className="campus-course-grid">
              {filteredCourses.map((course) => {
                const lessons = [
                  ...(course.lessons || []),
                  ...(course.modules || []).flatMap((module) => module.lessons || []),
                ];
                return (
                  <article
                    key={course.id}
                    className="campus-course-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setActiveCourse(course.id);
                      onNavigate?.(SCREEN_IDS.MODULES);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      setActiveCourse(course.id);
                      onNavigate?.(SCREEN_IDS.MODULES);
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="campus-course-code">{course.code || "CURSO"}</span>
                      <span className="campus-card-actions">
                        {sharedCourseIds.has(String(course.id)) || course.sharedWithMe ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-1 text-[9px] font-black text-blue-600">
                            <Icon name="group" className="text-[12px]" />
                            Compartilhado
                          </span>
                        ) : null}
                        <button
                          className="campus-card-icon-action danger"
                          type="button"
                          onClick={(event) => removeCourse(course, event)}
                          title="Excluir curso"
                          aria-label={`Excluir ${course.title}`}
                        >
                          <Icon name="delete" />
                        </button>
                      </span>
                    </div>
                    <h2>{course.title}</h2>
                    <p>{course.description || `${course.modules?.length || 0} módulos e ${lessons.length} aulas`}</p>
                    <span className="campus-course-meter">
                      <i style={{ width: `${course.progress || 0}%` }} />
                    </span>
                    <footer>
                      <span>{course.progress || 0}% concluído</span>
                      <Icon name="arrow_forward" />
                    </footer>
                  </article>
                );
              })}

              {!filteredCourses.length && activeTab === "courses" ? (
                <button className="campus-create-card" type="button" onClick={() => onNavigate?.(SCREEN_IDS.CREATE_COURSE)}>
                  <Icon name="add_circle" />
                  <strong>Criar primeiro curso</strong>
                  <span>Organize vídeos, PDFs, links e aulas.</span>
                </button>
              ) : null}
            </div>
          </section>
        )}
      </div>

      {/* Modal de Criação / Edição de Disciplina */}
      {showSubjectForm ? (
        <div className="campus-task-modal" role="dialog" aria-modal="true">
          <form onSubmit={saveSubject}>
            <header>
              <div>
                <span className="campus-eyebrow">Semestre {academic.semester.name}</span>
                <h2>{editingSubjectId ? "Editar disciplina e horários" : "Adicionar disciplina"}</h2>
              </div>
              <button type="button" onClick={() => setShowSubjectForm(false)}>
                <Icon name="close" />
              </button>
            </header>
            <label>
              <span>Nome</span>
              <input
                autoFocus
                required
                value={subjectForm.name}
                onChange={(event) => setSubjectForm({ ...subjectForm, name: event.target.value })}
              />
            </label>
            <div className="campus-task-form-grid">
              <label>
                <span>Código</span>
                <input
                  value={subjectForm.code}
                  onChange={(event) => setSubjectForm({ ...subjectForm, code: event.target.value })}
                />
              </label>
              <label>
                <span>Professor</span>
                <input
                  value={subjectForm.professor}
                  onChange={(event) => setSubjectForm({ ...subjectForm, professor: event.target.value })}
                />
              </label>
              <label>
                <span>Sala</span>
                <input
                  value={subjectForm.room}
                  onChange={(event) => setSubjectForm({ ...subjectForm, room: event.target.value })}
                />
              </label>
              <label>
                <span>Créditos</span>
                <input
                  min="1"
                  type="number"
                  value={subjectForm.credits}
                  onChange={(event) => setSubjectForm({ ...subjectForm, credits: Number(event.target.value) })}
                />
              </label>
              <label>
                <span>Cor</span>
                <input
                  type="color"
                  value={subjectForm.color}
                  onChange={(event) => setSubjectForm({ ...subjectForm, color: event.target.value })}
                />
              </label>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <span className="text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider">
                Dias das Aulas na Semana
              </span>
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
                  const selectedDays = subjectForm.schedule?.days || [];
                  const isSelected = selectedDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => {
                        const newDays = isSelected
                          ? selectedDays.filter((d) => d !== day)
                          : [...selectedDays, day];
                        setSubjectForm({
                          ...subjectForm,
                          schedule: { ...(subjectForm.schedule || {}), days: newDays },
                        });
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
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
                  value={subjectForm.schedule?.startTime || ""}
                  onChange={(e) =>
                    setSubjectForm({
                      ...subjectForm,
                      schedule: { ...(subjectForm.schedule || {}), startTime: e.target.value },
                    })
                  }
                />
              </label>
              <label>
                <span>Horário Fim</span>
                <input
                  type="time"
                  value={subjectForm.schedule?.endTime || ""}
                  onChange={(e) =>
                    setSubjectForm({
                      ...subjectForm,
                      schedule: { ...(subjectForm.schedule || {}), endTime: e.target.value },
                    })
                  }
                />
              </label>
            </div>

            <footer>
              <button type="button" onClick={() => setShowSubjectForm(false)}>
                Cancelar
              </button>
              <button className="campus-primary-button" type="submit">
                {editingSubjectId ? "Salvar Alterações" : "Adicionar Disciplina"}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </main>
  );
}

export function CampusFlowNotesScreen({ onNavigate }) {
  const academicState = useStudyStore((state) => state.academic);
  const courses = useStudyStore((state) => state.courses || []);
  const notes = useStudyStore((state) => state.notes?.list || []);
  const setActiveNote = useStudyStore((state) => state.setActiveNote);
  const addNote = useStudyStore((state) => state.addNote);
  const studyItems = useStudyStore((state) => state.studyItems || []);
  const addStudyItem = useStudyStore((state) => state.addStudyItem);
  const updateStudyItem = useStudyStore((state) => state.updateStudyItem);
  const deleteStudyItem = useStudyStore((state) => state.deleteStudyItem);
  const academic = useMemo(
    () => normalizeAcademicData(academicState),
    [academicState],
  );
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [libraryScope, setLibraryScope] = useState("all");
  const [typeFilters, setTypeFilters] = useState({
    class_note: true,
    note: true,
    drawing: true,
    file: true,
    pdf: true,
    spreadsheet: true,
  });
  // Tags filter: array of selected tag strings
  const [tagFilters, setTagFilters] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileMessage, setFileMessage] = useState("");
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [shareItem, setShareItem] = useState(null);
  const createMenuRef = useRef(null);
  const browserFileRef = useRef(null);

  // Close menu when clicking outside or pressing Escape
  useEffect(() => {
    if (!showCreateMenu) return undefined;
    function onDocMouseDown(e) {
      if (!createMenuRef.current) return;
      if (!createMenuRef.current.contains(e.target)) {
        setShowCreateMenu(false);
      }
    }
    function onDocKey(e) {
      if (e.key === "Escape") setShowCreateMenu(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onDocKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onDocKey);
    };
  }, [showCreateMenu]);

  const [fileForm, setFileForm] = useState({
    title: "",
    academicSubjectId: "",
    tags: "",
  });
  const items = studyItems.length
    ? studyItems.filter((item) => item.section !== "archived" && !item.parentNoteId && item.sourceKind !== "nested-note")
    : notes.filter((item) => !item.parentNoteId && item.sourceKind !== "nested-note");

  // compute available tags from items
  const availableTags = useMemo(() => {
    const setTags = new Set();
    (items || []).forEach((it) => {
      (it.tags || []).forEach((t) => {
        if (t) setTags.add(String(t));
      });
    });
    return Array.from(setTags).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [items]);

  const visibleItems = items.filter((item) => {
    const itemCourseId = item.courseId || item.sourceCourseId || item.sourceCourse?.id || "";
    const itemSubjectId = item.academicSubjectId || item.subjectId || "";
    const matchesScope =
      libraryScope === "all" ||
      (libraryScope === "courses" && Boolean(itemCourseId)) ||
      (libraryScope === "subjects" && Boolean(itemSubjectId));
    const matchesEntity =
      (libraryScope === "courses" && (subjectFilter === "all" || itemCourseId === subjectFilter)) ||
      (libraryScope === "subjects" && (subjectFilter === "all" || itemSubjectId === subjectFilter)) ||
      libraryScope === "all";
    const extension = String(
      item.originalFileName || item.description || item.filePath || item.cloudObjectPath || "",
    )
      .split(".")
      .pop()
      ?.toLowerCase();
    const typeKey =
      item.type === "file"
        ? extension === "pdf"
          ? "pdf"
          : ["csv", "xls", "xlsx"].includes(extension)
            ? "spreadsheet"
            : "file"
        : item.category === "Nota de aula" ? "class_note" : (item.type || "note");
    const matchesType = typeFilters[typeKey] !== false;
    const haystack = `${item.title || ""} ${item.content || ""} ${item.description || ""} ${(item.tags || []).join(" ")}`.toLocaleLowerCase("pt-BR");
    const matchesSearch = haystack.includes(search.toLocaleLowerCase("pt-BR"));

    // tags filter: if any tags selected, require item to include at least one
    const selectedTags = tagFilters || [];
    const itemTags = (item.tags || []).map((t) => String(t));
    const matchesTags =
      selectedTags.length === 0 || selectedTags.some((t) => itemTags.includes(t));

    return matchesScope && matchesEntity && matchesSearch && matchesType && matchesTags;
  });

  const toggleSelection = (itemId) => {
    setSelectedIds((current) =>
      current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId],
    );
  };

  const deleteSelected = async () => {
    if (!selectedIds.length) return;
    if (!window.confirm(`Excluir ${selectedIds.length} item(ns) selecionado(s)?`)) {
      return;
    }
    setFileMessage("");
    setUploading(true);
    const selectedItems = items.filter((item) => selectedIds.includes(item.id));
    const deletedIds = [];
    const errors = [];
    for (const item of selectedItems) {
      try {
        if (item.cloudObjectPath && !item.sharedWithMe) {
          await collaborationCloud.removeAccountFile({
            objectPath: item.cloudObjectPath,
            fileObjectId: item.cloudFileObjectId,
          });
        }
        deleteStudyItem(item.id);
        deletedIds.push(item.id);
      } catch (error) {
        errors.push(`${item.title || item.description || "Arquivo"}: ${error.message}`);
      }
    }
    setSelectedIds((current) => current.filter((id) => !deletedIds.includes(id)));
    setUploading(false);
    setFileMessage(
      errors.length
        ? `Alguns itens não foram excluídos: ${errors.join(" • ")}`
        : `${deletedIds.length} item(ns) excluído(s).`,
    );
  };

  const openNote = async (item) => {
    if (item.type === "file") {
      setFileMessage("");
      try {
        if (item.filePath && !/^data:/i.test(item.filePath)) {
          const result = await window.studyhubDesktop?.openPath?.(item.filePath);
          if (window.studyhubDesktop?.openPath && (result === "" || result?.success === true)) return;
          if (typeof result === "string" && result) throw new Error(result);
        }

        if (item.cloudObjectPath) {
          const signedUrl = await collaborationCloud.createSignedFileUrl(
            item.cloudObjectPath,
          );
          if (window.studyhubDesktop?.openExternal) {
            await window.studyhubDesktop.openExternal(signedUrl);
          } else {
            const anchor = document.createElement("a");
            anchor.href = signedUrl;
            anchor.target = "_blank";
            anchor.rel = "noopener noreferrer";
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
          }
          return;
        }

        const legacyDataUrl = item.fileDataUrl || (/^data:/i.test(item.filePath || "") ? item.filePath : "");
        if (legacyDataUrl) {
          const anchor = document.createElement("a");
          anchor.href = legacyDataUrl;
          anchor.target = "_blank";
          anchor.rel = "noopener noreferrer";
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          return;
        }
        throw new Error("O arquivo local não existe neste dispositivo.");
      } catch (error) {
        setFileMessage(error.message || "Não foi possível abrir o arquivo.");
      }
      return;
    }

    // If it's a drawing, open the whiteboard in library-drawing mode
    const isDrawing = item.itemType === "drawing" || item.noteType === "drawing" || item.type === "drawing";
    if (isDrawing) {
      setActiveNote(item.id);
      if (typeof window !== "undefined") {
        const params = new URLSearchParams({
          screen: SCREEN_IDS.WHITEBOARD,
          mode: "library-drawing",
          noteId: item.id,
        });
        window.history.replaceState(null, "", `?${params.toString()}`);
      }
      onNavigate?.(SCREEN_IDS.WHITEBOARD);
      return;
    }

    // Otherwise open note editor
    setActiveNote(item.id);
    onNavigate?.(SCREEN_IDS.NOTE_EDITOR);
  };

  const handlePickFile = async () => {
    setFileMessage("");
    setUploading(true);
    try {
      if (!window.studyhubDesktop?.selectFile) {
        browserFileRef.current?.click();
        return;
      }
      const selected = await window.studyhubDesktop.selectFile({ properties: ["openFile"] });
      const path = Array.isArray(selected) ? selected[0] : selected;
      if (!path) return;
      const name = path.split(/[\\/]/).pop() || path;
      let cloudFile = null;
      if (collaborationCloudConfigured && window.studyhubDesktop?.readFileBinary) {
        const binary = await window.studyhubDesktop.readFileBinary(path);
        const uploadFile = new File([new Uint8Array(binary)], name);
        cloudFile = await collaborationCloud.uploadAccountFile(uploadFile);
      }
      await saveLibraryFile({
        name,
        filePath: path,
        size: cloudFile?.size_bytes || 0,
        type: cloudFile?.mime_type || "",
        cloudFile,
      });
    } catch (error) {
      setFileMessage(error.message || "Não foi possível adicionar o arquivo.");
    } finally {
      setUploading(false);
    }
  };

  const openFileCreator = () => {
    setShowCreateMenu(false);
    setShowCreateDialog(false);
    setShowUploadModal(true);
  };

  const navigateTo = (screen) => {
    if (onNavigate) {
      onNavigate(screen);
      return;
    }
    window.dispatchEvent(
      new CustomEvent("studyhub:navigate", { detail: { screen } }),
    );
  };

  const saveLibraryFile = async ({
    name,
    filePath = "",
    size = 0,
    type = "",
    cloudFile = null,
  }) => {
      const subject = academic.subjects.find(
        (item) => item.id === fileForm.academicSubjectId,
      );
      const tags = fileForm.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      addStudyItem({
        id: `file-${Date.now()}`,
        itemType: "file",
        type: "file",
        noteType: "file",
        sourceKind: "file-library",
        title: fileForm.title.trim() || name,
        description: name,
        originalFileName: name,
        filePath,
        fileDataUrl: null,
        fileSize: size,
        mimeType: type,
        cloudObjectPath: cloudFile?.object_path || cloudFile?.objectPath || null,
        cloudFileObjectId: cloudFile?.id || null,
        cloudBucketId: cloudFile?.bucket_id || cloudFile?.bucketId || null,
        academicSubjectId: subject?.id || null,
        academicSemesterId: subject?.semesterId || null,
        category: subject?.name || "Arquivo",
        module: "Materiais",
        tags,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      setShowUploadModal(false);
      setFileForm({ title: "", academicSubjectId: "", tags: "" });
      setFileMessage(
        cloudFile
          ? "Arquivo adicionado e sincronizado com sua conta."
          : "Arquivo adicionado localmente neste computador.",
      );
  };

  const handleBrowserFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    setFileMessage("");
    try {
      if (!collaborationCloudConfigured) {
        throw new Error("Configure o Supabase para enviar arquivos pela versão web.");
      }
      const cloudFile = await collaborationCloud.uploadAccountFile(file);
      await saveLibraryFile({
        name: file.name,
        size: file.size,
        type: cloudFile.mime_type || file.type,
        cloudFile,
      });
    } catch (error) {
      setFileMessage(error.message || "Não foi possível enviar o arquivo.");
    } finally {
      setUploading(false);
    }
  };

  const handleCreateDrawing = () => {
    const store = useStudyStore.getState();
    const noteId = `note-${Date.now()}`;
    const selectedSubject =
      subjectFilter === "all"
        ? null
        : academic.subjects.find((subject) => subject.id === subjectFilter) ||
          null;

    store.addNote({
      id: noteId,
      title: "Novo desenho",
      content: "<p>Desenho salvo na biblioteca.</p>",
      category: "Desenho",
      module: "Biblioteca",
      accent: "tertiary",
      noteType: "drawing",
      itemType: "drawing",
      sourceKind: "drawing-note",
      academicSubjectId: selectedSubject?.id || null,
      academicSemesterId: selectedSubject?.semesterId || null,
      tags: selectedSubject?.name ? [selectedSubject.name] : [],
      reference: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    store.setActiveNote(noteId);

    setShowCreateMenu(false);
    setShowCreateDialog(false);
    const params = new URLSearchParams({ screen: SCREEN_IDS.WHITEBOARD, mode: "library-drawing", noteId });
    window.history.replaceState(null, "", `?${params.toString()}`);
    navigateTo(SCREEN_IDS.WHITEBOARD);
  };

  const handleCreateNote = () => {
    const noteId = `note-${Date.now()}`;
    addNote({ id: noteId, title: "Nova anotação", content: "", category: "Anotação Livre", sourceKind: "note", itemType: "note", accent: "primary", createdAt: Date.now(), updatedAt: Date.now() });
    setActiveNote(noteId);
    setShowCreateMenu(false);
    setShowCreateDialog(false);
    const params = new URLSearchParams({ screen: SCREEN_IDS.NOTE_EDITOR, noteId, edit: "1" });
    window.history.replaceState(null, "", `?${params.toString()}`);
    navigateTo(SCREEN_IDS.NOTE_EDITOR);
  };

  return (
    <main className="campus-page">
      <input ref={browserFileRef} type="file" className="hidden" onChange={handleBrowserFile} />
      <div className="campus-library-shell">
        <aside className="campus-library-sidebar">
          <div className="campus-library-sidebar-block">
            <span className="campus-eyebrow">Organização</span>
            <select
              value={libraryScope}
              onChange={(event) => {
                setLibraryScope(event.target.value);
                setSubjectFilter("all");
              }}
            >
              <option value="all">ALL</option>
              <option value="courses">Cursos</option>
              <option value="subjects">Disciplinas</option>
            </select>
            {libraryScope === "courses" ? (
              <div className="campus-library-subject-list">
                <button className={subjectFilter === "all" ? "is-active" : ""} type="button" onClick={() => setSubjectFilter("all")}>
                  <i style={{ background: "#94a3b8" }} /> Todos os cursos
                </button>
                {courses.map((course) => (
                  <button key={course.id} className={subjectFilter === course.id ? "is-active" : ""} type="button" onClick={() => setSubjectFilter(course.id)}>
                    <i style={{ background: "#64748b" }} /> {course.title}
                  </button>
                ))}
              </div>
            ) : null}
            {libraryScope === "subjects" ? (
              <div className="campus-library-subject-list">
                <button className={subjectFilter === "all" ? "is-active" : ""} type="button" onClick={() => setSubjectFilter("all")}>
                  <i style={{ background: "#94a3b8" }} /> Todas as disciplinas
                </button>
                {academic.subjects.filter((subject) => !subject.isArchived).map((subject) => (
                  <button key={subject.id} className={subjectFilter === subject.id ? "is-active" : ""} type="button" onClick={() => setSubjectFilter(subject.id)}>
                    <i style={{ background: subject.color || "#94a3b8" }} /> {subject.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="campus-library-sidebar-block">
            <span className="campus-eyebrow">Material Type</span>
            <div className="campus-library-type-list">
              {[
                { id: "class_note", label: "Notas de Aula" },
                { id: "note", label: "Notes" },
                { id: "pdf", label: "PDFs" },
                { id: "spreadsheet", label: "Spreadsheets" },
                { id: "file", label: "Other Files" },
                { id: "drawing", label: "Drawings" },
              ].map((filter) => (
                <label key={filter.id}>
                  <input
                    checked={typeFilters[filter.id]}
                    type="checkbox"
                    onChange={(event) =>
                      setTypeFilters((current) => ({
                        ...current,
                        [filter.id]: event.target.checked,
                      }))
                    }
                  />
                  <span>{filter.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="campus-library-sidebar-block">
            <span className="campus-eyebrow">Tags</span>
            <div className="campus-library-tags-list">
              {availableTags.length ? (
                <>
                  <div className="mb-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setTagFilters([])}
                      className="px-2 py-1 rounded bg-[color:var(--surface-bright)] text-[color:var(--on-surface)] text-xs"
                    >
                      Limpar
                    </button>
                  </div>
                  <div className="flex flex-col gap-1">
                    {availableTags.map((tag) => {
                      const selected = (tagFilters || []).includes(tag);
                      return (
                        <label key={tag} className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => {
                              setTagFilters((current) =>
                                current && current.includes(tag)
                                  ? current.filter((t) => t !== tag)
                                  : [...(current || []), tag],
                              );
                            }}
                          />
                          <span className="text-sm">{tag}</span>
                        </label>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="text-sm text-[color:var(--on-surface-variant)]">Nenhuma tag encontrada</div>
              )}
            </div>
          </div>
        </aside>

        <div className="campus-library-page campus-notes-page">
          <header className="campus-library-header campus-library-header-compact relative z-30">
            <div>
              <span className="campus-eyebrow">Conhecimento</span>
              <h1>Anotações e materiais</h1>
              <p>Manage your academic repository. High-contrast focus mode enabled.</p>
            </div>
            <div className="campus-task-actions">
              <label className="campus-search campus-search-inline">
                <Icon name="search" />
                <input
                  placeholder="Search repository..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>

              <div className="relative z-50" ref={createMenuRef}>
                <button
                  className="campus-primary-button"
                  type="button"
                  onClick={() => setShowCreateMenu((v) => !v)}
                  aria-haspopup="true"
                  aria-expanded={showCreateMenu}
                >
                  <Icon name="add" /> NEW
                </button>

                {showCreateMenu ? (
                  <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-[color:var(--outline-variant)]/40 bg-[color:var(--surface)] p-2 shadow-2xl z-[100]">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-bold text-[color:var(--on-surface)] transition-colors hover:bg-[color:var(--background)] hover:text-[color:var(--primary)]"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        openFileCreator();
                      }}
                    >
                      <Icon name="upload_file" /> Arquivo
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-bold text-[color:var(--on-surface)] transition-colors hover:bg-[color:var(--background)] hover:text-[color:var(--primary)]"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        handleCreateNote();
                      }}
                    >
                      <Icon name="notes" /> Nota
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-bold text-[color:var(--on-surface)] transition-colors hover:bg-[color:var(--background)] hover:text-[color:var(--primary)]"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setShowCreateMenu(false);
                        handleCreateDrawing();
                      }}
                    >
                      <Icon name="draw" /> Desenhar
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </header>

          <IncomingSharesPanel
            types={["note", "whiteboard", "resource"]}
            description="Notas, desenhos e arquivos aceitos aparecem abaixo com a identificação de compartilhado."
          />

          {selectedIds.length ? (
            <div className="campus-library-bulkbar">
              <strong>{selectedIds.length} selecionado(s)</strong>
              <div>
                <button type="button" onClick={() => setSelectedIds([])}>
                  Limpar seleção
                </button>
                <button type="button" onClick={deleteSelected}>
                  Excluir
                </button>
              </div>
            </div>
          ) : null}

          {fileMessage ? (
            <div className="mb-5 flex items-start justify-between gap-4 rounded-xl border border-[color:var(--outline-variant)]/40 bg-[color:var(--surface-container-low)] px-4 py-3 text-sm font-semibold text-[color:var(--on-surface-variant)]" role="status">
              <span>{fileMessage}</span>
              <button type="button" aria-label="Fechar mensagem" onClick={() => setFileMessage("")}>
                <Icon name="close" />
              </button>
            </div>
          ) : null}

          <section className="campus-material-grid campus-material-grid-library">
          {visibleItems.map((item) => (
            <article
              key={item.id}
              className={`campus-material-card campus-material-card-selectable ${
                selectedIds.includes(item.id) ? "is-selected" : ""
              }`}
            >
              <button
                className={`campus-library-select ${
                  selectedIds.includes(item.id) ? "is-selected" : ""
                }`}
                type="button"
                onClick={() => toggleSelection(item.id)}
              >
                {selectedIds.includes(item.id) ? <Icon name="check" /> : null}
              </button>
              <span className="campus-material-type">{item.sharedWithMe ? "Compartilhado · " : ""}{item.type === "drawing" ? "Desenho" : item.type === "file" ? "Arquivo" : item.category === "Nota de aula" ? "Nota de Aula" : "Nota"}</span>
              <span className="campus-material-icon">
                <Icon name={item.type === "drawing" ? "draw" : item.type === "file" ? "description" : item.category === "Nota de aula" ? "edit_note" : "notes"} />
              </span>
              <h2>{item.title || "Sem título"}</h2>
              <p>{cleanText(item.content || item.body || item.description || item.filePath).slice(0, 130) || "Sem prévia disponível."}</p>
              <footer>
                <span>{item.category || item.tags?.[0] || "Acadêmico"}</span>
                {!item.sharedWithMe ? (
                  <button
                    type="button"
                    className="campus-library-open"
                    onClick={() => setShareItem(item)}
                    title="Compartilhar"
                  >
                    <Icon name="group" />
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black text-blue-600" title="Conteúdo compartilhado com você">
                    <Icon name="group" className="text-[14px]" />
                  </span>
                )}
                <button
                  type="button"
                  className="campus-library-open"
                  onClick={() => openNote(item)}
                >
                  <Icon name={item.type === "file" ? "download" : "open_in_new"} />
                </button>
              </footer>
            </article>
          ))}
          {!visibleItems.length ? (
            <>
              <button
                className="campus-create-card"
                type="button"
                onClick={() => {
                  setShowCreateMenu(false);
                  setShowCreateDialog(true);
                }}
              >
                <Icon name="add_circle" />
                <strong>Adicionar novo</strong>
                <span>Escreva, organize e gere revisões com IA.</span>
              </button>

              {showCreateDialog ? (
                <div
                  className="campus-task-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="create-material-title"
                  onMouseDown={(event) => {
                    if (event.target === event.currentTarget) {
                      setShowCreateDialog(false);
                    }
                  }}
                >
                  <div
                    className="p-6 max-w-sm bg-[color:var(--surface)] rounded-[1rem] neo-raised"
                    onMouseDown={(event) => event.stopPropagation()}
                  >
                    <header className="flex items-center justify-between mb-4">
                      <h3 id="create-material-title" className="font-bold">Adicionar novo</h3>
                      <button type="button" onClick={() => setShowCreateDialog(false)}><Icon name="close" /></button>
                    </header>

                    <div className="flex flex-col gap-3">
                      <button
                        type="button"
                        className="campus-primary-button"
                        onClick={openFileCreator}
                      >
                        <Icon name="upload_file" /> Arquivo
                      </button>

                      <button
                        type="button"
                        className="campus-primary-button"
                        onClick={handleCreateNote}
                      >
                        <Icon name="note_add" /> Nota
                      </button>

                      <button
                        type="button"
                        className="campus-primary-button"
                        onClick={handleCreateDrawing}
                      >
                        <Icon name="draw" /> Desenhar
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
          </section>

          {showUploadModal ? (
            <div className="campus-task-modal" role="dialog" aria-modal="true">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  handlePickFile();
                }}
              >
                <header>
                  <div>
                    <span className="campus-eyebrow">Biblioteca</span>
                    <h2>Adicionar arquivo</h2>
                  </div>
                  <button type="button" onClick={() => setShowUploadModal(false)}>
                    <Icon name="close" />
                  </button>
                </header>

                <label>
                  <span>Título</span>
                  <input
                    value={fileForm.title}
                    onChange={(event) =>
                      setFileForm((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    placeholder="Opcional"
                  />
                </label>

                <div className="campus-task-form-grid">
                  <label>
                    <span>Disciplina</span>
                    <select
                      value={fileForm.academicSubjectId}
                      onChange={(event) =>
                        setFileForm((current) => ({
                          ...current,
                          academicSubjectId: event.target.value,
                        }))
                      }
                    >
                      <option value="">Sem disciplina</option>
                      {academic.subjects
                        .filter((subject) => !subject.isArchived)
                        .map((subject) => (
                          <option key={subject.id} value={subject.id}>
                            {subject.name}
                          </option>
                        ))}
                    </select>
                  </label>

                  <label>
                    <span>Tags</span>
                    <input
                      value={fileForm.tags}
                      onChange={(event) =>
                        setFileForm((current) => ({
                          ...current,
                          tags: event.target.value,
                        }))
                      }
                      placeholder="pdf, prova, resumo"
                    />
                  </label>
                </div>

                {fileMessage ? (
                  <p className="rounded-xl bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-300" role="alert">
                    {fileMessage}
                  </p>
                ) : null}

                <footer>
                  <button type="button" onClick={() => setShowUploadModal(false)}>
                    Cancelar
                  </button>
                  <button
                    className="campus-primary-button"
                    disabled={uploading}
                    type="submit"
                  >
                    {uploading ? "Enviando..." : "Escolher arquivo"}
                  </button>
                </footer>
              </form>
            </div>
          ) : null}
          {shareItem ? (
            <ShareModal
              entityType={shareItem.type === "drawing" ? "whiteboard" : shareItem.type === "file" ? "resource" : "note"}
              entityId={shareItem.id}
              title={shareItem.title || "Conteúdo sem título"}
              payload={shareItem}
              onShared={(entity) =>
                updateStudyItem(shareItem.id, {
                  sharedEntityId: entity.id,
                  sharedEntityRevision: Number(entity.revision || 1),
                  sharingRole: "owner",
                  sharingPermission: "owner",
                })
              }
              onClose={() => setShareItem(null)}
            />
          ) : null}
        </div>
      </div>
    </main>
  );
}
