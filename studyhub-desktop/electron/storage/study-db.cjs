const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

let database = null;
let databasePath = null;

function ensureDatabase(app) {
  if (database) return database;
  const userDataPath = app.getPath("userData");
  fs.mkdirSync(userDataPath, { recursive: true });
  databasePath = path.join(userDataPath, "studyhub.sqlite");
  database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS state_snapshot (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL, payload TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS courses (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS modules (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, payload TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS lessons (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, module_id TEXT NOT NULL, payload TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, course_id TEXT, module_id TEXT, lesson_id TEXT, work_id TEXT, payload TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, course_id TEXT, module_id TEXT, lesson_id TEXT, payload TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS note_versions (id TEXT PRIMARY KEY, note_id TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS flashcard_decks (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS focus_sessions (id TEXT PRIMARY KEY, task_id TEXT, lesson_id TEXT, payload TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS study_plans (id TEXT PRIMARY KEY, task_id TEXT, payload TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS import_transactions (id TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS collaboration_entities (id TEXT PRIMARY KEY, collection TEXT NOT NULL, workspace_id TEXT, entity_type TEXT, entity_id TEXT, payload TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS collaboration_entities_scope_idx ON collaboration_entities (workspace_id, entity_type, entity_id, collection);
    CREATE TABLE IF NOT EXISTS academic_entities (id TEXT PRIMARY KEY, collection TEXT NOT NULL, semester_id TEXT, subject_id TEXT, payload TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS academic_entities_scope_idx ON academic_entities (semester_id, subject_id, collection);
    CREATE TABLE IF NOT EXISTS academic_ai_sources (
      source_key TEXT PRIMARY KEY,
      subject_id TEXT NOT NULL,
      semester_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      path TEXT,
      locator TEXT,
      content_hash TEXT NOT NULL,
      indexed_at INTEGER NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS academic_ai_sources_scope_idx ON academic_ai_sources (subject_id, semester_id);
    CREATE VIRTUAL TABLE IF NOT EXISTS academic_ai_chunks USING fts5(
      source_key UNINDEXED,
      subject_id UNINDEXED,
      semester_id UNINDEXED,
      title UNINDEXED,
      locator UNINDEXED,
      content,
      tokenize = 'unicode61 remove_diacritics 2'
    );
  `);
  database.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES ('schema_version', '3')").run();
  return database;
}

function safeJson(value) {
  return JSON.stringify(value, (_key, item) => (typeof item === "function" ? undefined : item));
}

function contextOf(item = {}) {
  const context = item.context || {};
  return {
    courseId: context.courseId || item.courseId || item.sourceCourseId || null,
    moduleId: context.moduleId || item.moduleId || item.sourceModuleId || null,
    lessonId: context.lessonId || item.lessonId || item.sourceLessonId || null,
    workId: context.workId || item.workId || null,
  };
}

function replaceRows(db, table, rows, columns, mapper) {
  db.prepare(`DELETE FROM ${table}`).run();
  if (!rows?.length) return;
  const placeholders = columns.map(() => "?").join(", ");
  const statement = db.prepare(`INSERT OR REPLACE INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`);
  for (const row of rows) statement.run(...mapper(row));
}

function saveState(app, state) {
  const db = ensureDatabase(app);
  const now = Date.now();
  const payload = safeJson(state || {});
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("INSERT OR REPLACE INTO state_snapshot (id, version, payload, updated_at) VALUES (1, ?, ?, ?)").run(1, payload, now);
    replaceRows(db, "courses", state?.courses || [], ["id", "payload", "updated_at"], (course) => [course.id, safeJson(course), now]);
    replaceRows(db, "modules", (state?.courses || []).flatMap((course) => (course.modules || []).map((module) => ({ ...module, courseId: course.id }))), ["id", "course_id", "payload", "updated_at"], (module) => [module.id, module.courseId, safeJson(module), now]);
    replaceRows(db, "lessons", (state?.courses || []).flatMap((course) => (course.modules || []).flatMap((module) => (module.lessons || []).map((lesson) => ({ ...lesson, courseId: course.id, moduleId: module.id })))), ["id", "course_id", "module_id", "payload", "updated_at"], (lesson) => [lesson.id, lesson.courseId, lesson.moduleId, safeJson(lesson), now]);
    replaceRows(db, "tasks", state?.tasks?.list || [], ["id", "course_id", "module_id", "lesson_id", "work_id", "payload", "updated_at"], (task) => { const context = contextOf(task); return [task.id, context.courseId, context.moduleId, context.lessonId, context.workId, safeJson(task), now]; });
    replaceRows(db, "notes", state?.studyItems || [], ["id", "course_id", "module_id", "lesson_id", "payload", "updated_at"], (note) => { const context = contextOf(note); return [note.id, context.courseId, context.moduleId, context.lessonId, safeJson(note), now]; });
    replaceRows(db, "note_versions", state?.noteVersions || [], ["id", "note_id", "payload", "created_at"], (version) => [version.id, version.noteId, safeJson(version), version.createdAt || now]);
    replaceRows(db, "flashcard_decks", state?.flashcardDecks || [], ["id", "payload", "updated_at"], (deck) => [deck.id, safeJson(deck), now]);
    replaceRows(db, "focus_sessions", state?.focusSessions || [], ["id", "task_id", "lesson_id", "payload", "updated_at"], (session) => [session.id, session.taskId || null, session.lessonId || null, safeJson(session), now]);
    replaceRows(db, "study_plans", state?.studyPlans || [], ["id", "task_id", "payload", "updated_at"], (plan) => [plan.id, plan.taskId || null, safeJson(plan), now]);
    replaceRows(db, "import_transactions", state?.importTransactions || [], ["id", "payload", "created_at"], (item) => [item.id, safeJson(item), item.createdAt || now]);
    const collaboration = state?.collaboration || {};
    const collaborationRows = [
      ["workspaces", collaboration.workspaces || []],
      ["members", collaboration.members || []],
      ["shares", collaboration.shares || []],
      ["invitations", collaboration.invitations || []],
      ["activity", collaboration.activity || []],
    ].flatMap(([collection, rows]) => rows.map((item) => ({ ...item, collection })));
    replaceRows(db, "collaboration_entities", collaborationRows, ["id", "collection", "workspace_id", "entity_type", "entity_id", "payload", "updated_at"], (item) => [
      item.id,
      item.collection,
      item.workspaceId || null,
      item.entityType || null,
      item.entityId || null,
      safeJson(item),
      item.updatedAt || now,
    ]);
    const academicRows = [
      "subjects",
      "events",
      "grades",
      "attendance",
      "exams",
      "projects",
      "questions",
      "references",
      "resources",
      "studySessions",
    ].flatMap((collection) =>
      (state?.academic?.[collection] || []).map((item) => ({
        ...item,
        collection,
      })),
    );
    replaceRows(db, "academic_entities", academicRows, ["id", "collection", "semester_id", "subject_id", "payload", "updated_at"], (item) => [item.id, item.collection, item.semesterId || null, item.subjectId || item.academicSubjectId || null, safeJson(item), now]);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { path: databasePath, updatedAt: now };
}

function loadState(app) {
  const db = ensureDatabase(app);
  const row = db.prepare("SELECT version, payload, updated_at AS updatedAt FROM state_snapshot WHERE id = 1").get();
  if (!row) return null;
  try {
    return { version: row.version, updatedAt: row.updatedAt, state: JSON.parse(row.payload) };
  } catch {
    return null;
  }
}

function closeDatabase() {
  database?.close();
  database = null;
}

module.exports = { ensureDatabase, saveState, loadState, closeDatabase };
