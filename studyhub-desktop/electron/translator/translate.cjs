"use strict";

const { TranslatorError, asTranslatorError } = require("./errors.cjs");

const GOOGLE_TRANSLATE_ENDPOINT =
  "https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&dj=1";
const DEFAULT_CHUNK_LENGTH = 4_000;
const MAX_CHUNK_LENGTH = 5_000;
const DEFAULT_MAX_TEXT_LENGTH = 100_000;
const DEFAULT_TIMEOUT_MS = 20_000;

function normalizeLanguageCode(value, { allowAuto = false, field = "idioma" } = {}) {
  const code = String(value ?? "").trim();

  if (allowAuto && code.toLowerCase() === "auto") return "auto";
  if (!code || code.length > 32 || !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(code)) {
    throw new TranslatorError(
      "INVALID_LANGUAGE",
      `O ${field} não é válido.`,
      { field, value },
    );
  }

  return code;
}

function normalizeText(value, maxTextLength = DEFAULT_MAX_TEXT_LENGTH) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TranslatorError(
      "INVALID_TEXT",
      "Digite ou reconheça algum texto antes de traduzir.",
    );
  }

  if (!Number.isInteger(maxTextLength) || maxTextLength < 1) {
    throw new TranslatorError(
      "INVALID_MAX_TEXT_LENGTH",
      "O limite de texto configurado não é válido.",
    );
  }

  if (value.length > maxTextLength) {
    throw new TranslatorError(
      "TEXT_TOO_LONG",
      `O texto excede o limite de ${maxTextLength.toLocaleString("pt-BR")} caracteres.`,
      { actualLength: value.length, maxTextLength },
    );
  }

  return value;
}

function adjustForSurrogatePair(text, index) {
  if (
    index > 0 &&
    index < text.length &&
    /[\uD800-\uDBFF]/.test(text[index - 1]) &&
    /[\uDC00-\uDFFF]/.test(text[index])
  ) {
    return index - 1;
  }
  return index;
}

function findPreferredSplit(text, start, hardEnd) {
  const segment = text.slice(start, hardEnd);
  const minimum = Math.max(1, Math.floor(segment.length * 0.45));
  const patterns = [
    /\n{2,}/g,
    /[.!?…]["'”’\])}]*\s+/gu,
    /\n/g,
    /[\t ]+/g,
  ];

  for (const pattern of patterns) {
    let candidate = -1;
    for (const match of segment.matchAll(pattern)) {
      const next = match.index + match[0].length;
      if (next >= minimum) candidate = next;
    }
    if (candidate > 0) return start + candidate;
  }

  return hardEnd;
}

function chunkText(text, maxChunkLength = DEFAULT_CHUNK_LENGTH) {
  if (typeof text !== "string") {
    throw new TranslatorError("INVALID_TEXT", "O texto para divisão precisa ser uma string.");
  }
  if (
    !Number.isInteger(maxChunkLength) ||
    maxChunkLength < 1 ||
    maxChunkLength > MAX_CHUNK_LENGTH
  ) {
    throw new TranslatorError(
      "INVALID_CHUNK_LENGTH",
      `O tamanho de cada trecho deve ficar entre 1 e ${MAX_CHUNK_LENGTH} caracteres.`,
      { maxChunkLength },
    );
  }
  if (!text) return [];

  const chunks = [];
  let cursor = 0;

  while (cursor < text.length) {
    let hardEnd = Math.min(cursor + maxChunkLength, text.length);
    hardEnd = adjustForSurrogatePair(text, hardEnd);

    // A code point outside the BMP occupies two UTF-16 code units. Keeping it
    // intact is more important than honoring a pathological one-unit limit.
    if (hardEnd === cursor) hardEnd = Math.min(cursor + 2, text.length);

    let end = hardEnd;
    if (hardEnd < text.length) {
      end = findPreferredSplit(text, cursor, hardEnd);
      end = adjustForSurrogatePair(text, end);
    }
    if (end <= cursor) end = hardEnd;

    chunks.push(text.slice(cursor, end));
    cursor = end;
  }

  return chunks;
}

function splitOuterWhitespace(value) {
  const leading = value.match(/^\s*/u)?.[0] || "";
  const trailing = value.match(/\s*$/u)?.[0] || "";
  const end = Math.max(leading.length, value.length - trailing.length);
  return {
    leading,
    core: value.slice(leading.length, end),
    trailing: value.slice(end),
  };
}

function parseGoogleTranslationPayload(payload) {
  if (payload && !Array.isArray(payload) && Array.isArray(payload.sentences)) {
    const text = payload.sentences
      .map((sentence) => (typeof sentence?.trans === "string" ? sentence.trans : ""))
      .join("");
    if (text) {
      return {
        text,
        detectedLanguage:
          typeof payload.src === "string" && payload.src ? payload.src : null,
      };
    }
  }

  if (Array.isArray(payload) && Array.isArray(payload[0])) {
    const text = payload[0]
      .map((sentence) => (Array.isArray(sentence) && typeof sentence[0] === "string"
        ? sentence[0]
        : ""))
      .join("");
    if (text) {
      return {
        text,
        detectedLanguage:
          typeof payload[2] === "string" && payload[2] ? payload[2] : null,
      };
    }
  }

  throw new TranslatorError(
    "TRANSLATION_INVALID_RESPONSE",
    "O serviço de tradução retornou uma resposta inesperada.",
  );
}

function httpErrorForStatus(status) {
  if (status === 429) {
    return new TranslatorError(
      "TRANSLATION_RATE_LIMITED",
      "O serviço de tradução recebeu solicitações demais. Tente novamente em instantes.",
      { status },
    );
  }
  if (status >= 500) {
    return new TranslatorError(
      "TRANSLATION_SERVICE_UNAVAILABLE",
      "O serviço de tradução está temporariamente indisponível.",
      { status },
    );
  }
  return new TranslatorError(
    "TRANSLATION_HTTP_ERROR",
    "Não foi possível concluir a tradução.",
    { status },
  );
}

async function fetchTranslationChunk({
  fetchImpl,
  endpoint,
  text,
  sourceLanguage,
  targetLanguage,
  timeoutMs,
  signal,
}) {
  const controller = new AbortController();
  let timedOut = false;
  let removeAbortListener = null;

  if (signal?.aborted) {
    throw new TranslatorError("TRANSLATION_ABORTED", "A tradução foi cancelada.");
  }
  if (signal) {
    const abort = () => controller.abort(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    removeAbortListener = () => signal.removeEventListener("abort", abort);
  }

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  timeout.unref?.();

  try {
    const body = new URLSearchParams({
      sl: sourceLanguage,
      tl: targetLanguage,
      q: text,
    });
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: body.toString(),
      signal: controller.signal,
    });

    if (!response || typeof response.ok !== "boolean") {
      throw new TranslatorError(
        "TRANSLATION_INVALID_RESPONSE",
        "O serviço de tradução não retornou uma resposta HTTP válida.",
      );
    }
    if (!response.ok) throw httpErrorForStatus(Number(response.status) || 0);

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw new TranslatorError(
        "TRANSLATION_INVALID_RESPONSE",
        "O serviço de tradução retornou dados inválidos.",
        undefined,
        error,
      );
    }
    return parseGoogleTranslationPayload(payload);
  } catch (error) {
    if (error instanceof TranslatorError) throw error;
    if (timedOut) {
      throw new TranslatorError(
        "TRANSLATION_TIMEOUT",
        "A tradução demorou mais do que o esperado.",
        { timeoutMs },
        error,
      );
    }
    if (signal?.aborted || controller.signal.aborted) {
      throw new TranslatorError("TRANSLATION_ABORTED", "A tradução foi cancelada.", undefined, error);
    }
    throw asTranslatorError(
      error,
      "TRANSLATION_NETWORK_ERROR",
      "Não foi possível acessar o serviço de tradução. Verifique sua conexão.",
    );
  } finally {
    clearTimeout(timeout);
    removeAbortListener?.();
  }
}

function createGoogleTranslator({
  fetchImpl = globalThis.fetch,
  endpoint = GOOGLE_TRANSLATE_ENDPOINT,
  chunkLength = DEFAULT_CHUNK_LENGTH,
  maxTextLength = DEFAULT_MAX_TEXT_LENGTH,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TranslatorError(
      "FETCH_UNAVAILABLE",
      "Este ambiente não oferece suporte à tradução pela internet.",
    );
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TranslatorError("INVALID_TIMEOUT", "O tempo limite da tradução não é válido.");
  }

  // Validate once so configuration mistakes fail before the first request.
  chunkText("configuração", chunkLength);

  async function translate({
    text,
    sourceLanguage = "auto",
    targetLanguage = "pt",
    signal,
  } = {}) {
    const normalizedText = normalizeText(text, maxTextLength);
    const source = normalizeLanguageCode(sourceLanguage, {
      allowAuto: true,
      field: "idioma de origem",
    });
    const target = normalizeLanguageCode(targetLanguage, {
      field: "idioma de destino",
    });

    if (source !== "auto" && source.toLowerCase() === target.toLowerCase()) {
      return {
        text: normalizedText,
        sourceLanguage: source,
        targetLanguage: target,
        detectedLanguage: source,
        chunkCount: 0,
      };
    }

    const chunks = chunkText(normalizedText, chunkLength);
    const translated = [];
    let detectedLanguage = null;
    let requestCount = 0;

    for (const chunk of chunks) {
      if (signal?.aborted) {
        throw new TranslatorError("TRANSLATION_ABORTED", "A tradução foi cancelada.");
      }

      const { leading, core, trailing } = splitOuterWhitespace(chunk);
      if (!core) {
        translated.push(chunk);
        continue;
      }

      const result = await fetchTranslationChunk({
        fetchImpl,
        endpoint,
        text: core,
        sourceLanguage: source,
        targetLanguage: target,
        timeoutMs,
        signal,
      });
      requestCount += 1;
      detectedLanguage ||= result.detectedLanguage;
      translated.push(`${leading}${result.text.trim()}${trailing}`);
    }

    return {
      text: translated.join(""),
      sourceLanguage: source,
      targetLanguage: target,
      detectedLanguage: source === "auto" ? detectedLanguage : source,
      chunkCount: requestCount,
    };
  }

  return { translate };
}

module.exports = {
  DEFAULT_CHUNK_LENGTH,
  DEFAULT_MAX_TEXT_LENGTH,
  DEFAULT_TIMEOUT_MS,
  GOOGLE_TRANSLATE_ENDPOINT,
  MAX_CHUNK_LENGTH,
  chunkText,
  createGoogleTranslator,
  fetchTranslationChunk,
  normalizeLanguageCode,
  normalizeText,
  parseGoogleTranslationPayload,
  splitOuterWhitespace,
};
