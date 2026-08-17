// StudyHub Sidepanel Controller (Cross-Browser: Chrome, Edge, Firefox)
const browserAPI = typeof browser !== "undefined" ? browser : chrome;
let currentData = null;
let currentMainTab = "summary"; // "summary" | "transcript" | "chat"
let currentSummaryMode = "concise"; // "concise" | "detailed"
let chatHistory = [];

// ─── 1. Carregamento e Recepção dos Dados da Página ──────────────────────────
function requestPageData() {
  // 1. Envia via postMessage se estiver dentro de um iframe
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: "STUDYHUB_GET_PAGE_DATA" }, "*");
  }

  // 2. Envia via browser.tabs se estiver como sidebar nativa
  try {
    if (browserAPI.tabs?.query) {
      browserAPI.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
        if (tab?.id) {
          browserAPI.tabs.sendMessage(tab.id, { type: "EXTRACT_PAGE_DATA" }).then((response) => {
            if (response?.success && response.data) {
              receivePageData(response.data);
            } else {
              fallbackFromTab(tab);
            }
          }).catch(() => fallbackFromTab(tab));
        }
      }).catch(() => {});
    }
  } catch {}
}

function receivePageData(data) {
  if (!data) return;
  currentData = data;
  renderPageData(currentData);
}

// Escuta postMessage da página hospedeira (in-page iframe)
window.addEventListener("message", (event) => {
  if (event.data?.type === "STUDYHUB_PAGE_DATA_RESPONSE" && event.data.data) {
    receivePageData(event.data.data);
  }
});

function fallbackFromTab(tab) {
  if (!tab || currentData) return;
  const isYouTube = tab.url?.includes("youtube.com/watch") || tab.url?.includes("youtu.be");
  let ytId = "";
  try {
    const u = new URL(tab.url);
    ytId = u.searchParams.get("v") || (u.hostname === "youtu.be" ? u.pathname.slice(1) : "");
  } catch {}

  const fallback = {
    title: tab.title ? tab.title.replace(" - YouTube", "") : "Página Web",
    url: tab.url || "",
    sourceHost: tab.url ? new URL(tab.url).hostname.replace("www.", "").toUpperCase() : "WEB",
    thumbnailUrl: isYouTube && ytId ? `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg` : "",
    rawContent: tab.title || "",
    timestamps: [],
  };
  receivePageData(fallback);
}

function useEmergencyFallback() {
  if (currentData) return;
  const fallback = {
    title: "Conteúdo Web Detectado",
    url: window.location.href,
    sourceHost: "WEB",
    thumbnailUrl: "",
    rawContent: "Conteúdo pronto para captura e geração de resumo.",
    timestamps: [],
  };
  receivePageData(fallback);
}

// Polling ativo de inicialização para garantir carregamento instantâneo
let pollAttempts = 0;
const pollInterval = setInterval(() => {
  if (currentData) {
    clearInterval(pollInterval);
    return;
  }
  pollAttempts++;
  requestPageData();
  if (pollAttempts >= 4) {
    clearInterval(pollInterval);
    if (!currentData) useEmergencyFallback();
  }
}, 250);

// ─── 2. Renderização da Interface ───────────────────────────────────────────
function renderPageData(data) {
  const titleEl = document.getElementById("pageTitle");
  const thumbEl = document.getElementById("pageThumb");
  const tagContainer = document.getElementById("tagContainer");

  if (titleEl) {
    titleEl.innerText = data.title || "Conteúdo";
    titleEl.title = data.title || "";
  }
  
  if (thumbEl) {
    if (data.thumbnailUrl) {
      thumbEl.src = data.thumbnailUrl;
      thumbEl.style.display = "block";
    } else {
      thumbEl.src = "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=200";
    }
  }

  if (tagContainer) {
    const hostTag = data.sourceHost ? data.sourceHost.toLowerCase().split(".")[0] : "web";
    tagContainer.innerHTML = `
      <span class="tag">#${hostTag}</span>
      <span class="tag">#estudo</span>
    `;
  }

  renderActiveTab();
  initChatPrompt();
}

function renderActiveTab() {
  const summaryControls = document.getElementById("summaryControls");
  const summaryEl = document.getElementById("summaryText");
  if (!summaryEl || !currentData) return;

  if (currentMainTab === "summary") {
    if (summaryControls) summaryControls.style.display = "flex";
    renderSummaryView();
  } else if (currentMainTab === "transcript") {
    if (summaryControls) summaryControls.style.display = "none";
    renderTranscriptView();
  } else if (currentMainTab === "chat") {
    if (summaryControls) summaryControls.style.display = "none";
    renderChatView();
  }

  attachTimestampClickListeners();
}

function renderSummaryView() {
  const summaryEl = document.getElementById("summaryText");
  if (!summaryEl || !currentData) return;

  if (currentSummaryMode === "concise") {
    let timestampsHtml = "";
    if (currentData.timestamps && currentData.timestamps.length > 0) {
      timestampsHtml = "<ul>" + currentData.timestamps.map(ts => `
        <li style="margin-bottom: 7px; display: flex; align-items: baseline; gap: 6px;">
          <span class="timestamp-pill" data-time="${ts.time}">${ts.label}</span>
          <span style="font-weight: 600; color: #f1f5f9; cursor: pointer;" data-time="${ts.time}">${ts.text}</span>
        </li>
      `).join("") + "</ul>";
    } else {
      const lines = (currentData.rawContent || currentData.title)
        .split("\n")
        .map(l => l.trim())
        .filter(l => l.length > 25)
        .slice(0, 5);

      timestampsHtml = "<ul>" + (lines.length > 0 ? lines : [
        `Visão geral e conceitos fundamentais de ${currentData.title}.`,
        `Estruturas e tópicos centrais identificados na página.`,
        `Material sintetizado para estudo ativo e retenção.`
      ]).map(line => `<li style="margin-bottom: 6px; color: #e2e8f0;">• ${line}</li>`).join("") + "</ul>";
    }

    const transcriptBadge = currentData.hasFullTranscript
      ? `<div style="font-size: 11px; font-weight: 700; color: #10b981; margin-bottom: 8px; display: flex; align-items: center; gap: 5px;">
          <span>✓ Transcrição da fala extraída com sucesso</span>
         </div>`
      : "";

    summaryEl.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 8px; color: #38bdf8; display: flex; align-items: center; gap: 6px;">
        <span>⚡ Visão Geral em Tópicos</span>
      </div>
      ${transcriptBadge}
      ${timestampsHtml}
    `;
  } else {
    summaryEl.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 8px; color: #38bdf8;">📖 Resumo Analítico Detalhado</div>
      <p style="margin-bottom: 8px; line-height: 1.6; color: #cbd5e1;">
        Este material aborda os conceitos aprofundados sobre <strong>${currentData.title}</strong>, incluindo arquitetura, padrões e pontos-chave.
      </p>
      <div style="padding: 8px 10px; background: rgba(56, 189, 248, 0.08); border-left: 3px solid #38bdf8; border-radius: 6px; font-size: 11px; margin-top: 8px; color: #94a3b8;">
        Clique em <strong>Salvar no StudyHub</strong> para exportar para seu cofre de notas e gerar quizzes automáticos de repetição espaçada.
      </div>
    `;
  }
}

function renderTranscriptView() {
  const summaryEl = document.getElementById("summaryText");
  if (!summaryEl || !currentData) return;

  const raw = currentData.rawContent || "";
  const paragraphs = raw.split("\n\n").filter(Boolean);

  if (paragraphs.length === 0) {
    summaryEl.innerHTML = `
      <div style="color: #94a3b8; font-size: 12px; text-align: center; padding: 20px 0;">
        Nenhuma transcrição disponível para este conteúdo.
      </div>
    `;
    return;
  }

  let html = `<div style="font-weight: bold; margin-bottom: 10px; color: #38bdf8;">🎙️ Transcrição Completa da Fala</div>`;
  html += `<div style="display: flex; flex-direction: column; gap: 8px;">`;

  paragraphs.forEach(para => {
    const match = para.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*([\s\S]+)$/);
    if (match) {
      const label = match[1];
      const text = match[2];
      const parts = label.split(":").map(Number);
      const secs = parts.length === 3 ? parts[0]*3600 + parts[1]*60 + parts[2] : parts[0]*60 + parts[1];

      html += `
        <div style="display: flex; gap: 8px; align-items: baseline; padding: 4px 6px; border-radius: 6px; background: #131822;">
          <span class="timestamp-pill" data-time="${secs}">${label}</span>
          <span style="color: #e2e8f0; line-height: 1.5; font-size: 12px;">${text}</span>
        </div>
      `;
    } else {
      html += `<div style="color: #cbd5e1; line-height: 1.5; font-size: 12px; padding: 4px 6px;">${para}</div>`;
    }
  });

  html += `</div>`;
  summaryEl.innerHTML = html;
}

function renderChatView() {
  const summaryEl = document.getElementById("summaryText");
  if (!summaryEl) return;

  let html = `<div style="font-weight: bold; margin-bottom: 8px; color: #38bdf8;">Chat com IA</div>`;
  html += `<div style="display: flex; flex-direction: column; gap: 8px;">`;

  chatHistory.forEach(msg => {
    if (msg.role === "user") {
      html += `<div style="font-size: 11px; color: #94a3b8;"><strong>Você:</strong> ${msg.text}</div>`;
    } else {
      html += `<div style="background: #18202c; padding: 10px; border-radius: 8px; border: 1px solid #243040; color: #f1f5f9; font-size: 12px; line-height: 1.5;">${msg.text}</div>`;
    }
  });

  html += `</div>`;
  summaryEl.innerHTML = html;
}

function attachTimestampClickListeners() {
  document.querySelectorAll("[data-time]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      const time = parseInt(el.getAttribute("data-time"), 10);
      if (!isNaN(time)) seekVideo(time);
    });
  });
}

function seekVideo(timeInSeconds) {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: "STUDYHUB_SEEK_VIDEO", time: timeInSeconds }, "*");
  }
  try {
    if (browserAPI.tabs?.query) {
      browserAPI.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
        if (tab?.id) {
          browserAPI.tabs.sendMessage(tab.id, { type: "SEEK_YOUTUBE", time: timeInSeconds }).catch(() => {});
        }
      }).catch(() => {});
    }
  } catch {}
}

// ─── 3. Alternância de Abas Principais e Modos de Resumo ────────────────────
document.getElementById("tabSummary")?.addEventListener("click", () => {
  currentMainTab = "summary";
  updateTabHeaderUI("tabSummary");
  renderActiveTab();
});

document.getElementById("tabTranscript")?.addEventListener("click", () => {
  currentMainTab = "transcript";
  updateTabHeaderUI("tabTranscript");
  renderActiveTab();
});

document.getElementById("tabChat")?.addEventListener("click", () => {
  currentMainTab = "chat";
  updateTabHeaderUI("tabChat");
  renderActiveTab();
});

function updateTabHeaderUI(activeId) {
  ["tabSummary", "tabTranscript", "tabChat"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (id === activeId) el.classList.add("active");
      else el.classList.remove("active");
    }
  });
}

document.getElementById("btnConcise")?.addEventListener("click", () => {
  currentSummaryMode = "concise";
  document.getElementById("btnConcise")?.classList.add("active");
  document.getElementById("btnDetailed")?.classList.remove("active");
  renderActiveTab();
});

document.getElementById("btnDetailed")?.addEventListener("click", () => {
  currentSummaryMode = "detailed";
  document.getElementById("btnDetailed")?.classList.add("active");
  document.getElementById("btnConcise")?.classList.remove("active");
  renderActiveTab();
});

// Botão de Fechar o Painel Lateral
document.getElementById("btnClosePanel")?.addEventListener("click", () => {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: "STUDYHUB_CLOSE_PANEL" }, "*");
  }
  try {
    if (browserAPI.tabs?.query) {
      browserAPI.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
        if (tab?.id) {
          browserAPI.tabs.sendMessage(tab.id, { type: "TOGGLE_RIGHT_PANEL" }).catch(() => {});
        }
      }).catch(() => {});
    }
  } catch {}
});

// ─── 4. Chat com IA no Painel ───────────────────────────────────────────────
function initChatPrompt() {
  if (chatHistory.length === 0 && currentData) {
    chatHistory.push({
      role: "assistant",
      text: `Olá! Posso responder qualquer dúvida sobre **${currentData.title}** ou gerar resumos específicos para você.`,
    });
  }
}

async function handleSendChat() {
  const input = document.getElementById("chatInput");
  const text = input?.value?.trim();
  if (!text || !currentData) return;

  input.value = "";
  chatHistory.push({ role: "user", text });
  currentMainTab = "chat";
  updateTabHeaderUI("tabChat");
  renderActiveTab();

  let replyText = "";
  try {
    const res = await fetch("http://127.0.0.1:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3",
        prompt: `Com base em "${currentData.title}": ${currentData.rawContent.slice(0, 1500)}. Pergunta: "${text}". Responda de forma concisa e didática.`,
        stream: false,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      replyText = data.response;
    }
  } catch {
    replyText = `Com base em **${currentData.title}**, o ponto chave é: ${currentData.rawContent ? currentData.rawContent.slice(0, 180) + "..." : "O material apresenta conceitos relevantes para seu estudo ativo."}`;
  }

  chatHistory.push({ role: "assistant", text: replyText });
  renderActiveTab();
}

document.getElementById("btnSendChat")?.addEventListener("click", handleSendChat);
document.getElementById("chatInput")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleSendChat();
});

// ─── 5. Envio para o StudyHub Desktop via Bridge Local (127.0.0.1:47820) ─────
document.getElementById("btnSaveToApp")?.addEventListener("click", async () => {
  if (!currentData) return;

  const btn = document.getElementById("btnSaveToApp");
  const toast = document.getElementById("toastMessage");
  if (btn) btn.innerText = "Salvando...";

  const conciseSummary = currentData.timestamps && currentData.timestamps.length > 0
    ? currentData.timestamps.map(t => `• [${t.label}] ${t.text}`).join("\n")
    : `• Conceito principal e resumo de ${currentData.title}.\n• Pontos de estudo ativo extraídos da página.`;

  const detailedSummary = `### Resumo Estruturado: ${currentData.title}\n\n` +
    (currentData.rawContent || "Conteúdo capturado diretamente do navegador.") +
    (currentData.timestamps && currentData.timestamps.length > 0
      ? `\n\n### Capítulos & Timestamps:\n` + currentData.timestamps.map(t => `- **${t.label}**: ${t.text}`).join("\n")
      : "");

  const payload = {
    id: `kitem-${Date.now()}`,
    title: currentData.title,
    sourceUrl: currentData.url,
    sourceType: currentData.type || "web",
    sourceHost: currentData.sourceHost,
    thumbnailUrl: currentData.thumbnailUrl,
    capturedAt: Date.now(),
    rawContent: currentData.rawContent,
    summaryConcise: conciseSummary,
    summaryDetailed: detailedSummary,
    timestamps: currentData.timestamps || [],
    markdownNotes: "",
    tags: [currentData.sourceHost?.toLowerCase().split(".")[0] || "web", "captura"],
    quizzes: [],
  };

  // 1. Tenta enviar via background service-worker (imune a bloqueios de Mixed Content HTTPS)
  let savedOk = false;
  try {
    const response = await new Promise((resolve) => {
      browserAPI.runtime?.sendMessage(
        { type: "SAVE_KNOWLEDGE_CAPTURE", payload },
        (res) => resolve(res)
      );
      setTimeout(() => resolve(null), 3000);
    });

    if (response?.success) {
      savedOk = true;
    }
  } catch (e) {
    console.warn("Background proxy save error:", e);
  }

  // 2. Se falhou pelo service worker, tenta fetch direto
  if (!savedOk) {
    try {
      const res = await fetch("http://127.0.0.1:47820/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) savedOk = true;
    } catch (e) {
      console.warn("Direct fetch save error:", e);
    }
  }

  if (savedOk) {
    if (btn) {
      btn.innerText = "✓ Salvo no StudyHub!";
      btn.classList.add("saved");
    }
    if (toast) {
      toast.innerText = "✓ Sincronizado instantaneamente no StudyHub!";
      toast.style.display = "block";
      setTimeout(() => { toast.style.display = "none"; }, 3500);
    }
  } else {
    // 3. Fallback: salva no storage local da extensão
    try {
      await browserAPI.storage?.local?.set?.({ [`capture_${Date.now()}`]: payload });
    } catch {}
    if (btn) {
      btn.innerText = "✓ Salvo na Extensão";
      btn.classList.add("saved");
    }
    if (toast) {
      toast.innerText = "Salvo na extensão. Abra o StudyHub Desktop para receber.";
      toast.style.display = "block";
      setTimeout(() => { toast.style.display = "none"; }, 4500);
    }
  }
});

// Inicialização imediata
document.addEventListener("DOMContentLoaded", requestPageData);
requestPageData();
setTimeout(requestPageData, 100);
