import { lazy, Suspense, useState, useEffect, useRef, useCallback } from "react";
import { SCREEN_IDS } from "./screenIds";
import { imageAssets } from "../data/mockData";
import { StandardSidebar } from "../layout/StandardSidebar";
import { CompactSidebar } from "../layout/CompactSidebar";
import { AppTitleBar } from "../layout/AppTitleBar";
import { TopBar } from "../layout/TopBar";
import { CampusFlowDashboardScreen } from "../screens/CampusFlowDashboardScreen";
import { AccountScreen } from "../screens/AccountScreen";
import { StudyAlerts } from "../components/StudyAlerts";
import { BookImportProgress } from "../components/books/BookImportProgress";
import { PomodoroCompletionCelebration } from "../components/PomodoroCompletionCelebration";
import { QuickNoteModal } from "../components/QuickNoteModal";
import { CommandPalette } from "../components/CommandPalette";
import { Icon } from "../ui/Icon";
import { AnimatePresence, motion } from "framer-motion";
import { isPrimaryShortcut } from "../utils/keyboardShortcuts";

import { useStudyStore } from "../store/useStore";
import { collaborationCloud, collaborationCloudConfigured } from "../services/collaboration-cloud";
import { usePomodoroStore } from "../store/usePomodoroStore";
import { mergeWaterTrackers } from "../domain/waterTracker";
import { normalizeAcademicStateSnapshot } from "../domain/academic";
import {
  getCloudDeviceId,
  mergeStudyStates,
  serializeStudyState,
} from "../services/account-sync";

const lazyNamed = (loader, exportName) =>
  lazy(() => loader().then((module) => ({ default: module[exportName] })));

import { CampusFlowCoursesScreen } from "../screens/CampusFlowLibraryScreen";
import { NotesScreen } from "../screens/NotesScreen";
import { CampusFlowBooksScreen } from "../screens/CampusFlowBooksScreen";
import { CampusFlowBookDetailsScreen } from "../screens/CampusFlowBookDetailsScreen";
import { CampusFlowCalendarScreen } from "../screens/CampusFlowCalendarScreen";
import { CampusFlowTasksScreen } from "../screens/CampusFlowTasksScreen";
import { CampusFlowDisciplinesScreen } from "../screens/CampusFlowDisciplinesScreen";
import { AcademicSubjectScreenV2 } from "../screens/AcademicSubjectScreenV2";
import { CampusFlowProjectsScreen, CampusFlowProjectDetailsScreen } from "../screens/CampusFlowProjectsScreen";
import { JournalScreen } from "../screens/JournalScreen";
import { StickyNotesScreen } from "../screens/StickyNotesScreen";
import { StickyNoteWidgetScreen } from "../screens/StickyNoteWidgetScreen";
import { FlashcardsScreen } from "../screens/FlashcardsScreen";
import { PomodoroScreen } from "../screens/PomodoroScreen";
import { KnowledgeHubScreen } from "../screens/KnowledgeHubScreen";
import { KnowledgeItemDetailScreen } from "../screens/KnowledgeItemDetailScreen";
import { TrashHistoryScreen } from "../screens/TrashHistoryScreen";
import { TrayPopoverScreen } from "../screens/TrayPopoverScreen";

const BookReaderScreen = lazyNamed(
  () => import("../screens/BookReaderScreen"),
  "BookReaderScreen",
);
const ModulesScreen = lazyNamed(
  () => import("../screens/ModulesScreen"),
  "ModulesScreen",
);
const ModuleDetailsScreen = lazyNamed(
  () => import("../screens/ModuleDetailsScreen"),
  "ModuleDetailsScreen",
);
const ImmersionScreen = lazyNamed(
  () => import("../screens/ImmersionScreen"),
  "ImmersionScreen",
);
const LessonScreen = lazyNamed(
  () => import("../screens/LessonScreen"),
  "LessonScreen",
);
const TaskDetailsScreen = lazyNamed(
  () => import("../screens/TaskDetailsScreen"),
  "TaskDetailsScreen",
);
const NoteEditorScreen = lazyNamed(
  () => import("../screens/NoteEditorScreen"),
  "NoteEditorScreen",
);
const CreateModuleScreen = lazyNamed(
  () => import("../screens/CreateModuleScreen"),
  "CreateModuleScreen",
);
const AddLessonScreen = lazyNamed(
  () => import("../screens/AddLessonScreen"),
  "AddLessonScreen",
);
const CreateFlashcardScreen = lazyNamed(
  () => import("../screens/CreateFlashcardScreen"),
  "CreateFlashcardScreen",
);
const WhiteboardScreen = lazyNamed(
  () => import("../screens/WhiteboardScreen"),
  "WhiteboardScreen",
);
const CreateCourseScreen = lazyNamed(
  () => import("../screens/CreateCourseScreen"),
  "CreateCourseScreen",
);
const PomodoroWidgetScreen = lazyNamed(
  () => import("../screens/PomodoroWidgetScreen"),
  "PomodoroWidgetScreen",
);
const WorkSpaceScreen = lazyNamed(
  () => import("../screens/WorkSpaceScreen"),
  "WorkSpaceScreen",
);
const ProgrammingProjectScreen = lazyNamed(
  () => import("../screens/ProgrammingProjectScreen"),
  "ProgrammingProjectScreen",
);

const CodeLabScreen = lazy(() =>
  import("../features/code-lab/CodeLabScreen").then((module) => ({
    default: module.CodeLabScreen || module.default,
  })),
);

function AppScreenFallback() {
  return null;
}

function ImmersionSteps() {
  const immersionStepIndex = useStudyStore((state) => state.immersionStepIndex);

  const steps = [
    { id: "listen", icon: "headphones", label: "Ouvir" },
    { id: "video", icon: "play_circle", label: "Aula" },
    { id: "pdf", icon: "menu_book", label: "PDF" },
    { id: "mixed", icon: "library_music", label: "PDF+Áudio" },
  ];

  return (
    <nav className="neo-inset hidden items-center gap-3 rounded-full px-5 py-3 lg:flex">
      {steps.map((step, index) => {
        const active = index === immersionStepIndex;
        return (
          <div key={step.id} className="flex items-center gap-3">
            <div
              className={`flex items-center gap-2 text-sm ${active ? "font-semibold text-[color:var(--primary)]" : "text-[color:var(--on-surface-variant)]"}`}
            >
              <Icon className="text-[16px]" name={step.icon} />
              {step.label}
            </div>
            {index < steps.length - 1 ? (
              <Icon
                className="text-[18px] text-[color:var(--outline)]"
                name="chevron_right"
              />
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

export function AppShell() {
  const windowSearch =
    typeof window !== "undefined" ? window.location.search : "";
  const windowParams =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : null;
  const setActiveCourse = useStudyStore((state) => state.setActiveCourse);
  const setActiveModule = useStudyStore((state) => state.setActiveModule);
  const setActiveLesson = useStudyStore((state) => state.setActiveLesson);
  const setActiveBook = useStudyStore((state) => state.setActiveBook);
  const quickNoteShortcut = useStudyStore((state) => state.quickNoteShortcut);
  const quickDrawShortcut = useStudyStore((state) => state.quickDrawShortcut);
  const translatorTextShortcut = useStudyStore(
    (state) => state.translatorTextShortcut,
  );
  const translatorOcrShortcut = useStudyStore(
    (state) => state.translatorOcrShortcut,
  );
  const aiFlashcardShortcut = useStudyStore(
    (state) => state.aiFlashcardShortcut,
  );
  const stickyNotesShortcut = useStudyStore(
    (state) => state.stickyNotesShortcut,
  );
  const liveTranslationCapture = useStudyStore(
    (state) => Boolean(state.appSettings?.liveTranslationCapture),
  );
  const requestImmersionSeek = useStudyStore(
    (state) => state.requestImmersionSeek,
  );

  useEffect(() => {
    window.studyhubDesktop?.translator?.setCaptureMode?.(
      liveTranslationCapture ? "live" : "frozen",
    );
  }, [liveTranslationCapture]);

  useEffect(() => {
    return window.studyhubDesktop?.macWidgets?.onNavigate?.((screen) => {
      if (screen) window.dispatchEvent(new CustomEvent("studyhub:navigate", { detail: { screen } }));
    });
  }, []);

  useEffect(() => {
    return window.studyhubDesktop?.trayPopover?.onOpenSettings?.(() => {
      useStudyStore.getState().openSettingsModal?.("notifications");
    });
  }, []);


  useEffect(() => {
    return window.studyhubDesktop?.stickyNotes?.onChanged?.((change) => {
      if (!change?.noteId) return;
      if (change.type === "deleted") {
        useStudyStore.setState((state) => ({
          stickyNotes: (state.stickyNotes || []).filter(
            (note) => note.id !== change.noteId,
          ),
        }));
        return;
      }
      if (change.type === "updated" && change.updates) {
        useStudyStore.getState().updateStickyNote?.(
          change.noteId,
          change.updates,
        );
      }
    });
  }, []);

  useEffect(() => {
    if (!window.studyhubDesktop?.onStudyDataChanged) return undefined;

    return window.studyhubDesktop.onStudyDataChanged(() => {
      const database = window.studyhubDesktop?.studyDatabase;
      if (database?.load) {
        database
          .load()
          .then((snapshot) => {
            if (snapshot?.state) {
              const normalized = normalizeAcademicStateSnapshot(snapshot.state);
              // Força que a referência seja completamente nova no store
              useStudyStore.setState((state) => ({
                ...normalized,
                waterTracker: mergeWaterTrackers(state.waterTracker, normalized.waterTracker),
              }));
              useStudyStore.getState().upgradeDashboardStickyNotes?.();
            }
          })
          .catch(() => useStudyStore.persist.rehydrate());
        return;
      }
      useStudyStore.persist.rehydrate();
    });
  }, []);

  useEffect(() => {
    const handleGlobalInternalNoteClick = (event) => {
      if (!(event.target instanceof Element)) return;
      const target = event.target.closest('a[href*="#nested-note="], [data-nested-note-id]');
      if (!target) return;

      event.preventDefault();
      event.stopPropagation();

      const href = target.getAttribute("href") || "";
      const dataId = target.getAttribute("data-nested-note-id") || "";
      const childId = dataId || href.split("#nested-note=")[1];

      if (childId) {
        useStudyStore.getState().setActiveNote(childId);
        setActiveScreen(SCREEN_IDS.NOTE_EDITOR);
      }
    };

    document.addEventListener("click", handleGlobalInternalNoteClick, true);
    return () => document.removeEventListener("click", handleGlobalInternalNoteClick, true);
  }, []);

  const [activeScreen, setActiveScreen] = useState(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get("screen") || SCREEN_IDS.TODAY;
    }
    return SCREEN_IDS.TODAY;
  });

  const [screenHistory, setScreenHistory] = useState([]);
  const activeScreenRef = useRef(activeScreen);

  useEffect(() => {
    activeScreenRef.current = activeScreen;
  }, [activeScreen]);

  const handleNavigate = useCallback((targetScreen) => {
    if (!targetScreen) return;

    if (targetScreen === "BACK" || targetScreen === "PREVIOUS" || targetScreen === "back") {
      setScreenHistory((prevHistory) => {
        if (prevHistory.length === 0) {
          setActiveScreen(SCREEN_IDS.TODAY);
          return [];
        }
        const nextHistory = [...prevHistory];
        const prevScreen = nextHistory.pop();
        setActiveScreen(prevScreen || SCREEN_IDS.TODAY);
        return nextHistory;
      });
      return;
    }

    const currentScreen = activeScreenRef.current;
    if (currentScreen !== targetScreen) {
      setScreenHistory((prevHistory) => [...prevHistory, currentScreen]);
      setActiveScreen(targetScreen);
    }
  }, []);

  const [capturedNotification, setCapturedNotification] = useState(null);

  useEffect(() => {
    const handleWebNavigation = (event) => handleNavigate(event.detail?.screen);
    window.addEventListener("studyhub:navigate", handleWebNavigation);

    // BroadcastChannel para receber ações da paleta de comandos quando em janela separada/atalho global
    let paletteChannel = null;
    if (typeof BroadcastChannel !== "undefined") {
      paletteChannel = new BroadcastChannel("studyhub-palette-channel");
      paletteChannel.onmessage = (event) => {
        const data = event.data;
        if (!data) return;

        if (data.type === "ACTION") {
          switch (data.action) {
            case "open-settings":
              useStudyStore.getState().openSettingsModal?.("sidebar");
              break;
            case "toggle-theme": {
              const isDark = document.documentElement.classList.contains("dark");
              const nextTheme = isDark ? "light" : "dark";
              if (isDark) {
                document.documentElement.classList.remove("dark");
              } else {
                document.documentElement.classList.add("dark");
              }
              useStudyStore.getState().setThemePreference?.(nextTheme);
              break;
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
              useStudyStore.getState().addNote?.(newNote);
              useStudyStore.getState().setActiveNote?.(noteId);
              useStudyStore.getState().openTab?.(newNote);
              handleNavigate(SCREEN_IDS.NOTES);
              break;
            }
            case "create-task":
              handleNavigate(SCREEN_IDS.TASKS);
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent("studyhub-open-add-task"));
              }, 100);
              break;
            case "create-discipline":
              handleNavigate(SCREEN_IDS.DISCIPLINES);
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent("studyhub-open-add-discipline"));
              }, 100);
              break;
            case "create-project":
              handleNavigate(SCREEN_IDS.PROJECTS);
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent("studyhub-open-add-project", { detail: { programming: true } }));
              }, 100);
              break;
            case "start-pomodoro":
              import("../store/usePomodoroStore").then(({ usePomodoroStore }) => {
                usePomodoroStore.getState().setMode?.("focus");
                usePomodoroStore.getState().startTimer?.();
              });
              handleNavigate(SCREEN_IDS.POMODORO);
              break;
            case "quick-capture":
              handleNavigate(SCREEN_IDS.KNOWLEDGE_HUB);
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent("studyhub-open-quick-capture"));
              }, 100);
              break;
            case "open-translator":
              window.studyhubDesktop?.translator?.showPopup?.();
              break;
            default:
              if (data.action?.startsWith("set-theme:")) {
                const themeId = data.action.replace("set-theme:", "");
                useStudyStore.getState().setThemePreference?.(themeId);
              }
              break;
          }
        } else if (data.type === "NAVIGATE" && data.item) {
          const { item } = data;
          if (item.courseId) useStudyStore.getState().setActiveCourse?.(item.courseId);
          if (item.moduleId) useStudyStore.getState().setActiveModule?.(item.moduleId);
          if (item.lessonId) useStudyStore.getState().setActiveLesson?.(item.lessonId);
          if (item.noteId) {
            useStudyStore.getState().setActiveNote?.(item.noteId);
            const note = useStudyStore.getState().studyItems?.find((n) => n.id === item.noteId);
            if (note) useStudyStore.getState().openTab?.(note);
          }
          if (item.taskId) useStudyStore.getState().setActiveTask?.(item.taskId);
          if (item.deckId) useStudyStore.getState().setActiveDeck?.(item.deckId);
          if (item.academicSubjectId) useStudyStore.getState().setActiveAcademicSubject?.(item.academicSubjectId);

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
          if (target) handleNavigate(target);
        }
      };
    }

    const handleDomCapture = (event) => {
      if (event.detail && event.detail.title) {
        const state = useStudyStore.getState();
        if (!(state.knowledgeItems || []).some(item => item.id === event.detail.id)) state.addKnowledgeItem?.(event.detail);
        setCapturedNotification(event.detail);
        setTimeout(() => {
          setCapturedNotification((curr) => (curr?.id === event.detail.id ? null : curr));
        }, 6000);
      }
    };
    window.addEventListener("studyhub:knowledge-capture", handleDomCapture);

    // Listener para capturas vindas da Extensão de Navegador via bridge local
    let cleanupCapture = null;
    if (window.studyhubDesktop?.onKnowledgeCapture) {
      cleanupCapture = window.studyhubDesktop.onKnowledgeCapture((payload) => {
        if (payload && payload.title) {
          const state = useStudyStore.getState();
          if (!(state.knowledgeItems || []).some(item => item.id === payload.id)) state.addKnowledgeItem?.(payload);
          setCapturedNotification(payload);
          setTimeout(() => {
            setCapturedNotification((curr) => (curr?.id === payload.id ? null : curr));
          }, 6000);
        }
      });
    }

    // Polling contínuo de sincronização com a porta 47820
    const processedBridgeIds = new Set();
    const pollBridge = async () => {
      try {
        const res = await fetch("http://127.0.0.1:47820/api/captures");
        if (res.ok) {
          const data = await res.json();
          if (data.captures && Array.isArray(data.captures)) {
            const store = useStudyStore.getState();
            data.captures.forEach((item) => {
              if (item && item.id && !processedBridgeIds.has(item.id)) {
                const exists = (store.knowledgeItems || []).some((k) => k.id === item.id);
                if (!exists) {
                  store.addKnowledgeItem?.(item);
                  setCapturedNotification(item);
                  setTimeout(() => {
                    setCapturedNotification((curr) => (curr?.id === item.id ? null : curr));
                  }, 6000);
                }
                // A confirmação só ocorre após a gravação síncrona do store persistido.
                const persisted = JSON.parse(localStorage.getItem("studyhub-storage-v2") || "{}");
                if (persisted.state?.knowledgeItems?.some(capture => capture.id === item.id)) {
                  processedBridgeIds.add(item.id);
                  window.studyhubDesktop?.acknowledgeKnowledgeCapture?.(item.id).catch(() => processedBridgeIds.delete(item.id));
                }
              }
            });
          }
        }
      } catch {}
    };

    const bridgeTimer = setInterval(pollBridge, 1200);
    pollBridge();

    return () => {
      paletteChannel?.close();
      window.removeEventListener("studyhub:navigate", handleWebNavigation);
      window.removeEventListener("studyhub:knowledge-capture", handleDomCapture);
      clearInterval(bridgeTimer);
      if (cleanupCapture) cleanupCapture();
    };
  }, [handleNavigate]);
  const [isSidebarCompact, setIsSidebarCompact] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.localStorage.getItem("studyhub.sidebarCompact") === "true";
  });
  const [isLessonSidebarCompact, setIsLessonSidebarCompact] = useState(true);
  const [isImmersionCanvasFullscreen, setIsImmersionCanvasFullscreen] =
    useState(false);
  const isNoteSearchWindow = windowParams?.get("mode") === "note-search";
  const isCommandPaletteWindow =
    windowParams?.get("mode") === "command-palette";
  const isAiFlashcardWindow =
    windowParams?.get("mode") === "ai-quick-flashcard";
  const [showQuickNote, setShowQuickNote] = useState(isNoteSearchWindow);
  const databaseHydratedRef = useRef(false);
  const cloudHydratedRef = useRef(false);
  const applyingCloudStateRef = useRef(false);
  const cloudRevisionRef = useRef(null);
  const cloudBaselineRef = useRef({});
  const cloudDeviceIdRef = useRef(getCloudDeviceId());

  useEffect(() => {
    const prefetchScreens = [
      () => import("../screens/CampusFlowLibraryScreen"),
      () => import("../screens/CampusFlowBooksScreen"),
      () => import("../screens/CampusFlowBookDetailsScreen"),
      () => import("../screens/CampusFlowCalendarScreen"),
      () => import("../screens/CampusFlowTasksScreen"),
      () => import("../screens/CampusFlowDisciplinesScreen"),
      () => import("../screens/AcademicSubjectScreenV2"),
      () => import("../screens/CampusFlowProjectsScreen"),
      () => import("../screens/CampusFlowDashboardScreen"),
      () => import("../screens/JournalScreen"),
      () => import("../screens/PomodoroScreen"),
      () => import("../screens/NoteEditorScreen"),
      () => import("../screens/LessonScreen"),
      () => import("../screens/BookReaderScreen"),
    ];
    const runPrefetch = () => {
      prefetchScreens.forEach((fn) => fn().catch(() => {}));
    };
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(runPrefetch);
    } else {
      setTimeout(runPrefetch, 500);
    }
  }, []);

  useEffect(() => {
    const database = window.studyhubDesktop?.studyDatabase;
    if (!database) {
      databaseHydratedRef.current = true;
      return undefined;
    }

    let saveTimer = null;
    let mounted = true;
    const notify = (status, error = null) => {
      window.dispatchEvent(
        new CustomEvent("studyhub-storage-status", {
          detail: { status, error: error?.message || null },
        }),
      );
    };

    const hydrate = async () => {
      try {
        notify("loading");
        const snapshot = await database.load();
        if (mounted && snapshot?.state) {
          const normalized = normalizeAcademicStateSnapshot(snapshot.state);
          useStudyStore.setState((state) => ({
            ...normalized,
            // localStorage is synchronous; SQLite may still contain an older goal.
            waterTracker: mergeWaterTrackers(state.waterTracker, normalized.waterTracker),
          }));
          useStudyStore.getState().upgradeDashboardStickyNotes?.();
        } else if (mounted) {
          await database.save(useStudyStore.getState());
        }
        databaseHydratedRef.current = true;
        notify("saved");
      } catch (error) {
        databaseHydratedRef.current = true;
        notify("error", error);
        console.error("masterStudy database hydration failed:", error);
      }
    };

    hydrate();
    const unsubscribe = useStudyStore.subscribe((state) => {
      if (!databaseHydratedRef.current) return;
      window.clearTimeout(saveTimer);
      notify("saving");
      saveTimer = window.setTimeout(async () => {
        try {
          await database.save(state);
          notify("saved");
        } catch (error) {
          notify("error", error);
          console.error("masterStudy database save failed:", error);
        }
      }, 300);
    });

    return () => {
      mounted = false;
      window.clearTimeout(saveTimer);
      unsubscribe();
    };
  }, []);

  // Keep cloud data conflict-safe. The server uses compare-and-swap revisions
  // and keeps snapshot history. When two devices edit different entities, a
  // three-way merge preserves both changes before retrying the save.
  useEffect(() => {
    if (!collaborationCloudConfigured) return undefined;
    let saveTimer = null;
    let mounted = true;
    let syncGeneration = 0;
    let unsubscribeRealtime = () => {};
    let saving = false;
    let queuedState = null;
    let cloudQueueKey = null;

    const readQueuedCloudState = () => {
      if (!cloudQueueKey) return null;
      try {
        const raw = window.localStorage.getItem(cloudQueueKey);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    };

    const writeQueuedCloudState = (state) => {
      if (!cloudQueueKey) return;
      try {
        if (state) window.localStorage.setItem(cloudQueueKey, JSON.stringify(state));
        else window.localStorage.removeItem(cloudQueueKey);
      } catch (error) {
        console.warn("masterStudy could not persist the cloud sync queue:", error);
      }
    };

    const notifyCloud = (status, detail = {}) => {
      window.dispatchEvent(
        new CustomEvent("studyhub-cloud-status", {
          detail: { status, ...detail },
        }),
      );
    };

    const setCloudState = (state) => {
      applyingCloudStateRef.current = true;
      useStudyStore.setState(normalizeAcademicStateSnapshot(state));
      applyingCloudStateRef.current = false;
    };

    const waitForDatabase = async () => {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (!mounted || databaseHydratedRef.current) return;
        await new Promise((resolve) => window.setTimeout(resolve, 50));
      }
    };

    const persistQueuedState = async (nextState) => {
      queuedState = serializeStudyState(nextState);
      writeQueuedCloudState(queuedState);
      if (saving) return;
      saving = true;
      notifyCloud("saving");

      try {
        while (mounted && queuedState) {
          const localState = queuedState;
          queuedState = null;
          let result = await collaborationCloud.saveAccountState(localState, {
            expectedRevision: cloudRevisionRef.current,
            deviceId: cloudDeviceIdRef.current,
          });

          if (result?.conflict && result.state) {
            const merged = mergeStudyStates(
              cloudBaselineRef.current,
              localState,
              result.state,
            );
            cloudRevisionRef.current = result.revision ?? null;
            cloudBaselineRef.current = serializeStudyState(result.state);
            setCloudState(merged.state);
            notifyCloud("conflict-resolved", {
              conflicts: merged.conflicts,
            });
            result = await collaborationCloud.saveAccountState(merged.state, {
              expectedRevision: cloudRevisionRef.current,
              deviceId: cloudDeviceIdRef.current,
            });
          }

          if (result?.applied !== false) {
            cloudRevisionRef.current = result?.revision ?? null;
            cloudBaselineRef.current = serializeStudyState(
              result?.state || localState,
            );
            notifyCloud("saved", {
              revision: cloudRevisionRef.current,
              updatedAt: result?.updated_at || null,
            });
            writeQueuedCloudState(null);
          } else if (result?.conflict) {
            queuedState = serializeStudyState(useStudyStore.getState());
            writeQueuedCloudState(queuedState);
          }
        }
      } catch (error) {
        writeQueuedCloudState(queuedState);
        notifyCloud("error", { error: error?.message || String(error) });
        console.error("masterStudy account save failed:", error);
      } finally {
        saving = false;
        if (mounted && queuedState) persistQueuedState(queuedState);
      }
    };

    const syncAccount = async (session) => {
      const generation = ++syncGeneration;
      cloudHydratedRef.current = false;
      unsubscribeRealtime?.();
      unsubscribeRealtime = () => {};
      if (!session?.user?.id) {
        cloudQueueKey = null;
        cloudHydratedRef.current = true;
        return;
      }
      cloudQueueKey = `studyhub:cloud-queue:${session.user.id}`;
      try {
        notifyCloud("loading");
        await waitForDatabase();
        const remote = await collaborationCloud.loadAccountState();
        if (!mounted || generation !== syncGeneration) return;
        if (remote?.state && Object.keys(remote.state).length) {
          const local = serializeStudyState(useStudyStore.getState());
          const normalizedRemote = serializeStudyState(
            normalizeAcademicStateSnapshot(remote.state),
          );
          const merged = mergeStudyStates({}, local, normalizedRemote);
          cloudRevisionRef.current = remote.revision ?? null;
          cloudBaselineRef.current = normalizedRemote;
          setCloudState(merged.state);
          if (JSON.stringify(merged.state) !== JSON.stringify(normalizedRemote)) {
            await persistQueuedState(merged.state);
          } else {
            notifyCloud("saved", {
              revision: cloudRevisionRef.current,
              updatedAt: remote.updated_at || null,
            });
          }
        } else {
          cloudRevisionRef.current = 0;
          cloudBaselineRef.current = {};
          await persistQueuedState(useStudyStore.getState());
        }
        const pending = readQueuedCloudState();
        if (pending) await persistQueuedState(pending);
      } catch (error) {
        notifyCloud("error", { error: error?.message || String(error) });
        console.error("masterStudy account synchronization failed:", error);
      } finally {
        if (mounted && generation === syncGeneration) {
          cloudHydratedRef.current = true;
        }
      }
      if (!mounted || generation !== syncGeneration) return;
      unsubscribeRealtime = collaborationCloud.subscribeAccountState(
        session.user.id,
        (row) => {
          if (!mounted || !row?.state) return;
          const remoteState = serializeStudyState(
            normalizeAcademicStateSnapshot(row.state),
          );
          const incomingRevision = row.revision ?? null;

          if (row.device_id === cloudDeviceIdRef.current) {
            cloudRevisionRef.current = incomingRevision;
            cloudBaselineRef.current = remoteState;
            return;
          }

          const localState = serializeStudyState(useStudyStore.getState());
          const merged = mergeStudyStates(
            cloudBaselineRef.current,
            localState,
            remoteState,
          );
          cloudRevisionRef.current = incomingRevision;
          cloudBaselineRef.current = remoteState;
          setCloudState(merged.state);

          if (JSON.stringify(merged.state) !== JSON.stringify(remoteState)) {
            persistQueuedState(merged.state);
          } else {
            notifyCloud("saved", {
              revision: incomingRevision,
              updatedAt: row.updated_at || null,
            });
          }
        },
      );
    };
    collaborationCloud.getSession().then(syncAccount);
    const unsubscribeAuth = collaborationCloud.onAuthStateChange(syncAccount);
    const unsubscribeStore = useStudyStore.subscribe((state) => {
      if (!cloudHydratedRef.current || applyingCloudStateRef.current) return;
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        persistQueuedState(state);
      }, 700);
    });
    const forceSync = () => persistQueuedState(useStudyStore.getState());
    window.addEventListener("studyhub:force-cloud-sync", forceSync);
    return () => {
      mounted = false;
      window.clearTimeout(saveTimer);
      unsubscribeAuth?.();
      unsubscribeRealtime?.();
      unsubscribeStore();
      window.removeEventListener("studyhub:force-cloud-sync", forceSync);
    };
  }, []);

  useEffect(() => {
    if (!window.studyhubDesktop?.onNotesSearch) return undefined;
    return window.studyhubDesktop.onNotesSearch(() => setShowQuickNote(true));
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const keyLower = e.key ? e.key.toLowerCase() : "";
      if (isPrimaryShortcut(e) && e.altKey && e.shiftKey && keyLower === "1") {
        e.preventDefault();
        setShowQuickNote(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const urlParams = new URLSearchParams(window.location.search);
    const courseId = urlParams.get("courseId");
    const moduleId = urlParams.get("moduleId");
    const lessonId = urlParams.get("lessonId");
    const bookId = urlParams.get("bookId");
    const seek = Number.parseFloat(urlParams.get("seek") || "");

    if (courseId) setActiveCourse(courseId);
    if (moduleId) setActiveModule(moduleId);
    if (lessonId) setActiveLesson(lessonId);
    if (bookId && setActiveBook) setActiveBook(bookId);
    if (Number.isFinite(seek)) requestImmersionSeek(seek);
  }, [requestImmersionSeek, setActiveBook, setActiveCourse, setActiveLesson, setActiveModule]);

  useEffect(() => {
    window.localStorage.setItem(
      "studyhub.sidebarCompact",
      String(isSidebarCompact),
    );
  }, [isSidebarCompact]);

  useEffect(() => {
    if (!window.studyhubDesktop?.updateGlobalShortcuts) return;
    window.studyhubDesktop
      .updateGlobalShortcuts({
        quickNoteShortcut,
        quickDrawShortcut,
        translatorTextShortcut,
        translatorOcrShortcut,
        aiFlashcardShortcut,
        stickyNotesShortcut,
      })
      .catch(() => {});
  }, [
    aiFlashcardShortcut,
    stickyNotesShortcut,
    quickDrawShortcut,
    quickNoteShortcut,
    translatorOcrShortcut,
    translatorTextShortcut,
  ]);

  const standardBrandByScreen = {
    [SCREEN_IDS.MODULES]: imageAssets.brandModule,
  };
  const standardBrand = standardBrandByScreen[activeScreen] || "";
  const isQuickUtilityWindow =
    windowParams?.get("mode") === "quick-note" ||
    windowParams?.get("mode") === "quick-draw";
  const isStandaloneReaderWindow =
    windowParams?.get("screen") === SCREEN_IDS.BOOK_READER ||
    windowParams?.get("standalone") === "1";
  const showAppTitleBar =
    activeScreen !== "pomodoro_widget" && !isStandaloneReaderWindow;

  if (activeScreen === "tray_popover") {
    return <TrayPopoverScreen />;
  }

  if (activeScreen === SCREEN_IDS.STICKY_NOTE_WIDGET) {
    return <StickyNoteWidgetScreen noteId={windowParams?.get("noteId") || ""} />;
  }

  if (isNoteSearchWindow) {
    return (
      <div className="note-search-window h-screen w-screen bg-transparent">
        <QuickNoteModal
          minimal
          onClose={() => window.close()}
          onNavigate={handleNavigate}
        />
      </div>
    );
  }

  if (isCommandPaletteWindow) {
    return (
      <div className="command-palette-window h-screen w-screen bg-transparent">
        <CommandPalette standalone initialOpen onNavigate={handleNavigate} />
      </div>
    );
  }

  if (isAiFlashcardWindow) {
    return (
      <Suspense fallback={<AppScreenFallback />}>
        <div className="h-screen w-screen overflow-hidden bg-[color:var(--background)]">
          <CreateFlashcardScreen />
        </div>
      </Suspense>
    );
  }

  return (
    <div
      className={`app-frame ${showAppTitleBar ? "" : "app-frame-widget"} ${isNoteSearchWindow ? "note-search-window" : ""}`}
    >
      {showAppTitleBar ? <AppTitleBar onNavigate={handleNavigate} /> : null}
      <div className="app-shell">
        {activeScreen === "pomodoro_widget" ? (
          <Suspense fallback={null}>
            <PomodoroWidgetScreen />
          </Suspense>
        ) : activeScreen === SCREEN_IDS.IMMERSION ? (
          <>
            {!isImmersionCanvasFullscreen ? (
              <CompactSidebar
                activeScreen="notes"
                onNavigate={handleNavigate}
              />
            ) : null}
            <Suspense fallback={null}>
              <ImmersionScreen
                onCanvasFullscreenChange={setIsImmersionCanvasFullscreen}
                onNavigate={handleNavigate}
              />
            </Suspense>
          </>
        ) : activeScreen === SCREEN_IDS.LESSON ? (
          <>
            <StandardSidebar
              activeScreen={activeScreen}
              brandImage={standardBrand}
              isCompact={isLessonSidebarCompact}
              onNavigate={handleNavigate}
              onToggleCompact={() =>
                setIsLessonSidebarCompact((value) => !value)
              }
            />
            <Suspense fallback={null}>
              <LessonScreen onNavigate={handleNavigate} />
            </Suspense>
          </>
        ) : activeScreen === SCREEN_IDS.BOOK_READER ? (
          <Suspense fallback={null}>
            <BookReaderScreen onNavigate={handleNavigate} />
          </Suspense>
        ) : activeScreen === SCREEN_IDS.WHITEBOARD ? (
          <Suspense fallback={null}>
            <WhiteboardScreen onNavigate={handleNavigate} />
          </Suspense>
        ) : (
          <>
            <StandardSidebar
              activeScreen={activeScreen}
              brandImage={standardBrand}
              isCompact={isSidebarCompact}
              onNavigate={handleNavigate}
              onToggleCompact={() => setIsSidebarCompact((value) => !value)}
            />
            <div className="relative flex flex-1 flex-col overflow-hidden bg-[color:var(--surface)]">
              <Suspense fallback={null}>
                <div className="flex flex-1 flex-col overflow-hidden">
                  {activeScreen === SCREEN_IDS.TODAY ? (
                    <CampusFlowDashboardScreen onNavigate={handleNavigate} />
                  ) : null}
                  {activeScreen === SCREEN_IDS.DASHBOARD ? (
                    <CampusFlowCoursesScreen onNavigate={handleNavigate} />
                  ) : null}
                  {activeScreen === SCREEN_IDS.MODULES ? (
                    <ModulesScreen onNavigate={handleNavigate} />
                  ) : null}
                  {activeScreen === SCREEN_IDS.MODULE_DETAILS ? (
                    <ModuleDetailsScreen onNavigate={handleNavigate} />
                  ) : null}
                  {activeScreen === SCREEN_IDS.WORKSPACE ? (
                    <WorkSpaceScreen onNavigate={handleNavigate} />
                  ) : null}
                  {activeScreen === SCREEN_IDS.PROGRAMMING_PROJECT ? (
                    <ProgrammingProjectScreen onNavigate={handleNavigate} />
                  ) : null}
                  {activeScreen === SCREEN_IDS.FLASHCARDS ? (
                    <FlashcardsScreen onNavigate={handleNavigate} />
                  ) : null}
                  {/* Both Vault entry points keep the app navigation available. */}
                  {activeScreen === SCREEN_IDS.NOTES || activeScreen === SCREEN_IDS.NOTE_EDITOR ? (
                    <NotesScreen onNavigate={handleNavigate} />
                  ) : null}
                  {activeScreen === SCREEN_IDS.JOURNAL ? (
                    <JournalScreen onNavigate={handleNavigate} />
                  ) : null}
                  {activeScreen === SCREEN_IDS.STICKY_NOTES ? (
                    <StickyNotesScreen />
                  ) : null}
                  {activeScreen === SCREEN_IDS.TASKS ? (
                    <CampusFlowTasksScreen onNavigate={handleNavigate} />
                  ) : null}
                  {activeScreen === SCREEN_IDS.TASK_DETAILS ? (
                    <TaskDetailsScreen onNavigate={handleNavigate} />
                  ) : null}
                  {activeScreen === SCREEN_IDS.PROJECTS ? (
                    <CampusFlowProjectsScreen onNavigate={handleNavigate} />
                  ) : null}
                  {activeScreen === SCREEN_IDS.PROJECT_DETAILS ? (
                    <CampusFlowProjectDetailsScreen onNavigate={handleNavigate} />
                  ) : null}
                  {activeScreen === SCREEN_IDS.ACADEMIC ? (
                    <CampusFlowCalendarScreen onNavigate={handleNavigate} />
                  ) : null}
                  {activeScreen === SCREEN_IDS.DISCIPLINES ? (
                    <CampusFlowCoursesScreen initialTab="disciplines" onNavigate={handleNavigate} />
                  ) : null}
                  {activeScreen === SCREEN_IDS.ACADEMIC_SUBJECT ? (
                    <AcademicSubjectScreenV2 onNavigate={handleNavigate} />
                  ) : null}
                  {activeScreen === SCREEN_IDS.CREATE_COURSE ? (
                    <CreateCourseScreen onNavigate={handleNavigate} />
                  ) : null}
                  {activeScreen === SCREEN_IDS.CREATE_MODULE ? (
                    <CreateModuleScreen onNavigate={handleNavigate} />
                  ) : null}
                  {activeScreen === SCREEN_IDS.ADD_LESSON ? (
                    <AddLessonScreen onNavigate={handleNavigate} />
                  ) : null}
                  {activeScreen === SCREEN_IDS.CREATE_FLASHCARDS ? (
                    <CreateFlashcardScreen onNavigate={handleNavigate} />
                  ) : null}
                  {activeScreen === SCREEN_IDS.BOOKS ? (
                    <CampusFlowBooksScreen onNavigate={handleNavigate} />
                  ) : null}
                  {activeScreen === SCREEN_IDS.BOOK_DETAILS ? (
                    <CampusFlowBookDetailsScreen onNavigate={handleNavigate} />
                  ) : null}
                  {activeScreen === SCREEN_IDS.ACCOUNT ? (
                    <AccountScreen />
                  ) : null}
                  {activeScreen === SCREEN_IDS.POMODORO ? (
                    <PomodoroScreen onNavigate={handleNavigate} />
                  ) : null}
                  {activeScreen === SCREEN_IDS.CODE_LAB ? (
                    <CodeLabScreen onNavigate={handleNavigate} />
                  ) : null}
                  {activeScreen === SCREEN_IDS.KNOWLEDGE_HUB ? (
                    <KnowledgeHubScreen onNavigate={handleNavigate} />
                  ) : null}
                  {activeScreen === SCREEN_IDS.KNOWLEDGE_ITEM_DETAIL ? (
                    <KnowledgeItemDetailScreen onNavigate={handleNavigate} />
                  ) : null}
                  {activeScreen === SCREEN_IDS.TRASH_HISTORY ? (
                    <TrashHistoryScreen />
                  ) : null}
                </div>
              </Suspense>
            </div>
          </>
        )}
        {!isQuickUtilityWindow && !isNoteSearchWindow ? null : null}
        {activeScreen !== "pomodoro_widget" ? <GlobalAudioPlayer /> : null}

        {capturedNotification && (
          <div className="fixed bottom-6 right-6 z-[300] flex items-center gap-3 p-4 rounded-3xl bg-[color:var(--surface)] border-2 border-[color:var(--primary)] text-[color:var(--on-surface)] shadow-2xl animate-in slide-in-from-bottom-5">
            <div className="w-10 h-10 rounded-2xl bg-[color:var(--primary)] text-white flex items-center justify-center font-bold shrink-0">
              <Icon name="bolt" className="text-xl" />
            </div>
            <div className="flex-1 min-w-0 pr-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--primary)] block">
                Conteúdo Capturado da Web
              </span>
              <h4 className="text-xs font-bold truncate max-w-xs">{capturedNotification.title}</h4>
            </div>
            <button
              onClick={() => {
                useStudyStore.getState().setActiveKnowledgeItemId(capturedNotification.id);
                handleNavigate(SCREEN_IDS.KNOWLEDGE_ITEM_DETAIL);
                setCapturedNotification(null);
              }}
              className="px-3.5 py-1.5 rounded-xl bg-[color:var(--primary)] text-white text-xs font-bold hover:opacity-90 transition-all shrink-0"
            >
              Abrir
            </button>
            <button
              onClick={() => setCapturedNotification(null)}
              className="w-6 h-6 rounded-lg hover:bg-[color:var(--surface-container-high)] text-[color:var(--on-surface-variant)] flex items-center justify-center shrink-0"
            >
              <Icon name="close" className="text-sm" />
            </button>
          </div>
        )}

        <AnimatePresence>
          {showQuickNote && (
            <QuickNoteModal
              onClose={() => {
                setShowQuickNote(false);
                if (isNoteSearchWindow) window.close();
              }}
              onNavigate={handleNavigate}
              minimal={isNoteSearchWindow}
            />
          )}
        </AnimatePresence>
      </div>
        {activeScreen !== "pomodoro_widget" ? (
          <>
          <StudyAlerts onNavigate={handleNavigate} />
          <BookImportProgress />
          </>
      ) : null}
      {/* Pomodoro permanece implementado para reativação, mas fica fora da interface atual. */}
      <CommandPalette onNavigate={handleNavigate} />
      </div>
    );
  }

function getYouTubeVideoId(url) {
  if (!url) return null;
  const str = String(url).trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) return str;
  const match = str.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|live\/|shorts\/))([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

function getYouTubeStartTime(url, overrideSeconds = 0) {
  if (overrideSeconds > 0) return overrideSeconds;
  if (!url) return 0;
  const match = url.match(/[?&](?:t|start)=([0-9hms]+)/);
  if (!match) return 0;
  const timeStr = match[1];
  if (/^\d+$/.test(timeStr)) return parseInt(timeStr, 10);
  
  let seconds = 0;
  const hours = timeStr.match(/(\d+)h/);
  const minutes = timeStr.match(/(\d+)m/);
  const secs = timeStr.match(/(\d+)s/);
  if (hours) seconds += parseInt(hours[1], 10) * 3600;
  if (minutes) seconds += parseInt(minutes[1], 10) * 60;
  if (secs) seconds += parseInt(secs[1], 10);
  return seconds;
}

function YouTubeAudioPlayer({ url, volume = 0.5, startTime = 0 }) {
  const iframeRef = useRef(null);
  const videoId = getYouTubeVideoId(url);
  const setAudioTime = usePomodoroStore((state) => state.setAudioTime);

  const sendCommand = useCallback((func, args = []) => {
    try {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func, args }),
          '*'
        );
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    const volPct = Math.round(Math.max(0, Math.min(1, volume)) * 100);
    sendCommand('setVolume', [volPct]);
    if (volPct > 0) sendCommand('unMute', []);
  }, [volume, sendCommand]);

  useEffect(() => {
    if (startTime >= 0) {
      sendCommand('seekTo', [startTime, true]);
    }
  }, [startTime, sendCommand]);

  useEffect(() => {
    let current = startTime || 0;
    setAudioTime(current, 7200);
    const interval = setInterval(() => {
      current += 1;
      setAudioTime(current, 7200);
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime, setAudioTime]);

  if (!videoId) return null;
  const computedStart = getYouTubeStartTime(url, startTime);
  const startParam = computedStart > 0 ? `&start=${computedStart}` : '';

  return (
    <div style={{ position: 'absolute', top: -9999, left: -9999, width: 200, height: 200, overflow: 'hidden', opacity: 0 }}>
      <iframe
        ref={iframeRef}
        src={`https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=1&loop=1&playlist=${videoId}${startParam}`}
        title="YouTube Audio Player"
        width="100%"
        height="100%"
        allow="autoplay; encrypted-media"
        frameBorder="0"
        onLoad={() => {
          setTimeout(() => {
            const volPct = Math.round(Math.max(0, Math.min(1, volume)) * 100);
            sendCommand('setVolume', [volPct]);
            sendCommand('unMute', []);
          }, 600);
        }}
      />
    </div>
  );
}

function GlobalAudioPlayer() {
  const activeSound = usePomodoroStore((state) => state.activeSound);
  const soundVolume = usePomodoroStore((state) => state.soundVolume);
  const audioRef = useRef(null);
  const audioContextRef = useRef(null);
  const ambientCleanupRef = useRef(() => {});
  const masterGainRef = useRef(null);
  const setAudioTime = usePomodoroStore((state) => state.setAudioTime);

  const SOUND_URLS = {
    lofi: "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3",
    rain: "/assets/audio/rain.wav",
    nature: "/assets/audio/forest.wav",
    coffee: "/assets/audio/coffee.wav",
    fireplace: "/assets/audio/fire.wav",
  };

  const stopAmbientSound = () => {
    ambientCleanupRef.current?.();
    ambientCleanupRef.current = () => {};
    masterGainRef.current = null;
  };

  const getAudioContext = () => {
    if (audioContextRef.current) return audioContextRef.current;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    audioContextRef.current = new AudioCtx();
    return audioContextRef.current;
  };

  const createNoiseBuffer = (context, color = "white") => {
    const duration = 2;
    const buffer = context.createBuffer(
      1,
      context.sampleRate * duration,
      context.sampleRate,
    );
    const channelData = buffer.getChannelData(0);

    if (color === "brown") {
      let lastOut = 0;
      for (let i = 0; i < channelData.length; i += 1) {
        const white = Math.random() * 2 - 1;
        lastOut = (lastOut + 0.02 * white) / 1.02;
        channelData[i] = lastOut * 3.5;
      }
      return buffer;
    }

    if (color === "pink") {
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      let b3 = 0;
      let b4 = 0;
      let b5 = 0;
      let b6 = 0;

      for (let i = 0; i < channelData.length; i += 1) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        channelData[i] =
          (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
      return buffer;
    }

    for (let i = 0; i < channelData.length; i += 1) {
      channelData[i] = Math.random() * 2 - 1;
    }
    return buffer;
  };

  const createLoopingNoiseSource = (context, color) => {
    const source = context.createBufferSource();
    source.buffer = createNoiseBuffer(context, color);
    source.loop = true;
    return source;
  };

  const startAmbientSound = async (sound, volume) => {
    const context = getAudioContext();
    if (!context) return;

    if (context.state === "suspended") {
      await context.resume();
    }

    stopAmbientSound();

    const nodes = [];
    const masterGain = context.createGain();
    masterGain.gain.value = Math.max(0.001, volume);
    masterGain.connect(context.destination);
    nodes.push(masterGain);
    masterGainRef.current = masterGain;

    const registerNode = (node) => {
      nodes.push(node);
      return node;
    };

    if (sound === "brown_noise") {
      const source = registerNode(createLoopingNoiseSource(context, "brown"));
      const filter = registerNode(context.createBiquadFilter());
      filter.type = "lowpass";
      filter.frequency.value = 950;
      filter.Q.value = 0.2;
      source.connect(filter);
      filter.connect(masterGain);
      source.start();
    }

    if (sound === "white_noise") {
      const source = registerNode(createLoopingNoiseSource(context, "white"));
      source.connect(masterGain);
      source.start();
    }

    if (sound === "ocean") {
      const source = registerNode(createLoopingNoiseSource(context, "white"));
      const filter = registerNode(context.createBiquadFilter());
      filter.type = "lowpass";
      filter.frequency.value = 1250;
      const swell = registerNode(context.createOscillator());
      swell.type = "sine";
      swell.frequency.value = 0.09;
      const swellGain = registerNode(context.createGain());
      swellGain.gain.value = 0.3;
      swell.connect(swellGain);
      swellGain.connect(masterGain.gain);
      source.connect(filter);
      filter.connect(masterGain);
      source.start();
      swell.start();
    }

    if (sound === "fan") {
      const source = registerNode(createLoopingNoiseSource(context, "brown"));
      const filter = registerNode(context.createBiquadFilter());
      filter.type = "bandpass";
      filter.frequency.value = 420;
      filter.Q.value = 0.45;
      source.connect(filter);
      filter.connect(masterGain);
      source.start();
    }

    if (sound === "rain") {
      const source = registerNode(createLoopingNoiseSource(context, "white"));
      const highpass = registerNode(context.createBiquadFilter());
      highpass.type = "highpass";
      highpass.frequency.value = 900;

      const lowpass = registerNode(context.createBiquadFilter());
      lowpass.type = "lowpass";
      lowpass.frequency.value = 6800;

      const rainGain = registerNode(context.createGain());
      rainGain.gain.value = 0.38;

      const lfo = registerNode(context.createOscillator());
      lfo.type = "sine";
      lfo.frequency.value = 0.14;

      const lfoGain = registerNode(context.createGain());
      lfoGain.gain.value = 0.06;

      source.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(rainGain);
      rainGain.connect(masterGain);
      lfo.connect(lfoGain);
      lfoGain.connect(rainGain.gain);

      source.start();
      lfo.start();
    }

    if (sound === "fireplace") {
      const base = registerNode(createLoopingNoiseSource(context, "brown"));
      const baseFilter = registerNode(context.createBiquadFilter());
      baseFilter.type = "lowpass";
      baseFilter.frequency.value = 720;

      const baseGain = registerNode(context.createGain());
      baseGain.gain.value = 0.32;

      const crackle = registerNode(createLoopingNoiseSource(context, "white"));
      const crackleFilter = registerNode(context.createBiquadFilter());
      crackleFilter.type = "bandpass";
      crackleFilter.frequency.value = 2400;
      crackleFilter.Q.value = 1.2;

      const crackleGain = registerNode(context.createGain());
      crackleGain.gain.value = 0.06;

      const crackleLfo = registerNode(context.createOscillator());
      crackleLfo.type = "triangle";
      crackleLfo.frequency.value = 5;

      const crackleLfoGain = registerNode(context.createGain());
      crackleLfoGain.gain.value = 0.045;

      base.connect(baseFilter);
      baseFilter.connect(baseGain);
      baseGain.connect(masterGain);

      crackle.connect(crackleFilter);
      crackleFilter.connect(crackleGain);
      crackleGain.connect(masterGain);
      crackleLfo.connect(crackleLfoGain);
      crackleLfoGain.connect(crackleGain.gain);

      base.start();
      crackle.start();
      crackleLfo.start();
    }

    ambientCleanupRef.current = () => {
      nodes.forEach((node) => {
        try {
          if (typeof node.stop === "function") node.stop();
        } catch (error) {
          console.debug("Ambient node stop skipped:", error);
        }
        try {
          if (typeof node.disconnect === "function") node.disconnect();
        } catch (error) {
          console.debug("Ambient node disconnect skipped:", error);
        }
      });
    };
  };

  useEffect(() => {
    if (audioRef.current) {
      if (activeSound === "none" || activeSound === "youtube") {
        audioRef.current.pause();
        audioRef.current.removeAttribute("src");
        audioRef.current.load();
        stopAmbientSound();
      } else if (SOUND_URLS[activeSound]) {
        stopAmbientSound();
        audioRef.current.src = SOUND_URLS[activeSound];
        audioRef.current.volume = soundVolume;
        audioRef.current
          .play()
          .catch((e) => console.log("Audio auto-play prevented:", e));
      } else if (activeSound !== "spotify") {
        audioRef.current.pause();
        audioRef.current.removeAttribute("src");
        audioRef.current.load();
        startAmbientSound(activeSound, soundVolume).catch((error) => {
          console.error("Failed to start ambient sound:", error);
        });
      }
    }
  }, [activeSound]);

  useEffect(() => {
    if (!audioRef.current) return;
    if (SOUND_URLS[activeSound]) {
      audioRef.current.volume = soundVolume;
    }
    if (
      masterGainRef.current &&
      activeSound !== "none" &&
      !SOUND_URLS[activeSound] &&
      activeSound !== "spotify" &&
      activeSound !== "youtube"
    ) {
      masterGainRef.current.gain.setTargetAtTime(
        Math.max(0.0001, soundVolume),
        audioContextRef.current.currentTime,
        0.05,
      );
    }
  }, [soundVolume, activeSound]);

  useEffect(
    () => () => {
      stopAmbientSound();
      audioRef.current?.pause();
      audioContextRef.current?.close?.().catch(() => {});
    },
    [],
  );

  const youtubeUrl = usePomodoroStore((state) => state.youtubeUrl);
  const youtubePlaying = usePomodoroStore((state) => state.youtubePlaying);
  const youtubeStartTime = usePomodoroStore((state) => state.youtubeStartTime);

  return (
    <>
      <audio
        ref={audioRef}
        loop
        className="hidden"
        onTimeUpdate={(e) => setAudioTime(e.target.currentTime, e.target.duration)}
        onLoadedMetadata={(e) => setAudioTime(e.target.currentTime, e.target.duration)}
      />
      {activeSound === "youtube" && youtubeUrl && youtubePlaying !== false ? (
        <YouTubeAudioPlayer url={youtubeUrl} volume={soundVolume} startTime={youtubeStartTime} />
      ) : null}
    </>
  );
}

function GlobalPomodoroWidget({ onNavigate, activeScreen }) {
  const store = usePomodoroStore();
  const addFocusSession = useStudyStore((state) => state.addFocusSession);
  const lastRecordedCompletion = useRef("");
  const [mounted, setMounted] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isSoundMenuOpen, setIsSoundMenuOpen] = useState(false);
  const soundOptions = [
    { id: "none", label: "Sem música", icon: "volume_off" },
    { id: "rain", label: "Chuva", icon: "water_drop" },
    { id: "nature", label: "Natureza", icon: "forest" },
    { id: "coffee", label: "Cafeteria", icon: "local_cafe" },
    { id: "fireplace", label: "Lareira", icon: "local_fire_department" },
    { id: "lofi", label: "Lo-Fi Study", icon: "headphones" },
    { id: "youtube", label: "YouTube", icon: "youtube_activity" },
  ];
  const selectedSound =
    soundOptions.find((sound) => sound.id === store.activeSound) ||
    soundOptions[0];

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let interval = null;
    if (store.isActive && store.endTime) {
      interval = setInterval(() => {
        store.syncTick();
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [store.isActive, store.endTime, store.syncTick]);

  useEffect(() => {
    const completion = store.lastCompletion;
    if (
      activeScreen === "pomodoro_widget" ||
      !completion?.id ||
      completion.phase !== "focus" ||
      completion.id === lastRecordedCompletion.current
    ) {
      return;
    }
    lastRecordedCompletion.current = completion.id;
    addFocusSession({
      id: `focus-${completion.id}`,
      taskId: store.selectedTasks[0] || null,
      plannedSeconds: store.focusTime * 60,
      actualSeconds: store.focusTime * 60,
      status: "completed",
      endedAt: completion.at,
      startedAt: completion.at - store.focusTime * 60 * 1000,
      pomodoros: 1,
    });
  }, [
    activeScreen,
    addFocusSession,
    store.focusTime,
    store.lastCompletion,
    store.selectedTasks,
  ]);

  if (
    !mounted ||
    !store.isActive ||
    activeScreen === SCREEN_IDS.POMODORO ||
    activeScreen === "pomodoro_widget"
  )
    return null;

  const minutes = Math.floor(store.timeLeft / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (store.timeLeft % 60).toString().padStart(2, "0");
  const modeIcon = store.mode === "focus" ? "local_fire_department" : "coffee";
  const colorClass =
    store.mode === "focus"
      ? "text-[color:var(--error)] bg-[color:var(--error)]/10"
      : "text-[color:var(--primary)] bg-[color:var(--primary)]/10";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className={`fixed bottom-8 right-8 z-[100] border border-[color:var(--outline-variant)]/30 bg-[color:var(--surface)] neo-raised shadow-[0_10px_25px_-5px_rgba(0,0,0,0.1),0_8px_10px_-6px_rgba(0,0,0,0.1)] ${isMinimized ? "rounded-full p-2.5" : "flex flex-col gap-2 rounded-2xl p-3"}`}
      >
        {isMinimized ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate(SCREEN_IDS.POMODORO)}
              className="flex items-center gap-2 rounded-full pl-1 pr-2 text-left transition-opacity hover:opacity-80"
              title="Abrir Pomodoro"
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${colorClass}`}
              >
                <Icon name={modeIcon} className="text-lg animate-pulse" />
              </div>
              <span className="font-mono text-sm font-bold leading-none text-[color:var(--on-surface)]">
                {minutes}:{seconds}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setIsMinimized(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--on-surface-variant)] transition-colors hover:bg-[color:var(--surface-bright)] hover:text-[color:var(--on-surface)]"
              title="Expandir widget"
            >
              <Icon name="unfold_more" className="text-[18px]" />
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <button
                type="button"
                onClick={() => onNavigate(SCREEN_IDS.POMODORO)}
                className="flex items-center gap-3 px-2 py-1 text-left transition-opacity hover:opacity-80"
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${colorClass}`}
                >
                  <Icon name={modeIcon} className="text-lg animate-pulse" />
                </div>
                <div className="flex min-w-[70px] flex-col items-start">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--on-surface-variant)]">
                    {store.mode === "focus" ? "Foco" : "Pausa"}
                  </span>
                  <span className="font-mono text-xl font-bold leading-none text-[color:var(--on-surface)]">
                    {minutes}:{seconds}
                  </span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setIsMinimized(true)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[color:var(--on-surface-variant)] transition-colors hover:bg-[color:var(--surface-bright)] hover:text-[color:var(--on-surface)]"
                title="Minimizar widget"
              >
                <Icon name="remove" className="text-[18px]" />
              </button>
            </div>

            <div className="mt-1 flex flex-col gap-2 border-t border-[color:var(--outline-variant)]/30 px-2 pb-1 pt-2">
              <div className="flex items-center justify-between gap-2">
                <Icon
                  name={selectedSound.icon}
                  className="text-sm text-[color:var(--primary)]"
                />
                <div className="relative min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => setIsSoundMenuOpen((value) => !value)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1 text-left text-xs font-semibold text-[color:var(--on-surface)] hover:bg-[color:var(--background)]"
                  >
                    <span className="truncate">{selectedSound.label}</span>
                    <Icon
                      name="expand_more"
                      className={`text-sm transition-transform ${isSoundMenuOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  {isSoundMenuOpen ? (
                    <div className="absolute bottom-[calc(100%+8px)] left-0 right-0 z-30 rounded-xl border border-[color:var(--outline-variant)]/40 bg-[color:var(--surface)] p-1.5 neo-raised">
                      {soundOptions.map((sound) => (
                        <button
                          key={sound.id}
                          type="button"
                          onClick={() => {
                            store.setActiveSound(sound.id);
                            setIsSoundMenuOpen(false);
                          }}
                          className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-bold ${store.activeSound === sound.id ? "bg-[color:var(--primary)]/10 text-[color:var(--primary)]" : "text-[color:var(--on-surface-variant)] hover:bg-[color:var(--background)]"}`}
                        >
                          <Icon name={sound.icon} className="text-sm" />
                          {sound.label}
                          {store.activeSound === sound.id ? (
                            <Icon name="check" className="ml-auto text-sm" />
                          ) : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              {store.activeSound !== "none" && (
                <div className="flex items-center gap-2">
                  <Icon
                    name="volume_down"
                    className="text-xs text-[color:var(--on-surface-variant)]"
                  />
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={store.soundVolume}
                    onChange={(e) =>
                      store.setSoundVolume(parseFloat(e.target.value))
                    }
                    className="h-1 w-full cursor-pointer appearance-none rounded-full bg-[color:var(--outline-variant)]"
                  />
                  <Icon
                    name="volume_up"
                    className="text-xs text-[color:var(--on-surface-variant)]"
                  />
                </div>
              )}
            </div>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
