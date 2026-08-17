import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGeneratedNote,
  markdownToNoteHtml,
  toAcademicAiSources,
} from "./aiStudio.js";

test("envia somente as fontes selecionadas com seus dados reais", () => {
  assert.deepEqual(
    toAcademicAiSources([
      {
        id: "arquivo-1",
        title: "Aula 1",
        type: "file",
        path: "/materiais/aula-1.pdf",
        selected: true,
      },
      {
        id: "link-1",
        title: "Documentação",
        type: "link",
        url: "https://example.com/guia",
        selected: true,
      },
      {
        id: "arquivo-2",
        title: "Desmarcado",
        type: "file",
        path: "/materiais/ignorar.txt",
        selected: false,
      },
    ]),
    [
      {
        id: "arquivo-1",
        kind: "file",
        title: "Aula 1",
        path: "/materiais/aula-1.pdf",
      },
      {
        id: "link-1",
        kind: "link",
        title: "Documentação",
        url: "https://example.com/guia",
      },
    ],
  );
});

test("converte Markdown gerado em HTML seguro para o editor de notas", () => {
  const html = markdownToNoteHtml(
    "## Revisão\n\n- **Conceito:** valor\n- Use `npm test`\n\n> Atenção <script>alert(1)</script>",
  );

  assert.match(html, /<h2>Revisão<\/h2>/);
  assert.match(html, /<ul><li><strong>Conceito:<\/strong> valor<\/li>/);
  assert.match(html, /<code>npm test<\/code>/);
  assert.match(html, /<blockquote>Atenção &lt;script&gt;alert\(1\)&lt;\/script&gt;<\/blockquote>/);
  assert.doesNotMatch(html, /<script>/);
});

test("monta uma anotação completa e vinculada à disciplina", () => {
  assert.deepEqual(
    buildGeneratedNote({
      id: "note-ai-1",
      title: "Resumo gerado pela IA",
      markdown: "# Limites\n\nConteúdo.",
      subject: {
        id: "calculo",
        semesterId: "2026-1",
        name: "Cálculo I",
        linkedCourseIds: ["course-1"],
      },
      now: 123,
    }),
    {
      id: "note-ai-1",
      title: "Resumo gerado pela IA — Cálculo I",
      content: "<h1>Limites</h1><p>Conteúdo.</p>",
      itemType: "note",
      sourceKind: "ai-generated-note",
      sourceCourseId: "course-1",
      academicSubjectId: "calculo",
      academicSemesterId: "2026-1",
      tags: ["Cálculo I", "Gerado por IA"],
      attachments: [],
      createdAt: 123,
      updatedAt: 123,
    },
  );
});