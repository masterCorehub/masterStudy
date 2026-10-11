// Carimbos por campo evitam que mudar a cor sobrescreva um texto mais recente.
export function applyStickyUpdate(note, updates, now = Date.now()) {
  const stamp = Number(updates.updatedAt) || now;
  const next = { ...note, fieldUpdatedAt: { ...note.fieldUpdatedAt } };
  for (const [key, value] of Object.entries(updates)) {
    if (['id', 'createdAt', 'updatedAt', 'fieldUpdatedAt'].includes(key)) continue;
    const incoming = Number(updates.fieldUpdatedAt?.[key]) || stamp;
    const current = Number(note.fieldUpdatedAt?.[key]) || Number(note.updatedAt) || 0;
    if (incoming < current) continue;
    next[key] = value;
    next.fieldUpdatedAt[key] = incoming;
  }
  next.updatedAt = Math.max(Number(note.updatedAt) || 0, stamp);
  return next;
}
export function mergeStickyNote(local, remote) {
  return applyStickyUpdate(local, remote, Number(remote.updatedAt) || 0);
}
