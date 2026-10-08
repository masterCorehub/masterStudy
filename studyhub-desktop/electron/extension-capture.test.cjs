const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('extensão reenvia captura pendente com ID original e só remove após sucesso', async () => {
  const capture = { id: 'offline-one', title: 'Página salva', rawContent: 'Texto selecionado' };
  let listener;
  const sent = [];
  const removed = [];
  let online = false;
  const context = {
    chrome: {
      storage: { local: { get: async () => ({ capture_1: capture }), remove: async key => removed.push(key) } },
      runtime: { onStartup: { addListener() {} }, onMessage: { addListener(fn) { listener = fn; } } },
    },
    fetch: async (url, options) => {
      sent.push({ url, payload: JSON.parse(options.body) });
      if (!online) throw new Error('App fechado');
      return { ok: true, json: async () => ({ ok: true }) };
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../studyhub-extension/service-worker.js'), 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(removed, []);
  online = true;
  await new Promise(resolve => listener({ type: 'SAVE_KNOWLEDGE_CAPTURE', payload: { id: 'new', title: 'Outra página' } }, {}, resolve));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(removed, ['capture_1']);
  assert.equal(sent.filter(item => item.payload.id === 'offline-one').length, 2);
  assert.equal(sent.find(item => item.payload.id === 'offline-one').payload.rawContent, 'Texto selecionado');
});
