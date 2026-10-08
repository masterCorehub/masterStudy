import test from 'node:test';
import assert from 'node:assert/strict';
import { getTimedTaskReminders, deliverReminderOnce } from './notificationReminders.js';
test('respeita horário local e ignora tarefas concluídas ou futuras', () => {
  const now = new Date('2026-10-07T14:30:00').getTime();
  const task = { id: 'one', title: 'Revisar', dueDate: '2026-10-07', dueTime: '14:30' };
  assert.equal(getTimedTaskReminders([task], now - 1).length, 0);
  assert.equal(getTimedTaskReminders([task], now).length, 1);
  assert.equal(getTimedTaskReminders([{ ...task, completed: true }], now).length, 0);
});
test('falha não bloqueia nova tentativa e entrega confirmada não se repete', async () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const options = { key: 'reminder', storageKey: 'sent', storage, inFlight: new Set(), payload: {} };
  await deliverReminderOnce({ ...options, send: async () => ({ shown: false }) });
  assert.equal(storage.getItem('sent'), undefined);
  await deliverReminderOnce({ ...options, send: async () => ({ shown: true }) });
  let duplicate = false;
  await deliverReminderOnce({ ...options, send: async () => { duplicate = true; } });
  assert.equal(duplicate, false);
});
