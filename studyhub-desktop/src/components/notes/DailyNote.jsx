import { useCallback } from "react";
import { Icon } from "../../ui/Icon";

/**
 * DailyNote — Gerador e atalho para notas diárias
 *
 * @param {Object} props
 * @param {function} props.onCreateDailyNote - Callback para criar/abrir a nota de hoje
 * @param {string} props.className - Classes CSS adicionais
 */
export function DailyNote({ onCreateDailyNote, className = "" }) {
  const handleCreate = useCallback(() => {
    const today = new Date();
    const dateStr = today.toLocaleDateString("pt-BR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).replace(/\//g, "-");
    
    const weekday = today.toLocaleDateString("pt-BR", { weekday: "long" });
    const formattedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    
    const title = `Diário - ${dateStr}`;
    const initialContent = 
`# ☀️ ${formattedWeekday}, ${dateStr}

## 🎯 Foco Principal
- [ ] 

## 📝 Anotações
- 

## 🔄 Revisão
- O que aprendi hoje?
- 
`;

    if (onCreateDailyNote) {
      onCreateDailyNote({
        title,
        content: initialContent,
        path: "Diário", // Pasta padrão
        tags: ["diário", "planejamento"],
      });
    }
  }, [onCreateDailyNote]);

  return (
    <button
      onClick={handleCreate}
      className={`w-full flex items-center gap-3 px-4 py-3 bg-[var(--surface-high)] hover:bg-[var(--surface-highest)] text-[var(--on-surface)] rounded-xl border border-[var(--outline-variant)] shadow-sm transition-all active:scale-[0.98] ${className}`}
    >
      <div className="w-10 h-10 rounded-lg bg-color-mix-[in_srgb,var(--primary)_15%,transparent] text-[var(--primary)] flex items-center justify-center shrink-0">
        <Icon name="calendar_today" className="text-[20px]" />
      </div>
      <div className="flex-1 text-left">
        <h4 className="text-sm font-semibold">Nota Diária</h4>
        <p className="text-xs text-[var(--on-surface-variant)] opacity-80 mt-0.5 truncate">
          Comece seu dia com um novo registro
        </p>
      </div>
      <Icon name="chevron_right" className="text-[20px] text-[var(--on-surface-variant)] opacity-50" />
    </button>
  );
}
