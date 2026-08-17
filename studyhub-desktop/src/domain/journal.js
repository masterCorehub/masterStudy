import { getLocalDateKey } from "../utils/dateUtils.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export const JOURNAL_MOODS = [
  { id: "radiant", label: "Radiante", emoji: "☀️", color: "#d69245" },
  { id: "good", label: "Bem", emoji: "🌿", color: "#6f9475" },
  { id: "neutral", label: "Neutro", emoji: "🌤️", color: "#8492a6" },
  { id: "low", label: "Para baixo", emoji: "🌧️", color: "#7186a8" },
  { id: "heavy", label: "Difícil", emoji: "🌙", color: "#806f95" },
];

export const JOURNAL_ENTRY_TYPES = [
  { id: "reflection", label: "Reflexão", icon: "auto_stories" },
  { id: "check-in", label: "Check-in", icon: "self_improvement" },
  { id: "gratitude", label: "Gratidão", icon: "volunteer_activism" },
  { id: "memory", label: "Memória", icon: "photo_library" },
  { id: "dream", label: "Sonho", icon: "bedtime" },
];

export const JOURNAL_ACCENTS = [
  { id: "rose", label: "Rosa", color: "#a96673" },
  { id: "sage", label: "Sálvia", color: "#6f8b78" },
  { id: "lavender", label: "Lavanda", color: "#81739d" },
  { id: "amber", label: "Âmbar", color: "#b17a3b" },
  { id: "blue", label: "Azul", color: "#557b9d" },
];

export const JOURNAL_PROMPTS = [
  "O que tornou o dia de hoje diferente dos outros?",
  "Que sentimento está pedindo mais espaço agora?",
  "O que eu fiz hoje que merece reconhecimento?",
  "Qual pensamento posso deixar ir antes de dormir?",
  "O que está sob meu controle neste momento?",
  "Qual pequeno momento eu quero lembrar no futuro?",
  "O que me deu energia e o que drenou minha energia hoje?",
  "Se eu pudesse conversar com meu eu de amanhã, o que diria?",
  "Quais três coisas simples fizeram bem hoje?",
  "Que limite eu gostaria de respeitar melhor?",
  "O que aprendi sobre mim nesta semana?",
  "Como posso tornar amanhã um pouco mais leve?",
  "Do que eu preciso — e como posso me oferecer isso?",
  "Que expectativa posso trocar por curiosidade?",
];

export const DEFAULT_JOURNAL_SETTINGS = {
  defaultEntryType: "reflection",
  showPrompts: true,
  weekStartsOnMonday: true,
  passwordHash: "",
};

const clamp = (value, minimum, maximum, fallback) => {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(minimum, Math.min(maximum, number))
    : fallback;
};

const validDateKey = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

const uniqueTags = (tags) => {
  const seen = new Set();
  return (Array.isArray(tags) ? tags : String(tags || "").split(/[,#]/))
    .map((tag) => String(tag || "").trim().replace(/^#/, ""))
    .filter((tag) => {
      const key = tag.toLocaleLowerCase("pt-BR");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);
};

const timestamp = (value, fallback) => {
  if (Number.isFinite(Number(value))) return Number(value);
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const CONSUMED_CONTENT_TYPES = [
  { id: "video", label: "Vídeo / Filme", icon: "play_circle" },
  { id: "book", label: "Livro", icon: "menu_book" },
  { id: "article", label: "Artigo / Post", icon: "article" },
  { id: "podcast", label: "Podcast / Áudio", icon: "headphones" },
  { id: "other", label: "Outro", icon: "bookmark" },
];

export function normalizeConsumedContent(item = {}, index = 0) {
  const typeIds = new Set(CONSUMED_CONTENT_TYPES.map((t) => t.id));
  return {
    id: String(item.id || `consumed-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`),
    title: String(item.title || "").slice(0, 300),
    type: typeIds.has(item.type) ? item.type : "video",
    reflection: String(item.reflection || "").slice(0, 2000),
  };
}

export function normalizeImportantQuote(item = {}, index = 0) {
  const text = typeof item === "string" ? item : String(item?.text || "");
  const existingId = typeof item === "object" && item?.id ? item.id : null;
  return {
    id: String(existingId || `quote-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 9)}`),
    text: text.slice(0, 2000),
  };
}

export function normalizeAiReflectionMessage(msg = {}) {
  return {
    role: msg?.role === "user" ? "user" : "assistant",
    content: String(msg?.content || "").slice(0, 10000),
  };
}

export function createJournalDraft(entryDate = getLocalDateKey(), overrides = {}) {
  const normalizedDate = validDateKey(entryDate) ? entryDate : getLocalDateKey(entryDate);
  return {
    entryDate: normalizedDate,
    title: "",
    content: "",
    mood: "neutral",
    energy: 3,
    sleepHours: 7,
    type: DEFAULT_JOURNAL_SETTINGS.defaultEntryType,
    gratitudes: ["", "", ""],
    consumedContents: [],
    importantQuotes: [],
    aiSummary: "",
    aiReflections: [],
    highlight: "",
    intention: "",
    prompt: "",
    tags: [],
    favorite: false,
    accent: "rose",
    photos: [],
    coverPhotoId: null,
    ...overrides,
  };
}

export function normalizeJournalPhoto(photo = {}, index = 0) {
  const now = Date.now();
  return {
    id:
      String(photo.id || "").trim() ||
      `journal-photo-${now}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    name: String(photo.name || photo.originalName || `Foto ${index + 1}`),
    caption: String(photo.caption || "").slice(0, 240),
    localPath: String(photo.localPath || ""),
    cloudObjectPath: String(photo.cloudObjectPath || ""),
    cloudFileObjectId: photo.cloudFileObjectId || null,
    cloudBucketId: photo.cloudBucketId || null,
    mimeType: String(photo.mimeType || "image/jpeg"),
    size: Math.max(0, Number(photo.size || 0)),
    createdAt: timestamp(photo.createdAt, now),
  };
}

export function normalizeJournalEntry(entry = {}) {
  const now = Date.now();
  const typeIds = new Set(JOURNAL_ENTRY_TYPES.map((item) => item.id));
  const moodIds = new Set(JOURNAL_MOODS.map((item) => item.id));
  const accentIds = new Set(JOURNAL_ACCENTS.map((item) => item.id));
  const base = createJournalDraft(entry.entryDate || entry.date || getLocalDateKey());
  const photos = (Array.isArray(entry.photos) ? entry.photos : [])
    .map(normalizeJournalPhoto)
    .filter((photo) => photo.localPath || photo.cloudObjectPath)
    .slice(0, 12);
  const photoIds = new Set(photos.map((photo) => photo.id));
  return {
    ...base,
    ...entry,
    id:
      String(entry.id || "").trim() ||
      `journal-${now}-${Math.random().toString(36).slice(2, 8)}`,
    entryDate: validDateKey(entry.entryDate || entry.date)
      ? String(entry.entryDate || entry.date)
      : getLocalDateKey(timestamp(entry.createdAt, now)),
    title: String(entry.title || ""),
    content: String(entry.content || ""),
    mood: moodIds.has(entry.mood) ? entry.mood : "neutral",
    energy: clamp(entry.energy, 1, 5, 3),
    sleepHours: clamp(entry.sleepHours, 0, 16, 7),
    type: typeIds.has(entry.type) ? entry.type : "reflection",
    gratitudes: (Array.isArray(entry.gratitudes) ? entry.gratitudes : [])
      .map((item) => String(item || ""))
      .slice(0, 3),
    consumedContents: (Array.isArray(entry.consumedContents) ? entry.consumedContents : [])
      .map(normalizeConsumedContent)
      .slice(0, 10),
    importantQuotes: (Array.isArray(entry.importantQuotes) ? entry.importantQuotes : [])
      .map(normalizeImportantQuote)
      .filter((quote) => quote.text.trim())
      .slice(0, 50),
    aiSummary: String(entry.aiSummary || ""),
    aiReflections: (Array.isArray(entry.aiReflections) ? entry.aiReflections : [])
      .map(normalizeAiReflectionMessage)
      .filter((msg) => msg.content.trim())
      .slice(0, 50),
    highlight: String(entry.highlight || ""),
    intention: String(entry.intention || ""),
    prompt: String(entry.prompt || ""),
    tags: uniqueTags(entry.tags),
    favorite: Boolean(entry.favorite),
    accent: accentIds.has(entry.accent) ? entry.accent : "rose",
    photos,
    coverPhotoId: photoIds.has(entry.coverPhotoId)
      ? entry.coverPhotoId
      : photos[0]?.id || null,
    createdAt: timestamp(entry.createdAt, now),
    updatedAt: timestamp(entry.updatedAt, timestamp(entry.createdAt, now)),
  };
}

export function normalizeJournalEntries(entries = []) {
  if (!Array.isArray(entries)) return [];
  const byId = new Map();
  entries.forEach((entry) => {
    const normalized = normalizeJournalEntry(entry);
    const existing = byId.get(normalized.id);
    if (!existing || normalized.updatedAt >= existing.updatedAt) {
      byId.set(normalized.id, normalized);
    }
  });
  return [...byId.values()].sort(
    (left, right) =>
      String(right.entryDate).localeCompare(String(left.entryDate)) ||
      Number(right.updatedAt || 0) - Number(left.updatedAt || 0),
  );
}

export function normalizeJournalSettings(settings = {}) {
  const typeIds = new Set(JOURNAL_ENTRY_TYPES.map((item) => item.id));
  return {
    ...DEFAULT_JOURNAL_SETTINGS,
    ...(settings || {}),
    defaultEntryType: typeIds.has(settings?.defaultEntryType)
      ? settings.defaultEntryType
      : DEFAULT_JOURNAL_SETTINGS.defaultEntryType,
    showPrompts: settings?.showPrompts !== false,
    weekStartsOnMonday: settings?.weekStartsOnMonday !== false,
    passwordHash: typeof settings?.passwordHash === "string" ? settings.passwordHash : "",
  };
}

export function journalWordCount(content = "") {
  return String(content)
    .trim()
    .split(/\s+/u)
    .filter(Boolean).length;
}

const dateAtNoon = (dateKey) => new Date(`${dateKey}T12:00:00`);

const previousDateKey = (dateKey) => {
  const date = dateAtNoon(dateKey);
  date.setDate(date.getDate() - 1);
  return getLocalDateKey(date);
};

export function calculateJournalStreak(entries = [], now = new Date()) {
  const dates = new Set(
    normalizeJournalEntries(entries)
      .filter((entry) => entry.content.trim() || entry.title.trim())
      .map((entry) => entry.entryDate),
  );
  let cursor = getLocalDateKey(now);
  if (!dates.has(cursor)) cursor = previousDateKey(cursor);
  let streak = 0;
  while (dates.has(cursor)) {
    streak += 1;
    cursor = previousDateKey(cursor);
  }
  return streak;
}

export function calculateLongestJournalStreak(entries = []) {
  const dates = [...new Set(
    normalizeJournalEntries(entries)
      .filter((entry) => entry.content.trim() || entry.title.trim())
      .map((entry) => entry.entryDate),
  )].sort();
  if (!dates.length) return 0;
  let longest = 1;
  let current = 1;
  for (let index = 1; index < dates.length; index += 1) {
    const previous = dateAtNoon(dates[index - 1]);
    const next = dateAtNoon(dates[index]);
    const difference = Math.round((next.getTime() - previous.getTime()) / DAY_MS);
    current = difference === 1 ? current + 1 : 1;
    longest = Math.max(longest, current);
  }
  return longest;
}

export function filterJournalEntries(entries = [], filters = {}) {
  const query = String(filters.query || "").trim().toLocaleLowerCase("pt-BR");
  return normalizeJournalEntries(entries).filter((entry) => {
    if (filters.mood && filters.mood !== "all" && entry.mood !== filters.mood) return false;
    if (filters.type && filters.type !== "all" && entry.type !== filters.type) return false;
    if (filters.favorite && !entry.favorite) return false;
    if (filters.importantOnly && (!entry.importantQuotes || !entry.importantQuotes.some((q) => q.text.trim()))) return false;
    if (filters.date && entry.entryDate !== filters.date) return false;
    if (!query) return true;
    const searchable = [
      entry.title,
      entry.content,
      entry.highlight,
      entry.intention,
      entry.prompt,
      entry.aiSummary,
      ...(entry.gratitudes || []),
      ...(entry.importantQuotes || []).map((q) => q.text),
      ...(entry.aiReflections || []).map((m) => m.content),
      ...(entry.tags || []),
      ...(entry.photos || []).flatMap((photo) => [photo.name, photo.caption]),
    ]
      .join(" ")
      .toLocaleLowerCase("pt-BR");
    return searchable.includes(query);
  });
}

export function getJournalStats(entries = [], now = new Date()) {
  const normalized = normalizeJournalEntries(entries);
  const currentMonth = getLocalDateKey(now).slice(0, 7);
  return {
    totalEntries: normalized.length,
    entriesThisMonth: normalized.filter((entry) => entry.entryDate.startsWith(currentMonth)).length,
    totalWords: normalized.reduce((sum, entry) => sum + journalWordCount(entry.content), 0),
    currentStreak: calculateJournalStreak(normalized, now),
    longestStreak: calculateLongestJournalStreak(normalized),
  };
}

export function getJournalMonthGrid(monthValue, entries = [], now = new Date()) {
  const fallback = getLocalDateKey(now).slice(0, 7);
  const monthKey = /^\d{4}-\d{2}$/.test(String(monthValue || ""))
    ? String(monthValue)
    : fallback;
  const first = new Date(`${monthKey}-01T12:00:00`);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - mondayOffset);
  const entriesByDate = new Map();
  normalizeJournalEntries(entries).forEach((entry) => {
    const current = entriesByDate.get(entry.entryDate) || [];
    current.push(entry);
    entriesByDate.set(entry.entryDate, current);
  });
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const dateKey = getLocalDateKey(date);
    const dayEntries = entriesByDate.get(dateKey) || [];
    return {
      dateKey,
      day: date.getDate(),
      currentMonth: dateKey.startsWith(monthKey),
      isToday: dateKey === getLocalDateKey(now),
      count: dayEntries.length,
      moods: [...new Set(dayEntries.map((entry) => entry.mood))],
    };
  });
}

export function getDailyJournalPrompt(date = getLocalDateKey(), offset = 0) {
  const seed = String(date)
    .split("")
    .reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return JOURNAL_PROMPTS[(seed + Number(offset || 0)) % JOURNAL_PROMPTS.length];
}
