import { toggleStickyTask } from "../domain/stickyTasks";
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
      const withTasks = html.replace(/<input\b[^>]*type="checkbox"[^>]*>/g, tag => tag.includes('checked') ? '<span class="sticky-task-checkbox" aria-label="Marcar como pendente">☑</span>' : '<span class="sticky-task-checkbox" aria-label="Concluir tarefa">☐</span>');
      if (!cancelled) setRendered({ source: content, html: sanitizeUserHtml(withTasks) });
    }).catch(() => { if (!cancelled) setRendered(null); });
    return () => { cancelled = true; };
  }, [content, preview]);
  return <div className="sticky-markdown flex min-h-0 flex-1 flex-col overflow-hidden">
    <div className="sticky-markdown-toolbar">
      <button type="button" disabled={textareaProps.disabled} aria-label={preview ? 'Editar Markdown' : 'Visualizar Markdown'} aria-pressed={preview} onClick={() => setPreview(value => !value)}><Icon name={preview ? 'edit' : 'visibility'} /><span>{preview ? 'Editar' : 'Visualizar'}</span></button>
      <button type="button" disabled={textareaProps.disabled} onClick={() => { onChange(`${content}${content && !content.endsWith('\n') ? '\n' : ''}- [ ] Nova tarefa`); setPreview(false); }} aria-label="Adicionar tarefa"><Icon name="check_box" /><span>Tarefa</span></button>
    </div>
    {preview ? <div className="sticky-markdown-preview" aria-label="Nota formatada em Markdown" onClick={event => {
      const task = event.target.closest('.sticky-task-checkbox');
      if (task && !textareaProps.disabled) {
        const tasks = Array.from(event.currentTarget.querySelectorAll('.sticky-task-checkbox'));
        onChange(toggleStickyTask(content, tasks.indexOf(task)));
        return;
      }
      const anchor = event.target.closest('a');
      if (anchor && window.studyhubDesktop?.openExternal && /^https?:/i.test(anchor.href)) {
        event.preventDefault(); window.studyhubDesktop.openExternal(anchor.href);
      }
    }} onKeyDown={event => { if (['Enter', ' '].includes(event.key) && event.target.closest('.sticky-task-checkbox')) { event.preventDefault(); event.target.click(); } }} ref={node => { node?.querySelectorAll('.sticky-task-checkbox').forEach(task => { task.tabIndex = textareaProps.disabled ? -1 : 0; task.setAttribute('role', 'button'); }); }}>{rendered?.source === content ? <div dangerouslySetInnerHTML={{ __html: rendered.html }} /> : <div className="whitespace-pre-wrap">{content}</div>}</div> : <textarea {...textareaProps} value={content} onChange={event => onChange(event.target.value)} />}
  </div>;
}
