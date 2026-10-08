import React, { useState, useMemo, useEffect, useRef } from "react";
import { Icon } from "../ui/Icon";
import { useStudyStore } from "../store/useStore";
import { SCREEN_IDS } from "../app/screenIds";
import {
  createAcademicResourceForm,
  prepareAcademicResource,
  resourceFileName,
} from "../domain/academicResource";
import { calculateSubjectGrade } from "../domain/academic";
import { parseStudyTool, studyToolPrompt, isStructuredStudyTool } from "../domain/studyTools";
import { markdownToNoteHtml } from "../domain/aiStudio";
import { sanitizeGeneratedHtml } from "../utils/sanitizeHtml";
import { getLocalDateKey } from "../utils/dateUtils";
import { ShareModal } from "../components/ShareModal";
import { askWithWebLLM, isWebLlmAvailable } from "../services/webllm";
import {
  collaborationCloud,
  collaborationCloudConfigured,
} from "../services/collaboration-cloud";

const TABS = [
  "Estúdio IA",
  "Visão geral",
  "Aulas",
  "Anotações",
  "Arquivos e links",
  "Tarefas e trabalhos",
  "Provas e notas",
  "Flashcards",
  "Plano de estudos",
  "Pessoas"
];

const sharingPermissionLabels = {
  viewer: "Leitor",
  commenter: "Comentador",
  editor: "Editor",
};

const sharingStatusLabels = {
  pending: "Convite pendente",
  accepted: "Acesso ativo",
  revoked: "Acesso revogado",
  expired: "Convite expirado",
  "pending-server": "Aguardando sincronização",
};

const formatScheduleString = (sch) => {
  if (!sch) return "Horário a definir";
  if (typeof sch === "string") return sch;
  if (typeof sch === "object") {
    const parts = [];
    if (Array.isArray(sch.days)) parts.push(sch.days.join(", "));
    else if (sch.days) parts.push(String(sch.days));
    if (sch.startTime) parts.push(`${sch.startTime}${sch.endTime ? `-${sch.endTime}` : ''}`);
    if (sch.room) parts.push(`Sala ${sch.room}`);
    return parts.join(" • ") || "Horário a definir";
  }
  return String(sch);
};

const formatTextValue = (val, fallback = "") => {
  if (!val) return fallback;
  if (typeof val === "string" || typeof val === "number") return String(val);
  if (typeof val === "object") {
    return val.name || val.label || val.title || JSON.stringify(val);
  }
  return String(val);
};

// Rich Markdown Text Formatter Component
function renderFormattedInlineText(text) {
  if (!text) return null;

  const parts = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(
        <strong key={match.index} className="font-bold text-[color:var(--on-surface)]">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      parts.push(
        <code key={match.index} className="bg-[color:var(--surface-container-high)] text-[color:var(--primary)] font-mono text-xs px-1.5 py-0.5 rounded border border-[color:var(--outline-variant)]/30">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      parts.push(
        <em key={match.index} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts;
}

export function FormattedMarkdown({ content }) {
  if (!content) return null;
  return (
    <div
      className="campus-ai-markdown max-w-none"
      dangerouslySetInnerHTML={{
        __html: sanitizeGeneratedHtml(markdownToNoteHtml(content)),
      }}
    />
  );
}

// Real Ollama Local AI helper
async function generateWithOllama(ollamaUrl, modelName, systemPrompt, userPrompt, format) {
  if (window.studyhubDesktop?.academicAI?.chat) {
    const result = await window.studyhubDesktop.academicAI.chat({
      model: modelName,
      format,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    if (!result?.message) throw new Error("O provedor de IA não retornou nenhuma resposta.");
    return result.message;
  }
  const endpoint = `${ollamaUrl.replace(/\/$/, '')}/api/generate`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelName || "llama3.2",
      prompt: `${systemPrompt}\n\nPergunta do aluno: ${userPrompt}`,
      stream: false,
      ...(format ? { format } : {})
    })
  });

  if (!response.ok) {
    throw new Error(`Erro de conexão com Ollama (Status ${response.status})`);
  }

  const data = await response.json();
  if (!data.response) throw new Error("Ollama não retornou nenhuma resposta.");
  return data.response;
}

// A recursão desenha cada conceito e depois seus filhos, preservando a hierarquia.
function MindMapNode({ node }) {
  return <div className="study-mindmap-node">
    <span>{node.label}</span>
    {node.children.length > 0 && <ul>{node.children.map((child, index) => <li key={index}><MindMapNode node={child} /></li>)}</ul>}
  </div>;
}

export function AcademicSubjectScreenV2({ onNavigate }) {
  const activeSubjectId = useStudyStore((state) => state.activeAcademicSubjectId);
  // Class attendance and linked notes need the active semester from the store.
  const activeSemesterId = useStudyStore((state) => state.academic?.activeSemesterId);
  const subjects = useStudyStore((state) => state.academic?.subjects || []);
  const subject = subjects.find(s => s.id === activeSubjectId);

  const notesList = useStudyStore((state) => state.notes?.list || []);
  const tasksList = useStudyStore((state) => state.tasks?.list || []);
  const flashcardDecks = useStudyStore((state) => state.flashcardDecks || []);
  const courses = useStudyStore((state) => state.courses || []);
  const addNote = useStudyStore((state) => state.addNote);
  const addTask = useStudyStore((state) => state.addTask);
  const updateTask = useStudyStore((state) => state.updateTask);
  const deleteTask = useStudyStore((state) => state.deleteTask);
  const addFlashcardDeck = useStudyStore((state) => state.addFlashcardDeck);
  const deleteFlashcardDeck = useStudyStore((state) => state.deleteFlashcardDeck);
  const setActiveNote = useStudyStore((state) => state.setActiveNote);
  const academicResources = useStudyStore(
    (state) => state.academic?.resources || [],
  );
  const addAcademicEntity = useStudyStore(
    (state) => state.addAcademicEntity,
  );
  const updateAcademicEntity = useStudyStore(
    (state) => state.updateAcademicEntity,
  );
  const deleteAcademicEntity = useStudyStore(
    (state) => state.deleteAcademicEntity,
  );
  const setAcademicAiChats = useStudyStore((state) => state.setAcademicAiChats);
  const createAcademicAiChat = useStudyStore((state) => state.createAcademicAiChat);
  const updateAcademicAiChat = useStudyStore((state) => state.updateAcademicAiChat);
  const deleteAcademicAiChat = useStudyStore((state) => state.deleteAcademicAiChat);
  const aiChatsBySubject = useStudyStore((state) => state.academic?.aiChats || {});
  const collaboration = useStudyStore(
    (state) => state.collaboration || {},
  );
  const revokeShareInvitation = useStudyStore(
    (state) => state.revokeShareInvitation,
  );

  // Quick Task & Modals State
  const [quickTaskTitle, setQuickTaskTitle] = useState("");
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    dueDate: getLocalDateKey(),
    priority: "medium",
    type: "assignment",
  });
  const [importingSubjectFolder, setImportingSubjectFolder] = useState(false);

  const [showAddDeckModal, setShowAddDeckModal] = useState(false);
  const [deckForm, setDeckForm] = useState({
    title: "",
    cards: [
      { id: "c-1", front: "", back: "" },
      { id: "c-2", front: "", back: "" },
    ],
  });

  const handleOpenAddTaskModal = () => {
    setTaskForm({
      title: "",
      description: "",
      dueDate: getLocalDateKey(),
      priority: "medium",
      type: "assignment",
    });
    setShowAddTaskModal(true);
  };

  const handleSaveTask = (e) => {
    e.preventDefault();
    if (!taskForm.title.trim() || !activeSubjectId) return;

    addTask({
      title: taskForm.title.trim(),
      description: taskForm.description,
      dueDate: taskForm.dueDate,
      priority: taskForm.priority,
      type: taskForm.type,
      subjectId: activeSubjectId,
      academicSubjectId: activeSubjectId,
      status: "pending",
    });

    setShowAddTaskModal(false);
    showToast("Nova tarefa/trabalho adicionado!");
  };

  const handleOpenAddDeckModal = () => {
    setDeckForm({
      title: `Flashcards — ${subject?.name || "Disciplina"}`,
      cards: [
        { id: `c-1`, front: "", back: "" },
        { id: `c-2`, front: "", back: "" },
      ],
    });
    setShowAddDeckModal(true);
  };

  const handleSaveDeck = (e) => {
    e.preventDefault();
    if (!deckForm.title.trim() || !activeSubjectId) return;

    const validCards = deckForm.cards
      .filter(c => c.front.trim() && c.back.trim())
      .map((c, i) => ({ id: `card-${Date.now()}-${i}`, front: c.front.trim(), back: c.back.trim() }));

    if (validCards.length === 0) {
      alert("Adicione pelo menos 1 cartão com Frente e Verso preenchidos.");
      return;
    }

    addFlashcardDeck({
      id: `deck-${Date.now()}`,
      title: deckForm.title.trim(),
      academicSubjectId: activeSubjectId,
      cards: validCards,
      createdAt: Date.now(),
    });

    setShowAddDeckModal(false);
    showToast("Novo baralho de flashcards criado!");
  };

  // Exams & Grades Selectors & Data
  const academicExams = useStudyStore(
    (state) => state.academic?.exams || []
  );
  const academicGrades = useStudyStore(
    (state) => state.academic?.grades || []
  );

  const subjectExams = useMemo(() => {
    if (!activeSubjectId) return [];
    return academicExams
      .filter((e) => e.subjectId === activeSubjectId)
      .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  }, [academicExams, activeSubjectId]);

  const subjectGrades = useMemo(() => {
    if (!activeSubjectId) return [];
    return academicGrades
      .filter((g) => g.subjectId === activeSubjectId)
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  }, [academicGrades, activeSubjectId]);

  const gradeSummary = useMemo(() => {
    if (!subject) return { currentAverage: 0, completedWeight: 0, remainingWeight: 100, neededAverage: null };
    return calculateSubjectGrade(subjectGrades, subject);
  }, [subjectGrades, subject]);

  // Exams & Grades State
  const [showExamModal, setShowExamModal] = useState(false);
  const [editingExam, setEditingExam] = useState(null);
  const [examForm, setExamForm] = useState({
    title: "",
    date: getLocalDateKey(),
    time: "08:00",
    location: "",
    weight: 30,
    topics: "",
    studyDays: 5,
  });

  const [showGradeModal, setShowGradeModal] = useState(false);
  const [editingGrade, setEditingGrade] = useState(null);
  const [gradeForm, setGradeForm] = useState({
    title: "",
    score: 10,
    maxScore: 10,
    weight: 30,
    date: getLocalDateKey(),
    category: "exam",
    notes: "",
  });

  const handleOpenAddExamModal = () => {
    setEditingExam(null);
    setExamForm({
      title: `Prova ${subjectExams.length + 1}`,
      date: getLocalDateKey(),
      time: subject?.schedule?.startTime || "08:00",
      location: subject?.schedule?.room ? `Sala ${subject.schedule.room}` : "",
      weight: 30,
      topics: "",
      studyDays: 5,
    });
    setShowExamModal(true);
  };

  const handleOpenEditExamModal = (exam) => {
    setEditingExam(exam);
    setExamForm({
      title: exam.title || "",
      date: exam.date || getLocalDateKey(),
      time: exam.time || "08:00",
      location: exam.location || "",
      weight: exam.weight || 30,
      topics: Array.isArray(exam.topics) ? exam.topics.join(", ") : exam.topics || "",
      studyDays: exam.studyDays || 5,
    });
    setShowExamModal(true);
  };

  const handleSaveExam = (e) => {
    e.preventDefault();
    if (!activeSubjectId || !examForm.title.trim()) return;

    const topicsArray = typeof examForm.topics === "string"
      ? examForm.topics.split(",").map(t => t.trim()).filter(Boolean)
      : examForm.topics || [];

    const payload = {
      subjectId: activeSubjectId,
      title: examForm.title.trim(),
      date: examForm.date,
      time: examForm.time,
      location: examForm.location,
      weight: Number(examForm.weight) || 30,
      topics: topicsArray,
      studyDays: Number(examForm.studyDays) || 5,
    };

    if (editingExam) {
      updateAcademicEntity("exams", editingExam.id, payload);
    } else {
      addAcademicEntity("exams", payload);
    }

    setShowExamModal(false);
    setEditingExam(null);
    showToast(editingExam ? "Prova atualizada!" : "Nova prova agendada!");
  };

  const handleDeleteExam = (id) => {
    if (window.confirm("Deseja cancelar/excluir este agendamento de prova?")) {
      deleteAcademicEntity("exams", id);
      showToast("Prova removida.");
    }
  };

  const handleOpenAddGradeModal = (initialTitle = "", initialWeight = 30) => {
    setEditingGrade(null);
    setGradeForm({
      title: initialTitle || `Avaliação ${subjectGrades.length + 1}`,
      score: 10,
      maxScore: 10,
      weight: initialWeight || 30,
      date: getLocalDateKey(),
      category: "exam",
      notes: "",
    });
    setShowGradeModal(true);
  };

  const handleOpenEditGradeModal = (grade) => {
    setEditingGrade(grade);
    setGradeForm({
      title: grade.title || "",
      score: grade.score ?? 10,
      maxScore: grade.maxScore ?? 10,
      weight: grade.weight ?? 30,
      date: grade.date || getLocalDateKey(),
      category: grade.category || "exam",
      notes: grade.notes || "",
    });
    setShowGradeModal(true);
  };

  const handleSaveGrade = (e) => {
    e.preventDefault();
    if (!activeSubjectId || !gradeForm.title.trim()) return;

    const payload = {
      subjectId: activeSubjectId,
      title: gradeForm.title.trim(),
      score: Number(gradeForm.score) ?? 0,
      maxScore: Number(gradeForm.maxScore) || 10,
      weight: Number(gradeForm.weight) || 0,
      date: gradeForm.date,
      category: gradeForm.category,
      notes: gradeForm.notes,
    };

    if (editingGrade) {
      updateAcademicEntity("grades", editingGrade.id, payload);
    } else {
      addAcademicEntity("grades", payload);
    }

    setShowGradeModal(false);
    setEditingGrade(null);
    showToast(editingGrade ? "Nota atualizada!" : "Nota lançada com sucesso!");
  };

  const handleDeleteGrade = (id) => {
    if (window.confirm("Deseja realmente excluir esta nota lançada?")) {
      deleteAcademicEntity("grades", id);
      showToast("Nota removida.");
    }
  };

  const [studioPanel, setStudioPanel] = useState(null);
  const [sourceQuery, setSourceQuery] = useState("");
  const [activeTab, setActiveTab] = useState("Estúdio IA");
  const [showSubjectShareModal, setShowSubjectShareModal] = useState(false);
  const [cloudInvitations, setCloudInvitations] = useState([]);
  const [accountSession, setAccountSession] = useState(null);
  const [peopleRefreshKey, setPeopleRefreshKey] = useState(0);
  const [peopleStatus, setPeopleStatus] = useState("");

  useEffect(() => {
    if (activeTab !== "Pessoas" || !collaborationCloudConfigured) return undefined;
    let mounted = true;
    const loadPeople = async () => {
      try {
        const session = await collaborationCloud.getSession();
        if (!mounted) return;
        setAccountSession(session);
        if (!session) {
          setCloudInvitations([]);
          setPeopleStatus("Entre em Minha conta para compartilhar online.");
          return;
        }
        const entities = await collaborationCloud.listSharedEntities();
        const entity = entities.find(
          (item) =>
            item.entity_type === "subject" &&
            String(item.entity_id) === String(activeSubjectId),
        );
        if (!mounted) return;
        setCloudInvitations(entity?.share_invitations || []);
        setPeopleStatus("");
      } catch (error) {
        if (!mounted) return;
        setPeopleStatus(error.message || "Não foi possível atualizar os participantes.");
      }
    };
    loadPeople();
    return () => {
      mounted = false;
    };
  }, [activeTab, activeSubjectId, peopleRefreshKey]);

  // Ollama Configuration State
  const [ollamaUrl, setOllamaUrl] = useState(() => localStorage.getItem("studyhub_ollama_url") || "http://localhost:11434");
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem("studyhub_ollama_model") || "");
  const [availableModels, setAvailableModels] = useState([]);
  const [isOllamaConnected, setIsOllamaConnected] = useState(false);
  const [configuredAiProvider, setConfiguredAiProvider] = useState("ollama");
  const [showOllamaConfigModal, setShowOllamaConfigModal] = useState(false);
  const [tempUrl, setTempUrl] = useState(ollamaUrl);

  // Edit Discipline State
  const [showEditSubjectModal, setShowEditSubjectModal] = useState(false);
  const [editSubjectForm, setEditSubjectForm] = useState({
    name: "",
    abbreviation: "",
    professor: "",
    semester: "",
    schedule: "",
    credits: "",
    description: ""
  });

  // Class Logs State & Data
  const academicClassLogs = useStudyStore(
    (state) => state.academic?.classLogs || []
  );

  const subjectClassLogs = useMemo(() => {
    if (!activeSubjectId) return [];
    return academicClassLogs
      .filter((log) => log.subjectId === activeSubjectId)
      .sort((a, b) => (b.lessonNumber || 0) - (a.lessonNumber || 0) || String(b.date || "").localeCompare(String(a.date || "")));
  }, [academicClassLogs, activeSubjectId]);

  const [classLogSearch, setClassLogSearch] = useState("");
  const [classLogStatusFilter, setClassLogStatusFilter] = useState("all");
  const [classLogAttendanceFilter, setClassLogAttendanceFilter] = useState("all");
  const [showClassLogModal, setShowClassLogModal] = useState(false);
  const [editingClassLog, setEditingClassLog] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const [classLogForm, setClassLogForm] = useState({
    lessonNumber: 1,
    title: "",
    date: getLocalDateKey(),
    startTime: "08:00",
    endTime: "10:00",
    durationMinutes: 120,
    status: "completed",
    attendanceStatus: "attended",
    contentSummary: "",
    topics: "",
    homework: "",
    linkedNoteId: "",
  });

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleOpenAddClassLogModal = () => {
    const nextNum = subjectClassLogs.length > 0
      ? Math.max(...subjectClassLogs.map(l => l.lessonNumber || 0)) + 1
      : 1;
    setEditingClassLog(null);
    setClassLogForm({
      lessonNumber: nextNum,
      title: `Aula ${String(nextNum).padStart(2, "0")}`,
      date: getLocalDateKey(),
      startTime: "08:00",
      endTime: "10:00",
      durationMinutes: 120,
      status: "completed",
      attendanceStatus: "attended",
      contentSummary: "",
      topics: "",
      homework: "",
      linkedNoteId: "",
    });
    setShowClassLogModal(true);
  };

  const handleOpenEditClassLogModal = (log) => {
    setEditingClassLog(log);
    setClassLogForm({
      lessonNumber: log.lessonNumber || 1,
      title: log.title || "",
      date: log.date || getLocalDateKey(),
      startTime: log.startTime || "08:00",
      endTime: log.endTime || "10:00",
      durationMinutes: log.durationMinutes || 120,
      status: log.status || "completed",
      attendanceStatus: log.attendanceStatus || "attended",
      contentSummary: log.contentSummary || "",
      topics: Array.isArray(log.topics) ? log.topics.join(", ") : log.topics || "",
      homework: log.homework || "",
      linkedNoteId: log.linkedNoteId || "",
    });
    setShowClassLogModal(true);
  };

  const handleSaveClassLog = (e) => {
    e.preventDefault();
    if (!activeSubjectId) return;

    const topicsArray = typeof classLogForm.topics === "string"
      ? classLogForm.topics.split(",").map(t => t.trim()).filter(Boolean)
      : classLogForm.topics || [];

    const payload = {
      subjectId: activeSubjectId,
      lessonNumber: Number(classLogForm.lessonNumber) || 1,
      title: classLogForm.title.trim() || `Aula ${classLogForm.lessonNumber}`,
      date: classLogForm.date,
      startTime: classLogForm.startTime,
      endTime: classLogForm.endTime,
      durationMinutes: Number(classLogForm.durationMinutes) || 120,
      status: classLogForm.status,
      attendanceStatus: classLogForm.attendanceStatus,
      contentSummary: classLogForm.contentSummary,
      topics: topicsArray,
      homework: classLogForm.homework,
      linkedNoteId: classLogForm.linkedNoteId,
    };

    if (editingClassLog) {
      updateAcademicEntity("classLogs", editingClassLog.id, payload);
    } else {
      addAcademicEntity("classLogs", payload);
    }

    // Also sync attendance record
    const existingAttendance = (useStudyStore.getState().academic?.attendance || []).find(
      a => a.subjectId === activeSubjectId && a.date === classLogForm.date
    );
    const attendancePayload = {
      subjectId: activeSubjectId,
      date: classLogForm.date,
      status: classLogForm.attendanceStatus === "attended" || classLogForm.attendanceStatus === "present" ? "present" : classLogForm.attendanceStatus === "late" ? "late" : "absent",
      notes: classLogForm.title,
    };
    if (existingAttendance) {
      updateAcademicEntity("attendance", existingAttendance.id, attendancePayload);
    } else {
      addAcademicEntity("attendance", attendancePayload);
    }

    setShowClassLogModal(false);
    setEditingClassLog(null);
    showToast(editingClassLog ? "Aula atualizada com sucesso!" : "Nova aula registrada com sucesso!");
  };

  const handleDeleteClassLog = (id) => {
    if (window.confirm("Deseja realmente excluir esta aula do registro?")) {
      deleteAcademicEntity("classLogs", id);
      showToast("Aula excluída do registro.");
    }
  };

  const handleSetAttendanceStatus = (log, targetStatus) => {
    const isCurrentSame =
      (targetStatus === "present" && (log.attendanceStatus === "attended" || log.attendanceStatus === "present")) ||
      (targetStatus === "absent" && log.attendanceStatus === "absent");
    const statusToSet = isCurrentSame ? "pending" : (targetStatus === "present" ? "attended" : "absent");

    updateAcademicEntity("classLogs", log.id, {
      attendanceStatus: statusToSet,
    });

    const logDate = log.date || new Date().toISOString().slice(0, 10);
    const targetSubId = log.subjectId || activeSubjectId;
    const existingAttendance = (useStudyStore.getState().academic?.attendance || []).find(
      a => a.subjectId === targetSubId && a.date === logDate
    );
    const attendanceStatusMapped = statusToSet === "attended" ? "present" : statusToSet === "absent" ? "absent" : null;

    if (existingAttendance) {
      if (attendanceStatusMapped === null) {
        deleteAcademicEntity("attendance", existingAttendance.id);
      } else {
        updateAcademicEntity("attendance", existingAttendance.id, {
          status: attendanceStatusMapped,
          notes: log.title || "",
        });
      }
    } else if (attendanceStatusMapped !== null) {
      addAcademicEntity("attendance", {
        subjectId: targetSubId,
        semesterId: activeSemesterId,
        date: logDate,
        status: attendanceStatusMapped,
        notes: log.title || "",
      });
    }

    showToast(statusToSet === "attended" ? "Presença confirmada!" : statusToSet === "absent" ? "Falta registrada." : "Frequência desmarcada.");
  };

  const handleQuickToggleAttendance = (log) => {
    const isAttended = log.attendanceStatus === "attended" || log.attendanceStatus === "present";
    handleSetAttendanceStatus(log, isAttended ? "absent" : "present");
  };

  const handleExportClassLogsMarkdown = () => {
    if (subjectClassLogs.length === 0) {
      alert("Nenhuma aula registrada para exportar.");
      return;
    }
    let report = `# Registro de Aulas — ${subject?.name || "Disciplina"}\n\n`;
    report += `**Professor(a):** ${formatTextValue(subject?.professor, "Não informado")}\n`;
    report += `**Semestre:** ${subject?.semester || "Atual"}\n`;
    report += `**Total de Aulas Registradas:** ${subjectClassLogs.length}\n\n`;
    report += `---\n\n`;

    subjectClassLogs.forEach((log) => {
      report += `### Aula ${String(log.lessonNumber || 1).padStart(2, "0")}: ${log.title}\n`;
      report += `- **Data:** ${log.date} (${log.startTime || ""} - ${log.endTime || ""})\n`;
      report += `- **Status:** ${log.status === "completed" ? "Realizada" : log.status === "scheduled" ? "Agendada" : "Cancelada"} | **Frequência:** ${log.attendanceStatus === "attended" ? "Presente" : log.attendanceStatus === "late" ? "Atrasado" : "Falta"}\n`;
      if (log.topics && log.topics.length > 0) {
        report += `- **Tópicos:** ${log.topics.join(", ")}\n`;
      }
      if (log.contentSummary) {
        report += `\n${log.contentSummary}\n`;
      }
      if (log.homework) {
        report += `\n*Tarefas/Dever de casa:* ${log.homework}\n`;
      }
      report += `\n---\n\n`;
    });

    navigator.clipboard.writeText(report);
    showToast("Relatório de Aulas copiado em Markdown para a área de transferência!");
  };

  // Filtered Class Logs
  const filteredClassLogs = useMemo(() => {
    return subjectClassLogs.filter(log => {
      if (classLogStatusFilter !== "all" && log.status !== classLogStatusFilter) return false;
      if (classLogAttendanceFilter !== "all" && log.attendanceStatus !== classLogAttendanceFilter) return false;
      if (classLogSearch.trim()) {
        const q = classLogSearch.toLowerCase();
        const matchTitle = (log.title || "").toLowerCase().includes(q);
        const matchSummary = (log.contentSummary || "").toLowerCase().includes(q);
        const matchTopics = Array.isArray(log.topics) && log.topics.some(t => t.toLowerCase().includes(q));
        if (!matchTitle && !matchSummary && !matchTopics) return false;
      }
      return true;
    });
  }, [subjectClassLogs, classLogStatusFilter, classLogAttendanceFilter, classLogSearch]);

  // Class Log Stats
  const totalClassesCount = subjectClassLogs.length;
  const completedClassesCount = subjectClassLogs.filter(l => l.status === "completed" || l.status === "makeup").length;
  const attendedClassesCount = subjectClassLogs.filter(l => l.attendanceStatus === "attended" || l.attendanceStatus === "present" || l.attendanceStatus === "late").length;
  const absentClassesCount = subjectClassLogs.filter(l => l.attendanceStatus === "absent").length;
  const classAttendanceRate = totalClassesCount > 0 ? Math.round((attendedClassesCount / totalClassesCount) * 100) : 100;
  const totalHoursCompleted = Math.round(subjectClassLogs.filter(l => l.status === "completed").reduce((acc, l) => acc + (Number(l.durationMinutes) || 120), 0) / 60);

  const handleOpenEditModal = () => {
    setEditSubjectForm({
      name: subject?.name || "",
      abbreviation: subject?.abbreviation || "",
      professor: formatTextValue(subject?.professor, ""),
      semester: subject?.semester || "",
      schedule: formatScheduleString(subject?.schedule),
      credits: formatTextValue(subject?.credits, "4"),
      description: subject?.description || ""
    });
    setShowEditSubjectModal(true);
  };

  // Check Ollama connection & list models
  const checkOllamaConnection = async () => {
    try {
      if (window.studyhubDesktop?.academicAI?.status) {
        const status = await window.studyhubDesktop.academicAI.status();
        setConfiguredAiProvider(status?.provider || "ollama");
        if (status?.provider === "gemini") {
          const modelsList = (status.models || []).map((model) => model.name);
          setAvailableModels(modelsList);
          setIsOllamaConnected(Boolean(status.available));
          if (modelsList[0]) setSelectedModel(modelsList[0]);
          return;
        }
      }
      const res = await fetch(`${ollamaUrl.replace(/\/$/, '')}/api/tags`);
      if (res.ok) {
        const data = await res.json();
        const modelsList = data.models?.map(m => m.name) || [];
        setAvailableModels(modelsList);
        setIsOllamaConnected(true);
        if (modelsList.length > 0 && !selectedModel) {
          setSelectedModel(modelsList[0]);
          localStorage.setItem("studyhub_ollama_model", modelsList[0]);
        }
      } else {
        setIsOllamaConnected(false);
      }
    } catch {
      setIsOllamaConnected(false);
    }
  };

  useEffect(() => {
    checkOllamaConnection();
  }, [ollamaUrl]);

  const [showAddSourceModal, setShowAddSourceModal] = useState(false);
  const [newSourceForm, setNewSourceForm] = useState(() =>
    createAcademicResourceForm("file"),
  );
  const [sourceFormError, setSourceFormError] = useState("");

  // AI Chat State
  const [message, setMessage] = useState("");
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [activeChatId, setActiveChatId] = useState(null);
  const [renamingChat, setRenamingChat] = useState(false);
  const [chatTitleDraft, setChatTitleDraft] = useState("");

  const defaultInitialChat = useMemo(
    () => [
      {
        role: "ai",
        content: `### Vamos estudar ${subject?.name || "sua matéria"}?\n\nFaça uma pergunta ou abra **Fontes** para escolher seus materiais. Em **Ferramentas**, você encontra resumos, flashcards e exercícios.`,
        time: "Agora",
        sources: [],
      },
    ],
    [subject?.name],
  );

  const subjectChats = useMemo(
    () => (activeSubjectId ? aiChatsBySubject[activeSubjectId] || [] : []),
    [activeSubjectId, aiChatsBySubject],
  );

  useEffect(() => {
    setActiveChatId(subjectChats[0]?.id || null);
    setMessage("");
  }, [activeSubjectId]);

  const activeChat = subjectChats.find((chat) => chat.id === activeChatId) || subjectChats[0] || null;
  const chatHistory = activeChat?.messages?.length ? activeChat.messages : defaultInitialChat;

  const saveChatMessages = (messages, chatId = activeChat?.id) => {
    if (!activeSubjectId || !chatId) return;
    // Atualiza somente a conversa original; respostas atrasadas preservam chats novos.
    updateAcademicAiChat(activeSubjectId, chatId, { messages });
  };

  // AI Modal Tools State
  const [activeAiToolModal, setActiveAiToolModal] = useState(null);
  const [aiToolLoading, setAiToolLoading] = useState(false);
  const [aiToolError, setAiToolError] = useState("");
  const [aiToolContent, setAiToolContent] = useState(null);
  const toolGenerationId = useRef(0);
  const closeAiToolModal = () => { toolGenerationId.current += 1; setActiveAiToolModal(null); };

  const [generatedQuizIndex, setGeneratedQuizIndex] = useState(0);
  const [selectedQuizAnswers, setSelectedQuizAnswers] = useState({});
  const [showQuizResults, setShowQuizResults] = useState(false);
  const [flashcardFlipped, setFlashcardFlipped] = useState(false);
  const [currentFlashcardIndex, setCurrentFlashcardIndex] = useState(0);

  // Filtered store items for this subject
  const subjectNotes = useMemo(() => {
    return notesList.filter(n => !n.parentNoteId && n.sourceKind !== "nested-note" && (n.academicSubjectId === activeSubjectId || n.subjectId === activeSubjectId));
  }, [notesList, activeSubjectId]);

  const subjectTasks = useMemo(() => {
    return tasksList.filter(t => t.academicSubjectId === activeSubjectId || t.subjectId === activeSubjectId);
  }, [tasksList, activeSubjectId]);

  const subjectDecks = useMemo(() => {
    return flashcardDecks.filter(d => d.academicSubjectId === activeSubjectId || d.subjectId === activeSubjectId);
  }, [flashcardDecks, activeSubjectId]);

  const subjectInvitations = useMemo(() => {
    const byEmail = new Map();
    (collaboration.invitations || [])
      .filter(
        (invite) =>
          invite.entityType === "subject" &&
          String(invite.entityId) === String(activeSubjectId),
      )
      .forEach((invite) => {
        byEmail.set(String(invite.email || "").toLowerCase(), invite);
      });
    cloudInvitations.forEach((invite) => {
      byEmail.set(String(invite.email || "").toLowerCase(), {
        id: invite.id,
        email: invite.email,
        permission: invite.permission,
        status: invite.status,
        createdAt: invite.created_at,
        online: true,
      });
    });
    return [...byEmail.values()];
  }, [activeSubjectId, cloudInvitations, collaboration.invitations]);

  const sources = useMemo(() => {
    const linkedCourseIds = new Set([
      ...(subject?.linkedCourseIds || []),
      ...(subject?.courseId ? [subject.courseId] : []),
    ].map(String));
    const linkedLessonIds = new Set(
      courses
        .filter((course) => linkedCourseIds.has(String(course.id)))
        .flatMap((course) => [
          ...(course.lessons || []),
          ...(course.modules || []).flatMap((module) => module.lessons || []),
        ])
        .map((lesson) => String(lesson.id)),
    );
    const noteAttachments = notesList.flatMap((note) => {
      if (!note.sourceLessonId || !linkedLessonIds.has(String(note.sourceLessonId))) {
        return [];
      }
      return (note.attachments || []).map((attachment, index) => {
        const path = typeof attachment === "string" ? attachment : attachment?.path;
        if (!path) return null;
        return {
          id: `note-attachment-${note.id}-${index}`,
          title: typeof attachment === "string"
            ? resourceFileName(path)
            : attachment.title || resourceFileName(path),
          path,
          type: "file",
          sourceNoteId: note.id,
          sourceNoteTitle: note.title,
          fromLessonNote: true,
          selected: true,
        };
      }).filter(Boolean);
    });
    return [...academicResources
      .filter((resource) => resource.subjectId === activeSubjectId)
      .map((resource) => {
        const extension = resource.path?.match(/\.([^.\\/]+)$/)?.[1]?.toLowerCase();
        return {
          ...resource,
          name: resource.title,
          type: resource.type === "link" ? "link" : extension || "file",
          size:
            resource.type === "link"
              ? "Link web"
              : resourceFileName(resource.path),
          selected: resource.selected !== false,
        };
      }), ...noteAttachments];
  }, [academicResources, activeSubjectId, courses, notesList, subject]);

  const selectedSourcesCount = sources.filter(s => s.selected).length;

  const subjectLinkedFolder = useMemo(() => {
    if (subject?.linkedFolderPath) {
      return {
        path: subject.linkedFolderPath,
        name: subject.linkedFolderName || resourceFileName(subject.linkedFolderPath),
      };
    }
    const resourceWithFolder = sources.find((source) => source.linkedFolderPath);
    if (!resourceWithFolder) return null;
    return {
      path: resourceWithFolder.linkedFolderPath,
      name:
        resourceWithFolder.linkedFolderName ||
        resourceFileName(resourceWithFolder.linkedFolderPath),
    };
  }, [sources, subject]);

  const toggleSource = (id) => {
    const source = sources.find((item) => item.id === id);
    if (!source || source.fromLessonNote) return;
    updateAcademicEntity("resources", id, { selected: !source.selected });
  };

  const handleAddSource = (e) => {
    e.preventDefault();
    const result = prepareAcademicResource({ form: newSourceForm, subject });
    if (!result.ok) {
      setSourceFormError(result.error);
      return;
    }
    addAcademicEntity("resources", result.resource);
    setNewSourceForm(createAcademicResourceForm("file"));
    setSourceFormError("");
    setShowAddSourceModal(false);
  };

  const pickSourceFile = async () => {
    const selected = await window.studyhubDesktop?.selectFile?.({
      properties: ["openFile"],
    });
    const path = Array.isArray(selected) ? selected[0] : selected;
    if (!path) return;
    setNewSourceForm((current) => ({
      ...current,
      path,
      title: current.title || resourceFileName(path),
    }));
    setSourceFormError("");
  };

  const removeResourcesFromLinkedFolder = (folderPath) => {
    if (!folderPath) return;
    academicResources
      .filter(
        (resource) =>
          resource.subjectId === subject?.id &&
          String(resource.linkedFolderPath || "") === String(folderPath),
      )
      .forEach((resource) => deleteAcademicEntity("resources", resource.id));
  };

  // Keep a linked folder synchronized while the discipline is open. New files
  // appear automatically and files removed from disk are dropped from the
  // linked-folder resources (manually added resources remain untouched).
  useEffect(() => {
    const folderPath = subjectLinkedFolder?.path;
    if (!subject?.id || !folderPath || !window.studyhubDesktop?.scanDirectory) return undefined;
    let cancelled = false;
    const syncFolder = async () => {
      try {
        const result = await window.studyhubDesktop.scanDirectory(folderPath);
        if (cancelled) return;
        const diskPaths = new Set((result?.filesList || []).map((file) => String(file.path)));
        const linkedResources = academicResources.filter(
          (resource) => resource.subjectId === subject.id && String(resource.linkedFolderPath || "") === String(folderPath),
        );
        linkedResources
          .filter((resource) => resource.path && !diskPaths.has(String(resource.path)))
          .forEach((resource) => deleteAcademicEntity("resources", resource.id));
        const knownPaths = new Set(academicResources.map((resource) => String(resource.path || "")));
        (result?.filesList || [])
          .filter((file) => file?.path && !knownPaths.has(String(file.path)))
          .forEach((file) => addAcademicEntity("resources", {
            subjectId: subject.id,
            semesterId: subject.semesterId,
            title: file.name || resourceFileName(file.path),
            type: "file",
            path: file.path,
            url: "",
            selected: true,
            linkedFolderPath: folderPath,
            linkedFolderName: subjectLinkedFolder.name,
          }));
      } catch {
        // A disconnected/moved folder is reported when the user opens it.
      }
    };
    syncFolder();
    const timer = globalThis.setInterval(syncFolder, 5000);
    return () => { cancelled = true; globalThis.clearInterval(timer); };
  }, [subject?.id, subject?.semesterId, subjectLinkedFolder?.path, subjectLinkedFolder?.name, academicResources, addAcademicEntity, deleteAcademicEntity]);

  const pickSubjectFolder = async () => {
    if (!window.studyhubDesktop?.selectDirectory || !subject?.id) {
      showToast("A seleção automática de pastas está disponível no aplicativo desktop.");
      return;
    }
    setImportingSubjectFolder(true);
    try {
      const selected = await window.studyhubDesktop.selectDirectory();
      if (!selected?.dirPath) return;
      const selectedFolderName = selected.rootName || resourceFileName(selected.dirPath);
      const previousFolderPath = subjectLinkedFolder?.path;
      if (previousFolderPath && String(previousFolderPath) !== String(selected.dirPath)) {
        removeResourcesFromLinkedFolder(previousFolderPath);
      }
      updateAcademicEntity("subjects", subject.id, {
        linkedFolderPath: selected.dirPath,
        linkedFolderName: selectedFolderName,
      });
      const existingPaths = new Set(
        academicResources
          .filter((resource) => resource.subjectId === subject.id)
          .map((resource) => String(resource.path || "")),
      );
      const files = Array.isArray(selected.filesList) ? selected.filesList : [];
      const newFiles = files.filter((file) => file?.path && !existingPaths.has(String(file.path)));
      newFiles.forEach((file) => {
        addAcademicEntity("resources", {
          subjectId: subject.id,
          semesterId: subject.semesterId,
          title: file.name || resourceFileName(file.path),
          type: "file",
          path: file.path,
          url: "",
          selected: true,
          linkedFolderPath: selected.dirPath,
          linkedFolderName: selectedFolderName,
        });
      });
      showToast(
        newFiles.length
          ? `${newFiles.length} arquivo(s) da pasta foram vinculados à disciplina.`
          : "A pasta já está atualizada; nenhum arquivo novo foi encontrado.",
      );
    } catch (error) {
      showToast(error?.message || "Não foi possível importar a pasta.");
    } finally {
      setImportingSubjectFolder(false);
    }
  };

  const unlinkSubjectFolder = () => {
    if (!subject?.id || !subjectLinkedFolder?.path) return;
    if (
      !window.confirm(
        "Desvincular esta pasta da disciplina? Os arquivos reais do computador não serão apagados.",
      )
    ) {
      return;
    }
    removeResourcesFromLinkedFolder(subjectLinkedFolder.path);
    updateAcademicEntity("subjects", subject.id, {
      linkedFolderPath: "",
      linkedFolderName: "",
    });
    showToast("Pasta desvinculada da disciplina.");
  };

  const openSource = (source) => {
    if (source.url) {
      if (window.studyhubDesktop?.openExternal) {
        window.studyhubDesktop.openExternal(source.url);
      } else {
        window.open(source.url, "_blank", "noopener,noreferrer");
      }
    } else if (source.path) {
      window.studyhubDesktop?.openPath?.(source.path);
    }
  };

  const htmlToPlainText = (html = "") =>
    String(html)
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

  const getSourcesContext = () => {
    const contextParts = [];

    // 1. Subject Info
    if (subject) {
      contextParts.push(
        `--- DISCIPLINA: "${subject.name || "Matéria"}" ${subject.code ? `(${subject.code})` : ""} ---\n${subject.description || subject.objectives || "Disciplina acadêmica do aluno."}`
      );
    }

    // 2. Notes Content
    const selectedSources = sources.filter((s) => s.selected);
    const targetNotes = selectedSources.length
      ? subjectNotes.filter((n) =>
          selectedSources.some(
            (s) => String(s.id) === String(n.id) || s.name === n.title
          )
        )
      : subjectNotes;

    targetNotes.forEach((n) => {
      const plain = htmlToPlainText(n.content || "");
      if (plain) {
        contextParts.push(`--- ANOTAÇÃO: "${n.title}" ---\n${plain}`);
      }
    });

    // 3. Class Logs / Summaries
    const classLogs = (useStudyStore.getState().academic?.classLogs || []).filter(
      (log) => log.subjectId === activeSubjectId || log.academicSubjectId === activeSubjectId
    );
    classLogs.forEach((log) => {
      const plain = htmlToPlainText(log.contentSummary || log.topic || "");
      if (plain) {
        contextParts.push(
          `--- REGISTRO DE AULA: "${log.topic || "Aula"}" (${log.date || ""}) ---\n${plain}`
        );
      }
    });

    // 4. Resources / Files
    const targetResources = selectedSources.length ? selectedSources : sources;
    targetResources.forEach((src) => {
      contextParts.push(
        `--- ARQUIVO/FONTE: "${src.name}" (${src.type}) ---\nCaminho/URL: ${src.path || src.url || "N/A"}`
      );
    });

    return contextParts.join("\n\n");
  };

  const buildAcademicAiSourcePayload = (source) => {
    if (!source) return null;
    const sourceId = String(source.id || "").trim();
    if (!sourceId) return null;
    if (source.url) {
      return {
        id: sourceId,
        kind: "link",
        title: source.name || source.title || "Link",
        url: source.url,
        locator: source.url,
      };
    }
    if (source.path) {
      return {
        id: sourceId,
        kind: "file",
        title: source.name || source.title || resourceFileName(source.path),
        path: source.path,
        locator: source.linkedFolderName
          ? `Pasta ${source.linkedFolderName}`
          : "Arquivo da disciplina",
      };
    }
    if (source.content) {
      return {
        id: sourceId,
        kind: source.kind || "note",
        title: source.name || source.title || "Fonte",
        content: htmlToPlainText(source.content),
        locator: source.locator || "Conteúdo",
      };
    }
    return null;
  };

  const ensureSelectedSourcesIndexed = async (selectedSources) => {
    if (!window.studyhubDesktop?.academicAI?.indexSources || !subject?.semesterId) {
      return { ok: false, failed: [] };
    }
    const payloadSources = selectedSources
      .map(buildAcademicAiSourcePayload)
      .filter(Boolean);
    if (!payloadSources.length) return { ok: true, failed: [] };
    const result = await window.studyhubDesktop.academicAI.indexSources({
      subjectId: activeSubjectId,
      semesterId: subject.semesterId,
      sources: payloadSources,
    });
    const failed = (result?.results || []).filter((item) => !item.ok);
    return { ok: failed.length < payloadSources.length, failed };
  };

  // AI Chat Handler via Ollama
  const handleSendMessage = async (textToSend) => {
    const query = textToSend || message;
    if (!query.trim() || isAiThinking || !activeSubjectId) return;

    let chatId = activeChat?.id;
    if (!chatId) {
      chatId = createAcademicAiChat(activeSubjectId, {
        title: query.trim().slice(0, 42),
        messages: defaultInitialChat,
      });
      setActiveChatId(chatId);
    }

    const userTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg = { role: "user", content: query, time: userTime };

    const updatedWithUser = [...chatHistory, userMsg];
    saveChatMessages(updatedWithUser, chatId);

    if (!textToSend) setMessage("");
    setIsAiThinking(true);

    const selectedSources = sources.filter((s) => s.selected);
    const selectedSrcNames = selectedSources.map(s => ({ id: s.id, name: s.name }));

    // 1. Try native IPC academicAI first if available
    if (window.studyhubDesktop?.academicAI?.ask) {
      try {
        await ensureSelectedSourcesIndexed(selectedSources);
        const historyPayload = chatHistory.slice(-10).map((msg) => ({
          role: msg.role === "user" ? "user" : "assistant",
          content: msg.content,
        }));
        const response = await window.studyhubDesktop.academicAI.ask({
          subjectId: activeSubjectId,
          semesterId: subject?.semesterId,
          question: query,
          history: historyPayload,
          model: selectedModel,
          sourceIds: selectedSrcNames.map((s) => s.id),
        });

        if (
          response &&
          response.answer &&
          response.grounded !== false &&
          !response.answer.includes("Não tenho essa informação")
        ) {
          const aiMsg = {
            role: "ai",
            content: response.answer,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            sources: response.citations || selectedSrcNames.slice(0, 2),
          };
          saveChatMessages([...updatedWithUser, aiMsg], chatId);
          setIsAiThinking(false);
          return;
        }
      } catch (e) {
        console.warn("IPC academicAI failed:", e);
        if (configuredAiProvider === "gemini") {
          const detail = String(e?.message || e || "");
          const busy = /high demand|resource.?exhausted|429/i.test(detail);
          saveChatMessages([
            ...updatedWithUser,
            {
              role: "ai",
              content: busy
                ? "⚠️ **O Gemini está temporariamente com alta demanda.** Aguarde alguns segundos e tente novamente. Isso é uma limitação momentânea do serviço, não um problema com sua chave."
                : `⚠️ **Erro no Google Gemini:** ${detail}`,
              time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              sources: [],
            },
          ], chatId);
          setIsAiThinking(false);
          return;
        }
      }
    }

    // 2. Direct Ollama API path with full subject context
    const sourcesText = getSourcesContext();

    const systemPrompt = `Você é o tutor inteligente especialista na disciplina "${subject?.name || "Estudos"}".
Responda em Português do Brasil de forma clara, didática e bem estruturada com títulos (###), tópicos em negrito (**texto**) e listas.

MATERIAIS E CONTEÚDO DA DISCIPLINA DO ALUNO:
${sourcesText || `Disciplina: ${subject?.name || "Geral"}`}

INSTRUÇÕES DE RESPOSTA:
- Responda de forma completa, precisa e amigável à pergunta do aluno.
- Utilize as anotações, aulas e materiais da disciplina listados acima para embasar sua explicação.`;

    try {
      let aiResponseText = "";
      if (isOllamaConnected) {
        aiResponseText = await generateWithOllama(ollamaUrl, selectedModel, systemPrompt, query);
      } else if (!window.studyhubDesktop && isWebLlmAvailable()) {
        aiResponseText = await askWithWebLLM({
          system: systemPrompt,
          prompt: query,
          history: chatHistory.slice(-10).map((msg) => ({ role: msg.role === "user" ? "user" : "assistant", content: msg.content })),
          model: selectedModel || undefined,
        });
      } else {
        await new Promise(r => setTimeout(r, 600));
        const lowerQ = query.toLowerCase();
        if (lowerQ.includes("resumo") || lowerQ.includes("exemplo") || lowerQ.includes("conceito") || lowerQ.includes("o que é") || lowerQ.includes("como")) {
          aiResponseText = `### 📌 Síntese da Resposta — ${subject?.name || "Estudos"}\n\n- **Conceito:** A resposta para "${query}" está associada aos tópicos fundamentais da matéria.\n- **Anotações:** Verifique as anotações e aulas da disciplina para mais detalhes.`;
        } else {
          aiResponseText = `### 💡 Informação sobre "${query}"\n\n- **Resumo:** O tema abordado está relacionado ao plano de estudos da disciplina de ${subject?.name || "sua matéria"}.\n- **Dica:** Para habilitar respostas completas em tempo real por IA local, certifique-se de que o Ollama esteja ativo na sua máquina (\`http://localhost:11434\`).`;
        }
      }

      const aiMsg = {
        role: "ai",
        content: aiResponseText,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sources: selectedSrcNames.slice(0, 2),
      };

      saveChatMessages([...updatedWithUser, aiMsg], chatId);
    } catch (err) {
      saveChatMessages([
        ...updatedWithUser,
        {
          role: "ai",
          content: configuredAiProvider === "gemini"
            ? `⚠️ **Erro no Google Gemini:** ${err.message}\n\nTente novamente em alguns instantes ou verifique o limite de uso no Google AI Studio.`
            : `⚠️ **Erro na IA Ollama:** ${err.message}\n\nCertifique-se de que o Ollama esteja rodando no seu computador (\`ollama run ${selectedModel || "llama3.2"}\`).`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          sources: [],
        },
      ], chatId);
    } finally {
      setIsAiThinking(false);
    }
  };

  // AI Tool Modal Generator via Ollama
  const openAiToolModal = async (toolId) => {
    const generationId = ++toolGenerationId.current;
    setActiveAiToolModal(toolId);
    setAiToolLoading(true);
    setAiToolError("");
    setAiToolContent(null);
    setGeneratedQuizIndex(0);
    setSelectedQuizAnswers({});
    setShowQuizResults(false);
    setFlashcardFlipped(false);
    setCurrentFlashcardIndex(0);

    try {
      const selectedSources = sources.filter(source => source.selected);
      let raw;
      if (window.studyhubDesktop?.academicAI?.generate) {
        if (!selectedSources.length) throw new Error("Selecione pelo menos uma fonte para gerar material de estudo.");
        // O serviço nativo lê os trechos dos arquivos, em vez de enviar só seus nomes.
        const indexed = await ensureSelectedSourcesIndexed(selectedSources);
        if (!indexed.ok || indexed.failed.length) throw new Error("Não foi possível ler todas as fontes selecionadas. Confira os arquivos e links e tente novamente.");
        const result = await window.studyhubDesktop.academicAI.generate({
          subjectId: activeSubjectId,
          semesterId: subject?.semesterId,
          kind: toolId === "plan" ? "study-plan" : toolId,
          sourceIds: selectedSources.map(source => source.id),
          model: selectedModel,
        });
        if (result?.truncated) throw new Error("A resposta da IA ficou incompleta. Tente novamente com menos fontes.");
        raw = result?.content;
      } else if (isOllamaConnected) {
        raw = await generateWithOllama(ollamaUrl, selectedModel, studyToolPrompt(toolId), getSourcesContext(), isStructuredStudyTool(toolId) ? "json" : undefined);
      } else if (!window.studyhubDesktop && isWebLlmAvailable()) {
        raw = await askWithWebLLM({ system: studyToolPrompt(toolId), prompt: getSourcesContext() });
      } else {
        throw new Error(configuredAiProvider === "gemini" ? "Configure o Gemini nas configurações de IA para gerar este material." : "Conecte o Ollama nas configurações de IA para gerar este material.");
      }
      // Uma resposta antiga não pode sobrescrever uma ferramenta aberta depois.
      if (generationId !== toolGenerationId.current) return;
      setAiToolContent(parseStudyTool(toolId, raw));
    } catch (err) {
      if (generationId === toolGenerationId.current) setAiToolError(err.message || "Não foi possível gerar o material de estudo.");
    } finally {
      if (generationId === toolGenerationId.current) setAiToolLoading(false);
    }
  };

  const handleCreateDisciplineNote = () => {
    const newNoteId = `note-${Date.now()}`;
    const vaultId = `discipline-${activeSubjectId}`;
    const store = useStudyStore.getState();
    store.setActiveVaultId?.(vaultId);
    addNote({
      id: newNoteId,
      title: `Anotação - ${subject?.name || "Disciplina"}`,
      content: "",
      markdownContent: "",
      vaultId,
      academicSubjectId: activeSubjectId,
      updatedAt: Date.now()
    });
    setActiveNote(newNoteId);
    onNavigate(SCREEN_IDS.NOTE_EDITOR);
  };

  const handleCreateClassNote = (classLog) => {
    const newNoteId = `note-${Date.now()}`;
    const vaultId = `discipline-${activeSubjectId}`;
    const store = useStudyStore.getState();
    store.setActiveVaultId?.(vaultId);
    addNote({
      id: newNoteId,
      title: `Nota da aula — ${classLog.date ? new Date(`${classLog.date}T12:00:00`).toLocaleDateString("pt-BR") : new Date().toLocaleDateString("pt-BR")} · ${classLog.title || subject?.name || "Disciplina"}`,
      category: "Nota de aula",
      date: classLog.date || getLocalDateKey(),
      content: classLog.contentSummary
        ? `<p><strong>Conteúdo da Aula:</strong></p><p>${classLog.contentSummary}</p>`
        : `<p>Anotações da aula <strong>${classLog.title || "sem título"}</strong> de ${subject?.name || "Disciplina"}.</p>`,
      markdownContent: classLog.contentSummary || "",
      vaultId,
      academicSubjectId: activeSubjectId,
      academicSemesterId: activeSemesterId || subject?.academicSemesterId || null,
      classLogId: classLog.id,
      updatedAt: Date.now(),
    });
    updateAcademicEntity("classLogs", classLog.id, { linkedNoteId: newNoteId });
    setActiveNote(newNoteId);
    onNavigate?.(SCREEN_IDS.NOTE_EDITOR, { noteId: newNoteId });
  };

  if (!subject) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[color:var(--on-surface-variant)] p-8">
        <Icon name="error" className="text-5xl mb-4 text-[color:var(--primary)]" />
        <h2 className="text-xl font-bold mb-2">Disciplina não encontrada</h2>
        <p className="text-sm opacity-70 mb-6">Selecione uma disciplina válida no seu ambiente acadêmico.</p>
        <button onClick={() => onNavigate("BACK")} className="px-6 py-3 bg-[color:var(--primary)] text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-md">
          Voltar
        </button>
      </div>
    );
  }

  return (
    <div className="study-subject-page flex h-full min-h-0 w-full flex-col bg-[color:var(--background)] font-sans overflow-hidden">
      
      {/* Keep discipline navigation above the workspace instead of a second sidebar. */}
      <header className="study-subject-header">
        <div className="study-subject-heading">
          <button type="button" aria-label="Voltar à biblioteca" onClick={() => onNavigate("BACK")}><Icon name="arrow_back" /></button>
          <div><span className="campus-eyebrow">Disciplina</span><h1>{subject.name}</h1><p>{subject.professor ? `${subject.professor} · ` : ""}{formatScheduleString(subject.schedule)}</p></div>
          <button type="button" onClick={handleOpenEditModal} title="Editar disciplina"><Icon name="edit" /><span>Editar</span></button>
        </div>
        <nav className="study-subject-nav" aria-label="Áreas da disciplina">
          {["Estúdio IA", "Visão geral", "Aulas", "Anotações", "Arquivos e links"].map(label => (
            <button key={label} type="button" aria-current={activeTab === label ? "page" : undefined} onClick={() => setActiveTab(label)}>{label === "Estúdio IA" ? "Estúdio de estudo" : label}</button>
          ))}
          <details className="study-more-nav">
            <summary>{["Estúdio IA", "Visão geral", "Aulas", "Anotações", "Arquivos e links"].includes(activeTab) ? "Mais" : activeTab}<Icon name="expand_more" /></summary>
            <div>{TABS.filter(label => !["Estúdio IA", "Visão geral", "Aulas", "Anotações", "Arquivos e links"].includes(label)).map(label => (
              <button key={label} type="button" aria-current={activeTab === label ? "page" : undefined} onClick={event => { setActiveTab(label); event.currentTarget.closest("details").removeAttribute("open"); }}>{label}</button>
            ))}</div>
          </details>
        </nav>
      </header>

      {/* 2. MAIN CONTENT AREA */}
      <main className="study-subject-main min-w-0 min-h-0 flex-1 flex flex-col overflow-hidden bg-[color:var(--surface)] relative">
        
        {/* Top Navbar Header */}
        <header className="h-16 border-b border-[color:var(--outline-variant)]/10 flex items-center justify-between px-8 bg-[color:var(--surface)] sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-black text-[color:var(--on-surface)]">{activeTab === "Estúdio IA" ? "Estúdio de estudo" : activeTab}</h2>
            {activeTab === "Estúdio IA" && <div className="study-panel-switcher">
              <button type="button" aria-expanded={studioPanel === "sources"} aria-controls="study-sources-panel" onClick={() => setStudioPanel(studioPanel === "sources" ? null : "sources")}><Icon name="library_books" />Fontes <span>{selectedSourcesCount}/{sources.length}</span></button>
              <button type="button" aria-expanded={studioPanel === "tools"} aria-controls="study-tools-panel" onClick={() => setStudioPanel(studioPanel === "tools" ? null : "tools")}><Icon name="auto_awesome" />Ferramentas</button>
            </div>}
          </div>
          
          <div className="flex items-center gap-3 shrink-0">
            {activeTab === "Pessoas" ? (
              <button
                type="button"
                onClick={() => setShowSubjectShareModal(true)}
                className="flex items-center gap-2 rounded-xl bg-[color:var(--primary)] px-4 py-2 text-xs font-black text-white shadow-md transition-transform hover:-translate-y-0.5"
              >
                <Icon name="person_add" className="text-base" />
                Convidar pessoa
              </button>
            ) : null}
            {/* AI provider status & model selector */}
            <div className={`items-center gap-2 ${activeTab !== "Estúdio IA" ? "hidden" : "flex"}`}>
              <button 
                onClick={() => configuredAiProvider === "gemini" ? useStudyStore.getState().openSettingsModal?.("ai") : (setTempUrl(ollamaUrl), setShowOllamaConfigModal(true))}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                  isOllamaConnected 
                    ? 'bg-green-500/10 text-green-600 border-green-500/30' 
                    : 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                }`}
                title={configuredAiProvider === "gemini" ? "Configurar Google Gemini" : "Configurar conexão do Ollama local"}
              >
                <div className={`w-2 h-2 rounded-full ${isOllamaConnected ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`} />
                {configuredAiProvider === "gemini" ? (isOllamaConnected ? "Gemini conectado" : "Gemini não configurado") : (isOllamaConnected ? "Ollama conectado" : "Ollama desconectado")}
              </button>

              {isOllamaConnected && availableModels.length > 0 && (
                <select 
                  value={selectedModel}
                  onChange={e => {
                    setSelectedModel(e.target.value);
                    localStorage.setItem("studyhub_ollama_model", e.target.value);
                  }}
                  className="bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 text-xs font-bold text-[color:var(--on-surface)] px-3 py-1.5 rounded-xl outline-none"
                >
                  {availableModels.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </header>

        {/* TAB 1: ESTÚDIO IA (3-COLUMN STUDIO LAYOUT) */}
        {activeTab === "Estúdio IA" && (
          <div className="study-studio-layout flex-1 min-h-0 flex overflow-hidden bg-[color:var(--background)]">
            
            {/* COLUMN 1: FONTES */}
            {studioPanel === "sources" && <section id="study-sources-panel" aria-label="Fontes de conhecimento" className="study-sources-panel w-72 bg-[color:var(--surface)] rounded-3xl border border-[color:var(--outline-variant)]/20 shadow-sm flex flex-col overflow-hidden shrink-0">
              <div className="p-5 border-b border-[color:var(--outline-variant)]/10">
                <div className="flex justify-between items-start mb-2">
                  <h2 className="text-base font-black text-[color:var(--on-surface)]">Fontes de conhecimento</h2><button type="button" aria-label="Fechar fontes" onClick={() => setStudioPanel(null)}><Icon name="close" /></button>
                  <button 
                    onClick={() => setShowAddSourceModal(true)}
                    className="w-8 h-8 rounded-full bg-[color:var(--primary)]/10 text-[color:var(--primary)] flex items-center justify-center hover:bg-[color:var(--primary)]/20 transition-colors"
                    title="Adicionar fonte"
                  >
                    <Icon name="add" className="text-[18px]" />
                  </button>
                </div>
                <p className="text-xs text-[color:var(--on-surface-variant)] leading-relaxed">
                  Selecione os materiais que a IA deve consultar.
                </p>
                <div className="mt-3 text-[10px] font-black uppercase tracking-widest text-[color:var(--primary)]">
                  {selectedSourcesCount} de {sources.length} selecionadas
                </div>
              </div>
              
              <input className="study-source-search" aria-label="Buscar fontes" placeholder="Buscar material..." value={sourceQuery} onChange={event => setSourceQuery(event.target.value)} />
              <div className="flex-1 overflow-y-auto p-3 custom-scrollbar flex flex-col gap-2">
                {sources.length === 0 && <p className="study-panel-empty">Adicione um arquivo ou link para estudar com suas próprias fontes.</p>}
                {sources.length > 0 && !sources.some(source => String(source.name || source.title || "").toLocaleLowerCase().includes(sourceQuery.toLocaleLowerCase())) && <p className="study-panel-empty">Nenhuma fonte encontrada.</p>}
                {sources.filter(source => String(source.name || source.title || "").toLocaleLowerCase().includes(sourceQuery.toLocaleLowerCase())).map(source => (
                  <label 
                    key={source.id} 
                    className={`flex items-start gap-3 p-3 rounded-2xl cursor-pointer border transition-all ${
                      source.selected 
                        ? 'bg-[color:var(--primary)]/5 border-[color:var(--primary)]/30' 
                        : 'bg-transparent border-transparent hover:bg-[color:var(--surface-container-low)]'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                      source.selected ? 'bg-[color:var(--primary)] border-[color:var(--primary)] text-white' : 'border-[color:var(--outline-variant)]/40'
                    }`}>
                      {source.selected && <Icon name="check" className="text-[12px] font-bold" />}
                    </div>
                    <input type="checkbox" className="sr-only" checked={source.selected} onChange={() => toggleSource(source.id)} />
                    
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        source.type === 'pdf' ? 'bg-red-500/10 text-red-500' :
                        source.type === 'pptx' ? 'bg-orange-500/10 text-orange-500' :
                        source.type === 'link' ? 'bg-green-500/10 text-green-500' :
                        'bg-blue-500/10 text-blue-500'
                      }`}>
                        <Icon name={
                          source.type === 'pdf' ? 'picture_as_pdf' :
                          source.type === 'pptx' ? 'present_to_all' :
                          source.type === 'link' ? 'link' : 'draft'
                        } className="text-[16px]" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-bold text-[color:var(--on-surface)] truncate">{source.name || source.title}</h4>
                        <p className="text-[10px] text-[color:var(--on-surface-variant)] mt-0.5 truncate">
                          {source.type.toUpperCase()} • {source.size}
                        </p>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              
            </section>}

            {/* COLUMN 2: ASSISTENTE (CHAT) */}
            <section className="study-chat-panel flex-1 flex flex-col min-w-0">
              
              {/* Header */}
              <div className="flex items-center justify-between mb-4 px-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[color:var(--primary)]/10 text-[color:var(--primary)] rounded-2xl flex items-center justify-center shadow-sm">
                    <Icon name="memory" />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-[color:var(--on-surface)]">Conversa com suas fontes</h2>
                    <p className="text-xs text-[color:var(--on-surface-variant)]">
                      {isOllamaConnected 
                        ? `Modelo ativo: ${selectedModel || "Llama3"}` 
                        : configuredAiProvider === "gemini" ? "Configure sua chave Gemini nas configurações de IA" : "Conecte a IA para conversar com os materiais da disciplina."}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    aria-label="Selecionar conversa"
                    disabled={renamingChat}
                    className="study-chat-select"
                    value={activeChat?.id || ""}
                    onChange={(event) => setActiveChatId(event.target.value || null)}
                  >
                    <option value="">Nova conversa</option>
                    {subjectChats.map((chat) => (
                      <option key={chat.id} value={chat.id}>{chat.title || "Sem título"}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="study-chat-action"
                    aria-label="Criar novo chat"
                    title="Criar novo chat"
                    onClick={() => {
                      const id = createAcademicAiChat(activeSubjectId, { title: `Chat ${subjectChats.length + 1}`, messages: defaultInitialChat });
                      setActiveChatId(id);
                    }}
                  ><Icon name="add" /></button>
                  {activeChat ? <button
                    type="button"
                    className="study-chat-action"
                    aria-label="Renomear chat"
                    title="Renomear chat"
                    onClick={() => {
                      setChatTitleDraft(activeChat.title || "Novo chat");
                      setRenamingChat(true);
                    }}
                  ><Icon name="edit" /></button> : null}
                </div>
                {renamingChat && activeChat && <input aria-label="Nome do chat" autoFocus value={chatTitleDraft} onChange={event => setChatTitleDraft(event.target.value)} onBlur={() => { if (chatTitleDraft.trim()) updateAcademicAiChat(activeSubjectId, activeChat.id, { title: chatTitleDraft.trim() }); setRenamingChat(false); }} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") setRenamingChat(false); }} className="study-chat-select" />}
                {activeChat && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Deseja apagar este chat?")) {
                        deleteAcademicAiChat(activeSubjectId, activeChat.id);
                        setActiveChatId(subjectChats.find((chat) => chat.id !== activeChat.id)?.id || null);
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-red-500 hover:bg-red-500/10 transition-colors"
                  >
                    <Icon name="delete" className="text-[15px]" />
                    Excluir chat
                  </button>
                )}
              </div>
              
              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-6 py-4 pr-2">
                {chatHistory.map((msg, i) => (
                  <div key={i} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'user' ? (
                      <div className="flex gap-3 max-w-[80%] items-start">
                        <div className="bg-[color:var(--primary)] text-white px-6 py-4 rounded-3xl rounded-tr-sm shadow-sm">
                          <p className="text-sm font-medium leading-relaxed">{msg.content}</p>
                          <span className="text-[10px] opacity-70 block text-right mt-2">{msg.time}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-4 max-w-[90%] items-start">
                        <div className="w-8 h-8 rounded-full bg-[color:var(--primary)]/10 text-[color:var(--primary)] flex items-center justify-center shrink-0 mt-1">
                          <Icon name="memory" className="text-[16px]" />
                        </div>
                        <div className="bg-[color:var(--surface)] border border-[color:var(--outline-variant)]/20 shadow-sm px-6 py-5 rounded-3xl rounded-tl-sm text-[color:var(--on-surface)] text-sm leading-relaxed">
                          <FormattedMarkdown content={msg.content} />
                          
                          {/* Sources Used */}
                          {msg.sources && msg.sources.length > 0 && (
                            <div className="mt-4 pt-3 border-t border-[color:var(--outline-variant)]/10 flex items-center flex-wrap gap-2">
                              <span className="text-[11px] font-bold text-[color:var(--on-surface-variant)]">Fontes consultadas:</span>
                              {msg.sources.map((src, index) => {
                                const sourceId = src.id || src.sourceId || `source-${index}`;
                                const sourceName = src.name || src.title || "Fonte consultada";
                                return (
                                  <details key={sourceId} className="w-full rounded-xl border border-[color:var(--primary)]/20 bg-[color:var(--surface-container-low)] px-3 py-2 text-xs">
                                    <summary className="flex cursor-pointer list-none items-center gap-2 font-bold text-[color:var(--primary)]">
                                      <span className="flex h-5 w-5 items-center justify-center rounded bg-[color:var(--primary)]/10 text-[10px]">{index + 1}</span>
                                      <span className="truncate">{sourceName}</span>
                                      {src.locator ? <span className="ml-auto truncate text-[10px] font-normal text-[color:var(--on-surface-variant)]">{src.locator}</span> : null}
                                    </summary>
                                    {src.excerpt ? <blockquote className="mt-2 border-l-2 border-[color:var(--primary)]/40 pl-3 text-[11px] leading-5 text-[color:var(--on-surface-variant)]">“{src.excerpt}{src.excerpt.length >= 900 ? "…" : ""}”</blockquote> : null}
                                  </details>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {isAiThinking && (
                  <div className="flex gap-3 items-center text-xs font-bold text-[color:var(--primary)] bg-[color:var(--primary)]/10 px-4 py-3 rounded-2xl w-fit">
                    <Icon name="memory" className="animate-spin text-[16px]" />
                    Executando {configuredAiProvider === "gemini" ? "Google Gemini" : "Ollama local"} ({selectedModel || "modelo"})...
                  </div>
                )}
                
              </div>
                {/* As sugestões não encolhem junto com o histórico da conversa. */}
                <div className="study-chat-suggestions" aria-label="Perguntas sugeridas">
                  {[
                    `Resumir os pontos essenciais de ${subject.name}`,
                    "Gerar 3 perguntas de prova",
                    "Explicar conceitos-chave com exemplo prático"
                  ].map(q => (
                    <button 
                      key={q} 
                      onClick={() => handleSendMessage(q)}
                      className="whitespace-nowrap px-4 py-2 rounded-full border border-[color:var(--outline-variant)]/30 text-[color:var(--on-surface)] text-xs font-semibold hover:border-[color:var(--primary)] hover:text-[color:var(--primary)] transition-colors shadow-sm bg-[color:var(--surface)]"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              
              {/* Input Form */}
              <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="bg-[color:var(--surface)] border border-[color:var(--outline-variant)]/30 rounded-3xl p-4 mt-2 shadow-md relative">
                <input 
                  type="text" 
                  aria-label="Pergunta para a IA" placeholder="O que você quer entender ou revisar?"
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  className="w-full bg-transparent border-none outline-none text-sm px-2 pb-6 placeholder-[color:var(--on-surface-variant)]/50 text-[color:var(--on-surface)]"
                />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--primary)] bg-[color:var(--primary)]/10 px-3 py-1 rounded-full">
                    {selectedSourcesCount} fonte(s) ativa(s)
                  </span>
                  <button 
                    type="submit" 
                    disabled={!message.trim() || isAiThinking}
                    className="w-10 h-10 rounded-full bg-[color:var(--primary)] text-white flex items-center justify-center hover:opacity-90 shadow-md transition-opacity disabled:opacity-40"
                  >
                    <Icon name="send" className="text-[16px] ml-0.5" />
                  </button>
                </div>
              </form>
            </section>

            {/* COLUMN 3: ESTÚDIO DE ESTUDO (FERRAMENTAS DE IA) */}
            {studioPanel === "tools" && <section id="study-tools-panel" aria-label="Ferramentas de estudo" className="study-tools-panel w-72 flex flex-col shrink-0 pl-2">
              <div className="mb-4">
                <div className="flex justify-between items-center mb-1">
                  <h2 className="text-base font-black text-[color:var(--on-surface)]">Ferramentas de estudo</h2><button type="button" aria-label="Fechar ferramentas" onClick={() => setStudioPanel(null)}><Icon name="close" /></button>

                </div>
                <p className="text-[11px] text-[color:var(--on-surface-variant)] leading-relaxed">Transforme as fontes selecionadas em material de revisão.</p>
              </div>
              
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 flex flex-col gap-3">
                {[
                  { id: "guide", icon: "menu_book", title: "Guia de Estudo", desc: "Resumo estruturado dos tópicos da matéria.", color: "purple" },
                  { id: "summary", icon: "description", title: "Resumo Executivo", desc: "Síntese automática de todas as fontes.", color: "blue" },
                  { id: "flashcards", icon: "style", title: "Flashcards IA", desc: "Gerar e praticar cartões de revisão.", color: "green" },
                  { id: "quiz", icon: "quiz", title: "Quiz de Fixação", desc: "Testar seu nível de aprendizado.", color: "orange" },
                  { id: "plan", icon: "assignment", title: "Plano de Revisão", desc: "Cronograma de repetição espaçada.", color: "pink" },
                  { id: "mindmap", icon: "account_tree", title: "Mapa Mental", desc: "Visualizar hierarquia de conceitos.", color: "teal" }
                ].map(tool => (
                  <button 
                    key={tool.id} 
                    onClick={() => openAiToolModal(tool.id)}
                    className="bg-[color:var(--surface)] border border-[color:var(--outline-variant)]/20 p-4 rounded-2xl flex items-center justify-between hover:border-[color:var(--primary)]/40 hover:shadow-md transition-all group text-left"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-[color:var(--primary)]/10 text-[color:var(--primary)]">
                         <Icon name={tool.icon} className="text-[20px]" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-[color:var(--on-surface)]">{tool.title}</h4>
                        <p className="text-[10px] text-[color:var(--on-surface-variant)] mt-0.5 line-clamp-2">{tool.desc}</p>
                      </div>
                    </div>
                    <Icon name="chevron_right" className="text-[color:var(--on-surface-variant)] opacity-40 group-hover:opacity-100 group-hover:text-[color:var(--primary)] transition-all transform group-hover:translate-x-1 text-[18px]" />
                  </button>
                ))}
              </div>
            </section>}

          </div>
        )}

        {/* TAB 2: VISÃO GERAL */}
        {activeTab === "Visão geral" && (
          <div className="flex-1 overflow-y-auto p-8 bg-[color:var(--background)] flex flex-col gap-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-[color:var(--surface)] p-6 rounded-3xl border border-[color:var(--outline-variant)]/20 shadow-sm">
                <span className="text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider">Professor</span>
                <p className="text-xl font-black text-[color:var(--on-surface)] mt-2">{formatTextValue(subject.professor, "Não Informado")}</p>
              </div>
              <div className="bg-[color:var(--surface)] p-6 rounded-3xl border border-[color:var(--outline-variant)]/20 shadow-sm">
                <span className="text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider">Créditos</span>
                <p className="text-xl font-black text-[color:var(--primary)] mt-2">{formatTextValue(subject.credits, "4")} Créditos</p>
              </div>
              <div className="bg-[color:var(--surface)] p-6 rounded-3xl border border-[color:var(--outline-variant)]/20 shadow-sm">
                <span className="text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider">Anotações</span>
                <p className="text-xl font-black text-[color:var(--on-surface)] mt-2">{subjectNotes.length} Notas</p>
              </div>
              <div className="bg-[color:var(--surface)] p-6 rounded-3xl border border-[color:var(--outline-variant)]/20 shadow-sm">
                <span className="text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider">Tarefas PENDENTES</span>
                <p className="text-xl font-black text-orange-500 mt-2">{subjectTasks.filter(t => t.status !== 'completed').length} Tarefas</p>
              </div>
            </div>

            <div className="bg-[color:var(--surface)] p-8 rounded-3xl border border-[color:var(--outline-variant)]/20 shadow-sm">
              <h3 className="text-lg font-black mb-4">Resumo da Disciplina</h3>
              <p className="text-sm leading-relaxed text-[color:var(--on-surface-variant)]">
                {subject.description || `Disciplina de ${subject.name} no semestre acadêmico. Utilize a aba Estúdio IA para tirar dúvidas com a IA Ollama local, consultar materiais e gerar flashcards.`}
              </p>
            </div>
          </div>
        )}

        {/* TAB: AULAS (REGISTRO DE AULAS COMPLETO) */}
        {activeTab === "Aulas" && (
          <div className="flex-1 overflow-y-auto p-8 bg-[color:var(--background)] flex flex-col gap-6">
            
            {/* 1. TOP KPI DASHBOARD */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-[color:var(--surface)] p-5 rounded-3xl border border-[color:var(--outline-variant)]/20 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[color:var(--primary)]/10 text-[color:var(--primary)] flex items-center justify-center font-bold shrink-0">
                  <Icon name="play_lesson" className="text-2xl" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-[color:var(--on-surface-variant)]">Aulas Realizadas</span>
                  <div className="text-2xl font-black text-[color:var(--on-surface)] mt-0.5">
                    {completedClassesCount} <span className="text-xs font-semibold text-[color:var(--on-surface-variant)]">/ {totalClassesCount}</span>
                  </div>
                </div>
              </div>

              <div className="bg-[color:var(--surface)] p-5 rounded-3xl border border-[color:var(--outline-variant)]/20 shadow-sm flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold shrink-0 ${
                  classAttendanceRate >= 80 ? "bg-green-500/10 text-green-600" : classAttendanceRate >= 75 ? "bg-amber-500/10 text-amber-600" : "bg-red-500/10 text-red-600"
                }`}>
                  <Icon name="how_to_reg" className="text-2xl" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-[color:var(--on-surface-variant)]">Frequência Registrada</span>
                  <div className="text-2xl font-black text-[color:var(--on-surface)] mt-0.5">
                    {classAttendanceRate}%
                  </div>
                </div>
              </div>

              <div className="bg-[color:var(--surface)] p-5 rounded-3xl border border-[color:var(--outline-variant)]/20 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold shrink-0">
                  <Icon name="schedule" className="text-2xl" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-[color:var(--on-surface-variant)]">Horas-Aula Cumpridas</span>
                  <div className="text-2xl font-black text-[color:var(--on-surface)] mt-0.5">
                    {totalHoursCompleted}h
                  </div>
                </div>
              </div>

              <div className="bg-[color:var(--surface)] p-5 rounded-3xl border border-[color:var(--outline-variant)]/20 shadow-sm flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold shrink-0 ${
                  absentClassesCount === 0 ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"
                }`}>
                  <Icon name="event_busy" className="text-2xl" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-[color:var(--on-surface-variant)]">Faltas Registradas</span>
                  <div className="text-2xl font-black text-[color:var(--on-surface)] mt-0.5">
                    {absentClassesCount} <span className="text-xs font-semibold text-[color:var(--on-surface-variant)]">faltas</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. SEARCH & ACTION CONTROLS */}
            <div className="bg-[color:var(--surface)] p-4 rounded-3xl border border-[color:var(--outline-variant)]/20 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
              
              {/* Search input */}
              <div className="relative flex-1 w-full">
                <Icon name="search" className="absolute left-4 top-1/2 -translate-y-1/2 text-lg text-[color:var(--on-surface-variant)]" />
                <input
                  type="text"
                  value={classLogSearch}
                  onChange={(e) => setClassLogSearch(e.target.value)}
                  placeholder="Buscar por conteúdo, título ou tópicos..."
                  className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-2xl pl-11 pr-4 py-2.5 outline-none text-xs font-bold text-[color:var(--on-surface)] placeholder:text-[color:var(--on-surface-variant)]/50"
                />
                {classLogSearch && (
                  <button onClick={() => setClassLogSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[color:var(--on-surface-variant)]">
                    <Icon name="close" />
                  </button>
                )}
              </div>

              {/* Filters & Actions */}
              <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
                <select
                  value={classLogStatusFilter}
                  onChange={(e) => setClassLogStatusFilter(e.target.value)}
                  className="bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-3 py-2 text-xs font-bold text-[color:var(--on-surface)] outline-none"
                >
                  <option value="all">Todos os Status</option>
                  <option value="completed">Realizadas</option>
                  <option value="scheduled">Agendadas</option>
                  <option value="cancelled">Canceladas</option>
                  <option value="makeup">Reposição</option>
                </select>

                <select
                  value={classLogAttendanceFilter}
                  onChange={(e) => setClassLogAttendanceFilter(e.target.value)}
                  className="bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-3 py-2 text-xs font-bold text-[color:var(--on-surface)] outline-none"
                >
                  <option value="all">Todas Presenças</option>
                  <option value="attended">Presente</option>
                  <option value="absent">Falta</option>
                  <option value="late">Atrasado</option>
                </select>

                <button
                  onClick={handleExportClassLogsMarkdown}
                  title="Exportar Relatório em Markdown"
                  className="bg-[color:var(--surface-container-high)] text-[color:var(--on-surface)] hover:bg-[color:var(--surface-container-highest)] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 transition-colors"
                >
                  <Icon name="content_copy" className="text-sm" /> Exportar
                </button>

                <button
                  onClick={handleOpenAddClassLogModal}
                  className="bg-[color:var(--primary)] text-white hover:opacity-90 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 shadow-md transition-all uppercase tracking-wider"
                >
                  <Icon name="add" className="text-base" /> Registrar Aula
                </button>
              </div>
            </div>

            {/* 3. CLASS CARDS LIST */}
            {filteredClassLogs.length === 0 ? (
              <div className="bg-[color:var(--surface)] p-12 rounded-3xl border border-[color:var(--outline-variant)]/20 text-center flex flex-col items-center justify-center gap-4">
                <div className="w-16 h-16 rounded-full bg-[color:var(--primary)]/10 text-[color:var(--primary)] flex items-center justify-center">
                  <Icon name="menu_book" className="text-3xl" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-[color:var(--on-surface)]">
                    {subjectClassLogs.length === 0 ? "Nenhuma aula registrada ainda" : "Nenhuma aula encontrada com estes filtros"}
                  </h3>
                  <p className="text-xs text-[color:var(--on-surface-variant)] mt-1 max-w-md">
                    {subjectClassLogs.length === 0
                      ? "Mantenha o histórico completo da disciplina registrando o conteúdo de cada aula, presença e anotações."
                      : "Tente alterar os termos de busca ou remover os filtros aplicados."}
                  </p>
                </div>
                {subjectClassLogs.length === 0 && (
                  <button
                    onClick={handleOpenAddClassLogModal}
                    className="bg-[color:var(--primary)] text-white px-6 py-3 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg mt-2"
                  >
                    <Icon name="add" /> Registrar Primeira Aula
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {filteredClassLogs.map((log) => {
                  const isAttended = log.attendanceStatus === "attended" || log.attendanceStatus === "present";
                  const isAbsent = log.attendanceStatus === "absent";
                  const isLate = log.attendanceStatus === "late";

                  return (
                    <div
                      key={log.id}
                      className={`p-6 rounded-3xl transition-all flex flex-col gap-4 relative group ${
                        isAbsent
                          ? "bg-rose-500/10 border-2 border-rose-500/50 shadow-lg shadow-rose-500/10"
                          : isAttended
                            ? "bg-emerald-500/10 border-2 border-emerald-500/50 shadow-lg shadow-emerald-500/10"
                            : "bg-[color:var(--surface)] border border-[color:var(--outline-variant)]/20 shadow-sm hover:border-[color:var(--primary)]/40"
                      }`}
                    >
                      {/* Visual Banner for Attendance Status */}
                      {isAbsent ? (
                        <div className="p-2.5 rounded-2xl bg-rose-600 text-white flex items-center justify-between font-black text-xs shadow-md animate-fadeIn">
                          <span className="flex items-center gap-1.5">
                            <Icon name="cancel" className="text-base text-white" />
                            Falta registrada nesta aula ({log.date})
                          </span>
                          <span className="text-[10px] bg-white text-rose-700 px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider">
                            FALTOU ✗
                          </span>
                        </div>
                      ) : isAttended ? (
                        <div className="p-2.5 rounded-2xl bg-emerald-600 text-white flex items-center justify-between font-black text-xs shadow-md animate-fadeIn">
                          <span className="flex items-center gap-1.5">
                            <Icon name="check_circle" className="text-base text-white" />
                            Presença confirmada nesta aula ({log.date})
                          </span>
                          <span className="text-[10px] bg-white text-emerald-700 px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider">
                            PRESENTE ✓
                          </span>
                        </div>
                      ) : null}

                      {/* Card Header */}
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--outline-variant)]/10 pb-4">
                        <div className="flex items-center gap-3">
                          <span className="w-10 h-10 rounded-2xl bg-[color:var(--primary)]/10 text-[color:var(--primary)] font-black text-sm flex items-center justify-center shrink-0">
                            #{String(log.lessonNumber || 1).padStart(2, "0")}
                          </span>
                          <div>
                            <h3 className="text-base font-black text-[color:var(--on-surface)]">{log.title}</h3>
                            <div className="flex items-center gap-3 text-xs text-[color:var(--on-surface-variant)] mt-0.5">
                              <span className="flex items-center gap-1 font-semibold">
                                <Icon name="calendar_today" className="text-sm text-[color:var(--primary)]" /> {log.date}
                              </span>
                              {(log.startTime || log.endTime) && (
                                <span className="flex items-center gap-1 font-semibold">
                                  <Icon name="schedule" className="text-sm" /> {log.startTime} {log.endTime ? `- ${log.endTime}` : ""}
                                </span>
                              )}
                              {log.durationMinutes && (
                                <span className="opacity-75">({log.durationMinutes} min)</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Status & Attendance Badges & Action Buttons */}
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Status Badge */}
                          <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full ${
                            log.status === "completed" ? "bg-green-500/10 text-green-600" :
                            log.status === "scheduled" ? "bg-blue-500/10 text-blue-600" :
                            log.status === "makeup" ? "bg-purple-500/10 text-purple-600" : "bg-red-500/10 text-red-600"
                          }`}>
                            {log.status === "completed" ? "Realizada" : log.status === "scheduled" ? "Agendada" : log.status === "makeup" ? "Reposição" : "Cancelada"}
                          </span>

                          {/* Quick Presence & Absence Buttons */}
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleSetAttendanceStatus(log, "present")}
                              title="Marcar Presença"
                              className={`text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-xl flex items-center gap-1 transition-all ${
                                isAttended
                                  ? "bg-emerald-600 text-white shadow-md"
                                  : "bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25"
                              }`}
                            >
                              <Icon name="check_circle" className="text-xs" />
                              {isAttended ? "Presente ✓" : "Presença"}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleSetAttendanceStatus(log, "absent")}
                              title="Marcar Falta"
                              className={`text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-xl flex items-center gap-1 transition-all ${
                                isAbsent
                                  ? "bg-rose-600 text-white shadow-md"
                                  : "bg-rose-500/15 text-rose-600 hover:bg-rose-500/25"
                              }`}
                            >
                              <Icon name="cancel" className="text-xs" />
                              {isAbsent ? "Falta ✗" : "Falta"}
                            </button>
                          </div>

                          {/* Edit / Delete Buttons */}
                          <div className="flex items-center gap-1 ml-2">
                            <button
                              onClick={() => handleOpenEditClassLogModal(log)}
                              className="p-1.5 rounded-xl hover:bg-[color:var(--surface-container-high)] text-[color:var(--on-surface-variant)] transition-colors"
                              title="Editar Aula"
                            >
                              <Icon name="edit" className="text-base" />
                            </button>
                            <button
                              onClick={() => handleDeleteClassLog(log.id)}
                              className="p-1.5 rounded-xl hover:bg-red-500/10 text-red-500 transition-colors"
                              title="Excluir Aula"
                            >
                              <Icon name="delete" className="text-base" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Content Summary */}
                      {log.contentSummary && (
                        <div className="text-sm text-[color:var(--on-surface)] leading-relaxed">
                          <FormattedMarkdown content={log.contentSummary} />
                        </div>
                      )}

                      {/* Homework & Linked Notes Footer */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                        {/* Topics */}
                        {Array.isArray(log.topics) && log.topics.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {log.topics.map((t, idx) => (
                              <span
                                key={idx}
                                className="bg-[color:var(--surface-container-high)] text-[color:var(--primary)] text-[10px] font-bold px-2 py-0.5 rounded-lg border border-[color:var(--outline-variant)]/20"
                              >
                                #{t}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Homework or Linked Note */}
                        <div className="flex items-center gap-3 ml-auto text-xs">
                          {log.homework && (
                            <div className="flex items-center gap-1 text-amber-600 bg-amber-500/10 px-2.5 py-1 rounded-xl font-bold text-[11px]">
                              <Icon name="assignment" className="text-sm" />
                              <span className="truncate max-w-[200px]">{log.homework}</span>
                            </div>
                          )}

                          {(() => {
                            const existingNote = subjectNotes.find(
                              (n) => n.id === log.linkedNoteId || n.classLogId === log.id || (n.title && n.title.includes(log.title))
                            );
                            const targetNoteId = existingNote?.id || log.linkedNoteId;

                            if (targetNoteId) {
                              return (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveNote(targetNoteId);
                                    onNavigate?.(SCREEN_IDS.NOTE_EDITOR, { noteId: targetNoteId });
                                  }}
                                  className="flex items-center gap-1.5 text-purple-600 dark:text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 px-3 py-1 rounded-xl font-black text-[11px] transition-all cursor-pointer shadow-2xs"
                                  title="Abrir anotações desta aula no Editor de Notas"
                                >
                                  <Icon name="description" className="text-sm text-purple-500" />
                                  <span>Abrir Anotação da Aula</span>
                                </button>
                              );
                            }

                            return (
                              <button
                                type="button"
                                onClick={() => handleCreateClassNote(log)}
                                className="flex items-center gap-1.5 text-[color:var(--primary)] bg-[color:var(--primary)]/10 hover:bg-[color:var(--primary)]/20 border border-[color:var(--primary)]/30 px-3 py-1 rounded-xl font-bold text-[11px] transition-all cursor-pointer"
                                title="Criar uma nova anotação vinculada a esta aula"
                              >
                                <Icon name="note_add" className="text-sm text-[color:var(--primary)]" />
                                <span>Criar Nota da Aula</span>
                              </button>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: ANOTAÇÕES */}
        {activeTab === "Anotações" && (
          <div className="flex-1 overflow-y-auto p-8 bg-[color:var(--background)]">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black text-[color:var(--on-surface)]">Anotações de {subject.name}</h2>
              <button onClick={handleCreateDisciplineNote} className="bg-[color:var(--primary)] text-white px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-md">
                <Icon name="add" /> Nova Anotação
              </button>
            </div>

            {subjectNotes.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {subjectNotes.map(note => (
                  <div 
                    key={note.id} 
                    onClick={() => { setActiveNote(note.id); onNavigate(SCREEN_IDS.NOTE_EDITOR); }}
                    className="bg-[color:var(--surface)] p-6 rounded-3xl border border-[color:var(--outline-variant)]/20 shadow-sm hover:border-[color:var(--primary)] cursor-pointer transition-all flex flex-col justify-between"
                  >
                    <div>
                      <h4 className="font-bold text-base text-[color:var(--on-surface)] mb-2">{note.title}</h4>
                      <p className="text-xs text-[color:var(--on-surface-variant)] line-clamp-3">{note.content?.replace(/<[^>]*>?/gm, '') || "Sem conteúdo"}</p>
                    </div>
                    <span className="text-[10px] font-bold text-[color:var(--primary)] uppercase tracking-wider mt-6 block">
                      {new Date(note.updatedAt || Date.now()).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-[color:var(--on-surface-variant)] opacity-60">
                <Icon name="edit_note" className="text-5xl mb-4" />
                <p className="font-bold text-base">Nenhuma anotação vinculada a esta matéria</p>
                <button onClick={handleCreateDisciplineNote} className="mt-4 px-4 py-2 bg-[color:var(--primary)] text-white rounded-xl text-xs font-bold">
                  Criar Primeira Anotação
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: ARQUIVOS E LINKS */}
        {activeTab === "Arquivos e links" && (
          <div className="flex-1 overflow-y-auto p-8 bg-[color:var(--background)]">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-black text-[color:var(--on-surface)]">
                  Arquivos e links de {subject.name}
                </h2>
                <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">
                  Materiais salvos também aparecem como fontes no Estúdio IA.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={pickSubjectFolder} disabled={importingSubjectFolder} className="border border-[color:var(--outline-variant)] bg-[color:var(--surface)] text-[color:var(--on-surface)] px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 disabled:opacity-50" type="button">
                  <Icon name={importingSubjectFolder ? "progress_activity" : "folder_open"} />
                  {importingSubjectFolder ? "Importando..." : subjectLinkedFolder ? "Atualizar pasta" : "Vincular pasta"}
                </button>
                <button
                  onClick={() => {
                    setSourceFormError("");
                    setShowAddSourceModal(true);
                  }}
                  className="bg-[color:var(--primary)] text-white px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-md"
                  type="button"
                >
                  <Icon name="add_link" /> Adicionar fonte
                </button>
              </div>
            </div>

            <section className="mb-6 rounded-3xl border border-[color:var(--outline-variant)]/30 bg-[color:var(--surface)] p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[color:var(--primary)]/10 text-[color:var(--primary)]">
                    <Icon name={subjectLinkedFolder ? "folder_open" : "folder_off"} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[color:var(--on-surface-variant)]">
                      Pasta da disciplina
                    </p>
                    <h3 className="mt-1 truncate text-base font-black text-[color:var(--on-surface)]">
                      {subjectLinkedFolder?.name || "Nenhuma pasta vinculada"}
                    </h3>
                    <p
                      className="mt-1 max-w-3xl truncate text-xs font-semibold text-[color:var(--on-surface-variant)]"
                      title={subjectLinkedFolder?.path || ""}
                    >
                      {subjectLinkedFolder?.path ||
                        "Selecione uma pasta do computador para puxar automaticamente os arquivos desta disciplina."}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {subjectLinkedFolder ? (
                    <button
                      className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--outline-variant)] bg-[color:var(--surface-container)] px-4 py-2.5 text-xs font-black text-[color:var(--on-surface)] disabled:opacity-50"
                      type="button"
                      onClick={pickSubjectFolder}
                      disabled={importingSubjectFolder}
                    >
                      <Icon name={importingSubjectFolder ? "progress_activity" : "drive_folder_upload"} className="text-[16px]" />
                      {importingSubjectFolder ? "Atualizando..." : "Alterar pasta"}
                    </button>
                  ) : null}
                  {subjectLinkedFolder ? (
                    <button
                      className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs font-black text-red-500"
                      type="button"
                      onClick={unlinkSubjectFolder}
                    >
                      <Icon name="link_off" className="text-[16px]" />
                      Desvincular
                    </button>
                  ) : (
                    <button
                      className="inline-flex items-center gap-2 rounded-xl bg-[color:var(--primary)] px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"
                      type="button"
                      onClick={pickSubjectFolder}
                      disabled={importingSubjectFolder}
                    >
                      <Icon name={importingSubjectFolder ? "progress_activity" : "folder_open"} className="text-[16px]" />
                      {importingSubjectFolder ? "Importando..." : "Vincular pasta"}
                    </button>
                  )}
                </div>
              </div>
            </section>

            {sources.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {[...new Set(sources.map(source => source.linkedFolderName || (source.fromLessonNote ? "Materiais de aulas" : source.type === "link" ? "Links" : source.type === "pdf" ? "PDFs" : "Documentos")))].map(group => <details key={group} className="subject-material-group">
                  <summary>{group} <small>{sources.filter(source => (source.linkedFolderName || (source.fromLessonNote ? "Materiais de aulas" : source.type === "link" ? "Links" : source.type === "pdf" ? "PDFs" : "Documentos")) === group).length} materiais</small></summary>
                {sources.filter(source => (source.linkedFolderName || (source.fromLessonNote ? "Materiais de aulas" : source.type === "link" ? "Links" : source.type === "pdf" ? "PDFs" : "Documentos")) === group).map((source) => (
                  <article
                    key={source.id}
                    className="group bg-[color:var(--surface)] p-5 rounded-3xl border border-[color:var(--outline-variant)]/20 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-[color:var(--primary)]/10 text-[color:var(--primary)] flex items-center justify-center">
                        <Icon
                          name={
                            source.type === "link"
                              ? "link"
                              : source.type === "pdf"
                                ? "picture_as_pdf"
                                : "draft"
                          }
                        />
                      </div>
                      {!source.fromLessonNote ? <button
                        className="p-2 text-red-500 opacity-60 hover:opacity-100"
                        type="button"
                        title="Remover fonte"
                        onClick={() =>
                          deleteAcademicEntity("resources", source.id)
                        }
                      >
                        <Icon name="delete" className="text-[18px]" />
                      </button> : <span className="rounded-full bg-[color:var(--primary)]/10 px-2 py-1 text-[10px] font-black text-[color:var(--primary)]">Nota de aula</span>}
                    </div>
                    <h3 className="mt-4 font-black line-clamp-2">{source.name}</h3>
                    {source.fromLessonNote ? <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[color:var(--primary)]">Anexo de: {source.sourceNoteTitle || "Nota de aula"}</p> : null}
                    {source.linkedFolderName ? <p className="mt-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[color:var(--on-surface-variant)]"><Icon name="folder" className="text-[13px]" /> Pasta: {source.linkedFolderName}</p> : null}
                    <p
                      className="mt-1 truncate text-xs text-[color:var(--on-surface-variant)]"
                      title={source.url || source.path}
                    >
                      {source.url || source.path}
                    </p>
                    <button
                      className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[color:var(--primary)]/10 px-3 py-2 text-xs font-black text-[color:var(--primary)]"
                      type="button"
                      onClick={() => openSource(source)}
                    >
                      <Icon name="open_in_new" className="text-[16px]" />
                      Abrir
                    </button>
                  </article>
                ))}
                </details>)}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-[color:var(--on-surface-variant)]">
                <Icon name="folder_open" className="text-5xl mb-4 opacity-50" />
                <p className="font-bold text-base">Nenhum material adicionado</p>
                <p className="mt-1 text-xs opacity-70">
                  Adicione um arquivo do computador ou um link da web.
                </p>
              </div>
            )}
          </div>
        )}

        {/* TAB 5: TAREFAS E TRABALHOS */}
        {activeTab === "Tarefas e trabalhos" && (
          <div className="flex-1 overflow-y-auto p-8 bg-[color:var(--background)] flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-[color:var(--on-surface)]">Tarefas e Trabalhos</h2>
                <p className="text-xs text-[color:var(--on-surface-variant)] mt-0.5">
                  Gerencie prazos, trabalhos acadêmicos e deveres de casa de {subject?.name}.
                </p>
              </div>

              <button
                onClick={handleOpenAddTaskModal}
                className="bg-[color:var(--primary)] text-white px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-md hover:opacity-90 transition-opacity"
              >
                <Icon name="add_task" className="text-base" /> Nova Tarefa ou Trabalho
              </button>
            </div>

            {/* Quick Task Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!quickTaskTitle.trim()) return;
                addTask({
                  title: quickTaskTitle.trim(),
                  dueDate: getLocalDateKey(),
                  priority: "medium",
                  type: "assignment",
                  subjectId: activeSubjectId,
                  academicSubjectId: activeSubjectId,
                  status: "pending",
                });
                setQuickTaskTitle("");
                showToast("Tarefa rápida criada!");
              }}
              className="bg-[color:var(--surface)] p-3 rounded-2xl border border-[color:var(--outline-variant)]/20 shadow-sm flex items-center gap-3"
            >
              <Icon name="playlist_add" className="text-xl text-[color:var(--primary)] ml-2" />
              <input
                type="text"
                value={quickTaskTitle}
                onChange={(e) => setQuickTaskTitle(e.target.value)}
                placeholder="Adicionar tarefa rápida para esta disciplina e pressionar Enter..."
                className="flex-1 bg-transparent border-none outline-none text-xs font-bold text-[color:var(--on-surface)] placeholder:text-[color:var(--on-surface-variant)]/50"
              />
              <button
                type="submit"
                disabled={!quickTaskTitle.trim()}
                className="bg-[color:var(--primary)]/10 text-[color:var(--primary)] disabled:opacity-40 px-4 py-1.5 rounded-xl text-xs font-bold transition-all"
              >
                Adicionar
              </button>
            </form>

            {/* Task List */}
            {subjectTasks.length > 0 ? (
              <div className="flex flex-col gap-3">
                {subjectTasks.map(task => {
                  const isDone = task.status === "completed";

                  return (
                    <div
                      key={task.id}
                      className="bg-[color:var(--surface)] p-5 rounded-2xl border border-[color:var(--outline-variant)]/20 shadow-sm hover:border-[color:var(--primary)]/30 transition-all flex items-center justify-between gap-4 group"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <button 
                          onClick={() => updateTask(task.id, { status: isDone ? 'pending' : 'completed' })}
                          className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-colors ${
                            isDone ? 'bg-green-500 border-green-500 text-white' : 'border-[color:var(--outline-variant)]/50 hover:border-[color:var(--primary)]'
                          }`}
                        >
                          {isDone && <Icon name="check" className="text-[14px]" />}
                        </button>
                        
                        <div className="min-w-0 flex-1">
                          <h4 className={`font-bold text-sm truncate ${isDone ? 'line-through text-[color:var(--on-surface-variant)] opacity-60' : 'text-[color:var(--on-surface)]'}`}>
                            {task.title}
                          </h4>
                          {task.description && (
                            <p className="text-xs text-[color:var(--on-surface-variant)] truncate mt-0.5">{task.description}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {/* Type Badge */}
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full ${
                          task.type === "assignment" ? "bg-purple-500/10 text-purple-600" : "bg-blue-500/10 text-blue-600"
                        }`}>
                          {task.type === "assignment" ? "Trabalho" : "Tarefa"}
                        </span>

                        {/* Priority Badge */}
                        {task.priority && (
                          <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                            task.priority === "high" ? "bg-red-500/10 text-red-600" :
                            task.priority === "medium" ? "bg-amber-500/10 text-amber-600" : "bg-gray-500/10 text-gray-500"
                          }`}>
                            {task.priority === "high" ? "Alta" : task.priority === "medium" ? "Média" : "Baixa"}
                          </span>
                        )}

                        {/* Due Date */}
                        {task.dueDate && (
                          <span className="text-xs font-semibold text-[color:var(--on-surface-variant)] flex items-center gap-1">
                            <Icon name="event" className="text-sm text-[color:var(--primary)]" /> {task.dueDate}
                          </span>
                        )}

                        {/* Delete Button */}
                        <button
                          onClick={() => {
                            if (window.confirm("Excluir esta tarefa?")) {
                              deleteTask?.(task.id);
                              showToast("Tarefa removida.");
                            }
                          }}
                          className="p-1.5 rounded-xl text-red-500 hover:bg-red-500/10 opacity-40 group-hover:opacity-100 transition-all"
                          title="Excluir Tarefa"
                        >
                          <Icon name="delete" className="text-base" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 bg-[color:var(--surface)] rounded-3xl border border-[color:var(--outline-variant)]/20 text-center gap-3">
                <div className="w-16 h-16 rounded-full bg-[color:var(--primary)]/10 text-[color:var(--primary)] flex items-center justify-center">
                  <Icon name="task_alt" className="text-3xl" />
                </div>
                <h3 className="font-black text-base text-[color:var(--on-surface)]">Nenhuma tarefa cadastrada nesta disciplina</h3>
                <p className="text-xs text-[color:var(--on-surface-variant)] max-w-sm">
                  Crie tarefas ou trabalhos para organizar seus estudos e não perder nenhum prazo.
                </p>
                <button
                  onClick={handleOpenAddTaskModal}
                  className="bg-[color:var(--primary)] text-white px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-md mt-1"
                >
                  <Icon name="add_task" /> Criar Primeira Tarefa
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 6: FLASHCARDS */}
        {activeTab === "Flashcards" && (
          <div className="flex-1 overflow-y-auto p-8 bg-[color:var(--background)] flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-[color:var(--on-surface)]">Baralhos de Flashcards</h2>
                <p className="text-xs text-[color:var(--on-surface-variant)] mt-0.5">
                  Estude e memorize os conceitos chave de {subject?.name}.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button 
                  onClick={() => openAiToolModal("flashcards")} 
                  className="bg-[color:var(--surface-container-high)] text-[color:var(--on-surface)] hover:bg-[color:var(--surface-container-highest)] px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-colors"
                >
                  <Icon name="auto_awesome" className="text-base text-[color:var(--primary)]" /> Gerar com IA Ollama
                </button>
                <button
                  onClick={handleOpenAddDeckModal}
                  className="bg-[color:var(--primary)] text-white px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-md hover:opacity-90 transition-opacity"
                >
                  <Icon name="add" className="text-base" /> Novo Baralho
                </button>
              </div>
            </div>

            {subjectDecks.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {subjectDecks.map(deck => (
                  <div key={deck.id} className="bg-[color:var(--surface)] p-6 rounded-3xl border border-[color:var(--outline-variant)]/20 shadow-sm flex flex-col justify-between group hover:border-[color:var(--primary)]/40 transition-all">
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="w-10 h-10 rounded-2xl bg-[color:var(--primary)]/10 text-[color:var(--primary)] flex items-center justify-center font-bold">
                          <Icon name="style" className="text-xl" />
                        </div>
                        <button
                          onClick={() => {
                            if (window.confirm("Excluir este baralho de flashcards?")) {
                              deleteFlashcardDeck?.(deck.id);
                              showToast("Baralho de flashcards removido.");
                            }
                          }}
                          className="p-1.5 rounded-xl text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Excluir Baralho"
                        >
                          <Icon name="delete" className="text-base" />
                        </button>
                      </div>
                      
                      <h4 className="font-black text-base text-[color:var(--on-surface)] mb-1 line-clamp-2">{deck.title}</h4>
                      <p className="text-xs font-bold text-[color:var(--primary)] uppercase tracking-wider">
                        {deck.cards?.length || 0} cartões
                      </p>
                    </div>

                    <button
                      onClick={() => {
                        onNavigate?.(SCREEN_IDS.FLASHCARDS, { deckId: deck.id });
                      }}
                      className="mt-6 w-full py-2.5 bg-[color:var(--primary)]/10 text-[color:var(--primary)] hover:bg-[color:var(--primary)] text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
                    >
                      <Icon name="play_arrow" className="text-base" /> Estudar Baralho
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 bg-[color:var(--surface)] rounded-3xl border border-[color:var(--outline-variant)]/20 text-center gap-3">
                <div className="w-16 h-16 rounded-full bg-[color:var(--primary)]/10 text-[color:var(--primary)] flex items-center justify-center">
                  <Icon name="style" className="text-3xl" />
                </div>
                <h3 className="font-black text-base text-[color:var(--on-surface)]">Nenhum baralho de flashcards nesta disciplina</h3>
                <p className="text-xs text-[color:var(--on-surface-variant)] max-w-sm">
                  Crie baralhos manuais ou utilize a IA Ollama para gerar cartões automaticamente a partir dos materiais.
                </p>
                <div className="flex items-center gap-3 mt-2">
                  <button
                    onClick={() => openAiToolModal("flashcards")}
                    className="bg-[color:var(--surface-container-high)] text-[color:var(--on-surface)] px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2"
                  >
                    <Icon name="auto_awesome" className="text-base text-[color:var(--primary)]" /> Gerar com IA
                  </button>
                  <button
                    onClick={handleOpenAddDeckModal}
                    className="bg-[color:var(--primary)] text-white px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-md"
                  >
                    <Icon name="add" /> Criar Baralho Manual
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: PROVAS E NOTAS */}
        {activeTab === "Provas e notas" && (
          <div className="flex-1 overflow-y-auto p-8 bg-[color:var(--background)] flex flex-col gap-8">
            
            {/* 1. ACADEMIC GRADE KPI DASHBOARD */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {/* Média Atual */}
              <div className="bg-[color:var(--surface)] p-6 rounded-3xl border border-[color:var(--outline-variant)]/20 shadow-sm flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-[color:var(--on-surface-variant)]">Média Atual Ponderada</span>
                  <div className={`text-3xl font-black mt-1 ${
                    gradeSummary.currentAverage >= (subject?.passingGrade || 6) ? "text-green-600" : subjectGrades.length === 0 ? "text-[color:var(--on-surface)]" : "text-red-500"
                  }`}>
                    {gradeSummary.currentAverage.toFixed(1)} <span className="text-xs font-semibold text-[color:var(--on-surface-variant)]">/ 10</span>
                  </div>
                  <span className="text-[11px] font-bold text-[color:var(--on-surface-variant)] opacity-75 mt-0.5 block">
                    Média Mínima: {subject?.passingGrade || 6.0}
                  </span>
                </div>
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold ${
                  gradeSummary.currentAverage >= (subject?.passingGrade || 6) ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-500"
                }`}>
                  <Icon name="monitoring" className="text-2xl" />
                </div>
              </div>

              {/* Média Necessária no Restante */}
              <div className="bg-[color:var(--surface)] p-6 rounded-3xl border border-[color:var(--outline-variant)]/20 shadow-sm flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-[color:var(--on-surface-variant)]">Nota Mínima Necessária</span>
                  <div className="text-3xl font-black text-amber-500 mt-1">
                    {gradeSummary.neededAverage !== null ? gradeSummary.neededAverage.toFixed(1) : "—"}
                  </div>
                  <span className="text-[11px] font-bold text-[color:var(--on-surface-variant)] opacity-75 mt-0.5 block">
                    nos {gradeSummary.remainingWeight}% restantes
                  </span>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
                  <Icon name="flag" className="text-2xl" />
                </div>
              </div>

              {/* Peso Lançado */}
              <div className="bg-[color:var(--surface)] p-6 rounded-3xl border border-[color:var(--outline-variant)]/20 shadow-sm flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-[color:var(--on-surface-variant)]">Peso Avaliado</span>
                  <div className="text-3xl font-black text-[color:var(--primary)] mt-1">
                    {gradeSummary.completedWeight}% <span className="text-xs font-semibold text-[color:var(--on-surface-variant)]">/ 100%</span>
                  </div>
                  <span className="text-[11px] font-bold text-[color:var(--on-surface-variant)] opacity-75 mt-0.5 block">
                    {subjectGrades.length} notas lançadas
                  </span>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-[color:var(--primary)]/10 text-[color:var(--primary)] flex items-center justify-center font-bold">
                  <Icon name="pie_chart" className="text-2xl" />
                </div>
              </div>

              {/* Próximas Provas */}
              <div className="bg-[color:var(--surface)] p-6 rounded-3xl border border-[color:var(--outline-variant)]/20 shadow-sm flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-[color:var(--on-surface-variant)]">Provas Agendadas</span>
                  <div className="text-3xl font-black text-purple-600 mt-1">
                    {subjectExams.length} <span className="text-xs font-semibold text-[color:var(--on-surface-variant)]">provas</span>
                  </div>
                  <span className="text-[11px] font-bold text-[color:var(--on-surface-variant)] opacity-75 mt-0.5 block">
                    próximas avaliações
                  </span>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-600 flex items-center justify-center font-bold">
                  <Icon name="event" className="text-2xl" />
                </div>
              </div>
            </div>

            {/* 2. PROVAS AGENDADAS SECTION */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-[color:var(--on-surface)] flex items-center gap-2">
                    <Icon name="event" className="text-[color:var(--primary)]" /> Provas & Exames Agendados
                  </h3>
                  <p className="text-xs text-[color:var(--on-surface-variant)] mt-0.5">
                    Calendário de provas com plano de estudos e matérias cobradas.
                  </p>
                </div>

                <button
                  onClick={handleOpenAddExamModal}
                  className="bg-[color:var(--primary)] text-white px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-md hover:opacity-90 transition-opacity"
                >
                  <Icon name="add" className="text-base" /> Agendar Prova
                </button>
              </div>

              {subjectExams.length === 0 ? (
                <div className="bg-[color:var(--surface)] p-8 rounded-3xl border border-[color:var(--outline-variant)]/20 text-center flex flex-col items-center justify-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-600 flex items-center justify-center">
                    <Icon name="event" className="text-2xl" />
                  </div>
                  <p className="font-bold text-sm text-[color:var(--on-surface)]">Nenhuma prova agendada para esta disciplina</p>
                  <button
                    onClick={handleOpenAddExamModal}
                    className="bg-[color:var(--primary)] text-white px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-sm mt-1"
                  >
                    <Icon name="add" /> Agendar Primeira Prova
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {subjectExams.map((exam) => (
                    <div
                      key={exam.id}
                      className="bg-[color:var(--surface)] p-6 rounded-3xl border border-[color:var(--outline-variant)]/20 shadow-sm flex flex-col justify-between gap-4 group hover:border-[color:var(--primary)]/40 transition-all"
                    >
                      <div className="flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center font-bold">
                              <Icon name="assignment" className="text-base" />
                            </span>
                            <h4 className="font-black text-base text-[color:var(--on-surface)]">{exam.title}</h4>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleOpenAddGradeModal(exam.title, exam.weight)}
                              className="px-2.5 py-1 rounded-xl bg-[color:var(--primary)]/10 text-[color:var(--primary)] hover:bg-[color:var(--primary)] hover:text-white text-[11px] font-bold transition-all"
                              title="Lançar Nota obtida nesta prova"
                            >
                              + Lançar Nota
                            </button>
                            <button
                              onClick={() => handleOpenEditExamModal(exam)}
                              className="p-1.5 rounded-xl hover:bg-[color:var(--surface-container-high)] text-[color:var(--on-surface-variant)] transition-colors"
                              title="Editar Prova"
                            >
                              <Icon name="edit" className="text-base" />
                            </button>
                            <button
                              onClick={() => handleDeleteExam(exam.id)}
                              className="p-1.5 rounded-xl hover:bg-red-500/10 text-red-500 transition-colors"
                              title="Excluir Prova"
                            >
                              <Icon name="delete" className="text-base" />
                            </button>
                          </div>
                        </div>

                        {/* Exam Details */}
                        <div className="flex flex-wrap items-center gap-3 text-xs text-[color:var(--on-surface-variant)] mt-1">
                          <span className="flex items-center gap-1 font-bold text-[color:var(--primary)]">
                            <Icon name="calendar_today" className="text-sm" /> {exam.date}
                          </span>
                          {exam.time && (
                            <span className="flex items-center gap-1 font-semibold">
                              <Icon name="schedule" className="text-sm" /> {exam.time}
                            </span>
                          )}
                          {exam.location && (
                            <span className="flex items-center gap-1 font-semibold">
                              <Icon name="room" className="text-sm" /> {exam.location}
                            </span>
                          )}
                          {exam.weight && (
                            <span className="bg-purple-500/10 text-purple-600 font-bold px-2 py-0.5 rounded-md text-[10px]">
                              Peso: {exam.weight}%
                            </span>
                          )}
                        </div>

                        {/* Topics */}
                        {Array.isArray(exam.topics) && exam.topics.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            {exam.topics.map((t, idx) => (
                              <span
                                key={idx}
                                className="bg-[color:var(--surface-container-high)] text-[color:var(--on-surface)] text-[10px] font-bold px-2 py-0.5 rounded-lg border border-[color:var(--outline-variant)]/20"
                              >
                                #{t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Study Plan Notice */}
                      {exam.studyDays && (
                        <div className="bg-[color:var(--surface-container-low)] p-3 rounded-2xl border border-[color:var(--outline-variant)]/20 flex items-center justify-between text-xs">
                          <span className="text-[color:var(--on-surface-variant)] font-medium flex items-center gap-1.5">
                            <Icon name="school" className="text-amber-500 text-sm" /> Iniciar preparação {exam.studyDays} dias antes
                          </span>
                          <span className="font-bold text-[color:var(--primary)] text-[11px] uppercase tracking-wider">
                            Plano Ativo
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 3. HISTÓRICO DE NOTAS LANÇADAS SECTION */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-[color:var(--on-surface)] flex items-center gap-2">
                    <Icon name="grade" className="text-amber-500" /> Notas & Boletim Lançado
                  </h3>
                  <p className="text-xs text-[color:var(--on-surface-variant)] mt-0.5">
                    Histórico completo de notas para cálculo da média da disciplina.
                  </p>
                </div>

                <button
                  onClick={() => handleOpenAddGradeModal()}
                  className="bg-[color:var(--primary)] text-white px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-md hover:opacity-90 transition-opacity"
                >
                  <Icon name="add" className="text-base" /> Lançar Nota
                </button>
              </div>

              {subjectGrades.length === 0 ? (
                <div className="bg-[color:var(--surface)] p-8 rounded-3xl border border-[color:var(--outline-variant)]/20 text-center flex flex-col items-center justify-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                    <Icon name="grade" className="text-2xl" />
                  </div>
                  <p className="font-bold text-sm text-[color:var(--on-surface)]">Nenhuma nota lançada nesta disciplina ainda</p>
                  <button
                    onClick={() => handleOpenAddGradeModal()}
                    className="bg-[color:var(--primary)] text-white px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-sm mt-1"
                  >
                    <Icon name="add" /> Lançar Primeira Nota
                  </button>
                </div>
              ) : (
                <div className="bg-[color:var(--surface)] rounded-3xl border border-[color:var(--outline-variant)]/20 overflow-hidden shadow-sm">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[color:var(--surface-container-low)] text-[color:var(--on-surface-variant)] uppercase text-[10px] font-black tracking-wider border-b border-[color:var(--outline-variant)]/20">
                      <tr>
                        <th className="p-4">Avaliação / Prova</th>
                        <th className="p-4">Nota Obtida</th>
                        <th className="p-4">Peso (%)</th>
                        <th className="p-4">Contribuição</th>
                        <th className="p-4">Data</th>
                        <th className="p-4 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[color:var(--outline-variant)]/10 font-bold">
                      {subjectGrades.map((grade) => {
                        const scoreNum = Number(grade.score || 0);
                        const maxNum = Number(grade.maxScore || 10);
                        const weightNum = Number(grade.weight || 0);
                        const contribution = ((scoreNum / maxNum) * 10 * (weightNum / 100)).toFixed(2);
                        const isPassingGrade = (scoreNum / maxNum) * 10 >= (subject?.passingGrade || 6);

                        return (
                          <tr key={grade.id} className="hover:bg-[color:var(--surface-container-low)]/50 transition-colors">
                            <td className="p-4">
                              <div className="flex items-center gap-2">
                                <span className="w-7 h-7 rounded-lg bg-[color:var(--primary)]/10 text-[color:var(--primary)] flex items-center justify-center text-xs">
                                  <Icon name={grade.category === "assignment" ? "assignment" : "grade"} />
                                </span>
                                <div>
                                  <span className="text-sm font-black text-[color:var(--on-surface)] block">{grade.title}</span>
                                  {grade.notes && (
                                    <span className="text-[10px] text-[color:var(--on-surface-variant)] font-normal block">{grade.notes}</span>
                                  )}
                                </div>
                              </div>
                            </td>

                            <td className="p-4">
                              <span className={`text-sm font-black ${isPassingGrade ? "text-green-600" : "text-red-500"}`}>
                                {scoreNum.toFixed(1)} <span className="text-xs text-[color:var(--on-surface-variant)] font-normal">/ {maxNum}</span>
                              </span>
                            </td>

                            <td className="p-4 text-[color:var(--on-surface)]">
                              {weightNum}%
                            </td>

                            <td className="p-4 text-[color:var(--primary)] font-black">
                              +{contribution} pts
                            </td>

                            <td className="p-4 text-[color:var(--on-surface-variant)] font-semibold">
                              {grade.date || "—"}
                            </td>

                            <td className="p-4 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => handleOpenEditGradeModal(grade)}
                                  className="p-1.5 rounded-xl hover:bg-[color:var(--surface-container-high)] text-[color:var(--on-surface-variant)] transition-colors"
                                  title="Editar Nota"
                                >
                                  <Icon name="edit" className="text-base" />
                                </button>
                                <button
                                  onClick={() => handleDeleteGrade(grade.id)}
                                  className="p-1.5 rounded-xl hover:bg-red-500/10 text-red-500 transition-colors"
                                  title="Excluir Nota"
                                >
                                  <Icon name="delete" className="text-base" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB: PESSOAS E COMPARTILHAMENTO */}
        {activeTab === "Pessoas" && (
          <div className="flex-1 overflow-y-auto bg-[color:var(--background)] p-6 md:p-8">
            <div className="mx-auto flex max-w-6xl flex-col gap-6">
              <section className="overflow-hidden rounded-3xl border border-[color:var(--outline-variant)]/25 bg-[color:var(--surface)] shadow-sm">
                <div className="flex flex-col justify-between gap-6 p-6 md:flex-row md:items-center md:p-8">
                  <div className="flex items-start gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[color:var(--primary)] text-white shadow-lg">
                      <Icon name="groups" className="text-3xl" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[color:var(--primary)]">
                        Colaboração da disciplina
                      </p>
                      <h2 className="mt-1 text-2xl font-black text-[color:var(--on-surface)]">
                        Estude junto em {subject.name}
                      </h2>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--on-surface-variant)]">
                        Convide colegas para consultar a disciplina, comentar materiais ou ajudar a organizar conteúdos.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSubjectShareModal(true)}
                    className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[color:var(--primary)] px-5 text-xs font-black text-white shadow-lg transition-transform hover:-translate-y-0.5"
                  >
                    <Icon name="person_add" />
                    Compartilhar disciplina
                  </button>
                </div>
                <div className="grid grid-cols-2 border-t border-[color:var(--outline-variant)]/20 md:grid-cols-4">
                  {[
                    ["edit_note", subjectNotes.length, "Anotações"],
                    ["task_alt", subjectTasks.length, "Tarefas"],
                    ["folder_open", sources.length, "Materiais"],
                    ["style", subjectDecks.length, "Baralhos"],
                  ].map(([icon, count, label]) => (
                    <div key={label} className="flex items-center gap-3 border-b border-r border-[color:var(--outline-variant)]/20 p-4 last:border-r-0 md:border-b-0">
                      <Icon name={icon} className="text-xl text-[color:var(--primary)]" />
                      <span>
                        <strong className="block text-lg font-black text-[color:var(--on-surface)]">{count}</strong>
                        <small className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--on-surface-variant)]">{label}</small>
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(260px,.7fr)]">
                <section className="rounded-3xl border border-[color:var(--outline-variant)]/25 bg-[color:var(--surface)] p-6 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-black text-[color:var(--on-surface)]">Quem tem acesso</h3>
                      <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">
                        {subjectInvitations.length + 1} pessoa{subjectInvitations.length ? "s" : ""} nesta disciplina
                      </p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wide ${
                      collaborationCloudConfigured && accountSession
                        ? "bg-emerald-500/10 text-emerald-600"
                        : "bg-amber-500/10 text-amber-600"
                    }`}>
                      {collaborationCloudConfigured && accountSession ? "Online" : "Somente local"}
                    </span>
                  </div>

                  <div className="mt-5 space-y-3">
                    <article className="flex items-center gap-4 rounded-2xl border border-[color:var(--primary)]/20 bg-[color:var(--primary)]/5 p-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[color:var(--primary)] font-black text-white">
                        {String(accountSession?.user?.user_metadata?.display_name || collaboration.profile?.name || "V")[0].toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="truncate text-sm text-[color:var(--on-surface)]">
                            {accountSession?.user?.user_metadata?.display_name || collaboration.profile?.name || "Você"}
                          </strong>
                          <span className="rounded-full bg-[color:var(--primary)] px-2 py-0.5 text-[9px] font-black uppercase text-white">Proprietário</span>
                        </div>
                        <p className="mt-1 truncate text-xs text-[color:var(--on-surface-variant)]">
                          {accountSession?.user?.email || collaboration.profile?.email || "Dados salvos neste computador"}
                        </p>
                      </div>
                      <Icon name="verified_user" className="text-xl text-[color:var(--primary)]" />
                    </article>

                    {subjectInvitations.map((invite) => {
                      const isRevoked = invite.status === "revoked";
                      return (
                        <article key={invite.id} className={`flex items-center gap-4 rounded-2xl border border-[color:var(--outline-variant)]/25 p-4 ${isRevoked ? "opacity-55" : "bg-[color:var(--surface-container-lowest)]"}`}>
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[color:var(--surface-container-high)] font-black text-[color:var(--primary)]">
                            {String(invite.email || "?")[0].toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <strong className="block truncate text-sm text-[color:var(--on-surface)]">{invite.email}</strong>
                            <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">
                              {sharingPermissionLabels[invite.permission] || "Leitor"} · {sharingStatusLabels[invite.status] || invite.status}
                            </p>
                          </div>
                          {!isRevoked ? (
                            <button
                              type="button"
                              title="Revogar acesso"
                              className="rounded-xl p-2 text-[color:var(--on-surface-variant)] transition-colors hover:bg-red-500/10 hover:text-red-500"
                              onClick={async () => {
                                try {
                                  if (invite.online) await collaborationCloud.revokeInvitation(invite.id);
                                  revokeShareInvitation(invite.id);
                                  setPeopleRefreshKey((value) => value + 1);
                                } catch (error) {
                                  setPeopleStatus(error.message || "Não foi possível revogar o acesso.");
                                }
                              }}
                            >
                              <Icon name="person_remove" />
                            </button>
                          ) : null}
                        </article>
                      );
                    })}

                    {!subjectInvitations.length ? (
                      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[color:var(--outline-variant)] p-10 text-center">
                        <Icon name="group_add" className="text-4xl text-[color:var(--on-surface-variant)]/50" />
                        <h4 className="mt-3 text-sm font-black text-[color:var(--on-surface)]">Só você tem acesso</h4>
                        <p className="mt-1 max-w-sm text-xs leading-5 text-[color:var(--on-surface-variant)]">
                          Convide um colega pelo e-mail cadastrado no masterStudy.
                        </p>
                      </div>
                    ) : null}
                  </div>
                  {peopleStatus ? <p className="mt-4 rounded-xl bg-amber-500/10 px-4 py-3 text-xs font-bold text-amber-700">{peopleStatus}</p> : null}
                </section>

                <aside className="space-y-5">
                  <section className="rounded-3xl border border-[color:var(--outline-variant)]/25 bg-[color:var(--surface)] p-6 shadow-sm">
                    <h3 className="text-base font-black text-[color:var(--on-surface)]">Níveis de acesso</h3>
                    <div className="mt-4 space-y-4">
                      {[
                        ["visibility", "Leitor", "Pode consultar os conteúdos compartilhados."],
                        ["comment", "Comentador", "Pode consultar e participar com comentários."],
                        ["edit", "Editor", "Pode colaborar e atualizar conteúdos da disciplina."],
                      ].map(([icon, title, description]) => (
                        <div key={title} className="flex items-start gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[color:var(--primary)]/10 text-[color:var(--primary)]"><Icon name={icon} className="text-lg" /></span>
                          <span><strong className="block text-xs text-[color:var(--on-surface)]">{title}</strong><small className="mt-1 block text-[10px] leading-4 text-[color:var(--on-surface-variant)]">{description}</small></span>
                        </div>
                      ))}
                    </div>
                  </section>
                  <section className="rounded-3xl border border-blue-500/20 bg-blue-500/5 p-5">
                    <div className="flex gap-3">
                      <Icon name="cloud_upload" className="text-xl text-blue-600" />
                      <p className="text-xs leading-5 text-[color:var(--on-surface-variant)]">
                        Dados da disciplina são compartilhados pelo Supabase. Arquivos locais ainda não são enviados ao servidor.
                      </p>
                    </div>
                  </section>
                </aside>
              </div>
            </div>
          </div>
        )}

        {/* OTHER TABS FALLBACK */}
        {!["Estúdio IA", "Visão geral", "Aulas", "Anotações", "Arquivos e links", "Tarefas e trabalhos", "Provas e notas", "Flashcards", "Plano de estudos", "Pessoas"].includes(activeTab) && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-[color:var(--on-surface-variant)] opacity-60">
            <Icon name="construction" className="text-6xl mb-4" />
            <h3 className="text-lg font-bold">Aba {activeTab}</h3>
          </div>
        )}
      </main>

      {/* MODAL: OLLAMA CONFIGURATION */}
      {showOllamaConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[color:var(--surface)] w-full max-w-md rounded-3xl p-8 shadow-2xl relative">
            <button type="button" onClick={() => setShowOllamaConfigModal(false)} className="absolute top-4 right-4 text-[color:var(--on-surface-variant)]">
              <Icon name="close" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-[color:var(--primary)]/10 text-[color:var(--primary)] flex items-center justify-center font-bold">
                <Icon name="memory" />
              </div>
              <h2 className="text-lg font-bold text-[color:var(--on-surface)]">Conexão Ollama Local</h2>
            </div>
            
            <p className="text-xs text-[color:var(--on-surface-variant)] leading-relaxed mb-6">
              O Ollama permite rodar modelos de IA diretamente no seu computador sem enviar dados para a nuvem.
            </p>

            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-2">URL do Servidor Ollama</label>
                <input 
                  type="text" 
                  value={tempUrl}
                  onChange={e => setTempUrl(e.target.value)}
                  placeholder="http://localhost:11434"
                  className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 outline-none text-sm font-mono font-bold"
                />
              </div>

              {availableModels.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-2">Modelo Padrão Instalado</label>
                  <select 
                    value={selectedModel}
                    onChange={e => setSelectedModel(e.target.value)}
                    className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 outline-none text-sm font-bold"
                  >
                    {availableModels.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-8">
              <button 
                type="button" 
                onClick={() => {
                  setOllamaUrl(tempUrl.trim() || "http://localhost:11434");
                  localStorage.setItem("studyhub_ollama_url", tempUrl.trim() || "http://localhost:11434");
                  setShowOllamaConfigModal(false);
                }}
                className="w-full bg-[color:var(--primary)] text-white font-bold py-3 rounded-xl shadow-md uppercase tracking-wider text-xs"
              >
                Salvar Conexão Ollama
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADICIONAR FONTE */}
      {showAddSourceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <form onSubmit={handleAddSource} className="bg-[color:var(--surface)] w-full max-w-md rounded-3xl p-8 shadow-2xl relative">
            <button
              type="button"
              onClick={() => {
                setShowAddSourceModal(false);
                setNewSourceForm(createAcademicResourceForm("file"));
                setSourceFormError("");
              }}
              className="absolute top-4 right-4 text-[color:var(--on-surface-variant)]"
            >
              <Icon name="close" />
            </button>
            <h2 className="text-lg font-bold mb-6 text-[color:var(--on-surface)]">Adicionar Nova Fonte</h2>

            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-2">Nome do material</label>
                <input
                  required
                  type="text"
                  value={newSourceForm.title}
                  onChange={(event) => {
                    setNewSourceForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }));
                    setSourceFormError("");
                  }}
                  placeholder="Ex: Aula 03 - Algoritmos"
                  className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 outline-none text-sm font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-2">Tipo de fonte</label>
                <div className="grid grid-cols-2 gap-2">
                  {["file", "link"].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setNewSourceForm((current) => ({
                          ...current,
                          type,
                          path: "",
                          url: "",
                        }));
                        setSourceFormError("");
                      }}
                      className={`rounded-xl px-4 py-3 text-sm font-bold transition-colors ${
                        newSourceForm.type === type
                          ? "bg-[color:var(--primary)] text-white"
                          : "bg-[color:var(--surface-container-low)] text-[color:var(--on-surface-variant)]"
                      }`}
                    >
                      <Icon
                        name={type === "file" ? "attach_file" : "link"}
                        className="mr-1 text-[17px]"
                      />
                      {type === "file" ? "Arquivo" : "Link"}
                    </button>
                  ))}
                </div>
              </div>

              {newSourceForm.type === "file" ? (
                <button
                  className="w-full rounded-xl border-2 border-dashed border-[color:var(--primary)]/30 bg-[color:var(--primary)]/5 px-4 py-4 text-sm font-bold text-[color:var(--primary)]"
                  type="button"
                  onClick={pickSourceFile}
                >
                  <Icon name="upload_file" className="mr-2" />
                  {newSourceForm.path
                    ? resourceFileName(newSourceForm.path)
                    : "Selecionar arquivo"}
                </button>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-2">Endereço do link</label>
                  <input
                    required
                    type="text"
                    inputMode="url"
                    value={newSourceForm.url}
                    onChange={(event) => {
                      setNewSourceForm((current) => ({
                        ...current,
                        url: event.target.value,
                      }));
                      setSourceFormError("");
                    }}
                    placeholder="https://exemplo.com/material"
                    className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 outline-none text-sm font-bold"
                  />
                </div>
              )}

              {sourceFormError ? (
                <p className="rounded-xl bg-red-500/10 px-4 py-3 text-xs font-bold text-red-600">
                  {sourceFormError}
                </p>
              ) : null}
            </div>

            <button type="submit" className="w-full mt-8 bg-[color:var(--primary)] text-white font-bold py-3 rounded-xl shadow-md uppercase tracking-wider text-xs">
              Salvar Fonte
            </button>
          </form>
        </div>
      )}

      {/* AI TOOL MODALS (GUIA DE ESTUDO, RESUMO, FLASHCARDS, QUIZ, PLANO, MAPA) */}
      {activeAiToolModal && (
        <div role="dialog" aria-modal="true" aria-label="Ferramenta de estudo" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-[color:var(--surface)] w-full max-w-2xl rounded-3xl p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar">
            <button type="button" aria-label="Fechar ferramenta de estudo" onClick={closeAiToolModal} className="absolute top-4 right-4 text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]">
              <Icon name="close" />
            </button>

            {aiToolLoading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4 text-[color:var(--primary)]">
                <Icon name="memory" className="animate-spin text-4xl" />
                <p className="font-bold text-sm">Gerando conteúdo com {configuredAiProvider === "gemini" ? "Google Gemini" : "IA local"} ({selectedModel || "modelo"})...</p>
              </div>
            ) : aiToolError ? (
              <div className="flex flex-col items-center justify-center py-12 text-red-500 gap-3">
                <Icon name="error" className="text-4xl" />
                <p className="font-bold text-sm">{aiToolError}</p>
                <button onClick={() => openAiToolModal(activeAiToolModal)} className="mt-2 px-4 py-2 bg-[color:var(--primary)] text-white rounded-xl text-xs font-bold">
                  Tentar Novamente
                </button>
              </div>
            ) : (
              <>
                {/* GUIA DE ESTUDO / TEXT REVIEWS */}
                {aiToolContent?.type === "text" && (
                  <div>
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 rounded-2xl bg-purple-500/10 text-purple-600 flex items-center justify-center font-bold">
                        <Icon name="menu_book" />
                      </div>
                      <div>
                        <h2 className="text-xl font-black">Conteúdo Gerado — {subject.name}</h2>
                        <p className="text-xs text-[color:var(--on-surface-variant)]">Com base nas {selectedSourcesCount} fonte(s) selecionada(s).</p>
                      </div>
                    </div>

                    <div className="bg-[color:var(--surface-container-low)] p-6 rounded-2xl border border-[color:var(--outline-variant)]/20 text-sm leading-relaxed">
                      <FormattedMarkdown content={aiToolContent.text} />
                    </div>
                  </div>
                )}

                {aiToolContent?.type === "mindmap" && (
                  <div className="study-mindmap">
                    <h2 className="text-xl font-bold mb-6">Mapa mental — {subject.name}</h2>
                    <MindMapNode node={aiToolContent.root} />
                  </div>
                )}

                {/* FLASHCARDS IA */}
                {aiToolContent?.type === "flashcards" && (
                  <div>
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-green-500/10 text-green-600 flex items-center justify-center font-bold">
                          <Icon name="style" />
                        </div>
                        <div>
                          <h2 className="text-xl font-black">Flashcards gerados por IA</h2>
                          <p className="text-xs text-[color:var(--on-surface-variant)]">Cartão {currentFlashcardIndex + 1} de {aiToolContent.cards.length}</p>
                        </div>
                      </div>
                    </div>

                    <div 
                      onClick={() => setFlashcardFlipped(!flashcardFlipped)}
                      className="w-full h-64 bg-[color:var(--surface-container-low)] rounded-3xl border-2 border-[color:var(--primary)]/20 p-8 flex flex-col items-center justify-center text-center cursor-pointer shadow-md transition-all hover:border-[color:var(--primary)]"
                    >
                      <span className="text-[10px] font-black uppercase tracking-widest text-[color:var(--primary)] mb-4">
                        {flashcardFlipped ? "RESPOSTA / VERSO" : "PERGUNTA / FRENTE (CLIQUE PARA GIRAR)"}
                      </span>
                      <p className="text-lg font-bold text-[color:var(--on-surface)] leading-relaxed">
                        {flashcardFlipped ? aiToolContent.cards[currentFlashcardIndex].back : aiToolContent.cards[currentFlashcardIndex].front}
                      </p>
                    </div>

                    <div className="flex items-center justify-between mt-6">
                      <button 
                        disabled={currentFlashcardIndex === 0}
                        onClick={() => { setCurrentFlashcardIndex(prev => prev - 1); setFlashcardFlipped(false); }}
                        className="px-4 py-2 rounded-xl bg-[color:var(--surface-container-high)] text-xs font-bold disabled:opacity-30"
                      >
                        Anterior
                      </button>

                      <button 
                        onClick={() => {
                          addFlashcardDeck({
                            id: `deck-${Date.now()}`,
                            title: `Flashcards - ${subject.name}`,
                            academicSubjectId: activeSubjectId,
                            cards: aiToolContent.cards
                          });
                          closeAiToolModal();
                        }}
                        className="px-5 py-2.5 bg-[color:var(--primary)] text-white rounded-xl text-xs font-bold shadow-md uppercase tracking-wider"
                      >
                        Salvar no Meu Módulo Flashcards
                      </button>

                      <button 
                        disabled={currentFlashcardIndex === aiToolContent.cards.length - 1}
                        onClick={() => { setCurrentFlashcardIndex(prev => prev + 1); setFlashcardFlipped(false); }}
                        className="px-4 py-2 rounded-xl bg-[color:var(--surface-container-high)] text-xs font-bold disabled:opacity-30"
                      >
                        Próximo
                      </button>
                    </div>
                  </div>
                )}

                {/* QUIZ DE FIXAÇÃO */}
                {aiToolContent?.type === "quiz" && (
                  <div>
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 rounded-2xl bg-orange-500/10 text-orange-600 flex items-center justify-center font-bold">
                        <Icon name="quiz" />
                      </div>
                      <div>
                        <h2 className="text-xl font-black">Quiz de Fixação — {subject.name}</h2>
                        <p className="text-xs text-[color:var(--on-surface-variant)]">Questão {generatedQuizIndex + 1} de {aiToolContent.questions.length}</p>
                      </div>
                    </div>

                    {!showQuizResults ? (
                      <div className="space-y-6">
                        <h4 className="text-base font-bold text-[color:var(--on-surface)] leading-relaxed">
                          {aiToolContent.questions[generatedQuizIndex].question}
                        </h4>

                        <div className="space-y-3">
                          {aiToolContent.questions[generatedQuizIndex].options.map((opt, idx) => (
                            <button 
                              key={idx}
                              onClick={() => setSelectedQuizAnswers({ ...selectedQuizAnswers, [generatedQuizIndex]: idx })}
                              className={`w-full p-4 rounded-2xl border text-left text-xs font-bold transition-all ${
                                selectedQuizAnswers[generatedQuizIndex] === idx
                                  ? "bg-[color:var(--primary)] text-white border-[color:var(--primary)] shadow-md"
                                  : "bg-[color:var(--surface-container-low)] border-[color:var(--outline-variant)]/20 hover:border-[color:var(--primary)]/40"
                              }`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>

                        <div className="flex justify-between items-center pt-4">
                          {generatedQuizIndex < aiToolContent.questions.length - 1 ? (
                            <button 
                              onClick={() => setGeneratedQuizIndex(prev => prev + 1)}
                              disabled={selectedQuizAnswers[generatedQuizIndex] === undefined}
                              className="w-full py-3 bg-[color:var(--primary)] text-white rounded-xl text-xs font-bold uppercase tracking-wider disabled:opacity-40"
                            >
                              Próxima Questão
                            </button>
                          ) : (
                            <button 
                              onClick={() => setShowQuizResults(true)}
                              disabled={selectedQuizAnswers[generatedQuizIndex] === undefined}
                              className="w-full py-3 bg-green-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-md disabled:opacity-40"
                            >
                              Ver Resultado do Quiz
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 space-y-6">
                        <Icon name="emoji_events" className="text-6xl text-yellow-500 mx-auto" />
                        <h3 className="text-2xl font-black">Quiz Concluído!</h3>
                        <p className="text-sm font-bold text-[color:var(--on-surface-variant)]">
                          Você respondeu todas as questões geradas pelo Ollama.
                        </p>
                        <button onClick={() => { setShowQuizResults(false); setGeneratedQuizIndex(0); setSelectedQuizAnswers({}); closeAiToolModal(); }} className="px-6 py-3 bg-[color:var(--primary)] text-white rounded-xl text-xs font-bold uppercase tracking-wider">
                          Fechar Quiz
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

          </div>
        </div>
      )}

      {/* MODAL: EDITAR DISCIPLINA */}
      {showEditSubjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              if (!editSubjectForm.name.trim()) return;
              updateAcademicEntity("subjects", subject.id, {
                name: editSubjectForm.name,
                abbreviation: editSubjectForm.abbreviation,
                professor: editSubjectForm.professor,
                semester: editSubjectForm.semester,
                schedule: editSubjectForm.schedule,
                credits: editSubjectForm.credits,
                description: editSubjectForm.description
              });
              setShowEditSubjectModal(false);
            }}
            className="bg-[color:var(--surface)] w-full max-w-lg rounded-3xl p-8 shadow-2xl relative"
          >
            <button 
              type="button" 
              onClick={() => setShowEditSubjectModal(false)} 
              className="absolute top-5 right-5 text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]"
            >
              <Icon name="close" />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-2xl bg-[color:var(--primary)]/10 text-[color:var(--primary)] flex items-center justify-center font-bold">
                <Icon name="edit" />
              </div>
              <div>
                <h2 className="text-xl font-black text-[color:var(--on-surface)]">Editar Disciplina</h2>
                <p className="text-xs text-[color:var(--on-surface-variant)]">Atualizar dados e informações de {subject.name}</p>
              </div>
            </div>

            <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
              <div>
                <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1.5">Nome da Disciplina</label>
                <input 
                  required
                  type="text" 
                  value={editSubjectForm.name}
                  onChange={e => setEditSubjectForm({...editSubjectForm, name: e.target.value})}
                  placeholder="Ex: Sistemas Distribuídos"
                  className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 outline-none text-sm font-bold text-[color:var(--on-surface)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1.5">Sigla / Abreviação</label>
                  <input 
                    type="text" 
                    value={editSubjectForm.abbreviation}
                    onChange={e => setEditSubjectForm({...editSubjectForm, abbreviation: e.target.value})}
                    placeholder="Ex: SD"
                    className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 outline-none text-sm font-bold text-[color:var(--on-surface)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1.5">Semestre</label>
                  <input 
                    type="text" 
                    value={editSubjectForm.semester}
                    onChange={e => setEditSubjectForm({...editSubjectForm, semester: e.target.value})}
                    placeholder="Ex: 5"
                    className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 outline-none text-sm font-bold text-[color:var(--on-surface)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1.5">Professor Responsável</label>
                <input 
                  type="text" 
                  value={editSubjectForm.professor}
                  onChange={e => setEditSubjectForm({...editSubjectForm, professor: e.target.value})}
                  placeholder="Ex: Dr. Carlos Eduardo"
                  className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 outline-none text-sm font-bold text-[color:var(--on-surface)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1.5">Horário e Sala</label>
                  <input 
                    type="text" 
                    value={editSubjectForm.schedule}
                    onChange={e => setEditSubjectForm({...editSubjectForm, schedule: e.target.value})}
                    placeholder="Ex: Seg e Quarta 10h • Sala 302"
                    className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 outline-none text-sm font-bold text-[color:var(--on-surface)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1.5">Créditos</label>
                  <input 
                    type="text" 
                    value={editSubjectForm.credits}
                    onChange={e => setEditSubjectForm({...editSubjectForm, credits: e.target.value})}
                    placeholder="Ex: 4"
                    className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 outline-none text-sm font-bold text-[color:var(--on-surface)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1.5">Descrição / Ementa</label>
                <textarea 
                  rows={3}
                  value={editSubjectForm.description}
                  onChange={e => setEditSubjectForm({...editSubjectForm, description: e.target.value})}
                  placeholder="Descrição completa da disciplina..."
                  className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl p-3 outline-none text-sm font-medium text-[color:var(--on-surface)]"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6 pt-4 border-t border-[color:var(--outline-variant)]/10">
              <button 
                type="button" 
                onClick={() => setShowEditSubjectModal(false)}
                className="w-1/2 bg-[color:var(--surface-container-high)] text-[color:var(--on-surface)] font-bold py-3 rounded-xl uppercase tracking-wider text-xs"
              >
                Cancelar
              </button>
              <button 
                type="submit"
                className="w-1/2 bg-[color:var(--primary)] text-white font-bold py-3 rounded-xl shadow-md uppercase tracking-wider text-xs"
              >
                Salvar Alterações
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: REGISTRAR / EDITAR AULA */}
      {showClassLogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveClassLog}
            className="bg-[color:var(--surface)] w-full max-w-2xl rounded-3xl p-8 shadow-2xl relative"
          >
            <button
              type="button"
              onClick={() => setShowClassLogModal(false)}
              className="absolute top-5 right-5 text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]"
            >
              <Icon name="close" />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-2xl bg-[color:var(--primary)]/10 text-[color:var(--primary)] flex items-center justify-center font-bold">
                <Icon name="play_lesson" />
              </div>
              <div>
                <h2 className="text-xl font-black text-[color:var(--on-surface)]">
                  {editingClassLog ? "Editar Registro de Aula" : "Registrar Nova Aula"}
                </h2>
                <p className="text-xs text-[color:var(--on-surface-variant)]">
                  Histórico acadêmico de {subject.name}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-4 max-h-[65vh] overflow-y-auto pr-1 custom-scrollbar">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1.5">
                    Nº da Aula
                  </label>
                  <input
                    required
                    type="number"
                    min="1"
                    value={classLogForm.lessonNumber}
                    onChange={(e) => setClassLogForm({ ...classLogForm, lessonNumber: e.target.value })}
                    className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 outline-none text-sm font-bold text-[color:var(--on-surface)]"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1.5">
                    Título / Assunto Principal
                  </label>
                  <input
                    required
                    type="text"
                    value={classLogForm.title}
                    onChange={(e) => setClassLogForm({ ...classLogForm, title: e.target.value })}
                    placeholder="Ex: Introdução ao Cálculo Diferencial"
                    className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 outline-none text-sm font-bold text-[color:var(--on-surface)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1.5">
                    Data
                  </label>
                  <input
                    required
                    type="date"
                    value={classLogForm.date}
                    onChange={(e) => setClassLogForm({ ...classLogForm, date: e.target.value })}
                    className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 outline-none text-sm font-bold text-[color:var(--on-surface)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1.5">
                    Início
                  </label>
                  <input
                    type="time"
                    value={classLogForm.startTime}
                    onChange={(e) => setClassLogForm({ ...classLogForm, startTime: e.target.value })}
                    className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 outline-none text-sm font-bold text-[color:var(--on-surface)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1.5">
                    Término
                  </label>
                  <input
                    type="time"
                    value={classLogForm.endTime}
                    onChange={(e) => setClassLogForm({ ...classLogForm, endTime: e.target.value })}
                    className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 outline-none text-sm font-bold text-[color:var(--on-surface)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1.5">
                    Status da Aula
                  </label>
                  <select
                    value={classLogForm.status}
                    onChange={(e) => setClassLogForm({ ...classLogForm, status: e.target.value })}
                    className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 outline-none text-sm font-bold text-[color:var(--on-surface)]"
                  >
                    <option value="completed">Realizada</option>
                    <option value="scheduled">Agendada</option>
                    <option value="makeup">Reposição</option>
                    <option value="cancelled">Cancelada</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1.5">
                    Frequência / Presença
                  </label>
                  <select
                    value={classLogForm.attendanceStatus}
                    onChange={(e) => setClassLogForm({ ...classLogForm, attendanceStatus: e.target.value })}
                    className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 outline-none text-sm font-bold text-[color:var(--on-surface)]"
                  >
                    <option value="attended">Presente</option>
                    <option value="late">Atrasado</option>
                    <option value="absent">Falta</option>
                    <option value="excused">Falta Justificada</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1.5">
                  Conteúdo Ministrado (Suporta Markdown)
                </label>
                <textarea
                  rows={4}
                  value={classLogForm.contentSummary}
                  onChange={(e) => setClassLogForm({ ...classLogForm, contentSummary: e.target.value })}
                  placeholder="Resumo do conteúdo ensinado pelo professor, tópicos e fórmulas importantes..."
                  className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl p-3 outline-none text-sm font-medium text-[color:var(--on-surface)]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1.5">
                  Tópicos / Tags (separados por vírgula)
                </label>
                <input
                  type="text"
                  value={classLogForm.topics}
                  onChange={(e) => setClassLogForm({ ...classLogForm, topics: e.target.value })}
                  placeholder="Ex: Limites, Derivadas, Regra da Cadeia"
                  className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 outline-none text-sm font-bold text-[color:var(--on-surface)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1.5">
                    Tarefas / Dever de Casa
                  </label>
                  <input
                    type="text"
                    value={classLogForm.homework}
                    onChange={(e) => setClassLogForm({ ...classLogForm, homework: e.target.value })}
                    placeholder="Ex: Exercícios 1 a 5 da página 42"
                    className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 outline-none text-sm font-bold text-[color:var(--on-surface)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1.5">
                    Vincular Anotação Existente
                  </label>
                  <select
                    value={classLogForm.linkedNoteId}
                    onChange={(e) => setClassLogForm({ ...classLogForm, linkedNoteId: e.target.value })}
                    className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 outline-none text-sm font-bold text-[color:var(--on-surface)]"
                  >
                    <option value="">Nenhuma Anotação</option>
                    {notesList
                      .filter(n => !n.academicSubjectId || n.academicSubjectId === activeSubjectId)
                      .map(note => (
                        <option key={note.id} value={note.id}>{note.title || "Anotação Sem Título"}</option>
                      ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6 pt-4 border-t border-[color:var(--outline-variant)]/10">
              <button
                type="button"
                onClick={() => setShowClassLogModal(false)}
                className="w-1/2 bg-[color:var(--surface-container-high)] text-[color:var(--on-surface)] font-bold py-3 rounded-xl uppercase tracking-wider text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="w-1/2 bg-[color:var(--primary)] text-white font-bold py-3 rounded-xl shadow-md uppercase tracking-wider text-xs"
              >
                {editingClassLog ? "Salvar Alterações" : "Registrar Aula"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: CRIAR TAREFA / TRABALHO */}
      {showAddTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <form
            onSubmit={handleSaveTask}
            className="bg-[color:var(--surface)] w-full max-w-md rounded-3xl p-8 shadow-2xl relative"
          >
            <button
              type="button"
              onClick={() => setShowAddTaskModal(false)}
              className="absolute top-5 right-5 text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]"
            >
              <Icon name="close" />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-2xl bg-[color:var(--primary)]/10 text-[color:var(--primary)] flex items-center justify-center font-bold">
                <Icon name="add_task" />
              </div>
              <div>
                <h2 className="text-xl font-black text-[color:var(--on-surface)]">Nova Tarefa ou Trabalho</h2>
                <p className="text-xs text-[color:var(--on-surface-variant)]">Disciplina: {subject?.name}</p>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1.5">
                  Título da Tarefa / Trabalho
                </label>
                <input
                  required
                  type="text"
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  placeholder="Ex: Entregar Relatório de Laboratório 2"
                  className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 outline-none text-sm font-bold text-[color:var(--on-surface)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1.5">
                    Tipo
                  </label>
                  <select
                    value={taskForm.type}
                    onChange={(e) => setTaskForm({ ...taskForm, type: e.target.value })}
                    className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 outline-none text-sm font-bold text-[color:var(--on-surface)]"
                  >
                    <option value="assignment">Trabalho Acadêmico</option>
                    <option value="task">Tarefa Comum</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1.5">
                    Prioridade
                  </label>
                  <select
                    value={taskForm.priority}
                    onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
                    className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 outline-none text-sm font-bold text-[color:var(--on-surface)]"
                  >
                    <option value="high">Alta</option>
                    <option value="medium">Média</option>
                    <option value="low">Baixa</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1.5">
                  Data de Entrega / Prazo
                </label>
                <input
                  type="date"
                  value={taskForm.dueDate}
                  onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
                  className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 outline-none text-sm font-bold text-[color:var(--on-surface)]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1.5">
                  Instruções / Descrição
                </label>
                <textarea
                  rows={3}
                  value={taskForm.description}
                  onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                  placeholder="Detalhes adicionais, grupo, requisitos..."
                  className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl p-3 outline-none text-sm font-medium text-[color:var(--on-surface)]"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6 pt-4 border-t border-[color:var(--outline-variant)]/10">
              <button
                type="button"
                onClick={() => setShowAddTaskModal(false)}
                className="w-1/2 bg-[color:var(--surface-container-high)] text-[color:var(--on-surface)] font-bold py-3 rounded-xl uppercase tracking-wider text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="w-1/2 bg-[color:var(--primary)] text-white font-bold py-3 rounded-xl shadow-md uppercase tracking-wider text-xs"
              >
                Criar Tarefa
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: CRIAR BARALHO DE FLASHCARDS */}
      {showAddDeckModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveDeck}
            className="bg-[color:var(--surface)] w-full max-w-2xl rounded-3xl p-8 shadow-2xl relative"
          >
            <button
              type="button"
              onClick={() => setShowAddDeckModal(false)}
              className="absolute top-5 right-5 text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]"
            >
              <Icon name="close" />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-2xl bg-[color:var(--primary)]/10 text-[color:var(--primary)] flex items-center justify-center font-bold">
                <Icon name="style" />
              </div>
              <div>
                <h2 className="text-xl font-black text-[color:var(--on-surface)]">Novo Baralho de Flashcards</h2>
                <p className="text-xs text-[color:var(--on-surface-variant)]">Disciplina: {subject?.name}</p>
              </div>
            </div>

            <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
              <div>
                <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1.5">
                  Título do Baralho
                </label>
                <input
                  required
                  type="text"
                  value={deckForm.title}
                  onChange={(e) => setDeckForm({ ...deckForm, title: e.target.value })}
                  placeholder="Ex: Conceitos de Derivadas Parciais"
                  className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 outline-none text-sm font-bold text-[color:var(--on-surface)]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider">
                    Cartões ({deckForm.cards.length})
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setDeckForm({
                        ...deckForm,
                        cards: [...deckForm.cards, { id: `c-${Date.now()}`, front: "", back: "" }]
                      });
                    }}
                    className="text-xs font-bold text-[color:var(--primary)] flex items-center gap-1 hover:underline"
                  >
                    <Icon name="add" className="text-sm" /> Adicionar Cartão
                  </button>
                </div>

                <div className="flex flex-col gap-3">
                  {deckForm.cards.map((card, idx) => (
                    <div key={card.id || idx} className="bg-[color:var(--surface-container-low)] p-4 rounded-2xl border border-[color:var(--outline-variant)]/20 relative group">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] font-black text-[color:var(--primary)] uppercase tracking-wider">Cartão {idx + 1}</span>
                        {deckForm.cards.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              setDeckForm({
                                ...deckForm,
                                cards: deckForm.cards.filter((_, i) => i !== idx)
                              });
                            }}
                            className="text-red-500 text-xs font-bold hover:underline"
                          >
                            Remover
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <input
                          type="text"
                          value={card.front}
                          onChange={(e) => {
                            const updated = [...deckForm.cards];
                            updated[idx].front = e.target.value;
                            setDeckForm({ ...deckForm, cards: updated });
                          }}
                          placeholder="Frente (Pergunta / Conceito)"
                          className="w-full bg-[color:var(--surface)] border border-[color:var(--outline-variant)]/30 rounded-xl px-3 py-2 outline-none text-xs font-medium text-[color:var(--on-surface)]"
                        />
                        <input
                          type="text"
                          value={card.back}
                          onChange={(e) => {
                            const updated = [...deckForm.cards];
                            updated[idx].back = e.target.value;
                            setDeckForm({ ...deckForm, cards: updated });
                          }}
                          placeholder="Verso (Resposta / Definição)"
                          className="w-full bg-[color:var(--surface)] border border-[color:var(--outline-variant)]/30 rounded-xl px-3 py-2 outline-none text-xs font-medium text-[color:var(--on-surface)]"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6 pt-4 border-t border-[color:var(--outline-variant)]/10">
              <button
                type="button"
                onClick={() => setShowAddDeckModal(false)}
                className="w-1/2 bg-[color:var(--surface-container-high)] text-[color:var(--on-surface)] font-bold py-3 rounded-xl uppercase tracking-wider text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="w-1/2 bg-[color:var(--primary)] text-white font-bold py-3 rounded-xl shadow-md uppercase tracking-wider text-xs"
              >
                Criar Baralho
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: AGENDAR / EDITAR PROVA */}
      {showExamModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <form
            onSubmit={handleSaveExam}
            className="bg-[color:var(--surface)] w-full max-w-md rounded-3xl p-8 shadow-2xl relative"
          >
            <button
              type="button"
              onClick={() => setShowExamModal(false)}
              className="absolute top-5 right-5 text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]"
            >
              <Icon name="close" />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-2xl bg-purple-500/10 text-purple-600 flex items-center justify-center font-bold">
                <Icon name="event" />
              </div>
              <div>
                <h2 className="text-xl font-black text-[color:var(--on-surface)]">
                  {editingExam ? "Editar Agendamento de Prova" : "Agendar Nova Prova"}
                </h2>
                <p className="text-xs text-[color:var(--on-surface-variant)]">Disciplina: {subject?.name}</p>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1.5">
                  Título / Identificação da Prova
                </label>
                <input
                  required
                  type="text"
                  value={examForm.title}
                  onChange={(e) => setExamForm({ ...examForm, title: e.target.value })}
                  placeholder="Ex: P1 - Prova do Primeiro Biestre"
                  className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 outline-none text-sm font-bold text-[color:var(--on-surface)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1.5">
                    Data da Prova
                  </label>
                  <input
                    required
                    type="date"
                    value={examForm.date}
                    onChange={(e) => setExamForm({ ...examForm, date: e.target.value })}
                    className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 outline-none text-sm font-bold text-[color:var(--on-surface)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1.5">
                    Horário
                  </label>
                  <input
                    type="time"
                    value={examForm.time}
                    onChange={(e) => setExamForm({ ...examForm, time: e.target.value })}
                    className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 outline-none text-sm font-bold text-[color:var(--on-surface)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1.5">
                    Sala / Local
                  </label>
                  <input
                    type="text"
                    value={examForm.location}
                    onChange={(e) => setExamForm({ ...examForm, location: e.target.value })}
                    placeholder="Ex: Sala 302"
                    className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 outline-none text-sm font-bold text-[color:var(--on-surface)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1.5">
                    Peso na Média (%)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={examForm.weight}
                    onChange={(e) => setExamForm({ ...examForm, weight: e.target.value })}
                    placeholder="Ex: 30"
                    className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 outline-none text-sm font-bold text-[color:var(--on-surface)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1.5">
                  Tópicos Cobrados (separados por vírgula)
                </label>
                <input
                  type="text"
                  value={examForm.topics}
                  onChange={(e) => setExamForm({ ...examForm, topics: e.target.value })}
                  placeholder="Ex: Limites, Derivadas, Continuidade"
                  className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 outline-none text-sm font-bold text-[color:var(--on-surface)]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1.5">
                  Dias de Antecedência p/ Iniciar Estudos
                </label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={examForm.studyDays}
                  onChange={(e) => setExamForm({ ...examForm, studyDays: e.target.value })}
                  className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 outline-none text-sm font-bold text-[color:var(--on-surface)]"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6 pt-4 border-t border-[color:var(--outline-variant)]/10">
              <button
                type="button"
                onClick={() => setShowExamModal(false)}
                className="w-1/2 bg-[color:var(--surface-container-high)] text-[color:var(--on-surface)] font-bold py-3 rounded-xl uppercase tracking-wider text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="w-1/2 bg-[color:var(--primary)] text-white font-bold py-3 rounded-xl shadow-md uppercase tracking-wider text-xs"
              >
                {editingExam ? "Salvar Prova" : "Agendar Prova"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: LANÇAR / EDITAR NOTA */}
      {showGradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <form
            onSubmit={handleSaveGrade}
            className="bg-[color:var(--surface)] w-full max-w-md rounded-3xl p-8 shadow-2xl relative"
          >
            <button
              type="button"
              onClick={() => setShowGradeModal(false)}
              className="absolute top-5 right-5 text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]"
            >
              <Icon name="close" />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
                <Icon name="grade" />
              </div>
              <div>
                <h2 className="text-xl font-black text-[color:var(--on-surface)]">
                  {editingGrade ? "Editar Nota Lançada" : "Lançar Nova Nota"}
                </h2>
                <p className="text-xs text-[color:var(--on-surface-variant)]">Disciplina: {subject?.name}</p>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1.5">
                  Título da Avaliação
                </label>
                <input
                  required
                  type="text"
                  value={gradeForm.title}
                  onChange={(e) => setGradeForm({ ...gradeForm, title: e.target.value })}
                  placeholder="Ex: P1 - Prova 1"
                  className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 outline-none text-sm font-bold text-[color:var(--on-surface)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1.5">
                    Nota Obtida
                  </label>
                  <input
                    required
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    value={gradeForm.score}
                    onChange={(e) => setGradeForm({ ...gradeForm, score: e.target.value })}
                    placeholder="Ex: 8.5"
                    className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 outline-none text-sm font-bold text-[color:var(--on-surface)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1.5">
                    Nota Máxima
                  </label>
                  <input
                    required
                    type="number"
                    step="0.1"
                    min="1"
                    value={gradeForm.maxScore}
                    onChange={(e) => setGradeForm({ ...gradeForm, maxScore: e.target.value })}
                    className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 outline-none text-sm font-bold text-[color:var(--on-surface)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1.5">
                    Peso na Média (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={gradeForm.weight}
                    onChange={(e) => setGradeForm({ ...gradeForm, weight: e.target.value })}
                    placeholder="Ex: 30"
                    className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 outline-none text-sm font-bold text-[color:var(--on-surface)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1.5">
                    Data do Lançamento
                  </label>
                  <input
                    type="date"
                    value={gradeForm.date}
                    onChange={(e) => setGradeForm({ ...gradeForm, date: e.target.value })}
                    className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 outline-none text-sm font-bold text-[color:var(--on-surface)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1.5">
                  Observações
                </label>
                <input
                  type="text"
                  value={gradeForm.notes}
                  onChange={(e) => setGradeForm({ ...gradeForm, notes: e.target.value })}
                  placeholder="Ex: Exercícios extras incluídos..."
                  className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 outline-none text-sm font-medium text-[color:var(--on-surface)]"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6 pt-4 border-t border-[color:var(--outline-variant)]/10">
              <button
                type="button"
                onClick={() => setShowGradeModal(false)}
                className="w-1/2 bg-[color:var(--surface-container-high)] text-[color:var(--on-surface)] font-bold py-3 rounded-xl uppercase tracking-wider text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="w-1/2 bg-[color:var(--primary)] text-white font-bold py-3 rounded-xl shadow-md uppercase tracking-wider text-xs"
              >
                {editingGrade ? "Salvar Nota" : "Lançar Nota"}
              </button>
            </div>
          </form>
        </div>
      )}

      {showSubjectShareModal ? (
        <ShareModal
          entityType="subject"
          entityId={subject.id}
          title={subject.name}
          payload={{
            schemaVersion: 1,
            subject,
            notes: subjectNotes,
            tasks: subjectTasks,
            decks: subjectDecks,
            resources: sources,
          }}
          onClose={() => {
            setShowSubjectShareModal(false);
            setPeopleRefreshKey((value) => value + 1);
          }}
        />
      ) : null}

      {/* TOAST NOTIFICATION */}
      {toastMessage && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-[color:var(--on-surface)] text-[color:var(--surface)] px-6 py-3 rounded-2xl shadow-2xl font-bold text-xs flex items-center gap-2 animate-bounce">
          <Icon name="info" className="text-base text-[color:var(--primary)]" />
          <span>{toastMessage}</span>
        </div>
      )}

    </div>
  );
}
