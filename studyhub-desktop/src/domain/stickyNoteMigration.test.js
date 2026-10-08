import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeMigratedStickyNotes } from './stickyNoteMigration.js';

test('não recria anotação rápida excluída quando restaura a fonte antiga', () => {
  const legacy = { id: 'sticky-dashboard-quick-note-legacy', title: 'Anotação rápida', content: 'Conteúdo antigo' };
  const trash = [{ entityType: 'sticky_note', entityId: legacy.id, item: legacy }];
  assert.deepEqual(mergeMigratedStickyNotes([], [legacy], trash), []);
});

test('preserva conteúdo e notas legítimas, sem duplicar uma migração repetida', () => {
  const legacy = { id: 'legacy', title: 'Anotação rápida', content: 'Minha anotação' };
  const first = mergeMigratedStickyNotes([], [legacy]);
  assert.deepEqual(first, [legacy]);
  assert.deepEqual(mergeMigratedStickyNotes(first, [legacy]), first);
  const manual = { id: 'manual', title: 'Anotação rápida', content: '' };
  assert.deepEqual(mergeMigratedStickyNotes([manual], [legacy], [{ entityType: 'note', entityId: 'legacy' }]), [manual, legacy]);
});
