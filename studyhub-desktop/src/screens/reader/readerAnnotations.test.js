import test from 'node:test';
import assert from 'node:assert/strict';
import { selectionAnchor, hasTextAnchor, samePassage, annotationAnchor, annotationSelectedText } from './readerAnnotations.js';

test('EPUB selection can be highlighted without PDF rectangles', () => {
  const anchor = selectionAnchor({ cfi: 'epubcfi(/6/4,/4/2:5,/4/2:20)' }, 8, 'page-start');
  assert.equal(anchor.page, 8);
  assert.equal(anchor.cfi, 'epubcfi(/6/4,/4/2:5,/4/2:20)');
  assert.equal(hasTextAnchor(anchor), true);
});
test('Different EPUB passages never match just because their PDF pages are undefined', () => {
  assert.equal(samePassage({ cfi: 'first' }, { cfi: 'second' }), false);
  assert.equal(samePassage({ cfi: 'first' }, { cfi: 'first' }), true);
});
test('PDF passage matching survives zoom but distinguishes repeated text', () => {
  const a = { page: 2, canvasWidth: 100, canvasHeight: 100, rects: [{ x: 10, y: 20 }] };
  assert.equal(samePassage(a, { page: 2, canvasWidth: 200, canvasHeight: 200, rects: [{ x: 20, y: 40 }] }), true);
  assert.equal(samePassage(a, { ...a, rects: [{ x: 10, y: 70 }] }), false);
});
test('Old quotes can recover the exact location from their linked highlight', () => {
  const anchor = annotationAnchor({ id: 'quote-1', page: 4 }, [{ linkedAnnotationId: 'quote-1', cfi: 'exact-range' }]);
  assert.equal(anchor.cfi, 'exact-range');
  assert.equal(hasTextAnchor(selectionAnchor(null, 2, null)), false);
});

test('Notes display selected words separately from commentary and recover linked legacy text', () => {
  assert.equal(annotationSelectedText({ id: 'note', selectedText: 'palavra', content: 'Minha explicação' }), 'palavra');
  assert.equal(annotationSelectedText({ id: 'note', content: 'Minha explicação' }, [{ linkedAnnotationId: 'note', text: 'Trecho do livro' }]), 'Trecho do livro');
  assert.equal(annotationSelectedText({ id: 'page-note', page: 2, content: 'Nota geral' }, [{ page: 2, text: 'Outro trecho' }]), '');
  assert.equal(annotationSelectedText({}, [{ text: 'Não associado' }]), '');
  assert.equal(annotationSelectedText({ cfi: 'range' }, [{ cfi: 'range', text: 'Um' }, { cfi: 'range', text: 'Dois' }]), '');
});
