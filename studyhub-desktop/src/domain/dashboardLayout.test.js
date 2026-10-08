import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeWidget,
  resolveWidgetLayout,
  compactWidgetLayout,
  widgetsOverlap,
  pointToGrid,
} from "./dashboardLayout.js";
const w = (id, x, y, size = 4, rowSpan = 2) => ({
  id,
  x,
  y,
  size,
  rowSpan,
  visible: true,
});
const noCollisions = (layout) => {
  const visible = layout.filter((w) => w.visible !== false);
  for (let i = 0; i < visible.length; i++)
    for (let j = i + 1; j < visible.length; j++)
      assert.equal(
        widgetsOverlap(visible[i], visible[j]),
        false,
        `${visible[i].id} overlaps ${visible[j].id}`,
      );
};
test("moving into another widget pushes the collision chain downward without changing columns", () => {
  const result = resolveWidgetLayout(
    [w("a", 0, 0), w("b", 4, 0), w("c", 4, 2)],
    "a",
    { x: 4, y: 0 },
  );
  assert.deepEqual(
    result.map(({ x, y }) => ({ x, y })),
    [
      { x: 4, y: 0 },
      { x: 4, y: 2 },
      { x: 4, y: 4 },
    ],
  );
  noCollisions(result);
});
test("resizing at the right edge clamps the widget and leaves unrelated widgets in place", () => {
  const result = resolveWidgetLayout([w("a", 8, 0), w("b", 0, 0)], "a", {
    size: 8,
  });
  assert.equal(result[0].x, 4);
  assert.equal(result[1].y, 0);
  noCollisions(result);
});
test("hidden widgets do not reserve space and showing them resolves collisions", () => {
  const items = [w("a", 0, 0), { ...w("b", 0, 0), visible: false }];
  assert.equal(resolveWidgetLayout(items)[0].y, 0);
  const result = resolveWidgetLayout(items, "b", { visible: true });
  noCollisions(result);
  assert.equal(result[0].y, 2);
});
test("compaction removes old gaps while preserving columns and is idempotent", () => {
  const result = compactWidgetLayout([
    w("a", 0, 8),
    w("b", 4, 11),
    w("c", 0, 15),
  ]);
  assert.deepEqual(
    result.map((w) => w.y),
    [0, 0, 2],
  );
  assert.deepEqual(compactWidgetLayout(result), result);
  noCollisions(result);
});
test("saved invalid sizes and positions are bounded and integer-valued", () => {
  const result = normalizeWidget({
    id: "schedule",
    size: 3,
    rowSpan: 1,
    x: 99,
    y: -2,
  });
  assert.deepEqual(
    [result.size, result.rowSpan, result.x, result.y],
    [8, 2, 4, 0],
  );
  assert.equal(normalizeWidget({ id: "a", x: NaN, y: Infinity }).y, 0);
});
test("pixel coordinates account for the grab offset and a scrolled grid", () => {
  const args = {
    point: { x: 300, y: 320 },
    rect: { width: 944, left: 100, top: 160 },
    columnGap: 16,
    rowHeight: 64,
    rowGap: 16,
    size: 4,
    offset: { x: 40, y: 0 },
  };
  assert.deepEqual(pointToGrid(args), { x: 2, y: 2 });
  assert.deepEqual(pointToGrid({ ...args, rect: { ...args.rect, top: 80 } }), {
    x: 2,
    y: 3,
  });
});
test("many overlapping saved widgets repair deterministically and stay inside the grid", () => {
  const items = Array.from({ length: 40 }, (_, i) =>
    w(`w${i}`, (i % 3) * 4, 0),
  );
  const result = resolveWidgetLayout(items);
  noCollisions(result);
  assert.deepEqual(
    resolveWidgetLayout([...items].reverse()).sort((a, b) =>
      a.id.localeCompare(b.id),
    ),
    [...result].sort((a, b) => a.id.localeCompare(b.id)),
  );
  for (const item of result) assert.ok(item.x >= 0 && item.x + item.size <= 12);
});
test("hiding the primary widget is preserved and frees its cells", () => {
  const result = resolveWidgetLayout([w("a", 0, 0), w("b", 0, 2)], "a", {
    visible: false,
  });
  assert.equal(result[0].visible, false);
  assert.equal(result[1].y, 2);
});
test("mobile reordering preserves all desktop coordinates", async () => {
  const { moveWidgetInList } = await import("./dashboardLayout.js");
  const items = [w("a", 0, 0), w("b", 4, 0), w("c", 0, 2)];
  const result = moveWidgetInList(items, "a", 1);
  assert.deepEqual(
    result.map(({ x, y }) => ({ x, y })),
    items.map(({ x, y }) => ({ x, y })),
  );
  assert.deepEqual(
    [...result].sort((a, b) => a.mobileOrder - b.mobileOrder).map((w) => w.id),
    ["b", "a", "c"],
  );
});
test("new composition preserves hidden widgets and pinned note metadata", async () => {
  const { upgradeDashboardComposition, DEFAULT_DASHBOARD_WIDGETS } =
    await import("./dashboardLayout.js");
  const result = upgradeDashboardComposition([
    { ...w("summary", 4, 20), visible: false, mobileOrder: 4 },
    { ...w("sticky-note:one", 0, 0), title: "Keep my note" },
  ]);
  const summary = result.find((item) => item.id === "summary");
  assert.equal(summary.visible, false);
  assert.equal(summary.y, 0);
  assert.equal(summary.mobileOrder, undefined);
  assert.equal(
    result.find((item) => item.id === "sticky-note:one").title,
    "Keep my note",
  );
  const visible = result.filter((item) => item.visible !== false);
  for (const a of visible)
    for (const b of visible)
      if (a.id !== b.id) assert.equal(widgetsOverlap(a, b), false);
  assert.deepEqual(upgradeDashboardComposition(), DEFAULT_DASHBOARD_WIDGETS);
});
test("content height includes gaps and always rounds upward", async () => {
  const { contentHeightToRows } = await import("./dashboardLayout.js");
  assert.equal(contentHeightToRows(108, 48, 12), 2);
  assert.equal(contentHeightToRows(109, 48, 12), 3);
  assert.equal(contentHeightToRows(0, 48, 12), 1);
});
test("content growth pushes collisions and automatic height shrinks when items disappear", async () => {
  const { fitWidgetToContent } = await import("./dashboardLayout.js");
  const items = [w("tasks", 0, 0, 8, 3), w("water", 0, 3, 12, 2)];
  const grown = fitWidgetToContent(items, "tasks", 5);
  assert.equal(grown[0].rowSpan, 5);
  assert.equal(grown[1].y, 5);
  noCollisions(grown);
  const shrunk = fitWidgetToContent(grown, "tasks", 3);
  assert.equal(shrunk[0].rowSpan, 3);
  assert.equal(fitWidgetToContent(shrunk, "tasks", 3), shrunk);
});
test("manual height preserves preference but cannot go below measured content", async () => {
  const { fitWidgetToContent } = await import("./dashboardLayout.js");
  const manual = {
    ...w("tasks", 0, 0, 8, 6),
    heightMode: "manual",
    requestedRowSpan: 6,
  };
  assert.equal(fitWidgetToContent([manual], "tasks", 3)[0].rowSpan, 6);
  const tall = fitWidgetToContent([manual], "tasks", 12)[0];
  assert.equal(tall.rowSpan, 12);
  assert.equal(fitWidgetToContent([tall], "tasks", 3)[0].rowSpan, 6);
  assert.equal(
    normalizeWidget({ ...manual, rowSpan: 2, minContentRows: 5 }).rowSpan,
    5,
  );
});
