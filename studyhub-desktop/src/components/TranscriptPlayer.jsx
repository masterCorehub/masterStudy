import { useEffect, useMemo, useRef, useState } from "react";
import {
  findActiveTranscriptSegment,
  formatMediaTime,
  normalizeTranscriptSegments,
} from "../utils/languageUtils";
import { loadTranscriptRecord } from "../utils/transcriptStorage";
import { Icon } from "../ui/Icon";

export function TranscriptPlayer({ audioRef, transcript, transcriptStorageKey }) {
  const [currentTime, setCurrentTime] = useState(0);
  const [storedTranscript, setStoredTranscript] = useState([]);
  const containerRef = useRef(null);
  const inlineSegments = useMemo(
    () => normalizeTranscriptSegments(transcript),
    [transcript],
  );
  const segments = inlineSegments.length ? inlineSegments : storedTranscript;
  const activeSegment = findActiveTranscriptSegment(segments, currentTime);

  useEffect(() => {
    let canceled = false;
    if (inlineSegments.length || !transcriptStorageKey) {
      setStoredTranscript([]);
      return () => {
        canceled = true;
      };
    }
    loadTranscriptRecord(transcriptStorageKey)
      .then((record) => {
        if (!canceled) setStoredTranscript(normalizeTranscriptSegments(record?.segments));
      })
      .catch(() => {
        if (!canceled) setStoredTranscript([]);
      });
    return () => {
      canceled = true;
    };
  }, [inlineSegments.length, transcriptStorageKey]);

  useEffect(() => {
    const audioElement = audioRef?.current;
    if (!audioElement) return undefined;

    const updateTime = () => setCurrentTime(audioElement.currentTime || 0);
    audioElement.addEventListener("timeupdate", updateTime);
    return () => audioElement.removeEventListener("timeupdate", updateTime);
  }, [audioRef]);

  useEffect(() => {
    if (!activeSegment || !containerRef.current) return;
    const element = containerRef.current.querySelector(
      `[data-transcript-id="${CSS.escape(activeSegment.id)}"]`,
    );
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeSegment?.id]);

  if (!segments.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center rounded-[24px] p-8 text-center neo-inset">
        <Icon className="text-5xl text-[color:var(--outline)]" name="subtitles_off" />
        <h3 className="mt-4 font-bold text-[color:var(--on-surface)]">
          Sem transcrição sincronizada
        </h3>
        <p className="mt-2 max-w-sm text-sm leading-6 text-[color:var(--on-surface-variant)]">
          Abra o Modo Idiomas na aula para importar VTT/SRT/JSON ou gerar a transcrição localmente com Whisper.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-y-auto rounded-[24px] p-6 custom-scrollbar neo-inset"
    >
      <div className="relative z-0 space-y-3 py-8">
        {segments.map((segment) => {
          const isActive = segment.id === activeSegment?.id;
          const isPast = currentTime >= segment.end;
          return (
            <button
              key={segment.id}
              data-transcript-id={segment.id}
              className={`block w-full rounded-2xl px-4 py-3 text-left transition-all ${
                isActive
                  ? "bg-[color:var(--primary)]/12 text-[color:var(--primary)] shadow-sm"
                  : isPast
                    ? "text-[color:var(--on-surface)] opacity-75"
                    : "text-[color:var(--on-surface-variant)] opacity-55 hover:opacity-100"
              }`}
              type="button"
              onClick={() => {
                const audioElement = audioRef?.current;
                if (!audioElement) return;
                audioElement.currentTime = segment.start;
                audioElement.play().catch(() => {});
              }}
            >
              <span className="mb-1 block text-[10px] font-black uppercase tracking-wide">
                {formatMediaTime(segment.start)}
              </span>
              <span className="text-base font-semibold leading-7">
                {segment.text}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
