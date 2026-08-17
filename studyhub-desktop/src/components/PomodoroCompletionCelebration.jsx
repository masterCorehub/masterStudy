import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePomodoroStore } from "../store/usePomodoroStore";
import { Icon } from "../ui/Icon";

export function PomodoroCompletionCelebration() {
  const completion = usePomodoroStore((state) => state.lastCompletion);
  const lastCompletionId = useRef(completion?.id || null);
  const [visibleCompletion, setVisibleCompletion] = useState(null);

  useEffect(() => {
    if (!completion?.id || completion.id === lastCompletionId.current) return;

    lastCompletionId.current = completion.id;
    setVisibleCompletion(completion);
    window.studyhubDesktop?.notifyPomodoroCompletion?.(completion);

    const soundKey = `studyhub.pomodoro-sound-${completion.id}`;
    if (!window.localStorage.getItem(soundKey)) {
      window.localStorage.setItem(soundKey, "1");
      const audio = new Audio(
        "https://cdn.pixabay.com/download/audio/2021/08/04/audio_0625c1539c.mp3?filename=success-1-6297.mp3",
      );
      audio.play().catch(() => {});
    }

    const timeoutId = window.setTimeout(() => setVisibleCompletion(null), 6000);
    return () => window.clearTimeout(timeoutId);
  }, [completion]);

  const focusFinished = visibleCompletion?.phase === "focus";
  const title = focusFinished ? "Foco concluido!" : "Descanso concluido!";
  const message = focusFinished
    ? "Mandou bem. Seu proximo bloco ja esta pronto."
    : "Hora de voltar com energia para o proximo foco.";
  const icon = focusFinished ? "emoji_events" : "wb_sunny";
  const accent = focusFinished ? "text-amber-400" : "text-sky-400";

  return (
    <AnimatePresence>
      {visibleCompletion ? (
        <motion.div
          // allow interactions so user can close early
          className="fixed inset-0 z-[400] flex items-center justify-center p-6 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setVisibleCompletion(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.72, y: 28 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.86, y: -16 }}
            transition={{ type: "spring", stiffness: 360, damping: 22 }}
            onClick={() => setVisibleCompletion(null)}
            className="relative w-full max-w-sm cursor-pointer overflow-hidden rounded-[1.5rem] border border-[color:var(--outline-variant)]/40 bg-[color:var(--surface)] p-6 text-center shadow-2xl backdrop-blur-xl"
          >
            {/* close button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setVisibleCompletion(null);
              }}
              className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--surface-variant)] text-[color:var(--on-surface-variant)] hover:bg-[color:var(--background)] hover:text-red-500 transition-colors"
              title="Fechar"
            >
              <Icon name="close" className="text-sm" />
            </button>

            <motion.div
              className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[color:var(--surface-variant)] ${accent}`}
              animate={{ scale: [1, 1.08, 1], rotate: [0, -4, 4, 0] }}
              transition={{ duration: 0.6 }}
            >
              <Icon className="text-3xl text-[color:var(--on-surface)]" name={icon} />
            </motion.div>

            <p className="text-xl font-black text-[color:var(--on-surface)]">{title}</p>
            <p className="mt-2 text-sm leading-relaxed text-[color:var(--on-surface-variant)]">{message}</p>
            
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setVisibleCompletion(null);
              }}
              className="mt-5 w-full h-11 rounded-2xl bg-[color:var(--primary)] text-white text-xs font-black shadow-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5"
            >
              <Icon name="check" className="text-base" />
              Entendido
            </button>

            <div className="mt-4 h-1 overflow-hidden rounded-full bg-[color:var(--surface-variant)]/50">
              <motion.div
                className={`h-full ${focusFinished ? "bg-amber-400" : "bg-sky-400"}`}
                initial={{ width: "100%" }}
                animate={{ width: "0%" }}
                transition={{ duration: 6, ease: "linear" }}
              />
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
