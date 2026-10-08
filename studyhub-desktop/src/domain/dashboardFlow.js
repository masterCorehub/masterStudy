export const DEFAULT_DASHBOARD_FLOW = {
  main: ["summary", "tasks", "schedule", "water"],
  side: ["focus", "deadlines", "habits", "flashcards"],
};

export function normalizeDashboardFlow(widgets = []) {
  return widgets.map((widget, index) => {
    const defaultLane = DEFAULT_DASHBOARD_FLOW.main.includes(widget.id)
      ? "main"
      : "side";
    const lane = ["main", "side"].includes(widget.lane)
      ? widget.lane
      : defaultLane;
    const defaultIndex = DEFAULT_DASHBOARD_FLOW[lane].indexOf(widget.id);
    return {
      ...widget,
      lane,
      flowOrder: Number.isFinite(widget.flowOrder)
        ? widget.flowOrder
        : defaultIndex < 0
          ? 10 + index
          : defaultIndex,
    };
  });
}

export function dashboardFlowLanes(widgets = []) {
  const normalized = normalizeDashboardFlow(widgets);
  return Object.fromEntries(
    ["main", "side"].map((lane) => [
      lane,
      normalized
        .filter((widget) => widget.lane === lane && widget.visible !== false)
        .sort((a, b) => a.flowOrder - b.flowOrder || a.id.localeCompare(b.id)),
    ]),
  );
}

export function reorderDashboardFlow(
  widgets,
  sourceId,
  targetId,
  placement = "before",
  destinationLane,
) {
  const normalized = normalizeDashboardFlow(widgets);
  const source = normalized.find((widget) => widget.id === sourceId);
  const target = normalized.find((widget) => widget.id === targetId);
  if (!source || source.visible === false || sourceId === targetId)
    return widgets;
  const lane = destinationLane || target?.lane;
  if (!["main", "side"].includes(lane) || (targetId && !target)) return widgets;
  const groups = Object.fromEntries(
    ["main", "side"].map((key) => [
      key,
      normalized
        .filter((widget) => widget.lane === key && widget.id !== sourceId)
        .sort((a, b) => a.flowOrder - b.flowOrder || a.id.localeCompare(b.id)),
    ]),
  );
  const targetIndex = groups[lane].findIndex(
    (widget) => widget.id === targetId,
  );
  const insertion =
    targetIndex < 0
      ? groups[lane].length
      : targetIndex + Number(placement === "after");
  groups[lane].splice(insertion, 0, source);
  const positions = new Map();
  for (const [key, group] of Object.entries(groups))
    group.forEach((widget, flowOrder) =>
      positions.set(widget.id, { lane: key, flowOrder }),
    );
  // Only order and column are persisted. Content height belongs to normal flow.
  return normalized.map((widget) => ({
    ...widget,
    ...positions.get(widget.id),
  }));
}

export function stepDashboardFlow(widgets, id, direction) {
  const normalized = normalizeDashboardFlow(widgets);
  const source = normalized.find((widget) => widget.id === id);
  if (!source) return widgets;
  const lane = dashboardFlowLanes(normalized)[source.lane];
  const index = lane.findIndex((widget) => widget.id === id);
  const neighbor = lane[index + direction];
  return neighbor
    ? reorderDashboardFlow(
        widgets,
        id,
        neighbor.id,
        direction > 0 ? "after" : "before",
      )
    : widgets;
}
