"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  createOcrService,
  normalizeImageBuffer,
  normalizeOcrLanguages,
  prepareTesseractDataDirectory,
  resolveAsarUnpackedPath,
} = require("./ocr.cjs");

async function makeTempDirectory(t) {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "studyhub-translator-test-"));
  t.after(() => fsp.rm(directory, { recursive: true, force: true }));
  return directory;
}

test("prepareTesseractDataDirectory reúne eng e por em um diretório gravável", async (t) => {
  const root = await makeTempDirectory(t);
  const engPath = path.join(root, "packages", "eng");
  const porPath = path.join(root, "packages", "por");
  await Promise.all([
    fsp.mkdir(engPath, { recursive: true }),
    fsp.mkdir(porPath, { recursive: true }),
  ]);
  await Promise.all([
    fsp.writeFile(path.join(engPath, "eng.traineddata.gz"), "english-data"),
    fsp.writeFile(path.join(porPath, "por.traineddata.gz"), "portuguese-data"),
  ]);

  const prepared = await prepareTesseractDataDirectory({
    dataDir: path.join(root, "user-data"),
    languageData: [
      { code: "eng", gzip: true, langPath: engPath },
      { code: "por", gzip: true, langPath: porPath },
    ],
  });

  assert.equal(await fsp.readFile(path.join(prepared.langPath, "eng.traineddata.gz"), "utf8"), "english-data");
  assert.equal(await fsp.readFile(path.join(prepared.langPath, "por.traineddata.gz"), "utf8"), "portuguese-data");
  assert.equal(prepared.gzip, true);
  assert.deepEqual(prepared.languages, ["eng", "por"]);
});

test("resolveAsarUnpackedPath usa o arquivo desempacotado quando ele existe", async (t) => {
  const root = await makeTempDirectory(t);
  const original = path.join(root, "resources", "app.asar", "node_modules", "worker.js");
  const unpacked = path.join(
    root,
    "resources",
    "app.asar.unpacked",
    "node_modules",
    "worker.js",
  );
  await fsp.mkdir(path.dirname(unpacked), { recursive: true });
  await fsp.writeFile(unpacked, "worker");

  assert.equal(resolveAsarUnpackedPath(original), unpacked);
  assert.equal(resolveAsarUnpackedPath(path.join(root, "plain", "worker.js")), path.join(root, "plain", "worker.js"));
});

test("OCR carrega Tesseract sob demanda, reutiliza worker e encaminha progresso", async () => {
  const createCalls = [];
  const reinitializeCalls = [];
  const recognized = [];
  const globalProgress = [];
  const localProgress = [];
  let terminateCalls = 0;

  const worker = {
    reinitialize: async (...args) => reinitializeCalls.push(args),
    recognize: async (image) => {
      recognized.push(Buffer.from(image));
      return { data: { text: "  Hello mundo\n", confidence: 91.5 } };
    },
    terminate: async () => {
      terminateCalls += 1;
    },
  };
  const service = createOcrService({
    dataDir: "ignored-in-test",
    onProgress: (progress) => globalProgress.push(progress),
    loadTesseract: async () => ({
      createWorker: async (...args) => {
        createCalls.push(args);
        args[2].logger({ status: "recognizing text", progress: 0.5 });
        return worker;
      },
    }),
    prepareData: async () => ({
      langPath: "language-data",
      cachePath: "language-cache",
      gzip: true,
    }),
    workerPath: "worker.js",
    corePath: "core",
    existsSync: () => false,
  });

  assert.equal(createCalls.length, 0);
  const first = await service.recognize(Uint8Array.from([1, 2, 3]), {
    language: "eng+por",
    onProgress: (progress) => localProgress.push(progress),
  });
  const second = await service.recognize(Buffer.from([4]), { language: "pt-BR" });

  assert.equal(createCalls.length, 1);
  assert.deepEqual(createCalls[0][0], ["eng", "por"]);
  assert.equal(createCalls[0][1], 1);
  assert.equal(createCalls[0][2].langPath, "language-data");
  assert.equal(createCalls[0][2].gzip, true);
  assert.deepEqual(first, { text: "Hello mundo", confidence: 91.5, language: "eng+por" });
  assert.equal(second.language, "por");
  assert.deepEqual(reinitializeCalls, [[ ["por"], 1 ]]);
  assert.equal(recognized.length, 2);
  assert.equal(globalProgress.length, 1);
  assert.equal(localProgress.length, 1);

  await service.terminate();
  await service.terminate();
  assert.equal(terminateCalls, 1);
  await assert.rejects(
    service.recognize(Buffer.from([1])),
    (error) => error.code === "OCR_TERMINATED",
  );
});

test("OCR serializa reconhecimentos concorrentes no worker único", async () => {
  let active = 0;
  let maximumActive = 0;
  const service = createOcrService({
    loadTesseract: async () => ({
      createWorker: async () => ({
        reinitialize: async () => {},
        recognize: async (image) => {
          active += 1;
          maximumActive = Math.max(maximumActive, active);
          await new Promise((resolve) => setTimeout(resolve, 5));
          active -= 1;
          return { data: { text: String(image[0]), confidence: 80 } };
        },
        terminate: async () => {},
      }),
    }),
    prepareData: async () => ({ langPath: "lang", cachePath: "cache", gzip: true }),
    workerPath: "worker.js",
    corePath: "core",
    existsSync: () => false,
  });

  const results = await Promise.all([
    service.recognize(Buffer.from([1])),
    service.recognize(Buffer.from([2])),
  ]);

  assert.equal(maximumActive, 1);
  assert.deepEqual(results.map((result) => result.text), ["1", "2"]);
  await service.terminate();
});

test("normalizadores de OCR validam imagem, tamanho e idiomas", () => {
  const source = Uint8Array.from([9, 1, 2, 3, 9]);
  assert.deepEqual(
    [...normalizeImageBuffer(source.subarray(1, 4))],
    [1, 2, 3],
  );
  assert.deepEqual(normalizeOcrLanguages("auto"), ["eng", "por"]);
  assert.deepEqual(normalizeOcrLanguages("en-US"), ["eng"]);
  assert.deepEqual(normalizeOcrLanguages("pt-BR"), ["por"]);
  assert.throws(
    () => normalizeImageBuffer(Buffer.alloc(4), 3),
    (error) => error.code === "OCR_IMAGE_TOO_LARGE",
  );
  assert.throws(
    () => normalizeOcrLanguages("de"),
    (error) => error.code === "OCR_INVALID_LANGUAGE",
  );
});
