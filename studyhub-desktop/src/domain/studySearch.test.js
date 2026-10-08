import test from "node:test";
import assert from "node:assert/strict";
import { buildSearchIndex } from "./studySelectors.js";
import { getAcademicSemesterData } from "./academic.js";

test("Cmd+K indexa as mesmas disciplinas da biblioteca e preserva as demais no armazenamento", () => {
  const state = {
    courses: [{ id: "course", title: "Curso", modules: [] }],
    academic: {
      activeSemesterId: "current",
      semesters: [
        { id: "current", name: "Atual" },
        { id: "previous", name: "Anterior" },
      ],
      subjects: [
        { id: "visible", name: "Visível", semesterId: "current" },
        {
          id: "archived",
          name: "salsalslalsa",
          semesterId: "current",
          isArchived: true,
        },
        {
          id: "other-semester",
          name: "Outro semestre",
          semesterId: "previous",
        },
      ],
      exams: [
        {
          id: "exam-visible",
          title: "Prova atual",
          semesterId: "current",
          subjectId: "visible",
        },
        {
          id: "exam-hidden",
          title: "Prova arquivada",
          semesterId: "current",
          subjectId: "archived",
        },
      ],
    },
  };
  const index = buildSearchIndex(state);
  assert.deepEqual(
    index.filter((i) => i.type === "Disciplina").map((i) => i.id),
    getAcademicSemesterData(state.academic).subjects.map((s) => s.id),
  );
  assert.ok(index.some((i) => i.id === "course"));
  assert.ok(index.some((i) => i.id === "exam-visible"));
  assert.ok(
    !index.some((i) =>
      ["archived", "other-semester", "exam-hidden"].includes(i.id),
    ),
  );
  assert.equal(state.academic.subjects.length, 3);
  state.academic.activeSemesterId = "previous";
  assert.deepEqual(
    buildSearchIndex(state)
      .filter((i) => i.type === "Disciplina")
      .map((i) => i.id),
    ["other-semester"],
  );
});
