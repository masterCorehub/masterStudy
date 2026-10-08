const { contextBridge, ipcRenderer } = require("electron");

function toSerializableState(state) {
  return JSON.parse(
    JSON.stringify(state, (_key, value) =>
      typeof value === "function" ? undefined : value,
    ),
  );
}

async function invokeLanguageLab(channel, payload) {
  const response = await ipcRenderer.invoke(channel, payload);
  if (response?.ok === false) {
    const error = new Error(response.error?.message || "Falha no laboratório de idiomas.");
    Object.assign(error, response.error || {});
    throw error;
  }
  return response?.ok === true ? response.value : response;
}

contextBridge.exposeInMainWorld("studyhubDesktop", {
  platform: process.platform,
  setNativeTheme: (appearance) => ipcRenderer.invoke("theme:set-native", appearance),
  selectDirectory: () => ipcRenderer.invoke("dialog:openDirectory"),
  scanDirectory: (directoryPath) => ipcRenderer.invoke("dialog:scanDirectory", directoryPath),
  publicDrive: {
    list: (link) => ipcRenderer.invoke("books:drive-list", link),
    download: (file) => ipcRenderer.invoke("books:drive-download", file),
  },
  selectFile: (options) => ipcRenderer.invoke("dialog:openFile", options),
  openWhiteboardWindow: (lesson) =>
    ipcRenderer.invoke("window:openWhiteboard", lesson),
  openQuickNoteWindow: () => ipcRenderer.invoke("window:openQuickNote"),
  openQuickDrawWindow: () => ipcRenderer.invoke("window:openQuickDraw"),
  openAiFlashcardWindow: () => ipcRenderer.invoke("window:openAiFlashcard"),
  updateGlobalShortcuts: (shortcuts) =>
    ipcRenderer.invoke("shortcuts:update", shortcuts),
  getGlobalShortcuts: () => ipcRenderer.invoke("shortcuts:get"),
  acknowledgeKnowledgeCapture: (id) => ipcRenderer.invoke("capture:acknowledge", id),
  notifications: {
    show: (payload) => ipcRenderer.invoke("notifications:show", payload),
  },
  trayPopover: {
    action: (action) => ipcRenderer.invoke("tray-popover:action", action),
    onOpenSettings: (callback) => {
      const listener = () => callback();
      ipcRenderer.on("tray-popover:open-settings", listener);
      return () => ipcRenderer.removeListener("tray-popover:open-settings", listener);
    },
  },
  openNoteEditorWindow: (noteId) =>
    ipcRenderer.invoke("window:openNoteEditor", noteId),
  openBookReaderWindow: (bookId) =>
    ipcRenderer.invoke("window:openBookReader", bookId),
  openPomodoroWidget: () => ipcRenderer.invoke("window:openPomodoroWidget"),
  stickyNotes: {
    open: (noteId, options = {}) =>
      ipcRenderer.invoke("sticky-notes:open", noteId, options),
    setAlwaysOnTop: (enabled) =>
      ipcRenderer.invoke("sticky-notes:set-always-on-top", Boolean(enabled)),
    broadcastChange: (change) =>
      ipcRenderer.invoke("sticky-notes:changed", change),
    onChanged: (callback) => {
      const listener = (_event, change) => callback(change);
      ipcRenderer.on("sticky-notes:changed", listener);
      return () => ipcRenderer.removeListener("sticky-notes:changed", listener);
    },
  },
  pomodoroWidget: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    close: () => ipcRenderer.invoke("window:close"),
    openMain: () => ipcRenderer.invoke("window:openMainWindow"),
  },
  openExternal: (url) => ipcRenderer.invoke("app:openExternal", url),
  spotify: {
    status: () => ipcRenderer.invoke("spotify:status"),
    login: () => ipcRenderer.invoke("spotify:login"),
    logout: () => ipcRenderer.invoke("spotify:logout"),
    search: (query) => ipcRenderer.invoke("spotify:search", query),
    playback: () => ipcRenderer.invoke("spotify:playback"),
    play: (payload) => ipcRenderer.invoke("spotify:play", payload),
    pause: () => ipcRenderer.invoke("spotify:pause"),
    next: () => ipcRenderer.invoke("spotify:next"),
    previous: () => ipcRenderer.invoke("spotify:previous"),
    volume: (value) => ipcRenderer.invoke("spotify:volume", value),
  },
  openPath: (filePath) => ipcRenderer.invoke("app:openPath", filePath),
  readFileBinary: (filePath) => ipcRenderer.invoke("app:readFileBinary", filePath),
  saveNoteAsPdf: (payload) => ipcRenderer.invoke("note:save-as-pdf", payload),
  notifyStudyDataChanged: () => ipcRenderer.invoke("study-data:changed"),
  onKnowledgeCapture: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("studyhub:knowledge-capture", handler);
    return () => ipcRenderer.removeListener("studyhub:knowledge-capture", handler);
  },
  studyDatabase: {
    load: () => ipcRenderer.invoke("study-db:load"),
    save: (state) =>
      ipcRenderer.invoke("study-db:save", toSerializableState(state)),
    export: () => ipcRenderer.invoke("study-db:export"),
    import: () => ipcRenderer.invoke("study-db:import"),
  },
  notifyPomodoroCompletion: (completion) =>
    ipcRenderer.invoke("pomodoro:completed", completion),
  codeLab: {
    getEnvironment: () => ipcRenderer.invoke("csharp:environment"),
    getCatalog: () => ipcRenderer.invoke("csharp:catalog"),
    loadWorkspace: (challengeId) => ipcRenderer.invoke("csharp:workspace:load", challengeId),
    saveWorkspace: (challengeId, files) => ipcRenderer.invoke("csharp:workspace:save", { challengeId, files }),
    run: (payload) => ipcRenderer.invoke("csharp:run", payload),
    submit: (payload) => ipcRenderer.invoke("csharp:submit", payload),
    cancel: (requestId) => ipcRenderer.invoke("csharp:cancel", requestId),
    getOllamaStatus: () => ipcRenderer.invoke("ollama:status"),
    startOllama: () => ipcRenderer.invoke("ollama:start"),
    askTutor: (messages) => ipcRenderer.invoke("ollama:chat", messages),
  },
  academicAI: {
    status: () => ipcRenderer.invoke("academic-ai:status"),
    start: () => ipcRenderer.invoke("academic-ai:start"),
    getConfig: () => ipcRenderer.invoke("academic-ai:config:get"),
    saveConfig: (payload) => ipcRenderer.invoke("academic-ai:config:save", payload),
    testConfig: (payload) => ipcRenderer.invoke("academic-ai:config:test", payload),
    chat: (payload) => ipcRenderer.invoke("academic-ai:chat", payload),
    listSources: (subjectId) =>
      ipcRenderer.invoke("academic-ai:list-sources", subjectId),
    indexSources: (payload) =>
      ipcRenderer.invoke("academic-ai:index-sources", payload),
    removeSource: (sourceKey) =>
      ipcRenderer.invoke("academic-ai:remove-source", sourceKey),
    ask: (payload) => ipcRenderer.invoke("academic-ai:ask", payload),
    generate: (payload) => ipcRenderer.invoke("academic-ai:generate", payload),
    noteAction: (payload) =>
      ipcRenderer.invoke("academic-ai:note-action", payload),
    cancel: (requestId) => ipcRenderer.invoke("academic-ai:cancel", requestId),
  },
  languageLab: {
    getEnvironment: (options = {}) =>
      invokeLanguageLab("language-lab:environment", options),
    installWhisper: (options = {}) =>
      invokeLanguageLab("language-lab:whisper:install", options),
    importTranscript: (path) =>
      invokeLanguageLab("language-lab:transcript:import", { path }),
    transcribe: (payload) =>
      invokeLanguageLab("language-lab:media:transcribe", payload),
    transcribeRecording: (payload) =>
      invokeLanguageLab("language-lab:recording:transcribe", payload),
    extractClip: (payload) =>
      invokeLanguageLab("language-lab:audio:extract", payload),
    cancel: (requestId) =>
      invokeLanguageLab("language-lab:cancel", { requestId }),
    onProgress: (callback) => {
      const listener = (_event, progress) => callback(progress);
      ipcRenderer.on("language-lab:progress", listener);
      return () => ipcRenderer.removeListener("language-lab:progress", listener);
    },
  },
  translator: {
    getSession: () => ipcRenderer.invoke("translator:get-session"),
    translate: (payload) => ipcRenderer.invoke("translator:translate", payload),
    getCapture: () => ipcRenderer.invoke("translator:get-capture"),
    captureReady: () => ipcRenderer.invoke("translator:capture-ready"),
    completeSelection: (payload) =>
      ipcRenderer.invoke("translator:complete-selection", payload),
    cancelCapture: () => ipcRenderer.invoke("translator:cancel-capture"),
    startCapture: (options) => ipcRenderer.invoke("translator:start-capture", options),
    setCaptureMode: (mode) => ipcRenderer.invoke("translator:set-capture-mode", mode),
    retryOcr: () => ipcRenderer.invoke("translator:retry-ocr"),
    copyText: (text) => ipcRenderer.invoke("translator:copy-text", text),
    close: () => ipcRenderer.invoke("translator:close"),
    speak: (payload) => ipcRenderer.invoke("translator:speak", payload),
    stopSpeech: () => ipcRenderer.invoke("translator:stop-speech"),
    pauseSpeech: () => ipcRenderer.invoke("translator:pause-speech"),
    resumeSpeech: () => ipcRenderer.invoke("translator:resume-speech"),
    onSessionChanged: (callback) => {
      const listener = (_event, nextSession) => callback(nextSession);
      ipcRenderer.on("translator:session-changed", listener);
      return () =>
        ipcRenderer.removeListener("translator:session-changed", listener);
    },
  },
  journal: {
    sendToApple: (payload) => ipcRenderer.invoke("journal:send-to-apple", payload),
  },
  macWidgets: {
    update: (state) => ipcRenderer.invoke("mac-widgets:update", state),
    onNavigate: (callback) => {
      const listener = (_event, screen) => callback(screen);
      ipcRenderer.on("mac-widgets:navigate", listener);
      return () => ipcRenderer.removeListener("mac-widgets:navigate", listener);
    },
  },
  onStudyDataChanged: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("study-data:changed", listener);
    return () => ipcRenderer.removeListener("study-data:changed", listener);
  },
  onNotesSearch: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("notes:search", listener);
    return () => ipcRenderer.removeListener("notes:search", listener);
  },
  onCommandPalette: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("command-palette:open", listener);
    return () => ipcRenderer.removeListener("command-palette:open", listener);
  },
  closeCommandPalette: () => ipcRenderer.invoke("window:closeCommandPalette"),
  openMainWindow: () => ipcRenderer.invoke("window:openMainWindow"),
  windowControls: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("window:toggleMaximize"),
    close: () => ipcRenderer.invoke("window:close"),
    isMaximized: () => ipcRenderer.invoke("window:isMaximized"),
    onMaximizedChange: (callback) => {
      const listener = (_event, isMaximized) => callback(isMaximized);
      ipcRenderer.on("window:maximized-change", listener);
      return () =>
        ipcRenderer.removeListener("window:maximized-change", listener);
    },
  },
});
