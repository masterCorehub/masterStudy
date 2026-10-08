const crypto = require('node:crypto');

function normalizeCapture(payload) {
  if (!payload || typeof payload !== 'object' || typeof payload.title !== 'string' || !payload.title.trim()) throw new Error('A captura precisa de um título.');
  const sourceUrl = payload.sourceUrl || payload.url;
  if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) throw new Error('Use uma página HTTP ou HTTPS.');
  return {
    ...payload,
    id: typeof payload.id === 'string' && payload.id.length <= 128 ? payload.id : `capture-${crypto.randomUUID()}`,
    title: payload.title.trim().slice(0, 300),
    capturedAt: payload.capturedAt || Date.now(),
    tags: Array.isArray(payload.tags) ? payload.tags.filter(tag => typeof tag === 'string').slice(0, 30) : ['captura'],
  };
}
module.exports = { normalizeCapture };
