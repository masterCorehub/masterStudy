export const DASHBOARD_COLUMNS = 12;
export const DASHBOARD_WIDTHS = [4, 6, 8, 12];
const integer = (value, fallback) =>
  Number.isFinite(Number(value)) ? Math.round(Number(value)) : fallback;

export function widgetLimits(id = "") {
  return {
    minWidth: id === "schedule" ? 8 : 4,
    minHeight: id.startsWith("sticky-note:") ? 3 : 2,
    maxHeight: 10,
  };
}

export function normalizeWidget(widget = {}) {
  const limits = widgetLimits(widget.id);
  const size = Math.max(
    limits.minWidth,
    Math.min(DASHBOARD_COLUMNS, integer(widget.size, 4)),
  );
  const minimum = Math.max(
    limits.minHeight,
    integer(widget.minContentRows, limits.minHeight),
  );
  return {
    ...widget,
    size,
    // The measured content floor takes precedence over a saved height.
    rowSpan: Math.max(
      minimum,
      Math.min(
        Math.max(limits.maxHeight, minimum),
        integer(widget.rowSpan, minimum),
      ),
    ),
    x: Math.max(0, Math.min(DASHBOARD_COLUMNS - size, integer(widget.x, 0))),
    y: Math.max(0, integer(widget.y, 0)),
  };
}

export const widgetsOverlap = (a, b) =>
  a.x < b.x + b.size &&
  a.x + a.size > b.x &&
  a.y < b.y + b.rowSpan &&
  a.y + a.rowSpan > b.y;

// Move only downward when resolving a collision, preserving the column.
function pushBelow(widget, occupied) {
  let next = { ...widget };
  let collisions;
  while (
    (collisions = occupied.filter((other) => widgetsOverlap(next, other)))
      .length
  ) {
    next.y = Math.max(...collisions.map((other) => other.y + other.rowSpan));
  }
  return next;
}

export function resolveWidgetLayout(widgets = [], primaryId, updates = {}) {
  const normalized = widgets.map(normalizeWidget);
  const primary = normalized.find((widget) => widget.id === primaryId);
  const candidate = primary
    ? normalizeWidget({ ...primary, ...updates })
    : null;
  const occupied = candidate && candidate.visible !== false ? [candidate] : [];
  const placed = new Map(candidate ? [[candidate.id, candidate]] : []);
  // Spatial order makes collision chains independent of the stored array order.
  const remaining = normalized
    .filter((widget) => !placed.has(widget.id))
    .sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
  for (const widget of remaining) {
    const next =
      widget.visible === false ? widget : pushBelow(widget, occupied);
    placed.set(widget.id, next);
    if (next.visible !== false) occupied.push(next);
  }
  return normalized.map((widget) => placed.get(widget.id));
}

export function compactWidgetLayout(widgets = []) {
  const valid = resolveWidgetLayout(widgets);
  const occupied = [];
  const placed = new Map();
  for (const widget of [...valid].sort(
    (a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id),
  )) {
    // Hidden widgets keep their last position but reserve no cells.
    const next =
      widget.visible === false
        ? widget
        : pushBelow({ ...widget, y: 0 }, occupied);
    placed.set(widget.id, next);
    if (next.visible !== false) occupied.push(next);
  }
  return valid.map((widget) => placed.get(widget.id));
}

export function pointToGrid({
  point,
  rect,
  columnGap,
  rowHeight,
  rowGap,
  size,
  offset,
}) {
  const columnStep = (rect.width + columnGap) / DASHBOARD_COLUMNS;
  return {
    x: Math.max(
      0,
      Math.min(
        DASHBOARD_COLUMNS - size,
        Math.round((point.x - rect.left - offset.x) / columnStep),
      ),
    ),
    y: Math.max(
      0,
      Math.round((point.y - rect.top - offset.y) / (rowHeight + rowGap)),
    ),
  };
}

// Mobile order is separate from desktop coordinates, so a phone never destroys
// the user's multi-column layout.
export function moveWidgetInList(widgets, id, direction) {
  const visible = widgets
    .filter((widget) => widget.visible !== false)
    .sort(
      (a, b) =>
        (a.mobileOrder ?? a.y * 12 + a.x) - (b.mobileOrder ?? b.y * 12 + b.x),
    );
  const index = visible.findIndex((widget) => widget.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= visible.length) return widgets;
  [visible[index], visible[target]] = [visible[target], visible[index]];
  const order = new Map(visible.map((widget, i) => [widget.id, i]));
  return widgets.map((widget) =>
    order.has(widget.id)
      ? { ...widget, mobileOrder: order.get(widget.id) }
      : widget,
  );
}

// One shared composition for new profiles, restore-default, and the migration.
export const DEFAULT_DASHBOARD_WIDGETS = [
  { id: "summary", visible: true, size: 8, rowSpan: 2, x: 0, y: 0 },
  { id: "focus", visible: true, size: 4, rowSpan: 2, x: 8, y: 0 },
  { id: "schedule", visible: true, size: 8, rowSpan: 4, x: 0, y: 2 },
  { id: "deadlines", visible: true, size: 4, rowSpan: 2, x: 8, y: 2 },
  { id: "flashcards", visible: true, size: 4, rowSpan: 2, x: 8, y: 4 },
  { id: "tasks", visible: true, size: 8, rowSpan: 4, x: 0, y: 6 },
  { id: "habits", visible: true, size: 4, rowSpan: 4, x: 8, y: 6 },
  { id: "water", visible: true, size: 12, rowSpan: 2, x: 0, y: 10 },
];

export function upgradeDashboardComposition(saved = []) {
  const byId = new Map(saved.map((widget) => [widget.id, widget]));
  const knownIds = new Set(
    DEFAULT_DASHBOARD_WIDGETS.map((widget) => widget.id),
  );
  // Preserve visibility and metadata, replace only the old visual geometry.
  return resolveWidgetLayout([
    ...DEFAULT_DASHBOARD_WIDGETS.map((layout) => {
      const { mobileOrder, ...previous } = byId.get(layout.id) || {};
      return { ...previous, ...layout, visible: previous.visible !== false };
    }),
    ...saved.filter((widget) => !knownIds.has(widget.id)),
  ]);
}

// A span of N rows has N * rowHeight + (N - 1) * gap pixels.
export function contentHeightToRows(height, rowHeight, gap) {
  return Math.max(
    1,
    Math.ceil((Math.max(0, height) + gap) / (rowHeight + gap)),
  );
}

export function fitWidgetToContent(widgets, id, minimumRows) {
  const target = widgets.find((widget) => widget.id === id);
  if (!target || target.visible === false) return widgets;
  const minContentRows = Math.max(
    widgetLimits(id).minHeight,
    integer(minimumRows, 2),
  );
  const rowSpan =
    target.heightMode === "manual"
      ? Math.max(minContentRows, target.requestedRowSpan ?? target.rowSpan)
      : minContentRows;
  if (target.minContentRows === minContentRows && target.rowSpan === rowSpan)
    return widgets;
  return resolveWidgetLayout(widgets, id, { minContentRows, rowSpan });
}
