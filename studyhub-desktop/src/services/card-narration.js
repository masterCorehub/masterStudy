// Own one playback session; late async results cannot restart a discarded card.
export function createCardNarration({
  native,
  synthesis,
  createUtterance,
  createAudio,
  onChange,
}) {
  let state = { key: null, status: "idle" };
  let generation = 0;
  let engine = null;
  let audio = null;
  const emit = (status, key = state.key) => {
    state = { key, status };
    onChange(state);
  };
  const stop = () => {
    generation += 1;
    if (audio) {
      audio.pause();
      audio.onended = null;
      audio.onerror = null;
      audio = null;
    }
    if (engine === "browser") synthesis?.cancel();
    if (engine === "native")
      Promise.resolve(native?.stopSpeech?.()).catch(() => {});
    engine = null;
    emit("idle", null);
  };
  const toggle = async (text, key) => {
    const value = String(text || "").trim();
    if (!value) return;
    if (state.key === key && state.status !== "idle") {
      const paused = state.status === "playing";
      emit(paused ? "paused" : "playing");
      if (audio) {
        if (paused) audio.pause();
        else await audio.play().catch(() => emit("idle", null));
      } else if (engine === "browser") {
        if (paused) synthesis.pause();
        else synthesis.resume();
      } else if (engine === "native") {
        const current = generation;
        let result;
        try {
          result = await (paused
            ? native.pauseSpeech?.()
            : native.resumeSpeech?.());
        } catch {
          result = null;
        }
        // Older desktop bridges can stop safely, but cannot resume native speech.
        if (current === generation && !result?.ok) stop();
      }
      return;
    }
    stop();
    const current = generation;
    const finish = () => {
      if (current === generation) {
        engine = null;
        emit("idle", null);
      }
    };
    const language =
      /\b(que|não|para|com|uma|dos|das|como|sobre|estudar|resposta|pergunta|sistema|função|classe|exemplo)\b/i.test(
        value,
      ) || /[ãõáéíóúç]/i.test(value)
        ? "pt-BR"
        : "en-US";
    emit("playing", key);
    if (native?.speak) {
      engine = "native";
      let result;
      try {
        result = await native.speak({ text: value, language });
      } catch {
        result = null;
      }
      if (current !== generation) return;
      if (result?.audioBase64) {
        engine = "audio";
        audio = createAudio(
          `data:${result.mimeType || "audio/wav"};base64,${result.audioBase64}`,
        );
        audio.onended = finish;
        audio.onerror = finish;
        if (state.status !== "paused") await audio.play().catch(finish);
        return;
      }
      if (result?.ok || result?.cancelled) {
        finish();
        return;
      }
    }
    if (!synthesis) {
      finish();
      return;
    }
    engine = "browser";
    const utterance = createUtterance(value);
    utterance.lang = language;
    utterance.voice =
      (synthesis.getVoices?.() || []).find((voice) =>
        voice.lang?.toLowerCase().startsWith(language.toLowerCase()),
      ) || null;
    utterance.onend = finish;
    utterance.onerror = finish;
    // cancel() clears the queue but can leave the browser engine paused.
    if (synthesis.paused) synthesis.resume();
    synthesis.speak(utterance);
    if (state.status === "paused") synthesis.pause();
  };
  return { toggle, stop };
}
