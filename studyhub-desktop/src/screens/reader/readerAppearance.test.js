import test from 'node:test';
import assert from 'node:assert/strict';
import { readerProgress, READER_THEMES, DEFAULT_READER_SETTINGS } from './readerAppearance.js';

test('Reader progress starts at zero, ends at 100 and clamps outdated positions', () => {
  assert.equal(readerProgress(1, 5), 0);
  assert.equal(readerProgress(3, 5), 50);
  assert.equal(readerProgress(5, 5), 100);
  assert.equal(readerProgress(9, 5), 100);
  assert.equal(readerProgress(-1, 5), 0);
  assert.equal(readerProgress(1, 0), 0);
  assert.equal(readerProgress(1, 1), 0);
});

test('Existing saved theme IDs remain supported by the new reader', () => {
  for (const id of ['light', 'sepia', 'dark', 'night']) assert.ok(READER_THEMES[id].filter);
  assert.equal(DEFAULT_READER_SETTINGS.scrollMode, 'paginated');
  assert.equal(DEFAULT_READER_SETTINGS.pdfZoom, 1);
});
