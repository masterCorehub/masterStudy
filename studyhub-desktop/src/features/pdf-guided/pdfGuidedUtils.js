const normalizeWhitespace = (value) => String(value || "").replace(/\s+/g, " ").trim();

export function groupPdfTextItems(items, pageNumber) {
  const positioned = (Array.isArray(items) ? items : [])
    .map((item, index) => ({
      index,
      text: normalizeWhitespace(item?.str),
      x: Number(item?.transform?.[4]) || 0,
      y: Number(item?.transform?.[5]) || 0,
      width: Math.max(0, Number(item?.width) || 0),
      height: Math.max(1, Number(item?.height) || Math.abs(Number(item?.transform?.[3])) || 10),
      hasEOL: Boolean(item?.hasEOL),
    }))
    .filter((item) => item.text)
    .sort((left, right) => (right.y - left.y) || (left.x - right.x));

  const lines = [];
  positioned.forEach((item) => {
    const previousLine = lines.at(-1);
    const tolerance = Math.max(2.5, item.height * 0.35);
    const previousItem = previousLine?.items?.at(-1);
    const horizontalGap = previousItem
      ? item.x - (previousItem.x + previousItem.width)
      : 0;
    const splitWideGap = horizontalGap > Math.max(72, item.height * 8);
    if (
      !previousLine
      || previousLine.ended
      || Math.abs(previousLine.y - item.y) > tolerance
      || splitWideGap
    ) {
      lines.push({ y: item.y, height: item.height, items: [item], ended: item.hasEOL });
      return;
    }
    previousLine.items.push(item);
    previousLine.height = Math.max(previousLine.height, item.height);
    previousLine.ended = item.hasEOL;
  });

  return lines
    .map((line, lineIndex) => {
      const ordered = line.items.sort((left, right) => left.x - right.x);
      let text = "";
      let previousEnd = null;
      ordered.forEach((item) => {
        const gap = previousEnd === null ? 0 : item.x - previousEnd;
        const addSpace = text && gap > Math.max(1.5, item.height * 0.12);
        text += `${addSpace ? " " : ""}${item.text}`;
        previousEnd = item.x + item.width;
      });
      return {
        id: `pdf-${pageNumber}-${lineIndex}`,
        pageNumber,
        text: normalizeWhitespace(text),
        boxes: ordered.map(({ x, y, width, height }) => ({ x, y, width, height })),
      };
    })
    .filter((line) => line.text.length > 1);
}

export function getGuidedReadingProgress(index, total) {
  if (!Number.isFinite(index) || !Number.isFinite(total) || total <= 1) return 0;
  return Math.round((Math.max(0, Math.min(index, total - 1)) / (total - 1)) * 100);
}
