import { useEffect, useMemo } from "react";
import { Icon } from "../ui/Icon";
import { SCREEN_IDS } from "../app/screenIds";
import { useStudyStore } from "../store/useStore";
import { SettingsModal, ALL_SIDEBAR_ITEMS } from "../components/settings/SettingsModal";

export function StandardSidebar({
  activeScreen,
  onNavigate,
  isCompact = false,
  onToggleCompact,
}) {
  const sidebarOrder = useStudyStore((state) => state.sidebarOrder || [
    "dashboard",
    "courses",
    "projects",
    "books",
    "materials",
    "journal",
    "knowledge",
    "reviews",
  ]);
  const sidebarHiddenItems = useStudyStore((state) => state.sidebarHiddenItems || []);
  const isSettingsModalOpen = useStudyStore((state) => state.isSettingsModalOpen);
  const openSettingsModal = useStudyStore((state) => state.openSettingsModal);
  const closeSettingsModal = useStudyStore((state) => state.closeSettingsModal);
  const settingsModalInitialTab = useStudyStore((state) => state.settingsModalInitialTab || "sidebar");

  // Atalho global Ctrl + , para abrir Configurações
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        openSettingsModal();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
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
        className={`campus-sidebar relative z-20 hidden h-full shrink-0 flex-col border-r border-[color:var(--outline-variant)] bg-[color:var(--surface-container-low)] py-6 transition-[width] duration-300 md:flex ${
          isCompact ? "w-[76px]" : "w-64"
        }`}
      >
        <button
          aria-label={isCompact ? "Expandir menu" : "Recolher menu"}
          className="absolute -right-3 top-7 z-30 flex h-7 w-7 items-center justify-center rounded border border-[color:var(--outline-variant)] bg-[color:var(--surface-container-lowest)] text-[color:var(--on-surface-variant)] hover:text-[color:var(--primary)]"
          type="button"
          onClick={onToggleCompact}
        >
          <Icon className="text-[18px]" name={isCompact ? "chevron_right" : "chevron_left"} />
        </button>

        <div className={`${isCompact ? "px-3" : "px-6"}`}>
          <div className={`flex items-center ${isCompact ? "justify-center" : "gap-3"}`}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[color:var(--primary)] text-white">
              <Icon className="text-[23px]" name="school" filled />
            </div>
            {!isCompact ? (
              <div className="min-w-0">
                <h1 className="truncate text-[17px] font-bold tracking-tight text-[color:var(--primary)]">CampusFlow</h1>
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--on-surface-variant)]">
                  Academic Management
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <nav className={`${isCompact ? "mt-12 px-2" : "mt-16 px-4"} flex flex-1 flex-col overflow-y-auto`}>
          {displayedNavItems.map((item) => {
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
            const isReviewsItem = item.key === "reviews";
            const hasDueCards = isReviewsItem && dueFlashcardsCount > 0;

            return (
              <button
                key={item.key}
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

        <div className={`${isCompact ? "px-2" : "px-4"} border-t border-[color:var(--outline-variant)] pt-4`}>
          <div className={`flex mb-4 ${isCompact ? "flex-col items-center gap-2" : "justify-center gap-4"}`}>
            <button
               className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[color:var(--surface-container-high)] text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-container-highest)] hover:text-[color:var(--primary)] transition-colors ${activeScreen === SCREEN_IDS.ACADEMIC ? 'ring-2 ring-[color:var(--primary)] text-[color:var(--primary)]' : ''}`}
               title="Calendário"
               onClick={() => onNavigate(SCREEN_IDS.ACADEMIC)}
            >
              <Icon name="calendar_today" className="text-[20px]" filled={activeScreen === SCREEN_IDS.ACADEMIC} />
            </button>
            <button
               className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[color:var(--surface-container-high)] text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-container-highest)] hover:text-[color:var(--primary)] transition-colors ${activeScreen === SCREEN_IDS.TASKS ? 'ring-2 ring-[color:var(--primary)] text-[color:var(--primary)]' : ''}`}
               title="Tarefas"
               onClick={() => onNavigate(SCREEN_IDS.TASKS)}
            >
              <Icon name="checklist" className="text-[20px]" filled={activeScreen === SCREEN_IDS.TASKS} />
            </button>
            <button
               className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[color:var(--primary)] text-white hover:bg-[color:var(--primary)]/90 transition-colors shadow-sm"
               title="Sessão de foco"
               onClick={() => onNavigate(SCREEN_IDS.POMODORO)}
            >
              <Icon name="timer" className="text-[20px]" />
            </button>
          </div>

          {/* Botão Único de Configurações no Rodapé da Sidebar */}
          <button
            type="button"
            title="Configurações (Ctrl + ,)"
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
                <span className="block text-[10px] font-medium opacity-70 truncate">
                  Aparência, sidebar e conta
                </span>
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
      />
    </>
  );
}
