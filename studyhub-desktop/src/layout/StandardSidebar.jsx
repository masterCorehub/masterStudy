import { useEffect, useMemo } from "react";
import { Icon } from "../ui/Icon";
import { SCREEN_IDS } from "../app/screenIds";
import { useStudyStore } from "../store/useStore";
import { SettingsModal, ALL_SIDEBAR_ITEMS } from "../components/settings/SettingsModal";
import { isPrimaryShortcut, shortcutLabel } from "../utils/keyboardShortcuts";
import { DEFAULT_SIDEBAR_ORDER } from "../domain/sidebarNavigation";

export function StandardSidebar({
  activeScreen,
  onNavigate,
  isCompact = false,
  onToggleCompact,
}) {
  const sidebarOrder = useStudyStore((state) => state.sidebarOrder || DEFAULT_SIDEBAR_ORDER);
  const sidebarHiddenItems = useStudyStore((state) => state.sidebarHiddenItems || []);
  const isSettingsModalOpen = useStudyStore((state) => state.isSettingsModalOpen);
  const openSettingsModal = useStudyStore((state) => state.openSettingsModal);
  const closeSettingsModal = useStudyStore((state) => state.closeSettingsModal);
  const settingsModalInitialTab = useStudyStore((state) => state.settingsModalInitialTab || "sidebar");

  // Atalho local Cmd/Ctrl + , para abrir Configurações
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isPrimaryShortcut(e) && e.key === ",") {
        e.preventDefault();
        openSettingsModal();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openSettingsModal]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("auth") === "recovery") {
      openSettingsModal("account");
    }
  }, [openSettingsModal]);

  const flashcardDecks = useStudyStore((state) => state.flashcardDecks || []);
  const knowledgeItems = useStudyStore((state) => state.knowledgeItems || []);
  const dueFlashcardsCount = useMemo(() => {
    const now = Date.now();
    const flashcardsDue = flashcardDecks.reduce((sum, deck) => {
      const due = (deck.cards || []).filter((c) => !c.dueDate || c.dueDate <= now).length;
      return sum + due;
    }, 0);
    const quizzesDue = knowledgeItems.reduce((sum, item) => {
      const due = (item.quizzes || []).filter((q) => !q.dueDate || q.dueDate <= now).length;
      return sum + due;
    }, 0);
    return flashcardsDue + quizzesDue;
  }, [flashcardDecks, knowledgeItems]);

  // Lista dinâmica de itens da barra lateral conforme personalização do usuário
  const displayedNavItems = useMemo(() => {
    const itemMap = new Map(ALL_SIDEBAR_ITEMS.map((item) => [item.key, item]));
    const result = [];
    sidebarOrder.forEach((key) => {
      if (itemMap.has(key) && !sidebarHiddenItems.includes(key)) {
        result.push(itemMap.get(key));
        itemMap.delete(key);
      }
    });
    itemMap.forEach((item, key) => {
      if (!sidebarHiddenItems.includes(key)) {
        result.push(item);
      }
    });
    return result;
  }, [sidebarOrder, sidebarHiddenItems]);

  return (
    <>
      <aside
        className={`campus-sidebar campus-sidebar-refined relative z-20 hidden h-full shrink-0 flex-col border-r border-[color:var(--outline-variant)] bg-[color:var(--surface-container-low)] transition-[width] duration-300 md:flex ${
          isCompact ? "w-[64px]" : "w-[232px]"
        }`}
      >
        <button
          aria-label={isCompact ? "Expandir menu" : "Recolher menu"}
          className="sidebar-collapse-control absolute right-3 top-5 z-30 flex h-6 w-6 items-center justify-center rounded text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-container-high)] hover:text-[color:var(--primary)]"
          type="button"
          onClick={onToggleCompact}
        >
          <Icon className="text-[18px]" name={isCompact ? "chevron_right" : "chevron_left"} />
        </button>

        <div className={`sidebar-brand ${isCompact ? "px-3" : "px-4"}`}>
          <div className={`flex items-center ${isCompact ? "justify-center" : "gap-3"}`}>
            <div className="sidebar-brand-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color:var(--primary)] text-[color:var(--on-primary)]">
              <img src={`${import.meta.env.BASE_URL}assets/masterstudy-logo.svg`} alt="" className="h-8 w-8 rounded-lg" />
            </div>
            {!isCompact ? (
              <div className="min-w-0">
                <h1 className="truncate text-[15px] font-semibold tracking-tight text-[color:var(--on-surface)]">masterStudy</h1>
              </div>
            ) : null}
          </div>
        </div>

        <nav aria-label="Navegação principal" className="sidebar-main-nav mt-5 px-2 flex flex-1 flex-col overflow-y-auto">
          {displayedNavItems.map((item) => {
            const active =
              item.id === activeScreen ||
              (item.id === SCREEN_IDS.TASKS && activeScreen === SCREEN_IDS.TASK_DETAILS) ||
              (item.id === SCREEN_IDS.DASHBOARD &&
                [
                  SCREEN_IDS.DASHBOARD,
                  SCREEN_IDS.DISCIPLINES,
                  SCREEN_IDS.ACADEMIC_SUBJECT,
                  SCREEN_IDS.MODULES,
                  SCREEN_IDS.MODULE_DETAILS,
                  SCREEN_IDS.LESSON,
                  SCREEN_IDS.CREATE_COURSE,
                  SCREEN_IDS.CREATE_MODULE,
                  SCREEN_IDS.ADD_LESSON,
                ].includes(activeScreen)) ||
              (item.id === SCREEN_IDS.PROJECTS && activeScreen === SCREEN_IDS.PROJECT_DETAILS);
            const isReviewsItem = item.key === "reviews";
            const hasDueCards = isReviewsItem && dueFlashcardsCount > 0;

            return (
              <button
                key={item.key}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className={`campus-nav-item mb-1 flex w-full items-center rounded py-3 text-sm transition-colors ${
                  isCompact ? "justify-center" : "gap-3 px-4 text-left"
                } ${
                  active
                    ? "campus-nav-active bg-[color:var(--surface-container)] font-bold text-[color:var(--primary)]"
                    : "font-medium text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-container)] hover:text-[color:var(--primary)]"
                }`}
                type="button"
                title={isCompact ? (hasDueCards ? `${item.label} (${dueFlashcardsCount} pendentes)` : item.label) : undefined}
                onClick={() => onNavigate(item.id)}
              >
                <div className="relative flex items-center justify-center">
                  <Icon filled={active} className="text-[20px]" name={item.icon} />
                  {isCompact && hasDueCards && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-[color:var(--surface-container-low)]" />
                  )}
                </div>
                {!isCompact ? <span className="truncate">{item.label}</span> : null}
                {!isCompact && hasDueCards && (
                  <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-600 text-white shadow-sm">
                    {dueFlashcardsCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer px-2 border-t border-[color:var(--outline-variant)] pt-2">
          <div>
            <button
               aria-label="Calendário"
               className={`sidebar-footer-action flex w-full items-center gap-3 text-[color:var(--on-surface-variant)] ${activeScreen === SCREEN_IDS.ACADEMIC ? 'text-[color:var(--primary)]' : ''}`}
               title="Calendário"
               onClick={() => onNavigate(SCREEN_IDS.ACADEMIC)}
            >
              <Icon name="calendar_today" className="text-[20px]" filled={activeScreen === SCREEN_IDS.ACADEMIC} />
              {!isCompact && <span>Agenda</span>}
            </button>
          </div>

          {/* Botão Único de Configurações no Rodapé da Sidebar */}
          <button type="button" title="Resumo dos atalhos" aria-label="Resumo dos atalhos" className="flex items-center gap-2 px-3 py-2 text-xs text-[color:var(--on-surface-variant)]" onClick={() => openSettingsModal("shortcuts")}><Icon name="keyboard" />{!isCompact && "Atalhos"}</button>
          <button
            type="button"
            title={`Configurações (${shortcutLabel("Mod+,")})`}
            onClick={() => openSettingsModal("sidebar")}
            className={`group flex w-full items-center rounded-2xl border p-2.5 text-sm transition-all ${
              isCompact ? "justify-center p-2" : "gap-3 text-left"
            } ${
              isSettingsModalOpen
                ? "border-[color:var(--primary)]/40 bg-[color:var(--primary)]/10 text-[color:var(--primary)] shadow-sm"
                : "border-[color:var(--outline-variant)]/70 bg-[color:var(--surface-container-lowest)] text-[color:var(--on-surface-variant)] hover:border-[color:var(--primary)]/30 hover:bg-[color:var(--surface-container)] hover:text-[color:var(--primary)]"
            }`}
          >
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
                isSettingsModalOpen
                  ? "bg-[color:var(--primary)] text-white"
                  : "bg-[color:var(--surface-container-high)] text-[color:var(--primary)] group-hover:bg-[color:var(--primary)] group-hover:text-white"
              }`}
            >
              <Icon
                name="settings"
                filled={isSettingsModalOpen}
                className="text-[20px]"
              />
            </span>
            {!isCompact ? (
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-xs truncate">Configurações</span>
              </span>
            ) : null}
          </button>
        </div>
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-center justify-around border-t border-[color:var(--outline-variant)] bg-[color:var(--surface-container-lowest)] px-1 md:hidden">
        {displayedNavItems.slice(0, 4).map((item) => {
          const active =
            item.id === activeScreen ||
            (item.id === SCREEN_IDS.DASHBOARD &&
              [
                SCREEN_IDS.DASHBOARD,
                SCREEN_IDS.DISCIPLINES,
                SCREEN_IDS.ACADEMIC_SUBJECT,
                SCREEN_IDS.MODULES,
                SCREEN_IDS.MODULE_DETAILS,
                SCREEN_IDS.LESSON,
                SCREEN_IDS.CREATE_COURSE,
                SCREEN_IDS.CREATE_MODULE,
                SCREEN_IDS.ADD_LESSON,
              ].includes(activeScreen)) ||
            (item.id === SCREEN_IDS.PROJECTS && activeScreen === SCREEN_IDS.PROJECT_DETAILS);
          return (
            <button
              key={item.key}
              className={`flex min-w-0 flex-1 flex-col items-center gap-1 py-2 text-[10px] font-semibold ${
                active ? "text-[color:var(--primary)]" : "text-[color:var(--on-surface-variant)]"
              }`}
              type="button"
              onClick={() => onNavigate(item.id)}
            >
              <Icon filled={active} className="text-[21px]" name={item.icon} />
              <span className="max-w-full truncate">{item.label}</span>
            </button>
          );
        })}

        {/* Botão Configurações na barra móvel */}
        <button
          className="flex min-w-0 flex-1 flex-col items-center gap-1 py-2 text-[10px] font-semibold text-[color:var(--on-surface-variant)]"
          type="button"
          onClick={() => openSettingsModal("sidebar")}
        >
          <Icon className="text-[21px]" name="settings" />
          <span className="max-w-full truncate">Ajustes</span>
        </button>
      </nav>

      {/* Modal Geral de Configurações */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={closeSettingsModal}
        initialTab={settingsModalInitialTab}
        onNavigate={onNavigate}
      />
    </>
  );
}
