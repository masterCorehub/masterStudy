import { useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { Icon } from "../../ui/Icon";
import "./MarkdownPreview.css";

/**
 * MarkdownPreview — Renderizador de preview Markdown estilo Obsidian
 * Recebe HTML pré-processado (de markdownToHtml) e exibe com estilos ricos.
 *
 * @param {Object} props
 * @param {string} props.html - HTML renderizado do markdown
 * @param {function} props.onWikilinkClick - Callback quando um wikilink é clicado
 * @param {function} props.onTagClick - Callback quando uma tag é clicada
 * @param {string} props.className - Classes adicionais
 */
export function MarkdownPreview({
  html = "",
  onWikilinkClick,
  onTagClick,
  className = "",
}) {
  const handleClick = useCallback(
    (e) => {
      // Detecta clique em wikilink
      const wikilink = e.target.closest(".wikilink");
      if (wikilink) {
        e.preventDefault();
        const target = wikilink.getAttribute("data-target");
        if (target && onWikilinkClick) {
          onWikilinkClick(target);
        }
        return;
      }

      // Detecta clique em tag inline
      const tag = e.target.closest(".inline-tag");
      if (tag) {
        e.preventDefault();
        const tagName = tag.getAttribute("data-tag");
        if (tagName && onTagClick) {
          onTagClick(tagName);
        }
        return;
      }

      // Detecta clique em checkbox
      const checkbox = e.target.closest('input[type="checkbox"]');
      if (checkbox) {
        // Permite toggle visual mas não persiste (seria preciso um callback)
        return;
      }

      // Detecta clique em link externo
      const link = e.target.closest("a:not(.wikilink)");
      if (link && link.href) {
        e.preventDefault();
        // Abre links externos no navegador do sistema
        if (window.studyhubDesktop?.openExternal) {
          window.studyhubDesktop.openExternal(link.href);
        } else {
          window.open(link.href, "_blank", "noopener,noreferrer");
        }
      }
    },
    [onWikilinkClick, onTagClick]
  );

  if (!html) {
    return (
      <div className={`markdown-preview flex items-center justify-center h-full text-[var(--on-surface-variant)] opacity-40 ${className}`}>
        <div className="text-center">
          <Icon name="edit_note" className="text-5xl mb-3 block mx-auto opacity-40" />
          <p className="text-sm font-medium">Comece a escrever para ver o preview</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: MARKDOWN_PREVIEW_STYLES }} />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className={`markdown-preview prose-campusflow overflow-y-auto h-full px-6 py-4 ${className}`}
        onClick={handleClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
}

/**
 * CSS para o preview Markdown — inserido no styles.css global
 * Essas classes definem a tipografia e layout do preview renderizado.
 */
export const MARKDOWN_PREVIEW_STYLES = `
/* ─── Markdown Preview: prose-campusflow ─── */
.prose-campusflow {
  color: var(--on-surface);
  font-family: 'Plus Jakarta Sans', 'Inter', sans-serif;
  font-size: 15px;
  line-height: 1.8;
  max-width: 48rem;
  margin: 0 auto;
}

.prose-campusflow h1 {
  font-size: 2em;
  font-weight: 700;
  margin: 1.5em 0 0.6em;
  padding-bottom: 0.3em;
  border-bottom: 1px solid var(--outline-variant);
  color: var(--on-surface);
  line-height: 1.3;
}
.prose-campusflow h2 {
  font-size: 1.5em;
  font-weight: 700;
  margin: 1.3em 0 0.5em;
  padding-bottom: 0.25em;
  border-bottom: 1px solid color-mix(in srgb, var(--outline-variant) 50%, transparent);
  color: var(--on-surface);
  line-height: 1.3;
}
.prose-campusflow h3 {
  font-size: 1.25em;
  font-weight: 600;
  margin: 1.2em 0 0.4em;
  color: var(--on-surface);
}
.prose-campusflow h4 {
  font-size: 1.1em;
  font-weight: 600;
  margin: 1em 0 0.3em;
  color: var(--on-surface-variant);
}
.prose-campusflow h5,
.prose-campusflow h6 {
  font-size: 1em;
  font-weight: 600;
  margin: 0.8em 0 0.2em;
  color: var(--on-surface-variant);
}

.prose-campusflow p {
  margin: 0.7em 0;
}

.prose-campusflow strong {
  font-weight: 700;
  color: var(--on-surface);
}

.prose-campusflow em {
  font-style: italic;
}

.prose-campusflow a {
  color: var(--primary);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
  transition: opacity 0.15s;
}
.prose-campusflow a:hover {
  opacity: 0.8;
}

/* WikiLinks */
.prose-campusflow .wikilink {
  color: var(--primary);
  text-decoration: none;
  background: color-mix(in srgb, var(--primary) 10%, transparent);
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}
.prose-campusflow .wikilink:hover {
  background: color-mix(in srgb, var(--primary) 20%, transparent);
}
.prose-campusflow .wikilink.wikilink-broken {
  color: var(--on-surface-variant);
  opacity: 0.6;
  text-decoration: line-through;
}

/* Inline Tags */
.prose-campusflow .inline-tag {
  color: var(--primary);
  background: color-mix(in srgb, var(--primary) 15%, transparent);
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.9em;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  display: inline-block;
}
.prose-campusflow .inline-tag:hover {
  background: color-mix(in srgb, var(--tertiary) 22%, transparent);
}

/* Code */
.prose-campusflow code {
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 0.88em;
  background: color-mix(in srgb, var(--primary) 8%, transparent);
  padding: 2px 6px;
  border-radius: 4px;
}

.prose-campusflow pre {
  background: var(--surface-lowest);
  border: 1px solid var(--outline-variant);
  border-radius: 10px;
  padding: 16px 20px;
  overflow-x: auto;
  margin: 1em 0;
  font-size: 0.88em;
  line-height: 1.6;
}
.prose-campusflow pre code {
  background: none;
  padding: 0;
  border-radius: 0;
  font-size: 1em;
}

/* Blockquote */
.prose-campusflow blockquote {
  border-left: 3px solid var(--primary);
  padding: 8px 16px;
  margin: 1em 0;
  color: var(--on-surface-variant);
  background: color-mix(in srgb, var(--primary) 5%, transparent);
  border-radius: 0 8px 8px 0;
  font-style: italic;
}
.prose-campusflow blockquote p {
  margin: 0.3em 0;
}

/* Lists */
.prose-campusflow ul {
  list-style: disc;
  padding-left: 1.5em;
  margin: 0.6em 0;
}
.prose-campusflow ol {
  list-style: decimal;
  padding-left: 1.5em;
  margin: 0.6em 0;
}
.prose-campusflow li {
  margin: 0.3em 0;
}
.prose-campusflow li > ul,
.prose-campusflow li > ol {
  margin: 0.2em 0;
}

/* Task lists */
.prose-campusflow .task-list-item {
  list-style: none;
  margin-left: -1.5em;
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.prose-campusflow .task-list-item input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--primary);
  margin: 0;
  flex-shrink: 0;
  cursor: pointer;
}

/* Tables */
.prose-campusflow table {
  width: 100%;
  border-collapse: collapse;
  margin: 1em 0;
  font-size: 0.93em;
}
.prose-campusflow th {
  background: var(--surface-high);
  font-weight: 600;
  text-align: left;
  padding: 10px 14px;
  border: 1px solid var(--outline-variant);
}
.prose-campusflow td {
  padding: 8px 14px;
  border: 1px solid var(--outline-variant);
}
.prose-campusflow tr:nth-child(even) {
  background: color-mix(in srgb, var(--surface-high) 40%, transparent);
}

/* Images */
.prose-campusflow img {
  max-width: 100%;
  height: auto;
  border-radius: 10px;
  margin: 1em 0;
  border: 1px solid var(--outline-variant);
}

/* Horizontal rule */
.prose-campusflow hr {
  border: none;
  border-top: 1px solid var(--outline-variant);
  margin: 2em 0;
}

/* KaTeX math */
.prose-campusflow .katex-display {
  margin: 1em 0;
  overflow-x: auto;
  padding: 8px 0;
}

/* Mermaid diagrams */
.prose-campusflow .mermaid {
  text-align: center;
  margin: 1.5em 0;
}

/* Footnotes */
.prose-campusflow .footnotes {
  margin-top: 2em;
  padding-top: 1em;
  border-top: 1px solid var(--outline-variant);
  font-size: 0.9em;
  color: var(--on-surface-variant);
}

/* Callouts (Obsidian-style) */
.prose-campusflow .callout {
  border-radius: 8px;
  padding: 12px 16px;
  margin: 1em 0;
  border-left: 4px solid;
}
.prose-campusflow .callout-note {
  background: color-mix(in srgb, #5b9bd5 10%, transparent);
  border-color: #5b9bd5;
}
.prose-campusflow .callout-warning {
  background: color-mix(in srgb, #e6a23c 10%, transparent);
  border-color: #e6a23c;
}
.prose-campusflow .callout-tip {
  background: color-mix(in srgb, #67c23a 10%, transparent);
  border-color: #67c23a;
}
.prose-campusflow .callout-important {
  background: color-mix(in srgb, #f56c6c 10%, transparent);
  border-color: #f56c6c;
}
`;
