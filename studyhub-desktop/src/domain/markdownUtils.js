import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import rehypeStringify from 'rehype-stringify';
import { visit } from 'unist-util-visit';

/**
 * Converte conteúdo HTML (do antigo RichTextEditor) para Markdown.
 * @param {string} html - Conteúdo HTML
 * @returns {string} Markdown equivalente
 */
export function htmlToMarkdown(html) {
  if (!html) return '';

  let markdown = html;

  // Substituições de blocos
  markdown = markdown
    .replace(/<p[^>]*>/g, '\n\n')
    .replace(/<\/p>/g, '')
    .replace(/<br\s*\/?>/g, '\n')
    
    // Cabeçalhos (do h6 pro h1 pra evitar conflitos)
    .replace(/<h6[^>]*>(.*?)<\/h6>/g, '###### $1\n')
    .replace(/<h5[^>]*>(.*?)<\/h5>/g, '##### $1\n')
    .replace(/<h4[^>]*>(.*?)<\/h4>/g, '#### $1\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/g, '### $1\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/g, '## $1\n')
    .replace(/<h1[^>]*>(.*?)<\/h1>/g, '# $1\n')
    
    // Negrito e Itálico
    .replace(/<strong[^>]*>(.*?)<\/strong>/g, '**$1**')
    .replace(/<b[^>]*>(.*?)<\/b>/g, '**$1**')
    .replace(/<em[^>]*>(.*?)<\/em>/g, '*$1*')
    .replace(/<i[^>]*>(.*?)<\/i>/g, '*$1*')
    
    // Bloco de código e código inline
    .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/g, '```\n$1\n```\n')
    .replace(/<code[^>]*>(.*?)<\/code>/g, '`$1`')
    
    // Blockquotes
    .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/g, (match, p1) => {
      return p1.split('\n').map(line => `> ${line}`).join('\n') + '\n';
    })
    
    // Listas
    .replace(/<ul[^>]*>([\s\S]*?)<\/ul>/g, (match, p1) => {
      return p1.replace(/<li[^>]*>(.*?)<\/li>/g, '- $1\n');
    })
    .replace(/<ol[^>]*>([\s\S]*?)<\/ol>/g, (match, p1) => {
      let count = 1;
      return p1.replace(/<li[^>]*>(.*?)<\/li>/g, (m, p) => `${count++}. ${p}\n`);
    })
    
    // Links e Imagens
    .replace(/<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"[^>]*>/g, '![$2]($1)')
    .replace(/<img[^>]*alt="([^"]*)"[^>]*src="([^"]+)"[^>]*>/g, '![$1]($2)')
    .replace(/<img[^>]*src="([^"]+)"[^>]*>/g, '![]($1)')
    .replace(/<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g, '[$2]($1)');

  // Remove outras tags HTML restantes, mas preserva a tag <u>
  markdown = markdown.replace(/<\/?[^>]+(>|$)/g, match => {
      if (match.toLowerCase() === '<u>' || match.toLowerCase() === '</u>') {
          return match;
      }
      return '';
  });
  
  // Decodifica entidades HTML
  markdown = markdown
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"');

  // Limpeza
  markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();
  
  return markdown;
}

/**
 * Plugin customizado remark para lidar com wikilinks e hashtags.
 */
function remarkObsidianFeatures() {
  return (tree) => {
    visit(tree, 'text', (node, index, parent) => {
      if (!node.value) return;
      
      const value = node.value;
      const regex = /(\[\[.*?\]\]|#[a-zA-Z0-9_/-]+)/g;
      const parts = value.split(regex);
      
      if (parts.length > 1) {
        const newNodes = parts.map(part => {
          if (part.startsWith('[[') && part.endsWith(']]')) {
            const inner = part.slice(2, -2);
            const [target, alias] = inner.includes('|') ? inner.split('|', 2) : [inner, inner];
            return {
              type: 'html',
              value: `<a class="wikilink" data-target="${target}">${alias || target}</a>`
            };
          } else if (part.startsWith('#') && part.length > 1 && !part.match(/^#+\s/)) {
            const tag = part.slice(1);
            return {
              type: 'html',
              value: `<span class="inline-tag" data-tag="${tag}">${part}</span>`
            };
          }
          return { type: 'text', value: part };
        }).filter(n => n.value !== '');
        
        parent.children.splice(index, 1, ...newNodes);
        return index + newNodes.length;
      }
    });
  };
}

/**
 * Converte Markdown para HTML seguro para renderização/preview.
 * Suporta wikilinks, #tags, LaTeX, code blocks, tables, checkboxes, imagens.
 * @param {string} markdown - Conteúdo markdown
 * @param {Object} options - Opções adicionais (não utilizado diretamente nesta simplificação)
 * @returns {Promise<string>} HTML renderizado
 */
export async function markdownToHtml(markdown, options = {}) {
  if (!markdown) return '';
  
  try {
    const processor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkMath)
      .use(remarkObsidianFeatures)
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeKatex)
      .use(rehypeHighlight, { ignoreMissing: true })
      .use(rehypeStringify, { allowDangerousHtml: true });

    const file = await processor.process(markdown);
    return String(file);
  } catch (error) {
    console.error('Erro ao converter markdown para html:', error);
    return `<p>Erro ao renderizar markdown</p>`;
  }
}

/**
 * Retorna a contagem de palavras de um texto markdown.
 * @param {string} markdown - Texto markdown
 * @returns {number} Contagem de palavras
 */
export function getWordCount(markdown) {
  if (!markdown) return 0;
  let text = markdown
    .replace(/[#*`~_]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  
  const matches = text.match(/\S+/g);
  return matches ? matches.length : 0;
}

/**
 * Retorna uma estimativa de tempo de leitura.
 * @param {string} markdown - Texto markdown
 * @returns {number} Minutos estimados para leitura
 */
export function getReadingTime(markdown) {
  const words = getWordCount(markdown);
  const minutes = Math.ceil(words / 200);
  return minutes || 1;
}
