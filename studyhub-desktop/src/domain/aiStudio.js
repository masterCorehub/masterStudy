const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatInlineMarkdown = (value = "") => {
  const formulas = [];
  const withFormulaTokens = String(value).replace(
    /\$\$([^$]+?)\$\$|\$([^$\n]+?)\$|\\\((.+?)\\\)/g,
    (_match, displayMath, inlineMath, parenthesizedMath) => {
      const latex = displayMath || inlineMath || parenthesizedMath || "";
      const token = `MATHFORMULATOKEN${formulas.length}ENDTOKEN`;
      formulas.push(latex.trim());
      return token;
    },
  );
  let html = escapeHtml(withFormulaTokens)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/_([^_]+)_/g, "<em>$1</em>");
  formulas.forEach((latex, index) => {
    html = html.replace(
      `MATHFORMULATOKEN${index}ENDTOKEN`,
      `<span data-math="${escapeHtml(latex)}">${escapeHtml(latex)}</span>`,
    );
  });
  return html;
};

const isBlockStart = (line = "") => {
  const trimmed = line.trim();
  return (
    !trimmed ||
    /^```/.test(trimmed) ||
    /^#{1,6}\s+/.test(trimmed) ||
    /^[-*+]\s+/.test(trimmed) ||
    /^\d+\.\s+/.test(trimmed) ||
    /^>\s?/.test(trimmed) ||
    /^([-*_])(?:\s*\1){2,}$/.test(trimmed) ||
    /^\|/.test(trimmed)
  );
};

export const highlightSyntax = (codeText = "", lang = "") => {
  const text = String(codeText || "");
  if (!text) return "";

  const patterns = [
    { type: "comment", regex: /(\/\/[^\n]*|\#[^\n]*|\/\*[\s\S]*?\*\/)/g },
    { type: "string", regex: /("([^"\\]|\\.)*"|'([^'\\]|\\.)*'|`([^`\\]|\\.)*`)/g },
    { type: "number", regex: /\b\d+(\.\d+)?\b/g },
    {
      type: "keyword",
      regex: /\b(def|class|import|from|return|if|else|elif|for|while|try|except|finally|with|as|lambda|yield|async|await|const|let|var|function|export|default|typeof|instanceof|new|this|public|private|protected|static|void|int|double|float|string|bool|boolean|null|undefined|true|false|None|True|False|SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|JOIN|GROUP|BY|HAVING|ORDER|LIMIT|CREATE|TABLE|DATABASE|DROP|ALTER|AND|OR|NOT|IN|IS|LIKE)\b/g,
    },
    { type: "function", regex: /\b([a-zA-Z_]\w*)(?=\s*\()/g },
  ];

  const matches = [];
  patterns.forEach(({ type, regex }) => {
    let match;
    regex.lastIndex = 0;
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        value: match[0],
        type,
      });
    }
  });

  matches.sort((a, b) => a.start - b.start);

  const filtered = [];
  let lastEnd = 0;
  for (const m of matches) {
    if (m.start >= lastEnd) {
      filtered.push(m);
      lastEnd = m.end;
    }
  }

  let html = "";
  let currentIdx = 0;

  for (const m of filtered) {
    if (m.start > currentIdx) {
      html += escapeHtml(text.slice(currentIdx, m.start));
    }
    html += `<span class="token-${m.type}">${escapeHtml(m.value)}</span>`;
    currentIdx = m.end;
  }
  if (currentIdx < text.length) {
    html += escapeHtml(text.slice(currentIdx));
  }

  return html;
};

export const markdownToNoteHtml = (markdown = "") => {
  const lines = String(markdown).replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];

  for (let index = 0; index < lines.length; ) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const langMatch = trimmed.match(/^```\s*([\w#-]+)?/);
      const language = langMatch && langMatch[1] ? langMatch[1].toLowerCase() : "";
      const code = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      const rawCode = code.join("\n");
      const highlighted = highlightSyntax(rawCode, language);
      const langAttr = language
        ? ` data-language="${escapeHtml(language)}" class="language-${escapeHtml(language)}"`
        : ' class="language-plaintext"';
      blocks.push(`<pre${langAttr}><code${langAttr}>${highlighted}</code></pre>`);
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = Math.min(heading[1].length, 4);
      blocks.push(`<h${level}>${formatInlineMarkdown(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (trimmed.startsWith("|")) {
      const tableLines = [];
      while (index < lines.length && lines[index].trim().startsWith("|")) {
        tableLines.push(lines[index].trim());
        index += 1;
      }
      if (tableLines.length >= 2) {
        const parseRow = (rowStr) =>
          rowStr
            .split("|")
            .slice(1, -1)
            .map((cell) => cell.trim());

        const headers = parseRow(tableLines[0]);
        const isDivider = (rowStr) => /^\|(?:\s*:?-+:?\s*\|)+$/.test(rowStr);
        const dataStartIdx = isDivider(tableLines[1]) ? 2 : 1;
        const dataRows = tableLines.slice(dataStartIdx).map(parseRow);

        const ths = headers
          .map((h) => `<th>${formatInlineMarkdown(h)}</th>`)
          .join("");
        const trs = dataRows
          .map(
            (row) =>
              `<tr>${row
                .map((c) => `<td>${formatInlineMarkdown(c)}</td>`)
                .join("")}</tr>`,
          )
          .join("");

        blocks.push(
          `<div class="table-container overflow-x-auto my-3"><table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`,
        );
        continue;
      }
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      const items = [];
      while (index < lines.length && /^[-*+]\s+/.test(lines[index].trim())) {
        items.push(
          `<li>${formatInlineMarkdown(lines[index].trim().replace(/^[-*+]\s+/, ""))}</li>`,
        );
        index += 1;
      }
      blocks.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items = [];
      const start = Number(trimmed.match(/^(\d+)\./)?.[1] || 1);
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(
          `<li>${formatInlineMarkdown(lines[index].trim().replace(/^\d+\.\s+/, ""))}</li>`,
        );
        index += 1;
      }
      blocks.push(`<ol${start !== 1 ? ` start="${start}"` : ""}>${items.join("")}</ol>`);
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quote = [];
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quote.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(`<blockquote>${formatInlineMarkdown(quote.join(" "))}</blockquote>`);
      continue;
    }

    if (/^([-*_])(?:\s*\1){2,}$/.test(trimmed)) {
      blocks.push("<hr>");
      index += 1;
      continue;
    }

    const paragraph = [trimmed];
    index += 1;
    while (index < lines.length && !isBlockStart(lines[index])) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(`<p>${formatInlineMarkdown(paragraph.join(" "))}</p>`);
  }

  return blocks.join("");
};

export const toAcademicAiSources = (resources = []) =>
  resources
    .filter((resource) => resource?.selected !== false)
    .map((resource) => {
      const common = {
        id: String(resource.id),
        kind: resource.type === "link" ? "link" : "file",
        title: String(resource.title || resource.name || "Fonte sem título"),
      };
      return common.kind === "link"
        ? { ...common, url: String(resource.url || "") }
        : { ...common, path: String(resource.path || "") };
    })
    .filter((source) => (source.kind === "link" ? source.url : source.path));

export const buildGeneratedNote = ({
  id,
  title,
  markdown,
  subject = {},
  now = Date.now(),
}) => ({
  id,
  title: `${String(title || "Conteúdo gerado pela IA").trim()} — ${subject.name || "Disciplina"}`,
  content: markdownToNoteHtml(markdown),
  itemType: "note",
  sourceKind: "ai-generated-note",
  sourceCourseId: subject.linkedCourseIds?.[0] || null,
  academicSubjectId: subject.id,
  academicSemesterId: subject.semesterId,
  tags: [subject.name, "Gerado por IA"].filter(Boolean),
  attachments: [],
  createdAt: now,
  updatedAt: now,
});
