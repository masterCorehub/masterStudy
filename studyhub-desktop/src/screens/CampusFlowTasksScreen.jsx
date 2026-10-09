import { useMemo, useState, useEffect } from "react";
import { SCREEN_IDS } from "../app/screenIds";
import { getAcademicSemesterData } from "../domain/academic";
import { getLocalDateKey } from "../utils/dateUtils";
import { useStudyStore } from "../store/useStore";
import { Icon } from "../ui/Icon";
import { IncomingSharesPanel } from "../components/IncomingSharesPanel";
import "./TasksWorkspace.css";

const todayKey = () => getLocalDateKey();
const tomorrowKey = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return getLocalDateKey(date);
};

const formatDue = (task) => {
  if (!task.dueDate) return "Sem prazo";
  if (task.dueDate === todayKey()) return task.dueTime || "Hoje";
  if (task.dueDate === tomorrowKey()) return "Amanhã";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(
    new Date(`${task.dueDate}T12:00:00`),
  );
};

const initialTask = {
  title: "",
  dueDate: "",
  dueTime: "",
  priority: "medium",
  type: "task",
  status: "pending",
  academicSubjectId: "",
  subtasks: [],
};

export function CampusFlowTasksScreen({ onNavigate }) {
  const tasks = useStudyStore((state) => state.tasks?.list || []);
  const academicState = useStudyStore((state) => state.academic);
  const addTask = useStudyStore((state) => state.addTask);
  const updateTask = useStudyStore((state) => state.updateTask);
  const setActiveTask = useStudyStore((state) => state.setActiveTask);
  const academic = useMemo(() => getAcademicSemesterData(academicState), [academicState]);
  const [view, setView] = useState("list");
  const [scope, setScope] = useState("pending");
  const [mobileTab, setMobileTab] = useState("pending");
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(initialTask);

  useEffect(() => {
    const handleOpenAddTask = () => setShowForm(true);
    window.addEventListener("studyhub-open-add-task", handleOpenAddTask);
    return () => window.removeEventListener("studyhub-open-add-task", handleOpenAddTask);
  }, []);

  const subjectMap = useMemo(
    () => new Map(academic.subjects.map((subject) => [subject.id, subject])),
    [academic.subjects],
  );

  const addSubtask = () => {
    setForm((prev) => ({
      ...prev,
      subtasks: [...(prev.subtasks || []), { id: Date.now(), title: "", completed: false }],
    }));
  };

  const updateSubtask = (index, title) => {
    setForm((prev) => {
      const newSubtasks = [...(prev.subtasks || [])];
      newSubtasks[index] = { ...newSubtasks[index], title };
      return { ...prev, subtasks: newSubtasks };
    });
  };

  const removeSubtask = (index) => {
    setForm((prev) => ({
      ...prev,
      subtasks: (prev.subtasks || []).filter((_, i) => i !== index),
    }));
  };

  const filtered = tasks.filter((task) => {
    const matchesSearch = `${task.title} ${task.description || ""}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"));
    const matchesSubject = subjectFilter === "all" || task.academicSubjectId === subjectFilter || task.subjectId === subjectFilter;
    return matchesSearch && matchesSubject;
  });
  // Exclusive deadline buckets prevent the same task appearing twice.
  const matchesScope = (task) => scope === "all" || (scope === "completed" ? task.status === "completed" : task.status !== "completed" && (scope === "pending" || (scope === "today" ? task.dueDate === todayKey() : task.dueDate && task.dueDate < todayKey())));
  const visible = filtered.filter(matchesScope);
  const pending = visible.filter((task) => task.status !== "completed");
  const completed = visible.filter((task) => task.status === "completed");
  const overdue = pending.filter((task) => task.dueDate && task.dueDate < todayKey());
  const today = pending.filter((task) => task.dueDate === todayKey());
  const unscheduled = pending.filter((task) => !task.dueDate);
  const upcoming = pending.filter((task) => task.dueDate && task.dueDate > todayKey());
  const columns = [
    { id: "pending", title: "Para Fazer" },
    { id: "in_progress", title: "Em Andamento" },
    { id: "review", title: "Em revisão" },
    { id: "completed", title: "Concluído" },
  ];

  const openTask = (task) => {
    setActiveTask(task.id);
    onNavigate?.(SCREEN_IDS.TASK_DETAILS);
  };

  const saveTask = (event) => {
    event.preventDefault();
    if (!form.title.trim()) return;
    const subject = subjectMap.get(form.academicSubjectId);
    addTask({
      ...form,
      academicSemesterId: academic.activeSemesterId,
      subjectId: form.academicSubjectId,
      category: subject?.name || "",
      estimatedMinutes: 25,

      attachments: [],
    });
    setForm(initialTask);
    setShowForm(false);
  };

  return (
    <main className="campus-tasks-page tasks-workspace">
      <div className="campus-tasks-inner">
        <header className="campus-tasks-header">
          <div>
            <span className="tasks-eyebrow">Seu planejamento</span>
            <h1>Tarefas</h1>
            <p>Um próximo passo de cada vez.</p>
          </div>
          <div className="campus-task-actions">
            <label><Icon name="search" /><input aria-label="Buscar tarefas" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar tarefa..." /></label>
            <button className="campus-primary-button" type="button" onClick={() => setShowForm(true)}><Icon name="add" /> Nova tarefa</button>
          </div>
        </header>

        <nav className="tasks-scope-tabs" aria-label="Filtrar tarefas">
          {[{ id: "pending", label: "Pendentes" }, { id: "today", label: "Hoje" }, { id: "overdue", label: "Atrasadas" }, { id: "completed", label: "Concluídas" }, { id: "all", label: "Todas" }].map((tab) => {
            const count = filtered.filter(task => tab.id === "all" || (tab.id === "completed" ? task.status === "completed" : task.status !== "completed" && (tab.id === "pending" || (tab.id === "today" ? task.dueDate === todayKey() : task.dueDate && task.dueDate < todayKey())))).length;
            return <button key={tab.id} type="button" aria-pressed={scope === tab.id} className={scope === tab.id ? "active" : ""} onClick={() => { setScope(tab.id); setMobileTab(tab.id === "completed" ? "completed" : "pending"); }}>{tab.label}<span>{count}</span></button>;
          })}
        </nav>
        <div className="campus-task-controls">
          <div className="campus-view-toggle">
            <button className={view === "list" ? "active" : ""} type="button" onClick={() => setView("list")}><Icon name="format_list_bulleted" /> Lista</button>
            <button className={view === "kanban" ? "active" : ""} type="button" onClick={() => setView("kanban")}><Icon name="view_kanban" /> Kanban</button>
          </div>
          <select aria-label="Filtrar por disciplina" value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}>
            <option value="all">Todas as disciplinas</option>
            {academic.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
          </select>
        </div>

        <IncomingSharesPanel
          types={["task"]}
          description="Tarefas aceitas aparecem na lista e no calendário como conteúdo compartilhado."
        />

        <div className="campus-mobile-task-tabs">
          <button className={mobileTab === "pending" ? "active" : ""} type="button" onClick={() => setMobileTab("pending")}>Pendentes</button>
          <button className={mobileTab === "completed" ? "active" : ""} type="button" onClick={() => setMobileTab("completed")}>Concluídas</button>
        </div>

        {view === "list" ? (
          <div className="campus-task-list-view">
            {[
              { id: "overdue", title: "Atrasadas", icon: "warning", items: overdue },
              { id: "today", title: "Para Hoje", icon: "today", items: today },
              { id: "upcoming", title: "Próximas", icon: "event", items: upcoming },
              { id: "unscheduled", title: "Sem prazo", icon: "inbox", items: unscheduled },
              { id: "completed", title: "Concluídas", icon: "task_alt", items: completed },
            ].filter(group => group.items.length).map((group) => (
              <section key={group.id} className={`campus-task-group campus-task-group-${group.id} ${group.id === "completed" && mobileTab !== "completed" ? "mobile-hidden" : group.id !== "completed" && mobileTab === "completed" ? "mobile-hidden" : ""}`}>
                <header><Icon name={group.icon} /><h2>{group.title}</h2>{group.items.length ? <span>{group.items.length}</span> : null}</header>
                <div className="campus-task-table">
                  <div className="campus-task-table-head"><span /><span>Tarefa</span><span>Disciplina</span><span>Prazo</span></div>
                  {group.items.map((task) => {
                    const subject = subjectMap.get(task.academicSubjectId || task.subjectId);
                    return (
                      <article
                        key={task.id}
                        className={`campus-task-row ${
                          task.status === "completed"
                            ? "campus-task-row-completed"
                            : ""
                        }`}
                        style={{ "--subject-color": subject?.color || "#505f76" }}
                        onClick={() => openTask(task)}
                        tabIndex={0}
                        onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openTask(task); } }}
                      >
                        <button
                          className={task.status === "completed" ? "checked" : ""}
                          type="button"
                          aria-label={`${task.status === "completed" ? "Reabrir" : "Concluir"} ${task.title}`}
                          disabled={task.sharedWithMe && task.sharingPermission !== "editor" && task.sharedReadOnly !== false}
                          onClick={(event) => {
                            event.stopPropagation();
                            updateTask(task.id, { status: task.status === "completed" ? "pending" : "completed" });
                          }}
                        >
                          {task.status === "completed" ? <Icon name="check" /> : null}
                        </button>
                        <strong>{task.title}{task.sharedWithMe ? <small className="ml-2 inline-flex items-center gap-1 text-[9px] font-black uppercase text-blue-600"><Icon name="group" className="text-[12px]" /> Compartilhada</small> : null}</strong>
                        <span className="campus-task-subject" style={{ "--subject-color": subject?.color || "#505f76" }}>{subject?.name || task.category || "Geral"}</span>
                        <time>{formatDue(task)}{task.dueTime && task.dueDate !== todayKey() ? ` · ${task.dueTime}` : ""}</time>
                      </article>
                    );
                  })}
                  {!group.items.length ? <p className="campus-task-empty">Nenhuma tarefa nesta seção.</p> : null}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="campus-kanban">
            {columns.map((column) => {
              const items = visible.filter((task) => (task.status === "awaiting_review" ? "review" : task.status || "pending") === column.id);
              return (
                <section
                  key={column.id}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => { event.preventDefault(); const task = tasks.find(item => String(item.id) === event.dataTransfer.getData("text/task-id")); if (task && (!task.sharedWithMe || task.sharingPermission === "editor" || task.sharedReadOnly === false)) updateTask(task.id, { status: column.id }); }}
                >
                  <header><h2>{column.title}</h2><span>{items.length}</span></header>
                  <div>
                    {items.map((task) => {
                      const subject = subjectMap.get(task.academicSubjectId || task.subjectId);
                      return (
                        <article
                          key={task.id}
                          className={task.status === "completed" ? "campus-kanban-item-completed" : ""}
                          draggable={!task.sharedWithMe || task.sharingPermission === "editor" || task.sharedReadOnly === false}
                          tabIndex={0}
                          onKeyDown={(event) => { if (event.key === "Enter") openTask(task); }}
                          onDragStart={(event) => event.dataTransfer.setData("text/task-id", task.id)}
                          onClick={() => openTask(task)}
                        >
                          <i style={{ background: subject?.color || "#505f76" }} />
                          <span>{subject?.name || task.category || "Geral"}</span>
                          <h3>{task.title}</h3>
                          {task.sharedWithMe ? <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase text-blue-600"><Icon name="group" className="text-[12px]" /> Compartilhada</span> : null}
                          <footer><b className={`priority-${task.priority}`}>{task.priority === "high" ? "Alta" : task.priority === "low" ? "Baixa" : "Média"}</b><time><Icon name="event" /> {formatDue(task)}</time></footer>
                        </article>
                      );
                    })}
                  </div>
                  <button type="button" onClick={() => { setForm({ ...initialTask, status: column.id }); setShowForm(true); }}><Icon name="add" /> Adicionar tarefa</button>
                </section>
              );
            })}
          </div>
        )}
        {!visible.length ? <div className="tasks-empty-state"><Icon name={search ? "search_off" : "task_alt"} /><h2>{search ? "Nenhuma tarefa encontrada" : "Tudo em dia por aqui"}</h2><p>{search ? "Tente outro termo ou ajuste os filtros." : "Crie uma tarefa ou escolha outro filtro para continuar."}</p><button type="button" className="campus-primary-button" onClick={() => setShowForm(true)}><Icon name="add" /> Nova tarefa</button></div> : null}
      </div>

      <button className="campus-task-fab" type="button" onClick={() => setShowForm(true)}><Icon name="add" /></button>

      {showForm ? (
        <div className="campus-task-modal" role="dialog" aria-modal="true">
          <form onSubmit={saveTask}>
            <header><div><span className="campus-eyebrow">Nova entrada</span><h2>Criar tarefa</h2></div><button type="button" onClick={() => setShowForm(false)}><Icon name="close" /></button></header>
            <label><span>Título</span><input autoFocus required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
            <div className="campus-task-form-grid">
              <label><span>Data</span><input type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></label>
              <label><span>Horário</span><input type="time" value={form.dueTime} onChange={(event) => setForm({ ...form, dueTime: event.target.value })} /></label>
              <label><span>Disciplina</span><select value={form.academicSubjectId} onChange={(event) => setForm({ ...form, academicSubjectId: event.target.value })}><option value="">Geral</option>{academic.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
              <label><span>Prioridade</span><select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}><option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta</option></select></label>
              <label><span>Tipo</span><select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}><option value="task">Tarefa</option><option value="assignment">Trabalho</option><option value="exam">Prova</option><option value="presentation">Apresentação</option></select></label>
            </div>
            <div className="campus-task-subtasks-section">
              <span className="campus-subtasks-label">Subtarefas</span>
              <div className="campus-subtasks-list">
                {(form.subtasks || []).map((subtask, index) => (
                  <div key={subtask.id} className="campus-subtask-row">
                    <input
                      placeholder="Título da subtarefa..."
                      value={subtask.title}
                      onChange={(e) => updateSubtask(index, e.target.value)}
                    />
                    <button type="button" className="campus-remove-subtask" onClick={() => removeSubtask(index)}>
                      <Icon name="close" />
                    </button>
                  </div>
                ))}
                <button type="button" className="campus-add-subtask-btn" onClick={addSubtask}>
                  <Icon name="add" /> Adicionar subtarefa
                </button>
              </div>
            </div>
            <footer><button type="button" onClick={() => setShowForm(false)}>Cancelar</button><button className="campus-primary-button" type="submit">Criar tarefa</button></footer>
          </form>
        </div>
      ) : null}
    </main>
  );
}
