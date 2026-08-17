"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createTranslatorService } = require("./index.cjs");

test("createTranslatorService expõe a interface integrada esperada pelo main", async () => {
  let terminated = 0;
  const service = createTranslatorService({
    fetchImpl: async (_url, options) => {
      const body = new URLSearchParams(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          sentences: [{ trans: `traduzido:${body.get("q")}` }],
          src: "en",
        }),
      };
    },
    loadTesseract: async () => ({
      createWorker: async () => ({
        reinitialize: async () => {},
        recognize: async () => ({ data: { text: "screen text", confidence: 88 } }),
        terminate: async () => {
          terminated += 1;
        },
      }),
    }),
    prepareData: async () => ({ langPath: "lang", cachePath: "cache", gzip: true }),
    workerPath: "worker.js",
    corePath: "core",
    existsSync: () => false,
  });

  assert.deepEqual(
    Object.keys(service).sort(),
    ["recognize", "terminate", "translate"],
  );
  assert.equal(
    (await service.translate({ text: "hello", sourceLanguage: "en", targetLanguage: "pt" })).text,
    "traduzido:hello",
  );
  assert.equal((await service.recognize(Buffer.from([1]))).text, "screen text");
  await service.terminate();
  assert.equal(terminated, 1);
});
