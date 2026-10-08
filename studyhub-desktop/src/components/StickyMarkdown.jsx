import { useEffect, useState } from 'react';
import { Icon } from '../ui/Icon';
import { markdownToHtml } from '../domain/markdownUtils';
import { sanitizeUserHtml } from '../utils/sanitizeHtml';

export function StickyMarkdown({ content = '', onChange, textareaProps = {} }) {
  const [preview, setPreview] = useState(() => /(^#{1,6}\s|\*\*|^\s*[-*]\s|\[[^\]]+\]\(|```)/m.test(content));
  const [rendered, setRendered] = useState(null);
  useEffect(() => {
    if (!preview) return;
    let cancelled = false;
    // Keep source text as the saved value; HTML is only a sanitized preview.
    markdownToHtml(content).then(html => {
      const withTasks = html.replace(/<input\b[^>]*type="checkbox"[^>]*>/g, tag => tag.includes('checked') ? '<span>☑</span>' : '<span>☐</span>');
      if (!cancelled) setRendered({ source: content, html: sanitizeUserHtml(withTasks) });
    });
    return () => { cancelled = true; };
  }, [content, preview]);
  return <div className="sticky-markdown flex min-h-0 flex-1 flex-col">
    <div className="sticky-markdown-toolbar">
      <button type="button" disabled={textareaProps.disabled} aria-label={preview ? 'Editar Markdown' : 'Visualizar Markdown'} aria-pressed={preview} onClick={() => setPreview(value => !value)}><Icon name={preview ? 'edit' : 'visibility'} /><span>{preview ? 'Editar' : 'Visualizar'}</span></button>
    </div>
    {preview ? <div className="sticky-markdown-preview" aria-label="Nota formatada em Markdown" onClick={event => {
      const anchor = event.target.closest('a');
      if (anchor && window.studyhubDesktop?.openExternal && /^https?:/i.test(anchor.href)) {
        event.preventDefault(); window.studyhubDesktop.openExternal(anchor.href);
      }
    }}>{rendered?.source === content ? <div dangerouslySetInnerHTML={{ __html: rendered.html }} /> : <div className="whitespace-pre-wrap">{content}</div>}</div> : <textarea {...textareaProps} value={content} onChange={event => onChange(event.target.value)} />}
  </div>;
}
