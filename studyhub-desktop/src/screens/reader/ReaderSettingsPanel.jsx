import React from "react";
import { Icon } from "../../ui/Icon";

const THEMES = [
  { id: "light", label: "Claro", bg: "#ffffff", text: "#1a1a1a" },
  { id: "sepia", label: "Sépia", bg: "#f5ede0", text: "#3d2b1f" },
  { id: "dark", label: "Escuro", bg: "#1e1e2e", text: "#cdd6f4" },
  { id: "night", label: "Night", bg: "#0d0d0d", text: "#a0a0a0" },
];

const FONTS = [
  { id: "serif", label: "Serif", family: "Georgia, serif" },
  { id: "sans", label: "Sans", family: "Inter, sans-serif" },
  { id: "mono", label: "Mono", family: "'Courier New', monospace" },
];

export function ReaderSettingsPanel({ settings, onUpdate, onClose, fileType }) {
  const isPdf = fileType === "pdf";
  return (
    <div className="absolute top-14 right-4 z-50 w-72 bg-[color:var(--surface)] border border-[color:var(--outline-variant)]/30 rounded-2xl shadow-2xl p-5 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm text-[color:var(--on-surface)]">Configurações de Leitura</h3>
        <button onClick={onClose} className="text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]">
          <Icon name="close" className="text-[18px]" />
        </button>
      </div>

      {/* Theme */}
      <div>
        <label className="block text-[10px] font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-2">Tema</label>
        <div className="grid grid-cols-4 gap-2">
          {THEMES.map(t => (
            <button
              key={t.id}
              onClick={() => onUpdate({ theme: t.id })}
              style={{ backgroundColor: t.bg, color: t.text, border: settings.theme === t.id ? "2px solid var(--primary)" : "2px solid transparent" }}
              className="rounded-xl p-2 text-[10px] font-bold transition-all"
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Font Size & Settings (EPUB ONLY) */}
      {!isPdf && (
        <>
          {/* Font Size */}
          <div>
            <label className="block text-[10px] font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-2">
              Tamanho da Fonte — {settings.fontSize}px
            </label>
            <input
              type="range"
              min="12"
              max="28"
              step="1"
              value={settings.fontSize}
              onChange={e => onUpdate({ fontSize: Number(e.target.value) })}
              className="w-full accent-[color:var(--primary)]"
            />
            <div className="flex justify-between text-[10px] text-[color:var(--on-surface-variant)] mt-1">
              <span>A</span>
              <span className="text-lg font-bold">A</span>
            </div>
          </div>

          {/* Font Family */}
          <div>
            <label className="block text-[10px] font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-2">Fonte</label>
            <div className="flex gap-2">
              {FONTS.map(f => (
                <button
                  key={f.id}
                  onClick={() => onUpdate({ fontFamily: f.id })}
                  style={{ fontFamily: f.family }}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                    settings.fontFamily === f.id
                      ? "bg-[color:var(--primary)] text-white border-transparent"
                      : "bg-[color:var(--surface-container-low)] text-[color:var(--on-surface)] border-[color:var(--outline-variant)]/20"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Line Spacing */}
          <div>
            <label className="block text-[10px] font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-2">
              Espaçamento — {settings.lineSpacing}
            </label>
            <input
              type="range"
              min="1.2"
              max="2.4"
              step="0.1"
              value={settings.lineSpacing}
              onChange={e => onUpdate({ lineSpacing: Number(e.target.value) })}
              className="w-full accent-[color:var(--primary)]"
            />
          </div>
        </>
      )}

      {/* PDF Zoom (PDF ONLY) */}
      {isPdf && (
        <div>
          <label className="block text-[10px] font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-2">
            Zoom / Tamanho — {Math.round((settings.pdfZoom || 1.0) * 100)}%
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const current = settings.pdfZoom || 1.0;
                const next = Math.max(1.0, Math.round((current - 0.1) * 10) / 10);
                onUpdate({ pdfZoom: next });
              }}
              className="w-8 h-8 rounded-xl bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/20 hover:bg-[color:var(--surface-container-high)] flex items-center justify-center font-bold text-sm text-[color:var(--on-surface)] transition-all shrink-0 active:scale-95"
              title="Diminuir Zoom (-)"
            >
              -
            </button>
            <input
              type="range"
              min="1.0"
              max="3.0"
              step="0.1"
              value={settings.pdfZoom || 1.0}
              onChange={e => onUpdate({ pdfZoom: Number(e.target.value) })}
              className="w-full accent-[color:var(--primary)]"
            />
            <button
              onClick={() => {
                const current = settings.pdfZoom || 1.0;
                const next = Math.min(3.0, Math.round((current + 0.1) * 10) / 10);
                onUpdate({ pdfZoom: next });
              }}
              className="w-8 h-8 rounded-xl bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/20 hover:bg-[color:var(--surface-container-high)] flex items-center justify-center font-bold text-sm text-[color:var(--on-surface)] transition-all shrink-0 active:scale-95"
              title="Aumentar Zoom (+)"
            >
              +
            </button>
          </div>
          <div className="flex justify-between text-[10px] text-[color:var(--on-surface-variant)] mt-1">
            <span>100% (Normal)</span>
            <span>300%</span>
          </div>
        </div>
      )}

      {/* Scroll Mode */}
      <div>
        <label className="block text-[10px] font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-2">
          Modo de Leitura
        </label>
        <div className="flex gap-2">
          <button
            onClick={() => onUpdate({ scrollMode: "paginated" })}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
              (settings.scrollMode || "continuous") === "paginated"
                ? "bg-[color:var(--primary)] text-white border-transparent"
                : "bg-[color:var(--surface-container-low)] text-[color:var(--on-surface)] border-[color:var(--outline-variant)]/20"
            }`}
          >
            <Icon name="auto_stories" className="text-[16px]" />
            Paginado
          </button>
          <button
            onClick={() => onUpdate({ scrollMode: "continuous" })}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
              (settings.scrollMode || "continuous") === "continuous"
                ? "bg-[color:var(--primary)] text-white border-transparent"
                : "bg-[color:var(--surface-container-low)] text-[color:var(--on-surface)] border-[color:var(--outline-variant)]/20"
            }`}
          >
            <Icon name="swap_vert" className="text-[16px]" />
            Rolagem Fluida
          </button>
        </div>
      </div>
    </div>
  );
}
