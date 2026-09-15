import { useEffect, useState, useMemo, useCallback } from "react";
import { Icon } from "../ui/Icon";
import { SCREEN_IDS } from "../app/screenIds";
import { useStudyStore } from "../store/useStore";
import { AppSelect } from "../components/AppSelect";
import { VocabTextRenderer } from "../components/VocabTextRenderer";

export function FlashcardsScreen({ onNavigate }) {
  const activeDeckId = useStudyStore((state) => state.activeDeckId);
  const setActiveDeck = useStudyStore((state) => state.setActiveDeck);
  const flashcardDecks = useStudyStore((state) => state.flashcardDecks || []);
  const deleteFlashcardDeck = useStudyStore((state) => state.deleteFlashcardDeck);
  const reviewFlashcard = useStudyStore((state) => state.reviewFlashcard);
  const knowledgeItems = useStudyStore((state) => state.knowledgeItems || []);
  const answerKnowledgeQuiz = useStudyStore((state) => state.answerKnowledgeQuiz);
  const setActiveKnowledgeItemId = useStudyStore((state) => state.setActiveKnowledgeItemId);
  const courses = useStudyStore((state) => state.courses || []);
  const speakCardText = useCallback(async (text) => {
    const value = String(text || "").trim();
    if (!value) return;
    const portugueseHint = /\b(que|não|para|com|uma|dos|das|como|sobre|estudar|resposta|pergunta|sistema|função|classe|exemplo)\b/i.test(value) || /[ãõáéíóúç]/i.test(value);
    const language = portugueseHint ? "pt-BR" : "en-US";
    const result = await window.studyhubDesktop?.translator?.speak?.({ text: value, language });
    if (result?.audioBase64) {
      const audio = new Audio(`data:${result.mimeType || "audio/wav"};base64,${result.audioBase64}`);
      await audio.play().catch(() => {});
      return;
    }
    // The native provider may return ok without Base64 (macOS `say` plays in
    // the main process). Do not start a second browser voice in that case.
    if (result?.ok) return;
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(value);
      utterance.lang = language;
      utterance.voice = (window.speechSynthesis.getVoices?.() || []).find((voice) => voice.lang?.toLowerCase().startsWith(language.toLowerCase())) || null;
      window.speechSynthesis.speak(utterance);
    }
  }, []);
  
  const [isFlipped, setIsFlipped] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("ALL");
  const [filterTag, setFilterTag] = useState("ALL");
  const [studyAheadMode, setStudyAheadMode] = useState(false);
  const [studyAheadIndex, setStudyAheadIndex] = useState(0);

  // Modo de revisão de um item de Quiz específico
  const [activeQuizItemId, setActiveQuizItemId] = useState(null);
  const [selectedQuizOption, setSelectedQuizOption] = useState(null);
  const [isQuizSubmitted, setIsQuizSubmitted] = useState(false);

  // Modo de revisão global (todos os baralhos e quizzes de hoje)
  const [isGlobalReview, setIsGlobalReview] = useState(false);
  const [globalReviewIndex, setGlobalReviewIndex] = useState(0);
  const [globalReviewedCount, setGlobalReviewedCount] = useState(0);

  // ─── 1. Lista de todos os cartões e quizzes pendentes para hoje ───────────
  const allDueItems = useMemo(() => {
    const now = Date.now();
    const list = [];
    
    // 1. Flashcards convencionais
    flashcardDecks.forEach((deck) => {
      (deck.cards || []).forEach((card) => {
        if (!card.dueDate || card.dueDate <= now) {
          list.push({
            type: "flashcard",
            card,
            deckId: deck.id,
            deckTitle: deck.title || deck.deckTitle || "Sem Título",
            category: deck.category || "Geral",
          });
        }
      });
    });

    // 2. Quizzes de Estudo Ativo do Knowledge Hub
    knowledgeItems.forEach((item) => {
      (item.quizzes || []).forEach((quiz) => {
        if (!quiz.dueDate || quiz.dueDate <= now) {
          list.push({
            type: "quiz",
            quiz,
            itemId: item.id,
            itemTitle: item.title,
            deckTitle: `Quiz: ${item.title}`,
            category: item.sourceHost || "Knowledge Hub",
          });
        }
      });
    });

    return list;
  }, [flashcardDecks, knowledgeItems]);

  useEffect(() => {
    if (!activeDeckId && !activeQuizItemId && !isGlobalReview) {
      setIsFlipped(false);
      setStudyAheadMode(false);
      setStudyAheadIndex(0);
      setGlobalReviewIndex(0);
      setGlobalReviewedCount(0);
      setSelectedQuizOption(null);
      setIsQuizSubmitted(false);
    }
  }, [activeDeckId, activeQuizItemId, isGlobalReview]);

  const filterOptions = Array.from(new Set(flashcardDecks.map(deck => {
    if (deck.sourceCourseId) {
       const c = courses.find(course => course.id === deck.sourceCourseId);
       return c ? c.title : "Outros Cursos";
    }
    return deck.category || "Geral";
  })));

  const tagOptions = Array.from(
    new Set(
      flashcardDecks.flatMap((deck) => [
        ...(Array.isArray(deck.tags) ? deck.tags : []),
        ...(deck.cards || []).flatMap((card) => (Array.isArray(card.tags) ? card.tags : [])),
      ]),
    ),
  ).filter(Boolean).sort((a, b) => String(a).localeCompare(String(b), "pt-BR"));

  // ─── 2. MODO REVISÃO GLOBAL DE TODOS OS BARALHOS E QUIZZES ───────────────
  if (isGlobalReview) {
    const currentItem = allDueItems[0] || null;
    const totalInitialDue = allDueItems.length + globalReviewedCount;
    const progressPercent = totalInitialDue > 0 ? Math.min(100, Math.round((globalReviewedCount / totalInitialDue) * 100)) : 100;

    const handleGlobalReview = (quality) => {
      if (!currentItem) return;
      setIsFlipped(false);
      setSelectedQuizOption(null);
      setIsQuizSubmitted(false);

      if (currentItem.type === "quiz") {
        answerKnowledgeQuiz(currentItem.itemId, currentItem.quiz.id, quality);
      } else {
        reviewFlashcard(currentItem.deckId, currentItem.card.id, quality);
      }
      setGlobalReviewedCount((prev) => prev + 1);
    };

    return (
      <div className="flashcards-screen fixed inset-0 z-[220] overflow-hidden bg-[color:var(--background)] text-[color:var(--on-surface)]">
        <main className="mx-auto flex h-full max-w-[1180px] flex-col px-6 md:px-8 pb-10 pt-12">
          {/* Header */}
          <header className="mb-10 flex items-start justify-between gap-6 border-b border-[color:var(--outline-variant)]/30 pb-6">
            <div className="flex items-start gap-4">
              <button
                aria-label="Voltar para a biblioteca"
                className="mt-1 flex h-11 w-11 items-center justify-center rounded-2xl border border-[color:var(--outline-variant)] bg-[color:var(--surface)] text-[color:var(--on-surface-variant)] transition-all hover:bg-[color:var(--surface-container)] hover:text-[color:var(--on-surface)]"
                type="button"
                onClick={() => setIsGlobalReview(false)}
              >
                <Icon className="text-[20px]" name="arrow_back" />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold text-xs uppercase tracking-wider">
                    Revisão Global de Hoje
                  </span>
                  {currentItem?.deckTitle && (
                    <span className="text-xs text-[color:var(--on-surface-variant)] font-semibold">
                      • {currentItem.type === "quiz" ? "Quiz:" : "Baralho:"} <strong className="text-[color:var(--on-surface)]">{currentItem.deckTitle}</strong>
                    </span>
                  )}
                </div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[color:var(--on-surface)] mt-1">
                  Revisão Espaçada Completa
                </h1>
              </div>
            </div>

            <div className="flex flex-col items-end pt-1">
              <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--on-surface-variant)]">
                {globalReviewedCount} de {totalInitialDue} Concluídos
              </span>
              <div className="mt-2 h-2.5 w-44 overflow-hidden rounded-full bg-[color:var(--surface-container-highest)]">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </header>

          {currentItem ? (
            currentItem.type === "quiz" ? (
              /* CARD DE QUIZ NA REVISÃO GLOBAL */
              <div className="flex flex-1 flex-col items-center justify-center">
                <div className="w-full max-w-[850px] p-8 md:p-10 rounded-3xl bg-[color:var(--surface)] border border-[color:var(--outline-variant)]/50 shadow-xl space-y-6">
                  <div className="flex items-center justify-between border-b border-[color:var(--outline-variant)]/20 pb-4">
                    <span className="text-xs font-bold text-[color:var(--primary)] uppercase tracking-wider flex items-center gap-1.5">
                      <Icon name="quiz" className="text-sm" />
                      <span>Questão de Quiz • {currentItem.itemTitle}</span>
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-[color:var(--surface-container-high)] text-[10px] font-bold text-[color:var(--on-surface-variant)]">
                      {currentItem.quiz.difficulty || "Médio"}
                    </span>
                  </div>

                  <h3 className="text-xl md:text-2xl font-bold text-[color:var(--on-surface)] leading-relaxed">
                    {currentItem.quiz.question}
                  </h3>

                  <div className="space-y-3">
                    {currentItem.quiz.options.map((opt, oIdx) => {
                      let optStyle = "bg-[color:var(--surface-container-low)] border-[color:var(--outline-variant)]/30 text-[color:var(--on-surface)] hover:border-[color:var(--primary)]";

                      if (isQuizSubmitted) {
                        if (oIdx === currentItem.quiz.answerIndex) {
                          optStyle = "bg-emerald-500/15 border-emerald-500 text-emerald-600 font-bold";
                        } else if (selectedQuizOption === oIdx) {
                          optStyle = "bg-rose-500/15 border-rose-500 text-rose-600 font-bold";
                        } else {
                          optStyle = "opacity-40 border-transparent";
                        }
                      } else if (selectedQuizOption === oIdx) {
                        optStyle = "bg-[color:var(--primary)]/10 border-[color:var(--primary)] text-[color:var(--primary)] font-bold";
                      }

                      return (
                        <button
                          key={oIdx}
                          disabled={isQuizSubmitted}
                          onClick={() => {
                            setSelectedQuizOption(oIdx);
                            setIsQuizSubmitted(true);
                          }}
                          className={`w-full p-4 rounded-2xl border text-xs text-left transition-all flex items-center justify-between cursor-pointer ${optStyle}`}
                        >
                          <span>{opt}</span>
                          {isQuizSubmitted && oIdx === currentItem.quiz.answerIndex && (
                            <Icon name="check_circle" className="text-emerald-500 text-lg" />
                          )}
                          {isQuizSubmitted && selectedQuizOption === oIdx && oIdx !== currentItem.quiz.answerIndex && (
                            <Icon name="cancel" className="text-rose-500 text-lg" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {isQuizSubmitted && currentItem.quiz.explanation && (
                    <div className="p-4 rounded-2xl bg-[color:var(--surface-container-high)] text-xs text-[color:var(--on-surface-variant)] leading-relaxed space-y-1">
                      <div className="font-bold text-[color:var(--on-surface)] flex items-center gap-1.5">
                        <Icon name="info" className="text-sm text-[color:var(--primary)]" />
                        <span>Explicação:</span>
                      </div>
                      <p>{currentItem.quiz.explanation}</p>
                    </div>
                  )}

                  {/* Botoes de Repeticao Espacada */}
                  {isQuizSubmitted && (
                    <div className="pt-4 border-t border-[color:var(--outline-variant)]/20">
                      <div className="text-xs font-semibold text-center text-[color:var(--on-surface-variant)] mb-3">
                        Classifique sua facilidade nesta questão para calibrar o intervalo:
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[
                          { id: "again", quality: 1, label: "Errei", border: "border-red-500/40", text: "text-red-500", hint: "Rever hoje" },
                          { id: "hard", quality: 2, label: "Difícil", border: "border-orange-500/40", text: "text-orange-500", hint: "Rever amanhã" },
                          { id: "good", quality: 4, label: "Bom", border: "border-blue-500/40", text: "text-blue-500", hint: "Aumentar intervalo" },
                          { id: "easy", quality: 5, label: "Fácil", border: "border-emerald-500/40", text: "text-emerald-500", hint: "Longo intervalo" },
                        ].map((action) => (
                          <button
                            key={action.id}
                            className={`rounded-2xl border bg-[color:var(--surface)] p-3 text-center transition-all hover:scale-102 active:scale-98 hover:shadow-md ${action.border}`}
                            type="button"
                            onClick={() => handleGlobalReview(action.quality)}
                          >
                            <div className={`text-sm font-bold ${action.text}`}>{action.label}</div>
                            <div className="mt-0.5 text-[10px] font-semibold text-[color:var(--on-surface-variant)] opacity-70">
                              {action.hint}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* CARD DE FLASHCARD NORMAL NA REVISÃO GLOBAL */
              <>
                <div className="flex flex-1 flex-col items-center justify-center">
                  <button
                    className="w-full max-w-[850px] outline-none"
                    type="button"
                    onClick={() => setIsFlipped((v) => !v)}
                  >
                    <div
                      className={`relative h-[420px] md:h-[480px] w-full [transform-style:preserve-3d] transition-transform duration-500 ${
                        isFlipped ? "[transform:rotateY(180deg)]" : ""
                      }`}
                    >
                      {/* Frente */}
                      <div className="absolute inset-0 rounded-3xl border border-[color:var(--outline-variant)]/60 bg-[color:var(--surface)] px-8 py-10 shadow-xl flex flex-col justify-between items-center text-center [backface-visibility:hidden]">
                        <div className="w-full flex justify-between items-center text-xs text-[color:var(--on-surface-variant)]">
                          <span className="font-semibold uppercase tracking-wider opacity-60">FRENTE</span>
                          <span className="px-2 py-0.5 rounded-lg bg-[color:var(--surface-container)] text-[color:var(--primary)] font-bold text-[10px]">
                            {currentItem.deckTitle}
                          </span>
                        </div>
                        <h2 className="max-w-[700px] text-2xl md:text-3xl font-bold leading-relaxed text-[color:var(--on-surface)]">
                          <VocabTextRenderer text={currentItem.card.front || " "} />
                        </h2>
                        <p className="text-xs text-[color:var(--on-surface-variant)] opacity-70 flex items-center gap-1.5">
                          <Icon name="touch_app" className="text-sm" />
                          Clique no cartão ou pressione <kbd className="px-1.5 py-0.5 rounded bg-[color:var(--surface-container)] font-mono text-[10px]">Espaço</kbd> para virar
                        </p>
                      </div>

                      {/* Verso */}
                      <div className="absolute inset-0 rounded-3xl border border-emerald-500/40 bg-[color:var(--surface)] px-8 py-10 shadow-xl flex flex-col justify-between items-center text-center [backface-visibility:hidden] [transform:rotateY(180deg)]">
                        <div className="w-full flex justify-between items-center text-xs text-[color:var(--on-surface-variant)]">
                          <span className="font-bold text-emerald-500 uppercase tracking-wider">RESPOSTA</span>
                          <span className="px-2 py-0.5 rounded-lg bg-[color:var(--surface-container)] text-[color:var(--primary)] font-bold text-[10px]">
                            {currentItem.deckTitle}
                          </span>
                        </div>
                        <h3 className="max-w-[700px] text-xl md:text-2xl font-medium leading-relaxed text-[color:var(--on-surface)]">
                          <VocabTextRenderer text={currentItem.card.back || " "} />
                        </h3>
                        <p className="text-xs text-[color:var(--on-surface-variant)] opacity-70">
                          Como foi sua lembrança deste cartão?
                        </p>
                      </div>
                    </div>
                  </button>
                </div>

                {/* Botões de Ação */}
                <div className="mt-8 flex items-center justify-center">
                  {!isFlipped ? (
                    <button
                      className="h-14 w-full max-w-[500px] rounded-2xl bg-emerald-600 text-white text-sm font-bold tracking-wider uppercase hover:bg-emerald-500 active:scale-98 transition-all shadow-lg flex items-center justify-center gap-2"
                      type="button"
                      onClick={() => setIsFlipped(true)}
                    >
                      <Icon name="visibility" />
                      <span>Mostrar Resposta (Espaço)</span>
                    </button>
                  ) : (
                    <div className="grid w-full max-w-[760px] grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { id: "again", quality: 1, label: "Errei", border: "border-red-500/40", text: "text-red-500", key: "1", hint: "Rever hoje" },
                        { id: "hard", quality: 2, label: "Difícil", border: "border-orange-500/40", text: "text-orange-500", key: "2", hint: "Rever amanhã" },
                        { id: "good", quality: 4, label: "Bom", border: "border-blue-500/40", text: "text-blue-500", key: "3", hint: "Aumentar intervalo" },
                        { id: "easy", quality: 5, label: "Fácil", border: "border-emerald-500/40", text: "text-emerald-500", key: "4", hint: "Longo intervalo" },
                      ].map((action) => (
                        <button
                          key={action.id}
                          className={`rounded-2xl border bg-[color:var(--surface)] p-3.5 text-center transition-all hover:scale-102 active:scale-98 hover:shadow-md ${action.border}`}
                          type="button"
                          onClick={() => handleGlobalReview(action.quality)}
                        >
                          <div className={`text-base font-bold ${action.text} flex items-center justify-center gap-1.5`}>
                            <span>{action.label}</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-[color:var(--surface-container)] opacity-60 font-mono">
                              {action.key}
                            </span>
                          </div>
                          <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--on-surface-variant)] opacity-70">
                            {action.hint}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )
          ) : (
            /* Tela de Conclusão Global */
            <div className="flex flex-1 items-center justify-center">
              <div className="max-w-md text-center p-8 rounded-3xl bg-[color:var(--surface)] border border-[color:var(--outline-variant)]/40 shadow-2xl">
                <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/30">
                  <Icon className="text-4xl" name="celebration" filled />
                </div>
                <h2 className="text-2xl font-black tracking-tight text-[color:var(--on-surface)]">
                  Parabéns! Todas as revisões concluídas!
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-[color:var(--on-surface-variant)]">
                  Você concluiu todas as {globalReviewedCount} revisões pendentes de hoje (flashcards e quizzes). Sua repetição espaçada está 100% em dia!
                </p>
                <div className="mt-6 flex justify-center">
                  <button
                    className="px-6 py-3 rounded-2xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-500 transition-all shadow-md flex items-center gap-2"
                    type="button"
                    onClick={() => setIsGlobalReview(false)}
                  >
                    <Icon name="check" />
                    <span>Voltar à Biblioteca</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  // ─── 3. MODO REVISÃO DE UM QUIZ INDIVIDUAL DE KNOWLEDGE ITEM ──────────────
  if (activeQuizItemId) {
    const kItem = knowledgeItems.find((k) => k.id === activeQuizItemId);
    if (!kItem) {
      setActiveQuizItemId(null);
      return null;
    }

    const quizzes = kItem.quizzes || [];
    const now = Date.now();
    const dueQuizzes = quizzes.filter((q) => !q.dueDate || q.dueDate <= now);
    const activeQuiz = dueQuizzes[0] || quizzes[0] || null;

    const handleQuizReview = (quality) => {
      if (!activeQuiz) return;
      setSelectedQuizOption(null);
      setIsQuizSubmitted(false);
      answerKnowledgeQuiz(kItem.id, activeQuiz.id, quality);
    };

    return (
      <div className="flashcards-screen fixed inset-0 z-[220] overflow-hidden bg-[color:var(--background)] text-[color:var(--on-surface)]">
        <main className="mx-auto flex h-full max-w-[1180px] flex-col px-6 md:px-8 pb-10 pt-12">
          <header className="mb-10 flex items-start justify-between gap-6 border-b border-[color:var(--outline-variant)]/30 pb-6">
            <div className="flex items-start gap-4">
              <button
                aria-label="Voltar"
                className="mt-1 flex h-11 w-11 items-center justify-center rounded-2xl border border-[color:var(--outline-variant)] bg-[color:var(--surface)] text-[color:var(--on-surface-variant)] transition-all hover:bg-[color:var(--surface-container)] hover:text-[color:var(--on-surface)]"
                type="button"
                onClick={() => setActiveQuizItemId(null)}
              >
                <Icon className="text-[20px]" name="arrow_back" />
              </button>
              <div>
                <span className="px-2.5 py-0.5 rounded-full bg-[color:var(--primary)]/15 text-[color:var(--primary)] font-bold text-xs uppercase tracking-wider">
                  Quiz de Estudo Ativo
                </span>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[color:var(--on-surface)] mt-1">
                  {kItem.title}
                </h1>
              </div>
            </div>

            <div className="flex flex-col items-end pt-1">
              <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--on-surface-variant)]">
                {dueQuizzes.length} Questões Pendentes
              </span>
            </div>
          </header>

          {activeQuiz ? (
            <div className="flex flex-1 flex-col items-center justify-center">
              <div className="w-full max-w-[850px] p-8 md:p-10 rounded-3xl bg-[color:var(--surface)] border border-[color:var(--outline-variant)]/50 shadow-xl space-y-6">
                <div className="flex items-center justify-between border-b border-[color:var(--outline-variant)]/20 pb-4">
                  <span className="text-xs font-bold text-[color:var(--primary)] uppercase tracking-wider">
                    {activeQuiz.difficulty || "Médio"}
                  </span>
                  <span className="text-xs text-[color:var(--on-surface-variant)]">
                    {dueQuizzes.length} para hoje
                  </span>
                </div>

                <h3 className="text-xl md:text-2xl font-bold text-[color:var(--on-surface)] leading-relaxed">
                  {activeQuiz.question}
                </h3>

                <div className="space-y-3">
                  {activeQuiz.options.map((opt, oIdx) => {
                    let optStyle = "bg-[color:var(--surface-container-low)] border-[color:var(--outline-variant)]/30 text-[color:var(--on-surface)] hover:border-[color:var(--primary)]";

                    if (isQuizSubmitted) {
                      if (oIdx === activeQuiz.answerIndex) {
                        optStyle = "bg-emerald-500/15 border-emerald-500 text-emerald-600 font-bold";
                      } else if (selectedQuizOption === oIdx) {
                        optStyle = "bg-rose-500/15 border-rose-500 text-rose-600 font-bold";
                      } else {
                        optStyle = "opacity-40 border-transparent";
                      }
                    } else if (selectedQuizOption === oIdx) {
                      optStyle = "bg-[color:var(--primary)]/10 border-[color:var(--primary)] text-[color:var(--primary)] font-bold";
                    }

                    return (
                      <button
                        key={oIdx}
                        disabled={isQuizSubmitted}
                        onClick={() => {
                          setSelectedQuizOption(oIdx);
                          setIsQuizSubmitted(true);
                        }}
                        className={`w-full p-4 rounded-2xl border text-xs text-left transition-all flex items-center justify-between cursor-pointer ${optStyle}`}
                      >
                        <span>{opt}</span>
                        {isQuizSubmitted && oIdx === activeQuiz.answerIndex && (
                          <Icon name="check_circle" className="text-emerald-500 text-lg" />
                        )}
                        {isQuizSubmitted && selectedQuizOption === oIdx && oIdx !== activeQuiz.answerIndex && (
                          <Icon name="cancel" className="text-rose-500 text-lg" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {isQuizSubmitted && activeQuiz.explanation && (
                  <div className="p-4 rounded-2xl bg-[color:var(--surface-container-high)] text-xs text-[color:var(--on-surface-variant)] leading-relaxed space-y-1">
                    <div className="font-bold text-[color:var(--on-surface)] flex items-center gap-1.5">
                      <Icon name="info" className="text-sm text-[color:var(--primary)]" />
                      <span>Explicação:</span>
                    </div>
                    <p>{activeQuiz.explanation}</p>
                  </div>
                )}

                {isQuizSubmitted && (
                  <div className="pt-4 border-t border-[color:var(--outline-variant)]/20">
                    <div className="text-xs font-semibold text-center text-[color:var(--on-surface-variant)] mb-3">
                      Classifique sua lembrança:
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { id: "again", quality: 1, label: "Errei", border: "border-red-500/40", text: "text-red-500", hint: "Rever hoje" },
                        { id: "hard", quality: 2, label: "Difícil", border: "border-orange-500/40", text: "text-orange-500", hint: "Rever amanhã" },
                        { id: "good", quality: 4, label: "Bom", border: "border-blue-500/40", text: "text-blue-500", hint: "Aumentar intervalo" },
                        { id: "easy", quality: 5, label: "Fácil", border: "border-emerald-500/40", text: "text-emerald-500", hint: "Longo intervalo" },
                      ].map((action) => (
                        <button
                          key={action.id}
                          className={`rounded-2xl border bg-[color:var(--surface)] p-3 text-center transition-all hover:scale-102 active:scale-98 hover:shadow-md ${action.border}`}
                          type="button"
                          onClick={() => handleQuizReview(action.quality)}
                        >
                          <div className={`text-sm font-bold ${action.text}`}>{action.label}</div>
                          <div className="mt-0.5 text-[10px] font-semibold text-[color:var(--on-surface-variant)] opacity-70">
                            {action.hint}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="max-w-md text-center p-8 rounded-3xl bg-[color:var(--surface)] border border-[color:var(--outline-variant)]/40 shadow-xl">
                <Icon className="text-4xl text-emerald-500 mb-3" name="check_circle" filled />
                <h3 className="text-xl font-bold text-[color:var(--on-surface)]">Quizzes deste material concluídos!</h3>
                <p className="mt-2 text-xs text-[color:var(--on-surface-variant)]">Você já revisou todas as questões agendadas para este conteúdo.</p>
                <button
                  onClick={() => setActiveQuizItemId(null)}
                  className="mt-5 px-6 py-2.5 rounded-xl bg-[color:var(--primary)] text-white text-xs font-bold"
                >
                  Voltar à Biblioteca
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  // ─── 4. LISTA DE BARALHOS E QUIZZES (BIBLIOTECA) ───────────────────────────
  if (!activeDeckId) {
    const categoryOptions = [
      { value: "ALL", label: "Todas as Categorias" },
      ...filterOptions.map((cat) => ({ value: cat, label: cat })),
    ];

    const knowledgeItemsWithQuizzes = knowledgeItems.filter(item => item.quizzes && item.quizzes.length > 0);

    return (
      <div className="flex-1 overflow-y-auto p-6 md:p-8 screen-fade-in bg-[color:var(--background)]">
        <div className="max-w-6xl mx-auto space-y-8">
          
          {/* Header Principal */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h2 className="text-3xl font-bold text-[color:var(--on-surface)] tracking-tight">Biblioteca de Revisões</h2>
              <p className="text-[color:var(--on-surface-variant)] mt-1">Selecione um baralho ou quiz para praticar com repetição espaçada.</p>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full md:w-auto">
              <AppSelect
                buttonClassName="min-w-[200px]"
                options={categoryOptions}
                value={filterCategory}
                onChange={setFilterCategory}
              />
              <AppSelect
                buttonClassName="min-w-[160px]"
                options={[
                  { value: "ALL", label: "Todas as tags" },
                  ...tagOptions.map((tag) => ({ value: tag, label: `#${tag}` })),
                ]}
                value={filterTag}
                onChange={setFilterTag}
              />
              <div className="relative flex-1 md:w-56">
                <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--outline)]" />
                <input 
                  type="text" 
                  placeholder="Buscar revisões..." 
                  className="w-full bg-[color:var(--surface)] border border-[color:var(--outline-variant)]/30 rounded-xl py-2.5 pl-10 pr-4 outline-none focus:border-[color:var(--primary)] transition-all text-sm text-[color:var(--on-surface)]"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <button 
                className="px-5 py-2.5 bg-[color:var(--primary)] text-white font-bold rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-sm shrink-0 whitespace-nowrap"
                onClick={() => {
                  setActiveDeck(null);
                  onNavigate && onNavigate(SCREEN_IDS.CREATE_FLASHCARDS);
                }}
              >
                <Icon name="add" />
                <span>Novo Deck</span>
              </button>
            </div>
          </div>

          {/* Banner / Botão em Verde para Revisar Tudo de Hoje (Flashcards + Quizzes) */}
          {allDueItems.length > 0 && (
            <div className="p-6 rounded-3xl bg-gradient-to-r from-emerald-600 via-emerald-700 to-teal-800 text-white shadow-xl shadow-emerald-900/10 flex flex-col md:flex-row items-center justify-between gap-6 border border-emerald-400/30 animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white shrink-0 shadow-inner">
                  <Icon name="bolt" className="text-3xl" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-400/30 text-xs font-black uppercase tracking-wider text-emerald-100">
                      Revisão Espaçada Global
                    </span>
                    <span className="text-xs text-emerald-100 font-semibold">• Flashcards + Quizzes de Estudo Ativo</span>
                  </div>
                  <h3 className="text-xl md:text-2xl font-black tracking-tight mt-1 text-white">
                    {allDueItems.length} {allDueItems.length === 1 ? "item para revisar hoje" : "itens para revisar hoje"}
                  </h3>
                  <p className="text-xs text-emerald-100/90 mt-0.5">
                    Mantenha sua retenção no máximo revisando todos os flashcards e perguntas agendados para hoje.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsGlobalReview(true)}
                className="w-full md:w-auto px-8 py-3.5 rounded-2xl bg-white text-emerald-900 font-black text-sm hover:bg-emerald-50 hover:scale-105 active:scale-95 transition-all shadow-lg flex items-center justify-center gap-2.5 shrink-0"
              >
                <Icon name="play_arrow" className="text-xl" filled />
                <span>Revisar Tudo de Hoje ({allDueItems.length})</span>
              </button>
            </div>
          )}

          {/* ─── SEÇÃO 1: BARALHOS DE FLASHCARDS ───────────────────────────── */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-[color:var(--on-surface)] flex items-center gap-2">
              <Icon name="style" className="text-xl text-[color:var(--primary)]" />
              <span>Baralhos de Flashcards</span>
            </h3>

            {flashcardDecks.length === 0 ? (
              <div className="neo-inset p-8 flex flex-col items-center justify-center rounded-[32px] text-center w-full">
                <Icon className="text-4xl text-[color:var(--outline)] mb-2" name="style" />
                <h4 className="text-base font-bold text-[color:var(--on-surface)]">Nenhum Deck Encontrado</h4>
                <p className="text-xs text-[color:var(--on-surface-variant)]">Crie seu primeiro deck de flashcards para começar.</p>
              </div>
            ) : (() => {
              const filteredDecks = flashcardDecks.filter(deck => {
                const deckCategory = deck.sourceCourseId 
                  ? (courses.find(c => c.id === deck.sourceCourseId)?.title || "Outros Cursos")
                  : (deck.category || "Geral");
                
                const dTitle = deck.title || deck.deckTitle || "";
                const deckTags = Array.from(new Set([
                  ...(Array.isArray(deck.tags) ? deck.tags : []),
                  ...(deck.cards || []).flatMap((card) => (Array.isArray(card.tags) ? card.tags : [])),
                ]));
                
                const matchesSearch = dTitle.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                      deckCategory.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                      deckTags.some((tag) => String(tag).toLowerCase().includes(searchQuery.toLowerCase()));
                
                const matchesFilter = filterCategory === "ALL" || deckCategory === filterCategory;
                const matchesTag = filterTag === "ALL" || deckTags.includes(filterTag);

                return matchesSearch && matchesFilter && matchesTag;
              });

              if (filteredDecks.length === 0) {
                return (
                  <div className="p-6 text-center text-xs text-[color:var(--on-surface-variant)]">
                    Nenhum baralho corresponde à busca.
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredDecks.map(deck => {
                    const now = Date.now();
                    const dueCount = deck.cards ? deck.cards.filter(c => !c.dueDate || c.dueDate <= now).length : 0;
                    
                    const deckCategory = deck.sourceCourseId 
                      ? (courses.find(c => c.id === deck.sourceCourseId)?.title || "Outros Cursos")
                      : (deck.category || "Geral");
                    const deckTags = Array.from(new Set([
                      ...(Array.isArray(deck.tags) ? deck.tags : []),
                      ...(deck.cards || []).flatMap((card) => (Array.isArray(card.tags) ? card.tags : [])),
                    ]));

                    return (
                      <div key={deck.id} className="p-6 rounded-3xl bg-[color:var(--surface)] border border-[color:var(--outline-variant)]/40 flex flex-col group relative shadow-xs hover:shadow-md transition-all">
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex-1">
                            <span className="text-xs font-bold uppercase text-[color:var(--tertiary)] tracking-wider">{deckCategory}</span>
                            <h3 className="text-lg font-bold text-[color:var(--on-surface)] mt-1 line-clamp-1">{deck.title || deck.deckTitle || "Sem Título"}</h3>
                            {deckTags.length > 0 ? (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {deckTags.slice(0, 4).map((tag) => (
                                  <span key={tag} className="rounded-full bg-[color:var(--primary)]/10 px-2 py-0.5 text-[10px] font-semibold text-[color:var(--primary)]">
                                    #{tag}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          <button 
                             className="w-8 h-8 rounded-xl flex items-center justify-center text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
                             onClick={(e) => {
                               e.stopPropagation();
                               if (confirm(`Excluir deck "${deck.title}"?`)) {
                                 deleteFlashcardDeck(deck.id);
                               }
                             }}
                             title="Excluir baralho"
                          >
                            <Icon name="delete" className="text-[18px]" />
                          </button>
                        </div>
                        <div className="flex justify-between items-end mb-6 flex-1">
                          <p className="text-[color:var(--on-surface-variant)] text-xs font-medium">
                            {deck.cards?.length || 0} Cartões
                          </p>
                          {dueCount > 0 && (
                            <span className="bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-xs">
                              {dueCount} para hoje
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2.5 mt-auto">
                          <button 
                            className={`flex-1 py-2.5 font-bold text-xs rounded-xl transition-all shadow-xs ${
                              dueCount > 0
                                ? "bg-emerald-600 text-white hover:bg-emerald-500"
                                : "bg-[color:var(--surface-container-high)] text-[color:var(--on-surface)] hover:bg-[color:var(--surface-container-highest)]"
                            }`}
                            onClick={() => {
                              setActiveDeck(deck.id);
                              setStudyAheadMode(false);
                              setStudyAheadIndex(0);
                            }}
                          >
                            {dueCount > 0 ? `Revisar (${dueCount})` : "Praticar"}
                          </button>
                          <button 
                            className="w-10 py-2.5 bg-[color:var(--surface-container-high)] hover:bg-[color:var(--surface-container-highest)] text-[color:var(--on-surface-variant)] font-bold rounded-xl transition-all flex items-center justify-center"
                            onClick={() => {
                              setActiveDeck(deck.id);
                              onNavigate && onNavigate(SCREEN_IDS.CREATE_FLASHCARDS);
                            }}
                            title="Editar Cartões"
                          >
                            <Icon name="edit" className="text-[18px]" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* ─── SEÇÃO 2: QUIZZES DO KNOWLEDGE HUB ─────────────────────────── */}
          {knowledgeItemsWithQuizzes.length > 0 && (
            <div className="space-y-4 pt-4 border-t border-[color:var(--outline-variant)]/20">
              <h3 className="text-lg font-bold text-[color:var(--on-surface)] flex items-center gap-2">
                <Icon name="quiz" className="text-xl text-[color:var(--primary)]" />
                <span>Quizzes de Estudo Ativo (Knowledge Hub)</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {knowledgeItemsWithQuizzes.map((item) => {
                  const now = Date.now();
                  const dueQuizzes = (item.quizzes || []).filter((q) => !q.dueDate || q.dueDate <= now);

                  return (
                    <div
                      key={item.id}
                      className="p-6 rounded-3xl bg-[color:var(--surface)] border border-[color:var(--outline-variant)]/40 flex flex-col justify-between shadow-xs hover:shadow-md transition-all space-y-4"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase text-[color:var(--primary)] tracking-wider">
                            {item.sourceHost || item.sourceType || "Web"}
                          </span>
                          {dueQuizzes.length > 0 && (
                            <span className="bg-emerald-500 text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full shadow-xs">
                              {dueQuizzes.length} para hoje
                            </span>
                          )}
                        </div>
                        <h4 className="text-base font-bold text-[color:var(--on-surface)] mt-1.5 line-clamp-2">
                          {item.title}
                        </h4>
                        <p className="text-xs text-[color:var(--on-surface-variant)] mt-1">
                          {(item.quizzes || []).length} Questões de Múltipla Escolha
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => setActiveQuizItemId(item.id)}
                          className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all shadow-xs ${
                            dueQuizzes.length > 0
                              ? "bg-emerald-600 text-white hover:bg-emerald-500"
                              : "bg-[color:var(--primary)] text-white hover:opacity-90"
                          }`}
                        >
                          {dueQuizzes.length > 0 ? `Revisar (${dueQuizzes.length})` : "Praticar Quiz"}
                        </button>
                        <button
                          onClick={() => {
                            setActiveKnowledgeItemId(item.id);
                            onNavigate && onNavigate(SCREEN_IDS.KNOWLEDGE_ITEM_DETAIL);
                          }}
                          className="px-3 py-2.5 rounded-xl bg-[color:var(--surface-container-high)] text-[color:var(--on-surface)] hover:bg-[color:var(--surface-container-highest)] text-xs font-bold"
                          title="Abrir Material de Estudo"
                        >
                          <Icon name="open_in_new" className="text-sm" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </div>
    );
  }

  // ─── 5. MODO REVISÃO DE BARALHO DE FLASHCARDS INDIVIDUAL ──────────────────
  const data = flashcardDecks.find((d) => d.id === activeDeckId);
  if (!data) {
    setActiveDeck(null);
    return null;
  }

  const allCards = data.cards || [];
  const now = Date.now();
  const dueCards = allCards.filter(c => !c.dueDate || c.dueDate <= now);
  const reviewedCards = allCards.filter(c => c.dueDate && c.dueDate > now);

  const activeCard = dueCards.length > 0 
    ? dueCards[0] 
    : (studyAheadMode && reviewedCards.length > 0 ? reviewedCards[studyAheadIndex % reviewedCards.length] : null);

  const isCardAlreadyReviewed = activeCard && activeCard.dueDate && activeCard.dueDate > now;
  const activeCardIndex = activeCard ? allCards.findIndex((card) => card.id === activeCard.id) : -1;
  const progressTotal = allCards.length || 1;
  const progressValue = activeCardIndex >= 0 ? activeCardIndex + 1 : Math.min(dueCards.length, progressTotal);
  const progressPercent = Math.max(6, Math.min(100, Math.round((progressValue / progressTotal) * 100)));

  const handleReview = (quality) => {
    if (!activeCard) return;
    setIsFlipped(false);
    if (isCardAlreadyReviewed && studyAheadMode) {
      setStudyAheadIndex(prev => prev + 1);
      return;
    }
    reviewFlashcard(activeDeckId, activeCard.id, quality);
  };

  return (
    <div className="flashcards-screen fixed inset-0 z-[220] overflow-hidden bg-[color:var(--background)] text-[color:var(--on-surface)]">
      <main className="mx-auto flex h-full max-w-[1180px] flex-col px-6 md:px-8 pb-10 pt-12">
        <header className="mb-10 flex items-start justify-between gap-6 border-b border-[color:var(--outline-variant)]/30 pb-6">
          <div className="flex items-start gap-4">
            <button
              aria-label="Voltar"
              className="mt-1 flex h-11 w-11 items-center justify-center rounded-2xl border border-[color:var(--outline-variant)] bg-[color:var(--surface)] text-[color:var(--on-surface-variant)] transition-all hover:bg-[color:var(--surface-container)] hover:text-[color:var(--on-surface)]"
              type="button"
              onClick={() => setActiveDeck(null)}
            >
              <Icon className="text-[20px]" name="arrow_back" />
            </button>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[color:var(--on-surface)]">
                {data.title}
              </h1>
              <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">Revisando baralho</p>
            </div>
          </div>

          <div className="flex flex-col items-end pt-1">
            <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--on-surface-variant)]">
              {progressValue}/{progressTotal} Cartões
            </span>
            <div className="mt-2 h-2.5 w-44 overflow-hidden rounded-full bg-[color:var(--surface-container-highest)]">
              <div
                className="h-full rounded-full bg-[color:var(--primary)] transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <button type="button" onClick={() => { setStudyAheadMode((value) => !value); setStudyAheadIndex(0); setIsFlipped(false); }} className={`mt-3 rounded-xl px-3 py-2 text-xs font-bold transition-colors ${studyAheadMode ? "bg-[color:var(--primary)] text-white" : "neo-inset text-[color:var(--on-surface-variant)]"}`}>
              <Icon name="all_inclusive" className="mr-1 align-middle text-sm" />
              {studyAheadMode ? "Praticando qualquer cartão" : "Praticar fora do dia"}
            </button>
          </div>
        </header>

        {activeCard ? (
          <>
            <div className="flex flex-1 flex-col items-center justify-center">
              <button
                className="w-full max-w-[850px] outline-none"
                type="button"
                onClick={() => setIsFlipped((value) => !value)}
              >
                <div
                  className={`relative h-[420px] md:h-[480px] w-full [transform-style:preserve-3d] transition-transform duration-500 ${
                    isFlipped ? "[transform:rotateY(180deg)]" : ""
                  }`}
                >
                  <div className="absolute inset-0 rounded-3xl border border-[color:var(--outline-variant)]/60 bg-[color:var(--surface)] px-8 py-10 shadow-xl flex flex-col justify-between items-center text-center [backface-visibility:hidden]">
                    <div className="w-full flex justify-between items-center text-xs text-[color:var(--on-surface-variant)]">
                      <span className="font-semibold uppercase tracking-wider opacity-60">FRENTE</span>
                    </div>
                    <h2 className="max-w-[700px] text-2xl md:text-3xl font-bold leading-relaxed text-[color:var(--on-surface)]">
                      <VocabTextRenderer text={activeCard.front || " "} />
                    </h2>
                    <button type="button" onClick={(event) => { event.stopPropagation(); speakCardText(activeCard.front); }} className="rounded-xl px-3 py-2 text-xs font-bold neo-inset" title="Ouvir frente"><Icon name="volume_up" /> Ouvir</button>
                    <p className="text-xs text-[color:var(--on-surface-variant)] opacity-70 flex items-center gap-1.5">
                      <Icon name="touch_app" className="text-sm" />
                      Clique no cartão para virar
                    </p>
                  </div>

                  <div className="absolute inset-0 rounded-3xl border border-[color:var(--primary)]/40 bg-[color:var(--surface)] px-8 py-10 shadow-xl flex flex-col justify-between items-center text-center [backface-visibility:hidden] [transform:rotateY(180deg)]">
                    <div className="w-full flex justify-between items-center text-xs text-[color:var(--on-surface-variant)]">
                      <span className="font-bold text-[color:var(--primary)] uppercase tracking-wider">RESPOSTA</span>
                    </div>
                    <h3 className="max-w-[700px] text-xl md:text-2xl font-medium leading-relaxed text-[color:var(--on-surface)]">
                      <VocabTextRenderer text={activeCard.back || " "} />
                    </h3>
                    <button type="button" onClick={(event) => { event.stopPropagation(); speakCardText(activeCard.back); }} className="rounded-xl px-3 py-2 text-xs font-bold neo-inset" title="Ouvir resposta"><Icon name="volume_up" /> Ouvir</button>
                    <p className="text-xs text-[color:var(--on-surface-variant)] opacity-70">
                      Classifique sua lembrança abaixo
                    </p>
                  </div>
                </div>
              </button>
            </div>

            <div className="mt-8 flex items-center justify-center">
              {!isFlipped ? (
                <button
                  className="h-14 w-full max-w-[500px] rounded-2xl bg-[color:var(--primary)] text-white text-sm font-bold tracking-wider uppercase hover:opacity-90 active:scale-98 transition-all shadow-lg flex items-center justify-center gap-2"
                  type="button"
                  onClick={() => setIsFlipped(true)}
                >
                  <Icon name="visibility" />
                  <span>Mostrar Resposta (Espaço)</span>
                </button>
              ) : (
                <div className="grid w-full max-w-[760px] grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { id: "again", quality: 1, label: "Errei", border: "border-red-500/40", text: "text-red-500", key: "1", hint: "Rever hoje" },
                    { id: "hard", quality: 2, label: "Difícil", border: "border-orange-500/40", text: "text-orange-500", key: "2", hint: "Rever amanhã" },
                    { id: "good", quality: 4, label: "Bom", border: "border-blue-500/40", text: "text-blue-500", key: "3", hint: "Aumentar intervalo" },
                    { id: "easy", quality: 5, label: "Fácil", border: "border-emerald-500/40", text: "text-emerald-500", key: "4", hint: "Longo intervalo" },
                  ].map((action) => (
                    <button
                      key={action.id}
                      className={`rounded-2xl border bg-[color:var(--surface)] p-3.5 text-center transition-all hover:scale-102 active:scale-98 hover:shadow-md ${action.border}`}
                      type="button"
                      onClick={() => handleReview(action.quality)}
                    >
                      <div className={`text-base font-bold ${action.text} flex items-center justify-center gap-1.5`}>
                        <span>{action.label}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-[color:var(--surface-container)] opacity-60 font-mono">
                          {action.key}
                        </span>
                      </div>
                      <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--on-surface-variant)] opacity-70">
                        {action.hint}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="max-w-md text-center p-8 rounded-3xl bg-[color:var(--surface)] border border-[color:var(--outline-variant)]/40 shadow-xl">
              <Icon className="text-4xl text-emerald-500 mb-3" name="check_circle" filled />
              <h3 className="text-xl font-bold text-[color:var(--on-surface)]">Baralho concluído!</h3>
              <p className="mt-2 text-xs text-[color:var(--on-surface-variant)]">Você revisou todos os cartões agendados para este baralho.</p>
              <button
                onClick={() => setActiveDeck(null)}
                className="mt-5 px-6 py-2.5 rounded-xl bg-[color:var(--primary)] text-white text-xs font-bold"
              >
                Voltar à Biblioteca
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
