import { useEffect, useMemo, useRef, useState } from "react";
import { useStudyStore } from "../store/useStore";
import { getAcademicSemesterData } from "../domain/academic";
import { Icon } from "../ui/Icon";

const PRIORITY_OPTIONS = [
  { id: "low", label: "Baixa", color: "#10b981", bg: "rgba(16,185,129,0.12)" },
  { id: "medium", label: "Média", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  { id: "high", label: "Alta", color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
  { id: "urgent", label: "Urgente", color: "#dc2626", bg: "rgba(220,38,38,0.18)" },
];

export function CalendarTaskModal({ initialDate, initialSubjectId, onClose, onCreated }) {
  const academicState = useStudyStore((state) => state.academic);
  const addTask = useStudyStore((state) => state.addTask);
  const academic = useMemo(() => getAcademicSemesterData(academicState), [academicState]);

  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(initialDate || new Date().toISOString().slice(0, 10));
  const [dueTime, setDueTime] = useState("");
  const [priority, setPriority] = useState("medium");
  const [academicSubjectId, setAcademicSubjectId] = useState(initialSubjectId || "");
  const [estimatedMinutes, setEstimatedMinutes] = useState(25);
  const [description, setDescription] = useState("");
  const inputRef = useRef(null);

  const subjects = useMemo(() => {
    return (academic.subjects || []).filter((s) => !s.isArchived);
  }, [academic.subjects]);

  const subjectMap = useMemo(
    () => new Map(subjects.map((subject) => [subject.id, subject])),
    [subjects],
  );

  useEffect(() => {
    inputRef.current?.focus();
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const formattedDateTitle = useMemo(() => {
    if (!dueDate) return "";
    try {
      const parts = dueDate.split("-");
      if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12);
        return d.toLocaleDateString("pt-BR", {
          weekday: "long",
          day: "numeric",
          month: "long",
        });
      }
    } catch {}
    return dueDate;
  }, [dueDate]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    const subject = subjectMap.get(academicSubjectId);
    const newTask = {
      title: title.trim(),
      dueDate: dueDate || "",
      dueTime: dueTime || "",
      priority,
      status: "pending",
      type: "task",
      academicSubjectId: academicSubjectId || "",
      subjectId: academicSubjectId || "",
      category: subject?.name || "",
      academicSemesterId: academic.activeSemesterId || null,
      estimatedMinutes: Number(estimatedMinutes) || 25,
      description: description.trim(),
      subtasks: [],
      attachments: [],
      createdAt: Date.now(),
    };

    addTask(newTask);
    window.studyhubDesktop?.studyDatabase?.save?.(useStudyStore.getState());
    onCreated?.(newTask);
    onClose?.();
  };

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-[color:var(--outline-variant)]/50 bg-[color:var(--surface)] shadow-2xl animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[color:var(--outline-variant)]/40 bg-[color:var(--surface-container-low)] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--primary)]/10 text-[color:var(--primary)]">
              <Icon name="add_task" className="text-xl" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-[color:var(--on-surface)]">
                Nova Tarefa no Calendário
              </h2>
              {formattedDateTitle ? (
                <p className="text-xs font-semibold capitalize text-[color:var(--on-surface-variant)]">
                  {formattedDateTitle}
                </p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--on-surface-variant)] transition-colors hover:bg-[color:var(--surface-container-high)] hover:text-[color:var(--on-surface)]"
            onClick={onClose}
            aria-label="Fechar"
          >
            <Icon name="close" className="text-lg" />
          </button>
        </div>

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          {/* Title */}
          <div>
            <label className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wider text-[color:var(--on-surface-variant)]">
              Título da Tarefa *
            </label>
            <input
              ref={inputRef}
              type="text"
              required
              placeholder="Ex: Entregar trabalho de cálculo, estudar capítulo 3..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-[color:var(--outline-variant)]/60 bg-[color:var(--surface-container-lowest)] px-4 py-2.5 text-sm font-semibold text-[color:var(--on-surface)] placeholder:text-[color:var(--outline)] focus:border-[color:var(--primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/20"
            />
          </div>

          {/* Date and Time row */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wider text-[color:var(--on-surface-variant)]">
                Data de Entrega
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-xl border border-[color:var(--outline-variant)]/60 bg-[color:var(--surface-container-lowest)] px-3.5 py-2 text-xs font-semibold text-[color:var(--on-surface)] focus:border-[color:var(--primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/20"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wider text-[color:var(--on-surface-variant)]">
                Horário (Opcional)
              </label>
              <input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className="w-full rounded-xl border border-[color:var(--outline-variant)]/60 bg-[color:var(--surface-container-lowest)] px-3.5 py-2 text-xs font-semibold text-[color:var(--on-surface)] focus:border-[color:var(--primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/20"
              />
            </div>
          </div>

          {/* Subject dropdown */}
          <div>
            <label className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wider text-[color:var(--on-surface-variant)]">
              Disciplina Vinculada
            </label>
            <select
              value={academicSubjectId}
              onChange={(e) => setAcademicSubjectId(e.target.value)}
              className="w-full rounded-xl border border-[color:var(--outline-variant)]/60 bg-[color:var(--surface-container-lowest)] px-3.5 py-2.5 text-xs font-semibold text-[color:var(--on-surface)] focus:border-[color:var(--primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/20"
            >
              <option value="">Nenhuma disciplina / Geral</option>
              {subjects.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.name} {sub.code ? `(${sub.code})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Priority options */}
          <div>
            <label className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wider text-[color:var(--on-surface-variant)]">
              Prioridade
            </label>
            <div className="grid grid-cols-4 gap-2">
              {PRIORITY_OPTIONS.map((opt) => {
                const isSelected = priority === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPriority(opt.id)}
                    className={`flex items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-bold transition-all ${
                      isSelected
                        ? "border-current shadow-sm ring-1 ring-current"
                        : "border-[color:var(--outline-variant)]/40 bg-[color:var(--surface-container-lowest)] text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-container)]"
                    }`}
                    style={
                      isSelected
                        ? {
                            color: opt.color,
                            backgroundColor: opt.bg,
                            borderColor: opt.color,
                          }
                        : {}
                    }
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: opt.color }}
                    />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Estimate and description */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr]">
            <div>
              <label className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wider text-[color:var(--on-surface-variant)]">
                Tempo estimado
              </label>
              <div className="flex items-center gap-2 rounded-xl border border-[color:var(--outline-variant)]/60 bg-[color:var(--surface-container-lowest)] px-3 py-2 text-xs font-bold text-[color:var(--on-surface)]">
                <Icon name="schedule" />
                <input
                  type="number"
                  min="1"
                  max="1440"
                  value={estimatedMinutes}
                  onChange={(e) => setEstimatedMinutes(Math.max(1, Number(e.target.value) || 1))}
                  className="w-12 bg-transparent text-center font-extrabold text-[color:var(--on-surface)] outline-none"
                />
                <span className="text-[10px] text-[color:var(--on-surface-variant)]">
                  min
                </span>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wider text-[color:var(--on-surface-variant)]">
                Descrição / Notas
              </label>
              <input
                type="text"
                placeholder="Detalhes ou links úteis..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-xl border border-[color:var(--outline-variant)]/60 bg-[color:var(--surface-container-lowest)] px-3.5 py-2 text-xs font-semibold text-[color:var(--on-surface)] placeholder:text-[color:var(--outline)] focus:border-[color:var(--primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/20"
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 border-t border-[color:var(--outline-variant)]/40 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[color:var(--outline-variant)]/60 px-4 py-2.5 text-xs font-bold text-[color:var(--on-surface-variant)] transition-colors hover:bg-[color:var(--surface-container)] hover:text-[color:var(--on-surface)]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="flex items-center gap-2 rounded-xl bg-[color:var(--primary)] px-5 py-2.5 text-xs font-extrabold text-[color:var(--on-primary)] shadow-md transition-all hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon name="check" className="text-base" />
              <span>Salvar Tarefa</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
