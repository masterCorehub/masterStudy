import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../../ui/Icon";
import { useStudyStore } from "../../store/useStore";
import { isPrimaryShortcut, shortcutLabel } from "../../utils/keyboardShortcuts";

const LANGUAGE_OPTIONS = [
  { value: "auto", label: "Detectar idioma" },
  { value: "pt", label: "Português" },
  { value: "en", label: "Inglês" },
  { value: "es", label: "Espanhol" },
  { value: "fr", label: "Francês" },
  { value: "de", label: "Alemão" },
  { value: "it", label: "Italiano" },
  { value: "ja", label: "Japonês" },
];

const INITIAL_SESSION = {
  sourceText: "",
  translatedText: "",
  ocrText: "",
  sourceLanguage: "auto",
  targetLanguage: "pt",
  detectedLanguage: "",
  progressMessage: "",
  status: "idle",
  error: "",
  isOcrSession: false,
};

const BUSY_STATUSES = new Set(["capturing", "ocr", "translating"]);

const getTranslatorApi = () => globalThis.window?.studyhubDesktop?.translator;

const getResultText = (raw) => {
  if (typeof raw?.translatedText === "string") return raw.translatedText;
  if (typeof raw?.translation === "string") return raw.translation;
  if (typeof raw?.result === "string") return raw.result;
  if (typeof raw?.result?.translatedText === "string") return raw.result.translatedText;
  if (typeof raw?.result?.text === "string") return raw.result.text;
  return undefined;
};

const normalizeSession = (value, previous = INITIAL_SESSION) => {
  const raw = value?.session ?? value ?? {};
  if (typeof raw === "string") {
    return { ...previous, translatedText: raw, status: "done", error: "" };
  }

  const hasOcrText = typeof raw.ocrText === "string" && raw.ocrText.trim().length > 0;
  const sourceText = raw.sourceText ?? raw.ocrText ?? raw.inputText ?? raw.text;
  const translatedText = getResultText(raw);

  return {
    ...previous,
    ...raw,
    sourceText: sourceText ?? previous.sourceText,
    translatedText: translatedText ?? previous.translatedText,
    ocrText: raw.ocrText ?? previous.ocrText,
    sourceLanguage: raw.sourceLanguage ?? raw.from ?? previous.sourceLanguage ?? "auto",
    targetLanguage: raw.targetLanguage ?? raw.to ?? previous.targetLanguage ?? "pt",
    detectedLanguage: raw.detectedLanguage ?? previous.detectedLanguage,
    progressMessage: raw.progressMessage ?? raw.message ?? previous.progressMessage,
    status: raw.status ?? previous.status,
    error: Object.prototype.hasOwnProperty.call(raw, "error")
      ? raw.error?.message ?? raw.error ?? ""
      : previous.error,
    isOcrSession:
      raw.mode === "text"
        ? false
        : raw.mode === "capture"
          || raw.mode === "ocr"
          || raw.status === "ocr"
          || hasOcrText
          || previous.isOcrSession,
  };
};

const statusCopy = (session) => {
  if (session.progressMessage && BUSY_STATUSES.has(session.status)) {
    return session.progressMessage;
  }

  switch (session.status) {
    case "capturing":
      return "Selecione uma área da tela";
    case "ocr":
      return "Lendo o texto da imagem…";
    case "translating":
      return "Traduzindo…";
    case "done":
      return session.detectedLanguage
        ? `Idioma detectado: ${String(session.detectedLanguage).toUpperCase()}`
        : "Tradução concluída";
    case "error":
      return "Não foi possível concluir";
    default:
      return "Pronto para traduzir";
  }
};

function LanguageSelect({ label, value, onChange, allowAuto = false, disabled = false }) {
  const options = allowAuto
    ? LANGUAGE_OPTIONS
    : LANGUAGE_OPTIONS.filter((option) => option.value !== "auto");

  return (
    <label className="min-w-0 flex-1">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        className="h-9 w-full truncate rounded-xl border border-[color:var(--outline-variant)]/60 bg-[color:var(--surface-bright)] px-3 text-xs font-bold text-[color:var(--on-surface)] outline-none transition focus:border-[color:var(--primary)] focus:ring-2 focus:ring-[color:var(--primary)]/15 disabled:opacity-50"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TranslatorPopup() {
  const liveTranslationCapture = useStudyStore((state) => Boolean(state.appSettings?.liveTranslationCapture));
  const inputRef = useRef(null);
  const copiedTimerRef = useRef(null);
  const mountedRef = useRef(true);
  const [session, setSession] = useState(INITIAL_SESSION);
  const [pendingAction, setPendingAction] = useState("");
  const [copied, setCopied] = useState(false);
  const [flashcardCreated, setFlashcardCreated] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const speechRef = useRef(null);
  const audioRef = useRef(null);
  const speechRequestRef = useRef(0);
  const [selectedFlashcardDeckId, setSelectedFlashcardDeckId] = useState("deck-traducoes-rapidas");
  const flashcardDecks = useStudyStore((state) => state.flashcardDecks);

  const applySession = useCallback((nextSession) => {
    if (!mountedRef.current || nextSession == null) return;
    setSession((current) => normalizeSession(nextSession, current));
  }, []);

  const showError = useCallback((error, fallback) => {
    if (!mountedRef.current) return;
    setSession((current) => ({
      ...current,
      status: "error",
      error: error?.message || fallback,
      progressMessage: "",
    }));
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const api = getTranslatorApi();
    let unsubscribe;

    if (!api) {
      showError(null, "O tradutor não está disponível. Reinicie o StudyHub.");
    } else {
      Promise.resolve(api.getSession?.())
        .then(applySession)
        .catch((error) => showError(error, "Não foi possível abrir o tradutor."));

      unsubscribe = api.onSessionChanged?.(applySession);
    }

    const focusTimer = globalThis.setTimeout(() => inputRef.current?.focus(), 60);

    return () => {
      mountedRef.current = false;
      globalThis.window?.speechSynthesis?.cancel?.();
      audioRef.current?.pause?.();
      audioRef.current = null;
      globalThis.clearTimeout(focusTimer);
      globalThis.clearTimeout(copiedTimerRef.current);
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [applySession, showError]);

  const handleClose = useCallback(() => {
    try {
      getTranslatorApi()?.close?.();
    } catch {
      // The native window may already be closing.
    }
  }, []);

  const handleTranslate = useCallback(async () => {
    const text = session.sourceText.trim();
    if (!text || pendingAction) {
      if (!text) showError(null, "Digite ou cole um texto para traduzir.");
      return;
    }

    const api = getTranslatorApi();
    if (!api?.translate) {
      showError(null, "O serviço de tradução não está disponível.");
      return;
    }

    setPendingAction("translate");
    setSession((current) => ({
      ...current,
      sourceText: text,
      status: "translating",
      error: "",
      progressMessage: "Traduzindo…",
    }));

    try {
      const result = await api.translate({
        text,
        sourceLanguage: session.sourceLanguage,
        targetLanguage: session.targetLanguage,
      });
      applySession(result);
    } catch (error) {
      showError(error, "Não foi possível traduzir. Verifique sua conexão.");
    } finally {
      if (mountedRef.current) setPendingAction("");
    }
  }, [applySession, pendingAction, session.sourceLanguage, session.sourceText, session.targetLanguage, showError]);

  const handleStartCapture = async () => {
    if (pendingAction || BUSY_STATUSES.has(session.status)) return;
    const api = getTranslatorApi();
    if (!api?.startCapture) {
      showError(null, "A captura de tela não está disponível.");
      return;
    }

    setPendingAction("capture");
    setSession((current) => ({
      ...current,
      status: "capturing",
      error: "",
      progressMessage: "Preparando a captura…",
    }));

    try {
      const result = await api.startCapture({ mode: liveTranslationCapture ? "live" : "frozen" });
      applySession(result);
    } catch (error) {
      showError(error, "Não foi possível iniciar a captura.");
    } finally {
      if (mountedRef.current) setPendingAction("");
    }
  };

  const handleRetryOcr = async () => {
    if (pendingAction) return;
    const api = getTranslatorApi();
    if (!api?.retryOcr) return;

    setPendingAction("ocr");
    setSession((current) => ({
      ...current,
      status: "ocr",
      error: "",
      progressMessage: "Lendo o texto novamente…",
    }));

    try {
      const result = await api.retryOcr();
      applySession(result);
    } catch (error) {
      showError(error, "Não foi possível ler o texto da imagem.");
    } finally {
      if (mountedRef.current) setPendingAction("");
    }
  };

  const handleCopy = async () => {
    const text = session.translatedText.trim();
    if (!text) return;

    try {
      const api = getTranslatorApi();
      if (api?.copyText) await api.copyText(text);
      else await globalThis.navigator?.clipboard?.writeText(text);

      setCopied(true);
      globalThis.clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = globalThis.setTimeout(() => {
        if (mountedRef.current) setCopied(false);
      }, 1800);
    } catch (error) {
      showError(error, "Não foi possível copiar a tradução.");
    }
  };

  const handleSpeak = async () => {
    const text = session.translatedText.trim();
    const translatorApi = getTranslatorApi();
    const language = session.targetLanguage === "auto" ? session.detectedLanguage : session.targetLanguage;
    if (isSpeaking && translatorApi?.stopSpeech) {
      speechRequestRef.current += 1;
      await translatorApi.stopSpeech();
      audioRef.current?.pause?.();
      audioRef.current = null;
      setIsSpeaking(false);
      return;
    }
    if (text && translatorApi?.speak) {
      const requestId = speechRequestRef.current + 1;
      speechRequestRef.current = requestId;
      setIsSpeaking(true);
      const result = await translatorApi.speak({ text, language });
      if (speechRequestRef.current !== requestId) return;
      if (result?.audioBase64) {
        const audio = new Audio(`data:${result.mimeType || "audio/wav"};base64,${result.audioBase64}`);
        audioRef.current = audio;
        audio.onended = () => {
          audioRef.current = null;
          setIsSpeaking(false);
        };
        audio.onerror = () => {
          audioRef.current = null;
          setIsSpeaking(false);
          showError(null, "Não foi possível reproduzir a voz do Kokoro.");
        };
        await audio.play();
        return;
      }
      setIsSpeaking(false);
      if (result?.ok) return;
      if (result?.error) showError(null, result.error);
      return;
    }
    const win = globalThis.window;
    const synthesis = win?.speechSynthesis;
    const Utterance = win?.SpeechSynthesisUtterance;
    if (!text || !synthesis || typeof Utterance !== "function") {
      showError(null, "A leitura em voz alta não está disponível neste sistema.");
      return;
    }
    if (isSpeaking) {
      synthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    synthesis.cancel();
    const utterance = new Utterance(text);
    const languageCode = String(language || "").split("-")[0];
    if (languageCode && languageCode !== "undefined") {
      utterance.lang = languageCode;
      const voice = synthesis.getVoices?.().find((item) => item.lang?.toLowerCase().startsWith(languageCode.toLowerCase()));
      if (voice) utterance.voice = voice;
    }
    utterance.rate = 0.92;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    speechRef.current = utterance;
    synthesis.speak(utterance);
  };

  const handleCreateFlashcard = async () => {
    const text = session.translatedText.trim();
    if (!text) return;

    let store = useStudyStore.getState();
    const globalDeckId = "deck-traducoes-rapidas";
    const deckId = selectedFlashcardDeckId || globalDeckId;
    const deckExists = store.flashcardDecks.some((deck) => deck.id === deckId);
    
    if (!deckExists) {
      store.addFlashcardDeck({
        id: deckId,
        title: "Traduções Rápidas",
        description: "Flashcards criados a partir do tradutor rápido.",
        tags: ["Tradutor"],
        color: "bg-blue-500",
      });
      store = useStudyStore.getState();
    }

    const card = {
      front: session.sourceText,
      back: session.translatedText,
      tags: ["Tradutor"],
    };
    store.addFlashcard(deckId, card);

    // The translator runs in its own Electron window. Persist explicitly so
    // the card is available immediately in the main window and after restart.
    const persistedState = useStudyStore.getState();
    const savedDeck = persistedState.flashcardDecks.find((deck) => deck.id === deckId);
    if (!savedDeck || !savedDeck.cards.some((item) => item.front === card.front && item.back === card.back)) {
      throw new Error("Não foi possível salvar o flashcard no baralho selecionado.");
    }
    await globalThis.window?.studyhubDesktop?.studyDatabase?.save?.(persistedState);

    await globalThis.window?.studyhubDesktop?.notifyStudyDataChanged?.();

    setFlashcardCreated(true);
    globalThis.setTimeout(() => {
      if (mountedRef.current) setFlashcardCreated(false);
    }, 1800);
  };

  const handleSwapLanguages = () => {
    if (BUSY_STATUSES.has(session.status)) return;
    const detected = String(session.detectedLanguage || "").split("-")[0].toLowerCase();
    const nextTarget = session.sourceLanguage === "auto"
      ? (detected && detected !== session.targetLanguage ? detected : "en")
      : session.sourceLanguage;

    setSession((current) => ({
      ...current,
      sourceLanguage: current.targetLanguage,
      targetLanguage: nextTarget,
      sourceText: current.translatedText || current.sourceText,
      translatedText: current.translatedText ? current.sourceText : "",
      status: "idle",
      error: "",
      progressMessage: "",
    }));
    globalThis.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const updateDraft = (sourceText) => {
    speechRequestRef.current += 1;
    globalThis.window?.speechSynthesis?.cancel?.();
    setIsSpeaking(false);
    setSession((current) => ({
      ...current,
      sourceText,
      translatedText: "",
      status: "idle",
      error: "",
      progressMessage: "",
    }));
  };

  const updateLanguage = (field, value) => {
    setSession((current) => ({
      ...current,
      [field]: value,
      translatedText: "",
      status: "idle",
      error: "",
      progressMessage: "",
    }));
  };

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      handleClose();
      return;
    }
    if (event.key === "Enter" && isPrimaryShortcut(event)) {
      event.preventDefault();
      handleTranslate();
    }
  };

  const busy = Boolean(pendingAction) || BUSY_STATUSES.has(session.status);
  const hasResult = Boolean(session.translatedText.trim());
  const statusTone = session.status === "error"
    ? "bg-red-500"
    : session.status === "done"
      ? "bg-emerald-500"
      : busy
        ? "bg-amber-500 animate-pulse"
        : "bg-[color:var(--outline)]";

  return (
    <main
      className="flex h-screen w-screen flex-col overflow-hidden bg-[color:var(--surface)] text-[color:var(--on-surface)]"
      onKeyDown={handleKeyDown}
    >
      <header
        className="flex h-12 shrink-0 select-none items-center gap-3 border-b border-[color:var(--outline-variant)]/45 px-4"
        style={{ WebkitAppRegion: "drag" }}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[color:var(--primary)]/12 text-[color:var(--primary)]">
          <Icon className="text-lg" name="translate" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-black tracking-tight">Tradutor rápido</h1>
          <p className="truncate text-[10px] font-semibold text-[color:var(--on-surface-variant)]">
            StudyHub
          </p>
        </div>
        <button
          aria-label="Fechar tradutor"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--on-surface-variant)] transition hover:bg-red-500/10 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-500/30"
          onClick={handleClose}
          style={{ WebkitAppRegion: "no-drag" }}
          type="button"
        >
          <Icon className="text-lg" name="close" />
        </button>
      </header>

      <div className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        <div className="flex items-center gap-2">
          <LanguageSelect
            allowAuto
            disabled={busy}
            label="Idioma de origem"
            onChange={(value) => updateLanguage("sourceLanguage", value)}
            value={session.sourceLanguage}
          />
          <button
            aria-label="Trocar idiomas"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[color:var(--outline-variant)]/60 bg-[color:var(--surface-bright)] text-[color:var(--primary)] transition hover:border-[color:var(--primary)] hover:bg-[color:var(--primary)]/10 focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/20 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={busy}
            onClick={handleSwapLanguages}
            title="Trocar idiomas"
            type="button"
          >
            <Icon className="text-lg" name="swap_horiz" />
          </button>
          <LanguageSelect
            disabled={busy}
            label="Idioma de destino"
            onChange={(value) => updateLanguage("targetLanguage", value)}
            value={session.targetLanguage}
          />
        </div>

        <section className="rounded-2xl border border-[color:var(--outline-variant)]/55 bg-[color:var(--surface-bright)] p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-3">
            <label className="text-[11px] font-black uppercase tracking-[0.12em] text-[color:var(--on-surface-variant)]" htmlFor="translator-source">
              Texto original
            </label>
            {session.isOcrSession ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--primary)]/10 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-[color:var(--primary)]">
                <Icon className="text-xs" name="document_scanner" /> OCR
              </span>
            ) : null}
          </div>
          <textarea
            aria-describedby="translator-shortcut"
            className="custom-scrollbar h-24 w-full resize-none bg-transparent text-sm font-medium leading-6 outline-none placeholder:text-[color:var(--outline)] disabled:opacity-65"
            disabled={busy}
            id="translator-source"
            onChange={(event) => updateDraft(event.target.value)}
            placeholder="Digite ou cole o texto aqui…"
            ref={inputRef}
            spellCheck="true"
            value={session.sourceText}
          />
        </section>

        <section className="mb-5 min-h-[116px] rounded-2xl border border-[color:var(--primary)]/20 bg-[color:var(--primary)]/[0.06] p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[color:var(--primary)]">
              Tradução
            </p>
            <div className="flex gap-2">
              <button
                aria-label={isSpeaking ? "Parar leitura" : "Ouvir tradução"}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[color:var(--primary)] transition hover:bg-[color:var(--primary)]/10 focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/20 disabled:cursor-not-allowed disabled:opacity-35"
                disabled={!hasResult}
                onClick={handleSpeak}
                title={isSpeaking ? "Parar leitura" : "Ouvir tradução"}
                type="button"
              >
                <Icon className="text-sm" name={isSpeaking ? "cancel" : "volume_up"} />
              </button>
              <button
                aria-label={flashcardCreated ? "Flashcard criado" : "Criar Flashcard"}
                className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[10px] font-black text-[color:var(--primary)] transition hover:bg-[color:var(--primary)]/10 focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/20 disabled:cursor-not-allowed disabled:opacity-35"
                disabled={!hasResult || flashcardCreated}
                onClick={handleCreateFlashcard}
                type="button"
              >
                <Icon className="text-sm" name={flashcardCreated ? "check" : "style"} />
                {flashcardCreated ? "Criado" : "Flashcard"}
              </button>
              <button
                aria-label={copied ? "Tradução copiada" : "Copiar tradução"}
                className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[10px] font-black text-[color:var(--primary)] transition hover:bg-[color:var(--primary)]/10 focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/20 disabled:cursor-not-allowed disabled:opacity-35"
                disabled={!hasResult}
                onClick={handleCopy}
                type="button"
              >
                <Icon className="text-sm" name={copied ? "check" : "content_copy"} />
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
          </div>
          {busy && !hasResult ? (
            <div className="flex h-16 items-center gap-3 text-sm font-semibold text-[color:var(--on-surface-variant)]">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-[color:var(--primary)]/25 border-t-[color:var(--primary)]" />
              {statusCopy(session)}
            </div>
          ) : (
            <textarea
              aria-label="Texto traduzido"
              className="custom-scrollbar h-16 w-full resize-none bg-transparent text-sm font-semibold leading-6 outline-none placeholder:text-[color:var(--outline)]"
              placeholder="A tradução aparecerá aqui."
              readOnly
              value={session.translatedText}
            />
          )}
          {hasResult ? (
            <label className="mt-2 mb-6 flex w-full cursor-pointer items-center gap-2 rounded-lg bg-[color:var(--surface)]/45 px-2 py-1.5 text-[10px] font-bold text-[color:var(--on-surface-variant)]">
              <Icon className="text-sm text-[color:var(--primary)]" name="folder" />
              Salvar em
              <select
                className="translator-deck-select h-9 min-w-0 flex-1 cursor-pointer rounded-md bg-[color:var(--surface-bright)] px-2 text-[10px] font-black text-[color:var(--on-surface)] outline-none"
                onChange={(event) => setSelectedFlashcardDeckId(event.target.value)}
                value={selectedFlashcardDeckId}
              >
                <option value="deck-traducoes-rapidas">Traduções rápidas</option>
                {flashcardDecks
                  .filter((deck) => deck.id !== "deck-traducoes-rapidas")
                  .map((deck) => (
                    <option key={deck.id} value={deck.id}>{deck.title}</option>
                  ))}
              </select>
            </label>
          ) : null}
        </section>

        <div aria-live="polite" className="min-h-5 px-1" role={session.status === "error" ? "alert" : "status"}>
          {session.status !== "idle" ? (
            <div className="flex items-start gap-2 text-[11px] font-semibold text-[color:var(--on-surface-variant)]">
              <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${statusTone}`} />
              <span className={session.status === "error" ? "text-red-600" : ""}>
                {session.status === "error" ? session.error || statusCopy(session) : statusCopy(session)}
              </span>
            </div>
          ) : null}
        </div>

        <div className="mt-auto grid grid-cols-[auto_1fr] gap-2">
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[color:var(--outline-variant)]/60 bg-[color:var(--surface-bright)] px-3 text-xs font-black text-[color:var(--on-surface-variant)] transition hover:border-[color:var(--primary)] hover:text-[color:var(--primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/20 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={busy}
            onClick={handleStartCapture}
            title="Traduzir uma área da tela"
            type="button"
          >
            <Icon className="text-lg" name="screenshot_region" />
            Capturar
          </button>
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-xs font-black text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/35 focus:ring-offset-2 focus:ring-offset-[color:var(--surface)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy || !session.sourceText.trim()}
            onClick={handleTranslate}
            type="button"
          >
            {session.status === "translating" ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/35 border-t-white" />
            ) : (
              <Icon className="text-lg" name="translate" />
            )}
            Traduzir
          </button>
        </div>

        {session.status === "error" && session.isOcrSession ? (
          <button
            className="-mt-1 self-start rounded-lg px-2 py-1 text-[11px] font-black text-[color:var(--primary)] underline decoration-[color:var(--primary)]/30 underline-offset-4 disabled:opacity-45"
            disabled={Boolean(pendingAction)}
            onClick={handleRetryOcr}
            type="button"
          >
            Tentar ler a imagem novamente
          </button>
        ) : null}

        <div className="space-y-1 text-center text-[9px] font-semibold text-[color:var(--outline)]">
          <p>OCR local · somente o texto é enviado para tradução</p>
          <p id="translator-shortcut">{shortcutLabel("Mod+Enter")} para traduzir · Esc para fechar</p>
        </div>
      </div>
    </main>
  );
}

export default TranslatorPopup;
