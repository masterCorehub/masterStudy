import { useEffect, useState } from "react";
import { Icon } from "../ui/Icon";
import { usePomodoroStore } from "../store/usePomodoroStore";
import { useStudyStore } from "../store/useStore";
import { motion, AnimatePresence } from "framer-motion";

function formatSeconds(secs) {
  const s = Math.max(0, Math.floor(secs || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`;
  return `${pad(m)}:${pad(sec)}`;
}

export function PomodoroScreen() {
  const store = usePomodoroStore();
  const tasksList = useStudyStore((state) => state.tasks?.list) || [];
  const focusSessions = useStudyStore((state) => state.focusSessions || []);
  const updateTask = useStudyStore((state) => state.updateTask);
  const addTask = useStudyStore((state) => state.addTask);
  const clearFocusSessions = useStudyStore((state) => state.clearFocusSessions);

  const [showSettings, setShowSettings] = useState(false);
  const [showSounds, setShowSounds] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [quickTaskName, setQuickTaskName] = useState("");
  const [quickTaskPomodoros, setQuickTaskPomodoros] = useState(1);
  const [spotify, setSpotify] = useState({ configured: false, connected: false, track: null, isPlaying: false, error: "" });

  useEffect(() => {
    let cancelled = false;
    const api = window.studyhubDesktop?.spotify;
    if (!api) return undefined;
    api.status().then((status) => {
      if (!cancelled) setSpotify((current) => ({ ...current, ...status }));
      if (status?.connected) api.playback().then((playback) => {
        if (!cancelled) setSpotify((current) => ({ ...current, track: playback?.item || null, isPlaying: Boolean(playback?.is_playing) }));
      }).catch(() => {});
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const spotifyAction = async (action) => {
    try {
      const result = await action();
      const playback = result?.item ? result : await window.studyhubDesktop.spotify.playback().catch(() => null);
      setSpotify((current) => ({ ...current, track: playback?.item || current.track, isPlaying: Boolean(playback?.is_playing) }));
    } catch (error) {
      setSpotify((current) => ({ ...current, error: error?.message || "Falha no Spotify." }));
    }
  };

  const connectSpotify = async () => {
    try {
      await window.studyhubDesktop.spotify.login();
      setSpotify((current) => ({ ...current, connected: true, error: "" }));
    } catch (error) {
      setSpotify((current) => ({ ...current, error: error?.message || "Não foi possível conectar ao Spotify." }));
    }
  };

  const handleQuickAdd = () => {
    if (!quickTaskName.trim()) return;
    const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newTask = {
      id,
      title: quickTaskName,
      description: "",
      status: "pending",
      priority: "medium",
      dueDate: "",
      courseId: "",
      category: "",
      type: "task",
      estimatedPomodoros: quickTaskPomodoros,
    };
    addTask(newTask);
    // Select the newly created task for focus
    store.toggleTaskSelection(id);
    setQuickTaskName("");
    setQuickTaskPomodoros(1);
  };

  const [settings, setSettings] = useState({
    focusTime: store.focusTime,
    shortBreakTime: store.shortBreakTime,
    longBreakTime: store.longBreakTime,
    cyclesBeforeLongBreak: store.cyclesBeforeLongBreak || 4,
  });

  // The timer engine has been moved globally to AppShell
  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const getModeColor = (mode) => {
    if (mode === "focus") return "text-[color:var(--error)]";
    if (mode === "shortBreak") return "text-[color:var(--primary)]";
    return "text-[color:var(--secondary)]";
  };

  const getModeBg = (mode) => {
    if (mode === "focus") return "bg-[color:var(--error)]/10";
    if (mode === "shortBreak") return "bg-[color:var(--primary)]/10";
    return "bg-[color:var(--secondary)]/10";
  };

  const toggleTask = (taskId, currentStatus) => {
    updateTask(taskId, {
      status: currentStatus === "completed" ? "pending" : "completed",
    });
  };

  const toggleTaskSubtask = (task, subtaskId) => {
    updateTask(task.id, {
      subtasks: (task.subtasks || []).map((subtask) =>
        subtask.id === subtaskId
          ? { ...subtask, completed: !subtask.completed }
          : subtask,
      ),
    });
  };

  const openWidget = () => {
    if (window.studyhubDesktop && window.studyhubDesktop.openPomodoroWidget) {
      window.studyhubDesktop.openPomodoroWidget();
    } else {
      // Browsers cannot create an always-on-top native window. The full
      // Pomodoro screen remains the web fallback, so the action is still
      // useful instead of failing with a desktop-only alert.
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const pendingTasks = tasksList.filter((t) => t.status !== "completed");
  const selectedTaskIds = store.selectedTasks || [];
  const selectedTasks = tasksList.filter((task) => selectedTaskIds.includes(task.id));
  const activeTask = selectedTasks[0];
  const recentSessions = focusSessions
    .filter((session) => session.status === "completed")
    .slice()
    .sort(
      (left, right) =>
        Number(right.completedAt || right.startedAt || 0) -
        Number(left.completedAt || left.startedAt || 0),
    )
    .slice(0, 3);
  const sessionLabel =
    store.mode === "focus"
      ? "DEEP WORK"
      : store.mode === "shortBreak"
        ? "SHORT BREAK"
        : "LONG BREAK";
  const cycles = Number(store.cyclesBeforeLongBreak) || 4;
  const nextPauseLabel =
    store.mode === "focus"
      ? store.pomodorosCompleted % cycles === cycles - 1
        ? "Próxima pausa longa"
        : "Próxima pausa curta"
      : "Próxima sessão de foco";
  const modeAccent =
    store.mode === "focus"
      ? "var(--error)"
      : store.mode === "shortBreak"
        ? "var(--primary)"
        : "var(--tertiary)";
  const timerBase =
    store.mode === "focus"
      ? store.focusTime * 60
      : store.mode === "shortBreak"
        ? store.shortBreakTime * 60
        : store.longBreakTime * 60;
  const progress = Math.max(
    0,
    Math.min(1, 1 - store.timeLeft / Math.max(timerBase, 1)),
  );
  const cycleIndex = (store.pomodorosCompleted % cycles) + 1;
  const formatSessionTime = (timestamp) => {
    if (!timestamp) return "--:--";
    return new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(timestamp));
  };
  const formatDuration = (session) => {
    const minutes =
      Number(session.durationMinutes || session.minutes || 0) ||
      Math.round(Number(session.actualSeconds || 0) / 60);
    return `${minutes || 25}m`;
  };
  const skipSession = () => {
    if (store.skipPhase) {
      store.skipPhase();
    } else {
      // fallback to previous behavior
      if (store.mode === "focus") {
        const cyclesLocal = Number(store.cyclesBeforeLongBreak) || 4;
        const nextMode =
          store.pomodorosCompleted % cyclesLocal === cyclesLocal - 1 ? "longBreak" : "shortBreak";
        store.setMode(nextMode);
        store.startTimer();
        return;
      }
      store.setMode("focus");
      store.startTimer();
    }
  };

  return (
    <div className="pomodoro-screen flex-1 overflow-y-auto bg-[#f7f8fb] px-0 py-0">
      <div className="grid min-h-full grid-cols-1 xl:grid-cols-[1fr_340px]">
        <section className="px-6 py-6 md:px-10 md:py-8">
          <div className="mx-auto flex w-full max-w-[760px] flex-col items-center">
            
            {/* Top Bar / Cycle Header */}
            <div className="flex w-full items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex gap-2">
                  {Array.from({ length: Number(store.cyclesBeforeLongBreak) || 4 }).map((_, index) => (
                    <span
                      key={index}
                      className={`h-[4px] w-10 rounded-full ${
                        index < cycleIndex ? "bg-[#111d34]" : "bg-[#d7dce5]"
                      }`}
                    />
                  ))}
                </div>
                <span className="text-xs font-black uppercase tracking-[0.2em] text-[#334155]">
                  Ciclo {cycleIndex} de {Number(store.cyclesBeforeLongBreak) || 4}
                </span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={openWidget}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#dbe2ea] bg-white text-[#0f172a] shadow-sm transition hover:bg-[#f2f5f9]"
                  title="Abrir Pop-up Flutuante"
                >
                  <Icon name="pip" className="text-sm" />
                </button>
                <button
                  onClick={() => setShowSounds(true)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#dbe2ea] bg-white text-[#0f172a] shadow-sm transition hover:bg-[#f2f5f9]"
                  title="Som Ambiente"
                >
                  <Icon name="music_note" className="text-sm" />
                </button>
                <button
                  onClick={() => setShowSettings(true)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#dbe2ea] bg-white text-[#0f172a] shadow-sm transition hover:bg-[#f2f5f9]"
                  title="Configurações"
                >
                  <Icon name="settings" className="text-sm" />
                </button>
              </div>
            </div>

            {/* Timer Hero Circle */}
            <div className="mt-6 flex flex-col items-center">
              <div
                className="relative flex h-[280px] w-[280px] items-center justify-center rounded-full shadow-lg"
                style={{
                  background: `conic-gradient(from 0deg, #1e293b ${Math.max(progress * 360, 5)}deg, #e7edf4 ${Math.max(progress * 360, 5)}deg 360deg)`,
                }}
              >
                <div className="flex h-[272px] w-[272px] items-center justify-center rounded-full bg-[#f7f8fb]">
                  <div className="flex h-[220px] w-[220px] flex-col items-center justify-center rounded-full border border-[#e6ebf2] bg-white shadow-inner">
                    <strong className="font-mono text-[64px] font-black leading-none tracking-[-0.08em] text-[#0b1730]">
                      {formatTime(store.timeLeft)}
                    </strong>
                    <p className="mt-2 text-xs font-black uppercase tracking-[0.25em] text-[#475569]">
                      {sessionLabel}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Main Action Buttons */}
            <section className="mt-6 flex items-center gap-5">
              <button
                type="button"
                onClick={() => store.resetTimer()}
                className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#dbe2ea] bg-white text-[#0f172a] shadow-sm transition hover:bg-[#f4f7fb] active:scale-95"
                title="Reiniciar"
              >
                <Icon name="stop" className="text-lg" />
              </button>

              <button
                type="button"
                onClick={() =>
                  store.isActive ? store.pauseTimer() : store.startTimer()
                }
                className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0b1730] text-white shadow-[0_12px_28px_rgba(11,23,48,0.22)] transition hover:brightness-110 active:scale-95"
                title={store.isActive ? "Pausar" : "Iniciar"}
              >
                <Icon name={store.isActive ? "pause" : "play_arrow"} className="text-2xl" />
              </button>

              <button
                type="button"
                onClick={skipSession}
                className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#dbe2ea] bg-white text-[#0f172a] shadow-sm transition hover:bg-[#f4f7fb] active:scale-95"
                title="Pular"
              >
                <Icon name="skip_next" className="text-lg" />
              </button>
            </section>

            {/* Chosen Tasks Section */}
            <section className="mt-6 w-full max-w-[720px] rounded-[1.25rem] bg-white border border-[#e2e8f0] p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3 border-b border-[#f1f5f9] pb-3">
                <div className="flex items-center gap-2">
                  <Icon name="task_alt" className="text-base text-[color:var(--primary)]" />
                  <p className="text-xs font-black uppercase tracking-[0.15em] text-[#334155]">
                    Tarefas Escolhidas ({selectedTasks.length})
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowTaskModal(true)}
                    className="px-3.5 py-1.5 rounded-xl bg-[color:var(--primary)] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm hover:opacity-90 transition-opacity"
                  >
                    <Icon name="playlist_add" className="text-sm" /> Selecionar / Criar Tarefas
                  </button>
                  {selectedTasks.length > 0 && (
                    <button
                      type="button"
                      onClick={() => store.clearSelectedTasks()}
                      className="px-2.5 py-1.5 rounded-xl border border-[#cbd5e1] text-xs font-bold text-[#64748b] hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Limpar seleção"
                    >
                      Limpar
                    </button>
                  )}
                </div>
              </div>

              <div className="w-full text-left">
                {selectedTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 text-center border-2 border-dashed border-[#e2e8f0] rounded-xl bg-[#f8fafc]">
                    <Icon name="assignment" className="text-3xl text-[#94a3b8] mb-1" />
                    <span className="text-sm font-bold text-[#475569]">Nenhuma tarefa selecionada</span>
                    <span className="text-xs text-[#94a3b8] mt-0.5">Clique acima para escolher em qual tarefa focar agora</span>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5 max-h-[360px] overflow-y-auto custom-scrollbar pr-1">
                    {selectedTasks.map((task) => (
                      <div
                        key={task.id}
                        className={`rounded-xl border px-4 py-3 shadow-xs transition ${
                          task.status === "completed"
                            ? "border-green-200 bg-green-50/50"
                            : "border-[#e2e8f0] bg-white hover:border-[#cbd5e1]"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <button
                            type="button"
                            onClick={() => toggleTask(task.id, task.status)}
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                              task.status === "completed"
                                ? "border-green-600 bg-green-600 text-white"
                                : "border-[#cbd5e1] bg-white text-transparent hover:border-[#0b1730]"
                            }`}
                            title={task.status === "completed" ? "Reabrir tarefa" : "Concluir tarefa"}
                          >
                            <Icon name="check" className="text-[12px]" />
                          </button>

                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <strong className={`text-sm font-bold truncate ${task.status === "completed" ? "text-green-800 line-through" : "text-[#0f172a]"}`}>
                                {task.title}
                              </strong>
                              {task.category ? (
                                <span className="text-[10px] px-2 py-0.5 rounded bg-[#f1f5f9] text-[#64748b] font-semibold">{task.category}</span>
                              ) : null}
                              {task.estimatedPomodoros > 0 && (
                                <span className="text-[10px] px-2 py-0.5 rounded text-rose-600 bg-rose-50 font-bold">{task.estimatedPomodoros} foco(s)</span>
                              )}
                            </div>

                            {task.subtasks?.length ? (
                              <div className="mt-2 flex flex-col gap-1.5">
                                {(task.subtasks || []).map((subtask) => (
                                  <button
                                    key={subtask.id}
                                    type="button"
                                    onClick={() => toggleTaskSubtask(task, subtask.id)}
                                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition text-xs ${
                                      subtask.completed
                                        ? "border-green-200 bg-green-50 text-green-800"
                                        : "border-[#e2e8f0] bg-[#f8fafc] text-[#0f172a]"
                                    }`}
                                  >
                                    <span
                                      className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${
                                        subtask.completed
                                          ? "border-green-600 bg-green-600 text-white"
                                          : "border-[#cbd5e1] bg-white text-transparent"
                                      }`}
                                    >
                                      <Icon name="check" className="text-[10px]" />
                                    </span>
                                    <span className={subtask.completed ? "line-through opacity-80" : ""}>
                                      {subtask.title || "Subtarefa sem título"}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>

                          <button
                            title="Remover da sessão de foco"
                            onClick={() => store.toggleTaskSelection(task.id)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#e2e8f0] bg-white text-[#94a3b8] hover:text-red-500 hover:border-red-200 transition"
                          >
                            <Icon name="close" className="text-xs" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        </section>

        {/* Sidebar: Session History */}
        <aside className="border-l border-[#e3e8ef] bg-[#f1f5f9] px-6 py-6 overflow-y-auto max-h-screen custom-scrollbar">
          <div className="flex items-center justify-between gap-2 border-b border-[#e2e8f0] pb-4">
            <div>
              <h2 className="text-lg font-black text-[#0f172a]">Histórico de Sessões</h2>
              <p className="text-xs text-[#64748b] font-medium">Registros de Foco de Hoje</p>
            </div>
            {recentSessions.length > 0 && (
              <button
                onClick={() => {
                  if (window.confirm('Limpar histórico de sessões de foco?')) clearFocusSessions();
                }}
                title="Limpar histórico"
                className="h-7 px-2.5 rounded-lg bg-white border border-[#cbd5e1] text-xs font-bold text-[#64748b] hover:text-red-500 hover:border-red-200 transition-colors"
              >
                Limpar
              </button>
            )}
          </div>

          <div className="mt-4 space-y-3">
            {recentSessions.map((session) => {
              const relatedTask = tasksList.find(
                (task) => task.id === session.taskId,
              );
              return (
                <article
                  key={session.id}
                  className="rounded-2xl bg-white p-4 shadow-sm border border-[#e2e8f0]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-sm font-black text-[#0f172a]">
                      {formatSessionTime(session.startedAt)} - {formatSessionTime(session.completedAt)}
                    </strong>
                    <span className="rounded-md bg-[#e2e8f0] px-2 py-0.5 text-[11px] font-black text-[#334155]">
                      {formatDuration(session)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs font-bold text-[#1e293b]">
                    {relatedTask?.title || "Sessão de Estudo Concluída"}
                  </p>
                  <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[#64748b] font-semibold">
                    <span className="h-2 w-2 rounded-full bg-[color:var(--primary)]" />
                    {relatedTask?.category || "Pomodoro"}
                  </p>
                </article>
              );
            })}

            {!recentSessions.length ? (
              <article className="rounded-2xl bg-white p-5 text-center text-xs text-[#64748b] font-medium border border-[#e2e8f0] shadow-xs">
                Nenhuma sessão concluída hoje ainda.
              </article>
            ) : null}
          </div>
        </aside>
      </div>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="neo-raised p-8 rounded-[2rem] w-full max-w-md bg-[color:var(--surface)]"
            >
              <h3 className="text-2xl font-bold mb-6 text-[color:var(--on-surface)] flex items-center gap-2">
                <Icon name="settings" /> Configurações do Pomodoro
              </h3>

              <div className="flex flex-col gap-4 mb-8">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-bold text-[color:var(--on-surface-variant)]">
                    Tempo de Foco (minutos)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="90"
                    value={settings.focusTime}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        focusTime: parseInt(e.target.value) || 25,
                      })
                    }
                    className="w-full neo-inset p-3 rounded-xl bg-transparent outline-none"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-bold text-[color:var(--on-surface-variant)]">
                    Pausa Curta (minutos)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={settings.shortBreakTime}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        shortBreakTime: parseInt(e.target.value) || 5,
                      })
                    }
                    className="w-full neo-inset p-3 rounded-xl bg-transparent outline-none"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-bold text-[color:var(--on-surface-variant)]">
                    Pausa Longa (minutos)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={settings.longBreakTime}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        longBreakTime: parseInt(e.target.value) || 15,
                      })
                    }
                    className="w-full neo-inset p-3 rounded-xl bg-transparent outline-none"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-bold text-[color:var(--on-surface-variant)]">
                    Ciclos antes da pausa longa
                  </label>
                  <input
                    type="number"
                    min="2"
                    max="12"
                    value={settings.cyclesBeforeLongBreak}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        cyclesBeforeLongBreak: parseInt(e.target.value) || 4,
                      })
                    }
                    className="w-full neo-inset p-3 rounded-xl bg-transparent outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setShowSettings(false)}
                  className="flex-1 py-3 rounded-xl neo-inset font-bold text-[color:var(--on-surface-variant)]"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    store.updateSettings(settings);
                    setShowSettings(false);
                  }}
                  className="flex-1 py-3 rounded-xl neo-raised text-[color:var(--primary)] font-bold"
                >
                  Salvar
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Sounds Modal */}
        {showSounds && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="neo-raised p-6 md:p-8 rounded-[2rem] w-full max-w-lg bg-[color:var(--surface)] max-h-[85vh] overflow-y-auto custom-scrollbar border border-[color:var(--outline-variant)]/40 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6 sticky top-0 bg-[color:var(--surface)] z-10 pb-2 border-b border-[color:var(--outline-variant)]/20">
                <h3 className="text-2xl font-bold text-[color:var(--on-surface)] flex items-center gap-2">
                  <Icon name="music_note" className="text-[color:var(--primary)]" /> Sons Relaxantes
                </h3>
                <button
                  onClick={() => setShowSounds(false)}
                  className="w-10 h-10 neo-raised rounded-full flex items-center justify-center text-[color:var(--on-surface-variant)] hover:text-[color:var(--error)] transition-colors"
                >
                  <Icon name="close" />
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
                {[
                  { id: "none", label: "Silêncio", icon: "volume_off" },
                  { id: "rain", label: "Chuva", icon: "water_drop" },
                  { id: "nature", label: "Natureza", icon: "forest" },
                  { id: "coffee", label: "Cafeteria", icon: "local_cafe" },
                  {
                    id: "fireplace",
                    label: "Lareira",
                    icon: "local_fire_department",
                  },
                  { id: "lofi", label: "Lofi", icon: "headphones" },
                  { id: "youtube", label: "YouTube", icon: "youtube_activity" },
                ].map((sound) => (
                  <button
                    key={sound.id}
                    onClick={() => store.setActiveSound(sound.id)}
                    className={`flex flex-col items-center gap-2 p-3.5 rounded-2xl transition-all ${store.activeSound === sound.id ? "neo-inset text-[color:var(--primary)] border border-[color:var(--primary)]/30 font-bold" : "neo-raised text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)] font-medium"}`}
                  >
                    <Icon name={sound.icon} className="text-2xl" />
                    <span className="text-xs">{sound.label}</span>
                  </button>
                ))}
              </div>

              {store.activeSound === "youtube" && (
                <div className="mb-6 rounded-2xl border border-[color:var(--outline-variant)]/40 bg-[color:var(--background)] p-4 flex flex-col gap-4 shadow-sm">
                  <div>
                    <label className="text-xs font-bold text-[color:var(--on-surface)] mb-2 flex items-center justify-between">
                      <span>Link do vídeo / live do YouTube</span>
                      {store.youtubeUrl && (
                        <span className="text-[10px] text-[color:var(--primary)] font-normal">Link inserido</span>
                      )}
                    </label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={store.youtubeUrl || ""} 
                        onChange={(e) => store.setYoutubeUrl(e.target.value)}
                        placeholder="Ex: https://www.youtube.com/watch?v=..."
                        className="flex-1 h-11 rounded-xl border border-[color:var(--outline-variant)]/40 px-3.5 neo-inset text-xs font-mono outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => store.setYoutubePlaying(!store.youtubePlaying)}
                        className={`h-11 px-4 rounded-xl font-bold text-xs flex items-center gap-1.5 shrink-0 transition-all ${store.youtubePlaying ? "bg-red-500 text-white shadow-md hover:bg-red-600" : "bg-[color:var(--primary)] text-white shadow-md hover:opacity-90"}`}
                      >
                        <Icon name={store.youtubePlaying ? "pause" : "play_arrow"} />
                        {store.youtubePlaying ? "Pausar" : "Tocar"}
                      </button>
                    </div>
                  </div>

                  {/* Arrastar Tempo do Vídeo */}
                  <div className="flex flex-col gap-2 pt-3 border-t border-[color:var(--outline-variant)]/30">
                    <div className="flex items-center justify-between text-xs font-bold text-[color:var(--on-surface)]">
                      <span className="flex items-center gap-1.5">
                        <Icon name="schedule" className="text-sm text-[color:var(--primary)]" />
                        Tempo Atual da Música
                      </span>
                      <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-[color:var(--surface)] border border-[color:var(--outline-variant)]/40 text-[color:var(--primary)] font-black">
                        {formatSeconds(store.audioCurrentTime || 0)}
                      </span>
                    </div>

                    <input 
                      type="range" 
                      min="0"
                      max="7200"
                      step="10"
                      value={store.youtubeStartTime || 0} 
                      onChange={(e) => store.setYoutubeStartTime(Number(e.target.value))}
                      className="w-full h-2 rounded-lg cursor-pointer appearance-none bg-[color:var(--outline-variant)]/40 accent-[color:var(--primary)]"
                    />

                    <div className="flex items-center justify-between text-[10px] text-[color:var(--on-surface-variant)] pt-1">
                      <span>00:00</span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => store.setYoutubeStartTime(Math.max(0, (store.youtubeStartTime || 0) - 60))}
                          className="px-2 py-1 rounded-md bg-[color:var(--surface)] hover:bg-[color:var(--surface-bright)] border border-[color:var(--outline-variant)]/30 font-semibold"
                        >
                          -1m
                        </button>
                        <button
                          type="button"
                          onClick={() => store.setYoutubeStartTime((store.youtubeStartTime || 0) + 60)}
                          className="px-2 py-1 rounded-md bg-[color:var(--surface)] hover:bg-[color:var(--surface-bright)] border border-[color:var(--outline-variant)]/30 font-semibold"
                        >
                          +1m
                        </button>
                        <button
                          type="button"
                          onClick={() => store.setYoutubeStartTime((store.youtubeStartTime || 0) + 300)}
                          className="px-2 py-1 rounded-md bg-[color:var(--surface)] hover:bg-[color:var(--surface-bright)] border border-[color:var(--outline-variant)]/30 font-semibold"
                        >
                          +5m
                        </button>
                      </div>
                      <span>2:00:00</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="mb-6 rounded-2xl border border-[color:var(--outline-variant)] bg-[color:var(--background)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-[color:var(--on-surface)]">Spotify</p>
                    <p className="truncate text-xs text-[color:var(--on-surface-variant)]">
                      {spotify.connected ? (spotify.track ? `${spotify.track.name} · ${spotify.track.artists?.map((artist) => artist.name).join(", ")}` : "Conectado") : "Controle sua música durante o foco"}
                    </p>
                  </div>
                  {!spotify.connected ? (
                    <button onClick={connectSpotify} className="rounded-xl bg-[#1ed760] px-3 py-2 text-xs font-black text-black">Conectar</button>
                  ) : (
                    <button onClick={() => { store.setActiveSound("spotify"); spotifyAction(() => spotify.isPlaying ? window.studyhubDesktop.spotify.pause() : window.studyhubDesktop.spotify.play()); }} className="rounded-xl bg-[#1ed760] px-3 py-2 text-xs font-black text-black">{spotify.isPlaying ? "Pausar" : "Tocar"}</button>
                  )}
                </div>
                {spotify.connected && (
                  <div className="mt-3 flex items-center gap-2">
                    <button onClick={() => spotifyAction(() => window.studyhubDesktop.spotify.previous())} className="flex-1 rounded-xl border border-[color:var(--outline-variant)] py-2 text-xs font-bold">Anterior</button>
                    <button onClick={() => spotifyAction(() => window.studyhubDesktop.spotify.next())} className="flex-1 rounded-xl border border-[color:var(--outline-variant)] py-2 text-xs font-bold">Próxima</button>
                  </div>
                )}
                {spotify.error && <p className="mt-2 text-xs text-[color:var(--error)]">{spotify.error}</p>}
              </div>

              {store.activeSound !== "none" && (
                <div className="flex flex-col gap-2 bg-[color:var(--background)] neo-inset p-4 rounded-2xl">
                  <label className="text-sm font-bold text-[color:var(--on-surface-variant)] flex justify-between">
                    <span>Volume</span>
                    <span>{Math.round(store.soundVolume * 100)}%</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={store.soundVolume}
                    onChange={(e) =>
                      store.setSoundVolume(parseFloat(e.target.value))
                    }
                    className="w-full h-2 bg-[color:var(--outline-variant)] rounded-full appearance-none cursor-pointer"
                  />
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Select/Add Task Modal */}
      <AnimatePresence>
        {showTaskModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="neo-raised p-8 rounded-[2rem] w-full max-w-lg bg-[color:var(--surface)] max-h-[80vh] flex flex-col"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-[color:var(--on-surface)] flex items-center gap-2">
                  <Icon name="playlist_add" /> Adicionar Tarefa
                </h3>
                <button
                  onClick={() => setShowTaskModal(false)}
                  className="w-10 h-10 rounded-full neo-inset flex items-center justify-center text-[color:var(--on-surface-variant)] hover:text-[color:var(--error)]"
                >
                  <Icon name="close" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 flex flex-col gap-6">
                {/* Create Quick Task */}
                <div className="flex flex-col gap-3">
                  <h4 className="text-sm font-bold text-[color:var(--primary)] uppercase tracking-wider">
                    Criar Nova
                  </h4>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={quickTaskName}
                      onChange={(e) => setQuickTaskName(e.target.value)}
                      placeholder="O que você precisa fazer?"
                      className="flex-1 neo-inset rounded-xl px-4 py-3 bg-transparent text-sm outline-none"
                      onKeyDown={(e) => e.key === "Enter" && handleQuickAdd()}
                    />
                    <div className="w-24 neo-inset rounded-xl flex items-center px-2 bg-transparent">
                      <Icon
                        name="local_fire_department"
                        className="text-[color:var(--error)] text-lg"
                      />
                      <input
                        type="number"
                        min="1"
                        value={quickTaskPomodoros}
                        onChange={(e) =>
                          setQuickTaskPomodoros(parseInt(e.target.value) || 1)
                        }
                        className="w-full bg-transparent outline-none text-center font-bold"
                        title="Estimativa de Focos"
                      />
                    </div>
                    <button
                      onClick={handleQuickAdd}
                      className="w-12 rounded-xl neo-raised flex items-center justify-center text-[color:var(--primary)] hover:neo-inset transition-all"
                      title="Adicionar e Salvar"
                    >
                      <Icon name="add" className="text-xl" />
                    </button>
                  </div>
                </div>

                {/* Select Existing Tasks */}
                <div className="flex flex-col gap-3">
                  <h4 className="text-sm font-bold text-[color:var(--secondary)] uppercase tracking-wider">
                    Selecionar Existentes
                  </h4>
                  <div className="flex flex-col gap-2 neo-inset p-3 rounded-2xl min-h-[150px]">
                    {pendingTasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center justify-between p-3 hover:bg-[color:var(--surface)] rounded-xl cursor-pointer group transition-colors"
                        onClick={() => store.toggleTaskSelection(task.id)}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-5 h-5 rounded-md flex items-center justify-center border-2 transition-colors ${store.selectedTasks.includes(task.id) ? "bg-[color:var(--primary)] border-[color:var(--primary)] text-white" : "border-[color:var(--outline-variant)]/50"}`}
                          >
                            {store.selectedTasks.includes(task.id) && (
                              <Icon name="check" className="text-[12px]" />
                            )}
                          </div>
                          <span
                            className={`text-sm font-medium line-clamp-1 ${store.selectedTasks.includes(task.id) ? "text-[color:var(--primary)]" : "text-[color:var(--on-surface)]"}`}
                          >
                            {task.title}
                          </span>
                        </div>
                        {task.estimatedPomodoros > 0 && (
                          <div className="flex items-center gap-1 text-[10px] font-bold text-[color:var(--error)] bg-[color:var(--error)]/10 px-2 py-0.5 rounded-full">
                            <Icon
                              name="local_fire_department"
                              className="text-[12px]"
                            />{" "}
                            {task.estimatedPomodoros}
                          </div>
                        )}
                      </div>
                    ))}
                    {pendingTasks.length === 0 && (
                      <p className="text-sm text-center m-auto text-[color:var(--on-surface-variant)]">
                        Nenhuma tarefa pendente encontrada.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
