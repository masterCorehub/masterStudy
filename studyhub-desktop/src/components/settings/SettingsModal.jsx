import React, { useEffect, useState, useMemo } from "react";
import { Icon } from "../../ui/Icon";
import { useStudyStore } from "../../store/useStore";
import { SCREEN_IDS } from "../../app/screenIds";
import { AccountScreen } from "../../screens/AccountScreen";
import { THEMES, getThemeById } from "../../theme/themes";
import { shortcutLabel } from "../../utils/keyboardShortcuts";
import { showSystemNotification } from "../../services/system-notifications";
import { DEFAULT_SIDEBAR_ORDER } from "../../domain/sidebarNavigation";

export const ALL_SIDEBAR_ITEMS = [
  {
    key: "dashboard",
    id: SCREEN_IDS.TODAY,
    label: "Hoje",
    icon: "dashboard",
    description: "Visão geral diária, hábitos, tarefas de hoje e foco",
  },
  {
    key: "courses",
    id: SCREEN_IDS.DASHBOARD,
    label: "Cursos e Disciplinas",
    icon: "school",
    description: "Trilhas, vídeo-aulas, módulos e matérias acadêmicas",
  },
  {
    key: "tasks",
    id: SCREEN_IDS.TASKS,
    label: "Tarefas",
    icon: "task_alt",
    description: "Todas as tarefas, prazos e itens concluídos",
  },
  {
    key: "projects",
    id: SCREEN_IDS.PROJECTS,
    label: "Trabalhos e projetos",
    icon: "group_work",
    description: "Gestão de trabalhos em grupo, entregas e etapas",
  },
  {
    key: "books",
    id: SCREEN_IDS.BOOKS,
    label: "Livros",
    icon: "library_books",
    description: "Biblioteca de leitura, resumos, citações e grifos",
  },
  {
    key: "materials",
    id: SCREEN_IDS.NOTES,
    label: "Materiais / Vault",
    icon: "folder_open",
    description: "Cofres de notas no estilo Obsidian, grafo e wikilinks",
  },
  {
    key: "journal",
    id: SCREEN_IDS.JOURNAL,
    label: "Diário",
    icon: "auto_stories",
    description: "Diário de bordo, reflexões, humor e memórias",
  },
  {
    key: "sticky-notes",
    id: SCREEN_IDS.STICKY_NOTES,
    label: "Sticky Notes",
    icon: "sticky_note_2",
    description: "Post-its rápidos com cores, fixação, busca e arquivamento",
  },
  {
    key: "knowledge",
    id: SCREEN_IDS.KNOWLEDGE_HUB,
    label: "Capturas & Hub",
    icon: "hub",
    description: "Captura rápida de links, YouTube, artigos e quizzes de IA",
  },
  {
    key: "reviews",
    id: SCREEN_IDS.FLASHCARDS,
    label: "Revisões",
    icon: "rate_review",
    description: "Flashcards com algoritmo de repetição espaçada",
  },
];

const DEFAULT_SHORTCUTS = [
  { id: "quick_note", nativeKey: "quickNoteShortcut", label: "Buscar ou criar nota rápida", keys: shortcutLabel("Mod+Shift+Alt+1"), desc: "Abre a busca de notas; permite criar uma nota rápida" },
  { id: "quick_draw", nativeKey: "quickDrawShortcut", label: "Desenho rápido", keys: shortcutLabel("Mod+Shift+Alt+2"), desc: "Abre o quadro de desenho sobre outras janelas" },
  { id: "translate", nativeKey: "translatorTextShortcut", label: "Traduzir texto", keys: shortcutLabel("Mod+Shift+Alt+3"), desc: "Abre a ferramenta de tradução de texto" },
  { id: "ocr_capture", nativeKey: "translatorOcrShortcut", label: "Extrair texto de imagem", keys: shortcutLabel("Mod+Shift+Alt+4"), desc: "Captura uma área da tela e extrai o texto para tradução" },
  { id: "ai_cards", nativeKey: "aiFlashcardShortcut", label: "Flashcards com IA", keys: shortcutLabel("Mod+Shift+Alt+5"), desc: "Abre a janela de geração de flashcards" },
  { id: "quick_capture", label: "Criar captura", keys: shortcutLabel("Mod+Shift+K"), desc: "Salva um link, texto ou conteúdo no Hub de conhecimento" },
  { id: "sticky_notes", nativeKey: "stickyNotesShortcut", label: "Abrir Sticky Notes", keys: shortcutLabel("Mod+Shift+Alt+6"), desc: "Abre o mural de Sticky Notes mesmo com o masterStudy em segundo plano" },
  { id: "quick_switcher", label: "Abrir nota rápida", keys: shortcutLabel("Mod+O"), desc: "Busca instantânea de notas em todos os cofres" },
  { id: "command_palette", label: "Paleta de comandos", keys: shortcutLabel("Mod+K"), desc: "Acessa qualquer tela ou comando com a busca inteligente" },
  { id: "settings", label: "Abrir configurações", keys: shortcutLabel("Mod+,"), desc: "Abre o painel de personalização do masterStudy" },
  { id: "save", label: "Salvar conteúdo", keys: shortcutLabel("Mod+S"), desc: "Salva a nota ou entrada do Diário atual" },
  { id: "close_tab", label: "Fechar aba de nota", keys: shortcutLabel("Mod+W"), desc: "Fecha a aba ativa no editor de notas" },
  { id: "knowledge_search", label: "Buscar no Hub", keys: shortcutLabel("Mod+/"), desc: "Leva o foco para a busca do Hub de conhecimento" },
];

const NOTIFICATION_TESTS = [
  { id: "flashcards", icon: "style", title: "12 flashcards para revisar", subtitle: "masterStudy • Revisão inteligente", body: "Uma revisão curta agora ajuda a fixar o conteúdo.", screen: SCREEN_IDS.FLASHCARDS, actionLabel: "Revisar agora" },
  { id: "tasks", icon: "event_upcoming", title: "2 tarefas vencem hoje", subtitle: "masterStudy • Planejamento acadêmico", body: "Confira seus prazos e escolha o próximo passo.", screen: SCREEN_IDS.TASKS, actionLabel: "Ver tarefas" },
  { id: "exams", icon: "quiz", title: "Prova amanhã", subtitle: "masterStudy • Calendário acadêmico", body: "Sua revisão final de Cálculo está programada para hoje.", screen: SCREEN_IDS.ACADEMIC, actionLabel: "Abrir calendário" },
  { id: "attendance", icon: "warning", title: "Atenção à frequência", subtitle: "masterStudy • Desempenho acadêmico", body: "Uma disciplina está próxima do limite mínimo de presença.", screen: SCREEN_IDS.ACADEMIC, actionLabel: "Ver frequência", persistent: true },
];

export function SettingsModal({ isOpen, onClose, initialTab = "sidebar", onNavigate }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [shortcutFilter, setShortcutFilter] = useState("");
  const [nativeShortcuts, setNativeShortcuts] = useState({});
  useEffect(() => {
    if (isOpen) window.studyhubDesktop?.getGlobalShortcuts?.().then(setNativeShortcuts).catch(() => {});
  }, [isOpen]);
  const [notificationTestStatus, setNotificationTestStatus] = useState("");
  const [aiConfig, setAiConfig] = useState({ provider: "ollama", geminiModel: "gemini-3.6-flash", geminiApiKey: "", geminiConfigured: false });
  const [aiConfigStatus, setAiConfigStatus] = useState("");
  const [aiConfigBusy, setAiConfigBusy] = useState(false);

  useEffect(() => {
    if (isOpen) setActiveTab(initialTab);
  }, [isOpen, initialTab]);

  const store = useStudyStore();
  const themePreference = useStudyStore((state) => state.themePreference || "brisa-amber");
  const setThemePreference = useStudyStore((state) => state.setThemePreference);
  const isDarkMode = useStudyStore((state) => state.isDarkMode);
  const [themeCategoryFilter, setThemeCategoryFilter] = useState("all");

  useEffect(() => {
    if (!isOpen || !window.studyhubDesktop?.academicAI?.getConfig) return;
    window.studyhubDesktop.academicAI.getConfig().then((config) => {
      setAiConfig((current) => ({ ...current, ...config, geminiApiKey: "" }));
    }).catch(() => {});
  }, [isOpen]);

  const sidebarOrder = useStudyStore((state) => state.sidebarOrder || DEFAULT_SIDEBAR_ORDER);
  const sidebarHiddenItems = useStudyStore((state) => state.sidebarHiddenItems || []);
  const appSettings = useStudyStore((state) => state.appSettings || {
    notificationsEnabled: true,
    soundEnabled: true,
    taskDueReminders: true,
    flashcardReviewReminders: true,
    liveTranslationCapture: false,
  });

  const orderedSidebarItems = useMemo(() => {
    const itemMap = new Map(ALL_SIDEBAR_ITEMS.map((item) => [item.key, item]));
    const result = [];
    // First, items in sidebarOrder that exist
    sidebarOrder.forEach((key) => {
      if (itemMap.has(key)) {
        result.push(itemMap.get(key));
        itemMap.delete(key);
      }
    });
    // Any remaining items
    itemMap.forEach((item) => result.push(item));
    return result;
  }, [sidebarOrder]);

  const moveSidebarItem = (index, direction) => {
    const newOrder = [...orderedSidebarItems.map((i) => i.key)];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newOrder.length) return;

    const [moved] = newOrder.splice(index, 1);
    newOrder.splice(targetIndex, 0, moved);
    store.setSidebarOrder?.(newOrder);
  };

  const handleExportBackup = () => {
    try {
      const state = useStudyStore.getState();
      const exportData = {
        studyItems: state.studyItems || [],
        academic: state.academic || {},
        courses: state.courses || [],
        tasks: state.tasks || {},
        books: state.books || [],
        journalEntries: state.journalEntries || [],
        stickyNotes: state.stickyNotes || [],
        flashcards: state.flashcards || [],
        customVaults: state.customVaults || [],
        vaultFolders: state.vaultFolders || [],
        appSettings: state.appSettings || {},
        sidebarOrder: state.sidebarOrder || [],
        sidebarHiddenItems: state.sidebarHiddenItems || [],
        exportedAt: new Date().toISOString(),
        version: "2.5.0",
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `studyhub-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Erro ao exportar dados: " + e.message);
    }
  };

  const handleImportBackup = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (window.confirm("Deseja restaurar este backup? Os dados atuais serão mesclados.")) {
          if (parsed.studyItems) useStudyStore.setState({ studyItems: parsed.studyItems });
          if (parsed.academic) useStudyStore.setState({ academic: parsed.academic });
          if (parsed.courses) useStudyStore.setState({ courses: parsed.courses });
          if (parsed.tasks) useStudyStore.setState({ tasks: parsed.tasks });
          if (parsed.books) useStudyStore.setState({ books: parsed.books });
          if (parsed.journalEntries) useStudyStore.setState({ journalEntries: parsed.journalEntries });
          if (parsed.stickyNotes) useStudyStore.setState({ stickyNotes: parsed.stickyNotes });
          if (parsed.flashcards) useStudyStore.setState({ flashcards: parsed.flashcards });
          if (parsed.customVaults) useStudyStore.setState({ customVaults: parsed.customVaults });
          if (parsed.vaultFolders) useStudyStore.setState({ vaultFolders: parsed.vaultFolders });
          alert("Backup restaurado com sucesso!");
        }
      } catch (err) {
        alert("Arquivo de backup inválido: " + err.message);
      }
    };
    reader.readAsText(file);
  };

  const testSystemNotification = async (test) => {
    setNotificationTestStatus(`Enviando teste de ${test.id}...`);
    try {
      const result = await showSystemNotification({
        ...test,
        sound: appSettings.soundEnabled !== false,
      }, { requestPermission: true });
      setNotificationTestStatus(
        result?.shown
          ? "Notificação enviada. Confira o canto superior direito ou a Central de Notificações."
          : result?.error || "O sistema não confirmou a entrega. Verifique as permissões de notificações do masterStudy.",
      );
    } catch (error) {
      setNotificationTestStatus(error?.message || "Não foi possível enviar a notificação.");
    }
  };

  if (!isOpen) return null;

  const tabs = [
    { id: "sidebar", label: "Barra Lateral", icon: "view_sidebar", count: orderedSidebarItems.length },
    { id: "appearance", label: "Aparência & Tema", icon: "palette" },
    { id: "account", label: "Minha Conta & Nuvem", icon: "account_circle" },
    { id: "ai", label: "Inteligência Artificial", icon: "auto_awesome" },
    { id: "shortcuts", label: "Atalhos do Teclado", icon: "keyboard", count: DEFAULT_SHORTCUTS.length },
    { id: "notifications", label: "Notificações & Foco", icon: "notifications" },
    { id: "data", label: "Dados & Backup", icon: "cloud_sync" },
    { id: "about", label: "Sobre", icon: "info" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[color:var(--surface)] border border-[color:var(--outline-variant)] rounded-3xl w-full max-w-4xl h-[650px] shadow-2xl flex flex-col overflow-hidden text-[color:var(--on-surface)]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[color:var(--outline-variant)]/40 flex items-center justify-between shrink-0 bg-[color:var(--surface-container-lowest)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[color:var(--primary)] text-white flex items-center justify-center shadow-sm">
              <Icon name="settings" className="text-[22px]" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-[color:var(--on-surface)]">
                Configurações
              </h2>
              <p className="text-xs text-[color:var(--on-surface-variant)]">
                Personalize o aplicativo, gerencie sua conta e organize a barra lateral
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl hover:bg-[color:var(--surface-container-high)] flex items-center justify-center text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)] transition-colors"
            title="Fechar (Esc)"
          >
            <Icon name="close" className="text-[20px]" />
          </button>
        </div>

        {/* Content Body: Sidebar + Main Panel */}
        <div className="flex flex-1 min-h-0 flex-col overflow-hidden md:flex-row">
          {/* Left Tabs Nav */}
          <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-[color:var(--outline-variant)]/30 bg-[color:var(--surface-container-lowest)] p-3 md:w-60 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r">
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex shrink-0 items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all text-left ${
                    active
                      ? "bg-[color:var(--primary)] text-white shadow-sm"
                      : "text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-container)] hover:text-[color:var(--on-surface)]"
                  }`}
                >
                  <Icon name={tab.icon} filled={active} className="text-[18px] shrink-0" />
                  <span className="flex-1 truncate">{tab.label}</span>
                  {tab.count !== undefined && !active && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-[color:var(--surface-container-high)] text-[color:var(--on-surface-variant)] font-semibold">
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right Content Panel */}
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-6 bg-[color:var(--surface)]">
            {/* 1. BARRA LATERAL */}
            {activeTab === "sidebar" && (
              <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between pb-4 border-b border-[color:var(--outline-variant)]/20">
                  <div>
                    <h3 className="text-base font-bold text-[color:var(--on-surface)]">
                      Organização da Barra Lateral
                    </h3>
                    <p className="text-xs text-[color:var(--on-surface-variant)] mt-0.5">
                      Escolha quais recursos aparecem no menu principal e ajuste a ordem de exibição.
                    </p>
                  </div>
                  <button
                    onClick={() => store.resetSidebarConfig?.()}
                    className="px-3 py-1.5 rounded-xl border border-[color:var(--outline-variant)] text-xs font-bold hover:bg-[color:var(--surface-container)] transition-colors text-[color:var(--on-surface-variant)] flex items-center gap-1.5"
                  >
                    <Icon name="refresh" className="text-[15px]" />
                    Restaurar Padrão
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  {orderedSidebarItems.map((item, index) => {
                    const isHidden = sidebarHiddenItems.includes(item.key);
                    return (
                      <div
                        key={item.key}
                        className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
                          isHidden
                            ? "bg-[color:var(--surface-container-lowest)]/50 border-[color:var(--outline-variant)]/20 opacity-60"
                            : "bg-[color:var(--surface-container-low)] border-[color:var(--outline-variant)]/40 shadow-sm"
                        }`}
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <button
                            onClick={() => store.toggleSidebarItemVisibility?.(item.key)}
                            className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors ${
                              !isHidden
                                ? "bg-[color:var(--primary)] text-white shadow-sm"
                                : "border border-[color:var(--outline-variant)] bg-[color:var(--surface)] text-transparent hover:border-[color:var(--primary)]"
                            }`}
                            title={!isHidden ? "Ocultar da sidebar" : "Exibir na sidebar"}
                          >
                            <Icon name="check" className="text-[16px]" />
                          </button>

                          <div
                            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                              !isHidden
                                ? "bg-[color:var(--primary)]/10 text-[color:var(--primary)]"
                                : "bg-[color:var(--surface-container-high)] text-[color:var(--on-surface-variant)]"
                            }`}
                          >
                            <Icon name={item.icon} className="text-[18px]" />
                          </div>

                          <div className="min-w-0">
                            <span className="font-bold text-xs text-[color:var(--on-surface)] block truncate">
                              {item.label}
                            </span>
                            <span className="text-[10px] text-[color:var(--on-surface-variant)] block truncate">
                              {item.description}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0 ml-3">
                          <button
                            disabled={index === 0}
                            onClick={() => moveSidebarItem(index, -1)}
                            className="w-8 h-8 rounded-xl hover:bg-[color:var(--surface-container-high)] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)] transition-colors"
                            title="Mover para cima"
                          >
                            <Icon name="arrow_upward" className="text-[16px]" />
                          </button>
                          <button
                            disabled={index === orderedSidebarItems.length - 1}
                            onClick={() => moveSidebarItem(index, 1)}
                            className="w-8 h-8 rounded-xl hover:bg-[color:var(--surface-container-high)] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)] transition-colors"
                            title="Mover para baixo"
                          >
                            <Icon name="arrow_downward" className="text-[16px]" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 2. APARÊNCIA & TEMA */}
            {activeTab === "appearance" && (
              <div className="flex flex-col gap-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-[color:var(--on-surface)]">
                      Tema e Aparência
                    </h3>
                    <p className="text-xs text-[color:var(--on-surface-variant)] mt-0.5">
                      Escolha a combinação visual que melhor se adapta ao seu ambiente de estudo.
                    </p>
                  </div>

                  {/* Filter Pills */}
                  <div className="flex items-center gap-1 rounded-xl border border-[color:var(--outline-variant)]/50 bg-[color:var(--surface-container)] p-1">
                    {[
                      { id: "all", label: "Todos", icon: "dashboard" },
                      { id: "light", label: "Claros", icon: "light_mode" },
                      { id: "dark", label: "Escuros", icon: "dark_mode" },
                    ].map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setThemeCategoryFilter(cat.id)}
                        className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-extrabold transition-all ${
                          themeCategoryFilter === cat.id
                            ? "bg-[color:var(--surface)] text-[color:var(--on-surface)] shadow-sm"
                            : "text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]"
                        }`}
                      >
                        <Icon name={cat.icon} className="text-sm" />
                        <span>{cat.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                  {THEMES.filter(
                    (theme) =>
                      themeCategoryFilter === "all" ||
                      theme.category === themeCategoryFilter ||
                      theme.category === "auto",
                  ).map((theme) => {
                    const isSelected = themePreference === theme.id;
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => setThemePreference(theme.id)}
                        className={`theme-option ${isSelected ? "is-selected" : ""} group relative flex flex-col justify-between overflow-hidden rounded-2xl border-2 p-4 text-left transition-all duration-200 ${
                          isSelected
                            ? "border-[color:var(--primary)] bg-[color:var(--primary)]/10 shadow-lg ring-2 ring-[color:var(--primary)]/20"
                            : "border-[color:var(--outline-variant)]/40 bg-[color:var(--surface-container-low)] hover:border-[color:var(--primary)]/50 hover:bg-[color:var(--surface-container)]"
                        }`}
                      >
                        {isSelected ? (
                          <div className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--primary)] text-[color:var(--on-primary)] shadow-sm">
                            <Icon name="check" className="text-xs" />
                          </div>
                        ) : null}

                        <div>
                          <div className="mb-3 flex items-center justify-between">
                            <div
                              className={`flex h-10 w-10 items-center justify-center rounded-xl transition-transform group-hover:scale-105 ${
                                isSelected
                                  ? "bg-[color:var(--primary)] text-[color:var(--on-primary)] shadow-sm"
                                  : "bg-[color:var(--surface-container-high)] text-[color:var(--on-surface-variant)]"
                              }`}
                            >
                              <Icon name={theme.icon} className="text-xl" />
                            </div>

                            {/* Color palette preview dots */}
                            <div className="flex items-center gap-1 rounded-full border border-[color:var(--outline-variant)]/40 bg-[color:var(--surface)] px-2 py-1 shadow-inner">
                              {theme.colors.map((c, i) => (
                                <span
                                  key={i}
                                  className="h-2.5 w-2.5 rounded-full border border-black/10 shadow-sm"
                                  style={{ backgroundColor: c }}
                                />
                              ))}
                            </div>
                          </div>

                          <div className="flex items-baseline gap-1.5">
                            <span className="font-extrabold text-sm text-[color:var(--on-surface)]">
                              {theme.title}
                            </span>
                            {theme.subtitle ? (
                              <span className="text-[10px] font-bold text-[color:var(--primary)] opacity-90">
                                • {theme.subtitle}
                              </span>
                            ) : null}
                          </div>

                          <p className="mt-1 text-[11px] leading-snug text-[color:var(--on-surface-variant)]">
                            {theme.desc}
                          </p>
                        </div>

                        <div className="mt-3 flex items-center gap-1.5 border-t border-[color:var(--outline-variant)]/30 pt-2.5">
                          <span
                            className={`rounded-md px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider ${
                              theme.isDark === null
                                ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                                : theme.isDark
                                  ? "bg-purple-500/15 text-purple-600 dark:text-purple-400"
                                  : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                            }`}
                          >
                            {theme.isDark === null ? "Auto" : theme.isDark ? "Escuro" : "Claro"}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between rounded-2xl border border-[color:var(--outline-variant)]/30 bg-[color:var(--surface-container-low)] p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[color:var(--primary)]/10 text-[color:var(--primary)]">
                      <Icon name="palette" className="text-xl" />
                    </div>
                    <div>
                      <span className="block text-xs font-bold text-[color:var(--on-surface)]">
                        Tema Selecionado:
                      </span>
                      <span className="text-xs font-extrabold text-[color:var(--primary)]">
                        {getThemeById(themePreference)?.title} ({getThemeById(themePreference)?.subtitle})
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 3. MINHA CONTA & NUVEM */}
            {activeTab === "account" && (
              <div className="flex flex-col h-full">
                <AccountScreen />
              </div>
            )}

            {/* 4. ATALHOS DO TECLADO */}
            {activeTab === "shortcuts" && (
              <div className="flex flex-col gap-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-bold text-[color:var(--on-surface)]">
                      Atalhos do Teclado
                    </h3>
                    <p className="text-xs text-[color:var(--on-surface-variant)] mt-0.5">
                      Navegue e execute ações de alta velocidade usando atalhos.
                    </p>
                  </div>
                  <div className="relative w-48">
                    <Icon
                      name="search"
                      className="absolute left-3 top-2.5 text-[16px] text-[color:var(--on-surface-variant)]"
                    />
                    <input
                      type="text"
                      placeholder="Buscar atalho..."
                      value={shortcutFilter}
                      onChange={(e) => setShortcutFilter(e.target.value)}
                      className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/40 rounded-xl pl-9 pr-3 py-2 text-xs font-semibold outline-none focus:border-[color:var(--primary)]"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  {DEFAULT_SHORTCUTS
                    .filter((shortcut) => window.studyhubDesktop || !shortcut.nativeKey)
                    .filter((s) =>
                      s.label.toLowerCase().includes(shortcutFilter.toLowerCase()) ||
                      s.keys.toLowerCase().includes(shortcutFilter.toLowerCase()) ||
                      s.desc.toLowerCase().includes(shortcutFilter.toLowerCase())
                    )
                    .map((sc) => (
                    <div
                      key={sc.id}
                      className="flex items-center justify-between p-3.5 rounded-2xl bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30"
                    >
                      <div>
                        <span className="font-bold text-xs text-[color:var(--on-surface)] block">
                          {sc.label}
                        </span>
                        <span className="text-[11px] text-[color:var(--on-surface-variant)] block">
                          {sc.desc}
                        </span>
                      </div>
                      <span className="px-3 py-1 rounded-xl bg-[color:var(--surface)] border border-[color:var(--outline-variant)]/60 text-xs font-mono font-bold text-[color:var(--primary)] shadow-sm">
                        {nativeShortcuts[sc.nativeKey] ? shortcutLabel(nativeShortcuts[sc.nativeKey].replace(/CommandOrControl|CmdOrCtrl/g, "Mod")) : sc.keys}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "ai" && (!window.studyhubDesktop?.academicAI ? (
              <div className="rounded-2xl border border-[color:var(--outline-variant)]/40 bg-[color:var(--surface-container-low)] p-6">
                <h3 className="text-base font-bold text-[color:var(--on-surface)]">IA MasterStudy</h3>
                <p className="mt-2 text-sm leading-6 text-[color:var(--on-surface-variant)]">Na versão web, as ferramentas de IA usam o serviço seguro do masterStudy. A chave da API fica no servidor e você não precisa instalar modelos nem configurar tokens.</p>
              </div>
            ) : <div className="flex flex-col gap-6">
                <div>
                  <h3 className="text-base font-bold text-[color:var(--on-surface)]">Provedor de inteligência artificial</h3>
                  <p className="mt-0.5 text-xs text-[color:var(--on-surface-variant)]">Escolha entre processamento local com Ollama ou Gemini pela API do Google.</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: "ollama", title: "Ollama local", desc: "Privado e offline; usa os modelos instalados no computador.", icon: "computer" },
                    { id: "gemini", title: "Google Gemini", desc: "Usa a nuvem e pode gerar custos conforme sua conta Google.", icon: "auto_awesome" },
                  ].map((provider) => (
                    <button className={`rounded-2xl border p-4 text-left transition ${aiConfig.provider === provider.id ? "border-[color:var(--primary)] bg-[color:var(--primary)]/10" : "border-[color:var(--outline-variant)]/40 bg-[color:var(--surface-container-low)] hover:border-[color:var(--primary)]/40"}`} key={provider.id} onClick={() => setAiConfig((current) => ({ ...current, provider: provider.id }))} type="button">
                      <Icon className="text-[22px] text-[color:var(--primary)]" name={provider.icon} />
                      <strong className="mt-3 block text-sm">{provider.title}</strong>
                      <span className="mt-1 block text-[11px] leading-5 text-[color:var(--on-surface-variant)]">{provider.desc}</span>
                    </button>
                  ))}
                </div>

                {aiConfig.provider === "gemini" && (
                  <div className="space-y-4 rounded-2xl border border-[color:var(--outline-variant)]/40 bg-[color:var(--surface-container-low)] p-5">
                    <div>
                      <label className="mb-2 block text-xs font-bold">Chave da API Gemini</label>
                      <input autoComplete="off" className="w-full rounded-xl border border-[color:var(--outline-variant)] bg-[color:var(--surface-container-lowest)] px-4 py-3 text-sm outline-none focus:border-[color:var(--primary)]" onChange={(event) => setAiConfig((current) => ({ ...current, geminiApiKey: event.target.value }))} placeholder={aiConfig.geminiConfigured ? "Chave já protegida — digite apenas para substituir" : "Cole sua chave do Google AI Studio"} type="password" value={aiConfig.geminiApiKey} />
                      <p className="mt-2 text-[11px] text-[color:var(--on-surface-variant)]">A chave fica criptografada pelo armazenamento seguro do macOS e não entra nos backups ou na sincronização.</p>
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-bold">Modelo</label>
                      <input className="w-full rounded-xl border border-[color:var(--outline-variant)] bg-[color:var(--surface-container-lowest)] px-4 py-3 text-sm outline-none focus:border-[color:var(--primary)]" onChange={(event) => setAiConfig((current) => ({ ...current, geminiModel: event.target.value }))} placeholder="gemini-3.6-flash" type="text" value={aiConfig.geminiModel} />
                    </div>
                    <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2.5 text-[11px] text-amber-700 dark:text-amber-300"><Icon name="cloud" />Ao usar Gemini, o conteúdo enviado à IA é processado pelos serviços do Google.</div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <button className="rounded-xl bg-[color:var(--primary)] px-5 py-3 text-xs font-black text-white disabled:opacity-50" disabled={aiConfigBusy} onClick={async () => { setAiConfigBusy(true); setAiConfigStatus("Salvando..."); try { const saved = await window.studyhubDesktop.academicAI.saveConfig(aiConfig); setAiConfig((current) => ({ ...current, ...saved, geminiApiKey: "" })); setAiConfigStatus("Configuração salva."); } catch (error) { setAiConfigStatus(error.message); } finally { setAiConfigBusy(false); } }} type="button">Salvar provedor</button>
                  <button className="rounded-xl border border-[color:var(--outline-variant)] px-5 py-3 text-xs font-black disabled:opacity-50" disabled={aiConfigBusy || (aiConfig.provider === "gemini" && !aiConfig.geminiConfigured && !aiConfig.geminiApiKey.trim())} onClick={async () => { setAiConfigBusy(true); setAiConfigStatus("Testando conexão..."); try { const result = await window.studyhubDesktop.academicAI.testConfig(aiConfig); const saved = await window.studyhubDesktop.academicAI.getConfig(); setAiConfig((current) => ({ ...current, ...saved, geminiApiKey: "" })); setAiConfigStatus(`Conexão funcionando: ${result.model}.`); } catch (error) { setAiConfigStatus(error.message); } finally { setAiConfigBusy(false); } }} type="button">Testar conexão</button>
                  {aiConfigStatus && <span className="text-xs text-[color:var(--on-surface-variant)]">{aiConfigStatus}</span>}
                </div>
              </div>
            )}

            {/* NOTIFICAÇÕES & FOCO */}
            {activeTab === "notifications" && (
              <div className="flex flex-col gap-6">
                <div>
                  <h3 className="text-base font-bold text-[color:var(--on-surface)]">
                    Notificações e Lembretes
                  </h3>
                  <p className="text-xs text-[color:var(--on-surface-variant)] mt-0.5">
                    Configure avisos de estudo, alertas sonoros e notificações de tarefas.
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  {[
                    {
                      key: "notificationsEnabled",
                      title: "Ativar notificações do sistema",
                      desc: "Permite receber alertas de tarefas e revisões",
                      icon: "notifications",
                    },
                    {
                      key: "soundEnabled",
                      title: "Efeitos sonoros de conclusão",
                      desc: "Reproduz um som ao receber notificações",
                      icon: "volume_up",
                    },
                    {
                      key: "taskDueReminders",
                      title: "Lembretes de prazos de tarefas",
                      desc: "Avisos para tarefas e provas que vencem nas próximas 24h",
                      icon: "event_upcoming",
                    },
                    {
                      key: "flashcardReviewReminders",
                      title: "Lembretes de revisão de flashcards",
                      desc: "Mostra uma notificação nativa quando houver cartões vencidos",
                      icon: "style",
                    },

                    {
                      key: "suppressDeleteConfirmation",
                      title: "Pular confirmação ao excluir notas e itens",
                      desc: "Exclui notas e pastas sem exibir o diálogo de confirmação",
                      icon: "delete_forever",
                    },
                    {
                      key: "liveTranslationCapture",
                      title: "Seleção de tradução com tela ao vivo",
                      desc: "Mantém vídeos e animações em movimento durante a seleção. Desative para usar uma captura congelada.",
                      icon: "screenshot_region",
                    },
                  ].map((setting) => {
                    const isChecked = Boolean(appSettings[setting.key]);
                    return (
                      <div
                        key={setting.key}
                        className="flex items-center justify-between p-4 rounded-2xl bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30"
                      >
                        <div className="flex items-center gap-3.5">
                          <div className="w-9 h-9 rounded-xl bg-[color:var(--primary)]/10 text-[color:var(--primary)] flex items-center justify-center">
                            <Icon name={setting.icon} className="text-[18px]" />
                          </div>
                          <div>
                            <span className="font-bold text-xs text-[color:var(--on-surface)] block">
                              {setting.title}
                            </span>
                            <span className="text-[11px] text-[color:var(--on-surface-variant)] block">
                              {setting.desc}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            store.updateAppSettings?.({ [setting.key]: !isChecked })
                          }
                          className={`w-12 h-6 rounded-full transition-colors relative flex items-center px-0.5 ${
                            isChecked
                              ? "bg-[color:var(--primary)]"
                              : "bg-[color:var(--surface-container-highest)]"
                          }`}
                        >
                          <span
                            className={`w-5 h-5 rounded-full bg-white transition-transform transform shadow-sm ${
                              isChecked ? "translate-x-6" : "translate-x-0"
                            }`}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div className="rounded-2xl border border-[color:var(--outline-variant)]/40 bg-[color:var(--surface-container-low)] p-4">
                  <div className="mb-4 flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[color:var(--primary)]/10 text-[color:var(--primary)]">
                      <Icon className="text-[18px]" name="notifications_active" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-[color:var(--on-surface)]">Testar notificações do sistema</h4>
                      <p className="mt-0.5 text-[11px] text-[color:var(--on-surface-variant)]">Envie cada modelo para conferir texto, som, botão e destino.</p>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {NOTIFICATION_TESTS.map((test) => (
                      <button
                        className="flex items-center gap-3 rounded-xl border border-[color:var(--outline-variant)]/50 bg-[color:var(--surface-container-lowest)] px-3 py-3 text-left text-xs font-bold text-[color:var(--on-surface)] transition hover:border-[color:var(--primary)]/40 hover:text-[color:var(--primary)]"
                        key={test.id}
                        onClick={() => testSystemNotification(test)}
                        type="button"
                      >
                        <Icon className="text-[19px] text-[color:var(--primary)]" name={test.icon} />
                        <span className="min-w-0 flex-1 truncate">{test.title}</span>
                        <Icon className="text-[16px] text-[color:var(--on-surface-variant)]" name="send" />
                      </button>
                    ))}
                  </div>
                  {notificationTestStatus ? (
                    <p className="mt-3 rounded-xl bg-[color:var(--surface-container)] px-3 py-2 text-[11px] font-medium text-[color:var(--on-surface-variant)]" role="status">
                      {notificationTestStatus}
                    </p>
                  ) : null}
                </div>
              </div>
            )}

            {/* 6. DADOS & BACKUP */}
            {activeTab === "data" && (
              <div className="flex flex-col gap-6">
                <div>
                  <h3 className="text-base font-bold text-[color:var(--on-surface)]">
                    Dados e Backup Local
                  </h3>
                  <p className="text-xs text-[color:var(--on-surface-variant)] mt-0.5">
                    Exporte seus dados para manter cópias de segurança ou restaure em outro computador.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <button type="button" onClick={() => { onClose?.(); onNavigate?.(SCREEN_IDS.TRASH_HISTORY); }} className="flex items-center gap-3 rounded-2xl border border-[color:var(--outline-variant)]/30 bg-[color:var(--surface-container-low)] p-4 text-left hover:bg-[color:var(--surface-container)]">
                      <Icon name="delete_sweep" className="text-2xl text-[color:var(--primary)]" />
                      <span><strong className="block text-sm">Lixeira e histórico</strong><small className="text-xs text-[color:var(--on-surface-variant)]">Restaurar itens e consultar ações recentes</small></span>
                    </button>
                  </div>
                  <div className="p-5 rounded-3xl bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 flex flex-col justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
                        <Icon name="download" className="text-[22px]" />
                      </div>
                      <div>
                        <span className="font-bold text-sm text-[color:var(--on-surface)] block">
                          Exportar Backup
                        </span>
                        <span className="text-xs text-[color:var(--on-surface-variant)] mt-1 block">
                          Gera um arquivo JSON contendo todas as suas matérias, notas, tarefas e flashcards.
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={handleExportBackup}
                      className="w-full py-2.5 px-4 rounded-xl bg-[color:var(--primary)] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm hover:opacity-90 transition-opacity"
                    >
                      <Icon name="download" className="text-[16px]" />
                      Baixar Arquivo JSON
                    </button>
                  </div>

                  <div className="p-5 rounded-3xl bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 flex flex-col justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                        <Icon name="upload" className="text-[22px]" />
                      </div>
                      <div>
                        <span className="font-bold text-sm text-[color:var(--on-surface)] block">
                          Restaurar Backup
                        </span>
                        <span className="text-xs text-[color:var(--on-surface-variant)] mt-1 block">
                          Carregue um arquivo JSON gerado anteriormente para restaurar seus dados.
                        </span>
                      </div>
                    </div>
                    <label className="w-full py-2.5 px-4 rounded-xl bg-[color:var(--surface-container-high)] text-[color:var(--on-surface)] hover:bg-[color:var(--surface-container-highest)] font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors border border-[color:var(--outline-variant)]/40">
                      <Icon name="file_upload" className="text-[16px]" />
                      Selecionar Arquivo JSON
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleImportBackup}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* 7. SOBRE */}
            {activeTab === "about" && (
              <div className="flex flex-col gap-6 items-center text-center py-6">
                <div className="w-16 h-16 rounded-3xl bg-[color:var(--primary)] text-white flex items-center justify-center shadow-lg mb-2">
                  <Icon name="school" className="text-[34px]" filled />
                </div>
                <div>
                  <h3 className="text-xl font-black text-[color:var(--on-surface)]">
                    masterStudy Desktop
                  </h3>
                  <p className="text-xs font-semibold text-[color:var(--primary)] mt-1">
                    Versão 2.5.0 (Build 2026.08)
                  </p>
                </div>
                <p className="text-xs text-[color:var(--on-surface-variant)] max-w-md leading-relaxed">
                  Sistema completo para gestão de estudos, notas em Markdown com cofres independentes,
                  leitura guiada de PDFs, revisões espaçadas e produtividade acadêmica.
                </p>
                <div className="pt-4 border-t border-[color:var(--outline-variant)]/30 w-full max-w-sm flex justify-around text-xs text-[color:var(--on-surface-variant)]">
                  <span>Desenvolvido com Electron & React</span>
                  <span>•</span>
                  <span>Totalmente Offline-First</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
