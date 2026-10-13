import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeStudyStates, reconcilePersistedEntities } from '../services/account-sync.js';
const state = book => ({ books: { list: [book] } });
const local = { id: 'b', updatedAt: 200, title: 'Local', lastPosition: { page: 18, cfi: 'epubcfi(/6/8!/4/2:40)', percent: 30, savedAt: 200 } };
const stale = { id: 'b', updatedAt: 500, title: 'New title', lastPosition: { page: 2, cfi: 'epubcfi(/6/2!/4/2:0)', percent: 3, savedAt: 100 } };
test('newer metadata cannot replace the last reading position with an old one', () => {
  const result = mergeStudyStates(state(local), state(local), state(stale)).state.books.list[0];
  assert.equal(result.title, 'New title');
  assert.deepEqual(result.lastPosition, local.lastPosition);
});
test('a newer intentional return to an earlier page is preserved', () => {
  const remote = { ...stale, lastPosition: { ...stale.lastPosition, savedAt: 600 } };
  assert.deepEqual(mergeStudyStates({}, state(local), state(remote)).state.books.list[0].lastPosition, remote.lastPosition);
});
test('rehydration preserves the position even when persisted metadata is newer', () => {
  assert.deepEqual(reconcilePersistedEntities(state(local), state(stale)).books.list[0].lastPosition, local.lastPosition);
});
test('PDF page and progress stay together across reverse-order delivery', () => {
  const pdf = { id: 'p', updatedAt: 200, lastPosition: { page: 42, percent: 50, savedAt: 200 } };
  const old = { id: 'p', updatedAt: 900, lastPosition: { page: 1, percent: 1, savedAt: 100 } };
  for (const [left,right] of [[pdf,old],[old,pdf]]) {
    assert.deepEqual(mergeStudyStates({}, state(left), state(right)).state.books.list[0].lastPosition,pdf.lastPosition);
  }
});
test('records without savedAt retain legacy compatibility', () => {
  const old = { id: 'p', updatedAt: 100, lastPosition: { page: 1 } };
  const newer = { id: 'p', updatedAt: 200, lastPosition: { page: 12 } };
  assert.equal(mergeStudyStates({},state(old),state(newer)).state.books.list[0].lastPosition.page,12);
});
