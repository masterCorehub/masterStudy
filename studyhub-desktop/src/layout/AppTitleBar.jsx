import { useEffect, useState } from "react";
import { Icon } from "../ui/Icon";
import { usePomodoroStore } from "../store/usePomodoroStore";
import { SCREEN_IDS } from "../app/screenIds";
import { shortcutLabel } from "../utils/keyboardShortcuts";

function getWindowControls() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.studyhubDesktop?.windowControls ?? null;
}

function TitleBarPomodoroWidget({ onNavigate }) {
  const store = usePomodoroStore();
  const [mounted, setMounted] = useState(false);
  const [prevSound, setPrevSound] = useState("rain");

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !store.isActive) return null;

  const minutes = Math.floor(store.timeLeft / 60).toString().padStart(2, "0");
  const seconds = (store.timeLeft % 60).toString().padStart(2, "0");
  const modeIcon = store.mode === "focus" ? "local_fire_department" : "coffee";
  const isFocus = store.mode === "focus";
  const isMuted = !store.activeSound || store.activeSound === "none";

  const handleToggleMute = () => {
    if (isMuted) {
      store.setActiveSound(prevSound || "rain");
    } else {
      if (store.activeSound && store.activeSound !== "none") {
        setPrevSound(store.activeSound);
      }
      store.setActiveSound("none");
    }
  };

  return (
    <div 
      className="flex items-center gap-2 rounded-full bg-[color:var(--surface-container-high)]/90 border border-[color:var(--outline-variant)]/40 px-3 py-1 shadow-sm transition-all shrink-0"
      data-titlebar-control
      style={{ WebkitAppRegion: "no-drag" }}
    >
      {/* Pomodoro Timer Text & Icon */}
      <button
        type="button"
        onClick={() => onNavigate?.(SCREEN_IDS.POMODORO)}
        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        title="Abrir Pomodoro"
      >
        <div className={`w-5 h-5 rounded-full flex items-center justify-center ${isFocus ? "bg-red-500/20 text-red-500" : "bg-green-500/20 text-green-500"}`}>
          <Icon name={modeIcon} className={`text-[12px] ${store.isActive ? "animate-pulse" : ""}`} />
        </div>
        <span className="font-mono text-xs font-bold text-[color:var(--on-surface)] tracking-tight">
          {minutes}:{seconds}
        </span>
      </button>

      <div className="h-3 w-px bg-[color:var(--outline-variant)]/40" />

      {/* Play / Pause Button */}
      <button
        type="button"
        onClick={() => (store.isActive ? store.pauseTimer() : store.startTimer())}
        className="w-5 h-5 rounded-full flex items-center justify-center text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)] transition-colors"
        title={store.isActive ? "Pausar" : "Retomar"}
      >
        <Icon name={store.isActive ? "pause" : "play_arrow"} className="text-[14px]" />
      </button>

      {/* Mute / Unmute Audio Button */}
      <button
        type="button"
        onClick={handleToggleMute}
        className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
          isMuted ? "text-[color:var(--on-surface-variant)]/40 hover:text-[color:var(--on-surface)]" : "text-[color:var(--primary)] hover:opacity-80"
        }`}
        title={isMuted ? "Ativar som ambiente" : "Mutar som ambiente"}
      >
        <Icon name={isMuted ? "volume_off" : "volume_up"} className="text-[14px]" />
      </button>
    </div>
  );
}

export function AppTitleBar({ onNavigate }) {
  const [isMaximized, setIsMaximized] = useState(false);
  const controls = getWindowControls();

  useEffect(() => {
    let unsubscribe;

    controls?.isMaximized?.().then(setIsMaximized).catch(() => {});
    unsubscribe = controls?.onMaximizedChange?.(setIsMaximized);

    return () => {
      unsubscribe?.();
    };
  }, []);

  const handleToggleMaximize = () => {
    controls?.toggleMaximize?.().then(setIsMaximized).catch(() => {});
  };

  const handleTitleBarDoubleClick = (event) => {
    if (event.target instanceof Element && event.target.closest("[data-titlebar-control]")) {
      return;
    }
    handleToggleMaximize();
  };

  const handleOpenSearch = () => {
    window.dispatchEvent(new CustomEvent("studyhub-open-search"));
  };

  return (
    <header className="app-titlebar relative flex items-center justify-between" onDoubleClick={handleTitleBarDoubleClick}>
      {/* Left: Brand */}
      <div className="app-titlebar-brand flex items-center gap-2">
        <span className="app-titlebar-logo">
          <Icon className="text-[16px]" name="school" filled />
        </span>
        <span className="app-titlebar-title">CampusFlow</span>
        <span className="app-titlebar-subtitle">Academic Management</span>
      </div>

      {/* Center Container: Search Everything Button + Pomodoro Widget Side-by-Side */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center gap-3 z-10" data-titlebar-control style={{ WebkitAppRegion: "no-drag" }}>
        <button
          type="button"
          onClick={handleOpenSearch}
          className="flex items-center justify-between gap-3 w-56 sm:w-72 md:w-80 px-3.5 py-1 rounded-full bg-[color:var(--surface-container-high)]/70 hover:bg-[color:var(--surface-container-high)] border border-[color:var(--outline-variant)]/30 text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)] text-xs font-semibold shadow-inner transition-all group cursor-pointer"
          title={`Buscar em todo o CampusFlow (${shortcutLabel("Mod+K")})`}
        >
          <div className="flex items-center gap-2 truncate">
            <Icon name="search" className="text-[15px] text-[color:var(--primary)] group-hover:scale-110 transition-transform" />
            <span className="truncate font-medium">Buscar tudo...</span>
          </div>
          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-[color:var(--surface)] text-[color:var(--on-surface-variant)] border border-[color:var(--outline-variant)]/40 opacity-80 shrink-0">
            {shortcutLabel("Mod+K")}
          </span>
        </button>

        {/* Pomodoro Widget with Mute button */}
        <TitleBarPomodoroWidget onNavigate={onNavigate} />
      </div>

      {/* Right: Window Controls */}
      {controls ? <div className="app-window-controls z-10" data-titlebar-control style={{ WebkitAppRegion: "no-drag" }}>
        <button
          aria-label="Minimizar"
          className="app-window-control"
          title="Minimizar"
          type="button"
          onClick={() => controls?.minimize?.()}
        >
          <Icon className="text-[18px]" name="remove" />
        </button>
        <button
          aria-label={isMaximized ? "Restaurar" : "Maximizar"}
          className="app-window-control"
          title={isMaximized ? "Restaurar" : "Maximizar"}
          type="button"
          onClick={handleToggleMaximize}
        >
          <Icon className="text-[18px]" name={isMaximized ? "filter_none" : "crop_square"} />
        </button>
        <button
          aria-label="Fechar"
          className="app-window-control app-window-control-close"
          title="Fechar"
          type="button"
          onClick={() => controls?.close?.()}
        >
          <Icon className="text-[18px]" name="close" />
        </button>
      </div> : null}
    </header>
  );
}
