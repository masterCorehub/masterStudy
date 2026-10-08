import { nestedNoteContext } from "../domain/nestedNotes";
import { useCallback, useState, useEffect, useRef } from "react";
import { Icon } from "../ui/Icon";
import { SCREEN_IDS } from "../app/screenIds";
import { useStudyStore } from "../store/useStore";
import { motion } from "framer-motion";
import { RichTextEditor } from "../components/RichTextEditor";
import { AppSelect } from "../components/AppSelect";
import { SharedNoteCollaborationPanel } from "../components/SharedNoteCollaborationPanel";
import { normalizeAcademicData } from "../domain/academic";
import { shortcutLabel } from "../utils/keyboardShortcuts";
import {
  collaborationCloud,
  collaborationCloudConfigured,
} from "../services/collaboration-cloud";
import {
  askWithWebLLM,
  initializeWebLLM,
  isWebLlmAvailable,
  WEBLLM_DEFAULT_MODEL,
} from "../services/webllm";

const htmlToPlainText = (value = "") =>
  String(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>|<\/h\d>|<\/li>|<\/blockquote>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

import { markdownToNoteHtml } from "../domain/aiStudio";
import { NoteAiChatModal } from "../components/NoteAiChatModal";

const generatedTextToHtml = markdownToNoteHtml;

export function NoteEditorScreen({ onNavigate }) {
  const searchParams =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : null;
  const isStandaloneWindow =
    typeof window !== "undefined" &&
    window.location.search.includes("standalone=1");
  const isQuickNoteWindow = searchParams?.get("mode") === "quick-note";
  const urlNoteId = isStandaloneWindow ? searchParams?.get("noteId") : null;

  const [isImmersed, setIsImmersed] = useState(isQuickNoteWindow);
  const [isEditing] = useState(true);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [quickCreatedNoteId, setQuickCreatedNoteId] = useState(null);
  const [sidePanel, setSidePanel] = useState("ai");
  const [selectedNoteText, setSelectedNoteText] = useState("");
  const [noteAiStatus, setNoteAiStatus] = useState(null);
  const [selectedAiModel, setSelectedAiModel] = useState("");
  const [noteAiBusy, setNoteAiBusy] = useState(false);
  const [currentAiActionLabel, setCurrentAiActionLabel] = useState("");
  const [pendingAiRewrite, setPendingAiRewrite] = useState(null);
  const [noteAiError, setNoteAiError] = useState("");
  const [noteAiResult, setNoteAiResult] = useState(null);
  const [noteAiQuestion, setNoteAiQuestion] = useState("");
  const [selectedAttachmentForAi, setSelectedAttachmentForAi] = useState("");
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [targetChatThreadId, setTargetChatThreadId] = useState("");
  const [targetChatMessageId, setTargetChatMessageId] = useState("");
  const [noteAiRequestId, setNoteAiRequestId] = useState("");
  const [noteAiNotice, setNoteAiNotice] = useState("");
  const [flashcardDrafts, setFlashcardDrafts] = useState([]);
  const [extraTagInput, setExtraTagInput] = useState("");
  const [activeTone, setActiveTone] = useState("tone-formal");
  const [sharedSyncMessage, setSharedSyncMessage] = useState("");
  const [pdfExporting, setPdfExporting] = useState(false);
  const editorRef = useRef(null);

  const activeNoteId = useStudyStore((state) => state.activeNoteId);
  const activeCourseId = useStudyStore((state) => state.activeCourseId);
  const activeModuleId = useStudyStore((state) => state.activeModuleId);
  const activeLessonId = useStudyStore((state) => state.activeLessonId);
  const courses = useStudyStore((state) => state.courses);
  const academicState = useStudyStore((state) => state.academic);
  const academic = normalizeAcademicData(academicState);
  const notesList = useStudyStore((state) => state.notes.list);
  const quickNoteTemplateId = useStudyStore(
    (state) => state.quickNoteTemplateId,
  );
  const noteTemplates = useStudyStore((state) => state.noteTemplates || []);
  const addNote = useStudyStore((state) => state.addNote);
  const deleteNote = useStudyStore((state) => state.deleteNote);
  const setActiveNote = useStudyStore((state) => state.setActiveNote);
  const updateNote = useStudyStore((state) => state.updateNote);
  const addNoteTemplate = useStudyStore((state) => state.addNoteTemplate);
  const addNoteVersion = useStudyStore((state) => state.addNoteVersion);
  const addFlashcardDeck = useStudyStore((state) => state.addFlashcardDeck);
  const setActiveAcademicSubject = useStudyStore(
    (state) => state.setActiveAcademicSubject,
  );

  useEffect(() => {
    // If the panel changes to something else, we don't automatically close drawing mode anymore
    // since drawing mode is internal to RichTextEditor.
  }, [sidePanel]);

  const noteIdToUse = urlNoteId || quickCreatedNoteId || activeNoteId;
  // Never silently edit the first note when the requested note is still
  // being hydrated (or when its id is invalid). That made save/discard act
  // on the wrong note in standalone windows.
  const data = noteIdToUse
    ? notesList.find((n) => n.id === noteIdToUse) || {}
    : {};
  const canEditSharedNote =
    !data.sharedWithMe || data.sharingPermission === "editor";
  const childNotes = notesList.filter(
    (note) => String(note.parentNoteId || "") === String(data.id || ""),
  );

  const handleSaveAsPdf = async () => {
    if (pdfExporting) return;
    setPdfExporting(true);
    const payload = {
      title: localTitle.trim() || "Nota sem título",
      content: localContent,
      subject: selectedAcademicSubject?.name || data.module || "",
      category: data.category || "Anotação",
    };
    try {
      if (window.studyhubDesktop?.saveNoteAsPdf) {
        const result = await window.studyhubDesktop.saveNoteAsPdf(payload);
        if (!result?.canceled) setNoteAiNotice(`PDF salvo em ${result.filePath}`);
        return;
      }

      const printWindow = window.open("", "_blank");
      if (!printWindow) throw new Error("Permita pop-ups para salvar a nota como PDF.");
      const safeTitle = escapeHtml(payload.title);
      const metadata = escapeHtml([payload.subject, payload.category].filter(Boolean).join(" · "));
      printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'"><title>${safeTitle}</title><style>@page{size:A4;margin:18mm 17mm 20mm}body{color:#0f172a;font:14px/1.65 Arial,sans-serif;overflow-wrap:anywhere}header{padding-bottom:18px;margin-bottom:28px;border-bottom:1px solid #cbd5e1}header p{color:#64748b;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}h1{font-size:28px}blockquote{padding:12px 18px;border-left:4px solid #2563eb;background:#f1f5f9}pre{padding:14px;background:#f1f5f9;white-space:pre-wrap}img,svg,canvas{max-width:100%;height:auto}table{width:100%;border-collapse:collapse}th,td{padding:8px;border:1px solid #cbd5e1}</style></head><body><header>${metadata ? `<p>${metadata}</p>` : ""}<h1>${safeTitle}</h1></header><main>${payload.content || "<p>Nota sem conteúdo.</p>"}</main></body></html>`);
      printWindow.document.close();
      printWindow.opener = null;
      window.setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 200);
    } catch (error) {
      setNoteAiError(error?.message || "Não foi possível salvar a nota como PDF.");
    } finally {
      setPdfExporting(false);
    }
  };
  const isOnlineSharedNote = Boolean(
    collaborationCloudConfigured && data.sharedEntityId,
  );
  const selectedAcademicSubject = academic.subjects.find(
    (subject) => subject.id === data.academicSubjectId,
  );
  const selectedAcademicSemesterId =
    data.academicSemesterId ||
    selectedAcademicSubject?.semesterId ||
    academic.activeSemesterId ||
    "";
  const availableAcademicSubjects = academic.subjects.filter(
    (subject) =>
      !subject.isArchived && subject.semesterId === selectedAcademicSemesterId,
  );
  const preferredAiModel = academic.studyPreferences?.aiModel;
  const noteAiModel = (noteAiStatus?.models || []).some(
    (model) => model.name === preferredAiModel,
  )
    ? preferredAiModel
    : noteAiStatus?.models?.[0]?.name || "deepseek-r1:1.5b";

  const defaultAiModels = [
    { value: "deepseek-r1:1.5b", label: "🧠 DeepSeek-R1 (1.5B)" },
    { value: "deepseek-r1:7b", label: "🧠 DeepSeek-R1 (7B)" },
    { value: "deepseek-r1", label: "🧠 DeepSeek-R1 (Padrão)" },
    { value: "llama3", label: "🦙 Llama 3" },
    { value: "mistral", label: "⚡ Mistral" },
    { value: "gemma", label: "💎 Gemma" },
  ];

  const detectedAiModels = (noteAiStatus?.models || []).map((m) => ({
    value: m.name,
    label: `🤖 ${m.name} ${m.size ? `(${Math.round((m.size / 1024 / 1024 / 1024) * 10) / 10} GB)` : ""}`,
  }));

  const aiModelOptions = [
    ...defaultAiModels,
    ...detectedAiModels.filter(
      (dm) => !defaultAiModels.some((defM) => defM.value === dm.value),
    ),
  ];
  const webAiModelOptions = [
    { value: WEBLLM_DEFAULT_MODEL, label: "⚡ Qwen 0.5B (leve)" },
    { value: "Llama-3.2-1B-Instruct-q4f16_1-MLC", label: "🧠 Llama 3.2 1B (melhor qualidade)" },
  ];
  const visibleAiModelOptions = window.studyhubDesktop?.academicAI
    ? aiModelOptions
    : webAiModelOptions;

  const [localTitle, setLocalTitle] = useState(data.title || "");
  const [localContent, setLocalContent] = useState(data.content || "");

  useEffect(() => {
    setLocalTitle(data.title || "");
    setLocalContent(data.content || "");
    setExtraTagInput("");
  }, [data.id]);

  const persistSharedNote = useCallback(
    async (updates) => {
      if (!isOnlineSharedNote || !canEditSharedNote) return null;
      const current = useStudyStore
        .getState()
        .studyItems.find((item) => item.id === data.id);
      const entity = await collaborationCloud.updateSharedEntity({
        sharedEntityId: data.sharedEntityId,
        title: updates.title ?? current?.title,
        payload: { ...current, ...updates },
        expectedRevision: Number(current?.sharedEntityRevision || 1),
      });
      updateNote(data.id, {
        sharedEntityRevision: Number(entity.revision || 1),
      });
      setSharedSyncMessage("Alterações sincronizadas com os participantes.");
      return entity;
    },
    [canEditSharedNote, data.id, data.sharedEntityId, isOnlineSharedNote, updateNote],
  );

  // Debounced auto-save (800ms after typing stops)
  useEffect(() => {
    if (!data.id || !canEditSharedNote) return;
    if (data.content === localContent && data.title === localTitle) return;

    const timer = setTimeout(async () => {
      updateNote(data.id, {
        title: localTitle,
        content: localContent,
        updatedAt: Date.now(),
      });
      try {
        await persistSharedNote({
          title: localTitle,
          content: localContent,
          updatedAt: Date.now(),
        });
      } catch (error) {
        // quiet catch on sync
      }
      window.studyhubDesktop?.notifyStudyDataChanged?.();
    }, 800);

    return () => clearTimeout(timer);
  }, [data.id, data.content, data.title, localContent, localTitle, canEditSharedNote, updateNote, persistSharedNote]);

  useEffect(() => {
    if (isQuickNoteWindow) return;
    if (!window.studyhubDesktop?.academicAI) {
      setNoteAiStatus({
        available: false,
        provider: "webllm",
        supported: isWebLlmAvailable(),
        message: isWebLlmAvailable()
          ? "IA no navegador pronta para ser carregada."
          : "Este navegador não oferece WebGPU.",
        models: [{ name: WEBLLM_DEFAULT_MODEL }],
      });
      return;
    }
    let active = true;
    window.studyhubDesktop.academicAI
      .status()
      .then((status) => active && setNoteAiStatus(status))
      .catch((error) => active && setNoteAiError(error.message));
    return () => {
      active = false;
    };
  }, [isQuickNoteWindow]);

  useEffect(() => {
    if (noteAiResult?.kind !== "flashcards") return;
    setFlashcardDrafts(
      (noteAiResult.data?.cards || []).map((card, index) => ({
        id: `draft-${Date.now()}-${index}`,
        front: card.front || "",
        back: card.back || "",
      })),
    );
  }, [noteAiResult]);

  useEffect(() => {
    if (!isQuickNoteWindow || urlNoteId || quickCreatedNoteId) return;

    const quickNoteId = `note-${Date.now()}`;
    const quickTemplate = noteTemplates.find(
      (template) => template.id === quickNoteTemplateId,
    );

    addNote({
      id: quickNoteId,
      title: "",
      content: quickTemplate?.content || "",
      module: "Captura rapida",
      category: quickTemplate ? quickTemplate.title : "Nota rapida",
      sourceCourseId: activeCourseId || null,
      sourceModuleId: activeModuleId || null,
      sourceLessonId: activeLessonId || null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    setActiveNote(quickNoteId);
    setQuickCreatedNoteId(quickNoteId);
  }, [
    activeCourseId,
    activeLessonId,
    activeModuleId,
    addNote,
    isQuickNoteWindow,
    noteTemplates,
    quickNoteTemplateId,
    quickCreatedNoteId,
    setActiveNote,
    urlNoteId,
  ]);

  const closeStandaloneWindow = () => {
    if (typeof window !== "undefined") {
      if (isStandaloneWindow) {
        window.close();
      } else {
        onNavigate && onNavigate(SCREEN_IDS.NOTES);
      }
    } else {
      onNavigate && onNavigate(SCREEN_IDS.NOTES);
    }
  };

  const handleSaveNote = async () => {
    if (!data.id) return;
    if (!canEditSharedNote) {
      closeStandaloneWindow();
      return;
    }
    if (data.content !== localContent || data.title !== localTitle) {
      addNoteVersion(data.id, data.content || "", data.title || "");
    }
    updateNote(data.id, {
      title: localTitle,
      content: localContent,
      updatedAt: Date.now(),
    });
    try {
      await persistSharedNote({
        title: localTitle,
        content: localContent,
        updatedAt: Date.now(),
      });
    } catch (error) {
      setSharedSyncMessage(
        error.message || "Não foi possível sincronizar a nota.",
      );
      return;
    }
    await window.studyhubDesktop?.notifyStudyDataChanged?.();
    closeStandaloneWindow();
  };

  const handleCreateChildNote = () => {
    if (!data.id || !canEditSharedNote) return;
    const childId = `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    addNote({
      id: childId,
      // O título herdado mantém a origem da aula/nota visível na árvore do vault.
      title: `Nota interna — ${data.title || "Sem título"}`,
      content: "",
      ...nestedNoteContext(data),
      sourceKind: "nested-note",
      itemType: "note",
      category: "Nota interna",
      academicSubjectId: data.academicSubjectId || data.subjectId || null,
      sourceCourseId: data.sourceCourseId || null,
      sourceLessonId: data.sourceLessonId || null,
    });
    setActiveNote(childId);
  };

  const handleCreateEmbeddedChildNote = (title = "Nova nota interna") => {
    if (!data.id || !canEditSharedNote) return;
    const childId = `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    addNote({
      id: childId,
      title: title === "Nova nota interna" ? `Nota interna — ${data.title || "Sem título"}` : title,
      content: "",
      ...nestedNoteContext(data),
      sourceKind: "nested-note",
      itemType: "note",
      category: "Nota interna",
      academicSubjectId: data.academicSubjectId || data.subjectId || null,
      sourceCourseId: data.sourceCourseId || null,
      sourceLessonId: data.sourceLessonId || null,
    });
    return childId;
  };

  const handleDeleteInternalNote = () => {
    if (!data.parentNoteId || !canEditSharedNote) return;
    if (!window.confirm("Excluir esta nota interna? Esta ação não pode ser desfeita.")) return;
    deleteNote(data.id);
    setActiveNote(data.parentNoteId);
  };

  const handleDiscardChanges = () => {
    setLocalTitle(data.title || "");
    setLocalContent(data.content || "");
    closeStandaloneWindow();
  };

  const pickAttachments = async () => {
    if (!canEditSharedNote) return;
    const selected = await window.studyhubDesktop?.selectFile?.({
      properties: ["openFile", "multiSelections"],
    });
    const paths = Array.isArray(selected)
      ? selected
      : selected
        ? [selected]
        : [];
    if (!paths.length || !data.id) return;
    updateNote(data.id, {
      attachments: [...new Set([...(data.attachments || []), ...paths])],
    });
  };

  const openAcademicAssistant = () => {
    if (!data.academicSubjectId) return;
    setActiveAcademicSubject(data.academicSubjectId);
    onNavigate?.(SCREEN_IDS.ACADEMIC_SUBJECT);
  };

  const selectAcademicSemester = (semesterId) => {
    if (!data.id || !canEditSharedNote) return;
    const normalizedSemesterId = semesterId || null;
    const currentSubject = academic.subjects.find(
      (subject) => subject.id === data.academicSubjectId,
    );
    const keepsCurrentSubject =
      currentSubject?.semesterId === normalizedSemesterId &&
      !currentSubject.isArchived;

    updateNote(data.id, {
      academicSemesterId: normalizedSemesterId,
      academicSubjectId: keepsCurrentSubject ? currentSubject.id : null,
      academicContextExplicit: true,
    });
  };

  const selectAcademicSubject = (subjectId) => {
    if (!data.id || !canEditSharedNote) return;
    const normalizedSubjectId = subjectId || "";
    const subject = availableAcademicSubjects.find(
      (item) => item.id === normalizedSubjectId,
    );

    updateNote(data.id, {
      academicSubjectId: subject?.id || null,
      academicSemesterId:
        subject?.semesterId || selectedAcademicSemesterId || null,
      academicContextExplicit: true,
      sourceCourseId:
        data.sourceCourseId || subject?.linkedCourseIds?.[0] || null,
    });
  };

  const addExtraTag = () => {
    if (!data.id || !canEditSharedNote) return;
    let newTag = extraTagInput.trim();
    if (newTag.length < 2) return;
    if (!newTag.startsWith("#")) newTag = `#${newTag}`;
    const currentTags = data.tags || [];
    if (!currentTags.includes(newTag)) {
      updateNote(data.id, {
        tags: [...currentTags, newTag],
      });
    }
    setExtraTagInput("");
  };

  const handleSaveQuickNote = async () => {
    const quickNoteId = urlNoteId || quickCreatedNoteId;
    if (!quickNoteId || !notesList.some((note) => note.id === quickNoteId))
      return;

    const previous = notesList.find((note) => note.id === quickNoteId);
    if (
      previous &&
      (previous.content !== localContent || previous.title !== localTitle)
    ) {
      addNoteVersion(quickNoteId, previous.content || "", previous.title || "");
    }
    updateNote(quickNoteId, {
      title: localTitle,
      content: localContent,
      updatedAt: Date.now(),
    });
    await window.studyhubDesktop?.notifyStudyDataChanged?.();
    closeStandaloneWindow();
  };

  const handleDiscardQuickNote = () => {
    const quickNoteId = urlNoteId || quickCreatedNoteId;
    if (quickNoteId && notesList.some((note) => note.id === quickNoteId)) {
      deleteNote(quickNoteId);
    }
    window.studyhubDesktop?.notifyStudyDataChanged?.();
    closeStandaloneWindow();
  };

  const resolveSourceLocation = () => {
    if (!data.sourceLessonId) return null;

    if (data.sourceCourseId && data.sourceModuleId) {
      return {
        courseId: data.sourceCourseId,
        moduleId: data.sourceModuleId,
        lessonId: data.sourceLessonId,
      };
    }

    for (const course of courses) {
      for (const module of course.modules || []) {
        const lesson = (module.lessons || []).find(
          (item) => item.id === data.sourceLessonId,
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

    return null;
  };

  const openSourceLesson = (time = null) => {
    const sourceLocation = resolveSourceLocation();
    if (!sourceLocation) return;

    const store = useStudyStore.getState();
    store.setActiveCourse(sourceLocation.courseId);
    store.setActiveModule(sourceLocation.moduleId);
    store.setActiveLesson(sourceLocation.lessonId);

    if (Number.isFinite(time)) {
      store.requestImmersionSeek(time);
    }

    if (typeof window !== "undefined") {
      const params = new URLSearchParams({
        screen: SCREEN_IDS.LESSON,
        courseId: sourceLocation.courseId,
        moduleId: sourceLocation.moduleId,
        lessonId: sourceLocation.lessonId,
      });

      if (Number.isFinite(time)) {
        params.set("seek", String(time));
      }

      window.history.replaceState(null, "", `?${params.toString()}`);
    }

    onNavigate && onNavigate(SCREEN_IDS.LESSON);
  };

  const handleTimestampClick = (time) => {
    openSourceLesson(time);
  };

  const confirmSaveTemplate = () => {
    if (templateName && templateName.trim()) {
      addNoteTemplate({
        title: templateName.trim(),
        description: "Modelo personalizado.",
        icon: "bookmark",
        content: localContent,
      });
      setShowSaveModal(false);
      setTemplateName("");
      alert(`Modelo "${templateName}" salvo com sucesso!`);
    }
  };

  const startCopilotRewriteApproval = (rewrittenContent) => {
    const originalText = selectedNoteText || localContent;
    const snapshotContent = localContent;

    const escapedOriginal = selectedNoteText ? escapeHtml(selectedNoteText) : "";
    const diffBlockHtml = `<div class="ai-copilot-diff-block my-3 p-4 bg-purple-500/10 border-2 border-dashed border-purple-500/50 rounded-2xl">
      <div class="flex items-center gap-2 text-xs font-extrabold text-purple-600 dark:text-purple-300 mb-2">
        <span class="w-2 h-2 rounded-full bg-purple-500 animate-ping"></span>
        <span>✨ Sugestão da IA (Reescrita) — Pendente de Aprovação</span>
      </div>
      ${escapedOriginal ? `<div class="text-xs text-rose-500/80 line-through mb-1.5">Original: ${escapedOriginal}</div>` : ""}
      <div class="text-sm font-medium text-[color:var(--on-surface)] bg-purple-500/10 p-3 rounded-xl border border-purple-500/20">${generatedTextToHtml(rewrittenContent)}</div>
    </div>`;

    setPendingAiRewrite({
      originalText,
      rewrittenText: rewrittenContent,
      previousLocalContent: snapshotContent,
      diffBlockHtml,
    });

    if (editorRef.current?.replaceSelection && selectedNoteText) {
      editorRef.current.replaceSelection(diffBlockHtml);
    } else {
      setLocalContent((prev) => `${prev}<br/>${diffBlockHtml}`);
    }
    setNoteAiNotice(`Sugestão de reescrita inserida na nota. Escolha Aceitar (${shortcutLabel("Mod+Enter")}) ou Rejeitar (Esc).`);
  };

  const acceptCopilotRewrite = () => {
    if (!pendingAiRewrite) return;
    const { rewrittenText, previousLocalContent } = pendingAiRewrite;
    const cleanRewrittenHtml = generatedTextToHtml(rewrittenText);

    setLocalContent((current) => {
      if (current.includes("ai-copilot-diff-block")) {
        return current.replace(/<div class="ai-copilot-diff-block[\s\S]*?<\/div>\s*<\/div>/g, cleanRewrittenHtml);
      }
      return `${previousLocalContent}<br/>${cleanRewrittenHtml}`;
    });

    setPendingAiRewrite(null);
    setNoteAiNotice("✨ Sugestão de reescrita aceita com sucesso!");
  };

  const rejectCopilotRewrite = () => {
    if (!pendingAiRewrite) return;
    setLocalContent(pendingAiRewrite.previousLocalContent);
    setPendingAiRewrite(null);
    setNoteAiNotice("Sugestão de reescrita descartada.");
  };

  useEffect(() => {
    if (!pendingAiRewrite) return;
    const handleKeyDown = (e) => {
      if ((e.key === "Enter" && (e.metaKey || e.ctrlKey)) || e.key === "Tab") {
        e.preventDefault();
        acceptCopilotRewrite();
      } else if (e.key === "Escape") {
        e.preventDefault();
        rejectCopilotRewrite();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pendingAiRewrite]);

  const startNoteAi = async () => {
    if (noteAiStatus?.provider === "gemini") {
      useStudyStore.getState().openSettingsModal?.("ai");
      return;
    }
    setNoteAiBusy(true);
    setNoteAiError("");
    try {
      if (!window.studyhubDesktop?.academicAI) {
        await initializeWebLLM((progress) => {
          const percent = Math.round((progress?.progress || 0) * 100);
          setCurrentAiActionLabel(
            progress?.text || `Carregando IA no navegador${percent ? ` (${percent}%)` : ""}...`,
          );
        });
        setNoteAiStatus({
          available: true,
          provider: "webllm",
          supported: true,
          models: [{ name: WEBLLM_DEFAULT_MODEL }],
        });
        return;
      }
      const status = await window.studyhubDesktop.academicAI.start();
      setNoteAiStatus(status);
      if (!status?.available) {
        setNoteAiError(status?.message || "Não foi possível iniciar o Ollama.");
      }
    } catch (error) {
      setNoteAiError(error.message || "Não foi possível iniciar o Ollama.");
    } finally {
      setNoteAiBusy(false);
    }
  };

  const runNoteAi = async (kind) => {
    const desktopAi = window.studyhubDesktop?.academicAI;
    if (!desktopAi && !isWebLlmAvailable()) {
      setNoteAiError("Este navegador não oferece WebGPU para executar a IA local.");
      return;
    }
    const hasAttachments = data.attachments && data.attachments.length > 0;
    if (!localContent.trim() && !hasAttachments && kind !== "from-attachments") return;

    const actionLabels = {
      summary: "Gerando resumo inteligente...",
      topics: "Sintetizando conteúdos e tópicos abordados...",
      questions: "Criando questões de fixação com IA...",
      flashcards: "Extraindo conceitos para flashcards...",
      mindmap: "Construindo estrutura de mapa mental...",
      concepts: "Extraindo conceitos e fórmulas principais...",
      "from-attachments": "Sintetizando arquivos anexados com IA...",
      explain: "Explicando o trecho selecionado...",
      tone: "Reescrevendo texto com IA...",
      ask: "Respondendo pergunta sobre a nota...",
    };
    setCurrentAiActionLabel(actionLabels[kind] || "Executando função de IA...");

    const requestId = `note-ai-${Date.now()}`;
    setNoteAiBusy(true);
    setNoteAiError("");
    setNoteAiNotice("");
    setNoteAiResult(null);
    setNoteAiRequestId(requestId);
    try {
      const activeAttachmentPaths = selectedAttachmentForAi
        ? [selectedAttachmentForAi]
        : data.attachments || [];
      const targetAttachmentName = selectedAttachmentForAi
        ? selectedAttachmentForAi.split(/[\\/]/).pop()
        : "";

      const effectiveKind = kind === "tone" ? activeTone : kind;
      let result;
      if (desktopAi) {
        result = await desktopAi.noteAction({
          kind: effectiveKind,
          title: localTitle,
          content: htmlToPlainText(localContent),
          attachmentPaths: activeAttachmentPaths,
          targetAttachmentName,
          selection: (kind === "explain" || kind === "tone") ? selectedNoteText : "",
          question: kind === "ask" ? noteAiQuestion : "",
          model: selectedAiModel || noteAiModel,
          requestId,
        });
      } else {
        if (kind === "from-attachments") {
          throw new Error("A leitura de anexos pela IA web ainda não está disponível. Use o texto da nota.");
        }
        const instructions = {
          summary: "Crie um resumo didático, fiel e bem estruturado.",
          topics: "Extraia os tópicos principais e organize-os por importância.",
          questions: "Crie questões de estudo com suas respectivas respostas.",
          flashcards: 'Retorne somente JSON válido no formato {"cards":[{"front":"pergunta","back":"resposta"}]}, com 6 cartões.',
          mindmap: "Crie um mapa mental em Mermaid começando por mindmap. Retorne somente o código.",
          concepts: 'Retorne somente JSON válido no formato {"concepts":[{"term":"termo","definition":"definição"}],"formulas":[]}.',
          explain: "Explique o trecho selecionado de maneira simples e didática.",
          "tone-formal": "Reescreva em tom formal, profissional e acadêmico.",
          "tone-child": "Explique como para uma criança de 10 anos.",
          "tone-concise": "Reescreva de maneira curta, direta e sem redundâncias.",
          ask: `Responda à pergunta: ${noteAiQuestion}`,
        };
        const raw = await askWithWebLLM({
          system: "Você é um assistente acadêmico. Use somente o conteúdo fornecido e responda em português do Brasil.",
          prompt: `${instructions[effectiveKind] || instructions.summary}\n\nTÍTULO: ${localTitle}\n\nCONTEÚDO:\n${htmlToPlainText(localContent)}${selectedNoteText ? `\n\nTRECHO SELECIONADO:\n${selectedNoteText}` : ""}`,
          onProgress: (progress) => setCurrentAiActionLabel(progress?.text || "Carregando IA no navegador..."),
        });
        let parsed = null;
        if (effectiveKind === "flashcards" || effectiveKind === "concepts") {
          const start = raw.indexOf("{");
          const end = raw.lastIndexOf("}");
          if (start >= 0 && end > start) parsed = JSON.parse(raw.slice(start, end + 1));
        }
        result = {
          kind: effectiveKind,
          title: effectiveKind === "summary" ? "Resumo da nota" : "Resultado da IA",
          content: raw,
          data: parsed,
          model: WEBLLM_DEFAULT_MODEL,
        };
      }
      setNoteAiResult(result);

      if (kind === "tone" || (result.kind && result.kind.startsWith("tone-"))) {
        startCopilotRewriteApproval(result.content);
      }

      if (result.continuationCount) {
        setNoteAiNotice(
          `A resposta foi continuada automaticamente ${result.continuationCount} vez(es).`,
        );
      }
      if (result.truncated) {
        setNoteAiError(
          "A resposta ainda ficou incompleta. Tente selecionar menos conteúdo.",
        );
      }
    } catch (error) {
      setNoteAiError(error.message || "A IA não conseguiu processar a nota.");
    } finally {
      setNoteAiBusy(false);
      setNoteAiRequestId("");
    }
  };

  const cancelNoteAi = async () => {
    if (!noteAiRequestId) return;
    await window.studyhubDesktop?.academicAI?.cancel?.(noteAiRequestId);
  };

  const applyNoteAiResult = () => {
    if (!noteAiResult) return;

    if (noteAiResult.kind === "flashcards") {
      const cards = flashcardDrafts
        .filter((card) => card.front && card.back)
        .map((card) => ({
          id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          front: card.front.trim(),
          back: card.back.trim(),
          createdAt: Date.now(),
        }));
      if (!cards.length) {
        setNoteAiError("A IA não retornou flashcards válidos.");
        return;
      }
      addFlashcardDeck({
        title: `IA · ${localTitle || "Nota"}`,
        academicSubjectId: data.academicSubjectId || null,
        academicSemesterId: data.academicSemesterId || null,
        sourceNoteId: data.id,
        sourceKind: "note-ai",
        cards,
      });
      setNoteAiNotice(`${cards.length} flashcards foram criados.`);
      setNoteAiResult(null);
      setFlashcardDrafts([]);
      onNavigate?.(SCREEN_IDS.FLASHCARDS);
      return;
    }

    if (noteAiResult.kind === "mindmap") {
      editorRef.current?.insertMermaid?.(noteAiResult.content);
      setNoteAiNotice("Mapa mental inserido no editor.");
      setNoteAiResult(null);
      return;
    }

    if (noteAiResult.kind.startsWith("tone-")) {
      startCopilotRewriteApproval(noteAiResult.content);
      setNoteAiResult(null);
      return;
    }

    if (noteAiResult.kind === "topics") {
      const topicsHtml = generatedTextToHtml(noteAiResult.content);
      const section = `<div class="ai-inserted-block my-4 p-4 bg-purple-500/10 border border-purple-500/30 rounded-2xl">
        <h3 class="text-base font-bold text-[color:var(--primary)] flex items-center gap-2 mb-2">
          <span>📚 Conteúdos Abordados (IA)</span>
        </h3>
        ${topicsHtml}
      </div>`;
      if (editorRef.current?.insertTopicsBlock) {
        editorRef.current.insertTopicsBlock(section);
      } else {
        setLocalContent((current) => `${current}${section}`);
      }
      setNoteAiNotice("Conteúdos abordados gerados pela IA e inseridos na nota.");
      setNoteAiResult(null);
      return;
    }

    if (noteAiResult.kind === "concepts" && noteAiResult.data) {
      const conceptsList = (noteAiResult.data.concepts || [])
        .map(
          (c) =>
            `<li><strong>${escapeHtml(c.term)}</strong>: ${escapeHtml(c.definition)}</li>`,
        )
        .join("");
      const formulasList = (noteAiResult.data.formulas || [])
        .map(
          (f) =>
            `<li><span data-math="${escapeHtml(f.latex)}">${escapeHtml(f.latex)}</span>: ${escapeHtml(f.context)}</li>`,
        )
        .join("");

      const section = `<hr><h2>${escapeHtml(noteAiResult.title)}</h2>${conceptsList ? `<h3>Conceitos</h3><ul>${conceptsList}</ul>` : ""}${formulasList ? `<h3>Fórmulas</h3><ul>${formulasList}</ul>` : ""}`;
      setLocalContent((current) => `${current}${section}`);
      setNoteAiNotice("Conceitos e fórmulas adicionados à nota.");
      setNoteAiResult(null);
      return;
    }

    const section = `<hr><h2>${escapeHtml(noteAiResult.title)}</h2>${generatedTextToHtml(noteAiResult.content)}`;
    setLocalContent((current) => `${current}${section}`);
    setNoteAiNotice("Conteúdo adicionado ao final da nota. Clique em Salvar.");
  };

  const handleAddTopicsAbordados = () => {
    const hasAttachments = data.attachments && data.attachments.length > 0;
    if (window.studyhubDesktop?.academicAI && (localContent.trim() || hasAttachments)) {
      runNoteAi("topics");
    } else {
      editorRef.current?.insertTopicsBlock?.();
      setNoteAiNotice("Bloco de Conteúdos Abordados inserido no editor.");
    }
  };

  const updateFlashcardDraft = (id, field, value) => {
    setFlashcardDrafts((current) =>
      current.map((card) =>
        card.id === id ? { ...card, [field]: value } : card,
      ),
    );
  };

  const removeFlashcardDraft = (id) => {
    setFlashcardDrafts((current) =>
      current.filter((card) => card.id !== id),
    );
  };

  if (isQuickNoteWindow && !urlNoteId && !quickCreatedNoteId) {
    return (
      <div className="flex h-full items-center justify-center bg-[color:var(--background)] text-[color:var(--on-surface-variant)]">
        <div className="flex items-center gap-3 text-sm font-semibold">
          <Icon
            className="animate-pulse text-[color:var(--primary)]"
            name="edit_note"
          />
          Preparando nota rapida...
        </div>
      </div>
    );
  }

  if (isQuickNoteWindow) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[color:var(--background)] text-[color:var(--on-surface)] screen-fade-in">
        <header
          className="flex flex-col gap-4 border-b border-[color:var(--outline-variant)]/20 px-6 py-5"
          style={isStandaloneWindow ? { WebkitAppRegion: "drag" } : undefined}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <button
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full neo-raised text-[color:var(--on-surface-variant)] transition-all hover:text-[color:var(--primary)]"
                style={{ WebkitAppRegion: "no-drag" }}
                type="button"
                onClick={closeStandaloneWindow}
              >
                <Icon name="close" />
              </button>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold uppercase tracking-wider text-[color:var(--primary)]">
                  Captura rapida
                </p>
                <h1 className="truncate text-3xl font-bold font-headline">
                  Anotacao Rapida
                </h1>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <button
                className="rounded-xl px-4 py-2.5 text-sm font-semibold neo-raised text-[color:var(--on-surface-variant)] transition-all hover:text-[color:var(--error)]"
                style={{ WebkitAppRegion: "no-drag" }}
                type="button"
                onClick={handleDiscardQuickNote}
              >
                Descartar
              </button>
              <button
                className="rounded-xl bg-[color:var(--primary)] px-4 py-2.5 text-sm font-semibold text-[color:var(--on-primary)] neo-raised"
                style={{ WebkitAppRegion: "no-drag" }}
                type="button"
                onClick={handleSaveQuickNote}
              >
                Salvar
              </button>
            </div>
          </div>

          <input
            className="w-full rounded-2xl bg-transparent px-4 py-3 text-2xl font-semibold font-headline text-[color:var(--on-surface)] outline-none transition-all placeholder:text-[color:var(--outline)] hover:neo-pressed focus:neo-pressed focus:ring-2 focus:ring-[color:var(--primary)]/20"
            style={{ WebkitAppRegion: "no-drag" }}
            type="text"
            placeholder="Titulo da nota"
            value={localTitle}
            onChange={(e) => setLocalTitle(e.target.value)}
            readOnly={!canEditSharedNote}
          />
        </header>

        <main className="min-h-0 flex-1 p-6">
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[2rem] bg-[color:var(--background)] shadow-[inset_6px_6px_12px_rgba(0,0,0,0.06),inset_-6px_-6px_12px_rgba(255,255,255,0.5)]">
            <RichTextEditor
              ref={editorRef}
              content={localContent}
              drawings={data.drawings || []}
              onDrawingsChange={(d) => canEditSharedNote && updateNote(data.id, { drawings: d })}
              onChange={(html) => setLocalContent(html)}
              onTimeClick={handleTimestampClick}
              placeholder="Comece a escrever..."
              readOnly={!canEditSharedNote}
            />
          </div>
        </main>
      </div>
    );
  }

  if (noteAiResult?.kind === "flashcards") {
    return (
      <div className="campus-flashcard-confirm-page screen-fade-in">
        <aside className="campus-flashcard-confirm-sidebar">
          <button
            className="campus-flashcard-brand"
            type="button"
            onClick={() => onNavigate?.(SCREEN_IDS.DASHBOARD)}
          >
            <span className="campus-flashcard-brand-mark">
              <Icon name="school" />
            </span>
            <span>masterStudy</span>
          </button>

          <nav aria-label="Navegação da revisão">
            <button type="button" onClick={() => onNavigate?.(SCREEN_IDS.DASHBOARD)}>
              <Icon name="dashboard" />
              Dashboard
            </button>
            <button type="button" onClick={() => onNavigate?.(SCREEN_IDS.CALENDAR)}>
              <Icon name="calendar_month" />
              Calendário
            </button>
            <button type="button" onClick={() => onNavigate?.(SCREEN_IDS.TASKS)}>
              <Icon name="check_box" />
              Tarefas
            </button>
            <button className="is-active" type="button">
              <Icon name="style" />
              Flashcards
            </button>
          </nav>

          <div className="campus-flashcard-ai-badge">
            <Icon name="auto_awesome" />
            <div>
              <strong>Gerado com IA</strong>
              <span>Revise antes de salvar</span>
            </div>
          </div>
        </aside>

        <main className="campus-flashcard-confirm-main">
          <header className="campus-flashcard-confirm-header">
            <button
              className="campus-icon-button"
              type="button"
              title="Voltar para a nota"
              onClick={() => {
                setNoteAiResult(null);
                setFlashcardDrafts([]);
              }}
            >
              <Icon name="arrow_back" />
            </button>
            <div>
              <span>AI GENERATION COMPLETE</span>
              <h1>Revise seus flashcards</h1>
              <p>
                A IA encontrou {flashcardDrafts.length} conceitos em{" "}
                <strong>{localTitle || "esta nota"}</strong>.
              </p>
            </div>
            <div className="campus-flashcard-confirm-actions">
              <button
                className="campus-secondary-button"
                disabled={noteAiBusy}
                type="button"
                onClick={() => runNoteAi("flashcards")}
              >
                <Icon name={noteAiBusy ? "progress_activity" : "refresh"} />
                Gerar novamente
              </button>
              <button
                className="campus-primary-button"
                disabled={
                  noteAiBusy ||
                  !flashcardDrafts.some(
                    (card) => card.front.trim() && card.back.trim(),
                  )
                }
                type="button"
                onClick={applyNoteAiResult}
              >
                <Icon name="add" />
                Adicionar ao deck
              </button>
            </div>
          </header>

          {noteAiError ? (
            <div className="campus-flashcard-error" role="alert">
              <Icon name="error" />
              {noteAiError}
            </div>
          ) : null}

          <section className="campus-flashcard-draft-list">
            {flashcardDrafts.map((card, index) => (
              <article className="campus-flashcard-draft" key={card.id}>
                <div className="campus-flashcard-draft-number">
                  {String(index + 1).padStart(2, "0")}
                </div>
                <label>
                  <span>FRENTE · PERGUNTA</span>
                  <textarea
                    value={card.front}
                    onChange={(event) =>
                      updateFlashcardDraft(card.id, "front", event.target.value)
                    }
                  />
                </label>
                <div className="campus-flashcard-draft-divider" />
                <label>
                  <span>VERSO · RESPOSTA</span>
                  <textarea
                    value={card.back}
                    onChange={(event) =>
                      updateFlashcardDraft(card.id, "back", event.target.value)
                    }
                  />
                </label>
                <button
                  className="campus-flashcard-remove"
                  type="button"
                  title="Excluir flashcard"
                  onClick={() => removeFlashcardDraft(card.id)}
                >
                  <Icon name="delete" />
                </button>
              </article>
            ))}

            {!flashcardDrafts.length ? (
              <div className="campus-flashcard-empty">
                <Icon name="style" />
                <h2>Nenhum flashcard válido foi gerado</h2>
                <p>Volte à nota ou peça para a IA gerar novamente.</p>
              </div>
            ) : null}
          </section>

          <footer className="campus-flashcard-confirm-footer">
            <span>
              <Icon name="verified_user" />
              Nada será salvo sem sua confirmação.
            </span>
            <strong>{flashcardDrafts.length} cartões prontos para revisão</strong>
          </footer>
        </main>
      </div>
    );
  }

  const handleNoteWorkspaceClick = (e) => {
    const chatBtn = e.target.closest(".ai-chat-link-btn, .ai-chat-citation");
    if (chatBtn) {
      e.preventDefault();
      e.stopPropagation();
      const threadId = chatBtn.getAttribute("data-thread-id") || "";
      const msgId = chatBtn.getAttribute("data-msg-id") || "";
      setTargetChatThreadId(threadId);
      setTargetChatMessageId(msgId);
      setIsChatModalOpen(true);
    }
  };

  return (
    <div className={`campus-note-workspace screen-fade-in ${isImmersed ? "is-immersed" : ""}`}>
      <header
        className="campus-note-topbar"
        style={isStandaloneWindow ? { WebkitAppRegion: "drag" } : undefined}
      >
        <div className="campus-note-topbar-left">
          <button
            className="campus-note-icon-button"
            style={
              isStandaloneWindow ? { WebkitAppRegion: "no-drag" } : undefined
            }
            onClick={() => {
              if (isStandaloneWindow) {
                window.close();
                return;
              }
              onNavigate && onNavigate("BACK");
            }}
          >
            <Icon name={isStandaloneWindow ? "close" : "arrow_back"} />
          </button>
          <div className="campus-note-breadcrumb">
            <span>
              {selectedAcademicSubject?.name || data.module || "Biblioteca de notas"}
            </span>
            <h2>{data.category || "Anotacao livre"}</h2>
          </div>
        </div>

        <div className="campus-note-topbar-actions">
          <span className="campus-note-save-state">
            <Icon
              name={
                data.content === localContent && data.title === localTitle
                  ? "cloud_done"
                  : "edit"
              }
            />
            {!canEditSharedNote
              ? data.sharingPermission === "commenter"
                ? "Compartilhada · pode comentar"
                : "Compartilhada · somente leitura"
              : data.content === localContent && data.title === localTitle
                ? isOnlineSharedNote
                  ? "Salvo e sincronizado"
                  : "Salvo automaticamente"
                : "Salvando alterações..."}
          </span>
          {canEditSharedNote ? <button
            className="campus-note-outline-button"
            type="button"
            onClick={handleDiscardChanges}
            style={
              isStandaloneWindow ? { WebkitAppRegion: "no-drag" } : undefined
            }
          >
            <Icon name="undo" />
            Descartar
          </button> : null}
          <button
            className="campus-note-outline-button"
            type="button"
            disabled={pdfExporting}
            onClick={handleSaveAsPdf}
            style={
              isStandaloneWindow ? { WebkitAppRegion: "no-drag" } : undefined
            }
            title="Salvar esta nota como documento PDF"
          >
            <Icon name="picture_as_pdf" />
            {pdfExporting ? "Gerando..." : "Salvar como PDF"}
          </button>
          <button
            className="campus-note-dark-button"
            type="button"
            onClick={handleSaveNote}
            style={
              isStandaloneWindow ? { WebkitAppRegion: "no-drag" } : undefined
            }
          >
            <Icon name={canEditSharedNote ? "save" : "close"} />
            {canEditSharedNote ? "Salvar" : "Fechar"}
          </button>
        </div>
      </header>

      {/* Save Template Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-[color:var(--background)] rounded-3xl w-full max-w-md neo-raised p-8 flex flex-col"
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-[color:var(--on-surface)] flex items-center gap-2">
                <Icon className="text-[color:var(--tertiary)]" name="save_as" />
                Salvar Modelo
              </h3>
              <button
                onClick={() => setShowSaveModal(false)}
                className="text-[color:var(--on-surface-variant)] hover:text-red-500"
              >
                <Icon name="close" />
              </button>
            </div>
            <p className="text-xs text-[color:var(--on-surface-variant)] mb-4 leading-relaxed">
              Digite um nome para este modelo. Ele ficara disponivel para reuso na criacao de novas notas.
            </p>
            <input
              type="text"
              placeholder="Ex: Formato de Aula Teorica"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              className="w-full bg-[color:var(--surface-container-high)] text-[color:var(--on-surface)] text-sm rounded-xl p-3 outline-none border border-[color:var(--outline-variant)]/30 mb-6"
            />
            <div className="flex justify-end gap-3">
              <button
                className="px-4 py-2 text-xs font-bold text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-container)] rounded-xl"
                onClick={() => setShowSaveModal(false)}
              >
                Cancelar
              </button>
              <button
                className="px-4 py-2 text-xs font-bold text-white bg-[color:var(--primary)] hover:bg-indigo-600 rounded-xl shadow-md"
                onClick={confirmSaveTemplate}
              >
                Salvar Modelo
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <main className="campus-note-layout" onClick={handleNoteWorkspaceClick}>
        <section className="campus-note-main-column">
          <div className="campus-note-document-header">
            <div>
              <span className="campus-note-eyebrow">
                {data.category === "Nota de aula" || data.classLogId ? `NOTA DE AULA · ${selectedAcademicSubject?.name || "Disciplina"}${data.date ? ` · ${new Date(`${data.date}T12:00:00`).toLocaleDateString("pt-BR")}` : ""}` : selectedAcademicSubject?.code || "MATERIAL DE ESTUDO"}
              </span>
              <input
                className="campus-note-title-input"
                type="text"
                placeholder="Titulo da nota"
                value={localTitle}
                onChange={(e) => setLocalTitle(e.target.value)}
                readOnly={!canEditSharedNote}
                style={
                  isStandaloneWindow ? { WebkitAppRegion: "no-drag" } : undefined
                }
              />
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {canEditSharedNote ? <button
                  type="button"
                  onClick={pickAttachments}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[color:var(--surface-container-high)] text-[color:var(--on-surface)] text-xs font-bold hover:bg-[color:var(--primary)]/10 hover:text-[color:var(--primary)] transition-all border border-[color:var(--outline-variant)]/20 shadow-sm"
                >
                  <Icon name="attach_file" className="text-[14px]" />
                  <span>Anexar Arquivo</span>
                </button> : (
                  <span className="inline-flex items-center gap-1.5 rounded-xl bg-blue-500/10 px-3 py-1 text-xs font-bold text-blue-600">
                    <Icon name="group" className="text-[14px]" /> Conteúdo compartilhado
                  </span>
                )}

                {(data.attachments || []).map((path) => {
                  const fileName = path.split(/[\\/]/).pop();
                  const ext = fileName.split(".").pop().toLowerCase();
                  const isPdf = ext === "pdf";
                  return (
                    <div
                      key={path}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[color:var(--surface-container)] text-xs font-semibold border border-[color:var(--outline-variant)]/20 text-[color:var(--on-surface)] shadow-sm"
                    >
                      <Icon
                        name={isPdf ? "picture_as_pdf" : "description"}
                        className={`text-[14px] ${isPdf ? "text-rose-500" : "text-[color:var(--primary)]"}`}
                      />
                      <button
                        type="button"
                        onClick={() => window.studyhubDesktop?.openPath?.(path)}
                        title={`Abrir arquivo: ${path}`}
                        className="hover:underline font-bold text-[11px] max-w-[150px] truncate"
                      >
                        {fileName}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateNote(data.id, {
                            attachments: (data.attachments || []).filter((item) => item !== path),
                          })
                        }
                        title="Remover anexo"
                        className="text-[color:var(--on-surface-variant)] hover:text-rose-500 transition-colors ml-0.5"
                      >
                        <Icon name="close" className="text-[12px]" />
                      </button>
                    </div>
                  );
                })}

                {(data.attachments || []).length > 0 && (
                  <button
                    type="button"
                    onClick={() => runNoteAi("from-attachments")}
                    disabled={noteAiBusy}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-bold shadow-sm hover:opacity-95 transition-all disabled:opacity-50"
                  >
                    <Icon name="auto_awesome" className="text-[14px]" />
                    <span>Sintetizar Anexos com IA</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleAddTopicsAbordados}
                  disabled={noteAiBusy}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-300 border border-purple-500/30 text-xs font-bold shadow-sm hover:bg-purple-600 hover:text-white transition-all cursor-pointer disabled:opacity-50"
                  title="Gerar por IA ou adicionar bloco de Conteúdos Abordados"
                >
                  <Icon name="fact_check" className="text-[14px] text-amber-500" />
                  <span>Conteúdos Abordados</span>
                </button>

                {noteAiStatus?.available && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-300 border border-purple-500/30 text-xs font-bold shadow-xs">
                    <Icon name="psychology" className="text-[14px] text-purple-500" />
                    <select
                      value={selectedAiModel || noteAiModel}
                      onChange={(e) => setSelectedAiModel(e.target.value)}
                      className="bg-transparent outline-none font-bold text-xs cursor-pointer text-purple-700 dark:text-purple-300"
                      title="Escolher modelo de IA para funcionalidades"
                    >
                      {visibleAiModelOptions.map((m) => (
                        <option key={m.value} value={m.value} className="bg-[color:var(--surface)] text-[color:var(--on-surface)]">
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
            <div className="campus-note-document-actions">
              {data.parentNoteId && canEditSharedNote ? (
                <button className="campus-note-outline-button" type="button" onClick={handleDeleteInternalNote}>
                  <Icon name="delete" /> Excluir nota interna
                </button>
              ) : null}
              <button
                className="campus-note-subtle-button"
                type="button"
                onClick={() => setShowSaveModal(true)}
              >
                <Icon name="bookmark_add" />
                Salvar modelo
              </button>

              <button
                className="campus-note-icon-button"
                type="button"
                onClick={() =>
                  setSidePanel((current) =>
                    current === "ai" ? "layout" : current === "layout" ? "details" : "ai",
                  )
                }
                title="Alternar painel"
              >
                <Icon name={sidePanel === "ai" ? "tune" : sidePanel === "layout" ? "info" : "auto_awesome"} />
              </button>
            </div>
          </div>
          <div className="campus-note-editor-surface">
            <RichTextEditor
              ref={editorRef}
              content={localContent}
              drawings={data.drawings || []}
              onDrawingsChange={(d) => canEditSharedNote && updateNote(data.id, { drawings: d })}
              onChange={(html) => setLocalContent(html)}
              onSelectionChange={setSelectedNoteText}
              onNestedNoteClick={(childId) => setActiveNote(childId)}
              onCreateNestedNote={handleCreateEmbeddedChildNote}
              nestedNoteTitle={`Nota interna — ${data.title || "Sem título"}`}
              onTimeClick={handleTimestampClick}
              onAiChatLinkClick={({ threadId, msgId }) => {
                setTargetChatThreadId(threadId);
                setTargetChatMessageId(msgId);
                setIsChatModalOpen(true);
              }}
              onAddTopicsAbordados={handleAddTopicsAbordados}
              placeholder="Comece a digitar..."
              readOnly={!isEditing || !canEditSharedNote}
              documentMode
              displaySettings={data.displaySettings}
            />
          </div>
        </section>

        <aside className="campus-note-side-column">
          <div className="campus-note-side-header">
            <h3>
              <Icon name={
                sidePanel === "ai" ? "auto_awesome" : 
                sidePanel === "layout" ? "dashboard_customize" : "tune"
              } />
              {
                sidePanel === "ai" ? "Assistente IA" : 
                sidePanel === "layout" ? "Layout da Página" : "Detalhes"
              }
            </h3>
          </div>

          <div className="campus-note-side-content custom-scrollbar">
            {isOnlineSharedNote ? (
              <>
                <SharedNoteCollaborationPanel note={data} />
                {sharedSyncMessage ? (
                  <p className="rounded-xl bg-blue-500/10 p-3 text-[10px] font-bold text-blue-700 dark:text-blue-300" role="status">
                    {sharedSyncMessage}
                  </p>
                ) : null}
              </>
            ) : null}
            {sidePanel === "layout" ? (
              <div className="campus-note-details-stack">
                <div className="campus-note-side-card">
                  <p className="campus-note-card-label mb-2">Largura da Página</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      disabled={!canEditSharedNote}
                      onClick={() => canEditSharedNote && updateNote(data.id, { displaySettings: { ...data.displaySettings, maxWidth: 'standard' } })}
                      className={`flex-1 min-w-[100px] flex flex-col items-center gap-2 p-2 rounded-xl border transition-all ${
                        data.displaySettings?.maxWidth === "standard" 
                          ? "bg-[color:var(--primary)] text-white border-[color:var(--primary)] shadow-md" 
                          : "bg-[color:var(--surface)] text-[color:var(--on-surface-variant)] border-[color:var(--outline-variant)]/30 hover:border-[color:var(--primary)]/50 hover:bg-[color:var(--surface-container)]"
                      }`}
                    >
                      <Icon name="narrow_side_panel" className="text-xl" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-center leading-tight">Padrão</span>
                    </button>
                    <button
                      disabled={!canEditSharedNote}
                      onClick={() => canEditSharedNote && updateNote(data.id, { displaySettings: { ...data.displaySettings, maxWidth: 'full' } })}
                      className={`flex-1 min-w-[100px] flex flex-col items-center gap-2 p-2 rounded-xl border transition-all ${
                        data.displaySettings?.maxWidth === "full" 
                          ? "bg-[color:var(--primary)] text-white border-[color:var(--primary)] shadow-md" 
                          : "bg-[color:var(--surface)] text-[color:var(--on-surface-variant)] border-[color:var(--outline-variant)]/30 hover:border-[color:var(--primary)]/50 hover:bg-[color:var(--surface-container)]"
                      }`}
                    >
                      <Icon name="width_full" className="text-xl" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-center leading-tight">Total</span>
                    </button>
                  </div>
                </div>

                <div className="campus-note-side-card">
                  <p className="campus-note-card-label mb-2">Marcação de Linhas</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      disabled={!canEditSharedNote}
                      onClick={() => canEditSharedNote && updateNote(data.id, { displaySettings: { ...data.displaySettings, lineMarking: 'none' } })}
                      className={`flex-1 min-w-[80px] flex flex-col items-center gap-2 p-2 rounded-xl border transition-all ${
                        data.displaySettings?.lineMarking === "none" 
                          ? "bg-[color:var(--primary)] text-white border-[color:var(--primary)] shadow-md" 
                          : "bg-[color:var(--surface)] text-[color:var(--on-surface-variant)] border-[color:var(--outline-variant)]/30 hover:border-[color:var(--primary)]/50 hover:bg-[color:var(--surface-container)]"
                      }`}
                    >
                      <Icon name="format_align_justify" className="text-xl" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-center leading-tight">Nenhuma</span>
                    </button>
                    <button
                      disabled={!canEditSharedNote}
                      onClick={() => canEditSharedNote && updateNote(data.id, { displaySettings: { ...data.displaySettings, lineMarking: 'ruled' } })}
                      className={`flex-1 min-w-[80px] flex flex-col items-center gap-2 p-2 rounded-xl border transition-all ${
                        data.displaySettings?.lineMarking === "ruled" 
                          ? "bg-[color:var(--primary)] text-white border-[color:var(--primary)] shadow-md" 
                          : "bg-[color:var(--surface)] text-[color:var(--on-surface-variant)] border-[color:var(--outline-variant)]/30 hover:border-[color:var(--primary)]/50 hover:bg-[color:var(--surface-container)]"
                      }`}
                    >
                      <Icon name="notes" className="text-xl" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-center leading-tight">Pautada</span>
                    </button>
                    <button
                      disabled={!canEditSharedNote}
                      onClick={() => canEditSharedNote && updateNote(data.id, { displaySettings: { ...data.displaySettings, lineMarking: 'grid' } })}
                      className={`flex-1 min-w-[80px] flex flex-col items-center gap-2 p-2 rounded-xl border transition-all ${
                        data.displaySettings?.lineMarking === "grid" 
                          ? "bg-[color:var(--primary)] text-white border-[color:var(--primary)] shadow-md" 
                          : "bg-[color:var(--surface)] text-[color:var(--on-surface-variant)] border-[color:var(--outline-variant)]/30 hover:border-[color:var(--primary)]/50 hover:bg-[color:var(--surface-container)]"
                      }`}
                    >
                      <Icon name="grid_4x4" className="text-xl" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-center leading-tight">Grade</span>
                    </button>
                  </div>
                </div>

                <div className="campus-note-side-card">
                  <p className="campus-note-card-label mb-2">Estilo de Layout</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      disabled={!canEditSharedNote}
                      onClick={() => canEditSharedNote && updateNote(data.id, { displaySettings: { ...data.displaySettings, pageLayout: 'infinite' } })}
                      className={`flex-1 min-w-[100px] flex flex-col items-center gap-2 p-2 rounded-xl border transition-all ${
                        data.displaySettings?.pageLayout === "infinite" 
                          ? "bg-[color:var(--primary)] text-white border-[color:var(--primary)] shadow-md" 
                          : "bg-[color:var(--surface)] text-[color:var(--on-surface-variant)] border-[color:var(--outline-variant)]/30 hover:border-[color:var(--primary)]/50 hover:bg-[color:var(--surface-container)]"
                      }`}
                    >
                      <Icon name="expand_more" className="text-xl" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-center leading-tight">Infinito</span>
                    </button>
                    <button
                      disabled={!canEditSharedNote}
                      onClick={() => canEditSharedNote && updateNote(data.id, { displaySettings: { ...data.displaySettings, pageLayout: 'paged' } })}
                      className={`flex-1 min-w-[100px] flex flex-col items-center gap-2 p-2 rounded-xl border transition-all ${
                        data.displaySettings?.pageLayout === "paged" 
                          ? "bg-[color:var(--primary)] text-white border-[color:var(--primary)] shadow-md" 
                          : "bg-[color:var(--surface)] text-[color:var(--on-surface-variant)] border-[color:var(--outline-variant)]/30 hover:border-[color:var(--primary)]/50 hover:bg-[color:var(--surface-container)]"
                      }`}
                    >
                      <Icon name="description" className="text-xl" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-center leading-tight">Paginado</span>
                    </button>
                  </div>
                </div>
                
                <div className="p-3 bg-[color:var(--surface-container-low)] rounded-2xl border border-[color:var(--outline-variant)]/20 mt-2">
                   <p className="text-[10px] leading-relaxed text-[color:var(--on-surface-variant)]">
                     <Icon name="info" className="text-xs mr-1 inline-block align-text-top" />
                     O modo de páginas simula o formato A4. A marcação de linhas ajuda a organizar o conteúdo visualmente.
                   </p>
                </div>
              </div>
            ) : sidePanel === "details" ? (
              <div className="campus-note-details-stack">
            {/* Note Properties */}
            <div className="campus-note-side-card">
              <h4>Propriedades</h4>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider">
                  Tipo de Nota
                </label>
                <select
                  value={data.category || "Anotação Livre"}
                  onChange={(e) =>
                    updateNote(data.id, { category: e.target.value })
                  }
                  disabled={!isEditing || !canEditSharedNote}
                  className="w-full bg-[color:var(--surface)] border border-[color:var(--outline-variant)]/30 rounded-xl py-3 px-4 outline-none focus:border-[color:var(--primary)] text-sm text-[color:var(--on-surface)] cursor-pointer shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  <option value="Anotação Livre">Anotação Livre</option>
                  <option value="Resumo">Resumo</option>
                  <option value="Revisão">Revisão</option>
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider">
                  Semestre
                </label>
                <AppSelect
                  ariaLabel="Selecionar semestre da nota"
                  value={selectedAcademicSemesterId || ""}
                  onChange={selectAcademicSemester}
                  options={academic.semesters.map((semester) => ({
                    value: semester.id,
                    label: semester.name,
                  }))}
                  placeholder="Selecionar semestre"
                  disabled={!isEditing || !canEditSharedNote || !data.id}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider">
                  Matéria
                </label>
                <AppSelect
                  ariaLabel="Selecionar matéria da nota"
                  value={data.academicSubjectId || ""}
                  onChange={selectAcademicSubject}
                  options={[
                    { value: "", label: "Sem matéria" },
                    ...availableAcademicSubjects.map((subject) => ({
                      value: subject.id,
                      label: subject.name,
                    })),
                  ]}
                  placeholder={
                    availableAcademicSubjects.length
                      ? "Selecionar matéria"
                      : "Nenhuma matéria neste semestre"
                  }
                  disabled={
                    !isEditing || !canEditSharedNote || !data.id || !selectedAcademicSemesterId
                  }
                />
                <p className="text-[11px] leading-4 text-[color:var(--on-surface-variant)]">
                  As matérias exibidas pertencem ao semestre selecionado. O
                  vínculo é salvo automaticamente.
                </p>
                {data.academicSubjectId ? (
                  <button
                    className="rounded-xl px-3 py-2 text-xs font-black text-[color:var(--primary)] neo-raised"
                    type="button"
                    onClick={openAcademicAssistant}
                  >
                    <Icon className="mr-1 text-[16px]" name="auto_awesome" />
                    Abrir plano e IA da matéria
                  </button>
                ) : null}
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[10px] font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider">
                    Anexos
                  </label>
                  <button
                    className="text-[10px] font-black text-[color:var(--primary)]"
                    type="button"
                    onClick={pickAttachments}
                    disabled={!canEditSharedNote}
                  >
                    Adicionar
                  </button>
                </div>
                {(data.attachments || []).map((path) => (
                  <div
                    key={path}
                    className="flex items-center gap-2 rounded-xl bg-[color:var(--surface)] p-2.5"
                  >
                    <button
                      className="min-w-0 flex-1 truncate text-left text-xs font-bold text-[color:var(--primary)]"
                      type="button"
                      title={path}
                      onClick={() => window.studyhubDesktop?.openPath?.(path)}
                    >
                      <Icon className="mr-1 text-[15px]" name="attach_file" />
                      {path.split(/[\\/]/).pop()}
                    </button>
                    <button
                      className="text-[color:var(--error)]"
                      type="button"
                      disabled={!canEditSharedNote}
                      onClick={() =>
                        canEditSharedNote && updateNote(data.id, {
                          attachments: data.attachments.filter(
                            (item) => item !== path,
                          ),
                        })
                      }
                    >
                      <Icon className="text-[15px]" name="close" />
                    </button>
                  </div>
                ))}
                {!data.attachments?.length ? (
                  <p className="text-[11px] text-[color:var(--on-surface-variant)]">
                    PDFs, imagens e outros arquivos ficam vinculados localmente.
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-2 mt-2">
                <label className="text-[10px] font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider">
                  Cor de Destaque
                </label>
                <div className="flex items-center gap-3">
                  {["primary", "secondary", "tertiary", "error"].map(
                    (color) => (
                      <button
                        key={color}
                        type="button"
                        aria-label={`Cor de destaque: ${color}`}
                        onClick={() =>
                          canEditSharedNote && updateNote(data.id, { accent: color })
                        }
                        disabled={!isEditing || !canEditSharedNote}
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${data.accent === color ? "neo-inset ring-2 ring-[color:var(--on-surface)]" : "neo-raised hover:scale-110"} ${!isEditing || !canEditSharedNote ? "opacity-70 cursor-not-allowed" : ""}`}
                        style={{ backgroundColor: `var(--${color})` }}
                      >
                        {data.accent === color && (
                          <Icon
                            name="check"
                            className="text-white text-[14px]"
                          />
                        )}
                      </button>
                    ),
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2 mt-2">
                <label className="text-[10px] font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider">
                  Tags Extras
                </label>
                {isEditing && canEditSharedNote && (
                  <input
                    type="text"
                    placeholder="Adicionar tag (ex: #prova) e Enter"
                    value={extraTagInput}
                    onChange={(e) => setExtraTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addExtraTag();
                      }
                    }}
                    className="w-full bg-[color:var(--surface)] border border-[color:var(--outline-variant)]/30 rounded-xl py-3 px-4 outline-none focus:border-[color:var(--primary)] text-sm text-[color:var(--on-surface)] neo-inset"
                  />
                )}
                {data.tags && data.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {data.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-1 rounded-md text-[10px] font-bold text-[color:var(--primary)] bg-[color:var(--primary)]/10 flex items-center gap-1 border border-[color:var(--primary)]/20 shadow-sm"
                      >
                        {tag}
                        <button
                          onClick={() =>
                            canEditSharedNote &&
                            updateNote(data.id, {
                              tags: data.tags.filter((t) => t !== tag),
                            })
                          }
                          className={`transition-colors ${canEditSharedNote ? "hover:text-[color:var(--error)] cursor-pointer" : "cursor-default opacity-50"}`}
                          disabled={!isEditing || !canEditSharedNote}
                        >
                          <Icon name="close" className="text-[12px]" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Reference Item 1 (Source) */}
            {data.sourceLessonId || data.sourceModuleId ? (
              <div className="campus-note-side-card">
                <h4>Origem da anotacao</h4>
                {data.sourceLessonId && (
                  <button
                    className="w-full p-3 rounded-xl flex items-center gap-3 bg-[color:var(--surface)] neo-raised hover:text-[color:var(--primary)] transition-colors text-left"
                    onClick={() => openSourceLesson()}
                  >
                    <Icon
                      name="play_circle"
                      className="text-[color:var(--primary)] shrink-0"
                    />
                    <span className="text-xs font-medium line-clamp-2">
                      {data.sourceLessonTitle || "Acessar Aula"}
                    </span>
                  </button>
                )}
                {data.sourceModuleId && (
                  <button
                    className="w-full p-3 rounded-xl flex items-center gap-3 bg-[color:var(--surface)] neo-raised hover:text-[color:var(--secondary)] transition-colors text-left"
                    onClick={() => {
                      const store = useStudyStore.getState();
                      if (data.sourceCourseId)
                        store.setActiveCourse(data.sourceCourseId);
                      store.setActiveModule(data.sourceModuleId);
                      onNavigate && onNavigate(SCREEN_IDS.MODULE_DETAILS);
                    }}
                  >
                    <Icon
                      name="folder"
                      className="text-[color:var(--secondary)] shrink-0"
                    />
                    <span className="text-xs font-medium line-clamp-2">
                      Acessar Módulo
                    </span>
                  </button>
                )}
              </div>
            ) : (
              <div className="campus-note-side-card">
                <h4>Contexto</h4>
                <p className="text-[11px] text-[color:var(--on-surface-variant)] leading-relaxed">
                  Criado de forma independente na biblioteca.
                </p>
              </div>
            )}

            {/* Reference Item 2 */}
            {data.reference?.image && (
              <div className="p-4 rounded-2xl neo-pressed bg-[color:var(--background)] flex flex-col gap-3">
                <div
                  className="w-full h-32 rounded-xl bg-cover bg-center neo-raised"
                  style={{ backgroundImage: `url('${data.reference.image}')` }}
                ></div>
                {data.reference?.imageCaption && (
                  <span className="text-xs font-semibold text-[color:var(--on-surface-variant)] text-center uppercase tracking-wider">
                    {data.reference.imageCaption}
                  </span>
                )}
              </div>
            )}
              </div>
            ) : (
            <div className="campus-note-ai-stack">
              {!noteAiStatus?.available ? (
                <div className="campus-note-ai-offline">
                  <p className="text-sm font-extrabold text-amber-800">
                    {noteAiStatus?.provider === "gemini" ? "Google Gemini não configurado" : "IA local desconectada"}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-amber-700">
                    {window.studyhubDesktop?.academicAI
                      ? noteAiStatus?.provider === "gemini"
                        ? "Configure sua chave Gemini nas Configurações de IA para analisar esta nota."
                        : "Inicie o Ollama para analisar esta nota sem enviar o conteúdo para a nuvem."
                      : noteAiStatus?.supported
                        ? "Carregue a IA diretamente no navegador. O modelo será baixado somente na primeira utilização."
                        : "Seu navegador precisa oferecer WebGPU para executar a IA local."}
                  </p>
                  <button
                    className="mt-3 rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                    disabled={noteAiBusy || (!window.studyhubDesktop?.academicAI && !noteAiStatus?.supported)}
                    type="button"
                    onClick={startNoteAi}
                  >
                    {noteAiBusy
                      ? "Carregando..."
                      : window.studyhubDesktop?.academicAI
                        ? noteAiStatus?.provider === "gemini" ? "Configurar Gemini" : "Iniciar Ollama"
                        : "Iniciar IA no navegador"}
                  </button>
                </div>
              ) : (
                <>
                  <div className="p-3.5 rounded-2xl bg-[color:var(--surface)] border border-[color:var(--outline-variant)]/30 shadow-xs flex flex-col gap-2 mb-3">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-[color:var(--on-surface-variant)] uppercase tracking-wider flex items-center gap-1.5">
                        <Icon name="psychology" className="text-sm text-[color:var(--primary)]" />
                        <span>Modelo de IA</span>
                      </label>
                      <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        {noteAiStatus?.provider === "webllm" ? "WebLLM Ativo" : noteAiStatus?.provider === "gemini" ? "Gemini Conectado" : "Ollama Conectado"}
                      </span>
                    </div>
                    <select
                      value={selectedAiModel || noteAiModel}
                      onChange={(e) => setSelectedAiModel(e.target.value)}
                      className="w-full bg-[color:var(--surface-container)] border border-[color:var(--outline-variant)]/40 rounded-xl py-2 px-3 outline-none focus:border-[color:var(--primary)] text-xs font-extrabold text-[color:var(--on-surface)] cursor-pointer shadow-xs transition-all"
                    >
                      {visibleAiModelOptions.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="campus-note-ai-grid">
                    {[
                      {
                        kind: "summary",
                        label: "Gerar resumo",
                        icon: "summarize",
                      },
                      {
                        kind: "topics",
                        label: "Extrair tópicos",
                        icon: "format_list_bulleted",
                      },
                      {
                        kind: "questions",
                        label: "Criar questões",
                        icon: "quiz",
                      },
                      {
                        kind: "flashcards",
                        label: "Flashcards",
                        icon: "style",
                      },
                      {
                        kind: "mindmap",
                        label: "Mapa Mental",
                        icon: "schema",
                      },
                      {
                        kind: "concepts",
                        label: "Conceitos",
                        icon: "lightbulb",
                      },
                      {
                        kind: "from-attachments",
                        label: "Dos Anexos",
                        icon: "folder_zip",
                      },
                    ].map((action) => {
                      const isDisabled =
                        noteAiBusy ||
                        (action.kind === "from-attachments"
                          ? !(data.attachments && data.attachments.length > 0)
                          : !localContent.trim() && !(data.attachments && data.attachments.length > 0));

                      return (
                        <button
                          key={action.kind}
                          className="flex min-h-[80px] flex-col items-center justify-center gap-1 rounded-xl border border-[color:var(--outline-variant)]/40 bg-[color:var(--surface)] p-2 text-center text-[10px] font-bold text-[color:var(--on-surface)] shadow-sm transition-all hover:-translate-y-0.5 hover:border-[color:var(--primary)]/50 hover:text-[color:var(--primary)] disabled:opacity-45"
                          disabled={isDisabled}
                          type="button"
                          onClick={() => runNoteAi(action.kind)}
                        >
                          <Icon
                            className="text-[20px]"
                            name={action.icon}
                          />
                          {action.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="campus-note-side-card">
                    <p className="campus-note-card-label">Explicar selecao</p>
                    <p className="mt-3 line-clamp-4 border-l-2 border-[color:var(--primary)] bg-[color:var(--surface-container)] p-3 text-xs italic leading-5 text-[color:var(--on-surface-variant)]">
                      {selectedNoteText ||
                        "Selecione um trecho no editor para receber uma explicação contextual."}
                    </p>
                    <button
                      className="mt-3 w-full rounded-lg border border-[color:var(--outline-variant)]/50 px-3 py-2 text-xs font-bold text-[color:var(--primary)] disabled:opacity-40"
                      disabled={
                        noteAiBusy || !selectedNoteText || !localContent.trim()
                      }
                      type="button"
                      onClick={() => runNoteAi("explain")}
                    >
                      <Icon className="mr-1 text-[16px]" name="auto_awesome" />
                      Explicar trecho
                    </button>
                  </div>

                  <div className="campus-note-side-card">
                    <p className="campus-note-card-label">Ajustar Tom</p>
                    <div className="tone-selector-container">
                      {[
                        { id: "tone-formal", label: "Formal", icon: "school" },
                        { id: "tone-child", label: "Didático", icon: "child_care" },
                        { id: "tone-concise", label: "Conciso", icon: "compress" },
                      ].map((tone) => (
                        <button
                          key={tone.id}
                          type="button"
                          onClick={() => setActiveTone(tone.id)}
                          className={`tone-button ${activeTone === tone.id ? "active" : ""}`}
                        >
                          <Icon className="text-sm" name={tone.icon} />
                          {tone.label}
                        </button>
                      ))}
                    </div>
                    <button
                      className="mt-3 w-full rounded-lg border border-[color:var(--outline-variant)]/50 px-3 py-2 text-xs font-bold text-[color:var(--primary)] disabled:opacity-40"
                      disabled={noteAiBusy || !localContent.trim()}
                      type="button"
                      onClick={() => runNoteAi("tone")}
                    >
                      <Icon className="mr-1 text-[16px]" name="auto_fix_high" />
                      Reescrever texto
                    </button>
                  </div>

                  {/* ChatGPT Window Launcher Card */}
                  <div className="campus-note-side-card bg-gradient-to-br from-[color:var(--primary)]/10 via-[color:var(--surface-container)] to-[color:var(--surface-container)] border border-[color:var(--primary)]/30 shadow-md">
                    <div className="flex items-center justify-between gap-1 mb-2">
                      <div className="flex items-center gap-1.5">
                        <Icon name="psychology" className="text-xl text-[color:var(--primary)]" />
                        <h4 className="text-xs font-black text-[color:var(--on-surface)]">
                          ChatGPT da Nota
                        </h4>
                      </div>
                      {Array.isArray(data.aiChats) && data.aiChats.length > 0 && (
                        <span className="text-[10px] font-bold text-[color:var(--primary)] bg-[color:var(--primary)]/10 px-2 py-0.5 rounded-full border border-[color:var(--primary)]/20">
                          {data.aiChats.length} conversa(s)
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[color:var(--on-surface-variant)] leading-relaxed mb-3">
                      Abra uma janela dedicada de Chat com IA com histórico de conversas salvo, suporte a anexos e respostas no estilo ChatGPT.
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsChatModalOpen(true)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[color:var(--primary)] text-white text-xs font-bold shadow-md hover:opacity-90 transition-all"
                    >
                      <Icon name="open_in_new" className="text-sm" />
                      Abrir Chat em Nova Janela
                    </button>
                  </div>

                  <div className="campus-note-side-card">
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <label className="campus-note-card-label">
                        Pergunte sobre a nota / anexos
                      </label>
                      {data.attachments && data.attachments.length > 0 && (
                        <span className="text-[10px] font-bold text-[color:var(--primary)] flex items-center gap-0.5">
                          <Icon name="attach_file" className="text-[12px]" />
                          {data.attachments.length} anexo(s)
                        </span>
                      )}
                    </div>

                    {data.attachments && data.attachments.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => setSelectedAttachmentForAi("")}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all border ${
                            !selectedAttachmentForAi
                              ? "bg-[color:var(--primary)] text-white border-[color:var(--primary)] shadow-sm"
                              : "bg-[color:var(--surface)] text-[color:var(--on-surface-variant)] border-[color:var(--outline-variant)]/30 hover:border-[color:var(--primary)]/40"
                          }`}
                        >
                          Todos os anexos
                        </button>
                        {data.attachments.map((path) => {
                          const fileName = path.split(/[\\/]/).pop();
                          const isSelected = selectedAttachmentForAi === path;
                          return (
                            <button
                              key={path}
                              type="button"
                              title={path}
                              onClick={() => setSelectedAttachmentForAi(isSelected ? "" : path)}
                              className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all truncate max-w-[140px] border ${
                                isSelected
                                  ? "bg-[color:var(--primary)] text-white border-[color:var(--primary)] shadow-sm"
                                  : "bg-[color:var(--surface)] text-[color:var(--on-surface-variant)] border-[color:var(--outline-variant)]/30 hover:border-[color:var(--primary)]/40"
                              }`}
                            >
                              📄 {fileName}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <textarea
                      className="mt-2 min-h-[82px] w-full resize-none rounded-xl border border-[color:var(--outline-variant)]/45 bg-[color:var(--surface)] p-3 text-sm outline-none focus:border-[color:var(--primary)]"
                      placeholder={
                        selectedAttachmentForAi
                          ? `Perguntar referente a "${selectedAttachmentForAi.split(/[\\/]/).pop()}"...`
                          : "Ex.: qual é o conceito principal deste material ou anexo?"
                      }
                      value={noteAiQuestion}
                      onChange={(event) =>
                        setNoteAiQuestion(event.target.value)
                      }
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        className="flex-1 rounded-lg bg-[color:var(--on-surface)] px-3 py-2.5 text-xs font-bold text-[color:var(--surface)] disabled:opacity-40"
                        disabled={
                          noteAiBusy ||
                          !noteAiQuestion.trim() ||
                          (!localContent.trim() && !(data.attachments && data.attachments.length > 0))
                        }
                        type="button"
                        onClick={() => runNoteAi("ask")}
                      >
                        {selectedAttachmentForAi ? (
                          <span className="flex items-center justify-center gap-1">
                            <Icon name="psychology" className="text-[15px]" />
                            Perguntar
                          </span>
                        ) : (
                          "Perguntar à IA"
                        )}
                      </button>
                      <button
                        className="rounded-lg bg-[color:var(--primary)] px-3 py-2.5 text-xs font-bold text-white shadow-sm flex items-center justify-center gap-1 hover:opacity-90 transition-all"
                        type="button"
                        onClick={() => setIsChatModalOpen(true)}
                        title="Abrir ChatGPT da Nota em nova janela"
                      >
                        <Icon name="chat" className="text-[15px]" />
                        <span>Chat Completo</span>
                      </button>
                    </div>
                  </div>
                </>
              )}

              {noteAiBusy ? (
                <div
                  className="mt-4 flex items-center gap-3 rounded-xl bg-[color:var(--primary)]/10 p-4"
                  role="status"
                >
                  <Icon
                    className="animate-spin text-xl text-[color:var(--primary)]"
                    name="progress_activity"
                  />
                  <span className="min-w-0 flex-1 text-xs font-bold">
                    Analisando a nota localmente…
                  </span>
                  {noteAiRequestId ? (
                    <button
                      className="text-xs font-extrabold text-[color:var(--error)]"
                      type="button"
                      onClick={cancelNoteAi}
                    >
                      Cancelar
                    </button>
                  ) : null}
                </div>
              ) : null}

              {noteAiResult ? (
                <article className="campus-note-ai-preview">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--primary)]">
                        Prévia para revisão
                      </p>
                      <h4 className="mt-1 text-sm font-extrabold">
                        {noteAiResult.title}
                      </h4>
                    </div>
                    <button
                      className="text-[color:var(--on-surface-variant)]"
                      type="button"
                      onClick={() => setNoteAiResult(null)}
                    >
                      <Icon name="close" />
                    </button>
                  </div>
                  <div className="mt-3 max-h-[300px] overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-[color:var(--on-surface-variant)] custom-scrollbar">
                    {noteAiResult.kind === "flashcards" &&
                    noteAiResult.data?.cards?.length
                      ? noteAiResult.data.cards
                          .map(
                            (card, index) =>
                              `${index + 1}. ${card.front}\n${card.back}`,
                          )
                          .join("\n\n")
                      : noteAiResult.kind === "concepts" && noteAiResult.data
                      ? [
                          ...(noteAiResult.data.concepts || []).map(
                            (c) => `• ${c.term}: ${c.definition}`,
                          ),
                          ...(noteAiResult.data.formulas || []).map(
                            (f) => `• Fórmula: ${f.latex} (${f.context})`,
                          ),
                        ].join("\n")
                      : noteAiResult.content}
                  </div>
                  <button
                    className="mt-4 w-full rounded-lg bg-[color:var(--primary)] px-4 py-2.5 text-xs font-extrabold text-white"
                    type="button"
                    onClick={applyNoteAiResult}
                  >
                    <Icon
                      className="mr-1 text-[16px]"
                      name={
                        noteAiResult.kind === "flashcards" ? "style" : "add"
                      }
                    />
                    {noteAiResult.kind === "flashcards"
                      ? "Criar flashcards"
                      : "Adicionar à nota"}
                  </button>
                </article>
              ) : null}

              {noteAiError ? (
                <p className="mt-4 rounded-xl bg-[color:var(--error)]/10 p-3 text-xs font-bold text-[color:var(--error)]">
                  {noteAiError}
                </p>
              ) : null}
              {noteAiNotice ? (
                <p className="mt-4 rounded-xl bg-emerald-500/10 p-3 text-xs font-bold text-emerald-700">
                  {noteAiNotice}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </aside>
    </main>

    {noteAiBusy && (
      <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in cursor-default">
        <div className="relative w-full max-w-md bg-[color:var(--surface)] border border-purple-500/40 rounded-3xl p-7 shadow-[0_20px_50px_rgba(147,51,234,0.35)] flex flex-col items-center text-center overflow-hidden">
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-purple-600/30 rounded-full blur-3xl animate-pulse" />
          <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-indigo-600/30 rounded-full blur-3xl animate-pulse" />

          <div className="relative mb-5 flex items-center justify-center">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-500 blur-md opacity-75 animate-pulse" />
            <div className="relative w-16 h-16 rounded-3xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-pink-500 flex items-center justify-center text-white shadow-xl border border-purple-300/30">
              <Icon name="auto_awesome" className="text-3xl animate-spin text-amber-300" style={{ animationDuration: '4s' }} />
            </div>
          </div>

          <h3 className="text-lg font-black text-[color:var(--on-surface)] flex items-center gap-2">
            <span>Inteligência Artificial Ativa</span>
          </h3>
          <p className="mt-1.5 text-xs font-bold text-purple-600 dark:text-purple-300">
            {currentAiActionLabel || "Sintetizando conteúdo e arquivos da nota..."}
          </p>

          <div className="w-full mt-6 h-2.5 bg-[color:var(--surface-container-high)] rounded-full overflow-hidden relative border border-purple-500/20">
            <div className="h-full rounded-full bg-gradient-to-r from-purple-600 via-pink-500 to-indigo-600 animate-pulse w-full shadow-md" />
          </div>

          <span className="mt-3 text-[11px] font-medium text-[color:var(--on-surface-variant)] opacity-85">
            {window.studyhubDesktop?.academicAI
              ? "Analisando via modelo neural local Ollama"
              : "Analisando localmente no navegador com WebLLM"}
          </span>

          {noteAiRequestId && (
            <button
              type="button"
              onClick={cancelNoteAi}
              className="mt-6 px-4 py-2 rounded-xl bg-[color:var(--error)]/10 hover:bg-[color:var(--error)]/20 text-[color:var(--error)] text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer border border-[color:var(--error)]/20 shadow-xs"
            >
              <Icon name="close" className="text-sm" />
              Cancelar Execução
            </button>
          )}
        </div>
      </div>
    )}

    {/* Copilot Style Approval Bar */}
    {pendingAiRewrite && (
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[110] animate-bounce-in">
        <div className="flex items-center gap-4 bg-[color:var(--surface)] border-2 border-purple-500/60 rounded-2xl p-3.5 px-6 shadow-[0_16px_50px_rgba(147,51,234,0.4)] backdrop-blur-xl">
          <div className="flex items-center gap-3 pr-4 border-r border-[color:var(--outline-variant)]/30">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-md">
              <Icon name="auto_awesome" className="text-lg text-amber-300 animate-pulse" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-black text-[color:var(--on-surface)] flex items-center gap-1.5">
                <span>Sugestão de Reescrita (Copilot)</span>
              </span>
              <span className="text-[10px] text-purple-600 dark:text-purple-300 font-bold">
                Modificação inserida na nota. Deseja aprovar?
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={acceptCopilotRewrite}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black shadow-md hover:scale-[1.03] transition-all cursor-pointer"
              title={`Aceitar modificação (${shortcutLabel("Mod+Enter")} ou Tab)`}
            >
              <Icon name="check" className="text-base" />
              <span>Aceitar ({shortcutLabel("Mod+Enter")})</span>
            </button>

            <button
              type="button"
              onClick={rejectCopilotRewrite}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[color:var(--surface-container-high)] hover:bg-rose-500/20 text-[color:var(--on-surface-variant)] hover:text-rose-500 border border-[color:var(--outline-variant)]/30 text-xs font-bold transition-all cursor-pointer"
              title="Rejeitar modificação (Esc)"
            >
              <Icon name="close" className="text-base" />
              <span>Rejeitar (Esc)</span>
            </button>
          </div>
        </div>
      </div>
    )}

    <NoteAiChatModal
      isOpen={isChatModalOpen}
      onClose={() => setIsChatModalOpen(false)}
      note={data}
      targetThreadId={targetChatThreadId}
      targetMessageId={targetChatMessageId}
      selectedModel={selectedAiModel || noteAiModel}
      onModelChange={(model) => setSelectedAiModel(model)}
      aiModelOptions={visibleAiModelOptions}
      onUpdateNote={(noteId, updates) => updateNote(noteId, updates)}
      onAppendToNoteContent={(text, meta) => {
        const htmlToAdd = markdownToNoteHtml(text);
        const threadTitle = meta?.threadTitle ? String(meta.threadTitle).trim() : "";
        const threadId = meta?.threadId || "";
        const messageId = meta?.messageId || "";

        const citationBadge = threadTitle
          ? `<p><a class="ai-chat-citation" data-thread-id="${threadId}" data-msg-id="${messageId}" href="#chat-${threadId}" title="Clique para abrir esta conversa no Chat IA">💬 Origem: Chat IA — ${escapeHtml(threadTitle)}</a></p>`
          : "";

        const blockHtml = `<hr>${htmlToAdd}${citationBadge}<p></p>`;

        if (editorRef.current?.appendHtml) {
          editorRef.current.appendHtml(blockHtml);
        } else {
          setLocalContent((previous) => `${previous}${blockHtml}`);
        }
      }}
    />
  </div>
);
}
