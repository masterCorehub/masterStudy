import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Icon } from "../../ui/Icon";
import { getLocalFilePath, getLocalFileUrl } from "../../utils/localFileUrl";
import { getGuidedReadingProgress, groupPdfTextItems } from "./pdfGuidedUtils";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const isWebUrl = (value) => /^(?:https?:|data:|blob:)/i.test(String(value || ""));

function getPdfSource(value) {
  const source = String(value || "").trim();
  if (isWebUrl(source) || (source.startsWith("/") && !/^\/[A-Za-z]:[\\/]/.test(source))) {
    return source;
  }
  return getLocalFileUrl(source);
}

async function resolvePdfDocumentSource(value) {
  const source = String(value || "").trim();
  if (!source) return source;
  if (isWebUrl(source) || (source.startsWith("/") && !/^\/[A-Za-z]:[\\/]/.test(source))) {
    return getPdfSource(source);
  }
  const localPath = getLocalFilePath(source);
  if (!localPath || !window.studyhubDesktop?.readFileBinary) {
    return getPdfSource(source);
  }
  const binary = await window.studyhubDesktop.readFileBinary(localPath);
  if (binary instanceof Uint8Array) {
    return { data: binary };
  }
  if (binary instanceof ArrayBuffer) {
    return { data: new Uint8Array(binary) };
  }
  if (ArrayBuffer.isView(binary)) {
    return {
      data: new Uint8Array(
        binary.buffer,
        binary.byteOffset,
        binary.byteLength,
      ),
    };
  }
  if (Array.isArray(binary)) {
    return { data: Uint8Array.from(binary) };
  }
  return getPdfSource(source);
}

function inferSpeechLanguage(segments) {
  const sample = segments.slice(0, 80).map((segment) => segment.text.toLowerCase()).join(" ");
  const portugueseScore = (sample.match(/[áàâãéêíóôõúç]/g) || []).length * 2
    + (sample.match(/\b(?:de|da|do|que|para|uma|com|não|como|entre|água|página)\b/g) || []).length;
  const englishScore = (sample.match(/\b(?:the|and|that|with|from|this|into|between|learning|page)\b/g) || []).length;
  return englishScore > portugueseScore ? "en-US" : "pt-BR";
}

function getFriendlyVoiceName(voice) {
  return String(voice?.name || "Voz do sistema")
    .replace(/^Microsoft\s+/i, "")
    .replace(/\s+-\s+.*$/, "")
    .trim();
}

function getBestVoice(voices, languageCode) {
  if (!voices || !voices.length) return null;
  const code = String(languageCode || "").toLowerCase();
  const langRoot = code.split("-")[0];

  const matchesLang = voices.filter((v) => {
    const vLang = String(v.lang || "").toLowerCase();
    return vLang === code || vLang.startsWith(langRoot);
  });

  const candidates = matchesLang.length > 0 ? matchesLang : voices;

  // Try to find a "Natural", "Online", or "Premium" voice
  const naturalVoice = candidates.find(v => 
    /natural|online|premium|neural/i.test(v.name)
  );
  if (naturalVoice) return naturalVoice;
  
  // Otherwise, prefer Google voices
  const googleVoice = candidates.find(v => /google/i.test(v.name));
  if (googleVoice) return googleVoice;

  return candidates[0];
}

export function PdfGuidedReadingModal({
  pdfPath,
  pdfTitle = "Material PDF",
  title = "Leitura Guiada",
  initialState,
  onStateChange,
  onClose,
}) {
  const canvasRef = useRef(null);
  const pageHostRef = useRef(null);
  const pdfDocumentRef = useRef(null);
  const viewportRef = useRef(null);
  const speechSessionRef = useRef(0);
  const currentIndexRef = useRef(0);
  const continuousRef = useRef(false);
  const speakAtRef = useRef(null);
  const initialStateRef = useRef(initialState);
  const onStateChangeRef = useRef(onStateChange);
  const preferredLanguageRef = useRef(initialState?.voiceLang || "pt-BR");
  const voiceManuallySelectedRef = useRef(Boolean(initialState?.voiceName));
  const canvasRenderQueueRef = useRef(Promise.resolve());
  const canvasRenderTaskRef = useRef(null);
  const renderGenerationRef = useRef(0);

  const [segments, setSegments] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [renderedPage, setRenderedPage] = useState(1);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [voices, setVoices] = useState([]);
  const [voiceName, setVoiceName] = useState(initialState?.voiceName || "");
  const [rate, setRate] = useState(
    [0.75, 1, 1.25, 1.5, 1.75].includes(Number(initialState?.rate))
      ? Number(initialState.rate)
      : 1,
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [status, setStatus] = useState("loading");
  const [statusMessage, setStatusMessage] = useState("Extraindo o texto do PDF...");

  const activeSegment = segments[currentIndex] || null;
  const previousSegment = segments[currentIndex - 1] || null;
  const nextSegment = segments[currentIndex + 1] || null;
  const progress = getGuidedReadingProgress(currentIndex, segments.length);
  const selectedVoice = voices.find((voice) => voice.name === voiceName) || null;

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);

  useEffect(() => {
    if (!window.speechSynthesis) return undefined;
    const refreshVoices = () => {
      const available = window.speechSynthesis.getVoices();
      setVoices(available);
      setVoiceName((current) => {
        if (
          current
          && available.some((voice) => voice.name === current)
          && voiceManuallySelectedRef.current
        ) return current;
        const language = preferredLanguageRef.current;
        const preferred = getBestVoice(available, language);
        return preferred?.name || "";
      });
    };
    refreshVoices();
    window.speechSynthesis.addEventListener?.("voiceschanged", refreshVoices);
    return () => window.speechSynthesis.removeEventListener?.("voiceschanged", refreshVoices);
  }, []);

  useEffect(() => {
    if (voiceManuallySelectedRef.current || !voices.length || !segments.length) return;
    const language = preferredLanguageRef.current;
    const preferredVoice = getBestVoice(voices, language);
    if (preferredVoice) setVoiceName(preferredVoice.name);
  }, [segments.length, voices]);

  useEffect(() => {
    let canceled = false;
    setStatus("loading");
    setStatusMessage("Extraindo o texto do PDF...");
    let loadingTask = null;

    const prepare = async () => {
      try {
        const source = await resolvePdfDocumentSource(pdfPath);
        if (canceled) return;
        loadingTask = getDocument(source);
        const pdf = await loadingTask.promise;
        if (canceled) return;
        pdfDocumentRef.current = pdf;
        setPageCount(pdf.numPages);
        const extracted = [];
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          if (canceled) return;
          setStatusMessage(`Preparando página ${pageNumber} de ${pdf.numPages}...`);
          const page = await pdf.getPage(pageNumber);
          const textContent = await page.getTextContent();
          extracted.push(...groupPdfTextItems(textContent.items, pageNumber));
        }
        if (!extracted.length) {
          setStatus("error");
          setStatusMessage("Este PDF não possui texto selecionável. PDFs escaneados precisarão do modo OCR.");
          return;
        }
        preferredLanguageRef.current = inferSpeechLanguage(extracted);
        if (!voiceManuallySelectedRef.current) {
          const language = preferredLanguageRef.current;
          const languageRoot = language.split("-")[0];
          const preferredVoice = voices.find((voice) => voice.lang?.toLowerCase() === language.toLowerCase())
            || voices.find((voice) => voice.lang?.toLowerCase().startsWith(languageRoot.toLowerCase()));
          if (preferredVoice) setVoiceName(preferredVoice.name);
        }
        const savedState = initialStateRef.current;
        const canRestore = savedState?.path === pdfPath;
        const savedLineIndex = canRestore && savedState?.lineId
          ? extracted.findIndex((segment) => segment.id === savedState.lineId)
          : -1;
        const restoredIndex = savedLineIndex >= 0
          ? savedLineIndex
          : canRestore && Number.isInteger(savedState?.index)
            ? Math.max(0, Math.min(savedState.index, extracted.length - 1))
            : 0;
        setSegments(extracted);
        setCurrentIndex(restoredIndex);
        currentIndexRef.current = restoredIndex;
        setRenderedPage(extracted[restoredIndex].pageNumber);
        setStatus("ready");
      } catch (error) {
        if (canceled) return;
        setStatus("error");
        setStatusMessage(error?.message || "Não foi possível preparar este PDF.");
      }
    };

    prepare();
    return () => {
      canceled = true;
      loadingTask?.destroy();
      pdfDocumentRef.current = null;
    };
  }, [pdfPath]);

  useEffect(() => {
    if (!activeSegment) return;
    setRenderedPage(activeSegment.pageNumber);
  }, [activeSegment?.pageNumber]);

  useEffect(() => {
    const host = pageHostRef.current;
    const canvas = canvasRef.current;
    const pdf = pdfDocumentRef.current;
    if (!host || !canvas || !pdf || status !== "ready") return undefined;
    let canceled = false;
    let frameId = 0;
    let requestId = 0;
    const generation = renderGenerationRef.current + 1;
    renderGenerationRef.current = generation;

    const queueRender = () => {
      requestId += 1;
      const scheduledRequest = requestId;
      canvasRenderQueueRef.current = canvasRenderQueueRef.current
        .catch(() => {})
        .then(async () => {
          if (canceled || generation !== renderGenerationRef.current || scheduledRequest !== requestId) return;
          const page = await pdf.getPage(renderedPage);
          if (canceled || generation !== renderGenerationRef.current || scheduledRequest !== requestId) return;
          const baseViewport = page.getViewport({ scale: 1 });
          const availableWidth = Math.max(320, host.clientWidth - 40);
          const availableHeight = Math.max(360, host.clientHeight - 32);
          const scale = Math.min(1.8, availableWidth / baseViewport.width, availableHeight / baseViewport.height);
          const viewport = page.getViewport({ scale });
          const ratio = Math.min(2, window.devicePixelRatio || 1);
          const context = canvas.getContext("2d", { alpha: false });
          canvas.width = Math.floor(viewport.width * ratio);
          canvas.height = Math.floor(viewport.height * ratio);
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          viewportRef.current = viewport;
          setViewportSize({ width: viewport.width, height: viewport.height });
          const renderTask = page.render({
            canvasContext: context,
            viewport,
            transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0],
          });
          canvasRenderTaskRef.current = renderTask;
          try {
            await renderTask.promise;
          } finally {
            if (canvasRenderTaskRef.current === renderTask) canvasRenderTaskRef.current = null;
          }
        })
        .catch((error) => {
          if (!canceled && error?.name !== "RenderingCancelledException") {
            setStatusMessage(error?.message || "Falha ao renderizar a página.");
          }
        });
    };

    const scheduleRender = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(queueRender);
    };

    scheduleRender();
    const observer = new ResizeObserver(scheduleRender);
    observer.observe(host);
    return () => {
      canceled = true;
      renderGenerationRef.current += 1;
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
      canvasRenderTaskRef.current?.cancel();
    };
  }, [renderedPage, status]);

  const highlightRects = useMemo(() => {
    const viewport = viewportRef.current;
    if (!activeSegment || activeSegment.pageNumber !== renderedPage || !viewport || !viewportSize.width) return [];
    return activeSegment.boxes.map((box, index) => {
      const points = viewport.convertToViewportRectangle([
        box.x,
        box.y,
        box.x + box.width,
        box.y + box.height,
      ]);
      const left = Math.min(points[0], points[2]);
      const top = Math.min(points[1], points[3]);
      return {
        id: `${activeSegment.id}-${index}`,
        left,
        top,
        width: Math.max(8, Math.abs(points[2] - points[0])),
        height: Math.max(8, Math.abs(points[3] - points[1])),
      };
    });
  }, [activeSegment, renderedPage, viewportSize]);

  const stopSpeech = () => {
    speechSessionRef.current += 1;
    continuousRef.current = false;
    window.speechSynthesis?.cancel();
    setIsPlaying(false);
  };

  const speakAt = (index, continueReading = true) => {
    if (!window.speechSynthesis || !segments[index]) return;
    const sessionId = speechSessionRef.current + 1;
    speechSessionRef.current = sessionId;
    continuousRef.current = continueReading;
    window.speechSynthesis.cancel();
    currentIndexRef.current = index;
    setCurrentIndex(index);
    const utterance = new SpeechSynthesisUtterance(segments[index].text);
    const voice = voices.find((item) => item.name === voiceName);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
    utterance.rate = rate;
    utterance.onend = () => {
      if (speechSessionRef.current !== sessionId) return;
      if (continuousRef.current && index < segments.length - 1) {
        speakAtRef.current?.(index + 1, true);
      } else {
        setIsPlaying(false);
      }
    };
    utterance.onerror = () => {
      if (speechSessionRef.current === sessionId) setIsPlaying(false);
    };
    setIsPlaying(true);
    window.speechSynthesis.speak(utterance);
  };
  speakAtRef.current = speakAt;

  const togglePlayback = () => {
    const synthesis = window.speechSynthesis;
    if (!synthesis || !segments.length) return;
    if (synthesis.paused) {
      continuousRef.current = true;
      synthesis.resume();
      setIsPlaying(true);
      return;
    }
    if (synthesis.speaking && isPlaying) {
      synthesis.pause();
      setIsPlaying(false);
      return;
    }
    speakAt(currentIndexRef.current, true);
  };

  const goToSegment = (index, autoplay = false) => {
    const safeIndex = Math.max(0, Math.min(index, segments.length - 1));
    stopSpeech();
    setCurrentIndex(safeIndex);
    currentIndexRef.current = safeIndex;
    if (autoplay) window.setTimeout(() => speakAtRef.current?.(safeIndex, true), 0);
  };

  const emitReadingState = (index = currentIndexRef.current) => {
    const segment = segments[index];
    if (!segment) return;
    onStateChangeRef.current?.({
      path: pdfPath,
      index,
      lineId: segment.id,
      pageNumber: segment.pageNumber,
      rate,
      voiceName,
      voiceLang: selectedVoice?.lang || preferredLanguageRef.current,
      updatedAt: new Date().toISOString(),
    });
  };

  useEffect(() => {
    if (status !== "ready" || !activeSegment) return undefined;
    const timeoutId = window.setTimeout(() => emitReadingState(currentIndex), 650);
    return () => window.clearTimeout(timeoutId);
  }, [currentIndex, rate, voiceName, status]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const tagName = event.target?.tagName?.toLowerCase();
      if (["input", "select", "textarea", "button"].includes(tagName)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        emitReadingState();
        stopSpeech();
        onClose?.();
      } else if (event.key === " " && status === "ready") {
        event.preventDefault();
        togglePlayback();
      } else if (event.key === "ArrowLeft" && status === "ready") {
        event.preventDefault();
        goToSegment(currentIndexRef.current - 1, false);
      } else if (event.key === "ArrowRight" && status === "ready") {
        event.preventDefault();
        goToSegment(currentIndexRef.current + 1, false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const handleClose = () => {
    emitReadingState();
    stopSpeech();
    onClose?.();
  };

  useEffect(() => () => {
    speechSessionRef.current += 1;
    window.speechSynthesis?.cancel();
  }, []);

  return (
    <motion.div
      className="fixed inset-0 z-[320] flex overflow-hidden bg-[#f0f1f7] text-[color:var(--on-surface)]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <aside className="hidden w-[86px] shrink-0 flex-col items-center border-r border-white/70 bg-[#eef0f6] py-5 shadow-[10px_0_28px_rgba(93,91,132,0.08)] md:flex">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[color:var(--primary)] shadow-[6px_6px_16px_rgba(93,91,132,.12)]" aria-label="StudyHub">
          <Icon name="school" className="text-[25px]" />
        </span>
        <div className="mt-9 flex flex-col gap-3 text-[color:var(--on-surface-variant)]">
          {["book_2", "grid_view", "quiz", "format_align_left"].map((name) => (
            <span key={name} className={`flex h-12 w-12 items-center justify-center rounded-2xl ${name === "format_align_left" ? "bg-white text-[color:var(--primary)] shadow-[6px_6px_16px_rgba(93,91,132,.12)]" : ""}`}>
              <Icon name={name} className="text-[21px]" />
            </span>
          ))}
        </div>
        <span className="mt-auto flex h-11 w-11 items-center justify-center rounded-2xl text-[color:var(--on-surface-variant)]"><Icon name="help" /></span>
        <button className="mt-3 flex h-11 w-11 items-center justify-center rounded-2xl text-[color:var(--on-surface-variant)] hover:text-[color:var(--primary)]" type="button" onClick={handleClose} aria-label="Sair da leitura guiada">
          <Icon name="logout" />
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[76px] shrink-0 items-center justify-between border-b border-white/80 bg-[#f7f8fc]/95 px-5 shadow-[0_8px_28px_rgba(93,91,132,.06)] lg:px-8">
          <div className="flex min-w-0 items-center gap-4">
            <button className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[color:var(--on-surface-variant)] neo-inset md:hidden" onClick={handleClose} type="button" aria-label="Voltar"><Icon name="arrow_back" /></button>
            <div className="min-w-0">
              <p className="truncate text-lg font-black">StudyHub <span className="ml-2 font-bold text-[color:var(--primary)]">{title}</span></p>
              <p className="mt-0.5 max-w-[42vw] truncate text-xs font-semibold text-[color:var(--on-surface-variant)]">{pdfTitle}</p>
            </div>
          </div>
          <div className="hidden items-center gap-3 rounded-full bg-[#eff0f6] px-5 py-2.5 shadow-[inset_3px_3px_8px_rgba(93,91,132,.08),inset_-3px_-3px_8px_rgba(255,255,255,.9)] sm:flex">
            {[['description', 'PDF'], ['graphic_eq', 'Gerar áudio'], ['headphones', 'Acompanhar']].map(([icon, label], index) => (
              <div key={label} className={`flex items-center gap-2 text-sm font-bold ${index === 2 ? "text-[color:var(--primary)]" : "text-[color:var(--on-surface-variant)]"}`}>
                <Icon name={icon} className="text-[18px]" /> {label}
                {index < 2 ? <><Icon name="check_circle" filled className="text-[16px] text-[color:var(--primary)]" /><Icon name="arrow_forward" className="text-[16px] text-[color:var(--outline)]" /></> : null}
              </div>
            ))}
          </div>
          <button className="flex h-10 w-10 items-center justify-center rounded-xl text-[color:var(--on-surface-variant)] neo-inset" onClick={handleClose} type="button" aria-label="Fechar"><Icon name="close" /></button>
        </header>

        {status !== "ready" ? (
          <main className="flex flex-1 items-center justify-center p-8">
            <div className="max-w-lg text-center">
              <span className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full ${status === "error" ? "bg-red-500/10 text-red-600" : "bg-[color:var(--primary)]/10 text-[color:var(--primary)]"}`}>
                <Icon name={status === "error" ? "scan_delete" : "auto_stories"} className="text-[38px]" />
              </span>
              <h2 className="mt-5 text-2xl font-black">{status === "error" ? "Leitura indisponível" : "Preparando leitura guiada"}</h2>
              <p className="mt-3 leading-7 text-[color:var(--on-surface-variant)]">{statusMessage}</p>
            </div>
          </main>
        ) : (
          <main className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-4 lg:px-7 lg:py-5">
            <section ref={pageHostRef} className="relative min-h-0 flex-1 overflow-hidden rounded-[22px] bg-[#e8eaf2] p-4 shadow-[inset_4px_4px_12px_rgba(93,91,132,.08),inset_-4px_-4px_12px_rgba(255,255,255,.75)]">
              <div className="flex h-full items-center justify-center overflow-auto custom-scrollbar">
                <div className="relative shrink-0 overflow-hidden bg-white shadow-[0_16px_45px_rgba(46,48,64,.16)]" style={{ width: viewportSize.width || 640, height: viewportSize.height || 720 }}>
                  <canvas ref={canvasRef} className="block" />
                  {highlightRects.map((rect) => (
                    <span key={rect.id} className="pointer-events-none absolute rounded-[4px] bg-[#8b5cf6]/25 ring-1 ring-[#8b5cf6]/20" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }} />
                  ))}
                </div>
              </div>
              <div className="absolute right-6 top-5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-[color:var(--on-surface-variant)] shadow-md">Página {renderedPage} de {pageCount}</div>
            </section>

            <section className="shrink-0 rounded-[28px] bg-[#f7f8fc] px-4 py-4 shadow-[8px_8px_24px_rgba(93,91,132,.12),-8px_-8px_24px_rgba(255,255,255,.95)] lg:min-h-[294px] lg:px-8 lg:py-5">
              <div className="grid items-center gap-5 lg:grid-cols-[210px_1fr_210px]">
                <button className="hidden text-left text-xs leading-5 text-[color:var(--on-surface-variant)] opacity-55 transition-opacity hover:opacity-100 lg:block" disabled={!previousSegment} onClick={() => goToSegment(currentIndex - 1, true)} type="button">
                  <span className="block font-black uppercase tracking-wide">Frase anterior</span>
                  <span className="mt-1 line-clamp-2 block">{previousSegment?.text || "Início do documento"}</span>
                </button>
                <div className="text-center">
                  <p className="text-sm font-black text-[color:var(--primary)]">Frase atual</p>
                  <p className="mx-auto mt-2 flex min-h-[62px] max-w-4xl items-center justify-center text-lg font-black leading-7 lg:text-[24px] lg:leading-8">{activeSegment?.text}</p>
                </div>
                <button className="hidden text-right text-xs leading-5 text-[color:var(--on-surface-variant)] opacity-55 transition-opacity hover:opacity-100 lg:block" disabled={!nextSegment} onClick={() => goToSegment(currentIndex + 1, true)} type="button">
                  <span className="block font-black uppercase tracking-wide">Próxima frase</span>
                  <span className="mt-1 line-clamp-2 block">{nextSegment?.text || "Fim do documento"}</span>
                </button>
              </div>

              <div className="mt-2 flex items-center justify-center gap-6">
                <button className="flex h-10 w-10 items-center justify-center rounded-full bg-[#eef0f6] text-[color:var(--on-surface-variant)] shadow-[4px_4px_12px_rgba(93,91,132,.12)] disabled:opacity-35" disabled={currentIndex === 0} onClick={() => goToSegment(0, false)} type="button" aria-label="Ir ao início"><Icon name="skip_previous" /></button>
                <button className="flex h-11 w-11 items-center justify-center rounded-full bg-[#eef0f6] text-[color:var(--on-surface-variant)] shadow-[4px_4px_12px_rgba(93,91,132,.12)] disabled:opacity-35" disabled={currentIndex === 0} onClick={() => goToSegment(currentIndex - 1, true)} type="button" aria-label="Frase anterior"><Icon name="chevron_left" /></button>
                <button className="flex h-16 w-16 items-center justify-center rounded-full bg-[color:var(--primary)] text-white shadow-[0_12px_24px_rgba(139,92,246,.32)]" onClick={togglePlayback} type="button" aria-label={isPlaying ? "Pausar" : "Reproduzir"}><Icon name={isPlaying ? "pause" : "play_arrow"} filled className="text-[34px]" /></button>
                <button className="flex h-11 w-11 items-center justify-center rounded-full bg-[#eef0f6] text-[color:var(--on-surface-variant)] shadow-[4px_4px_12px_rgba(93,91,132,.12)] disabled:opacity-35" disabled={currentIndex >= segments.length - 1} onClick={() => goToSegment(currentIndex + 1, true)} type="button" aria-label="Próxima frase"><Icon name="chevron_right" /></button>
                <button className="flex h-10 w-10 items-center justify-center rounded-full bg-[#eef0f6] text-[color:var(--on-surface-variant)] shadow-[4px_4px_12px_rgba(93,91,132,.12)] disabled:opacity-35" disabled={currentIndex >= segments.length - 1} onClick={() => goToSegment(segments.length - 1, false)} type="button" aria-label="Ir ao fim"><Icon name="skip_next" /></button>
              </div>

              <div className="mx-auto mt-3 flex max-w-[820px] items-center gap-3">
                <span className="w-10 text-right text-[11px] font-bold text-[color:var(--on-surface-variant)]">{progress}%</span>
                <input className="h-1.5 min-w-0 flex-1 accent-[color:var(--primary)]" type="range" min="0" max={Math.max(0, segments.length - 1)} value={currentIndex} onChange={(event) => goToSegment(Number(event.target.value), false)} aria-label="Progresso da leitura" />
              </div>

              <div className="mx-auto mt-3 grid max-w-[980px] grid-cols-2 items-center gap-2.5 lg:grid-cols-4">
                <label className="flex min-w-0 items-center justify-center gap-2 rounded-full bg-[#eef0f6] px-4 py-2.5 text-xs font-bold text-[color:var(--on-surface-variant)] neo-inset">
                  <Icon name="graphic_eq" className="text-[17px]" />
                  <span className="shrink-0">Voz:</span>
                  <select className="min-w-0 max-w-[150px] border-0 bg-transparent p-0 text-xs font-bold focus:ring-0" value={voiceName} onChange={(event) => { stopSpeech(); voiceManuallySelectedRef.current = true; setVoiceName(event.target.value); }} aria-label="Voz da narração">
                    {voices.map((voice) => <option key={voice.voiceURI || voice.name} value={voice.name}>{getFriendlyVoiceName(voice)}</option>)}
                  </select>
                </label>
                <label className="flex items-center justify-center gap-2 rounded-full bg-[#eef0f6] px-4 py-2.5 text-xs font-bold text-[color:var(--on-surface-variant)] neo-inset">
                  <Icon name="speed" className="text-[17px]" />
                  <select className="border-0 bg-transparent p-0 text-xs font-bold focus:ring-0" value={rate} onChange={(event) => { stopSpeech(); setRate(Number(event.target.value)); }} aria-label="Velocidade da narração">
                    {[0.75, 1, 1.25, 1.5, 1.75].map((value) => <option key={value} value={value}>{String(value).replace(".", ",")}×</option>)}
                  </select>
                </label>
                <span className="rounded-full bg-[#eef0f6] px-4 py-2.5 text-center text-xs font-bold text-[color:var(--on-surface-variant)] neo-inset"><Icon name="description" className="mr-1 text-[17px] align-middle" /> Página {renderedPage} de {pageCount}</span>
                <button className="rounded-full bg-[#eef0f6] px-4 py-2.5 text-xs font-black text-[color:var(--primary)] shadow-[4px_4px_12px_rgba(93,91,132,.10)]" onClick={() => speakAt(currentIndex, false)} type="button"><Icon name="repeat" className="mr-1 text-[17px] align-middle" /> Repetir frase</button>
              </div>
            </section>
          </main>
        )}
      </div>
    </motion.div>
  );
}

export default PdfGuidedReadingModal;
