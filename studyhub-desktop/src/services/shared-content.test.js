import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyAcademicData, normalizeAcademicData } from "../domain/academic.js";
import {
  hasImportedSharedEntity,
  importSharedInvitation,
} from "./shared-content.js";

const createStore = () => {
  const state = {
    studyItems: [],
    courses: [],
    tasks: { list: [] },
    flashcardDecks: [],
    academic: createEmptyAcademicData(),
  };
  const actions = {
    addStudyItem: (item) => state.studyItems.unshift(item),
    addNote: (item) => state.studyItems.unshift(item),
    addTask: (item) => state.tasks.list.unshift(item),
    addCourse: (item) => state.courses.push(item),
    addFlashcardDeck: (item) => state.flashcardDecks.push(item),
    addAcademicEntity: (collection, item) => {
      const academic = normalizeAcademicData(state.academic);
      state.academic = {
        ...academic,
        [collection]: [item, ...academic[collection]],
      };
    },
  };
  return {
    getState: () => ({ ...state, ...actions }),
  };
};

const invitation = (type, payload, overrides = {}) => ({
  id: `invite-${type}`,
  status: "accepted",
  permission: "viewer",
  accepted_at: "2026-07-31T12:00:00.000Z",
  shared_entities: {
    id: `entity-${type}`,
    entity_type: type,
    entity_id: `source-${type}`,
    title: `Shared ${type}`,
    payload,
  },
  ...overrides,
});

test("imports a shared file without leaking the owner's local path", () => {
  const store = createStore();
  const invite = invitation("resource", {
    title: "Research.pdf",
    filePath: "/home/owner/private/Research.pdf",
    fileDataUrl: "data:application/pdf;base64,secret",
    cloudObjectPath: "users/owner/file.pdf",
  });

  const first = importSharedInvitation(invite, store);
  const second = importSharedInvitation(invite, store);
  const imported = store.getState().studyItems[0];

  assert.equal(first.imported, true);
  assert.equal(second.duplicate, true);
  assert.equal(imported.filePath, "");
  assert.equal(imported.fileDataUrl, null);
  assert.equal(imported.cloudObjectPath, "users/owner/file.pdf");
  assert.equal(imported.sharedReadOnly, true);
  assert.equal(imported.sharingPermission, "viewer");
  assert.equal(imported.sharedEntityRevision, 1);
  assert.equal(hasImportedSharedEntity(store.getState(), "entity-resource"), true);
});

test("imports a subject bundle into the recipient's active semester", () => {
  const store = createStore();
  const invite = invitation("subject", {
    subject: {
      id: "owner-subject",
      name: "Calculus",
      semesterId: "owner-semester",
      linkedCourseIds: ["owner-course"],
    },
    notes: [{ id: "note-1", title: "Limits", content: "Definition" }],
    tasks: [{ id: "task-1", title: "Exercise list" }],
    resources: [{ id: "resource-1", title: "Syllabus", type: "link" }],
    decks: [{ id: "deck-1", title: "Derivatives", cards: [] }],
  });

  importSharedInvitation(invite, store);
  const state = store.getState();
  const academic = normalizeAcademicData(state.academic);
  const subject = academic.subjects[0];

  assert.equal(subject.name, "Calculus");
  assert.equal(subject.semesterId, academic.activeSemesterId);
  assert.deepEqual(subject.linkedCourseIds, []);
  assert.equal(state.studyItems[0].academicSubjectId, subject.id);
  assert.equal(state.tasks.list[0].academicSubjectId, subject.id);
  assert.equal(academic.resources[0].subjectId, subject.id);
  assert.equal(state.flashcardDecks[0].academicSubjectId, subject.id);
});

test("maps a shared task to an already imported subject", () => {
  const store = createStore();
  store.getState().addAcademicEntity("subjects", {
    id: "recipient-subject",
    name: "Physics",
    originalEntityId: "owner-subject",
    semesterId: "semester-current",
  });

  importSharedInvitation(
    invitation("task", {
      task: { title: "Lab report", subjectId: "owner-subject" },
    }, { permission: "editor" }),
    store,
  );

  const task = store.getState().tasks.list[0];
  assert.equal(task.academicSubjectId, "recipient-subject");
  assert.equal(task.sharedReadOnly, false);
  assert.equal(task.sharingPermission, "editor");
});
