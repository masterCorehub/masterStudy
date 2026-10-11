const pathPart = value => String(value || '').trim().replace(/[\\/]/g, ' · ');
export function isClassNote(note) {
  return Boolean(note.sourceLessonId || note.sourceLessonTitle || note.lessonId || note.lessonDate || note.sourceKind === 'class-note');
}
export function organizeLessonNote(note, courses = []) {
  if (!note.sourceCourseId || !note.sourceLessonId || note.parentNoteId) return note;
  const course = courses.find(item => item.id === note.sourceCourseId);
  const module = course?.modules?.find(item => item.id === note.sourceModuleId || item.lessons?.some(lesson => lesson.id === note.sourceLessonId));
  const lesson = module?.lessons?.find(item => item.id === note.sourceLessonId) || course?.lessons?.find(item => item.id === note.sourceLessonId);
  // O vault já representa o curso; o caminho começa dentro dele.
  const moduleName = module?.title || (note.sourceModuleId ? note.module || 'Módulo' : '');
  const lessonName = lesson?.title || note.sourceLessonTitle || 'Aula';
  const names = [moduleName, lessonName]
    .filter(Boolean)
    .map(pathPart);
  const path = names.join('/');

  // Corrige apenas o caminho antigo gerado pelo app; caminhos personalizados ficam intactos.
  const legacyModuleName = module?.title || note.module || 'Módulo';
  const legacyPath = [course?.title || 'Curso', legacyModuleName, lessonName]
    .map(pathPart)
    .join('/');
  const currentPath = note.path === legacyPath ? path : note.path || path;

  return { ...note, path: currentPath, vaultId: note.vaultId || `course-${note.sourceCourseId}`, sourceKind: note.sourceKind || 'class-note' };
}
