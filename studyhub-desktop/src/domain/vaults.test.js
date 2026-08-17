import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_GLOBAL_VAULT_ID,
  getVaultForNote,
  getAllVaults,
  filterNotesByVault,
  filterFoldersByVault,
} from "./vaults.js";

test("getVaultForNote identifica corretamente o vault da nota", () => {
  assert.equal(getVaultForNote({ vaultId: "custom-1" }), "custom-1");
  assert.equal(getVaultForNote({ academicSubjectId: "sub-1" }), "discipline-sub-1");
  assert.equal(getVaultForNote({ subjectId: "sub-2" }), "discipline-sub-2");
  assert.equal(getVaultForNote({ sourceCourseId: "course-1" }), "course-course-1");
  assert.equal(getVaultForNote({ courseId: "course-2" }), "course-course-2");
  assert.equal(getVaultForNote({ title: "Geral" }), DEFAULT_GLOBAL_VAULT_ID);
});

test("getAllVaults agrupa e conta notas de cada vault", () => {
  const academic = {
    subjects: [
      { id: "s1", name: "Cálculo 1", color: "#3b82f6" },
      { id: "s2", name: "Física 1", isArchived: true },
    ],
  };
  const courses = [{ id: "c1", title: "React Pro", color: "#6366f1" }];
  const customVaults = [{ id: "cv1", name: "Projetos Pessoais", icon: "rocket_launch" }];
  const studyItems = [
    { id: "n1", itemType: "note", title: "Nota geral" },
    { id: "n2", itemType: "note", academicSubjectId: "s1" },
    { id: "n3", itemType: "note", vaultId: "discipline-s1" },
    { id: "n4", itemType: "note", sourceCourseId: "c1" },
    { id: "n5", itemType: "note", vaultId: "cv1" },
  ];

  const vaults = getAllVaults({ academic, courses, customVaults, studyItems });

  assert.equal(vaults.length, 4); // Global + s1 + c1 + cv1 (s2 arquivado ignorado)

  const globalV = vaults.find((v) => v.id === "global");
  assert.equal(globalV.noteCount, 1);

  const subV = vaults.find((v) => v.id === "discipline-s1");
  assert.equal(subV.noteCount, 2);

  const courseV = vaults.find((v) => v.id === "course-c1");
  assert.equal(courseV.noteCount, 1);

  const customV = vaults.find((v) => v.id === "cv1");
  assert.equal(customV.noteCount, 1);
});

test("filterNotesByVault e filterFoldersByVault filtram corretamente", () => {
  const notes = [
    { id: "n1", vaultId: "global" },
    { id: "n2", academicSubjectId: "s1" },
    { id: "n3", sourceCourseId: "c1" },
  ];

  assert.equal(filterNotesByVault(notes, "discipline-s1").length, 1);
  assert.equal(filterNotesByVault(notes, "discipline-s1")[0].id, "n2");
  assert.equal(filterNotesByVault(notes, "course-c1").length, 1);
  assert.equal(filterNotesByVault(notes, "course-c1")[0].id, "n3");
  assert.equal(filterNotesByVault(notes, "all").length, 3);

  const folders = [
    { id: "f1", vaultId: "discipline-s1" },
    { id: "f2", vaultId: "global" },
    { id: "f3" }, // sem vaultId herda
  ];

  assert.equal(filterFoldersByVault(folders, "discipline-s1").length, 2); // f1 + f3
  assert.equal(filterFoldersByVault(folders, "global").length, 2); // f2 + f3
});
