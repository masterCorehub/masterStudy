import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVaultTree, collectVaultDeletion } from './vaultTree.js';
import { applyEntityDeletionTombstones } from '../services/account-sync.js';

test('empty explicit subfolders attach under inferred ancestors without duplicating the tree', () => {
  const tree = buildVaultTree([{ id: 'n', title: 'Nota', path: 'Java/Fundamentos' }],
    [{ id: 'f', name: 'Exercícios', path: 'Java/Fundamentos/Exercícios' }]);
  assert.equal(tree.length, 1);
  const module = tree[0].children[0];
  assert.equal(module.path, 'Java/Fundamentos');
  assert.deepEqual(module.children.map(item => item.id), ['f', 'n']);
});

test('nested notes attach to their parent and cyclic parents cannot hide notes', () => {
  const tree = buildVaultTree([{ id: 'parent', title: 'Principal' },
    { id: 'child', parentNoteId: 'parent' }, { id: 'a', parentNoteId: 'b' }, { id: 'b', parentNoteId: 'a' }]);
  assert.deepEqual(tree.find(item => item.id === 'parent').children.map(item => item.id), ['child']);
  assert.ok(tree.some(item => item.id === 'a'));
  assert.ok(tree.some(item => item.id === 'b'));
});

test('root deletion includes descendants but excludes similar names and other vaults', () => {
  const notes = [{ id: 'root-note', path: 'Java/Fundamentos', vaultId: 'course-a' },
    { id: 'child', parentNoteId: 'root-note', vaultId: 'course-a' },
    { id: 'other-prefix', path: 'Javascript', vaultId: 'course-a' },
    { id: 'other-vault', path: 'Java', vaultId: 'course-b' }];
  const folders = [{ id: 'f', path: 'Java/Fundamentos', vaultId: 'course-a' },
    { id: 'other', path: 'Java', vaultId: 'course-b' }];
  const result = collectVaultDeletion({ notes, folders,
    targets: [{ id: 'virtual', type: 'folder', path: 'Java', vaultId: 'course-a' }] });
  assert.deepEqual([...result.noteIds], ['root-note', 'child']);
  assert.deepEqual([...result.folderIds], ['f']);
});

test('deleting a parent note includes all levels of internal notes', () => {
  const result = collectVaultDeletion({ notes: [{ id: 'a' }, { id: 'b', parentNoteId: 'a' },
    { id: 'c', parentNoteId: 'b' }, { id: 'd' }], targets: [{ id: 'a', type: 'note' }] });
  assert.deepEqual([...result.noteIds], ['a', 'b', 'c']);
});

test('deleted folders stay deleted when an old cloud snapshot arrives and can be restored', () => {
  const state = { vaultFolders: [{ id: 'f' }], entityDeletionTombstones: [
    { id: 'vault_folder::f', entityType: 'vault_folder', entityId: 'f', deletedAt: 100, updatedAt: 100 },
  ] };
  assert.deepEqual(applyEntityDeletionTombstones(state).vaultFolders, []);
  state.entityDeletionTombstones[0].restoredAt = 200;
  assert.equal(applyEntityDeletionTombstones(state).vaultFolders.length, 1);
});
