import matter from 'gray-matter';

/**
 * Faz o parse do frontmatter YAML de um texto markdown.
 * @param {string} markdownText - Texto markdown com frontmatter
 * @returns {{data: Object, content: string}} Objeto com metadados (data) e o restante do conteúdo
 */
export function parseFrontmatter(markdownText) {
  if (!markdownText) return { data: {}, content: '' };
  try {
    const parsed = matter(markdownText);
    return {
      data: parsed.data || {},
      content: parsed.content || ''
    };
  } catch (error) {
    console.error('Erro ao fazer parse do frontmatter:', error);
    return { data: {}, content: markdownText };
  }
}

/**
 * Serializa dados de volta para frontmatter YAML no topo do markdown.
 * @param {Object} data - Objeto de metadados
 * @param {string} content - Conteúdo markdown
 * @returns {string} String com frontmatter YAML e conteúdo
 */
export function stringifyFrontmatter(data, content) {
  try {
    return matter.stringify(content, data);
  } catch (error) {
    console.error('Erro ao serializar frontmatter:', error);
    return content;
  }
}

/**
 * Extrai tags inline (#tag) de um texto markdown.
 * @param {string} text - Texto markdown
 * @returns {Array<string>} Lista de tags inline encontradas (sem a hashtag)
 */
export function extractInlineTags(text) {
  if (!text) return [];
  const regex = /(?:^|\s)#([a-zA-Z0-9_\-\/]+)(?=\s|$|[.,!?;:)}\]])/g;
  const tags = new Set();
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    const tag = match[1];
    if (tag && /[a-zA-Z_\-\/]/.test(tag)) {
      tags.add(tag);
    }
  }
  
  return Array.from(tags);
}

/**
 * Extrai todas as tags únicas do frontmatter e do conteúdo markdown.
 * @param {string} markdownText - Texto markdown completo
 * @returns {Array<string>} Lista de todas as tags únicas
 */
export function extractAllTags(markdownText) {
  if (!markdownText) return [];
  const { data, content } = parseFrontmatter(markdownText);
  
  const tags = new Set();
  
  // Tags do frontmatter
  if (data.tags) {
    let fmTags = [];
    if (Array.isArray(data.tags)) {
      fmTags = data.tags;
    } else if (typeof data.tags === 'string') {
      fmTags = data.tags.split(',').map(t => t.trim());
    }
    fmTags.forEach(t => {
      const cleanTag = String(t).startsWith('#') ? String(t).substring(1) : String(t);
      if (cleanTag.trim()) tags.add(cleanTag.trim());
    });
  }
  if (data.tag) {
    const cleanTag = String(data.tag).startsWith('#') ? String(data.tag).substring(1) : String(data.tag);
    if (cleanTag.trim()) tags.add(cleanTag.trim());
  }
  
  // Tags inline do conteúdo
  const inlineTags = extractInlineTags(content);
  inlineTags.forEach(t => tags.add(t));
  
  return Array.from(tags);
}

/**
 * Obtém todas as tags de um objeto de nota (considerando markdown, frontmatter, campo tags e conteúdo em edição).
 * @param {Object} note - Objeto da nota
 * @param {string} [activeContent] - Conteúdo ativo em tempo real se for a nota aberta
 * @returns {Array<string>} Lista de tags únicas
 */
export function getNoteTags(note, activeContent) {
  if (!note) return [];
  const content = typeof activeContent === 'string' ? activeContent : (note.markdownContent || note.content || '');
  const tags = new Set(extractAllTags(content));
  
  if (Array.isArray(note.tags)) {
    note.tags.forEach(t => {
      const clean = String(t || '').replace(/^#/, '').trim();
      if (clean) tags.add(clean);
    });
  } else if (typeof note.tags === 'string' && note.tags.trim()) {
    note.tags.split(',').forEach(t => {
      const clean = String(t || '').replace(/^#/, '').trim();
      if (clean) tags.add(clean);
    });
  }
  
  return Array.from(tags);
}
