// A lixeira impede que uma fonte antiga recrie uma nota que o usuário excluiu.
export function mergeMigratedStickyNotes(currentNotes, migratedNotes, trash = []) {
  const existingIds = new Set(currentNotes.map(note => note.id));
  const deletedIds = new Set(trash
    .filter(item => item.entityType === "sticky_note")
    .map(item => item.entityId || item.item?.id));
  return [
    ...currentNotes,
    ...migratedNotes.filter(note => !existingIds.has(note.id) && !deletedIds.has(note.id)),
  ];
}
