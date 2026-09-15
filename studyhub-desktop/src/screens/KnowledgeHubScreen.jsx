import React, { useState, useMemo, useEffect } from "react";
import { Icon } from "../ui/Icon";
import { SCREEN_IDS } from "../app/screenIds";
import { useStudyStore } from "../store/useStore";
import { shortcutLabel } from "../utils/keyboardShortcuts";
import {
  extractYouTubeVideoId,
  fetchYouTubeDetails,
  generateContentSummary,
  generateContentQuizzes,
  checkLocalAiStatus,
} from "../domain/localAiEngine";

export function KnowledgeHubScreen({ onNavigate }) {
  const store = useStudyStore();
  const knowledgeItems = useStudyStore((state) => state.knowledgeItems || []);
  const addKnowledgeItem = useStudyStore((state) => state.addKnowledgeItem);
  const deleteKnowledgeItem = useStudyStore((state) => state.deleteKnowledgeItem);
  const setActiveKnowledgeItemId = useStudyStore((state) => state.setActiveKnowledgeItemId);
  const courses = useStudyStore((state) => state.courses || []);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState("ALL");
  const [selectedSource, setSelectedSource] = useState("ALL");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addModalTab, setAddModalTab] = useState("link"); // "link" | "note" | "wiki" | "pdf"
  const [isProcessing, setIsProcessing] = useState(false);
  const [aiStatus, setAiStatus] = useState({ online: false, models: [] });

  // Form states
  const [inputUrl, setInputUrl] = useState("");
  const [inputTitle, setInputTitle] = useState("");
  const [inputContent, setInputContent] = useState("");
  const [inputTags, setInputTags] = useState("");

  useEffect(() => {
    checkLocalAiStatus().then(setAiStatus);
  }, []);

  // Atalhos de Teclado e Eventos Globais
  useEffect(() => {
    const handleQuickCapture = () => setIsAddModalOpen(true);
    window.addEventListener("studyhub-open-quick-capture", handleQuickCapture);

    const handleKeyDown = (e) => {
      // Cmd/Ctrl+Shift+K abre o modal de adição rápida no Hub
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsAddModalOpen(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        const searchInput = document.getElementById("knowledge-search-input");
        if (searchInput) searchInput.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("studyhub-open-quick-capture", handleQuickCapture);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Coleta todas as tags únicas e suas contagens
  const tagCounts = useMemo(() => {
    const counts = {};
    knowledgeItems.forEach((item) => {
      (item.tags || []).forEach((tag) => {
        const clean = tag.toLowerCase().trim();
        counts[clean] = (counts[clean] || 0) + 1;
      });
    });
    return counts;
  }, [knowledgeItems]);

  const allTags = Object.keys(tagCounts).sort((a, b) => a.localeCompare(b, "pt-BR"));

  // Filtra itens
  const filteredItems = useMemo(() => {
    return knowledgeItems.filter((item) => {
      const matchSearch =
        searchQuery === "" ||
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.tags || []).some((t) => t.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.sourceHost || "").toLowerCase().includes(searchQuery.toLowerCase());

      const matchTag =
        selectedTag === "ALL" ||
        (item.tags || []).map((t) => t.toLowerCase()).includes(selectedTag.toLowerCase());

      const matchSource =
        selectedSource === "ALL" ||
        item.sourceType === selectedSource;

      return matchSearch && matchTag && matchSource;
    });
  }, [knowledgeItems, searchQuery, selectedTag, selectedSource]);

  // Agrupa itens por data formatada
  const groupedByDate = useMemo(() => {
    const groups = {};
    filteredItems.forEach((item) => {
      const date = new Date(item.capturedAt || Date.now());
      const now = new Date();
      const isToday = date.toDateString() === now.toDateString();
      
      const yesterday = new Date();
      yesterday.setDate(now.getDate() - 1);
      const isYesterday = date.toDateString() === yesterday.toDateString();

      let label;
      if (isToday) {
        label = `Hoje (${date.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short", year: "numeric" })})`;
      } else if (isYesterday) {
        label = `Ontem (${date.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short", year: "numeric" })})`;
      } else {
        label = date.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
      }

      if (!groups[label]) groups[label] = [];
      groups[label].push(item);
    });
    return groups;
  }, [filteredItems]);

  // Submissão do modal de adição rápida
  const handleQuickAdd = async (e) => {
    e.preventDefault();
    if (addModalTab === "link" && !inputUrl) return;
    if (addModalTab === "note" && !inputTitle) return;

    setIsProcessing(true);

    let title = inputTitle;
    let url = inputUrl;
    let rawContent = inputContent;
    let sourceType = "web";
    let sourceHost = "WEB";
    let thumbnailUrl = "";
    let timestamps = [];

    const parsedTags = inputTags
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    // Processamento de Link / YouTube
    if (addModalTab === "link") {
      const ytId = extractYouTubeVideoId(url);
      if (ytId) {
        sourceType = "youtube";
        sourceHost = "YOUTUBE.COM";
        thumbnailUrl = `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`;
        const ytDetails = await fetchYouTubeDetails(ytId);
        if (ytDetails) {
          if (!title) title = ytDetails.title;
          if (ytDetails.thumbnailUrl) thumbnailUrl = ytDetails.thumbnailUrl;
        }
        if (!title) title = "Vídeo do YouTube";
        timestamps = [
          { time: 0, label: "00:00", text: "Introdução do vídeo" },
          { time: 60, label: "01:00", text: "Conceito principal" },
          { time: 180, label: "03:00", text: "Exemplos e demonstração" },
        ];
      } else {
        try {
          const u = new URL(url);
          sourceHost = u.hostname.replace("www.", "").toUpperCase();
          if (sourceHost.includes("WIKIPEDIA")) sourceType = "wikipedia";
        } catch {
          sourceHost = "LINK";
        }
        if (!title) title = url;
        thumbnailUrl = "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=600&auto=format&fit=crop&q=80";
      }
    } else if (addModalTab === "note") {
      sourceType = "note";
      sourceHost = "NOTE";
    }

    // Gera resumos via IA Local
    const { concise, detailed } = await generateContentSummary(title, rawContent || title, sourceType);

    const newItem = {
      id: `kitem-${Date.now()}`,
      title,
      sourceUrl: url,
      sourceType,
      sourceHost,
      thumbnailUrl,
      capturedAt: Date.now(),
      rawContent,
      summaryConcise: concise,
      summaryDetailed: detailed,
      timestamps,
      markdownNotes: "",
      tags: parsedTags.length > 0 ? parsedTags : ["geral"],
      quizzes: [],
    };

    addKnowledgeItem(newItem);
    setIsProcessing(false);
    setIsAddModalOpen(false);
    setInputUrl("");
    setInputTitle("");
    setInputContent("");
    setInputTags("");
  };

  const handleOpenItem = (itemId) => {
    setActiveKnowledgeItemId(itemId);
    onNavigate && onNavigate(SCREEN_IDS.KNOWLEDGE_ITEM_DETAIL);
  };

  return (
    <div className="flex w-full h-full bg-[color:var(--background)] text-[color:var(--on-surface)] overflow-hidden">
      
      {/* ─── BARRA LATERAL: TÓPICOS & TAGS ─────────────────────────────────── */}
      <aside className="w-64 border-r border-[color:var(--outline-variant)]/30 bg-[color:var(--surface-container-low)] flex flex-col h-full shrink-0">
        <div className="p-4 border-b border-[color:var(--outline-variant)]/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon name="hub" className="text-[20px] text-[color:var(--primary)]" />
            <span className="font-bold text-sm tracking-tight">Tópicos & Tags</span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[color:var(--surface-container-highest)] font-bold text-[color:var(--on-surface-variant)]">
            {knowledgeItems.length} itens
          </span>
        </div>

        {/* Lista de Tags */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          <button
            onClick={() => setSelectedTag("ALL")}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
              selectedTag === "ALL"
                ? "bg-[color:var(--primary)] text-white shadow-sm"
                : "text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-container)] hover:text-[color:var(--on-surface)]"
            }`}
          >
            <div className="flex items-center gap-2">
              <Icon name="folder" className="text-sm" />
              <span>Todos os Conteúdos</span>
            </div>
            <span className="text-[10px] opacity-75">{knowledgeItems.length}</span>
          </button>

          {allTags.map((tag) => {
            const isSelected = selectedTag === tag;
            const count = tagCounts[tag];
            return (
              <div key={tag} className="space-y-0.5">
                <button
                  onClick={() => setSelectedTag(isSelected ? "ALL" : tag)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                    isSelected
                      ? "bg-[color:var(--surface-container-high)] text-[color:var(--primary)] font-bold"
                      : "text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-container)] hover:text-[color:var(--on-surface)]"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-xs opacity-60">#</span>
                    <span className="truncate">{tag}</span>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-[color:var(--surface-container-lowest)] text-[color:var(--on-surface-variant)] font-mono">
                    {count}
                  </span>
                </button>

                {/* Sub-itens quando a tag está ativa */}
                {isSelected && (
                  <div className="pl-4 pr-1 py-1 space-y-1">
                    {knowledgeItems
                      .filter((item) => (item.tags || []).map(t => t.toLowerCase()).includes(tag))
                      .map((item) => (
                        <button
                          key={item.id}
                          onClick={() => handleOpenItem(item.id)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-container-highest)] hover:text-[color:var(--on-surface)] truncate text-left transition-colors"
                        >
                          <span className="w-4 h-4 rounded-full bg-[color:var(--primary)]/10 text-[color:var(--primary)] flex items-center justify-center text-[9px] font-bold shrink-0">
                            {item.title.charAt(0).toUpperCase()}
                          </span>
                          <span className="truncate">{item.title}</span>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Status da IA Local */}
        <div className="p-3 border-t border-[color:var(--outline-variant)]/20 bg-[color:var(--surface-container-lowest)]/50">
          <div className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${aiStatus.online ? "bg-emerald-500 animate-pulse" : "bg-orange-400"}`} />
              <span className="font-semibold text-[color:var(--on-surface)]">
                {aiStatus.online ? "IA Local (Ollama) Ativa" : "Modo Offline / Heurístico"}
              </span>
            </div>
            {aiStatus.online && aiStatus.models.length > 0 && (
              <span className="text-[10px] text-[color:var(--on-surface-variant)] font-mono">
                {aiStatus.models[0].split(":")[0]}
              </span>
            )}
          </div>
        </div>
      </aside>

      {/* ─── FEED PRINCIPAL & CABEÇALHO ────────────────────────────────────── */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-[color:var(--background)]">
        
        {/* Top Header */}
        <header className="px-6 py-4 border-b border-[color:var(--outline-variant)]/20 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-[color:var(--surface)]">
          <div className="flex items-center gap-3 flex-1 max-w-xl">
            <div className="relative flex-1">
              <Icon name="search" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-[color:var(--outline)]" />
              <input
                id="knowledge-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Buscar no seu conhecimento... (${shortcutLabel("Mod+/")})`}
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/40 text-xs text-[color:var(--on-surface)] outline-none focus:border-[color:var(--primary)] transition-all"
              />
            </div>

            {/* Filtro de Fonte */}
            <div className="flex items-center gap-1.5">
              {[
                { id: "ALL", label: "Todas as Fontes" },
                { id: "youtube", label: "YouTube" },
                { id: "web", label: "Web/Artigos" },
                { id: "note", label: "Notas" },
              ].map((src) => (
                <button
                  key={src.id}
                  onClick={() => setSelectedSource(src.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    selectedSource === src.id
                      ? "bg-[color:var(--primary)] text-white shadow-xs"
                      : "text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-container-high)]"
                  }`}
                >
                  {src.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-[color:var(--primary)] text-white text-xs font-bold shadow-sm hover:opacity-90 active:scale-95 transition-all flex items-center gap-2"
            >
              <Icon name="add" className="text-base" />
              <span>+ Adicionar ({shortcutLabel("Mod+Shift+K")})</span>
            </button>
          </div>
        </header>

        {/* Feed de Cards Agrupados por Data */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-10">
          
          {Object.keys(groupedByDate).length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[460px] p-6 text-center max-w-sm mx-auto">
              <div className="w-full max-w-[280px] p-3.5 rounded-3xl bg-[color:var(--surface)] border border-[color:var(--outline-variant)] shadow-xl">
                <div className="grid grid-cols-2 gap-3 aspect-square">
                  <button
                    type="button"
                    onClick={() => { setAddModalTab("link"); setIsAddModalOpen(true); }}
                    className="flex flex-col items-center justify-center p-3 rounded-2xl bg-[color:var(--surface-container-low)] hover:bg-[color:var(--surface-container-high)] border border-[color:var(--outline-variant)]/60 text-center transition-all group cursor-pointer hover:border-[color:var(--primary)]/60 active:scale-95 shadow-xs"
                  >
                    <Icon name="link" className="text-2xl text-[color:var(--on-surface-variant)] group-hover:text-[color:var(--primary)] group-hover:scale-110 transition-all mb-2" />
                    <span className="text-[11px] font-black tracking-wider uppercase text-[color:var(--on-surface)]">ADD LINK</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setAddModalTab("note"); setIsAddModalOpen(true); }}
                    className="flex flex-col items-center justify-center p-3 rounded-2xl bg-[color:var(--surface-container-low)] hover:bg-[color:var(--surface-container-high)] border border-[color:var(--outline-variant)]/60 text-center transition-all group cursor-pointer hover:border-[color:var(--primary)]/60 active:scale-95 shadow-xs"
                  >
                    <Icon name="edit_note" className="text-2xl text-[color:var(--on-surface-variant)] group-hover:text-[color:var(--primary)] group-hover:scale-110 transition-all mb-2" />
                    <span className="text-[11px] font-black tracking-wider uppercase text-[color:var(--on-surface)]">WRITE NOTE</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setAddModalTab("wiki"); setIsAddModalOpen(true); }}
                    className="flex flex-col items-center justify-center p-3 rounded-2xl bg-[color:var(--surface-container-low)] hover:bg-[color:var(--surface-container-high)] border border-[color:var(--outline-variant)]/60 text-center transition-all group cursor-pointer hover:border-[color:var(--primary)]/60 active:scale-95 shadow-xs"
                  >
                    <Icon name="public" className="text-2xl text-[color:var(--on-surface-variant)] group-hover:text-[color:var(--primary)] group-hover:scale-110 transition-all mb-2" />
                    <span className="text-[11px] font-black tracking-wider uppercase text-[color:var(--on-surface)]">WIKIPEDIA</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setAddModalTab("pdf"); setIsAddModalOpen(true); }}
                    className="flex flex-col items-center justify-center p-3 rounded-2xl bg-[color:var(--surface-container-low)] hover:bg-[color:var(--surface-container-high)] border border-[color:var(--outline-variant)]/60 text-center transition-all group cursor-pointer hover:border-[color:var(--primary)]/60 active:scale-95 shadow-xs"
                  >
                    <Icon name="picture_as_pdf" className="text-2xl text-[color:var(--on-surface-variant)] group-hover:text-[color:var(--primary)] group-hover:scale-110 transition-all mb-2" />
                    <span className="text-[11px] font-black tracking-wider uppercase text-[color:var(--on-surface)]">PDF</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            Object.entries(groupedByDate).map(([dateLabel, items]) => (
              <section key={dateLabel} className="space-y-4">
                
                {/* Cabeçalho da Data */}
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-bold text-[color:var(--on-surface)] tracking-wide">
                    {dateLabel}
                  </h3>
                  <div className="flex-1 h-px bg-[color:var(--outline-variant)]/20" />
                </div>

                {/* Grid de Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  
                  {/* Cards de Ação Rápida no primeiro grupo */}
                  {dateLabel.includes("Hoje") && (
                    <div className="grid grid-cols-2 gap-2.5 p-3 rounded-2xl bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/40 h-[220px]">
                      <button
                        onClick={() => { setAddModalTab("link"); setIsAddModalOpen(true); }}
                        className="flex flex-col items-center justify-center p-2 rounded-xl bg-[color:var(--surface)] hover:bg-[color:var(--surface-container-high)] border border-[color:var(--outline-variant)]/30 text-center transition-all group"
                      >
                        <Icon name="link" className="text-xl text-[color:var(--primary)] group-hover:scale-110 transition-transform mb-1" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--on-surface)]">ADD LINK</span>
                      </button>
                      
                      <button
                        onClick={() => { setAddModalTab("note"); setIsAddModalOpen(true); }}
                        className="flex flex-col items-center justify-center p-2 rounded-xl bg-[color:var(--surface)] hover:bg-[color:var(--surface-container-high)] border border-[color:var(--outline-variant)]/30 text-center transition-all group"
                      >
                        <Icon name="edit_note" className="text-xl text-[color:var(--primary)] group-hover:scale-110 transition-transform mb-1" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--on-surface)]">WRITE NOTE</span>
                      </button>

                      <button
                        onClick={() => { setAddModalTab("wiki"); setIsAddModalOpen(true); }}
                        className="flex flex-col items-center justify-center p-2 rounded-xl bg-[color:var(--surface)] hover:bg-[color:var(--surface-container-high)] border border-[color:var(--outline-variant)]/30 text-center transition-all group"
                      >
                        <Icon name="public" className="text-xl text-[color:var(--primary)] group-hover:scale-110 transition-transform mb-1" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--on-surface)]">WIKIPEDIA</span>
                      </button>

                      <button
                        onClick={() => { setAddModalTab("pdf"); setIsAddModalOpen(true); }}
                        className="flex flex-col items-center justify-center p-2 rounded-xl bg-[color:var(--surface)] hover:bg-[color:var(--surface-container-high)] border border-[color:var(--outline-variant)]/30 text-center transition-all group"
                      >
                        <Icon name="picture_as_pdf" className="text-xl text-[color:var(--primary)] group-hover:scale-110 transition-transform mb-1" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--on-surface)]">PDF</span>
                      </button>
                    </div>
                  )}

                  {/* Cards de Conteúdo */}
                  {items.map((item) => {
                    const dueQuizzesCount = (item.quizzes || []).filter(q => !q.dueDate || q.dueDate <= Date.now()).length;
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleOpenItem(item.id)}
                        className="group relative rounded-2xl bg-[color:var(--surface)] border border-[color:var(--outline-variant)]/40 hover:border-[color:var(--primary)]/60 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer overflow-hidden flex flex-col h-[220px]"
                      >
                        {/* Imagem / Capa Superior */}
                        <div className="h-28 bg-[color:var(--surface-container-highest)] relative overflow-hidden flex items-center justify-center shrink-0">
                          {item.thumbnailUrl ? (
                            <img
                              src={item.thumbnailUrl}
                              alt={item.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center text-[color:var(--on-surface-variant)] opacity-40">
                              <Icon name={item.sourceType === "youtube" ? "play_circle" : "article"} className="text-3xl" />
                            </div>
                          )}

                          {/* Badge de Fonte */}
                          <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-xs text-[9px] font-black uppercase tracking-wider text-white">
                            {item.sourceHost || item.sourceType}
                          </span>

                          {/* Badge de Quizzes Pendentes */}
                          {dueQuizzesCount > 0 && (
                            <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-emerald-600 text-[9px] font-black text-white shadow-xs">
                              {dueQuizzesCount} quiz
                            </span>
                          )}
                        </div>

                        {/* Corpo do Card */}
                        <div className="p-3 flex flex-col justify-between flex-1">
                          <h4 className="font-bold text-xs text-[color:var(--on-surface)] line-clamp-2 leading-snug group-hover:text-[color:var(--primary)] transition-colors">
                            {item.title}
                          </h4>

                          {/* Tags na Base */}
                          <div className="flex items-center justify-between gap-1 mt-auto pt-2">
                            <div className="flex items-center gap-1 overflow-hidden">
                              {(item.tags || []).slice(0, 2).map((tag) => (
                                <span
                                  key={tag}
                                  className="px-1.5 py-0.5 rounded bg-[color:var(--surface-container)] text-[9px] font-semibold text-[color:var(--on-surface-variant)] truncate max-w-[80px]"
                                >
                                  #{tag}
                                </span>
                              ))}
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(`Excluir "${item.title}"?`)) {
                                  deleteKnowledgeItem(item.id);
                                }
                              }}
                              className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded flex items-center justify-center text-[color:var(--on-surface-variant)] hover:text-[color:var(--error)] transition-all"
                              title="Excluir item"
                            >
                              <Icon name="delete" className="text-sm" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      </main>

      {/* ─── MODAL DE ADIÇÃO RÁPIDA (CTRL+K) ─────────────────────────────────── */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-[color:var(--surface)] border border-[color:var(--outline-variant)] rounded-3xl p-6 shadow-2xl w-full max-w-lg text-[color:var(--on-surface)]">
            
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Icon name="bolt" className="text-xl text-[color:var(--primary)]" />
                <h3 className="text-base font-bold">Captura Rápida de Conhecimento</h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="w-8 h-8 rounded-xl hover:bg-[color:var(--surface-container-high)] text-[color:var(--on-surface-variant)] flex items-center justify-center"
              >
                <Icon name="close" className="text-base" />
              </button>
            </div>

            {/* Abas do Modal */}
            <div className="flex items-center gap-1.5 p-1 bg-[color:var(--surface-container-low)] rounded-xl mb-4">
              {[
                { id: "link", label: "Link / YouTube", icon: "link" },
                { id: "note", label: "Nota Rápida", icon: "edit_note" },
                { id: "wiki", label: "Wikipedia", icon: "public" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setAddModalTab(tab.id)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    addModalTab === tab.id
                      ? "bg-[color:var(--surface)] text-[color:var(--primary)] shadow-xs"
                      : "text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]"
                  }`}
                >
                  <Icon name={tab.icon} className="text-sm" />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            <form onSubmit={handleQuickAdd} className="space-y-3.5">
              {addModalTab === "link" && (
                <div>
                  <label className="block text-xs font-semibold text-[color:var(--on-surface-variant)] mb-1">
                    URL do Vídeo ou Artigo
                  </label>
                  <input
                    type="url"
                    required
                    placeholder="https://youtube.com/watch?v=... ou https://medium.com/..."
                    value={inputUrl}
                    onChange={(e) => setInputUrl(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)] text-xs text-[color:var(--on-surface)] outline-none focus:border-[color:var(--primary)]"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[color:var(--on-surface-variant)] mb-1">
                  Título {addModalTab === "link" && "(opcional - inferido automaticamente)"}
                </label>
                <input
                  type="text"
                  placeholder="Ex: Delegates in C# - Conceitos e Exemplos"
                  value={inputTitle}
                  onChange={(e) => setInputTitle(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)] text-xs text-[color:var(--on-surface)] outline-none focus:border-[color:var(--primary)]"
                />
              </div>

              {addModalTab === "note" && (
                <div>
                  <label className="block text-xs font-semibold text-[color:var(--on-surface-variant)] mb-1">
                    Conteúdo da Anotação (Markdown)
                  </label>
                  <textarea
                    rows={4}
                    placeholder="Escreva suas anotações, resumo ou cole o texto aqui..."
                    value={inputContent}
                    onChange={(e) => setInputContent(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)] text-xs text-[color:var(--on-surface)] outline-none focus:border-[color:var(--primary)]"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[color:var(--on-surface-variant)] mb-1">
                  Tags (separadas por vírgula)
                </label>
                <input
                  type="text"
                  placeholder="csharp, delegates, poo"
                  value={inputTags}
                  onChange={(e) => setInputTags(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)] text-xs text-[color:var(--on-surface)] outline-none focus:border-[color:var(--primary)]"
                />
              </div>

              <div className="pt-3 flex items-center justify-between border-t border-[color:var(--outline-variant)]/30">
                <span className="text-[11px] text-[color:var(--on-surface-variant)] flex items-center gap-1.5">
                  <Icon name="auto_awesome" className="text-sm text-[color:var(--primary)]" />
                  Gera resumos e quizzes com IA Local
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-container-high)]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="px-5 py-2 rounded-xl bg-[color:var(--primary)] text-white text-xs font-bold hover:opacity-90 active:scale-95 transition-all shadow-sm flex items-center gap-2"
                  >
                    {isProcessing ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Processando com IA...</span>
                      </>
                    ) : (
                      <>
                        <Icon name="check" className="text-sm" />
                        <span>Adicionar ao Hub</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
