const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  buildFtsQuery,
  chunkText,
  indexSources,
  listSources,
  retrieveRelevantChunks,
  removeSource,
} = require("./index.cjs");
const { closeDatabase, ensureDatabase } = require("../storage/study-db.cjs");

test("divide textos longos e cria consultas FTS seguras", () => {
  const chunks = chunkText("Derivadas e integrais. ".repeat(120), {
    maxLength: 500,
    overlap: 50,
  });
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 500));
  assert.equal(
    buildFtsQuery("Equações diferenciais, equações!"),
    '"equações"* OR "diferenciais"*',
  );
});

test("indexa somente fontes autorizadas e limita a busca à matéria e ao semestre", async (context) => {
  const tempPath = fs.mkdtempSync(
    path.join(os.tmpdir(), "studyhub-academic-ai-"),
  );
  const app = { getPath: () => tempPath };
  context.after(() => {
    closeDatabase();
    fs.rmSync(tempPath, { recursive: true, force: true });
  });

  await indexSources(app, {
    subjectId: "calculo",
    semesterId: "2026-1",
    sources: [
      {
        id: "note-calculo",
        kind: "note",
        title: "Resumo de derivadas",
        locator: "Anotação",
        content:
          "A derivada representa a taxa de variação instantânea de uma função.",
      },
    ],
  });
  await indexSources(app, {
    subjectId: "fisica",
    semesterId: "2026-1",
    sources: [
      {
        id: "note-fisica",
        kind: "note",
        title: "Resumo de cinemática",
        locator: "Anotação",
        content:
          "Na cinemática, a derivada da posição em relação ao tempo é a velocidade.",
      },
    ],
  });

  assert.deepEqual(
    listSources(app, "calculo").map((source) => source.sourceKey),
    ["note-calculo"],
  );

  const rows = ensureDatabase(app)
    .prepare(
      `SELECT source_key AS sourceKey
         FROM academic_ai_chunks
        WHERE academic_ai_chunks MATCH ?
          AND subject_id = ?
          AND semester_id = ?`,
    )
    .all(buildFtsQuery("derivada"), "calculo", "2026-1");
  assert.deepEqual(
    rows.map((row) => row.sourceKey),
    ["note-calculo"],
  );

  assert.deepEqual(removeSource(app, "note-calculo"), { removed: true });
  assert.equal(listSources(app, "calculo").length, 0);
});

test("limita a recuperação às fontes marcadas pelo aluno", async (context) => {
  const tempPath = fs.mkdtempSync(
    path.join(os.tmpdir(), "studyhub-academic-ai-selection-"),
  );
  const app = { getPath: () => tempPath };
  context.after(() => {
    closeDatabase();
    fs.rmSync(tempPath, { recursive: true, force: true });
  });

  await indexSources(app, {
    subjectId: "calculo",
    semesterId: "2026-1",
    sources: [
      {
        id: "fonte-ativa",
        kind: "note",
        title: "Fonte ativa",
        content: "Integral definida calcula a área líquida sob uma curva.",
      },
      {
        id: "fonte-desmarcada",
        kind: "note",
        title: "Fonte desmarcada",
        content: "Integral definida também aparece neste material antigo.",
      },
    ],
  });

  const chunks = retrieveRelevantChunks(ensureDatabase(app), {
    subjectId: "calculo",
    semesterId: "2026-1",
    question: "integral definida",
    sourceKeys: ["fonte-ativa"],
  });

  assert.deepEqual(
    chunks.map((chunk) => chunk.sourceKey),
    ["fonte-ativa"],
  );
});

test("bloqueia links locais para impedir SSRF na indexação", async (context) => {
  const tempPath = fs.mkdtempSync(
    path.join(os.tmpdir(), "studyhub-academic-ai-link-"),
  );
  const app = { getPath: () => tempPath };
  context.after(() => {
    closeDatabase();
    fs.rmSync(tempPath, { recursive: true, force: true });
  });

  await assert.rejects(
    indexSources(app, {
      subjectId: "calculo",
      semesterId: "2026-1",
      sources: [
        {
          id: "link-local",
          kind: "link",
          title: "Serviço local",
          url: "http://127.0.0.1:11434/api/tags",
        },
      ],
    }),
    /públic|válid/i,
  );
});

test("identifica formato acadêmico não suportado sem falhar silenciosamente", async (context) => {
  const tempPath = fs.mkdtempSync(
    path.join(os.tmpdir(), "studyhub-academic-ai-invalid-"),
  );
  const filePath = path.join(tempPath, "material.docx");
  fs.writeFileSync(filePath, "conteúdo de teste", "utf8");
  const app = { getPath: () => tempPath };
  context.after(() => {
    closeDatabase();
    fs.rmSync(tempPath, { recursive: true, force: true });
  });

  await assert.rejects(
    indexSources(app, {
      subjectId: "calculo",
      semesterId: "2026-1",
      sources: [
        {
          id: "unsupported-file",
          kind: "file",
          title: "Material",
          path: filePath,
        },
      ],
    }),
    /Formato \.docx não suportado/,
  );
});

test("extrai e indexa páginas de um PDF com texto", async (context) => {
  const tempPath = fs.mkdtempSync(
    path.join(os.tmpdir(), "studyhub-academic-ai-pdf-"),
  );
  const app = { getPath: () => tempPath };
  context.after(() => {
    closeDatabase();
    fs.rmSync(tempPath, { recursive: true, force: true });
  });

  const result = await indexSources(app, {
    subjectId: "geografia",
    semesterId: "2026-1",
    sources: [
      {
        id: "pdf-ciclo-agua",
        kind: "file",
        title: "Ciclo da água",
        path: path.resolve(__dirname, "../../public/qa-guided-reading.pdf"),
      },
    ],
  });

  assert.equal(result.results[0].ok, true);
  assert.ok(result.results[0].chunkCount > 0);
  assert.equal(listSources(app, "geografia")[0].title, "Ciclo da água");
  assert.match(
    ensureDatabase(app)
      .prepare(
        "SELECT locator FROM academic_ai_chunks WHERE source_key = ? LIMIT 1",
      )
      .get("pdf-ciclo-agua").locator,
    /^Página 1/,
  );
});
