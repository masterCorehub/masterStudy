// StudyHub Extension Background Service Worker (Cross-Browser: Chrome & Firefox)
const browserAPI = typeof browser !== "undefined" ? browser : chrome;

// Capturas pendentes usam o mesmo ID em novas tentativas, evitando duplicações.
async function flushPendingCaptures() {
  const saved = await browserAPI.storage.local.get(null);
  for (const [key, payload] of Object.entries(saved)) {
    if (!key.startsWith("capture_") || !payload?.title) continue;
    try {
      const response = await fetch("http://127.0.0.1:47820/api/capture", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) break;
      await browserAPI.storage.local.remove(key);
    } catch { break; }
  }
}
browserAPI.runtime.onStartup?.addListener(() => flushPendingCaptures().catch(() => {}));
// Alarms acorda o service worker; setInterval não sobreviveria à suspensão do Chrome.
if (browserAPI.alarms) {
  Promise.resolve(browserAPI.alarms.create("retry-masterstudy-captures", { periodInMinutes: 1 })).catch(() => {});
  browserAPI.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === "retry-masterstudy-captures") flushPendingCaptures().catch(() => {});
  });
}
flushPendingCaptures().catch(() => {});

// Abre o painel lateral automaticamente no Chrome se sidePanel for suportado
if (typeof chrome !== "undefined" && chrome.sidePanel?.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}

// Ao clicar no ícone da extensão na barra de ferramentas
if (browserAPI.action?.onClicked) {
  browserAPI.action.onClicked.addListener(async (tab) => {
    if (!tab?.id) return;
    try {
      // Tenta abrir o painel lateral injetado na direita da página
      await browserAPI.tabs.sendMessage(tab.id, { type: "TOGGLE_RIGHT_PANEL" });
    } catch (e) {
      // Se não conseguir enviar ao content script, tenta abrir o sidePanel / sidebar nativo
      if (typeof chrome !== "undefined" && chrome.sidePanel?.open) {
        await chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
      } else if (typeof browser !== "undefined" && browser.sidebarAction?.open) {
        await browser.sidebarAction.open().catch(() => {});
      }
    }
  });
}

// Mensagens internas e proxy de rede (para evitar bloqueios de Mixed Content HTTPS na página)
browserAPI.runtime?.onMessage?.addListener((message, sender, sendResponse) => {
  if (message.type === "SAVE_KNOWLEDGE_CAPTURE") {
    flushPendingCaptures().catch(() => {});
    fetch("http://127.0.0.1:47820/api/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message.payload),
    })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json().catch(() => ({ ok: true }));
          sendResponse({ success: true, data });
        } else {
          sendResponse({ success: false, error: `HTTP ${res.status}` });
        }
      })
      .catch((err) => {
        sendResponse({ success: false, error: err.message });
      });
    return true; // Mantém a porta de mensagem aberta para resposta assíncrona
  }

  if (message.type === "PING") {
    flushPendingCaptures().catch(() => {});
    sendResponse({ status: "PONG" });
  }
  return true;
});
