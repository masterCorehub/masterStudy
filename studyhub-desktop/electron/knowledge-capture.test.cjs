const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCapture } = require('./knowledge-capture.cjs');
test('captura conserva texto, origem e ID para reenvio sem duplicação', () => {
  const payload = { id: 'capture-one', title: ' Artigo ', url: 'https://example.com', selectedText: 'Seleção', fullTranscript: 'Conteúdo', tags: ['web', null] };
  const result = normalizeCapture(payload);
  assert.equal(result.id, payload.id);
  assert.equal(result.title, 'Artigo');
  assert.equal(result.selectedText, 'Seleção');
  assert.equal(result.fullTranscript, 'Conteúdo');
  assert.deepEqual(result.tags, ['web']);
  assert.throws(() => normalizeCapture({ title: '' }));
  assert.throws(() => normalizeCapture({ title: 'Inválido', url: 'javascript:alert(1)' }));
});
