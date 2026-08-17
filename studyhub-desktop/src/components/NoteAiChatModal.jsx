import { useEffect, useRef, useState } from "react";
import { markdownToNoteHtml } from "../domain/aiStudio";
import { sanitizeGeneratedHtml } from "../utils/sanitizeHtml";
import { Icon } from "../ui/Icon";
import { askWithWebLLM, isWebLlmAvailable, WEBLLM_DEFAULT_MODEL } from "../services/webllm";

function parseReasoningContent(text = "") {
  const str = String(text);
  const match = str.match(/<think>([\s\S]*?)<\/think>/i);
  if (match) {
    const thinkingText = match[1].trim();
    const cleanContent = str.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    return { thinkingText, cleanContent };
  }
  return { thinkingText: null, cleanContent: str };
}

function parseFollowupSuggestions(text = "") {
  const str = String(text);
  const match = str.match(/\[SUGESTOES\]([\s\S]*?)$/i);
  if (match) {
    const suggestionsRaw = match[1].trim();
    const cleanText = str.replace(/\[SUGESTOES\][\s\S]*?$/i, "").trim();
    const suggestions = suggestionsRaw
      .split("\n")
      .map((line) => line.replace(/^[-*•\d.]+\s*/, "").trim())
      .filter((line) => line.length > 3 && !line.startsWith("["));
    return { cleanText, suggestions: suggestions.slice(0, 3) };
  }
  return { cleanText: str, suggestions: [] };
}

export function NoteAiChatModal({
  isOpen,
  onClose,
  note,
  onUpdateNote,
  onAppendToNoteContent,
  targetThreadId = "",
  targetMessageId = "",
  selectedModel = "",
  onModelChange = null,
  aiModelOptions = [],
}) {
  const [activeThreadId, setActiveThreadId] = useState("");
  const [inputQuery, setInputQuery] = useState("");
  const [selectedAttachmentForAi, setSelectedAttachmentForAi] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [aiModel, setAiModel] = useState(() => selectedModel || note?.aiModel || WEBLLM_DEFAULT_MODEL);
  const [responseLength, setResponseLength] = useState("detailed");
  const [scopeMode, setScopeMode] = useState("hybrid");

  useEffect(() => {
    if (selectedModel && selectedModel !== aiModel) {
      setAiModel(selectedModel);
    }
  }, [selectedModel]);

  const handleModelSelect = (newModel) => {
    setAiModel(newModel);
    if (onModelChange) onModelChange(newModel);
    if (note?.id && onUpdateNote) {
      onUpdateNote(note.id, { aiModel: newModel });
    }
  };
  const [editingThreadId, setEditingThreadId] = useState("");
  const [editingTitle, setEditingTitle] = useState("");
  const [copiedMsgId, setCopiedMsgId] = useState("");
  const [insertedMsgId, setInsertedMsgId] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [floatingSelection, setFloatingSelection] = useState(null);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const attachments = note?.attachments || [];
  const noteTitle = note?.title || "Nota sem título";

  // Normalize or initialize AI chat threads stored on note
  const rawChats = Array.isArray(note?.aiChats) ? note.aiChats : [];
  const chats = rawChats.length > 0
    ? rawChats
    : [
        {
          id: `chat-${note?.id || "default"}-1`,
          title: "Conversa Principal",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: [],
        },
      ];

  const activeThread = chats.find((c) => c.id === activeThreadId) || chats[0] || null;

  // Set active thread when targetThreadId is passed or modal opens
  useEffect(() => {
    if (isOpen) {
      if (targetThreadId && chats.some((c) => c.id === targetThreadId)) {
        setActiveThreadId(targetThreadId);
      } else if (chats.length > 0 && !chats.some((c) => c.id === activeThreadId)) {
        setActiveThreadId(chats[0].id);
      }
    }
  }, [isOpen, chats, activeThreadId, targetThreadId]);

  // Scroll to target message if specified or bottom
  useEffect(() => {
    if (isOpen) {
      if (targetMessageId) {
        setTimeout(() => {
          const el = document.getElementById(`chat-msg-${targetMessageId}`);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.classList.add("ring-2", "ring-purple-500");
            setTimeout(() => el.classList.remove("ring-2", "ring-purple-500"), 3000);
            return;
          }
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 200);
      } else {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [isOpen, activeThreadId, activeThread?.messages?.length, isThinking, targetMessageId]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, activeThreadId]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isOpen && e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Ref to messages feed container to check if selection is inside it
  const chatFeedRef = useRef(null);
  const savedRangeRef = useRef(null);

  // Use document-level selectionchange so the browser never loses the blue highlight
  useEffect(() => {
    const onSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !chatFeedRef.current) {
        setFloatingSelection(null);
        savedRangeRef.current = null;
        return;
      }
      const selectedText = sel.toString().trim();
      if (selectedText.length < 3) {
        setFloatingSelection(null);
        savedRangeRef.current = null;
        return;
      }
      try {
        const range = sel.getRangeAt(0);
        // Only show popup if selection is inside the chat feed
        if (!chatFeedRef.current.contains(range.commonAncestorContainer)) {
          setFloatingSelection(null);
          savedRangeRef.current = null;
          return;
        }
        savedRangeRef.current = range.cloneRange();
        const rect = range.getBoundingClientRect();
        setFloatingSelection({
          text: selectedText,
          x: Math.max(140, Math.min(window.innerWidth - 140, rect.left + rect.width / 2)),
          y: Math.max(60, rect.top - 8),
        });
      } catch {
        setFloatingSelection(null);
        savedRangeRef.current = null;
      }
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, []);

  if (!isOpen || !note) return null;

  const saveChatsToNote = (updatedChats) => {
    if (note.id && onUpdateNote) {
      onUpdateNote(note.id, { aiChats: updatedChats });
    }
  };

  const handleNewThread = () => {
    const newThreadId = `chat-${Date.now()}`;
    const newThread = {
      id: newThreadId,
      title: `Conversa ${chats.length + 1}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    };
    const updated = [newThread, ...chats];
    saveChatsToNote(updated);
    setActiveThreadId(newThreadId);
    setInputQuery("");
  };

  const handleDeleteThread = (threadId, e) => {
    e?.stopPropagation();
    if (chats.length <= 1) {
      // If deleting the last thread, reset it instead of empty array
      const reset = [
        {
          id: `chat-${Date.now()}`,
          title: "Conversa Principal",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: [],
        },
      ];
      saveChatsToNote(reset);
      setActiveThreadId(reset[0].id);
      return;
    }
    const updated = chats.filter((c) => c.id !== threadId);
    saveChatsToNote(updated);
    if (activeThreadId === threadId) {
      setActiveThreadId(updated[0].id);
    }
  };

  const handleStartRename = (thread, e) => {
    e?.stopPropagation();
    setEditingThreadId(thread.id);
    setEditingTitle(thread.title);
  };

  const handleSaveRename = (threadId) => {
    if (!editingTitle.trim()) {
      setEditingThreadId("");
      return;
    }
    const updated = chats.map((c) =>
      c.id === threadId ? { ...c, title: editingTitle.trim(), updatedAt: Date.now() } : c,
    );
    saveChatsToNote(updated);
    setEditingThreadId("");
  };

  const handleSendMessage = async (customPrompt = "") => {
    const promptText = (customPrompt || inputQuery).trim();
    if (!promptText || isThinking || !activeThread) return;

    const currentReqId = `chat-ai-${Date.now()}`;
    setIsThinking(true);
    setRequestId(currentReqId);
    if (!customPrompt) setInputQuery("");

    const targetAttachmentName = selectedAttachmentForAi
      ? selectedAttachmentForAi.split(/[\\/]/).pop()
      : "";

    const userMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: promptText,
      timestamp: Date.now(),
      attachmentName: targetAttachmentName,
    };

    // Auto update thread title if default
    let updatedTitle = activeThread.title;
    if (
      activeThread.messages.length === 0 &&
      (activeThread.title.startsWith("Conversa ") || activeThread.title === "Conversa Principal")
    ) {
      updatedTitle = promptText.length > 32 ? promptText.slice(0, 32) + "…" : promptText;
    }

    const updatedThreadMessages = [...activeThread.messages, userMessage];

    const updatedChatsWithUser = chats.map((c) =>
      c.id === activeThread.id
        ? {
            ...c,
            title: updatedTitle,
            updatedAt: Date.now(),
            messages: updatedThreadMessages,
          }
        : c,
    );

    saveChatsToNote(updatedChatsWithUser);

    // Build history for multi-turn conversational IPC call
    const historyPayload = updatedThreadMessages.slice(-10).map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
    }));

    try {
      const activeAttachmentPaths = selectedAttachmentForAi
        ? [selectedAttachmentForAi]
        : attachments;

      const desktopAi = window.studyhubDesktop?.academicAI;
      const noteText = note.content ? String(note.content).replace(/<[^>]*>/g, " ") : "";
      let result;
      if (desktopAi?.noteAction) {
        result = await desktopAi.noteAction({
          kind: "ask",
          title: noteTitle,
          content: noteText,
          attachmentPaths: activeAttachmentPaths,
          targetAttachmentName,
          question: promptText,
          history: historyPayload,
          model: aiModel,
          responseLength,
          scopeMode,
          requestId: currentReqId,
        });
      } else {
        if (!isWebLlmAvailable()) {
          throw new Error("O Firefox/Linux não disponibiliza WebGPU. Use Chrome ou Chromium atualizado.");
        }
        // O modelo leve tem uma janela menor; limitamos o histórico e o texto
        // para evitar o erro de excesso de tokens no navegador.
        const compactHistory = historyPayload.slice(-4).map((message) => ({
          ...message,
          content: String(message.content).slice(0, 2_000),
        }));
        const compactNote = noteText.slice(0, 12_000);
        const answer = await askWithWebLLM({
          system: "Você é um tutor acadêmico. Responda em português do Brasil, de forma clara e completa, usando somente o conteúdo da nota.",
          prompt: `Nota: ${noteTitle}\n\nConteúdo:\n${compactNote}\n\nPergunta do aluno:\n${promptText}`,
          history: compactHistory,
          model: aiModel,
        });
        result = { content: answer, model: WEBLLM_DEFAULT_MODEL };
      }

      const assistantMessage = {
        id: `msg-${Date.now()}`,
        role: "assistant",
        content: result?.content || "Sem resposta gerada.",
        timestamp: Date.now(),
        model: result?.model || aiModel,
      };

      const finalChats = updatedChatsWithUser.map((c) =>
        c.id === activeThread.id
          ? {
              ...c,
              updatedAt: Date.now(),
              messages: [...c.messages, assistantMessage],
            }
          : c,
      );

      saveChatsToNote(finalChats);
    } catch (error) {
      const errorMessage = {
        id: `msg-${Date.now()}`,
        role: "assistant",
        content: `⚠️ Error: ${error.message || "Erro ao conectar com a IA local."}`,
        timestamp: Date.now(),
        isError: true,
      };

      const finalChats = updatedChatsWithUser.map((c) =>
        c.id === activeThread.id
          ? {
              ...c,
              updatedAt: Date.now(),
              messages: [...c.messages, errorMessage],
            }
          : c,
      );

      saveChatsToNote(finalChats);
    } finally {
      setIsThinking(false);
      setRequestId("");
    }
  };

  const handleCancelAi = async () => {
    if (requestId && window.studyhubDesktop?.academicAI?.cancel) {
      await window.studyhubDesktop.academicAI.cancel(requestId);
    }
    setIsThinking(false);
    setRequestId("");
  };





  const handleInsertSelectionToNote = (e) => {
    if (e) e.preventDefault();
    if (floatingSelection?.text && onAppendToNoteContent) {
      onAppendToNoteContent(floatingSelection.text, {
        threadId: activeThread?.id,
        threadTitle: activeThread?.title,
      });
      setInsertedMsgId("selection");
      setTimeout(() => setInsertedMsgId(""), 2500);
    }
  };

  const handleCopyText = async (msgId, rawText) => {
    const cleanText = String(rawText || "").replace(/\r\n/g, "\n");
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        const htmlText = markdownToNoteHtml(cleanText);
        const item = new ClipboardItem({
          "text/plain": new Blob([cleanText], { type: "text/plain" }),
          "text/html": new Blob([htmlText], { type: "text/html" }),
        });
        await navigator.clipboard.write([item]);
      } else {
        await navigator.clipboard.writeText(cleanText);
      }
    } catch {
      await navigator.clipboard.writeText(cleanText);
    }
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(""), 2000);
  };

  const handleAppendToNote = (msgId, text) => {
    if (onAppendToNoteContent) {
      const { cleanContent } = parseReasoningContent(text);
      const { cleanText } = parseFollowupSuggestions(cleanContent);
      onAppendToNoteContent(cleanText, {
        threadId: activeThread?.id,
        threadTitle: activeThread?.title,
        messageId: msgId,
      });
      setInsertedMsgId(msgId);
      setTimeout(() => setInsertedMsgId(""), 2500);
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 md:p-6 animate-fade-in cursor-pointer"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-6xl h-[88vh] bg-[color:var(--surface)] border border-[color:var(--outline-variant)]/30 rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row cursor-default"
      >
        
        {/* Sidebar - Chat History */}
        <aside
          className={`${
            sidebarOpen ? "flex" : "hidden md:flex"
          } w-full md:w-72 bg-[color:var(--surface-container)] border-r border-[color:var(--outline-variant)]/15 flex-col shrink-0 transition-all z-10`}
        >
          {/* Sidebar Header */}
          <div className="p-4 border-b border-[color:var(--outline-variant)]/15 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Icon name="chat" className="text-xl text-[color:var(--primary)]" />
              <span className="text-xs font-black uppercase tracking-wider text-[color:var(--on-surface)]">
                Histórico de Chats
              </span>
            </div>
            <button
              type="button"
              onClick={handleNewThread}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[color:var(--primary)] text-white text-xs font-bold shadow-sm hover:opacity-90 transition-all"
              title="Iniciar nova conversa"
            >
              <Icon name="add" className="text-sm" />
              <span>Novo</span>
            </button>
          </div>

          {/* Thread List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {chats.map((thread) => {
              const isActive = thread.id === activeThread?.id;
              const isEditing = editingThreadId === thread.id;
              const msgCount = thread.messages?.length || 0;

              return (
                <div
                  key={thread.id}
                  onClick={() => setActiveThreadId(thread.id)}
                  className={`group relative flex items-center justify-between gap-2 p-2.5 rounded-xl cursor-pointer text-xs transition-all ${
                    isActive
                      ? "bg-[color:var(--surface)] text-[color:var(--primary)] font-bold shadow-sm border border-[color:var(--primary)]/20"
                      : "text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-container-high)] hover:text-[color:var(--on-surface)]"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Icon
                      name={isActive ? "forum" : "chat_bubble_outline"}
                      className={`text-base shrink-0 ${isActive ? "text-[color:var(--primary)]" : "opacity-60"}`}
                    />
                    {isEditing ? (
                      <input
                        type="text"
                        autoFocus
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onBlur={() => handleSaveRename(thread.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveRename(thread.id);
                          if (e.key === "Escape") setEditingThreadId("");
                        }}
                        className="w-full bg-[color:var(--surface)] border border-[color:var(--primary)] px-1.5 py-0.5 rounded text-xs text-[color:var(--on-surface)] outline-none"
                      />
                    ) : (
                      <span className="truncate">{thread.title}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100">
                    {msgCount > 0 && (
                      <span className="text-[10px] bg-[color:var(--surface-container-highest)] px-1.5 py-0.5 rounded-full opacity-70">
                        {msgCount}
                      </span>
                    )}
                    {!isEditing && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => handleStartRename(thread, e)}
                          className="p-1 hover:text-[color:var(--primary)] transition-colors rounded"
                          title="Renomear conversa"
                        >
                          <Icon name="edit" className="text-[13px]" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteThread(thread.id, e)}
                          className="p-1 hover:text-[color:var(--error)] transition-colors rounded"
                          title="Excluir conversa"
                        >
                          <Icon name="delete" className="text-[13px]" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sidebar Footer - Note info */}
          <div className="p-3 border-t border-[color:var(--outline-variant)]/15 bg-[color:var(--surface)]/50 text-[11px] text-[color:var(--on-surface-variant)]">
            <div className="flex items-center gap-1.5 font-bold truncate text-[color:var(--on-surface)] mb-1">
              <Icon name="description" className="text-sm text-[color:var(--primary)] shrink-0" />
              <span className="truncate">{noteTitle}</span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span>{attachments.length} anexo(s) disponível(is)</span>
              <span className="text-emerald-600 font-bold">IA Local Ativa</span>
            </div>
          </div>
        </aside>

        {/* Main Chat Panel */}
        <main className="flex-1 flex flex-col min-w-0 bg-[color:var(--surface)] relative">
          
          {/* Main Chat Header */}
          <header className="px-4 py-3 border-b border-[color:var(--outline-variant)]/15 flex items-center justify-between gap-3 bg-[color:var(--surface)] z-10">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="md:hidden p-1.5 rounded-xl hover:bg-[color:var(--surface-container-high)] text-[color:var(--on-surface-variant)]"
                title="Alternar histórico"
              >
                <Icon name="menu" className="text-lg" />
              </button>
              <div className="flex flex-col min-w-0">
                <h3 className="text-sm font-black text-[color:var(--on-surface)] truncate flex items-center gap-1.5">
                  <span>{activeThread?.title || "ChatGPT da Nota"}</span>
                  <span className="text-[10px] font-bold text-[color:var(--primary)] bg-[color:var(--primary)]/10 px-2 py-0.5 rounded-full border border-[color:var(--primary)]/20">
                    Modo Janela IA
                  </span>
                </h3>
                <span className="text-[10px] text-[color:var(--on-surface-variant)] truncate">
                  Pergunte e converse com contexto total da nota e anexos
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              {/* Response Length Toggle */}
              <div className="flex items-center bg-[color:var(--surface-container)] rounded-xl p-0.5 border border-[color:var(--outline-variant)]/30">
                <button
                  type="button"
                  onClick={() => setResponseLength("short")}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                    responseLength === "short"
                      ? "bg-[color:var(--primary)] text-white shadow-sm"
                      : "text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]"
                  }`}
                  title="Respostas curtas e objetivas"
                >
                  ⚡ Curta
                </button>
                <button
                  type="button"
                  onClick={() => setResponseLength("detailed")}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                    responseLength === "detailed"
                      ? "bg-[color:var(--primary)] text-white shadow-sm"
                      : "text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]"
                  }`}
                  title="Respostas completas e aprofundadas"
                >
                  📑 Completa
                </button>
              </div>

              {/* Scope Mode Picker */}
              <select
                value={scopeMode}
                onChange={(e) => setScopeMode(e.target.value)}
                className="bg-[color:var(--surface-container)] text-[color:var(--on-surface)] border border-[color:var(--outline-variant)]/30 text-[11px] font-bold rounded-xl px-2.5 py-1.5 outline-none cursor-pointer"
                title="Modo de busca e contexto da IA"
              >
                <option value="hybrid">🌟 Priorizar Arquivos + Complementar</option>
                <option value="strict">🎯 Apenas Arquivos e Nota</option>
                <option value="free">🌐 Conhecimento Geral Livre</option>
              </select>

              {/* Model Picker */}
              <select
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                className="bg-[color:var(--surface-container)] text-[color:var(--on-surface)] border border-[color:var(--outline-variant)]/30 text-[11px] font-bold rounded-xl px-2.5 py-1.5 outline-none cursor-pointer"
              >
                {(aiModelOptions || [
                  { value: "deepseek-r1:1.5b", label: "🧠 DeepSeek-R1 (1.5B Raciocínio)" },
                  { value: "deepseek-r1:7b", label: "🧠 DeepSeek-R1 (7B Raciocínio)" },
                  { value: "deepseek-r1", label: "🧠 DeepSeek-R1 (Padrão)" },
                  { value: "llama3", label: "Ollama (Llama 3)" },
                  { value: "mistral", label: "Ollama (Mistral)" },
                  { value: "gemma", label: "Ollama (Gemma)" },
                ]).map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>

              {/* Close Modal */}
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-[color:var(--surface-container)] hover:bg-[color:var(--error)]/10 hover:text-[color:var(--error)] flex items-center justify-center text-[color:var(--on-surface-variant)] transition-all"
                title="Fechar janela de chat"
              >
                <Icon name="close" className="text-base" />
              </button>
            </div>
          </header>

          {/* Messages Feed */}
          <div
            ref={chatFeedRef}
            className="chat-messages-feed flex-1 overflow-y-auto p-4 md:p-6 space-y-6 custom-scrollbar"
          >
            {(!activeThread?.messages || activeThread.messages.length === 0) ? (
              /* Welcome Screen for Empty Chat */
              <div className="h-full flex flex-col items-center justify-center text-center max-w-xl mx-auto py-8">
                <div className="w-16 h-16 rounded-3xl bg-[color:var(--primary)]/10 border border-[color:var(--primary)]/20 flex items-center justify-center mb-4 text-[color:var(--primary)]">
                  <Icon name="psychology" className="text-4xl animate-pulse" />
                </div>
                <h3 className="text-lg font-black text-[color:var(--on-surface)] mb-1">
                  Assistente ChatGPT da Nota
                </h3>
                <p className="text-xs text-[color:var(--on-surface-variant)] mb-6 max-w-md leading-relaxed">
                  Tire dúvidas, peça explicações ou solicite revisões conversacionais sobre o texto da nota e seus arquivos anexados.
                </p>

                {/* Quick Prompts */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full">
                  {[
                    {
                      label: "Resumir este material",
                      icon: "summarize",
                      prompt: "Faça um resumo bem estruturado e detalhado das informações da nota e anexos.",
                    },
                    {
                      label: "Extrair 5 conceitos-chave",
                      icon: "lightbulb",
                      prompt: "Extraia os 5 conceitos ou termos mais importantes deste conteúdo com explicações diretas.",
                    },
                    {
                      label: "Criar 5 perguntas de prova",
                      icon: "quiz",
                      prompt: "Gere 5 perguntas de prova com gabarito explicativo baseadas neste conteúdo.",
                    },
                    {
                      label: "Explicar didaticamente",
                      icon: "child_care",
                      prompt: "Explique os pontos mais complexos deste material de um jeito extremamente simples e fácil de entender.",
                    },
                  ].map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => handleSendMessage(item.prompt)}
                      className="flex items-center gap-3 p-3 rounded-2xl bg-[color:var(--surface-container)] hover:bg-[color:var(--surface-container-high)] border border-[color:var(--outline-variant)]/20 text-left transition-all hover:-translate-y-0.5"
                    >
                      <Icon name={item.icon} className="text-xl text-[color:var(--primary)] shrink-0" />
                      <span className="text-xs font-bold text-[color:var(--on-surface)] line-clamp-2">
                        {item.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* Message History Feed */
              activeThread.messages.map((msg) => {
                const isUser = msg.role === "user";

                return (
                  <div
                    key={msg.id}
                    id={`chat-msg-${msg.id}`}
                    className={`flex gap-3 max-w-3xl rounded-2xl transition-all p-1 ${isUser ? "ml-auto flex-row-reverse" : "mr-auto"}`}
                  >
                    {/* Avatar */}
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white shadow-sm ${
                        isUser ? "bg-[color:var(--primary)]" : "bg-slate-800 dark:bg-slate-700"
                      }`}
                    >
                      <Icon name={isUser ? "person" : "smart_toy"} className="text-base" />
                    </div>

                    {/* Content Box */}
                    <div className="flex flex-col gap-1.5 min-w-0">
                      {msg.attachmentName && (
                        <div className="self-start text-[10px] font-bold text-[color:var(--primary)] bg-[color:var(--primary)]/10 px-2 py-0.5 rounded-full border border-[color:var(--primary)]/20 flex items-center gap-1">
                          <Icon name="attach_file" className="text-[11px]" />
                          Ref: {msg.attachmentName}
                        </div>
                      )}

                      <div
                        className={`p-4 rounded-2xl text-xs leading-relaxed transition-all ${
                          isUser
                            ? "bg-[color:var(--primary)] text-white rounded-tr-none shadow-md"
                            : "bg-[color:var(--surface-container-high)] text-[color:var(--on-surface)] rounded-tl-none border border-[color:var(--outline-variant)]/20 shadow-sm"
                        }`}
                      >
                        {isUser ? (
                          <div className="whitespace-pre-wrap font-medium">{msg.content}</div>
                        ) : (
                          (() => {
                            const { thinkingText, cleanContent } = parseReasoningContent(msg.content);
                            const { cleanText: textNoSuggestions, suggestions } = parseFollowupSuggestions(cleanContent);
                            return (
                              <>
                                {thinkingText && (
                                  <details className="mb-3 rounded-xl bg-purple-950/20 border border-purple-500/30 text-xs overflow-hidden group">
                                    <summary className="px-3 py-2 cursor-pointer font-bold flex items-center justify-between text-purple-600 dark:text-purple-300 hover:bg-purple-500/10 select-none">
                                      <span className="flex items-center gap-1.5 text-xs">
                                        <Icon name="psychology" className="text-purple-500 text-sm animate-pulse" />
                                        Raciocínio Interno da IA (Thinking Process)
                                      </span>
                                      <span className="text-[10px] text-purple-400 group-open:rotate-180 transition-transform">▼</span>
                                    </summary>
                                    <div className="p-3 bg-purple-950/10 font-mono text-[11px] leading-relaxed border-t border-purple-500/20 whitespace-pre-wrap text-[color:var(--on-surface-variant)] custom-scrollbar max-h-56 overflow-y-auto">
                                      {thinkingText}
                                    </div>
                                  </details>
                                )}

                                <div
                                  className="campus-ai-markdown overflow-x-auto"
                                  dangerouslySetInnerHTML={{
                                    __html: sanitizeGeneratedHtml(
                                      markdownToNoteHtml(textNoSuggestions),
                                    ),
                                  }}
                                />

                                {suggestions.length > 0 && (
                                  <div className="mt-3 pt-2.5 border-t border-[color:var(--outline-variant)]/20 flex flex-col gap-1.5">
                                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--primary)] flex items-center gap-1">
                                      <Icon name="lightbulb" className="text-xs text-[color:var(--primary)]" />
                                      Sugestões de aprofundamento:
                                    </span>
                                    <div className="flex flex-wrap gap-1.5">
                                      {suggestions.map((sugText) => (
                                        <button
                                          key={sugText}
                                          type="button"
                                          onClick={() => handleSendMessage(sugText)}
                                          className="text-[11px] font-bold text-[color:var(--on-surface)] bg-[color:var(--surface-container)] hover:bg-[color:var(--primary)]/10 hover:text-[color:var(--primary)] hover:border-[color:var(--primary)]/30 px-2.5 py-1 rounded-xl border border-[color:var(--outline-variant)]/30 transition-all text-left flex items-center gap-1.5 shadow-2xs group cursor-pointer"
                                        >
                                          <span className="text-amber-500 group-hover:scale-110 transition-transform">💡</span>
                                          <span>{sugText}</span>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </>
                            );
                          })()
                        )}
                      </div>

                      {/* Action buttons under AI response */}
                      {!isUser && (
                        <div className="flex items-center gap-2 pt-1 text-[10px] text-[color:var(--on-surface-variant)]">
                          <button
                            type="button"
                            onClick={() => handleCopyText(msg.id, msg.content)}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[color:var(--surface-container)] hover:bg-[color:var(--surface-container-highest)] font-bold transition-colors"
                          >
                            <Icon name={copiedMsgId === msg.id ? "check" : "content_copy"} className="text-xs text-[color:var(--primary)]" />
                            {copiedMsgId === msg.id ? "Copiado!" : "Copiar"}
                          </button>

                          {onAppendToNoteContent && (
                            <button
                              type="button"
                              onClick={() => handleAppendToNote(msg.id, msg.content)}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[color:var(--primary)]/10 text-[color:var(--primary)] font-bold hover:bg-[color:var(--primary)]/20 transition-colors"
                            >
                              <Icon name={insertedMsgId === msg.id ? "check_circle" : "add_to_photos"} className="text-xs" />
                              {insertedMsgId === msg.id ? "Inserido na Nota!" : "Inserir na Nota"}
                            </button>
                          )}

                          <span className="ml-auto opacity-60">
                            {new Date(msg.timestamp).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {/* Thinking / Loading state */}
            {isThinking && (
              <div className="flex gap-3 mr-auto max-w-2xl animate-fade-in">
                <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-pink-500 flex items-center justify-center text-white shrink-0 shadow-lg border border-purple-300/30">
                  <Icon name="auto_awesome" className="text-lg animate-spin text-amber-300" style={{ animationDuration: '3s' }} />
                </div>
                <div className="p-4 rounded-3xl rounded-tl-none bg-gradient-to-r from-purple-500/10 via-indigo-500/10 to-purple-500/5 text-[color:var(--on-surface)] border border-purple-500/30 flex items-center justify-between gap-4 shadow-md flex-1">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-black text-purple-600 dark:text-purple-300 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-purple-500 animate-ping" />
                      Executando IA Local...
                    </span>
                    <span className="text-[11px] text-[color:var(--on-surface-variant)]">
                      Analisando nota e anexos via Ollama...
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCancelAi}
                    className="text-xs font-black text-[color:var(--error)] bg-[color:var(--error)]/10 px-3 py-1.5 rounded-xl hover:bg-[color:var(--error)]/20 border border-[color:var(--error)]/20 transition-all cursor-pointer shrink-0"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input Bar */}
          <footer className="p-3 md:p-4 border-t border-[color:var(--outline-variant)]/15 bg-[color:var(--surface)] flex flex-col gap-2">
            {/* Attachment Scope Picker */}
            {attachments.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[10px]">
                <span className="font-bold text-[color:var(--on-surface-variant)] shrink-0">Foco do Anexo:</span>
                <button
                  type="button"
                  onClick={() => setSelectedAttachmentForAi("")}
                  className={`px-2 py-0.5 rounded-full font-bold transition-all border shrink-0 ${
                    !selectedAttachmentForAi
                      ? "bg-[color:var(--primary)] text-white border-[color:var(--primary)]"
                      : "bg-[color:var(--surface-container)] text-[color:var(--on-surface-variant)] border-[color:var(--outline-variant)]/30 hover:border-[color:var(--primary)]/40"
                  }`}
                >
                  Todos os anexos ({attachments.length})
                </button>
                {attachments.map((path) => {
                  const fileName = path.split(/[\\/]/).pop();
                  const isSel = selectedAttachmentForAi === path;
                  return (
                    <button
                      key={path}
                      type="button"
                      title={path}
                      onClick={() => setSelectedAttachmentForAi(isSel ? "" : path)}
                      className={`px-2 py-0.5 rounded-full font-bold transition-all truncate max-w-[140px] border shrink-0 ${
                        isSel
                          ? "bg-[color:var(--primary)] text-white border-[color:var(--primary)]"
                          : "bg-[color:var(--surface-container)] text-[color:var(--on-surface-variant)] border-[color:var(--outline-variant)]/30 hover:border-[color:var(--primary)]/40"
                      }`}
                    >
                      📄 {fileName}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Input & Send Button */}
            <div className="relative flex items-center gap-2 bg-[color:var(--surface-container)] border border-[color:var(--outline-variant)]/30 rounded-2xl p-1.5 focus-within:border-[color:var(--primary)] transition-all">
              <textarea
                ref={inputRef}
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder={
                  selectedAttachmentForAi
                    ? `Perguntar referente a "${selectedAttachmentForAi.split(/[\\/]/).pop()}"...`
                    : "Digite sua pergunta sobre a nota e os anexos (Enter para enviar)..."
                }
                className="flex-1 bg-transparent border-none text-xs text-[color:var(--on-surface)] placeholder-[color:var(--on-surface-variant)]/60 p-2 outline-none resize-none min-h-[44px] max-h-[120px]"
              />
              <button
                type="button"
                disabled={isThinking || !inputQuery.trim()}
                onClick={() => handleSendMessage()}
                className="w-10 h-10 rounded-xl bg-[color:var(--primary)] text-white flex items-center justify-center shrink-0 disabled:opacity-40 hover:opacity-90 transition-all shadow-md"
                title="Enviar mensagem"
              >
                <Icon name="send" className="text-base" />
              </button>
            </div>

            <div className="flex items-center justify-between text-[10px] text-[color:var(--on-surface-variant)] px-1">
              <span>Pressione <strong>Enter</strong> para enviar, <strong>Shift + Enter</strong> para nova linha</span>
              <span>IA executando localmente via Ollama</span>
            </div>
          </footer>

        </main>
      </div>

      {/* Floating Text Selection Popup */}
      {floatingSelection && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: "fixed",
            left: `${floatingSelection.x}px`,
            top: `${floatingSelection.y}px`,
            transform: "translate(-50%, -100%)",
          }}
          className="z-50 bg-[color:var(--surface-container-highest)] border border-[color:var(--primary)]/40 p-2.5 rounded-2xl shadow-2xl flex flex-col gap-2 animate-scale-in text-xs max-w-sm"
        >
          <div className="text-[10px] font-bold text-[color:var(--primary)] bg-[color:var(--primary)]/10 px-2 py-1 rounded-lg truncate max-w-xs border border-[color:var(--primary)]/20 flex items-center gap-1">
            <span className="font-extrabold text-amber-500">✨ Destacado:</span>
            <span className="truncate italic font-normal text-[color:var(--on-surface)]">"{floatingSelection.text}"</span>
          </div>

          <div className="flex items-center gap-2">
            {onAppendToNoteContent && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => handleInsertSelectionToNote(e)}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-[color:var(--primary)] text-white font-bold hover:opacity-90 cursor-pointer shadow-md transition-all"
                title="Adicionar trecho selecionado diretamente na nota"
              >
                <Icon name="add_to_photos" className="text-sm text-emerald-300" />
                <span>Inserir na Nota</span>
              </button>
            )}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.preventDefault();
                navigator.clipboard.writeText(floatingSelection.text);
                setCopiedMsgId("selection");
                setTimeout(() => setCopiedMsgId(""), 2000);
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[color:var(--surface-container)] hover:bg-[color:var(--surface-container-high)] text-[color:var(--on-surface)] font-bold border border-[color:var(--outline-variant)]/30 cursor-pointer transition-all"
              title="Copiar texto selecionado"
            >
              <Icon name={copiedMsgId === "selection" ? "check" : "content_copy"} className="text-sm text-amber-500" />
              <span>{copiedMsgId === "selection" ? "Copiado!" : "Copiar"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
