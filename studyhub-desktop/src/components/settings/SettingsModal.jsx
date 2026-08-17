import React, { useState, useMemo } from "react";
import { Icon } from "../../ui/Icon";
import { useStudyStore } from "../../store/useStore";
import { SCREEN_IDS } from "../../app/screenIds";
import { AccountScreen } from "../../screens/AccountScreen";
import { THEMES, getThemeById } from "../../theme/themes";

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
  { id: "quick_switcher", label: "Abrir nota rápida (Quick Switcher)", keys: "Ctrl + O", desc: "Busca instantânea de notas em todos os cofres" },
  { id: "command_palette", label: "Paleta de Comandos", keys: "Ctrl + K", desc: "Acessa qualquer tela ou comando com a busca inteligente" },
  { id: "new_note", label: "Criar nova nota", keys: "Ctrl + N", desc: "Cria uma nota imediatamente no cofre ativo" },
  { id: "settings", label: "Abrir Configurações", keys: "Ctrl + ,", desc: "Abre o painel de personalização do StudyHub" },
  { id: "toggle_sidebar", label: "Recolher / Expandir Menu", keys: "Ctrl + B", desc: "Alterna a visibilidade da barra lateral esquerda" },
  { id: "focus_pomodoro", label: "Iniciar Sessão de Foco", keys: "Ctrl + P", desc: "Abre o cronômetro Pomodoro integrado" },
  { id: "global_search", label: "Busca Global", keys: "Ctrl + Shift + F", desc: "Pesquisa em matérias, tarefas e livros" },
];

export function SettingsModal({ isOpen, onClose, initialTab = "sidebar" }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [shortcutFilter, setShortcutFilter] = useState("");

  const store = useStudyStore();
  const themePreference = useStudyStore((state) => state.themePreference || "system");
  const setThemePreference = useStudyStore((state) => state.setThemePreference);
  const isDarkMode = useStudyStore((state) => state.isDarkMode);
  const [themeCategoryFilter, setThemeCategoryFilter] = useState("all");

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
  const appSettings = useStudyStore((state) => state.appSettings || {
    notificationsEnabled: true,
    soundEnabled: true,
    pomodoroAutoBreak: false,
    taskDueReminders: true,
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

  if (!isOpen) return null;

  const tabs = [
    { id: "sidebar", label: "Barra Lateral", icon: "view_sidebar", count: orderedSidebarItems.length },
    { id: "appearance", label: "Aparência & Tema", icon: "palette" },
    { id: "account", label: "Minha Conta & Nuvem", icon: "account_circle" },
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
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left Tabs Nav */}
          <div className="w-60 shrink-0 border-r border-[color:var(--outline-variant)]/30 bg-[color:var(--surface-container-lowest)] p-3 flex flex-col gap-1 overflow-y-auto">
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all text-left ${
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
          <div className="flex-1 overflow-y-auto p-6 bg-[color:var(--surface)]">
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
                        className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border-2 p-4 text-left transition-all duration-200 ${
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
                  {DEFAULT_SHORTCUTS.filter(
                    (s) =>
                      s.label.toLowerCase().includes(shortcutFilter.toLowerCase()) ||
                      s.keys.toLowerCase().includes(shortcutFilter.toLowerCase()) ||
                      s.desc.toLowerCase().includes(shortcutFilter.toLowerCase()),
                  ).map((sc) => (
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
                        {sc.keys}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 5. NOTIFICAÇÕES & FOCO */}
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
                      desc: "Permite receber alertas de pausas e conclusões",
                      icon: "notifications",
                    },
                    {
                      key: "soundEnabled",
                      title: "Efeitos sonoros de conclusão",
                      desc: "Toca um som suave ao finalizar ciclos de foco ou tarefas",
                      icon: "volume_up",
                    },
                    {
                      key: "taskDueReminders",
                      title: "Lembretes de prazos de tarefas",
                      desc: "Avisos para tarefas e provas que vencem nas próximas 24h",
                      icon: "event_upcoming",
                    },
                    {
                      key: "pomodoroAutoBreak",
                      title: "Iniciar pausas automaticamente",
                      desc: "Inicia o intervalo do Pomodoro assim que o tempo de foco termina",
                      icon: "timer",
                    },
                    {
                      key: "suppressDeleteConfirmation",
                      title: "Pular confirmação ao excluir notas e itens",
                      desc: "Exclui notas e pastas sem exibir o diálogo de confirmação",
                      icon: "delete_forever",
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
                    StudyHub / CampusFlow Desktop
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
