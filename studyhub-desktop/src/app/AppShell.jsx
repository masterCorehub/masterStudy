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
import { QuickNoteModal } from "../components/QuickNoteModal";
import { CommandPalette } from "../components/CommandPalette";
import { Icon } from "../ui/Icon";
import { AnimatePresence } from "framer-motion";
import { isPrimaryShortcut } from "../utils/keyboardShortcuts";

import { useStudyStore } from "../store/useStore";
import { collaborationCloud, collaborationCloudConfigured } from "../services/collaboration-cloud";
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
        const store = useStudyStore.getState();
        const note = store.studyItems?.find((item) => String(item.id) === String(childId));
        if (note) {
          store.openTab(note);
          store.setActiveNote(childId);
          setActiveScreen(SCREEN_IDS.NOTES);
        }
      }
    };

    document.addEventListener("click", handleGlobalInternalNoteClick, true);
    return () => document.removeEventListener("click", handleGlobalInternalNoteClick, true);
  }, []);

  const [activeScreen, setActiveScreen] = useState(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const requestedScreen = urlParams.get("screen");
      const desktopOnlyScreens = ["tray_popover", SCREEN_IDS.STICKY_NOTE_WIDGET];
      // Native popup windows are not valid web routes; return users to a useful page.
      return requestedScreen?.toLowerCase().includes("pomodoro") ||
        (!window.studyhubDesktop && desktopOnlyScreens.includes(requestedScreen))
        ? SCREEN_IDS.TODAY
        : requestedScreen || SCREEN_IDS.TODAY;
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
  const isNoteSearchWindow = Boolean(window.studyhubDesktop) && windowParams?.get("mode") === "note-search";
  const isCommandPaletteWindow =
    Boolean(window.studyhubDesktop) && windowParams?.get("mode") === "command-palette";
  const isAiFlashcardWindow =
    Boolean(window.studyhubDesktop) && windowParams?.get("mode") === "ai-quick-flashcard";
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
    Boolean(window.studyhubDesktop) && (windowParams?.get("mode") === "quick-note" ||
    windowParams?.get("mode") === "quick-draw");
  const isStandaloneReaderWindow =
    windowParams?.get("screen") === SCREEN_IDS.BOOK_READER ||
    windowParams?.get("standalone") === "1";
  const showAppTitleBar =
    !isStandaloneReaderWindow;

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
        {activeScreen === SCREEN_IDS.IMMERSION ? (
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
        {(
          <>
          <StudyAlerts onNavigate={handleNavigate} />
          <BookImportProgress />
          </>
      )}

      <CommandPalette onNavigate={handleNavigate} />
      </div>
    );
  }
