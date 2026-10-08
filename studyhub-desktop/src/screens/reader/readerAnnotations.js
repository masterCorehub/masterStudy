export const SAVED_PASSAGE_COLOR = 'yellow';

export function annotationSelectedText(annotation, highlights = []) {
  if (annotation?.selectedText?.trim()) return annotation.selectedText;
  // Older notes sometimes kept the passage only in their linked highlight.
  // Never infer a passage from page number alone: several notes can share it.
  const linked = highlights.find(highlight => (annotation?.id && highlight.linkedAnnotationId === annotation.id) || (annotation?.highlightId && highlight.id === annotation.highlightId));
  if (linked?.text?.trim()) return linked.text;
  const matches = highlights.filter(highlight => samePassage(annotation, highlight));
  return matches.length === 1 ? matches[0].text || "" : "";
}

// EPUB stores a text range (CFI); PDF stores page-relative rectangles.
export function selectionAnchor(selection, page, currentCfi) {
  return {
    page: selection?.page || page,
    cfi: selection?.cfi || currentCfi || null,
    rects: selection?.rects || [],
    canvasWidth: selection?.canvasWidth,
    canvasHeight: selection?.canvasHeight,
  };
}

export function hasTextAnchor(anchor) {
  return Boolean(anchor?.cfi || anchor?.rects?.length);
}

export function samePassage(a, b) {
  if (a?.cfi || b?.cfi) return Boolean(a?.cfi && a.cfi === b?.cfi);
  if (!a?.page || a.page !== b?.page || !a.rects?.length || !b.rects?.length) return false;
  // Normalize PDF coordinates so zoom changes do not change passage identity.
  const first = a.rects[0], second = b.rects[0];
  return Math.abs(first.x / (a.canvasWidth || 1) - second.x / (b.canvasWidth || 1)) < .01
    && Math.abs(first.y / (a.canvasHeight || 1) - second.y / (b.canvasHeight || 1)) < .01;
}

export function annotationAnchor(annotation, highlights = []) {
  const linked = highlights.find(h => h.linkedAnnotationId === annotation.id);
  return { ...linked, ...annotation, highlightId: linked?.id || annotation.id, cfi: annotation.cfi || linked?.cfi, rects: annotation.rects?.length ? annotation.rects : linked?.rects || [], canvasWidth: annotation.canvasWidth || linked?.canvasWidth, canvasHeight: annotation.canvasHeight || linked?.canvasHeight };
}
