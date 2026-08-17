"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const IPC_CHANNELS = Object.freeze({
  environment: "language-lab:environment",
  installWhisper: "language-lab:whisper:install",
  importTranscript: "language-lab:transcript:import",
  transcribeMedia: "language-lab:media:transcribe",
  transcribeRecording: "language-lab:recording:transcribe",
  extractAudio: "language-lab:audio:extract",
  cancel: "language-lab:cancel",
  progress: "language-lab:progress",
});

const TRANSCRIPT_EXTENSIONS = new Set([".srt", ".vtt", ".json"]);
const RECORDING_EXTENSIONS = new Set([
  ".aac",
  ".flac",
  ".m4a",
  ".mp3",
  ".ogg",
  ".opus",
  ".wav",
  ".webm",
]);
const CLIP_FORMATS = new Set(["mp3", "wav", "m4a"]);
const WHISPER_MODELS = new Set([
  "tiny",
  "tiny.en",
  "base",
  "base.en",
  "small",
  "small.en",
  "medium",
  "medium.en",
  "large",
  "large-v1",
  "large-v2",
  "large-v3",
  "large-v3-turbo",
  "turbo",
  "distil-small.en",
  "distil-medium.en",
  "distil-large-v2",
  "distil-large-v3",
]);
const OPENAI_WHISPER_MODELS = new Set([
  "tiny",
  "tiny.en",
  "base",
  "base.en",
  "small",
  "small.en",
  "medium",
  "medium.en",
  "large",
  "large-v1",
  "large-v2",
  "large-v3",
  "large-v3-turbo",
  "turbo",
]);

const MAX_TRANSCRIPT_BYTES = 50 * 1024 * 1024;
const MAX_RECORDING_BYTES = 100 * 1024 * 1024;
const MAX_CLIP_SECONDS = 10 * 60;
const MAX_PROCESS_OUTPUT = 1024 * 1024;
const DEFAULT_TRANSCRIPTION_TIMEOUT = 6 * 60 * 60 * 1000;
const ENVIRONMENT_CACHE_MS = 10_000;
const MANAGED_ENVIRONMENT_DIRECTORY = "whisper-venv";
const OPENAI_WHISPER_VERSION = "20250625";
const OPENAI_WHISPER_REQUIREMENT = `openai-whisper==${OPENAI_WHISPER_VERSION}`;
const SUPPORTED_PYTHON_MIN_MINOR = 9;
const SUPPORTED_PYTHON_MAX_MINOR = 12;
const SUPPORTED_PYTHON_RANGE = "3.9-3.12";

const runningProcesses = new Map();
const activeOperations = new Map();
const environmentCache = new Map();
const environmentPromises = new Map();

class LanguageLabError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "LanguageLabError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function roundSeconds(value) {
  return Number(Number(value).toFixed(3));
}

function decodeEntities(value) {
  const named = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return String(value ?? "").replace(
    /&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi,
    (match, entity) => {
      if (entity[0] !== "#") return named[entity.toLowerCase()] ?? match;
      const hexadecimal = entity[1]?.toLowerCase() === "x";
      const numeric = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      if (!Number.isFinite(numeric)) return match;
      try {
        return String.fromCodePoint(numeric);
      } catch {
        return match;
      }
    },
  );
}

function cleanCueText(value) {
  return decodeEntities(
    String(value ?? "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function parseTimecode(value) {
  if (typeof value === "number") {
    if (Number.isFinite(value) && value >= 0) return value;
    throw new LanguageLabError("INVALID_TIMECODE", "O timestamp precisa ser um número positivo.");
  }

  const source = String(value ?? "").trim().replace(",", ".");
  if (!source) {
    throw new LanguageLabError("INVALID_TIMECODE", "O timestamp está vazio.");
  }

  const parts = source.split(":");
  if (parts.length > 3 || parts.some((part) => !/^\d+(?:\.\d+)?$/.test(part))) {
    throw new LanguageLabError("INVALID_TIMECODE", `Timestamp inválido: ${source}`);
  }

  const numbers = parts.map(Number);
  const seconds = numbers.at(-1);
  if (!Number.isFinite(seconds) || seconds >= 60 && parts.length > 1) {
    throw new LanguageLabError("INVALID_TIMECODE", `Timestamp inválido: ${source}`);
  }

  let total = seconds;
  if (parts.length >= 2) total += numbers.at(-2) * 60;
  if (parts.length === 3) {
    if (numbers[1] >= 60) {
      throw new LanguageLabError("INVALID_TIMECODE", `Timestamp inválido: ${source}`);
    }
    total += numbers[0] * 3600;
  }

  return total;
}

function tryTimecode(value) {
  if (value === undefined || value === null || value === "") return null;
  try {
    return parseTimecode(value);
  } catch {
    return null;
  }
}

function parseTimingLine(line) {
  const match = String(line ?? "").match(/^\s*(\S+)\s+-->\s+(\S+)/);
  if (!match) return null;
  const start = tryTimecode(match[1]);
  const end = tryTimecode(match[2]);
  if (start === null || end === null || end <= start) return null;
  return { start, end };
}

function normalizeWords(words) {
  if (!Array.isArray(words)) return undefined;
  const normalized = words
    .map((word, index) => {
      const start = tryTimecode(word?.start ?? word?.startTime);
      const end = tryTimecode(word?.end ?? word?.endTime);
      const text = cleanCueText(word?.word ?? word?.text ?? word?.value);
      if (start === null || end === null || end < start || !text) return null;
      const probability = Number(word?.probability ?? word?.confidence);
      return {
        id: String(word?.id ?? index + 1),
        start: roundSeconds(start),
        end: roundSeconds(end),
        text,
        ...(Number.isFinite(probability) ? { probability } : {}),
      };
    })
    .filter(Boolean);
  return normalized.length ? normalized : undefined;
}

function buildTranscript({ format, language = null, segments, text = "" }) {
  const normalized = (segments || [])
    .map((segment, index) => {
      const start = tryTimecode(segment?.start);
      const end = tryTimecode(segment?.end);
      const cueText = cleanCueText(segment?.text);
      if (start === null || end === null || end <= start || !cueText) return null;
      const words = normalizeWords(segment.words);
      const confidence = Number(segment.confidence);
      return {
        id: String(segment.id ?? index + 1),
        start: roundSeconds(start),
        end: roundSeconds(end),
        text: cueText,
        ...(words ? { words } : {}),
        ...(Number.isFinite(confidence) ? { confidence } : {}),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.start - right.start || left.end - right.end);

  if (!normalized.length) {
    throw new LanguageLabError(
      "EMPTY_TRANSCRIPT",
      "Nenhum trecho sincronizado válido foi encontrado na transcrição.",
    );
  }

  return {
    format,
    language: language ? String(language) : null,
    text: cleanCueText(text) || normalized.map((segment) => segment.text).join(" "),
    duration: roundSeconds(Math.max(...normalized.map((segment) => segment.end))),
    segments: normalized,
  };
}

function parseTimedText(input, format) {
  const lines = String(input ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const segments = [];
  let index = 0;

  if (format === "vtt" && /^WEBVTT(?:\s|$)/i.test(lines[0] || "")) {
    index += 1;
    while (index < lines.length && lines[index].trim()) index += 1;
  }

  while (index < lines.length) {
    while (index < lines.length && !lines[index].trim()) index += 1;
    if (index >= lines.length) break;

    if (/^(NOTE|STYLE|REGION)(?:\s|$)/i.test(lines[index].trim())) {
      while (index < lines.length && lines[index].trim()) index += 1;
      continue;
    }

    let identifier = null;
    let timing = parseTimingLine(lines[index]);
    if (!timing) {
      identifier = lines[index].trim();
      index += 1;
      timing = parseTimingLine(lines[index]);
    }

    if (!timing) {
      while (index < lines.length && lines[index].trim()) index += 1;
      continue;
    }

    index += 1;
    const textLines = [];
    while (index < lines.length && lines[index].trim()) {
      textLines.push(lines[index]);
      index += 1;
    }

    segments.push({
      id: identifier || String(segments.length + 1),
      start: timing.start,
      end: timing.end,
      text: textLines.join(" "),
    });
  }

  return buildTranscript({ format, segments });
}

function parseSrt(input) {
  return parseTimedText(input, "srt");
}

function parseVtt(input) {
  return parseTimedText(input, "vtt");
}

function jsonTime(segment, name) {
  const millisecondsKey = `${name}Ms`;
  if (
    segment?.[millisecondsKey] !== undefined
    && segment[millisecondsKey] !== null
    && segment[millisecondsKey] !== ""
  ) {
    const milliseconds = Number(segment[millisecondsKey]);
    return Number.isFinite(milliseconds) && milliseconds >= 0 ? milliseconds / 1000 : null;
  }
  return tryTimecode(segment?.[name]);
}

function normalizeJsonSegment(segment, index) {
  if (!segment || typeof segment !== "object") return null;
  const start = jsonTime(segment, "start")
    ?? tryTimecode(segment.startTime ?? segment.from ?? segment.begin ?? segment.time);
  let end = jsonTime(segment, "end")
    ?? tryTimecode(segment.endTime ?? segment.to ?? segment.stop);

  if (end === null && start !== null) {
    const hasDurationMs = segment.durationMs !== undefined
      && segment.durationMs !== null
      && segment.durationMs !== "";
    const durationMs = hasDurationMs ? Number(segment.durationMs) : Number.NaN;
    const duration = Number.isFinite(durationMs) && durationMs >= 0
      ? durationMs / 1000
      : tryTimecode(segment.duration);
    if (duration !== null) end = start + duration;
  }

  const text = segment.text ?? segment.transcript ?? segment.caption ?? segment.value;
  if (start === null) return null;
  return {
    id: segment.id ?? segment.index ?? index + 1,
    start,
    end,
    text,
    words: segment.words ?? segment.tokens,
    confidence: segment.confidence ?? segment.probability,
  };
}

function parseTranscriptJson(input) {
  let data = input;
  if (typeof input === "string" || Buffer.isBuffer(input)) {
    try {
      data = JSON.parse(String(input).replace(/^\uFEFF/, ""));
    } catch (error) {
      throw new LanguageLabError("INVALID_JSON", "O arquivo JSON de transcrição é inválido.", error.message);
    }
  }

  const segmentSource = Array.isArray(data)
    ? data
    : data?.segments ?? data?.cues ?? data?.transcription ?? data?.results?.segments;
  if (!Array.isArray(segmentSource)) {
    throw new LanguageLabError(
      "INVALID_TRANSCRIPT_JSON",
      "O JSON precisa conter uma lista em “segments”, “cues” ou “transcription”.",
    );
  }

  const segments = segmentSource
    .map(normalizeJsonSegment)
    .filter(Boolean)
    .sort((left, right) => left.start - right.start);
  for (let index = 0; index < segments.length;) {
    let nextIndex = index + 1;
    while (nextIndex < segments.length && segments[nextIndex].start === segments[index].start) {
      nextIndex += 1;
    }
    const inferredEnd = nextIndex < segments.length
      ? segments[nextIndex].start
      : segments[index].start + 2;
    for (let groupIndex = index; groupIndex < nextIndex; groupIndex += 1) {
      if (segments[groupIndex].end === null) segments[groupIndex].end = inferredEnd;
    }
    index = nextIndex;
  }

  return buildTranscript({
    format: "json",
    language: data?.language ?? data?.locale ?? null,
    text: data?.text ?? data?.transcript ?? "",
    segments,
  });
}

async function assertReadableFile(filePath, label = "arquivo") {
  if (typeof filePath !== "string" || !filePath.trim() || filePath.includes("\0")) {
    throw new LanguageLabError("INVALID_PATH", `O caminho do ${label} é inválido.`);
  }
  const resolved = path.resolve(normalizeLocalFileInput(filePath));
  let stats;
  try {
    stats = await fsp.stat(resolved);
  } catch {
    throw new LanguageLabError("FILE_NOT_FOUND", `O ${label} não foi encontrado.`);
  }
  if (!stats.isFile()) {
    throw new LanguageLabError("NOT_A_FILE", `O caminho selecionado não é um ${label}.`);
  }
  return { path: resolved, stats };
}

function normalizeLocalFileInput(filePath) {
  const source = String(filePath || "").trim();
  const schemeMatch = source.match(/^(file|safe-file):\/\//i);
  if (!schemeMatch) {
    if (/^[a-z][a-z\d+.-]*:/i.test(source) && !/^[A-Za-z]:[\\/]/.test(source)) {
      throw new LanguageLabError("INVALID_PATH", "A operação exige um arquivo local.");
    }
    return source;
  }

  let decodedPath = source.slice(schemeMatch[0].length);
  if (schemeMatch[1].toLowerCase() === "safe-file" && /^local\//i.test(decodedPath)) {
    decodedPath = decodedPath.slice("local".length);
  }
  try {
    decodedPath = decodeURIComponent(decodedPath);
  } catch {
    // Preserve legacy paths containing literal percent signs.
  }
  if (/^\/[A-Za-z]:[\\/]/.test(decodedPath)) decodedPath = decodedPath.slice(1);
  if (!decodedPath.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(decodedPath)) {
    decodedPath = `//${decodedPath}`;
  }
  return decodedPath;
}

async function importTranscriptFile(filePath) {
  const selected = await assertReadableFile(filePath, "arquivo de transcrição");
  const extension = path.extname(selected.path).toLowerCase();
  if (!TRANSCRIPT_EXTENSIONS.has(extension)) {
    throw new LanguageLabError(
      "UNSUPPORTED_TRANSCRIPT",
      "Use uma transcrição nos formatos SRT, VTT ou JSON.",
    );
  }
  if (selected.stats.size > MAX_TRANSCRIPT_BYTES) {
    throw new LanguageLabError("TRANSCRIPT_TOO_LARGE", "A transcrição excede o limite de 50 MB.");
  }

  const content = await fsp.readFile(selected.path, "utf8");
  const transcript = extension === ".srt"
    ? parseSrt(content)
    : extension === ".vtt"
      ? parseVtt(content)
      : parseTranscriptJson(content);
  return {
    ...transcript,
    source: {
      kind: "file",
      name: path.basename(selected.path),
      path: selected.path,
    },
  };
}

function cleanExecutableCandidate(value) {
  const candidate = String(value ?? "").trim();
  if (!candidate) return null;
  return candidate.replace(/^"|"$/g, "");
}

function unpackedExecutablePath(value) {
  const candidate = cleanExecutableCandidate(value);
  if (!candidate || !candidate.includes("app.asar")) return candidate;
  const unpacked = candidate.replace("app.asar", "app.asar.unpacked");
  return fs.existsSync(unpacked) ? unpacked : candidate;
}

function findFfmpegStaticPath() {
  try {
    return unpackedExecutablePath(require("ffmpeg-static"));
  } catch {
    return null;
  }
}

function locateExecutable(command) {
  const candidate = cleanExecutableCandidate(command);
  if (!candidate) return null;
  const isUsable = (filePath) => {
    try {
      if (!fs.statSync(filePath).isFile()) return false;
      if (process.platform !== "win32") fs.accessSync(filePath, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  };
  if (path.isAbsolute(candidate) || candidate.includes("/") || candidate.includes("\\")) {
    const resolved = path.resolve(candidate);
    return isUsable(resolved) ? resolved : null;
  }

  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path");
  const searchDirectories = [process.cwd(), ...String(pathKey ? process.env[pathKey] : "").split(path.delimiter)]
    .map((entry) => cleanExecutableCandidate(entry))
    .filter(Boolean);
  const extensions = process.platform === "win32"
    ? (path.extname(candidate)
        ? [""]
        : String(process.env.PATHEXT || ".EXE;.COM").split(";").filter(Boolean))
    : [""];
  for (const directory of searchDirectories) {
    for (const extension of extensions) {
      const filePath = path.join(directory, `${candidate}${extension}`);
      if (isUsable(filePath)) return filePath;
    }
  }
  return null;
}

function probeExecutable(command, args, timeout = 5000) {
  const executablePath = locateExecutable(command) || cleanExecutableCandidate(command);
  if (!executablePath) return Promise.resolve(null);
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(executablePath, args, {
        windowsHide: true,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      resolve(null);
      return;
    }
    let output = "";
    let settled = false;
    const append = (chunk) => {
      output = `${output}${chunk.toString()}`.slice(-64 * 1024);
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    const timer = setTimeout(() => child.kill(), timeout);
    child.once("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(null);
    });
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(code === 0 ? { command: executablePath, output: output.trim() } : null);
    });
  });
}

function uniqueCandidates(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    if (!candidate?.command) return false;
    const key = `${candidate.command}\0${(candidate.prefixArgs || []).join("\0")}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getManagedWhisperPaths(userDataPath) {
  const normalizedUserDataPath = cleanExecutableCandidate(userDataPath);
  if (!normalizedUserDataPath) return null;
  const root = path.join(
    path.resolve(normalizedUserDataPath),
    "language-lab",
    MANAGED_ENVIRONMENT_DIRECTORY,
  );
  return {
    root,
    python: process.platform === "win32"
      ? path.join(root, "Scripts", "python.exe")
      : path.join(root, "bin", "python"),
  };
}

function pythonCompatibility(version) {
  const [major, minor] = String(version || "").split(".").map(Number);
  return {
    recommendedCompatible:
      major === 3 &&
      minor >= SUPPORTED_PYTHON_MIN_MINOR &&
      minor <= SUPPORTED_PYTHON_MAX_MINOR,
    recommendedRange: SUPPORTED_PYTHON_RANGE,
  };
}

async function findPython({ userDataPath, includeManaged = true } = {}) {
  const managedPaths = getManagedWhisperPaths(userDataPath);
  const localPython = process.platform === "win32"
    ? [path.join(process.cwd(), ".venv", "Scripts", "python.exe"), path.join(process.cwd(), "venv", "Scripts", "python.exe")]
    : [path.join(process.cwd(), ".venv", "bin", "python"), path.join(process.cwd(), "venv", "bin", "python")];
  const candidates = uniqueCandidates([
    ...(includeManaged && managedPaths
      ? [{ command: managedPaths.python, prefixArgs: [], managed: true }]
      : []),
    { command: cleanExecutableCandidate(process.env.STUDYHUB_PYTHON), prefixArgs: [] },
    ...localPython.map((command) => ({ command, prefixArgs: [] })),
    { command: "python", prefixArgs: [] },
    { command: "python3", prefixArgs: [] },
    ...(process.platform === "win32" ? [{ command: "py", prefixArgs: ["-3"] }] : []),
  ]);

  for (const candidate of candidates) {
    const probe = await probeExecutable(candidate.command, [...candidate.prefixArgs, "--version"]);
    if (!probe) continue;
    const version = probe.output.match(/Python\s+([^\s]+)/i)?.[1] ?? null;
    return {
      available: true,
      command: probe.command,
      prefixArgs: candidate.prefixArgs,
      version,
      managed: Boolean(candidate.managed),
      managedEnvironmentPath: candidate.managed ? managedPaths.root : null,
      ...pythonCompatibility(version),
    };
  }

  return {
    available: false,
    command: null,
    prefixArgs: [],
    version: null,
    managed: false,
    managedEnvironmentPath: managedPaths?.root || null,
    recommendedCompatible: false,
    recommendedRange: SUPPORTED_PYTHON_RANGE,
  };
}

async function findTool(name, overrideName) {
  const resourceCandidate = process.resourcesPath
    ? path.join(process.resourcesPath, process.platform === "win32" ? `${name}.exe` : name)
    : null;
  const candidates = [
    process.env[overrideName],
    ...(name === "ffmpeg" ? [findFfmpegStaticPath()] : []),
    resourceCandidate,
    name,
  ]
    .map(cleanExecutableCandidate)
    .filter(Boolean);
  for (const candidate of candidates) {
    const probe = await probeExecutable(candidate, ["-version"]);
    if (!probe) continue;
    return {
      available: true,
      command: probe.command,
      version: probe.output.split(/\r?\n/)[0] || null,
    };
  }
  return { available: false, command: null, version: null };
}

async function detectPythonWhisperModules(python) {
  if (!python.available) {
    return { openai: false, faster: false, openaiVersion: null, fasterVersion: null };
  }
  const script = String.raw`
import importlib.metadata
import importlib.util
import json

def installed_version(distribution):
    try:
        return importlib.metadata.version(distribution)
    except importlib.metadata.PackageNotFoundError:
        return None

print(json.dumps({
    "openai": bool(importlib.util.find_spec("whisper")),
    "faster": bool(importlib.util.find_spec("faster_whisper")),
    "openaiVersion": installed_version("openai-whisper"),
    "fasterVersion": installed_version("faster-whisper"),
}))
`;
  const result = await probeExecutable(python.command, [...python.prefixArgs, "-c", script]);
  if (!result) {
    return { openai: false, faster: false, openaiVersion: null, fasterVersion: null };
  }
  try {
    return JSON.parse(result.output);
  } catch {
    return { openai: false, faster: false, openaiVersion: null, fasterVersion: null };
  }
}

function createSetupGuide({ python, ffmpeg, whisper, managedEnvironment }) {
  return {
    automaticInstallation: true,
    note: `O StudyHub instala ${OPENAI_WHISPER_REQUIREMENT} em um ambiente isolado. O primeiro uso de um modelo pode baixar seus pesos; depois disso, a transcrição é local.`,
    steps: [
      {
        id: "python",
        needed: !python.available,
        label: `Instalar Python ${SUPPORTED_PYTHON_RANGE} e adicioná-lo ao PATH.`,
        warning: python.available && !python.recommendedCompatible
          ? `Python ${python.version} detectado; o ambiente do StudyHub requer ${python.recommendedRange}.`
          : null,
        url: "https://www.python.org/downloads/",
      },
      {
        id: "ffmpeg",
        needed: !ffmpeg.available,
        label: "Instalar FFmpeg e adicioná-lo ao PATH.",
        url: "https://ffmpeg.org/download.html",
        commandChoices: process.platform === "win32"
          ? [
              { command: "choco", args: ["install", "ffmpeg"] },
              { command: "scoop", args: ["install", "ffmpeg"] },
            ]
          : [],
      },
      {
        id: "whisper",
        needed: !whisper.available,
        label: `Preparar o OpenAI Whisper ${OPENAI_WHISPER_VERSION} no ambiente isolado do StudyHub.`,
        url: "https://github.com/openai/whisper",
        action: "install-whisper",
        environmentPath: managedEnvironment?.path || null,
      },
    ],
  };
}

function environmentCacheKey(userDataPath) {
  return getManagedWhisperPaths(userDataPath)?.root || "system-python";
}

async function detectEnvironment({ refresh = false, userDataPath } = {}) {
  const cacheKey = environmentCacheKey(userDataPath);
  const now = Date.now();
  const cached = environmentCache.get(cacheKey);
  if (!refresh && cached && now - cached.cachedAt < ENVIRONMENT_CACHE_MS) {
    return cached.environment;
  }
  if (environmentPromises.has(cacheKey)) return environmentPromises.get(cacheKey);

  const environmentPromise = (async () => {
    const managedPaths = getManagedWhisperPaths(userDataPath);
    const [python, ffmpeg, ffprobe] = await Promise.all([
      findPython({ userDataPath }),
      findTool("ffmpeg", "STUDYHUB_FFMPEG"),
      findTool("ffprobe", "STUDYHUB_FFPROBE"),
    ]);
    const useDetectedPythonEnvironment = !managedPaths || python.managed;
    const modules = useDetectedPythonEnvironment
      ? await detectPythonWhisperModules(python)
      : { openai: false, faster: false, openaiVersion: null, fasterVersion: null };
    const whisperCliProbe = managedPaths || modules.openai || python.managed
      ? null
      : await probeExecutable(process.env.STUDYHUB_WHISPER || "whisper", ["--help"], 15_000);
    const whisperCliPath = whisperCliProbe?.command || null;
    const engines = [
      ...(modules.openai ? ["openai-whisper"] : []),
      ...(modules.faster ? ["faster-whisper"] : []),
      ...(!modules.openai && whisperCliPath ? ["whisper-cli"] : []),
    ];
    const preferredEngine = engines.find((engine) =>
      engine === "faster-whisper" || ffmpeg.available) || null;
    const whisper = {
      available: engines.length > 0,
      engine: preferredEngine,
      engines,
      cliCommand: whisperCliPath,
      openaiVersion: modules.openaiVersion || null,
      fasterVersion: modules.fasterVersion || null,
      isolated: Boolean(python.managed),
    };
    const environment = {
      ready: Boolean(preferredEngine),
      clipExtractionReady: ffmpeg.available,
      checkedAt: new Date().toISOString(),
      python,
      ffmpeg,
      ffprobe,
      whisper,
      managedEnvironment: {
        path: managedPaths?.root || null,
        pythonPath: managedPaths?.python || null,
        active: Boolean(python.managed),
      },
    };
    environment.setup = createSetupGuide(environment);
    environmentCache.set(cacheKey, { environment, cachedAt: Date.now() });
    return environment;
  })();
  environmentPromises.set(cacheKey, environmentPromise);

  try {
    return await environmentPromise;
  } finally {
    if (environmentPromises.get(cacheKey) === environmentPromise) {
      environmentPromises.delete(cacheKey);
    }
  }
}

function clearEnvironmentCache() {
  environmentCache.clear();
}

const PYTHON_TRANSCRIBE_SCRIPT = String.raw`
import argparse
import json

parser = argparse.ArgumentParser()
parser.add_argument("--engine", required=True)
parser.add_argument("--input", required=True)
parser.add_argument("--output", required=True)
parser.add_argument("--model", required=True)
parser.add_argument("--language", default="")
parser.add_argument("--task", choices=["transcribe", "translate"], default="transcribe")
parser.add_argument("--device", choices=["auto", "cpu", "cuda"], default="auto")
parser.add_argument("--word-timestamps", choices=["0", "1"], default="1")
args = parser.parse_args()

def progress(phase, message):
    print(json.dumps({"event": "progress", "phase": phase, "message": message}), flush=True)

def word_dict(word):
    return {
        "start": float(word.get("start", 0)),
        "end": float(word.get("end", word.get("start", 0))),
        "word": str(word.get("word", "")),
        **({"probability": float(word["probability"])} if word.get("probability") is not None else {}),
    }

progress("loading-model", "Carregando o modelo de transcrição local…")
word_timestamps = args.word_timestamps == "1"

if args.engine == "openai-whisper":
    import torch
    import whisper
    device = args.device if args.device != "auto" else ("cuda" if torch.cuda.is_available() else "cpu")
    model = whisper.load_model(args.model, device=device)
    progress("transcribing", "Transcrevendo o áudio localmente…")
    options = {"task": args.task, "verbose": False, "word_timestamps": word_timestamps, "fp16": device == "cuda"}
    if args.language:
        options["language"] = args.language
    raw = model.transcribe(args.input, **options)
    segments = []
    for index, segment in enumerate(raw.get("segments", [])):
        item = {
            "id": segment.get("id", index),
            "start": float(segment.get("start", 0)),
            "end": float(segment.get("end", 0)),
            "text": str(segment.get("text", "")),
        }
        if segment.get("words"):
            item["words"] = [word_dict(word) for word in segment["words"]]
        segments.append(item)
    result = {"language": raw.get("language"), "text": raw.get("text", ""), "segments": segments}
else:
    from faster_whisper import WhisperModel
    device = args.device if args.device != "auto" else "auto"
    model = WhisperModel(args.model, device=device, compute_type="auto")
    progress("transcribing", "Transcrevendo o áudio localmente…")
    iterator, info = model.transcribe(
        args.input,
        language=args.language or None,
        task=args.task,
        word_timestamps=word_timestamps,
    )
    segments = []
    texts = []
    for index, segment in enumerate(iterator):
        text = str(segment.text or "")
        texts.append(text)
        item = {"id": index, "start": float(segment.start), "end": float(segment.end), "text": text}
        if segment.words:
            item["words"] = [
                {
                    "start": float(word.start),
                    "end": float(word.end),
                    "word": str(word.word or ""),
                    **({"probability": float(word.probability)} if word.probability is not None else {}),
                }
                for word in segment.words
            ]
        segments.append(item)
    result = {
        "language": info.language,
        "languageProbability": float(info.language_probability),
        "text": "".join(texts),
        "segments": segments,
    }

with open(args.output, "w", encoding="utf-8") as output_file:
    json.dump(result, output_file, ensure_ascii=False)
progress("completed", "Transcrição concluída.")
`;

function normalizeRequestId(value, prefix) {
  if (value === undefined || value === null || value === "") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  const requestId = String(value);
  if (!/^[A-Za-z0-9_.-]{1,120}$/.test(requestId)) {
    throw new LanguageLabError("INVALID_REQUEST_ID", "O identificador da operação é inválido.");
  }
  return requestId;
}

function killProcessTree(entry) {
  if (!entry?.child || entry.child.killed) return;
  if (process.platform === "win32" && entry.child.pid) {
    const killer = spawn("taskkill", ["/pid", String(entry.child.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
      shell: false,
    });
    killer.once("error", () => entry.child.kill());
    killer.once("close", (code) => {
      if (code !== 0 && !entry.child.killed) entry.child.kill();
    });
    killer.unref();
    return;
  }
  entry.child.kill("SIGTERM");
}

function runProcess(command, args, { requestId, timeoutMs, onStdoutLine, env, ownerId } = {}) {
  if (runningProcesses.has(requestId)) {
    throw new LanguageLabError("DUPLICATE_REQUEST", "Já existe uma operação com esse identificador.");
  }

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command, args, {
        windowsHide: true,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        env: env || process.env,
      });
    } catch (error) {
      reject(new LanguageLabError("PROCESS_START_FAILED", "Não foi possível iniciar a ferramenta local.", error.message));
      return;
    }

    const entry = { child, canceled: false, timedOut: false, ownerId };
    runningProcesses.set(requestId, entry);
    let stdout = "";
    let stderr = "";
    let lineBuffer = "";
    const cap = (current, next) => `${current}${next}`.slice(-MAX_PROCESS_OUTPUT);

    child.stdout.on("data", (chunk) => {
      const next = chunk.toString();
      stdout = cap(stdout, next);
      lineBuffer = `${lineBuffer}${next}`.slice(-MAX_PROCESS_OUTPUT);
      const lines = lineBuffer.split(/\r?\n/);
      lineBuffer = lines.pop() || "";
      for (const line of lines) onStdoutLine?.(line);
    });
    child.stderr.on("data", (chunk) => {
      stderr = cap(stderr, chunk.toString());
    });

    const timer = setTimeout(() => {
      entry.timedOut = true;
      killProcessTree(entry);
    }, timeoutMs);

    child.once("error", (error) => {
      clearTimeout(timer);
      runningProcesses.delete(requestId);
      reject(new LanguageLabError("PROCESS_START_FAILED", "Não foi possível iniciar a ferramenta local.", error.message));
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      runningProcesses.delete(requestId);
      if (lineBuffer) onStdoutLine?.(lineBuffer);
      resolve({ code, signal, stdout, stderr, canceled: entry.canceled, timedOut: entry.timedOut });
    });
  });
}

function beginOperation(requestId, ownerId) {
  if (activeOperations.has(requestId) || runningProcesses.has(requestId)) {
    throw new LanguageLabError("DUPLICATE_REQUEST", "Já existe uma operação com esse identificador.");
  }
  activeOperations.set(requestId, { ownerId, canceled: false });
}

function assertOperationActive(requestId) {
  if (activeOperations.get(requestId)?.canceled) {
    throw new LanguageLabError("CANCELED", "A operação foi cancelada.");
  }
}

function finishOperation(requestId) {
  activeOperations.delete(requestId);
}

function cancelRequest(requestId, ownerId) {
  const normalizedRequestId = String(requestId || "");
  const operation = activeOperations.get(normalizedRequestId);
  const entry = runningProcesses.get(normalizedRequestId);
  const owner = operation?.ownerId ?? entry?.ownerId;
  if ((!operation && !entry) || ownerId !== undefined && owner !== ownerId) return false;
  if (operation) operation.canceled = true;
  if (entry) {
    entry.canceled = true;
    killProcessTree(entry);
  }
  return true;
}

function cancelAllRequests() {
  const canceledIds = new Set([...activeOperations.keys(), ...runningProcesses.keys()]);
  for (const operation of activeOperations.values()) operation.canceled = true;
  for (const entry of runningProcesses.values()) {
    entry.canceled = true;
    killProcessTree(entry);
  }
  return canceledIds.size;
}

function cancelRequestsForOwner(ownerId) {
  const canceledIds = new Set();
  for (const [requestId, operation] of activeOperations) {
    if (operation.ownerId !== ownerId) continue;
    operation.canceled = true;
    canceledIds.add(requestId);
  }
  for (const [requestId, entry] of runningProcesses) {
    if (entry.ownerId !== ownerId) continue;
    entry.canceled = true;
    killProcessTree(entry);
    canceledIds.add(requestId);
  }
  return canceledIds.size;
}

function environmentWithToolOnPath(tool) {
  if (!tool?.command) return process.env;
  const env = { ...process.env };
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") || "PATH";
  const toolDirectory = path.dirname(tool.command);
  const currentPath = String(env[pathKey] || "");
  const entries = currentPath.split(path.delimiter).filter(Boolean);
  if (!entries.some((entry) => path.resolve(entry).toLowerCase() === path.resolve(toolDirectory).toLowerCase())) {
    env[pathKey] = `${toolDirectory}${path.delimiter}${currentPath}`;
  }
  return env;
}

function clampTimeout(value) {
  const timeout = Number(value);
  if (!Number.isFinite(timeout)) return DEFAULT_TRANSCRIPTION_TIMEOUT;
  return Math.min(Math.max(timeout, 60_000), 12 * 60 * 60 * 1000);
}

function validateTranscriptionOptions(payload, environment) {
  const model = String(payload.model || "base").toLowerCase();
  if (!WHISPER_MODELS.has(model)) {
    throw new LanguageLabError("INVALID_MODEL", "O modelo Whisper selecionado não é permitido.");
  }
  const task = payload.task === "translate" ? "translate" : "transcribe";
  if (task === "translate" && ["turbo", "large-v3-turbo"].includes(model)) {
    throw new LanguageLabError(
      "UNSUPPORTED_TRANSLATION_MODEL",
      "Para traduzir, escolha tiny, base, small, medium ou large.",
    );
  }
  const device = ["auto", "cpu", "cuda"].includes(payload.device) ? payload.device : "auto";
  const aliases = { openai: "openai-whisper", faster: "faster-whisper", cli: "whisper-cli" };
  const requestedEngine = aliases[payload.engine] || payload.engine;
  const engine = requestedEngine || environment.whisper.engine;
  if (!environment.whisper.engines.includes(engine)) {
    throw new LanguageLabError("ENGINE_UNAVAILABLE", "O mecanismo de transcrição selecionado não está disponível.");
  }
  if (["openai-whisper", "whisper-cli"].includes(engine) && !OPENAI_WHISPER_MODELS.has(model)) {
    throw new LanguageLabError(
      "MODEL_UNAVAILABLE_FOR_ENGINE",
      "Esse modelo só está disponível com Faster Whisper.",
    );
  }
  if (task === "translate" && (model.endsWith(".en") || model.startsWith("distil-"))) {
    throw new LanguageLabError(
      "UNSUPPORTED_TRANSLATION_MODEL",
      "Modelos somente em inglês não podem ser usados para tradução.",
    );
  }
  const language = String(payload.language || "").trim();
  if (language.length > 64) {
    throw new LanguageLabError("INVALID_LANGUAGE", "O idioma informado é inválido.");
  }
  return {
    model,
    task,
    device,
    engine,
    language,
    wordTimestamps: payload.wordTimestamps !== false,
  };
}

function parseProgressLine(line, onProgress, requestId) {
  try {
    const event = JSON.parse(line);
    if (event?.event === "progress") {
      onProgress?.({ requestId, phase: event.phase, message: event.message });
    }
  } catch {
    // Whisper and model downloaders can write human-readable status lines.
  }
}

function processFailure(result, operation) {
  if (result.canceled) {
    throw new LanguageLabError("CANCELED", `${operation} cancelada.`);
  }
  if (result.timedOut) {
    throw new LanguageLabError("TIMEOUT", `${operation} excedeu o tempo limite.`);
  }
  if (result.code !== 0) {
    const details = String(result.stderr || result.stdout || "Erro desconhecido").trim().slice(-8000);
    throw new LanguageLabError("TOOL_FAILED", `${operation} não pôde ser concluída.`, details);
  }
}

async function runPythonTranscription({ environment, inputPath, outputPath, options, requestId, timeoutMs, onProgress, ownerId }) {
  const python = environment.python;
  if (!python.available) {
    throw new LanguageLabError("PYTHON_UNAVAILABLE", "Python não está disponível para a transcrição.");
  }
  const args = [
    ...python.prefixArgs,
    "-c",
    PYTHON_TRANSCRIBE_SCRIPT,
    "--engine",
    options.engine,
    "--input",
    inputPath,
    "--output",
    outputPath,
    "--model",
    options.model,
    "--task",
    options.task,
    "--device",
    options.device,
    "--word-timestamps",
    options.wordTimestamps ? "1" : "0",
  ];
  if (options.language) args.push("--language", options.language);

  const result = await runProcess(python.command, args, {
    requestId,
    timeoutMs,
    ownerId,
    env: environmentWithToolOnPath(environment.ffmpeg),
    onStdoutLine: (line) => parseProgressLine(line, onProgress, requestId),
  });
  processFailure(result, "A transcrição");
}

async function runCliTranscription({ environment, inputPath, outputDirectory, options, requestId, timeoutMs, onProgress, ownerId }) {
  onProgress?.({ requestId, phase: "loading-model", message: "Carregando o modelo de transcrição local…" });
  const args = [
    inputPath,
    "--model",
    options.model,
    "--task",
    options.task,
    "--output_format",
    "json",
    "--output_dir",
    outputDirectory,
    "--verbose",
    "False",
    "--word_timestamps",
    options.wordTimestamps ? "True" : "False",
  ];
  if (options.language) args.push("--language", options.language);
  if (options.device !== "auto") args.push("--device", options.device);
  onProgress?.({ requestId, phase: "transcribing", message: "Transcrevendo o áudio localmente…" });
  const result = await runProcess(environment.whisper.cliCommand, args, {
    requestId,
    timeoutMs,
    ownerId,
    env: environmentWithToolOnPath(environment.ffmpeg),
  });
  processFailure(result, "A transcrição");
  const jsonFiles = (await fsp.readdir(outputDirectory)).filter((name) => name.toLowerCase().endsWith(".json"));
  if (!jsonFiles.length) {
    throw new LanguageLabError("MISSING_OUTPUT", "O Whisper não gerou o arquivo de transcrição esperado.");
  }
  return path.join(outputDirectory, jsonFiles[0]);
}

async function transcribeMedia(payload = {}, context = {}) {
  const requestId = normalizeRequestId(payload.requestId, "transcription");
  beginOperation(requestId, context.ownerId);
  try {
    return await transcribeMediaOperation(payload, context, requestId);
  } finally {
    finishOperation(requestId);
  }
}

async function transcribeMediaOperation(payload, context, requestId) {
  const selected = await assertReadableFile(payload.mediaPath, "arquivo de mídia");
  assertOperationActive(requestId);
  context.onProgress?.({ requestId, phase: "checking-environment", message: "Verificando o ambiente local…" });
  const environment = await detectEnvironment({
    refresh: Boolean(payload.refreshEnvironment),
    userDataPath: context.userDataPath,
  });
  assertOperationActive(requestId);
  if (!environment.ready) {
    throw new LanguageLabError(
      "ENVIRONMENT_NOT_READY",
      "A transcrição local precisa do Whisper e do FFmpeg.",
      environment,
    );
  }
  const options = validateTranscriptionOptions(payload, environment);
  if (options.engine !== "faster-whisper" && !environment.ffmpeg.available) {
    throw new LanguageLabError(
      "FFMPEG_UNAVAILABLE",
      "O OpenAI Whisper precisa do FFmpeg para ler o arquivo de mídia.",
      environment,
    );
  }
  const workingDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), "studyhub-language-transcription-"));
  let outputPath = path.join(workingDirectory, "transcript.json");

  try {
    if (options.engine === "whisper-cli") {
      outputPath = await runCliTranscription({
        environment,
        inputPath: selected.path,
        outputDirectory: workingDirectory,
        options,
        requestId,
        timeoutMs: clampTimeout(payload.timeoutMs),
        onProgress: context.onProgress,
        ownerId: context.ownerId,
      });
    } else {
      await runPythonTranscription({
        environment,
        inputPath: selected.path,
        outputPath,
        options,
        requestId,
        timeoutMs: clampTimeout(payload.timeoutMs),
        onProgress: context.onProgress,
        ownerId: context.ownerId,
      });
    }

    assertOperationActive(requestId);
    const transcript = parseTranscriptJson(await fsp.readFile(outputPath, "utf8"));
    context.onProgress?.({ requestId, phase: "completed", message: "Transcrição concluída." });
    return {
      ...transcript,
      requestId,
      engine: options.engine,
      model: options.model,
      createdAt: new Date().toISOString(),
      source: {
        kind: "media",
        name: path.basename(selected.path),
        path: selected.path,
      },
    };
  } finally {
    await fsp.rm(workingDirectory, { recursive: true, force: true }).catch(() => {});
  }
}

async function installWhisper(payload = {}, context = {}, dependencies = {}) {
  const detectEnvironmentForInstall = dependencies.detectEnvironment || detectEnvironment;
  const findPythonForInstall = dependencies.findPython || findPython;
  const probeExecutableForInstall = dependencies.probeExecutable || probeExecutable;
  const runProcessForInstall = dependencies.runProcess || runProcess;
  const clearEnvironmentCacheForInstall =
    dependencies.clearEnvironmentCache || clearEnvironmentCache;
  const requestId = normalizeRequestId(payload.requestId, "whisper-install");
  const rawUserDataPath = context.userDataPath || context.app?.getPath?.("userData");
  const managedPaths = getManagedWhisperPaths(rawUserDataPath);
  if (!managedPaths) {
    throw new LanguageLabError(
      "MANAGED_ENVIRONMENT_UNAVAILABLE",
      "Não foi possível localizar a pasta privada do StudyHub para preparar o Whisper.",
    );
  }
  const userDataPath = path.resolve(rawUserDataPath);
  const timeoutMs = Math.min(
    Math.max(Number(payload.timeoutMs) || 30 * 60 * 1000, 60_000),
    2 * 60 * 60 * 1000,
  );

  beginOperation(requestId, context.ownerId);
  try {
    const environment = await detectEnvironmentForInstall({ refresh: true, userDataPath });
    assertOperationActive(requestId);

    const managedPythonIsUsable =
      environment.python.managed && environment.python.recommendedCompatible;
    const installerPython = managedPythonIsUsable
      ? environment.python
      : await findPythonForInstall({ userDataPath, includeManaged: false });
    if (!installerPython.available) {
      throw new LanguageLabError(
        "PYTHON_UNAVAILABLE",
        `Instale o Python ${SUPPORTED_PYTHON_RANGE} antes de preparar o Whisper local.`,
        environment,
      );
    }
    if (!installerPython.recommendedCompatible) {
      throw new LanguageLabError(
        "PYTHON_VERSION_UNSUPPORTED",
        `O StudyHub precisa do Python ${SUPPORTED_PYTHON_RANGE}; foi encontrado o Python ${installerPython.version || "desconhecido"}.`,
        { supportedRange: SUPPORTED_PYTHON_RANGE, python: installerPython },
      );
    }

    await fsp.mkdir(path.dirname(managedPaths.root), { recursive: true });
    assertOperationActive(requestId);
    if (!managedPythonIsUsable) {
      context.onProgress?.({
        requestId,
        phase: "creating-whisper-environment",
        message: "Criando o ambiente isolado do Whisper…",
      });
      const createResult = await runProcessForInstall(
        installerPython.command,
        [
          ...installerPython.prefixArgs,
          "-m",
          "venv",
          "--clear",
          managedPaths.root,
        ],
        { requestId, ownerId: context.ownerId, timeoutMs },
      );
      processFailure(createResult, "A criação do ambiente isolado do Whisper");
    }

    assertOperationActive(requestId);
    const managedPythonProbe = await probeExecutableForInstall(managedPaths.python, ["--version"]);
    if (!managedPythonProbe) {
      throw new LanguageLabError(
        "MANAGED_PYTHON_UNAVAILABLE",
        "O ambiente isolado foi criado, mas o Python dele não pôde ser iniciado.",
        { environmentPath: managedPaths.root },
      );
    }

    const installEnvironment = {
      ...process.env,
      PIP_DISABLE_PIP_VERSION_CHECK: "1",
      PIP_NO_INPUT: "1",
      PYTHONNOUSERSITE: "1",
    };
    assertOperationActive(requestId);
    const pipCheck = await runProcessForInstall(
      managedPaths.python,
      ["-m", "pip", "--version"],
      { requestId, ownerId: context.ownerId, timeoutMs: Math.min(timeoutMs, 60_000), env: installEnvironment },
    );
    if (pipCheck.canceled || pipCheck.timedOut) {
      processFailure(pipCheck, "A verificação do instalador Python");
    }
    if (pipCheck.code !== 0) {
      assertOperationActive(requestId);
      const ensurePipResult = await runProcessForInstall(
        managedPaths.python,
        ["-m", "ensurepip", "--upgrade"],
        { requestId, ownerId: context.ownerId, timeoutMs, env: installEnvironment },
      );
      processFailure(ensurePipResult, "A preparação do instalador Python");
    }

    assertOperationActive(requestId);
    context.onProgress?.({
      requestId,
      phase: "installing-whisper",
      message: `Instalando o Whisper ${OPENAI_WHISPER_VERSION} no ambiente isolado…`,
    });
    const installResult = await runProcessForInstall(
      managedPaths.python,
      [
        "-m",
        "pip",
        "install",
        "--upgrade",
        "--no-input",
        "--disable-pip-version-check",
        OPENAI_WHISPER_REQUIREMENT,
      ],
      {
        requestId,
        ownerId: context.ownerId,
        timeoutMs,
        env: installEnvironment,
        onStdoutLine: (line) => {
          if (!line.trim()) return;
          context.onProgress?.({
            requestId,
            phase: "installing-whisper",
            message: "Preparando as dependências da transcrição local…",
          });
        },
      },
    );
    processFailure(installResult, "A instalação do Whisper");
    assertOperationActive(requestId);

    clearEnvironmentCacheForInstall();
    const updatedEnvironment = await detectEnvironmentForInstall({
      refresh: true,
      userDataPath,
    });
    if (
      !updatedEnvironment.python.managed ||
      !updatedEnvironment.whisper.engines.includes("openai-whisper") ||
      updatedEnvironment.whisper.openaiVersion !== OPENAI_WHISPER_VERSION
    ) {
      throw new LanguageLabError(
        "INSTALLATION_NOT_DETECTED",
        "A instalação terminou, mas o Whisper isolado não pôde ser validado.",
        updatedEnvironment,
      );
    }
    context.onProgress?.({
      requestId,
      phase: "completed",
      message: "Whisper instalado com sucesso no ambiente isolado do StudyHub.",
    });
    return {
      requestId,
      package: OPENAI_WHISPER_REQUIREMENT,
      environmentPath: managedPaths.root,
      environment: updatedEnvironment,
    };
  } finally {
    finishOperation(requestId);
  }
}

function binaryToBuffer(value) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (value?.type === "Buffer" && Array.isArray(value.data)) return Buffer.from(value.data);
  throw new LanguageLabError("INVALID_RECORDING", "A gravação enviada está em um formato inválido.");
}

function recordingExtension(fileName, mimeType) {
  const namedExtension = path.extname(String(fileName || "")).toLowerCase();
  if (RECORDING_EXTENSIONS.has(namedExtension)) return namedExtension;
  const mime = String(mimeType || "").toLowerCase().split(";", 1)[0];
  const byMime = {
    "audio/aac": ".aac",
    "audio/flac": ".flac",
    "audio/mp4": ".m4a",
    "audio/mpeg": ".mp3",
    "audio/ogg": ".ogg",
    "audio/opus": ".opus",
    "audio/wav": ".wav",
    "audio/webm": ".webm",
  };
  return byMime[mime] || ".webm";
}

async function transcribeRecording(payload = {}, context = {}) {
  const requestId = normalizeRequestId(payload.requestId, "recording-transcription");
  beginOperation(requestId, context.ownerId);
  let workingDirectory = null;
  try {
    const recording = binaryToBuffer(payload.audioData ?? payload.buffer);
    if (!recording.length) {
      throw new LanguageLabError("EMPTY_RECORDING", "A gravação está vazia.");
    }
    if (recording.length > MAX_RECORDING_BYTES) {
      throw new LanguageLabError("RECORDING_TOO_LARGE", "A gravação excede o limite de 100 MB.");
    }
    assertOperationActive(requestId);
    workingDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), "studyhub-language-recording-"));
    const extension = recordingExtension(payload.fileName, payload.mimeType);
    const recordingPath = path.join(workingDirectory, `recording${extension}`);
    await fsp.writeFile(recordingPath, recording, { flag: "wx" });
    assertOperationActive(requestId);
    const transcript = await transcribeMediaOperation(
      { ...payload, audioData: undefined, buffer: undefined, mediaPath: recordingPath },
      context,
      requestId,
    );
    return {
      ...transcript,
      source: {
        kind: "recording",
        name: path.basename(String(payload.fileName || `shadowing${extension}`)),
        mimeType: String(payload.mimeType || ""),
        bytes: recording.length,
      },
    };
  } finally {
    if (workingDirectory) {
      await fsp.rm(workingDirectory, { recursive: true, force: true }).catch(() => {});
    }
    finishOperation(requestId);
  }
}

function validateClipRange(startValue, endValue) {
  const start = parseTimecode(startValue);
  const end = parseTimecode(endValue);
  if (end <= start) {
    throw new LanguageLabError("INVALID_CLIP_RANGE", "O fim do trecho precisa vir depois do início.");
  }
  if (end - start > MAX_CLIP_SECONDS) {
    throw new LanguageLabError("CLIP_TOO_LONG", "O trecho de áudio pode ter no máximo 10 minutos.");
  }
  return { start, end, duration: end - start };
}

function safeBaseName(filePath) {
  const base = path.basename(filePath, path.extname(filePath));
  return base.replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "trecho";
}

async function extractAudioClip(payload = {}, context = {}) {
  const requestId = normalizeRequestId(payload.requestId, "audio-clip");
  beginOperation(requestId, context.ownerId);
  try {
    return await extractAudioClipOperation(payload, context, requestId);
  } finally {
    finishOperation(requestId);
  }
}

async function extractAudioClipOperation(payload, context, requestId) {
  const selected = await assertReadableFile(payload.mediaPath, "arquivo de mídia");
  assertOperationActive(requestId);
  const range = validateClipRange(payload.start, payload.end);
  const format = CLIP_FORMATS.has(String(payload.format || "").toLowerCase())
    ? String(payload.format).toLowerCase()
    : "mp3";
  const environment = await detectEnvironment({
    refresh: Boolean(payload.refreshEnvironment),
    userDataPath: context.userDataPath,
  });
  assertOperationActive(requestId);
  if (!environment.ffmpeg.available) {
    throw new LanguageLabError("FFMPEG_UNAVAILABLE", "O FFmpeg é necessário para criar o trecho de áudio.");
  }
  const userData = context.app?.getPath?.("userData") || path.join(os.tmpdir(), "studyhub");
  const outputDirectory = path.join(userData, "language-lab", "clips");
  await fsp.mkdir(outputDirectory, { recursive: true });
  const suffix = `${Math.round(range.start * 1000)}-${Math.round(range.end * 1000)}-${crypto.randomUUID().slice(0, 8)}`;
  const outputPath = path.join(outputDirectory, `${safeBaseName(selected.path)}-${suffix}.${format}`);
  const codecArgs = format === "wav"
    ? ["-c:a", "pcm_s16le"]
    : format === "m4a"
      ? ["-c:a", "aac", "-b:a", "128k"]
      : ["-c:a", "libmp3lame", "-q:a", "4"];

  context.onProgress?.({ requestId, phase: "extracting-audio", message: "Criando o trecho de áudio…" });
  try {
    const result = await runProcess(
      environment.ffmpeg.command,
      [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        range.start.toFixed(3),
        "-i",
        selected.path,
        "-t",
        range.duration.toFixed(3),
        "-map",
        "0:a:0",
        "-vn",
        "-ac",
        "1",
        "-ar",
        "44100",
        ...codecArgs,
        "-y",
        outputPath,
      ],
      { requestId, timeoutMs: Math.max(60_000, range.duration * 5000), ownerId: context.ownerId },
    );
    processFailure(result, "A extração de áudio");
    const stats = await fsp.stat(outputPath);
    context.onProgress?.({ requestId, phase: "completed", message: "Trecho de áudio criado." });
    return {
      requestId,
      path: outputPath,
      name: path.basename(outputPath),
      format,
      bytes: stats.size,
      start: roundSeconds(range.start),
      end: roundSeconds(range.end),
      duration: roundSeconds(range.duration),
    };
  } catch (error) {
    await fsp.rm(outputPath, { force: true }).catch(() => {});
    throw error;
  }
}

function emitProgress(event, progress) {
  if (!event?.sender || event.sender.isDestroyed?.()) return;
  event.sender.send(IPC_CHANNELS.progress, progress);
}

function isTrustedMicrophonePermissionRequest(
  details = {},
  mainFrameUrl,
  isTrustedUrl,
) {
  if (typeof isTrustedUrl !== "function") return false;
  const audioOnly =
    details.mediaType === "audio" ||
    (Array.isArray(details.mediaTypes) &&
      details.mediaTypes.length === 1 &&
      details.mediaTypes[0] === "audio");
  // Cross-origin subframes do not receive a requestingUrl in Electron's
  // permission check. Requiring both fields prevents a frame from inheriting
  // the trusted top-level URL through a fallback.
  return (
    audioOnly &&
    details.isMainFrame === true &&
    Boolean(details.requestingUrl) &&
    isTrustedUrl(details.requestingUrl) &&
    Boolean(mainFrameUrl) &&
    isTrustedUrl(mainFrameUrl)
  );
}

function isTrustedFullscreenPermissionRequest(
  details = {},
  requestingOrigin,
  mainFrameUrl,
  isTrustedUrl,
) {
  if (
    typeof isTrustedUrl !== "function" ||
    !mainFrameUrl ||
    !isTrustedUrl(mainFrameUrl)
  ) {
    return false;
  }
  if (details.isMainFrame === true) {
    return Boolean(details.requestingUrl) && isTrustedUrl(details.requestingUrl);
  }
  if (details.isMainFrame !== false) return false;

  // Embedded players such as YouTube may request fullscreen from their HTTPS
  // iframe. They are allowed only while embedded by StudyHub's trusted top
  // frame; media capture remains main-frame-only above.
  const frameUrl = details.requestingUrl || requestingOrigin;
  let parsedFrame;
  try {
    parsedFrame = new URL(frameUrl || "");
  } catch {
    return false;
  }
  if (parsedFrame.protocol !== "https:") return false;

  if (details.embeddingOrigin) {
    try {
      const topLevel = new URL(mainFrameUrl);
      const embedding = new URL(details.embeddingOrigin);
      if (topLevel.protocol === "file:") {
        if (embedding.protocol !== "file:") return false;
      } else if (embedding.origin !== topLevel.origin) {
        return false;
      }
    } catch {
      return false;
    }
  }
  return true;
}

function trustedSender(event, app, authorizeSender) {
  if (typeof authorizeSender === "function") return Boolean(authorizeSender(event));
  const sourceUrl = event?.senderFrame?.url || event?.sender?.getURL?.() || "";
  let parsed;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    return false;
  }

  if (!app.isPackaged) {
    return parsed.protocol === "http:"
      && ["127.0.0.1", "localhost"].includes(parsed.hostname)
      && parsed.port === "5173";
  }
  if (parsed.protocol !== "file:") return false;
  let senderPath = decodeURIComponent(parsed.pathname || "");
  if (/^\/[A-Za-z]:\//.test(senderPath)) senderPath = senderPath.slice(1);
  const rendererRoot = path.resolve(app.getAppPath(), "dist");
  const resolvedSenderPath = path.resolve(senderPath);
  return resolvedSenderPath === rendererRoot || resolvedSenderPath.startsWith(`${rendererRoot}${path.sep}`);
}

function serializeIpcError(error) {
  return {
    code: error?.code || "LANGUAGE_LAB_ERROR",
    message: error?.message || "Não foi possível concluir a operação.",
    ...(error?.details !== undefined ? { details: error.details } : {}),
  };
}

async function ipcResult(handler) {
  try {
    return { ok: true, value: await handler() };
  } catch (error) {
    return { ok: false, error: serializeIpcError(error) };
  }
}

function registerLanguageLabIpc({ ipcMain, app, authorizeSender, services = {} }) {
  if (!ipcMain?.handle || !app?.getPath) {
    throw new TypeError("registerLanguageLabIpc requer ipcMain e app do Electron.");
  }
  const userDataPath = path.resolve(app.getPath("userData"));
  const languageLabServices = {
    detectEnvironment: services.detectEnvironment || detectEnvironment,
    extractAudioClip: services.extractAudioClip || extractAudioClip,
    installWhisper: services.installWhisper || installWhisper,
    transcribeMedia: services.transcribeMedia || transcribeMedia,
    transcribeRecording: services.transcribeRecording || transcribeRecording,
  };
  const register = (channel, handler) => {
    ipcMain.handle(channel, (event, payload) => ipcResult(async () => {
      if (!trustedSender(event, app, authorizeSender)) {
        throw new LanguageLabError("UNTRUSTED_SENDER", "Esta janela não pode usar o laboratório de idiomas.");
      }
      return handler(event, payload);
    }));
  };
  const observedSenders = new WeakSet();
  const processContext = (event, extra = {}) => {
    const sender = event.sender;
    const ownerId = sender.id;
    if (!observedSenders.has(sender)) {
      observedSenders.add(sender);
      sender.once?.("destroyed", () => cancelRequestsForOwner(ownerId));
    }
    return {
      app,
      userDataPath,
      ...extra,
      ownerId,
      onProgress: (progress) => emitProgress(event, progress),
    };
  };

  register(IPC_CHANNELS.environment, (_event, payload = {}) =>
    languageLabServices.detectEnvironment({
      refresh: Boolean(payload?.refresh),
      userDataPath,
    }));
  register(IPC_CHANNELS.installWhisper, (event, payload = {}) =>
    languageLabServices.installWhisper(payload, processContext(event)));
  register(IPC_CHANNELS.importTranscript, (_event, payload) =>
    importTranscriptFile(typeof payload === "string" ? payload : payload?.path));
  register(IPC_CHANNELS.transcribeMedia, (event, payload) =>
    languageLabServices.transcribeMedia(payload, processContext(event)));
  register(IPC_CHANNELS.transcribeRecording, (event, payload) =>
    languageLabServices.transcribeRecording(payload, processContext(event)));
  register(IPC_CHANNELS.extractAudio, (event, payload) =>
    languageLabServices.extractAudioClip(payload, processContext(event)));
  register(IPC_CHANNELS.cancel, (event, payload) => ({
    canceled: cancelRequest(
      typeof payload === "string" ? payload : payload?.requestId,
      event.sender.id,
    ),
  }));
  app.once?.("before-quit", cancelAllRequests);
}

module.exports = {
  IPC_CHANNELS,
  LanguageLabError,
  OPENAI_WHISPER_REQUIREMENT,
  binaryToBuffer,
  cancelAllRequests,
  cancelRequest,
  clearEnvironmentCache,
  detectEnvironment,
  extractAudioClip,
  findPython,
  getManagedWhisperPaths,
  importTranscriptFile,
  installWhisper,
  isTrustedFullscreenPermissionRequest,
  isTrustedMicrophonePermissionRequest,
  normalizeLocalFileInput,
  parseSrt,
  parseTimecode,
  parseTranscriptJson,
  parseVtt,
  registerLanguageLabIpc,
  serializeIpcError,
  transcribeMedia,
  transcribeRecording,
  validateClipRange,
  validateTranscriptionOptions,
};
