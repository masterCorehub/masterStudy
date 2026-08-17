export const DEFAULT_GLOBAL_VAULT_ID = "global";

/**
 * Retorna o ID do vault a que uma nota pertence.
 * @param {Object} note - Objeto da nota
 * @returns {string} ID do vault
 */
export function getVaultForNote(note = {}) {
  if (note.vaultId) {
    return note.vaultId;
  }
  if (note.academicSubjectId || note.subjectId) {
    return `discipline-${note.academicSubjectId || note.subjectId}`;
  }
  if (note.sourceCourseId || note.courseId) {
    return `course-${note.sourceCourseId || note.courseId}`;
  }
  return DEFAULT_GLOBAL_VAULT_ID;
}

/**
 * Retorna a lista completa e estruturada de todos os vaults disponíveis no sistema.
 * @param {Object} params
 * @param {Object} [params.academic]
 * @param {Array} [params.courses]
 * @param {Array} [params.customVaults]
 * @param {Array} [params.studyItems]
 * @returns {Array<Object>} Lista de vaults com contagem de notas e metadados
 */
export function getAllVaults({
  academic = {},
  courses = [],
  customVaults = [],
  studyItems = [],
} = {}) {
  const notes = (studyItems || []).filter(
    (item) => item.itemType === "note" || item.itemType === "drawing" || item.type === "note",
  );

  // Contagem de notas por vaultId
  const noteCounts = {};
  notes.forEach((note) => {
    const vId = getVaultForNote(note);
    noteCounts[vId] = (noteCounts[vId] || 0) + 1;
  });

  const subjects = Array.isArray(academic.subjects) ? academic.subjects.filter((s) => !s.isArchived) : [];

  const vaults = [
    {
      id: DEFAULT_GLOBAL_VAULT_ID,
      name: "Vault Geral",
      description: "Anotações soltas e gerais sem vínculo específico",
      icon: "folder",
      type: "global",
      color: "#6366f1",
      noteCount: noteCounts[DEFAULT_GLOBAL_VAULT_ID] || 0,
    },
  ];

  // Vaults de Disciplinas Acadêmicas
  subjects.forEach((subject) => {
    const vId = `discipline-${subject.id}`;
    vaults.push({
      id: vId,
      name: subject.name || "Disciplina",
      description: `Anotações da disciplina ${subject.name}`,
      icon: "auto_stories",
      type: "discipline",
      subjectId: subject.id,
      color: subject.color || "#0ea5e9",
      noteCount: noteCounts[vId] || 0,
    });
  });

  // Vaults de Cursos
  (courses || []).forEach((course) => {
    const vId = `course-${course.id}`;
    vaults.push({
      id: vId,
      name: course.title || "Curso",
      description: `Anotações do curso ${course.title}`,
      icon: "school",
      type: "course",
      courseId: course.id,
      color: course.color || "#8b5cf6",
      noteCount: noteCounts[vId] || 0,
    });
  });

  // Vaults Personalizados do Usuário
  (customVaults || []).forEach((cv) => {
    vaults.push({
      id: cv.id,
      name: cv.name || "Cofre Personalizado",
      description: cv.description || "",
      icon: cv.icon || "folder_special",
      type: "custom",
      color: cv.color || "#ec4899",
      noteCount: noteCounts[cv.id] || 0,
      createdAt: cv.createdAt,
    });
  });

  return vaults;
}

/**
 * Filtra a lista de notas para o vault ativo.
 * @param {Array} notes
 * @param {string} activeVaultId
 * @returns {Array} Notas pertencentes ao vault ativo
 */
export function filterNotesByVault(notes = [], activeVaultId = DEFAULT_GLOBAL_VAULT_ID) {
  if (!activeVaultId || activeVaultId === "all") {
    return notes;
  }
  return (notes || []).filter((note) => getVaultForNote(note) === activeVaultId);
}

/**
 * Filtra pastas para o vault ativo.
 * @param {Array} folders
 * @param {string} activeVaultId
 * @returns {Array} Pastas pertencentes ao vault ativo
 */
export function filterFoldersByVault(folders = [], activeVaultId = DEFAULT_GLOBAL_VAULT_ID) {
  if (!activeVaultId || activeVaultId === "all") {
    return folders;
  }
  return (folders || []).filter((f) => !f.vaultId || f.vaultId === activeVaultId);
}
