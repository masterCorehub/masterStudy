import { useEffect, useState } from "react";
import { Icon } from "../ui/Icon";

import { SCREEN_IDS } from "../app/screenIds";
import { shortcutLabel } from "../utils/keyboardShortcuts";

function getWindowControls() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.studyhubDesktop?.windowControls ?? null;
}



export function AppTitleBar({ onNavigate }) {
  const [isMaximized, setIsMaximized] = useState(false);
  const controls = getWindowControls();
  const platform = controls ? window.studyhubDesktop?.platform || "win32" : "web";

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
    if (platform === "darwin") return; // Let the native draggable title bar handle macOS behavior.
    if (event.target instanceof Element && event.target.closest("[data-titlebar-control]")) {
      return;
    }
    handleToggleMaximize();
  };

  const handleOpenSearch = () => {
    window.dispatchEvent(new CustomEvent("studyhub-open-search"));
  };

  return (
    <header data-platform={platform} className="app-titlebar relative flex items-center justify-between" onDoubleClick={handleTitleBarDoubleClick}>
      {/* Left: Brand */}
      <div className="app-titlebar-brand flex items-center gap-2">
        <span className="app-titlebar-logo">
          <Icon className="text-[16px]" name="school" filled />
        </span>
        <span className="app-titlebar-title">masterStudy</span>
      </div>

      <div className="app-titlebar-tools absolute left-1/2 -translate-x-1/2 flex items-center justify-center gap-3 z-10" data-titlebar-control style={{ WebkitAppRegion: "no-drag" }}>
        <button
          type="button"
          onClick={handleOpenSearch}
          className="flex items-center justify-between gap-3 app-titlebar-search px-3.5 py-1 rounded-full bg-[color:var(--surface-container-high)]/70 hover:bg-[color:var(--surface-container-high)] border border-[color:var(--outline-variant)]/30 text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)] text-xs font-semibold shadow-inner transition-all group cursor-pointer"
          title={`Buscar em todo o masterStudy (${shortcutLabel("Mod+K")})`}
        >
          <div className="flex items-center gap-2 truncate">
            <Icon name="search" className="text-[15px] text-[color:var(--primary)] group-hover:scale-110 transition-transform" />
            <span className="truncate font-medium">Buscar tudo...</span>
          </div>
          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-[color:var(--surface)] text-[color:var(--on-surface-variant)] border border-[color:var(--outline-variant)]/40 opacity-80 shrink-0">
            {shortcutLabel("Mod+K")}
          </span>
        </button>

      </div>

      {/* Right: Window Controls */}
      {controls && platform !== "darwin" ? <div className="app-window-controls z-10" data-titlebar-control style={{ WebkitAppRegion: "no-drag" }}>
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
