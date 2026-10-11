const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function setup() {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, { value: '', hidden: false, textContent: '', focus() {}, append() {} });
    return elements.get(id);
  };
  const messages = [], listeners = {};
  const parent = { postMessage() {} };
  const context = {
    URL,
    document: { getElementById: get, querySelectorAll: () => [], createElement: () => ({}) },
    window: { parent, addEventListener: (name, callback) => { listeners[name] = callback; } },
    chrome: {
      tabs: { query: async () => [{ id: 1, url: 'https://youtube.com/watch?v=abc' }], sendMessage: async () => ({ seconds: 137 }) },
      storage: { local: { get: async () => ({}), set: async () => {}, remove: async () => {} } },
      runtime: { sendMessage: async message => { messages.push(message); return { success: true, result: { message: 'Resumo real do provedor' } }; } },
    }, crypto: { randomUUID: () => 'test-id' },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../studyhub-extension/sidepanel.js'), 'utf8'), context);
  const receive = data => listeners.message({ source: parent, data: { type: 'STUDYHUB_PAGE_DATA_RESPONSE', data } });
  return { get, messages, receive };
}
test('abrir página não gera IA; resumo só é solicitado por clique', async () => {
  const panel = setup();
  panel.receive({ url: 'https://example.com', title: 'Interfaces', rawContent: 'Conteúdo de estudo', type: 'web', hasFullTranscript: true });
  assert.equal(panel.messages.length, 0);
  assert.equal(panel.get('transcriptButton').hidden, true);
  await panel.get('summary').onclick();
  assert.equal(panel.messages[0].type, 'GENERATE_CONTENT_AI');
  assert.equal(panel.get('result').textContent, 'Resumo real do provedor');
});
test('vídeo sem transcrição não oferece texto inventado', () => {
  const panel = setup();
  panel.receive({ url: 'https://youtube.com/watch?v=abc', title: 'Vídeo', rawContent: 'Descrição', type: 'youtube', hasFullTranscript: false });
  assert.equal(panel.get('transcriptButton').hidden, true);
  assert.equal(panel.messages.length, 0);
});
test('salvar consulta o tempo atual e preserva o link para retomar', async () => {
  const panel = setup();
  panel.receive({ url: 'https://youtube.com/watch?v=abc', title: 'Vídeo', rawContent: 'Descrição', type: 'youtube' });
  await panel.get('save').onclick();
  const capture = panel.messages.find(message => message.type === 'SAVE_KNOWLEDGE_CAPTURE').payload;
  assert.equal(capture.videoPositionSeconds, 137);
  assert.equal(new URL(capture.sourceUrl).searchParams.get('t'), '137s');
  assert.equal(capture.summaryConcise, '');
});
