import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateRhythmScore,
  clampPlaybackRate,
  compactTranscriptSegments,
  compareDictation,
  findActiveTranscriptSegment,
  formatMediaTime,
  normalizeDictationText,
  normalizeTranscriptSegments,
  parseMediaTimestamp,
  shouldLoop,
  validateLoopBounds,
} from "./languageUtils.js";

test("parseia e formata timestamps de mídia", () => {
  assert.equal(parseMediaTimestamp("01:02:03.500"), 3723.5);
  assert.equal(parseMediaTimestamp("02:05,250"), 125.25);
  assert.equal(parseMediaTimestamp(-5), 0);
  assert.equal(formatMediaTime(0), "0:00");
  assert.equal(formatMediaTime(65), "1:05");
  assert.equal(formatMediaTime(3661), "1:01:01");
});

test("normaliza timestamps de transcrição no formato SRT/VTT", () => {
  const segments = normalizeTranscriptSegments([
    { start: "00:01:23,500", end: "00:01:25,000", text: "frase" },
  ]);
  assert.equal(segments[0].start, 83.5);
  assert.equal(segments[0].end, 85);
});

test("normaliza transcrição legada e infere o fim dos segmentos", () => {
  const segments = normalizeTranscriptSegments([
    { time: 5, text: " Segunda frase " },
    { time: 0, text: "Primeira frase" },
  ]);

  assert.deepEqual(
    segments.map(({ start, end, time, text }) => ({ start, end, time, text })),
    [
      { start: 0, end: 5, time: 0, text: "Primeira frase" },
      { start: 5, end: 9, time: 5, text: "Segunda frase" },
    ],
  );
});

test("compacta a transcrição antes de persistir", () => {
  const compact = compactTranscriptSegments([
    { start: 0, end: 2, text: "Olá", words: Array(500).fill({ word: "Olá" }), debug: "remover" },
  ]);
  assert.deepEqual(Object.keys(compact[0]), ["id", "start", "time", "end", "text"]);
  assert.throws(
    () => compactTranscriptSegments([{ start: 0, text: "A" }, { start: 1, text: "B" }], { maxSegments: 1 }),
    /limite por aula/i,
  );
});

test("seleciona o trecho ativo em intervalo fechado-aberto", () => {
  const segments = normalizeTranscriptSegments([
    { start: 0, end: 2, text: "A" },
    { start: 3, end: 5, text: "B" },
  ]);

  assert.equal(findActiveTranscriptSegment(segments, 0)?.text, "A");
  assert.equal(findActiveTranscriptSegment(segments, 1.999)?.text, "A");
  assert.equal(findActiveTranscriptSegment(segments, 2), null);
  assert.equal(findActiveTranscriptSegment(segments, 3)?.text, "B");
  assert.equal(findActiveTranscriptSegment(segments, 5), null);
});

test("valida loop A-B e considera ultrapassagem do ponto B", () => {
  const bounds = validateLoopBounds(0, 2.5, 10);
  assert.deepEqual(bounds, { start: 0, end: 2.5 });
  assert.equal(shouldLoop(2.499, bounds, true), false);
  assert.equal(shouldLoop(2.5, bounds, true), true);
  assert.equal(shouldLoop(3, bounds, false), false);
  assert.equal(validateLoopBounds(2, 2, 10), null);
});

test("mantém velocidades dentro da faixa e em passos de 0,25", () => {
  assert.equal(clampPlaybackRate(0.1), 0.5);
  assert.equal(clampPlaybackRate(1.13), 1.25);
  assert.equal(clampPlaybackRate(3), 2);
  assert.equal(clampPlaybackRate("inválido"), 1);
});

test("compara ditado tolerando caixa, acentos e pontuação", () => {
  assert.equal(normalizeDictationText("  Café — DON'T!  "), "cafe dont");
  assert.equal(compareDictation("Hello, WORLD!", "hello world").score, 100);
  assert.equal(compareDictation("café com leite", "cafe com leite").score, 100);

  const missing = compareDictation("the quick brown fox", "the brown fox");
  assert.equal(missing.score, 75);
  assert.deepEqual(missing.missingWords, ["quick"]);
  assert.equal(compareDictation("", "").score, 100);
  assert.equal(compareDictation("hello", "").score, 0);
});

test("preserva marcas do japonês e segmenta frases sem espaços", () => {
  assert.notEqual(normalizeDictationText("が"), normalizeDictationText("か"));
  assert.equal(compareDictation("が", "か", "ja").score, 0);
  const partial = compareDictation("こんにちは世界", "こんにちは世間", "ja");
  assert.ok(partial.score > 0 && partial.score < 100);
});

test("calcula proximidade de ritmo pela duração", () => {
  assert.equal(calculateRhythmScore(4, 4), 100);
  assert.equal(calculateRhythmScore(4, 5), 75);
  assert.equal(calculateRhythmScore(0, 5), 0);
});
