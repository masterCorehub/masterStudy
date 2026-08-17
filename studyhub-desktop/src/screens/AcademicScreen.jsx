import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SCREEN_IDS } from "../app/screenIds";
import { AcademicCalendar } from "../components/AcademicCalendar";
import { Icon } from "../ui/Icon";
import { useStudyStore } from "../store/useStore";
import {
  buildExamPlan,
  calculateAttendance,
  calculateSubjectGrade,
  formatAcademicCitation,
  getAcademicSemesterData,
  getProjectProgress,
  getUpcomingAcademicItems,
  toAcademicDateKey,
} from "../domain/academic";

const TABS = [
  { id: "overview", label: "Visão geral", icon: "space_dashboard" },
  { id: "subjects", label: "Disciplinas", icon: "school" },
  { id: "agenda", label: "Agenda", icon: "calendar_month" },
  { id: "grades", label: "Notas", icon: "monitoring" },
  { id: "attendance", label: "Frequência", icon: "how_to_reg" },
  { id: "exams", label: "Provas", icon: "quiz" },
  { id: "questions", label: "Questões", icon: "psychology_alt" },
  { id: "references", label: "Referências", icon: "library_books" },
];

const COLLECTION_BY_FORM = {
  subject: "subjects",
  event: "events",
  grade: "grades",
  attendance: "attendance",
  exam: "exams",
  project: "projects",
  question: "questions",
  reference: "references",
};

const FORM_TITLES = {
  semester: "Semestre",
  subject: "Disciplina",
  event: "Compromisso acadêmico",
  grade: "Avaliação",
  attendance: "Registro de frequência",
  exam: "Prova",
  project: "Projeto ou trabalho",
  question: "Questão",
  reference: "Referência acadêmica",
};

const SEMESTER_STATUS_OPTIONS = [
  { value: "active", label: "Em andamento" },
  { value: "planned", label: "Planejado" },
  { value: "completed", label: "Concluído" },
];

const semesterStatusLabel = (status) =>
  SEMESTER_STATUS_OPTIONS.find((item) => item.value === status)?.label ||
  "Em andamento";

const DAYS = [
  { value: 1, short: "Seg", label: "Segunda" },
  { value: 2, short: "Ter", label: "Terça" },
  { value: 3, short: "Qua", label: "Quarta" },
  { value: 4, short: "Qui", label: "Quinta" },
  { value: 5, short: "Sex", label: "Sexta" },
  { value: 6, short: "Sáb", label: "Sábado" },
];

const todayKey = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
};

const formatDate = (value, options = {}) => {
  if (!value) return "Sem data";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    ...(options.year ? { year: "numeric" } : {}),
  }).format(date);
};

const clamp = (value, minimum = 0, maximum = 100) =>
  Math.min(maximum, Math.max(minimum, Number(value || 0)));

function Field({ label, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-[color:var(--on-surface-variant)]">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-xl border border-[color:var(--outline-variant)]/45 bg-[color:var(--background)] px-4 py-3 text-sm font-semibold text-[color:var(--on-surface)] outline-none transition-colors placeholder:text-[color:var(--on-surface-variant)]/55 focus:border-[color:var(--primary)]";

function EmptyState({ icon, title, text, action, actionLabel }) {
  return (
    <div className="flex min-h-[190px] flex-col items-center justify-center rounded-[24px] border border-dashed border-[color:var(--outline-variant)]/60 bg-[color:var(--background)] p-7 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[color:var(--primary)]/10 text-[color:var(--primary)]">
        <Icon className="text-[25px]" name={icon} />
      </span>
      <h3 className="mt-4 font-black text-[color:var(--on-surface)]">
        {title}
      </h3>
      <p className="mt-1 max-w-md text-sm leading-6 text-[color:var(--on-surface-variant)]">
        {text}
      </p>
      {action ? (
        <button
          className="mt-4 rounded-xl bg-[color:var(--primary)] px-4 py-2.5 text-sm font-black text-white"
          type="button"
          onClick={action}
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  actionLabel,
  icon = "add",
}) {
  return (
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.17em] text-[color:var(--primary)]">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-2xl font-black text-[color:var(--on-surface)]">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">
            {description}
          </p>
        ) : null}
      </div>
      {action ? (
        <button
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[color:var(--primary)] px-4 py-3 text-sm font-black text-white shadow-lg shadow-violet-500/15"
          type="button"
          onClick={action}
        >
          <Icon className="text-[19px]" name={icon} />
          {actionLabel}
        </button>
      ) : null}
    </header>
  );
}

function ProgressBar({ value, color = "var(--primary)" }) {
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-[color:var(--background)]">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${clamp(value)}%`, backgroundColor: color }}
      />
    </div>
  );
}

function AcademicFormModal({
  modal,
  form,
  setForm,
  subjects,
  courses,
  onClose,
  onSave,
}) {
  if (!modal) return null;
  const set = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  const toggleDay = (day) => {
    const days = form.scheduleDays || [];
    set(
      "scheduleDays",
      days.includes(day) ? days.filter((item) => item !== day) : [...days, day],
    );
  };
  const toggleCourse = (courseId) => {
    const linkedCourseIds = form.linkedCourseIds || [];
    set(
      "linkedCourseIds",
      linkedCourseIds.includes(courseId)
        ? linkedCourseIds.filter((id) => id !== courseId)
        : [...linkedCourseIds, courseId],
    );
  };
  const pickProjectFiles = async () => {
    const selected = await window.studyhubDesktop?.selectFile?.({
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Todos os arquivos", extensions: ["*"] }],
    });
    const paths = Array.isArray(selected)
      ? selected
      : selected
        ? [selected]
        : [];
    if (paths.length)
      set("files", [...new Set([...(form.files || []), ...paths])]);
  };

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={onClose}
    >
      <motion.form
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-[color:var(--outline-variant)]/35 bg-[color:var(--surface)] p-6 shadow-2xl custom-scrollbar"
        initial={{ y: 20, scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 20, scale: 0.98 }}
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={onSave}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.15em] text-[color:var(--primary)]">
              {form.id ? "Editar" : "Adicionar"}
            </p>
            <h2 className="mt-1 text-2xl font-black">{FORM_TITLES[modal]}</h2>
          </div>
          <button
            aria-label="Fechar"
            className="flex h-10 w-10 items-center justify-center rounded-full neo-raised"
            type="button"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {modal === "semester" ? (
            <>
              <Field label="Nome do semestre" className="sm:col-span-2">
                <input
                  required
                  className={inputClass}
                  value={form.name || ""}
                  onChange={(event) => set("name", event.target.value)}
                  placeholder="Ex: 2026.2"
                />
              </Field>
              <Field label="Início">
                <input
                  className={inputClass}
                  type="date"
                  value={form.startDate || ""}
                  onChange={(event) => set("startDate", event.target.value)}
                />
              </Field>
              <Field label="Fim">
                <input
                  className={inputClass}
                  type="date"
                  value={form.endDate || ""}
                  onChange={(event) => set("endDate", event.target.value)}
                />
              </Field>
              <Field label="Situação" className="sm:col-span-2">
                <select
                  className={inputClass}
                  value={form.status || "active"}
                  onChange={(event) => set("status", event.target.value)}
                >
                  {SEMESTER_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          ) : null}

          {modal === "subject" ? (
            <>
              <Field label="Nome" className="sm:col-span-2">
                <input
                  required
                  className={inputClass}
                  value={form.name || ""}
                  onChange={(event) => set("name", event.target.value)}
                  placeholder="Ex: Cálculo I"
                />
              </Field>
              <Field label="Código">
                <input
                  className={inputClass}
                  value={form.code || ""}
                  onChange={(event) => set("code", event.target.value)}
                  placeholder="MAT101"
                />
              </Field>
              <Field label="Professor">
                <input
                  className={inputClass}
                  value={form.professor || ""}
                  onChange={(event) => set("professor", event.target.value)}
                  placeholder="Nome do professor"
                />
              </Field>
              <Field label="Créditos">
                <input
                  className={inputClass}
                  min="0"
                  type="number"
                  value={form.credits || ""}
                  onChange={(event) => set("credits", event.target.value)}
                />
              </Field>
              <Field label="Dificuldade">
                <select
                  className={inputClass}
                  value={form.difficulty || 3}
                  onChange={(event) => set("difficulty", event.target.value)}
                >
                  <option value="1">1 · Muito tranquila</option>
                  <option value="2">2 · Tranquila</option>
                  <option value="3">3 · Moderada</option>
                  <option value="4">4 · Difícil</option>
                  <option value="5">5 · Muito difícil</option>
                </select>
              </Field>
              <Field label="Meta semanal (min)">
                <input
                  className={inputClass}
                  min="0"
                  max="10080"
                  type="number"
                  value={form.weeklyStudyGoalMinutes ?? 120}
                  onChange={(event) =>
                    set("weeklyStudyGoalMinutes", event.target.value)
                  }
                />
              </Field>
              <div className="sm:col-span-2">
                <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-[color:var(--on-surface-variant)]">
                  Hubs de conteúdo vinculados
                </span>
                <div className="grid max-h-40 gap-2 overflow-y-auto rounded-2xl bg-[color:var(--background)] p-3 sm:grid-cols-2 custom-scrollbar">
                  {courses.map((course) => (
                    <label
                      key={course.id}
                      className="flex cursor-pointer items-center gap-3 rounded-xl bg-[color:var(--surface)] p-3 text-sm font-bold"
                    >
                      <input
                        className="rounded text-[color:var(--primary)]"
                        type="checkbox"
                        checked={(form.linkedCourseIds || []).includes(
                          course.id,
                        )}
                        onChange={() => toggleCourse(course.id)}
                      />
                      <span className="min-w-0 truncate">{course.title}</span>
                    </label>
                  ))}
                  {!courses.length ? (
                    <p className="text-sm text-[color:var(--on-surface-variant)]">
                      Nenhum hub criado. Você poderá criar um dentro da matéria.
                    </p>
                  ) : null}
                </div>
              </div>
              <Field label="Média para aprovação">
                <input
                  className={inputClass}
                  min="0"
                  max="10"
                  step="0.1"
                  type="number"
                  value={form.passingGrade ?? 6}
                  onChange={(event) => set("passingGrade", event.target.value)}
                />
              </Field>
              <Field label="Frequência mínima (%)">
                <input
                  className={inputClass}
                  min="0"
                  max="100"
                  type="number"
                  value={form.minimumAttendance ?? 75}
                  onChange={(event) =>
                    set("minimumAttendance", event.target.value)
                  }
                />
              </Field>
              <Field label="Cor">
                <input
                  className="h-12 w-full rounded-xl border border-[color:var(--outline-variant)]/45 bg-[color:var(--background)] p-2"
                  type="color"
                  value={form.color || "#8b5cf6"}
                  onChange={(event) => set("color", event.target.value)}
                />
              </Field>
              <Field label="Sala">
                <input
                  className={inputClass}
                  value={form.room || ""}
                  onChange={(event) => set("room", event.target.value)}
                  placeholder="Bloco / sala"
                />
              </Field>
              <div className="sm:col-span-2">
                <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-[color:var(--on-surface-variant)]">
                  Dias de aula
                </span>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((day) => (
                    <button
                      key={day.value}
                      className={`rounded-xl px-3 py-2 text-xs font-black ${form.scheduleDays?.includes(day.value) ? "bg-[color:var(--primary)] text-white" : "bg-[color:var(--background)] text-[color:var(--on-surface-variant)]"}`}
                      type="button"
                      onClick={() => toggleDay(day.value)}
                    >
                      {day.short}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="Início">
                <input
                  className={inputClass}
                  type="time"
                  value={form.startTime || ""}
                  onChange={(event) => set("startTime", event.target.value)}
                />
              </Field>
              <Field label="Fim">
                <input
                  className={inputClass}
                  type="time"
                  value={form.endTime || ""}
                  onChange={(event) => set("endTime", event.target.value)}
                />
              </Field>
            </>
          ) : null}

          {!["semester", "subject"].includes(modal) ? (
            <Field
              label="Disciplina"
              className={modal === "attendance" ? "sm:col-span-2" : ""}
            >
              <select
                required
                className={inputClass}
                value={form.subjectId || ""}
                onChange={(event) => set("subjectId", event.target.value)}
              >
                <option value="">Selecione</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          {modal === "event" ? (
            <>
              <Field label="Título">
                <input
                  required
                  className={inputClass}
                  value={form.title || ""}
                  onChange={(event) => set("title", event.target.value)}
                />
              </Field>
              <Field label="Tipo">
                <select
                  className={inputClass}
                  value={form.type || "class"}
                  onChange={(event) => set("type", event.target.value)}
                >
                  <option value="class">Aula</option>
                  <option value="exam">Prova</option>
                  <option value="assignment">Trabalho</option>
                  <option value="presentation">Apresentação</option>
                  <option value="meeting">Reunião</option>
                  <option value="other">Outro</option>
                </select>
              </Field>
              <Field label="Data">
                <input
                  required
                  className={inputClass}
                  type="date"
                  value={form.date || ""}
                  onChange={(event) => set("date", event.target.value)}
                />
              </Field>
              <Field label="Horário">
                <input
                  className={inputClass}
                  type="time"
                  value={form.time || ""}
                  onChange={(event) => set("time", event.target.value)}
                />
              </Field>
              <Field label="Local">
                <input
                  className={inputClass}
                  value={form.location || ""}
                  onChange={(event) => set("location", event.target.value)}
                />
              </Field>
              <Field label="Observações">
                <input
                  className={inputClass}
                  value={form.notes || ""}
                  onChange={(event) => set("notes", event.target.value)}
                />
              </Field>
            </>
          ) : null}

          {modal === "grade" ? (
            <>
              <Field label="Avaliação">
                <input
                  required
                  className={inputClass}
                  value={form.title || ""}
                  onChange={(event) => set("title", event.target.value)}
                  placeholder="P1, trabalho..."
                />
              </Field>
              <Field label="Data">
                <input
                  className={inputClass}
                  type="date"
                  value={form.date || ""}
                  onChange={(event) => set("date", event.target.value)}
                />
              </Field>
              <Field label="Nota obtida">
                <input
                  required
                  className={inputClass}
                  min="0"
                  step="0.01"
                  type="number"
                  value={form.score ?? ""}
                  onChange={(event) => set("score", event.target.value)}
                />
              </Field>
              <Field label="Nota máxima">
                <input
                  required
                  className={inputClass}
                  min="0.01"
                  step="0.01"
                  type="number"
                  value={form.maxScore ?? 10}
                  onChange={(event) => set("maxScore", event.target.value)}
                />
              </Field>
              <Field label="Peso (%)" className="sm:col-span-2">
                <input
                  required
                  className={inputClass}
                  min="0"
                  max="100"
                  step="0.1"
                  type="number"
                  value={form.weight ?? ""}
                  onChange={(event) => set("weight", event.target.value)}
                />
              </Field>
            </>
          ) : null}

          {modal === "attendance" ? (
            <>
              <Field label="Data">
                <input
                  required
                  className={inputClass}
                  type="date"
                  value={form.date || todayKey()}
                  onChange={(event) => set("date", event.target.value)}
                />
              </Field>
              <Field label="Situação">
                <select
                  className={inputClass}
                  value={form.status || "present"}
                  onChange={(event) => set("status", event.target.value)}
                >
                  <option value="present">Presente</option>
                  <option value="absent">Falta</option>
                  <option value="late">Atraso</option>
                </select>
              </Field>
              <Field label="Observação" className="sm:col-span-2">
                <input
                  className={inputClass}
                  value={form.notes || ""}
                  onChange={(event) => set("notes", event.target.value)}
                />
              </Field>
            </>
          ) : null}

          {modal === "exam" ? (
            <>
              <Field label="Nome da prova">
                <input
                  required
                  className={inputClass}
                  value={form.title || ""}
                  onChange={(event) => set("title", event.target.value)}
                />
              </Field>
              <Field label="Data">
                <input
                  required
                  className={inputClass}
                  type="date"
                  value={form.date || ""}
                  onChange={(event) => set("date", event.target.value)}
                />
              </Field>
              <Field label="Dias de preparação">
                <input
                  className={inputClass}
                  min="2"
                  max="30"
                  type="number"
                  value={form.studyDays || 5}
                  onChange={(event) => set("studyDays", event.target.value)}
                />
              </Field>
              <Field label="Duração (min)">
                <input
                  className={inputClass}
                  min="0"
                  type="number"
                  value={form.durationMinutes || ""}
                  onChange={(event) =>
                    set("durationMinutes", event.target.value)
                  }
                />
              </Field>
              <Field label="Importância">
                <select
                  className={inputClass}
                  value={form.importance || "high"}
                  onChange={(event) => set("importance", event.target.value)}
                >
                  <option value="medium">Média</option>
                  <option value="high">Alta</option>
                  <option value="critical">Muito alta</option>
                </select>
              </Field>
              <Field label="Dificuldade padrão">
                <select
                  className={inputClass}
                  value={form.difficulty || 3}
                  onChange={(event) => set("difficulty", event.target.value)}
                >
                  <option value="1">1 · Fácil</option>
                  <option value="2">2</option>
                  <option value="3">3 · Moderada</option>
                  <option value="4">4</option>
                  <option value="5">5 · Difícil</option>
                </select>
              </Field>
              <Field
                label="Conteúdo | dificuldade | minutos"
                className="sm:col-span-2"
              >
                <textarea
                  className={`${inputClass} min-h-28 resize-y`}
                  value={form.topicsText || ""}
                  onChange={(event) => set("topicsText", event.target.value)}
                  placeholder="Limites | 3 | 50&#10;Derivadas | 5 | 100&#10;Integrais | 4 | 80"
                />
              </Field>
            </>
          ) : null}

          {modal === "project" ? (
            <>
              <Field label="Título">
                <input
                  required
                  className={inputClass}
                  value={form.title || ""}
                  onChange={(event) => set("title", event.target.value)}
                />
              </Field>
              <Field label="Prazo">
                <input
                  required
                  className={inputClass}
                  type="date"
                  value={form.dueDate || ""}
                  onChange={(event) => set("dueDate", event.target.value)}
                />
              </Field>
              <Field label="Situação">
                <select
                  className={inputClass}
                  value={form.status || "planning"}
                  onChange={(event) => set("status", event.target.value)}
                >
                  <option value="planning">Planejamento</option>
                  <option value="in_progress">Em andamento</option>
                  <option value="review">Revisão</option>
                  <option value="completed">Concluído</option>
                </select>
              </Field>
              <Field label="Integrantes">
                <input
                  className={inputClass}
                  value={form.membersText || ""}
                  onChange={(event) => set("membersText", event.target.value)}
                  placeholder="Ana, Bruno..."
                />
              </Field>
              <Field label="Descrição" className="sm:col-span-2">
                <textarea
                  className={`${inputClass} min-h-24 resize-y`}
                  value={form.description || ""}
                  onChange={(event) => set("description", event.target.value)}
                />
              </Field>
              <Field
                label="Etapas — use Etapa | Responsável"
                className="sm:col-span-2"
              >
                <textarea
                  className={`${inputClass} min-h-24 resize-y`}
                  value={form.subtasksText || ""}
                  onChange={(event) => set("subtasksText", event.target.value)}
                  placeholder="Pesquisar fontes | Ana&#10;Montar apresentação | Bruno"
                />
              </Field>
              <Field label="Links (um por linha)" className="sm:col-span-2">
                <textarea
                  className={`${inputClass} min-h-20 resize-y`}
                  value={form.linksText || ""}
                  onChange={(event) => set("linksText", event.target.value)}
                />
              </Field>
              <div className="sm:col-span-2 rounded-2xl border border-[color:var(--outline-variant)]/40 bg-[color:var(--background)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[.12em] text-[color:var(--on-surface-variant)]">
                      Arquivos anexados
                    </p>
                    <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">
                      PDFs, documentos, planilhas ou apresentações.
                    </p>
                  </div>
                  <button
                    className="rounded-xl bg-[color:var(--primary)] px-3 py-2 text-xs font-black text-white"
                    type="button"
                    onClick={pickProjectFiles}
                  >
                    Selecionar
                  </button>
                </div>
                {form.files?.length ? (
                  <div className="mt-3 space-y-2">
                    {form.files.map((filePath) => (
                      <div
                        key={filePath}
                        className="flex items-center gap-2 rounded-xl bg-[color:var(--surface)] px-3 py-2"
                      >
                        <Icon
                          className="text-[18px] text-[color:var(--primary)]"
                          name="draft"
                        />
                        <span className="min-w-0 flex-1 truncate text-xs font-bold">
                          {filePath.split(/[\\/]/).pop()}
                        </span>
                        <button
                          className="text-[color:var(--error)]"
                          type="button"
                          onClick={() =>
                            set(
                              "files",
                              form.files.filter((item) => item !== filePath),
                            )
                          }
                        >
                          <Icon className="text-[16px]" name="close" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}

          {modal === "question" ? (
            <>
              <Field label="Assunto">
                <input
                  className={inputClass}
                  value={form.topic || ""}
                  onChange={(event) => set("topic", event.target.value)}
                />
              </Field>
              <Field label="Dificuldade">
                <select
                  className={inputClass}
                  value={form.difficulty || "medium"}
                  onChange={(event) => set("difficulty", event.target.value)}
                >
                  <option value="easy">Fácil</option>
                  <option value="medium">Média</option>
                  <option value="hard">Difícil</option>
                </select>
              </Field>
              <Field label="Pergunta" className="sm:col-span-2">
                <textarea
                  required
                  className={`${inputClass} min-h-28 resize-y`}
                  value={form.prompt || ""}
                  onChange={(event) => set("prompt", event.target.value)}
                />
              </Field>
              <Field label="Resposta esperada" className="sm:col-span-2">
                <textarea
                  required
                  className={`${inputClass} min-h-28 resize-y`}
                  value={form.answer || ""}
                  onChange={(event) => set("answer", event.target.value)}
                />
              </Field>
            </>
          ) : null}

          {modal === "reference" ? (
            <>
              <Field label="Título" className="sm:col-span-2">
                <input
                  required
                  className={inputClass}
                  value={form.title || ""}
                  onChange={(event) => set("title", event.target.value)}
                />
              </Field>
              <Field label="Autores">
                <input
                  className={inputClass}
                  value={form.authors || ""}
                  onChange={(event) => set("authors", event.target.value)}
                />
              </Field>
              <Field label="Ano">
                <input
                  className={inputClass}
                  value={form.year || ""}
                  onChange={(event) => set("year", event.target.value)}
                />
              </Field>
              <Field label="Tipo">
                <select
                  className={inputClass}
                  value={form.type || "article"}
                  onChange={(event) => set("type", event.target.value)}
                >
                  <option value="article">Artigo</option>
                  <option value="book">Livro</option>
                  <option value="website">Site</option>
                  <option value="thesis">Tese</option>
                  <option value="other">Outro</option>
                </select>
              </Field>
              <Field label="Editora / periódico">
                <input
                  className={inputClass}
                  value={form.publisher || ""}
                  onChange={(event) => set("publisher", event.target.value)}
                />
              </Field>
              <Field label="DOI">
                <input
                  className={inputClass}
                  value={form.doi || ""}
                  onChange={(event) => set("doi", event.target.value)}
                />
              </Field>
              <Field label="URL">
                <input
                  className={inputClass}
                  type="url"
                  value={form.url || ""}
                  onChange={(event) => set("url", event.target.value)}
                />
              </Field>
              <Field label="Tags">
                <input
                  className={inputClass}
                  value={form.tagsText || ""}
                  onChange={(event) => set("tagsText", event.target.value)}
                  placeholder="pesquisa, metodologia"
                />
              </Field>
              <Field label="Observações" className="sm:col-span-2">
                <textarea
                  className={`${inputClass} min-h-20 resize-y`}
                  value={form.notes || ""}
                  onChange={(event) => set("notes", event.target.value)}
                />
              </Field>
            </>
          ) : null}
        </div>

        <div className="mt-7 flex justify-end gap-3 border-t border-[color:var(--outline-variant)]/30 pt-5">
          <button
            className="rounded-xl px-4 py-3 text-sm font-black text-[color:var(--on-surface-variant)] neo-raised"
            type="button"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            className="rounded-xl bg-[color:var(--primary)] px-5 py-3 text-sm font-black text-white"
            type="submit"
          >
            Salvar
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
}

export function AcademicScreen({ onNavigate }) {
  const academicState = useStudyStore((state) => state.academic);
  const academic = useMemo(
    () => getAcademicSemesterData(academicState),
    [academicState],
  );
  const courses = useStudyStore((state) => state.courses || []);
  const tasks = useStudyStore((state) => state.tasks?.list || []);
  const addSemester = useStudyStore((state) => state.addAcademicSemester);
  const setActiveSemester = useStudyStore(
    (state) => state.setActiveAcademicSemester,
  );
  const updateSemester = useStudyStore((state) => state.updateAcademicSemester);
  const addEntity = useStudyStore((state) => state.addAcademicEntity);
  const updateEntity = useStudyStore((state) => state.updateAcademicEntity);
  const deleteEntity = useStudyStore((state) => state.deleteAcademicEntity);
  const addTask = useStudyStore((state) => state.addTask);
  const updateTask = useStudyStore((state) => state.updateTask);
  const flashcardDecks = useStudyStore((state) => state.flashcardDecks || []);
  const addFlashcardDeck = useStudyStore((state) => state.addFlashcardDeck);
  const addFlashcard = useStudyStore((state) => state.addFlashcard);
  const setActiveAcademicSubject = useStudyStore(
    (state) => state.setActiveAcademicSubject,
  );
  const setActiveTask = useStudyStore((state) => state.setActiveTask);
  const [tab, setTab] = useState("overview");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [citationStyle, setCitationStyle] = useState("abnt");
  const [practiceQuestionId, setPracticeQuestionId] = useState(null);
  const [showPracticeAnswer, setShowPracticeAnswer] = useState(false);
  const [practiceStartedAt, setPracticeStartedAt] = useState(null);
  const [practiceElapsed, setPracticeElapsed] = useState(0);
  const [gradeSimulations, setGradeSimulations] = useState({});

  useEffect(() => {
    if (!practiceQuestionId || !practiceStartedAt) return undefined;
    const updateElapsed = () =>
      setPracticeElapsed(Math.floor((Date.now() - practiceStartedAt) / 1000));
    updateElapsed();
    const interval = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(interval);
  }, [practiceQuestionId, practiceStartedAt]);

  useEffect(() => {
    setPracticeQuestionId(null);
    setShowPracticeAnswer(false);
    setPracticeStartedAt(null);
    setModal(null);
    setForm({});
  }, [academic.activeSemesterId]);

  const subjectsById = useMemo(
    () =>
      Object.fromEntries(
        academic.subjects.map((subject) => [subject.id, subject]),
      ),
    [academic.subjects],
  );
  const academicTasks = useMemo(() => {
    const subjectIds = new Set(academic.subjects.map((subject) => subject.id));
    return tasks.filter(
      (task) =>
        task.academicSemesterId === academic.activeSemesterId ||
        (!task.academicSemesterId && subjectIds.has(task.subjectId)),
    );
  }, [academic.activeSemesterId, academic.subjects, tasks]);
  const upcoming = useMemo(
    () => getUpcomingAcademicItems(academic, academicTasks).slice(0, 12),
    [academic, academicTasks],
  );
  const gradeSummaries = useMemo(
    () =>
      academic.subjects.map((subject) => ({
        subject,
        ...calculateSubjectGrade(academic.grades, subject),
      })),
    [academic.grades, academic.subjects],
  );
  const attendanceSummaries = useMemo(
    () =>
      academic.subjects.map((subject) => ({
        subject,
        ...calculateAttendance(academic.attendance, subject),
      })),
    [academic.attendance, academic.subjects],
  );

  const subjectName = (id) => subjectsById[id]?.name || "Sem disciplina";
  const subjectColor = (id) => subjectsById[id]?.color || "#8b5cf6";

  const openForm = (type, entity = {}) => {
    const prepared = { ...entity };
    if (type === "semester") prepared.status ||= "active";
    if (type === "subject") {
      prepared.linkedCourseIds = [
        ...new Set([
          ...(entity.linkedCourseIds || []),
          ...(entity.courseId ? [entity.courseId] : []),
        ]),
      ];
      prepared.scheduleDays = entity.schedule?.days || [];
      prepared.startTime = entity.schedule?.startTime || "";
      prepared.endTime = entity.schedule?.endTime || "";
      prepared.room = entity.room || entity.schedule?.room || "";
      prepared.color ||= "#8b5cf6";
      prepared.passingGrade ??= 6;
      prepared.minimumAttendance ??= 75;
      prepared.difficulty ??= 3;
      prepared.weeklyStudyGoalMinutes ??= 120;
    }
    if (type === "attendance") prepared.date ||= todayKey();
    if (type === "exam") {
      prepared.studyDays ||= 5;
      prepared.difficulty ??= 3;
      prepared.importance ||= "high";
      prepared.topicsText = (entity.topics || [])
        .map((topic) =>
          typeof topic === "string"
            ? topic
            : `${topic.title}${topic.difficulty ? ` | ${topic.difficulty}` : ""}${topic.estimatedMinutes ? ` | ${topic.estimatedMinutes}` : ""}`,
        )
        .join("\n");
    }
    if (type === "project") {
      prepared.membersText = (entity.members || []).join(", ");
      prepared.subtasksText = (entity.subtasks || [])
        .map(
          (item) =>
            `${item.title}${item.assignee ? ` | ${item.assignee}` : ""}`,
        )
        .join("\n");
      prepared.linksText = (entity.links || []).join("\n");
    }
    if (type === "reference")
      prepared.tagsText = (entity.tags || []).join(", ");
    setForm(prepared);
    setModal(type);
  };

  const closeForm = () => {
    setModal(null);
    setForm({});
  };

  const openCalendarItem = (event) => {
    if (!event) return;
    if (event.subjectId) setActiveAcademicSubject(event.subjectId);

    if (event.source === "task") {
      if (event.original?.id) setActiveTask(event.original.id);
      onNavigate?.(SCREEN_IDS.TASK_DETAILS);
      return;
    }
    if (event.source === "note" || event.type === "note" || event.type === "class_note" || event.noteId) {
      const noteId = event.original?.id || event.sourceId || event.noteId || event.id;
      if (noteId) {
        setActiveNote(noteId);
        onNavigate?.(SCREEN_IDS.NOTE_EDITOR);
        return;
      }
    }
    if (event.source === "review") {
      onNavigate?.(SCREEN_IDS.FLASHCARDS);
      return;
    }
    if (event.source === "class") {
      setTab("subjects");
      return;
    }

    const formBySource = {
      exam: "exam",
      project: "project",
      event: "event",
    };
    const formType = formBySource[event.source];
    if (formType && event.original) {
      openForm(formType, event.original);
      return;
    }
    setTab(event.source === "study-session" ? "overview" : "agenda");
  };

  const moveCalendarItem = (event, date) => {
    if (!event?.original?.id || !date) return;
    // Normalize date to canonical YYYY-MM-DD key before persisting
    const normalizedDate = typeof date === "string" ? date : toAcademicDateKey(date);

    if (event.source === "task") {
      updateTask(event.original.id, { dueDate: normalizedDate });
      return;
    }
    const sourceConfig = {
      event: ["events", "date"],
      exam: ["exams", "date"],
      project: ["projects", "dueDate"],
      "study-session": ["studySessions", "date"],
    };
    const config = sourceConfig[event.source];
    if (!config) return;
    updateEntity(config[0], event.original.id, { [config[1]]: normalizedDate });
  };

  const saveForm = (event) => {
    event.preventDefault();
    if (modal === "semester") {
      const payload = {
        ...form,
        name: String(form.name || "").trim(),
        startDate: form.startDate || "",
        endDate: form.endDate || "",
        status: form.status || "active",
      };
      if (
        payload.startDate &&
        payload.endDate &&
        payload.endDate < payload.startDate
      ) {
        window.alert(
          "A data final do semestre deve ser posterior à data inicial.",
        );
        return;
      }
      if (payload.id) updateSemester(payload.id, payload);
      else addSemester(payload);
      closeForm();
      return;
    }
    const collection = COLLECTION_BY_FORM[modal];
    if (!collection) return;
    let payload = { ...form };

    if (modal === "subject") {
      payload = {
        ...payload,
        credits: Number(payload.credits || 0),
        difficulty: Number(payload.difficulty || 3),
        weeklyStudyGoalMinutes: Number(payload.weeklyStudyGoalMinutes || 120),
        linkedCourseIds: payload.linkedCourseIds || [],
        courseId: payload.linkedCourseIds?.[0] || null,
        passingGrade: Number(payload.passingGrade || 6),
        minimumAttendance: Number(payload.minimumAttendance || 75),
        schedule: {
          days: payload.scheduleDays || [],
          startTime: payload.startTime || "",
          endTime: payload.endTime || "",
          room: payload.room || "",
        },
      };
      delete payload.scheduleDays;
      delete payload.startTime;
      delete payload.endTime;
    }
    if (modal === "grade") {
      payload = {
        ...payload,
        score: Number(payload.score),
        maxScore: Number(payload.maxScore),
        weight: Number(payload.weight),
      };
      const usedWeight = academic.grades
        .filter(
          (grade) =>
            grade.subjectId === payload.subjectId && grade.id !== payload.id,
        )
        .reduce((total, grade) => total + Number(grade.weight || 0), 0);
      if (usedWeight + payload.weight > 100) {
        window.alert(
          `Os pesos dessa disciplina ultrapassariam 100%. Restam ${Math.max(0, 100 - usedWeight)}%.`,
        );
        return;
      }
    }
    if (modal === "exam") {
      payload = {
        ...payload,
        studyDays: Number(payload.studyDays || 5),
        durationMinutes: Number(payload.durationMinutes || 0),
        difficulty: Number(payload.difficulty || 3),
        topics: String(payload.topicsText || "")
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean)
          .map((line, index) => {
            const [title, difficulty, estimatedMinutes] = line
              .split("|")
              .map((item) => item.trim());
            return {
              id: `topic-${index}-${title}`,
              title,
              difficulty: Math.min(
                5,
                Math.max(1, Number(difficulty || payload.difficulty || 3)),
              ),
              estimatedMinutes: Math.max(15, Number(estimatedMinutes || 50)),
            };
          }),
      };
      delete payload.topicsText;
    }
    if (modal === "project") {
      const existingCompleted = Object.fromEntries(
        (form.subtasks || []).map((item) => [item.title, item.completed]),
      );
      payload = {
        ...payload,
        members: String(payload.membersText || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        subtasks: String(payload.subtasksText || "")
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean)
          .map((line, index) => {
            const [rawTitle, rawAssignee] = line.split("|");
            const title = rawTitle.trim();
            return {
              id: `subtask-${index}-${title}`,
              title,
              assignee: rawAssignee?.trim() || "",
              completed: Boolean(existingCompleted[title]),
            };
          }),
        links: String(payload.linksText || "")
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean),
      };
      delete payload.membersText;
      delete payload.subtasksText;
      delete payload.linksText;
    }
    if (modal === "question")
      payload = {
        ...payload,
        attempts: Number(payload.attempts || 0),
        correct: Number(payload.correct || 0),
      };
    if (modal === "reference") {
      payload = {
        ...payload,
        tags: String(payload.tagsText || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      };
      delete payload.tagsText;
    }

    if (payload.id) updateEntity(collection, payload.id, payload);
    else addEntity(collection, payload);
    closeForm();
  };

  const remove = (collection, entity) => {
    const verb = collection === "subjects" ? "Arquivar" : "Excluir";
    if (
      window.confirm(
        `${verb} “${entity.name || entity.title || "este registro"}”?`,
      )
    )
      deleteEntity(collection, entity.id);
  };

  const generatePlan = (exam) => {
    const plan = buildExamPlan(exam);
    updateEntity("exams", exam.id, { plan });
    const existingIds = new Set(tasks.map((task) => task.academicPlanId));
    plan.forEach((item) => {
      if (existingIds.has(item.id)) return;
      addTask({
        title: item.title,
        description: `Plano de preparação para ${exam.title}`,
        dueDate: item.date,
        priority: item.kind === "mock" ? "high" : "medium",
        type: "exam",
        subjectId: exam.subjectId,
        academicSemesterId: academic.activeSemesterId,
        academicExamId: exam.id,
        academicPlanId: item.id,
        estimatedPomodoros: item.kind === "mock" ? 2 : 1,
      });
    });
  };

  const togglePlanItem = (exam, itemId) => {
    updateEntity("exams", exam.id, {
      plan: (exam.plan || []).map((item) =>
        item.id === itemId ? { ...item, completed: !item.completed } : item,
      ),
    });
  };

  const toggleProjectSubtask = (project, subtaskId) => {
    updateEntity("projects", project.id, {
      subtasks: (project.subtasks || []).map((item) =>
        item.id === subtaskId ? { ...item, completed: !item.completed } : item,
      ),
    });
  };

  const startPractice = () => {
    if (!academic.questions.length) return;
    const candidates = academic.questions.filter(
      (question) => question.id !== practiceQuestionId,
    );
    const pool = candidates.length ? candidates : academic.questions;
    setPracticeQuestionId(pool[Math.floor(Math.random() * pool.length)].id);
    setShowPracticeAnswer(false);
    setPracticeStartedAt(Date.now());
    setPracticeElapsed(0);
  };

  const answerPractice = (wasCorrect) => {
    const question = academic.questions.find(
      (item) => item.id === practiceQuestionId,
    );
    if (!question) return;
    updateEntity("questions", question.id, {
      attempts: Number(question.attempts || 0) + 1,
      correct: Number(question.correct || 0) + (wasCorrect ? 1 : 0),
      lastReviewedAt: Date.now(),
    });
    startPractice();
  };

  const createFlashcardFromQuestion = (question) => {
    let deck = flashcardDecks.find(
      (item) =>
        item.academicSubjectId === question.subjectId &&
        item.sourceKind === "academic-questions",
    );
    if (!deck) {
      const deckId = `deck-academic-${question.subjectId}-${Date.now()}`;
      addFlashcardDeck({
        id: deckId,
        title: `Questões · ${subjectName(question.subjectId)}`,
        deckTitle: `Questões · ${subjectName(question.subjectId)}`,
        category: "Faculdade",
        description:
          "Questões convertidas em flashcards pela Central Acadêmica.",
        academicSubjectId: question.subjectId,
        academicSemesterId: academic.activeSemesterId,
        sourceKind: "academic-questions",
      });
      deck = { id: deckId };
    }
    addFlashcard(deck.id, {
      front: question.prompt,
      back: question.answer,
      academicQuestionId: question.id,
      academicSemesterId: academic.activeSemesterId,
    });
    updateEntity("questions", question.id, {
      convertedToFlashcardAt: Date.now(),
    });
  };

  const openExternal = (url) => {
    if (!url) return;
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    if (window.studyhubDesktop?.openExternal)
      window.studyhubDesktop.openExternal(normalized);
    else window.open(normalized, "_blank", "noopener,noreferrer");
  };

  const renderOverview = () => {
    const riskSubjects = attendanceSummaries.filter(
      (summary) => summary.atRisk,
    );
    const openProjects = academic.projects.filter(
      (project) => project.status !== "completed",
    );
    return (
      <div className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Disciplinas",
              value: academic.subjects.length,
              icon: "school",
              color: "var(--primary)",
              tab: "subjects",
            },
            {
              label: "Próximos 14 dias",
              value: upcoming.length,
              icon: "event_upcoming",
              color: "var(--tertiary)",
              tab: "agenda",
            },
            {
              label: "Frequência em risco",
              value: riskSubjects.length,
              icon: "warning",
              color: "var(--error)",
              tab: "attendance",
            },
            {
              label: "Projetos abertos",
              value: openProjects.length,
              icon: "assignment",
              color: "var(--secondary)",
              tab: "projects",
            },
          ].map((item) => (
            <button
              key={item.label}
              className="rounded-[24px] p-5 text-left neo-raised"
              type="button"
              onClick={() => setTab(item.tab)}
            >
              <span className="flex items-center justify-between">
                <Icon
                  className="text-[26px]"
                  name={item.icon}
                  style={{ color: item.color }}
                />
                <span className="text-3xl font-black">{item.value}</span>
              </span>
              <span className="mt-4 block text-sm font-bold text-[color:var(--on-surface-variant)]">
                {item.label}
              </span>
            </button>
          ))}
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
          <article className="rounded-[28px] p-6 neo-raised">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[.15em] text-[color:var(--primary)]">
                  Linha do tempo
                </p>
                <h2 className="mt-1 text-xl font-black">O que vem a seguir</h2>
              </div>
              <button
                className="text-xs font-black text-[color:var(--primary)]"
                type="button"
                onClick={() => setTab("agenda")}
              >
                Abrir agenda
              </button>
            </div>
            <div className="mt-5 space-y-2">
              {upcoming.slice(0, 6).map((item) => (
                <div
                  key={`${item.source}-${item.id}`}
                  className="flex items-center gap-3 rounded-2xl p-3 neo-inset"
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
                    style={{ backgroundColor: subjectColor(item.subjectId) }}
                  >
                    <Icon
                      className="text-[19px]"
                      name={
                        item.type === "exam"
                          ? "quiz"
                          : item.type === "project"
                            ? "assignment"
                            : "event"
                      }
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-black">
                      {item.title}
                    </span>
                    <span className="block truncate text-xs text-[color:var(--on-surface-variant)]">
                      {subjectName(item.subjectId)}
                    </span>
                  </span>
                  <span className="text-xs font-black text-[color:var(--primary)]">
                    {formatDate(item.date)}
                  </span>
                </div>
              ))}
              {!upcoming.length ? (
                <p className="rounded-2xl p-6 text-center text-sm text-[color:var(--on-surface-variant)] neo-inset">
                  Nenhum prazo nos próximos 14 dias.
                </p>
              ) : null}
            </div>
          </article>

          <article className="rounded-[28px] p-6 neo-raised">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[.15em] text-[color:var(--tertiary)]">
                  Desempenho
                </p>
                <h2 className="mt-1 text-xl font-black">
                  Resumo por disciplina
                </h2>
              </div>
              <button
                className="text-xs font-black text-[color:var(--primary)]"
                type="button"
                onClick={() => setTab("grades")}
              >
                Ver notas
              </button>
            </div>
            <div className="mt-5 space-y-4">
              {gradeSummaries.slice(0, 5).map((summary) => {
                const attendance = attendanceSummaries.find(
                  (item) => item.subject.id === summary.subject.id,
                );
                return (
                  <div key={summary.subject.id}>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-black">{summary.subject.name}</span>
                      <span className="font-bold text-[color:var(--on-surface-variant)]">
                        Média {summary.currentAverage.toFixed(1)} ·{" "}
                        {attendance.attendanceRate.toFixed(0)}% presença
                      </span>
                    </div>
                    <ProgressBar
                      value={summary.currentAverage * 10}
                      color={summary.subject.color}
                    />
                  </div>
                );
              })}
              {!gradeSummaries.length ? (
                <EmptyState
                  icon="school"
                  title="Cadastre suas disciplinas"
                  text="Elas organizam notas, frequência, provas e trabalhos."
                  action={() => openForm("subject")}
                  actionLabel="Adicionar disciplina"
                />
              ) : null}
            </div>
          </article>
        </section>
      </div>
    );
  };

  const openSubject = (subjectId) => {
    setActiveAcademicSubject(subjectId);
    onNavigate?.(SCREEN_IDS.ACADEMIC_SUBJECT);
  };

  const renderSubjects = () => (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Semestre"
        title="Matérias"
        description="Abra uma matéria para reunir aulas, notas, arquivos, tarefas, desempenho e plano de estudo."
        action={() => openForm("subject")}
        actionLabel="Nova matéria"
      />
      {academic.subjects.length ? (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {academic.subjects.map((subject) => {
            const grade = calculateSubjectGrade(academic.grades, subject);
            const attendance = calculateAttendance(
              academic.attendance,
              subject,
            );
            return (
              <article
                key={subject.id}
                className="group overflow-hidden rounded-[26px] neo-raised"
              >
                <div
                  className="h-2"
                  style={{ backgroundColor: subject.color }}
                />
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <button
                      className="min-w-0 flex-1 text-left"
                      type="button"
                      onClick={() => openSubject(subject.id)}
                    >
                      <p
                        className="text-xs font-black uppercase tracking-wide"
                        style={{ color: subject.color }}
                      >
                        {subject.code || "Matéria"}
                      </p>
                      <h3 className="mt-1 truncate text-xl font-black">
                        {subject.name}
                      </h3>
                      <p className="mt-1 truncate text-sm text-[color:var(--on-surface-variant)]">
                        {subject.professor || "Professor não informado"}
                      </p>
                    </button>
                    <div className="flex gap-1">
                      <button
                        className="rounded-lg p-2 text-[color:var(--primary)] hover:bg-[color:var(--primary)]/10"
                        type="button"
                        onClick={() => openForm("subject", subject)}
                        title="Editar matéria"
                      >
                        <Icon className="text-[18px]" name="edit" />
                      </button>
                      <button
                        className="rounded-lg p-2 text-[color:var(--error)] hover:bg-[color:var(--error)]/10"
                        type="button"
                        onClick={() => remove("subjects", subject)}
                        title="Arquivar matéria"
                      >
                        <Icon className="text-[18px]" name="archive" />
                      </button>
                    </div>
                  </div>
                  <button
                    className="mt-5 block w-full text-left"
                    type="button"
                    onClick={() => openSubject(subject.id)}
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl p-3 neo-inset">
                        <p className="text-xs text-[color:var(--on-surface-variant)]">
                          Média atual
                        </p>
                        <p className="mt-1 text-2xl font-black">
                          {grade.completedWeight
                            ? grade.currentAverage.toFixed(1)
                            : "—"}
                        </p>
                      </div>
                      <div className="rounded-xl p-3 neo-inset">
                        <p className="text-xs text-[color:var(--on-surface-variant)]">
                          Frequência
                        </p>
                        <p
                          className={`mt-1 text-2xl font-black ${attendance.atRisk ? "text-[color:var(--error)]" : "text-[color:var(--tertiary)]"}`}
                        >
                          {attendance.attendanceRate.toFixed(0)}%
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-[color:var(--on-surface-variant)]">
                      {(subject.schedule?.days || []).map((day) => (
                        <span
                          key={day}
                          className="rounded-full bg-[color:var(--background)] px-3 py-1"
                        >
                          {DAYS.find((item) => item.value === day)?.short}{" "}
                          {subject.schedule?.startTime}
                        </span>
                      ))}
                      {subject.room ? (
                        <span className="rounded-full bg-[color:var(--background)] px-3 py-1">
                          {subject.room}
                        </span>
                      ) : null}
                      <span className="rounded-full bg-[color:var(--primary)]/10 px-3 py-1 text-[color:var(--primary)]">
                        {subject.linkedCourseIds?.length || 0} hub(s)
                      </span>
                    </div>
                    <span
                      className="mt-5 flex items-center justify-between border-t border-[color:var(--outline-variant)]/25 pt-4 text-sm font-black"
                      style={{ color: subject.color }}
                    >
                      Abrir matéria{" "}
                      <Icon
                        className="transition-transform group-hover:translate-x-1"
                        name="arrow_forward"
                      />
                    </span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon="school"
          title="Nenhuma matéria"
          text="Cadastre as matérias do semestre para ativar notas, frequência e planejamento."
          action={() => openForm("subject")}
          actionLabel="Adicionar matéria"
        />
      )}
    </div>
  );

  const renderAgenda = () => (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Organização"
        title="Calendário acadêmico"
        description="Aulas recorrentes, provas, entregas, tarefas, revisões e sessões planejadas no mesmo lugar."
        action={() => openForm("event")}
        actionLabel="Novo compromisso"
      />
      <AcademicCalendar
        semesterId={academic.activeSemesterId}
        onEventClick={openCalendarItem}
        onEventMove={moveCalendarItem}
        onAddSubject={() => openForm("subject")}
      />
    </div>
  );

  const renderGrades = () => (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Desempenho"
        title="Notas e médias"
        description="Calcule a média ponderada e descubra quanto precisa nas próximas avaliações."
        action={() => openForm("grade")}
        actionLabel="Adicionar nota"
      />
      {academic.subjects.length ? (
        <div className="space-y-4">
          {academic.subjects.map((subject) => {
            const summary = calculateSubjectGrade(academic.grades, subject);
            const grades = academic.grades.filter(
              (grade) => grade.subjectId === subject.id,
            );
            const neededLabel =
              summary.neededAverage === null
                ? "Sem peso restante"
                : summary.neededAverage > 10
                  ? "Meta indisponível"
                  : `${summary.neededAverage.toFixed(1)} nas próximas`;
            const simulation = gradeSimulations[subject.id] || {
              score:
                summary.neededAverage > 0 && summary.neededAverage <= 10
                  ? summary.neededAverage.toFixed(1)
                  : "7",
              weight: Math.min(30, summary.remainingWeight || 30),
            };
            const currentPoints = grades.reduce(
              (total, grade) =>
                total +
                (Number(grade.score || 0) /
                  Math.max(1, Number(grade.maxScore || 10))) *
                  10 *
                  Number(grade.weight || 0),
              0,
            );
            const simulatedWeight = Math.max(
              0,
              Math.min(summary.remainingWeight, Number(simulation.weight || 0)),
            );
            const simulatedScore = Math.max(
              0,
              Math.min(10, Number(simulation.score || 0)),
            );
            const projectedWeight = summary.completedWeight + simulatedWeight;
            const projectedAverage = projectedWeight
              ? (currentPoints + simulatedScore * simulatedWeight) /
                projectedWeight
              : simulatedScore;
            return (
              <article
                key={subject.id}
                className="rounded-[28px] p-6 neo-raised"
              >
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                  <div>
                    <p
                      className="text-xs font-black uppercase tracking-wide"
                      style={{ color: subject.color }}
                    >
                      {subject.code || "Disciplina"}
                    </p>
                    <h3 className="mt-1 text-xl font-black">{subject.name}</h3>
                  </div>
                  <div className="flex gap-5">
                    <div>
                      <p className="text-xs text-[color:var(--on-surface-variant)]">
                        Média atual
                      </p>
                      <p className="text-3xl font-black">
                        {summary.currentAverage.toFixed(1)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-[color:var(--on-surface-variant)]">
                        Para aprovação
                      </p>
                      <p
                        className={`text-lg font-black ${summary.neededAverage > 10 ? "text-[color:var(--error)]" : "text-[color:var(--tertiary)]"}`}
                      >
                        {neededLabel}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-5">
                  <div className="mb-2 flex justify-between text-xs font-bold text-[color:var(--on-surface-variant)]">
                    <span>{summary.completedWeight}% avaliados</span>
                    <span>{summary.remainingWeight}% restantes</span>
                  </div>
                  <ProgressBar
                    value={summary.completedWeight}
                    color={subject.color}
                  />
                </div>
                <div className="mt-5 rounded-2xl border border-[color:var(--primary)]/20 bg-[color:var(--primary)]/5 p-4">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[.13em] text-[color:var(--primary)]">
                        Simulador de cenário
                      </p>
                      <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">
                        Teste uma próxima nota sem alterar seu histórico.
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-[10px] font-bold text-[color:var(--on-surface-variant)]">
                        Média projetada
                      </p>
                      <p
                        className={`text-3xl font-black ${projectedAverage >= Number(subject.passingGrade || 6) ? "text-[color:var(--tertiary)]" : "text-[color:var(--error)]"}`}
                      >
                        {projectedAverage.toFixed(1)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                    <label className="text-xs font-bold text-[color:var(--on-surface-variant)]">
                      Nota simulada
                      <input
                        type="number"
                        min="0"
                        max="10"
                        step="0.1"
                        value={simulation.score}
                        onChange={(event) =>
                          setGradeSimulations((current) => ({
                            ...current,
                            [subject.id]: {
                              ...simulation,
                              score: event.target.value,
                            },
                          }))
                        }
                        className="mt-1.5 w-full rounded-xl bg-[color:var(--background)] px-3 py-2.5 text-sm font-black outline-none neo-inset"
                      />
                    </label>
                    <label className="text-xs font-bold text-[color:var(--on-surface-variant)]">
                      Peso simulado (%)
                      <input
                        type="number"
                        min="0"
                        max={summary.remainingWeight}
                        step="0.1"
                        value={simulation.weight}
                        onChange={(event) =>
                          setGradeSimulations((current) => ({
                            ...current,
                            [subject.id]: {
                              ...simulation,
                              weight: event.target.value,
                            },
                          }))
                        }
                        className="mt-1.5 w-full rounded-xl bg-[color:var(--background)] px-3 py-2.5 text-sm font-black outline-none neo-inset"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        openForm("grade", {
                          subjectId: subject.id,
                          title: "Nova avaliação",
                          score: simulatedScore,
                          maxScore: 10,
                          weight: simulatedWeight,
                          date: todayKey(),
                        })
                      }
                      className="self-end rounded-xl bg-[color:var(--primary)] px-4 py-2.5 text-xs font-black text-white"
                    >
                      Registrar cenário
                    </button>
                  </div>
                  <p className="mt-3 text-[10px] text-[color:var(--on-surface-variant)]">
                    A projeção considera {projectedWeight.toFixed(0)}% do peso
                    total. Restam{" "}
                    {Math.max(0, 100 - projectedWeight).toFixed(0)}% ainda não
                    simulados.
                  </p>
                </div>
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full min-w-[620px] text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-[color:var(--on-surface-variant)]">
                      <tr>
                        <th className="pb-3">Avaliação</th>
                        <th className="pb-3">Data</th>
                        <th className="pb-3">Nota</th>
                        <th className="pb-3">Peso</th>
                        <th className="pb-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grades.map((grade) => (
                        <tr
                          key={grade.id}
                          className="border-t border-[color:var(--outline-variant)]/25"
                        >
                          <td className="py-3 font-black">{grade.title}</td>
                          <td className="py-3 text-[color:var(--on-surface-variant)]">
                            {formatDate(grade.date)}
                          </td>
                          <td className="py-3 font-black">
                            {grade.score}/{grade.maxScore}
                          </td>
                          <td className="py-3">{grade.weight}%</td>
                          <td className="py-3 text-right">
                            <button
                              className="p-2 text-[color:var(--primary)]"
                              type="button"
                              onClick={() => openForm("grade", grade)}
                            >
                              <Icon className="text-[17px]" name="edit" />
                            </button>
                            <button
                              className="p-2 text-[color:var(--error)]"
                              type="button"
                              onClick={() => remove("grades", grade)}
                            >
                              <Icon className="text-[17px]" name="delete" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!grades.length ? (
                    <p className="rounded-2xl p-5 text-center text-sm text-[color:var(--on-surface-variant)] neo-inset">
                      Nenhuma avaliação registrada.
                    </p>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon="school"
          title="Cadastre uma disciplina primeiro"
          text="As avaliações precisam estar vinculadas a uma matéria."
          action={() => openForm("subject")}
          actionLabel="Adicionar disciplina"
        />
      )}
    </div>
  );

  const renderAttendance = () => (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Presença"
        title="Controle de frequência"
        description="Registre presença, atraso e falta; o StudyHub avisa quando houver risco."
        action={() => openForm("attendance")}
        actionLabel="Registrar aula"
      />
      {academic.subjects.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {academic.subjects.map((subject) => {
            const summary = calculateAttendance(academic.attendance, subject);
            const entries = academic.attendance
              .filter((entry) => entry.subjectId === subject.id)
              .sort((a, b) => String(b.date).localeCompare(String(a.date)));
            return (
              <article
                key={subject.id}
                className={`rounded-[28px] p-6 neo-raised ${summary.atRisk ? "ring-2 ring-[color:var(--error)]/25" : ""}`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p
                      className="text-xs font-black uppercase tracking-wide"
                      style={{ color: subject.color }}
                    >
                      {subject.code || "Disciplina"}
                    </p>
                    <h3 className="mt-1 text-xl font-black">{subject.name}</h3>
                  </div>
                  <p
                    className={`text-3xl font-black ${summary.atRisk ? "text-[color:var(--error)]" : "text-[color:var(--tertiary)]"}`}
                  >
                    {summary.attendanceRate.toFixed(0)}%
                  </p>
                </div>
                <div className="mt-4">
                  <ProgressBar
                    value={summary.attendanceRate}
                    color={summary.atRisk ? "var(--error)" : subject.color}
                  />
                  <div className="mt-2 flex justify-between text-xs text-[color:var(--on-surface-variant)]">
                    <span>
                      {summary.attended} presenças · {summary.absences} faltas ·{" "}
                      {summary.late} atrasos
                    </span>
                    <span>Mínimo {summary.minimum}%</span>
                  </div>
                </div>
                <div className="mt-5 space-y-2">
                  {entries.slice(0, 6).map((entry) => (
                    <div
                      key={entry.id}
                      className="group flex items-center gap-3 rounded-xl px-3 py-2 neo-inset"
                    >
                      <Icon
                        className={
                          entry.status === "absent"
                            ? "text-[color:var(--error)]"
                            : entry.status === "late"
                              ? "text-amber-500"
                              : "text-[color:var(--tertiary)]"
                        }
                        name={
                          entry.status === "absent"
                            ? "cancel"
                            : entry.status === "late"
                              ? "schedule"
                              : "check_circle"
                        }
                      />
                      <span className="flex-1 text-sm font-bold">
                        {formatDate(entry.date, { year: true })}
                      </span>
                      <span className="text-xs text-[color:var(--on-surface-variant)]">
                        {entry.notes}
                      </span>
                      <button
                        className="p-1 text-[color:var(--error)] opacity-0 group-hover:opacity-100"
                        type="button"
                        onClick={() => remove("attendance", entry)}
                      >
                        <Icon className="text-[16px]" name="delete" />
                      </button>
                    </div>
                  ))}
                  {!entries.length ? (
                    <p className="text-sm text-[color:var(--on-surface-variant)]">
                      Nenhuma aula registrada.
                    </p>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon="school"
          title="Cadastre uma disciplina primeiro"
          text="A frequência será calculada separadamente para cada matéria."
          action={() => openForm("subject")}
          actionLabel="Adicionar disciplina"
        />
      )}
    </div>
  );

  const renderExams = () => (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Preparação ativa"
        title="Planejador de provas"
        description="Transforme conteúdos em um cronograma de estudo, revisão e simulado."
        action={() => openForm("exam")}
        actionLabel="Nova prova"
      />
      {academic.exams.length ? (
        <div className="space-y-4">
          {[...academic.exams]
            .sort((a, b) => String(a.date).localeCompare(String(b.date)))
            .map((exam) => {
              const plan = exam.plan || [];
              const completed = plan.filter((item) => item.completed).length;
              return (
                <article
                  key={exam.id}
                  className="rounded-[28px] p-6 neo-raised"
                >
                  <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                    <div>
                      <p
                        className="text-xs font-black uppercase tracking-wide"
                        style={{ color: subjectColor(exam.subjectId) }}
                      >
                        {subjectName(exam.subjectId)}
                      </p>
                      <h3 className="mt-1 text-2xl font-black">{exam.title}</h3>
                      <p className="mt-2 text-sm text-[color:var(--on-surface-variant)]">
                        {formatDate(exam.date, { year: true })}
                        {exam.durationMinutes
                          ? ` · ${exam.durationMinutes} min`
                          : ""}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(exam.topics || []).map((topic) => (
                          <span
                            key={
                              typeof topic === "string" ? topic : topic.title
                            }
                            className="rounded-full bg-[color:var(--background)] px-3 py-1 text-xs font-bold text-[color:var(--on-surface-variant)]"
                          >
                            {typeof topic === "string" ? topic : topic.title}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="rounded-xl bg-[color:var(--primary)] px-4 py-2.5 text-xs font-black text-white"
                        type="button"
                        onClick={() => generatePlan(exam)}
                      >
                        {plan.length ? "Regenerar plano" : "Gerar plano"}
                      </button>
                      <button
                        className="rounded-xl p-2.5 text-[color:var(--primary)] neo-raised"
                        type="button"
                        onClick={() => openForm("exam", exam)}
                      >
                        <Icon className="text-[18px]" name="edit" />
                      </button>
                      <button
                        className="rounded-xl p-2.5 text-[color:var(--error)] neo-raised"
                        type="button"
                        onClick={() => remove("exams", exam)}
                      >
                        <Icon className="text-[18px]" name="delete" />
                      </button>
                    </div>
                  </div>
                  {plan.length ? (
                    <div className="mt-6">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="font-black">Plano de preparação</p>
                        <span className="text-xs font-black text-[color:var(--primary)]">
                          {completed}/{plan.length} concluídos
                        </span>
                      </div>
                      <ProgressBar
                        value={
                          plan.length ? (completed / plan.length) * 100 : 0
                        }
                        color={subjectColor(exam.subjectId)}
                      />
                      <div className="mt-4 grid gap-2 md:grid-cols-2">
                        {plan.map((item) => (
                          <button
                            key={item.id}
                            className={`flex items-center gap-3 rounded-2xl p-3 text-left ${item.completed ? "bg-[color:var(--tertiary)]/10" : "neo-inset"}`}
                            type="button"
                            onClick={() => togglePlanItem(exam, item.id)}
                          >
                            <Icon
                              className={
                                item.completed
                                  ? "text-[color:var(--tertiary)]"
                                  : "text-[color:var(--primary)]"
                              }
                              name={
                                item.completed
                                  ? "check_circle"
                                  : item.kind === "mock"
                                    ? "quiz"
                                    : "menu_book"
                              }
                            />
                            <span className="min-w-0 flex-1">
                              <span
                                className={`block truncate text-sm font-black ${item.completed ? "line-through opacity-65" : ""}`}
                              >
                                {item.title}
                              </span>
                              <span className="block text-xs text-[color:var(--on-surface-variant)]">
                                {formatDate(item.date)}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
        </div>
      ) : (
        <EmptyState
          icon="quiz"
          title="Nenhuma prova planejada"
          text="Cadastre uma prova e gere automaticamente um plano de cinco dias."
          action={() => openForm("exam")}
          actionLabel="Adicionar prova"
        />
      )}
    </div>
  );

  const renderProjects = () => (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Entregas"
        title="Trabalhos e projetos"
        description="Divida entregas grandes em etapas, acompanhe o grupo e mantenha links juntos."
        action={() => openForm("project")}
        actionLabel="Novo projeto"
      />
      {academic.projects.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {academic.projects.map((project) => {
            const progress = getProjectProgress(project);
            return (
              <article
                key={project.id}
                className="rounded-[28px] p-6 neo-raised"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p
                      className="text-xs font-black uppercase tracking-wide"
                      style={{ color: subjectColor(project.subjectId) }}
                    >
                      {subjectName(project.subjectId)}
                    </p>
                    <h3 className="mt-1 text-xl font-black">{project.title}</h3>
                    <p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">
                      Entrega {formatDate(project.dueDate, { year: true })}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      className="p-2 text-[color:var(--primary)]"
                      type="button"
                      onClick={() => openForm("project", project)}
                    >
                      <Icon className="text-[18px]" name="edit" />
                    </button>
                    <button
                      className="p-2 text-[color:var(--error)]"
                      type="button"
                      onClick={() => remove("projects", project)}
                    >
                      <Icon className="text-[18px]" name="delete" />
                    </button>
                  </div>
                </div>
                {project.description ? (
                  <p className="mt-4 text-sm leading-6 text-[color:var(--on-surface-variant)]">
                    {project.description}
                  </p>
                ) : null}
                <div className="mt-5">
                  <div className="mb-2 flex justify-between text-xs font-black">
                    <span>Progresso</span>
                    <span>{progress}%</span>
                  </div>
                  <ProgressBar
                    value={progress}
                    color={subjectColor(project.subjectId)}
                  />
                </div>
                <div className="mt-5 space-y-2">
                  {(project.subtasks || []).map((item) => (
                    <button
                      key={item.id}
                      className="flex w-full items-center gap-3 rounded-xl p-3 text-left neo-inset"
                      type="button"
                      onClick={() => toggleProjectSubtask(project, item.id)}
                    >
                      <Icon
                        className={
                          item.completed
                            ? "text-[color:var(--tertiary)]"
                            : "text-[color:var(--outline)]"
                        }
                        name={
                          item.completed
                            ? "check_box"
                            : "check_box_outline_blank"
                        }
                      />
                      <span
                        className={`min-w-0 flex-1 text-sm font-bold ${item.completed ? "line-through opacity-60" : ""}`}
                      >
                        {item.title}
                      </span>
                      {item.assignee ? (
                        <span className="rounded-full bg-[color:var(--surface)] px-2 py-1 text-[10px] font-black text-[color:var(--primary)]">
                          {item.assignee}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
                {project.members?.length ? (
                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    <Icon
                      className="text-[18px] text-[color:var(--primary)]"
                      name="group"
                    />
                    {project.members.map((member) => (
                      <span
                        key={member}
                        className="rounded-full bg-[color:var(--background)] px-3 py-1 text-xs font-bold"
                      >
                        {member}
                      </span>
                    ))}
                  </div>
                ) : null}
                {project.links?.length ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {project.links.map((link) => (
                      <button
                        key={link}
                        className="inline-flex items-center gap-1 rounded-full bg-[color:var(--primary)]/10 px-3 py-1.5 text-xs font-black text-[color:var(--primary)]"
                        type="button"
                        onClick={() => openExternal(link)}
                      >
                        <Icon className="text-[15px]" name="link" />
                        Abrir link
                      </button>
                    ))}
                  </div>
                ) : null}
                {project.files?.length ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {project.files.map((filePath) => (
                      <button
                        key={filePath}
                        className="inline-flex max-w-[220px] items-center gap-1 rounded-full bg-[color:var(--background)] px-3 py-1.5 text-xs font-black text-[color:var(--on-surface-variant)]"
                        type="button"
                        onClick={() =>
                          window.studyhubDesktop?.openPath?.(filePath)
                        }
                        title={filePath}
                      >
                        <Icon
                          className="text-[15px] text-[color:var(--primary)]"
                          name="draft"
                        />
                        <span className="truncate">
                          {filePath.split(/[\\/]/).pop()}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon="assignment"
          title="Nenhum projeto"
          text="Crie trabalhos, seminários e projetos com etapas e prazo de entrega."
          action={() => openForm("project")}
          actionLabel="Adicionar projeto"
        />
      )}
    </div>
  );

  const renderQuestions = () => {
    const practiceQuestion = academic.questions.find(
      (question) => question.id === practiceQuestionId,
    );
    return (
      <div className="space-y-6">
        <SectionHeader
          eyebrow="Recuperação ativa"
          title="Banco de questões"
          description="Pratique sem consultar a resposta e acompanhe seus acertos por assunto."
          action={() => openForm("question")}
          actionLabel="Nova questão"
        />
        {practiceQuestion ? (
          <article className="rounded-[30px] bg-[color:var(--primary)] p-7 text-white shadow-xl shadow-violet-500/20">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[.16em] text-white/65">
                  Prática · {subjectName(practiceQuestion.subjectId)}
                </p>
                <p className="mt-1 text-sm text-white/75">
                  {practiceQuestion.topic || "Revisão geral"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-white/15 px-3 py-1.5 font-mono text-sm font-black">
                  {String(Math.floor(practiceElapsed / 60)).padStart(2, "0")}:
                  {String(practiceElapsed % 60).padStart(2, "0")}
                </span>
                <button
                  className="rounded-full bg-white/15 p-2"
                  type="button"
                  onClick={() => {
                    setPracticeQuestionId(null);
                    setShowPracticeAnswer(false);
                    setPracticeStartedAt(null);
                  }}
                >
                  <Icon name="close" />
                </button>
              </div>
            </div>
            <h3 className="mt-6 text-2xl font-black leading-9">
              {practiceQuestion.prompt}
            </h3>
            {showPracticeAnswer ? (
              <div className="mt-6 rounded-2xl bg-white/12 p-5">
                <p className="text-xs font-black uppercase tracking-wide text-white/65">
                  Resposta esperada
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-7">
                  {practiceQuestion.answer}
                </p>
              </div>
            ) : null}
            <div className="mt-6 flex flex-wrap gap-3">
              {!showPracticeAnswer ? (
                <button
                  className="rounded-xl bg-white px-5 py-3 text-sm font-black text-[color:var(--primary)]"
                  type="button"
                  onClick={() => setShowPracticeAnswer(true)}
                >
                  Mostrar resposta
                </button>
              ) : (
                <>
                  <button
                    className="rounded-xl bg-white px-5 py-3 text-sm font-black text-[color:var(--tertiary)]"
                    type="button"
                    onClick={() => answerPractice(true)}
                  >
                    Acertei
                  </button>
                  <button
                    className="rounded-xl bg-white/15 px-5 py-3 text-sm font-black text-white"
                    type="button"
                    onClick={() => answerPractice(false)}
                  >
                    Preciso revisar
                  </button>
                  <button
                    className="rounded-xl bg-white/15 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
                    disabled={Boolean(practiceQuestion.convertedToFlashcardAt)}
                    type="button"
                    onClick={() =>
                      createFlashcardFromQuestion(practiceQuestion)
                    }
                  >
                    <Icon className="mr-1 text-[17px]" name="style" />
                    {practiceQuestion.convertedToFlashcardAt
                      ? "Flashcard criado"
                      : "Criar flashcard"}
                  </button>
                </>
              )}
            </div>
          </article>
        ) : (
          <button
            className="flex w-full items-center justify-between rounded-[28px] bg-[color:var(--primary)] p-6 text-left text-white shadow-lg"
            type="button"
            onClick={startPractice}
          >
            <span>
              <span className="block text-xs font-black uppercase tracking-[.16em] text-white/65">
                Modo prova com cronômetro
              </span>
              <span className="mt-1 block text-xl font-black">
                Iniciar uma questão aleatória
              </span>
            </span>
            <Icon className="text-4xl" name="play_circle" />
          </button>
        )}
        {academic.questions.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {academic.questions.map((question) => {
              const accuracy = question.attempts
                ? Math.round(
                    (Number(question.correct || 0) /
                      Number(question.attempts)) *
                      100,
                  )
                : null;
              return (
                <article
                  key={question.id}
                  className="group rounded-[24px] p-5 neo-raised"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p
                        className="text-xs font-black uppercase tracking-wide"
                        style={{ color: subjectColor(question.subjectId) }}
                      >
                        {subjectName(question.subjectId)} ·{" "}
                        {question.topic || "Geral"}
                      </p>
                      <h3 className="mt-2 line-clamp-3 font-black leading-6">
                        {question.prompt}
                      </h3>
                    </div>
                    <button
                      className="p-2 text-[color:var(--error)] opacity-0 group-hover:opacity-100"
                      type="button"
                      onClick={() => remove("questions", question)}
                    >
                      <Icon className="text-[17px]" name="delete" />
                    </button>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs font-bold text-[color:var(--on-surface-variant)]">
                    <span>
                      {question.difficulty === "hard"
                        ? "Difícil"
                        : question.difficulty === "easy"
                          ? "Fácil"
                          : "Média"}
                    </span>
                    <span>
                      {accuracy === null
                        ? "Ainda não praticada"
                        : `${accuracy}% de acertos (${question.attempts})`}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon="psychology_alt"
            title="Banco vazio"
            text="Adicione perguntas de provas anteriores, listas e conteúdos das aulas."
            action={() => openForm("question")}
            actionLabel="Adicionar questão"
          />
        )}
      </div>
    );
  };

  const renderReferences = () => (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Pesquisa"
        title="Referências acadêmicas"
        description="Organize artigos, livros, sites e gere uma referência-base em ABNT ou APA."
        action={() => openForm("reference")}
        actionLabel="Nova referência"
      />
      <div className="flex gap-2">
        {["abnt", "apa"].map((style) => (
          <button
            key={style}
            className={`rounded-xl px-4 py-2 text-xs font-black uppercase ${citationStyle === style ? "bg-[color:var(--primary)] text-white" : "neo-raised text-[color:var(--on-surface-variant)]"}`}
            type="button"
            onClick={() => setCitationStyle(style)}
          >
            {style}
          </button>
        ))}
      </div>
      {academic.references.length ? (
        <div className="space-y-3">
          {academic.references.map((reference) => {
            const citation = formatAcademicCitation(reference, citationStyle);
            return (
              <article
                key={reference.id}
                className="rounded-[24px] p-5 neo-raised"
              >
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-[color:var(--primary)]/10 px-3 py-1 text-[10px] font-black uppercase text-[color:var(--primary)]">
                        {reference.type}
                      </span>
                      <span className="rounded-full bg-[color:var(--background)] px-3 py-1 text-[10px] font-black text-[color:var(--on-surface-variant)]">
                        {subjectName(reference.subjectId)}
                      </span>
                    </div>
                    <h3 className="mt-3 text-lg font-black">
                      {reference.title}
                    </h3>
                    <p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">
                      {reference.authors || "Autor desconhecido"} ·{" "}
                      {reference.year || "s.d."}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {reference.url || reference.doi ? (
                      <button
                        className="p-2 text-[color:var(--primary)]"
                        type="button"
                        onClick={() =>
                          openExternal(
                            reference.url || `https://doi.org/${reference.doi}`,
                          )
                        }
                      >
                        <Icon className="text-[18px]" name="open_in_new" />
                      </button>
                    ) : null}
                    <button
                      className="p-2 text-[color:var(--primary)]"
                      type="button"
                      onClick={() => openForm("reference", reference)}
                    >
                      <Icon className="text-[18px]" name="edit" />
                    </button>
                    <button
                      className="p-2 text-[color:var(--error)]"
                      type="button"
                      onClick={() => remove("references", reference)}
                    >
                      <Icon className="text-[18px]" name="delete" />
                    </button>
                  </div>
                </div>
                <div className="mt-4 flex items-start gap-3 rounded-2xl p-4 neo-inset">
                  <p className="min-w-0 flex-1 select-all text-sm leading-6 text-[color:var(--on-surface-variant)]">
                    {citation}
                  </p>
                  <button
                    className="shrink-0 rounded-xl p-2 text-[color:var(--primary)] neo-raised"
                    title="Copiar referência"
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(citation)}
                  >
                    <Icon className="text-[18px]" name="content_copy" />
                  </button>
                </div>
                {reference.tags?.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {reference.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs font-bold text-[color:var(--primary)]"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon="library_books"
          title="Nenhuma referência"
          text="Salve livros, artigos, DOI e links usados nos seus trabalhos."
          action={() => openForm("reference")}
          actionLabel="Adicionar referência"
        />
      )}
    </div>
  );

  const renderPerformance = () => {
    const overdue = academicTasks.filter(
      (task) =>
        task.dueDate &&
        task.dueDate < todayKey() &&
        task.status !== "completed",
    ).length;
    const focusMinutes = (academic.focusSessions || []).reduce(
      (total, session) =>
        total +
        Math.round(
          Number(session.actualSeconds || session.plannedSeconds || 0) / 60,
        ),
      0,
    );
    const subjectRows = academic.subjects.map((subject) => {
      const grade = calculateSubjectGrade(academic.grades, subject);
      const attendance = calculateAttendance(academic.attendance, subject);
      const tasks = academicTasks.filter(
        (task) => (task.academicSubjectId || task.subjectId) === subject.id,
      );
      const pending = tasks.filter(
        (task) => task.status !== "completed",
      ).length;
      const late = tasks.filter(
        (task) =>
          task.dueDate &&
          task.dueDate < todayKey() &&
          task.status !== "completed",
      ).length;
      const risk = grade.neededAverage > 10 || attendance.atRisk;
      return { subject, grade, attendance, pending, late, risk };
    });

    return (
      <div className="space-y-6">
        <SectionHeader
          eyebrow="Acompanhamento"
          title="Desempenho acadêmico"
          description="Uma visão simples do que está evoluindo e do que precisa de atenção."
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-2xl p-5 neo-raised">
            <p className="text-xs font-bold text-[color:var(--on-surface-variant)]">
              Horas de foco
            </p>
            <p className="mt-2 text-3xl font-black text-[color:var(--primary)]">
              {(focusMinutes / 60).toFixed(1)}h
            </p>
            <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">
              registradas no semestre
            </p>
          </article>
          <article className="rounded-2xl p-5 neo-raised">
            <p className="text-xs font-bold text-[color:var(--on-surface-variant)]">
              Tarefas pendentes
            </p>
            <p className="mt-2 text-3xl font-black">
              {
                academicTasks.filter((task) => task.status !== "completed")
                  .length
              }
            </p>
            <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">
              em todas as matérias
            </p>
          </article>
          <article
            className={`rounded-2xl p-5 neo-raised ${overdue ? "ring-2 ring-[color:var(--error)]/20" : ""}`}
          >
            <p className="text-xs font-bold text-[color:var(--on-surface-variant)]">
              Atrasadas
            </p>
            <p
              className={`mt-2 text-3xl font-black ${overdue ? "text-[color:var(--error)]" : "text-[color:var(--tertiary)]"}`}
            >
              {overdue}
            </p>
            <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">
              precisam de ação
            </p>
          </article>
          <article className="rounded-2xl p-5 neo-raised">
            <p className="text-xs font-bold text-[color:var(--on-surface-variant)]">
              Em risco
            </p>
            <p className="mt-2 text-3xl font-black text-amber-500">
              {subjectRows.filter((row) => row.risk).length}
            </p>
            <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">
              matérias para acompanhar
            </p>
          </article>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {subjectRows.map(
            ({ subject, grade, attendance, pending, late, risk }) => (
              <article
                key={subject.id}
                className={`rounded-[26px] p-5 neo-raised ${risk ? "ring-2 ring-amber-500/20" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className="mt-1 h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: subject.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-black">
                      {subject.name}
                    </p>
                    <p className="text-xs text-[color:var(--on-surface-variant)]">
                      {pending} pendentes · {late} atrasadas
                    </p>
                  </div>
                  {risk ? (
                    <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-black text-amber-600">
                      Atenção
                    </span>
                  ) : (
                    <span className="rounded-full bg-[color:var(--tertiary)]/10 px-2.5 py-1 text-[10px] font-black text-[color:var(--tertiary)]">
                      Estável
                    </span>
                  )}
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-[color:var(--background)] p-3">
                    <p className="text-[10px] font-bold text-[color:var(--on-surface-variant)]">
                      Média atual
                    </p>
                    <p className="mt-1 text-2xl font-black">
                      {grade.completedWeight
                        ? grade.currentAverage.toFixed(1)
                        : "—"}
                    </p>
                    <p className="text-[10px] text-[color:var(--on-surface-variant)]">
                      {grade.neededAverage === null
                        ? "Sem avaliações"
                        : grade.neededAverage > 10
                          ? "Meta difícil no momento"
                          : `Precisa de ${grade.neededAverage.toFixed(1)}`}
                    </p>
                  </div>
                  <div className="rounded-xl bg-[color:var(--background)] p-3">
                    <p className="text-[10px] font-bold text-[color:var(--on-surface-variant)]">
                      Frequência
                    </p>
                    <p
                      className={`mt-1 text-2xl font-black ${attendance.atRisk ? "text-[color:var(--error)]" : "text-[color:var(--tertiary)]"}`}
                    >
                      {attendance.attendanceRate.toFixed(0)}%
                    </p>
                    <p className="text-[10px] text-[color:var(--on-surface-variant)]">
                      {attendance.absences} faltas registradas
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveAcademicSubject(subject.id);
                    setTab("subjects");
                  }}
                  className="mt-4 flex w-full items-center justify-between border-t border-[color:var(--outline-variant)]/25 pt-4 text-xs font-black"
                  style={{ color: subject.color }}
                >
                  Abrir análise da matéria <Icon name="arrow_forward" />
                </button>
              </article>
            ),
          )}
        </div>
        {!subjectRows.length ? (
          <EmptyState
            icon="insights"
            title="Sem dados de desempenho"
            text="Cadastre matérias, avaliações e registros de frequência para acompanhar sua evolução."
            action={() => setTab("subjects")}
            actionLabel="Configurar matérias"
          />
        ) : null}
      </div>
    );
  };

  const content =
    tab === "overview"
      ? renderOverview()
      : tab === "subjects"
        ? renderSubjects()
        : tab === "agenda"
          ? renderAgenda()
          : tab === "grades"
            ? renderGrades()
            : tab === "attendance"
              ? renderAttendance()
              : tab === "exams"
                ? renderExams()
                : tab === "projects"
                  ? renderProjects()
                  : tab === "questions"
                    ? renderQuestions()
                    : tab === "references"
                      ? renderReferences()
                      : renderPerformance();

  return (
    <main className="flex-1 overflow-y-auto bg-[color:var(--background)] px-5 py-7 custom-scrollbar md:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="overflow-hidden rounded-[30px] bg-[color:var(--primary)] p-6 text-white shadow-xl shadow-violet-500/20 md:p-8">
          <div className="flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[.2em] text-white/65">
                Vida universitária
              </p>
              <h1 className="mt-2 text-3xl font-black md:text-4xl">
                Faculdade
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">
                Semestres, matérias, conteúdos, notas, frequência, prazos e
                planejamento acadêmico em uma única central.
              </p>
            </div>
            <div className="w-full max-w-xl rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
              <p className="text-[10px] font-black uppercase tracking-[.16em] text-white/60">
                Semestre selecionado
              </p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <select
                  aria-label="Selecionar semestre"
                  className="min-w-0 flex-1 rounded-xl border border-white/15 bg-[color:var(--primary)] px-4 py-3 text-sm font-black text-white outline-none focus:border-white/40"
                  value={academic.activeSemesterId}
                  onChange={(event) => setActiveSemester(event.target.value)}
                >
                  {academic.semesters.map((semester) => (
                    <option key={semester.id} value={semester.id}>
                      {semester.name} — {semesterStatusLabel(semester.status)}
                    </option>
                  ))}
                </select>
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-black text-[color:var(--primary)]"
                  type="button"
                  onClick={() => openForm("semester", { status: "active" })}
                >
                  <Icon className="text-[18px]" name="add" />
                  Novo
                </button>
                <button
                  aria-label="Editar semestre selecionado"
                  className="inline-flex items-center justify-center rounded-xl bg-white/15 px-4 py-3 text-white transition-colors hover:bg-white/20"
                  title="Editar semestre"
                  type="button"
                  onClick={() => openForm("semester", academic.semester)}
                >
                  <Icon className="text-[19px]" name="edit" />
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-white/70">
                <span className="inline-flex items-center gap-1">
                  <Icon className="text-[16px]" name="date_range" />
                  {academic.semester.startDate || academic.semester.endDate
                    ? `${formatDate(academic.semester.startDate, { year: true })} — ${formatDate(academic.semester.endDate, { year: true })}`
                    : "Período não informado"}
                </span>
                <span>
                  {academic.subjects.length} disciplina
                  {academic.subjects.length === 1 ? "" : "s"}
                </span>
              </div>
            </div>
          </div>
        </header>

        <nav className="mt-5 flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
          {TABS.map((item) => (
            <button
              key={item.id}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-sm font-black transition-all ${tab === item.id ? "bg-[color:var(--primary)] text-white shadow-lg shadow-violet-500/15" : "neo-raised text-[color:var(--on-surface-variant)] hover:text-[color:var(--primary)]"}`}
              type="button"
              onClick={() => setTab(item.id)}
            >
              <Icon className="text-[18px]" name={item.icon} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="mt-6 pb-16">{content}</div>
      </div>

      <AnimatePresence>
        {modal ? (
          <AcademicFormModal
            modal={modal}
            form={form}
            setForm={setForm}
            subjects={academic.subjects}
            courses={courses}
            onClose={closeForm}
            onSave={saveForm}
          />
        ) : null}
      </AnimatePresence>
    </main>
  );
}
