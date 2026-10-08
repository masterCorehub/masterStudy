if (process.env.ELECTRON_RUN_AS_NODE === "1") {
  const { spawn } = require("node:child_process");
  const childEnv = { ...process.env };
  delete childEnv.ELECTRON_RUN_AS_NODE;
  delete childEnv.ELECTRON_NO_ATTACH_CONSOLE;
  const child = spawn(process.execPath, process.argv.slice(1), {
    stdio: "inherit",
    env: childEnv,
  });
  child.on("close", (code) => process.exit(code ?? 0));
  return;
}

const {
  app,
  BrowserWindow,
  clipboard,
  desktopCapturer,
  Menu,
  Notification,
  nativeImage,
  nativeTheme,
  screen,
  Tray,
  globalShortcut,
  ipcMain,
  dialog,
  net,
  protocol,
  session,
  shell,
  systemPreferences,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { execFile, spawn } = require("node:child_process");
const { promisify } = require("node:util");
const { pathToFileURL } = require("node:url");
const { registerCodeLabIpc } = require("./code-lab/index.cjs");
const { registerAcademicAiIpc } = require("./academic-ai/index.cjs");
const { createSpotifyService } = require("./spotify.cjs");
const { createTranslatorService } = require("./translator/index.cjs");
const {
  saveState,
  loadState,
  closeDatabase,
} = require("./storage/study-db.cjs");
const {
  isTrustedFullscreenPermissionRequest,
  isTrustedMicrophonePermissionRequest,
  registerLanguageLabIpc,
} = require("./language-lab/index.cjs");

const spotify = createSpotifyService({ app, shell, BrowserWindow });

// Native Wayland only exposes system-wide shortcuts through the XDG Desktop
// Portal. Do not enable the portal when the user explicitly selects X11: in
// that mode Electron can register shortcuts directly with X11/XWayland.
const explicitlyUsesX11 = process.argv.some(
  (argument) => argument === "--ozone-platform=x11",
);
if (
  process.platform === "linux" &&
  process.env.XDG_SESSION_TYPE === "wayland" &&
  !explicitlyUsesX11
) {
  const enabledFeatures = app.commandLine.getSwitchValue("enable-features");
  const features = new Set(
    enabledFeatures
      .split(",")
      .map((feature) => feature.trim())
      .filter(Boolean),
  );
  features.add("GlobalShortcutsPortal");
  app.commandLine.appendSwitch("enable-features", [...features].join(","));
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: "safe-file",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);
app.enableSandbox();

const isDev = !app.isPackaged;

// Keep development isolated from the installed masterStudy application. Electron's
// single-instance lock is tied to the user-data directory; sharing it caused
// `npm run dev` to exit silently whenever the packaged app was still in the
// menu bar. A separate profile also prevents development settings from
// overwriting the user's installed-app data.
if (isDev) {
  app.setPath(
    "userData",
    path.join(app.getPath("appData"), "StudyHub-development"),
  );
}

// Preserva o diretório do perfil existente antes de mudar o nome visível.
// Renomear o processo não deve mudar a localização das notas e configurações.
const legacyProfileCandidates = ["studyhub-desktop", "StudyHub"].map(
  name => path.join(app.getPath("appData"), name),
);
// Perfis explícitos permitem testes isolados sem abrir os dados da instalação.
const explicitUserDataPath = app.commandLine.getSwitchValue("user-data-dir");
const legacyUserDataPath = explicitUserDataPath && path.isAbsolute(explicitUserDataPath) ? explicitUserDataPath : isDev ? app.getPath("userData")
  : legacyProfileCandidates.find(profile => fs.existsSync(profile)) || legacyProfileCandidates[0];
app.setName("masterStudy");
app.setPath("userData", legacyUserDataPath);

const execFileAsync = promisify(execFile);
const APP_ICON_PATH = path.join(__dirname, "assets", "studyhub-icon.png");
const MAC_TRAY_ICON_PATH = path.join(__dirname, "assets", "studyhub-tray-template.svg");
const DEFAULT_QUICK_NOTE_SHORTCUT = "CommandOrControl+Shift+Alt+1";
const DEFAULT_QUICK_DRAW_SHORTCUT = "CommandOrControl+Shift+Alt+2";
const DEFAULT_TRANSLATOR_TEXT_SHORTCUT = "CommandOrControl+Shift+Alt+3";
const DEFAULT_TRANSLATOR_OCR_SHORTCUT = "CommandOrControl+Shift+Alt+4";
const DEFAULT_AI_FLASHCARD_SHORTCUT = "CommandOrControl+Shift+Alt+5";
const DEFAULT_STICKY_NOTES_SHORTCUT = "CommandOrControl+Shift+Alt+6";
let quickNoteWindow = null;
let noteSearchWindow = null;
let commandPaletteWindow = null;
let quickDrawWindow = null;
let aiFlashcardWindow = null;
const whiteboardWindows = new Map();
const readerWindows = new Map();
const stickyNoteWindows = new Map();
let translatorWindow = null;
let translatorCaptureWindow = null;
let mainWindow = null;
let pomodoroWidgetWindow = null;
let trayPopoverWindow = null;
const internalBrowserWindows = new Set();
let tray = null;
let isQuitting = false;
let lastPomodoroNotificationId = null;
let quickNoteShortcut = DEFAULT_QUICK_NOTE_SHORTCUT;
let quickDrawShortcut = DEFAULT_QUICK_DRAW_SHORTCUT;
let translatorTextShortcut = DEFAULT_TRANSLATOR_TEXT_SHORTCUT;
let translatorOcrShortcut = DEFAULT_TRANSLATOR_OCR_SHORTCUT;
let aiFlashcardShortcut = DEFAULT_AI_FLASHCARD_SHORTCUT;
let stickyNotesShortcut = DEFAULT_STICKY_NOTES_SHORTCUT;

function requestAppQuit() {
  if (isQuitting) return;
  isQuitting = true;
  app.quit();
}
let translatorService = null;
let translatorCapture = null;
let lastTranslatorImage = null;
let translatorOperationId = 0;
let returnToTranslatorAfterCapture = false;
let translatorCaptureMode = "frozen";
const UTILITY_WINDOW_TYPE = {
  QUICK_NOTE: "quick-note",
  QUICK_DRAW: "quick-draw",
  AI_FLASHCARD: "ai-flashcard",
  TRANSLATOR: "translator",
  TRANSLATOR_CAPTURE: "translator-capture",
  COMMAND_PALETTE: "command-palette",
};

const DEFAULT_TRANSLATOR_SESSION = Object.freeze({
  mode: "text",
  status: "idle",
  sourceText: "",
  ocrText: "",
  translatedText: "",
  sourceLanguage: "auto",
  targetLanguage: "pt",
  detectedLanguage: "",
  progressMessage: "",
  error: null,
});

let translatorSession = { ...DEFAULT_TRANSLATOR_SESSION };

const grantedFilePaths = new Set();
const grantedDirectoryPaths = new Set();
const LOCAL_FILE_EXTENSIONS = new Set([
  ".aac", ".avi", ".bmp", ".csv", ".doc", ".docx", ".epub", ".gif",
  ".jpeg", ".jpg", ".json", ".m4a", ".mkv", ".mov", ".mp3", ".mp4",
  ".odt", ".ogg", ".pdf", ".png", ".ppt", ".pptx", ".srt", ".svg",
  ".text", ".txt", ".wav", ".webm", ".webp", ".xlsx", ".xls", ".zip",
]);
const MAX_RENDERER_FILE_READ_BYTES = 100 * 1024 * 1024;

function pathKey(value) {
  const resolved = path.resolve(String(value || ""));
  let canonical = resolved;
  try {
    canonical = fs.realpathSync.native(resolved);
  } catch {
    // Keep the resolved path so a missing file produces a useful error later.
  }
  return process.platform === "win32" ? canonical.toLowerCase() : canonical;
}

function pathGrantsFile() {
  return path.join(app.getPath("userData"), "local-file-grants.json");
}

function persistPathGrants() {
  try {
    fs.writeFileSync(
      pathGrantsFile(),
      JSON.stringify({
        files: [...grantedFilePaths].slice(-2000),
        directories: [...grantedDirectoryPaths].slice(-200),
      }),
      { encoding: "utf8", mode: 0o600 },
    );
  } catch (error) {
    console.error("Could not persist local file grants:", error);
  }
}

function loadPathGrants() {
  try {
    const saved = JSON.parse(fs.readFileSync(pathGrantsFile(), "utf8"));
    for (const filePath of Array.isArray(saved.files) ? saved.files : []) {
      grantedFilePaths.add(pathKey(filePath));
    }
    for (const directoryPath of Array.isArray(saved.directories) ? saved.directories : []) {
      grantedDirectoryPaths.add(pathKey(directoryPath));
    }
  } catch (error) {
    if (error?.code !== "ENOENT") console.error("Could not load local file grants:", error);
  }
}

function grantLocalPath(value, isDirectory = false) {
  const key = pathKey(value);
  (isDirectory ? grantedDirectoryPaths : grantedFilePaths).add(key);
  persistPathGrants();
  return key;
}

function isGrantedLocalPath(value) {
  const key = pathKey(value);
  if (grantedFilePaths.has(key) || grantedDirectoryPaths.has(key)) return true;
  return [...grantedDirectoryPaths].some((directory) => {
    const relative = path.relative(directory, key);
    return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
  });
}

function assertGrantedLocalPath(value, { forBinaryRead = false } = {}) {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) {
    throw new Error("Caminho local inválido.");
  }
  const resolved = pathKey(value);
  if (!isGrantedLocalPath(resolved)) {
    const error = new Error("Selecione novamente este arquivo para autorizar o acesso neste dispositivo.");
    error.code = "LOCAL_FILE_NOT_GRANTED";
    throw error;
  }
  const stats = fs.statSync(resolved);
  if (stats.isFile()) {
    if (!LOCAL_FILE_EXTENSIONS.has(path.extname(resolved).toLowerCase())) {
      throw new Error("Este tipo de arquivo não pode ser aberto pelo masterStudy.");
    }
    if (forBinaryRead && stats.size > MAX_RENDERER_FILE_READ_BYTES) {
      throw new Error("O arquivo excede o limite de leitura de 100 MB.");
    }
  } else if (!stats.isDirectory()) {
    throw new Error("O caminho selecionado não é um arquivo ou pasta.");
  }
  return resolved;
}

function normalizeExternalUrl(value) {
  const parsed = new URL(String(value || ""));
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("Link externo não permitido.");
  }
  if (parsed.href.length > 4096) throw new Error("Link externo inválido.");
  return parsed.href;
}

ipcMain.handle("app:openExternal", async (event, url) => {
  assertTrustedRenderer(event);
  const targetUrl = normalizeExternalUrl(url);
  const parent = getSenderWindow(event);
  const browserWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 640,
    minHeight: 480,
    parent: parent && !parent.isDestroyed() ? parent : undefined,
    title: "masterStudy — Navegador interno",
    backgroundColor: "#f8fafc",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  internalBrowserWindows.add(browserWindow);
  browserWindow.setMenuBarVisibility(false);
  browserWindow.webContents.setWindowOpenHandler(({ url: openedUrl }) => {
    try {
      browserWindow.loadURL(normalizeExternalUrl(openedUrl));
    } catch {
      // Unsupported protocols stay blocked.
    }
    return { action: "deny" };
  });
  browserWindow.on("closed", () => internalBrowserWindows.delete(browserWindow));
  await browserWindow.loadURL(targetUrl);
  return { openedInApp: true };
});

let nativeSpeechProcess = null;
let speechGeneration = 0;
let nativeSpeechPaused = false;

function stopNativeSpeech() {
  if (nativeSpeechProcess) {
    // A suspended process must resume before it can handle termination.
    if (nativeSpeechPaused && process.platform !== "win32") nativeSpeechProcess.kill("SIGCONT");
    nativeSpeechProcess.kill();
  }
  nativeSpeechProcess = null;
  nativeSpeechPaused = false;
}
let kokoroModelPromise = null;

async function generateKokoroSpeech(text, language) {
  if (!String(language || "").toLowerCase().startsWith("en")) return null;
  if (!kokoroModelPromise) {
    kokoroModelPromise = import("kokoro-js").then(({ KokoroTTS }) =>
      KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
        dtype: "q8",
        device: "cpu",
      }),
    ).catch((error) => {
      kokoroModelPromise = null;
      throw error;
    });
  }
  const tts = await kokoroModelPromise;
  const voice = String(language || "").toLowerCase().startsWith("en-gb") ? "bf_emma" : "af_heart";
  const audio = await tts.generate(text.slice(0, 3000), { voice, speed: 0.95 });
  return Buffer.from(audio.toWav()).toString("base64");
}

ipcMain.handle("translator:speak", async (event, payload = {}) => {
  assertTrustedRenderer(event);
  const text = String(payload.text || "").trim();
  if (!text) return { ok: false, error: "Texto vazio." };
  const requestGeneration = ++speechGeneration;
  stopNativeSpeech();
  const language = String(payload.language || "").toLowerCase();
  try {
    const audioBase64 = await generateKokoroSpeech(text, language);
    if (requestGeneration !== speechGeneration) return { ok: false, cancelled: true };
    if (audioBase64) return { ok: true, engine: "kokoro", audioBase64, mimeType: "audio/wav" };
  } catch (error) {
    console.warn("Kokoro TTS indisponível; usando voz do sistema:", error?.message || error);
  }
  if (requestGeneration !== speechGeneration) return { ok: false, cancelled: true };
  const linuxCandidates = process.platform === "linux"
    ? [["spd-say", ["-l", language || "en", text]], ["espeak-ng", ["-v", language || "en", text]], ["espeak", ["-v", language || "en", text]]]
    : [];
  const command = process.platform === "darwin" ? "say" : process.platform === "win32" ? "powershell.exe" : linuxCandidates[0]?.[0];
  const args = process.platform === "darwin" ? ["-v", language.startsWith("pt") ? "Luciana" : "Samantha", text] : process.platform === "win32" ? ["-NoProfile", "-Command", `Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Speak(${JSON.stringify(text)})`] : linuxCandidates[0]?.[1];
  if (!command) return { ok: false, error: "Nenhum mecanismo de voz instalado. Instale espeak-ng ou speech-dispatcher." };
  return new Promise((resolve) => {
    const start = (index = 0) => {
      const selected = process.platform === "linux" ? linuxCandidates[index] : [command, args];
      const child = spawn(selected[0], selected[1], { stdio: "ignore" });
      nativeSpeechProcess = child;
      child.once("spawn", () => {
        if (nativeSpeechPaused && process.platform !== "win32") child.kill("SIGSTOP");
      });
      child.once("error", () => {
        if (nativeSpeechProcess === child) nativeSpeechProcess = null;
        if (process.platform === "linux" && index + 1 < linuxCandidates.length) start(index + 1);
        else resolve({ ok: false, error: "Nenhum mecanismo de voz instalado. Instale espeak-ng ou speech-dispatcher." });
      });
      child.once("close", (code) => {
        if (nativeSpeechProcess === child) nativeSpeechProcess = null;
        resolve({ ok: code === 0, finished: code === 0 });
      });
    };
    start();
  });
});
ipcMain.handle("translator:stop-speech", (event) => {
  assertTrustedRenderer(event);
  speechGeneration += 1;
  stopNativeSpeech();
  if (process.platform === "linux") {
    const cancelSpeech = spawn("spd-say", ["-C"], { stdio: "ignore" });
    cancelSpeech.unref();
  }
  return { ok: true };
});

// macOS `say` runs as a child process; Unix signals preserve its position.
for (const [action, signal, paused] of [["pause", "SIGSTOP", true], ["resume", "SIGCONT", false]]) {
  ipcMain.handle(`translator:${action}-speech`, (event) => {
    assertTrustedRenderer(event);
    if (process.platform === "win32") return { ok: false, unsupported: true };
    nativeSpeechPaused = paused;
    if (nativeSpeechProcess) nativeSpeechProcess.kill(signal);
    return { ok: true };
  });
}

ipcMain.handle("spotify:status", () => spotify.status());
ipcMain.handle("spotify:login", () => spotify.login());
ipcMain.handle("spotify:logout", () => spotify.logout());
ipcMain.handle("spotify:search", (event, query) => spotify.search(query));
ipcMain.handle("spotify:playback", () => spotify.playback());
ipcMain.handle("spotify:play", (event, payload) => spotify.play(payload));
ipcMain.handle("spotify:pause", () => spotify.pause());
ipcMain.handle("spotify:next", () => spotify.next());
ipcMain.handle("spotify:previous", () => spotify.previous());
ipcMain.handle("spotify:volume", (event, volume) => spotify.volume(volume));

ipcMain.handle("app:openPath", async (event, filePath) => {
  assertTrustedRenderer(event);
  return shell.openPath(assertGrantedLocalPath(filePath));
});

ipcMain.handle("app:readFileBinary", async (event, filePath) => {
  assertTrustedRenderer(event);
  const buffer = await fs.promises.readFile(
    assertGrantedLocalPath(filePath, { forBinaryRead: true }),
  );
  return buffer;
});

ipcMain.handle("note:save-as-pdf", async (event, payload = {}) => {
  assertTrustedRenderer(event);
  const title = String(payload.title || "Nota").trim().slice(0, 180) || "Nota";
  const content = String(payload.content || "");
  const subject = String(payload.subject || "").trim().slice(0, 180);
  const category = String(payload.category || "").trim().slice(0, 180);
  if (Buffer.byteLength(content, "utf8") > 12 * 1024 * 1024) {
    throw new Error("A nota é muito grande para exportar como PDF.");
  }

  const escapeText = (value) =>
    String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;");
  const safeFileName = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>:\"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100) || "Nota";
  const result = await dialog.showSaveDialog({
    title: "Salvar nota como PDF",
    defaultPath: path.join(app.getPath("documents"), `${safeFileName}.pdf`),
    filters: [{ name: "Documento PDF", extensions: ["pdf"] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };

  const printableHtml = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'"><title>${escapeText(title)}</title><style>@page{size:A4;margin:18mm 17mm 20mm}*{box-sizing:border-box}body{margin:0;color:#0f172a;font:14px/1.65 Arial,sans-serif;overflow-wrap:anywhere}header{padding-bottom:18px;margin-bottom:28px;border-bottom:1px solid #cbd5e1}header p{margin:0 0 7px;color:#64748b;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}h1{margin:0;font-size:28px;line-height:1.2}h2{font-size:21px}h3{font-size:17px}p{margin:0 0 12px}blockquote{margin:18px 0;padding:12px 18px;border-left:4px solid #2563eb;background:#f1f5f9}pre,code{font-family:monospace;background:#f1f5f9}pre{padding:14px;white-space:pre-wrap}img,svg,canvas{max-width:100%;height:auto}table{width:100%;border-collapse:collapse}th,td{padding:8px;border:1px solid #cbd5e1;text-align:left}a{color:#1d4ed8}ul,ol{padding-left:24px}</style></head><body><header>${subject || category ? `<p>${escapeText([subject, category].filter(Boolean).join(" · "))}</p>` : ""}<h1>${escapeText(title)}</h1></header><main>${content || "<p>Nota sem conteúdo.</p>"}</main></body></html>`;
  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  try {
    await printWindow.loadURL(
      `data:text/html;base64,${Buffer.from(printableHtml, "utf8").toString("base64")}`,
    );
    const pdf = await printWindow.webContents.printToPDF({
      pageSize: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });
    await fs.promises.writeFile(result.filePath, pdf);
    return { canceled: false, filePath: result.filePath };
  } finally {
    if (!printWindow.isDestroyed()) printWindow.destroy();
  }
});

ipcMain.handle("study-data:changed", (event) => {
  assertTrustedRenderer(event);
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && win.webContents !== event.sender) {
      win.webContents.send("study-data:changed");
    }
  }
});

ipcMain.handle("study-db:load", (event) => {
  assertTrustedRenderer(event);
  return loadState(app);
});
ipcMain.handle("study-db:save", (event, state) => {
  assertTrustedRenderer(event);
  return saveState(app, state);
});
ipcMain.handle("study-db:export", async (event) => {
  assertTrustedRenderer(event);
  const snapshot = loadState(app);
  if (!snapshot?.state) return { canceled: true };
  const result = await dialog.showSaveDialog({
    title: "Exportar biblioteca masterStudy",
    defaultPath: path.join(
      app.getPath("documents"),
      `studyhub-backup-${new Date().toISOString().slice(0, 10)}.studyhub`,
    ),
    filters: [
      { name: "Biblioteca masterStudy", extensions: ["studyhub", "json"] },
    ],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  const payload = {
    format: "studyhub",
    version: 1,
    exportedAt: Date.now(),
    state: snapshot.state,
  };
  await fs.promises.writeFile(result.filePath, JSON.stringify(payload), "utf8");
  return { canceled: false, filePath: result.filePath };
});
ipcMain.handle("study-db:import", async (event) => {
  assertTrustedRenderer(event);
  const result = await dialog.showOpenDialog({
    title: "Importar biblioteca masterStudy",
    properties: ["openFile"],
    filters: [
      { name: "Biblioteca masterStudy", extensions: ["studyhub", "json"] },
    ],
  });
  if (result.canceled || !result.filePaths?.[0]) return { canceled: true };
  const payload = JSON.parse(
    await fs.promises.readFile(result.filePaths[0], "utf8"),
  );
  if (payload?.format !== "studyhub" || !payload.state)
    throw new Error("Backup masterStudy inválido.");
  saveState(app, payload.state);
  return { canceled: false, state: payload.state };
});

ipcMain.handle("pomodoro:completed", (event, completion) => {
  assertTrustedRenderer(event);
  if (!completion?.id || completion.id === lastPomodoroNotificationId) return;
  lastPomodoroNotificationId = completion.id;

  if (mainWindow?.isVisible()) return;

  const focusFinished = completion.phase === "focus";
  new Notification({
    title: focusFinished ? "Foco concluido" : "Descanso concluido",
    body: focusFinished
      ? "Otimo trabalho. Seu descanso comecou."
      : "Hora de voltar para o proximo bloco de foco.",
    icon: APP_ICON_PATH,
  }).show();
});

const SYSTEM_NOTIFICATION_SCREENS = new Set([
  "today",
  "tasks",
  "flashcards",
  "academic",
  "pomodoro",
]);

ipcMain.handle("notifications:show", (event, payload = {}) => {
  assertTrustedRenderer(event);
  if (!Notification.isSupported()) return { shown: false, reason: "unsupported" };

  const title = String(payload.title || "masterStudy").trim().slice(0, 120);
  const body = String(payload.body || "").trim().slice(0, 500);
  const subtitle = String(payload.subtitle || "Seu assistente de estudos").trim().slice(0, 120);
  const screenId = SYSTEM_NOTIFICATION_SCREENS.has(payload.screen) ? payload.screen : null;
  if (!title || !body) return { shown: false, reason: "invalid-content" };

  const notification = new Notification({
    title,
    subtitle,
    body,
    icon: APP_ICON_PATH,
    silent: payload.sound === false,
    timeoutType: payload.persistent ? "never" : "default",
    closeButtonText: "Agora não",
    actions: screenId ? [{ type: "button", text: String(payload.actionLabel || "Abrir") }] : [],
  });
  const openDestination = () => {
    const win = showMainWindow();
    if (!screenId || !win || win.isDestroyed()) return;
    const send = () => win.webContents.send("mac-widgets:navigate", screenId);
    if (win.webContents.isLoading()) win.webContents.once("did-finish-load", send);
    else send();
  };
  notification.on("click", openDestination);
  notification.on("action", openDestination);
  return require("./notification-delivery.cjs").deliverNotification(notification);
});

ipcMain.handle("tray-popover:action", (event, action) => {
  assertTrustedRenderer(event);
  trayPopoverWindow?.hide();
  if (action === "close") return true;
  if (action === "quick-note") {
    const noteWindow = createNoteSearchWindow();
    noteWindow.show();
    noteWindow.focus();
    return true;
  }
  if (action === "quit") {
    requestAppQuit();
    return true;
  }
  if (action === "translate-text") {
    showTranslatorPopup("text");
    return true;
  }
  if (action === "translate-area") {
    startTranslatorCapture();
    return true;
  }
  if (action === "pomodoro-widget") {
    openPomodoroWidgetWindow(event);
    return true;
  }
  const win = showMainWindow();
  if (action === "search") {
    win?.webContents.send("command-palette:open");
  } else if (action === "tasks") {
    win?.webContents.send("mac-widgets:navigate", "tasks");
  } else if (action === "settings") {
    win?.webContents.send("tray-popover:open-settings");
  } else if (action === "open-app") {
    win?.focus();
  }
  return true;
});

function resolveMacWidgetBridge() {
  const candidates = [
    path.join(process.resourcesPath || "", "native", "CampusFlowWidgetBridge"),
    path.join(__dirname, "..", "native", "macos", "build", "CampusFlowWidgetBridge"),
  ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
}

function runMacWidgetBridge(state) {
  return new Promise((resolve, reject) => {
    const executable = resolveMacWidgetBridge();
    if (!executable) {
      resolve({ available: false, reason: "native-bridge-not-built" });
      return;
    }
    const child = spawn(executable, [], { stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    let errorOutput = "";
    const timeout = setTimeout(() => child.kill("SIGTERM"), 5_000);
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { errorOutput += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve({ available: true, path: output.trim() });
      else reject(new Error(errorOutput.trim() || `Widget bridge terminou com código ${code}.`));
    });
    child.stdin.end(JSON.stringify(state));
  });
}

ipcMain.handle("mac-widgets:update", async (event, state = {}) => {
  assertTrustedRenderer(event);
  if (process.platform !== "darwin") return { available: false, reason: "macos-only" };
  const serialized = JSON.stringify(state);
  if (Buffer.byteLength(serialized, "utf8") > 128 * 1024) {
    throw new Error("O estado enviado aos widgets excede o limite permitido.");
  }
  return runMacWidgetBridge(JSON.parse(serialized));
});

function normalizeShortcut(value, fallback) {
  const nextValue = `${value || ""}`.trim();
  if (!nextValue) return fallback;
  // Global shortcuts must use the app's three-modifier namespace. This avoids
  // taking over OS actions such as Spotlight, app switching, screenshots,
  // window management and accessibility shortcuts.
  const normalized = nextValue.toLowerCase();
  const hasPrimary = normalized.includes("commandorcontrol") || normalized.includes("cmdorctrl");
  const hasShift = normalized.includes("shift");
  const hasAlt = normalized.includes("alt") || normalized.includes("option");
  return hasPrimary && hasShift && hasAlt ? nextValue : fallback;
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createWindow();
    return mainWindow;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
  return mainWindow;
}

function openStickyNotesScreen() {
  const win = showMainWindow();
  if (!win || win.isDestroyed()) return;
  const navigate = () => win.webContents.send("mac-widgets:navigate", "sticky_notes");
  if (win.webContents.isLoading()) win.webContents.once("did-finish-load", navigate);
  else navigate();
}

function formatShortcutLabel(accelerator) {
  const value = `${accelerator || ""}`;
  if (process.platform === "darwin") {
    return value
      .replace(/CommandOrControl|CmdOrCtrl|Command/g, "⌘")
      .replace(/Control|Ctrl/g, "⌃")
      .replace(/Shift/g, "⇧")
      .replace(/Alt/g, "⌥")
      .replaceAll("+", "");
  }
  return value.replace(/CommandOrControl|CmdOrCtrl/g, "Ctrl").replace("Super", "Win");
}

function refreshTrayMenu() {
  if (!tray) return;
  if (process.platform === "darwin") {
    tray.setContextMenu(null);
    return;
  }
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Abrir masterStudy", click: showMainWindow },
      { type: "separator" },
      {
        label: `Traduzir texto (${formatShortcutLabel(translatorTextShortcut)})`,
        click: () => showTranslatorPopup("text"),
      },
      {
        label: `Traduzir area da tela (${formatShortcutLabel(translatorOcrShortcut)})`,
        click: () => startTranslatorCapture(),
      },
      { type: "separator" },
      {
        label: "Sair",
        accelerator: process.platform === "darwin" ? "Command+Q" : undefined,
        click: requestAppQuit,
      },
    ]),
  );
}

function positionTrayPopover() {
  if (!trayPopoverWindow || trayPopoverWindow.isDestroyed() || !tray) return;
  const trayBounds = tray.getBounds();
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });
  const [width, height] = trayPopoverWindow.getSize();
  const x = Math.round(Math.min(
    display.workArea.x + display.workArea.width - width - 8,
    Math.max(display.workArea.x + 8, trayBounds.x + trayBounds.width / 2 - width / 2),
  ));
  const y = Math.round(trayBounds.y + trayBounds.height + 6);
  trayPopoverWindow.setPosition(x, y, false);
}

function createTrayPopover() {
  if (process.platform !== "darwin") return null;
  if (trayPopoverWindow && !trayPopoverWindow.isDestroyed()) return trayPopoverWindow;
  trayPopoverWindow = new BrowserWindow({
    width: 360,
    height: 470,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  trayPopoverWindow.removeMenu();
  hardenStudyHubWindow(trayPopoverWindow);
  loadStudyHubWindow(trayPopoverWindow, "screen=tray_popover&standalone=1");
  trayPopoverWindow.on("blur", () => trayPopoverWindow?.hide());
  trayPopoverWindow.on("closed", () => { trayPopoverWindow = null; });
  return trayPopoverWindow;
}

function toggleTrayPopover() {
  const win = createTrayPopover();
  if (!win) return;
  if (win.isVisible()) {
    win.hide();
    return;
  }
  positionTrayPopover();
  win.show();
  win.focus();
}

function createTray() {
  if (tray) {
    return tray;
  }

  // Use the packaged PNG on macOS. The SVG template renders as a blank
  // square on some macOS versions, while the PNG keeps the masterStudy mark.
  let icon = nativeImage.createFromPath(APP_ICON_PATH);
  if (process.platform === "darwin") {
    icon = icon.resize({ width: 18, height: 18, quality: "best" });
  }

  tray = new Tray(icon);
  tray.setToolTip("masterStudy");
  refreshTrayMenu();
  if (process.platform === "darwin") {
    tray.on("click", toggleTrayPopover);
    tray.on("right-click", toggleTrayPopover);
  } else {
    tray.on("double-click", showMainWindow);
  }
  return tray;
}

function isTrustedRendererUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl || "");
    if (isDev) {
      return (
        parsed.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(parsed.hostname) &&
        parsed.port === "5173"
      );
    }
    if (parsed.protocol !== "file:") return false;
    let senderPath = decodeURIComponent(parsed.pathname || "");
    if (/^\/[A-Za-z]:\//.test(senderPath)) senderPath = senderPath.slice(1);
    const rendererRoot = path.resolve(app.getAppPath(), "dist");
    const resolvedPath = path.resolve(senderPath);
    return (
      resolvedPath === rendererRoot ||
      resolvedPath.startsWith(`${rendererRoot}${path.sep}`)
    );
  } catch {
    return false;
  }
}

function hardenStudyHubWindow(win) {
  if (!win || win.studyhubSecurityConfigured) return;
  win.studyhubSecurityConfigured = true;
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes("nested-note=") || url.startsWith("#") || isTrustedRendererUrl(url)) {
      return { action: "deny" };
    }
    try {
      shell.openExternal(normalizeExternalUrl(url)).catch((error) =>
        console.error("Could not open external window:", error),
      );
    } catch {
      // Block unsupported schemes and renderer-created windows.
    }
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, targetUrl) => {
    if (isTrustedRendererUrl(targetUrl) || targetUrl.includes("nested-note=") || targetUrl.includes("#")) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    try {
      shell.openExternal(normalizeExternalUrl(targetUrl)).catch((error) =>
        console.error("Could not open external navigation:", error),
      );
    } catch {
      // Navigation remains blocked.
    }
  });
  win.webContents.on("will-attach-webview", (event) => event.preventDefault());
}

function configureRendererPermissions() {
  session.defaultSession.setPermissionCheckHandler(
    (webContents, permission, requestingOrigin, details = {}) => {
      const mainFrameUrl = webContents?.mainFrame?.url || "";
      if (permission === "fullscreen") {
        return isTrustedFullscreenPermissionRequest(
          details,
          requestingOrigin,
          mainFrameUrl,
          isTrustedRendererUrl,
        );
      }
      return (
        permission === "media" &&
        details.mediaType === "audio" &&
        isTrustedMicrophonePermissionRequest(
          details,
          mainFrameUrl,
          isTrustedRendererUrl,
        )
      );
    },
  );

  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback, details = {}) => {
      const mainFrameUrl = webContents?.mainFrame?.url || "";
      const audioOnly =
        permission === "media" &&
        Array.isArray(details.mediaTypes) &&
        details.mediaTypes.length === 1 &&
        details.mediaTypes[0] === "audio" &&
        isTrustedMicrophonePermissionRequest(
          details,
          mainFrameUrl,
          isTrustedRendererUrl,
        );
      const fullscreenAllowed =
        permission === "fullscreen" &&
        isTrustedFullscreenPermissionRequest(
          details,
          details.requestingUrl,
          mainFrameUrl,
          isTrustedRendererUrl,
        );
      callback(Boolean(audioOnly || fullscreenAllowed));
    },
  );
}

function loadStudyHubWindow(win, query = "") {
  hardenStudyHubWindow(win);
  const normalizedQuery = query ? `?${query}` : "";
  if (isDev) {
    win.loadURL(`http://127.0.0.1:5173/${normalizedQuery}`);
    return;
  }

  win.loadFile(path.join(__dirname, "..", "dist", "index.html"), {
    search: query,
  });
}

function setupApplicationMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { label: `Encerrar ${app.name}`, accelerator: "Command+Q", click: requestAppQuit },
            ],
          },
        ]
      : []),
    {
      label: "Editar",
      submenu: [
        { label: "Desfazer", accelerator: "CmdOrCtrl+Z", role: "undo" },
        { label: "Refazer", accelerator: "Shift+CmdOrCtrl+Z", role: "redo" },
        { type: "separator" },
        { label: "Recortar", accelerator: "CmdOrCtrl+X", role: "cut" },
        { label: "Copiar", accelerator: "CmdOrCtrl+C", role: "copy" },
        { label: "Colar", accelerator: "CmdOrCtrl+V", role: "paste" },
        { label: "Selecionar tudo", accelerator: "CmdOrCtrl+A", role: "selectAll" },
      ],
    },
    {
      label: "Exibir",
      submenu: [
        { label: "Recarregar", accelerator: "CmdOrCtrl+R", role: "reload" },
        { label: "Forçar recarregamento", accelerator: "CmdOrCtrl+Shift+R", role: "forceReload" },
        { label: "Ferramentas de desenvolvedor", accelerator: isMac ? "Alt+Command+I" : "Ctrl+Shift+I", role: "toggleDevTools" },
        { type: "separator" },
        { label: "Restaurar Zoom", accelerator: "CmdOrCtrl+0", role: "resetZoom" },
        { label: "Aumentar Zoom", accelerator: "CmdOrCtrl+=", role: "zoomIn" },
        { label: "Diminuir Zoom", accelerator: "CmdOrCtrl+-", role: "zoomOut" },
        { type: "separator" },
        { label: "Alternar tela cheia", accelerator: isMac ? "Ctrl+Command+F" : "F11", role: "togglefullscreen" },
      ],
    },
    {
      label: "Janela",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? [{ type: "separator" }, { role: "front" }, { type: "separator" }, { role: "window" }]
          : [{ role: "close" }]),
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function setupWindowShortcuts(win, options = {}) {
  const { allowEscapeHide = false } = options;
  if (!win || !win.webContents) return;

  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;

    const isDevToolsKey =
      input.key === "F12" ||
      ((input.control || input.meta) && input.shift && input.key?.toLowerCase() === "i");
    if (isDevToolsKey) {
      if (win.webContents.isDevToolsOpened()) {
        win.webContents.closeDevTools();
      } else {
        win.webContents.openDevTools();
      }
      event.preventDefault();
      return;
    }

    const isReloadKey =
      (input.key === "F5" || ((input.control || input.meta) && input.key?.toLowerCase() === "r")) &&
      !input.shift;
    if (isReloadKey) {
      if (isDev) {
        win.webContents.reload();
        event.preventDefault();
      }
      return;
    }

    const isForceReloadKey =
      (input.control || input.meta) && input.shift && input.key?.toLowerCase() === "r";
    if (isForceReloadKey) {
      if (isDev) {
        win.webContents.reloadIgnoringCache();
        event.preventDefault();
      }
      return;
    }

    if ((input.control || input.meta) && (input.key === "=" || input.key === "+")) {
      const currentZoom = win.webContents.getZoomLevel();
      win.webContents.setZoomLevel(currentZoom + 0.5);
      event.preventDefault();
      return;
    }
    if ((input.control || input.meta) && input.key === "-") {
      const currentZoom = win.webContents.getZoomLevel();
      win.webContents.setZoomLevel(currentZoom - 0.5);
      event.preventDefault();
      return;
    }
    if ((input.control || input.meta) && input.key === "0") {
      win.webContents.setZoomLevel(0);
      event.preventDefault();
      return;
    }

    if (allowEscapeHide && input.key === "Escape" && !input.control && !input.alt && !input.meta) {
      win.hide();
      event.preventDefault();
    }
  });
}

function getTrustedSenderUrl(event) {
  return event.senderFrame?.url || event.sender?.getURL?.() || "";
}

function assertTrustedRenderer(event) {
  if (!isTrustedRendererUrl(getTrustedSenderUrl(event))) {
    const error = new Error("Origem do tradutor nao autorizada.");
    error.code = "UNTRUSTED_RENDERER";
    throw error;
  }
}

function normalizeTranslatorLanguage(value, fallback) {
  const language = `${value || ""}`.trim();
  return /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(language)
    ? language
    : fallback;
}

function serializeTranslatorError(error, fallbackMessage) {
  return {
    code: `${error?.code || "TRANSLATOR_ERROR"}`,
    message:
      `${error?.message || ""}`.trim() ||
      fallbackMessage ||
      "Nao foi possivel concluir a traducao.",
  };
}

function emitTranslatorSession() {
  if (!translatorWindow || translatorWindow.isDestroyed()) return;
  if (translatorWindow.webContents.isLoadingMainFrame()) return;
  translatorWindow.webContents.send("translator:session-changed", {
    ...translatorSession,
  });
}

function updateTranslatorSession(patch = {}) {
  translatorSession = {
    ...translatorSession,
    ...patch,
  };
  emitTranslatorSession();
  return { ...translatorSession };
}

function formatOcrProgress(progress) {
  if (typeof progress === "number") {
    return `Lendo texto... ${Math.round(progress * 100)}%`;
  }

  const ratio = Number(progress?.progress);
  const percentage = Number.isFinite(ratio)
    ? ` ${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`
    : "";
  const status = `${progress?.status || ""}`.toLowerCase();

  if (status.includes("load") || status.includes("initial")) {
    return `Preparando o OCR local...${percentage}`;
  }
  if (status.includes("recogn")) {
    return `Lendo texto...${percentage}`;
  }
  return percentage ? `Processando imagem...${percentage}` : "Lendo texto...";
}

function getTranslatorService() {
  if (!translatorService) {
    translatorService = createTranslatorService({
      fetchImpl: (url, options) => net.fetch(url, options),
      dataDir: path.join(app.getPath("userData"), "translator-ocr"),
      onProgress: (progress) => {
        if (translatorSession.status !== "ocr") return;
        updateTranslatorSession({
          progressMessage: formatOcrProgress(progress),
        });
      },
    });
  }
  return translatorService;
}

function utilityWindowBoundsPath() {
  return path.join(app.getPath("userData"), "utility-window-bounds.json");
}

function readUtilityWindowBounds() {
  try {
    const data = JSON.parse(fs.readFileSync(utilityWindowBoundsPath(), "utf8"));
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function saveUtilityWindowBounds(win) {
  const type = win?.studyhubUtilityType;
  if (!type || win.isDestroyed() || win.isMinimized() || win.isMaximized()) return;
  try {
    const bounds = win.getNormalBounds();
    const allBounds = readUtilityWindowBounds();
    allBounds[type] = {
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    };
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.writeFileSync(utilityWindowBoundsPath(), JSON.stringify(allBounds), "utf8");
  } catch (error) {
    console.warn("Não foi possível salvar a posição da janela:", error.message);
  }
}

function restoreUtilityWindowBounds(win) {
  const type = win?.studyhubUtilityType;
  if (!type || win.isDestroyed()) return false;
  const saved = readUtilityWindowBounds()[type];
  if (!saved || !Number.isFinite(saved.x) || !Number.isFinite(saved.y)) return false;

  const displays = screen.getAllDisplays();
  const display = displays.find((item) => {
    const area = item.workArea;
    return saved.x >= area.x && saved.x < area.x + area.width &&
      saved.y >= area.y && saved.y < area.y + area.height;
  }) || screen.getPrimaryDisplay();
  const area = display.workArea;
  const [minimumWidth, minimumHeight] = win.getMinimumSize();
  const width = Math.max(minimumWidth || 1, Math.min(saved.width || win.getSize()[0], area.width));
  const height = Math.max(minimumHeight || 1, Math.min(saved.height || win.getSize()[1], area.height));
  const x = Math.max(area.x, Math.min(saved.x, area.x + area.width - width));
  const y = Math.max(area.y, Math.min(saved.y, area.y + area.height - height));
  win.setBounds({ x, y, width, height }, false);
  win.utilityWindowRestored = true;
  return true;
}

function positionTranslatorWindow(win) {
  if (!win || win.isDestroyed()) return;
  if (win.utilityWindowRestored) return;

  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const workArea = display.workArea;
  const [width, height] = win.getSize();
  const gap = 16;
  const preferredX = cursor.x + gap;
  const preferredY = cursor.y + gap;
  const x = Math.max(
    workArea.x,
    Math.min(preferredX, workArea.x + workArea.width - width),
  );
  const y = Math.max(
    workArea.y,
    Math.min(preferredY, workArea.y + workArea.height - height),
  );
  win.setPosition(Math.round(x), Math.round(y), false);
}

function createTranslatorWindow() {
  if (translatorWindow && !translatorWindow.isDestroyed()) {
    return translatorWindow;
  }

  const win = new BrowserWindow({
    width: 500,
    height: 540,
    minWidth: 440,
    minHeight: 420,
    maxWidth: 620,
    maxHeight: 720,
    show: false,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    fullscreenable: false,
    autoHideMenuBar: true,
    backgroundColor: "#f3f1f8",
    icon: APP_ICON_PATH,
    title: "Tradutor rapido - masterStudy",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  win.removeMenu();
  setupWindowShortcuts(win, { allowEscapeHide: true });
  win.studyhubUtilityType = UTILITY_WINDOW_TYPE.TRANSLATOR;
  wireWindowStateEvents(win);
  translatorWindow = win;
  loadStudyHubWindow(win, "screen=translator");

  win.webContents.on("did-finish-load", () => {
    emitTranslatorSession();
  });
  win.on("closed", () => {
    if (translatorWindow === win) translatorWindow = null;
  });

  return win;
}

function showTranslatorPopup(mode = "text", options = {}) {
  const normalizedMode = mode === "ocr" ? "ocr" : "text";
  if (options.reset !== false && normalizedMode === "text") {
    updateTranslatorSession({
      mode: "text",
      status: "idle",
      progressMessage: "",
      error: null,
    });
  } else {
    updateTranslatorSession({ mode: normalizedMode });
  }

  const win = createTranslatorWindow();
  positionTranslatorWindow(win);

  const reveal = () => {
    if (win.isDestroyed()) return;
    positionTranslatorWindow(win);
    win.show();
    win.focus();
    emitTranslatorSession();
  };

  if (win.webContents.isLoadingMainFrame()) {
    win.once("ready-to-show", reveal);
  } else {
    reveal();
  }
  return win;
}

function closeTranslatorCapture() {
  const win = translatorCaptureWindow;
  translatorCaptureWindow = null;
  translatorCapture = null;
  if (win && !win.isDestroyed()) win.close();
}

function chooseDisplaySource(sources, display) {
  const displayId = `${display.id}`;
  const exact = sources.find((source) => `${source.display_id}` === displayId);
  if (exact) return exact;
  if (sources.length === 1) return sources[0];

  const targetAspect = display.bounds.width / display.bounds.height;
  return (
    [...sources].sort((left, right) => {
      const leftSize = left.thumbnail.getSize();
      const rightSize = right.thumbnail.getSize();
      const leftAspect = leftSize.width / Math.max(1, leftSize.height);
      const rightAspect = rightSize.width / Math.max(1, rightSize.height);
      return (
        Math.abs(leftAspect - targetAspect) -
        Math.abs(rightAspect - targetAspect)
      );
    })[0] || null
  );
}

function shouldUseSpectacleCapture() {
  if (process.platform !== "linux") return false;
  const desktop = `${process.env.XDG_CURRENT_DESKTOP || ""}`.toLowerCase();
  return desktop.includes("kde") || desktop.includes("plasma");
}

async function captureDisplayImage(display) {
  if (shouldUseSpectacleCapture()) {
    const capturePath = path.join(
      app.getPath("temp"),
      `studyhub-translator-${process.pid}-${Date.now()}.png`,
    );

    try {
      await execFileAsync(
        process.env.STUDYHUB_SPECTACLE || "spectacle",
        ["--background", "--nonotify", "--current", "--output", capturePath],
        {
          timeout: 15_000,
          windowsHide: true,
          maxBuffer: 1024 * 1024,
        },
      );
      const imageBuffer = await fs.promises.readFile(capturePath);
      const image = nativeImage.createFromBuffer(imageBuffer);
      if (image.isEmpty()) {
        const error = new Error("O Spectacle retornou uma captura vazia.");
        error.code = "SPECTACLE_EMPTY_CAPTURE";
        throw error;
      }
      return image;
    } catch (error) {
      // Spectacle is an optimization for KDE/Wayland, not a hard dependency.
      // Fall back to Electron/PipeWire on installations where it is absent or
      // unavailable, allowing the desktop portal to request screen access.
      console.warn(
        `Captura silenciosa pelo Spectacle indisponivel; usando o portal: ${error?.message || error}`,
      );
    } finally {
      await fs.promises.unlink(capturePath).catch(() => {});
    }
  }

  const pixelWidth = Math.max(
    1,
    Math.ceil(display.bounds.width * (display.scaleFactor || 1)),
  );
  const pixelHeight = Math.max(
    1,
    Math.ceil(display.bounds.height * (display.scaleFactor || 1)),
  );
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: pixelWidth, height: pixelHeight },
    fetchWindowIcons: false,
  });
  const source = chooseDisplaySource(sources, display);
  const image = source?.thumbnail || null;
  if (!image || image.isEmpty()) {
    const permission = process.platform === "darwin"
      ? systemPreferences.getMediaAccessStatus?.("screen")
      : null;
    const error = new Error(
      permission === "denied"
        ? "O macOS bloqueou a Gravação de Tela para o masterStudy. Desative e ative novamente a permissão e reinicie o app."
        : "O macOS não forneceu uma imagem da tela. Feche completamente o masterStudy e tente novamente."
    );
    error.code = "CAPTURE_EMPTY";
    throw error;
  }
  return image;
}

function cropDisplaySelection(image, selection, display) {
  const imageSize = image.getSize();
  const viewportWidth = Math.max(1, display.bounds.width);
  const viewportHeight = Math.max(1, display.bounds.height);
  const scaleX = imageSize.width / viewportWidth;
  const scaleY = imageSize.height / viewportHeight;
  const x = Math.max(0, Math.min(imageSize.width - 1, Math.round(Number(selection?.x || 0) * scaleX)));
  const y = Math.max(0, Math.min(imageSize.height - 1, Math.round(Number(selection?.y || 0) * scaleY)));
  const width = Math.max(1, Math.min(imageSize.width - x, Math.round(Number(selection?.width || 0) * scaleX)));
  const height = Math.max(1, Math.min(imageSize.height - y, Math.round(Number(selection?.height || 0) * scaleY)));
  if (width < 2 || height < 2) {
    const error = new Error("Selecione uma área maior para traduzir.");
    error.code = "CAPTURE_SELECTION_TOO_SMALL";
    throw error;
  }
  return image.crop({ x, y, width, height }).toPNG();
}

async function startTranslatorCapture(options = {}) {
  translatorOperationId += 1;
  closeTranslatorCapture();
  const requestedMode = typeof options === "string" ? options : options?.mode;
  if (requestedMode === "live" || requestedMode === "frozen") {
    translatorCaptureMode = requestedMode;
  }
  // Linux portals generally require choosing/capturing a source before an
  // overlay can be shown, so the reliable frozen workflow remains the fallback.
  const liveCapture = translatorCaptureMode === "live" && process.platform !== "linux";
  returnToTranslatorAfterCapture = Boolean(
    translatorWindow &&
      !translatorWindow.isDestroyed() &&
      translatorWindow.isVisible(),
  );
  if (translatorWindow && !translatorWindow.isDestroyed()) {
    translatorWindow.hide();
  }

  await new Promise((resolve) => setTimeout(resolve, 100));

  try {
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const captureImage = liveCapture ? null : await captureDisplayImage(display);

    if (!liveCapture && (!captureImage || captureImage.isEmpty())) {
      const error = new Error(
        process.platform === "linux"
          ? "O portal de captura do Linux nao forneceu uma imagem. Autorize o compartilhamento da tela quando solicitado."
          : "O sistema nao forneceu uma imagem desta tela. Conteudo protegido pode bloquear capturas.",
      );
      error.code = "CAPTURE_UNAVAILABLE";
      throw error;
    }

    const imageSize = captureImage?.getSize() || {
      width: Math.ceil(display.bounds.width * (display.scaleFactor || 1)),
      height: Math.ceil(display.bounds.height * (display.scaleFactor || 1)),
    };
    translatorCapture = {
      displayId: `${display.id}`,
      imageDataUrl: captureImage?.toDataURL() || "",
      imageSize,
      bounds: { ...display.bounds },
      live: liveCapture,
    };

    const win = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      show: false,
      frame: false,
      transparent: liveCapture,
      hasShadow: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      movable: false,
      resizable: false,
      fullscreenable: false,
      autoHideMenuBar: true,
      backgroundColor: liveCapture ? "#00000000" : "#09070f",
      icon: APP_ICON_PATH,
      title: "Selecionar texto da tela - masterStudy",
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    });

    translatorCaptureWindow = win;
    win.studyhubUtilityType = UTILITY_WINDOW_TYPE.TRANSLATOR_CAPTURE;
    win.studyhubDisplayId = `${display.id}`;
    win.removeMenu();
    win.setAlwaysOnTop(true, "screen-saver");
    loadStudyHubWindow(
      win,
      `screen=translator_capture&displayId=${encodeURIComponent(display.id)}`,
    );
    win.webContents.on("before-input-event", (event, input) => {
      if (input.key === "Escape") {
        closeTranslatorCapture();
        event.preventDefault();
      }
    });
    win.on("closed", () => {
      if (translatorCaptureWindow === win) {
        translatorCaptureWindow = null;
        translatorCapture = null;
      }
    });

    updateTranslatorSession({
      mode: "ocr",
      status: "capturing",
      progressMessage: "Selecione uma area da tela",
      error: null,
    });
  } catch (error) {
    returnToTranslatorAfterCapture = false;
    closeTranslatorCapture();
    updateTranslatorSession({
      mode: "ocr",
      status: "error",
      progressMessage: "",
      error: serializeTranslatorError(
        error,
        "Nao foi possivel capturar a tela.",
      ),
    });
    showTranslatorPopup("ocr", { reset: false });
  }
}

function normalizeTranslationResult(result, fallbackSourceText) {
  if (typeof result === "string") {
    return {
      translatedText: result,
      detectedLanguage: "",
    };
  }
  return {
    translatedText: `${
      result?.translatedText ||
      result?.translation ||
      result?.text ||
      fallbackSourceText ||
      ""
    }`.trim(),
    detectedLanguage: `${
      result?.detectedLanguage || result?.sourceLanguage || ""
    }`.trim(),
  };
}

async function translateForSession(payload, operationId) {
  const sourceText =
    `${payload?.text ?? translatorSession.sourceText ?? ""}`.trim();
  const sourceLanguage =
    payload?.sourceLanguage === "auto"
      ? "auto"
      : normalizeTranslatorLanguage(
          payload?.sourceLanguage,
          translatorSession.sourceLanguage || "auto",
        );
  const targetLanguage = normalizeTranslatorLanguage(
    payload?.targetLanguage,
    translatorSession.targetLanguage || "pt",
  );

  if (!sourceText) {
    const error = new Error("Digite ou capture um texto antes de traduzir.");
    error.code = "EMPTY_TEXT";
    throw error;
  }

  updateTranslatorSession({
    sourceText,
    sourceLanguage,
    targetLanguage,
    status: "translating",
    progressMessage: "Traduzindo...",
    translatedText: "",
    detectedLanguage: "",
    error: null,
  });

  const result = await getTranslatorService().translate({
    text: sourceText,
    sourceLanguage,
    targetLanguage,
  });
  if (operationId !== translatorOperationId) return { ...translatorSession };

  const normalized = normalizeTranslationResult(result, sourceText);
  return updateTranslatorSession({
    ...normalized,
    status: "done",
    progressMessage: "",
    error: null,
  });
}

async function processTranslatorImage(imageBuffer) {
  const operationId = ++translatorOperationId;
  updateTranslatorSession({
    mode: "ocr",
    status: "ocr",
    sourceText: "",
    ocrText: "",
    translatedText: "",
    detectedLanguage: "",
    progressMessage: "Preparando o OCR local...",
    error: null,
  });

  try {
    const ocrResult = await getTranslatorService().recognize(imageBuffer, {
      language: "eng+por",
      onProgress: (progress) => {
        if (operationId !== translatorOperationId) return;
        updateTranslatorSession({
          progressMessage: formatOcrProgress(progress),
        });
      },
    });
    if (operationId !== translatorOperationId) return;

    const ocrText = `${ocrResult?.text ?? ocrResult ?? ""}`.trim();
    if (!ocrText) {
      const error = new Error(
        "Nenhum texto foi encontrado. Tente selecionar uma area maior e mais nitida.",
      );
      error.code = "OCR_EMPTY";
      throw error;
    }

    updateTranslatorSession({
      sourceText: ocrText,
      ocrText,
      status: "translating",
      progressMessage: "Texto encontrado. Traduzindo...",
    });
    await translateForSession(
      {
        text: ocrText,
        sourceLanguage: "auto",
        targetLanguage: translatorSession.targetLanguage || "pt",
      },
      operationId,
    );
  } catch (error) {
    if (operationId !== translatorOperationId) return;
    updateTranslatorSession({
      status: "error",
      progressMessage: "",
      error: serializeTranslatorError(
        error,
        "Nao foi possivel ler e traduzir esta imagem.",
      ),
    });
  }
}

function decodeTranslatorImage(dataUrl) {
  const value = `${dataUrl || ""}`;
  const match = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(
    value,
  );
  if (!match) {
    const error = new Error("A selecao da tela nao contem uma imagem valida.");
    error.code = "INVALID_CAPTURE";
    throw error;
  }

  const buffer = Buffer.from(match[1], "base64");
  if (!buffer.length || buffer.length > 30 * 1024 * 1024) {
    const error = new Error(
      "A area selecionada e grande demais para processar.",
    );
    error.code = "CAPTURE_TOO_LARGE";
    throw error;
  }
  return buffer;
}

function registerTranslatorIpc() {
  ipcMain.handle("translator:get-session", (event) => {
    assertTrustedRenderer(event);
    return { ...translatorSession };
  });

  ipcMain.handle("translator:get-capture", (event) => {
    assertTrustedRenderer(event);
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    if (
      !senderWindow ||
      senderWindow.studyhubUtilityType !==
        UTILITY_WINDOW_TYPE.TRANSLATOR_CAPTURE ||
      !translatorCapture ||
      senderWindow.studyhubDisplayId !== translatorCapture.displayId
    ) {
      return null;
    }
    return { ...translatorCapture };
  });

  ipcMain.handle("translator:capture-ready", (event) => {
    assertTrustedRenderer(event);
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    if (
      senderWindow &&
      senderWindow === translatorCaptureWindow &&
      !senderWindow.isDestroyed()
    ) {
      senderWindow.show();
      senderWindow.focus();
    }
  });

  ipcMain.handle("translator:translate", async (event, payload = {}) => {
    assertTrustedRenderer(event);
    const operationId = ++translatorOperationId;
    try {
      return await translateForSession(payload, operationId);
    } catch (error) {
      return updateTranslatorSession({
        status: "error",
        progressMessage: "",
        error: serializeTranslatorError(error),
      });
    }
  });

  ipcMain.handle("translator:complete-selection", async (event, payload = {}) => {
    assertTrustedRenderer(event);
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    if (
      !senderWindow ||
      senderWindow.studyhubUtilityType !==
        UTILITY_WINDOW_TYPE.TRANSLATOR_CAPTURE ||
      `${payload.displayId || ""}` !== `${senderWindow.studyhubDisplayId || ""}`
    ) {
      const error = new Error("Esta captura nao pertence a janela ativa.");
      error.code = "INVALID_CAPTURE_WINDOW";
      throw error;
    }

    let imageBuffer;
    if (translatorCapture?.live) {
      const display = screen.getAllDisplays().find(
        (item) => `${item.id}` === `${senderWindow.studyhubDisplayId}`,
      );
      if (!display) throw new Error("A tela selecionada não está mais disponível.");
      senderWindow.hide();
      // Wait for the compositor to remove the transparent overlay before the
      // final screenshot, otherwise the selection frame would enter the OCR.
      await new Promise((resolve) => setTimeout(resolve, 90));
      try {
        const captureImage = await captureDisplayImage(display);
        if (!captureImage || captureImage.isEmpty()) {
          throw new Error("O sistema não forneceu a captura da área selecionada.");
        }
        imageBuffer = cropDisplaySelection(captureImage, payload.selection, display);
      } catch (error) {
        if (!senderWindow.isDestroyed()) {
          senderWindow.show();
          senderWindow.focus();
        }
        throw error;
      }
    } else {
      imageBuffer = decodeTranslatorImage(payload.imageDataUrl);
    }
    lastTranslatorImage = imageBuffer;
    setImmediate(() => {
      returnToTranslatorAfterCapture = false;
      closeTranslatorCapture();
      updateTranslatorSession({
        mode: "ocr",
        status: "ocr",
        sourceText: "",
        ocrText: "",
        translatedText: "",
        progressMessage: "Preparando o OCR local...",
        error: null,
      });
      showTranslatorPopup("ocr", { reset: false });
      setImmediate(() => processTranslatorImage(imageBuffer));
    });
    return { ok: true };
  });

  ipcMain.handle("translator:cancel-capture", (event) => {
    assertTrustedRenderer(event);
    const shouldReturnToPopup = returnToTranslatorAfterCapture;
    returnToTranslatorAfterCapture = false;
    closeTranslatorCapture();
    updateTranslatorSession({
      status: "idle",
      progressMessage: "",
      error: null,
    });
    if (shouldReturnToPopup)
      showTranslatorPopup(translatorSession.mode, { reset: false });
    return true;
  });

  ipcMain.handle("translator:set-capture-mode", (event, mode) => {
    assertTrustedRenderer(event);
    translatorCaptureMode = mode === "live" ? "live" : "frozen";
    return translatorCaptureMode;
  });

  ipcMain.handle("translator:start-capture", async (event, options = {}) => {
    assertTrustedRenderer(event);
    await startTranslatorCapture(options);
    return true;
  });

  ipcMain.handle("translator:retry-ocr", (event) => {
    assertTrustedRenderer(event);
    if (!lastTranslatorImage) {
      return updateTranslatorSession({
        status: "error",
        error: {
          code: "NO_CAPTURE_TO_RETRY",
          message: "Faca uma nova captura para tentar novamente.",
        },
      });
    }
    setImmediate(() => processTranslatorImage(lastTranslatorImage));
    return { ...translatorSession };
  });

  ipcMain.handle("translator:copy-text", (event, text) => {
    assertTrustedRenderer(event);
    const value = `${text || ""}`;
    if (value) clipboard.writeText(value);
    return Boolean(value);
  });

  ipcMain.handle("translator:close", (event) => {
    assertTrustedRenderer(event);
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    if (
      senderWindow?.studyhubUtilityType ===
      UTILITY_WINDOW_TYPE.TRANSLATOR_CAPTURE
    ) {
      closeTranslatorCapture();
    } else if (translatorWindow && !translatorWindow.isDestroyed()) {
      translatorWindow.hide();
    }
    return true;
  });
}

function findUtilityWindow(type) {
  const windows = BrowserWindow.getAllWindows();
  return (
    windows.find(
      (win) => !win.isDestroyed() && win.studyhubUtilityType === type,
    ) || null
  );
}

function toggleUtilityWindow(type, createWindow) {
  const existingWindow = findUtilityWindow(type);

  if (!existingWindow) {
    return createWindow();
  }

  if (existingWindow.isVisible() && existingWindow.isFocused()) {
    existingWindow.hide();
    return existingWindow;
  }

  if (existingWindow.isMinimized()) {
    existingWindow.restore();
  }

  existingWindow.show();
  existingWindow.focus();
  return existingWindow;
}

function getSenderWindow(event) {
  assertTrustedRenderer(event);
  return BrowserWindow.fromWebContents(event.sender);
}

function emitWindowState(win) {
  if (!win || win.isDestroyed()) {
    return;
  }
  win.webContents.send("window:maximized-change", win.isMaximized());
}

function wireWindowStateEvents(win) {
  restoreUtilityWindowBounds(win);
  const persistBounds = () => saveUtilityWindowBounds(win);
  win.on("move", persistBounds);
  win.on("resize", persistBounds);
  win.on("close", persistBounds);
  win.on("maximize", () => emitWindowState(win));
  win.on("unmaximize", () => emitWindowState(win));
  win.on("restore", () => emitWindowState(win));
}

ipcMain.handle("window:minimize", (event) => {
  getSenderWindow(event)?.minimize();
});

ipcMain.handle("window:toggleMaximize", (event) => {
  const win = getSenderWindow(event);
  if (!win) {
    return false;
  }

  if (win.isMaximized()) {
    win.unmaximize();
  } else {
    win.maximize();
  }

  return win.isMaximized();
});

ipcMain.handle("window:close", (event) => {
  getSenderWindow(event)?.close();
});
ipcMain.handle("window:closeCommandPalette", (event) => {
  const win = getSenderWindow(event);
  if (win?.studyhubUtilityType === UTILITY_WINDOW_TYPE.COMMAND_PALETTE)
    win.close();
});
ipcMain.handle("window:openMainWindow", (event) => {
  assertTrustedRenderer(event);
  showMainWindow();
});

ipcMain.handle("journal:send-to-apple", async (event, payload = {}) => {
  assertTrustedRenderer(event);
  const title = String(payload.title || "Entrada do masterStudy").trim();
  const body = String(payload.body || payload.text || "").trim();
  if (!body) throw new Error("A entrada do diário está vazia.");
  if (process.platform !== "darwin") {
    return { ok: false, error: "O Diário da Apple só está disponível no macOS." };
  }
  const inputPath = path.join(app.getPath("temp"), `studyhub-journal-${process.pid}-${Date.now()}.json`);
  await fs.promises.writeFile(inputPath, JSON.stringify({
    title,
    body,
    entryDate: payload.entryDate || new Date().toISOString(),
    bookmarked: Boolean(payload.bookmarked),
    mediaPaths: Array.isArray(payload.mediaPaths) ? payload.mediaPaths.filter(Boolean) : [],
  }), "utf8");
  try {
    const bridgeCandidates = [
      path.join(process.resourcesPath || "", "native", "StudyHubJournalBridge"),
      path.join(__dirname, "..", "native", "macos", "build", "StudyHubJournalBridge"),
    ];
    const bridgePath = bridgeCandidates.find((candidate) => candidate && fs.existsSync(candidate));
    if (!bridgePath) {
      const missingBridge = new Error("O componente nativo do Diário não foi encontrado. Gere novamente o aplicativo para macOS.");
      missingBridge.code = "APPLE_JOURNAL_BRIDGE_MISSING";
      throw missingBridge;
    }
    await execFileAsync(bridgePath, [inputPath], { timeout: 35_000 });
    return { ok: true, engine: "native-sharing-service" };
  } catch (error) {
    if (error?.code === "APPLE_JOURNAL_BRIDGE_MISSING") throw error;
    const details = String(error?.stderr || error?.message || "").trim();
    const nativeError = new Error(details || "O Diário da Apple não confirmou a criação da entrada.");
    nativeError.code = "APPLE_JOURNAL_SHARE_FAILED";
    nativeError.cause = error;
    throw nativeError;
  } finally {
    await fs.promises.unlink(inputPath).catch(() => {});
  }
});

ipcMain.handle("window:isMaximized", (event) => {
  return getSenderWindow(event)?.isMaximized() ?? false;
});

ipcMain.handle("books:drive-list", async (event, link) => {
  assertTrustedRenderer(event);
  return require("./public-drive.cjs").listPublicDrive(link);
});
ipcMain.handle("books:drive-download", async (event, file) => {
  assertTrustedRenderer(event);
  return require("./public-drive.cjs").downloadPublicDrive(file);
});

ipcMain.handle("dialog:openDirectory", async (event) => {
  assertTrustedRenderer(event);
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ["openDirectory"],
  });
  if (canceled) {
    return null;
  }

  const dirPath = filePaths[0];
  grantLocalPath(dirPath, true);
  const rootName = path.basename(dirPath);
  const filesList = [];

  const shouldIgnoreDirectoryEntry = (name) =>
    !name || name.startsWith(".") || name === "__MACOSX" ||
    name === "node_modules" || name === ".git" || /\.app$/i.test(name);

  function walkSync(currentDirPath) {
    if (filesList.length >= 10000) return;
    fs.readdirSync(currentDirPath).forEach(function (name) {
      if (filesList.length >= 10000) return;
      if (shouldIgnoreDirectoryEntry(name)) return;
      const filePath = path.join(currentDirPath, name);
      const stat = fs.lstatSync(filePath);
      if (stat.isSymbolicLink()) return;
      if (stat.isFile()) {
        filesList.push({ name: name, path: filePath, size: stat.size, lastModified: stat.mtimeMs });
      } else if (stat.isDirectory()) {
        walkSync(filePath);
      }
    });
  }

  try {
    walkSync(dirPath);
  } catch (e) {
    console.error(e);
  }

  return { rootName, dirPath, filesList };
});

ipcMain.handle("dialog:scanDirectory", async (event, directoryPath) => {
  assertTrustedRenderer(event);
  const dirPath = assertGrantedLocalPath(directoryPath);
  const stat = fs.statSync(dirPath);
  if (!stat.isDirectory()) throw new Error("A pasta vinculada não está disponível.");
  const filesList = [];
  const shouldIgnoreDirectoryEntry = (name) =>
    !name || name.startsWith(".") || name === "__MACOSX" ||
    name === "node_modules" || name === ".git" || /\.app$/i.test(name);
  const walkSync = (currentDirPath) => {
    if (filesList.length >= 10000) return;
    fs.readdirSync(currentDirPath).forEach((name) => {
      if (filesList.length >= 10000) return;
      if (shouldIgnoreDirectoryEntry(name)) return;
      const filePath = path.join(currentDirPath, name);
      const fileStat = fs.lstatSync(filePath);
      if (fileStat.isSymbolicLink()) return;
      if (fileStat.isFile()) filesList.push({ name, path: filePath, size: fileStat.size, lastModified: fileStat.mtimeMs });
      else if (fileStat.isDirectory()) walkSync(filePath);
    });
  };
  walkSync(dirPath);
  return { rootName: path.basename(dirPath), dirPath, filesList };
});

ipcMain.handle("dialog:openFile", async (event, options = {}) => {
  assertTrustedRenderer(event);
  const allowedProperties = new Set(["openFile", "multiSelections"]);
  const requestedProperties = Array.isArray(options?.properties)
    ? options.properties.filter((property) => allowedProperties.has(property))
    : ["openFile"];
  const properties = requestedProperties.includes("openFile")
    ? requestedProperties
    : ["openFile", ...requestedProperties];
  const filters = Array.isArray(options?.filters)
    ? options.filters.slice(0, 12).map((filter) => ({
        name: String(filter?.name || "Arquivos").slice(0, 80),
        extensions: (Array.isArray(filter?.extensions) ? filter.extensions : [])
          .map((extension) => String(extension).replace(/^\./, "").toLowerCase())
          .filter((extension) => /^[a-z0-9]{1,12}$/.test(extension))
          .slice(0, 30),
      })).filter((filter) => filter.extensions.length > 0)
    : [];
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties,
    filters,
  });

  if (canceled || !filePaths?.length) {
    return null;
  }

  filePaths.forEach((filePath) => grantLocalPath(filePath, false));
  return properties.includes("multiSelections") ? filePaths : filePaths[0];
});

ipcMain.handle("window:openWhiteboard", async (event, lesson = {}) => {
  assertTrustedRenderer(event);
  const { courseId = "", moduleId = "", lessonId = "" } = lesson || {};
  const whiteboardKey = lessonId
    ? `${courseId}:${moduleId}:${lessonId}`
    : "active-lesson";
  const existingWindow = whiteboardWindows.get(whiteboardKey);

  if (existingWindow && !existingWindow.isDestroyed()) {
    existingWindow.show();
    existingWindow.focus();
    return;
  }

  const whiteboardWin = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 600,
    minHeight: 400,
    autoHideMenuBar: true,
    frame: false,
    backgroundColor: "#ffffff",
    icon: APP_ICON_PATH,
    title: "Lousa de Desenho - masterStudy",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  whiteboardWin.removeMenu();
  wireWindowStateEvents(whiteboardWin);
  whiteboardWindows.set(whiteboardKey, whiteboardWin);
  whiteboardWin.on("closed", () => {
    if (whiteboardWindows.get(whiteboardKey) === whiteboardWin) {
      whiteboardWindows.delete(whiteboardKey);
    }
  });

  const params = new URLSearchParams({ screen: "whiteboard" });
  if (courseId) params.set("courseId", courseId);
  if (moduleId) params.set("moduleId", moduleId);
  if (lessonId) params.set("lessonId", lessonId);
  loadStudyHubWindow(whiteboardWin, params.toString());
});

ipcMain.handle("window:openNoteEditor", async (event, noteId) => {
  assertTrustedRenderer(event);
  const noteWin = new BrowserWindow({
    width: 560,
    height: 760,
    minWidth: 440,
    minHeight: 540,
    autoHideMenuBar: true,
    frame: false,
    backgroundColor: "#e8eaf0",
    icon: APP_ICON_PATH,
    title: "Anotação - masterStudy",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  noteWin.removeMenu();
  wireWindowStateEvents(noteWin);

  const query = `screen=note_editor&standalone=1&mode=quick-note${noteId ? `&noteId=${encodeURIComponent(noteId)}` : ""}`;
  loadStudyHubWindow(noteWin, query);
});

ipcMain.handle("window:openBookReader", async (event, bookId) => {
  assertTrustedRenderer(event);
  const readerKey = bookId || "active-book";
  const existingWindow = readerWindows.get(readerKey);

  if (existingWindow && !existingWindow.isDestroyed()) {
    existingWindow.show();
    existingWindow.focus();
    return;
  }

  const readerWin = new BrowserWindow({
    width: 1240,
    height: 840,
    minWidth: 700,
    minHeight: 500,
    autoHideMenuBar: true,
    frame: false, // Frameless standalone reader window
    backgroundColor: "#1e1e2e",
    icon: APP_ICON_PATH,
    title: "Leitor de Livro - masterStudy",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  readerWin.removeMenu();
  wireWindowStateEvents(readerWin);

  readerWindows.set(readerKey, readerWin);
  readerWin.on("closed", () => {
    if (readerWindows.get(readerKey) === readerWin) {
      readerWindows.delete(readerKey);
    }
  });

  const query = `screen=book_reader&standalone=1${bookId ? `&bookId=${encodeURIComponent(bookId)}` : ""}`;
  loadStudyHubWindow(readerWin, query);
});

async function openPomodoroWidgetWindow(event) {
  assertTrustedRenderer(event);
  if (pomodoroWidgetWindow && !pomodoroWidgetWindow.isDestroyed()) {
    pomodoroWidgetWindow.setAlwaysOnTop(true, "screen-saver", 1);
    pomodoroWidgetWindow.showInactive();
    pomodoroWidgetWindow.moveTop();
    return;
  }
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay?.workArea || {
    x: 0,
    y: 0,
    width: 1280,
    height: 720,
  };
  const widgetWidth = 350;
  const widgetHeight = 500;
  const widgetWin = new BrowserWindow({
    width: widgetWidth,
    height: widgetHeight,
    x: Math.round(workArea.x + (workArea.width - widgetWidth) / 2),
    y: Math.max(workArea.y + 12, 0),
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    icon: APP_ICON_PATH,
    minWidth: 260,
    minHeight: 360,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  widgetWin.setAlwaysOnTop(true, "screen-saver");
  widgetWin.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
  });
  widgetWin.setAlwaysOnTop(true, "screen-saver", 1);

  pomodoroWidgetWindow = widgetWin;
  widgetWin.on("show", () => {
    if (!widgetWin.isDestroyed()) {
      widgetWin.setAlwaysOnTop(true, "screen-saver", 1);
      widgetWin.moveTop();
    }
  });
  widgetWin.on("blur", () => {
    if (!widgetWin.isDestroyed()) {
      widgetWin.setAlwaysOnTop(true, "screen-saver", 1);
      widgetWin.moveTop();
    }
  });
  widgetWin.on("closed", () => {
    if (pomodoroWidgetWindow === widgetWin) pomodoroWidgetWindow = null;
  });

  loadStudyHubWindow(widgetWin, "screen=pomodoro_widget");
}

ipcMain.handle("window:openPomodoroWidget", (event) => openPomodoroWidgetWindow(event));

function normalizeStickyNoteId(value) {
  const noteId = String(value || "").trim();
  if (!/^[A-Za-z0-9._-]{1,200}$/.test(noteId)) {
    throw new Error("Identificador de Sticky Note inválido.");
  }
  return noteId;
}

function setStickyNoteAlwaysOnTop(win, enabled) {
  if (!win || win.isDestroyed() || win.studyhubDesktopOnly) return false;
  const alwaysOnTop = Boolean(enabled);
  win.setAlwaysOnTop(alwaysOnTop, alwaysOnTop ? "floating" : "normal");
  if (process.platform === "darwin") {
    win.setVisibleOnAllWorkspaces(alwaysOnTop, {
      visibleOnFullScreen: alwaysOnTop,
    });
  }
  if (alwaysOnTop) win.moveTop();
  return alwaysOnTop;
}

function openStickyNoteWindow(noteIdValue, options = {}) {
  const noteId = normalizeStickyNoteId(noteIdValue);
  let existingWindow = stickyNoteWindows.get(noteId);
  if (existingWindow && !existingWindow.isDestroyed()) {
    setStickyNoteAlwaysOnTop(existingWindow, options.alwaysOnTop);
    if (existingWindow.isMinimized()) existingWindow.restore();
    existingWindow.show(); existingWindow.focus();
    return { opened: true, reused: true };
  }

  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const area = display.workArea;
  const width = 340;
  const height = 360;
  const noteWin = new BrowserWindow({
    width,
    height,
    x: Math.round(Math.min(area.x + area.width - width, Math.max(area.x, cursor.x - width / 2))),
    y: Math.round(Math.min(area.y + area.height - height, Math.max(area.y, cursor.y + 18))),
    minWidth: 240,
    minHeight: 220,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    show: false,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    // Uma única sombra no cartão evita o contorno irregular da janela transparente.
    hasShadow: false,
    alwaysOnTop: Boolean(options.alwaysOnTop),
    focusable: true,
    hiddenInMissionControl: false,
    skipTaskbar: false,
    icon: APP_ICON_PATH,
    title: "Sticky Note - masterStudy",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  noteWin.removeMenu();
  noteWin.studyhubUtilityType = `sticky-note:${noteId}`;
  noteWin.studyhubStickyNoteId = noteId;
  wireWindowStateEvents(noteWin);
  setStickyNoteAlwaysOnTop(noteWin, options.alwaysOnTop);
  stickyNoteWindows.set(noteId, noteWin);
  noteWin.once("ready-to-show", () => {
    if (!noteWin.isDestroyed()) {
      noteWin.show(); noteWin.focus();
    }
  });
  noteWin.on("closed", () => {
    if (stickyNoteWindows.get(noteId) === noteWin) {
      stickyNoteWindows.delete(noteId);
    }
  });
  loadStudyHubWindow(
    noteWin,
    `screen=sticky_note_widget&standalone=1&noteId=${encodeURIComponent(noteId)}`,
  );
  return { opened: true, reused: false };
}

ipcMain.handle("sticky-notes:open", (event, noteId, options = {}) => {
  assertTrustedRenderer(event);
  return openStickyNoteWindow(noteId, options);
});


ipcMain.handle("sticky-notes:set-always-on-top", (event, enabled) => {
  const win = getSenderWindow(event);
  if (!win?.studyhubStickyNoteId) return false;
  return setStickyNoteAlwaysOnTop(win, enabled);
});

ipcMain.handle("sticky-notes:changed", (event, change = {}) => {
  assertTrustedRenderer(event);
  const noteId = normalizeStickyNoteId(change.noteId);
  const safeChange = {
    type: change.type === "deleted" ? "deleted" : "updated",
    noteId,
    updates: change.type === "deleted" ? undefined : {
      ...(typeof change.updates === "object" && change.updates ? change.updates : {}),
    },
  };
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && win.webContents !== event.sender) {
      win.webContents.send("sticky-notes:changed", safeChange);
    }
  }
  if (safeChange.type === "deleted" || safeChange.updates?.archived === true) {
    const noteWin = stickyNoteWindows.get(noteId);
    if (noteWin && !noteWin.isDestroyed()) noteWin.close();
  }
  return true;
});

function createQuickNoteWindow() {
  const existingWindow = findUtilityWindow(UTILITY_WINDOW_TYPE.QUICK_NOTE);
  if (existingWindow) {
    quickNoteWindow = existingWindow;
    return existingWindow;
  }

  const quickNoteWin = new BrowserWindow({
    width: 560,
    height: 760,
    minWidth: 440,
    minHeight: 540,
    autoHideMenuBar: true,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    backgroundColor: "#e8eaf0",
    icon: APP_ICON_PATH,
    title: "Nota Rapida - masterStudy",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  quickNoteWin.removeMenu();
  setupWindowShortcuts(quickNoteWin, { allowEscapeHide: true });
  quickNoteWin.studyhubUtilityType = UTILITY_WINDOW_TYPE.QUICK_NOTE;
  wireWindowStateEvents(quickNoteWin);
  loadStudyHubWindow(
    quickNoteWin,
    "screen=note_editor&standalone=1&mode=quick-note",
  );
  quickNoteWin.once("ready-to-show", () => {
    quickNoteWin.show();
    quickNoteWin.focus();
  });
  quickNoteWin.on("closed", () => {
    if (quickNoteWindow === quickNoteWin) {
      quickNoteWindow = null;
    }
  });
  quickNoteWindow = quickNoteWin;

  return quickNoteWin;
}

function createNoteSearchWindow() {
  if (noteSearchWindow && !noteSearchWindow.isDestroyed()) {
    return noteSearchWindow;
  }

  const searchWin = new BrowserWindow({
    width: 720,
    height: 520,
    minWidth: 520,
    minHeight: 360,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    backgroundColor: "#00000000",
    icon: APP_ICON_PATH,
    title: "Pesquisar notas - masterStudy",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  searchWin.removeMenu();
  setupWindowShortcuts(searchWin, { allowEscapeHide: true });
  loadStudyHubWindow(
    searchWin,
    "screen=dashboard&standalone=1&mode=note-search",
  );
  searchWin.once("ready-to-show", () => {
    searchWin.center();
    searchWin.show();
    searchWin.focus();
  });
  searchWin.on("closed", () => {
    if (noteSearchWindow === searchWin) {
      noteSearchWindow = null;
    }
  });
  noteSearchWindow = searchWin;
  return searchWin;
}

function createCommandPaletteWindow() {
  const existing = findUtilityWindow(UTILITY_WINDOW_TYPE.COMMAND_PALETTE);
  if (existing) {
    commandPaletteWindow = existing;
    existing.show();
    existing.focus();
    return existing;
  }
  const paletteWin = new BrowserWindow({
    width: 760,
    height: 560,
    minWidth: 520,
    minHeight: 360,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    backgroundColor: "#00000000",
    icon: APP_ICON_PATH,
    title: "Buscar no masterStudy",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  paletteWin.removeMenu();
  setupWindowShortcuts(paletteWin, { allowEscapeHide: true });
  paletteWin.studyhubUtilityType = UTILITY_WINDOW_TYPE.COMMAND_PALETTE;
  loadStudyHubWindow(
    paletteWin,
    "screen=today&standalone=1&mode=command-palette",
  );
  paletteWin.once("ready-to-show", () => {
    paletteWin.center();
    paletteWin.show();
    paletteWin.focus();
  });
  paletteWin.on("closed", () => {
    if (commandPaletteWindow === paletteWin) commandPaletteWindow = null;
  });
  commandPaletteWindow = paletteWin;
  return paletteWin;
}

function createQuickDrawWindow() {
  const existingWindow = findUtilityWindow(UTILITY_WINDOW_TYPE.QUICK_DRAW);
  if (existingWindow) {
    quickDrawWindow = existingWindow;
    return existingWindow;
  }

  const quickDrawWin = new BrowserWindow({
    width: 900,
    height: 640,
    minWidth: 520,
    minHeight: 420,
    autoHideMenuBar: true,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    show: false,
    backgroundColor: "#e8eaf0",
    icon: APP_ICON_PATH,
    title: "Desenho Rapido - masterStudy",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  quickDrawWin.removeMenu();
  setupWindowShortcuts(quickDrawWin, { allowEscapeHide: true });
  quickDrawWin.studyhubUtilityType = UTILITY_WINDOW_TYPE.QUICK_DRAW;
  wireWindowStateEvents(quickDrawWin);
  loadStudyHubWindow(quickDrawWin, "screen=whiteboard&mode=quick-draw");
  quickDrawWin.once("ready-to-show", () => {
    quickDrawWin.show();
    quickDrawWin.focus();
  });
  quickDrawWin.on("closed", () => {
    if (quickDrawWindow === quickDrawWin) {
      quickDrawWindow = null;
    }
  });
  quickDrawWindow = quickDrawWin;

  return quickDrawWin;
}

function createAiFlashcardWindow() {
  const existingWindow = findUtilityWindow(UTILITY_WINDOW_TYPE.AI_FLASHCARD);
  if (existingWindow) {
    aiFlashcardWindow = existingWindow;
    return existingWindow;
  }

  const aiFlashcardWin = new BrowserWindow({
    width: 580,
    height: 660,
    minWidth: 460,
    minHeight: 480,
    autoHideMenuBar: true,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    backgroundColor: "#e8eaf0",
    icon: APP_ICON_PATH,
    title: "Flashcard IA - masterStudy",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  aiFlashcardWin.removeMenu();
  setupWindowShortcuts(aiFlashcardWin, { allowEscapeHide: true });
  aiFlashcardWin.studyhubUtilityType = UTILITY_WINDOW_TYPE.AI_FLASHCARD;
  wireWindowStateEvents(aiFlashcardWin);
  loadStudyHubWindow(
    aiFlashcardWin,
    "screen=create_flashcards&standalone=1&mode=ai-quick-flashcard",
  );
  aiFlashcardWin.once("ready-to-show", () => {
    aiFlashcardWin.show();
    aiFlashcardWin.focus();
  });
  aiFlashcardWin.on("closed", () => {
    if (aiFlashcardWindow === aiFlashcardWin) {
      aiFlashcardWindow = null;
    }
  });
  aiFlashcardWindow = aiFlashcardWin;

  return aiFlashcardWin;
}

ipcMain.handle("window:openQuickNote", async (event) => {
  assertTrustedRenderer(event);
  toggleUtilityWindow(UTILITY_WINDOW_TYPE.QUICK_NOTE, createQuickNoteWindow);
});

ipcMain.handle("window:openQuickDraw", async (event) => {
  assertTrustedRenderer(event);
  toggleUtilityWindow(UTILITY_WINDOW_TYPE.QUICK_DRAW, createQuickDrawWindow);
});

ipcMain.handle("window:openAiFlashcard", async (event) => {
  assertTrustedRenderer(event);
  toggleUtilityWindow(
    UTILITY_WINDOW_TYPE.AI_FLASHCARD,
    createAiFlashcardWindow,
  );
});

function registerGlobalShortcuts() {
  globalShortcut.unregisterAll();

  const openCommandPalette = () => {
    const win = showMainWindow();
    if (win && !win.isDestroyed()) {
      if (win.webContents.isLoading()) {
        win.webContents.once("did-finish-load", () => {
          win.webContents.send("command-palette:open");
        });
      } else {
        win.webContents.send("command-palette:open");
      }
    }
  };

  const registrations = [
    ["commandPaletteShortcut", "CommandOrControl+Shift+Alt+0", openCommandPalette],
    ["stickyNotesShortcut", stickyNotesShortcut, openStickyNotesScreen],
    [
      "quickNoteShortcut",
      quickNoteShortcut,
      () =>
        (() => {
          if (noteSearchWindow && !noteSearchWindow.isDestroyed()) {
            noteSearchWindow.close();
            return;
          }
          createNoteSearchWindow();
        })(),
    ],
    [
      "quickDrawShortcut",
      quickDrawShortcut,
      () =>
        toggleUtilityWindow(
          UTILITY_WINDOW_TYPE.QUICK_DRAW,
          createQuickDrawWindow,
        ),
    ],
    [
      "aiFlashcardShortcut",
      aiFlashcardShortcut,
      () =>
        toggleUtilityWindow(
          UTILITY_WINDOW_TYPE.AI_FLASHCARD,
          createAiFlashcardWindow,
        ),
    ],
    [
      "translatorTextShortcut",
      translatorTextShortcut,
      () => showTranslatorPopup("text"),
    ],
    [
      "translatorOcrShortcut",
      translatorOcrShortcut,
      () => startTranslatorCapture(),
    ],
  ];

  const status = {};
  registrations.forEach(([name, accelerator, handler]) => {
    let registered = false;
    let errorMessage = "";
    try {
      if (accelerator && typeof accelerator === "string") {
        registered = globalShortcut.register(accelerator, handler);
      }
    } catch (error) {
      errorMessage = `${error?.message || error}`;
    }
    status[name] = { accelerator, registered, error: errorMessage };
    if (!registered && accelerator) {
      console.warn(
        `Nao foi possivel registrar o atalho global ${accelerator}.`,
      );
    }
  });
  return status;
}

function requestedStudyHubAction(commandLine = process.argv) {
  const environmentAction = `${process.env.STUDYHUB_ACTION || ""}`.trim();
  if (environmentAction) return environmentAction;
  const argument = commandLine.find((value) =>
    `${value}`.startsWith("--studyhub-action="),
  );
  return argument ? `${argument}`.slice("--studyhub-action=".length) : "";
}

function campusFlowUrlFromCommandLine(commandLine = process.argv) {
  return commandLine.find((value) => `${value}`.startsWith("campusflow://")) || "";
}

function openCampusFlowUrl(rawUrl) {
  let targetScreen = "";
  try {
    const parsed = new URL(rawUrl);
    const destination = `${parsed.hostname || parsed.pathname}`.replace(/^\//, "");
    if (destination === "tasks") targetScreen = "tasks";
    if (destination === "pomodoro") targetScreen = "pomodoro";
  } catch {
    return false;
  }
  if (!targetScreen) return false;
  const win = showMainWindow();
  const send = () => win?.webContents?.send("mac-widgets:navigate", targetScreen);
  if (win?.webContents?.isLoading()) win.webContents.once("did-finish-load", send);
  else send();
  return true;
}

function performStudyHubAction(action) {
  switch (action) {
    case "quick-note":
      if (noteSearchWindow && !noteSearchWindow.isDestroyed()) {
        noteSearchWindow.focus();
      } else {
        createNoteSearchWindow();
      }
      break;
    case "quick-draw":
      toggleUtilityWindow(
        UTILITY_WINDOW_TYPE.QUICK_DRAW,
        createQuickDrawWindow,
      );
      break;
    case "ai-flashcard":
      toggleUtilityWindow(
        UTILITY_WINDOW_TYPE.AI_FLASHCARD,
        createAiFlashcardWindow,
      );
      break;
    case "translator":
      showTranslatorPopup("text");
      break;
    case "translator-ocr":
      startTranslatorCapture();
      break;
    default:
      showMainWindow();
  }
}

ipcMain.handle("shortcuts:get", (event) => {
  assertTrustedRenderer(event);
  return { quickNoteShortcut, quickDrawShortcut, translatorTextShortcut, translatorOcrShortcut, aiFlashcardShortcut, stickyNotesShortcut };
});
ipcMain.handle("shortcuts:update", async (event, nextShortcuts = {}) => {
  assertTrustedRenderer(event);
  const previousShortcuts = {
    quickNoteShortcut,
    quickDrawShortcut,
    aiFlashcardShortcut,
    translatorTextShortcut,
    translatorOcrShortcut,
    stickyNotesShortcut,
  };
  quickNoteShortcut = normalizeShortcut(
    nextShortcuts.quickNoteShortcut,
    quickNoteShortcut || DEFAULT_QUICK_NOTE_SHORTCUT,
  );
  quickDrawShortcut = normalizeShortcut(
    nextShortcuts.quickDrawShortcut,
    quickDrawShortcut || DEFAULT_QUICK_DRAW_SHORTCUT,
  );
  aiFlashcardShortcut = normalizeShortcut(
    nextShortcuts.aiFlashcardShortcut,
    aiFlashcardShortcut || DEFAULT_AI_FLASHCARD_SHORTCUT,
  );
  translatorTextShortcut = normalizeShortcut(
    nextShortcuts.translatorTextShortcut,
    translatorTextShortcut || DEFAULT_TRANSLATOR_TEXT_SHORTCUT,
  );
  translatorOcrShortcut = normalizeShortcut(
    nextShortcuts.translatorOcrShortcut,
    translatorOcrShortcut || DEFAULT_TRANSLATOR_OCR_SHORTCUT,
  );
  stickyNotesShortcut = normalizeShortcut(
    nextShortcuts.stickyNotesShortcut,
    stickyNotesShortcut || DEFAULT_STICKY_NOTES_SHORTCUT,
  );
  const registrationStatus = registerGlobalShortcuts();
  const conflicts = Object.entries(registrationStatus)
    .filter(([, value]) => !value.registered)
    .map(([name, value]) => ({ name, accelerator: value.accelerator }));

  if (conflicts.length) {
    quickNoteShortcut = previousShortcuts.quickNoteShortcut;
    quickDrawShortcut = previousShortcuts.quickDrawShortcut;
    aiFlashcardShortcut = previousShortcuts.aiFlashcardShortcut;
    translatorTextShortcut = previousShortcuts.translatorTextShortcut;
    translatorOcrShortcut = previousShortcuts.translatorOcrShortcut;
    stickyNotesShortcut = previousShortcuts.stickyNotesShortcut;
    registerGlobalShortcuts();

    return {
      ...previousShortcuts,
      applied: false,
      conflicts,
      registrationStatus,
    };
  }

  refreshTrayMenu();

  return {
    quickNoteShortcut,
    quickDrawShortcut,
    translatorTextShortcut,
    translatorOcrShortcut,
    stickyNotesShortcut,
    applied: true,
    conflicts: [],
    registrationStatus,
  };
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 1280,
    minWidth: 1280,
    minHeight: 860,
    autoHideMenuBar: true,
    // macOS supplies real traffic lights; other platforms use our window controls.
    frame: process.platform === "darwin",
    ...(process.platform === "darwin" ? { titleBarStyle: "hiddenInset", trafficLightPosition: { x: 14, y: 17 } } : {}),
    backgroundColor: "#e8eaf0",
    icon: APP_ICON_PATH,
    title: "masterStudy",
    webPreferences: {
      // Os lembretes continuam avaliando os horários quando a janela fica oculta.
      backgroundThrottling: false,
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  win.removeMenu();
  setupWindowShortcuts(win);
  hardenStudyHubWindow(win);
  wireWindowStateEvents(win);
  mainWindow = win;

  if (isDev) {
    win.webContents.on("console-message", (_event, details, message, line, sourceId) => {
      if (details && typeof details === "object") {
        console.log(`[renderer:${details.level || "log"}] ${details.message || ""}`);
        return;
      }
      console.log(`[renderer:${details}] ${message || ""} (${sourceId || "renderer"}:${line || 0})`);
    });
    win.webContents.on(
      "did-fail-load",
      (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (isMainFrame !== false) {
          console.error(
            `[renderer] Falha ao carregar ${validatedURL}: ${errorCode} ${errorDescription}`,
          );
        }
      },
    );
    win.webContents.on("render-process-gone", (_event, details) => {
      console.error(`[renderer] Processo encerrado: ${details?.reason || "desconhecido"}`);
    });
  }

  // The close control sends the app to the tray. Utility windows and the
  // Pomodoro widget remain independent, and global shortcuts keep working.
  win.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });

  win.on("closed", () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  if (isDev) {
    win.loadURL("http://127.0.0.1:5173").catch((error) => {
      console.error(`[renderer] Não foi possível abrir a interface: ${error.message}`);
    });
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  return win;
}

let localBridgeServer = null;

ipcMain.handle("theme:set-native", (event, appearance) => {
  assertTrustedRenderer(event);
  if (!["dark", "light", "system"].includes(appearance)) return false;
  nativeTheme.themeSource = appearance;
  return true;
});

let pendingKnowledgeCaptures = [];

ipcMain.handle("capture:acknowledge", (event, id) => {
  assertTrustedRenderer(event);
  // Remove apenas capturas que a interface confirmou ter salvo no armazenamento.
  const remaining = pendingKnowledgeCaptures.filter(item => item.id !== id);
  const queuePath = path.join(app.getPath("userData"), "knowledge-capture-queue.json");
  fs.writeFileSync(`${queuePath}.tmp`, JSON.stringify(remaining));
  fs.renameSync(`${queuePath}.tmp`, queuePath);
  pendingKnowledgeCaptures = remaining;
  return { ok: true };
});

function startLocalBridgeServer() {
  if (localBridgeServer) return;
  try {
    const captureQueuePath = path.join(app.getPath("userData"), "knowledge-capture-queue.json");
    try { pendingKnowledgeCaptures = JSON.parse(fs.readFileSync(captureQueuePath, "utf8")); } catch { pendingKnowledgeCaptures = []; }
    if (!Array.isArray(pendingKnowledgeCaptures)) pendingKnowledgeCaptures = [];
    const http = require("node:http");
    localBridgeServer = http.createServer((req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.url === "/api/status" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, app: "masterStudy", version: "1.1.2" }));
        return;
      }

      if (req.url === "/api/captures" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, captures: pendingKnowledgeCaptures }));
        return;
      }

      if (req.url === "/api/capture" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => { body += chunk; if (Buffer.byteLength(body) > 2 * 1024 * 1024) req.destroy(); });
        req.on("end", () => {
          try {
            const data = require("./knowledge-capture.cjs").normalizeCapture(JSON.parse(body || "{}"));
            if (data && data.title) {
              if (!pendingKnowledgeCaptures.some(item => item.id === data.id)) pendingKnowledgeCaptures.push(data);
              // Salva antes de responder à extensão, inclusive se a interface estiver fechada.
              fs.mkdirSync(app.getPath("userData"), { recursive: true });
              fs.writeFileSync(`${captureQueuePath}.tmp`, JSON.stringify(pendingKnowledgeCaptures));
              fs.renameSync(`${captureQueuePath}.tmp`, captureQueuePath);
            }
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send("studyhub:knowledge-capture", data);
            }
            if (Notification.isSupported()) {
              new Notification({
                title: "masterStudy — Novo Conteúdo Capturado",
                body: data.title ? `${data.title} (${data.sourceHost || "Web"})` : "Conteúdo recebido da extensão",
                silent: false,
              }).show();
            }
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, message: "Captured successfully" }));
          } catch (err) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: err.message }));
          }
        });
        return;
      }

      res.writeHead(404);
      res.end();
    });

    localBridgeServer.on("error", (err) => {
      console.warn("masterStudy Bridge Server port occupied or unavailable:", err.message);
    });

    localBridgeServer.listen(47820, "127.0.0.1", () => {
      console.log("masterStudy Bridge Server listening on http://127.0.0.1:47820");
    });
  } catch (e) {
    console.warn("Could not start local bridge server:", e.message);
  }
}

const initialStudyHubAction = requestedStudyHubAction();
// The packaged app remains single-instance. Development must allow a fresh
// Electron process because an older dev window can outlive its Vite server;
// rejecting the new process made the dev runner shut the new server down and
// left the surviving window permanently blank.
const hasSingleInstanceLock = isDev
  ? true
  : app.requestSingleInstanceLock({
      studyhubAction: initialStudyHubAction,
    });

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine, _workingDirectory, data) => {
    const deepLink = campusFlowUrlFromCommandLine(commandLine);
    if (deepLink && app.isReady()) {
      openCampusFlowUrl(deepLink);
      return;
    }
    const action = data?.studyhubAction || requestedStudyHubAction(commandLine);
    if (app.isReady()) {
      if (action) {
        performStudyHubAction(action);
      } else {
        if (isDev && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.reloadIgnoringCache();
        }
        showMainWindow();
      }
    }
  });
}

app.on("open-url", (event, url) => {
  event.preventDefault();
  if (app.isReady()) openCampusFlowUrl(url);
  else app.once("ready", () => openCampusFlowUrl(url));
});

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return;
  app.setAsDefaultProtocolClient("campusflow");
  setupApplicationMenu();
  loadPathGrants();
  const authorizeRenderer = (event) => {
    assertTrustedRenderer(event);
    return true;
  };
  registerCodeLabIpc({ ipcMain, app, authorizeSender: authorizeRenderer });
  registerAcademicAiIpc({
    ipcMain,
    app,
    authorizeSender: authorizeRenderer,
    authorizeFilePath: (filePath) =>
      assertGrantedLocalPath(filePath, { forBinaryRead: true }),
  });
  registerLanguageLabIpc({ ipcMain, app, authorizeSender: authorizeRenderer });
  registerTranslatorIpc();
  configureRendererPermissions();
  protocol.handle("safe-file", (request) => {
    try {
      const parsedUrl = new URL(request.url);
      let filePath = decodeURIComponent(parsedUrl.pathname || "");

      if (/^\/[A-Za-z]:\//.test(filePath)) {
        filePath = filePath.slice(1);
      }

      const normalizedPath = assertGrantedLocalPath(filePath);
      return net.fetch(pathToFileURL(normalizedPath).toString());
    } catch (error) {
      console.error(error);
      return new Response("Arquivo não encontrado.", { status: 404 });
    }
  });

  createTray();
  createWindow();
  startLocalBridgeServer();
  registerGlobalShortcuts();
  if (initialStudyHubAction) {
    setImmediate(() => performStudyHubAction(initialStudyHubAction));
  }

  app.on("activate", () => {
    showMainWindow();
  });
});

app.on("before-quit", () => {
  // The native macOS quit paths reach this event before BrowserWindow's
  // close handler. Without this flag, closing is mistaken for "hide to tray".
  isQuitting = true;
});

app.on("window-all-closed", () => {
  // The application intentionally remains alive in the tray so shortcuts,
  // quick tools and the Pomodoro widget continue to work.
  if (isQuitting) {
    app.quit();
  }
});

app.on("will-quit", () => {
  isQuitting = true;
  globalShortcut.unregisterAll();
  closeTranslatorCapture();
  if (translatorService?.terminate) {
    Promise.resolve(translatorService.terminate()).catch(() => {});
  }
  tray?.destroy();
  tray = null;
  closeDatabase();
});
