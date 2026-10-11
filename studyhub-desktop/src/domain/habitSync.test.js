import test from 'node:test';
import assert from 'node:assert/strict';
import { toggleHabitDate } from './habitSync.js';
import { mergeStudyStates, reconcilePersistedEntities } from '../services/account-sync.js';
const state = habit => ({ habits: { list: [habit] } });
const initial = { id: 'habit', completedDates: [] };
test('old snapshots cannot erase a confirmed habit day with a matching baseline', () => {
  const checked = toggleHabitDate(initial, '2026-10-11', 100);
  assert.deepEqual(mergeStudyStates(state(checked), state(checked), state(initial)).state.habits.list[0].completedDates, ['2026-10-11']);
});
test('intentional unchecking survives an old checked snapshot', () => {
  const checked = toggleHabitDate(initial, '2026-10-11', 100);
  const unchecked = toggleHabitDate(checked, '2026-10-11', 200);
  assert.deepEqual(mergeStudyStates({}, state(unchecked), state(checked)).state.habits.list[0].completedDates, []);
});
test('different days edited on separate devices are preserved', () => {
  const left = toggleHabitDate(initial, '2026-10-10', 100);
  const right = toggleHabitDate(initial, '2026-10-11', 200);
  for (const [local, remote] of [[left, right], [right, left]]) {
    assert.deepEqual(mergeStudyStates(state(initial), state(local), state(remote)).state.habits.list[0].completedDates, ['2026-10-10', '2026-10-11']);
  }
});
test('deleted course stays deleted when storage reloads an old copy repeatedly', () => {
  const deleted = { courses: [], entityDeletionTombstones: [{ id: 'course::c', entityType: 'course', entityId: 'c', deletedAt: 100, updatedAt: 100 }] };
  const stale = { courses: [{ id: 'c', title: 'Old', updatedAt: 200 }] };
  let current = deleted;
  for (let i = 0; i < 3; i++) {
    current = mergeStudyStates({}, current, stale).state;
    assert.deepEqual(current.courses, []);
    assert.equal(current.entityDeletionTombstones.length, 1);
  }
});

test('rehydration keeps saved navigation while protecting deleted entities', () => {
  const current = { activeVaultId: 'global', courses: [], entityDeletionTombstones: [{ entityType: 'course', entityId: 'c', deletedAt: 100, updatedAt: 100 }] };
  const persisted = { activeVaultId: 'saved-vault', courses: [{ id: 'c' }] };
  const result = reconcilePersistedEntities(current, persisted);
  assert.equal(result.activeVaultId, 'saved-vault');
  assert.deepEqual(result.courses, []);
});
