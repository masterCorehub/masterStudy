import test from "node:test";
import assert from "node:assert/strict";
import {
  createLessonNoteDraft,
  lessonNoteDraftReducer,
  prepareLessonNoteSave,
} from "./lessonNoteDraft.js";

test("trocar de aula cria um rascunho isolado", () => {
  const editedDraft = {
    ...createLessonNoteDraft("lesson-1"),
    title: "Anotação da primeira aula",
    content: "<p>Não pode vazar</p>",
    noteId: "note-1",
  };

  const nextDraft = lessonNoteDraftReducer(editedDraft, {
    type: "lessonChanged",
    lessonId: "lesson-2",
  });

  assert.deepEqual(nextDraft, createLessonNoteDraft("lesson-2"));
});

test("salvar novamente mantém o conteúdo e atualiza a mesma anotação", () => {
  const draft = {
    ...createLessonNoteDraft("lesson-1"),
    title: "Pontos importantes",
    content: "<p>Conteúdo da aula</p>",
    noteId: "note-existing",
  };

  const operation = prepareLessonNoteSave({
    draft,
    lesson: { id: "lesson-1", title: "Introdução" },
    courseId: "course-1",
    moduleId: "module-1",
    moduleTitle: "Módulo 1",
    currentTime: 65,
    newNoteId: "note-new",
  });
  const savedDraft = lessonNoteDraftReducer(draft, {
    type: "saved",
    noteId: operation.noteId,
    title: operation.values.title,
  });

  assert.equal(operation.kind, "update");
  assert.equal(operation.noteId, "note-existing");
  assert.equal(operation.values.time, "1:05");
  assert.equal(savedDraft.content, draft.content);
  assert.equal(savedDraft.noteId, "note-existing");
});

test("primeiro salvamento cria uma nota vinculada à aula e ignora conteúdo vazio", () => {
  const draft = {
    ...createLessonNoteDraft("lesson-1"),
    content: "<p>Resumo</p>",
  };
  const context = {
    draft,
    lesson: { id: "lesson-1", title: "Introdução" },
    courseId: "course-1",
    moduleId: "module-1",
    moduleTitle: "Módulo 1",
    currentTime: null,
    newNoteId: "note-new",
  };

  const operation = prepareLessonNoteSave(context);

  assert.equal(operation.kind, "create");
  assert.equal(operation.noteId, "note-new");
  assert.equal(operation.values.id, "note-new");
  assert.equal(operation.values.title, "Nota sobre Introdução");
  assert.equal(operation.values.sourceLessonId, "lesson-1");
  assert.equal(
    prepareLessonNoteSave({
      ...context,
      draft: { ...draft, content: "<p><br></p>" },
    }),
    null,
  );
});
