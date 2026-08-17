import { normalizeAcademicData } from "../domain/academic.js";

const asObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

const asArray = (value) => (Array.isArray(value) ? value : []);

const stableIdPart = (value) =>
  String(value || "item")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "item";

const sharedId = (type, entityId, childId = "") =>
  ["shared", stableIdPart(type), stableIdPart(entityId), childId && stableIdPart(childId)]
    .filter(Boolean)
    .join("-");

const invitationEntity = (invitation) =>
  asObject(invitation?.shared_entities || invitation?.sharedEntity);

const invitationPayload = (invitation) =>
  asObject(invitationEntity(invitation).payload);

const sharedMetadata = (invitation, entity, extra = {}) => ({
  sharedWithMe: true,
  sharedEntityId: entity.id,
  originalEntityId: entity.entity_id || null,
  sharingPermission: invitation.permission || "viewer",
  sharedReadOnly: invitation.permission !== "editor",
  sharedEntityRevision: Number(entity.revision || 1),
  sharedAt: invitation.accepted_at || Date.now(),
  ...extra,
});

const entityMatches = (item, entityId) =>
  String(item?.sharedEntityId || "") === String(entityId || "");

export function hasImportedSharedEntity(state, entityId) {
  if (!state || !entityId) return false;
  const academic = normalizeAcademicData(state.academic);
  return Boolean(
    asArray(state.studyItems).some((item) => entityMatches(item, entityId)) ||
      asArray(state.courses).some((item) => entityMatches(item, entityId)) ||
      asArray(state.tasks?.list).some((item) => entityMatches(item, entityId)) ||
      asArray(state.flashcardDecks).some((item) => entityMatches(item, entityId)) ||
      academic.subjects.some((item) => entityMatches(item, entityId)) ||
      academic.projects.some((item) => entityMatches(item, entityId)),
  );
}

const recipientSubjectId = (state, originalSubjectId) => {
  if (!originalSubjectId) return null;
  const academic = normalizeAcademicData(state.academic);
  return (
    academic.subjects.find(
      (subject) =>
        String(subject.id) === String(originalSubjectId) ||
        String(subject.originalEntityId || "") === String(originalSubjectId),
    )?.id || null
  );
};

const childExists = (items, id) => asArray(items).some((item) => item.id === id);

const importSubjectBundle = (invitation, entity, payload, store) => {
  const state = store.getState();
  const academic = normalizeAcademicData(state.academic);
  const incoming = asObject(payload.subject || payload);
  const id = sharedId("subject", entity.id);
  const metadata = sharedMetadata(invitation, entity);

  if (!academic.subjects.some((subject) => subject.id === id)) {
    state.addAcademicEntity("subjects", {
      ...incoming,
      ...metadata,
      id,
      semesterId: academic.activeSemesterId,
      linkedCourseIds: [],
      courseId: null,
      isArchived: false,
    });
  }

  asArray(payload.notes).forEach((note, index) => {
    const childId = sharedId("subject-note", entity.id, note.id || index);
    if (childExists(store.getState().studyItems, childId)) return;
    store.getState().addNote({
      ...asObject(note),
      ...metadata,
      id: childId,
      sharedParentEntityId: entity.id,
      academicSubjectId: id,
      subjectId: id,
      academicSemesterId: academic.activeSemesterId,
      sourceCourseId: null,
      sourceModuleId: null,
      sourceLessonId: null,
    });
  });

  asArray(payload.tasks).forEach((task, index) => {
    const childId = sharedId("subject-task", entity.id, task.id || index);
    if (childExists(store.getState().tasks?.list, childId)) return;
    store.getState().addTask({
      ...asObject(task),
      ...metadata,
      id: childId,
      sharedParentEntityId: entity.id,
      academicSubjectId: id,
      subjectId: id,
      academicSemesterId: academic.activeSemesterId,
    });
  });

  asArray(payload.resources).forEach((resource, index) => {
    const childId = sharedId("subject-resource", entity.id, resource.id || index);
    if (childExists(normalizeAcademicData(store.getState().academic).resources, childId)) return;
    store.getState().addAcademicEntity("resources", {
      ...asObject(resource),
      ...metadata,
      id: childId,
      sharedParentEntityId: entity.id,
      subjectId: id,
      semesterId: academic.activeSemesterId,
    });
  });

  asArray(payload.decks).forEach((deck, index) => {
    const childId = sharedId("subject-deck", entity.id, deck.id || index);
    if (childExists(store.getState().flashcardDecks, childId)) return;
    store.getState().addFlashcardDeck({
      ...asObject(deck),
      ...metadata,
      id: childId,
      sharedParentEntityId: entity.id,
      academicSubjectId: id,
      subjectId: id,
      academicSemesterId: academic.activeSemesterId,
    });
  });

  return id;
};

const importLibraryItem = (invitation, entity, payload, store) => {
  const type = entity.entity_type;
  const source = asObject(payload.note || payload.resource || payload.file || payload);
  const id = sharedId(type, entity.id);
  const isDrawing = type === "whiteboard";
  const isResource = type === "resource";
  if (!childExists(store.getState().studyItems, id)) {
    store.getState().addStudyItem({
      ...source,
      ...sharedMetadata(invitation, entity),
      id,
      title: source.title || entity.title || "Conteúdo compartilhado",
      itemType: isDrawing ? "drawing" : isResource ? "file" : source.itemType || "note",
      type: isDrawing ? "drawing" : isResource ? "file" : source.type || "note",
      noteType: isDrawing ? "drawing" : isResource ? "file" : source.noteType || "note",
      sourceKind: "shared",
      filePath: "",
      fileDataUrl: null,
    });
  }
  return id;
};

const importProject = (invitation, entity, payload, store) => {
  const source = asObject(payload.project || payload);
  const id = sharedId("project", entity.id);
  const state = store.getState();
  const academic = normalizeAcademicData(state.academic);
  if (!academic.projects.some((project) => project.id === id)) {
    state.addAcademicEntity("projects", {
      ...source,
      ...sharedMetadata(invitation, entity),
      id,
      title: source.title || entity.title || "Projeto compartilhado",
      subjectId: recipientSubjectId(state, source.subjectId),
      semesterId: academic.activeSemesterId,
    });
  }
  return id;
};

const importTask = (invitation, entity, payload, store) => {
  const source = asObject(payload.task || payload);
  const id = sharedId("task", entity.id);
  const state = store.getState();
  const academic = normalizeAcademicData(state.academic);
  if (!childExists(state.tasks?.list, id)) {
    const subjectId = recipientSubjectId(state, source.academicSubjectId || source.subjectId);
    state.addTask({
      ...source,
      ...sharedMetadata(invitation, entity),
      id,
      title: source.title || entity.title || "Tarefa compartilhada",
      academicSubjectId: subjectId,
      subjectId,
      academicSemesterId: academic.activeSemesterId,
    });
  }
  return id;
};

const importCourse = (invitation, entity, payload, store) => {
  const type = entity.entity_type;
  const id = sharedId(type, entity.id);
  if (childExists(store.getState().courses, id)) return id;
  const metadata = sharedMetadata(invitation, entity);
  if (type === "course") {
    const source = asObject(payload.course || payload);
    store.getState().addCourse({
      ...source,
      ...metadata,
      id,
      title: source.title || entity.title || "Curso compartilhado",
      academicSubjectId: null,
      academicSemesterId: null,
    });
  } else {
    const lesson = asObject(payload.lesson || payload);
    store.getState().addCourse({
      ...metadata,
      id,
      title: payload.course?.title || "Aulas compartilhadas",
      description: "Conteúdo recebido por compartilhamento.",
      modules: [
        {
          id: sharedId("module", entity.id),
          title: payload.module?.title || "Aulas recebidas",
          lessons: [
            {
              ...lesson,
              id: sharedId("lesson", entity.id),
              sharedWithMe: true,
              originalEntityId: entity.entity_id || lesson.id || null,
              sharingPermission: invitation.permission || "viewer",
            },
          ],
        },
      ],
    });
  }
  return id;
};

export function importSharedInvitation(invitation, store) {
  if (!store?.getState) throw new Error("Armazenamento local indisponível.");
  const entity = invitationEntity(invitation);
  if (!entity.id || !entity.entity_type) {
    throw new Error("O convite não contém um conteúdo válido.");
  }
  if (hasImportedSharedEntity(store.getState(), entity.id)) {
    return { imported: false, duplicate: true, entityId: entity.id };
  }

  const payload = invitationPayload(invitation);
  let localId;
  switch (entity.entity_type) {
    case "subject":
      localId = importSubjectBundle(invitation, entity, payload, store);
      break;
    case "project":
      localId = importProject(invitation, entity, payload, store);
      break;
    case "task":
      localId = importTask(invitation, entity, payload, store);
      break;
    case "course":
    case "lesson":
      localId = importCourse(invitation, entity, payload, store);
      break;
    case "note":
    case "whiteboard":
    case "resource":
      localId = importLibraryItem(invitation, entity, payload, store);
      break;
    default:
      throw new Error("Este tipo de compartilhamento ainda não é suportado.");
  }
  return { imported: true, duplicate: false, entityId: entity.id, localId };
}

export const sharedInvitationType = (invitation) =>
  invitationEntity(invitation).entity_type || "";

export const sharedInvitationTitle = (invitation) =>
  invitationEntity(invitation).title || "Conteúdo compartilhado";
