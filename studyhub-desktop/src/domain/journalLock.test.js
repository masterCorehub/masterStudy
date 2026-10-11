import test from 'node:test';
import assert from 'node:assert/strict';
import { unlockJournalSession, lockJournalSession, touchJournalSession, isJournalSessionOpen } from './journalLock.js';
test('modo ao fechar preserva sessão e nunca libera outro usuário', () => {
  unlockJournalSession('user-a', 1000);
  assert.equal(isJournalSessionOpen('user-a', 0, 99999999), true);
  assert.equal(isJournalSessionOpen('user-b', 0, 2000), false);
  lockJournalSession();
  assert.equal(isJournalSessionOpen('user-a', 0, 2000), false);
});
test('atividade renova prazo e sessão vencida permanece bloqueada', () => {
  unlockJournalSession('user-a', 1000);
  touchJournalSession(30000);
  assert.equal(isJournalSessionOpen('user-a', 1, 89999), true);
  assert.equal(isJournalSessionOpen('user-a', 1, 90000), false);
  touchJournalSession(90001);
  assert.equal(isJournalSessionOpen('user-a', 0, 90002), false);
});
