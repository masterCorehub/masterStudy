const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { deliverNotification } = require('./notification-delivery.cjs');
test('confirma entrega somente após evento do sistema', async () => {
  const notification = new EventEmitter();
  notification.show = () => setImmediate(() => notification.emit('show'));
  assert.deepEqual(await deliverNotification(notification), { shown: true });
  notification.emit('close');
});
test('retorna falha real e timeout sem informar sucesso', async () => {
  const failed = new EventEmitter();
  failed.show = () => failed.emit('failed', {}, 'Permission denied');
  assert.equal((await deliverNotification(failed)).error, 'Permission denied');
  const silent = new EventEmitter();
  silent.show = () => {};
  assert.equal((await deliverNotification(silent, 5)).reason, 'timeout');
});
