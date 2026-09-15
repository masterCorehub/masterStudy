import { useMemo, useState } from "react";
import { Icon } from "../ui/Icon";
import { useStudyStore } from "../store/useStore";
import { usePomodoroStore } from "../store/usePomodoroStore";
import { getLocalDateKey } from "../utils/dateUtils";

const formatTimer = (seconds) => {
  const safe = Math.max(0, Math.round(Number(seconds) || 0));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
};

const isDueToday = (task) => {
  if (!task?.dueDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${task.dueDate}T00:00:00`);
  return Number.isFinite(due.getTime()) && due <= new Date(today.getTime() + 86400000 - 1);
};

export function TrayPopoverScreen() {
  const tasks = useStudyStore((state) => state.tasks?.list || []);
  const addTask = useStudyStore((state) => state.addTask);
  const updateTask = useStudyStore((state) => state.updateTask);
  const deleteTask = useStudyStore((state) => state.deleteTask);
  const pomodoro = usePomodoroStore();
  const [quickTaskTitle, setQuickTaskTitle] = useState("");
  const selectedTaskIds = new Set(
    (pomodoro.selectedTasks || []).map((task) => (typeof task === "string" ? task : task?.id)),
  );
  const pendingTasks = useMemo(() => {
    const pending = tasks.filter((task) => task.status !== "completed" && !task.completed);
    const due = pending.filter(isDueToday);
    return (due.length ? due : pending).slice(0, 2);
  }, [tasks]);
  const displayedTasks = useMemo(() => {
    const todayTasks = tasks.filter(isDueToday);
    return todayTasks.length ? todayTasks : tasks.filter((task) => task.status !== "completed" && !task.completed);
  }, [tasks]);
  const focusTask = tasks.find((task) => selectedTaskIds.has(task.id)) || pendingTasks[0];
  const duration = pomodoro.mode === "focus"
    ? Number(pomodoro.focusTime || 25) * 60
    : Number(pomodoro.mode === "longBreak" ? pomodoro.longBreakTime : pomodoro.shortBreakTime || 5) * 60;
  const progress = Math.max(0, Math.min(100, ((duration - pomodoro.timeLeft) / Math.max(1, duration)) * 100));

  const runAction = (action) => window.studyhubDesktop?.trayPopover?.action?.(action);
  const toggleTask = async (task) => {
    const isCompleted = task.status === "completed" || task.completed;
    updateTask(task.id, {
      status: isCompleted ? "pending" : "completed",
      completed: !isCompleted,
      completedAt: isCompleted ? null : Date.now(),
    });
    await window.studyhubDesktop?.studyDatabase?.save?.(useStudyStore.getState());
    window.studyhubDesktop?.notifyStudyDataChanged?.();
  };
  const removeTask = async (task) => {
    deleteTask(task.id);
    await window.studyhubDesktop?.studyDatabase?.save?.(useStudyStore.getState());
    window.studyhubDesktop?.notifyStudyDataChanged?.();
  };
  const createQuickTask = async (event) => {
    event.preventDefault();
    const title = quickTaskTitle.trim();
    if (!title) return;
    addTask({
      title,
      status: "pending",
      priority: "medium",
      dueDate: getLocalDateKey(),
      isTodayTask: true,
      type: "task",
    });
    setQuickTaskTitle("");
    await window.studyhubDesktop?.studyDatabase?.save?.(useStudyStore.getState());
    window.studyhubDesktop?.notifyStudyDataChanged?.();
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-transparent p-2 pt-4 font-sans text-white">
      <span className="absolute right-20 top-2 z-10 h-4 w-4 rotate-45 border-l border-t border-white/15 bg-[#171b24]" />
      <div className="relative flex h-full flex-col overflow-hidden rounded-[28px] border border-white/15 bg-[#171b24]/[0.98] shadow-[0_28px_80px_rgba(0,0,0,0.55)]">
        <header className="flex items-center gap-3 px-6 pb-4 pt-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#8063ff] to-[#536fe9] shadow-lg shadow-violet-500/20">
            <Icon className="text-[26px]" name="bookmark" filled />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[20px] font-black tracking-tight">StudyHub</h1>
            <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-400"><span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_0_5px_rgba(52,211,153,0.13)]" />Sincronizado agora</p>
          </div>
          <button className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06] text-slate-300 transition hover:bg-white/10 hover:text-white" onClick={() => runAction("settings")} title="Configurações" type="button"><Icon name="settings" /></button>
        </header>

        <section className="mx-5 rounded-2xl border border-violet-300/15 bg-gradient-to-br from-[#343552] to-[#25343d] p-4 shadow-inner">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-violet-300">{pomodoro.mode === "focus" ? "Sessão de foco" : "Intervalo"}</p><h2 className="mt-2 truncate text-lg font-bold">{focusTask?.title || "Foco livre"}</h2></div>
            <div className="flex shrink-0 items-center gap-2">
              <button className="rounded-xl bg-[#7454ed] px-5 py-2.5 text-sm font-black shadow-lg shadow-violet-950/30 transition hover:bg-[#8063ff]" onClick={() => pomodoro.isActive ? pomodoro.pauseTimer() : pomodoro.startTimer()} type="button">{pomodoro.isActive ? "Pausar" : "Iniciar"}</button>
              <button aria-label="Abrir widget do Pomodoro" className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/[0.08] text-violet-200 transition hover:bg-white/[0.16]" onClick={() => runAction("pomodoro-widget")} title="Abrir widget do Pomodoro" type="button"><Icon name="open_in_new" /></button>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-4"><strong className="text-[34px] font-black tabular-nums tracking-tight">{formatTimer(pomodoro.timeLeft)}</strong><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-violet-400 transition-all" style={{ width: `${progress}%` }} /></div></div>
        </section>

        <section className="px-6 pt-5">
          <div className="mb-3 flex items-center justify-between"><h3 className="text-xs font-black uppercase tracking-[0.14em] text-slate-300">Para hoje</h3><span className="rounded-lg bg-violet-500/20 px-2 py-1 text-xs font-black text-violet-300">{displayedTasks.length}</span></div>
          <form className="mb-2 flex items-center rounded-xl border border-white/10 bg-white/[0.045] p-1 focus-within:border-violet-400/50 focus-within:bg-white/[0.07]" onSubmit={createQuickTask}>
            <input autoComplete="off" autoFocus className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500" onChange={(event) => setQuickTaskTitle(event.target.value)} placeholder="Adicionar tarefa para hoje..." type="text" value={quickTaskTitle} />
            <button aria-label="Adicionar tarefa" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500 text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40" disabled={!quickTaskTitle.trim()} title="Adicionar tarefa" type="submit"><Icon className="text-[18px]" name="add" /></button>
          </form>
          <div className="max-h-[126px] space-y-2 overflow-y-auto pr-1">
            {displayedTasks.length ? displayedTasks.map((task) => (
              <div className="group flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5 transition hover:border-violet-400/30 hover:bg-white/[0.06]" key={task.id}>
                <button aria-label={task.status === "completed" || task.completed ? "Reabrir tarefa" : "Concluir tarefa"} className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition ${task.status === "completed" || task.completed ? "border-violet-400 bg-violet-500 text-white" : "border-slate-500 hover:border-violet-400"}`} onClick={() => toggleTask(task)} type="button">{(task.status === "completed" || task.completed) && <Icon className="text-[14px]" name="check" />}</button>
                <button className="min-w-0 flex-1 text-left" onClick={() => toggleTask(task)} type="button"><strong className={`block truncate text-sm ${task.status === "completed" || task.completed ? "text-slate-500 line-through" : ""}`}>{task.title}</strong><small className="mt-0.5 block truncate text-[11px] text-slate-400">{task.status === "completed" || task.completed ? "Concluída" : task.dueDate ? `Vence ${isDueToday(task) ? "hoje" : task.dueDate}` : "Sem prazo"}{task.priority === "high" ? " · prioridade alta" : ""}</small></button>
                <button aria-label={`Excluir ${task.title}`} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-red-500/15 hover:text-red-300" onClick={() => removeTask(task)} title="Excluir tarefa" type="button"><Icon className="text-[17px]" name="close" /></button>
              </div>
            )) : <p className="rounded-xl border border-dashed border-white/10 py-5 text-center text-xs text-slate-500">Nenhuma tarefa pendente.</p>}
          </div>
        </section>

        <section className="px-6 pt-5">
          <h3 className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-slate-300">Ações rápidas</h3>
          <div className="grid grid-cols-2 gap-2">
            <button className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-left transition hover:bg-white/[0.08]" onClick={() => runAction("translate-text")} type="button"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300"><Icon name="translate" /></span><span><strong className="block text-sm">Traduzir texto</strong><small className="text-[10px] text-slate-500">⌘⇧⌥3</small></span></button>
            <button className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-left transition hover:bg-white/[0.08]" onClick={() => runAction("translate-area")} type="button"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300"><Icon name="screenshot_region" /></span><span><strong className="block text-sm">Traduzir área</strong><small className="text-[10px] text-slate-500">⌘⇧⌥4</small></span></button>
          </div>
        </section>

        <footer className="mt-auto flex items-center gap-3 border-t border-white/10 bg-white/[0.025] p-5">
          <button className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-violet-500/20 py-3 text-sm font-black text-violet-300 transition hover:bg-violet-500/30" onClick={() => runAction("open-app")} type="button"><Icon name="open_in_new" />Abrir StudyHub</button>
          <button className="rounded-xl px-4 py-3 text-sm font-semibold text-slate-400 transition hover:bg-red-500/10 hover:text-red-300" onClick={() => runAction("quit")} type="button">Sair</button>
        </footer>
      </div>
    </div>
  );
}
