const stripHtml = (value = "") =>
  value
    .replace(/<[^>]*>?/gm, "")
    .replace(/&nbsp;/g, " ")
    .trim();

export const createLessonNoteDraft = (lessonId) => ({
  lessonId: lessonId || null,
  noteId: null,
  title: "",
  content: "",
  drawings: [],
  isDirty: false,
});

export const lessonNoteDraftReducer = (state, action) => {
  switch (action.type) {
    case "lessonChanged":
      return state.lessonId === action.lessonId
        ? state
        : createLessonNoteDraft(action.lessonId);
    case "titleChanged":
      return { ...state, title: action.title, isDirty: true };
    case "contentChanged":
      return { ...state, content: action.content, isDirty: true };
    case "drawingsChanged":
      return { ...state, drawings: action.drawings, isDirty: true };
    case "noteOpened":
      return {
        lessonId: action.lessonId || action.note.sourceLessonId || null,
        noteId: action.note.id,
        title: action.note.title || "",
        content: action.note.content || "",
        drawings: action.note.drawings || [],
        isDirty: false,
      };
    case "newNote":
      return createLessonNoteDraft(state.lessonId);
    case "saved":
      return {
        ...state,
        noteId: action.noteId,
        title: action.title,
        isDirty: false,
      };
    default:
      return state;
  }
};

export const prepareLessonNoteSave = ({
  draft,
  lesson,
  courseId,
  moduleId,
  moduleTitle,
  currentTime,
  newNoteId,
}) => {
  if (!stripHtml(draft.content) && (!draft.drawings || !draft.drawings.length)) return null;

  const hasTime = Number.isFinite(currentTime);
  const noteId = draft.noteId || newNoteId;
  const values = {
    title: draft.title.trim() || `Nota sobre ${lesson?.title || "Aula"}`,
    content: draft.content,
    drawings: draft.drawings || [],
    module: moduleTitle || "Aula",
    time: hasTime
      ? `${Math.floor(currentTime / 60)}:${String(Math.floor(currentTime % 60)).padStart(2, "0")}`
      : "Agora",
    timestamp: hasTime ? currentTime : null,
    sourceCourseId: courseId || null,
    sourceModuleId: moduleId || null,
    sourceLessonId: lesson?.id || draft.lessonId || null,
    sourceLessonTitle: lesson?.title || "",
  };

  if (!draft.noteId) values.id = noteId;

  return {
    kind: draft.noteId ? "update" : "create",
    noteId,
    values,
  };
};
