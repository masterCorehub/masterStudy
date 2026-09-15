import { useEffect, useRef, useState, useCallback } from "react";
import { Icon } from "../ui/Icon";
import { SCREEN_IDS } from "../app/screenIds";
import { normalizeAcademicData } from "../domain/academic";
import { useStudyStore } from "../store/useStore";
import { motion } from "framer-motion";
import { isMacPlatform, isPrimaryShortcut, shortcutLabel } from "../utils/keyboardShortcuts";

const GRID_SPACING = 28;

export function WhiteboardScreen({ onNavigate, onClose }) {
  const searchParams =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : null;
  const isQuickDrawWindow = searchParams?.get("mode") === "quick-draw";
  const isLibraryDrawingMode = searchParams?.get("mode") === "library-drawing";
  const drawingNoteId = searchParams?.get("noteId");
  const routeCourseId = searchParams?.get("courseId");
  const routeModuleId = searchParams?.get("moduleId");
  const routeLessonId = searchParams?.get("lessonId");
  const isDarkModeStore = useStudyStore((state) => state.isDarkMode);
  const themePreference = useStudyStore((state) => state.themePreference || "system");
  const [systemDark, setSystemDark] = useState(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e) => setSystemDark(e.matches);
    media.addEventListener?.("change", handler);
    return () => media.removeEventListener?.("change", handler);
  }, []);

  const isDarkMode =
    themePreference === "system"
      ? (systemDark || (typeof document !== "undefined" && document.documentElement.classList.contains("dark")))
      : isDarkModeStore;

  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const containerRef = useRef(null);

  const [tool, setTool] = useState("pen"); // 'pen' | 'eraser' | 'pan'
  const [color, setColor] = useState("base");
  const [lineWidth, setLineWidth] = useState(3);
  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePanning, setIsSpacePanning] = useState(false);
  const [drawingTitle, setDrawingTitle] = useState("");
  const [drawingTags, setDrawingTags] = useState("");
  const [drawingAcademicSubjectId, setDrawingAcademicSubjectId] = useState("");

  const activeColor =
    color === "base" ? (isDarkMode ? "#ffffff" : "#000000") : color;

  const activeCourseId = useStudyStore((state) => state.activeCourseId);
  const activeModuleId = useStudyStore((state) => state.activeModuleId);
  const activeLessonId = useStudyStore((state) => state.activeLessonId);
  const activeAcademicSubjectId = useStudyStore(
    (state) => state.activeAcademicSubjectId,
  );
  const academicState = useStudyStore((state) => state.academic);
  const targetCourseId = routeCourseId || activeCourseId;
  const targetModuleId = routeModuleId || activeModuleId;
  const targetLessonId = routeLessonId || activeLessonId;
  const courses = useStudyStore((state) => state.courses);
  const addNote = useStudyStore((state) => state.addNote);
  const updateNote = useStudyStore((state) => state.updateNote);
  const deleteNote = useStudyStore((state) => state.deleteNote);
  const setActiveNote = useStudyStore((state) => state.setActiveNote);
  const saveLessonDrawing = useStudyStore((state) => state.saveLessonDrawing);
  const notesList = useStudyStore((state) => state.notes.list);

  const activeCourse = courses.find((c) => c.id === targetCourseId);
  const activeModule = activeCourse?.modules?.find(
    (m) => m.id === targetModuleId,
  );
  const activeLesson = (activeModule?.lessons || activeCourse?.lessons || []).find(
    (l) => l.id === targetLessonId,
  );
  const drawingNote = notesList.find((note) => note.id === drawingNoteId);
  const academic = normalizeAcademicData(academicState);
  const visibleSubjects = academic.subjects.filter((subject) => !subject.isArchived);
  const activeDrawingSubject =
    visibleSubjects.find((subject) => subject.id === drawingAcademicSubjectId) ||
    null;

  useEffect(() => {
    if (drawingNote) {
      setDrawingTitle(drawingNote.title || "");
      setDrawingTags((drawingNote.tags || []).join(", "));
      setDrawingAcademicSubjectId(
        drawingNote.academicSubjectId || drawingNote.subjectId || "",
      );
    } else if (activeLesson?.title && !drawingTitle) {
      setDrawingTitle(`Desenho de ${activeLesson.title}`);
      setDrawingAcademicSubjectId(activeAcademicSubjectId || "");
    } else if (!drawingNote) {
      setDrawingAcademicSubjectId(activeAcademicSubjectId || "");
    }
  }, [
    drawingNoteId,
    drawingNote?.title,
    drawingNote?.tags,
    drawingNote?.academicSubjectId,
    drawingNote?.subjectId,
    activeLesson?.title,
    activeAcademicSubjectId,
  ]);

  // World-space state (kept outside React state for performance; canvas is the source of truth visually)
  const elementsRef = useRef([]); // { points: [{x,y}], color, width, composite }
  const historyRef = useRef([]);
  const redoStackRef = useRef([]);
  const currentElementRef = useRef(null);
  const panRef = useRef({ x: 0, y: 0 });
  const isDrawingRef = useRef(false);
  const isPanningRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const sizeRef = useRef({ width: 0, height: 0 });
  const backgroundImageRef = useRef(null);
  const backgroundDataUrlRef = useRef(null);
  const backgroundSizeRef = useRef({ width: 0, height: 0 });
  const patternCacheRef = useRef({ isDark: null, canvas: null });
  const toolRef = useRef(tool);
  const colorRef = useRef(activeColor);
  const lineWidthRef = useRef(lineWidth);
  const spacePanningRef = useRef(false);
  const isInitialized = useRef(false);
  const quickDrawingNoteIdRef = useRef(null);

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);
  useEffect(() => {
    colorRef.current = activeColor;
  }, [activeColor]);
  useEffect(() => {
    lineWidthRef.current = lineWidth;
  }, [lineWidth]);
  useEffect(() => {
    spacePanningRef.current = isSpacePanning;
  }, [isSpacePanning]);

  const getDotPattern = useCallback(() => {
    const ctx = contextRef.current;
    if (!ctx) return null;
    if (
      patternCacheRef.current.isDark === isDarkMode &&
      patternCacheRef.current.pattern
    ) {
      return patternCacheRef.current.pattern;
    }
    const tile = document.createElement("canvas");
    tile.width = GRID_SPACING;
    tile.height = GRID_SPACING;
    const tctx = tile.getContext("2d");
    tctx.fillStyle = isDarkMode ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.10)";
    tctx.beginPath();
    tctx.arc(GRID_SPACING / 2, GRID_SPACING / 2, 1.4, 0, Math.PI * 2);
    tctx.fill();
    const pattern = ctx.createPattern(tile, "repeat");
    patternCacheRef.current = { isDark: isDarkMode, pattern };
    return pattern;
  }, [isDarkMode]);

  const drawElement = (ctx, el) => {
    if (!el || el.points.length < 1) return;
    ctx.save();
    ctx.globalCompositeOperation = el.composite;
    ctx.strokeStyle = el.color;
    ctx.lineWidth = el.width;
    ctx.beginPath();
    ctx.moveTo(el.points[0].x, el.points[0].y);
    for (let i = 1; i < el.points.length; i += 1) {
      ctx.lineTo(el.points[i].x, el.points[i].y);
    }
    if (el.points.length === 1) {
      // Render a dot for single-point taps
      ctx.lineTo(el.points[0].x + 0.01, el.points[0].y + 0.01);
    }
    ctx.stroke();
    ctx.restore();
  };

  const redraw = useCallback(() => {
    const ctx = contextRef.current;
    if (!ctx) return;
    const { width, height } = sizeRef.current;
    ctx.clearRect(0, 0, width, height);

    const pattern = getDotPattern();
    if (pattern) {
      const offsetX =
        ((panRef.current.x % GRID_SPACING) + GRID_SPACING) % GRID_SPACING;
      const offsetY =
        ((panRef.current.y % GRID_SPACING) + GRID_SPACING) % GRID_SPACING;
      ctx.save();
      ctx.translate(offsetX, offsetY);
      ctx.fillStyle = pattern;
      ctx.fillRect(
        -offsetX,
        -offsetY,
        width + GRID_SPACING,
        height + GRID_SPACING,
      );
      ctx.restore();
    }

    ctx.save();
    ctx.translate(panRef.current.x, panRef.current.y);

    if (backgroundImageRef.current) {
      ctx.drawImage(
        backgroundImageRef.current,
        0,
        0,
        backgroundSizeRef.current.width,
        backgroundSizeRef.current.height,
      );
    }

    elementsRef.current.forEach((el) => drawElement(ctx, el));

    ctx.restore();
  }, [getDotPattern]);

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const parent = containerRef.current;
    if (!canvas || !parent) return;

    const dpr = 2;
    const width = parent.clientWidth;
    const height = parent.clientHeight;
    sizeRef.current = { width, height };

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const context = canvas.getContext("2d");
    context.scale(dpr, dpr);
    context.lineCap = "round";
    context.lineJoin = "round";
    contextRef.current = context;

    redraw();
  }, [redraw]);

  useEffect(() => {
    if (isInitialized.current) return undefined;
    let cancelled = false;

    const findLesson = (courseList = []) =>
      courseList
        .find((course) => course.id === targetCourseId)
        ?.modules?.find((module) => module.id === targetModuleId)
        ?.lessons?.find((lesson) => lesson.id === targetLessonId);

    const initialize = async () => {
      let sourceLesson = activeLesson;

      if (!isQuickDrawWindow && !isLibraryDrawingMode && targetLessonId) {
        try {
          const snapshot = await window.studyhubDesktop?.studyDatabase?.load?.();
          const databaseLesson = findLesson(snapshot?.state?.courses || []);
          const currentStoreLesson = findLesson(useStudyStore.getState().courses);
          sourceLesson = currentStoreLesson?.drawing
            ? currentStoreLesson
            : databaseLesson || currentStoreLesson || sourceLesson;
        } catch {
          sourceLesson = findLesson(useStudyStore.getState().courses) || sourceLesson;
        }
      }

      if (cancelled) return;
      isInitialized.current = true;
      setupCanvas();

      const savedScene = isLibraryDrawingMode
        ? drawingNote?.reference?.drawingScene
        : sourceLesson?.drawingScene;

      if (savedScene?.elements?.length) {
        elementsRef.current = savedScene.elements.map((element) => ({
          ...element,
          points: (element.points || []).map((point) => ({ ...point })),
        }));
      }

      const sourceImage = savedScene
        ? savedScene.baseImage || null
        : isLibraryDrawingMode
          ? drawingNote?.reference?.image || null
          : !isQuickDrawWindow
            ? sourceLesson?.drawing || null
            : null;

      backgroundDataUrlRef.current = sourceImage;
      if (!sourceImage) {
        redraw();
        return;
      }

      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        backgroundImageRef.current = img;
        backgroundSizeRef.current = savedScene?.backgroundSize || {
          width: sizeRef.current.width,
          height: sizeRef.current.height,
        };
        redraw();
      };
      img.src = sourceImage;
    };

    initialize();
    return () => {
      cancelled = true;
    };
  }, [
    activeLesson,
    drawingNote,
    isLibraryDrawingMode,
    isQuickDrawWindow,
    redraw,
    setupCanvas,
    targetCourseId,
    targetLessonId,
    targetModuleId,
  ]);

  const pushToHistory = useCallback(() => {
    historyRef.current.push(
      elementsRef.current.map((el) => ({
        ...el,
        points: el.points.map((p) => ({ ...p })),
      })),
    );
    if (historyRef.current.length > 50) {
      historyRef.current.shift();
    }
    redoStackRef.current = [];
  }, []);

  const undo = useCallback(() => {
    if (historyRef.current.length > 0) {
      redoStackRef.current.push(
        elementsRef.current.map((el) => ({
          ...el,
          points: el.points.map((p) => ({ ...p })),
        })),
      );
      elementsRef.current = historyRef.current.pop();
      redraw();
    }
  }, [redraw]);

  const redo = useCallback(() => {
    if (redoStackRef.current.length > 0) {
      historyRef.current.push(
        elementsRef.current.map((el) => ({
          ...el,
          points: el.points.map((p) => ({ ...p })),
        })),
      );
      elementsRef.current = redoStackRef.current.pop();
      redraw();
    }
  }, [redraw]);

  useEffect(() => {
    const handleResize = () => {
      setupCanvas();
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [setupCanvas]);

  useEffect(() => {
    redraw();
  }, [isDarkMode, redraw]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.code === "Space" && !event.repeat) {
        setIsSpacePanning(true);
        spacePanningRef.current = true;
      }
      if (isPrimaryShortcut(event) && !event.shiftKey && event.key.toLowerCase() === "z") {
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        event.preventDefault();
      }
      if (isPrimaryShortcut(event) && (event.key.toLowerCase() === "y" || (isMacPlatform() && event.shiftKey && event.key.toLowerCase() === "z"))) {
        redo();
        event.preventDefault();
      }
    };
    const handleKeyUp = (event) => {
      if (event.code === "Space") {
        setIsSpacePanning(false);
        spacePanningRef.current = false;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [undo, redo]);

  const computeBounds = () => {
    let minX = 0;
    let minY = 0;
    let maxX = backgroundSizeRef.current.width || 0;
    let maxY = backgroundSizeRef.current.height || 0;
    let hasContent =
      backgroundSizeRef.current.width > 0 ||
      backgroundSizeRef.current.height > 0;

    elementsRef.current.forEach((el) => {
      el.points.forEach((p) => {
        if (!hasContent) {
          minX = p.x;
          maxX = p.x;
          minY = p.y;
          maxY = p.y;
          hasContent = true;
        }
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      });
    });

    if (!hasContent) {
      return {
        x: 0,
        y: 0,
        width: sizeRef.current.width,
        height: sizeRef.current.height,
      };
    }

    const padding = 40;
    return {
      x: minX - padding,
      y: minY - padding,
      width: Math.max(1, maxX - minX + padding * 2),
      height: Math.max(1, maxY - minY + padding * 2),
    };
  };

  const exportDrawingDataUrl = () => {
    const bounds = computeBounds();
    const scale = 2;
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = Math.max(1, Math.round(bounds.width * scale));
    exportCanvas.height = Math.max(1, Math.round(bounds.height * scale));

    const exportCtx = exportCanvas.getContext("2d");
    exportCtx.scale(scale, scale);
    exportCtx.translate(-bounds.x, -bounds.y);
    exportCtx.lineCap = "round";
    exportCtx.lineJoin = "round";

    if (backgroundImageRef.current) {
      exportCtx.drawImage(
        backgroundImageRef.current,
        0,
        0,
        backgroundSizeRef.current.width,
        backgroundSizeRef.current.height,
      );
    }

    elementsRef.current.forEach((el) => drawElement(exportCtx, el));

    return exportCanvas.toDataURL("image/png");
  };

  const buildDrawingScene = () => ({
    version: 1,
    baseImage: backgroundDataUrlRef.current,
    backgroundSize: { ...backgroundSizeRef.current },
    elements: elementsRef.current.map((element) => ({
      ...element,
      points: element.points.map((point) => ({ ...point })),
    })),
  });

  const persistStudyStateNow = async () => {
    try {
      const persisted = JSON.parse(
        window.localStorage.getItem("studyhub-storage-v2") || "null",
      );
      if (persisted?.state) {
        await window.studyhubDesktop?.studyDatabase?.save?.(persisted.state);
      }
    } finally {
      await window.studyhubDesktop?.notifyStudyDataChanged?.();
    }
  };

  const persistQuickDrawingNote = () => {
    const hasContent =
      elementsRef.current.length > 0 ||
      backgroundSizeRef.current.width > 0 ||
      backgroundSizeRef.current.height > 0;

    if (!hasContent) {
      if (quickDrawingNoteIdRef.current) {
        deleteNote(quickDrawingNoteIdRef.current);
        quickDrawingNoteIdRef.current = null;
      }
      return;
    }

    const dataUrl = exportDrawingDataUrl();

    if (!quickDrawingNoteIdRef.current) {
      const now = new Date();
      const noteId = `note-${Date.now()}`;
      quickDrawingNoteIdRef.current = noteId;
      addNote({
        id: noteId,
        title: `Desenho rapido ${now.toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        })}`,
        tags: drawingTags.split(",").map((tag) => tag.trim()).filter(Boolean),
        content: "<p>Desenho rapido salvo.</p>",
        category: "Desenho",
        module: "Desenho rapido",
        accent: "tertiary",
        noteType: "drawing",
        sourceKind: "quick-draw",
        sourceCourseId: null,
        sourceModuleId: null,
        sourceLessonId: null,
        academicSubjectId: activeDrawingSubject?.id || null,
        academicSemesterId: activeDrawingSubject?.semesterId || null,
        reference: {
          image: dataUrl,
          imageCaption: "Desenho rapido",
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return;
    }

    updateNote(quickDrawingNoteIdRef.current, {
      title: drawingTitle || "Desenho rapido",
      tags: drawingTags.split(",").map((tag) => tag.trim()).filter(Boolean),
      category: "Desenho",
      module: "Desenho rapido",
      noteType: "drawing",
      sourceKind: "quick-draw",
      sourceCourseId: null,
      sourceModuleId: null,
      sourceLessonId: null,
      academicSubjectId: activeDrawingSubject?.id || null,
      academicSemesterId: activeDrawingSubject?.semesterId || null,
      reference: {
        image: dataUrl,
        imageCaption: "Desenho rapido",
      },
      content: "<p>Desenho rapido salvo.</p>",
    });
  };

  const saveCurrentDrawing = async () => {
    if (isQuickDrawWindow) {
      persistQuickDrawingNote();
      await persistStudyStateNow();
      return;
    }

    if (isLibraryDrawingMode) {
      const dataUrl = exportDrawingDataUrl();
      const now = Date.now();

      if (drawingNoteId) {
        updateNote(drawingNoteId, {
          title: drawingTitle || drawingNote?.title || "Desenho",
          tags: drawingTags.split(",").map((tag) => tag.trim()).filter(Boolean),
          content: drawingNote?.content || "<p>Desenho salvo na biblioteca.</p>",
          category: "Desenho",
          module: drawingNote?.module || "Biblioteca",
          noteType: "drawing",
          itemType: "drawing",
          sourceKind: drawingNote?.sourceKind || "drawing-note",
          academicSubjectId: activeDrawingSubject?.id || null,
          academicSemesterId: activeDrawingSubject?.semesterId || null,
          reference: {
            ...(drawingNote?.reference || {}),
            image: dataUrl,
            imageCaption: "Desenho salvo",
            drawingScene: buildDrawingScene(),
          },
          updatedAt: now,
        });
      }

      await persistStudyStateNow();

      return;
    }

    if (!(targetCourseId && targetModuleId && targetLessonId)) return;

    const dataUrl = exportDrawingDataUrl();
    saveLessonDrawing(
      targetCourseId,
      targetModuleId,
      targetLessonId,
      dataUrl,
      buildDrawingScene(),
    );
    await persistStudyStateNow();
  };

  const saveQuickDrawingAndStartNew = async () => {
    const hasContent = elementsRef.current.length > 0;
    if (!hasContent) return;

    persistQuickDrawingNote();
    await window.studyhubDesktop?.notifyStudyDataChanged?.();

    // A saved quick sketch is final. Start the next capture with its own note.
    quickDrawingNoteIdRef.current = null;
    elementsRef.current = [];
    currentElementRef.current = null;
    backgroundImageRef.current = null;
    backgroundDataUrlRef.current = null;
    backgroundSizeRef.current = { width: 0, height: 0 };
    panRef.current = { x: 0, y: 0 };
    redraw();
  };

  const saveDrawingAsNote = () => {
    const hasContent =
      elementsRef.current.length > 0 ||
      backgroundSizeRef.current.width > 0 ||
      backgroundSizeRef.current.height > 0;

    if (!hasContent) return;

    const dataUrl = exportDrawingDataUrl();
    const now = Date.now();
    const timestampLabel = new Date(now).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    addNote({
      id: `note-${now}`,
      title: activeLesson?.title
        ? drawingTitle || `Desenho de ${activeLesson.title}`
        : drawingTitle || `Desenho ${timestampLabel}`,
      tags: drawingTags.split(",").map((tag) => tag.trim()).filter(Boolean),
      content: "<p>Desenho salvo a partir da lousa da aula.</p>",
      category: "Desenho",
      module: activeModule?.title || "Aula",
      accent: "tertiary",
      noteType: "drawing",
      itemType: "drawing",
      sourceKind: "lesson-drawing-note",
      sourceCourseId: activeCourseId || null,
      sourceModuleId: activeModuleId || null,
      sourceLessonId: activeLessonId || null,
      sourceLessonTitle: activeLesson?.title || "",
      academicSubjectId: activeDrawingSubject?.id || null,
      academicSemesterId: activeDrawingSubject?.semesterId || null,
      reference: {
        image: dataUrl,
        imageCaption: "Desenho salvo da aula",
      },
      createdAt: now,
      updatedAt: now,
    });
  };

  const getScreenPoint = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const shouldPan = (event) =>
    spacePanningRef.current || toolRef.current === "pan" || event.button === 1;

  const startDrawing = (event) => {
    const canvas = canvasRef.current;
    canvas.setPointerCapture?.(event.pointerId);

    if (shouldPan(event)) {
      event.preventDefault();
      isPanningRef.current = true;
      setIsPanning(true);
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
      return;
    }

    const screenPoint = getScreenPoint(event);
    const worldPoint = {
      x: screenPoint.x - panRef.current.x,
      y: screenPoint.y - panRef.current.y,
    };

    const isEraser = toolRef.current === "eraser";
    const element = {
      points: [worldPoint],
      color: isEraser ? "rgba(0,0,0,1)" : colorRef.current,
      width: isEraser ? lineWidthRef.current * 4 : lineWidthRef.current,
      composite: isEraser ? "destination-out" : "source-over",
    };

    pushToHistory();
    currentElementRef.current = element;
    elementsRef.current.push(element);
    isDrawingRef.current = true;
    redraw();
  };

  const draw = (event) => {
    if (isPanningRef.current) {
      const dx = event.clientX - lastPointerRef.current.x;
      const dy = event.clientY - lastPointerRef.current.y;
      panRef.current = { x: panRef.current.x + dx, y: panRef.current.y + dy };
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
      redraw();
      return;
    }

    if (!isDrawingRef.current || !currentElementRef.current) return;

    const screenPoint = getScreenPoint(event);
    const worldPoint = {
      x: screenPoint.x - panRef.current.x,
      y: screenPoint.y - panRef.current.y,
    };
    currentElementRef.current.points.push(worldPoint);
    redraw();
  };

  const stopDrawing = (event) => {
    const canvas = canvasRef.current;
    if (event?.pointerId !== undefined) {
      canvas.releasePointerCapture?.(event.pointerId);
    }

    if (isPanningRef.current) {
      isPanningRef.current = false;
      setIsPanning(false);
      return;
    }

    if (isDrawingRef.current) {
      isDrawingRef.current = false;
      currentElementRef.current = null;
    }
  };

  const handleWheel = (event) => {
    event.preventDefault();
    panRef.current = {
      x: panRef.current.x - event.deltaX,
      y: panRef.current.y - event.deltaY,
    };
    redraw();
  };

  const clearCanvas = () => {
    pushToHistory();
    elementsRef.current = [];
    backgroundImageRef.current = null;
    backgroundDataUrlRef.current = null;
    backgroundSizeRef.current = { width: 0, height: 0 };
    redraw();
  };

  const resetView = () => {
    panRef.current = { x: 0, y: 0 };
    redraw();
  };


  const handleBack = () => {
    if (isLibraryDrawingMode) {
      if (drawingNoteId) {
        setActiveNote(drawingNoteId);
      }
      if (onNavigate) {
        onNavigate(SCREEN_IDS.NOTES);
        return;
      }
    }
    if (
      typeof window !== "undefined" &&
      window.location.search.includes("screen=whiteboard")
    ) {
      window.close();
    } else if (onClose) {
      onClose();
    } else if (onNavigate) {
      onNavigate(SCREEN_IDS.LESSON);
    }
  };

  const colors = [
    "base",
    "#a78bfa",
    "#ec4899",
    "#10b981",
    "#f59e0b",
    "#ef4444",
  ];

  const cursorClass =
    isPanning || isSpacePanning
      ? "cursor-grabbing"
      : tool === "pan"
        ? "cursor-grab"
        : tool === "eraser"
          ? "cursor-cell"
          : "cursor-crosshair";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 flex flex-col h-full bg-[color:var(--surface)] overflow-hidden font-body screen-fade-in relative z-50"
    >
      {/* Top Action Bar */}
      <header
        className="h-20 px-3 sm:px-8 flex items-center gap-3 w-full z-20 shrink-0 bg-[color:var(--background)] shadow-sm overflow-hidden"
        style={{ WebkitAppRegion: "drag" }}
      >
        <div className="flex items-center gap-4 shrink-0">
          <button
            className="w-10 h-10 rounded-full flex items-center justify-center neo-raised active:scale-95 text-[color:var(--on-surface-variant)] hover:text-[color:var(--primary)] transition-all duration-200"
            onClick={handleBack}
            style={{ WebkitAppRegion: "no-drag" }}
          >
            <Icon name="arrow_back" />
          </button>
          <div>
            <h2 className="text-lg font-bold text-[color:var(--on-surface)]">
              {isQuickDrawWindow
                ? "Desenho rapido"
                : isLibraryDrawingMode
                  ? "Desenho da biblioteca"
                  : "Lousa de Desenho"}
            </h2>
            {!isQuickDrawWindow ? (
              <p className="text-xs text-[color:var(--primary)] font-semibold truncate max-w-[150px]">
                {drawingNote?.title || activeLesson?.title || "Rascunho"}
              </p>
            ) : null}
          </div>
        </div>

        <div className="hidden min-w-[260px] shrink-0 items-center gap-2 xl:flex" style={{ WebkitAppRegion: "no-drag" }}>
          <input
            value={drawingTitle}
            onChange={(event) => setDrawingTitle(event.target.value)}
            placeholder="Título do desenho"
            className="w-36 rounded-lg border border-[color:var(--outline-variant)]/40 bg-[color:var(--surface)] px-2 py-2 text-xs text-[color:var(--on-surface)] outline-none focus:border-[color:var(--primary)]"
            aria-label="Título do desenho"
          />
          <input
            value={drawingTags}
            onChange={(event) => setDrawingTags(event.target.value)}
            placeholder="Tags (separadas por vírgula)"
            className="w-40 rounded-lg border border-[color:var(--outline-variant)]/40 bg-[color:var(--surface)] px-2 py-2 text-xs text-[color:var(--on-surface)] outline-none focus:border-[color:var(--primary)]"
            aria-label="Tags do desenho"
          />
          <select
            value={drawingAcademicSubjectId}
            onChange={(event) => setDrawingAcademicSubjectId(event.target.value)}
            className="w-40 rounded-lg border border-[color:var(--outline-variant)]/40 bg-[color:var(--surface)] px-2 py-2 text-xs text-[color:var(--on-surface)] outline-none focus:border-[color:var(--primary)]"
            aria-label="Disciplina do desenho"
          >
            <option value="">Sem disciplina</option>
            {visibleSubjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </div>

        {/* Toolbar */}
        <div
          className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden pb-1 [scrollbar-color:var(--primary)_transparent] [scrollbar-width:thin]"
          style={{ WebkitAppRegion: "no-drag" }}
        >
          <div className="flex w-max min-w-max items-center gap-2 rounded-2xl bg-[color:var(--surface)] p-2 neo-inset">
          {/* Tool Selection */}
          <div className="flex gap-1 border-r border-[color:var(--outline-variant)]/50 pr-2 mr-1">
            <button
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${tool === "pen" ? "neo-pressed text-[color:var(--primary)]" : "text-[color:var(--on-surface-variant)] hover:neo-raised hover:text-[color:var(--primary)]"}`}
              onClick={() => setTool("pen")}
              title="Lápis"
            >
              <Icon name="edit" />
            </button>
            <button
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${tool === "eraser" ? "neo-pressed text-[color:var(--primary)]" : "text-[color:var(--on-surface-variant)] hover:neo-raised hover:text-[color:var(--primary)]"}`}
              onClick={() => setTool("eraser")}
              title="Borracha"
            >
              <Icon name="ink_eraser" />
            </button>
            <button
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${tool === "pan" ? "neo-pressed text-[color:var(--primary)]" : "text-[color:var(--on-surface-variant)] hover:neo-raised hover:text-[color:var(--primary)]"}`}
              onClick={() => setTool("pan")}
              title="Mover lousa (arraste para os lados)"
            >
              <Icon name="back_hand" />
            </button>
          </div>

          {/* Size Selection */}
          <div className="flex gap-2 border-r border-[color:var(--outline-variant)]/50 pr-3 mr-2 items-center">
            <Icon
              name="line_weight"
              className="text-[color:var(--on-surface-variant)] text-sm"
            />
            <input
              type="range"
              min="1"
              max="20"
              value={lineWidth}
              onChange={(e) => setLineWidth(parseInt(e.target.value, 10))}
              className="w-24 accent-[color:var(--primary)] cursor-pointer"
              title="Tamanho do Traço"
            />
          </div>

          {/* Color Selection */}
          <div className="flex gap-2 border-r border-[color:var(--outline-variant)]/50 pr-2 mr-1 items-center">
            {colors.map((c) => (
              <button
                key={c}
                className={`w-6 h-6 rounded-full transition-transform ${color === c && tool === "pen" ? "scale-125 ring-2 ring-offset-2 ring-[color:var(--primary)]" : "hover:scale-110"}`}
                style={{
                  backgroundColor:
                    c === "base" ? (isDarkMode ? "#ffffff" : "#000000") : c,
                }}
                onClick={() => {
                  setColor(c);
                  setTool("pen");
                }}
              />
            ))}
          </div>

          <div className="flex gap-1 border-l border-[color:var(--outline-variant)]/50 pl-2 ml-1">
            <button
              className="w-10 h-10 rounded-xl flex items-center justify-center text-[color:var(--on-surface-variant)] hover:neo-raised hover:text-[color:var(--primary)] transition-all"
              onClick={undo}
              title={`Desfazer (${shortcutLabel("Mod+Z")})`}
            >
              <Icon name="undo" />
            </button>
            <button
              className="w-10 h-10 rounded-xl flex items-center justify-center text-[color:var(--on-surface-variant)] hover:neo-raised hover:text-[color:var(--primary)] transition-all"
              onClick={redo}
              title={`Refazer (${shortcutLabel(isMacPlatform() ? "Mod+Shift+Z" : "Mod+Y")})`}
            >
              <Icon name="redo" />
            </button>
          </div>

          <button
            className="w-10 h-10 rounded-xl flex items-center justify-center text-[color:var(--on-surface-variant)] hover:neo-raised hover:text-[color:var(--primary)] transition-all"
            onClick={resetView}
            title="Centralizar visualização"
          >
            <Icon name="filter_center_focus" />
          </button>

          <button
            className="w-10 h-10 rounded-xl flex items-center justify-center text-red-500 hover:neo-raised transition-all ml-2"
            onClick={clearCanvas}
            title="Limpar Tudo"
          >
            <Icon name="delete_sweep" />
          </button>
          {isQuickDrawWindow ? (
            <button
              className="ml-1 flex h-10 items-center gap-2 rounded-xl bg-[color:var(--primary)] px-3 text-sm font-semibold text-[color:var(--on-primary)] neo-raised"
              onClick={saveQuickDrawingAndStartNew}
              title="Salvar este desenho e iniciar outro"
            >
              <Icon className="text-[18px]" name="save" />
              Salvar e novo
            </button>
          ) : null}
          </div>
        </div>

        <div className="hidden shrink-0 items-center gap-2 lg:flex">
          {!isQuickDrawWindow ? (
            <button
              className="flex items-center gap-1.5 rounded-xl bg-[color:var(--primary)] px-4 py-2 text-sm font-semibold text-[color:var(--on-primary)] transition-all hover:neo-raised"
              onClick={saveCurrentDrawing}
              style={{ WebkitAppRegion: "no-drag" }}
              title="Salvar desenho"
            >
              <Icon className="text-[16px]" name="save" />
              Salvar
            </button>
          ) : null}
          {!isQuickDrawWindow && !isLibraryDrawingMode ? (
            <button
              className="rounded-xl border border-[color:var(--outline-variant)]/30 px-4 py-2 text-sm font-semibold text-[color:var(--on-surface)] transition-all hover:neo-raised"
              onClick={saveDrawingAsNote}
              style={{ WebkitAppRegion: "no-drag" }}
              title="Salvar como nota"
            >
              Salvar como nota
            </button>
          ) : null}
          <span className="text-xs font-semibold text-[color:var(--on-surface-variant)] flex items-center gap-1.5 opacity-70">
            <Icon className="text-[16px]" name="cloud_done" />
            Salvo
          </span>
        </div>
      </header>

      {/* Main Canvas Area */}
      <main className="flex-1 w-full h-full relative bg-[color:var(--background)] overflow-hidden p-6 transition-colors">
        <div
          ref={containerRef}
          className="w-full h-full rounded-[2rem] bg-[color:var(--surface)] shadow-[0px_10px_30px_var(--neo-shadow-dark)] border border-[color:var(--outline-variant)]/20 relative overflow-hidden transition-colors"
        >
          <canvas
            ref={canvasRef}
            onPointerDown={startDrawing}
            onPointerMove={draw}
            onPointerUp={stopDrawing}
            onPointerOut={stopDrawing}
            onPointerLeave={stopDrawing}
            onWheel={handleWheel}
            onContextMenu={(e) => e.preventDefault()}
            className={`absolute inset-0 touch-none select-none ${cursorClass}`}
          />
        </div>
      </main>
    </motion.div>
  );
}
