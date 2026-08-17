"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const {
  IPC_CHANNELS,
  LanguageLabError,
  OPENAI_WHISPER_REQUIREMENT,
  binaryToBuffer,
  cancelRequest,
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
  transcribeMedia,
  validateClipRange,
  validateTranscriptionOptions,
} = require("./index.cjs");

function runExecutable(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, shell: false, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.once("error", reject);
    child.once("close", (code) => code === 0
      ? resolve()
      : reject(new Error(stderr || `Process exited with ${code}`)));
  });
}

test("parseTimecode aceita timestamps SRT, VTT e segundos", () => {
  assert.equal(parseTimecode("01:02:03,456"), 3723.456);
  assert.equal(parseTimecode("02:03.250"), 123.25);
  assert.equal(parseTimecode("7.5"), 7.5);
  assert.throws(() => parseTimecode("00:00:60.000"), LanguageLabError);
  assert.throws(() => parseTimecode(-1), LanguageLabError);
});

test("parseSrt preserva sincronização e limpa marcação das legendas", () => {
  const transcript = parseSrt(`
1
00:00:01,250 --> 00:00:03,500
<i>Hello</i> &amp; welcome!

2
00:00:04,000 --> 00:00:05,100
Second line
continues here.
`);

  assert.equal(transcript.format, "srt");
  assert.equal(transcript.duration, 5.1);
  assert.deepEqual(transcript.segments, [
    { id: "1", start: 1.25, end: 3.5, text: "Hello & welcome!" },
    { id: "2", start: 4, end: 5.1, text: "Second line continues here." },
  ]);
  assert.equal(transcript.text, "Hello & welcome! Second line continues here.");
});

test("parseVtt ignora cabeçalho, notas e configurações de posicionamento", () => {
  const transcript = parseVtt(`WEBVTT - StudyHub
Language: en

NOTE generated automatically
this block is not a cue

intro
00:00.000 --> 00:02.400 position:10% align:start
<v Teacher>Good morning.</v>

00:02.500 --> 00:04.000
How are you?
`);

  assert.equal(transcript.format, "vtt");
  assert.equal(transcript.segments.length, 2);
  assert.deepEqual(transcript.segments[0], {
    id: "intro",
    start: 0,
    end: 2.4,
    text: "Good morning.",
  });
  assert.equal(transcript.segments[1].text, "How are you?");
});

test("parseTranscriptJson normaliza segmentos Whisper e palavras", () => {
  const transcript = parseTranscriptJson({
    language: "en",
    text: "Hello world",
    segments: [
      {
        id: 7,
        startMs: 500,
        endMs: 1800,
        text: " Hello world ",
        words: [
          { start: 0.5, end: 0.9, word: "Hello", probability: 0.98 },
          { start: 1, end: 1.8, word: "world", probability: 0.91 },
        ],
      },
    ],
  });

  assert.equal(transcript.language, "en");
  assert.equal(transcript.duration, 1.8);
  assert.equal(transcript.segments[0].id, "7");
  assert.deepEqual(transcript.segments[0].words[1], {
    id: "2",
    start: 1,
    end: 1.8,
    text: "world",
    probability: 0.91,
  });
});

test("parseTranscriptJson aceita uma lista com duração", () => {
  const transcript = parseTranscriptJson(JSON.stringify([
    { start: "00:01.000", duration: 2.5, caption: "A phrase" },
  ]));
  assert.deepEqual(transcript.segments[0], {
    id: "1",
    start: 1,
    end: 3.5,
    text: "A phrase",
  });
});

test("parseTranscriptJson migra o formato legado com apenas time e text", () => {
  const transcript = parseTranscriptJson([
    { time: 1, text: "First" },
    { time: 4, text: "Second" },
  ]);
  assert.deepEqual(transcript.segments, [
    { id: "1", start: 1, end: 4, text: "First" },
    { id: "2", start: 4, end: 6, text: "Second" },
  ]);
});

test("parseTranscriptJson ignora campos em milissegundos nulos ou vazios", () => {
  const transcript = parseTranscriptJson([
    { startMs: null, start: 1, end: 3, text: "Start fallback" },
    { start: 4, endMs: "", end: 6, text: "End fallback" },
    { start: 7, durationMs: null, duration: 2, text: "Duration fallback" },
  ]);
  assert.deepEqual(
    transcript.segments.map(({ start, end }) => ({ start, end })),
    [
      { start: 1, end: 3 },
      { start: 4, end: 6 },
      { start: 7, end: 9 },
    ],
  );
});

test("parsers rejeitam arquivos sem trechos sincronizados válidos", () => {
  assert.throws(() => parseSrt("not a subtitle"), (error) => error.code === "EMPTY_TRANSCRIPT");
  assert.throws(
    () => parseTranscriptJson('{"text":"missing segments"}'),
    (error) => error.code === "INVALID_TRANSCRIPT_JSON",
  );
});

test("binaryToBuffer aceita ArrayBuffer e views sem incluir bytes vizinhos", () => {
  const source = Uint8Array.from([9, 1, 2, 3, 9]);
  assert.deepEqual([...binaryToBuffer(source.subarray(1, 4))], [1, 2, 3]);
  assert.deepEqual([...binaryToBuffer(Uint8Array.from([4, 5]).buffer)], [4, 5]);
});

test("validateClipRange limita e normaliza o trecho A–B", () => {
  assert.deepEqual(validateClipRange("00:01.250", "00:03.750"), {
    start: 1.25,
    end: 3.75,
    duration: 2.5,
  });
  assert.throws(() => validateClipRange(5, 5), (error) => error.code === "INVALID_CLIP_RANGE");
  assert.throws(() => validateClipRange(0, 601), (error) => error.code === "CLIP_TOO_LONG");
});

test("importTranscriptFile funciona com caminhos que contêm espaços e acentos", async () => {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "studyhub-legenda-áudio "));
  const filePath = path.join(directory, "lição número 1.srt");
  try {
    await fsp.writeFile(filePath, "1\n00:00:00,000 --> 00:00:01,000\nOlá!\n", "utf8");
    const transcript = await importTranscriptFile(filePath);
    assert.equal(transcript.source.path, path.resolve(filePath));
    assert.equal(transcript.segments[0].text, "Olá!");
  } finally {
    await fsp.rm(directory, { recursive: true, force: true });
  }
});

test("normaliza URLs locais sem perder cerquilha ou porcentagem", () => {
  assert.equal(
    normalizeLocalFileInput("safe-file:///C%3A/Aulas/Aula%20%231%2050%25.mp4"),
    "C:/Aulas/Aula #1 50%.mp4",
  );
  assert.equal(
    normalizeLocalFileInput("safe-file://local/C%3A/Aulas/Aula%20%231%2050%25.mp4"),
    "C:/Aulas/Aula #1 50%.mp4",
  );
  assert.equal(
    normalizeLocalFileInput("file:///C:/Aulas/Aula #1.mp4"),
    "C:/Aulas/Aula #1.mp4",
  );
  assert.throws(() => normalizeLocalFileInput("https://example.com/aula.mp4"), /arquivo local/i);
});

test("cancelamento alcança a transcrição ainda durante a preparação", async () => {
  const requestId = "cancel-during-preflight";
  const ownerId = 4242;
  const pending = transcribeMedia(
    { requestId, mediaPath: __filename },
    { ownerId, userDataPath: os.tmpdir() },
  );
  assert.equal(cancelRequest(requestId, ownerId), true);
  await assert.rejects(pending, (error) => error.code === "CANCELED");
});

test("modelos e tarefas são validados por mecanismo Whisper", () => {
  const environment = {
    whisper: {
      engine: "openai-whisper",
      engines: ["openai-whisper", "faster-whisper"],
    },
  };
  assert.throws(
    () => validateTranscriptionOptions({ model: "distil-large-v3" }, environment),
    (error) => error.code === "MODEL_UNAVAILABLE_FOR_ENGINE",
  );
  assert.throws(
    () => validateTranscriptionOptions({ model: "base.en", task: "translate" }, environment),
    (error) => error.code === "UNSUPPORTED_TRANSLATION_MODEL",
  );
  assert.equal(
    validateTranscriptionOptions(
      { model: "distil-large-v3", engine: "faster-whisper" },
      environment,
    ).engine,
    "faster-whisper",
  );
});

test("microfone exige áudio, URL explícita confiável e frame principal", () => {
  const studyHubUrl = "http://127.0.0.1:5173/lesson";
  const trustedUrl = (value) => {
    try {
      return new URL(value).origin === "http://127.0.0.1:5173";
    } catch {
      return false;
    }
  };
  assert.equal(
    isTrustedMicrophonePermissionRequest(
      { requestingUrl: studyHubUrl, isMainFrame: true, mediaType: "audio" },
      studyHubUrl,
      trustedUrl,
    ),
    true,
  );
  assert.equal(
    isTrustedMicrophonePermissionRequest(
      { isMainFrame: true, mediaType: "audio" },
      studyHubUrl,
      trustedUrl,
    ),
    false,
  );
  assert.equal(
    isTrustedMicrophonePermissionRequest(
      { requestingUrl: "https://example.com", isMainFrame: false, mediaType: "audio" },
      studyHubUrl,
      trustedUrl,
    ),
    false,
  );
  assert.equal(
    isTrustedMicrophonePermissionRequest(
      { requestingUrl: studyHubUrl, isMainFrame: true, mediaTypes: ["audio", "video"] },
      studyHubUrl,
      trustedUrl,
    ),
    false,
  );
  assert.equal(
    isTrustedMicrophonePermissionRequest(
      { requestingUrl: studyHubUrl, isMainFrame: true, mediaType: "video" },
      studyHubUrl,
      trustedUrl,
    ),
    false,
  );
});

test("fullscreen mantém player HTTPS embutido sem ampliar permissão de origem", () => {
  const studyHubUrl = "http://127.0.0.1:5173/lesson";
  const trustedUrl = (value) => {
    try {
      return new URL(value).origin === "http://127.0.0.1:5173";
    } catch {
      return false;
    }
  };
  assert.equal(
    isTrustedFullscreenPermissionRequest(
      { requestingUrl: studyHubUrl, isMainFrame: true },
      studyHubUrl,
      studyHubUrl,
      trustedUrl,
    ),
    true,
  );
  assert.equal(
    isTrustedFullscreenPermissionRequest(
      {
        isMainFrame: false,
        embeddingOrigin: "http://127.0.0.1:5173",
      },
      "https://www.youtube.com",
      studyHubUrl,
      trustedUrl,
    ),
    true,
  );
  assert.equal(
    isTrustedFullscreenPermissionRequest(
      { requestingUrl: "http://example.com/player", isMainFrame: false },
      "http://example.com",
      studyHubUrl,
      trustedUrl,
    ),
    false,
  );
  assert.equal(
    isTrustedFullscreenPermissionRequest(
      {
        requestingUrl: "https://www.youtube.com/embed/id",
        isMainFrame: false,
        embeddingOrigin: "https://evil.example",
      },
      "https://www.youtube.com",
      studyHubUrl,
      trustedUrl,
    ),
    false,
  );
  assert.equal(
    isTrustedFullscreenPermissionRequest(
      { requestingUrl: "https://www.youtube.com/embed/id", isMainFrame: false },
      "https://www.youtube.com",
      "https://evil.example/app",
      trustedUrl,
    ),
    false,
  );
});

test("findPython prioriza o executável do ambiente gerenciado", async () => {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "studyhub-managed-python-"));
  const managedPaths = getManagedWhisperPaths(directory);
  try {
    await fsp.mkdir(path.dirname(managedPaths.python), { recursive: true });
    try {
      await fsp.link(process.execPath, managedPaths.python);
    } catch {
      await fsp.copyFile(process.execPath, managedPaths.python);
    }
    const python = await findPython({ userDataPath: directory });
    assert.equal(python.available, true);
    assert.equal(python.managed, true);
    assert.equal(path.resolve(python.command), path.resolve(managedPaths.python));
  } finally {
    await fsp.rm(directory, { recursive: true, force: true });
  }
});

test("installWhisper cria venv privado, usa pacote fixado e preserva requestId", async () => {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "studyhub-whisper-install-"));
  const managedPaths = getManagedWhisperPaths(directory);
  const calls = [];
  const detectedOptions = [];
  let detectionCount = 0;
  let cacheCleared = false;
  const basePython = {
    available: true,
    command: "python-test",
    prefixArgs: ["-3"],
    version: "3.12.10",
    managed: false,
    recommendedCompatible: true,
    recommendedRange: "3.9-3.12",
  };
  const installedEnvironment = {
    ready: true,
    python: {
      ...basePython,
      command: managedPaths.python,
      prefixArgs: [],
      managed: true,
      managedEnvironmentPath: managedPaths.root,
    },
    whisper: {
      available: true,
      engines: ["openai-whisper"],
      openaiVersion: OPENAI_WHISPER_REQUIREMENT.split("==")[1],
    },
  };
  const dependencies = {
    async detectEnvironment(options) {
      detectedOptions.push(options);
      detectionCount += 1;
      return detectionCount === 1
        ? { ready: false, python: basePython, whisper: { available: false, engines: [] } }
        : installedEnvironment;
    },
    async findPython(options) {
      assert.equal(options.includeManaged, false);
      return basePython;
    },
    async probeExecutable(command) {
      return { command, output: "Python 3.12.10" };
    },
    async runProcess(command, args, options) {
      calls.push({ command, args, options });
      return {
        code: 0,
        signal: null,
        stdout: "",
        stderr: "",
        canceled: false,
        timedOut: false,
      };
    },
    clearEnvironmentCache() {
      cacheCleared = true;
    },
  };

  try {
    const result = await installWhisper(
      { requestId: "install-managed-test" },
      { userDataPath: directory, ownerId: 77 },
      dependencies,
    );
    assert.equal(result.environmentPath, managedPaths.root);
    assert.equal(result.package, OPENAI_WHISPER_REQUIREMENT);
    assert.equal(cacheCleared, true);
    assert.equal(detectedOptions.length, 2);
    assert.ok(detectedOptions.every((options) => options.userDataPath === path.resolve(directory)));
    assert.ok(calls.every((call) => call.options.requestId === "install-managed-test"));
    assert.deepEqual(calls[0].args.slice(-3), ["venv", "--clear", managedPaths.root]);
    const installCall = calls.find((call) => call.args.includes("install"));
    assert.ok(installCall);
    assert.equal(installCall.command, managedPaths.python);
    assert.ok(installCall.args.includes(OPENAI_WHISPER_REQUIREMENT));
    assert.equal(installCall.args.includes("openai-whisper"), false);
  } finally {
    await fsp.rm(directory, { recursive: true, force: true });
  }
});

test("IPC injeta app e userDataPath em todas as operações locais", async () => {
  const handlers = new Map();
  const contexts = [];
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "studyhub-ipc-user-data-"));
  const services = {
    async detectEnvironment(options) {
      contexts.push({ kind: "environment", options });
      return { ready: false };
    },
    async installWhisper(_payload, context) {
      contexts.push({ kind: "install", context });
      return { installed: true };
    },
    async transcribeMedia(_payload, context) {
      contexts.push({ kind: "media", context });
      return { transcribed: true };
    },
    async transcribeRecording(_payload, context) {
      contexts.push({ kind: "recording", context });
      return { transcribed: true };
    },
    async extractAudioClip(_payload, context) {
      contexts.push({ kind: "clip", context });
      return { extracted: true };
    },
  };
  const ipcMain = {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
  };
  const app = {
    isPackaged: false,
    getPath: () => directory,
    getAppPath: () => process.cwd(),
    once() {},
  };
  const event = {
    senderFrame: { url: "http://127.0.0.1:5173/" },
    sender: {
      id: 91,
      getURL: () => "http://127.0.0.1:5173/",
      send() {},
      once() {},
      isDestroyed: () => false,
    },
  };
  try {
    registerLanguageLabIpc({ ipcMain, app, services });
    await handlers.get(IPC_CHANNELS.environment)(event, { refresh: true });
    await handlers.get(IPC_CHANNELS.installWhisper)(event, { requestId: "install" });
    await handlers.get(IPC_CHANNELS.transcribeMedia)(event, { requestId: "media" });
    await handlers.get(IPC_CHANNELS.transcribeRecording)(event, { requestId: "recording" });
    await handlers.get(IPC_CHANNELS.extractAudio)(event, { requestId: "clip" });

    assert.equal(contexts.length, 5);
    assert.equal(contexts[0].options.userDataPath, path.resolve(directory));
    for (const { context } of contexts.slice(1)) {
      assert.equal(context.userDataPath, path.resolve(directory));
      assert.equal(context.app, app);
      assert.equal(context.ownerId, 91);
    }
  } finally {
    await fsp.rm(directory, { recursive: true, force: true });
  }
});

test("IPC devolve erros serializáveis e rejeita renderers externos", async () => {
  const handlers = new Map();
  let beforeQuitHandler = null;
  const ipcMain = {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
  };
  const app = {
    isPackaged: false,
    getPath: () => os.tmpdir(),
    getAppPath: () => process.cwd(),
    once(event, handler) {
      if (event === "before-quit") beforeQuitHandler = handler;
    },
  };
  registerLanguageLabIpc({ ipcMain, app });
  assert.equal(handlers.size, Object.keys(IPC_CHANNELS).length - 1);
  assert.equal(typeof beforeQuitHandler, "function");

  const trustedEvent = {
    senderFrame: { url: "http://127.0.0.1:5173/" },
    sender: { id: 10, getURL: () => "http://127.0.0.1:5173/", send() {}, isDestroyed: () => false },
  };
  const missing = await handlers.get(IPC_CHANNELS.importTranscript)(trustedEvent, {
    path: path.join(os.tmpdir(), "studyhub-file-that-does-not-exist.srt"),
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, "FILE_NOT_FOUND");

  const untrustedEvent = {
    senderFrame: { url: "https://example.com/" },
    sender: { id: 20, getURL: () => "https://example.com/" },
  };
  const rejected = await handlers.get(IPC_CHANNELS.cancel)(untrustedEvent, "anything");
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, "UNTRUSTED_SENDER");
});

test("detectEnvironment encontra o FFmpeg distribuído com o aplicativo", async () => {
  const environment = await detectEnvironment({ refresh: true });
  assert.equal(environment.ffmpeg.available, true);
  assert.match(path.basename(environment.ffmpeg.command), /^ffmpeg(?:\.exe)?$/i);
  assert.equal(environment.clipExtractionReady, true);
});

test("extractAudioClip cria um trecho persistente com timestamps A–B", async () => {
  const environment = await detectEnvironment();
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "studyhub-clip-áudio "));
  const sourcePath = path.join(directory, "fonte de áudio.wav");
  try {
    await runExecutable(environment.ffmpeg.command, [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=3",
      "-y",
      sourcePath,
    ]);
    const clip = await extractAudioClip(
      { mediaPath: sourcePath, start: 0.5, end: 1.5, format: "wav" },
      { app: { getPath: () => directory } },
    );
    assert.equal(clip.duration, 1);
    assert.equal(path.extname(clip.path), ".wav");
    assert.ok((await fsp.stat(clip.path)).size > 1000);
  } finally {
    await fsp.rm(directory, { recursive: true, force: true });
  }
});
