import test from "node:test";
import assert from "node:assert/strict";
import { getGuidedReadingProgress, groupPdfTextItems } from "./pdfGuidedUtils.js";

test("agrupa fragmentos do PDF na mesma linha visual", () => {
  const lines = groupPdfTextItems([
    { str: "Olá", transform: [1, 0, 0, 12, 20, 700], width: 28, height: 12 },
    { str: "mundo", transform: [1, 0, 0, 12, 54, 700], width: 42, height: 12 },
    { str: "Segunda linha", transform: [1, 0, 0, 12, 20, 680], width: 90, height: 12 },
  ], 3);

  assert.equal(lines.length, 2);
  assert.equal(lines[0].text, "Olá mundo");
  assert.equal(lines[0].pageNumber, 3);
  assert.equal(lines[1].text, "Segunda linha");
});

test("calcula progresso da leitura guiada", () => {
  assert.equal(getGuidedReadingProgress(0, 5), 0);
  assert.equal(getGuidedReadingProgress(2, 5), 50);
  assert.equal(getGuidedReadingProgress(4, 5), 100);
});

test("não mistura colunas distantes na mesma fala", () => {
  const lines = groupPdfTextItems([
    { str: "Coluna esquerda", transform: [1, 0, 0, 12, 20, 700], width: 95, height: 12 },
    { str: "Coluna direita", transform: [1, 0, 0, 12, 320, 700], width: 90, height: 12 },
  ], 1);

  assert.deepEqual(lines.map((line) => line.text), ["Coluna esquerda", "Coluna direita"]);
});

test("respeita a indicação de fim de linha do PDF", () => {
  const lines = groupPdfTextItems([
    { str: "Primeira", transform: [1, 0, 0, 12, 20, 700], width: 50, height: 12, hasEOL: true },
    { str: "Segunda", transform: [1, 0, 0, 12, 74, 700], width: 50, height: 12 },
  ], 1);

  assert.deepEqual(lines.map((line) => line.text), ["Primeira", "Segunda"]);
});
