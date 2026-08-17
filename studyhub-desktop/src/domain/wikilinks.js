/**
 * Módulo para lidar com wikilinks estilo Obsidian
 */

/**
 * Extrai todos os wikilinks de um texto markdown.
 * @param {string} markdownText - Texto markdown para analisar
 * @returns {Array<{raw: string, target: string, alias: string|null}>} Lista de wikilinks encontrados
 */
export function extractWikilinks(markdownText) {
  if (!markdownText) return [];
  const regex = /\[\[([^\]]+)\]\]/g;
  const links = [];
  let match;

  while ((match = regex.exec(markdownText)) !== null) {
    const raw = match[0];
    const inner = match[1];
    let target = inner;
    let alias = null;

    if (inner.includes('|')) {
      const parts = inner.split('|');
      target = parts[0];
      alias = parts.slice(1).join('|');
    }

    links.push({
      raw,
      target,
      alias
    });
  }

  return links;
}

/**
 * Encontra backlinks para uma nota alvo.
 * @param {string} targetNoteTitle - Título da nota alvo
 * @param {Array<Object>} allNotes - Lista de todas as notas
 * @returns {Array<{noteId: string, noteTitle: string, context: string}>} Lista de backlinks
 */
export function findBacklinks(targetNoteTitle, allNotes) {
  if (!targetNoteTitle || !allNotes) return [];
  const backlinks = [];
  
  // Escapa caracteres especiais do título para uso na regex
  const escapedTitle = targetNoteTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const linkRegex = new RegExp(`\\[\\[${escapedTitle}(?:\\|.*?)?\\]\\]`, 'g');

  allNotes.forEach(note => {
    // Evita loop com a própria nota
    if (note.title === targetNoteTitle) return;

    const content = note.markdownContent || note.content || '';
    let match;
    
    linkRegex.lastIndex = 0;
    while ((match = linkRegex.exec(content)) !== null) {
      // Extrair contexto: ~30 caracteres antes e depois
      const start = Math.max(0, match.index - 30);
      const end = Math.min(content.length, match.index + match[0].length + 30);
      
      let context = content.substring(start, end);
      if (start > 0) context = '...' + context;
      if (end < content.length) context = context + '...';

      backlinks.push({
        noteId: note.id,
        noteTitle: note.title,
        context: context.trim()
      });
    }
  });

  return backlinks;
}

/**
 * Constrói o grafo completo de links entre todas as notas.
 * @param {Array<Object>} allNotes - Lista de todas as notas
 * @returns {{nodes: Array<{id: string, title: string, path: string, tags: Array<string>}>, edges: Array<{source: string, target: string}>}} Grafo de links
 */
export function buildLinkGraph(allNotes) {
  const nodes = [];
  const edges = [];

  allNotes.forEach(note => {
    nodes.push({
      id: note.id,
      title: note.title || '',
      path: note.path || '',
      tags: note.tags || []
    });

    const links = extractWikilinks(note.markdownContent || note.content || '');
    links.forEach(link => {
      const targetNote = resolveWikilink(link.target, allNotes);
      if (targetNote) {
        edges.push({
          source: note.id,
          target: targetNote.id
        });
      }
    });
  });

  return { nodes, edges };
}

/**
 * Encontra menções não vinculadas de uma nota (título da nota presente, mas não como wikilink).
 * @param {string} targetNoteTitle - Título da nota alvo
 * @param {Array<Object>} allNotes - Lista de todas as notas
 * @returns {Array<{noteId: string, noteTitle: string, context: string}>} Menções não vinculadas
 */
export function findUnlinkedMentions(targetNoteTitle, allNotes) {
  if (!targetNoteTitle || !allNotes) return [];
  const mentions = [];
  
  const escapedTitle = targetNoteTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Usar bordas de palavra para evitar correspondências parciais
  const mentionRegex = new RegExp(`(?<!\\[\\[\\s*)\\b${escapedTitle}\\b(?!\\s*\\]\\])`, 'gi');

  allNotes.forEach(note => {
    if (note.title === targetNoteTitle) return;

    const content = note.content || '';
    let match;
    mentionRegex.lastIndex = 0;
    
    while ((match = mentionRegex.exec(content)) !== null) {
      // Verificar se não está dentro de um link markdown padrão
      const afterMatch = content.substring(match.index + match[0].length);
      if (afterMatch.trim().startsWith('](')) {
          continue;
      }
      
      const start = Math.max(0, match.index - 30);
      const end = Math.min(content.length, match.index + match[0].length + 30);
      
      let context = content.substring(start, end);
      if (start > 0) context = '...' + context;
      if (end < content.length) context = context + '...';

      mentions.push({
        noteId: note.id,
        noteTitle: note.title,
        context: context.trim()
      });
    }
  });

  return mentions;
}

/**
 * Resolve o alvo de um wikilink para um ID de nota (busca inexata pelo título).
 * @param {string} target - Título alvo do wikilink
 * @param {Array<Object>} allNotes - Lista de todas as notas
 * @returns {Object|null} Nota encontrada ou null
 */
export function resolveWikilink(target, allNotes) {
  if (!target || !allNotes) return null;
  const normalizedTarget = target.trim().toLowerCase();

  // Busca exata (ignorando case e espaços nas bordas)
  let found = allNotes.find(n => (n.title || '').trim().toLowerCase() === normalizedTarget);
  if (found) return found;

  // Busca parcial
  found = allNotes.find(n => {
    const t = (n.title || '').trim().toLowerCase();
    return t.includes(normalizedTarget) || normalizedTarget.includes(t);
  });

  return found || null;
}
