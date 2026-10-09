import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import { SCREEN_IDS } from "../app/screenIds";
import { useStudyStore } from "../store/useStore";
import { buildSearchIndex } from "../domain/studySelectors";

import { isPrimaryShortcut, shortcutLabel } from "../utils/keyboardShortcuts";

const screenId = (value) => value === "today" ? SCREEN_IDS.TODAY : value;

const CATEGORIES = [
  { id: "all", label: "Todos", icon: "dashboard" },
  { id: "favorites", label: "Favoritos", icon: "star" },
  { id: "commands", label: "Ações", icon: "bolt" },
  { id: "courses", label: "Cursos", icon: "school" },
  { id: "notes", label: "Notas", icon: "edit_note" },
  { id: "tasks", label: "Tarefas", icon: "task_alt" },
  { id: "flashcards", label: "Flashcards", icon: "psychology" },
];

export function CommandPalette({ onNavigate, standalone = false, initialOpen = false }) {
  const state = useStudyStore((store) => store);
  const setActiveCourse = useStudyStore((store) => store.setActiveCourse);
  const setActiveModule = useStudyStore((store) => store.setActiveModule);
  const setActiveLesson = useStudyStore((store) => store.setActiveLesson);
  const setActiveNote = useStudyStore((store) => store.setActiveNote);
  const setActiveTask = useStudyStore((store) => store.setActiveTask);
  const setActiveDeck = useStudyStore((store) => store.setActiveDeck);
  const setActiveAcademicSubject = useStudyStore((store) => store.setActiveAcademicSubject);
  const undoImportTransaction = useStudyStore((store) => store.undoImportTransaction);
  const addNote = useStudyStore((store) => store.addNote);
  const openSettingsModal = useStudyStore((store) => store.openSettingsModal);
  const favoriteCommands = useStudyStore((store) => store.favoriteCommands || []);
  const toggleFavoriteCommand = useStudyStore((store) => store.toggleFavoriteCommand);
  const setThemePreference = useStudyStore((store) => store.setThemePreference);

  const [open, setOpen] = useState(initialOpen);
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef(null);

  const index = useMemo(() => buildSearchIndex(state), [state]);
  const favoriteSet = useMemo(() => new Set(favoriteCommands), [favoriteCommands]);

  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    let items = index;

    // Filter by Category tab
    if (selectedCategory === "favorites") {
      items = items.filter((item) => favoriteSet.has(item.id));
    } else if (selectedCategory === "commands") {
      items = items.filter((item) => item.id.startsWith("command-"));
    } else if (selectedCategory === "courses") {
      items = items.filter((item) => item.type === "Curso" || item.type === "Aula" || item.type === "Disciplina" || item.type === "Cursos");
    } else if (selectedCategory === "notes") {
      items = items.filter((item) => item.type === "Nota");
    } else if (selectedCategory === "tasks") {
      items = items.filter((item) => item.type === "Tarefa");
    } else if (selectedCategory === "flashcards") {
      items = items.filter((item) => item.type === "Deck" || item.type === "Revisão");
    }

    if (normalized) {
      return items.filter((item) => item.search.toLocaleLowerCase("pt-BR").includes(normalized)).slice(0, 16);
    }

    // If query is empty and category is all, boost favorites to the top
    if (selectedCategory === "all") {
      const favs = items.filter((item) => favoriteSet.has(item.id));
      const nonFavs = items.filter((item) => !favoriteSet.has(item.id));
      return [...favs, ...nonFavs].slice(0, 16);
    }

    return items.slice(0, 16);
  }, [index, query, selectedCategory, favoriteSet]);

  useEffect(() => {
    const handleOpenSearch = () => {
      setOpen(true);
      setQuery("");
      setSelected(0);
    };

    const handleKeyDown = (event) => {
      // Cmd/Ctrl+K is app-scoped and does not override Spotlight or Print.
      if (isPrimaryShortcut(event) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        event.stopPropagation();
        setOpen((prev) => !prev);
        setQuery("");
        setSelected(0);
        return;
      }

      if (!open) return;

      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelected((value) => Math.min(value + 1, Math.max(0, results.length - 1)));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelected((value) => Math.max(0, value - 1));
        return;
      }
      if (event.key === "Enter" && results[selected]) {
        event.preventDefault();
        execute(results[selected]);
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        const catIdx = CATEGORIES.findIndex((c) => c.id === selectedCategory);
        const nextIdx = event.shiftKey
          ? (catIdx - 1 + CATEGORIES.length) % CATEGORIES.length
          : (catIdx + 1) % CATEGORIES.length;
        setSelectedCategory(CATEGORIES[nextIdx].id);
        setSelected(0);
      }
    };

    window.addEventListener("studyhub-open-search", handleOpenSearch);
    const unsubscribe = window.studyhubDesktop?.onCommandPalette?.(() => {
      setOpen(true);
      setQuery("");
      setSelected(0);
    });
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("studyhub-open-search", handleOpenSearch);
      unsubscribe?.();
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open, results, selected, selectedCategory]);

  useEffect(() => {
    if (open) {
      window.setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setSelected(0);
  }, [query, selectedCategory]);

  const addTask = useStudyStore((store) => store.addTask);
  const addJournalEntry = useStudyStore((store) => store.addJournalEntry);

  const execute = (item) => {
    // Se estiver em janela separada (ou se houver outras janelas), sincroniza via BroadcastChannel
    if (typeof BroadcastChannel !== "undefined") {
      try {
        const channel = new BroadcastChannel("studyhub-palette-channel");
        channel.postMessage({
          type: item.action ? "ACTION" : "NAVIGATE",
          action: item.action,
          item: {
            screen: item.screen,
            courseId: item.courseId,
            moduleId: item.moduleId,
            lessonId: item.lessonId,
            noteId: item.noteId,
            taskId: item.taskId,
            deckId: item.deckId,
            academicSubjectId: item.academicSubjectId,
          },
        });
        channel.close();
      } catch (e) {
        console.error("Erro ao emitir mensagem no canal da paleta:", e);
      }
    }

    const closePalette = () => {
      setOpen(false);
      if (standalone) {
        window.studyhubDesktop?.openMainWindow?.();
        window.studyhubDesktop?.closeCommandPalette?.();
      }
    };

    // Handle special actions first (commands with action field)
    const action = item.action;
    if (action) {
      switch (action) {
        case "toggle-theme": {
          const currentTheme = useStudyStore.getState().themePreference || "system";
          const themeList = ["light", "dark", "midnight-oled", "dracula", "catppuccin-mocha", "tokyo-night", "nord", "matcha-forest", "rose-pine", "warm-sepia", "cyber-matrix"];
          const currIdx = themeList.indexOf(currentTheme);
          const nextTheme = themeList[(currIdx + 1) % themeList.length];
          setThemePreference?.(nextTheme);
          closePalette();
          return;
        }
        case "open-settings": {
          openSettingsModal("sidebar");
          closePalette();
          return;
        }
        case "export": {
          window.studyhubDesktop?.studyDatabase?.export?.();
          closePalette();
          return;
        }
        case "import": {
          window.studyhubDesktop?.studyDatabase?.import?.().then((result) => {
            if (result?.state) useStudyStore.setState(result.state);
          }).catch((error) => console.error("Falha ao importar biblioteca:", error));
          closePalette();
          return;
        }
        case "undo-import": {
          const latest = useStudyStore.getState().importTransactions?.[0];
          if (latest) undoImportTransaction(latest.id);
          closePalette();
          return;
        }
        case "create-note": {
          const noteId = `note-${Date.now()}`;
          const newNote = {
            id: noteId,
            title: "Nova nota",
            content: "",
            module: "Notas",
            category: "Nota rápida",
            sourceCourseId: null,
            sourceModuleId: null,
            sourceLessonId: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          addNote(newNote);
          setActiveNote(noteId);
          useStudyStore.getState().openTab?.(newNote);
          window.studyhubDesktop?.studyDatabase?.save?.(useStudyStore.getState());
          closePalette();
          onNavigate?.(SCREEN_IDS.NOTES);
          return;
        }
        case "create-task": {
          closePalette();
          onNavigate?.(SCREEN_IDS.TASKS);
          window.setTimeout(() => {
            window.dispatchEvent(new CustomEvent("studyhub-open-add-task"));
          }, 100);
          return;
        }
        case "create-discipline": {
          closePalette();
          onNavigate?.(SCREEN_IDS.DISCIPLINES);
          window.setTimeout(() => {
            window.dispatchEvent(new CustomEvent("studyhub-open-add-discipline"));
          }, 100);
          return;
        }
        case "create-project": {
          closePalette();
          onNavigate?.(SCREEN_IDS.PROJECTS);
          window.setTimeout(() => {
            window.dispatchEvent(new CustomEvent("studyhub-open-add-project", { detail: { programming: true } }));
          }, 100);
          return;
        }

        case "quick-capture": {
          closePalette();
          onNavigate?.(SCREEN_IDS.KNOWLEDGE_HUB);
          window.setTimeout(() => {
            window.dispatchEvent(new CustomEvent("studyhub-open-quick-capture"));
          }, 100);
          return;
        }
        case "open-translator": {
          closePalette();
          window.studyhubDesktop?.translator?.showPopup?.();
          return;
        }
        default:
          if (action.startsWith("set-theme:")) {
            const themeId = action.replace("set-theme:", "");
            setThemePreference?.(themeId);
            closePalette();
            return;
          }
          break;
      }
    }

    // Set active entities for navigation
    if (item.courseId) setActiveCourse(item.courseId);
    if (item.moduleId) setActiveModule(item.moduleId);
    if (item.lessonId) setActiveLesson(item.lessonId);
    if (item.noteId) setActiveNote(item.noteId);
    if (item.taskId) setActiveTask(item.taskId);
    if (item.deckId) setActiveDeck(item.deckId);
    if (item.academicSubjectId) setActiveAcademicSubject(item.academicSubjectId);

    // Determine target screen — item.screen already uses exact SCREEN_IDS values
    let target;
    if (item.noteId) {
      target = SCREEN_IDS.NOTES;
    } else if (item.taskId) {
      target = SCREEN_IDS.TASK_DETAILS;
    } else if (item.academicSubjectId) {
      target = SCREEN_IDS.ACADEMIC_SUBJECT;
    } else if (item.screen) {
      target = item.screen;
    }

    closePalette();
    if (target) onNavigate?.(target);
  };

  const getItemIcon = (item) => {
    if (item.icon) return item.icon;
    if (item.type === "Ferramenta" || item.id.startsWith("command-")) return "bolt";
    if (item.type === "Nota") return "edit_note";
    if (item.type === "Tarefa") return "task_alt";
    if (item.type === "Aula") return "play_circle";
    if (item.type === "Curso" || item.type === "Cursos") return "school";
    if (item.type === "Disciplina") return "menu_book";
    if (item.type === "Deck" || item.type === "Revisão") return "psychology";
    return "search";
  };

  return (
    <>
      {open ? (
        <div
          className={`fixed inset-0 z-[120] flex items-start justify-center px-4 pt-[10vh] ${
            standalone ? "bg-transparent" : "bg-black/40 backdrop-blur-md animate-in fade-in duration-150"
          }`}
          role="dialog"
          aria-modal="true"
          aria-label="Paleta de Comandos Global"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-2xl overflow-hidden rounded-[1.75rem] border border-[color:var(--outline-variant)]/40 bg-[color:var(--surface)] shadow-2xl animate-in zoom-in-95 duration-150 flex flex-col max-h-[80vh]">
            {/* Header / Input */}
            <div className="flex items-center gap-3 border-b border-[color:var(--outline-variant)]/30 px-5 py-4 bg-[color:var(--surface-container-low)]">
              <Icon name="terminal" className="text-[color:var(--primary)] text-xl" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Digite um comando, atalho, curso, nota ou pressione ↑↓..."
                className="min-w-0 flex-1 bg-transparent text-base font-bold text-[color:var(--on-surface)] outline-none placeholder:text-[color:var(--on-surface-variant)]/50"
              />
              <div className="flex items-center gap-1.5">
                <kbd className="rounded-lg px-2 py-1 text-[11px] font-mono font-bold text-[color:var(--on-surface-variant)] neo-inset">
                  {shortcutLabel("Mod+K")}
                </kbd>
                <kbd className="rounded-lg px-2 py-1 text-[11px] font-mono font-bold text-[color:var(--on-surface-variant)] neo-inset">
                  Esc
                </kbd>
              </div>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1 px-4 py-2 border-b border-[color:var(--outline-variant)]/20 overflow-x-auto custom-scrollbar bg-[color:var(--surface)]">
              {CATEGORIES.map((cat) => {
                const isActive = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                      isActive
                        ? "bg-[color:var(--primary)] text-white shadow-xs"
                        : "text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-container-high)]"
                    }`}
                  >
                    <Icon name={cat.icon} className="text-sm" />
                    <span>{cat.label}</span>
                    {cat.id === "favorites" && favoriteCommands.length > 0 && (
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isActive ? "bg-white/20 text-white" : "bg-[color:var(--primary)]/10 text-[color:var(--primary)]"}`}>
                        {favoriteCommands.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Results List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
              {results.length ? (
                results.map((item, indexValue) => {
                  const isSelected = indexValue === selected;
                  const isFav = favoriteSet.has(item.id);

                  return (
                    <div
                      key={item.id}
                      onMouseEnter={() => setSelected(indexValue)}
                      onClick={() => execute(item)}
                      className={`group flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left transition-all cursor-pointer ${
                        isSelected
                          ? "bg-[color:var(--primary)]/10 text-[color:var(--primary)] shadow-xs"
                          : "text-[color:var(--on-surface)] hover:bg-[color:var(--surface-container-high)]"
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all ${
                          isSelected
                            ? "bg-[color:var(--primary)] text-white"
                            : "bg-[color:var(--surface-container-high)] text-[color:var(--primary)] group-hover:scale-105"
                        }`}
                      >
                        <Icon name={getItemIcon(item)} className="text-base" />
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-bold">{item.title}</span>
                          {isFav && (
                            <span className="shrink-0 text-amber-500" title="Comando Favorito">
                              <Icon name="star" className="text-xs fill-current" />
                            </span>
                          )}
                        </div>
                        {item.courseTitle || item.moduleTitle ? (
                          <p className="text-[11px] text-[color:var(--on-surface-variant)] truncate">
                            {[item.courseTitle, item.moduleTitle].filter(Boolean).join(" • ")}
                          </p>
                        ) : null}
                      </div>

                      <span className="shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-[color:var(--surface-container-high)] text-[color:var(--on-surface-variant)]">
                        {item.type}
                      </span>

                      {/* Favorite Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavoriteCommand(item.id);
                        }}
                        className={`shrink-0 p-1.5 rounded-lg transition-all ${
                          isFav
                            ? "text-amber-500 hover:text-amber-600 scale-110"
                            : "text-[color:var(--on-surface-variant)]/30 hover:text-amber-500 hover:scale-110"
                        }`}
                        title={isFav ? "Remover dos favoritos" : "Favoritar comando"}
                      >
                        <Icon name={isFav ? "star" : "star_border"} className="text-lg" />
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="p-12 text-center text-sm text-[color:var(--on-surface-variant)] space-y-2">
                  <Icon name="search_off" className="text-4xl opacity-40 mx-auto" />
                  <p className="font-bold">Nenhum comando ou item encontrado.</p>
                  <p className="text-xs text-[color:var(--on-surface-variant)]/70">Tente buscar com outros termos ou alterne a categoria acima.</p>
                </div>
              )}
            </div>

            {/* Footer Shortcuts hint */}
            <div className="flex items-center justify-between border-t border-[color:var(--outline-variant)]/30 px-5 py-3 text-[11px] font-medium text-[color:var(--on-surface-variant)] bg-[color:var(--surface-container-low)]">
              <div className="flex items-center gap-3">
                <span><b>↑↓</b> navegar</span>
                <span><b>Enter</b> executar</span>
                <span><b>Tab</b> categoria</span>
                <span><b>Esc</b> fechar</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[color:var(--primary)] font-bold">
                <Icon name="auto_awesome" className="text-sm" />
                <span>Atalho: {shortcutLabel("Mod+K")}</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
