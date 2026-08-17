"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  chunkText,
  createGoogleTranslator,
  parseGoogleTranslationPayload,
} = require("./translate.cjs");

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

test("chunkText preserva o conteúdo, prefere frases e não divide surrogate pairs", () => {
  const source = "Primeira frase. Segunda frase longa.\n\nTerceira 🧠 frase final.";
  const chunks = chunkText(source, 20);

  assert.equal(chunks.join(""), source);
  assert.ok(chunks.length > 2);
  assert.ok(chunks.every((chunk) => chunk.length <= 20));
  assert.ok(chunks.every((chunk) => !/[\uD800-\uDBFF]$/.test(chunk)));
});

test("createGoogleTranslator usa POST, divide texto e remonta espaços", async () => {
  const calls = [];
  const translator = createGoogleTranslator({
    chunkLength: 13,
    fetchImpl: async (url, options) => {
      const body = new URLSearchParams(options.body);
      calls.push({ url, options, body });
      return jsonResponse({
        sentences: [{ trans: body.get("q").toUpperCase() }],
        src: "en",
      });
    },
  });

  const result = await translator.translate({
    text: "Hello world. Bye now.",
    sourceLanguage: "auto",
    targetLanguage: "pt",
  });

  assert.equal(result.text, "HELLO WORLD. BYE NOW.");
  assert.equal(result.detectedLanguage, "en");
  assert.equal(result.chunkCount, 2);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].body.get("sl"), "auto");
  assert.equal(calls[0].body.get("tl"), "pt");
  assert.equal(calls[0].body.get("q"), "Hello world.");
});

test("createGoogleTranslator evita rede quando origem e destino são iguais", async () => {
  let calls = 0;
  const translator = createGoogleTranslator({
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({});
    },
  });
  const result = await translator.translate({
    text: " Mesmo idioma ",
    sourceLanguage: "pt",
    targetLanguage: "pt",
  });

  assert.equal(result.text, " Mesmo idioma ");
  assert.equal(result.chunkCount, 0);
  assert.equal(calls, 0);
});

test("parseGoogleTranslationPayload aceita o formato legado do endpoint", () => {
  assert.deepEqual(
    parseGoogleTranslationPayload([
      [["Olá ", "Hello "], ["mundo", "world"]],
      null,
      "en",
    ]),
    { text: "Olá mundo", detectedLanguage: "en" },
  );
});

test("tradução rejeita entrada inválida e texto acima do limite", async () => {
  const translator = createGoogleTranslator({
    fetchImpl: async () => jsonResponse({}),
    maxTextLength: 5,
  });

  await assert.rejects(
    translator.translate({ text: "   ", targetLanguage: "pt" }),
    (error) => error.code === "INVALID_TEXT",
  );
  await assert.rejects(
    translator.translate({ text: "abcdef", targetLanguage: "pt" }),
    (error) => error.code === "TEXT_TOO_LONG",
  );
  await assert.rejects(
    translator.translate({ text: "hello", targetLanguage: "português" }),
    (error) => error.code === "INVALID_LANGUAGE",
  );
});

test("tradução converte rate limit e resposta malformada em erros estáveis", async () => {
  const rateLimited = createGoogleTranslator({
    fetchImpl: async () => jsonResponse({}, 429),
  });
  await assert.rejects(
    rateLimited.translate({ text: "hello", targetLanguage: "pt" }),
    (error) => error.code === "TRANSLATION_RATE_LIMITED",
  );

  const malformed = createGoogleTranslator({
    fetchImpl: async () => jsonResponse({ sentences: [] }),
  });
  await assert.rejects(
    malformed.translate({ text: "hello", targetLanguage: "pt" }),
    (error) => error.code === "TRANSLATION_INVALID_RESPONSE",
  );
});

test("tradução respeita cancelamento externo", async () => {
  const controller = new AbortController();
  controller.abort();
  const translator = createGoogleTranslator({
    fetchImpl: async () => jsonResponse({}),
  });

  await assert.rejects(
    translator.translate({ text: "hello", targetLanguage: "pt", signal: controller.signal }),
    (error) => error.code === "TRANSLATION_ABORTED",
  );
});
