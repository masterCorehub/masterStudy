import { useState, useMemo } from "react";
import { Icon } from "../ui/Icon";
import { SCREEN_IDS } from "../app/screenIds";
import { useStudyStore } from "../store/useStore";
import { usePomodoroStore } from "../store/usePomodoroStore";
import { motion, AnimatePresence } from "framer-motion";
import { RichTextEditor } from "../components/RichTextEditor";
import { AppSelect } from "../components/AppSelect";
import { getAcademicSemesterData } from "../domain/academic";

const createEmptyTask = () => ({
  title: "",
  description: "",
  notes: "",
  status: "pending",
  priority: "medium",
  dueDate: "",
  dueTime: "",
  courseId: "",
  academicSubjectId: "",
  academicSemesterId: "",
  category: "",
  type: "task",
  estimatedPomodoros: 1,
  estimatedMinutes: 25,
  actualMinutes: 0,
  activityWeight: "",
  scoreValue: "",
  externalUrl: "",
  attachments: [],
  subtasks: [],
});

export function TasksScreen({ onNavigate }) {
  const tasksList = useStudyStore((state) => state.tasks?.list) || [];
  const updateTask = useStudyStore((state) => state.updateTask);
  const deleteTask = useStudyStore((state) => state.deleteTask);
  const addTask = useStudyStore((state) => state.addTask);
  const setActiveTask = useStudyStore((state) => state.setActiveTask);
  const courses = useStudyStore((state) => state.courses) || [];
  const academicState = useStudyStore((state) => state.academic);
  const academic = useMemo(
    () => getAcademicSemesterData(academicState),
    [academicState],
  );

  const [viewMode, setViewMode] = useState("kanban"); // kanban, list, calendar
  const [filterCourse, setFilterCourse] = useState("all");
  const [filterSubject, setFilterSubject] = useState("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [isTaskEditing, setIsTaskEditing] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDates, setSelectedDates] = useState([]);
  const [showArchived, setShowArchived] = useState(false);

  const toggleDateSelection = (dateStr) => {
    setSelectedDates((prev) =>
      prev.includes(dateStr)
        ? prev.filter((d) => d !== dateStr)
        : [...prev, dateStr],
    );
  };

  // Form State
  const [newTask, setNewTask] = useState(createEmptyTask);

  const openTaskModal = (task, editMode = false) => {
    setEditingTaskId(task.id);
    setNewTask({
      ...createEmptyTask(),
      ...task,
      attachments: task.attachments || [],
      subtasks: task.subtasks || [],
    });
    setIsTaskEditing(editMode);
    setShowAddModal(true);
  };

  const openTaskDetails = (task) => {
    setActiveTask(task.id);
    onNavigate?.(SCREEN_IDS.TASK_DETAILS);
  };

  const handleSubtaskToggle = (index, checked) => {
    const updated = [...(newTask.subtasks || [])];
    updated[index].completed = checked;
    setNewTask({ ...newTask, subtasks: updated });

    if (!isTaskEditing && editingTaskId) {
      updateTask(editingTaskId, { subtasks: updated });
    }
  };

  const handleSaveTask = (e) => {
    e.preventDefault();
    if (!newTask.title.trim()) return;

    if (editingTaskId) {
      updateTask(editingTaskId, { ...newTask });
      setIsTaskEditing(false); // Go back to view mode
    } else {
      if (selectedDates.length > 0) {
        selectedDates.forEach((dateStr) => {
          addTask({ ...newTask, dueDate: dateStr });
        });
      } else {
        addTask({ ...newTask });
      }
      setShowAddModal(false);
      setEditingTaskId(null);
      setNewTask(createEmptyTask());
      setSelectedDates([]);
    }
  };

  const handleCancelEdit = () => {
    if (editingTaskId) {
      const originalTask = tasksList.find((t) => t.id === editingTaskId);
      if (originalTask) {
        setNewTask({ ...originalTask, subtasks: originalTask.subtasks || [] });
      }
      setIsTaskEditing(false);
    } else {
      setShowAddModal(false);
      setSelectedDates([]);
    }
  };

  const handleStartPomodoro = (taskId) => {
    const store = usePomodoroStore.getState();
    store.clearSelectedTasks();
    store.toggleTaskSelection(taskId);
    store.setMode("focus");
    store.startTimer();
    if (onNavigate) onNavigate(SCREEN_IDS.POMODORO);
  };

  const pickTaskAttachments = async () => {
    const selected = await window.studyhubDesktop?.selectFile?.({
      properties: ["openFile", "multiSelections"],
    });
    const paths = Array.isArray(selected)
      ? selected
      : selected
        ? [selected]
        : [];
    if (!paths.length) return;
    setNewTask((current) => ({
      ...current,
      attachments: [...new Set([...(current.attachments || []), ...paths])],
    }));
  };

  const nextMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1),
    );
  };
  const prevMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1),
    );
  };

  const getDaysInMonth = (year, month) =>
    new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const days = [];

    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  }, [currentDate]);

  const filteredTasks = useMemo(() => {
    return tasksList.filter(
      (task) =>
        !task.archived &&
        (filterCourse === "all" || task.courseId === filterCourse) &&
        (filterSubject === "all" ||
          task.academicSubjectId === filterSubject ||
          task.subjectId === filterSubject),
    );
  }, [tasksList, filterCourse, filterSubject]);

  const archivedTasks = useMemo(() => {
    return tasksList.filter(
      (task) =>
        task.archived &&
        (filterCourse === "all" || task.courseId === filterCourse) &&
        (filterSubject === "all" ||
          task.academicSubjectId === filterSubject ||
          task.subjectId === filterSubject),
    );
  }, [tasksList, filterCourse, filterSubject]);

  const courseFilterOptions = [
    { value: "all", label: "Todos os Cursos" },
    ...courses.map((course) => ({ value: course.id, label: course.title })),
  ];
  const subjectFilterOptions = [
    { value: "all", label: "Todas as matérias" },
    ...academic.subjects.map((subject) => ({
      value: subject.id,
      label: subject.name,
    })),
  ];

  const columns = [
    {
      id: "pending",
      title: "A Fazer",
      icon: "radio_button_unchecked",
      color: "text-[color:var(--on-surface-variant)]",
    },
    {
      id: "in_progress",
      title: "Fazendo",
      icon: "pending",
      color: "text-[color:var(--primary)]",
    },
    {
      id: "awaiting_review",
      title: "Em revisão",
      icon: "rate_review",
      color: "text-amber-500",
    },
    {
      id: "completed",
      title: "Concluído",
      icon: "check_circle",
      color: "text-[color:var(--tertiary)]",
    },
  ];

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split("-");
    return `${d}/${m}/${y}`;
  };

  const calculateDeadline = (dateStr) => {
    if (!dateStr) return null;
    const due = new Date(dateStr + "T00:00:00");
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const diffTime = due - now;
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0)
      return {
        text: "Atrasado!",
        color:
          "text-[color:var(--error)] bg-[color:var(--error)]/10 font-bold border-2 border-[color:var(--error)]/20",
      };
    if (diffDays === 0)
      return {
        text: "HOJE!",
        color:
          "text-white bg-[color:var(--error)] font-bold animate-pulse shadow-lg shadow-[color:var(--error)]/30",
      };
    if (diffDays === 1)
      return {
        text: "É Amanhã",
        color: "text-[color:var(--error)] bg-[color:var(--error)]/20 font-bold",
      };
    if (diffDays <= 5)
      return {
        text: `Faltam ${diffDays} dias`,
        color: "text-orange-600 bg-orange-100 font-bold",
      };
    return {
      text: formatDate(dateStr),
      color: "text-[color:var(--primary)] neo-pressed",
    };
  };

  const getTaskTypeConfig = (type) => {
    switch (type) {
      case "exam":
        return {
          label: "Prova",
          icon: "school",
          color: "text-[color:var(--error)]",
        };
      case "assignment":
        return {
          label: "Trabalho",
          icon: "assignment",
          color: "text-[color:var(--tertiary)]",
        };
      case "presentation":
        return {
          label: "Apresent.",
          icon: "co_present",
          color: "text-[color:var(--secondary)]",
        };
      default:
        return {
          label: "Tarefa",
          icon: "task_alt",
          color: "text-[color:var(--primary)]",
        };
    }
  };

  const handleDragStart = (e, taskId) => {
    e.dataTransfer.setData("taskId", taskId);
  };

  const handleDrop = (e, statusId) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("taskId");
    if (taskId) {
      updateTask(taskId, { status: statusId });
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const renderCard = (task) => {
    const typeConfig = getTaskTypeConfig(task.type || "task");
    const deadline = calculateDeadline(task.dueDate);

    const subtasksCount = (task.subtasks || []).length;
    const subtasksCompleted = (task.subtasks || []).filter(
      (s) => s.completed,
    ).length;

    return (
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        key={task.id}
        draggable="true"
        onDragStart={(e) => handleDragStart(e, task.id)}
        onClick={() => openTaskDetails(task)}
        className={`neo-raised p-4 rounded-2xl flex flex-col gap-3 group relative cursor-pointer hover:shadow-[inset_4px_4px_8px_rgba(0,0,0,0.06),inset_-4px_-4px_8px_rgba(255,255,255,0.5)] transition-all duration-300 ${task.status === "completed" ? "bg-[#4caf50]/10 opacity-80 border-2 border-[#4caf50]/30" : "bg-[color:var(--surface)]"} ${task.type === "exam" && task.status !== "completed" ? "ring-2 ring-[color:var(--error)]/30" : ""}`}
      >
        <div className="flex justify-between items-start gap-2">
          <div className="flex items-center gap-2">
            <Icon
              name={typeConfig.icon}
              className={`text-[16px] ${typeConfig.color}`}
            />
            <h4 className="font-bold text-[color:var(--on-surface)] text-sm leading-tight">
              {task.title}
            </h4>
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleStartPomodoro(task.id);
              }}
              className="text-[color:var(--primary)] hover:bg-[color:var(--primary)]/10 p-1 rounded-full transition-colors"
              title="Iniciar Pomodoro"
            >
              <Icon name="timer" className="text-[14px]" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                openTaskModal(task, true);
              }}
              className="text-[color:var(--secondary)] hover:bg-[color:var(--secondary)]/10 p-1 rounded-full transition-colors"
              title="Editar"
            >
              <Icon name="edit" className="text-[14px]" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteTask(task.id);
              }}
              className="text-[color:var(--error)] hover:bg-[color:var(--error)]/10 p-1 rounded-full transition-colors"
              title="Excluir"
            >
              <Icon name="delete" className="text-[14px]" />
            </button>
          </div>
        </div>
        {task.description && (
          <p className="text-xs text-[color:var(--on-surface-variant)] line-clamp-2">
            {task.description}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 mt-auto">
          {task.priority === "high" && (
            <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-[color:var(--error-container)] text-[color:var(--error)] uppercase">
              Urgent
            </span>
          )}
          {deadline && (
            <span
              className={`text-[10px] px-2 py-1 rounded-md flex items-center gap-1 ${deadline.color}`}
            >
              <Icon name="event" className="text-[12px]" />
              {deadline.text}
            </span>
          )}
          {task.notes &&
            task.notes.replace(/<[^>]*>?/gm, "").trim().length > 0 && (
              <span
                className="text-[10px] px-2 py-1 rounded-md flex items-center gap-1 text-[color:var(--secondary)] bg-[color:var(--secondary)]/10 neo-inset"
                title="Possui anotações"
              >
                <Icon name="sticky_note_2" className="text-[12px]" /> Notas
              </span>
            )}
          {subtasksCount > 0 && (
            <span
              className={`text-[10px] px-2 py-1 rounded-md flex items-center gap-1 neo-inset ${subtasksCompleted === subtasksCount ? "text-[#4caf50] bg-[#4caf50]/10 border border-[#4caf50]/20" : "text-[color:var(--tertiary)] bg-[color:var(--tertiary)]/10"}`}
              title="Subtarefas"
            >
              <Icon name="checklist" className="text-[12px]" />{" "}
              {subtasksCompleted}/{subtasksCount}
            </span>
          )}
          {task.category && (
            <span className="px-2 py-0.5 rounded text-[9px] font-bold text-[color:var(--secondary)] bg-[color:var(--secondary)]/10 uppercase border border-[color:var(--secondary)]/20">
              {task.category}
            </span>
          )}
          {task.estimatedPomodoros > 0 && (
            <span
              className="px-2 py-0.5 rounded text-[10px] font-bold text-[color:var(--error)] bg-[color:var(--error)]/10 flex items-center gap-1"
              title="Pomodoros Estimados"
            >
              <Icon name="local_fire_department" className="text-[12px]" />
              {task.estimatedPomodoros}
            </span>
          )}
          {task.courseId && (
            <span className="px-2 py-0.5 rounded text-[9px] font-bold text-[color:var(--tertiary)] bg-[color:var(--tertiary)]/10 uppercase line-clamp-1 border border-[color:var(--tertiary)]/20">
              {courses.find((c) => c.id === task.courseId)?.title || "Curso"}
            </span>
          )}
          {(task.academicSubjectId || task.subjectId) && (
            <span className="max-w-[170px] truncate rounded px-2 py-0.5 text-[9px] font-bold uppercase text-[color:var(--primary)] bg-[color:var(--primary)]/10 border border-[color:var(--primary)]/20">
              {academic.subjects.find(
                (subject) =>
                  subject.id === (task.academicSubjectId || task.subjectId),
              )?.name || "Faculdade"}
            </span>
          )}
        </div>

          {/* Archive button on hover */}
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
            <button
              onClick={(e) => {
                e.stopPropagation();
                updateTask(task.id, { archived: true });
              }}
              className="w-7 h-7 rounded-full flex items-center justify-center bg-[color:var(--surface-container)] hover:bg-amber-500/20 text-[color:var(--on-surface-variant)] hover:text-amber-600 transition-all shadow-sm"
              title="Arquivar tarefa"
            >
              <Icon name="archive" className="text-[14px]" />
            </button>
          </div>

        {/* Status switch buttons (Simplifies drag and drop) */}
        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-[color:var(--surface)] p-1 rounded-full neo-raised opacity-0 group-hover:opacity-100 transition-opacity z-10 border border-[color:var(--outline-variant)]/20">
          {columns.map((col) => (
            <button
              key={col.id}
              onClick={(e) => {
                e.stopPropagation();
                updateTask(task.id, { status: col.id });
              }}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${task.status === col.id ? "neo-inset text-[color:var(--primary)]" : "hover:neo-raised text-[color:var(--on-surface-variant)]"}`}
              title={`Mover para ${col.title}`}
            >
              <Icon name={col.icon} className="text-[14px]" />
            </button>
          ))}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-10 relative bg-[color:var(--surface)] h-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8 w-full max-w-[1400px] mx-auto">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[color:var(--on-surface)] flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[color:var(--primary)]/10 flex items-center justify-center text-[color:var(--primary)] neo-inset">
              <Icon name="task_alt" />
            </div>
            Tarefas
          </h1>
          <p className="text-[color:var(--on-surface-variant)] mt-1">
            Gerencie seus prazos, projetos e estudos.
          </p>
        </div>

        <div className="flex flex-wrap w-full md:w-auto items-center gap-3">
          <AppSelect
            buttonClassName="min-w-[220px] bg-[color:var(--surface)] !font-bold"
            options={courseFilterOptions}
            value={filterCourse}
            onChange={setFilterCourse}
          />
          <AppSelect
            buttonClassName="min-w-[210px] bg-[color:var(--surface)] !font-bold"
            options={subjectFilterOptions}
            value={filterSubject}
            onChange={setFilterSubject}
          />

          <div className="flex bg-[color:var(--surface)] neo-raised rounded-xl p-1">
            {[
              { id: "kanban", icon: "view_column", label: "Kanban" },
              { id: "list", icon: "list", label: "Lista" },
              { id: "calendar", icon: "calendar_month", label: "Calendário" },
            ].map((view) => (
              <button
                key={view.id}
                onClick={() => setViewMode(view.id)}
                className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${viewMode === view.id ? "neo-inset text-[color:var(--primary)]" : "text-[color:var(--on-surface-variant)] hover:text-[color:var(--primary)]"}`}
              >
                <Icon name={view.icon} className="text-[16px]" />
                <span className="hidden sm:inline">{view.label}</span>
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              setEditingTaskId(null);
              setNewTask(createEmptyTask());
              setIsTaskEditing(true);
              setShowAddModal(true);
            }}
            className="h-12 px-6 rounded-xl neo-raised hover:neo-inset flex items-center justify-center text-[color:var(--primary)] font-bold gap-2 transition-all shrink-0"
          >
            <Icon name="add" /> Nova
          </button>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto pb-20">
        {viewMode === "kanban" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {columns.map((col) => (
              <div key={col.id} className="flex flex-col gap-4">
                <div className="flex items-center gap-2 mb-2 px-2">
                  <Icon name={col.icon} className={col.color} />
                  <h3 className="font-bold text-[color:var(--on-surface)] text-sm uppercase tracking-wider">
                    {col.title}
                  </h3>
                  <span className="ml-auto text-xs font-bold text-[color:var(--on-surface-variant)] bg-[color:var(--surface-variant)] px-2 py-0.5 rounded-full neo-inset">
                    {filteredTasks.filter((t) => t.status === col.id).length}
                  </span>
                </div>
                <div
                  className="flex flex-col gap-4 bg-[color:var(--background)]/50 rounded-[1.5rem] p-4 min-h-[300px] neo-inset"
                  onDrop={(e) => handleDrop(e, col.id)}
                  onDragOver={handleDragOver}
                >
                  <AnimatePresence>
                    {filteredTasks
                      .filter((t) => t.status === col.id)
                      .map((task) => renderCard(task))}
                  </AnimatePresence>
                </div>
              </div>
            ))}
          </div>
        )}

        {viewMode === "list" && (
          <div className="flex flex-col gap-3">
            <AnimatePresence>
              {filteredTasks.map((task) => {
                const typeConfig = getTaskTypeConfig(task.type || "task");
                const deadline = calculateDeadline(task.dueDate);
                const subtasksCount = (task.subtasks || []).length;
                const subtasksCompleted = (task.subtasks || []).filter(
                  (s) => s.completed,
                ).length;
                return (
                  <motion.div
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={task.id}
                    onClick={() => openTaskDetails(task)}
                    className={`neo-raised p-4 rounded-2xl flex items-center gap-4 group transition-all duration-300 cursor-pointer ${task.status === "completed" ? "bg-[#4caf50]/10 opacity-80 border border-[#4caf50]/30" : "bg-[color:var(--surface)]"} ${task.type === "exam" && task.status !== "completed" ? "border border-[color:var(--error)]/30" : ""}`}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateTask(task.id, {
                          status:
                            task.status === "completed"
                              ? "pending"
                              : "completed",
                        });
                      }}
                      className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center transition-all ${task.status === "completed" ? "neo-inset text-[#4caf50] bg-[#4caf50]/10" : "neo-raised text-[color:var(--on-surface-variant)] hover:text-[#4caf50]"}`}
                    >
                      <Icon name="check" className="text-[12px]" />
                    </button>
                    <div className="flex-1 flex flex-wrap items-center gap-4">
                      <Icon
                        name={typeConfig.icon}
                        className={`text-[16px] ${typeConfig.color}`}
                      />
                      <h4
                        className={`font-bold text-sm ${task.status === "completed" ? "text-[color:var(--on-surface-variant)] line-through" : "text-[color:var(--on-surface)]"}`}
                      >
                        {task.title}
                      </h4>
                      {task.priority === "high" && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-[color:var(--error-container)] text-[color:var(--error)] uppercase">
                          Urgent
                        </span>
                      )}
                      {deadline && (
                        <span
                          className={`text-[10px] px-2 py-1 rounded-md flex items-center gap-1 ${deadline.color}`}
                        >
                          <Icon name="event" className="text-[12px]" />{" "}
                          {deadline.text}
                        </span>
                      )}
                      {task.notes &&
                        task.notes.replace(/<[^>]*>?/gm, "").trim().length >
                          0 && (
                          <span
                            className="text-[10px] px-2 py-1 rounded-md flex items-center gap-1 text-[color:var(--secondary)] bg-[color:var(--secondary)]/10 neo-inset"
                            title="Possui anotações"
                          >
                            <Icon
                              name="sticky_note_2"
                              className="text-[12px]"
                            />{" "}
                            Notas
                          </span>
                        )}
                      {subtasksCount > 0 && (
                        <span
                          className={`text-[10px] px-2 py-1 rounded-md flex items-center gap-1 neo-inset ${subtasksCompleted === subtasksCount ? "text-[#4caf50] bg-[#4caf50]/10 border border-[#4caf50]/20" : "text-[color:var(--tertiary)] bg-[color:var(--tertiary)]/10"}`}
                          title="Subtarefas"
                        >
                          <Icon name="checklist" className="text-[12px]" />{" "}
                          {subtasksCompleted}/{subtasksCount}
                        </span>
                      )}
                      {task.category && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold text-[color:var(--secondary)] bg-[color:var(--secondary)]/10 uppercase border border-[color:var(--secondary)]/20">
                          {task.category}
                        </span>
                      )}
                      {task.estimatedPomodoros > 0 && (
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-bold text-[color:var(--error)] bg-[color:var(--error)]/10 flex items-center gap-1"
                          title="Pomodoros Estimados"
                        >
                          <Icon
                            name="local_fire_department"
                            className="text-[12px]"
                          />{" "}
                          {task.estimatedPomodoros}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartPomodoro(task.id);
                        }}
                        className="text-[color:var(--primary)] transition-opacity p-2 hover:neo-pressed rounded-full"
                        title="Iniciar Pomodoro"
                      >
                        <Icon name="timer" className="text-[16px]" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openTaskModal(task, true);
                        }}
                        className="text-[color:var(--secondary)] transition-opacity p-2 hover:neo-pressed rounded-full"
                        title="Editar"
                      >
                        <Icon name="edit" className="text-[16px]" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          updateTask(task.id, { archived: true });
                        }}
                        className="text-amber-600 transition-opacity p-2 hover:neo-pressed rounded-full"
                        title="Arquivar tarefa"
                      >
                        <Icon name="archive" className="text-[16px]" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteTask(task.id);
                        }}
                        className="text-[color:var(--error)] transition-opacity p-2 hover:neo-pressed rounded-full"
                        title="Excluir"
                      >
                        <Icon name="delete" className="text-[16px]" />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
              {filteredTasks.length === 0 && (
                <div className="text-center py-20 text-[color:var(--on-surface-variant)] font-medium neo-inset rounded-[2rem]">
                  Nenhuma tarefa encontrada.
                </div>
              )}
            </AnimatePresence>
          </div>
        )}

        {viewMode === "calendar" && (
          <div className="rounded-[2.5rem] p-6 sm:p-10 flex flex-col bg-[color:var(--surface)]/80 backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,0,0,0.06)] border border-[color:var(--outline-variant)]/20 min-h-[600px] relative overflow-hidden">
            <div className="absolute -top-40 -right-40 w-96 h-96 bg-[color:var(--primary)]/10 rounded-full blur-[80px] pointer-events-none" />
            <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-[color:var(--tertiary)]/10 rounded-full blur-[80px] pointer-events-none" />

            <div className="flex flex-col sm:flex-row items-center justify-between mb-10 px-2 relative z-10">
              <h3 className="text-3xl font-extrabold tracking-tight text-[color:var(--on-surface)] capitalize flex flex-col items-center sm:items-start">
                <span className="text-[color:var(--primary)] text-sm uppercase tracking-[0.2em] mb-1 font-bold">
                  Calendário
                </span>
                {currentDate.toLocaleString("pt-BR", {
                  month: "long",
                  year: "numeric",
                })}
              </h3>
              <div className="flex items-center gap-3 mt-6 sm:mt-0 bg-[color:var(--background)] p-1.5 rounded-full neo-inset">
                <button
                  onClick={prevMonth}
                  className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[color:var(--surface)] hover:shadow-md text-[color:var(--primary)] transition-all"
                >
                  <Icon name="chevron_left" />
                </button>
                <button
                  onClick={() => setCurrentDate(new Date())}
                  className="px-6 h-10 flex items-center justify-center rounded-full text-sm font-bold text-[color:var(--on-surface)] hover:text-[color:var(--primary)] transition-colors"
                >
                  Hoje
                </button>
                <button
                  onClick={nextMonth}
                  className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[color:var(--surface)] hover:shadow-md text-[color:var(--primary)] transition-all"
                >
                  <Icon name="chevron_right" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-3 sm:gap-4 flex-1 relative z-10">
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => (
                <div
                  key={day}
                  className="text-center font-bold text-[color:var(--on-surface-variant)]/60 uppercase tracking-widest text-xs mb-2"
                >
                  {day}
                </div>
              ))}

              {calendarDays.map((date, index) => {
                if (!date)
                  return (
                    <div
                      key={`empty-${index}`}
                      className="min-h-[120px] rounded-3xl"
                    />
                  );

                const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                const dayTasks = filteredTasks.filter(
                  (t) => t.dueDate === dateStr,
                );

                const realToday = new Date();
                const isToday =
                  realToday.toDateString() === date.toDateString();
                const isPast =
                  date <
                  new Date(
                    realToday.getFullYear(),
                    realToday.getMonth(),
                    realToday.getDate(),
                  );
                const isSelected = selectedDates.includes(dateStr);

                return (
                  <div
                    key={dateStr}
                    onClick={(e) => {
                      if (
                        e.target === e.currentTarget ||
                        e.target.closest(".day-header")
                      ) {
                        toggleDateSelection(dateStr);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const taskId = e.dataTransfer.getData("taskId");
                      if (taskId) updateTask(taskId, { dueDate: dateStr });
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    className={`min-h-[130px] rounded-[1.5rem] p-3 flex flex-col gap-2 transition-all duration-300 group relative cursor-pointer border ${isToday ? "bg-gradient-to-br from-[color:var(--primary)] to-[color:var(--secondary)] text-white shadow-xl shadow-[color:var(--primary)]/20 border-transparent scale-[1.02] z-10" : isPast ? "bg-[color:var(--surface)]/40 border-transparent opacity-60" : "bg-[color:var(--surface)] hover:shadow-lg"} ${isSelected ? "ring-2 ring-[color:var(--primary)] border-[color:var(--primary)] bg-[color:var(--primary)]/5" : "border-[color:var(--outline-variant)]/20 hover:border-[color:var(--primary)]/40"}`}
                  >
                    <div className="flex items-center justify-between day-header pointer-events-none">
                      <span
                        className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold ${isToday ? "bg-white/20 backdrop-blur-md text-white" : "text-[color:var(--on-surface-variant)] group-hover:text-[color:var(--primary)]"} ${isSelected && !isToday ? "bg-[color:var(--primary)] text-white group-hover:text-white" : ""}`}
                      >
                        {date.getDate()}
                      </span>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setNewTask({ ...newTask, dueDate: dateStr });
                          setShowAddModal(true);
                        }}
                        className={`opacity-0 group-hover:opacity-100 w-8 h-8 flex items-center justify-center rounded-full transition-all pointer-events-auto ${isToday ? "bg-white/20 hover:bg-white text-white hover:text-[color:var(--primary)]" : "bg-[color:var(--background)] text-[color:var(--primary)] hover:bg-[color:var(--primary)] hover:text-white shadow-sm"}`}
                      >
                        <Icon name="add" className="text-[17px]" />
                      </button>
                    </div>

                    <div className="flex flex-col gap-1.5 mt-1 overflow-y-auto custom-scrollbar flex-1 pr-1">
                      {dayTasks.map((task) => {
                        const typeConfig = getTaskTypeConfig(
                          task.type || "task",
                        );
                        return (
                          <div
                            key={task.id}
                            draggable="true"
                            onDragStart={(e) => handleDragStart(e, task.id)}
                            onClick={() => openTaskDetails(task)}
                            className={`text-[11px] px-2.5 py-1.5 rounded-lg cursor-pointer truncate transition-all flex items-center gap-1.5 font-semibold ${isToday ? (task.status === "completed" ? "bg-white/10 text-white/50 line-through" : "bg-white/20 text-white hover:bg-white/30") : task.status === "completed" ? "bg-[color:var(--background)] text-[color:var(--on-surface-variant)]/50 line-through" : `bg-[color:var(--primary)]/5 ${typeConfig.color} hover:bg-[color:var(--primary)]/15 border border-[color:var(--primary)]/10`}`}
                            title={task.title}
                          >
                            {task.status !== "completed" && (
                              <div
                                className={`w-1.5 h-1.5 rounded-full shrink-0 ${isToday ? "bg-white" : "bg-current"}`}
                              />
                            )}
                            {task.title}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <AnimatePresence>
              {selectedDates.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30"
                >
                  <button
                    onClick={() => {
                      setNewTask({ ...newTask, dueDate: selectedDates[0] });
                      setShowAddModal(true);
                    }}
                    className="flex items-center gap-2 bg-[color:var(--primary)] text-white px-6 py-3 rounded-full font-bold shadow-xl shadow-[color:var(--primary)]/30 hover:scale-105 hover:bg-opacity-90 transition-all"
                  >
                    <Icon name="add_task" />
                    Criar tarefa para {selectedDates.length}{" "}
                    {selectedDates.length === 1 ? "dia" : "dias"}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* ── Archived Tasks Section ── */}
      {archivedTasks.length > 0 && (
        <div className="w-full max-w-[1400px] mx-auto mt-6">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-[color:var(--surface-container)] hover:bg-[color:var(--surface-container-high)] border border-amber-500/20 text-[color:var(--on-surface-variant)] transition-all group"
          >
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
              <Icon name="archive" className="text-amber-600 text-base" />
            </div>
            <span className="font-bold text-sm text-amber-700 dark:text-amber-400">
              Tarefas Arquivadas
            </span>
            <span className="ml-1 text-xs font-black bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/20">
              {archivedTasks.length}
            </span>
            <Icon
              name={showArchived ? "keyboard_arrow_up" : "keyboard_arrow_down"}
              className="ml-auto text-amber-500 text-xl transition-transform"
            />
          </button>

          {showArchived && (
            <div className="mt-3 flex flex-col gap-2">
              {archivedTasks.map((task) => {
                const typeConfig = getTaskTypeConfig(task.type || "task");
                return (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-4 px-5 py-3.5 rounded-2xl bg-[color:var(--surface)] border border-[color:var(--outline-variant)]/20 opacity-70 group hover:opacity-100 transition-opacity"
                  >
                    <span className={`text-lg ${typeConfig.color}`}>{typeConfig.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[color:var(--on-surface)] truncate line-through">{task.title}</p>
                      {task.dueDate && (
                        <p className="text-[10px] text-[color:var(--on-surface-variant)] mt-0.5">
                          Vencimento: {task.dueDate}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        type="button"
                        onClick={() => updateTask(task.id, { archived: false })}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-bold border border-amber-500/20 transition-all"
                        title="Restaurar tarefa"
                      >
                        <Icon name="unarchive" className="text-sm" />
                        Restaurar
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteTask(task.id)}
                        className="p-2 rounded-xl hover:bg-[color:var(--error)]/10 text-[color:var(--error)] transition-all"
                        title="Excluir permanentemente"
                      >
                        <Icon name="delete" className="text-base" />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--on-surface)]/20 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-3xl bg-[color:var(--surface)] rounded-[2rem] neo-raised flex flex-col overflow-hidden"
          >
            <div className="p-6 border-b border-[color:var(--outline-variant)]/10 flex justify-between items-center bg-[color:var(--surface)] neo-inset-bottom">
              <h2 className="text-xl font-bold text-[color:var(--on-surface)] flex items-center gap-2">
                <Icon
                  name={editingTaskId ? "info" : "add_task"}
                  className="text-[color:var(--primary)] text-2xl"
                />
                {editingTaskId ? "Detalhes da Tarefa" : "Nova Tarefa"}
              </h2>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingTaskId(null);
                }}
                className="w-10 h-10 rounded-full flex items-center justify-center neo-inset text-[color:var(--on-surface-variant)] hover:text-[color:var(--error)] hover:shadow-[inset_2px_2px_5px_rgba(0,0,0,0.1),inset_-2px_-2px_5px_rgba(255,255,255,0.7)] transition-all"
              >
                <Icon name="close" />
              </button>
            </div>
            <form
              onSubmit={handleSaveTask}
              className="p-6 flex flex-col gap-6 overflow-y-auto max-h-[80vh] custom-scrollbar"
            >
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-[color:var(--on-surface-variant)] uppercase">
                  Título
                </label>
                <input
                  required
                  type="text"
                  value={newTask.title}
                  onChange={(e) =>
                    setNewTask({ ...newTask, title: e.target.value })
                  }
                  readOnly={!isTaskEditing}
                  className={`w-full neo-inset rounded-xl bg-[color:var(--background)] px-4 py-3 text-sm text-[color:var(--on-surface)] outline-none border-transparent focus:border-transparent focus:ring-2 focus:ring-[color:var(--primary)]/30 ${!isTaskEditing ? "opacity-70 cursor-default shadow-none" : ""}`}
                  placeholder="Estudar React..."
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-[color:var(--on-surface-variant)] uppercase">
                  Descrição Curta (opcional)
                </label>
                <textarea
                  value={newTask.description}
                  onChange={(e) =>
                    setNewTask({ ...newTask, description: e.target.value })
                  }
                  readOnly={!isTaskEditing}
                  className={`w-full neo-inset rounded-xl bg-[color:var(--background)] px-4 py-3 text-sm text-[color:var(--on-surface)] outline-none border-transparent focus:border-transparent resize-none h-16 focus:ring-2 focus:ring-[color:var(--primary)]/30 ${!isTaskEditing ? "opacity-70 cursor-default shadow-none" : ""}`}
                  placeholder="Resumo rápido da tarefa..."
                />
              </div>

              {(isTaskEditing ||
                (newTask.subtasks && newTask.subtasks.length > 0)) && (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-[color:var(--on-surface-variant)] uppercase flex items-center gap-1">
                    <Icon name="checklist" className="text-[16px]" /> Subtarefas
                  </label>
                  <div className="flex flex-col gap-2 bg-[color:var(--background)] rounded-xl p-3 border border-[color:var(--outline-variant)]/20">
                    {(newTask.subtasks || []).map((subtask, index) => (
                      <div
                        key={subtask.id || index}
                        className="flex items-center gap-2"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            handleSubtaskToggle(index, !subtask.completed)
                          }
                          disabled={!isTaskEditing && !editingTaskId}
                          className={`w-5 h-5 rounded-md flex items-center justify-center border-2 outline-none focus:ring-0 transition-all shrink-0 ${subtask.completed ? "bg-[color:var(--primary)] border-[color:var(--primary)] text-white" : "border-[color:var(--outline-variant)]/50 hover:border-[color:var(--primary)]/50 bg-[color:var(--background)]"} disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          {subtask.completed && (
                            <Icon name="check" className="text-[14px]" />
                          )}
                        </button>
                        <input
                          type="text"
                          value={subtask.title}
                          onChange={(e) => {
                            const updated = [...(newTask.subtasks || [])];
                            updated[index].title = e.target.value;
                            setNewTask({ ...newTask, subtasks: updated });
                          }}
                          readOnly={!isTaskEditing}
                          placeholder="Nova subtarefa..."
                          className={`flex-1 neo-inset rounded-lg px-3 py-1.5 text-sm outline-none border-transparent focus:border-transparent focus:ring-0 transition-all ${subtask.completed ? "opacity-50 line-through" : ""} ${!isTaskEditing ? "bg-transparent border-transparent cursor-default shadow-none" : "bg-[color:var(--surface)]"}`}
                        />
                        {isTaskEditing && (
                          <button
                            type="button"
                            onClick={() => {
                              const updated = (newTask.subtasks || []).filter(
                                (_, i) => i !== index,
                              );
                              setNewTask({ ...newTask, subtasks: updated });
                            }}
                            className="text-[color:var(--error)] hover:bg-[color:var(--error)]/10 p-1.5 rounded-full transition-colors shrink-0"
                          >
                            <Icon name="close" className="text-sm" />
                          </button>
                        )}
                      </div>
                    ))}
                    {isTaskEditing && (
                      <button
                        type="button"
                        onClick={() =>
                          setNewTask({
                            ...newTask,
                            subtasks: [
                              ...(newTask.subtasks || []),
                              {
                                id: Date.now() + Math.random(),
                                title: "",
                                completed: false,
                              },
                            ],
                          })
                        }
                        className="text-sm text-[color:var(--primary)] font-bold self-start flex items-center gap-1 mt-1 hover:bg-[color:var(--primary)]/10 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <Icon name="add" className="text-[16px]" /> Adicionar
                        Subtarefa
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-[color:var(--on-surface-variant)] uppercase flex items-center gap-2">
                  <Icon name="description" className="text-sm" /> Anotações da
                  Tarefa
                </label>
                <div className="bg-[color:var(--background)] rounded-xl border border-[color:var(--outline-variant)]/20 overflow-hidden min-h-[200px]">
                  <RichTextEditor
                    content={newTask.notes || ""}
                    onChange={(val) => setNewTask({ ...newTask, notes: val })}
                    readOnly={!isTaskEditing}
                    placeholder="Escreva anotações detalhadas, links, rascunhos para esta tarefa..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-[color:var(--on-surface-variant)] uppercase">
                    Tipo
                  </label>
                  <select
                    value={newTask.type}
                    onChange={(e) =>
                      setNewTask({ ...newTask, type: e.target.value })
                    }
                    disabled={!isTaskEditing}
                    className="w-full neo-inset rounded-xl bg-[color:var(--background)] px-4 py-3 text-sm text-[color:var(--on-surface)] outline-none border-none focus:ring-2 focus:ring-[color:var(--primary)]/30 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    <option value="task">Tarefa</option>
                    <option value="exam">Prova</option>
                    <option value="assignment">Trabalho</option>
                    <option value="presentation">Apresentação</option>
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-[color:var(--on-surface-variant)] uppercase">
                    Prazo
                  </label>
                  {selectedDates.length > 1 && !editingTaskId ? (
                    <div className="w-full neo-inset rounded-xl bg-[color:var(--background)] px-4 py-3 text-sm text-[color:var(--primary)] font-bold flex items-center justify-between">
                      <span>{selectedDates.length} dias selecionados</span>
                      <button
                        type="button"
                        onClick={() => setSelectedDates([newTask.dueDate])}
                        className="text-[color:var(--on-surface-variant)] hover:text-[color:var(--error)] transition-colors text-xs neo-raised px-2 py-1 rounded-lg"
                      >
                        Limpar
                      </button>
                    </div>
                  ) : (
                    <input
                      type="date"
                      value={newTask.dueDate}
                      onChange={(e) => {
                        setNewTask({ ...newTask, dueDate: e.target.value });
                        if (selectedDates.length > 0)
                          setSelectedDates([e.target.value]);
                      }}
                      disabled={!isTaskEditing}
                      className="w-full neo-inset rounded-xl bg-[color:var(--background)] px-4 py-3 text-sm text-[color:var(--on-surface)] outline-none border-transparent focus:border-transparent focus:ring-2 focus:ring-[color:var(--primary)]/30 disabled:opacity-70 disabled:cursor-not-allowed"
                    />
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-[color:var(--on-surface-variant)] uppercase">
                    Prioridade
                  </label>
                  <select
                    value={newTask.priority}
                    onChange={(e) =>
                      setNewTask({ ...newTask, priority: e.target.value })
                    }
                    disabled={!isTaskEditing}
                    className="w-full neo-inset rounded-xl bg-[color:var(--background)] px-4 py-3 text-sm text-[color:var(--on-surface)] outline-none border-none focus:ring-2 focus:ring-[color:var(--primary)]/30 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    <option value="low">Baixa</option>
                    <option value="medium">Média</option>
                    <option value="high">Alta</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase text-[color:var(--on-surface-variant)]">
                    Horário da entrega
                  </label>
                  <input
                    type="time"
                    value={newTask.dueTime || ""}
                    onChange={(event) =>
                      setNewTask({ ...newTask, dueTime: event.target.value })
                    }
                    disabled={!isTaskEditing}
                    className="w-full rounded-xl border-transparent bg-[color:var(--background)] px-4 py-3 text-sm outline-none neo-inset disabled:cursor-not-allowed disabled:opacity-70"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase text-[color:var(--on-surface-variant)]">
                    Status
                  </label>
                  <select
                    value={newTask.status || "pending"}
                    onChange={(event) =>
                      setNewTask({ ...newTask, status: event.target.value })
                    }
                    disabled={!isTaskEditing}
                    className="w-full rounded-xl border-none bg-[color:var(--background)] px-4 py-3 text-sm outline-none neo-inset disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <option value="pending">Não iniciada</option>
                    <option value="in_progress">Em andamento</option>
                    <option value="awaiting_review">Aguardando revisão</option>
                    <option value="completed">Concluída</option>
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase text-[color:var(--on-surface-variant)]">
                    Link da atividade
                  </label>
                  <input
                    type="url"
                    value={newTask.externalUrl || ""}
                    onChange={(event) =>
                      setNewTask({
                        ...newTask,
                        externalUrl: event.target.value,
                      })
                    }
                    readOnly={!isTaskEditing}
                    placeholder="https://portal.faculdade..."
                    className="w-full rounded-xl border-transparent bg-[color:var(--background)] px-4 py-3 text-sm outline-none neo-inset read-only:cursor-default read-only:opacity-70"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-[color:var(--on-surface-variant)] uppercase">
                    Matéria (Opcional)
                  </label>
                  <select
                    value={newTask.academicSubjectId || ""}
                    onChange={(e) => {
                      const selectedSubject = academic.subjects.find(
                        (subject) => subject.id === e.target.value,
                      );
                      setNewTask({
                        ...newTask,
                        academicSubjectId: e.target.value,
                        academicSemesterId: selectedSubject?.semesterId || "",
                        courseId:
                          selectedSubject?.linkedCourseIds?.[0] ||
                          newTask.courseId,
                      });
                    }}
                    disabled={!isTaskEditing}
                    className="w-full neo-inset rounded-xl bg-[color:var(--background)] px-4 py-3 text-sm text-[color:var(--on-surface)] outline-none border-none focus:ring-2 focus:ring-[color:var(--primary)]/30 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    <option value="">Nenhuma matéria</option>
                    {academic.subjects.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-[color:var(--on-surface-variant)] uppercase">
                    Curso (Opcional)
                  </label>
                  <select
                    value={newTask.courseId}
                    onChange={(e) =>
                      setNewTask({ ...newTask, courseId: e.target.value })
                    }
                    disabled={!isTaskEditing}
                    className="w-full neo-inset rounded-xl bg-[color:var(--background)] px-4 py-3 text-sm text-[color:var(--on-surface)] outline-none border-none focus:ring-2 focus:ring-[color:var(--primary)]/30 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    <option value="">Nenhum curso</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-[color:var(--on-surface-variant)] uppercase">
                    Categoria
                  </label>
                  <input
                    type="text"
                    value={newTask.category}
                    onChange={(e) =>
                      setNewTask({ ...newTask, category: e.target.value })
                    }
                    readOnly={!isTaskEditing}
                    className={`w-full neo-inset rounded-xl bg-[color:var(--background)] px-4 py-3 text-sm text-[color:var(--on-surface)] outline-none border-transparent focus:border-transparent focus:ring-2 focus:ring-[color:var(--primary)]/30 ${!isTaskEditing ? "opacity-70 cursor-default shadow-none" : ""}`}
                    placeholder="ex: Faculdade"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-[color:var(--on-surface-variant)] flex items-center gap-1 uppercase">
                    <Icon
                      name="local_fire_department"
                      className="text-[12px] text-[color:var(--error)]"
                    />{" "}
                    Estimativa (Focos)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={newTask.estimatedPomodoros}
                    onChange={(e) =>
                      setNewTask({
                        ...newTask,
                        estimatedPomodoros: parseInt(e.target.value) || 0,
                      })
                    }
                    readOnly={!isTaskEditing}
                    className={`w-full neo-inset rounded-xl bg-[color:var(--background)] px-4 py-3 text-sm text-[color:var(--on-surface)] outline-none border-transparent focus:border-transparent focus:ring-2 focus:ring-[color:var(--primary)]/30 ${!isTaskEditing ? "opacity-70 cursor-default shadow-none" : ""}`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase text-[color:var(--on-surface-variant)]">
                    Tempo estimado
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={newTask.estimatedMinutes ?? 0}
                    onChange={(event) =>
                      setNewTask({
                        ...newTask,
                        estimatedMinutes: Number(event.target.value || 0),
                      })
                    }
                    readOnly={!isTaskEditing}
                    className="rounded-xl bg-[color:var(--background)] px-4 py-3 text-sm outline-none neo-inset read-only:opacity-70"
                  />
                  <span className="text-[10px] text-[color:var(--on-surface-variant)]">
                    minutos
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase text-[color:var(--on-surface-variant)]">
                    Tempo utilizado
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={newTask.actualMinutes ?? 0}
                    onChange={(event) =>
                      setNewTask({
                        ...newTask,
                        actualMinutes: Number(event.target.value || 0),
                      })
                    }
                    readOnly={!isTaskEditing}
                    className="rounded-xl bg-[color:var(--background)] px-4 py-3 text-sm outline-none neo-inset read-only:opacity-70"
                  />
                  <span className="text-[10px] text-[color:var(--on-surface-variant)]">
                    minutos
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase text-[color:var(--on-surface-variant)]">
                    Peso
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={newTask.activityWeight ?? ""}
                    onChange={(event) =>
                      setNewTask({
                        ...newTask,
                        activityWeight: event.target.value,
                      })
                    }
                    readOnly={!isTaskEditing}
                    placeholder="Ex.: 20"
                    className="rounded-xl bg-[color:var(--background)] px-4 py-3 text-sm outline-none neo-inset read-only:opacity-70"
                  />
                  <span className="text-[10px] text-[color:var(--on-surface-variant)]">
                    % da média
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase text-[color:var(--on-surface-variant)]">
                    Nota
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={newTask.scoreValue ?? ""}
                    onChange={(event) =>
                      setNewTask({ ...newTask, scoreValue: event.target.value })
                    }
                    readOnly={!isTaskEditing}
                    placeholder="Opcional"
                    className="rounded-xl bg-[color:var(--background)] px-4 py-3 text-sm outline-none neo-inset read-only:opacity-70"
                  />
                  <span className="text-[10px] text-[color:var(--on-surface-variant)]">
                    resultado obtido
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-[color:var(--outline-variant)]/25 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase text-[color:var(--on-surface-variant)]">
                      Arquivos anexados
                    </p>
                    <p className="mt-1 text-[11px] text-[color:var(--on-surface-variant)]">
                      Roteiros, PDFs, imagens e documentos da atividade.
                    </p>
                  </div>
                  {isTaskEditing ? (
                    <button
                      type="button"
                      onClick={pickTaskAttachments}
                      className="rounded-xl px-3 py-2 text-xs font-black text-[color:var(--primary)] neo-raised"
                    >
                      <Icon name="attach_file" /> Adicionar
                    </button>
                  ) : null}
                </div>
                <div className="mt-3 space-y-2">
                  {(newTask.attachments || []).map((path) => (
                    <div
                      key={path}
                      className="flex items-center gap-2 rounded-xl bg-[color:var(--background)] px-3 py-2"
                    >
                      <Icon
                        name="description"
                        className="text-[color:var(--primary)]"
                      />
                      <span
                        className="min-w-0 flex-1 truncate text-xs font-bold"
                        title={path}
                      >
                        {path.split(/[\\/]/).pop()}
                      </span>
                      {isTaskEditing ? (
                        <button
                          type="button"
                          onClick={() =>
                            setNewTask({
                              ...newTask,
                              attachments: newTask.attachments.filter(
                                (item) => item !== path,
                              ),
                            })
                          }
                          className="text-[color:var(--error)]"
                        >
                          <Icon name="close" className="text-[16px]" />
                        </button>
                      ) : null}
                    </div>
                  ))}
                  {!newTask.attachments?.length ? (
                    <p className="text-xs text-[color:var(--on-surface-variant)]">
                      Nenhum arquivo anexado.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-3">
                {isTaskEditing && editingTaskId ? (
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="px-6 py-3 rounded-xl neo-raised text-sm font-bold text-[color:var(--on-surface-variant)] hover:text-[color:var(--error)] transition-colors"
                  >
                    Cancelar Edição
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-6 py-3 rounded-xl neo-raised text-sm font-bold text-[color:var(--on-surface-variant)] hover:text-[color:var(--error)] transition-colors"
                  >
                    {isTaskEditing ? "Cancelar" : "Fechar"}
                  </button>
                )}
                {!isTaskEditing ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsTaskEditing(true);
                    }}
                    className="px-6 py-3 rounded-xl neo-raised hover:neo-inset text-sm font-bold text-[color:var(--primary)] flex items-center gap-2 transition-all"
                  >
                    <Icon name="edit" className="text-lg" /> Editar Tarefa
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="px-6 py-3 rounded-xl neo-raised hover:neo-inset text-sm font-bold text-[color:var(--primary)] flex items-center gap-2 transition-all"
                  >
                    <Icon name="save" className="text-lg" /> Salvar Tarefa
                  </button>
                )}
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
