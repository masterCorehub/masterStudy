import test from "node:test";
import assert from "node:assert/strict";
import { nestedNoteContext, repairNestedNotes } from "./nestedNotes.js";
import { getNoteTags } from "./frontmatter.js";
import { buildLinkGraph } from "./wikilinks.js";

test("notas internas herdam vault e contexto da nota principal", () => {
  const parent = {
    id: "parent",
    vaultId: "custom",
    path: "Pasta",
    academicSubjectId: "subject",
  };
  assert.equal(nestedNoteContext(parent).vaultId, "custom");
  const repaired = repairNestedNotes([
    { ...parent, content: '<a href="#nested-note=child">filha</a>' },
    { id: "child", sourceKind: "nested-note" },
  ]);
  assert.equal(repaired[1].parentNoteId, "parent");
  assert.equal(repaired[1].vaultId, "custom");
});
test("reconstrução evita ciclos e relações ambíguas", () => {
  const repaired = repairNestedNotes([
    { id: "a", parentNoteId: "b" },
    { id: "b", parentNoteId: "a" },
  ]);
  assert.ok(repaired.every((note) => !note.parentNoteId));
  const ambiguous = repairNestedNotes([
    { id: "a", content: '<a href="#nested-note=c">c</a>' },
    { id: "b", content: '<a href="#nested-note=c">c</a>' },
    { id: "c", sourceKind: "nested-note" },
  ]);
  assert.equal(ambiguous[2].parentNoteId, undefined);
});
test("tags HTML aceitam acentos, hierarquia e ignoram código e URL", () => {
  assert.deepEqual(
    getNoteTags({
      content:
        "<p>#Cálculo #prova/física,</p><code>#ignorar</code><p>https://example.com/#fragmento</p>",
      tags: ["#CÁLCULO"],
    }),
    ["cálculo", "prova/física"],
  );
});
test("grafo combina tags, notas internas e links com alias sem cruzar vaults", () => {
  const notes = [
    { id: "a", title: "A", vaultId: "one", content: "#Física [[B|apelido]]" },
    { id: "b", title: "B", vaultId: "one", content: "#física" },
    { id: "c", title: "C", vaultId: "one", parentNoteId: "a", content: "" },
    { id: "d", title: "D", vaultId: "two", content: "#física" },
  ];
  const graph = buildLinkGraph(notes);
  assert.equal(graph.edges.length, 2);
  assert.ok(graph.edges.some((edge) => edge.kind === "nested"));
  assert.ok(graph.edges.some((edge) => edge.kind === "link"));
  assert.ok(
    !graph.edges.some((edge) => edge.source === "d" || edge.target === "d"),
  );
  const tagsOnly = buildLinkGraph(
    notes.map((note) => ({ ...note, content: "#física", parentNoteId: null })),
  );
  assert.equal(tagsOnly.edges.length, 3);
  assert.ok(tagsOnly.edges.every((edge) => edge.kind === "tag"));
});
