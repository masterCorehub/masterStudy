const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  saveState,
  loadState,
  closeDatabase,
  ensureDatabase,
} = require("./study-db.cjs");

test("study database saves and restores the canonical snapshot and domain rows", () => {
  const tempPath = fs.mkdtempSync(path.join(os.tmpdir(), "studyhub-db-"));
  const app = { getPath: () => tempPath };
  const state = {
    courses: [
      {
        id: "course-1",
        title: "Curso",
        modules: [
          {
            id: "module-1",
            title: "Módulo",
            lessons: [{ id: "lesson-1", title: "Aula" }],
          },
        ],
      },
    ],
    tasks: {
      list: [
        {
          id: "task-1",
          title: "Tarefa",
          context: { courseId: "course-1", lessonId: "lesson-1" },
        },
      ],
    },
    studyItems: [{ id: "note-1", title: "Nota", content: "Texto" }],
    flashcardDecks: [],
    noteVersions: [],
    focusSessions: [],
    studyPlans: [],
    importTransactions: [],
    academic: {
      subjects: [
        {
          id: "subject-1",
          semesterId: "semester-1",
          name: "Cálculo",
          linkedCourseIds: ["course-1"],
        },
      ],
      resources: [
        {
          id: "resource-1",
          semesterId: "semester-1",
          subjectId: "subject-1",
          title: "Livro",
          url: "https://example.com/livro",
        },
      ],
      studySessions: [
        {
          id: "session-1",
          semesterId: "semester-1",
          subjectId: "subject-1",
          title: "Revisão",
          date: "2026-07-20",
        },
      ],
    },
    collaboration: {
      workspaces: [{ id: "space-1", name: "Grupo de Cálculo", kind: "shared" }],
      members: [{ id: "member-1", workspaceId: "space-1", email: "colega@example.com", role: "editor" }],
      shares: [{ id: "share-1", workspaceId: "space-1", entityType: "note", entityId: "note-1", permission: "editor" }],
      invitations: [{ id: "invite-1", workspaceId: "space-1", entityType: "note", entityId: "note-1", email: "colega@example.com", status: "pending" }],
      activity: [],
    },
  };
  saveState(app, state);
  const loaded = loadState(app);
  assert.equal(loaded.state.courses[0].modules[0].lessons[0].title, "Aula");
  assert.equal(loaded.state.tasks.list[0].context.lessonId, "lesson-1");
  assert.equal(loaded.state.studyItems[0].content, "Texto");
  assert.equal(loaded.state.academic.resources[0].subjectId, "subject-1");
  assert.equal(loaded.state.collaboration.invitations[0].email, "colega@example.com");

  const db = ensureDatabase(app);
  assert.equal(
    db.prepare("SELECT value FROM metadata WHERE key = 'schema_version'").get()
      .value,
    "3",
  );
  assert.deepEqual(
    db
      .prepare(
        "SELECT id, collection, semester_id AS semesterId, subject_id AS subjectId FROM academic_entities ORDER BY collection, id",
      )
      .all()
      .map((row) => ({ ...row })),
    [
      {
        id: "resource-1",
        collection: "resources",
        semesterId: "semester-1",
        subjectId: "subject-1",
      },
      {
        id: "session-1",
        collection: "studySessions",
        semesterId: "semester-1",
        subjectId: "subject-1",
      },
      {
        id: "subject-1",
        collection: "subjects",
        semesterId: "semester-1",
        subjectId: null,
      },
    ],
  );
  assert.equal(
    db.prepare("SELECT count(*) AS count FROM collaboration_entities WHERE collection = 'invitations'").get().count,
    1,
  );
  closeDatabase();
  fs.rmSync(tempPath, { recursive: true, force: true });
});
