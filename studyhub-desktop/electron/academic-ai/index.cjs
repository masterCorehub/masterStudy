const crypto = require("node:crypto");
const dns = require("node:dns");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { ensureDatabase } = require("../storage/study-db.cjs");
const {
  cancelOllamaRequest,
  chatWithOllama,
  getOllamaStatus,
  startOllama,
} = require("../ai/ollama-service.cjs");

const MAX_INLINE_CONTENT = 2 * 1024 * 1024;
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_WEB_CONTENT = 2 * 1024 * 1024;
const ALLOWED_FILE_EXTENSIONS = new Set([".pdf", ".txt", ".md"]);
const FTS_STOP_WORDS = new Set([
  "a",
  "ao",
  "aos",
  "as",
  "com",
  "como",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "essa",
  "esse",
  "esta",
  "este",
  "eu",
  "me",
  "minha",
  "meu",
  "na",
  "nas",
  "no",
  "nos",
  "o",
  "os",
  "para",
  "por",
  "qual",
  "que",
  "sobre",
  "um",
  "uma",
]);

const assertIdentifier = (value, label) => {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > 180) {
    throw new Error(`${label} inválido.`);
  }
  return normalized;
};

const cleanText = (value = "") =>
  String(value)
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

function chunkText(text, options = {}) {
  const source = cleanText(text);
  if (!source) return [];
  const maxLength = Math.max(400, Number(options.maxLength || 1_200));
  const overlap = Math.min(
    Math.max(0, Number(options.overlap || 180)),
    Math.floor(maxLength / 3),
  );
  const chunks = [];
  let start = 0;
  while (start < source.length) {
    let end = Math.min(source.length, start + maxLength);
    if (end < source.length) {
      const paragraphBreak = source.lastIndexOf("\n", end);
      const sentenceBreak = Math.max(
        source.lastIndexOf(". ", end),
        source.lastIndexOf("? ", end),
        source.lastIndexOf("! ", end),
      );
      const preferred = Math.max(paragraphBreak, sentenceBreak);
      if (preferred > start + maxLength * 0.55) end = preferred + 1;
    }
    const content = source.slice(start, end).trim();
    if (content) chunks.push(content);
    if (end >= source.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}

function buildFtsQuery(value) {
  const tokens = cleanText(value)
    .toLocaleLowerCase("pt-BR")
    .normalize("NFKC")
    .match(/[\p{L}\p{N}]{2,}/gu);
  return [...new Set(tokens || [])]
    .filter((token) => !FTS_STOP_WORDS.has(token))
    .slice(0, 12)
    .map((token) => `"${token.replace(/"/g, "")}"*`)
    .join(" OR ");
}

const hashContent = (segments) =>
  crypto
    .createHash("sha256")
    .update(segments.map((segment) => `${segment.locator}\n${segment.content}`).join("\n\n"))
    .digest("hex");

async function extractPdf(filePath) {
  const buffer = await fs.promises.readFile(filePath);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  try {
    const document = await loadingTask.promise;
    const segments = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const content = cleanText(
        textContent.items.map((item) => item.str || "").join(" "),
      );
      if (content) segments.push({ locator: `Página ${pageNumber}`, content });
    }
    if (!segments.length) {
      throw new Error(
        "Este PDF não possui texto selecionável. Use OCR ou adicione uma versão com texto.",
      );
    }
    return segments;
  } finally {
    await loadingTask.destroy().catch(() => {});
  }
}

const decodeHtmlEntities = (value) =>
  String(value)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );

const htmlToText = (html) =>
  cleanText(
    decodeHtmlEntities(
      String(html)
        .replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
        .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, " "),
    ),
  );

function isPrivateAddress(address) {
  const normalized = String(address || "").toLowerCase().split("%")[0];
  if (net.isIPv4(normalized)) {
    const [a, b] = normalized.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (net.isIPv6(normalized)) {
    if (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      /^fe[89ab]/.test(normalized)
    ) {
      return true;
    }
    const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    return mapped ? isPrivateAddress(mapped) : false;
  }
  return true;
}

async function assertPublicWebUrl(input) {
  const url = input instanceof URL ? input : new URL(String(input || ""));
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("A fonte deve usar um link HTTP ou HTTPS público.");
  }
  if (url.hostname === "localhost" || url.hostname.endsWith(".localhost")) {
    throw new Error("Links para a rede local não podem ser indexados.");
  }
  const addresses = await dns.promises.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("Links para endereços privados ou locais não podem ser indexados.");
  }
  return url;
}

async function extractWebPage(source = {}) {
  let url;
  try {
    url = await assertPublicWebUrl(String(source.url || ""));
  } catch {
    throw new Error("O link deve apontar para uma página pública válida.");
  }

  let response;
  for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
    response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers: { "User-Agent": "StudyHub Academic AI/1.1" },
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get("location");
    if (!location || redirectCount === 5) throw new Error("A página possui redirecionamentos demais.");
    url = await assertPublicWebUrl(new URL(location, url));
  }
  if (!response.ok) {
    throw new Error(`Não foi possível acessar o link (HTTP ${response.status}).`);
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_WEB_CONTENT) {
    throw new Error("A página excede o limite de 2 MB.");
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_WEB_CONTENT) {
    throw new Error("A página excede o limite de 2 MB.");
  }

  const contentType = response.headers.get("content-type") || "";
  const raw = buffer.toString("utf8");
  const content = /text\/html|application\/xhtml\+xml/i.test(contentType)
    ? htmlToText(raw)
    : cleanText(raw);
  if (!content) throw new Error("A página não possui texto legível.");
  return [{ locator: response.url || url.toString(), content }];
}

async function extractSource(source = {}, authorizeFilePath) {
  const kind = String(source.kind || "note");
  if (kind === "link") return extractWebPage(source);
  if (kind !== "file") {
    const content = cleanText(source.content);
    if (!content) throw new Error("A fonte selecionada está vazia.");
    if (Buffer.byteLength(content, "utf8") > MAX_INLINE_CONTENT) {
      throw new Error("A fonte selecionada excede o limite de 2 MB.");
    }
    return [{ locator: source.locator || "Conteúdo", content }];
  }

  const requestedPath = path.resolve(String(source.path || ""));
  const filePath =
    typeof authorizeFilePath === "function"
      ? authorizeFilePath(requestedPath)
      : requestedPath;
  const stats = await fs.promises.stat(filePath).catch(() => null);
  if (!stats?.isFile()) throw new Error(`Arquivo não encontrado: ${source.path}`);
  if (stats.size > MAX_FILE_SIZE) {
    throw new Error(`O arquivo ${path.basename(filePath)} excede 100 MB.`);
  }
  const extension = path.extname(filePath).toLowerCase();
  if (!ALLOWED_FILE_EXTENSIONS.has(extension)) {
    throw new Error(
      `Formato ${extension || "desconhecido"} não suportado. Use PDF, TXT ou Markdown.`,
    );
  }
  if (extension === ".pdf") return extractPdf(filePath);
  const content = cleanText(await fs.promises.readFile(filePath, "utf8"));
  if (!content) throw new Error("O arquivo selecionado está vazio.");
  return [{ locator: source.locator || path.basename(filePath), content }];
}

function listSources(app, subjectId) {
  const db = ensureDatabase(app);
  const normalizedSubjectId = assertIdentifier(subjectId, "Matéria");
  return db
    .prepare(
      `SELECT source_key AS sourceKey, subject_id AS subjectId,
              semester_id AS semesterId, kind, title, path, locator,
              content_hash AS contentHash, indexed_at AS indexedAt, metadata
         FROM academic_ai_sources
        WHERE subject_id = ?
        ORDER BY indexed_at DESC`,
    )
    .all(normalizedSubjectId)
    .map((row) => ({
      ...row,
      metadata: (() => {
        try {
          return JSON.parse(row.metadata || "{}");
        } catch {
          return {};
        }
      })(),
    }));
}

async function indexSources(app, payload = {}, authorizeFilePath) {
  const db = ensureDatabase(app);
  const subjectId = assertIdentifier(payload.subjectId, "Matéria");
  const semesterId = assertIdentifier(payload.semesterId, "Semestre");
  const sources = Array.isArray(payload.sources) ? payload.sources.slice(0, 50) : [];
  if (!sources.length) throw new Error("Selecione pelo menos uma fonte.");
  const sourceStatement = db.prepare(
    `INSERT OR REPLACE INTO academic_ai_sources
       (source_key, subject_id, semester_id, kind, title, path, locator,
        content_hash, indexed_at, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const chunkStatement = db.prepare(
    `INSERT INTO academic_ai_chunks
       (source_key, subject_id, semester_id, title, locator, content)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const results = [];

  for (const source of sources) {
    const sourceKey = assertIdentifier(source.id, "Fonte");
    try {
      const segments = await extractSource(source, authorizeFilePath);
      const contentHash = hashContent(segments);
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare("DELETE FROM academic_ai_chunks WHERE source_key = ?").run(
          sourceKey,
        );
        sourceStatement.run(
          sourceKey,
          subjectId,
          semesterId,
          String(source.kind || "note"),
          String(source.title || "Fonte sem título").slice(0, 500),
          source.path ? path.resolve(String(source.path)) : null,
          source.locator || null,
          contentHash,
          Date.now(),
          JSON.stringify({
            noteId: source.noteId || null,
            lessonId: source.lessonId || null,
            url: source.url || null,
          }),
        );
        let chunkCount = 0;
        for (const segment of segments) {
          const chunks = chunkText(segment.content);
          chunks.forEach((content, index) => {
            chunkStatement.run(
              sourceKey,
              subjectId,
              semesterId,
              String(source.title || "Fonte sem título").slice(0, 500),
              `${segment.locator || source.locator || "Conteúdo"}${chunks.length > 1 ? ` · trecho ${index + 1}` : ""}`,
              content,
            );
            chunkCount += 1;
          });
        }
        db.exec("COMMIT");
        results.push({ sourceKey, ok: true, chunkCount });
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    } catch (error) {
      results.push({ sourceKey, ok: false, error: error.message });
    }
  }
  if (!results.some((result) => result.ok)) {
    throw new Error(results[0]?.error || "Nenhuma fonte pôde ser indexada.");
  }
  return { results, sources: listSources(app, subjectId) };
}

function removeSource(app, sourceKey) {
  const db = ensureDatabase(app);
  const key = assertIdentifier(sourceKey, "Fonte");
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM academic_ai_chunks WHERE source_key = ?").run(key);
    const result = db
      .prepare("DELETE FROM academic_ai_sources WHERE source_key = ?")
      .run(key);
    db.exec("COMMIT");
    return { removed: result.changes > 0 };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function normalizeSourceKeys(sourceKeys) {
  if (!Array.isArray(sourceKeys)) return null;
  return [...new Set(sourceKeys.map((key) => assertIdentifier(key, "Fonte")))].slice(
    0,
    50,
  );
}

function retrieveRelevantChunks(
  db,
  { subjectId, semesterId, question, sourceKeys, limit = 6 },
) {
  const query = buildFtsQuery(question);
  if (!query) return [];
  const keys = normalizeSourceKeys(sourceKeys);
  if (keys?.length === 0) return [];
  const sourceFilter = keys
    ? ` AND source_key IN (${keys.map(() => "?").join(", ")})`
    : "";
  try {
    return db
      .prepare(
        `SELECT rowid, source_key AS sourceKey, title, locator, content,
                bm25(academic_ai_chunks) AS score
           FROM academic_ai_chunks
          WHERE academic_ai_chunks MATCH ?
            AND subject_id = ?
            AND semester_id = ?
            ${sourceFilter}
          ORDER BY score
          LIMIT ?`,
      )
      .all(query, subjectId, semesterId, ...(keys || []), limit);
  } catch {
    return [];
  }
}

function retrieveSubjectFallbackChunks(
  db,
  { subjectId, semesterId, sourceKeys, limit = 6 },
) {
  const keys = normalizeSourceKeys(sourceKeys);
  if (keys?.length === 0) return [];
  const sourceFilter = keys
    ? ` AND source_key IN (${keys.map(() => "?").join(", ")})`
    : "";
  return db
    .prepare(
      `SELECT rowid, source_key AS sourceKey, title, locator, content,
              NULL AS score
         FROM academic_ai_chunks
        WHERE subject_id = ?
          AND semester_id = ?
          ${sourceFilter}
        ORDER BY source_key, rowid
        LIMIT ?`,
    )
    .all(subjectId, semesterId, ...(keys || []), limit);
}

function buildContext(chunks) {
  return chunks
    .map(
      (chunk, index) =>
        `[${index + 1}] ${chunk.title} — ${chunk.locator || "Conteúdo"}\n${chunk.content}`,
    )
    .join("\n\n");
}

async function chatUntilComplete(config, options = {}) {
  const maxContinuations = Math.max(
    0,
    Math.min(4, Number(options.maxContinuations ?? 3)),
  );
  const messages = [...(config.messages || [])];
  let content = "";
  let continuationCount = 0;
  let response = null;

  while (continuationCount <= maxContinuations) {
    response = await chatWithOllama({ ...config, messages });
    const fragment = String(response.message || "");
    content += fragment;

    if (response.doneReason !== "length") break;
    if (continuationCount >= maxContinuations) break;

    messages.push(
      { role: "assistant", content: fragment },
      {
        role: "user",
        content:
          "Continue exatamente do ponto em que parou. Não repita o texto anterior, não recomece e conclua a resposta.",
      },
    );
    continuationCount += 1;
  }

  return {
    ...response,
    message: content,
    continuationCount,
    truncated: response?.doneReason === "length",
  };
}

async function ask(app, payload = {}) {
  const db = ensureDatabase(app);
  const subjectId = assertIdentifier(payload.subjectId, "Matéria");
  const semesterId = assertIdentifier(payload.semesterId, "Semestre");
  const question = cleanText(payload.question).slice(0, 8_000);
  if (!question) throw new Error("Digite uma pergunta.");
  let chunks = retrieveRelevantChunks(db, {
    subjectId,
    semesterId,
    question,
    sourceKeys: payload.sourceIds,
    limit: 6,
  });
  let retrievalMode = "fts";
  if (!chunks.length) {
    chunks = retrieveSubjectFallbackChunks(db, {
      subjectId,
      semesterId,
      sourceKeys: payload.sourceIds,
      limit: 6,
    });
    retrievalMode = "subject-fallback";
  }
  if (!chunks.length) {
    return {
      answer:
        "Não tenho essa informação nos arquivos da matéria.",
      citations: [],
      grounded: false,
      retrievalMode: "none",
    };
  }
  const history = Array.isArray(payload.history)
    ? payload.history
        .slice(-10)
        .map((msg) => ({
          role: msg.role === "user" ? "user" : "assistant",
          content: cleanText(msg.content).slice(0, 4_000),
        }))
        .filter((msg) => msg.content)
    : [];

  const requestId = payload.requestId || `academic-ask-${Date.now()}`;
  const response = await chatUntilComplete({
    model: payload.model,
    requestId,
    messages: [
      {
        role: "system",
        content:
          "REGRAS OBRIGATÓRIAS:\n" +
          "1. Você é um assistente acadêmico estrito. Responda em português baseando-se ÚNICA E EXCLUSIVAMENTE no CONTEXTO fornecido dos arquivos e fontes da matéria.\n" +
          "2. NÃO use seu conhecimento geral ou conhecimento prévio externo sob nenhuma hipótese.\n" +
          "3. Se a informação necessária para responder à pergunta NÃO estiver presente nos trechos do contexto, ou se o assunto não tiver sido falado/mencionado nos arquivos da matéria, responda OBRIGATORIAMENTE APENAS: 'Não tenho essa informação nos arquivos da matéria.'\n" +
          "4. Se a informação estiver no contexto, cite as fontes utilizando [1], [2], etc.",
      },
      ...history,
      {
        role: "user",
        content: `CONTEXTO:\n${buildContext(chunks)}\n\nPERGUNTA:\n${question}`,
      },
    ],
    timeout: 180_000,
    options: { temperature: 0.2, num_ctx: 8_192, num_predict: 1_200 },
  });
  return {
    answer: response.message,
    model: response.model,
    grounded: true,
    retrievalMode,
    continuationCount: response.continuationCount,
    truncated: response.truncated,
    citations: chunks.map((chunk) => ({
      sourceId: chunk.sourceKey,
      title: chunk.title,
      locator: chunk.locator,
    })),
  };
}

function getGenerationChunks(db, subjectId, semesterId, sourceKeys) {
  const keys = normalizeSourceKeys(sourceKeys);
  if (keys?.length === 0) return [];
  const sourceFilter = keys
    ? ` AND source_key IN (${keys.map(() => "?").join(", ")})`
    : "";
  return db
    .prepare(
      `SELECT rowid, source_key AS sourceKey, title, locator, content
         FROM academic_ai_chunks
        WHERE subject_id = ? AND semester_id = ?
          ${sourceFilter}
        ORDER BY source_key, rowid
        LIMIT 18`,
    )
    .all(subjectId, semesterId, ...(keys || []))
    .reduce((result, chunk) => {
      const used = result.reduce((total, item) => total + item.content.length, 0);
      if (used >= 18_000) return result;
      result.push({ ...chunk, content: chunk.content.slice(0, 18_000 - used) });
      return result;
    }, []);
}

function parseJsonResponse(content) {
  const text = String(content || "").trim();
  if (!text) return null;

  const candidates = [];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/gi) || [];
  candidates.push(...fenced.map((block) => block.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim()));
  candidates.push(text);

  // Models that emit a short explanation before the JSON are handled by
  // extracting balanced JSON objects/arrays instead of using a greedy regex.
  for (const opening of ["{", "["]) {
    let start = text.indexOf(opening);
    while (start >= 0) {
      const closing = opening === "{" ? "}" : "]";
      let depth = 0;
      let inString = false;
      let escaped = false;
      for (let index = start; index < text.length; index += 1) {
        const char = text[index];
        if (inString) {
          if (escaped) escaped = false;
          else if (char === "\\") escaped = true;
          else if (char === '"') inString = false;
          continue;
        }
        if (char === '"') {
          inString = true;
          continue;
        }
        if (char === opening) depth += 1;
        if (char === closing) depth -= 1;
        if (depth === 0) {
          candidates.push(text.slice(start, index + 1));
          break;
        }
      }
      start = text.indexOf(opening, start + 1);
    }
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed?.cards || parsed?.flashcards || parsed?.items || Array.isArray(parsed)) {
        if (Array.isArray(parsed)) return { cards: parsed };
        return {
          ...parsed,
          cards: parsed.cards || parsed.flashcards || parsed.items,
        };
      }
    } catch {
      // Try the next balanced candidate.
    }
  }
  return null;
}

async function generateFromNote(payload = {}, authorizeFilePath) {
  const title = cleanText(payload.title || "Nota sem título").slice(0, 500);
  const content = cleanText(payload.content).slice(0, 60_000);
  const selection = cleanText(payload.selection).slice(0, 12_000);
  const question = cleanText(payload.question).slice(0, 4_000);
  let effectiveKind = String(payload.kind || "summary");
  if (effectiveKind === "tone") effectiveKind = "tone-formal";
  const requestedFlashcardCount = Math.min(
    10,
    Math.max(1, Number.parseInt(payload.cardCount, 10) || 10),
  );
  const flashcardMode = String(payload.flashcardMode || "auto");
  const flashcardModeInstruction =
    flashcardMode === "language"
      ? "MODO IDIOMAS OBRIGATÓRIO: ensine o termo/expressão como vocabulário de um idioma. Na frente, mantenha a palavra ou expressão no idioma original e, se for uma frase, teste o trecho-alvo dentro do contexto. No verso, inclua tradução natural para português, significado no contexto, pronúncia/IPA quando útil, classe gramatical quando aplicável e uma frase de exemplo no idioma original acompanhada da tradução. NÃO transforme o cartão em um conceito acadêmico e NÃO responda apenas com uma definição em português."
      : flashcardMode === "study"
        ? "MODO ESTUDO OBRIGATÓRIO: transforme o tema em recuperação ativa. Distribua os cartões entre definição/ideia central, quando usar, comparação ou trade-off e aplicação prática quando fizer sentido. Faça perguntas específicas, uma habilidade por cartão, com respostas diretas. Não gere um resumo genérico, não repita perguntas e não saia do tema solicitado."
        : "MODO AUTO: identifique se o conteúdo é vocabulário/expressão de idioma ou conceito acadêmico e aplique o formato de aprendizagem correspondente.";
  const flashcardMetadataInstruction = payload.includeDeckMetadata
    ? ` Inclua também "deckTitle" com um nome específico e curto para o baralho, com 2 a 5 palavras apenas. Use somente o tema principal (por exemplo: "Herança e Composição POO" ou "Present Perfect"). Não use frases, perguntas, instruções do usuário, "Flashcards para..." ou texto explicativo. Inclua "deckId" com o id de um baralho existente que combine (ou string vazia se nenhum combinar) e "tags" com uma lista de 3 a 6 tags relevantes. Cada cartão pode incluir sua própria lista "tags". Baralhos disponíveis: ${JSON.stringify(payload.availableDecks || [])}.`
    : "";

  let attachedText = "";
  const attachmentPaths = Array.isArray(payload.attachmentPaths)
    ? payload.attachmentPaths
    : Array.isArray(payload.attachments)
      ? payload.attachments
      : [];

  if (attachmentPaths.length > 0) {
    const extractedParts = [];
    for (const filePath of attachmentPaths) {
      try {
        const segments = await extractSource(
          { kind: "file", path: filePath },
          authorizeFilePath,
        );
        const text = segments.map((s) => s.content).join("\n");
        if (text) {
          const fileName = path.basename(filePath);
          extractedParts.push(`--- ARQUIVO ANEXADO: ${fileName} ---\n${text.slice(0, 25_000)}`);
        }
      } catch (err) {
        console.warn(`[AcademicAI] Não foi possível ler o arquivo anexado ${filePath}:`, err.message);
      }
    }
    if (extractedParts.length > 0) {
      attachedText = extractedParts.join("\n\n");
    }
  }

  if (!content && !attachedText && effectiveKind !== "from-attachments") {
    throw new Error("Escreva algum conteúdo ou anexe um arquivo à nota primeiro.");
  }

  const targetAttachmentName = cleanText(payload.targetAttachmentName || payload.targetAttachment || "");
  const scopeMode = payload.scopeMode || "hybrid";
  let systemRule = "";
  let askInstruction = "";

  if (scopeMode === "strict") {
    systemRule =
      "REGRAS OBRIGATÓRIAS:\n" +
      "1. Trabalhe ÚNICA E EXCLUSIVAMENTE com o conteúdo fornecido da nota e/ou arquivos anexados.\n" +
      "2. NÃO utilize nenhum conhecimento prévio ou externo.\n" +
      "3. Se a informação necessária não estiver contida na nota ou nos anexos, responda apenas: 'Não tenho essa informação na nota nem nos arquivos anexados.'";
    askInstruction = targetAttachmentName
      ? `Responda à pergunta do usuário utilizando ÚNICA E EXCLUSIVAMENTE o conteúdo do arquivo anexado "${targetAttachmentName}". Se a informação não constar no arquivo ou na nota, informe isso claramente.`
      : "Responda à pergunta usando ÚNICA E EXCLUSIVAMENTE o conteúdo da nota e dos arquivos anexados. Se a informação não estiver presente, informe isso claramente.";
  } else if (scopeMode === "free") {
    systemRule =
      "REGRAS:\n" +
      "1. Responda à dúvida do usuário utilizando LIVREMENTE todo o seu conhecimento geral avançado para dar uma explicação completa.\n" +
      "2. NUNCA recuse responder alegando que o arquivo não contém a definição. Se o arquivo não explicar o termo, explique-o usando seu conhecimento geral.";
    askInstruction =
      "Responda à pergunta do usuário EXPLICANDO O CONCEITO PERGUNTADO DE FORMA COMPLETA usando todo o seu conhecimento geral livremente. Se o termo estiver citado nos anexos mas sem explicação, IGNORE essa limitação do arquivo e defina o conceito em detalhes.";
  } else {
    systemRule =
      "REGRAS DE RESPOSTA:\n" +
      "1. Dê prioridade ao conteúdo fornecido nos arquivos anexados como referência inicial.\n" +
      "2. ATENÇÃO: Se o arquivo apenas citar ou listar o termo perguntado sem explicá-lo, VOCÊ É OBRIGADO A UTILIZAR SEU CONHECIMENTO GERAL para definir e explicar o conceito completamente ao aluno.\n" +
      "3. NUNCA responda apenas que o arquivo não fornece a explicação; forneça a explicação completa do conceito.";
    askInstruction =
      "Responda à pergunta do usuário explicando o conceito completamente. Caso o material anexado não traga a definição detalhada do termo perguntado, USE O SEU CONHECIMENTO GERAL para ensinar e explicar o conceito de forma abrangente.";
  }

  if (payload.journalMode) {
    systemRule =
      "Você é um assistente de apoio emocional e reflexão pessoal, acolhedor, prudente e baseado em conhecimento psicológico geral. " +
      "Você pode usar seu conhecimento geral para explicar emoções, padrões de pensamento, comunicação, limites, autocuidado e estratégias comportamentais seguras, além de considerar o relato fornecido. " +
      "Nunca diga que é psicólogo, nunca faça diagnóstico, não rotule a pessoa, não prescreva medicamentos ou tratamento e não invente fatos. " +
      "Faça no máximo uma pergunta aberta por resposta e mantenha uma conversa natural. " +
      "Se houver risco de autoagressão, suicídio, violência ou perigo imediato, recomende ajuda presencial imediata, alguém de confiança, o SAMU 192 e o CVV 188 no Brasil.";
    askInstruction =
      "Responda como um facilitador de reflexão: acolha brevemente, conecte o relato a conceitos psicológicos gerais sem diagnosticar, ofereça uma perspectiva prática segura e termine com no máximo uma pergunta aberta. Não limite a resposta apenas ao texto da nota.";
  }

  if (effectiveKind === "flashcards" && flashcardMode === "language") {
    systemRule +=
      "\n\nMODO DE APRENDIZADO DE IDIOMAS — PRIORIDADE MÁXIMA:\n" +
      "- O objetivo exclusivo é ajudar o aluno a aprender, entender e usar a palavra ou frase no idioma original.\n" +
      "- Não mude o assunto para um conceito acadêmico, resumo genérico ou definição enciclopédica.\n" +
      "- A frente deve conter a palavra/expressão original ou uma pergunta que faça o aluno lembrar dela.\n" +
      "- O verso deve explicar tradução, sentido exato no contexto, pronúncia quando útil, classe gramatical e exemplo de uso no idioma original com tradução.\n" +
      "- Se houver um trecho marcado dentro de uma frase, o trecho marcado é o alvo; use o restante da frase apenas para interpretar o sentido.\n" +
      "- Preserve o idioma original do termo nos exemplos e não gere cartões sobre assuntos que não sejam o vocabulário fornecido.";
  } else if (effectiveKind === "flashcards" && flashcardMode === "study") {
    systemRule +=
      "\n\nMODO DE ESTUDO ACADÊMICO — PRIORIDADE MÁXIMA:\n" +
      "- O objetivo exclusivo é ensinar e revisar o conceito acadêmico fornecido.\n" +
      "- Cada cartão deve testar uma ideia do tema, usando recuperação ativa, definição, relações e aplicação.\n" +
      "- Não transforme o pedido em aprendizado de idioma, conversa genérica ou assunto diferente do conteúdo fornecido.";
  }

  const instructions = {
    summary:
      "Crie um resumo claro e estruturado da nota e de seus arquivos anexados, preservando os conceitos essenciais.",
    topics:
      "Extraia os tópicos principais da nota e dos arquivos anexados em uma lista organizada com explicações curtas.",
    questions:
      "Crie 8 questões de estudo com respostas usando o conteúdo da nota e dos arquivos anexados.",
    explain:
      "Explique o trecho selecionado em linguagem simples, usando uma analogia quando ela realmente ajudar.",
    flashcards:
      `Retorne somente JSON válido no formato {"cards":[{"front":"pergunta","back":"resposta","tags":["tag"]}],"deckTitle":"nome do baralho","deckId":"id existente ou vazio","tags":["tag"]}, com exatamente ${requestedFlashcardCount} cartão(ões) distintos, objetivos e baseados no conteúdo fornecido. Cada frente deve ter no máximo 35 palavras e cada verso no máximo 55 palavras, preferencialmente em até 3 linhas curtas. Não escreva aula, introdução, conclusão ou parágrafos longos; preserve apenas o essencial para revisão rápida.\n${flashcardModeInstruction}${flashcardMetadataInstruction}`,
    ask: askInstruction,
    mindmap:
      "Crie um mapa mental em formato Mermaid.js (sintaxe mindmap). Retorne APENAS o código Mermaid começando com 'mindmap'. NÃO inclua textos explicativos, NUNCA use hífens repetidos (como '----') para decoração e não use blocos de código markdown.",
    tone:
      "Reescreva o trecho selecionado (ou a nota toda se nada estiver selecionado) para um tom formal, profissional e acadêmico.",
    "tone-formal":
      "Reescreva o trecho selecionado (ou a nota toda se nada estiver selecionado) para um tom formal, profissional e acadêmico.",
    "tone-child":
      "Explique o trecho selecionado (ou a nota toda se nada estiver selecionado) como se estivesse explicando para uma criança de 10 anos, usando linguagem simples e lúdica.",
    "tone-concise":
      "Reescreva o conteúdo de forma extremamente concisa e direta, removendo redundâncias e focando apenas no essencial.",
    concepts:
      'Analise a nota e os arquivos anexados e retorne um JSON no formato {"concepts":[{"term":"termo técnico","definition":"breve explicação"}], "formulas":[{"latex":"fórmula","context":"onde é usada"}]}. Foque nos pontos mais importantes para o aprendizado.',
    "from-attachments":
      "Analise os arquivos anexados à nota e gere um resumo didático, detalhado e bem estruturado para ser inserido diretamente nas anotações.",
  };

  if (!instructions[effectiveKind]) throw new Error(`Ação de IA inválida: ${payload.kind}`);
  if ((effectiveKind === "explain" || effectiveKind.startsWith("tone")) && !selection) {
    if (effectiveKind === "explain") throw new Error("Selecione um trecho da nota para pedir uma explicação.");
  }
  if (effectiveKind === "ask" && !question) throw new Error("Digite uma pergunta.");
  if (effectiveKind === "from-attachments" && !attachedText) {
    throw new Error("Nenhum arquivo anexado válido (.pdf, .txt, .md) pôde ser lido nesta nota.");
  }

  const historyMessages = Array.isArray(payload.history)
    ? payload.history
        .filter((msg) => msg && typeof msg.content === "string")
        .map((msg) => ({
          role: msg.role === "user" ? "user" : "assistant",
          content: cleanText(msg.content).slice(0, 10_000),
        }))
    : [];

  const requestId = payload.requestId || `note-ai-${Date.now()}`;
  const response = await chatUntilComplete(
    {
      model: payload.model,
      requestId,
      format: (effectiveKind === "flashcards" || effectiveKind === "concepts") ? "json" : undefined,
      messages: [
        {
          role: "system",
          content: systemRule,
        },
        ...historyMessages,
        {
          role: "user",
          content: `${instructions[effectiveKind]}

${
  payload.journalMode
    ? ""
    : payload.responseLength === "short"
      ? "INSTRUÇÃO DE TAMANHO DA RESPOSTA: Responda de forma EXTREMAMENTE CURTA, SUCINTA E OBJETIVA (poucos tópicos diretos ou 1 a 2 parágrafos curtos, sem enrolação)."
      : payload.responseLength === "detailed"
        ? "INSTRUÇÃO DE TAMANHO DA RESPOSTA: Responda de forma COMPLETA, DETALHADA E ABRANGENTE, explicando minuciosamente."
        : ""
}
${
  effectiveKind === "ask" && !payload.journalMode
    ? "\nINSTRUÇÃO DE SUGESTÕES: Ao final absoluto da sua resposta, adicione exatamente 3 sugestões de perguntas interessantes e inteligentes de aprofundamento no seguinte formato exato:\n[SUGESTOES]\n- Primeira pergunta de exemplo?\n- Segunda pergunta de exemplo?\n- Terceira pergunta de exemplo?"
    : ""
}

TÍTULO DA NOTA:
${title}

${targetAttachmentName ? `FOCO DO ANEXO SELECIONADO: ${targetAttachmentName}\n` : ""}
${content ? `CONTEÚDO DA NOTA:\n${content}\n` : ""}
${attachedText ? `CONTEÚDO DOS ARQUIVOS ANEXADOS À NOTA:\n${attachedText}\n` : ""}
${selection ? `TRECHO SELECIONADO:\n${selection}\n` : ""}
${question ? `PERGUNTA:\n${question}\n` : ""}`,
        },
      ],
      timeout: 240_000,
      options: {
        temperature: payload.journalMode ? 0.65 : (effectiveKind === "flashcards" || effectiveKind === "concepts") ? 0.1 : 0.25,
        num_ctx: 8_192,
        num_predict: (effectiveKind === "flashcards" || effectiveKind === "concepts") ? 3_000 : 2_048,
      },
    },
    { maxContinuations: (effectiveKind === "flashcards" || effectiveKind === "concepts") ? 0 : 3 },
  );

function extractCleanAiResponse(rawMessage = "") {
  let text = String(rawMessage || "").trim();
  if (!text) return "";

  if (text.includes("<think>")) {
    const outsideThink = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    if (outsideThink) {
      return outsideThink;
    }
    const insideThink = text.replace(/<\/?think>/gi, "").trim();
    if (insideThink) {
      return insideThink;
    }
  }

  return text;
}

  const cleanedContent = extractCleanAiResponse(response.message);

  const titles = {
    summary: "Resumo da nota",
    topics: "Tópicos principais",
    questions: "Questões de estudo",
    explain: "Explicação da seleção",
    flashcards: "Flashcards sugeridos",
    ask: "Resposta sobre a nota",
    mindmap: "Mapa Mental",
    tone: "Texto Formatado",
    "tone-formal": "Texto Formal",
    "tone-child": "Explicação Didática",
    "tone-concise": "Texto Conciso",
    concepts: "Conceitos-Chave",
    "from-attachments": "Conteúdo Gerado dos Anexos",
  };
  return {
    kind: effectiveKind,
    title: titles[effectiveKind] || "Resultado da IA",
    content: cleanedContent,
    data: (effectiveKind === "flashcards" || effectiveKind === "concepts") ? parseJsonResponse(cleanedContent) : null,
    model: response.model,
    continuationCount: response.continuationCount,
    truncated: response.truncated,
  };
}

async function generate(app, payload = {}) {
  const db = ensureDatabase(app);
  const subjectId = assertIdentifier(payload.subjectId, "Matéria");
  const semesterId = assertIdentifier(payload.semesterId, "Semestre");
  const kind = String(payload.kind || "summary");
  const chunks = getGenerationChunks(
    db,
    subjectId,
    semesterId,
    payload.sourceIds,
  );
  if (!chunks.length) {
    throw new Error("Indexe pelo menos uma fonte antes de gerar conteúdo.");
  }
  const instructions = {
    summary:
      "Produza um resumo estruturado, fiel às fontes, com conceitos principais, relações e pontos para revisão. Inclua citações [n].",
    questions:
      "Crie 8 questões de estudo com resposta. Use uma linha 'Pergunta :: Resposta' para cada item e inclua a citação [n] correspondente.",
    flashcards:
      "Retorne somente JSON válido no formato {\"cards\":[{\"front\":\"pergunta\",\"back\":\"resposta com citação [n]\"}]}, com 10 cartões objetivos e sem informações externas.",
    "study-plan":
      "Sugira um plano de estudo em sessões, priorizando conceitos difíceis, revisão ativa e um simulado. Baseie cada sessão nas fontes e cite [n].",
  };
  if (!instructions[kind]) throw new Error("Tipo de geração inválido.");
  const requestId = payload.requestId || `academic-generate-${Date.now()}`;
  const response = await chatUntilComplete({
    model: payload.model,
    requestId,
    format: kind === "flashcards" ? "json" : undefined,
    messages: [
      {
        role: "system",
        content:
          "REGRAS OBRIGATÓRIAS:\n" +
          "1. Use ÚNICA E EXCLUSIVAMENTE as fontes e arquivos fornecidos da matéria.\n" +
          "2. NÃO utilize nenhum conhecimento prévio ou externo.\n" +
          "3. Se a informação necessária não estiver contida nas fontes, responda apenas: 'Não tenho essa informação nos arquivos da matéria.'",
      },
      {
        role: "user",
        content: `${instructions[kind]}\n\nFONTES:\n${buildContext(chunks)}`,
      },
    ],
    timeout: 240_000,
    options: {
      temperature: kind === "flashcards" ? 0.1 : 0.3,
      num_ctx: 8_192,
      num_predict: kind === "flashcards" ? 3_000 : 2_048,
    },
  }, {
    // Respostas JSON precisam ser produzidas como um documento único.
    // O limite maior acima é suficiente para os 10 cartões solicitados.
    maxContinuations: kind === "flashcards" ? 0 : 3,
  });
  const titles = {
    summary: "Resumo gerado pela IA",
    questions: "Questões geradas pela IA",
    flashcards: "Flashcards gerados pela IA",
    "study-plan": "Plano sugerido pela IA",
  };
  return {
    title: titles[kind],
    content: response.message,
    data: kind === "flashcards" ? parseJsonResponse(response.message) : null,
    model: response.model,
    continuationCount: response.continuationCount,
    truncated: response.truncated,
    citations: chunks.map((chunk) => ({
      sourceId: chunk.sourceKey,
      title: chunk.title,
      locator: chunk.locator,
    })),
  };
}

function registerAcademicAiIpc({
  ipcMain,
  app,
  authorizeSender,
  authorizeFilePath,
}) {
  const register = (channel, handler) =>
    ipcMain.handle(channel, (event, ...args) => {
      if (typeof authorizeSender === "function" && !authorizeSender(event)) {
        throw new Error("Janela não autorizada.");
      }
      return handler(event, ...args);
    });

  register("academic-ai:status", () => getOllamaStatus());
  register("academic-ai:start", () => startOllama());
  register("academic-ai:list-sources", (_event, subjectId) =>
    listSources(app, subjectId),
  );
  register("academic-ai:index-sources", (_event, payload) =>
    indexSources(app, payload, authorizeFilePath),
  );
  register("academic-ai:remove-source", (_event, sourceKey) =>
    removeSource(app, sourceKey),
  );
  register("academic-ai:ask", (_event, payload) => ask(app, payload));
  register("academic-ai:generate", (_event, payload) =>
    generate(app, payload),
  );
  register("academic-ai:note-action", (_event, payload) =>
    generateFromNote(payload, authorizeFilePath),
  );
  register("academic-ai:cancel", (_event, requestId) =>
    cancelOllamaRequest(requestId),
  );
}

module.exports = {
  ask,
  buildFtsQuery,
  chunkText,
  generate,
  generateFromNote,
  indexSources,
  listSources,
  registerAcademicAiIpc,
  retrieveRelevantChunks,
  removeSource,
};
