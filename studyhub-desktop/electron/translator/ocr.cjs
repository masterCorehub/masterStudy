"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { TranslatorError, asTranslatorError } = require("./errors.cjs");

const DEFAULT_OCR_LANGUAGES = Object.freeze(["eng", "por"]);
const DEFAULT_MAX_IMAGE_BYTES = 32 * 1024 * 1024;
const TESSERACT_OEM_LSTM_ONLY = 1;

function resolveAsarUnpackedPath(filePath, existsSync = fs.existsSync) {
  if (typeof filePath !== "string" || !filePath) return filePath;
  const candidate = filePath.replace(
    /([\\/])app\.asar(?=([\\/]|$))/i,
    "$1app.asar.unpacked",
  );
  if (candidate !== filePath && existsSync(candidate)) return candidate;
  return filePath;
}

function resolveTesseractRuntimePaths({
  workerPath,
  corePath,
  existsSync = fs.existsSync,
  resolveModule = require.resolve,
} = {}) {
  let nextWorkerPath = workerPath;
  let nextCorePath = corePath;

  if (!nextWorkerPath) {
    nextWorkerPath = resolveModule("tesseract.js/src/worker-script/node/index.js");
  }
  if (!nextCorePath) {
    nextCorePath = path.dirname(resolveModule("tesseract.js-core"));
  }

  return {
    workerPath: resolveAsarUnpackedPath(nextWorkerPath, existsSync),
    corePath: resolveAsarUnpackedPath(nextCorePath, existsSync),
  };
}

function getDefaultLanguageData() {
  return [
    require("@tesseract.js-data/eng"),
    require("@tesseract.js-data/por"),
  ];
}

function validateLanguageData(languageData) {
  if (!Array.isArray(languageData) || languageData.length < 2) {
    throw new TranslatorError(
      "OCR_LANGUAGE_DATA_MISSING",
      "Os dados de OCR em inglês e português não estão disponíveis.",
    );
  }

  const byCode = new Map();
  for (const item of languageData) {
    if (!item || !DEFAULT_OCR_LANGUAGES.includes(item.code) || !item.langPath) continue;
    byCode.set(item.code, item);
  }
  for (const code of DEFAULT_OCR_LANGUAGES) {
    if (!byCode.has(code)) {
      throw new TranslatorError(
        "OCR_LANGUAGE_DATA_MISSING",
        `Os dados de OCR do idioma ${code} não estão disponíveis.`,
        { code },
      );
    }
  }
  return byCode;
}

async function fileHasSameSize(sourcePath, destinationPath, fsPromises) {
  try {
    const [source, destination] = await Promise.all([
      fsPromises.stat(sourcePath),
      fsPromises.stat(destinationPath),
    ]);
    return source.isFile() && destination.isFile() && source.size === destination.size;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function prepareTesseractDataDirectory({
  dataDir,
  getDataDir,
  languageData,
  fsPromises = fsp,
  existsSync = fs.existsSync,
} = {}) {
  try {
    const configuredRoot = typeof getDataDir === "function"
      ? await getDataDir()
      : dataDir;
    const root = path.resolve(
      String(configuredRoot || path.join(os.tmpdir(), "studyhub-translator")),
    );
    const langPath = path.join(root, "tesseract-data");
    const cachePath = path.join(root, "tesseract-cache");
    const packages = validateLanguageData(languageData || getDefaultLanguageData());

    await Promise.all([
      fsPromises.mkdir(langPath, { recursive: true }),
      fsPromises.mkdir(cachePath, { recursive: true }),
    ]);

    for (const code of DEFAULT_OCR_LANGUAGES) {
      const packageData = packages.get(code);
      const gzip = packageData.gzip !== false;
      const fileName = `${code}.traineddata${gzip ? ".gz" : ""}`;
      const sourceDirectory = resolveAsarUnpackedPath(packageData.langPath, existsSync);
      const sourcePath = path.join(sourceDirectory, fileName);
      const destinationPath = path.join(langPath, fileName);

      if (!(await fileHasSameSize(sourcePath, destinationPath, fsPromises))) {
        await fsPromises.copyFile(sourcePath, destinationPath);
      }
    }

    return {
      langPath,
      cachePath,
      gzip: true,
      languages: [...DEFAULT_OCR_LANGUAGES],
    };
  } catch (error) {
    throw asTranslatorError(
      error,
      "OCR_DATA_PREPARATION_FAILED",
      "Não foi possível preparar os arquivos de idioma do OCR.",
    );
  }
}

function normalizeImageBuffer(value, maxImageBytes = DEFAULT_MAX_IMAGE_BYTES) {
  let image;
  if (Buffer.isBuffer(value)) {
    image = value;
  } else if (value instanceof ArrayBuffer) {
    image = Buffer.from(value);
  } else if (ArrayBuffer.isView(value)) {
    image = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  } else {
    throw new TranslatorError(
      "OCR_INVALID_IMAGE",
      "A captura de tela não contém uma imagem válida.",
    );
  }

  if (!image.length) {
    throw new TranslatorError("OCR_INVALID_IMAGE", "A imagem selecionada está vazia.");
  }
  if (!Number.isInteger(maxImageBytes) || maxImageBytes < 1) {
    throw new TranslatorError(
      "OCR_INVALID_IMAGE_LIMIT",
      "O limite de tamanho da imagem não é válido.",
    );
  }
  if (image.length > maxImageBytes) {
    throw new TranslatorError(
      "OCR_IMAGE_TOO_LARGE",
      "A área capturada é grande demais para o OCR.",
      { actualBytes: image.length, maxImageBytes },
    );
  }

  return image;
}

function normalizeOcrLanguages(value = "auto") {
  if (Array.isArray(value)) {
    value = value.join("+");
  }
  const normalized = String(value || "auto").trim().toLowerCase();
  if (["auto", "eng+por", "por+eng", "en+pt", "pt+en"].includes(normalized)) {
    return [...DEFAULT_OCR_LANGUAGES];
  }
  if (["en", "eng", "en-us", "en-gb"].includes(normalized)) return ["eng"];
  if (["pt", "por", "pt-br", "pt-pt"].includes(normalized)) return ["por"];

  throw new TranslatorError(
    "OCR_INVALID_LANGUAGE",
    "O OCR local oferece suporte a inglês, português ou detecção bilíngue.",
    { language: value },
  );
}

function safeNotify(callback, progress) {
  if (typeof callback !== "function") return;
  try {
    callback(progress);
  } catch {
    // UI progress handlers must never interrupt OCR work.
  }
}

function createOcrService({
  dataDir,
  getDataDir,
  onProgress,
  maxImageBytes = DEFAULT_MAX_IMAGE_BYTES,
  loadTesseract = async () => require("tesseract.js"),
  prepareData = prepareTesseractDataDirectory,
  languageData,
  workerPath,
  corePath,
  workerOptions = {},
  engineConfig = {},
  fsPromises = fsp,
  existsSync = fs.existsSync,
  resolveModule = require.resolve,
} = {}) {
  let workerPromise = null;
  let currentLanguageKey = DEFAULT_OCR_LANGUAGES.join("+");
  let queue = Promise.resolve();
  let activeProgress = null;
  let terminated = false;
  let terminationPromise = null;

  const logger = (progress) => {
    safeNotify(onProgress, progress);
    if (activeProgress !== onProgress) safeNotify(activeProgress, progress);
  };

  async function initializeWorker() {
    let tesseract;
    let prepared;
    let runtimePaths;
    try {
      [tesseract, prepared] = await Promise.all([
        loadTesseract(),
        prepareData({
          dataDir,
          getDataDir,
          languageData,
          fsPromises,
          existsSync,
        }),
      ]);
      runtimePaths = resolveTesseractRuntimePaths({
        workerPath,
        corePath,
        existsSync,
        resolveModule,
      });
    } catch (error) {
      throw asTranslatorError(
        error,
        "OCR_INITIALIZATION_FAILED",
        "Não foi possível carregar o mecanismo de OCR.",
      );
    }

    if (typeof tesseract?.createWorker !== "function") {
      throw new TranslatorError(
        "OCR_ENGINE_UNAVAILABLE",
        "O mecanismo Tesseract não está disponível.",
      );
    }

    try {
      const worker = await tesseract.createWorker(
        [...DEFAULT_OCR_LANGUAGES],
        TESSERACT_OEM_LSTM_ONLY,
        {
          ...workerOptions,
          langPath: prepared.langPath,
          cachePath: prepared.cachePath,
          gzip: prepared.gzip !== false,
          workerPath: runtimePaths.workerPath,
          corePath: runtimePaths.corePath,
          logger,
        },
        engineConfig,
      );
      currentLanguageKey = DEFAULT_OCR_LANGUAGES.join("+");
      return worker;
    } catch (error) {
      throw asTranslatorError(
        error,
        "OCR_INITIALIZATION_FAILED",
        "Não foi possível iniciar o mecanismo de OCR.",
      );
    }
  }

  function ensureWorker() {
    if (!workerPromise) {
      const initialization = initializeWorker().catch((error) => {
        if (workerPromise === initialization) workerPromise = null;
        throw error;
      });
      workerPromise = initialization;
    }
    return workerPromise;
  }

  function schedule(task) {
    const scheduled = queue.then(task, task);
    queue = scheduled.catch(() => undefined);
    return scheduled;
  }

  async function recognize(imageBuffer, { language = "auto", onProgress: localProgress } = {}) {
    if (terminated) {
      throw new TranslatorError("OCR_TERMINATED", "O mecanismo de OCR já foi encerrado.");
    }
    const image = normalizeImageBuffer(imageBuffer, maxImageBytes);
    const languages = normalizeOcrLanguages(language);
    const languageKey = languages.join("+");

    return schedule(async () => {
      activeProgress = localProgress;
      try {
        const worker = await ensureWorker();
        if (languageKey !== currentLanguageKey) {
          await worker.reinitialize(languages, TESSERACT_OEM_LSTM_ONLY);
          currentLanguageKey = languageKey;
        }

        const result = await worker.recognize(image);
        const text = typeof result?.data?.text === "string" ? result.data.text.trim() : "";
        const confidence = Number.isFinite(result?.data?.confidence)
          ? result.data.confidence
          : null;
        return {
          text,
          confidence,
          language: languageKey,
        };
      } catch (error) {
        throw asTranslatorError(
          error,
          "OCR_FAILED",
          "Não foi possível reconhecer texto na área selecionada.",
        );
      } finally {
        activeProgress = null;
      }
    });
  }

  async function warmUp() {
    if (terminated) {
      throw new TranslatorError("OCR_TERMINATED", "O mecanismo de OCR já foi encerrado.");
    }
    return ensureWorker().then(() => undefined);
  }

  async function terminate() {
    if (terminationPromise) return terminationPromise;
    terminated = true;
    terminationPromise = (async () => {
      await queue;
      if (!workerPromise) return;

      let worker;
      try {
        worker = await workerPromise;
      } catch {
        workerPromise = null;
        return;
      }
      try {
        await worker.terminate();
      } catch (error) {
        throw asTranslatorError(
          error,
          "OCR_TERMINATION_FAILED",
          "Não foi possível encerrar corretamente o mecanismo de OCR.",
        );
      } finally {
        workerPromise = null;
      }
    })();
    return terminationPromise;
  }

  return {
    recognize,
    terminate,
    warmUp,
  };
}

module.exports = {
  DEFAULT_MAX_IMAGE_BYTES,
  DEFAULT_OCR_LANGUAGES,
  TESSERACT_OEM_LSTM_ONLY,
  createOcrService,
  normalizeImageBuffer,
  normalizeOcrLanguages,
  prepareTesseractDataDirectory,
  resolveAsarUnpackedPath,
  resolveTesseractRuntimePaths,
};
