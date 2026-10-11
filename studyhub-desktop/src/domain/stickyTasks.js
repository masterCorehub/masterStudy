import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';
export function stickyTaskLines(content) {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(content);
  const lines = [];
  visit(tree, 'listItem', node => {
    if (typeof node.checked === 'boolean') lines.push(node.position.start.line - 1);
  });
  return lines;
}
export function toggleStickyTask(content, index) {
  const line = stickyTaskLines(content)[index];
  if (line === undefined) return content;
  const lines = content.split('\n');
  lines[line] = lines[line].replace(/^(\s*[-*+]\s+\[)([ xX])(\])/, (_, prefix, checked, suffix) => `${prefix}${checked === ' ' ? 'x' : ' '}${suffix}`);
  return lines.join('\n');
}
