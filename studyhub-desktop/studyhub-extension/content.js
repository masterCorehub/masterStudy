// StudyHub Content Extractor & In-Page Right Drawer Script
const browserAPI = typeof browser !== "undefined" ? browser : chrome;

// ─── 1. Formatador de Transcrição com Timestamps no Texto (Estilo Recall.it) ─
function formatTranscriptWithTimestamps(rawSegments, groupSeconds = 30) {
  if (!rawSegments || rawSegments.length === 0) {
    return { fullText: "", formattedText: "", timestamps: [] };
  }

  const paragraphs = [];
  const keyTimestamps = [];
  
  let currentGroupStart = rawSegments[0].time;
  let currentGroupLabel = rawSegments[0].label;
  let currentGroupTexts = [];

  for (let i = 0; i < rawSegments.length; i++) {
    const seg = rawSegments[i];
    currentGroupTexts.push(seg.text);

    const isGroupEnd = (seg.time - currentGroupStart >= groupSeconds) || (i === rawSegments.length - 1);
    if (isGroupEnd) {
      const paragraphText = currentGroupTexts.join(" ").trim();
      paragraphs.push(`[${currentGroupLabel}] ${paragraphText}`);
      keyTimestamps.push({
        time: currentGroupStart,
        label: currentGroupLabel,
        text: paragraphText.slice(0, 95) + (paragraphText.length > 95 ? "..." : "")
      });

      if (i < rawSegments.length - 1) {
        currentGroupStart = rawSegments[i + 1].time;
        currentGroupLabel = rawSegments[i + 1].label;
        currentGroupTexts = [];
      }
    }
  }

  return {
    fullText: rawSegments.map(s => s.text).join(" "),
    formattedText: paragraphs.join("\n\n"),
    timestamps: keyTimestamps,
  };
}

// Função que executa no contexto MAIN da página para acessar captionTracks do player e fazer fetch direto
async function extractViaPageContextInjection() {
  return new Promise((resolve) => {
    const handler = (e) => {
      if (e.data && e.data.type === "STUDYHUB_PAGE_TRANSCRIPT_RESULT") {
        window.removeEventListener("message", handler);
        resolve(e.data.segments || []);
      }
    };
    window.addEventListener("message", handler);

    setTimeout(() => {
      window.removeEventListener("message", handler);
      resolve([]);
    }, 2500);

    const script = document.createElement("script");
    script.textContent = `
      (async function() {
        try {
          let tracks = null;
          const flexy = document.querySelector("ytd-watch-flexy");
          if (flexy && flexy.playerData && flexy.playerData.captions) {
            tracks = flexy.playerData.captions.playerCaptionsTracklistRenderer?.captionTracks;
          }
          if (!tracks && window.ytInitialPlayerResponse && window.ytInitialPlayerResponse.captions) {
            tracks = window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer?.captionTracks;
          }

          if (tracks && tracks.length > 0) {
            const track = tracks.find(t => t.languageCode === "pt" || t.languageCode === "pt-BR") ||
                          tracks.find(t => t.languageCode === "en") ||
                          tracks[0];

            if (track && track.baseUrl) {
              const res = await fetch(track.baseUrl);
              if (res.ok) {
                const xml = await res.text();
                const segments = [];
                const matches = Array.from(xml.matchAll(/<text start="([\\d.]+)" dur="([\\d.]+)"[^>]*>(.*?)<\\/text>/g));
                for (const m of matches) {
                  const startSec = parseFloat(m[1]);
                  const rawText = m[3]
                    .replace(/&amp;/g, "&")
                    .replace(/&quot;/g, '"')
                    .replace(/&#39;/g, "'")
                    .replace(/&lt;/g, "<")
                    .replace(/&gt;/g, ">")
                    .replace(/&nbsp;/g, " ")
                    .replace(/\\n/g, " ")
                    .trim();
                  if (rawText) {
                    const mins = Math.floor(startSec / 60);
                    const secs = Math.floor(startSec % 60);
                    const label = mins.toString().padStart(2, '0') + ':' + secs.toString().padStart(2, '0');
                    segments.push({ time: Math.floor(startSec), label, text: rawText });
                  }
                }

                if (segments.length > 0) {
                  window.postMessage({ type: "STUDYHUB_PAGE_TRANSCRIPT_RESULT", segments }, "*");
                  return;
                }
              }
            }
          }
        } catch (err) {
          console.warn("[StudyHub Injected] Error fetching captions:", err);
        }
        window.postMessage({ type: "STUDYHUB_PAGE_TRANSCRIPT_RESULT", segments: [] }, "*");
      })();
    `;

    (document.head || document.documentElement).appendChild(script);
    script.remove();
  });
}

// ─── 2. Extração Completa de Transcrição e Legendas do YouTube ───────────────
async function extractYouTubeTranscript() {
  let rawSegments = [];

  // Função para ler diretamente os elementos <transcript-segment-view-model> do DOM do YouTube
  function queryDomTranscriptElements() {
    const segments = [];
    const elements = document.querySelectorAll(
      "transcript-segment-view-model, .ytwTranscriptSegmentViewModelHost, ytd-transcript-segment-renderer"
    );

    elements.forEach((el) => {
      // 1. Timestamp: .ytwTranscriptSegmentViewModelTimestamp ou .segment-timestamp
      const timeEl = el.querySelector(
        ".ytwTranscriptSegmentViewModelTimestamp, .segment-timestamp, [class*='SegmentViewModelTimestamp'], [class*='timestamp']"
      );
      // 2. Texto: span.ytAttributedStringHost ou [role="text"] ou .segment-text
      const textEl = el.querySelector(
        ".ytAttributedStringHost, [role='text'], .segment-text, span"
      );

      const timeStr = timeEl ? (timeEl.innerText || timeEl.textContent || "").trim() : "";
      const textStr = textEl ? (textEl.innerText || textEl.textContent || "").trim() : "";

      if (textStr && timeStr && !segments.some(s => s.label === timeStr && s.text === textStr)) {
        const parts = timeStr.split(":").map(p => parseInt(p, 10));
        let secs = 0;
        if (parts.length === 3) secs = parts[0] * 3600 + parts[1] * 60 + parts[2];
        else if (parts.length === 2) secs = parts[0] * 60 + parts[1];
        segments.push({ time: secs, label: timeStr, text: textStr });
      }
    });

    return segments;
  }

  // PASSO 1: Tenta ler se os elementos <transcript-segment-view-model> já estão no DOM
  rawSegments = queryDomTranscriptElements();

  // PASSO 2: Se ainda não estão no DOM, clica para abrir a transcrição e aguarda
  if (rawSegments.length === 0) {
    try {
      // 1. Expande a descrição se estiver colapsada
      const expandBtn = document.querySelector(
        "#expand, #description-inline-expander #expand, tp-yt-paper-button#expand, ytd-text-inline-expander #expand"
      );
      if (expandBtn) expandBtn.click();
      await new Promise(r => setTimeout(r, 200));

      // 2. Clica no botão "Mostrar transcrição"
      const transcriptBtn = document.querySelector(
        "button[aria-label*='transcrição' i], button[aria-label*='transcript' i], ytd-video-description-transcript-section-renderer button, ytd-button-renderer#primary-button button, [aria-label*='Mostrar transcrição' i], ytd-transcript-search-panel-renderer button"
      );
      if (transcriptBtn) {
        transcriptBtn.click();
      }

      // 3. Polling ativo até os elementos <transcript-segment-view-model> surgirem (até 3 segundos)
      for (let attempt = 0; attempt < 15; attempt++) {
        await new Promise(r => setTimeout(r, 200));
        rawSegments = queryDomTranscriptElements();
        if (rawSegments.length > 0) break;
      }
    } catch (e) {
      console.warn("[StudyHub] Erro ao abrir painel de transcrição no DOM:", e);
    }
  }

  // PASSO 3: Fallback via injeção no contexto MAIN (se o DOM não tiver o painel aberto)
  if (rawSegments.length === 0) {
    try {
      const injectedSegments = await extractViaPageContextInjection();
      if (injectedSegments && injectedSegments.length > 0) {
        rawSegments = injectedSegments;
      }
    } catch (e) {
      console.warn("[StudyHub] Erro no método injetado:", e);
    }
  }

  return formatTranscriptWithTimestamps(rawSegments, 25);
}

// ─── 3. Extração de Metadados da Página ─────────────────────────────────────
async function extractPageMetadata() {
  try {
    const url = window.location.href;
    const isYouTube = url.includes("youtube.com/watch") || url.includes("youtu.be/");
    
    if (isYouTube) {
      const title = document.querySelector("h1.ytd-watch-metadata yt-formatted-string")?.innerText || 
                    document.querySelector("h1.title")?.innerText ||
                    document.querySelector("#title h1")?.innerText ||
                    document.title.replace(" - YouTube", "") || 
                    "Vídeo do YouTube";
      
      const channelName = document.querySelector("#channel-name a")?.innerText || 
                          document.querySelector("#owner-name a")?.innerText || 
                          "YouTube";
      
      let videoId = "";
      try {
        const u = new URL(url);
        videoId = u.searchParams.get("v") || 
                  (u.hostname === "youtu.be" ? u.pathname.slice(1) : "");
      } catch {}

      const thumbnailUrl = videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : "";

      // 1. Extração de capítulos nativos do YouTube
      const fallbackTimestamps = [];
      const chapterElements = document.querySelectorAll("ytd-macro-markers-list-item-renderer, ytd-chapter-renderer");
      if (chapterElements && chapterElements.length > 0) {
        chapterElements.forEach((el) => {
          const timeStr = el.querySelector("#time, .ytd-macro-markers-list-item-renderer #time")?.innerText?.trim();
          const textStr = el.querySelector("#details h4, #title")?.innerText?.trim();
          if (timeStr && textStr) {
            const parts = timeStr.split(":").map(p => parseInt(p, 10));
            let secs = 0;
            if (parts.length === 3) secs = parts[0] * 3600 + parts[1] * 60 + parts[2];
            else if (parts.length === 2) secs = parts[0] * 60 + parts[1];
            fallbackTimestamps.push({ time: secs, label: timeStr, text: textStr });
          }
        });
      }

      // 2. Extrai a transcrição completa falada no vídeo com timestamps
      const transcriptData = await extractYouTubeTranscript();

function cleanYouTubeDescription(text) {
  if (!text) return "";
  return text
    .replace(/Mostrar transcrição/gi, "")
    .replace(/Mostrar menos/gi, "")
    .replace(/Acompanhe usando a transcrição\./gi, "")
    .replace(/Tenha respostas para suas dúvidas[\s\S]*?Faça perguntas/gi, "")
    .trim();
}

      const rawDescription = document.querySelector("#description-inline-expander")?.innerText || 
                             document.querySelector("#description")?.innerText || "";
      const descriptionSnippet = cleanYouTubeDescription(rawDescription);

      // Se houver transcrição completa, usa o texto formatado com timestamps [00:00]
      const hasFullTranscript = !!(transcriptData.formattedText && transcriptData.formattedText.length > 50);
      const rawContent = hasFullTranscript 
        ? transcriptData.formattedText 
        : (descriptionSnippet.slice(0, 4000) || title);

      const finalTimestamps = transcriptData.timestamps.length > 0 
        ? transcriptData.timestamps 
        : fallbackTimestamps;

      return {
        type: "youtube",
        url,
        title: title.trim(),
        sourceHost: "YOUTUBE.COM",
        channelName: channelName.trim(),
        thumbnailUrl,
        rawContent,
        hasFullTranscript,
        timestamps: finalTimestamps.slice(0, 40),
      };
    }

    // Extração de Artigo Geral / Medium / Wikipedia / Notícias
    const title = document.querySelector("h1")?.innerText || document.title || "Artigo Web";
    const mainImage = document.querySelector("meta[property='og:image']")?.content || 
                      document.querySelector("meta[name='twitter:image']")?.content || 
                      document.querySelector("article img")?.src || "";
    
    const host = window.location.hostname.replace("www.", "").toUpperCase();
    
    const textBlocks = Array.from(document.querySelectorAll("article h2, article h3, article p, article pre, main p, .post-content p, p"))
      .map(el => el.innerText.trim())
      .filter(t => t.length > 25);

    const rawContent = textBlocks.slice(0, 25).join("\n\n");

    return {
      type: host.includes("WIKIPEDIA") ? "wikipedia" : "web",
      url,
      title: title.trim(),
      sourceHost: host,
      thumbnailUrl: mainImage,
      rawContent: rawContent || title,
      hasFullTranscript: true,
      timestamps: [],
    };
  } catch (err) {
    console.error("StudyHub content extraction error:", err);
    return {
      type: "web",
      url: window.location.href,
      title: document.title || "Página Web",
      sourceHost: window.location.hostname.replace("www.", "").toUpperCase(),
      thumbnailUrl: "",
      rawContent: document.title || "",
      hasFullTranscript: false,
      timestamps: [],
    };
  }
}

function seekVideoPlayer(timeInSeconds) {
  try {
    const video = document.querySelector("video");
    if (video) {
      video.currentTime = timeInSeconds;
      video.play().catch(() => {});
      return true;
    }
  } catch (err) {
    console.warn("Could not seek HTML5 video:", err);
  }
  return false;
}

// ─── 4. Injeção do Painel Lateral na Direita da Página (Overlay) ────────────
let panelIframe = null;
let floatingTriggerBtn = null;
let isPanelOpen = false;

function createRightPanelDrawer() {
  if (document.getElementById("studyhub-right-panel-container")) return;

  const container = document.createElement("div");
  container.id = "studyhub-right-panel-container";
  container.style.cssText = `
    position: fixed;
    top: 0;
    right: -420px;
    width: 400px;
    height: 100vh;
    z-index: 2147483640;
    box-shadow: -8px 0 32px rgba(0, 0, 0, 0.45);
    transition: right 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    background: #0d131a;
    border-left: 1px solid #1f2937;
    display: flex;
    flex-direction: column;
  `;

  panelIframe = document.createElement("iframe");
  panelIframe.src = browserAPI.runtime.getURL("sidepanel.html");
  panelIframe.style.cssText = `
    width: 100%;
    height: 100%;
    border: none;
    background: transparent;
  `;
  panelIframe.onload = () => {
    setTimeout(notifyIframePageData, 100);
    setTimeout(notifyIframePageData, 700);
  };

  container.appendChild(panelIframe);
  document.body.appendChild(container);

  // Botão flutuante rápido
  floatingTriggerBtn = document.createElement("button");
  floatingTriggerBtn.id = "studyhub-floating-trigger";
  floatingTriggerBtn.innerHTML = "⚡ StudyHub";
  floatingTriggerBtn.style.cssText = `
    position: fixed;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    z-index: 2147483639;
    background: #0284c7;
    color: #ffffff;
    padding: 10px 14px;
    border-radius: 12px 0 0 12px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-right: none;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
    transition: transform 0.2s ease, background 0.2s;
    user-select: none;
  `;

  floatingTriggerBtn.addEventListener("mouseenter", () => {
    floatingTriggerBtn.style.background = "#0369a1";
    floatingTriggerBtn.style.transform = "translateY(-50%) scale(1.05)";
  });
  floatingTriggerBtn.addEventListener("mouseleave", () => {
    floatingTriggerBtn.style.background = "#0284c7";
    floatingTriggerBtn.style.transform = "translateY(-50%) scale(1)";
  });

  floatingTriggerBtn.addEventListener("click", () => {
    toggleRightPanel();
  });

  document.body.appendChild(floatingTriggerBtn);
}

function toggleRightPanel(forceState) {
  const container = document.getElementById("studyhub-right-panel-container");
  if (!container) return;

  isPanelOpen = typeof forceState === "boolean" ? forceState : !isPanelOpen;
  if (isPanelOpen) {
    container.style.right = "0px";
    if (floatingTriggerBtn) floatingTriggerBtn.style.display = "none";
    notifyIframePageData();
  } else {
    container.style.right = "-420px";
    if (floatingTriggerBtn) floatingTriggerBtn.style.display = "block";
  }
}

async function notifyIframePageData() {
  if (panelIframe && panelIframe.contentWindow) {
    const data = await extractPageMetadata();
    panelIframe.contentWindow.postMessage({
      type: "STUDYHUB_PAGE_DATA_RESPONSE",
      data,
    }, "*");
  }
}

// Escuta postMessage da página
window.addEventListener("message", (event) => {
  if (!event.data) return;
  if (event.data.type === "STUDYHUB_GET_PAGE_DATA") {
    notifyIframePageData();
  } else if (event.data.type === "STUDYHUB_SEEK_VIDEO") {
    seekVideoPlayer(event.data.time);
  } else if (event.data.type === "STUDYHUB_CLOSE_PANEL") {
    toggleRightPanel(false);
  }
});

// Atualiza dados quando YouTube muda de vídeo dinamicamente (SPA)
document.addEventListener("yt-navigate-finish", () => {
  if (isPanelOpen) {
    setTimeout(notifyIframePageData, 600);
    setTimeout(notifyIframePageData, 1500);
  }
});

// Atalho de Teclado Alt + S para abrir/fechar o painel na direita
window.addEventListener("keydown", (e) => {
  if (e.altKey && (e.key === "s" || e.key === "S")) {
    e.preventDefault();
    toggleRightPanel();
  }
});

// Inicializa a injeção do painel na direita
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", createRightPanelDrawer);
} else {
  createRightPanelDrawer();
}

// ─── 5. Mensagens e Comandos IPC da Extensão ─────────────────────────────────
browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "EXTRACT_PAGE_DATA") {
    extractPageMetadata().then((data) => {
      sendResponse({ success: true, data });
    });
    return true;
  } else if (request.type === "TOGGLE_RIGHT_PANEL") {
    toggleRightPanel();
    sendResponse({ success: true, isOpen: isPanelOpen });
  } else if (request.type === "SEEK_YOUTUBE") {
    seekVideoPlayer(request.time);
    sendResponse({ success: true });
  }
  return true;
});
