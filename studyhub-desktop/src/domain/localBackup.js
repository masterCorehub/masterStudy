const arrays = ['studyItems','courses','journalEntries','stickyNotes','flashcards','flashcardDecks','customVaults','vaultFolders','knowledgeItems','bookCategories','importantQuotes','entityDeletionTombstones','universalTrash','universalHistory','sidebarOrder','sidebarHiddenItems'];
const objects = ['academic','tasks','habits','books','appSettings','journalSettings'];
// An explicit allowlist keeps account tokens and AI secrets out of backups.
export function readLocalBackup(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Formato de backup inválido.');
  const result = {};
  for (const key of arrays) {
    if (value[key] === undefined) continue;
    if (!Array.isArray(value[key])) throw new Error(`Campo inválido: ${key}.`);
    result[key] = value[key];
  }
  for (const key of objects) {
    if (value[key] === undefined) continue;
    const field = key === 'books' && Array.isArray(value[key]) ? { list: value[key] } : value[key];
    if (!field || typeof field !== 'object' || Array.isArray(field)) throw new Error(`Campo inválido: ${key}.`);
    result[key] = field;
  }
  if (!Object.keys(result).length) throw new Error('O arquivo não contém dados do masterStudy.');
  return JSON.parse(JSON.stringify(result));
}
export function createLocalBackup(state, now = new Date()) {
  return { ...readLocalBackup(state), exportedAt: now.toISOString(), version: '3.0.0' };
}
