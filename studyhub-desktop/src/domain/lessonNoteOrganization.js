const pathPart = value => String(value || '').trim().replace(/[\\/]/g, ' · ');
export function isClassNote(note) {
  return Boolean(note.sourceLessonId || note.sourceLessonTitle || note.lessonId || note.lessonDate || note.sourceKind === 'class-note');
}
export function organizeLessonNote(note, courses = []) {
  if (!note.sourceCourseId || !note.sourceLessonId || note.parentNoteId || note.path) return note;
  const course = courses.find(item => item.id === note.sourceCourseId);
  const module = course?.modules?.find(item => item.id === note.sourceModuleId || item.lessons?.some(lesson => lesson.id === note.sourceLessonId));
  const lesson = module?.lessons?.find(item => item.id === note.sourceLessonId) || course?.lessons?.find(item => item.id === note.sourceLessonId);
  const names = [course?.title || 'Curso', module?.title || note.module || 'Módulo', lesson?.title || note.sourceLessonTitle || 'Aula'];
  return { ...note, path: names.map(pathPart).join('/'), vaultId: note.vaultId || `course-${note.sourceCourseId}`, sourceKind: note.sourceKind || 'class-note' };
}
