import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateJournalStreak,
  filterJournalEntries,
  getDailyJournalPrompt,
  getJournalMonthGrid,
  getJournalStats,
  normalizeJournalEntry,
  normalizeJournalPhoto,
} from "./journal.js";

const entry = (id, entryDate, overrides = {}) => ({
  id,
  entryDate,
  title: `Entrada ${id}`,
  content: "Um registro pessoal do dia",
  createdAt: new Date(`${entryDate}T12:00:00`).getTime(),
  updatedAt: new Date(`${entryDate}T12:00:00`).getTime(),
  ...overrides,
});

test("normaliza metadados do diário sem misturá-los com notas", () => {
  const normalized = normalizeJournalEntry({
    id: "journal-1",
    entryDate: "2026-08-02",
    energy: 20,
    sleepHours: -3,
    tags: ["Faculdade", "faculdade", " pessoal "],
  });

  assert.equal(normalized.energy, 5);
  assert.equal(normalized.sleepHours, 0);
  assert.deepEqual(normalized.tags, ["Faculdade", "pessoal"]);
  assert.equal(normalized.type, "reflection");
});

test("calcula sequência atual mesmo antes da entrada de hoje", () => {
  const entries = [
    entry("a", "2026-07-30"),
    entry("b", "2026-07-31"),
    entry("c", "2026-08-01"),
  ];

  assert.equal(calculateJournalStreak(entries, new Date("2026-08-02T10:00:00")), 3);
  assert.equal(getJournalStats(entries, new Date("2026-08-02T10:00:00")).longestStreak, 3);
});

test("busca entradas por texto, tags, humor e favoritos", () => {
  const entries = [
    entry("a", "2026-08-01", { title: "Dia tranquilo", tags: ["calma"], mood: "good" }),
    entry("b", "2026-08-02", { title: "Prova", mood: "heavy", favorite: true }),
  ];

  assert.deepEqual(filterJournalEntries(entries, { query: "calma" }).map((item) => item.id), ["a"]);
  assert.deepEqual(filterJournalEntries(entries, { mood: "heavy", favorite: true }).map((item) => item.id), ["b"]);
});

test("monta calendário mensal com marcação das entradas", () => {
  const grid = getJournalMonthGrid(
    "2026-08",
    [entry("a", "2026-08-02")],
    new Date("2026-08-02T10:00:00"),
  );

  assert.equal(grid.length, 42);
  assert.equal(grid.find((day) => day.dateKey === "2026-08-02")?.count, 1);
  assert.equal(grid.find((day) => day.dateKey === "2026-08-02")?.isToday, true);
});

test("mantém a pergunta diária determinística e permite variar", () => {
  const first = getDailyJournalPrompt("2026-08-02", 0);
  assert.equal(first, getDailyJournalPrompt("2026-08-02", 0));
  assert.notEqual(first, getDailyJournalPrompt("2026-08-02", 1));
});

test("normaliza a galeria de fotos e mantém uma capa válida", () => {
  const photo = normalizeJournalPhoto({
    id: "photo-1",
    name: "viagem.jpg",
    cloudObjectPath: "users/test/viagem.jpg",
    caption: "Um dia especial",
  });
  const normalized = normalizeJournalEntry({
    id: "journal-photo-test",
    entryDate: "2026-08-02",
    photos: [photo, { id: "invalid", name: "sem arquivo" }],
    coverPhotoId: "invalid",
  });

  assert.equal(normalized.photos.length, 1);
  assert.equal(normalized.photos[0].caption, "Um dia especial");
  assert.equal(normalized.coverPhotoId, "photo-1");
});

test("normaliza frases importantes e filtra por importantes apenas", () => {
  const entries = [
    entry("a", "2026-08-01", { title: "Normal", importantQuotes: [] }),
    entry("b", "2026-08-02", {
      title: "Com citação",
      importantQuotes: [{ id: "q1", text: "O sucesso é a soma de pequenos esforços repetidos dia após dia." }],
    }),
  ];

  const filtered = filterJournalEntries(entries, { importantOnly: true });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, "b");
  assert.equal(filtered[0].importantQuotes[0].text, "O sucesso é a soma de pequenos esforços repetidos dia após dia.");
});

test("preserva e permite buscar reflexões e resumos da IA", () => {
  const entries = [
    entry("ai-1", "2026-08-03", {
      aiSummary: "Resumo sobre autocuidado e superação de ansiedade",
      aiReflections: [{ role: "assistant", content: "Lembre-se de respirar fundo." }],
    }),
  ];

  const searchResults = filterJournalEntries(entries, { query: "autocuidado" });
  assert.equal(searchResults.length, 1);
  assert.equal(searchResults[0].aiSummary, "Resumo sobre autocuidado e superação de ansiedade");
  assert.equal(searchResults[0].aiReflections[0].content, "Lembre-se de respirar fundo.");
});
