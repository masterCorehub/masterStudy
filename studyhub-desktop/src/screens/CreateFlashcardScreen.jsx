import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Icon } from "../ui/Icon";
import { SCREEN_IDS } from "../app/screenIds";
import { useStudyStore } from "../store/useStore";

const createEmptyCard = (index = 0) => ({
  id: `draft-card-${Date.now()}-${index}`,
  front: "",
  back: "",
  frontImage: "",
  backImage: "",
});

const normalizeDraftCards = (cards = []) => {
  if (!cards.length) return [createEmptyCard()];
  return cards.map((card, index) => ({
    id: card.id || `draft-card-${index}`,
    front: card.front || "",
    back: card.back || "",
    frontImage: card.frontImage || "",
    backImage: card.backImage || "",
  }));
};

const deckTopicTokens = (value = "") => {
  const aliases = {
    ingles: "english",
    inglês: "english",
    english: "english",
    gramatica: "grammar",
    gramática: "grammar",
    grammar: "grammar",
    espanhol: "spanish",
    spanish: "spanish",
    portugues: "portuguese",
    português: "portuguese",
    french: "french",
    frances: "french",
    francês: "french",
  };
  return new Set(
    String(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR")
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .map((token) => aliases[token] || token)
      .filter((token) => token.length > 2 && !["para", "com", "dos", "das", "the", "and"].includes(token)),
  );
};

const findMatchingDeckId = (decks, suggestedTitle, suggestedTags, query) => {
  const target = deckTopicTokens(
    [suggestedTitle, query, ...(suggestedTags || [])].filter(Boolean).join(" "),
  );
  if (target.size < 2) return "";
  let best = { id: "", score: 0 };
  for (const deck of decks) {
    const deckTokens = deckTopicTokens(
      [deck.title, deck.deckTitle, ...(deck.tags || [])].filter(Boolean).join(" "),
    );
    const overlap = [...target].filter((token) => deckTokens.has(token)).length;
    const score = overlap / Math.min(target.size, Math.max(deckTokens.size, 1));
    if (overlap >= 2 && score > best.score) best = { id: deck.id, score };
  }
  return best.id;
};

const cleanGeneratedDeckTitle = (value, fallback) => {
  const cleaned = String(value || "")
    .split("\n")[0]
    .replace(/^(deck\s*title|título|titulo|baralho)\s*:\s*/i, "")
    .replace(/^flashcards?\s*(para|sobre|de|:)?\s*/i, "")
    .replace(/^(quando usar|como lembrar|eu lembrar do uso da palavra)\s+/i, "")
    .replace(/["'`*_#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return fallback;
  return cleaned.split(" ").slice(0, 7).join(" ").slice(0, 64).trim() || fallback;
};

export function CreateFlashcardScreen({ onNavigate }) {
  const searchParams =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : null;
  const isAiQuickMode = searchParams?.get("mode") === "ai-quick-flashcard";

  const activeDeckId = useStudyStore((state) => state.activeDeckId);
  const flashcardDecks = useStudyStore((state) => state.flashcardDecks);
  const academicSubjects = useStudyStore((state) => state.academic.subjects || []);
  const preferredAiModel = useStudyStore(
    (state) => state.academic.studyPreferences?.aiModel || "",
  );
  const addFlashcardDeck = useStudyStore((state) => state.addFlashcardDeck);
  const addFlashcard = useStudyStore((state) => state.addFlashcard);
  const updateFlashcardDeck = useStudyStore((state) => state.updateFlashcardDeck);
  const setActiveDeck = useStudyStore((state) => state.setActiveDeck);

  const activeDeck = flashcardDecks.find((deck) => deck.id === activeDeckId) || null;

  const [deckTitle, setDeckTitle] = useState("");
  const [disciplineId, setDisciplineId] = useState("");
  const [description, setDescription] = useState("");
  const [draftCards, setDraftCards] = useState([createEmptyCard()]);

  const [aiInput, setAiInput] = useState("");
  const aiInputRef = useRef(null);
  const aiRequestIdRef = useRef(null);
  const aiCancelledRef = useRef(false);
  const [selectedAiText, setSelectedAiText] = useState("");
  const [aiInputMode, setAiInputMode] = useState("topic");
  const [aiMode, setAiMode] = useState("auto");
  const [aiCardCount, setAiCardCount] = useState(3);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [generatedCards, setGeneratedCards] = useState([]);
  const [selectedDeckForAi, setSelectedDeckForAi] = useState("");
  const [aiDeckTitle, setAiDeckTitle] = useState("Flashcards com IA");
  const [aiTags, setAiTags] = useState([]);
  const [aiStatusMsg, setAiStatusMsg] = useState("");
  const [aiError, setAiError] = useState("");

  useEffect(() => {
    if (!activeDeck) {
      setDeckTitle("");
      setDisciplineId("");
      setDescription("");
      setDraftCards([createEmptyCard()]);
      return;
    }

    setDeckTitle(activeDeck.title || activeDeck.deckTitle || "");
    setDescription(activeDeck.description || "");
    setDisciplineId(
      activeDeck.academicSubjectId ||
        activeDeck.subjectId ||
        activeDeck.sourceCourseId ||
        "",
    );
    setDraftCards(normalizeDraftCards(activeDeck.cards || []));
  }, [activeDeck]);

  const handleDraftChange = (cardId, field, value) => {
    setDraftCards((current) =>
      current.map((card) => (card.id === cardId ? { ...card, [field]: value } : card)),
    );
  };

  const handleAddCard = () => {
    setDraftCards((current) => [...current, createEmptyCard(current.length)]);
  };

  const handleRemoveCard = (cardId) => {
    setDraftCards((current) =>
      current.length > 1 ? current.filter((card) => card.id !== cardId) : current,
    );
  };

  const handleSaveDeck = () => {
    const cleanedTitle = deckTitle.trim();
    if (!cleanedTitle) {
      alert("Preencha o nome do deck.");
      return;
    }

    const cards = draftCards
      .map((card) => ({
        ...card,
        front: card.front.trim(),
        back: card.back.trim(),
      }))
      .filter((card) => card.front || card.back || card.frontImage || card.backImage);

    if (!cards.length) {
      alert("Adicione ao menos um cartão ao deck.");
      return;
    }

    const selectedSubject = academicSubjects.find((subject) => subject.id === disciplineId);
    const deckPayload = {
      title: cleanedTitle,
      deckTitle: cleanedTitle,
      category: selectedSubject?.name || selectedSubject?.title || "",
      eyebrow: selectedSubject?.name || selectedSubject?.title || "General",
      description: description.trim(),
      academicSubjectId: selectedSubject?.id || disciplineId || null,
      academicSemesterId: selectedSubject?.semesterId || null,
      sourceCourseId:
        selectedSubject?.linkedCourseIds?.[0] ||
        selectedSubject?.courseId ||
        activeDeck?.sourceCourseId ||
        null,
      cards,
    };

    if (activeDeck) {
      updateFlashcardDeck(activeDeck.id, deckPayload);
    } else {
      addFlashcardDeck({
        id: `deck-${Date.now()}`,
        ...deckPayload,
      });
    }

    setActiveDeck(null);
    onNavigate?.(SCREEN_IDS.FLASHCARDS);
  };

  const handleCancel = () => {
    setActiveDeck(null);
    onNavigate?.(SCREEN_IDS.FLASHCARDS);
  };

  const handleGenerateAiCard = async () => {
    const query = aiInput.trim();
    if (!query) return;
    const markedText = selectedAiText.trim();

    setIsGeneratingAi(true);
    setAiStatusMsg("");
    setAiError("");
    const requestId = `quick-flashcards-${Date.now()}`;
    aiRequestIdRef.current = requestId;
    aiCancelledRef.current = false;
    try {
      const desktopAi = window.studyhubDesktop?.academicAI;
      if (!desktopAi?.noteAction) {
        throw new Error("A geração com Ollama está disponível no aplicativo desktop.");
      }

      const studyModeInstruction =
        "MODO ESTUDO: transforme o pedido em recuperação ativa. Distribua os cartões entre definição/ideia central, quando usar, comparação ou trade-off e um exemplo de aplicação quando isso fizer sentido. Faça perguntas específicas, com uma única habilidade por cartão, e não repita a mesma resposta.";
      const languageModeInstruction =
        "MODO IDIOMAS: foque exclusivamente em aprender e usar a palavra ou frase no idioma original, com tradução contextual e exemplo curto no idioma original.";
      const modeInstruction =
        aiInputMode === "prompt"
          ? `MODO PROMPT LIVRE: siga exatamente o pedido do usuário como objetivo dos cartões. Extraia o tema ou habilidade solicitada, sem transformar o pedido em resumo genérico. ${aiMode === "study" ? studyModeInstruction : aiMode === "language" ? languageModeInstruction : ""}`
          : aiMode === "language"
          ? "Trate como aprendizado de idioma: inclua tradução, significado, pronúncia quando útil e exemplo com tradução."
          : aiMode === "study"
            ? studyModeInstruction
            : "Identifique automaticamente se é idioma ou conteúdo acadêmico e aplique o formato adequado.";
      const availableDecks = flashcardDecks.slice(0, 40).map((deck) => ({
        id: deck.id,
        title: deck.title || deck.deckTitle || "Deck sem título",
        tags: deck.tags || [],
      }));
      const targetContext = aiInputMode === "prompt"
        ? `Pedido do usuário: "${query}".
Execute esse pedido criando os cartões solicitados. Se o pedido mencionar uma palavra ou frase, ensine seu uso com exemplos claros e curtos.`
        : markedText
        ? `A frase/contexto completo é: "${query}".
O trecho marcado pelo usuário é: "${markedText}".
Baseie o flashcard principalmente no trecho marcado, mas use a frase completa para entender seu significado, tradução e uso. Não ignore o contexto.`
        : `O conteúdo fornecido é: "${query}".`;
      const markedCardFormat = markedText
        ? `FORMATO OBRIGATÓRIO DA FRENTE: comece com exatamente o trecho destacado "${markedText}". Em seguida, em uma nova linha, escreva "Example: ${query}". Não deixe apenas a palavra na frente e não substitua a frase pelo contexto resumido.`
        : "";
      const generationContext = `Crie exatamente ${aiCardCount} flashcard(s) distintos.
${targetContext}
Modo: ${modeInstruction}
Adapte a explicação ao nível necessário para entender o tema, sem tornar a resposta complexa ou longa.
${markedCardFormat}
BARALHOS EXISTENTES (escolha um somente se o tema combinar; caso contrário, indique um novo): ${JSON.stringify(availableDecks)}
Cada frente deve testar uma única ideia e cada verso deve ser curto, correto e autocontido.
LIMITE DE TAMANHO: no máximo 35 palavras por frente e 55 palavras por verso; use no máximo 3 linhas curtas no verso. Não escreva introdução, conclusão, aula completa ou vários parágrafos. Inclua somente a informação necessária para lembrar e revisar rapidamente. Evite perguntas repetidas. Quando ajudar a memorização, inclua apenas um exemplo OU uma dica mnemônica curta.`;

      const response = await desktopAi.noteAction({
        title: `Flashcards rápidos: ${markedText || query}`,
        content: generationContext,
        kind: "flashcards",
        flashcardMode: aiMode,
        scopeMode: "free",
        responseLength: "short",
        cardCount: aiCardCount,
        includeDeckMetadata: true,
        availableDecks,
        model: preferredAiModel || undefined,
        requestId,
      });

      const cards = Array.isArray(response?.data?.cards)
        ? response.data.cards
        : Array.isArray(response?.data?.flashcards)
          ? response.data.flashcards
          : Array.isArray(response?.data?.items)
            ? response.data.items
        : response?.data?.front || response?.data?.back
              ? [response.data]
              : [];
      const suggestedTags = Array.isArray(response?.data?.tags)
        ? response.data.tags.map((tag) => String(tag).trim().replace(/^#/, "")).filter(Boolean).slice(0, 8)
        : [];
      const fallbackDeckTitle = cleanGeneratedDeckTitle(
        markedText || query,
        "Revisão com IA",
      );
      const generatedDeckTitle = cleanGeneratedDeckTitle(
        response?.data?.deckTitle,
        fallbackDeckTitle,
      );
      setAiDeckTitle(generatedDeckTitle);
      setAiTags(suggestedTags);
      const suggestedDeckId = String(response?.data?.deckId || "");
      const matchingDeckId = availableDecks.some((deck) => deck.id === suggestedDeckId)
        ? suggestedDeckId
        : findMatchingDeckId(availableDecks, generatedDeckTitle, suggestedTags, query);
      setSelectedDeckForAi(
        matchingDeckId,
      );
      const normalizedCards = cards
        .map((card, index) => ({
          id: `generated-card-${Date.now()}-${index}`,
          front: markedText
            ? `${markedText}\nExample: ${query}`
            : String(card?.front || card?.question || card?.term || card?.word || "").trim(),
          back: String(card?.back || card?.answer || card?.definition || card?.explanation || "").trim(),
          tags: Array.isArray(card?.tags)
            ? card.tags.map((tag) => String(tag).trim().replace(/^#/, "")).filter(Boolean)
            : suggestedTags,
          selected: true,
        }))
        .filter((card) => card.front && card.back)
        .slice(0, aiCardCount);

      if (!normalizedCards.length) {
        throw new Error("O Ollama não retornou flashcards válidos. Tente novamente ou escolha outro modelo.");
      }
      setGeneratedCards(normalizedCards);
    } catch (error) {
      setGeneratedCards([]);
      if (!aiCancelledRef.current) {
        setAiError(error?.message || "Não foi possível gerar os flashcards com o Ollama.");
      }
    } finally {
      setIsGeneratingAi(false);
      if (aiRequestIdRef.current === requestId) aiRequestIdRef.current = null;
    }
  };

  const handleCancelAiGeneration = async () => {
    const requestId = aiRequestIdRef.current;
    if (!requestId) return;
    aiCancelledRef.current = true;
    try {
      await window.studyhubDesktop?.academicAI?.cancel?.(requestId);
    } finally {
      aiRequestIdRef.current = null;
      setIsGeneratingAi(false);
      setAiStatusMsg("Geração cancelada.");
    }
  };

  const handleGeneratedCardChange = (cardId, field, value) => {
    setGeneratedCards((current) =>
      current.map((card) =>
        card.id === cardId ? { ...card, [field]: value } : card,
      ),
    );
  };

  const handleRemoveGeneratedCard = (cardId) => {
    setGeneratedCards((current) => current.filter((card) => card.id !== cardId));
  };

  const handleToggleGeneratedCard = (cardId) => {
    setGeneratedCards((current) =>
      current.map((card) =>
        card.id === cardId ? { ...card, selected: !card.selected } : card,
      ),
    );
  };

  const handleSaveAiGeneratedCards = async () => {
    const validCards = generatedCards.filter(
      (card) => card.selected && card.front.trim() && card.back.trim(),
    );
    if (!validCards.length) return;

    let targetDeckId = selectedDeckForAi;
    if (!targetDeckId) {
      const newDeckId = `deck-${Date.now()}`;
      addFlashcardDeck({
        id: newDeckId,
        title: aiDeckTitle.trim() || "Flashcards com IA",
        deckTitle: aiDeckTitle.trim() || "Flashcards com IA",
        category: "Geral",
        eyebrow: "IA",
        description: "Flashcards gerados rapidamente por IA",
        tags: aiTags,
        cards: [],
      });
      targetDeckId = newDeckId;
    } else if (aiTags.length) {
      const targetDeck = flashcardDecks.find((deck) => deck.id === targetDeckId);
      updateFlashcardDeck(targetDeckId, {
        tags: Array.from(new Set([...(targetDeck?.tags || []), ...aiTags])),
      });
    }

    validCards.forEach((card) => {
      addFlashcard(targetDeckId, {
        front: card.front.trim(),
        back: card.back.trim(),
        tags: card.tags?.length ? card.tags : aiTags,
      });
    });

    setAiStatusMsg(
      `${validCards.length} flashcard${validCards.length === 1 ? "" : "s"} salvo${validCards.length === 1 ? "" : "s"} no deck!`,
    );
    setGeneratedCards([]);
    setAiInput("");

    // A janela rápida tem seu próprio renderer. Grave imediatamente no
    // SQLite e avise a janela principal para reidratar a Biblioteca de Decks.
    try {
      const database = window.studyhubDesktop?.studyDatabase;
      if (database?.save) await database.save(useStudyStore.getState());
      await window.studyhubDesktop?.notifyStudyDataChanged?.();
      
      // Força recriação da referência do array para garantir re-render no React 
      // caso o usuário esteja na mesma janela (Main Window)
      useStudyStore.setState((state) => ({
        flashcardDecks: [...state.flashcardDecks]
      }));
    } catch (error) {
      console.warn("Não foi possível atualizar a biblioteca imediatamente:", error);
    }

    setTimeout(() => {
      setAiStatusMsg("");
    }, 3500);
  };

  if (isAiQuickMode) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[color:var(--background)] text-[color:var(--on-surface)]">
        <header className="z-10 flex min-h-14 shrink-0 items-center justify-between gap-4 border-b border-[color:var(--outline-variant)] bg-[color:var(--surface-container-lowest)] px-6" style={{ WebkitAppRegion: "drag" }}>
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--primary)]/10 text-[color:var(--primary)]">
              <Icon className="text-[18px]" name="auto_awesome" />
            </span>
            <h1 className="text-sm font-bold text-[color:var(--on-surface)]">Gerar Flashcard com IA</h1>
          </div>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--on-surface-variant)] transition-colors hover:bg-[color:var(--surface-bright)] hover:text-[color:var(--on-surface)]"
            style={{ WebkitAppRegion: "no-drag" }}
            type="button"
            onClick={() => window.close()}
          >
            <Icon name="close" />
          </button>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-6 custom-scrollbar">
          <div className="mx-auto max-w-lg space-y-6">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-[color:var(--on-surface-variant)]" htmlFor="ai-input">
                  Tema, palavra ou conteúdo
                </label>
                <div className="flex gap-1 rounded-lg bg-[color:var(--surface-container-low)] p-1">
                  {[
                    { id: "topic", label: "Tema" },
                    { id: "prompt", label: "Prompt livre" },
                  ].map((inputMode) => (
                    <button
                      key={inputMode.id}
                      type="button"
                      className={`rounded-md px-2.5 py-1 text-[10px] font-bold transition-all ${
                        aiInputMode === inputMode.id
                          ? "bg-[color:var(--primary)] text-white shadow-sm"
                          : "text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]"
                      }`}
                      onClick={() => setAiInputMode(inputMode.id)}
                    >
                      {inputMode.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1 rounded-lg bg-[color:var(--surface-container-low)] p-1">
                  {[
                    { id: "auto", label: "✨ Auto" },
                    { id: "language", label: "🔤 Idiomas" },
                    { id: "study", label: "📚 Estudo" },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition-all ${
                        aiMode === mode.id
                          ? "bg-[color:var(--primary)] text-white shadow-sm"
                          : "text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]"
                      }`}
                      type="button"
                      onClick={() => setAiMode(mode.id)}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  id="ai-input"
                  ref={aiInputRef}
                  className="w-full rounded-xl border border-[color:var(--outline-variant)] bg-[color:var(--surface)] px-4 py-3 text-sm text-[color:var(--on-surface)] outline-none focus:border-[color:var(--primary)]"
                  placeholder={
                    aiInputMode === "prompt"
                      ? "Ex.: Flashcards para eu lembrar do uso da palavra does..."
                      : aiMode === "language"
                      ? "Ex.: Resilience, Ubiquitous, Break a leg..."
                      : aiMode === "study"
                      ? "Ex.: Mitose, Lei de Ohm, Algoritmo Dijkstra..."
                      : "Ex.: Mitose, Resilience, Teorema de Pitágoras..."
                  }
                  type="text"
                  value={aiInput}
                  onChange={(e) => {
                    setAiInput(e.target.value);
                    setSelectedAiText("");
                  }}
                  onSelect={(e) => {
                    const start = e.currentTarget.selectionStart || 0;
                    const end = e.currentTarget.selectionEnd || 0;
                    setSelectedAiText(e.currentTarget.value.slice(start, end).trim());
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !isGeneratingAi) {
                      e.preventDefault();
                      handleGenerateAiCard();
                    }
                  }}
                />
                <button
                  className={`flex shrink-0 items-center gap-2 rounded-xl px-5 py-3 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40 ${isGeneratingAi ? "bg-red-600" : "bg-[color:var(--primary)]"}`}
                  disabled={!aiInput.trim() && !isGeneratingAi}
                  type="button"
                  onClick={isGeneratingAi ? handleCancelAiGeneration : handleGenerateAiCard}
                >
                  <Icon className="text-[18px]" name={isGeneratingAi ? "stop_circle" : "auto_awesome"} />
                  {isGeneratingAi ? "Cancelar" : "Gerar"}
                </button>
              </div>
              {selectedAiText ? (
                <div className="mt-2 flex items-center gap-2 rounded-lg bg-[color:var(--primary)]/10 px-3 py-2 text-[11px] text-[color:var(--primary)]">
                  <Icon className="text-[15px]" name="target" />
                  <span className="min-w-0 flex-1 truncate">
                    Foco selecionado: <strong>“{selectedAiText}”</strong>. A frase será usada como contexto.
                  </span>
                  <button
                    type="button"
                    className="rounded p-0.5 hover:bg-[color:var(--primary)]/15"
                    aria-label="Remover seleção"
                    onClick={() => {
                      setSelectedAiText("");
                      aiInputRef.current?.focus();
                    }}
                  >
                    <Icon className="text-[14px]" name="close" />
                  </button>
                </div>
              ) : (
                <p className="mt-2 text-[10px] text-[color:var(--on-surface-variant)]">
                  Dica: selecione uma palavra dentro da frase para gerar o cartão focado nela com o contexto completo.
                </p>
              )}
            </div>

            <div>
              <div>
                <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-[color:var(--on-surface-variant)]">
                  Quantidade
                </span>
                <div className="grid grid-cols-3 gap-1 rounded-xl bg-[color:var(--surface-container-low)] p-1">
                  {[1, 3, 5].map((count) => (
                    <button
                      key={count}
                      className={`rounded-lg py-2 text-xs font-bold transition-all ${
                        aiCardCount === count
                          ? "bg-[color:var(--primary)] text-white shadow-sm"
                          : "text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]"
                      }`}
                      type="button"
                      onClick={() => setAiCardCount(count)}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-[color:var(--on-surface-variant)]" htmlFor="ai-deck-select">
                  Destino escolhido pela IA
                </label>
                <select
                  id="ai-deck-select"
                  className="w-full rounded-xl border border-[color:var(--outline-variant)] bg-[color:var(--surface)] px-4 py-3 text-sm text-[color:var(--on-surface)] outline-none focus:border-[color:var(--primary)]"
                  value={selectedDeckForAi}
                  onChange={(e) => setSelectedDeckForAi(e.target.value)}
                >
                  <option value="">Criar novo: {aiDeckTitle}</option>
                  {flashcardDecks.map((deck) => (
                    <option key={deck.id} value={deck.id}>
                      {deck.title || deck.deckTitle || "Deck sem título"}
                    </option>
                  ))}
                </select>
              </div>
              {!selectedDeckForAi ? (
                <p className="text-[11px] text-[color:var(--on-surface-variant)]">
                  A IA criará automaticamente o baralho <strong className="text-[color:var(--on-surface)]">{aiDeckTitle}</strong>. Você pode escolher outro destino acima se quiser.
                </p>
              ) : null}
              {aiTags.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-[color:var(--on-surface-variant)]">Tags:</span>
                  {aiTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className="rounded-full bg-[color:var(--primary)]/10 px-2.5 py-1 text-[10px] font-semibold text-[color:var(--primary)]"
                      title="Remover tag"
                      onClick={() => setAiTags((current) => current.filter((item) => item !== tag))}
                    >
                      #{tag} ×
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {aiStatusMsg ? (
              <div className="rounded-xl bg-emerald-500/10 p-4 text-center text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                {aiStatusMsg}
              </div>
            ) : null}

            {aiError ? (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm font-semibold text-red-600 dark:text-red-400">
                {aiError}
              </div>
            ) : null}

            {generatedCards.length > 0 ? (
              <motion.div
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4 rounded-2xl border border-[color:var(--primary)]/30 bg-[color:var(--surface-alt)] p-5 shadow-lg"
                initial={{ opacity: 0, y: 10 }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-[color:var(--on-surface)]">Revise antes de salvar</h2>
                    <p className="mt-0.5 text-[11px] text-[color:var(--on-surface-variant)]">
                      Edite perguntas e respostas para deixar a revisão mais eficiente.
                    </p>
                  </div>
                  <span className="rounded-full bg-[color:var(--primary)]/10 px-2.5 py-1 text-[10px] font-bold text-[color:var(--primary)]">
                    {generatedCards.length} {generatedCards.length === 1 ? "cartão" : "cartões"}
                  </span>
                </div>

                {generatedCards.map((card, index) => (
                  <div
                    key={card.id}
                    className="space-y-3 rounded-xl border border-[color:var(--outline-variant)]/50 bg-[color:var(--surface)] p-4"
                  >
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[color:var(--primary)]">
                        <input
                          className="h-4 w-4 accent-[var(--primary)]"
                          type="checkbox"
                          checked={card.selected !== false}
                          onChange={() => handleToggleGeneratedCard(card.id)}
                        />
                        Cartão {index + 1} · {card.selected !== false ? "salvar" : "ignorado"}
                      </label>
                      <div className="flex items-center gap-1">
                        <button
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-[color:var(--on-surface-variant)] hover:bg-red-500/10 hover:text-red-500"
                          type="button"
                          title="Remover este cartão"
                          onClick={() => handleRemoveGeneratedCard(card.id)}
                        >
                          <Icon className="text-[16px]" name="delete" />
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--on-surface-variant)]" htmlFor={`generated-front-${card.id}`}>
                        Frente
                      </label>
                      <textarea
                        id={`generated-front-${card.id}`}
                        className="mt-1 min-h-16 w-full resize-y rounded-lg border border-[color:var(--outline-variant)]/40 bg-[color:var(--surface-container-lowest)] px-3 py-2 text-sm font-semibold text-[color:var(--on-surface)] outline-none focus:border-[color:var(--primary)]"
                        value={card.front}
                        onChange={(event) => handleGeneratedCardChange(card.id, "front", event.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--on-surface-variant)]" htmlFor={`generated-back-${card.id}`}>
                        Verso
                      </label>
                      <textarea
                        id={`generated-back-${card.id}`}
                        className="mt-1 min-h-20 w-full resize-y rounded-lg border border-[color:var(--outline-variant)]/40 bg-[color:var(--surface-container-lowest)] p-3 text-sm leading-relaxed text-[color:var(--on-surface)] outline-none focus:border-[color:var(--primary)]"
                        value={card.back}
                        onChange={(event) => handleGeneratedCardChange(card.id, "back", event.target.value)}
                      />
                    </div>
                  </div>
                ))}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    className="rounded-xl border border-[color:var(--outline-variant)] px-4 py-2 text-xs font-bold text-[color:var(--on-surface-variant)] transition-colors hover:bg-[color:var(--surface-bright)]"
                    type="button"
                    onClick={() => setGeneratedCards([])}
                  >
                    Descartar
                  </button>
                  <button
                    className="flex items-center gap-2 rounded-xl bg-[color:var(--primary)] px-5 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90"
                    type="button"
                    onClick={handleSaveAiGeneratedCards}
                  >
                    <Icon className="text-[16px]" name="check" />
                    Salvar {generatedCards.filter((card) => card.selected !== false).length === 1 ? "1 cartão" : `${generatedCards.filter((card) => card.selected !== false).length} cartões`}
                  </button>
                </div>
              </motion.div>
            ) : null}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[color:var(--background)] text-[color:var(--on-surface)]">
      <header className="z-10 flex min-h-16 shrink-0 items-center justify-between gap-4 border-b border-[color:var(--outline-variant)] bg-[color:var(--surface-container-lowest)] px-4 md:px-8">
        <button
          className="inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--on-surface-variant)] transition-colors hover:text-[color:var(--primary)]"
          type="button"
          onClick={handleCancel}
        >
          <Icon className="text-[20px]" name="arrow_back" />
          Voltar aos decks
        </button>
        <span className="hidden text-xs font-bold uppercase tracking-[0.1em] text-[color:var(--on-surface-variant)] sm:block">
          {activeDeck ? "Editando deck" : "Novo deck"}
        </span>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-8 custom-scrollbar md:px-8 md:py-12">
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto max-w-4xl"
            initial={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
          >
            <div className="max-w-2xl">
              <h2 className="text-3xl font-semibold tracking-tight text-[color:var(--on-surface)] md:text-[40px]">
                {activeDeck ? "Editar deck" : "Criar novo deck"}
              </h2>
              <p className="mt-3 text-base leading-7 text-[color:var(--on-surface-variant)] md:text-[18px]">
                Organize perguntas e respostas para suas sessões de revisão.
              </p>
            </div>

            <div className="mt-10 space-y-8">
              <section className="rounded-lg border border-[color:var(--outline-variant)] bg-[color:var(--surface-alt)] p-5 md:p-8">
                <h3 className="mb-7 flex items-center gap-3 text-xl font-medium tracking-tight text-[color:var(--on-surface)] md:text-[24px]">
                  <Icon className="text-[22px]" name="info" />
                  Informações do deck
                </h3>

                <div className="space-y-7">
                  <div>
                    <label className="mb-2 block text-[12px] font-semibold uppercase tracking-[0.08em] text-[color:var(--on-surface-variant)]" htmlFor="deck-name">
                      Nome do deck
                    </label>
                    <input
                      id="deck-name"
                      className="w-full rounded border border-[color:var(--outline-variant)] bg-[color:var(--surface-container-lowest)] px-4 py-3 text-[16px] text-[color:var(--on-surface)] outline-none transition-colors placeholder:text-[color:var(--on-surface-variant)]/70 focus:border-[color:var(--primary)]"
                      placeholder="Ex.: Estruturas de dados"
                      type="text"
                      value={deckTitle}
                      onChange={(event) => setDeckTitle(event.target.value)}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-[12px] font-semibold uppercase tracking-[0.08em] text-[color:var(--on-surface-variant)]" htmlFor="discipline">
                      Disciplina
                    </label>
                    <div className="relative">
                      <select
                        id="discipline"
                        className="w-full appearance-none rounded border border-[color:var(--outline-variant)] bg-[color:var(--surface-container-lowest)] px-4 py-3 pr-12 text-[16px] text-[color:var(--on-surface)] outline-none transition-colors focus:border-[color:var(--primary)]"
                        value={disciplineId}
                        onChange={(event) => setDisciplineId(event.target.value)}
                      >
                        <option value="">Sem disciplina</option>
                        {academicSubjects
                          .filter((subject) => !subject.isArchived)
                          .map((subject) => (
                          <option key={subject.id} value={subject.id}>
                            {subject.name || subject.title}
                          </option>
                          ))}
                      </select>
                      <Icon
                        className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[22px] text-[color:var(--on-surface-variant)]"
                        name="expand_more"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-[12px] font-semibold uppercase tracking-[0.08em] text-[color:var(--on-surface-variant)]" htmlFor="description">
                      Descrição (opcional)
                    </label>
                    <textarea
                      id="description"
                      className="min-h-[104px] w-full resize-y rounded border border-[color:var(--outline-variant)] bg-[color:var(--surface-container-lowest)] px-4 py-3 text-[16px] text-[color:var(--on-surface)] outline-none transition-colors placeholder:text-[color:var(--on-surface-variant)]/70 focus:border-[color:var(--primary)]"
                      placeholder="Contexto ou objetivo deste deck..."
                      rows={4}
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                    />
                  </div>
                </div>
              </section>

              {draftCards.map((card, index) => {
                const isFirst = index === 0;
                return (
                  <section
                    key={card.id}
                    className="relative overflow-hidden rounded-lg border border-[color:var(--outline-variant)] bg-[color:var(--surface-alt)] p-5 md:p-8"
                  >
                    <div className="absolute bottom-0 left-0 top-0 w-1 bg-[color:var(--secondary)] opacity-50" />
                    <div className="mb-8 flex items-center justify-between">
                      <h3 className="flex items-center gap-3 text-[20px] font-medium tracking-tight text-[color:var(--on-surface)]">
                        <Icon className="text-[20px]" name="style" />
                        {isFirst ? "Primeiro cartão" : `Cartão ${index + 1}`}
                      </h3>
                      <div className="text-[11px] uppercase leading-none tracking-[0.12em] text-[color:var(--on-surface-variant)]">
                        Cartão
                        <br />
                        {index + 1}
                      </div>
                    </div>

                    <div className="space-y-7">
                      <div>
                        <label className="mb-2 block text-[12px] font-semibold uppercase tracking-[0.08em] text-[color:var(--on-surface-variant)]" htmlFor={`card-front-${card.id}`}>
                          Frente (pergunta)
                        </label>
                        <textarea
                          id={`card-front-${card.id}`}
                          className="min-h-[72px] w-full resize-y rounded border border-[color:var(--outline-variant)] bg-[color:var(--surface-container-lowest)] px-4 py-3 text-[18px] leading-7 text-[color:var(--on-surface)] outline-none transition-colors placeholder:text-[color:var(--on-surface-variant)]/70 focus:border-[color:var(--primary)]"
                          placeholder="Digite a pergunta ou termo..."
                          rows={2}
                          value={card.front}
                          onChange={(event) =>
                            handleDraftChange(card.id, "front", event.target.value)
                          }
                        />
                      </div>

                      <div className="flex items-center justify-center py-1">
                        <div className="h-px flex-1 bg-[color:var(--outline-variant)]" />
                        <Icon className="px-4 text-[22px] text-[color:var(--outline-variant)]" name="swap_vert" />
                        <div className="h-px flex-1 bg-[color:var(--outline-variant)]" />
                      </div>

                      <div>
                        <label className="mb-2 block text-[12px] font-semibold uppercase tracking-[0.08em] text-[color:var(--on-surface-variant)]" htmlFor={`card-back-${card.id}`}>
                          Verso (resposta)
                        </label>
                        <textarea
                          id={`card-back-${card.id}`}
                          className="min-h-[132px] w-full resize-y rounded border border-[color:var(--outline-variant)] bg-[color:var(--surface-container-lowest)] px-4 py-3 text-[16px] leading-7 text-[color:var(--on-surface)] outline-none transition-colors placeholder:text-[color:var(--on-surface-variant)]/70 focus:border-[color:var(--primary)]"
                          placeholder="Digite a resposta ou explicação..."
                          rows={4}
                          value={card.back}
                          onChange={(event) =>
                            handleDraftChange(card.id, "back", event.target.value)
                          }
                        />
                      </div>
                    </div>

                    {draftCards.length > 1 ? (
                      <div className="mt-4 flex justify-end">
                        <button
                          className="rounded px-3 py-2 text-sm text-[color:var(--on-surface-variant)] transition-colors hover:text-[color:var(--error)]"
                          type="button"
                          onClick={() => handleRemoveCard(card.id)}
                        >
                          Remover cartão
                        </button>
                      </div>
                    ) : null}
                  </section>
                );
              })}

              <div className="flex flex-col gap-6 border-t border-[color:var(--outline-variant)] pt-7 md:flex-row md:items-center md:justify-between">
                <button
                  className="inline-flex h-12 items-center gap-3 rounded border border-[color:var(--outline)] bg-transparent px-6 text-[12px] font-semibold uppercase tracking-[0.14em] text-[color:var(--secondary)] transition-colors hover:bg-[color:var(--surface-container-low)]"
                  type="button"
                  onClick={handleAddCard}
                >
                  <Icon className="text-[18px]" name="add" />
                  Adicionar outro cartão
                </button>

                <div className="flex items-center gap-5">
                  <button
                    className="text-[16px] font-medium text-[color:var(--on-surface-variant)] transition-colors hover:text-[color:var(--primary)]"
                    type="button"
                    onClick={handleCancel}
                  >
                    Cancelar
                  </button>
                  <button
                    className="inline-flex h-12 items-center gap-3 rounded bg-[color:var(--primary-container)] px-7 text-[12px] font-semibold uppercase tracking-[0.14em] text-[color:var(--on-primary)] transition-opacity hover:opacity-90"
                    type="button"
                    onClick={handleSaveDeck}
                  >
                    <Icon className="text-[18px]" name="save" filled />
                    {activeDeck ? "Salvar alterações" : "Salvar deck"}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
      </main>
    </div>
  );
}
