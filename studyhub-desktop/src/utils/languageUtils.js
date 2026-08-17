const DEFAULT_SEGMENT_SECONDS = 4;
const MAX_PERSISTED_TRANSCRIPT_SEGMENTS = 10_000;
const MAX_PERSISTED_TRANSCRIPT_BYTES = 2_500_000;

const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function parseMediaTimestamp(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  }

  const normalized = String(value ?? "")
    .trim()
    .replace(",", ".");
  if (!normalized) return 0;

  const parts = normalized.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return 0;

  if (parts.length === 1) return Math.max(0, parts[0]);
  if (parts.length === 2) {
    return Math.max(0, parts[0] * 60 + parts[1]);
  }

  const seconds = parts.pop();
  const minutes = parts.pop() || 0;
  const hours = parts.reduce((total, part) => total * 60 + part, 0);
  return Math.max(0, hours * 3600 + minutes * 60 + seconds);
}

export function formatMediaTime(value, includeMilliseconds = false) {
  const totalSeconds = Math.max(0, toFiniteNumber(value));
  const wholeSeconds = Math.floor(totalSeconds);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const seconds = wholeSeconds % 60;
  const fraction = includeMilliseconds
    ? `.${String(Math.floor((totalSeconds % 1) * 1000)).padStart(3, "0")}`
    : "";

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}${fraction}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}${fraction}`;
}

export function normalizeTranscriptSegments(value) {
  const rawSegments = Array.isArray(value)
    ? value
    : Array.isArray(value?.segments)
      ? value.segments
      : [];

  const sorted = rawSegments
    .map((segment, index) => {
      const rawStart = segment?.start
        ?? segment?.time
        ?? segment?.timestamp
        ?? (segment?.startMs !== undefined ? Number(segment.startMs) / 1000 : 0);
      const start = Math.max(
        0,
        parseMediaTimestamp(rawStart),
      );
      const explicitEnd = segment?.end === undefined || segment?.end === null || segment?.end === ""
        ? Number.NaN
        : parseMediaTimestamp(segment.end);
      const text = String(segment?.text ?? segment?.sentence ?? "")
        .replace(/\s+/g, " ")
        .trim();

      return {
        ...segment,
        id: String(segment?.id ?? `segment-${index}-${Math.round(start * 1000)}`),
        start,
        time: start,
        end: Number.isFinite(explicitEnd) ? explicitEnd : null,
        text,
      };
    })
    .filter((segment) => segment.text)
    .sort((a, b) => a.start - b.start);

  return sorted.map((segment, index) => {
    const nextStart = sorted[index + 1]?.start;
    const fallbackEnd = Number.isFinite(nextStart)
      ? nextStart
      : segment.start + DEFAULT_SEGMENT_SECONDS;
    const end =
      Number.isFinite(segment.end) && segment.end > segment.start
        ? segment.end
        : Math.max(segment.start + 0.25, fallbackEnd);

    return { ...segment, end };
  });
}

export function compactTranscriptSegments(
  value,
  {
    maxSegments = MAX_PERSISTED_TRANSCRIPT_SEGMENTS,
    maxBytes = MAX_PERSISTED_TRANSCRIPT_BYTES,
  } = {},
) {
  const normalized = normalizeTranscriptSegments(value);
  if (normalized.length > maxSegments) {
    throw new Error(
      `A transcrição tem ${normalized.length} frases. O limite por aula é ${maxSegments}.`,
    );
  }

  const compact = normalized.map((segment) => ({
    id: segment.id,
    start: segment.start,
    time: segment.start,
    end: segment.end,
    text: segment.text,
  }));
  const serialized = JSON.stringify(compact);
  const byteLength = typeof TextEncoder === "function"
    ? new TextEncoder().encode(serialized).byteLength
    : serialized.length * 2;

  if (byteLength > maxBytes) {
    throw new Error(
      "A transcrição é grande demais para ser salva nesta aula. Importe uma versão com frases mais curtas.",
    );
  }
  return compact;
}

export function findActiveTranscriptSegment(segments, currentTime) {
  const time = toFiniteNumber(currentTime, Number.NaN);
  if (!Number.isFinite(time)) return null;
  const normalized = Array.isArray(segments) && (
    segments.length === 0
    || (
      Number.isFinite(segments[0]?.start)
      && Number.isFinite(segments[0]?.end)
      && Number.isFinite(segments[segments.length - 1]?.start)
      && Number.isFinite(segments[segments.length - 1]?.end)
    )
  )
    ? segments
    : normalizeTranscriptSegments(segments);

  let low = 0;
  let high = normalized.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const segment = normalized[middle];
    if (time < segment.start) high = middle - 1;
    else if (time >= segment.end) low = middle + 1;
    else return segment;
  }
  return null;
}

export function validateLoopBounds(start, end, duration = Number.POSITIVE_INFINITY) {
  const safeDuration = Number.isFinite(Number(duration))
    ? Math.max(0, Number(duration))
    : Number.POSITIVE_INFINITY;
  const safeStart = Math.min(
    safeDuration,
    Math.max(0, toFiniteNumber(start, Number.NaN)),
  );
  const safeEnd = Math.min(
    safeDuration,
    Math.max(0, toFiniteNumber(end, Number.NaN)),
  );

  if (!Number.isFinite(safeStart) || !Number.isFinite(safeEnd)) return null;
  if (safeEnd - safeStart < 0.25) return null;
  return { start: safeStart, end: safeEnd };
}

export function shouldLoop(currentTime, bounds, enabled = true) {
  if (!enabled || !bounds) return false;
  const time = toFiniteNumber(currentTime, Number.NaN);
  return Number.isFinite(time) && time >= bounds.end;
}

export function clampPlaybackRate(value) {
  const parsed = toFiniteNumber(value, 1);
  return Math.min(2, Math.max(0.5, Math.round(parsed * 4) / 4));
}

export function normalizeDictationText(value) {
  const decomposed = String(value ?? "").normalize("NFD");
  let writingSafeText = "";
  let previousBaseWasLatin = false;
  for (const character of decomposed) {
    if (/\p{Mark}/u.test(character)) {
      if (!previousBaseWasLatin) writingSafeText += character;
      continue;
    }
    writingSafeText += character;
    previousBaseWasLatin = /\p{Script=Latin}/u.test(character);
  }

  return writingSafeText
    .normalize("NFC")
    .toLocaleLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/[-–—]/g, " ")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeComparisonText(value, language) {
  if (!value) return [];
  const fallback = () => value.split(/\s+/u).filter(Boolean);
  if (typeof Intl?.Segmenter !== "function") return fallback();

  try {
    const locale = language && language !== "auto" ? language : undefined;
    const segments = Array.from(
      new Intl.Segmenter(locale, { granularity: "word" }).segment(value),
      (item) => item,
    )
      .filter((item) => item.isWordLike !== false && item.segment.trim())
      .map((item) => item.segment);
    return segments.length ? segments : fallback();
  } catch {
    return fallback();
  }
}

function alignWordSequences(expectedWords, responseWords) {
  const rows = expectedWords.length + 1;
  const columns = responseWords.length + 1;
  const matrix = Array.from({ length: rows }, () => Array(columns).fill(0));

  for (let row = 0; row < rows; row += 1) matrix[row][0] = row;
  for (let column = 0; column < columns; column += 1) matrix[0][column] = column;

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const substitutionCost =
        expectedWords[row - 1] === responseWords[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + substitutionCost,
      );
    }
  }

  const operations = [];
  let row = expectedWords.length;
  let column = responseWords.length;
  while (row > 0 || column > 0) {
    if (
      row > 0 &&
      column > 0 &&
      expectedWords[row - 1] === responseWords[column - 1] &&
      matrix[row][column] === matrix[row - 1][column - 1]
    ) {
      operations.unshift({ type: "match", expected: expectedWords[row - 1], response: responseWords[column - 1] });
      row -= 1;
      column -= 1;
    } else if (
      row > 0 &&
      column > 0 &&
      matrix[row][column] === matrix[row - 1][column - 1] + 1
    ) {
      operations.unshift({ type: "replace", expected: expectedWords[row - 1], response: responseWords[column - 1] });
      row -= 1;
      column -= 1;
    } else if (row > 0 && matrix[row][column] === matrix[row - 1][column] + 1) {
      operations.unshift({ type: "missing", expected: expectedWords[row - 1], response: null });
      row -= 1;
    } else {
      operations.unshift({ type: "extra", expected: null, response: responseWords[column - 1] });
      column -= 1;
    }
  }

  return { distance: matrix[expectedWords.length][responseWords.length], operations };
}

export function compareDictation(expected, response, language) {
  const normalizedExpected = normalizeDictationText(expected);
  const normalizedResponse = normalizeDictationText(response);
  const expectedWords = tokenizeComparisonText(normalizedExpected, language);
  const responseWords = tokenizeComparisonText(normalizedResponse, language);
  const { distance, operations } = alignWordSequences(expectedWords, responseWords);
  const denominator = Math.max(expectedWords.length, responseWords.length);
  const score = denominator === 0 ? 100 : Math.max(0, Math.round((1 - distance / denominator) * 100));

  return {
    score,
    distance,
    normalizedExpected,
    normalizedResponse,
    operations,
    missingWords: operations.filter((item) => item.type === "missing").map((item) => item.expected),
    extraWords: operations.filter((item) => item.type === "extra").map((item) => item.response),
  };
}

export function calculateRhythmScore(expectedDuration, actualDuration) {
  const expected = toFiniteNumber(expectedDuration, 0);
  const actual = toFiniteNumber(actualDuration, 0);
  if (expected <= 0 || actual <= 0) return 0;
  return Math.max(0, Math.round(100 - (Math.abs(actual - expected) / expected) * 100));
}
