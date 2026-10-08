import { annotationSelectedText } from "../../screens/reader/readerAnnotations";

export function BookAnnotationExcerpt({ annotation, highlights }) {
  const text = annotationSelectedText(annotation, highlights);
  if (!text) return null;
  return <div className="my-2 rounded-r-lg border-l-2 border-[color:var(--primary)] bg-[color:var(--surface-container-low)] p-3" data-testid="annotation-excerpt">
    <p className="mb-1 text-[10px] font-semibold text-[color:var(--primary)]">Trecho selecionado</p>
    <blockquote className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-[color:var(--on-surface)]">{text}</blockquote>
  </div>;
}
