const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// O teste usa chave fictícia e intercepta fetch: nenhuma chamada chega ao Google.
const electronPath = require.resolve("electron");
require(electronPath);
require.cache[electronPath].exports = {
  safeStorage: { decryptString: () => "test-key-never-sent" },
};
const { generate, indexSources } = require("./index.cjs");
const { closeDatabase } = require("../storage/study-db.cjs");

test("Gemini recebe conteúdo selecionado e JSON para flashcards, quiz e mapa", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "studyhub-tools-"));
  const app = { getPath: () => dir };
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
    closeDatabase();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  fs.writeFileSync(
    path.join(dir, "ai-provider.json"),
    JSON.stringify({
      provider: "gemini",
      geminiModel: "gemini-test",
      geminiApiKeyEncrypted: "dGVzdA==",
    }),
  );
  await indexSources(app, {
    subjectId: "programacao",
    semesterId: "semester",
    sources: [
      {
        id: "selected",
        kind: "note",
        title: "Pilha",
        content:
          "A pilha usa LIFO: o último elemento inserido é o primeiro removido.",
      },
      {
        id: "excluded",
        kind: "note",
        title: "Fonte desmarcada",
        content: "CONTEUDO_DESMARCADO",
      },
    ],
  });
  let lastRequest;
  let result;
  global.fetch = async (url, options) => {
    assert.match(String(url), /generativelanguage.googleapis.com/);
    lastRequest = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: JSON.stringify(result) }] },
          },
        ],
      }),
    };
  };
  for (const kind of ["flashcards", "quiz", "mindmap"]) {
    result =
      kind === "flashcards"
        ? { cards: [{ front: "Pilha?", back: "LIFO." }] }
        : kind === "quiz"
          ? {
              questions: [
                {
                  question: "Pilha?",
                  options: ["LIFO", "FIFO"],
                  correctIndex: 0,
                },
              ],
            }
          : { label: "Estruturas", children: [{ label: "Pilha" }] };
    const generated = await generate(app, {
      kind,
      subjectId: "programacao",
      semesterId: "semester",
      sourceIds: ["selected"],
      model: "gemini-test",
    });
    assert.deepEqual(JSON.parse(generated.content), result);
    assert.equal(
      lastRequest.generationConfig.responseMimeType,
      "application/json",
    );
    assert.match(
      lastRequest.contents[0].parts[0].text,
      /último elemento inserido/,
    );
    assert.doesNotMatch(
      lastRequest.contents[0].parts[0].text,
      /CONTEUDO_DESMARCADO/,
    );
    assert.equal(generated.truncated, false);
  }
  await assert.rejects(
    generate(app, {
      kind: "flashcards",
      subjectId: "programacao",
      semesterId: "semester",
      sourceIds: [],
    }),
    /Indexe pelo menos uma fonte/,
  );
});
