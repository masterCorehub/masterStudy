import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Icon } from "../ui/Icon";
import { SCREEN_IDS } from "../app/screenIds";
import { useStudyStore } from "../store/useStore";
import { RichTextEditor } from "../components/RichTextEditor";
import { markdownToNoteHtml } from "../domain/aiStudio";
import {
  extractYouTubeVideoId,
  generateContentQuizzes,
  generateConciseSummaryOnly,
  generateAiTags,
  queryLocalAi,
  summarizeItemWithAi,
  cleanAndFormatReaderContent,
} from "../domain/localAiEngine";

// ─── Formatador de Texto Inline com Busca e Timestamps ───────────────────────
function renderReaderInline(text, searchQuery, onSeekVideo) {
  if (!text) return null;

  const timestampRegex = /\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g;
  const chunks = [];
  let lastIdx = 0;
  let match;

  while ((match = timestampRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      chunks.push(text.substring(lastIdx, match.index));
    }
    const label = match[1];
    const parts = label.split(":").map(Number);
    const secs = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
    chunks.push(
      <button
        key={`seek-${match.index}`}
        onClick={() => onSeekVideo && onSeekVideo(secs)}
        className="inline-flex items-center px-2 py-0.5 mx-1 rounded-md bg-[color:var(--primary)]/15 text-[color:var(--primary)] font-mono text-[11px] font-bold hover:bg-[color:var(--primary)] hover:text-white transition-all cursor-pointer select-none"
        title={`Pular vídeo para ${label}`}
      >
        <Icon name="play_arrow" className="text-[11px] mr-0.5" />
        {label}
      </button>
    );
    lastIdx = match.index + match[0].length;
  }

  if (lastIdx < text.length) {
    chunks.push(text.substring(lastIdx));
  }

  return chunks.map((chunk, cIdx) => {
    if (typeof chunk !== "string") return chunk;

    const subTokens = chunk.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
    return subTokens.map((sub, sIdx) => {
      let element;
      if (sub.startsWith("**") && sub.endsWith("**") && sub.length > 4) {
        element = <strong key={`${cIdx}-${sIdx}`} className="font-bold text-[color:var(--on-surface)]">{sub.slice(2, -2)}</strong>;
      } else if (sub.startsWith("*") && sub.endsWith("*") && sub.length > 2) {
        element = <em key={`${cIdx}-${sIdx}`} className="italic text-[color:var(--on-surface)]">{sub.slice(1, -1)}</em>;
      } else if (sub.startsWith("`") && sub.endsWith("`") && sub.length > 2) {
        element = <code key={`${cIdx}-${sIdx}`} className="px-1.5 py-0.5 rounded bg-[color:var(--surface-container-high)] text-[color:var(--primary)] font-mono text-[11px]">{sub.slice(1, -1)}</code>;
      } else {
        if (!searchQuery || !searchQuery.trim()) {
          element = sub;
        } else {
          const q = searchQuery.trim();
          const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
          const parts = sub.split(regex);
          element = parts.map((part, pIdx) =>
            regex.test(part) ? (
              <mark key={pIdx} className="bg-amber-300/80 dark:bg-amber-500/40 text-[color:var(--on-surface)] rounded-xs px-0.5 font-semibold">
                {part}
              </mark>
            ) : (
              part
            )
          );
        }
      }
      return element;
    });
  });
}

// ─── Renderizador Estruturado do Corpo do Artigo / Texto de Leitura ──────────
function ReaderBodyRenderer({ content, searchQuery, onSeekVideo, fontSize = "base" }) {
  if (!content || !content.trim()) {
    return (
      <div className="p-12 text-center text-xs text-[color:var(--on-surface-variant)] italic">
        Nenhum conteúdo disponível para leitura neste material.
      </div>
    );
  }

  const fontSizeClass =
    fontSize === "small"
      ? "text-xs leading-relaxed"
      : fontSize === "large"
      ? "text-base leading-loose"
      : "text-sm leading-relaxed";

  const lines = content.split("\n");
  const blocks = [];
  let inCode = false;
  let codeLang = "";
  let codeLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("```")) {
      if (inCode) {
        blocks.push(
          <div key={`code-${i}`} className="my-4 rounded-2xl bg-[#0f172a] text-[#e2e8f0] p-4 font-mono text-xs overflow-x-auto border border-slate-800 shadow-md relative group">
            {codeLang && (
              <div className="absolute top-2 right-3 text-[10px] text-slate-400 font-bold uppercase tracking-wider select-none">
                {codeLang}
              </div>
            )}
            <pre className="leading-relaxed">
              <code>{codeLines.join("\n")}</code>
            </pre>
          </div>
        );
        inCode = false;
        codeLines = [];
        codeLang = "";
      } else {
        inCode = true;
        codeLang = line.slice(3).trim();
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      blocks.push(<div key={`gap-${i}`} className="h-2" />);
      continue;
    }

    // Título Principal
    if (trimmed.startsWith("# ")) {
      blocks.push(
        <h1 key={`h1-${i}`} className="text-xl md:text-2xl font-black text-[color:var(--on-surface)] mt-6 mb-3 pb-2 border-b border-[color:var(--outline-variant)]/20 tracking-tight">
          {renderReaderInline(trimmed.slice(2), searchQuery, onSeekVideo)}
        </h1>
      );
    } else if (trimmed.startsWith("## ")) {
      blocks.push(
        <h2 key={`h2-${i}`} className="text-lg md:text-xl font-bold text-[color:var(--on-surface)] mt-5 mb-2.5 tracking-tight flex items-center gap-2">
          <span className="w-1.5 h-4 rounded-full bg-[color:var(--primary)] inline-block shrink-0" />
          <span>{renderReaderInline(trimmed.slice(3), searchQuery, onSeekVideo)}</span>
        </h2>
      );
    } else if (trimmed.startsWith("### ")) {
      blocks.push(
        <h3 key={`h3-${i}`} className="text-sm md:text-base font-bold text-[color:var(--primary)] mt-4 mb-2 flex items-center gap-1.5">
          <Icon name="bookmark" className="text-sm" />
          <span>{renderReaderInline(trimmed.slice(4), searchQuery, onSeekVideo)}</span>
        </h3>
      );
    } else if (trimmed.startsWith("#### ")) {
      blocks.push(
        <h4 key={`h4-${i}`} className="text-xs font-bold uppercase tracking-wider text-[color:var(--on-surface-variant)] mt-3 mb-1">
          {renderReaderInline(trimmed.slice(5), searchQuery, onSeekVideo)}
        </h4>
      );
    } else if (trimmed.startsWith("> ")) {
      blocks.push(
        <blockquote key={`quote-${i}`} className="my-3 p-4 rounded-2xl bg-[color:var(--primary)]/10 border-l-4 border-[color:var(--primary)] text-xs text-[color:var(--on-surface)] leading-relaxed italic shadow-xs">
          {renderReaderInline(trimmed.slice(2), searchQuery, onSeekVideo)}
        </blockquote>
      );
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("• ") || trimmed.startsWith("* ")) {
      blocks.push(
        <li key={`li-${i}`} className={`ml-5 list-disc ${fontSizeClass} text-[color:var(--on-surface)] my-1.5`}>
          {renderReaderInline(trimmed.replace(/^[-•*]\s*/, ""), searchQuery, onSeekVideo)}
        </li>
      );
    } else if (/^\d+\.\s/.test(trimmed)) {
      blocks.push(
        <li key={`ol-${i}`} className={`ml-5 list-decimal ${fontSizeClass} text-[color:var(--on-surface)] my-1.5`}>
          {renderReaderInline(trimmed.replace(/^\d+\.\s*/, ""), searchQuery, onSeekVideo)}
        </li>
      );
    } else {
      blocks.push(
        <p key={`p-${i}`} className={`${fontSizeClass} text-[color:var(--on-surface)] my-2.5`}>
          {renderReaderInline(line, searchQuery, onSeekVideo)}
        </p>
      );
    }
  }

  return <div className="space-y-1">{blocks}</div>;
}

// ─── TELA PRINCIPAL DE DETALHES DO ITEM ──────────────────────────────────────
export function KnowledgeItemDetailScreen({ onNavigate }) {
  const activeKnowledgeItemId = useStudyStore((state) => state.activeKnowledgeItemId);
  const setActiveKnowledgeItemId = useStudyStore((state) => state.setActiveKnowledgeItemId);
  const knowledgeItems = useStudyStore((state) => state.knowledgeItems || []);
  const updateKnowledgeItem = useStudyStore((state) => state.updateKnowledgeItem);
  const addQuizToKnowledgeItem = useStudyStore((state) => state.addQuizToKnowledgeItem);
  const deleteQuizFromKnowledgeItem = useStudyStore((state) => state.deleteQuizFromKnowledgeItem);
  const answerKnowledgeQuiz = useStudyStore((state) => state.answerKnowledgeQuiz);

  const [activeTab, setActiveTab] = useState("notebook"); // "notebook" | "reader" | "chat" | "quiz"
  const [isSummarizingWithAi, setIsSummarizingWithAi] = useState(false);
  const [isGeneratingConcise, setIsGeneratingConcise] = useState(false);
  const [isGeneratingTags, setIsGeneratingTags] = useState(false);
  const [isCleaningContent, setIsCleaningContent] = useState(false);
  const [aiProgressText, setAiProgressText] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatTyping, setIsChatTyping] = useState(false);
  
  // Estado para o player interativo de Quiz
  const [isQuizPlayerActive, setIsQuizPlayerActive] = useState(false);
  const [quizPlayerIndex, setQuizPlayerIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState(null);

  const [readerFontSize, setReaderFontSize] = useState("base"); // "small" | "base" | "large"
  const [readerSearch, setReaderSearch] = useState("");
  const [transcriptMode, setTranscriptMode] = useState("timeline"); // "timeline" | "fluid"

  const editorRef = useRef(null);
  const autoTagTimeoutRef = useRef(null);

  const item = useMemo(() => {
    return knowledgeItems.find((k) => k.id === activeKnowledgeItemId) || knowledgeItems[0] || null;
  }, [knowledgeItems, activeKnowledgeItemId]);

  const handleCopyText = (text, label = "Conteúdo") => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setNoticeMessage(`📋 ${label} copiado com sucesso!`);
    setTimeout(() => setNoticeMessage(null), 3000);
  };

  const [localNotes, setLocalNotes] = useState(() => {
    const raw = item?.markdownNotes || "";
    if (
      raw.includes("<p>") ||
      raw.includes("<h1") ||
      raw.includes("<h2") ||
      raw.includes("<h3") ||
      raw.includes("<div>") ||
      raw.includes("<ul>") ||
      raw.includes("<ol>")
    ) {
      return raw;
    }
    return markdownToNoteHtml(raw);
  });

  // Sincroniza o estado local quando troca de item no Knowledge Hub
  useEffect(() => {
    if (item?.id) {
      const raw = item.markdownNotes || "";
      const formatted =
        raw.includes("<p>") ||
        raw.includes("<h1") ||
        raw.includes("<h2") ||
        raw.includes("<h3") ||
        raw.includes("<div>") ||
        raw.includes("<ul>") ||
        raw.includes("<ol>")
          ? raw
          : markdownToNoteHtml(raw);
      setLocalNotes(formatted);
    }
  }, [item?.id]);

  // Função para gerar tags com IA em segundo plano sempre que o usuário adiciona/edita algo
  const triggerBackgroundTagGeneration = useCallback((content) => {
    if (autoTagTimeoutRef.current) clearTimeout(autoTagTimeoutRef.current);
    autoTagTimeoutRef.current = setTimeout(async () => {
      if (!item?.id || !content) return;
      setIsGeneratingTags(true);
      try {
        const newTags = await generateAiTags(item.title, content);
        if (newTags && newTags.length > 0) {
          const currentTags = item.tags || [];
          const merged = Array.from(new Set([...currentTags, ...newTags]));
          if (merged.length !== currentTags.length) {
            updateKnowledgeItem(item.id, { tags: merged });
          }
        }
      } catch (err) {
        console.warn("Background auto-tag error:", err);
      } finally {
        setIsGeneratingTags(false);
      }
    }, 1800);
  }, [item?.id, item?.title, item?.tags, updateKnowledgeItem]);

  useEffect(() => {
    if (item) {
      if (chatMessages.length === 0) {
        setChatMessages([
          {
            role: "assistant",
            text: `Olá! Sou seu assistente de estudos para **${item.title}**. Você pode me fazer qualquer pergunta sobre este material, pedir explicações detalhadas ou gerar exemplos práticos.`,
          },
        ]);
      }
    }
  }, [item]);

  if (!item) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[color:var(--background)]">
        <Icon name="search_off" className="text-4xl text-[color:var(--on-surface-variant)] mb-3" />
        <h3 className="text-lg font-bold text-[color:var(--on-surface)]">Nenhum item selecionado</h3>
        <button
          onClick={() => onNavigate && onNavigate(SCREEN_IDS.KNOWLEDGE_HUB)}
          className="mt-4 px-5 py-2.5 rounded-xl bg-[color:var(--primary)] text-white text-xs font-bold"
        >
          Voltar ao Knowledge Hub
        </button>
      </div>
    );
  }

  const ytVideoId = extractYouTubeVideoId(item.sourceUrl);

  const handleEditorHtmlChange = useCallback((newHtml) => {
    setLocalNotes(newHtml);
    if (item?.id) {
      updateKnowledgeItem(item.id, { markdownNotes: newHtml });
      triggerBackgroundTagGeneration(newHtml);
    }
  }, [item?.id, updateKnowledgeItem, triggerBackgroundTagGeneration]);

  const handleSeekVideo = (seconds) => {
    const iframe = document.getElementById("yt-player-frame");
    if (iframe && ytVideoId) {
      iframe.src = `https://www.youtube.com/embed/${ytVideoId}?start=${seconds}&autoplay=1`;
      setActiveTab("reader");
    }
  };

  // Gerar Resumo Conciso com IA
  const handleGenerateConciseSummary = async () => {
    if (isGeneratingConcise) return;
    setIsGeneratingConcise(true);
    setNoticeMessage("Gerando resumo conciso com IA...");

    try {
      const content = item.rawContent || item.summaryDetailed || localNotes || item.title;
      const concise = await generateConciseSummaryOnly(item.title, content);

      if (concise) {
        updateKnowledgeItem(item.id, { summaryConcise: concise });
        const conciseHtml = `<div class="ai-summary-block my-4 p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/30"><h3>⚡ Resumo Conciso (IA)</h3>${markdownToNoteHtml(concise)}</div>`;
        if (editorRef.current?.appendHtml) {
          editorRef.current.appendHtml(conciseHtml);
        } else {
          const next = (localNotes || "") + "\n" + conciseHtml;
          setLocalNotes(next);
          updateKnowledgeItem(item.id, { markdownNotes: next });
        }
        triggerBackgroundTagGeneration((localNotes || "") + " " + concise);
        setNoticeMessage("✨ Resumo conciso gerado e inserido no caderno com sucesso!");
        setTimeout(() => setNoticeMessage(null), 3500);
      }
    } catch (err) {
      console.warn("Concise AI Summary error:", err);
      setNoticeMessage("Erro ao consultar IA Local.");
    } finally {
      setIsGeneratingConcise(false);
    }
  };

  // Gerar Resumo Completo + Quizzes
  const handleRunAiSummarize = async () => {
    if (isSummarizingWithAi) return;
    setIsSummarizingWithAi(true);
    setAiProgressText("Consultando IA Local...");

    try {
      const result = await summarizeItemWithAi(item);
      const htmlNotes = markdownToNoteHtml(result.markdownNotes || "");
      const existingNotes = localNotes || "";
      const finalNotes = existingNotes.trim() ? `${existingNotes}<hr/>${htmlNotes}` : htmlNotes;
      setLocalNotes(finalNotes);
      updateKnowledgeItem(item.id, {
        ...result,
        markdownNotes: finalNotes,
      });
      setActiveTab("notebook");
      setNoticeMessage("✨ Resumo estruturado gerado com sucesso!");
      setTimeout(() => setNoticeMessage(null), 4000);
    } catch (err) {
      console.warn("AI Summarize error:", err);
    } finally {
      setIsSummarizingWithAi(false);
      setAiProgressText("");
    }
  };

  // Corrigir formatação e limpar ruídos avulsos do Reader
  const handleCleanReaderFormat = async () => {
    if (isCleaningContent || !item?.id) return;
    setIsCleaningContent(true);
    setNoticeMessage("🧹 Limpando ruídos e corrigindo formatação do Reader...");

    try {
      const currentRaw = item.rawContent || item.summaryDetailed || "";
      const cleaned = await cleanAndFormatReaderContent(item.title, currentRaw, item.sourceType);
      if (cleaned && cleaned.trim() !== currentRaw.trim()) {
        updateKnowledgeItem(item.id, { rawContent: cleaned });
        setNoticeMessage("✨ Formatação corrigida e texto limpo com sucesso no Reader!");
      } else {
        setNoticeMessage("O texto do Reader já está devidamente limpo e formatado.");
      }
      setTimeout(() => setNoticeMessage(null), 3500);
    } catch (err) {
      console.warn("Clean reader format error:", err);
      setNoticeMessage("Erro ao tentar limpar a formatação.");
      setTimeout(() => setNoticeMessage(null), 3000);
    } finally {
      setIsCleaningContent(false);
    }
  };

  const handleSendChatMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatTyping) return;

    const userText = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", text: userText }]);
    setIsChatTyping(true);

    const context = item.rawContent || item.summaryDetailed || item.markdownNotes;
    const prompt = `Contexto sobre o material "${item.title}":
---
${context.slice(0, 4000)}
---
Pergunta do estudante: "${userText}"
Responda de forma didática, clara e objetiva com exemplos práticos em Markdown se necessário.`;

    const reply = await queryLocalAi({
      prompt,
      systemPrompt: "Você é um tutor acadêmico amigável e especialista no assunto.",
    });

    setChatMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        text: reply || `Com base em **${item.title}**, o ponto principal é que ${item.summaryConcise?.split("\n")[0] || "o conceito deve ser compreendido de forma estruturada."}`,
      },
    ]);
    setIsChatTyping(false);
  };

  const handleGenerateMoreQuizzes = async () => {
    const newQuizzes = await generateContentQuizzes(item.title, item.markdownNotes || item.summaryDetailed, 3);
    newQuizzes.forEach((q) => addQuizToKnowledgeItem(item.id, q));
  };

  return (
    <div className="flex w-full h-full bg-[color:var(--background)] text-[color:var(--on-surface)] overflow-hidden">
      
      {/* ─── SIDEBAR ESQUERDA: LISTA DE ITENS ───────────────────────────────── */}
      <aside className="w-64 border-r border-[color:var(--outline-variant)]/30 bg-[color:var(--surface-container-low)] flex flex-col h-full shrink-0 hidden lg:flex">
        <div className="p-4 border-b border-[color:var(--outline-variant)]/20 flex items-center justify-between">
          <button
            onClick={() => onNavigate && onNavigate(SCREEN_IDS.KNOWLEDGE_HUB)}
            className="flex items-center gap-2 text-xs font-bold text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)] transition-colors"
          >
            <Icon name="arrow_back" className="text-base" />
            <span>Knowledge Hub</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {knowledgeItems.map((k) => {
            const isSelected = k.id === item.id;
            return (
              <button
                key={k.id}
                onClick={() => {
                  setActiveKnowledgeItemId(k.id);
                  setIsQuizPlayerActive(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-left transition-all ${
                  isSelected
                    ? "bg-[color:var(--surface-container-high)] text-[color:var(--primary)] font-bold shadow-xs"
                    : "text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-container)] hover:text-[color:var(--on-surface)] font-medium"
                }`}
              >
                <span className="w-5 h-5 rounded-md bg-[color:var(--surface)] text-[color:var(--primary)] flex items-center justify-center text-[10px] font-black shrink-0 border border-[color:var(--outline-variant)]/30">
                  {k.title.charAt(0).toUpperCase()}
                </span>
                <span className="truncate flex-1">{k.title}</span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ─── PAINEL PRINCIPAL ────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-[color:var(--background)]">
        
        {/* Header Superior */}
        <header className="h-16 px-6 md:px-8 border-b border-[color:var(--outline-variant)]/30 flex items-center justify-between bg-[color:var(--surface)]/80 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigate && onNavigate(SCREEN_IDS.KNOWLEDGE_HUB)}
              className="lg:hidden p-2 rounded-xl text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-container)]"
            >
              <Icon name="arrow_back" />
            </button>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-[color:var(--primary)]/10 text-[color:var(--primary)] text-[11px] font-black uppercase tracking-wider">
                {item.sourceHost || item.sourceType || "KNOWLEDGE"}
              </span>
              <h2 className="text-sm font-bold text-[color:var(--on-surface)] truncate max-w-md">
                {item.title}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {noticeMessage && (
              <span className="text-xs font-bold text-emerald-500 animate-pulse hidden sm:inline">
                {noticeMessage}
              </span>
            )}

            {/* Gerar Resumo Conciso com IA */}
            <button
              onClick={handleGenerateConciseSummary}
              disabled={isGeneratingConcise || isSummarizingWithAi}
              className="px-3.5 py-1.5 rounded-xl bg-[color:var(--primary)]/10 hover:bg-[color:var(--primary)]/20 text-[color:var(--primary)] border border-[color:var(--primary)]/30 text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50"
              title="Gerar Resumo Conciso e Direto ao Ponto com IA"
            >
              {isGeneratingConcise ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-[color:var(--primary)] border-t-transparent rounded-full animate-spin" />
                  <span>Gerando Conciso...</span>
                </>
              ) : (
                <>
                  <Icon name="bolt" className="text-sm" />
                  <span>Resumo Conciso IA</span>
                </>
              )}
            </button>

            {/* Resumir Completo com IA */}
            <button
              onClick={handleRunAiSummarize}
              disabled={isSummarizingWithAi || isGeneratingConcise}
              className="px-3.5 py-1.5 rounded-xl bg-[color:var(--primary)] text-white text-xs font-bold shadow-xs hover:opacity-90 active:scale-95 transition-all flex items-center gap-1.5 disabled:opacity-50"
              title="Gerar Resumo Completo Estruturado e Quizzes"
            >
              {isSummarizingWithAi ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>{aiProgressText || "Resumindo..."}</span>
                </>
              ) : (
                <>
                  <Icon name="auto_awesome" className="text-sm" />
                  <span>Resumo Completo IA</span>
                </>
              )}
            </button>
          </div>
        </header>

        {/* Banner do Item */}
        <div className="px-6 md:px-8 py-4 border-b border-[color:var(--outline-variant)]/20 bg-[color:var(--surface)] shrink-0">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {item.thumbnailUrl ? (
                <img
                  src={item.thumbnailUrl}
                  alt={item.title}
                  className="w-14 h-14 rounded-2xl object-cover border border-[color:var(--outline-variant)]/40 shrink-0 shadow-xs"
                />
              ) : (
                <div className="w-14 h-14 rounded-2xl bg-[color:var(--surface-container-high)] text-[color:var(--primary)] flex items-center justify-center text-2xl font-black shrink-0">
                  <Icon name="auto_awesome" />
                </div>
              )}
              <div>
                <h1 className="text-lg md:text-xl font-black text-[color:var(--on-surface)] tracking-tight">
                  {item.title}
                </h1>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  {item.sourceUrl ? (
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-bold text-[color:var(--primary)] hover:underline flex items-center gap-1"
                    >
                      <Icon name="link" className="text-sm" />
                      <span>{item.sourceHost || "Abrir Link Original"}</span>
                    </a>
                  ) : (
                    <span className="text-xs font-bold text-[color:var(--on-surface-variant)]">Nota Local</span>
                  )}

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {(item.tags || []).map((t) => (
                      <span key={t} className="px-2 py-0.5 rounded-full bg-[color:var(--surface-container-high)] text-[10px] font-semibold text-[color:var(--on-surface-variant)]">
                        #{t}
                      </span>
                    ))}
                    {isGeneratingTags && (
                      <span className="px-2 py-0.5 rounded-full bg-[color:var(--primary)]/10 text-[color:var(--primary)] text-[10px] font-bold animate-pulse flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--primary)] animate-ping" />
                        <span>Gerando tags IA...</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Abas de Navegação */}
          <div className="flex items-center gap-2 mt-4 border-t border-[color:var(--outline-variant)]/20 pt-2.5">
            {[
              { id: "notebook", label: "Notebook", icon: "menu_book" },
              { id: "reader", label: "Reader / Player", icon: "play_lesson" },
              { id: "chat", label: "Chat com IA", icon: "smart_toy" },
              { id: "quiz", label: `Quiz (${(item.quizzes || []).length})`, icon: "quiz" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setIsQuizPlayerActive(false);
                }}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                  activeTab === tab.id
                    ? "bg-[color:var(--primary)] text-white shadow-xs"
                    : "text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-container-high)] hover:text-[color:var(--on-surface)]"
                }`}
              >
                <Icon name={tab.icon} className="text-sm" />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ─── CORPO DA ABA SELECIONADA ───────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          
          {/* 1. ABA NOTEBOOK (COM LIVE PREVIEW E RESUMO CONCISO) */}
          {activeTab === "notebook" && (
            <div className="max-w-6xl mx-auto space-y-6">
              
              {/* Callout de Resumo Conciso */}
              {item.summaryConcise && (
                <div className="p-5 rounded-3xl bg-[color:var(--primary)]/10 border-l-4 border-[color:var(--primary)] text-[color:var(--on-surface)] shadow-xs">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-bold text-xs uppercase tracking-wider text-[color:var(--primary)] flex items-center gap-1.5">
                      <Icon name="bolt" className="text-base" />
                      <span>Resumo Conciso & Conceitos-Chave (IA)</span>
                    </h4>
                    <button
                      onClick={handleGenerateConciseSummary}
                      disabled={isGeneratingConcise}
                      className="text-[11px] font-bold text-[color:var(--primary)] hover:underline flex items-center gap-1"
                    >
                      <Icon name="refresh" className="text-xs" />
                      <span>Regenerar</span>
                    </button>
                  </div>
                  <div className="text-xs leading-relaxed whitespace-pre-line opacity-90 font-medium">
                    {item.summaryConcise}
                  </div>
                </div>
              )}

              {/* Editor Único e Rico (Notion / Obsidian Live style) */}
              <div className="rounded-3xl bg-[color:var(--surface)] border border-[color:var(--outline-variant)]/40 p-6 md:p-8 shadow-xs min-h-[520px]">
                <RichTextEditor
                  key={item.id}
                  ref={editorRef}
                  content={localNotes}
                  onChange={handleEditorHtmlChange}
                  documentMode={true}
                  onTimeClick={handleSeekVideo}
                  placeholder="Comece a estruturar suas ideias... Digite # para títulos, - para listas ou / para inserir blocos..."
                />
              </div>
            </div>
          )}

          {/* 2. ABA READER / PLAYER COM FORMATAÇÃO RICA */}
          {activeTab === "reader" && (
            <div className="max-w-4xl mx-auto space-y-6">
              
              {/* ─── BARRA DE CONTROLE DO LEITOR ─────────────────────────────────── */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-[color:var(--surface)] border border-[color:var(--outline-variant)]/30 shadow-xs">
                {/* Metadados e Estatísticas Rápidas */}
                <div className="flex items-center gap-3 text-xs text-[color:var(--on-surface-variant)] flex-wrap">
                  <span className="font-bold text-[color:var(--on-surface)] flex items-center gap-1.5">
                    <Icon name={ytVideoId ? "play_lesson" : "auto_stories"} className="text-base text-[color:var(--primary)]" />
                    <span>{ytVideoId ? "Player & Transcrição" : "Modo Leitura"}</span>
                  </span>
                  
                  {/* Estimativa de leitura / estatísticas */}
                  {(() => {
                    const text = item.rawContent || item.summaryDetailed || "";
                    const words = text.trim().split(/\s+/).filter(Boolean).length;
                    const mins = Math.max(1, Math.ceil(words / 200));
                    return (
                      <span className="opacity-75 hidden sm:inline-flex items-center gap-1.5 border-l border-[color:var(--outline-variant)]/20 pl-3">
                        <Icon name="schedule" className="text-xs" />
                        <span>~{mins} min de leitura</span>
                        <span>•</span>
                        <span>{words.toLocaleString("pt-BR")} palavras</span>
                      </span>
                    );
                  })()}
                </div>

                {/* Controles: Busca, Tamanho de Fonte, Layout e Ações */}
                <div className="flex items-center gap-2 flex-wrap ml-auto">
                  {/* Campo de Busca no Texto */}
                  <div className="relative flex items-center">
                    <Icon name="search" className="absolute left-2.5 text-xs text-[color:var(--on-surface-variant)] pointer-events-none" />
                    <input
                      type="text"
                      value={readerSearch}
                      onChange={(e) => setReaderSearch(e.target.value)}
                      placeholder="Filtrar texto..."
                      className="pl-7 pr-7 py-1.5 rounded-xl bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 text-xs text-[color:var(--on-surface)] outline-none focus:border-[color:var(--primary)] w-36 sm:w-44 transition-all"
                    />
                    {readerSearch && (
                      <button
                        onClick={() => setReaderSearch("")}
                        className="absolute right-2 text-xs text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]"
                      >
                        <Icon name="close" className="text-xs" />
                      </button>
                    )}
                  </div>

                  {/* Alternador de Modo de Transcrição para Vídeos */}
                  {ytVideoId && (
                    <div className="flex items-center bg-[color:var(--surface-container-low)] p-0.5 rounded-xl border border-[color:var(--outline-variant)]/20">
                      <button
                        onClick={() => setTranscriptMode("timeline")}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                          transcriptMode === "timeline"
                            ? "bg-[color:var(--primary)] text-white shadow-xs"
                            : "text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]"
                        }`}
                        title="Modo Linha do Tempo com Timestamps"
                      >
                        <Icon name="view_timeline" className="text-xs" />
                        <span className="hidden md:inline">Linha do Tempo</span>
                      </button>
                      <button
                        onClick={() => setTranscriptMode("fluid")}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                          transcriptMode === "fluid"
                            ? "bg-[color:var(--primary)] text-white shadow-xs"
                            : "text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]"
                        }`}
                        title="Modo Texto Fluido Contínuo"
                      >
                        <Icon name="article" className="text-xs" />
                        <span className="hidden md:inline">Texto Fluido</span>
                      </button>
                    </div>
                  )}

                  {/* Controle de Tamanho de Fonte */}
                  <div className="flex items-center bg-[color:var(--surface-container-low)] p-0.5 rounded-xl border border-[color:var(--outline-variant)]/20 text-xs font-bold">
                    <button
                      onClick={() => setReaderFontSize("small")}
                      className={`px-2 py-1 rounded-lg transition-all ${
                        readerFontSize === "small" ? "bg-[color:var(--primary)] text-white" : "text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]"
                      }`}
                      title="Fonte Pequena"
                    >
                      A-
                    </button>
                    <button
                      onClick={() => setReaderFontSize("base")}
                      className={`px-2 py-1 rounded-lg transition-all ${
                        readerFontSize === "base" ? "bg-[color:var(--primary)] text-white" : "text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]"
                      }`}
                      title="Fonte Padrão"
                    >
                      A
                    </button>
                    <button
                      onClick={() => setReaderFontSize("large")}
                      className={`px-2 py-1 rounded-lg transition-all ${
                        readerFontSize === "large" ? "bg-[color:var(--primary)] text-white" : "text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]"
                      }`}
                      title="Fonte Grande"
                    >
                      A+
                    </button>
                  </div>

                  {/* Botão Copiar Conteúdo */}
                  <button
                    onClick={() => handleCopyText(item.rawContent || item.summaryDetailed, ytVideoId ? "Transcrição" : "Artigo")}
                    className="p-1.5 px-2.5 rounded-xl bg-[color:var(--surface-container-low)] hover:bg-[color:var(--surface-container-high)] text-xs text-[color:var(--on-surface)] font-bold flex items-center gap-1 transition-colors border border-[color:var(--outline-variant)]/20"
                    title="Copiar texto completo para a área de transferência"
                  >
                    <Icon name="content_copy" className="text-xs" />
                    <span className="hidden sm:inline">Copiar</span>
                  </button>

                  {/* Botão Corrigir Formatação */}
                  <button
                    onClick={handleCleanReaderFormat}
                    disabled={isCleaningContent}
                    className="p-1.5 px-3 rounded-xl bg-[color:var(--primary)]/10 hover:bg-[color:var(--primary)] text-[color:var(--primary)] hover:text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border border-[color:var(--primary)]/30 shadow-xs"
                    title="Remover ruídos (pedidos de like, redes sociais, menus, propagandas) e limpar o texto no Reader"
                  >
                    <Icon name="auto_fix_high" className={`text-xs ${isCleaningContent ? "animate-spin" : ""}`} />
                    <span>{isCleaningContent ? "Formatando..." : "Corrigir Formatação"}</span>
                  </button>
                </div>
              </div>

              {/* ─── CONTEÚDO PRINCIPAL DO LEITOR ───────────────────────────────── */}
              {ytVideoId ? (
                /* Layout para Vídeos do YouTube */
                <div className="space-y-6">
                  {/* YouTube Embed Player */}
                  <div className="aspect-video w-full rounded-3xl overflow-hidden shadow-xl border border-[color:var(--outline-variant)]/30 bg-black">
                    <iframe
                      id="yt-player-frame"
                      src={`https://www.youtube.com/embed/${ytVideoId}?enablejsapi=1`}
                      title={item.title}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>

                  {/* Transcrição Formatada & Sincronizada */}
                  {item.rawContent ? (
                    <div className="p-6 md:p-8 rounded-3xl bg-[color:var(--surface)] border border-[color:var(--outline-variant)]/30 space-y-5 shadow-xs">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-[color:var(--outline-variant)]/20 pb-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <Icon name="subtitles" className="text-lg text-[color:var(--primary)]" />
                            <h4 className="font-bold text-sm text-[color:var(--on-surface)]">
                              Transcrição Completa da Fala
                            </h4>
                          </div>
                          <p className="text-xs text-[color:var(--on-surface-variant)] mt-0.5">
                            Clique em qualquer marcador de tempo para pular o vídeo até o ponto desejado.
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={handleCleanReaderFormat}
                            disabled={isCleaningContent}
                            className="px-3.5 py-2 rounded-xl bg-[color:var(--surface-container-high)] hover:bg-[color:var(--surface-container-highest)] text-[color:var(--on-surface)] text-xs font-bold flex items-center gap-1.5 border border-[color:var(--outline-variant)]/30 shadow-xs transition-all shrink-0 cursor-pointer"
                            title="Remover ruídos (pedidos de like, redes sociais) e corrigir a transcrição no Reader"
                          >
                            <Icon name="auto_fix_high" className={`text-xs text-[color:var(--primary)] ${isCleaningContent ? "animate-spin" : ""}`} />
                            <span>{isCleaningContent ? "Formatando..." : "Corrigir Formatação"}</span>
                          </button>
                          <button
                            onClick={handleRunAiSummarize}
                            disabled={isSummarizingWithAi}
                            className="px-4 py-2 rounded-xl bg-[color:var(--primary)] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs hover:opacity-90 transition-opacity shrink-0"
                          >
                            <Icon name="auto_awesome" className="text-sm" />
                            <span>Gerar Resumo para o Caderno</span>
                          </button>
                        </div>
                      </div>

                      {/* Renderização da Transcrição */}
                      {transcriptMode === "timeline" ? (
                        /* Modo Linha do Tempo: Parágrafos com timestamps clicáveis */
                        <div className="space-y-3 max-h-[520px] overflow-y-auto pr-2">
                          {item.rawContent
                            .split("\n\n")
                            .filter((para) => !readerSearch || para.toLowerCase().includes(readerSearch.toLowerCase()))
                            .map((para, pIdx) => {
                              const timeMatch = para.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*([\s\S]+)$/);
                              if (timeMatch) {
                                const label = timeMatch[1];
                                const text = timeMatch[2];
                                const parts = label.split(":").map(Number);
                                const totalSecs = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];

                                return (
                                  <div
                                    key={pIdx}
                                    className="flex items-start gap-3 p-3 rounded-2xl bg-[color:var(--surface-container-low)]/50 hover:bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/20 hover:border-[color:var(--primary)]/30 transition-all group"
                                  >
                                    <button
                                      onClick={() => handleSeekVideo(totalSecs)}
                                      className="px-2.5 py-1 rounded-lg bg-[color:var(--primary)]/15 text-[color:var(--primary)] font-mono text-[11px] font-bold group-hover:bg-[color:var(--primary)] group-hover:text-white transition-colors shrink-0 cursor-pointer flex items-center gap-1"
                                      title={`Pular vídeo para ${label}`}
                                    >
                                      <Icon name="play_arrow" className="text-xs" />
                                      <span>{label}</span>
                                    </button>
                                    <div className={`flex-1 pt-0.5 text-[color:var(--on-surface)] ${
                                      readerFontSize === "small" ? "text-xs leading-relaxed" : readerFontSize === "large" ? "text-base leading-relaxed" : "text-sm leading-relaxed"
                                    }`}>
                                      {renderReaderInline(text, readerSearch, handleSeekVideo)}
                                    </div>
                                  </div>
                                );
                              }

                              return (
                                <div key={pIdx} className={`p-2 text-[color:var(--on-surface)] leading-relaxed ${
                                  readerFontSize === "small" ? "text-xs" : readerFontSize === "large" ? "text-base" : "text-sm"
                                }`}>
                                  {renderReaderInline(para, readerSearch, handleSeekVideo)}
                                </div>
                              );
                            })}
                        </div>
                      ) : (
                        /* Modo Texto Fluido: Leitura contínua em formato artigo */
                        <div className="p-6 rounded-2xl bg-[color:var(--surface-container-low)]/30 max-h-[520px] overflow-y-auto">
                          <ReaderBodyRenderer
                            content={item.rawContent}
                            searchQuery={readerSearch}
                            onSeekVideo={handleSeekVideo}
                            fontSize={readerFontSize}
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-8 rounded-3xl bg-[color:var(--surface)] border border-[color:var(--outline-variant)]/30 text-center text-xs text-[color:var(--on-surface-variant)] italic">
                      Nenhuma transcrição foi capturada para este vídeo ainda.
                    </div>
                  )}
                </div>
              ) : (
                /* Layout para Artigos & Páginas Web (Leitor Imersivo Distraction-Free) */
                <div className="space-y-6">
                  <div className="p-8 md:p-12 rounded-3xl bg-[color:var(--surface)] border border-[color:var(--outline-variant)]/30 shadow-xs space-y-8">
                    {/* Cabeçalho Editorial do Artigo */}
                    <div className="border-b border-[color:var(--outline-variant)]/20 pb-6 space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="px-3 py-1 rounded-full bg-[color:var(--primary)]/10 text-[color:var(--primary)] text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                          <Icon name="article" className="text-xs" />
                          <span>{item.sourceHost || "Artigo Web"}</span>
                        </span>
                        {item.sourceUrl && (
                          <a
                            href={item.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-bold text-[color:var(--primary)] hover:underline"
                          >
                            <span>Visitar página original</span>
                            <Icon name="open_in_new" className="text-xs" />
                          </a>
                        )}
                      </div>

                      <h1 className="text-2xl md:text-3xl font-black text-[color:var(--on-surface)] tracking-tight leading-tight">
                        {item.title}
                      </h1>

                      <div className="flex items-center justify-between flex-wrap gap-3 pt-2">
                        <div className="flex items-center gap-2 text-xs text-[color:var(--on-surface-variant)]">
                          <span>Capturado em {new Date(item.capturedAt || Date.now()).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={handleCleanReaderFormat}
                            disabled={isCleaningContent}
                            className="px-3.5 py-2 rounded-xl bg-[color:var(--surface-container-high)] hover:bg-[color:var(--surface-container-highest)] text-[color:var(--on-surface)] text-xs font-bold flex items-center gap-1.5 border border-[color:var(--outline-variant)]/30 shadow-xs hover:border-[color:var(--primary)]/30 transition-all shrink-0 cursor-pointer"
                            title="Remover ruídos (pedidos de like, redes sociais, menus, propagandas) e formatar o artigo"
                          >
                            <Icon name="auto_fix_high" className={`text-xs text-[color:var(--primary)] ${isCleaningContent ? "animate-spin" : ""}`} />
                            <span>{isCleaningContent ? "Formatando..." : "Corrigir Formatação"}</span>
                          </button>
                          <button
                            onClick={handleRunAiSummarize}
                            disabled={isSummarizingWithAi}
                            className="px-4 py-2 rounded-xl bg-[color:var(--primary)] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs hover:opacity-90 transition-opacity"
                          >
                            <Icon name="auto_awesome" className="text-sm" />
                            <span>Gerar Resumo para o Caderno</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Corpo Formatado do Artigo */}
                    <div className="max-w-none">
                      <ReaderBodyRenderer
                        content={item.rawContent || item.summaryDetailed}
                        searchQuery={readerSearch}
                        onSeekVideo={handleSeekVideo}
                        fontSize={readerFontSize}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 3. ABA CHAT COM IA */}
          {activeTab === "chat" && (
            <div className="max-w-3xl mx-auto flex flex-col h-[520px] rounded-3xl bg-[color:var(--surface)] border border-[color:var(--outline-variant)]/30 overflow-hidden shadow-md">
              {/* Histórico do Chat */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {chatMessages.map((msg, idx) => {
                  const isUser = msg.role === "user";
                  return (
                    <div
                      key={idx}
                      className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
                    >
                      {!isUser && (
                        <div className="w-8 h-8 rounded-xl bg-[color:var(--primary)] text-white flex items-center justify-center text-sm font-black shrink-0">
                          <Icon name="smart_toy" />
                        </div>
                      )}
                      <div
                        className={`p-4 rounded-2xl max-w-[80%] text-xs leading-relaxed ${
                          isUser
                            ? "bg-[color:var(--primary)] text-white rounded-br-none"
                            : "bg-[color:var(--surface-container-low)] text-[color:var(--on-surface)] border border-[color:var(--outline-variant)]/30 rounded-bl-none shadow-xs"
                        }`}
                      >
                        <div className="whitespace-pre-line">{msg.text}</div>
                      </div>
                    </div>
                  );
                })}
                {isChatTyping && (
                  <div className="flex gap-3 items-center text-xs text-[color:var(--on-surface-variant)]">
                    <div className="w-8 h-8 rounded-xl bg-[color:var(--primary)]/20 text-[color:var(--primary)] flex items-center justify-center shrink-0 animate-pulse">
                      <Icon name="smart_toy" />
                    </div>
                    <div className="flex items-center gap-1.5 bg-[color:var(--surface-container-low)] px-4 py-2 rounded-xl">
                      <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--primary)] animate-ping" />
                      <span>Consultando IA Local...</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Formulário de Envio */}
              <form onSubmit={handleSendChatMessage} className="p-3 border-t border-[color:var(--outline-variant)]/20 bg-[color:var(--surface-container-low)] flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Pergunte sobre conceitos, exemplos de código ou tire dúvidas..."
                  className="flex-1 px-4 py-2.5 rounded-xl bg-[color:var(--surface)] border border-[color:var(--outline-variant)]/30 text-xs text-[color:var(--on-surface)] outline-none focus:border-[color:var(--primary)]"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || isChatTyping}
                  className="px-4 py-2.5 rounded-xl bg-[color:var(--primary)] text-white text-xs font-bold flex items-center gap-1.5 hover:opacity-90 disabled:opacity-50"
                >
                  <span>Enviar</span>
                  <Icon name="send" className="text-xs" />
                </button>
              </form>
            </div>
          )}

          {/* 4. ABA QUIZ (ESTUDO ATIVO E REPETIÇÃO ESPAÇADA) */}
          {activeTab === "quiz" && (
            <div className="max-w-3xl mx-auto space-y-6">
              
              {/* Header do Quiz */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-[color:var(--on-surface)]">
                    Quizzes de Repetição Espaçada
                  </h3>
                  <p className="text-xs text-[color:var(--on-surface-variant)]">
                    Teste seu conhecimento ativo com base nas anotações e transcrição.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleGenerateMoreQuizzes}
                    className="px-3.5 py-2 rounded-xl bg-[color:var(--surface-container-high)] hover:bg-[color:var(--surface-container-highest)] text-xs font-bold text-[color:var(--on-surface)] flex items-center gap-1.5 transition-colors"
                  >
                    <Icon name="auto_awesome" className="text-sm text-[color:var(--primary)]" />
                    <span>Gerar Mais Perguntas</span>
                  </button>

                  {(item.quizzes || []).length > 0 && !isQuizPlayerActive && (
                    <button
                      onClick={() => {
                        setIsQuizPlayerActive(true);
                        setQuizPlayerIndex(0);
                        setSelectedOption(null);
                        setIsAnswerSubmitted(false);
                      }}
                      className="px-4 py-2 rounded-xl bg-[color:var(--primary)] text-white text-xs font-bold shadow-xs hover:opacity-90 flex items-center gap-1.5"
                    >
                      <Icon name="play_arrow" className="text-sm" />
                      <span>Iniciar Simulado</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Player do Quiz */}
              {isQuizPlayerActive && (item.quizzes || []).length > 0 ? (
                (() => {
                  const currentQuiz = item.quizzes[quizPlayerIndex];
                  if (!currentQuiz) return null;

                  return (
                    <div className="p-8 rounded-3xl bg-[color:var(--surface)] border border-[color:var(--outline-variant)]/30 space-y-6 shadow-md">
                      <div className="flex items-center justify-between border-b border-[color:var(--outline-variant)]/20 pb-4">
                        <span className="text-xs font-bold text-[color:var(--primary)] uppercase tracking-wider">
                          Questão {quizPlayerIndex + 1} de {item.quizzes.length}
                        </span>
                        <span className="px-2.5 py-1 rounded-full bg-[color:var(--surface-container-high)] text-[10px] font-bold text-[color:var(--on-surface-variant)]">
                          {currentQuiz.difficulty || "Médio"}
                        </span>
                      </div>

                      <h4 className="text-base font-bold text-[color:var(--on-surface)] leading-relaxed">
                        {currentQuiz.question}
                      </h4>

                      <div className="space-y-2.5">
                        {currentQuiz.options.map((opt, oIdx) => {
                          let optStyle = "bg-[color:var(--surface-container-low)] border-[color:var(--outline-variant)]/30 text-[color:var(--on-surface)] hover:border-[color:var(--primary)]";

                          if (isAnswerSubmitted) {
                            if (oIdx === currentQuiz.answerIndex) {
                              optStyle = "bg-emerald-500/15 border-emerald-500 text-emerald-600 font-bold";
                            } else if (selectedOption === oIdx) {
                              optStyle = "bg-rose-500/15 border-rose-500 text-rose-600 font-bold";
                            } else {
                              optStyle = "opacity-40 border-transparent";
                            }
                          } else if (selectedOption === oIdx) {
                            optStyle = "bg-[color:var(--primary)]/10 border-[color:var(--primary)] text-[color:var(--primary)] font-bold";
                          }

                          return (
                            <button
                              key={oIdx}
                              disabled={isAnswerSubmitted}
                              onClick={() => setSelectedOption(oIdx)}
                              className={`w-full p-4 rounded-2xl border text-xs text-left transition-all flex items-center justify-between ${optStyle}`}
                            >
                              <span>{opt}</span>
                              {isAnswerSubmitted && oIdx === currentQuiz.answerIndex && (
                                <Icon name="check_circle" className="text-emerald-500 text-lg" />
                              )}
                              {isAnswerSubmitted && selectedOption === oIdx && oIdx !== currentQuiz.answerIndex && (
                                <Icon name="cancel" className="text-rose-500 text-lg" />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {isAnswerSubmitted && currentQuiz.explanation && (
                        <div className="p-4 rounded-2xl bg-[color:var(--surface-container-high)] text-xs text-[color:var(--on-surface-variant)] leading-relaxed space-y-1">
                          <div className="font-bold text-[color:var(--on-surface)] flex items-center gap-1.5">
                            <Icon name="info" className="text-sm text-[color:var(--primary)]" />
                            <span>Explicação:</span>
                          </div>
                          <p>{currentQuiz.explanation}</p>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-4 border-t border-[color:var(--outline-variant)]/20">
                        <button
                          onClick={() => setIsQuizPlayerActive(false)}
                          className="text-xs text-[color:var(--on-surface-variant)] hover:underline"
                        >
                          Sair do Simulado
                        </button>

                        {!isAnswerSubmitted ? (
                          <button
                            disabled={selectedOption === null}
                            onClick={() => {
                              setIsAnswerSubmitted(true);
                              const isCorrect = selectedOption === currentQuiz.answerIndex;
                              answerKnowledgeQuiz(item.id, currentQuiz.id, isCorrect ? 5 : 2);
                            }}
                            className="px-6 py-2.5 rounded-xl bg-[color:var(--primary)] text-white font-bold text-xs shadow-xs hover:opacity-90 disabled:opacity-50"
                          >
                            Confirmar Resposta
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              if (quizPlayerIndex + 1 < item.quizzes.length) {
                                setQuizPlayerIndex((prev) => prev + 1);
                              } else {
                                setIsQuizPlayerActive(false);
                              }
                              setSelectedOption(null);
                              setIsAnswerSubmitted(false);
                            }}
                            className="px-6 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-500 transition-all shadow-xs flex items-center gap-1.5"
                          >
                            <span>Próxima Questão</span>
                            <Icon name="arrow_forward" className="text-sm" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()
              ) : (item.quizzes || []).length === 0 ? (
                /* Estado Vazio: Nenhum Quiz Criado Ainda */
                <div className="p-12 text-center rounded-3xl bg-[color:var(--surface)] border border-[color:var(--outline-variant)]/30 space-y-4 shadow-xs">
                  <div className="w-14 h-14 rounded-2xl bg-[color:var(--primary)]/10 text-[color:var(--primary)] mx-auto flex items-center justify-center text-3xl font-bold">
                    <Icon name="quiz" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-bold text-sm text-[color:var(--on-surface)]">
                      Nenhum Quiz Criado Ainda
                    </h4>
                    <p className="text-xs text-[color:var(--on-surface-variant)] max-w-md mx-auto leading-relaxed">
                      Os quizzes não são criados automaticamente para manter seu material limpo. Clique abaixo caso queira gerar perguntas para praticar repetição espaçada.
                    </p>
                  </div>
                  <button
                    onClick={handleGenerateMoreQuizzes}
                    className="px-5 py-2.5 rounded-xl bg-[color:var(--primary)] text-white text-xs font-bold shadow-xs hover:opacity-90 transition-opacity inline-flex items-center gap-2 cursor-pointer"
                  >
                    <Icon name="auto_awesome" className="text-sm" />
                    <span>Gerar Perguntas com IA</span>
                  </button>
                </div>
              ) : (
                /* Tabela de Questões */
                <div className="rounded-2xl bg-[color:var(--surface)] border border-[color:var(--outline-variant)]/30 overflow-hidden shadow-xs">
                  <div className="grid grid-cols-12 gap-2 p-3 bg-[color:var(--surface-container-low)] text-[10px] font-black uppercase tracking-wider text-[color:var(--on-surface-variant)] border-b border-[color:var(--outline-variant)]/20">
                    <div className="col-span-7">Pergunta</div>
                    <div className="col-span-2 text-center">Dificuldade</div>
                    <div className="col-span-2 text-center">Repetição</div>
                    <div className="col-span-1 text-right">Ações</div>
                  </div>
                  <div className="divide-y divide-[color:var(--outline-variant)]/20">
                    {(item.quizzes || []).map((q, idx) => {
                      const isDue = !q.dueDate || q.dueDate <= Date.now();
                      return (
                        <div key={q.id || idx} className="grid grid-cols-12 gap-2 p-3.5 items-center text-xs hover:bg-[color:var(--surface-container-low)]/50 transition-colors group">
                          <div className="col-span-7 font-medium text-[color:var(--on-surface)] truncate" title={q.question}>
                            {q.question}
                          </div>
                          <div className="col-span-2 text-center">
                            <span className="px-2 py-0.5 rounded-full bg-[color:var(--surface-container-high)] text-[10px] font-semibold text-[color:var(--on-surface-variant)]">
                              {q.difficulty}
                            </span>
                          </div>
                          <div className="col-span-2 text-center">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isDue ? "bg-emerald-500/15 text-emerald-600" : "bg-[color:var(--surface-container-high)] text-[color:var(--on-surface-variant)]"}`}>
                              {isDue ? "Hoje" : "Em dia"}
                            </span>
                          </div>
                          <div className="col-span-1 text-right flex items-center justify-end">
                            <button
                              onClick={() => deleteQuizFromKnowledgeItem(item.id, q.id)}
                              className="p-1.5 rounded-lg text-[color:var(--on-surface-variant)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                              title="Excluir esta questão"
                            >
                              <Icon name="delete" className="text-sm" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
