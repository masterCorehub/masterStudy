import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import { Icon } from "../../ui/Icon";

/**
 * EditorTabs — Sistema de abas para múltiplas notas abertas (estilo Obsidian)
 *
 * @param {Object} props
 * @param {Array} props.tabs - Array de abas [{ id, title, isDirty }]
 * @param {string} props.activeTabId - ID da aba ativa
 * @param {function} props.onTabSelect - Callback quando uma aba é selecionada
 * @param {function} props.onTabClose - Callback quando uma aba é fechada
 * @param {function} props.onTabReorder - Callback quando as abas são reordenadas
 * @param {function} props.onTabPin - Callback para fixar uma aba
 */
export function EditorTabs({
  tabs = [],
  activeTabId,
  onTabSelect,
  onTabClose,
  onTabReorder,
  onTabPin,
}) {
  const [contextMenu, setContextMenu] = useState(null);
  const containerRef = useRef(null);

  const handleContextMenu = useCallback((e, tab) => {
    e.preventDefault();
    setContextMenu({
      tabId: tab.id,
      x: e.clientX,
      y: e.clientY,
    });
  }, []);

  const handleCloseAll = useCallback(() => {
    tabs.forEach((tab) => {
      if (!tab.pinned) onTabClose?.(tab.id);
    });
    setContextMenu(null);
  }, [tabs, onTabClose]);

  const handleCloseOthers = useCallback(() => {
    if (!contextMenu) return;
    tabs.forEach((tab) => {
      if (tab.id !== contextMenu.tabId && !tab.pinned) onTabClose?.(tab.id);
    });
    setContextMenu(null);
  }, [tabs, contextMenu, onTabClose]);

  if (!tabs.length) return null;

  return (
    <>
      <div
        ref={containerRef}
        className="flex items-center h-9 bg-[var(--background)] border-b border-[var(--outline-variant)] overflow-x-auto overflow-y-hidden select-none shrink-0"
        style={{ scrollbarWidth: "none" }}
      >
        <Reorder.Group
          axis="x"
          values={tabs}
          onReorder={(newOrder) => onTabReorder?.(newOrder)}
          className="flex items-center h-full"
          style={{ display: "flex" }}
        >
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <Reorder.Item
                key={tab.id}
                value={tab}
                className={`
                  group relative flex items-center gap-1.5 h-full px-3 cursor-pointer
                  text-xs font-medium transition-all duration-150 shrink-0 max-w-[180px]
                  border-r border-[var(--outline-variant)]
                  ${isActive
                    ? "bg-[var(--surface)] text-[var(--on-surface)]"
                    : "bg-[var(--background)] text-[var(--on-surface-variant)] hover:bg-[var(--surface-high)] hover:text-[var(--on-surface)]"
                  }
                `}
                onClick={() => onTabSelect?.(tab.id)}
                onContextMenu={(e) => handleContextMenu(e, tab)}
                whileDrag={{ opacity: 0.7, scale: 0.98 }}
              >
                {/* Active indicator */}
                {isActive && (
                  <motion.div
                    layoutId="tab-active-indicator"
                    className="absolute top-0 left-0 right-0 h-[2px] bg-[var(--primary)]"
                    transition={{ duration: 0.2 }}
                  />
                )}

                {/* Pin icon */}
                {tab.pinned && (
                  <Icon name="push_pin" className="text-[12px] text-[var(--primary)] opacity-60" filled />
                )}

                {/* Icon */}
                <Icon
                  name={tab.itemType === "drawing" ? "draw" : "description"}
                  className="text-[14px] opacity-60 shrink-0"
                />

                {/* Title */}
                <span className="truncate">
                  {tab.title || "Sem título"}
                </span>

                {/* Dirty indicator */}
                {tab.isDirty && (
                  <span className="w-2 h-2 rounded-full bg-[var(--primary)] shrink-0" title="Não salvo" />
                )}

                {/* Close button */}
                {!tab.pinned && (
                  <button
                    className="ml-auto opacity-0 group-hover:opacity-100 hover:bg-[var(--surface-highest)] rounded p-0.5 transition-all shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTabClose?.(tab.id);
                    }}
                    title="Fechar aba"
                  >
                    <Icon name="close" className="text-[14px]" />
                  </button>
                )}
              </Reorder.Item>
            );
          })}
        </Reorder.Group>

        {/* New tab button */}
        <button
          className="h-full px-2 flex items-center justify-center text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] hover:bg-[var(--surface-high)] transition-colors shrink-0"
          title="Nova aba"
          onClick={() => onTabSelect?.("__new__")}
        >
          <Icon name="add" className="text-[16px]" />
        </button>
      </div>

      {/* Context menu */}
      <AnimatePresence>
        {contextMenu && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-50"
              onClick={() => setContextMenu(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.1 }}
              className="fixed z-50 bg-[var(--surface-high)] border border-[var(--outline-variant)] rounded-lg shadow-xl py-1 min-w-[160px]"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              <ContextMenuItem
                icon="push_pin"
                label={tabs.find((t) => t.id === contextMenu.tabId)?.pinned ? "Desafixar aba" : "Fixar aba"}
                onClick={() => {
                  onTabPin?.(contextMenu.tabId);
                  setContextMenu(null);
                }}
              />
              <ContextMenuItem
                icon="close"
                label="Fechar aba"
                onClick={() => {
                  onTabClose?.(contextMenu.tabId);
                  setContextMenu(null);
                }}
              />
              <div className="h-px bg-[var(--outline-variant)] my-1" />
              <ContextMenuItem
                icon="close_fullscreen"
                label="Fechar outras"
                onClick={handleCloseOthers}
              />
              <ContextMenuItem
                icon="tab_close"
                label="Fechar todas"
                onClick={handleCloseAll}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function ContextMenuItem({ icon, label, onClick, danger = false }) {
  return (
    <button
      className={`
        w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium transition-colors
        ${danger
          ? "text-[var(--error)] hover:bg-[color-mix(in_srgb,var(--error)_10%,transparent)]"
          : "text-[var(--on-surface)] hover:bg-[var(--surface-highest)]"
        }
      `}
      onClick={onClick}
    >
      <Icon name={icon} className="text-[16px] opacity-70" />
      {label}
    </button>
  );
}
