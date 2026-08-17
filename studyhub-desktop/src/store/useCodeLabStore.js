import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getLocalDateKey } from "../utils/dateUtils.js";

const DAY = 24 * 60 * 60 * 1000;
const MAX_ERRORS = 100;
const MAX_CHAT_MESSAGES = 60;

export const REVIEW_INTERVALS = {
  hard: 1,
  good: 3,
  easy: 7,
};

const todayKey = (time = Date.now()) => getLocalDateKey(new Date(time));

const clampText = (value, max = 8000) => String(value || "").slice(0, max);

const normalizeProgress = (value = {}) => ({
  status: value.status || "locked",
  attempts: Number(value.attempts || 0),
  runs: Number(value.runs || 0),
  passedRuns: Number(value.passedRuns || 0),
  hintsUsed: Number(value.hintsUsed || 0),
  lastResult: value.lastResult || null,
  lastError: value.lastError || null,
  lastStudiedAt: value.lastStudiedAt || null,
  completedAt: value.completedAt || null,
  nextReviewAt: value.nextReviewAt || null,
  reviewIntervalDays: Number(value.reviewIntervalDays || 0),
  confidence: value.confidence || null,
});

const addStudyDay = (dates, timestamp = Date.now()) => {
  const next = Array.from(new Set([...(dates || []), todayKey(timestamp)]));
  return next.sort().slice(-366);
};

const calculateStreak = (dates = [], now = Date.now()) => {
  const set = new Set(dates);
  let cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  if (!set.has(todayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (set.has(todayKey(cursor.getTime()))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
};

export const getReviewInterval = (confidence, previous = 0) => {
  const base = REVIEW_INTERVALS[confidence] || REVIEW_INTERVALS.good;
  if (!previous) return base;
  const multiplier = confidence === "hard" ? 1.5 : confidence === "easy" ? 4 : 2.5;
  return Math.min(60, Math.max(1, Math.round(previous * multiplier)));
};

const initialState = {
  profile: {
    level: "beginner",
    goal: "fundamentals",
    dailyMinutes: 60,
    createdAt: null,
  },
  progressByChallenge: {},
  studyDates: [],
  errorJournal: [],
  consentAt: null,
  aiSettings: {
    enabled: true,
    model: "mistral:latest",
    endpoint: "http://127.0.0.1:11434",
  },
  chatMessages: [],
  activeChallengeId: null,
};

export const useCodeLabStore = create(
  persist(
    (set, get) => ({
      ...initialState,

      updateProfile: (updates) =>
        set((state) => ({
          profile: {
            ...state.profile,
            ...updates,
            createdAt: state.profile.createdAt || Date.now(),
          },
        })),

      setActiveChallenge: (challengeId) => set({ activeChallengeId: challengeId || null }),

      setConsent: () => set({ consentAt: Date.now() }),

      setAiSettings: (updates) =>
        set((state) => ({ aiSettings: { ...state.aiSettings, ...updates } })),

      getProgress: (challengeId) => normalizeProgress(get().progressByChallenge[challengeId]),

      markChallengeStarted: (challengeId, timestamp = Date.now()) =>
        set((state) => ({
          activeChallengeId: challengeId,
          studyDates: addStudyDay(state.studyDates, timestamp),
          progressByChallenge: {
            ...state.progressByChallenge,
            [challengeId]: {
              ...normalizeProgress(state.progressByChallenge[challengeId]),
              status:
                normalizeProgress(state.progressByChallenge[challengeId]).status === "locked"
                  ? "in_progress"
                  : normalizeProgress(state.progressByChallenge[challengeId]).status,
              lastStudiedAt: timestamp,
            },
          },
        })),

      recordRun: (challengeId, result, timestamp = Date.now()) =>
        set((state) => {
          const previous = normalizeProgress(state.progressByChallenge[challengeId]);
          const passed = result?.status === "passed";
          return {
            studyDates: addStudyDay(state.studyDates, timestamp),
            progressByChallenge: {
              ...state.progressByChallenge,
              [challengeId]: {
                ...previous,
                status: previous.status === "locked" ? "in_progress" : previous.status,
                attempts: previous.attempts + (result?.mode === "submit" ? 1 : 0),
                runs: previous.runs + 1,
                passedRuns: previous.passedRuns + (passed ? 1 : 0),
                lastResult: result?.status || null,
                lastError: passed ? null : clampText(result?.stderr || result?.message, 4000),
                lastStudiedAt: timestamp,
              },
            },
          };
        }),

      recordPass: (challengeId, confidence = "good", timestamp = Date.now()) =>
        set((state) => {
          const previous = normalizeProgress(state.progressByChallenge[challengeId]);
          const interval = getReviewInterval(confidence, previous.reviewIntervalDays);
          return {
            studyDates: addStudyDay(state.studyDates, timestamp),
            progressByChallenge: {
              ...state.progressByChallenge,
              [challengeId]: {
                ...previous,
                status: "passed",
                confidence,
                completedAt: previous.completedAt || timestamp,
                lastStudiedAt: timestamp,
                nextReviewAt: timestamp + interval * DAY,
                reviewIntervalDays: interval,
                lastError: null,
              },
            },
          };
        }),

      recordHint: (challengeId) =>
        set((state) => {
          const previous = normalizeProgress(state.progressByChallenge[challengeId]);
          return {
            progressByChallenge: {
              ...state.progressByChallenge,
              [challengeId]: { ...previous, hintsUsed: previous.hintsUsed + 1 },
            },
          };
        }),

      addError: (entry) =>
        set((state) => ({
          errorJournal: [
            {
              id: entry.id || `csharp-error-${Date.now()}`,
              challengeId: entry.challengeId || null,
              code: clampText(entry.code, 100),
              message: clampText(entry.message, 4000),
              explanation: clampText(entry.explanation, 4000),
              fix: clampText(entry.fix, 4000),
              source: entry.source || "manual",
              resolved: Boolean(entry.resolved),
              createdAt: entry.createdAt || Date.now(),
            },
            ...state.errorJournal,
          ].slice(0, MAX_ERRORS),
        })),

      resolveError: (errorId) =>
        set((state) => ({
          errorJournal: state.errorJournal.map((item) =>
            item.id === errorId ? { ...item, resolved: true, resolvedAt: Date.now() } : item,
          ),
        })),

      removeError: (errorId) =>
        set((state) => ({ errorJournal: state.errorJournal.filter((item) => item.id !== errorId) })),

      addChatMessages: (messages) =>
        set((state) => ({
          chatMessages: [
            ...state.chatMessages,
            ...(Array.isArray(messages) ? messages : [messages]),
          ]
            .filter(Boolean)
            .map((message) => ({
              role: message.role || "user",
              content: clampText(message.content, 4000),
              challengeId: message.challengeId || null,
              createdAt: message.createdAt || Date.now(),
            }))
            .slice(-MAX_CHAT_MESSAGES),
        })),

      clearChat: (challengeId = null) =>
        set((state) => ({
          chatMessages: challengeId
            ? state.chatMessages.filter((item) => item.challengeId !== challengeId)
            : [],
        })),

      resetProgress: () => set({ progressByChallenge: {}, studyDates: [], errorJournal: [], chatMessages: [] }),
    }),
    {
      name: "studyhub-csharp-lab-v1",
      version: 1,
      migrate: (persisted) => ({ ...initialState, ...(persisted || {}) }),
      partialize: (state) => ({
        profile: state.profile,
        progressByChallenge: state.progressByChallenge,
        studyDates: state.studyDates,
        errorJournal: state.errorJournal,
        consentAt: state.consentAt,
        aiSettings: state.aiSettings,
        chatMessages: state.chatMessages,
        activeChallengeId: state.activeChallengeId,
      }),
    },
  ),
);

export const getCodeLabStreak = (studyDates, now = Date.now()) => calculateStreak(studyDates, now);

export const selectDueChallengeIds = (progressByChallenge, now = Date.now()) =>
  Object.entries(progressByChallenge || {})
    .filter(([, value]) => value?.status === "passed" && value.nextReviewAt && value.nextReviewAt <= now)
    .sort((a, b) => (a[1].nextReviewAt || 0) - (b[1].nextReviewAt || 0))
    .map(([id]) => id);
