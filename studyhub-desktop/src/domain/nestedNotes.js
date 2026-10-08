import { getVaultForNote } from "./vaults.js";

export function nestedNoteContext(parent) {
  return {
    parentNoteId: parent.id,
    sourceKind: "nested-note",
    vaultId: getVaultForNote(parent),
    path: parent.path || "",
    academicSubjectId: parent.academicSubjectId || parent.subjectId || null,
    sourceCourseId: parent.sourceCourseId || parent.courseId || null,
    sourceLessonId: parent.sourceLessonId || null,
  };
}

export function repairNestedNotes(notes) {
  const byId = new Map(notes.map((note) => [String(note.id), note]));
  const parents = new Map();
  for (const parent of notes) {
    const content = parent.content || parent.markdownContent || "";
    for (const match of content.matchAll(
      /(?:#nested-note=|data-nested-note-id=["'])([^"'\s<>]+)/g,
    )) {
      const child = byId.get(match[1]);
      if (child?.sourceKind === "nested-note" && child.id !== parent.id) {
        const candidates = parents.get(String(child.id)) || new Set();
        candidates.add(String(parent.id));
        parents.set(String(child.id), candidates);
      }
    }
  }
  const parentIds = new Map(
    notes.map((note) => {
      const candidates = parents.get(String(note.id));
      return [
        String(note.id),
        note.parentNoteId ||
          (candidates?.size === 1 ? [...candidates][0] : null),
      ];
    }),
  );
  return notes.map((note) => {
    const parent = byId.get(String(parentIds.get(String(note.id))));
    if (!parent) return note;
    const visited = new Set([String(note.id)]);
    let current = parent;
    let root = parent;
    while (current) {
      if (visited.has(String(current.id)))
        return { ...note, parentNoteId: null };
      visited.add(String(current.id));
      root = current;
      current = byId.get(String(parentIds.get(String(current.id))));
    }
    return { ...note, ...nestedNoteContext(root), parentNoteId: parent.id };
  });
}
