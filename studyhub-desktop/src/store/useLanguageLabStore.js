import { create } from "zustand";
import { persist } from "zustand/middleware";
import { clampPlaybackRate } from "../utils/languageUtils";

export const useLanguageLabStore = create(
  persist(
    (set) => ({
      videoRate: 1,
      audioRate: 1,
      sourceLanguage: "auto",
      whisperModel: "base",
      setVideoRate: (value) => set({ videoRate: clampPlaybackRate(value) }),
      setAudioRate: (value) => set({ audioRate: clampPlaybackRate(value) }),
      setSourceLanguage: (value) => set({ sourceLanguage: value || "auto" }),
      setWhisperModel: (value) => set({ whisperModel: value || "base" }),
    }),
    {
      name: "studyhub-language-lab-v1",
      version: 1,
    },
  ),
);
