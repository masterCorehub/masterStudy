import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import { shortcutLabel } from "../utils/keyboardShortcuts";
import { sanitizeUserHtml } from "../utils/sanitizeHtml";
import { SCREEN_IDS } from "../app/screenIds";
import { useStudyStore } from "../store/useStore";
import { TranscriptPlayer } from "../components/TranscriptPlayer";
import { parseYoutubeUrl } from "../utils/youtubeUtils";
import { getLocalFileUrl } from "../utils/localFileUrl";

const DEFAULT_PANELS = {
  video: {
    id: "video",
    label: "Aula",
    icon: "smart_display",
    visible: true,
    isMinimized: false,
    x: 24,
    y: 24,
    w: 760,
    h: 420,
  },
  notes: {
    id: "notes",
    label: "Anotações",
    icon: "edit_note",
    visible: true,
    isMinimized: false,
    x: 810,
    y: 24,
    w: 360,
    h: 520,
  },
  pdf: {
    id: "pdf",
    label: "PDF",
    icon: "picture_as_pdf",
    visible: true,
    isMinimized: false,
    x: 24,
    y: 468,
    w: 500,
    h: 300,
  },
  audio: {
    id: "audio",
    label: "Audio",
    icon: "headphones",
    visible: true,
    isMinimized: false,
    x: 548,
    y: 468,
    w: 380,
    h: 300,
  },
  flashcards: {
    id: "flashcards",
    label: "Flashcards",
    icon: "style",
    visible: false,
    isMinimized: false,
    x: 810,
    y: 560,
    w: 320,
    h: 300,
  },
  tasks: {
    id: "tasks",
    label: "Tarefas",
    icon: "task_alt",
    visible: true,
    isMinimized: false,
    x: 1150,
    y: 560,
    w: 340,
    h: 360,
  },
  drawing: {
    id: "drawing",
    label: "Desenho",
    icon: "draw",
    visible: false,
    isMinimized: false,
    x: 1150,
    y: 24,
    w: 320,
    h: 300,
  },
  resources: {
    id: "resources",
    label: "Recursos",
    icon: "folder_open",
    visible: false,
    isMinimized: false,
    x: 1150,
    y: 348,
    w: 320,
    h: 300,
  },
};

const PANEL_ORDER = [
  "video",
  "notes",
  "pdf",
  "audio",
  "flashcards",
  "tasks",
  "drawing",
  "resources",
];
const MIN_PANEL_WIDTH = 260;
const MIN_PANEL_HEIGHT = 200;
const GRID_SPACING = 28;
const MIN_BOARD_SCALE = 0.5;
const MAX_BOARD_SCALE = 2.5;
const BOARD_ZOOM_STEP = 0.12;
const BOARD_WHEEL_ZOOM_SENSITIVITY = 0.0022;
const BOARD_WHEEL_ZOOM_MAX_DELTA = 0.18;
const PANEL_RESIZE_HANDLES = [
  {
    corner: "top-left",
    className: "absolute left-0 top-0 cursor-nwse-resize",
    iconClassName: "rotate-180",
  },
  {
    corner: "top-right",
    className: "absolute right-0 top-0 cursor-nesw-resize",
    iconClassName: "-rotate-90",
  },
  {
    corner: "bottom-left",
    className: "absolute bottom-0 left-0 cursor-nesw-resize",
    iconClassName: "rotate-90",
  },
  {
    corner: "bottom-right",
    className: "absolute bottom-0 right-0 cursor-nwse-resize",
    iconClassName: "rotate-0",
  },
];

const BUILT_IN_PANEL_IDS = new Set(PANEL_ORDER);
const PDF_PANEL_PREFIX = "pdfdoc-";
const TASK_PANEL_PREFIX = "task-";
const DECK_PANEL_PREFIX = "deck-";

const clonePanels = (panels) =>
  Object.fromEntries(
    Object.entries(panels).map(([panelId, panel]) => [panelId, { ...panel }]),
  );

const getPdfPanelId = (resourceId) => `${PDF_PANEL_PREFIX}${resourceId}`;

const buildPdfPanel = (resource, index = 0, savedPanel) => ({
  id: getPdfPanelId(resource.id),
  label: resource.title || "PDF",
  icon: "picture_as_pdf",
  visible: savedPanel?.visible ?? true,
  isMinimized: savedPanel?.isMinimized ?? false,
  x: savedPanel?.x ?? 120 + index * 36,
  y: savedPanel?.y ?? 120 + index * 28,
  w: savedPanel?.w ?? 520,
  h: savedPanel?.h ?? 360,
  pdfResourceId: resource.id,
});

const sanitizePanels = (panels, pdfResources = []) => {
  const nextPanels = clonePanels(DEFAULT_PANELS);
  for (const panelId of PANEL_ORDER) {
    if (!panels?.[panelId]) continue;
    nextPanels[panelId] = {
      ...nextPanels[panelId],
      ...panels[panelId],
    };
  }
  pdfResources.forEach((resource, index) => {
    const panelId = getPdfPanelId(resource.id);
    if (!panels?.[panelId]) return;
    nextPanels[panelId] = buildPdfPanel(resource, index, panels[panelId]);
  });
  return nextPanels;
};

const sanitizeZOrder = (zOrder, pdfResources = [], panels = {}) => {
  const allowedPanelIds = new Set([
    ...PANEL_ORDER,
    ...pdfResources.map((resource) => getPdfPanelId(resource.id)),
  ]);
  const nextOrder = (zOrder || []).filter((panelId) =>
    allowedPanelIds.has(panelId),
  );
  for (const panelId of PANEL_ORDER) {
    if (!nextOrder.includes(panelId)) {
      nextOrder.push(panelId);
    }
  }
  for (const resource of pdfResources) {
    const panelId = getPdfPanelId(resource.id);
    if (!nextOrder.includes(panelId) && panels?.[panelId]?.visible) {
      nextOrder.push(panelId);
    }
  }
  return nextOrder;
};

const buildImmersionSnapshot = (
  panels,
  zOrder,
  isCanvasFullscreen,
  presetId,
  pdfResources = [],
) => ({
  panels: sanitizePanels(panels, pdfResources),
  zOrder: sanitizeZOrder(zOrder, pdfResources, panels),
  isCanvasFullscreen: Boolean(isCanvasFullscreen),
  presetId: presetId || null,
});

const cloneBoardElements = (elements = []) =>
  elements.map((element) => ({
    ...element,
    points: (element.points || []).map((point) => ({ ...point })),
  }));

function EmptyPanel({
  icon,
  title,
  text,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-[24px] border border-dashed border-[color:var(--outline-variant)]/45 bg-[color:var(--background)]/55 p-6 text-center">
      <Icon className="mb-3 text-5xl text-[color:var(--outline)]" name={icon} />
      <h3 className="text-lg font-bold text-[color:var(--on-surface)]">
        {title}
      </h3>
      <p className="mt-2 text-sm text-[color:var(--on-surface-variant)]">
        {text}
      </p>
      {onAction || onSecondaryAction ? (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {onAction ? (
            <button
              className="rounded-xl bg-[color:var(--primary)] px-4 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90"
              type="button"
              onClick={onAction}
            >
              {actionLabel}
            </button>
          ) : null}
          {onSecondaryAction ? (
            <button
              className="rounded-xl border border-[color:var(--outline-variant)]/35 bg-[color:var(--surface)] px-4 py-2 text-xs font-bold text-[color:var(--on-surface)]"
              type="button"
              onClick={onSecondaryAction}
            >
              {secondaryActionLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ImmersionScreen({ onNavigate, onCanvasFullscreenChange }) {
  const activeCourseId = useStudyStore((state) => state.activeCourseId);
  const activeModuleId = useStudyStore((state) => state.activeModuleId);
  const activeLessonId = useStudyStore((state) => state.activeLessonId);
  const courses = useStudyStore((state) => state.courses);
  const notesList = useStudyStore((state) => state.notes.list);
  const tasksList = useStudyStore((state) => state.tasks?.list || []);
  const flashcardDecks = useStudyStore((state) => state.flashcardDecks);
  const immersionPresets = useStudyStore((state) => state.immersionPresets);
  const addNote = useStudyStore((state) => state.addNote);
  const addTask = useStudyStore((state) => state.addTask);
  const addFlashcardDeck = useStudyStore((state) => state.addFlashcardDeck);
  const addFlashcard = useStudyStore((state) => state.addFlashcard);
  const updateNote = useStudyStore((state) => state.updateNote);
  const saveLessonDrawing = useStudyStore((state) => state.saveLessonDrawing);
  const saveLessonImmersionState = useStudyStore(
    (state) => state.saveLessonImmersionState,
  );
  const createImmersionPreset = useStudyStore(
    (state) => state.createImmersionPreset,
  );
  const updateImmersionPreset = useStudyStore(
    (state) => state.updateImmersionPreset,
  );
  const deleteImmersionPreset = useStudyStore(
    (state) => state.deleteImmersionPreset,
  );
  const setImmersionMediaTime = useStudyStore(
    (state) => state.setImmersionMediaTime,
  );

  const activeCourse =
    courses.find((course) => course.id === activeCourseId) ||
    courses.find((course) =>
      (course.modules || []).some((module) =>
        (module.lessons || []).some((lesson) => lesson.id === activeLessonId),
      ),
    ) ||
    courses[0];
  const activeModule =
    activeCourse?.modules?.find((module) => module.id === activeModuleId) ||
    activeCourse?.modules?.find((module) =>
      (module.lessons || []).some((lesson) => lesson.id === activeLessonId),
    ) ||
    activeCourse?.modules?.find((module) => (module.lessons || []).length > 0) ||
    activeCourse?.modules?.[0];
  const activeLesson =
    (activeModule?.lessons || activeCourse?.lessons || []).find((lesson) => lesson.id === activeLessonId) ||
    (activeModule?.lessons || activeCourse?.lessons || [])[0];

  const activeLessonLocation = useMemo(() => {
    if (!activeLesson) return null;

    // If we have both course and module selected and the module is real, prefer that
    if (activeCourse?.id && activeModule?.id && (activeModule?.lessons || []).some(l => l.id === activeLesson.id)) {
      return {
        courseId: activeCourse.id,
        moduleId: activeModule.id,
        lessonId: activeLesson.id,
      };
    }

    // Search modules for the lesson
    for (const course of courses) {
      for (const module of course.modules || []) {
        const lesson = (module.lessons || []).find(
          (item) => item.id === activeLesson.id,
        );
        if (lesson) {
          return {
            courseId: course.id,
            moduleId: module.id,
            lessonId: lesson.id,
          };
        }
      }
    }

    // If not in any module, check top-level course lessons
    for (const course of courses) {
      const lesson = (course.lessons || []).find((item) => item.id === activeLesson.id);
      if (lesson) {
        return {
          courseId: course.id,
          moduleId: null,
          lessonId: lesson.id,
        };
      }
    }

    return null;
  }, [activeCourse?.id, activeLesson, activeModule?.id, courses]);
  const currentLessonId = activeLessonLocation?.lessonId || activeLessonId;

  useEffect(() => {
    if (!activeLessonLocation) return;

    const store = useStudyStore.getState();
    if (activeCourseId !== activeLessonLocation.courseId) {
      store.setActiveCourse(activeLessonLocation.courseId);
    }
    if (activeModuleId !== activeLessonLocation.moduleId) {
      store.setActiveModule(activeLessonLocation.moduleId);
    }
    if (activeLessonId !== activeLessonLocation.lessonId) {
      store.setActiveLesson(activeLessonLocation.lessonId);
    }
  }, [
    activeCourseId,
    activeLessonId,
    activeLessonLocation,
    activeModuleId,
  ]);

  const [panels, setPanels] = useState(DEFAULT_PANELS);
  const [noteText, setNoteText] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [flashcardFront, setFlashcardFront] = useState("");
  const [flashcardBack, setFlashcardBack] = useState("");
  const [revealedDeckCards, setRevealedDeckCards] = useState({});
  const [zOrder, setZOrder] = useState(PANEL_ORDER);
  const [drawingTool, setDrawingTool] = useState("pen");
  const [drawingColor, setDrawingColor] = useState("#a78bfa");
  const [drawingWidth, setDrawingWidth] = useState(3);
  const [isCanvasFullscreen, setIsCanvasFullscreen] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [isLessonSidebarCollapsed, setIsLessonSidebarCollapsed] = useState(false);
  const [boardViewport, setBoardViewport] = useState({
    x: 0,
    y: 0,
    scale: 1,
  });

  const canvasRef = useRef(null);
  const canvasContextRef = useRef(null);
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const workspaceRef = useRef(null);
  const dragRef = useRef(null);
  const resizeRef = useRef(null);
  const boardElementsRef = useRef([]);
  const boardUndoStackRef = useRef([]);
  const currentStrokeRef = useRef(null);
  const boardPanRef = useRef({ x: 0, y: 0 });
  const boardScaleRef = useRef(1);
  const isBoardDrawingRef = useRef(false);
  const isBoardPanningRef = useRef(false);
  const lastBoardPointerRef = useRef({ x: 0, y: 0 });
  const boardSizeRef = useRef({ width: 0, height: 0 });
  const boardBackgroundRef = useRef(null);
  const boardBackgroundSizeRef = useRef({ width: 0, height: 0 });
  const drawingToolRef = useRef(drawingTool);
  const drawingColorRef = useRef(drawingColor);
  const drawingWidthRef = useRef(drawingWidth);
  const isHydratingLayoutRef = useRef(false);
  const previousLessonIdRef = useRef(null);

  useEffect(() => {
    drawingToolRef.current = drawingTool;
  }, [drawingTool]);

  useEffect(() => {
    drawingColorRef.current = drawingColor;
  }, [drawingColor]);

  useEffect(() => {
    drawingWidthRef.current = drawingWidth;
  }, [drawingWidth]);

  useEffect(() => {
    onCanvasFullscreenChange?.(isCanvasFullscreen);
    return () => onCanvasFullscreenChange?.(false);
  }, [isCanvasFullscreen, onCanvasFullscreenChange]);

  const relatedNotes = notesList.filter(
    (note) => note.sourceLessonId === currentLessonId,
  );
  const relatedDecks = flashcardDecks.filter(
    (deck) => deck.sourceLessonId === currentLessonId,
  );
  const relatedTasks = tasksList.filter(
    (task) => task.sourceLessonId === currentLessonId,
  );
  const pdfResources = useMemo(() => {
    const extraPdfResources = (activeLesson?.extraMedia || [])
      .filter((media) => media.type === "pdf")
      .map((media) => ({
        id: media.id,
        title: media.title || "PDF extra",
        path: media.url,
        subtitle: media.url,
        icon: "picture_as_pdf",
      }));

    return [
      ...(activeLesson?.pdfPath
        ? [
            {
              id: "primary-pdf",
              title: "PDF principal",
              path: activeLesson.pdfPath,
              subtitle: activeLesson.pdfPath,
              icon: "picture_as_pdf",
            },
          ]
        : []),
      ...extraPdfResources,
    ];
  }, [activeLesson?.extraMedia, activeLesson?.pdfPath]);

  useEffect(() => {
    if (!activeLesson?.id) return;

    const savedState = activeLesson.immersionState;
    isHydratingLayoutRef.current = true;
    setPanels(sanitizePanels(savedState?.panels, pdfResources));
    setZOrder(
      sanitizeZOrder(savedState?.zOrder, pdfResources, savedState?.panels),
    );
    setIsCanvasFullscreen(Boolean(savedState?.isCanvasFullscreen));
    setSelectedPresetId(savedState?.presetId || "");
    setTimeout(() => {
      isHydratingLayoutRef.current = false;
    }, 0);
  }, [activeLesson?.id, pdfResources]);

  useEffect(() => {
    if (!activeLessonLocation || isHydratingLayoutRef.current) return;

    const timeoutId = window.setTimeout(() => {
      saveLessonImmersionState(
        activeLessonLocation.courseId,
        activeLessonLocation.moduleId,
        activeLessonLocation.lessonId,
        buildImmersionSnapshot(
          Object.fromEntries(
            Object.entries(panels).filter(
              ([panelId, panel]) =>
                BUILT_IN_PANEL_IDS.has(panelId) ||
                panel?.pdfResourceId,
            ),
          ),
          zOrder,
          isCanvasFullscreen,
          selectedPresetId,
          pdfResources,
        ),
      );
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [
    activeLessonLocation,
    isCanvasFullscreen,
    panels,
    pdfResources,
    saveLessonImmersionState,
    selectedPresetId,
    zOrder,
  ]);

  const resources = useMemo(
    () => [
      ...pdfResources.map((resource) => ({
        id: resource.id,
        title: resource.title,
        subtitle: resource.subtitle,
        icon: resource.icon,
        type: "pdf",
      })),
      ...(activeLesson?.audioPath
        ? [
            {
              id: "audio",
              title: "Audio principal",
              subtitle: activeLesson.audioPath,
              icon: "headphones",
            },
          ]
        : []),
      ...(activeLesson?.filePath
        ? [
            {
              id: "video",
              title: "Arquivo principal",
              subtitle: activeLesson.filePath,
              icon: "movie",
            },
          ]
        : []),
      ...(activeLesson?.youtubeUrl
        ? [
            {
              id: "youtube",
              title: "Link do YouTube",
              subtitle: activeLesson.youtubeUrl,
              icon: "smart_display",
            },
          ]
        : []),
      ...(activeLesson?.extraMedia || []).map((media) => ({
        id: media.id,
        title: media.title,
        subtitle: media.url,
        icon:
          media.type === "pdf"
            ? "picture_as_pdf"
            : media.type === "audio"
              ? "headphones"
              : media.type === "local_file"
                ? "draft"
                : "attachment",
      })),
    ],
    [activeLesson, pdfResources],
  );

  const formatTime = (timeInSeconds) => {
    const totalSeconds = Math.max(0, Math.floor(timeInSeconds || 0));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  };

  const getCurrentTime = () => {
    if (videoRef.current && !videoRef.current.paused)
      return videoRef.current.currentTime;
    if (audioRef.current && !audioRef.current.paused)
      return audioRef.current.currentTime;
    if (videoRef.current) return videoRef.current.currentTime;
    if (audioRef.current) return audioRef.current.currentTime;
    return null;
  };

  const seekToTime = (time) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      videoRef.current.play().catch(() => {});
      return;
    }
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      audioRef.current.play().catch(() => {});
    }
  };

  const drawBoardElement = (ctx, element) => {
    if (!element?.points?.length) return;
    ctx.save();
    ctx.globalCompositeOperation = element.composite;
    ctx.strokeStyle = element.color;
    ctx.lineWidth = element.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(element.points[0].x, element.points[0].y);
    for (let index = 1; index < element.points.length; index += 1) {
      ctx.lineTo(element.points[index].x, element.points[index].y);
    }
    if (element.points.length === 1) {
      ctx.lineTo(element.points[0].x + 0.01, element.points[0].y + 0.01);
    }
    ctx.stroke();
    ctx.restore();
  };

  const redrawBoard = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvasContextRef.current;
    if (!canvas || !ctx) return;

    const { width, height } = boardSizeRef.current;
    ctx.clearRect(0, 0, width, height);

    const viewportX = boardPanRef.current.x;
    const viewportY = boardPanRef.current.y;
    const viewportScale = boardScaleRef.current;
    const visibleStartX = -viewportX / viewportScale;
    const visibleStartY = -viewportY / viewportScale;
    const visibleEndX = visibleStartX + width / viewportScale;
    const visibleEndY = visibleStartY + height / viewportScale;
    const gridStartX =
      Math.floor(visibleStartX / GRID_SPACING) * GRID_SPACING - GRID_SPACING;
    const gridStartY =
      Math.floor(visibleStartY / GRID_SPACING) * GRID_SPACING - GRID_SPACING;

    ctx.save();
    ctx.translate(viewportX, viewportY);
    ctx.scale(viewportScale, viewportScale);
    ctx.fillStyle = "rgba(167,139,250,0.18)";
    for (
      let gridX = gridStartX;
      gridX < visibleEndX + GRID_SPACING;
      gridX += GRID_SPACING
    ) {
      for (
        let gridY = gridStartY;
        gridY < visibleEndY + GRID_SPACING;
        gridY += GRID_SPACING
      ) {
        ctx.beginPath();
        ctx.arc(gridX, gridY, Math.max(0.9, 1.25 / viewportScale), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (boardBackgroundRef.current) {
      ctx.drawImage(
        boardBackgroundRef.current,
        0,
        0,
        boardBackgroundSizeRef.current.width,
        boardBackgroundSizeRef.current.height,
      );
    }
    boardElementsRef.current.forEach((element) =>
      drawBoardElement(ctx, element),
    );
    ctx.restore();
  }, []);

  useEffect(() => {
    boardPanRef.current = { x: boardViewport.x, y: boardViewport.y };
    boardScaleRef.current = boardViewport.scale;
    redrawBoard();
  }, [boardViewport, redrawBoard]);

  const setupBoardCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const workspace = workspaceRef.current;
    if (!canvas || !workspace) return;

    const dpr = window.devicePixelRatio || 1;
    const width = workspace.clientWidth;
    const height = workspace.clientHeight;
    boardSizeRef.current = { width, height };
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvasContextRef.current = ctx;
    redrawBoard();
  }, [redrawBoard]);

  useEffect(() => {
    setupBoardCanvas();
    const handleResize = () => setupBoardCanvas();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [setupBoardCanvas]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setupBoardCanvas());
    return () => window.cancelAnimationFrame(frame);
  }, [isCanvasFullscreen, setupBoardCanvas]);

  useEffect(() => {
    const didLessonChange = previousLessonIdRef.current !== activeLesson?.id;
    previousLessonIdRef.current = activeLesson?.id || null;

    boardElementsRef.current = [];
    boardUndoStackRef.current = [];
    currentStrokeRef.current = null;
    boardBackgroundRef.current = null;
    boardBackgroundSizeRef.current = { width: 0, height: 0 };

    if (didLessonChange) {
      boardPanRef.current = { x: 0, y: 0 };
      boardScaleRef.current = 1;
      setBoardViewport({ x: 0, y: 0, scale: 1 });
    }

    if (Array.isArray(activeLesson?.drawingScene?.elements)) {
      boardElementsRef.current = cloneBoardElements(
        activeLesson.drawingScene.elements,
      );
      redrawBoard();
      return;
    }

    if (activeLesson?.drawing) {
      const image = new Image();
      image.onload = () => {
        boardBackgroundRef.current = image;
        boardBackgroundSizeRef.current = {
          width: boardSizeRef.current.width,
          height: boardSizeRef.current.height,
        };
        redrawBoard();
      };
      image.src = activeLesson.drawing;
      return;
    }

    redrawBoard();
  }, [activeLesson?.id, activeLesson?.drawing, activeLesson?.drawingScene, redrawBoard]);

  const saveBoardDrawing = () => {
    if (!activeLessonLocation || !canvasRef.current) return;
    const scene = {
      elements: cloneBoardElements(boardElementsRef.current),
      updatedAt: Date.now(),
    };
    saveLessonDrawing(
      activeLessonLocation.courseId,
      activeLessonLocation.moduleId,
      activeLessonLocation.lessonId,
      canvasRef.current.toDataURL("image/png"),
      scene,
    );
  };

  const pushBoardUndoSnapshot = () => {
    boardUndoStackRef.current = [
      ...boardUndoStackRef.current.slice(-39),
      cloneBoardElements(boardElementsRef.current),
    ];
  };

  const restoreBoardSnapshot = (elementsSnapshot) => {
    boardElementsRef.current = cloneBoardElements(elementsSnapshot);
    currentStrokeRef.current = null;
    boardBackgroundRef.current = null;
    boardBackgroundSizeRef.current = { width: 0, height: 0 };
    redrawBoard();
    saveBoardDrawing();
  };

  const undoBoard = useCallback(() => {
    if (isBoardDrawingRef.current) return;

    if (boardElementsRef.current.length > 0) {
      boardElementsRef.current = boardElementsRef.current.slice(0, -1);
      redrawBoard();
      saveBoardDrawing();
      return;
    }

    const previousSnapshot = boardUndoStackRef.current.pop();
    if (previousSnapshot) {
      restoreBoardSnapshot(previousSnapshot);
    }
  }, [activeLessonLocation, redrawBoard, saveLessonDrawing]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const isUndoShortcut =
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === "z";
      if (!isUndoShortcut) return;

      const target = event.target;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (isTyping) return;

      event.preventDefault();
      undoBoard();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undoBoard]);

  const getBoardPoint = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x:
        (event.clientX - rect.left - boardPanRef.current.x) /
        boardScaleRef.current,
      y:
        (event.clientY - rect.top - boardPanRef.current.y) /
        boardScaleRef.current,
    };
  };

  const getBoardPointFromClient = (clientX, clientY) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: clientX, y: clientY };
    return {
      x:
        (clientX - rect.left - boardPanRef.current.x) / boardScaleRef.current,
      y:
        (clientY - rect.top - boardPanRef.current.y) / boardScaleRef.current,
    };
  };

  const zoomBoardAtPoint = useCallback((clientX, clientY, nextScale) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    setBoardViewport((current) => {
      const clampedScale = Math.min(
        MAX_BOARD_SCALE,
        Math.max(MIN_BOARD_SCALE, nextScale),
      );
      if (Math.abs(clampedScale - current.scale) < 0.001) return current;

      const pointerX = clientX - rect.left;
      const pointerY = clientY - rect.top;
      const worldX = (pointerX - current.x) / current.scale;
      const worldY = (pointerY - current.y) / current.scale;

      return {
        x: pointerX - worldX * clampedScale,
        y: pointerY - worldY * clampedScale,
        scale: clampedScale,
      };
    });
  }, []);

  const adjustBoardZoom = useCallback(
    (direction) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const zoomFactor = direction > 0 ? 1 + BOARD_ZOOM_STEP : 1 - BOARD_ZOOM_STEP;
      zoomBoardAtPoint(centerX, centerY, boardScaleRef.current * zoomFactor);
    },
    [zoomBoardAtPoint],
  );

  const startBoardInteraction = (event) => {
    if (!canvasRef.current) return;
    canvasRef.current.setPointerCapture?.(event.pointerId);

    if (drawingToolRef.current === "pan" || event.button === 1) {
      isBoardPanningRef.current = true;
      lastBoardPointerRef.current = { x: event.clientX, y: event.clientY };
      return;
    }

    pushBoardUndoSnapshot();

    const isEraser = drawingToolRef.current === "eraser";
    const stroke = {
      points: [getBoardPoint(event)],
      color: isEraser ? "rgba(0,0,0,1)" : drawingColorRef.current,
      width: isEraser ? drawingWidthRef.current * 6 : drawingWidthRef.current,
      composite: isEraser ? "destination-out" : "source-over",
    };
    currentStrokeRef.current = stroke;
    boardElementsRef.current.push(stroke);
    isBoardDrawingRef.current = true;
    redrawBoard();
  };

  const moveBoardInteraction = (event) => {
    if (isBoardPanningRef.current) {
      const deltaX = event.clientX - lastBoardPointerRef.current.x;
      const deltaY = event.clientY - lastBoardPointerRef.current.y;
      setBoardViewport((current) => ({
        ...current,
        x: current.x + deltaX,
        y: current.y + deltaY,
      }));
      lastBoardPointerRef.current = { x: event.clientX, y: event.clientY };
      return;
    }

    if (!isBoardDrawingRef.current || !currentStrokeRef.current) return;
    currentStrokeRef.current.points.push(getBoardPoint(event));
    redrawBoard();
  };

  const stopBoardInteraction = (event) => {
    canvasRef.current?.releasePointerCapture?.(event.pointerId);

    if (isBoardPanningRef.current) {
      isBoardPanningRef.current = false;
      return;
    }

    if (isBoardDrawingRef.current) {
      isBoardDrawingRef.current = false;
      currentStrokeRef.current = null;
      saveBoardDrawing();
    }
  };

  const handleBoardWheel = (event) => {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const wheelDelta = Math.max(
        -BOARD_WHEEL_ZOOM_MAX_DELTA,
        Math.min(BOARD_WHEEL_ZOOM_MAX_DELTA, -event.deltaY * BOARD_WHEEL_ZOOM_SENSITIVITY),
      );
      const zoomFactor = 1 + wheelDelta;
      zoomBoardAtPoint(
        event.clientX,
        event.clientY,
        boardScaleRef.current * zoomFactor,
      );
      return;
    }

    setBoardViewport((current) => ({
      ...current,
      x: current.x - event.deltaX,
      y: current.y - event.deltaY,
    }));
  };

  const clearBoard = () => {
    pushBoardUndoSnapshot();
    boardElementsRef.current = [];
    boardBackgroundRef.current = null;
    boardBackgroundSizeRef.current = { width: 0, height: 0 };
    redrawBoard();
    saveBoardDrawing();
  };

  const exitImmersion = async () => {
    try {
      if (window.studyhubDesktop?.windowControls?.setFullScreen) {
        await window.studyhubDesktop.windowControls.setFullScreen(false);
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {}

    onNavigate?.(SCREEN_IDS.LESSON);
  };

  useEffect(() => {
    const enterFullScreen = async () => {
      try {
        if (window.studyhubDesktop?.windowControls?.setFullScreen) {
          await window.studyhubDesktop.windowControls.setFullScreen(true);
        } else if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
      } catch {}
    };

    enterFullScreen();

    return () => {
      try {
        if (window.studyhubDesktop?.windowControls?.setFullScreen) {
          window.studyhubDesktop.windowControls.setFullScreen(false);
        } else if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
      } catch {}
    };
  }, []);

  useEffect(() => {
    const syncPlaybackTime = () => {
      const time = getCurrentTime();
      if (time !== null && time !== undefined) {
        setImmersionMediaTime(time);
      }
    };

    const videoElement = videoRef.current;
    const audioElement = audioRef.current;

    videoElement?.addEventListener("timeupdate", syncPlaybackTime);
    audioElement?.addEventListener("timeupdate", syncPlaybackTime);

    return () => {
      videoElement?.removeEventListener("timeupdate", syncPlaybackTime);
      audioElement?.removeEventListener("timeupdate", syncPlaybackTime);
    };
  }, [activeLessonId, setImmersionMediaTime]);

  useEffect(() => {
    const handlePointerMove = (event) => {
      if (dragRef.current) {
        const { panelId, offsetX, offsetY } = dragRef.current;
        const panel = panels[panelId];
        if (!panel) return;
        const pointer = getBoardPointFromClient(event.clientX, event.clientY);

        const nextX = pointer.x - offsetX;
        const nextY = pointer.y - offsetY;

        setPanels((current) => ({
          ...current,
          [panelId]: { ...current[panelId], x: nextX, y: nextY },
        }));
        return;
      }

      if (resizeRef.current) {
        const {
          panelId,
          startX,
          startY,
          startW,
          startH,
          startPanelX,
          startPanelY,
          corner,
        } = resizeRef.current;
        const panel = panels[panelId];
        if (!panel) return;

        const pointer = getBoardPointFromClient(event.clientX, event.clientY);
        const deltaX = pointer.x - startX;
        const deltaY = pointer.y - startY;

        let nextX = startPanelX;
        let nextY = startPanelY;
        let nextW = startW;
        let nextH = startH;

        if (corner.includes("left")) {
          const maxLeftX = startPanelX + startW - MIN_PANEL_WIDTH;
          nextX = Math.min(startPanelX + deltaX, maxLeftX);
          nextW = startW + (startPanelX - nextX);
        } else {
          nextW = Math.max(MIN_PANEL_WIDTH, startW + deltaX);
        }

        if (corner.includes("top")) {
          const maxTopY = startPanelY + startH - MIN_PANEL_HEIGHT;
          nextY = Math.min(startPanelY + deltaY, maxTopY);
          nextH = startH + (startPanelY - nextY);
        } else {
          nextH = Math.max(MIN_PANEL_HEIGHT, startH + deltaY);
        }

        setPanels((current) => ({
          ...current,
          [panelId]: {
            ...current[panelId],
            x: nextX,
            y: nextY,
            w: nextW,
            h: nextH,
          },
        }));
      }
    };

    const stopInteraction = () => {
      dragRef.current = null;
      resizeRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopInteraction);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopInteraction);
    };
  }, [panels]);

  const bringPanelToFront = (panelId) => {
    setZOrder((current) => [
      ...current.filter((id) => id !== panelId),
      panelId,
    ]);
  };

  const startDragging = (event, panelId) => {
    event.stopPropagation();
    event.preventDefault();
    if (!canvasRef.current) return;
    const panel = panels[panelId];
    if (!panel) return;
    const pointer = getBoardPoint(event);

    bringPanelToFront(panelId);
    dragRef.current = {
      panelId,
      offsetX: pointer.x - panel.x,
      offsetY: pointer.y - panel.y,
    };
  };

  const startResizing = (event, panelId, corner) => {
    event.stopPropagation();
    event.preventDefault();
    if (!canvasRef.current) return;
    const panel = panels[panelId];
    if (!panel) return;
    const pointer = getBoardPoint(event);

    bringPanelToFront(panelId);
    resizeRef.current = {
      panelId,
      startX: pointer.x,
      startY: pointer.y,
      startPanelX: panel.x,
      startPanelY: panel.y,
      startW: panel.w,
      startH: panel.h,
      corner,
    };
  };

  const togglePanel = (panelId) => {
    setPanels((current) => ({
      ...current,
      [panelId]: {
        ...current[panelId],
        visible: !current[panelId].visible,
        isMinimized: false,
      },
    }));
    bringPanelToFront(panelId);
  };

  const openNoteCard = (note) => {
    const panelId = `note-${note.id}`;
    setPanels((current) => {
      if (current[panelId]) {
        return {
          ...current,
          [panelId]: { ...current[panelId], visible: true },
        };
      }
      const openNoteCount = Object.keys(current).filter((key) =>
        key.startsWith("note-"),
      ).length;
      return {
        ...current,
        [panelId]: {
          id: panelId,
          label: note.title || "Nota",
          icon: "edit_note",
          visible: true,
          isMinimized: false,
          x: 140 + openNoteCount * 32,
          y: 140 + openNoteCount * 32,
          w: 360,
          h: 420,
          noteId: note.id,
        },
      };
    });
    setZOrder((current) => [
      ...current.filter((id) => id !== panelId),
      panelId,
    ]);
  };

  const closeNoteCard = (panelId) => {
    setPanels((current) => ({
      ...current,
      [panelId]: { ...current[panelId], visible: false },
    }));
  };

  const openPdfCard = (resource) => {
    if (!resource?.id) return;

    const panelId = getPdfPanelId(resource.id);
    setPanels((current) => {
      if (current[panelId]) {
        return {
          ...current,
          [panelId]: { ...current[panelId], visible: true },
        };
      }

      const openPdfCount = Object.keys(current).filter((key) =>
        key.startsWith(PDF_PANEL_PREFIX),
      ).length;

      return {
        ...current,
        [panelId]: buildPdfPanel(resource, openPdfCount),
      };
    });
    setZOrder((current) => [
      ...current.filter((id) => id !== panelId),
      panelId,
    ]);
  };

  const openTaskCard = (task) => {
    const panelId = `${TASK_PANEL_PREFIX}${task.id}`;
    setPanels((current) => {
      if (current[panelId]) {
        return {
          ...current,
          [panelId]: { ...current[panelId], visible: true },
        };
      }

      const openCount = Object.keys(current).filter((key) =>
        key.startsWith(TASK_PANEL_PREFIX),
      ).length;

      return {
        ...current,
        [panelId]: {
          id: panelId,
          label: task.title || "Tarefa",
          icon: "task_alt",
          visible: true,
          isMinimized: false,
          x: 180 + openCount * 32,
          y: 160 + openCount * 26,
          w: 360,
          h: 300,
          taskId: task.id,
        },
      };
    });
    setZOrder((current) => [
      ...current.filter((id) => id !== panelId),
      panelId,
    ]);
  };

  const openDeckCard = (deck) => {
    const panelId = `${DECK_PANEL_PREFIX}${deck.id}`;
    setPanels((current) => {
      if (current[panelId]) {
        return {
          ...current,
          [panelId]: { ...current[panelId], visible: true },
        };
      }

      const openCount = Object.keys(current).filter((key) =>
        key.startsWith(DECK_PANEL_PREFIX),
      ).length;

      return {
        ...current,
        [panelId]: {
          id: panelId,
          label: deck.title || "Flashcards",
          icon: "style",
          visible: true,
          isMinimized: false,
          x: 220 + openCount * 32,
          y: 180 + openCount * 26,
          w: 380,
          h: 340,
          deckId: deck.id,
        },
      };
    });
    setZOrder((current) => [
      ...current.filter((id) => id !== panelId),
      panelId,
    ]);
  };

  const minimizePanel = (panelId) => {
    setPanels((current) => ({
      ...current,
      [panelId]: { ...current[panelId], visible: false, isMinimized: true },
    }));
  };

  const closePanel = (panelId) => {
    setPanels((current) => {
      if (!current[panelId]) return current;
      if (PANEL_ORDER.includes(panelId)) {
        return {
          ...current,
          [panelId]: {
            ...current[panelId],
            visible: false,
            isMinimized: false,
          },
        };
      }

      const next = { ...current };
      delete next[panelId];
      return next;
    });
    setZOrder((current) => current.filter((id) => id !== panelId));
  };

  const applyPreset = (presetId) => {
    const preset = immersionPresets.find((item) => item.id === presetId);
    if (!preset) return;

    isHydratingLayoutRef.current = true;
    setPanels(sanitizePanels(preset.panels, pdfResources));
    setZOrder(sanitizeZOrder(preset.zOrder, pdfResources, preset.panels));
    setIsCanvasFullscreen(Boolean(preset.isCanvasFullscreen));
    setSelectedPresetId(preset.id);
    setTimeout(() => {
      isHydratingLayoutRef.current = false;
    }, 0);

    if (!activeLessonLocation) return;
    saveLessonImmersionState(
      activeLessonLocation.courseId,
      activeLessonLocation.moduleId,
      activeLessonLocation.lessonId,
      buildImmersionSnapshot(
        preset.panels,
        preset.zOrder,
        preset.isCanvasFullscreen,
        preset.id,
        pdfResources,
      ),
    );
  };

  const handleCreatePreset = () => {
    const name = window.prompt("Nome do preset de imersao:");
    if (!name?.trim()) return;

    const snapshot = buildImmersionSnapshot(
      Object.fromEntries(
        Object.entries(panels).filter(([panelId]) =>
          BUILT_IN_PANEL_IDS.has(panelId) || panels[panelId]?.pdfResourceId,
        ),
      ),
      zOrder,
      isCanvasFullscreen,
      null,
      pdfResources,
    );

    createImmersionPreset({
      name: name.trim(),
      ...snapshot,
    });
  };

  const handleUpdatePreset = () => {
    const preset = immersionPresets.find((item) => item.id === selectedPresetId);
    if (!preset || preset.builtIn) return;

    updateImmersionPreset(selectedPresetId, {
      ...buildImmersionSnapshot(
        Object.fromEntries(
          Object.entries(panels).filter(([panelId]) =>
            BUILT_IN_PANEL_IDS.has(panelId) || panels[panelId]?.pdfResourceId,
          ),
        ),
        zOrder,
        isCanvasFullscreen,
        selectedPresetId,
        pdfResources,
      ),
      updatedAt: Date.now(),
    });
  };

  const handleDeletePreset = () => {
    const preset = immersionPresets.find((item) => item.id === selectedPresetId);
    if (!preset || preset.builtIn) return;
    if (!window.confirm(`Excluir o preset "${preset.name}"?`)) return;

    deleteImmersionPreset(selectedPresetId);
    setSelectedPresetId("");
  };

  const attachLessonFile = async (kind) => {
    if (!window.studyhubDesktop?.selectFile) {
      alert("A seleÃ§Ã£o de arquivos funciona no app Desktop.");
      return;
    }
    if (!activeLessonLocation) {
      alert("Abra uma aula antes de adicionar arquivos na imersao.");
      return;
    }

    const filters =
      kind === "audio"
        ? [{ name: "Audio", extensions: ["mp3", "wav", "ogg", "m4a"] }]
        : kind === "pdf"
          ? [{ name: "PDF", extensions: ["pdf"] }]
          : kind === "video"
            ? [{ name: "Video", extensions: ["mp4", "mov", "webm", "mkv"] }]
            : [{ name: "Arquivos", extensions: ["*"] }];

    const selectedPath = await window.studyhubDesktop.selectFile({ filters });
    if (!selectedPath) return;

    const saveLessonUpdates = (updates) => {
      useStudyStore
        .getState()
        .updateLesson(
          activeLessonLocation.courseId,
          activeLessonLocation.moduleId,
          activeLessonLocation.lessonId,
          updates,
        );
    };

    if (kind === "video") {
      saveLessonUpdates({
        filePath: selectedPath,
      });
      return;
    }
    if (kind === "pdf") {
      if (!activeLesson?.pdfPath) {
        saveLessonUpdates({
          pdfPath: selectedPath,
        });
        return;
      }

      const pdfId = `extra-pdf-${Date.now()}`;
      const extraMedia = [
        ...(activeLesson?.extraMedia || []),
        {
          id: pdfId,
          type: "pdf",
          title: selectedPath.split(/[\\/]/).pop() || "PDF extra",
          url: selectedPath,
        },
      ];
      saveLessonUpdates({
        extraMedia,
      });
      openPdfCard({
        id: pdfId,
        title: selectedPath.split(/[\\/]/).pop() || "PDF extra",
        path: selectedPath,
        subtitle: selectedPath,
        icon: "picture_as_pdf",
      });
      return;
    }
    if (kind === "audio") {
      saveLessonUpdates({
        audioPath: selectedPath,
      });
      return;
    }

    const extraMedia = [
      ...(activeLesson?.extraMedia || []),
      {
        id: `extra-${Date.now()}`,
        type: "local_file",
        title: selectedPath.split(/[\\/]/).pop() || "Arquivo extra",
        url: selectedPath,
      },
    ];
    saveLessonUpdates({
      extraMedia,
    });
  };

  const attachLessonVideoLink = () => {
    if (!activeLessonLocation) {
      alert("Abra uma aula antes de adicionar um link na imersao.");
      return;
    }

    const youtubeUrl = window.prompt("Cole o link do YouTube:");
    if (!youtubeUrl?.trim()) return;
    if (!parseYoutubeUrl(youtubeUrl.trim())) {
      alert("Use um link valido do YouTube.");
      return;
    }

    useStudyStore.getState().updateLesson(
      activeLessonLocation.courseId,
      activeLessonLocation.moduleId,
      activeLessonLocation.lessonId,
      { youtubeUrl: youtubeUrl.trim() },
    );
  };

  const handleSaveQuickNote = () => {
    if (!noteText.trim()) return;
    if (!activeLessonLocation) {
      alert("Abra uma aula antes de salvar notas na imersao.");
      return;
    }

    const currentTime = getCurrentTime();
    const hasTime = currentTime !== null && currentTime !== undefined;

    const createdNoteId = `note-${Date.now()}`;
    const createdNoteTitle = noteTitle.trim() || "Nota sem titulo";

    addNote({
      id: createdNoteId,
      title: createdNoteTitle,
      content: noteText,
      module: activeModule?.title || "Imersão",
      time: hasTime ? formatTime(currentTime) : "Agora",
      timestamp: hasTime ? currentTime : null,
      sourceCourseId: activeLessonLocation.courseId,
      sourceModuleId: activeLessonLocation.moduleId,
      sourceLessonId: activeLessonLocation.lessonId,
      sourceLessonTitle: activeLesson?.title,
    });

    openNoteCard({
      id: createdNoteId,
      title: `Insight de ${activeLesson?.title || "ImersÃ£o"}`,
      content: noteText,
      module: activeModule?.title || "ImersÃ£o",
      time: hasTime ? formatTime(currentTime) : "Agora",
      timestamp: hasTime ? currentTime : null,
      sourceCourseId: activeLessonLocation.courseId,
      sourceModuleId: activeLessonLocation.moduleId,
      sourceLessonId: activeLessonLocation.lessonId,
      sourceLessonTitle: activeLesson?.title,
    });

    setNoteText("");
    setNoteTitle("");
  };

  const handleSaveQuickFlashcard = () => {
    if (!flashcardFront.trim() || !flashcardBack.trim()) return;
    if (!activeLessonLocation) {
      alert("Abra uma aula antes de criar flashcards na imersao.");
      return;
    }

    const existingDeck = relatedDecks[0];
    if (existingDeck) {
      addFlashcard(existingDeck.id, {
        front: flashcardFront.trim(),
        back: flashcardBack.trim(),
      });
    } else {
      const deckId = `deck-${Date.now()}`;
      addFlashcardDeck({
        id: deckId,
        title: `Flashcards de ${activeLesson?.title || "aula"}`,
        category: activeModule?.title || "Aula",
        sourceCourseId: activeLessonLocation.courseId,
        sourceModuleId: activeLessonLocation.moduleId,
        sourceLessonId: activeLessonLocation.lessonId,
        cards: [],
      });
      addFlashcard(deckId, {
        front: flashcardFront.trim(),
        back: flashcardBack.trim(),
      });
    }

    setFlashcardFront("");
    setFlashcardBack("");
  };

  const handleSaveTask = () => {
    if (!taskTitle.trim()) return;
    if (!activeLessonLocation) {
      alert("Abra uma aula antes de criar tarefas na imersao.");
      return;
    }

    addTask({
      title: taskTitle.trim(),
      description: taskDescription.trim(),
      status: "pending",
      priority: "medium",
      type: "task",
      sourceCourseId: activeLessonLocation.courseId,
      sourceModuleId: activeLessonLocation.moduleId,
      sourceLessonId: activeLessonLocation.lessonId,
      sourceLessonTitle: activeLesson?.title,
    });

    setTaskTitle("");
    setTaskDescription("");
  };

  const removeLessonItem = (item) => {
    if (!activeLessonLocation) return;

    if (item.type === "note") {
      useStudyStore.getState().deleteNote(item.id);
      return;
    }

    if (item.type === "deck") {
      useStudyStore.getState().deleteFlashcardDeck(item.id);
      return;
    }

    if (item.type === "task") {
      useStudyStore.getState().deleteTask(item.id);
      return;
    }

    if (item.type === "video") {
      useStudyStore.getState().updateLesson(
        activeLessonLocation.courseId,
        activeLessonLocation.moduleId,
        activeLessonLocation.lessonId,
        { filePath: null },
      );
      return;
    }

    if (item.type === "youtube") {
      useStudyStore.getState().updateLesson(
        activeLessonLocation.courseId,
        activeLessonLocation.moduleId,
        activeLessonLocation.lessonId,
        { youtubeUrl: null },
      );
      return;
    }

    if (item.type === "audio") {
      useStudyStore.getState().updateLesson(
        activeLessonLocation.courseId,
        activeLessonLocation.moduleId,
        activeLessonLocation.lessonId,
        { audioPath: null },
      );
      return;
    }

    if (item.type === "pdf") {
      const currentLesson = useStudyStore
        .getState()
        .courses.find((course) => course.id === activeLessonLocation.courseId)
        ?.modules.find((module) => module.id === activeLessonLocation.moduleId)
        ?.lessons.find((lesson) => lesson.id === activeLessonLocation.lessonId);

      if (!currentLesson) return;

      if (item.kind === "primary") {
        useStudyStore.getState().updateLesson(
          activeLessonLocation.courseId,
          activeLessonLocation.moduleId,
          activeLessonLocation.lessonId,
          { pdfPath: null },
        );
        return;
      }

      useStudyStore.getState().updateLesson(
        activeLessonLocation.courseId,
        activeLessonLocation.moduleId,
        activeLessonLocation.lessonId,
        {
          extraMedia: (currentLesson.extraMedia || []).filter(
            (media) => media.id !== item.id,
          ),
        },
      );
      return;
    }

    if (item.type === "media") {
      const currentLesson = useStudyStore
        .getState()
        .courses.find((course) => course.id === activeLessonLocation.courseId)
        ?.modules.find((module) => module.id === activeLessonLocation.moduleId)
        ?.lessons.find((lesson) => lesson.id === activeLessonLocation.lessonId);

      if (!currentLesson) return;

      useStudyStore.getState().updateLesson(
        activeLessonLocation.courseId,
        activeLessonLocation.moduleId,
        activeLessonLocation.lessonId,
        {
          extraMedia: (currentLesson.extraMedia || []).filter(
            (media) => media.id !== item.id,
          ),
        },
      );
    }
  };

  const videoPanelNode = useMemo(() => {
    if (activeLesson?.youtubeUrl) {
      return (
        <iframe
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="h-full w-full rounded-[20px] border-0 bg-black"
          src={parseYoutubeUrl(activeLesson.youtubeUrl)}
          title={activeLesson.title || "Aula"}
        />
      );
    }

    if (activeLesson?.filePath) {
      return (
        <video
          ref={videoRef}
          controls
          src={getLocalFileUrl(activeLesson.filePath)}
          className="h-full w-full rounded-[20px] bg-black object-contain"
        />
      );
    }

    return (
      <EmptyPanel
        icon="smart_display"
        title="Sem aula em video"
        text="Adicione um arquivo local ou link do YouTube para usar este painel."
        actionLabel="Adicionar arquivo"
        onAction={() => attachLessonFile("video")}
        secondaryActionLabel="Adicionar link"
        onSecondaryAction={attachLessonVideoLink}
      />
    );
  }, [activeLesson]);

  const audioPanelNode = useMemo(() => {
    const audioSource =
      activeLesson?.audioPath ||
      (activeLesson?.kindLabel === "Audio" ? activeLesson?.filePath : null);
    if (!audioSource) {
      return (
        <EmptyPanel
          icon="headphones"
          title="Sem audio vinculado"
          text="Inclua um audio para acompanhar a imersao."
          actionLabel="Adicionar audio"
          onAction={() => attachLessonFile("audio")}
        />
      );
    }

    return (
      <div className="flex h-full flex-col gap-4">
        <audio
          ref={audioRef}
          controls
          src={getLocalFileUrl(audioSource)}
          className="w-full"
        />
        <div className="min-h-0 flex-1 overflow-hidden rounded-[20px] border border-[color:var(--outline-variant)]/28 bg-[color:var(--background)]/65">
          <TranscriptPlayer
            audioRef={audioRef}
            transcript={activeLesson?.transcript}
            transcriptStorageKey={activeLesson?.transcriptMeta?.storageKey}
          />
        </div>
      </div>
    );
  }, [activeLesson]);

  const renderPdfPanel = () => {
    if (!pdfResources.length) {
      return (
        <EmptyPanel
          icon="picture_as_pdf"
          title="Sem PDF vinculado"
          text="Adicione um PDF a esta aula para leitura durante a imersao."
          actionLabel="Adicionar PDF"
          onAction={() => attachLessonFile("pdf")}
        />
      );
    }

    return (
      <div className="flex h-full flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {pdfResources.map((resource) => (
            <button
              key={resource.id}
              className="rounded-full border border-[color:var(--outline-variant)]/35 bg-[color:var(--background)] px-3 py-1.5 text-xs font-bold text-[color:var(--on-surface)] transition-colors hover:text-[color:var(--primary)]"
              type="button"
              onClick={() => openPdfCard(resource)}
            >
              {resource.title}
            </button>
          ))}
          <button
            className="rounded-full bg-[color:var(--primary)] px-3 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90"
            type="button"
            onClick={() => attachLessonFile("pdf")}
          >
            Adicionar PDF
          </button>
        </div>
        <embed
          src={getLocalFileUrl(pdfResources[0].path)}
          type="application/pdf"
          className="min-h-0 flex-1 rounded-[20px] bg-white"
        />
      </div>
    );
  };

  const renderNotesPanel = () => (
    <div className="flex h-full flex-col gap-4">
      <div className="rounded-[20px] border border-[color:var(--outline-variant)]/28 bg-[color:var(--background)]/65 p-4">
        <input
          className="w-full bg-transparent text-sm font-bold text-[color:var(--on-surface)] outline-none placeholder:text-[color:var(--outline)]"
          value={noteTitle}
          onChange={(event) => setNoteTitle(event.target.value)}
          placeholder="Titulo da nota..."
        />
        <textarea
          className="mt-2 h-28 w-full resize-none border-t border-[color:var(--outline-variant)]/20 bg-transparent pt-3 text-sm text-[color:var(--on-surface)] outline-none placeholder:text-[color:var(--outline)]"
          value={noteText}
          onChange={(event) => setNoteText(event.target.value)}
          placeholder="Digite uma nota rápida..."
        />
        <div className="mt-3 flex items-center justify-between border-t border-[color:var(--outline-variant)]/20 pt-3">
          <span className="text-xs font-semibold text-[color:var(--on-surface-variant)]">
            {(() => {
              const time = getCurrentTime();
              return time !== null && time !== undefined
                ? `Tempo atual: ${formatTime(time)}`
                : "Sem tempo ativo";
            })()}
          </span>
          <button
            className="rounded-xl bg-[color:var(--primary)] px-4 py-2 text-xs font-bold text-white"
            type="button"
            onClick={handleSaveQuickNote}
          >
            Salvar nota
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 custom-scrollbar">
        {relatedNotes.length > 0 ? (
          relatedNotes.map((note) => (
            <button
              key={note.id}
              type="button"
              className="block w-full rounded-[20px] border border-[color:var(--outline-variant)]/24 bg-[color:var(--background)]/70 p-4 text-left transition-colors hover:border-[color:var(--primary)]/40"
              onClick={() => openNoteCard(note)}
              title="Abrir anotação em janela flutuante"
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="truncate text-sm font-bold text-[color:var(--on-surface)]">
                  {note.title || "Nota"}
                </p>
                <span
                  className={`shrink-0 text-xs font-bold text-[color:var(--primary)] ${note.timestamp !== null && note.timestamp !== undefined ? "underline underline-offset-2" : ""}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (
                      note.timestamp !== null &&
                      note.timestamp !== undefined
                    ) {
                      seekToTime(note.timestamp);
                    }
                  }}
                >
                  {note.time || "Agora"}
                </span>
              </div>
              {typeof note.content === "string" &&
              note.content.includes("<") ? (
                <div
                  className="line-clamp-3 text-sm leading-7 text-[color:var(--on-surface-variant)]"
                  dangerouslySetInnerHTML={{ __html: sanitizeUserHtml(note.content) }}
                />
              ) : (
                <p className="line-clamp-3 text-sm leading-7 text-[color:var(--on-surface-variant)]">
                  {note.content}
                </p>
              )}
            </button>
          ))
        ) : (
          <EmptyPanel
            icon="edit_note"
            title="Sem anotações ainda"
            text="Use este painel para registrar observações com horário."
          />
        )}
      </div>
    </div>
  );

  const renderQuickFlashcardForm = () => (
    <div className="rounded-[20px] border border-[color:var(--outline-variant)]/28 bg-[color:var(--background)]/65 p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[color:var(--primary)]">
        Novo flashcard
      </p>
      <input
        className="mt-3 w-full bg-transparent text-sm font-bold text-[color:var(--on-surface)] outline-none placeholder:text-[color:var(--outline)]"
        value={flashcardFront}
        onChange={(event) => setFlashcardFront(event.target.value)}
        placeholder="Frente: pergunta ou conceito..."
      />
      <textarea
        className="mt-3 h-16 w-full resize-none border-t border-[color:var(--outline-variant)]/20 bg-transparent pt-3 text-sm text-[color:var(--on-surface)] outline-none placeholder:text-[color:var(--outline)]"
        value={flashcardBack}
        onChange={(event) => setFlashcardBack(event.target.value)}
        placeholder="Verso: resposta..."
      />
      <div className="mt-3 flex justify-end border-t border-[color:var(--outline-variant)]/20 pt-3">
        <button
          className="rounded-xl bg-[color:var(--primary)] px-4 py-2 text-xs font-bold text-white disabled:opacity-40"
          type="button"
          disabled={!flashcardFront.trim() || !flashcardBack.trim()}
          onClick={handleSaveQuickFlashcard}
        >
          Salvar flashcard
        </button>
      </div>
    </div>
  );

  const renderFlashcardsPanel = () =>
    relatedDecks.length > 0 ? (
      <div className="flex h-full flex-col gap-3">
        <div className="rounded-[20px] border border-[color:var(--outline-variant)]/24 bg-[color:var(--background)]/70 p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[color:var(--primary)]">
            Revisao rapida
          </p>
          <p className="mt-2 text-sm text-[color:var(--on-surface-variant)]">
            Escolha um baralho da aula para revisar agora ou abrir em um card flutuante.
          </p>
        </div>
        {renderQuickFlashcardForm()}
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 custom-scrollbar">
          {relatedDecks.map((deck) => {
            const firstCard = deck.cards?.[0];
            const cardsCount = deck.cards?.length || 0;
            return (
              <article
                key={deck.id}
                className="rounded-[20px] border border-[color:var(--outline-variant)]/24 bg-[color:var(--background)]/70 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[color:var(--on-surface)]">
                      {deck.title}
                    </p>
                    <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">
                      {cardsCount} cartoes prontos para revisar
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[color:var(--primary)]/10 px-2 py-1 text-[10px] font-bold text-[color:var(--primary)]">
                    {cardsCount}
                  </span>
                </div>
                {firstCard ? (
                  <div className="mt-3 rounded-2xl border border-[color:var(--outline-variant)]/20 bg-[color:var(--surface)]/75 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[color:var(--primary)]">
                      Primeira pergunta
                    </p>
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-[color:var(--on-surface-variant)]">
                      {firstCard.front || "Cartao sem frente definida."}
                    </p>
                  </div>
                ) : null}
                <div className="mt-3 flex gap-2">
                  <button
                    className="flex-1 rounded-xl bg-[color:var(--primary)] px-3 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90"
                    type="button"
                    onClick={() => {
                      useStudyStore.getState().setActiveDeck(deck.id);
                      onNavigate?.(SCREEN_IDS.FLASHCARDS);
                    }}
                  >
                    Revisar agora
                  </button>
                  <button
                    className="rounded-xl border border-[color:var(--outline-variant)]/30 bg-[color:var(--surface)] px-3 py-2 text-xs font-bold text-[color:var(--on-surface)] transition-colors hover:border-[color:var(--primary)]/35"
                    type="button"
                    onClick={() => openDeckCard(deck)}
                  >
                    Ver no canvas
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    ) : (
    <div className="flex h-full flex-col gap-3">
      {renderQuickFlashcardForm()}
      <EmptyPanel
        icon="style"
        title="Sem flashcards"
        text="Crie o primeiro cartao da aula acima."
      />
    </div>
  );

  const renderTasksPanel = () => (
    <div className="flex h-full flex-col gap-4">
      <div className="rounded-[20px] border border-[color:var(--outline-variant)]/28 bg-[color:var(--background)]/65 p-4">
        <input
          className="w-full bg-transparent text-sm font-bold text-[color:var(--on-surface)] outline-none placeholder:text-[color:var(--outline)]"
          value={taskTitle}
          onChange={(event) => setTaskTitle(event.target.value)}
          placeholder="Nova tarefa..."
        />
        <textarea
          className="mt-3 h-20 w-full resize-none bg-transparent text-sm text-[color:var(--on-surface-variant)] outline-none placeholder:text-[color:var(--outline)]"
          value={taskDescription}
          onChange={(event) => setTaskDescription(event.target.value)}
          placeholder="Detalhes, prazo ou contexto..."
        />
        <div className="mt-3 flex justify-end border-t border-[color:var(--outline-variant)]/20 pt-3">
          <button
            className="rounded-xl bg-[color:var(--primary)] px-4 py-2 text-xs font-bold text-white disabled:opacity-40"
            type="button"
            disabled={!taskTitle.trim()}
            onClick={handleSaveTask}
          >
            Salvar tarefa
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 custom-scrollbar">
        {relatedTasks.length > 0 ? (
          relatedTasks.map((task) => (
            <article
              key={task.id}
              className="rounded-[20px] border border-[color:var(--outline-variant)]/24 bg-[color:var(--background)]/70 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-bold text-[color:var(--on-surface)]">
                  {task.title}
                </p>
                <span className="shrink-0 rounded-full bg-[color:var(--primary)]/10 px-2 py-1 text-[10px] font-bold text-[color:var(--primary)]">
                  {task.status || "pending"}
                </span>
              </div>
              {task.description ? (
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-[color:var(--on-surface-variant)]">
                  {task.description}
                </p>
              ) : null}
            </article>
          ))
        ) : (
          <EmptyPanel
            icon="task_alt"
            title="Sem tarefas"
            text="Crie tarefas da aula sem sair da imersao."
          />
        )}
      </div>
    </div>
  );

  const renderDrawingPanel = () =>
    activeLesson?.drawing ? (
      <div className="flex h-full flex-col gap-4">
        <img
          alt="Desenho da aula"
          className="min-h-0 flex-1 rounded-[20px] border border-[color:var(--outline-variant)]/24 object-contain"
          src={activeLesson.drawing}
        />
        <button
          className="rounded-xl border border-[color:var(--outline-variant)]/35 bg-[color:var(--background)]/70 px-4 py-3 text-sm font-bold text-[color:var(--on-surface)]"
          type="button"
          onClick={() => window.studyhubDesktop?.openWhiteboardWindow?.()}
        >
          Abrir lousa
        </button>
      </div>
    ) : (
      <EmptyPanel
        icon="draw"
        title="Sem desenho salvo"
        text="Abra a lousa da aula e salve um desenho para acompanhar aqui."
      />
    );

  const renderResourcesPanel = () =>
    resources.length > 0 ? (
      <div className="space-y-3">
        {resources.map((resource) => (
          <button
            key={resource.id}
            className="rounded-[20px] border border-[color:var(--outline-variant)]/24 bg-[color:var(--background)]/70 p-4"
            type="button"
            onClick={() => {
              if (resource.type === "pdf") {
                const pdfResource = pdfResources.find(
                  (item) => item.id === resource.id,
                );
                if (pdfResource) openPdfCard(pdfResource);
              }
            }}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[color:var(--primary)]/10 text-[color:var(--primary)]">
                <Icon className="text-[18px]" name={resource.icon} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-[color:var(--on-surface)]">
                  {resource.title}
                </p>
                <p className="truncate text-xs text-[color:var(--on-surface-variant)]">
                  {resource.subtitle}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>
    ) : (
      <EmptyPanel
        icon="folder_open"
        title="Sem recursos extras"
        text="Os arquivos adicionais da aula aparecem aqui."
        actionLabel="Adicionar arquivo"
        onAction={() => attachLessonFile("file")}
      />
    );

  const renderPdfResourcePanel = (panel) => {
    const resource = pdfResources.find(
      (item) => item.id === panel.pdfResourceId,
    );

    if (!resource?.path) {
      return (
        <EmptyPanel
          icon="picture_as_pdf"
          title="PDF indisponivel"
          text="Este PDF nao esta mais vinculado a aula."
        />
      );
    }

    return (
      <embed
        src={getLocalFileUrl(resource.path)}
        type="application/pdf"
        className="h-full w-full rounded-[20px] bg-white"
      />
    );
  };

  const renderTaskResourcePanel = (task) => (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full bg-[color:var(--primary)]/10 px-3 py-1.5 text-xs font-bold text-[color:var(--primary)]">
          {task.status || "pending"}
        </span>
        <span className="rounded-full bg-[color:var(--background)] px-3 py-1.5 text-xs font-semibold text-[color:var(--on-surface-variant)]">
          {task.priority || "medium"}
        </span>
      </div>
      <div className="rounded-[20px] border border-[color:var(--outline-variant)]/24 bg-[color:var(--background)]/70 p-4">
        <p className="text-sm leading-7 text-[color:var(--on-surface-variant)]">
          {task.description || "Sem descricao"}
        </p>
      </div>
    </div>
  );

  const renderDeckResourcePanel = (deck) => {
    const card = (deck.cards || []).find(
      (item) => !item.dueDate || item.dueDate <= Date.now(),
    ) || deck.cards?.[0];

    if (!card) {
      return (
        <EmptyPanel
          icon="style"
          title="Sem cartoes"
          text="Este baralho ainda nao possui flashcards."
        />
      );
    }

    const isRevealed = Boolean(revealedDeckCards[card.id]);
    return (
      <button
        className="flex h-full w-full flex-col justify-between rounded-[20px] border border-[color:var(--primary)]/25 bg-[color:var(--background)]/70 p-5 text-left transition-transform hover:scale-[1.01]"
        type="button"
        onClick={() =>
          setRevealedDeckCards((current) => ({
            ...current,
            [card.id]: !current[card.id],
          }))
        }
      >
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[color:var(--primary)]">
            {isRevealed ? "Resposta" : "Pergunta"}
          </p>
          <p className="mt-5 text-xl font-bold leading-relaxed text-[color:var(--on-surface)]">
            {isRevealed ? card.back || "Sem verso" : card.front || "Sem frente"}
          </p>
        </div>
        <div className="mt-6 flex items-center gap-2 text-xs font-bold text-[color:var(--primary)]">
          <Icon name={isRevealed ? "visibility_off" : "visibility"} />
          {isRevealed ? "Clique para ver a pergunta" : "Clique para mostrar a resposta"}
        </div>
      </button>
    );
  };

  const renderNoteResourcePanel = (note) => (
    <div className="flex h-full flex-col gap-3">
      <input
        className="rounded-xl border border-[color:var(--outline-variant)]/28 bg-[color:var(--background)] px-3 py-2 text-sm font-bold text-[color:var(--on-surface)] outline-none focus:border-[color:var(--primary)]"
        value={note.title || ""}
        onChange={(event) => updateNote(note.id, { title: event.target.value })}
        placeholder="Titulo da nota"
      />
      <textarea
        className="min-h-0 flex-1 resize-none rounded-xl border border-[color:var(--outline-variant)]/28 bg-[color:var(--background)] p-3 text-sm leading-7 text-[color:var(--on-surface)] outline-none focus:border-[color:var(--primary)]"
        value={note.content || ""}
        onChange={(event) => updateNote(note.id, { content: event.target.value })}
        placeholder="Escreva sua nota..."
      />
    </div>
  );

  const panelContentById = {
    video: videoPanelNode,
    notes: renderNotesPanel(),
    pdf: renderPdfPanel(),
    audio: audioPanelNode,
    flashcards: renderFlashcardsPanel(),
    tasks: renderTasksPanel(),
    drawing: renderDrawingPanel(),
    resources: renderResourcesPanel(),
  };
  const videoPanel = panels.video;
  const videoPanelZIndex = zOrder.findIndex((panelId) => panelId === "video") + 1;
  const minimizedPanels = Object.values(panels).filter(
    (panel) => !panel.visible && panel.isMinimized,
  );
  const lessonSidebarItems = [
    ...(activeLesson?.filePath
      ? [
          {
            id: "sidebar-primary-video",
            type: "video",
            title: "Video da aula",
            subtitle: activeLesson.filePath,
            icon: "movie",
            onClick: () => togglePanel("video"),
          },
        ]
      : []),
    ...(activeLesson?.youtubeUrl
      ? [
          {
            id: "sidebar-youtube",
            type: "youtube",
            title: "Link do YouTube",
            subtitle: activeLesson.youtubeUrl,
            icon: "smart_display",
            onClick: () => togglePanel("video"),
          },
        ]
      : []),
    ...(activeLesson?.audioPath
      ? [
          {
            id: "sidebar-primary-audio",
            type: "audio",
            title: "Audio da aula",
            subtitle: activeLesson.audioPath,
            icon: "headphones",
            onClick: () => togglePanel("audio"),
          },
        ]
      : []),
    ...pdfResources.map((resource) => ({
      id: `sidebar-${resource.id}`,
      panelId: getPdfPanelId(resource.id),
      type: "pdf",
      kind: resource.id === "primary-pdf" ? "primary" : "extra",
      title: resource.title,
      subtitle: "PDF da aula",
      icon: "picture_as_pdf",
      onClick: () => openPdfCard(resource),
    })),
    ...relatedNotes.map((note) => ({
      id: `sidebar-note-${note.id}`,
      panelId: `note-${note.id}`,
      type: "note",
      title: note.title || "Nota",
      subtitle: note.time || "Nota da aula",
      icon: "edit_note",
      onClick: () => openNoteCard(note),
    })),
    ...relatedDecks.map((deck) => ({
      id: `sidebar-deck-${deck.id}`,
      panelId: `${DECK_PANEL_PREFIX}${deck.id}`,
      type: "deck",
      title: deck.title || "Flashcards",
      subtitle: `${deck.cards?.length || 0} cartoes`,
      icon: "style",
      onClick: () => openDeckCard(deck),
    })),
    ...relatedTasks.map((task) => ({
      id: `sidebar-task-${task.id}`,
      panelId: `${TASK_PANEL_PREFIX}${task.id}`,
      type: "task",
      title: task.title || "Tarefa",
      subtitle: task.status || "pending",
      icon: "task_alt",
      onClick: () => openTaskCard(task),
    })),
    ...(activeLesson?.extraMedia || [])
      .filter((media) => media.type !== "pdf")
      .map((media) => ({
        id: `sidebar-extra-${media.id}`,
        panelId: `extra-${media.id}`,
        type: "media",
        title: media.title || "Arquivo extra",
        subtitle:
          media.type === "audio"
            ? "Audio extra"
            : media.type === "local_file"
              ? "Arquivo extra"
              : "Video extra",
        icon:
          media.type === "audio"
            ? "headphones"
            : media.type === "local_file"
              ? "draft"
              : "movie",
        onClick: () => {},
      })),
  ];

  return (
    <div className="screen-fade-in flex h-full w-full flex-1 overflow-hidden bg-[color:var(--background)]">
      <main
        className={`flex min-w-0 flex-1 flex-col overflow-hidden ${
          isCanvasFullscreen ? "px-0 py-0" : "px-6 py-6 md:px-8"
        }`}
      >
        <section
          ref={workspaceRef}
          className={`relative min-h-0 flex-1 overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(239,242,248,0.96))] shadow-[0_20px_60px_rgba(17,17,23,0.08)] dark:bg-[linear-gradient(180deg,var(--surface-bright),var(--surface-lowest))] ${
            isCanvasFullscreen
              ? "rounded-none border-0"
              : "rounded-[32px] border border-[color:var(--outline-variant)]/30"
          }`}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,0.08),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.07),transparent_28%)]" />

          <canvas
            ref={canvasRef}
            className="absolute inset-0 z-0 h-full w-full touch-none"
            onPointerDown={startBoardInteraction}
            onPointerMove={moveBoardInteraction}
            onPointerUp={stopBoardInteraction}
            onPointerCancel={stopBoardInteraction}
            onWheel={handleBoardWheel}
          />

          <div className="absolute left-4 top-4 z-[999] flex items-center gap-2 rounded-full border border-[color:var(--outline-variant)]/35 bg-[color:var(--surface)]/90 px-2 py-1.5 shadow-[0_8px_24px_rgba(17,17,23,0.12)] backdrop-blur-sm">
            {[
              { id: "pen", icon: "edit", title: "Desenhar" },
              { id: "eraser", icon: "ink_eraser", title: "Apagar" },
              { id: "pan", icon: "back_hand", title: "Mover quadro" },
            ].map((tool) => (
              <button
                key={tool.id}
                className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                  drawingTool === tool.id
                    ? "bg-[color:var(--primary)] text-white"
                    : "text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-bright)] hover:text-[color:var(--on-surface)]"
                }`}
                type="button"
                title={tool.title}
                onClick={() => setDrawingTool(tool.id)}
              >
                <Icon name={tool.icon} className="text-[17px]" />
              </button>
            ))}
            <div className="mx-1 h-5 w-px bg-[color:var(--outline-variant)]/60" />
            {["#a78bfa", "#f472b6", "#34d399", "#fbbf24", "#ffffff"].map(
              (color) => (
                <button
                  key={color}
                  className={`h-6 w-6 rounded-full border transition-transform hover:scale-110 ${
                    drawingColor === color && drawingTool === "pen"
                      ? "scale-110 border-white ring-2 ring-[color:var(--primary)]"
                      : "border-white/40"
                  }`}
                  style={{ backgroundColor: color }}
                  type="button"
                  title="Cor"
                  onClick={() => {
                    setDrawingColor(color);
                    setDrawingTool("pen");
                  }}
                />
              ),
            )}
            <input
              className="w-20 accent-[color:var(--primary)]"
              type="range"
              min="1"
              max="18"
              value={drawingWidth}
              title="Espessura"
              onChange={(event) =>
                setDrawingWidth(Number.parseInt(event.target.value, 10))
              }
            />
            <div className="mx-1 h-5 w-px bg-[color:var(--outline-variant)]/60" />
            <button
              className="flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--on-surface-variant)] transition-colors hover:bg-[color:var(--surface-bright)] hover:text-[color:var(--on-surface)]"
              type="button"
              title="Diminuir zoom"
              onClick={() => adjustBoardZoom(-1)}
            >
              <Icon name="remove" className="text-[17px]" />
            </button>
            <span className="w-14 text-center text-xs font-bold text-[color:var(--on-surface)]">
              {Math.round(boardViewport.scale * 100)}%
            </span>
            <button
              className="flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--on-surface-variant)] transition-colors hover:bg-[color:var(--surface-bright)] hover:text-[color:var(--on-surface)]"
              type="button"
              title="Aumentar zoom"
              onClick={() => adjustBoardZoom(1)}
            >
              <Icon name="add" className="text-[17px]" />
            </button>
            <button
              className="flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--on-surface-variant)] transition-colors hover:bg-[color:var(--surface-bright)] hover:text-[color:var(--on-surface)]"
              type="button"
              title={
                isCanvasFullscreen
                  ? "Sair da tela cheia do quadro"
                  : "Tela cheia do quadro"
              }
              onClick={() => setIsCanvasFullscreen((value) => !value)}
            >
              <Icon
                name={isCanvasFullscreen ? "fullscreen_exit" : "fullscreen"}
                className="text-[17px]"
              />
            </button>
            <button
              className="flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--on-surface-variant)] transition-colors hover:bg-[color:var(--surface-bright)] hover:text-[color:var(--on-surface)]"
              type="button"
              title={`Desfazer desenho (${shortcutLabel("Mod+Z")})`}
              onClick={undoBoard}
            >
              <Icon name="undo" className="text-[17px]" />
            </button>
            <button
              className="flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--on-surface-variant)] transition-colors hover:bg-[color:var(--error)] hover:text-white"
              type="button"
              title="Limpar quadro"
              onClick={clearBoard}
            >
              <Icon name="delete" className="text-[17px]" />
            </button>
          </div>

          <div className="absolute right-4 top-4 z-[999] flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-[color:var(--outline-variant)]/35 bg-[color:var(--surface)]/90 px-2 py-1.5 shadow-[0_8px_24px_rgba(17,17,23,0.12)] backdrop-blur-sm">
              <button
                className="flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--on-surface-variant)] transition-colors hover:bg-[color:var(--surface-bright)] hover:text-[color:var(--on-surface)]"
                type="button"
                title="Adicionar nota"
                onClick={() => togglePanel("notes")}
              >
                <Icon name="edit_note" className="text-[18px]" />
              </button>
              <button
                className="flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--on-surface-variant)] transition-colors hover:bg-[color:var(--surface-bright)] hover:text-[color:var(--on-surface)]"
                type="button"
                title="Abrir flashcards da aula"
                onClick={() => togglePanel("flashcards")}
              >
                <Icon name="style" className="text-[18px]" />
              </button>
              <button
                className="flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--on-surface-variant)] transition-colors hover:bg-[color:var(--surface-bright)] hover:text-[color:var(--on-surface)]"
                type="button"
                title="Abrir tarefas da aula"
                onClick={() => togglePanel("tasks")}
              >
                <Icon name="task_alt" className="text-[18px]" />
              </button>
              <button
                className="flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--on-surface-variant)] transition-colors hover:bg-[color:var(--surface-bright)] hover:text-[color:var(--on-surface)]"
                type="button"
                title="Adicionar PDF"
                onClick={() => attachLessonFile("pdf")}
              >
                <Icon name="picture_as_pdf" className="text-[18px]" />
              </button>
            </div>
            <button
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--outline-variant)]/35 bg-[color:var(--surface)]/90 text-[color:var(--on-surface-variant)] shadow-[0_8px_24px_rgba(17,17,23,0.12)] backdrop-blur-sm transition-colors hover:bg-[color:var(--error)] hover:text-white"
              type="button"
              title="Sair da imersao"
              onClick={exitImmersion}
            >
              <Icon name="close" className="text-[20px]" />
            </button>
          </div>

          {isLessonSidebarCollapsed ? (
              <button
                className="absolute bottom-6 right-4 z-[998] flex items-center gap-3 rounded-full border border-[color:var(--outline-variant)]/30 bg-[color:var(--surface)]/92 px-4 py-3 text-left shadow-[0_18px_48px_rgba(17,17,23,0.14)] backdrop-blur-sm transition-colors hover:border-[color:var(--primary)]/35"
                type="button"
                title="Expandir recursos da aula"
                onClick={() => setIsLessonSidebarCollapsed(false)}
              >
                <Icon
                  name="right_panel_open"
                  className="text-[18px] text-[color:var(--primary)]"
                />
                <span className="text-sm font-semibold text-[color:var(--on-surface)]">
                  Recursos da aula
                </span>
              </button>
            ) : (
            <aside className="absolute bottom-6 right-4 z-[998] flex max-h-[58vh] w-[250px] flex-col overflow-hidden rounded-[24px] border border-[color:var(--outline-variant)]/30 bg-[color:var(--surface)]/92 shadow-[0_18px_48px_rgba(17,17,23,0.14)] backdrop-blur-sm">
              <div className="flex items-start justify-between gap-3 border-b border-[color:var(--outline-variant)]/18 px-4 py-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[color:var(--primary)]">
                    Recursos da aula
                  </p>
                </div>
                <button
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[color:var(--on-surface-variant)] transition-colors hover:bg-[color:var(--surface-bright)] hover:text-[color:var(--on-surface)]"
                  type="button"
                  title="Minimizar recursos da aula"
                  onClick={() => setIsLessonSidebarCollapsed(true)}
                >
                  <Icon name="right_panel_close" className="text-[18px]" />
                </button>
              </div>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3 custom-scrollbar">
                <div>
                  <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[color:var(--on-surface-variant)]">
                    Cards minimizados
                  </p>
                  <div className="space-y-2">
                    {minimizedPanels.length > 0 ? (
                      minimizedPanels.map((panel) => (
                        <button
                          key={`min-${panel.id}`}
                          className="flex w-full items-center gap-3 rounded-2xl border border-[color:var(--outline-variant)]/20 bg-[color:var(--background)]/70 px-3 py-2 text-left transition-colors hover:border-[color:var(--primary)]/35"
                          type="button"
                          onClick={() => togglePanel(panel.id)}
                        >
                          <Icon
                            name={panel.icon}
                            className="text-[18px] text-[color:var(--primary)]"
                          />
                          <span className="truncate text-sm font-semibold text-[color:var(--on-surface)]">
                            {panel.label}
                          </span>
                        </button>
                      ))
                    ) : (
                      <p className="px-1 text-xs text-[color:var(--on-surface-variant)]">
                        Nenhum card minimizado.
                      </p>
                    )}
                  </div>
                </div>
                <div>
                  <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[color:var(--on-surface-variant)]">
                    Itens da aula
                  </p>
                  <div className="space-y-2">
                    {lessonSidebarItems.length > 0 ? (
                      lessonSidebarItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex w-full items-start gap-3 rounded-2xl border border-[color:var(--outline-variant)]/20 bg-[color:var(--background)]/70 px-3 py-2 text-left transition-colors hover:border-[color:var(--primary)]/35"
                        >
                          <button
                            className="flex min-w-0 flex-1 items-start gap-3 text-left"
                            type="button"
                            onClick={item.onClick}
                          >
                            <Icon
                              name={item.icon}
                              className="mt-0.5 text-[18px] text-[color:var(--primary)]"
                            />
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-[color:var(--on-surface)]">
                                {item.title}
                              </span>
                              <span className="block truncate text-xs text-[color:var(--on-surface-variant)]">
                                {item.subtitle}
                              </span>
                            </span>
                          </button>
                          <button
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[color:var(--on-surface-variant)] transition-colors hover:bg-[color:var(--error)] hover:text-white"
                            type="button"
                            title="Excluir item"
                            onClick={() => removeLessonItem(item)}
                          >
                            <Icon name="close" className="text-[18px]" />
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="px-1 text-xs text-[color:var(--on-surface-variant)]">
                        Nada vinculado ainda.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </aside>
            )
          }

          {videoPanel?.visible ? (
            <article
              className="absolute overflow-hidden rounded-[26px] border border-[color:var(--outline-variant)]/28 bg-[color:var(--surface)]/95 shadow-[0_18px_48px_rgba(17,17,23,0.08)] backdrop-blur-sm"
              style={{
                left: boardViewport.x + videoPanel.x * boardViewport.scale,
                top: boardViewport.y + videoPanel.y * boardViewport.scale,
                width: videoPanel.w * boardViewport.scale,
                height: videoPanel.h * boardViewport.scale,
                zIndex: Math.max(1, videoPanelZIndex),
              }}
              onMouseDown={() => bringPanelToFront("video")}
            >
              <header
                className="flex cursor-grab items-center justify-between border-b border-[color:var(--outline-variant)]/18 px-4 py-3 active:cursor-grabbing"
                onPointerDown={(event) => startDragging(event, "video")}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[color:var(--primary)]/10 text-[color:var(--primary)]">
                    <Icon className="text-[18px]" name={videoPanel.icon} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[color:var(--on-surface)]">
                      {videoPanel.label}
                    </p>
                    <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                      Arraste para organizar
                    </p>
                  </div>
                </div>
                <button
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--on-surface-variant)] transition-colors hover:bg-[color:var(--surface-bright)] hover:text-[color:var(--on-surface)]"
                  type="button"
                  title="Minimizar card"
                  onClick={() => minimizePanel("video")}
                >
                  <Icon name="remove" className="text-[18px]" />
                </button>
              </header>
              <div className="h-[calc(100%-65px)] overflow-hidden p-4">
                {panelContentById.video}
              </div>
              {PANEL_RESIZE_HANDLES.map((handle) => (
                <div
                  key={`video-${handle.corner}`}
                  className={`${handle.className} flex h-5 w-5 items-center justify-center p-0.5 text-[color:var(--outline)]`}
                  onPointerDown={(event) =>
                    startResizing(event, "video", handle.corner)
                  }
                  title="Redimensionar"
                >
                  <Icon
                    name="open_in_full"
                    className={`pointer-events-none text-[14px] ${handle.iconClassName}`}
                  />
                </div>
              ))}
            </article>
          ) : null}

          <div className="pointer-events-none absolute inset-0 z-[997] overflow-hidden">
            <div
              className="absolute left-0 top-0 will-change-transform"
              style={{
                transform: `translate(${boardViewport.x}px, ${boardViewport.y}px) scale(${boardViewport.scale})`,
                transformOrigin: "top left",
              }}
            >
              {zOrder.map((panelId, index) => {
            if (panelId === "video") return null;
            const panel = panels[panelId];
            if (!panel.visible) return null;

            const isNoteCard = panelId.startsWith("note-");
            const isPdfCard = panelId.startsWith(PDF_PANEL_PREFIX);
            const isTaskCard = panelId.startsWith(TASK_PANEL_PREFIX);
            const isDeckCard = panelId.startsWith(DECK_PANEL_PREFIX);
            const note = isNoteCard
              ? relatedNotes.find((item) => item.id === panel.noteId)
              : null;
            const task = isTaskCard
              ? relatedTasks.find((item) => item.id === panel.taskId)
              : null;
            const deck = isDeckCard
              ? relatedDecks.find((item) => item.id === panel.deckId)
              : null;

              return (
              <article
                key={panelId}
                className="pointer-events-auto absolute overflow-hidden rounded-[26px] border border-[color:var(--outline-variant)]/28 bg-[color:var(--surface)]/95 shadow-[0_18px_48px_rgba(17,17,23,0.08)] backdrop-blur-sm"
                style={{
                  left: panel.x,
                  top: panel.y,
                  width: panel.w,
                  height: panel.h,
                  zIndex: index + 1,
                }}
                onMouseDown={() => bringPanelToFront(panelId)}
              >
                <header
                  className="flex cursor-grab items-center justify-between border-b border-[color:var(--outline-variant)]/18 px-4 py-3 active:cursor-grabbing"
                  onPointerDown={(event) => startDragging(event, panelId)}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[color:var(--primary)]/10 text-[color:var(--primary)]">
                      <Icon className="text-[18px]" name={panel.icon} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[color:var(--on-surface)]">
                        {isNoteCard ? note?.title || "Nota" : panel.label}
                      </p>
                      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                        Arraste para organizar
                      </p>
                    </div>
                  </div>
                  <button
                    className="flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--on-surface-variant)] transition-colors hover:bg-[color:var(--surface-bright)] hover:text-[color:var(--on-surface)]"
                    type="button"
                    title="Minimizar card"
                    onClick={() => minimizePanel(panelId)}
                  >
                    <Icon name="remove" className="text-[18px]" />
                  </button>
                  <button
                    className="flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--on-surface-variant)] transition-colors hover:bg-[color:var(--error)] hover:text-white"
                    type="button"
                    title="Fechar card"
                    onClick={() => closePanel(panelId)}
                  >
                    <Icon name="close" className="text-[18px]" />
                  </button>
                </header>
                <div className="h-[calc(100%-65px)] overflow-auto p-4 custom-scrollbar">
                  {isNoteCard ? (
                    note ? (
                      renderNoteResourcePanel(note)
                    ) : (
                      <EmptyPanel
                        icon="edit_note"
                        title="Nota indisponível"
                        text="Esta nota pode ter sido removida."
                      />
                    )
                  ) : (
                    isPdfCard ? (
                      renderPdfResourcePanel(panel)
                    ) : isTaskCard ? (
                      task ? (
                        renderTaskResourcePanel(task)
                      ) : (
                        <EmptyPanel
                          icon="task_alt"
                          title="Tarefa indisponivel"
                          text="Esta tarefa pode ter sido removida."
                        />
                      )
                    ) : isDeckCard ? (
                      deck ? (
                        renderDeckResourcePanel(deck)
                      ) : (
                        <EmptyPanel
                          icon="style"
                          title="Baralho indisponivel"
                          text="Este baralho pode ter sido removido."
                        />
                      )
                    ) : (
                      panelContentById[panelId]
                    )
                  )}
                </div>
                {PANEL_RESIZE_HANDLES.map((handle) => (
                  <div
                    key={handle.corner}
                    className={`${handle.className} flex h-5 w-5 items-center justify-center p-0.5 text-[color:var(--outline)]`}
                    onPointerDown={(event) =>
                      startResizing(event, panelId, handle.corner)
                    }
                    title="Redimensionar"
                  >
                    <Icon
                      name="open_in_full"
                      className={`pointer-events-none text-[14px] ${handle.iconClassName}`}
                    />
                  </div>
                ))}
              </article>
            );
            })}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
