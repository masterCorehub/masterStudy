/**
 * Local AI Engine & Content Extraction Service for StudyHub Knowledge Hub
 * Supports offline-first processing, Ollama/Local LLMs, YouTube parsing and active recall quiz generation.
 */

// Configuração padrão da IA Local
export const LOCAL_AI_CONFIG = {
  ollamaEndpoint: "http://localhost:11434",
  preferredModel: "llama3.2:3b",
  fallbackModel: "qwen2.5:3b",
};

/**
 * Verifica se o servidor local Ollama está online e retorna lista de modelos disponíveis
 */
export async function checkLocalAiStatus(endpoint = LOCAL_AI_CONFIG.ollamaEndpoint) {
  try {
    const res = await fetch(`${endpoint}/api/tags`, { method: "GET", signal: AbortSignal.timeout(1500) });
    if (res.ok) {
      const data = await res.json();
      return {
        online: true,
        models: (data.models || []).map((m) => m.name),
      };
    }
  } catch (err) {
    // Offline
  }
  return { online: false, models: [] };
}

/**
 * Executa um prompt no LLM Local (Ollama) com timeout
 */
export async function queryLocalAi({ prompt, systemPrompt, model, endpoint = LOCAL_AI_CONFIG.ollamaEndpoint }) {
  try {
    const status = await checkLocalAiStatus(endpoint);
    const modelToUse = model || (status.models.length > 0 ? status.models[0] : LOCAL_AI_CONFIG.preferredModel);

    const res = await fetch(`${endpoint}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelToUse,
        prompt,
        system: systemPrompt,
        stream: false,
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (!res.ok) {
      throw new Error(`Ollama error: HTTP ${res.status}`);
    }

    const data = await res.json();
    return data.response || "";
  } catch (error) {
    console.warn("Local AI offline or failed, falling back to heuristic engine:", error.message);
    return null;
  }
}

/**
 * Extrai o ID de um vídeo do YouTube a partir de qualquer formato de URL
 */
export function extractYouTubeVideoId(url) {
  if (!url) return null;
  const regExp = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/;
  const match = url.match(regExp);
  return match ? match[1] : null;
}

/**
 * Busca metadados e dados do YouTube (via noembed e páginas públicas)
 */
export async function fetchYouTubeDetails(urlOrId) {
  const videoId = extractYouTubeVideoId(urlOrId) || urlOrId;
  if (!videoId) return null;

  let title = "Vídeo do YouTube";
  let author = "YouTube";
  let thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

  try {
    const noembedRes = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (noembedRes.ok) {
      const data = await noembedRes.json();
      if (data.title) title = data.title;
      if (data.author_name) author = data.author_name;
      if (data.thumbnail_url) thumbnailUrl = data.thumbnail_url;
    }
  } catch {}

  return {
    videoId,
    title,
    author,
    thumbnailUrl,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    sourceHost: "YOUTUBE.COM",
  };
}

/**
 * Gera resumo conciso e detalhado com IA Local ou Heurística
 */
export async function generateContentSummary(title, content, sourceType = "web") {
  const cleanContent = (content || "").slice(0, 9000);

  // Tenta gerar via IA Local (Ollama)
  const aiStatus = await checkLocalAiStatus();
  if (aiStatus.online && aiStatus.models.length > 0) {
    const modelToUse = aiStatus.models.find(m => m.includes("llama") || m.includes("qwen") || m.includes("mistral")) || aiStatus.models[0];
    
    const prompt = `Você é um tutor acadêmico especialista. Analise o seguinte conteúdo de estudo intitulado "${title}":
---
${cleanContent}
---
Gere uma análise completa em Português estruturada no formato exato:

### RESUMO CONCISO
(3 a 6 tópicos em bullets '• ' com os conceitos e aprendizados fundamentais)

### RESUMO DETALHADO
(Resumo detalhado em Markdown com seções, conceitos técnicos explicados de forma clara, boas práticas e exemplos práticos)`;

    const aiResponse = await queryLocalAi({
      prompt,
      systemPrompt: "Você é um assistente acadêmico estruturado e didático. Responda em Markdown limpo.",
      model: modelToUse,
    });

    if (aiResponse) {
      const parts = aiResponse.split("### RESUMO DETALHADO");
      const concise = parts[0]?.replace("### RESUMO CONCISO", "").trim() || "";
      const detailed = parts[1]?.trim() || aiResponse;
      return { concise, detailed };
    }
  }

  // Fallback Heurístico Offline quando não houver LLM ativo
  const sentences = cleanContent
    .split(/(?<=[.?!])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 20 && s.length < 280);

  const topSentences = sentences.slice(0, 5);
  const concise = topSentences.map(s => `• ${s}`).join("\n") || `• Visão geral e conceitos fundamentais de ${title}.\n• Métodos, padrões e diretrizes práticas.`;

  const detailed = `## 📌 Conceitos-Chave: ${title}\n\n${cleanContent.slice(0, 800)}...\n\n### 💡 Pontos Principais para Estudo\n${sentences.slice(0, 8).map(s => `- **Tópico:** ${s}`).join("\n")}`;

  return { concise, detailed };
}

/**
 * Gera exclusivamente um resumo conciso e afiado com IA Local
 */
export async function generateConciseSummaryOnly(title, content) {
  const cleanContent = (content || "").slice(0, 9000);
  const aiStatus = await checkLocalAiStatus();
  if (aiStatus.online && aiStatus.models.length > 0) {
    const modelToUse = aiStatus.models.find(m => m.includes("llama") || m.includes("qwen") || m.includes("mistral")) || aiStatus.models[0];
    const prompt = `Você é um tutor especialista. Analise o seguinte conteúdo "${title}":
---
${cleanContent}
---
Gere um resumo altamente CONCISO e DIRETO AO PONTO em Português.
Forneça exatamente 3 a 5 pontos-chave em marcadores (bullet points '• ') destacando o essencial, conceitos centrais e conclusões fundamentais. Seja breve e informativo. Não inclua introduções longas.`;

    const aiResponse = await queryLocalAi({
      prompt,
      systemPrompt: "Você é um assistente acadêmico conciso. Responda apenas com os tópicos em bullets.",
      model: modelToUse,
    });

    if (aiResponse && aiResponse.trim()) {
      return aiResponse.trim();
    }
  }

  // Fallback heurístico offline
  const sentences = cleanContent
    .split(/(?<=[.?!])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 20 && s.length < 240);

  return sentences.slice(0, 5).map(s => `• ${s}`).join("\n") || `• Visão geral e conceitos fundamentais de ${title}.\n• Pontos de fixação para estudo ativo.`;
}

/**
 * Gera Quizzes de Repetição Espaçada com IA Local ou Heurística
 */
export async function generateContentQuizzes(title, content, count = 4) {
  const cleanContent = (content || "").slice(0, 7000);
  const aiStatus = await checkLocalAiStatus();

  if (aiStatus.online && aiStatus.models.length > 0) {
    const modelToUse = aiStatus.models[0];
    const prompt = `Com base no seguinte material de estudo sobre "${title}":
---
${cleanContent}
---
Gere exatamente ${count} perguntas de múltipla escolha para estudo ativo (active recall).
Responda APENAS com um array JSON no seguinte formato exato, sem texto antes ou depois:
[
  {
    "question": "Pergunta clara e objetiva sobre o conteúdo?",
    "options": ["Opção A (Correta)", "Opção B", "Opção C", "Opção D"],
    "answerIndex": 0,
    "explanation": "Explicação didática do motivo pelo qual a opção está correta.",
    "difficulty": "Médio"
  }
]`;

    const aiResponse = await queryLocalAi({
      prompt,
      systemPrompt: "Você é um gerador de testes acadêmicos. Responda exclusivamente em JSON válido.",
      model: modelToUse,
    });

    if (aiResponse) {
      try {
        const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed.map((q, idx) => ({
              id: `quiz-${Date.now()}-${idx}`,
              question: q.question || "Pergunta sobre o conteúdo",
              options: Array.isArray(q.options) && q.options.length === 4 ? q.options : ["Opção Correta", "Opção Incorreta", "Parcialmente Correta", "Inconclusiva"],
              answerIndex: typeof q.answerIndex === "number" ? q.answerIndex : 0,
              explanation: q.explanation || "Explicação baseada no texto.",
              difficulty: q.difficulty || "Médio",
              dueDate: Date.now(),
              repetition: 0,
              interval: 1,
              easeFactor: 2.5,
            }));
          }
        }
      } catch (err) {
        console.warn("Error parsing AI Quiz JSON:", err);
      }
    }
  }

  // Fallback Heurístico Inteligente
  return [
    {
      id: `quiz-${Date.now()}-1`,
      question: `Qual é o objetivo e conceito central abordado em "${title}"?`,
      options: [
        `Compreender e aplicar os fundamentos de ${title}`,
        "Uma definição genérica sem relação com o tópico",
        "Substituir métodos consolidados por abordagens obsoletas",
        "Nenhuma das alternativas anteriores"
      ],
      answerIndex: 0,
      explanation: `O material tem como foco o entendimento dos princípios fundamentais de ${title}.`,
      difficulty: "Fácil",
      dueDate: Date.now(),
      repetition: 0,
      interval: 1,
      easeFactor: 2.5,
    },
    {
      id: `quiz-${Date.now()}-2`,
      question: `De acordo com as boas práticas descritas em "${title}", qual é a abordagem recomendada?`,
      options: [
        "Aplicar estruturação modular, clareza e testes de validação",
        "Ignorar verificações de segurança e tipagem",
        "Executar código arbitrário sem tratamento de erros",
        "Evitar qualquer documentação ou testes"
      ],
      answerIndex: 0,
      explanation: "A estruturação modular e boas práticas garantem manutenibilidade e segurança no aprendizado.",
      difficulty: "Médio",
      dueDate: Date.now(),
      repetition: 0,
      interval: 1,
      easeFactor: 2.5,
    }
  ];
}

/**
 * Gera automaticamente tags e palavras-chave inteligentes com IA a partir do título e notas
 */
export async function generateAiTags(title = "", content = "") {
  const cleanTitle = String(title || "").trim();
  const cleanContent = String(content || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 3000);

  if (!cleanTitle && !cleanContent) return [];

  const aiStatus = await checkOllamaStatus();

  if (aiStatus.online && aiStatus.models.length > 0) {
    const modelToUse = aiStatus.models[0];
    const prompt = `Analise o seguinte título e anotações de estudo:
Título: "${cleanTitle}"
Conteúdo:
---
${cleanContent}
---
Gere entre 3 a 5 tags curtas, categorizadas e altamente relevantes sobre o tema abordado (em português, letras minúsculas, sem o caractere #, sem espaços por tag usando hífen se necessário, por exemplo: "javascript", "desenvolvimento-web", "algoritmos").
Responda EXCLUSIVAMENTE com um array JSON de strings no formato: ["tag1", "tag2", "tag3"]`;

    try {
      const aiResponse = await queryLocalAi({
        prompt,
        systemPrompt: "Você é um classificador acadêmico especializado em categorização e taxonomia. Responda apenas com um JSON array de tags válidas.",
        model: modelToUse,
      });

      if (aiResponse) {
        const jsonMatch = aiResponse.match(/\[[\s\S]*?\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed
              .map((t) => String(t).trim().toLowerCase().replace(/^#+/, "").replace(/\s+/g, "-"))
              .filter((t) => t.length >= 2 && t.length <= 30)
              .slice(0, 6);
          }
        }
      }
    } catch (err) {
      console.warn("AI tag generation error:", err);
    }
  }

  // Fallback heurístico inteligente para extração de tags relevantes
  const fullText = `${cleanTitle} ${cleanContent}`.toLowerCase();
  const stopWords = new Set([
    "de", "a", "o", "que", "e", "do", "da", "em", "um", "para", "é", "com", "não", "uma", "os", "no", "se", "na",
    "por", "mais", "as", "dos", "como", "mas", "foi", "ao", "ele", "das", "tem", "à", "seu", "sua", "ou", "ser",
    "quando", "muito", "nos", "já", "eu", "também", "só", "pelo", "pela", "até", "isso", "ela", "entre", "era",
    "depois", "sem", "mesmo", "aos", "ter", "seus", "quem", "nas", "me", "esse", "eles", "está", "você", "tinha",
    "foram", "essa", "num", "nem", "suas", "meu", "às", "minha", "têm", "numa", "pelos", "elas", "havia", "seja",
    "qual", "será", "nós", "tenho", "lhe", "deles", "essas", "esses", "pelas", "este", "fosse", "dele", "tu", "te",
    "vocês", "vos", "lhes", "meus", "minhas", "teu", "tua", "teus", "tuas", "nosso", "nossa", "nossos", "nossas",
    "dela", "delas", "esta", "estes", "estas", "aquele", "aquela", "aqueles", "aquelas", "isto", "aquilo", "estou",
    "está", "estamos", "estão", "estava", "estavam", "estávamos", "estive", "esteve", "estivemos", "estiveram",
    "the", "and", "in", "to", "of", "a", "is", "for", "on", "with", "this", "that", "it", "from", "as", "by",
    "sobre", "como", "onde", "qual", "quais", "porque", "porquê", "resumo", "anotações", "aula", "estudo"
  ]);

  const words = fullText
    .replace(/[^\w\s\u00C0-\u00FF-]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !stopWords.has(w));

  const freq = {};
  words.forEach((w) => {
    freq[w] = (freq[w] || 0) + 1;
  });

  const sorted = Object.keys(freq).sort((a, b) => freq[b] - freq[a]);
  const fallbackTags = sorted.slice(0, 4);

  return fallbackTags.length > 0 ? fallbackTags : [cleanTitle.toLowerCase().replace(/\s+/g, "-")].filter(Boolean);
}

/**
 * Limpa e formata o texto do Reader, removendo ruídos avulsos (redes sociais, inscrições,
 * pedidos de like, anúncios, rodapés, menus) e reestruturando a leitura em Markdown limpo.
 */
export async function cleanAndFormatReaderContent(title, content, sourceType = "web") {
  if (!content || !content.trim()) return content;

  // 1. Tenta limpar e reformatar usando o LLM Local
  const status = await checkLocalAiStatus();
  if (status.online) {
    try {
      const prompt = `Você é um editor e formatador acadêmico. Sua função é LIMPAR e REESTRUTURAR o texto abaixo para uma leitura limpa, focada e agradável no leitor de estudos (Reader).

Título do Material: "${title}"
Conteúdo Bruto Capturado:
---
${content.slice(0, 7500)}
---

DIRETRIZES DE LIMPEZA E FORMATAÇÃO:
1. Mantenha integralmente a essência, as informações, explicações, conceitos e dados do assunto.
2. REMOVA OBRIGATORIAMENTE tudo o que for avulso, lixo ou não relacionado ao tema, incluindo:
   - Pedidos de like, "inscreva-se", "deixe o seu like", "ative as notificações", "seja membro".
   - Links e divulgações de redes sociais (Instagram, Twitter/X, TikTok, canais parceiros, @arrobas).
   - Músicas de fundo, agradecimentos a patrocinadores e propagandas.
   - Resquícios de menus de navegação, cookies, rodapés de sites ou botões de compartilhamento.
   - Linhas avulsas de emojis ou marcadores soltos sem contexto.
3. Se for uma transcrição de fala ou artigo, organize em parágrafos coerentes, títulos (#, ##) se aplicável, e listas (-) para pontos importantes.
4. Retorne EXCLUSIVAMENTE o texto final limpo e formatado em Markdown, sem nenhuma frase de introdução ou conclusão.`;

      const cleaned = await queryLocalAi({
        prompt,
        systemPrompt: "Você é um assistente especializado em limpeza, curadoria e formatação de textos acadêmicos.",
      });

      if (cleaned && cleaned.trim().length > 30) {
        return cleaned.trim();
      }
    } catch (err) {
      console.warn("AI text cleaning error:", err);
    }
  }

  // 2. Fallback heurístico rigoroso para limpeza de ruídos comuns
  const noisePatterns = [
    /^(?:inscreva-se|inscreva\s*se|seja membro|deixe seu like|deixe o like|curta o v[ií]deo|compartilhe|ative o sininho|ativa o sino)[\s\S]*$/i,
    /^(?:siga[\s\S]*?(?:instagram|twitter|tiktok|facebook|redes sociais)|instagram:|twitter:|tiktok:|facebook:)[\s\S]*$/i,
    /^(?:m[uú]sica:|trilha sonora:|cr[eé]ditos:)[\s\S]*$/i,
    /^#\w+(\s+#\w+)*$/i,
    /^(?:leia tamb[eé]m|veja mais|assine nossa newsletter|cookies?|pol[ií]tica de privacidade|termos de uso)[\s\S]*$/i,
    /^[👉👈👍❤️💪🎥😱🕵️🎧]+\s*.*$/u,
    /^(?:mostrar transcri[cç][aã]o|esconder transcri[cç][aã]o|cap[ií]tulos|perguntar|fa[cç]a perguntas)[\s\S]*$/i,
  ];

  const lines = content.split("\n");
  const filteredLines = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    return !noisePatterns.some((pat) => pat.test(trimmed));
  });

  const joined = filteredLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return joined || content;
}

/**
 * Função unificada para gerar todo o resumo, notas e quizzes com IA
 */
export async function summarizeItemWithAi(item) {
  const title = item.title || "Conteúdo";
  const content = item.rawContent || item.summaryDetailed || item.markdownNotes || title;
  const sourceType = item.sourceType || "web";

  const { concise, detailed } = await generateContentSummary(title, content, sourceType);
  const tags = await generateAiTags(title, detailed || content);

  return {
    summaryConcise: concise,
    summaryDetailed: detailed,
    markdownNotes: `# ${title}\n\n${detailed}`,
    quizzes: item.quizzes || [],
    tags,
  };
}
