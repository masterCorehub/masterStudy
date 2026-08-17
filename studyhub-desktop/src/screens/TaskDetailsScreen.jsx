import { useMemo, useState } from "react";
import { SCREEN_IDS } from "../app/screenIds";
import { normalizeAcademicData } from "../domain/academic";
import { usePomodoroStore } from "../store/usePomodoroStore";
import { useStudyStore } from "../store/useStore";
import { Icon } from "../ui/Icon";
import { ShareModal } from "../components/ShareModal";

const STATUS_LABELS = {
  pending: "Para fazer",
  in_progress: "Em andamento",
  awaiting_review: "Em revisao",
  completed: "Concluida",
};

const PRIORITY_LABELS = {
  low: "Baixa prioridade",
  medium: "Media prioridade",
  high: "Alta prioridade",
};

const TYPE_LABELS = {
  task: "Tarefa",
  assignment: "Trabalho",
  exam: "Prova",
  presentation: "Apresentacao",
};

const fileName = (path = "") => path.split(/[\\/]/).pop() || path;

const fileIcon = (path = "") => {
  const extension = path.split(".").pop()?.toLowerCase();
  if (extension === "pdf") return "picture_as_pdf";
  if (["csv", "xls", "xlsx"].includes(extension)) return "table_view";
  if (["png", "jpg", "jpeg", "webp"].includes(extension)) return "image";
  return "description";
};

const formatDueDate = (dateValue, timeValue) => {
  if (!dateValue) return "Sem prazo";
  const date = new Date(`${dateValue}T12:00:00`);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const sameDay = (left, right) =>
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate();
  const label = sameDay(date, today)
    ? "Hoje"
    : sameDay(date, tomorrow)
      ? "Amanha"
      : date.toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "short",
          year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
        });
  return `${label}${timeValue ? `, ${timeValue}` : ""}`;
};

const formatEstimate = (task) => {
  const minutes =
    Number(task.estimatedMinutes || 0) ||
    Number(task.estimatedPomodoros || 0) * 25;
  if (!minutes) return "Sem estimativa";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${minutes} min`;
  return remainder ? `${hours}h ${remainder}min` : `${hours}h`;
};

export function TaskDetailsScreen({ onNavigate }) {
  const activeTaskId = useStudyStore((state) => state.activeTaskId);
  const task = useStudyStore((state) =>
    state.tasks.list.find((item) => item.id === state.activeTaskId),
  );
  const academicState = useStudyStore((state) => state.academic);
  const updateTask = useStudyStore((state) => state.updateTask);
  const deleteTask = useStudyStore((state) => state.deleteTask);
  const setActiveAcademicSubject = useStudyStore(
    (state) => state.setActiveAcademicSubject,
  );

  const academic = useMemo(
    () => normalizeAcademicData(academicState),
    [academicState],
  );
  const subject = academic.subjects.find(
    (item) => item.id === (task?.academicSubjectId || task?.subjectId),
  );
  const semester = academic.semesters.find(
    (item) => item.id === (task?.academicSemesterId || subject?.semesterId),
  );

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [showShareModal, setShowShareModal] = useState(false);

  if (!task || !activeTaskId) {
    return (
      <main className="campus-task-detail-empty-state">
        <div>
          <Icon name="assignment_late" />
          <h1>Tarefa nao encontrada</h1>
          <button
            type="button"
            onClick={() => onNavigate?.("BACK")}
          >
            Voltar para tarefas
          </button>
        </div>
      </main>
    );
  }

  const current = editing ? draft : task;
  const canEdit =
    !task.sharedWithMe ||
    task.sharingPermission === "editor" ||
    task.sharedReadOnly === false;

  const beginEditing = () => {
    setDraft({
      ...task,
      attachments: [...(task.attachments || [])],
      subtasks: (task.subtasks || []).map((item) => ({ ...item })),
    });
    setEditing(true);
  };

  const saveEditing = () => {
    if (!draft?.title?.trim()) return;
    updateTask(task.id, draft);
    setEditing(false);
    setDraft(null);
  };

  const cancelEditing = () => {
    setEditing(false);
    setDraft(null);
  };

  const patchTask = (updates) => {
    if (editing) {
      setDraft((value) => ({ ...value, ...updates }));
      return;
    }
    updateTask(task.id, updates);
  };

  const toggleSubtask = (index) => {
    const subtasks = (current.subtasks || []).map((item, itemIndex) =>
      itemIndex === index ? { ...item, completed: !item.completed } : item,
    );
    patchTask({ subtasks });
  };

  const addSubtask = () => {
    const title = subtaskTitle.trim();
    if (!title) return;
    patchTask({
      subtasks: [
        ...(current.subtasks || []),
        { id: `subtask-${Date.now()}`, title, completed: false },
      ],
    });
    setSubtaskTitle("");
  };

  const removeSubtask = (index) => {
    patchTask({
      subtasks: (current.subtasks || []).filter(
        (_item, itemIndex) => itemIndex !== index,
      ),
    });
  };

  const pickAttachments = async () => {
    const selected = await window.studyhubDesktop?.selectFile?.({
      properties: ["openFile", "multiSelections"],
    });
    const paths = Array.isArray(selected)
      ? selected
      : selected
        ? [selected]
        : [];
    if (!paths.length) return;
    patchTask({
      attachments: [...new Set([...(current.attachments || []), ...paths])],
    });
  };

  const removeAttachment = (path) => {
    patchTask({
      attachments: (current.attachments || []).filter((item) => item !== path),
    });
  };

  const startPomodoro = () => {
    const pomodoro = usePomodoroStore.getState();
    pomodoro.clearSelectedTasks();
    pomodoro.toggleTaskSelection(task.id);
    pomodoro.setMode("focus");
    pomodoro.startTimer();
    onNavigate?.(SCREEN_IDS.POMODORO);
  };

  const removeTask = () => {
    if (!window.confirm(`Excluir a tarefa "${task.title}"?`)) return;
    deleteTask(task.id);
    onNavigate?.(SCREEN_IDS.TASKS);
  };

  const toggleTaskCompletion = () => {
    const nextStatus = current.status === "completed" ? "pending" : "completed";
    patchTask({ status: nextStatus });
  };

  const openSubject = () => {
    if (!subject) return;
    setActiveAcademicSubject(subject.id);
    onNavigate?.(SCREEN_IDS.ACADEMIC_SUBJECT);
  };

  return (
    <main className="campus-task-detail-page">
      <div className="campus-task-detail-shell">
        <header className="campus-task-detail-topbar">
          <button
            className="campus-task-detail-back"
            type="button"
            onClick={() => onNavigate?.("BACK")}
            aria-label="Voltar para tarefas"
          >
            <Icon name="arrow_back" />
          </button>

          <div className="campus-task-detail-breadcrumb">
            <span>Tarefas</span>
            <Icon name="chevron_right" />
            <strong>{subject?.name || current.category || "Detalhes"}</strong>
            {task.sharedWithMe ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-1 text-[10px] font-black text-blue-600">
                <Icon name="group" className="text-[13px]" /> Compartilhada
              </span>
            ) : null}
          </div>

          <div className="campus-task-detail-actions">
            {editing ? (
              <>
                <button type="button" onClick={cancelEditing}>
                  Cancelar
                </button>
                <button
                  className="campus-task-detail-primary-action"
                  type="button"
                  onClick={saveEditing}
                >
                  <Icon name="save" />
                  Salvar
                </button>
              </>
            ) : (
              <button type="button" onClick={beginEditing} disabled={!canEdit}>
                <Icon name="edit" />
                Editar
              </button>
            )}

            {!task.sharedWithMe ? (
              <button type="button" onClick={() => setShowShareModal(true)}>
                <Icon name="group" />
                Compartilhar
              </button>
            ) : null}

            {canEdit ? <button
              className="campus-task-detail-danger-action"
              type="button"
              onClick={removeTask}
            >
              <Icon name="delete" />
              Excluir
            </button> : null}

            <button
              className="campus-task-detail-dark-action"
              type="button"
              onClick={startPomodoro}
            >
              <Icon name="timer" />
              Iniciar Pomodoro
            </button>
          </div>
        </header>

        <section className="campus-task-detail-card">
          <div className="campus-task-detail-meta">
            {editing ? (
              <>
                <select
                  value={current.status || "pending"}
                  onChange={(event) => patchTask({ status: event.target.value })}
                >
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>

                <select
                  value={current.priority || "medium"}
                  onChange={(event) => patchTask({ priority: event.target.value })}
                >
                  {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <>
                <span className={`campus-task-detail-pill status-${current.status || "pending"}`}>
                  {STATUS_LABELS[current.status] || "Para fazer"}
                </span>
                <span className={`campus-task-detail-inline priority-${current.priority || "medium"}`}>
                  <Icon name="priority_high" />
                  {PRIORITY_LABELS[current.priority] || "Media prioridade"}
                </span>
              </>
            )}

            <span className="campus-task-detail-divider" />

            {editing ? (
              <>
                <label className="campus-task-detail-inline-field">
                  <Icon name="event" />
                  <input
                    type="date"
                    value={current.dueDate || ""}
                    onChange={(event) => patchTask({ dueDate: event.target.value })}
                  />
                </label>
                <label className="campus-task-detail-inline-field compact">
                  <input
                    type="time"
                    value={current.dueTime || ""}
                    onChange={(event) => patchTask({ dueTime: event.target.value })}
                  />
                </label>
                <label className="campus-task-detail-inline-field compact">
                  <Icon name="schedule" />
                  <input
                    type="number"
                    min="0"
                    step="5"
                    value={current.estimatedMinutes || 0}
                    onChange={(event) =>
                      patchTask({
                        estimatedMinutes: Number(event.target.value || 0),
                      })
                    }
                  />
                </label>
              </>
            ) : (
              <>
                <span className="campus-task-detail-inline">
                  <Icon name="event" />
                  {formatDueDate(current.dueDate, current.dueTime)}
                </span>
                <span className="campus-task-detail-inline">
                  <Icon name="schedule" />
                  Est: {formatEstimate(current)}
                </span>
              </>
            )}
          </div>

          <div className="campus-task-detail-completion-bar">
            <button
              type="button"
              className={`campus-task-detail-completion-button ${
                current.status === "completed" ? "completed" : ""
              }`}
              onClick={toggleTaskCompletion}
              disabled={!canEdit}
            >
              <Icon
                name={
                  current.status === "completed"
                    ? "check_circle"
                    : "radio_button_unchecked"
                }
              />
              {current.status === "completed"
                ? "Tarefa concluída"
                : "Marcar tarefa como concluída"}
            </button>
          </div>

          <div className="campus-task-detail-header-block">
            {editing ? (
              <input
                className="campus-task-detail-title-input"
                value={current.title}
                onChange={(event) => patchTask({ title: event.target.value })}
                placeholder="Titulo da tarefa"
              />
            ) : (
              <h1 className={current.status === "completed" ? "is-completed" : ""}>
                {current.title}
              </h1>
            )}

            {editing ? (
              <div className="campus-task-detail-extra-fields">
                <label>
                  <span>Tipo</span>
                  <select
                    value={current.type || "task"}
                    onChange={(event) => patchTask({ type: event.target.value })}
                  >
                    {Object.entries(TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Disciplina</span>
                  <select
                    value={current.academicSubjectId || current.subjectId || ""}
                    onChange={(event) => {
                      const value = event.target.value || null;
                      // Set both academicSubjectId and legacy subjectId for compatibility
                      patchTask({ academicSubjectId: value, subjectId: value });
                    }}
                  >
                    <option value="">Nenhuma disciplina vinculada</option>
                    {academic.subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
          </div>

          {editing ? (
            <textarea
              className="campus-task-detail-description-input"
              value={current.description || ""}
              placeholder="Descreva o que precisa ser feito."
              onChange={(event) =>
                patchTask({ description: event.target.value })
              }
            />
          ) : (
            <p className="campus-task-detail-description">
              {current.description || "Nenhuma descricao adicionada."}
            </p>
          )}

          <div className="campus-task-detail-grid">
            <section className="campus-task-detail-panel">
              <header>
                <h2>
                  <Icon name="checklist" />
                  Sub-tarefas
                </h2>
              </header>

              <div className="campus-task-detail-subtasks">
                {(current.subtasks || []).map((subtask, index) => (
                  <article
                    key={subtask.id || `${subtask.title}-${index}`}
                    className={subtask.completed ? "completed" : ""}
                  >
                    <button
                      type="button"
                      className={subtask.completed ? "checked" : ""}
                      onClick={() => toggleSubtask(index)}
                      disabled={!canEdit}
                      aria-label={`Marcar ${subtask.title}`}
                    >
                      {subtask.completed ? <Icon name="check" /> : null}
                    </button>

                    {editing ? (
                      <input
                        value={subtask.title}
                        onChange={(event) => {
                          const subtasks = [...(current.subtasks || [])];
                          subtasks[index] = {
                            ...subtasks[index],
                            title: event.target.value,
                          };
                          patchTask({ subtasks });
                        }}
                      />
                    ) : (
                      <span>{subtask.title}</span>
                    )}

                    {editing ? (
                      <button
                        type="button"
                        className="campus-task-detail-icon-button"
                        onClick={() => removeSubtask(index)}
                        aria-label="Remover subtarefa"
                      >
                        <Icon name="close" />
                      </button>
                    ) : null}
                  </article>
                ))}

                {!current.subtasks?.length ? (
                  <p className="campus-task-detail-empty-copy">
                    Nenhuma subtarefa adicionada.
                  </p>
                ) : null}
              </div>

              {canEdit ? <div className="campus-task-detail-subtask-create">
                <button type="button" onClick={addSubtask}>
                  <Icon name="add" />
                </button>
                <input
                  value={subtaskTitle}
                  placeholder="Adicionar sub-tarefa"
                  onChange={(event) => setSubtaskTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") addSubtask();
                  }}
                />
              </div> : null}
            </section>

            <aside className="campus-task-detail-sidebar">
              <section className="campus-task-detail-panel compact">
                <header>
                  <h2>
                    <Icon name="attachment" />
                    Anexos
                  </h2>
                </header>

                <div className="campus-task-detail-attachments">
                  {(current.attachments || []).map((path) => (
                    <article key={path}>
                      <span
                        className={`file-icon ${
                          path.toLowerCase().endsWith(".pdf") ? "pdf" : "sheet"
                        }`}
                      >
                        <Icon name={fileIcon(path)} />
                      </span>
                      <button
                        type="button"
                        className="file-link"
                        title={path}
                        onClick={() => window.studyhubDesktop?.openPath?.(path)}
                      >
                        {fileName(path)}
                      </button>
                      <button
                        type="button"
                        className="campus-task-detail-icon-button"
                        onClick={() => removeAttachment(path)}
                        aria-label="Remover anexo"
                      >
                        <Icon name="close" />
                      </button>
                    </article>
                  ))}

                  {!current.attachments?.length ? (
                    <p className="campus-task-detail-empty-copy">
                      Nenhum arquivo anexado.
                    </p>
                  ) : null}
                </div>

                <button
                  className="campus-task-detail-upload"
                  type="button"
                  onClick={pickAttachments}
                >
                  <Icon name="upload" />
                  Adicionar arquivo
                </button>
              </section>

              <button
                className="campus-task-detail-subject-card"
                type="button"
                disabled={!subject}
                onClick={openSubject}
                style={{ "--subject-accent": subject?.color || "#2563eb" }}
              >
                <span className="label">Disciplina</span>
                <strong>
                  {subject
                    ? `${subject.code ? `${subject.code} - ` : ""}${subject.name}`
                    : "Nenhuma disciplina vinculada"}
                </strong>
                <span className="teacher-row">
                  <span className="teacher-icon">
                    <Icon name="school" />
                  </span>
                  <span>
                    <b>{subject?.professor || "Professor nao informado"}</b>
                    <small>{semester?.name || "Semestre nao informado"}</small>
                  </span>
                </span>
              </button>
            </aside>
          </div>
        </section>
      </div>
      {showShareModal ? (
        <ShareModal
          entityType="task"
          entityId={task.id}
          title={task.title}
          payload={{ task }}
          onClose={() => setShowShareModal(false)}
        />
      ) : null}
    </main>
  );
}
