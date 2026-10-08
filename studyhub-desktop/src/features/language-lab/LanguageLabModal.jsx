import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLanguageLabStore } from "../../store/useLanguageLabStore";
import {
  getTranscriptStorageKey,
  loadTranscriptRecord,
  saveTranscriptRecord,
} from "../../utils/transcriptStorage";
import { getLocalFilePath, getLocalFileUrl } from "../../utils/localFileUrl";
import {
  calculateRhythmScore,
  compactTranscriptSegments,
  compareDictation,
  findActiveTranscriptSegment,
  formatMediaTime,
  normalizeTranscriptSegments,
  validateLoopBounds,
} from "../../utils/languageUtils";
import { Icon } from "../../ui/Icon";
import { VocabTextRenderer } from "../../components/VocabTextRenderer";

const LANGUAGE_OPTIONS = [
  { value: "auto", label: "Detectar idioma" },
  { value: "en", label: "Inglês" },
  { value: "pt", label: "Português" },
  { value: "es", label: "Espanhol" },
  { value: "fr", label: "Francês" },
  { value: "de", label: "Alemão" },
  { value: "it", label: "Italiano" },
  { value: "ja", label: "Japonês" },
];

const RATE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const MAX_RECORDING_BYTES = 20 * 1024 * 1024;
const MAX_RECORDING_SECONDS = 90;
const TRANSCRIPT_PAGE_SIZE = 200;

const createRequestId = (prefix) => {
  const suffix = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
};

const inferMediaKind = (item = {}) => {
  const type = String(item.type || "").toLowerCase();
  const source = String(item.url || item.path || "").toLowerCase();
  if (type === "youtube" || /youtu\.be|youtube\.com/.test(source)) return "youtube";
  if (type === "audio" || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(source)) return "audio";
  if (type === "local_video" || /\.(mp4|mkv|avi|mov|webm)$/i.test(source)) return "video";
  return "file";
};

const getLessonMedia = (lesson = {}) => {
  const media = [];
  if (lesson.filePath) {
    media.push({ id: "language-video", kind: "video", path: lesson.filePath, title: "Vídeo da aula" });
  }
  if (lesson.audioPath) {
    media.push({ id: "language-audio", kind: "audio", path: lesson.audioPath, title: "Áudio da aula" });
  }
  if (lesson.youtubeUrl) {
    media.push({ id: "language-youtube", kind: "youtube", path: lesson.youtubeUrl, title: "YouTube" });
  }
  (lesson.extraMedia || []).forEach((item, index) => {
    const path = item.url || item.path;
    const kind = inferMediaKind(item);
    if (!path || !["video", "audio", "youtube"].includes(kind)) return;
    media.push({
      id: item.id || `language-extra-${index}`,
      kind,
      path,
      title: item.title || (kind === "audio" ? "Áudio extra" : "Vídeo extra"),
    });
  });
  return media.filter(
    (item, index, list) => list.findIndex((candidate) => candidate.path === item.path) === index,
  );
};

const getApi = () => window.studyhubDesktop?.languageLab;

function StatusPill({ tone = "neutral", children }) {
  const tones = {
    success: "bg-emerald-500/12 text-emerald-600",
    warning: "bg-amber-500/12 text-amber-600",
    error: "bg-red-500/12 text-red-600",
    neutral: "bg-[color:var(--background)] text-[color:var(--on-surface-variant)]",
  };
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${tones[tone]}`}>
      {children}
    </span>
  );
}

function ScoreRing({ value, label }) {
  const score = Math.max(0, Math.min(100, Number(value) || 0));
  const color = score >= 85 ? "#10b981" : score >= 60 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-full text-sm font-black"
        style={{ background: `conic-gradient(${color} ${score * 3.6}deg, rgba(148,163,184,.18) 0deg)` }}
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[color:var(--surface)]">
          {score}%
        </span>
      </div>
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-[color:var(--on-surface-variant)]">{label}</p>
        <p className="mt-1 text-sm font-semibold text-[color:var(--on-surface)]">
          {score >= 85 ? "Muito próximo" : score >= 60 ? "Bom caminho" : "Tente novamente"}
        </p>
      </div>
    </div>
  );
}

export function LanguageLabModal({
  lesson,
  courseTitle,
  moduleTitle,
  onClose,
  onUpdateLesson,
  onCreateFlashcard,
}) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const recorderRef = useRef(null);
  const recordingStreamRef = useRef(null);
  const isProgrammaticSeekRef = useRef(false);
  const recordingTimerRef = useRef(null);
  const shadowGuideTimerRef = useRef(null);
  const shadowGuideIntervalRef = useRef(null);
  const shadowGuideSessionRef = useRef(0);
  const recordingPhaseRef = useRef("idle");
  const recordingSessionIdRef = useRef(0);
  const recordingTargetRef = useRef(null);
  const stopAtRef = useRef(null);
  const transcriptListRef = useRef(null);
  const busyRef = useRef("");
  const activeRequestIdsRef = useRef(new Set());
  const isMountedRef = useRef(true);
  const isClosingRef = useRef(false);
  const feedbackTimerRef = useRef(null);

  const media = useMemo(() => getLessonMedia(lesson), [lesson]);
  const initialLessonSegments = useMemo(
    () => normalizeTranscriptSegments(lesson?.transcript),
    [lesson?.transcript],
  );
  const [segments, setSegments] = useState(initialLessonSegments);
  const [activeMediaId, setActiveMediaId] = useState(media[0]?.id || "");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [selectedSegmentId, setSelectedSegmentId] = useState(segments[0]?.id || null);
  const [loopStart, setLoopStart] = useState(null);
  const [loopEnd, setLoopEnd] = useState(null);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [practiceMode, setPracticeMode] = useState("study");
  const [dictationInput, setDictationInput] = useState("");
  const [dictationResult, setDictationResult] = useState(null);
  const [showDictationAnswer, setShowDictationAnswer] = useState(false);
  const [recordingPhase, setRecordingPhase] = useState("idle");
  const [recordingBlob, setRecordingBlob] = useState(null);
  const [recordingUrl, setRecordingUrl] = useState("");
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [shadowResult, setShadowResult] = useState(null);
  const [shadowGuidePhase, setShadowGuidePhase] = useState("idle");
  const [shadowCountdown, setShadowCountdown] = useState(0);
  const [cardBack, setCardBack] = useState("");
  const [environment, setEnvironment] = useState(null);
  const [busyAction, setBusyAction] = useState("");
  const [progressMessage, setProgressMessage] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [transcriptQuery, setTranscriptQuery] = useState("");
  const [transcriptPage, setTranscriptPage] = useState(0);

  const videoRate = useLanguageLabStore((state) => state.videoRate);
  const audioRate = useLanguageLabStore((state) => state.audioRate);
  const sourceLanguage = useLanguageLabStore((state) => state.sourceLanguage);
  const whisperModel = useLanguageLabStore((state) => state.whisperModel);
  const setVideoRate = useLanguageLabStore((state) => state.setVideoRate);
  const setAudioRate = useLanguageLabStore((state) => state.setAudioRate);
  const setSourceLanguage = useLanguageLabStore((state) => state.setSourceLanguage);
  const setWhisperModel = useLanguageLabStore((state) => state.setWhisperModel);

  const activeMedia = media.find((item) => item.id === activeMediaId) || media[0] || null;
  const activeLocalMediaPath = getLocalFilePath(activeMedia?.path);
  const mediaElement = activeMedia?.kind === "video" ? videoRef.current : audioRef.current;
  const activeSegment = findActiveTranscriptSegment(segments, currentTime);
  const selectedSegment =
    segments.find((segment) => segment.id === selectedSegmentId) || activeSegment || segments[0] || null;
  const loopBounds = validateLoopBounds(loopStart, loopEnd, duration || Number.POSITIVE_INFINITY);
  const activeRate = activeMedia?.kind === "audio" ? audioRate : videoRate;
  const filteredSegments = useMemo(() => {
    const normalizedQuery = transcriptQuery.trim().toLocaleLowerCase();
    return normalizedQuery
      ? segments.filter((segment) => segment.text.toLocaleLowerCase().includes(normalizedQuery))
      : segments;
  }, [segments, transcriptQuery]);
  const transcriptPageCount = Math.max(1, Math.ceil(filteredSegments.length / TRANSCRIPT_PAGE_SIZE));
  const safeTranscriptPage = Math.min(transcriptPage, transcriptPageCount - 1);
  const visibleSegments = useMemo(
    () => filteredSegments.slice(
      safeTranscriptPage * TRANSCRIPT_PAGE_SIZE,
      (safeTranscriptPage + 1) * TRANSCRIPT_PAGE_SIZE,
    ),
    [filteredSegments, safeTranscriptPage],
  );
  const isBusy = Boolean(busyAction);
  const isRecording = recordingPhase !== "idle";
  const interactionsLocked = isBusy || isRecording || shadowGuidePhase !== "idle";
  const comparisonLanguage = sourceLanguage === "auto"
    ? lesson?.transcriptMeta?.language
    : sourceLanguage;

  const beginBusy = (action) => {
    if (busyRef.current) return false;
    busyRef.current = action;
    if (isMountedRef.current && !isClosingRef.current) setBusyAction(action);
    return true;
  };

  const finishBusy = (action) => {
    if (busyRef.current !== action) return;
    busyRef.current = "";
    if (isMountedRef.current && !isClosingRef.current) setBusyAction("");
  };

  const trackRequest = (requestId) => {
    activeRequestIdsRef.current.add(requestId);
    return requestId;
  };

  const releaseRequest = (requestId) => {
    activeRequestIdsRef.current.delete(requestId);
  };

  const cancelActiveRequests = () => {
    const api = getApi();
    for (const requestId of activeRequestIdsRef.current) {
      api?.cancel?.(requestId).catch?.(() => {});
    }
    activeRequestIdsRef.current.clear();
  };

  const setFeedbackMessage = (message, tone = "success") => {
    if (!isMountedRef.current || isClosingRef.current) return;
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
    setFeedback({ message, tone });
    feedbackTimerRef.current = window.setTimeout(() => {
      if (isMountedRef.current && !isClosingRef.current) setFeedback(null);
    }, 3200);
  };

  const refreshEnvironment = async () => {
    try {
      const api = getApi();
      if (!api?.getEnvironment) {
        if (isMountedRef.current && !isClosingRef.current) {
          setEnvironment({
            available: false,
            whisperAvailable: false,
            apiUnavailable: true,
            message: "Reinicie o masterStudy para ativar o módulo local de idiomas.",
          });
        }
        return;
      }
      const result = await api.getEnvironment();
      if (!isMountedRef.current || isClosingRef.current) return;
      setEnvironment(
        result
          ? {
              ...result,
              available: result.available ?? result.ready ?? false,
              whisperAvailable:
                result.whisperAvailable ?? result.whisper?.available ?? false,
            }
          : { available: false, whisperAvailable: false },
      );
    } catch (error) {
      if (isMountedRef.current && !isClosingRef.current) {
        setEnvironment({ available: false, whisperAvailable: false, message: error.message });
      }
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    isClosingRef.current = false;
    recordingPhaseRef.current = "idle";
    setRecordingPhase("idle");
    refreshEnvironment();
    const cleanupProgress = getApi()?.onProgress?.((event) => {
      if (isMountedRef.current && !isClosingRef.current) {
        setProgressMessage(event?.message || event?.stage || "Preparando transcrição...");
      }
    });
    return () => {
      isClosingRef.current = true;
      isMountedRef.current = false;
      recordingSessionIdRef.current += 1;
      recordingPhaseRef.current = "closing";
      cleanupProgress?.();
      cancelActiveRequests();
      if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
      if (recordingTimerRef.current) window.clearTimeout(recordingTimerRef.current);
      if (shadowGuideTimerRef.current) window.clearTimeout(shadowGuideTimerRef.current);
      if (shadowGuideIntervalRef.current) window.clearInterval(shadowGuideIntervalRef.current);
      shadowGuideSessionRef.current += 1;
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      videoRef.current?.pause();
      audioRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    if (!activeMediaId && media[0]) setActiveMediaId(media[0].id);
    if (activeMediaId && !media.some((item) => item.id === activeMediaId)) {
      setActiveMediaId(media[0]?.id || "");
    }
  }, [media, activeMediaId]);

  useEffect(() => {
    let canceled = false;
    const storedKey = lesson?.transcriptMeta?.storageKey
      || getTranscriptStorageKey(lesson?.id);
    const bundledSegments = normalizeTranscriptSegments(lesson?.transcript);
    setSegments(bundledSegments);
    setSelectedSegmentId(bundledSegments[0]?.id || null);
    setLoopStart(null);
    setLoopEnd(null);
    setLoopEnabled(false);
    setDictationInput("");
    setDictationResult(null);
    setShowDictationAnswer(false);
    setTranscriptPage(0);

    const loadPersistedTranscript = async () => {
      try {
        const stored = await loadTranscriptRecord(storedKey);
        if (canceled || isClosingRef.current) return;
        const storedSegments = compactTranscriptSegments(stored?.segments || []);
        if (storedSegments.length) {
          setSegments(storedSegments);
          setSelectedSegmentId(storedSegments[0].id);
          return;
        }

        if (bundledSegments.length) {
          const compact = compactTranscriptSegments(bundledSegments);
          await saveTranscriptRecord(storedKey, compact, lesson?.transcriptMeta || {});
          if (canceled || isClosingRef.current) return;
          onUpdateLesson?.({
            transcript: [],
            transcriptMeta: {
              ...(lesson?.transcriptMeta || {}),
              storageKey: storedKey,
              segmentCount: compact.length,
              migratedAt: Date.now(),
            },
          });
          return;
        }

        const sourcePath = lesson?.transcriptMeta?.transcriptPath
          || lesson?.transcriptMeta?.sourcePath;
        if (!sourcePath || !getApi()?.importTranscript) return;
        const imported = await getApi().importTranscript(sourcePath);
        const compact = compactTranscriptSegments(imported?.segments || imported);
        if (!compact.length) return;
        await saveTranscriptRecord(storedKey, compact, lesson?.transcriptMeta || {});
        if (canceled || isClosingRef.current) return;
        setSegments(compact);
        setSelectedSegmentId(compact[0].id);
        onUpdateLesson?.({
          transcript: [],
          transcriptMeta: {
            ...(lesson?.transcriptMeta || {}),
            storageKey: storedKey,
            segmentCount: compact.length,
          },
        });
      } catch (error) {
        if (!canceled && bundledSegments.length === 0) {
          setFeedbackMessage(
            error.message || "Não foi possível carregar a transcrição salva.",
            "error",
          );
        }
      }
    };
    loadPersistedTranscript();
    return () => {
      canceled = true;
    };
  }, [lesson?.id]);

  useEffect(() => {
    const element = activeMedia?.kind === "video" ? videoRef.current : audioRef.current;
    if (!element) return undefined;

    const updateTime = () => {
      const nextTime = element.currentTime || 0;
      if (loopEnabled && loopBounds && nextTime >= loopBounds.end) {
        element.currentTime = loopBounds.start;
        element.play().catch(() => {});
        setCurrentTime(loopBounds.start);
        return;
      }
      if (stopAtRef.current !== null && nextTime >= stopAtRef.current) {
        element.pause();
        stopAtRef.current = null;
      }
      setCurrentTime(nextTime);
    };
    const updateDuration = () => setDuration(Number.isFinite(element.duration) ? element.duration : 0);

    const handleSeeking = () => {
      if (!isProgrammaticSeekRef.current) {
        setLoopEnabled(false);
        stopAtRef.current = null;
      }
    };

    element.playbackRate = activeMedia.kind === "audio" ? audioRate : videoRate;
    element.addEventListener("timeupdate", updateTime);
    element.addEventListener("durationchange", updateDuration);
    element.addEventListener("loadedmetadata", updateDuration);
    element.addEventListener("seeking", handleSeeking);
    return () => {
      element.removeEventListener("timeupdate", updateTime);
      element.removeEventListener("durationchange", updateDuration);
      element.removeEventListener("loadedmetadata", updateDuration);
      element.removeEventListener("seeking", handleSeeking);
    };
  }, [activeMedia?.id, activeMedia?.kind, audioRate, videoRate, loopEnabled, loopBounds?.start, loopBounds?.end]);

  useEffect(() => {
    if (!activeSegment || !transcriptListRef.current) return;
    transcriptListRef.current
      .querySelector(`[data-segment-id="${CSS.escape(activeSegment.id)}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeSegment?.id, safeTranscriptPage]);

  useEffect(() => {
    setTranscriptPage(0);
  }, [transcriptQuery]);

  useEffect(() => {
    if (transcriptQuery.trim() || !activeSegment) return;
    const index = segments.findIndex((segment) => segment.id === activeSegment.id);
    if (index >= 0) setTranscriptPage(Math.floor(index / TRANSCRIPT_PAGE_SIZE));
  }, [activeSegment?.id, segments, transcriptQuery]);

  useEffect(() => {
    return () => {
      if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    };
  }, [recordingUrl]);

  const handleClose = () => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    recordingSessionIdRef.current += 1;
    recordingPhaseRef.current = "closing";
    cancelActiveRequests();
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
    if (recordingTimerRef.current) window.clearTimeout(recordingTimerRef.current);
    if (shadowGuideTimerRef.current) window.clearTimeout(shadowGuideTimerRef.current);
    if (shadowGuideIntervalRef.current) window.clearInterval(shadowGuideIntervalRef.current);
    shadowGuideSessionRef.current += 1;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    videoRef.current?.pause();
    audioRef.current?.pause();
    onClose?.();
  };

  const clearRecordingResult = () => {
    if (recordingPhaseRef.current !== "idle") return false;
    recordingTargetRef.current = null;
    setRecordingBlob(null);
    setRecordingUrl("");
    setRecordingDuration(0);
    setShadowResult(null);
    return true;
  };

  const persistTranscript = async (nextSegments, metadata) => {
    const compact = compactTranscriptSegments(nextSegments);
    if (!compact.length) throw new Error("Nenhuma frase válida foi encontrada.");
    const storageKey = getTranscriptStorageKey(lesson?.id);
    setSegments(compact);
    setSelectedSegmentId(compact[0].id);
    setTranscriptPage(0);
    clearRecordingResult();
    try {
      await saveTranscriptRecord(storageKey, compact, metadata);
    } catch (error) {
      throw new Error(
        `A transcrição foi gerada, mas não pôde ser salva localmente: ${error.message}`,
      );
    }
    if (!isMountedRef.current || isClosingRef.current) return compact;
    onUpdateLesson?.({
      transcript: [],
      transcriptMeta: {
        ...(lesson?.transcriptMeta || {}),
        ...metadata,
        storageKey,
        segmentCount: compact.length,
      },
    });
    return compact;
  };

  const seekTo = (time, shouldPlay = true) => {
    const element = activeMedia?.kind === "video" ? videoRef.current : audioRef.current;
    if (!element) return;
    const requestedTime = Math.max(0, Number(time) || 0);
    const applySeek = () => {
      const targetTime = Number.isFinite(element.duration)
        ? Math.min(requestedTime, Math.max(0, element.duration - 0.05))
        : requestedTime;
      try {
        isProgrammaticSeekRef.current = true;
        element.pause();
        element.currentTime = targetTime;
      } catch {
        isProgrammaticSeekRef.current = false;
        return;
      }
      setCurrentTime(element.currentTime || targetTime);
      if (shouldPlay) {
        const resume = () => {
          isProgrammaticSeekRef.current = false;
          element.play().catch(() => {});
        };
        if (element.seeking) element.addEventListener("seeked", resume, { once: true });
        else resume();
      } else {
        isProgrammaticSeekRef.current = false;
      }
    };

    // Setting currentTime before metadata exists can be ignored by Chromium;
    // defer the seek so a later play() cannot restart the media at 0.
    if (element.readyState < HTMLMediaElement.HAVE_METADATA) {
      element.addEventListener("loadedmetadata", applySeek, { once: true });
      return;
    }
    applySeek();
  };

  const playSegment = (segment, repeat = false) => {
    if (!segment) return;
    if (isRecording && recordingTargetRef.current?.id !== segment.id) {
      setFeedbackMessage("Finalize a gravação antes de trocar de frase.", "warning");
      return;
    }
    if (recordingTargetRef.current && recordingTargetRef.current.id !== segment.id) {
      clearRecordingResult();
    }
    setSelectedSegmentId(segment.id);
    setLoopStart(segment.start);
    setLoopEnd(segment.end);
    setLoopEnabled(repeat);
    stopAtRef.current = repeat ? null : segment.end;
    seekTo(segment.start, true);
  };

  const selectMedia = (item) => {
    if (isRecording) {
      setFeedbackMessage("Finalize a gravação antes de trocar de mídia.", "warning");
      return;
    }
    clearRecordingResult();
    videoRef.current?.pause();
    audioRef.current?.pause();
    stopAtRef.current = null;
    setCurrentTime(0);
    setDuration(0);
    setLoopEnabled(false);
    setActiveMediaId(item.id);
  };

  const handleRateChange = (value) => {
    if (activeMedia?.kind === "audio") setAudioRate(value);
    else setVideoRate(value);
  };

  const importTranscript = async () => {
    if (!window.studyhubDesktop?.selectFile || !getApi()?.importTranscript) {
      setFeedbackMessage("A importação está disponível no aplicativo Desktop.", "error");
      return;
    }
    if (!beginBusy("import")) return;
    try {
      const path = await window.studyhubDesktop.selectFile({
        filters: [{ name: "Transcrições", extensions: ["vtt", "srt", "json"] }],
      });
      if (!path || isClosingRef.current) return;
      const result = await getApi().importTranscript(path);
      if (!isMountedRef.current || isClosingRef.current) return;
      if (result?.ok === false) throw new Error(result.error || result.message);
      const nextSegments = await persistTranscript(result?.segments || result, {
        source: "imported",
        sourcePath: path,
        importedAt: Date.now(),
        format: result?.format || path.split(".").pop()?.toLowerCase(),
      });
      setFeedbackMessage(`${nextSegments.length} frases importadas.`);
    } catch (error) {
      setFeedbackMessage(error.message || "Não foi possível importar a transcrição.", "error");
    } finally {
      finishBusy("import");
    }
  };

  const installWhisper = async () => {
    if (!getApi()?.installWhisper) {
      setFeedbackMessage(
        "Reinicie o masterStudy para carregar o instalador local do Whisper.",
        "error",
      );
      return;
    }
    if (!beginBusy("install")) return;
    const requestId = trackRequest(createRequestId("whisper-install"));
    setProgressMessage("Preparando o ambiente local...");
    try {
      const result = await getApi().installWhisper({ requestId });
      if (!isMountedRef.current || isClosingRef.current) return;
      if (result?.ok === false) throw new Error(result.error || result.message);
      await refreshEnvironment();
      setFeedbackMessage("Whisper local preparado com sucesso.");
    } catch (error) {
      setFeedbackMessage(error.message || "Não foi possível preparar o Whisper.", "error");
    } finally {
      releaseRequest(requestId);
      finishBusy("install");
      if (isMountedRef.current && !isClosingRef.current) setProgressMessage("");
    }
  };

  const transcribeMedia = async () => {
    if (!activeMedia || activeMedia.kind === "youtube" || !activeLocalMediaPath || !getApi()?.transcribe) {
      setFeedbackMessage("Selecione um vídeo ou áudio local para transcrever.", "error");
      return;
    }
    if (!beginBusy("transcribe")) return;
    const requestId = trackRequest(createRequestId("media-transcription"));
    setProgressMessage("Carregando o modelo local...");
    try {
      const result = await getApi().transcribe({
        requestId,
        mediaPath: activeLocalMediaPath,
        model: whisperModel,
        language: sourceLanguage === "auto" ? null : sourceLanguage,
      });
      if (!isMountedRef.current || isClosingRef.current) return;
      if (result?.ok === false) throw new Error(result.error || result.message);
      const nextSegments = await persistTranscript(result?.segments, {
        source: "whisper",
        model: whisperModel,
        language: result?.language || sourceLanguage,
        sourceMediaPath: activeLocalMediaPath,
        transcriptPath: result?.transcriptPath || null,
        generatedAt: Date.now(),
      });
      setFeedbackMessage(`Transcrição concluída com ${nextSegments.length} frases.`);
    } catch (error) {
      setFeedbackMessage(error.message || "Falha ao transcrever a mídia.", "error");
    } finally {
      releaseRequest(requestId);
      finishBusy("transcribe");
      if (isMountedRef.current && !isClosingRef.current) setProgressMessage("");
    }
  };

  const checkDictation = () => {
    if (!selectedSegment || isBusy) return;
    const result = compareDictation(selectedSegment.text, dictationInput, comparisonLanguage);
    setDictationResult(result);
    setShowDictationAnswer(true);
    const previous = lesson?.languageLab?.dictation || { attempts: 0, totalScore: 0 };
    onUpdateLesson?.({
      languageLab: {
        ...(lesson?.languageLab || {}),
        dictation: {
          attempts: Number(previous.attempts || 0) + 1,
          totalScore: Number(previous.totalScore || 0) + result.score,
          lastScore: result.score,
          lastPracticedAt: Date.now(),
        },
      },
    });
  };

  const nextSegment = () => {
    if (!selectedSegment || !segments.length || interactionsLocked) return;
    const currentIndex = segments.findIndex((segment) => segment.id === selectedSegment.id);
    const next = segments[(currentIndex + 1) % segments.length];
    setDictationInput("");
    setDictationResult(null);
    setShowDictationAnswer(false);
    setShadowResult(null);
    setCardBack("");
    playSegment(next, false);
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setFeedbackMessage("A gravação por microfone não está disponível neste dispositivo.", "error");
      return;
    }
    if (isBusy || recordingPhaseRef.current !== "idle" || !selectedSegment) return;
    clearRecordingResult();
    const sessionId = recordingSessionIdRef.current + 1;
    recordingSessionIdRef.current = sessionId;
    recordingPhaseRef.current = "starting";
    recordingTargetRef.current = {
      id: selectedSegment.id,
      text: selectedSegment.text,
      start: selectedSegment.start,
      end: selectedSegment.end,
    };
    setRecordingPhase("starting");
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (
        !isMountedRef.current
        || isClosingRef.current
        || recordingSessionIdRef.current !== sessionId
      ) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      recordingStreamRef.current = stream;
      const preferredType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "";
      const recorder = new MediaRecorder(stream, preferredType ? { mimeType: preferredType } : undefined);
      recorderRef.current = recorder;
      const chunks = [];
      let recordedBytes = 0;
      let recordingTooLarge = false;
      const startedAt = performance.now();
      setShadowResult(null);
      recorder.addEventListener("dataavailable", (event) => {
        if (!event.data?.size || recordingTooLarge) return;
        recordedBytes += event.data.size;
        if (recordedBytes > MAX_RECORDING_BYTES) {
          recordingTooLarge = true;
          chunks.length = 0;
          setFeedbackMessage("A gravação atingiu o limite de 20 MB e foi interrompida.", "error");
          if (recorder.state === "recording") {
            recordingPhaseRef.current = "stopping";
            if (isMountedRef.current && !isClosingRef.current) setRecordingPhase("stopping");
            recorder.stop();
          }
          return;
        }
        chunks.push(event.data);
      });
      recorder.addEventListener("stop", () => {
        stream.getTracks().forEach((track) => track.stop());
        if (recordingSessionIdRef.current !== sessionId) return;
        if (recordingTimerRef.current) window.clearTimeout(recordingTimerRef.current);
        recordingTimerRef.current = null;
        recordingStreamRef.current = null;
        recorderRef.current = null;
        recordingPhaseRef.current = "idle";
        if (!isMountedRef.current || isClosingRef.current) return;
        setRecordingPhase("idle");
        if (recordingTooLarge || !chunks.length) {
          recordingTargetRef.current = null;
          return;
        }
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        const url = URL.createObjectURL(blob);
        setRecordingBlob(blob);
        setRecordingUrl(url);
        setRecordingDuration(Math.max(0.1, (performance.now() - startedAt) / 1000));
      });
      recorder.addEventListener("error", () => {
        stream.getTracks().forEach((track) => track.stop());
        if (recordingSessionIdRef.current !== sessionId) return;
        recordingSessionIdRef.current += 1;
        if (recordingTimerRef.current) window.clearTimeout(recordingTimerRef.current);
        recordingTimerRef.current = null;
        recordingStreamRef.current = null;
        recorderRef.current = null;
        recordingTargetRef.current = null;
        recordingPhaseRef.current = "idle";
        if (isMountedRef.current && !isClosingRef.current) {
          setRecordingPhase("idle");
          setFeedbackMessage("A gravação foi interrompida pelo dispositivo de áudio.", "error");
        }
      });
      recorder.start(250);
      recordingPhaseRef.current = "recording";
      setRecordingPhase("recording");
      const targetSeconds = selectedSegment
        ? Math.max(0.1, selectedSegment.end - selectedSegment.start) + 3
        : 30;
      const autoStopSeconds = Math.min(MAX_RECORDING_SECONDS, Math.max(6, targetSeconds));
      recordingTimerRef.current = window.setTimeout(() => {
        if (
          recordingSessionIdRef.current === sessionId
          && recorder.state === "recording"
        ) {
          recordingPhaseRef.current = "stopping";
          if (isMountedRef.current && !isClosingRef.current) setRecordingPhase("stopping");
          recorder.stop();
        }
      }, autoStopSeconds * 1000);
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      if (recordingSessionIdRef.current !== sessionId) return;
      recordingStreamRef.current = null;
      recorderRef.current = null;
      recordingTargetRef.current = null;
      recordingPhaseRef.current = "idle";
      if (isMountedRef.current && !isClosingRef.current) setRecordingPhase("idle");
      setFeedbackMessage(
        error?.name === "NotAllowedError"
          ? "Permita o acesso ao microfone para praticar shadowing."
          : error.message || "Não foi possível iniciar a gravação.",
        "error",
      );
    }
  };

  const startGuidedShadowing = () => {
    if (!selectedSegment || isBusy || recordingPhaseRef.current !== "idle" || shadowGuidePhase !== "idle") return;
    clearRecordingResult();
    const sessionId = shadowGuideSessionRef.current + 1;
    shadowGuideSessionRef.current = sessionId;
    const target = selectedSegment;
    const targetDuration = Math.max(0.5, target.end - target.start);
    setSelectedSegmentId(target.id);
    setShadowGuidePhase("listening");
    setShadowCountdown(0);
    playSegment(target, false);

    shadowGuideTimerRef.current = window.setTimeout(() => {
      if (shadowGuideSessionRef.current !== sessionId || isClosingRef.current) return;
      videoRef.current?.pause();
      audioRef.current?.pause();
      setShadowGuidePhase("countdown");
      let count = 3;
      setShadowCountdown(count);
      shadowGuideIntervalRef.current = window.setInterval(() => {
        count -= 1;
        if (count <= 0) {
          window.clearInterval(shadowGuideIntervalRef.current);
          shadowGuideIntervalRef.current = null;
          setShadowCountdown(0);
          setShadowGuidePhase("idle");
          startRecording();
          return;
        }
        setShadowCountdown(count);
      }, 1000);
    }, targetDuration * 1000 + 250);
  };

  const cancelGuidedShadowing = () => {
    shadowGuideSessionRef.current += 1;
    if (shadowGuideTimerRef.current) window.clearTimeout(shadowGuideTimerRef.current);
    if (shadowGuideIntervalRef.current) window.clearInterval(shadowGuideIntervalRef.current);
    shadowGuideTimerRef.current = null;
    shadowGuideIntervalRef.current = null;
    setShadowGuidePhase("idle");
    setShadowCountdown(0);
    videoRef.current?.pause();
    audioRef.current?.pause();
  };

  const stopRecording = () => {
    if (recordingPhaseRef.current !== "recording") return;
    if (recordingTimerRef.current) window.clearTimeout(recordingTimerRef.current);
    recordingTimerRef.current = null;
    recordingPhaseRef.current = "stopping";
    setRecordingPhase("stopping");
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const compareShadowing = async () => {
    const recordingTarget = recordingTargetRef.current;
    if (!recordingBlob || !recordingTarget) return;
    const targetDuration = Math.max(0.1, recordingTarget.end - recordingTarget.start);
    const rhythmScore = calculateRhythmScore(targetDuration, recordingDuration);
    const baseResult = { rhythmScore, recognizedText: "", speechScore: null };
    setShadowResult(baseResult);

    if (!environment?.whisperAvailable || !getApi()?.transcribeRecording) return;
    if (!beginBusy("compare")) return;
    const requestId = trackRequest(createRequestId("shadowing-transcription"));
    try {
      const buffer = new Uint8Array(await recordingBlob.arrayBuffer());
      const result = await getApi().transcribeRecording({
        requestId,
        buffer,
        fileName: "shadowing.webm",
        mimeType: recordingBlob.type,
        model: whisperModel,
        language: sourceLanguage === "auto" ? null : sourceLanguage,
      });
      if (!isMountedRef.current || isClosingRef.current) return;
      if (result?.ok === false) throw new Error(result.error || result.message);
      const recognizedText =
        result?.text || normalizeTranscriptSegments(result?.segments).map((item) => item.text).join(" ");
      const comparison = compareDictation(recordingTarget.text, recognizedText, comparisonLanguage);
      setShadowResult({ rhythmScore, recognizedText, speechScore: comparison.score });
      const previousAttempts = lesson?.languageLab?.shadowingAttempts || [];
      onUpdateLesson?.({
        languageLab: {
          ...(lesson?.languageLab || {}),
          shadowingAttempts: [
            {
              id: `shadow-${Date.now()}`,
              segmentId: recordingTarget.id,
              rhythmScore,
              speechScore: comparison.score,
              recognizedText,
              createdAt: Date.now(),
            },
            ...previousAttempts,
          ].slice(0, 30),
        },
      });
    } catch (error) {
      setFeedbackMessage(error.message || "Não foi possível analisar a gravação.", "error");
    } finally {
      releaseRequest(requestId);
      finishBusy("compare");
    }
  };

  const createFlashcard = async (segment = selectedSegment) => {
    if (!segment) return;
    if (!beginBusy("flashcard")) return;
    let extractionRequestId = null;
    try {
      let audioClipPath = null;
      let clipFailed = false;
      if (activeMedia && activeLocalMediaPath && activeMedia.kind !== "youtube" && getApi()?.extractClip) {
        extractionRequestId = trackRequest(createRequestId("flashcard-clip"));
        try {
          const clip = await getApi().extractClip({
            requestId: extractionRequestId,
            mediaPath: activeLocalMediaPath,
            start: segment.start,
            end: segment.end,
          });
          if (clip?.ok !== false) audioClipPath = clip?.clipPath || clip?.path || null;
          else clipFailed = true;
        } catch {
          clipFailed = true;
        } finally {
          releaseRequest(extractionRequestId);
          extractionRequestId = null;
        }
      }
      if (!isMountedRef.current || isClosingRef.current) return;
      await onCreateFlashcard?.({
        front: segment.text,
        back: cardBack.trim() || `Ouça e repita o trecho em ${formatMediaTime(segment.start)}.`,
        segment,
        audioClipPath,
        sourceMediaPath: activeLocalMediaPath || activeMedia?.path || null,
        sourceMediaKind: activeMedia?.kind || null,
      });
      setFeedbackMessage(
        audioClipPath
          ? "Flashcard criado com áudio."
          : clipFailed
            ? "O áudio não pôde ser recortado; o flashcard foi criado com timestamp."
            : "Flashcard criado com timestamp.",
        clipFailed ? "warning" : "success",
      );
      setCardBack("");
    } catch (error) {
      setFeedbackMessage(error.message || "Não foi possível criar o flashcard.", "error");
    } finally {
      if (extractionRequestId) releaseRequest(extractionRequestId);
      finishBusy("flashcard");
    }
  };

  const playerNode = useMemo(() => {
    if (!activeMedia) {
      return (
        <div className="flex aspect-video flex-col items-center justify-center rounded-[2rem] bg-[#111117] text-white/60">
          <Icon className="text-6xl" name="video_library" />
          <p className="mt-4 font-bold">Adicione um vídeo ou áudio à aula.</p>
        </div>
      );
    }
    if (activeMedia.kind === "youtube") {
      return (
        <div className="flex aspect-video flex-col items-center justify-center rounded-[2rem] bg-[#111117] px-8 text-center text-white">
          <Icon className="text-6xl text-red-400" name="smart_display" />
          <h3 className="mt-4 text-xl font-bold">YouTube em modo limitado</h3>
          <p className="mt-2 max-w-lg text-sm leading-6 text-white/65">
            Loop A–B, velocidade e transcrição local precisam de um arquivo de vídeo ou áudio salvo no computador.
          </p>
        </div>
      );
    }
    if (activeMedia.kind === "video") {
      return (
        <video
          ref={videoRef}
          className="aspect-video w-full rounded-[2rem] bg-black object-contain shadow-2xl"
          controls
          src={getLocalFileUrl(activeMedia.path)}
        />
      );
    }
    return (
      <div className="flex aspect-video flex-col items-center justify-center rounded-[2rem] bg-[radial-gradient(circle_at_50%_15%,#34304f,#111117_70%)] px-8 text-white shadow-2xl">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/10">
          <Icon className="text-5xl text-white/80" name="graphic_eq" />
        </div>
        <p className="mt-5 max-w-md truncate text-center text-sm font-bold text-white/75">{activeMedia.title}</p>
        <audio ref={audioRef} className="mt-6 w-full max-w-xl" controls src={getLocalFileUrl(activeMedia.path)} />
      </div>
    );
  }, [activeMedia]);

  const renderPractice = () => {
    if (!selectedSegment) {
      return (
        <div className="rounded-[2rem] border border-dashed border-[color:var(--outline-variant)] p-8 text-center">
          <Icon className="text-4xl text-[color:var(--outline)]" name="subtitles_off" />
          <p className="mt-3 text-sm text-[color:var(--on-surface-variant)]">Importe ou gere uma transcrição para começar.</p>
        </div>
      );
    }

    if (practiceMode === "dictation") {
      return (
        <div className="rounded-[2rem] bg-[color:var(--surface)] p-6 neo-raised">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[.18em] text-[color:var(--primary)]">Ditado ativo</p>
              <h3 className="mt-1 text-xl font-bold">Ouça sem olhar a resposta</h3>
            </div>
            <button className="rounded-xl px-4 py-2 text-sm font-bold neo-inset" onClick={() => playSegment(selectedSegment, false)}>
              <Icon name="volume_up" /> Ouvir trecho
            </button>
          </div>
          <textarea
            className="mt-5 min-h-28 w-full rounded-2xl bg-[color:var(--background)] p-4 text-base outline-none neo-inset"
            placeholder="Digite exatamente o que você ouviu..."
            value={dictationInput}
            onChange={(event) => setDictationInput(event.target.value)}
          />
          <div className="mt-4 flex flex-wrap gap-3">
            <button className="rounded-xl bg-[color:var(--primary)] px-5 py-3 text-sm font-bold text-white disabled:opacity-40" disabled={!dictationInput.trim() || isBusy} onClick={checkDictation}>Conferir</button>
            <button className="rounded-xl px-4 py-3 text-sm font-bold neo-inset disabled:opacity-50" disabled={isBusy} onClick={() => setShowDictationAnswer((value) => !value)}>Revelar resposta</button>
            <button className="rounded-xl px-4 py-3 text-sm font-bold neo-inset disabled:opacity-50" disabled={interactionsLocked} onClick={nextSegment}>Próxima frase</button>
          </div>
          {showDictationAnswer ? (
            <div className="mt-5 rounded-2xl bg-[color:var(--background)] p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-[color:var(--on-surface-variant)]">Resposta</p>
              <p className="mt-2 text-lg font-semibold leading-8"><VocabTextRenderer text={selectedSegment.text} /></p>
              {dictationResult ? (
                <div className="mt-4 flex flex-wrap items-center gap-5">
                  <ScoreRing value={dictationResult.score} label="Precisão" />
                  <p className="max-w-md text-sm leading-6 text-[color:var(--on-surface-variant)]">
                    {dictationResult.score === 100
                      ? "Perfeito: todas as palavras foram reconhecidas."
                      : `${dictationResult.operations.filter((item) => item.type !== "match").length} diferença(s) encontrada(s).`}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      );
    }

    if (practiceMode === "shadowing") {
      const shadowingTarget = recordingTargetRef.current || selectedSegment;
      const targetDuration = Math.max(0.1, shadowingTarget.end - shadowingTarget.start);
      return (
        <div className="rounded-[2rem] bg-[color:var(--surface)] p-6 neo-raised">
          <p className="text-xs font-black uppercase tracking-[.18em] text-[color:var(--primary)]">Shadowing</p>
          <p className="mt-3 text-xl font-bold leading-8"><VocabTextRenderer text={selectedSegment.text} /></p>
          <p className="mt-2 text-sm text-[color:var(--on-surface-variant)]">Ouça, imite o ritmo e compare sua gravação.</p>
          {shadowGuidePhase !== "idle" ? (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-[color:var(--primary)]/10 px-4 py-3">
              <div>
                <p className="text-sm font-black text-[color:var(--primary)]">
                  {shadowGuidePhase === "listening" ? "Ouça a frase original..." : `Prepare-se: ${shadowCountdown}`}
                </p>
                <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">
                  {shadowGuidePhase === "listening" ? "A gravação começa automaticamente depois do áudio." : "Fale assim que a contagem terminar."}
                </p>
              </div>
              <button className="rounded-xl px-3 py-2 text-xs font-bold neo-inset" onClick={cancelGuidedShadowing}>Cancelar</button>
            </div>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-3">
            <button className="rounded-xl px-4 py-3 text-sm font-bold neo-inset disabled:opacity-50" disabled={interactionsLocked} onClick={() => playSegment(selectedSegment, false)}>
              <Icon name="hearing" /> Ouvir original
            </button>
            <button className="rounded-xl bg-[color:var(--primary)] px-4 py-3 text-sm font-bold text-white disabled:opacity-50" disabled={isBusy || isRecording || shadowGuidePhase !== "idle"} onClick={startGuidedShadowing}>
              <Icon name="auto_awesome" /> Iniciar guia
            </button>
            {recordingPhase === "idle" ? (
              <button className="rounded-xl bg-red-500 px-4 py-3 text-sm font-bold text-white disabled:opacity-50" disabled={isBusy || shadowGuidePhase !== "idle"} onClick={startRecording}>
                <Icon name="mic" /> Gravar minha voz
              </button>
            ) : recordingPhase === "recording" ? (
              <button className="animate-pulse rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white" onClick={stopRecording}>
                <Icon name="stop_circle" /> Parar gravação
              </button>
            ) : (
              <button className="rounded-xl bg-red-500 px-4 py-3 text-sm font-bold text-white opacity-60" disabled>
                <Icon name="hourglass_top" /> {recordingPhase === "starting" ? "Ativando microfone..." : "Finalizando..."}
              </button>
            )}
          </div>
          {recordingUrl ? (
            <div className="mt-5 rounded-2xl bg-[color:var(--background)] p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-[color:var(--on-surface-variant)]">Minha voz</p>
                  <p className="mt-1 text-sm font-semibold">{recordingDuration.toFixed(1)}s gravados · original {targetDuration.toFixed(1)}s</p>
                </div>
                <audio className="max-w-full" controls src={recordingUrl} />
              </div>
              <button className="mt-4 rounded-xl bg-[color:var(--primary)] px-4 py-3 text-sm font-bold text-white disabled:opacity-50" disabled={isBusy} onClick={compareShadowing}>
                {busyAction === "compare" ? "Analisando..." : "Comparar com o original"}
              </button>
              {shadowResult ? (
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <ScoreRing value={shadowResult.rhythmScore} label="Ritmo" />
                  {shadowResult.speechScore !== null ? <ScoreRing value={shadowResult.speechScore} label="Palavras reconhecidas" /> : null}
                  {shadowResult.recognizedText ? (
                    <p className="sm:col-span-2 rounded-xl bg-[color:var(--surface)] p-4 text-sm leading-6 text-[color:var(--on-surface-variant)]">
                      O Whisper ouviu: “{shadowResult.recognizedText}”
                    </p>
                  ) : !environment?.whisperAvailable ? (
                    <p className="sm:col-span-2 text-xs text-[color:var(--on-surface-variant)]">
                      O ritmo já foi comparado. Prepare o Whisper para também comparar as palavras reconhecidas.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      );
    }

    if (practiceMode === "flashcard") {
      return (
        <div className="rounded-[2rem] bg-[color:var(--surface)] p-6 neo-raised">
          <p className="text-xs font-black uppercase tracking-[.18em] text-[color:var(--primary)]">Mineração de frase</p>
          <p className="mt-3 text-xl font-bold leading-8">{selectedSegment.text}</p>
          <p className="mt-2 text-xs font-bold text-[color:var(--on-surface-variant)]">{formatMediaTime(selectedSegment.start)} → {formatMediaTime(selectedSegment.end)}</p>
          <textarea
            className="mt-5 min-h-24 w-full rounded-2xl bg-[color:var(--background)] p-4 text-sm outline-none neo-inset"
            placeholder="Tradução, significado ou observação para o verso..."
            value={cardBack}
            onChange={(event) => setCardBack(event.target.value)}
          />
          <button className="mt-4 rounded-xl bg-[color:var(--primary)] px-5 py-3 text-sm font-bold text-white disabled:opacity-50" disabled={interactionsLocked} onClick={() => createFlashcard()}>
            <Icon name="style" /> {busyAction === "flashcard" ? "Criando..." : "Criar flashcard com áudio"}
          </button>
        </div>
      );
    }

    return (
      <div className="rounded-[2rem] bg-[color:var(--surface)] p-6 neo-raised">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[.18em] text-[color:var(--primary)]">Frase selecionada</p>
            <p className="mt-3 text-2xl font-bold leading-9">{selectedSegment.text}</p>
            <p className="mt-2 text-xs font-bold text-[color:var(--on-surface-variant)]">{formatMediaTime(selectedSegment.start)} → {formatMediaTime(selectedSegment.end)}</p>
          </div>
          <div className="flex gap-2">
            <button className="rounded-xl px-4 py-3 text-sm font-bold neo-inset" onClick={() => playSegment(selectedSegment, false)}><Icon name="play_arrow" /> Ouvir</button>
            <button className="rounded-xl bg-[color:var(--primary)] px-4 py-3 text-sm font-bold text-white" onClick={() => playSegment(selectedSegment, true)}><Icon name="repeat" /> Repetir</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <motion.div
      className="fixed inset-0 z-[260] flex flex-col bg-[color:var(--background)] text-[color:var(--on-surface)]"
      initial={{ opacity: 0, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.985 }}
      transition={{ duration: 0.2 }}
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-[color:var(--outline-variant)]/45 bg-[color:var(--surface)] px-6 py-4 lg:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[color:var(--primary)] text-white shadow-lg">
            <Icon className="text-2xl" name="translate" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[.18em] text-[color:var(--primary)]">Modo Idiomas</p>
            <h1 className="truncate text-xl font-bold">{lesson?.title || "Laboratório de idiomas"}</h1>
            <p className="truncate text-xs text-[color:var(--on-surface-variant)]">{courseTitle} · {moduleTitle}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill tone={environment?.apiUnavailable ? "error" : environment?.whisperAvailable ? "success" : "warning"}>
            <Icon name={environment?.apiUnavailable ? "restart_alt" : environment?.whisperAvailable ? "check_circle" : "download"} />
            {environment?.apiUnavailable
              ? "Reinicie o masterStudy"
              : environment?.whisperAvailable
                ? "Whisper pronto"
                : "Whisper não preparado"}
          </StatusPill>
          <button className="flex h-11 w-11 items-center justify-center rounded-full neo-inset" aria-label="Fechar modo idiomas" onClick={handleClose}>
            <Icon name="close" />
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(0,1.35fr)_minmax(390px,.65fr)]">
        <main className="min-h-0 overflow-y-auto p-5 custom-scrollbar lg:p-7">
          <div className="mx-auto max-w-5xl space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {media.map((item) => (
                  <button
                    key={item.id}
                    className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold ${item.id === activeMedia?.id ? "bg-[color:var(--primary)] text-white" : "neo-inset text-[color:var(--on-surface-variant)]"}`}
                    onClick={() => selectMedia(item)}
                  >
                    <Icon name={item.kind === "audio" ? "headphones" : item.kind === "youtube" ? "smart_display" : "movie"} />
                    {item.title}
                  </button>
                ))}
              </div>
              {activeMedia && activeMedia.kind !== "youtube" ? (
                <label className="flex items-center gap-3 rounded-full px-4 py-2 text-xs font-bold neo-inset">
                  <Icon name="speed" />
                  <span>{activeMedia.kind === "audio" ? "Áudio" : "Vídeo"}</span>
                  <select className="border-0 bg-transparent p-0 text-xs font-black outline-none" value={activeRate} onChange={(event) => handleRateChange(Number(event.target.value))}>
                    {RATE_OPTIONS.map((rate) => <option key={rate} value={rate}>{rate}×</option>)}
                  </select>
                </label>
              ) : null}
            </div>

            {playerNode}

            {activeMedia && activeMedia.kind !== "youtube" ? (
              <section className="rounded-[2rem] bg-[color:var(--surface)] p-5 neo-raised">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <button className="rounded-xl px-3 py-2 text-xs font-bold neo-inset" onClick={() => setLoopStart(currentTime)}>A · {loopStart === null ? "marcar" : formatMediaTime(loopStart)}</button>
                    <button className="rounded-xl px-3 py-2 text-xs font-bold neo-inset" onClick={() => setLoopEnd(currentTime)}>B · {loopEnd === null ? "marcar" : formatMediaTime(loopEnd)}</button>
                    <button
                      className={`rounded-xl px-4 py-2 text-xs font-bold ${loopEnabled ? "bg-[color:var(--primary)] text-white" : "neo-inset"}`}
                      disabled={!loopBounds}
                      onClick={() => setLoopEnabled((value) => !value)}
                    >
                      <Icon name="repeat" /> Loop A–B
                    </button>
                    <button className="rounded-xl px-3 py-2 text-xs font-bold neo-inset" onClick={() => { setLoopStart(null); setLoopEnd(null); setLoopEnabled(false); }}>Limpar</button>
                  </div>
                  <p className="text-xs font-bold text-[color:var(--on-surface-variant)]">{formatMediaTime(currentTime)} / {formatMediaTime(duration)}</p>
                </div>
              </section>
            ) : null}

            <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
              {[
                ["study", "Trecho", "subtitles"],
                ["dictation", "Ditado", "keyboard"],
                ["shadowing", "Shadowing", "mic"],
                ["flashcard", "Flashcard", "style"],
              ].map(([id, label, icon]) => (
                <button key={id} disabled={interactionsLocked} className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-bold disabled:opacity-50 ${practiceMode === id ? "bg-[color:var(--primary)] text-white" : "neo-inset"}`} onClick={() => setPracticeMode(id)}>
                  <Icon name={icon} /> {label}
                </button>
              ))}
            </div>
            {renderPractice()}
          </div>
        </main>

        <aside className="flex min-h-0 flex-col border-l border-[color:var(--outline-variant)]/45 bg-[color:var(--surface)]">
          <div className="border-b border-[color:var(--outline-variant)]/45 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[.16em] text-[color:var(--primary)]">Transcrição sincronizada</p>
                <p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">{segments.length} frases</p>
              </div>
              <button className="rounded-xl px-3 py-2 text-xs font-bold neo-inset disabled:opacity-50" disabled={interactionsLocked} onClick={importTranscript}>
                <Icon name="upload_file" /> Importar
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <select disabled={interactionsLocked} className="rounded-xl bg-[color:var(--background)] px-3 py-2 text-xs font-bold outline-none neo-inset disabled:opacity-50" value={sourceLanguage} onChange={(event) => setSourceLanguage(event.target.value)}>
                {LANGUAGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <select disabled={interactionsLocked} className="rounded-xl bg-[color:var(--background)] px-3 py-2 text-xs font-bold outline-none neo-inset disabled:opacity-50" value={whisperModel} onChange={(event) => setWhisperModel(event.target.value)}>
                <option value="tiny">Tiny · rápido</option>
                <option value="base">Base · equilibrado</option>
                <option value="small">Small · preciso</option>
                <option value="medium">Medium · avançado</option>
              </select>
            </div>
            {environment?.apiUnavailable ? (
              <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs leading-5 text-[color:var(--on-surface-variant)]">
                <p className="font-bold text-red-600">O módulo local ainda não foi carregado nesta sessão.</p>
                <p className="mt-1">Feche completamente o masterStudy e abra a versão atualizada.</p>
              </div>
            ) : environment?.python?.available === false ? (
              <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-5 text-[color:var(--on-surface-variant)]">
                <p className="font-bold text-amber-700">O Whisper precisa do Python instalado no computador.</p>
                <button
                  className="mt-2 font-black text-[color:var(--primary)] underline underline-offset-2"
                  type="button"
                  onClick={() => window.studyhubDesktop?.openExternal?.("https://www.python.org/downloads/")}
                >
                  Abrir página oficial do Python
                </button>
              </div>
            ) : null}
            {!environment?.whisperAvailable ? (
              <button className="mt-3 w-full rounded-xl bg-amber-500 px-4 py-3 text-xs font-black text-white disabled:opacity-50" disabled={interactionsLocked || environment?.python?.available === false} onClick={installWhisper}>
                <Icon name="download" /> {busyAction === "install" ? progressMessage || "Preparando..." : "Preparar Whisper local"}
              </button>
            ) : (
              <button className="mt-3 w-full rounded-xl bg-[color:var(--primary)] px-4 py-3 text-xs font-black text-white disabled:opacity-50" disabled={interactionsLocked || !activeMedia || !activeLocalMediaPath || activeMedia?.kind === "youtube"} onClick={transcribeMedia}>
                <Icon name="auto_awesome" /> {busyAction === "transcribe" ? progressMessage || "Transcrevendo..." : "Transcrever mídia atual"}
              </button>
            )}
            <label className="mt-3 flex items-center gap-2 rounded-xl bg-[color:var(--background)] px-3 py-2">
              <Icon className="text-base text-[color:var(--outline)]" name="search" />
              <input className="min-w-0 flex-1 bg-transparent text-xs outline-none" placeholder="Buscar na transcrição" value={transcriptQuery} onChange={(event) => setTranscriptQuery(event.target.value)} />
            </label>
          </div>

          {filteredSegments.length > TRANSCRIPT_PAGE_SIZE ? (
            <div className="flex items-center justify-between border-b border-[color:var(--outline-variant)]/35 px-4 py-2 text-[11px] font-bold text-[color:var(--on-surface-variant)]">
              <button className="rounded-lg px-2 py-1 neo-inset disabled:opacity-35" disabled={interactionsLocked || safeTranscriptPage === 0} onClick={() => setTranscriptPage((page) => Math.max(0, page - 1))}>Anterior</button>
              <span>Página {safeTranscriptPage + 1} de {transcriptPageCount}</span>
              <button className="rounded-lg px-2 py-1 neo-inset disabled:opacity-35" disabled={interactionsLocked || safeTranscriptPage >= transcriptPageCount - 1} onClick={() => setTranscriptPage((page) => Math.min(transcriptPageCount - 1, page + 1))}>Próxima</button>
            </div>
          ) : null}
          <div ref={transcriptListRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4 custom-scrollbar">
            {filteredSegments.length ? visibleSegments.map((segment) => {
              const isActive = activeSegment?.id === segment.id;
              const isSelected = selectedSegment?.id === segment.id;
              return (
                <div
                  key={segment.id}
                  data-segment-id={segment.id}
                  className={`group rounded-2xl border p-3 transition-all ${isSelected ? "border-[color:var(--primary)] bg-[color:var(--primary)]/10" : isActive ? "border-[color:var(--tertiary)]/60 bg-[color:var(--tertiary)]/8" : "border-transparent bg-[color:var(--background)] hover:border-[color:var(--outline-variant)]"}`}
                >
                  <button className="w-full text-left disabled:opacity-50" disabled={interactionsLocked} onClick={() => playSegment(segment, false)}>
                    <span className="text-[10px] font-black text-[color:var(--primary)]">{formatMediaTime(segment.start)}</span>
                    <span className="mt-1 block text-sm font-semibold leading-6">{segment.text}</span>
                  </button>
                  <div className="mt-2 flex items-center gap-2 opacity-60 transition-opacity group-hover:opacity-100">
                    <button disabled={interactionsLocked} className="rounded-lg px-2 py-1 text-[10px] font-bold neo-inset disabled:opacity-40" title="Repetir frase" onClick={() => playSegment(segment, true)}><Icon className="text-sm" name="repeat" /> Repetir</button>
                    <button disabled={interactionsLocked} className="rounded-lg px-2 py-1 text-[10px] font-bold neo-inset disabled:opacity-40" title="Criar flashcard" onClick={() => { if (recordingTargetRef.current?.id !== segment.id) clearRecordingResult(); setSelectedSegmentId(segment.id); setPracticeMode("flashcard"); }}><Icon className="text-sm" name="style" /> Cartão</button>
                  </div>
                </div>
              );
            }) : (
              <div className="flex h-full min-h-64 flex-col items-center justify-center px-6 text-center">
                <Icon className="text-5xl text-[color:var(--outline)]" name="subtitles" />
                <h3 className="mt-4 font-bold">Nenhuma transcrição</h3>
                <p className="mt-2 text-sm leading-6 text-[color:var(--on-surface-variant)]">Importe VTT, SRT ou JSON, ou prepare o Whisper para gerar tudo localmente.</p>
              </div>
            )}
          </div>
        </aside>
      </div>

      <AnimatePresence>
        {feedback ? (
          <motion.div
            className={`fixed bottom-5 left-1/2 z-[280] -translate-x-1/2 rounded-2xl px-5 py-3 text-sm font-bold text-white shadow-2xl ${feedback.tone === "error" ? "bg-red-600" : feedback.tone === "warning" ? "bg-amber-600" : "bg-emerald-600"}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
          >
            {feedback.message}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}
