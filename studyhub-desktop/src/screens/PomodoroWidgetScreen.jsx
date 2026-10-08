import { useEffect, useMemo, useState } from "react";
import { Icon } from "../ui/Icon";
import { usePomodoroStore } from "../store/usePomodoroStore";
import { useStudyStore } from "../store/useStore";

const MODES = [
  { id: "focus", label: "Foco", icon: "adjust" },
  { id: "shortBreak", label: "Pausa", icon: "coffee" },
  { id: "longBreak", label: "Longa", icon: "park" },
];

const formatTime = (seconds) => {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const remaining = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remaining}`;
};

export function PomodoroWidgetScreen() {
  const store = usePomodoroStore();
  const [showConfigModal, setShowConfigModal] = useState(false);
  const tasks = useStudyStore((state) => state.tasks?.list || []);
  const activeTask = useMemo(
    () => tasks.find((task) => task.id === store.selectedTasks[0]),
    [store.selectedTasks, tasks],
  );
  const activeMode = MODES.find((mode) => mode.id === store.mode) || MODES[0];
  const modeAccent =
    store.mode === "focus"
      ? "var(--error)"
      : store.mode === "shortBreak"
        ? "var(--primary)"
        : "var(--tertiary)";
  const baseTime =
    store.mode === "focus"
      ? store.focusTime * 60
      : store.mode === "shortBreak"
        ? store.shortBreakTime * 60
        : store.longBreakTime * 60;
  const progress = Math.max(
    0,
    Math.min(100, ((baseTime - store.timeLeft) / baseTime) * 100),
  );
  const controls = window.studyhubDesktop?.windowControls;

  const toggleTimer = () => {
    if (store.isActive) {
      store.pauseTimer();
    } else {
      store.startTimer();
    }
  };

  const skip = () => {
    store.skipTimer();
  };

  useEffect(() => {
    if (!store.isActive || !store.endTime) return undefined;
    const interval = window.setInterval(() => store.syncTick(), 1000);
    return () => window.clearInterval(interval);
  }, [store.endTime, store.isActive, store.syncTick]);

  return (
    <main 
      style={{ WebkitAppRegion: "drag" }}
      className="pomodoro-widget-window flex h-screen w-screen items-center justify-center p-2 select-none font-sans bg-transparent cursor-grab active:cursor-grabbing"
    >
      <div 
        style={{ WebkitAppRegion: "drag" }}
        className="pomodoro-widget-card relative flex h-full w-full flex-col justify-between rounded-[2.5rem] p-5 shadow-2xl border border-white/20 dark:border-white/10 bg-[color:var(--surface)] backdrop-blur-2xl transition-all overflow-hidden"
      >
        
        {/* Header / Drag Handle */}
        <div className="flex items-center justify-between pb-2.5 border-b border-[color:var(--outline-variant)]/20">
          <div className="flex items-center gap-2">
            <span 
              className="h-2.5 w-2.5 rounded-full animate-pulse shadow-sm" 
              style={{ backgroundColor: modeAccent }} 
            />
            <span className="text-xs font-black uppercase tracking-wider text-[color:var(--on-surface)]">
              {activeMode.label}
            </span>
          </div>

          {/* Window Controls */}
          <div className="flex items-center gap-1 [-webkit-app-region:no-drag]">
            <button
              type="button"
              onClick={() => {
                if (window.studyhubDesktop?.openMainWindow) {
                  window.studyhubDesktop.openMainWindow();
                } else if (window.studyhubDesktop?.pomodoroWidget?.openMain) {
                  window.studyhubDesktop.pomodoroWidget.openMain();
                }
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full text-[color:var(--primary)] hover:bg-[color:var(--primary)]/15 transition-colors"
              title="Abrir o Programa Principal (masterStudy)"
            >
              <Icon name="launch" className="text-sm" />
            </button>

            <button
              type="button"
              onClick={() => {
                if (window.studyhubDesktop?.windowControls?.minimize) {
                  window.studyhubDesktop.windowControls.minimize();
                } else if (window.studyhubDesktop?.pomodoroWidget?.minimize) {
                  window.studyhubDesktop.pomodoroWidget.minimize();
                }
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full text-[color:var(--on-surface-variant)] hover:bg-black/10 transition-colors"
              title="Minimizar"
            >
              <Icon name="remove" className="text-sm" />
            </button>

            <button
              type="button"
              onClick={() => {
                if (window.studyhubDesktop?.windowControls?.close) {
                  window.studyhubDesktop.windowControls.close();
                } else if (window.studyhubDesktop?.pomodoroWidget?.close) {
                  window.studyhubDesktop.pomodoroWidget.close();
                } else {
                  window.close();
                }
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full text-[color:var(--on-surface-variant)] hover:text-red-500 hover:bg-red-500/10 transition-colors"
              title="Fechar"
            >
              <Icon name="close" className="text-sm" />
            </button>
          </div>
        </div>

        {/* Timer Hero */}
        <div className="my-2 flex flex-col items-center justify-center">
          <div className="relative flex h-44 w-44 items-center justify-center">
            <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="42"
                className="stroke-[color:var(--outline-variant)]/20"
                strokeWidth="5"
                fill="none"
              />
              <circle
                cx="50"
                cy="50"
                r="42"
                stroke={modeAccent}
                strokeWidth="5"
                strokeDasharray="263.89"
                strokeDashoffset={263.89 - (263.89 * progress) / 100}
                strokeLinecap="round"
                fill="none"
                className="transition-all duration-500 ease-out"
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center text-center">
              <span className="font-mono text-4xl font-black tracking-tighter text-[color:var(--on-surface)]">
                {formatTime(store.timeLeft)}
              </span>
              <span className="mt-0.5 text-[10px] font-extrabold uppercase tracking-widest text-[color:var(--on-surface-variant)]">
                {store.isActive ? "Em andamento" : "Pausado"}
              </span>

              {/* Mode Switcher Buttons (Foco / Pausa / Longa) */}
              <div className="mt-2.5 flex items-center gap-1 p-0.5 rounded-full border border-[color:var(--outline-variant)]/30 [-webkit-app-region:no-drag]">
                {MODES.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => store.setMode(mode.id)}
                    className={`h-5 px-2 rounded-full text-[9px] font-extrabold transition-all ${
                      store.mode === mode.id 
                        ? "bg-[color:var(--primary)] text-white shadow-sm" 
                        : "text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]"
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Main Controls */}
        <div className="grid grid-cols-2 gap-2.5 [-webkit-app-region:no-drag]">
          <button
            type="button"
            onClick={toggleTimer}
            className={`flex h-11 items-center justify-center gap-2 rounded-2xl font-black text-xs text-white shadow-lg transition-all duration-200 active:scale-95 ${
              store.isActive 
                ? "bg-gradient-to-r from-amber-500 to-orange-500 shadow-orange-500/25 hover:brightness-110" 
                : "bg-gradient-to-r from-red-500 to-rose-600 shadow-red-500/30 hover:brightness-110"
            }`}
          >
            <Icon name={store.isActive ? "pause" : "play_arrow"} className="text-base" />
            {store.isActive ? "Pausar" : "Iniciar"}
          </button>

          <button
            type="button"
            onClick={skip}
            className="flex h-11 items-center justify-center gap-1.5 rounded-2xl border border-[color:var(--outline-variant)]/40 text-xs font-black text-[color:var(--on-surface)] hover:bg-[color:var(--primary)]/10 transition-all active:scale-95"
          >
            <Icon name="skip_next" className="text-base" />
            Pular
          </button>
        </div>

        {/* Chosen Tasks Section */}
        <div className="mt-3 flex flex-col gap-1.5 rounded-2xl border border-[color:var(--outline-variant)]/40 p-2.5 bg-[color:var(--surface-bright)]/40 [-webkit-app-region:no-drag]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-[color:var(--primary)] flex items-center gap-1">
              <Icon name="task_alt" className="text-xs" />
              Tarefas Escolhidas ({store.selectedTasks?.length || 0})
            </span>
          </div>
          {store.selectedTasks?.length > 0 ? (
            <div className="max-h-[75px] overflow-y-auto custom-scrollbar flex flex-col gap-1 pr-1">
              {store.selectedTasks.map((taskId) => {
                const taskItem = tasks.find((t) => t.id === taskId);
                if (!taskItem) return null;
                return (
                  <div
                    key={taskId}
                    className="flex items-center justify-between gap-1.5 rounded-xl bg-[color:var(--surface)] px-2 py-1 text-xs border border-[color:var(--outline-variant)]/20"
                  >
                    <span className={`truncate font-bold ${taskItem.status === 'completed' ? 'line-through text-green-500' : 'text-[color:var(--on-surface)]'}`}>
                      {taskItem.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => store.toggleTaskSelection(taskId)}
                      className="text-[color:var(--on-surface-variant)] hover:text-red-500 shrink-0"
                      title="Remover"
                    >
                      <Icon name="close" className="text-xs" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <span className="text-[11px] text-[color:var(--on-surface-variant)] italic">
              Nenhuma tarefa selecionada
            </span>
          )}
        </div>

        {/* Audio Footer Bar */}
        <div className="mt-3 flex items-center justify-between rounded-2xl border border-[color:var(--outline-variant)]/40 p-1.5 [-webkit-app-region:no-drag]">
          <div className="flex items-center gap-2 min-w-0 flex-1 px-1">
            <Icon name="music_note" className="text-sm text-[color:var(--primary)] shrink-0" />
            <select
              value={store.activeSound}
              onChange={(event) => store.setActiveSound(event.target.value)}
              className="h-7 w-full bg-transparent text-xs font-bold outline-none text-[color:var(--on-surface)] cursor-pointer"
            >
              <option value="none">Sem som</option>
              <option value="rain">Chuva</option>
              <option value="nature">Natureza</option>
              <option value="coffee">Cafeteria</option>
              <option value="fireplace">Lareira</option>
              <option value="lofi">Lo-Fi</option>
              <option value="youtube">YouTube</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => setShowConfigModal(true)}
            className="flex h-7 w-7 items-center justify-center rounded-xl bg-[color:var(--primary)]/15 text-[color:var(--primary)] hover:bg-[color:var(--primary)]/25 transition-colors shrink-0"
            title="Configurações de Áudio"
          >
            <Icon name="settings" className="text-sm" />
          </button>
        </div>

        {/* Audio Config Modal */}
        {showConfigModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-3 [-webkit-app-region:no-drag]">
            <div className="w-full max-w-[310px] max-h-[90vh] overflow-y-auto rounded-[2rem] border border-[color:var(--outline-variant)]/40 bg-[color:var(--surface)] p-5 shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
              
              <div className="flex items-center justify-between border-b border-[color:var(--outline-variant)]/20 pb-2.5">
                <span className="font-black text-xs text-[color:var(--on-surface)] flex items-center gap-1.5">
                  <Icon name="tune" className="text-sm text-[color:var(--primary)]" />
                  Ajustes de Áudio
                </span>
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="h-7 w-7 rounded-full flex items-center justify-center text-[color:var(--on-surface-variant)] hover:text-red-500 hover:bg-red-500/10 transition-colors"
                >
                  <Icon name="close" className="text-sm" />
                </button>
              </div>

              {/* YouTube Config */}
              {store.activeSound === "youtube" ? (
                <div className="flex flex-col gap-3.5">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-black text-[color:var(--on-surface)]">
                      Link / Vídeo do YouTube
                    </label>
                    <input
                      type="text"
                      value={store.youtubeUrl || ""}
                      onChange={(e) => store.setYoutubeUrl(e.target.value)}
                      placeholder="Cole a URL do YouTube..."
                      className="w-full h-10 rounded-xl border border-[color:var(--outline-variant)]/50 px-3 text-xs outline-none bg-[color:var(--surface-bright)] text-[color:var(--on-surface)] font-mono placeholder:text-[color:var(--on-surface-variant)]/60 focus:border-[color:var(--primary)]"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => store.setYoutubePlaying(!store.youtubePlaying)}
                    className={`w-full h-9 rounded-xl text-xs font-black text-white shadow-md transition-all flex items-center justify-center gap-1.5 ${
                      store.youtubePlaying ? "bg-red-500 hover:bg-red-600" : "bg-[color:var(--primary)] hover:opacity-90"
                    }`}
                  >
                    <Icon name={store.youtubePlaying ? "pause" : "play_arrow"} className="text-sm" />
                    {store.youtubePlaying ? "Pausar YouTube" : "Tocar YouTube"}
                  </button>

                  {/* Volume Slider directly under YouTube Music Input */}
                  <div className="flex flex-col gap-1.5 pt-3 border-t border-[color:var(--outline-variant)]/20">
                    <div className="flex items-center justify-between text-xs font-bold text-[color:var(--on-surface)]">
                      <span>Volume da Música</span>
                      <span className="font-mono text-xs font-black text-[color:var(--primary)]">
                        {Math.round((store.soundVolume || 0) * 100)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Icon name="volume_down" className="text-xs text-[color:var(--on-surface-variant)]" />
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={store.soundVolume}
                        onChange={(e) => store.setSoundVolume(Number(e.target.value))}
                        className="h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-[color:var(--outline-variant)]/40 accent-[color:var(--primary)]"
                      />
                      <Icon name="volume_up" className="text-xs text-[color:var(--on-surface-variant)]" />
                    </div>
                  </div>

                  {/* Seek Bar */}
                  <div className="flex flex-col gap-1.5 pt-2 border-t border-[color:var(--outline-variant)]/20">
                    <div className="flex items-center justify-between text-xs font-bold text-[color:var(--on-surface)]">
                      <span>Arrastar Posição:</span>
                      <span className="font-mono text-xs text-[color:var(--primary)] font-black">
                        {Math.floor((store.youtubeStartTime || 0) / 60)}:
                        {String((store.youtubeStartTime || 0) % 60).padStart(2, "0")}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="7200"
                      step="10"
                      value={store.youtubeStartTime || 0}
                      onChange={(e) => store.setYoutubeStartTime(Number(e.target.value))}
                      className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-[color:var(--outline-variant)]/40 accent-[color:var(--primary)]"
                    />
                  </div>
                </div>
              ) : (
                /* Default Volume Slider for other ambient sounds */
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs font-bold text-[color:var(--on-surface)]">
                    <span>Volume Principal</span>
                    <span className="font-mono text-xs font-black text-[color:var(--primary)]">
                      {Math.round((store.soundVolume || 0) * 100)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Icon name="volume_down" className="text-xs text-[color:var(--on-surface-variant)]" />
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={store.soundVolume}
                      onChange={(e) => store.setSoundVolume(Number(e.target.value))}
                      className="h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-[color:var(--outline-variant)]/40 accent-[color:var(--primary)]"
                    />
                    <Icon name="volume_up" className="text-xs text-[color:var(--on-surface-variant)]" />
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="mt-2 w-full h-10 rounded-2xl bg-[color:var(--primary)] text-white text-xs font-black shadow-md hover:opacity-90 transition-opacity flex items-center justify-center gap-1"
              >
                <Icon name="check" className="text-sm" />
                Concluído
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
