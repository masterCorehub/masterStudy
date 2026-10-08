import test from "node:test";
import assert from "node:assert/strict";
import {
  dashboardFlowLanes,
  normalizeDashboardFlow,
  reorderDashboardFlow,
  stepDashboardFlow,
} from "./dashboardFlow.js";
const ids = (lanes) =>
  Object.fromEntries(
    Object.entries(lanes).map(([lane, items]) => [
      lane,
      items.map((widget) => widget.id),
    ]),
  );
const widgets = [
  "schedule",
  "summary",
  "focus",
  "deadlines",
  "habits",
  "water",
  "flashcards",
  "tasks",
].map((id) => ({
  id,
  x: 4,
  y: 99,
  rowSpan: 9,
  minContentRows: 9,
  visible: true,
}));
test("initial flow prioritizes tasks and ignores old sparse geometry", () => {
  assert.deepEqual(ids(dashboardFlowLanes(widgets)), {
    main: ["summary", "tasks", "schedule", "water"],
    side: ["focus", "deadlines", "habits", "flashcards"],
  });
  assert.equal(widgets[0].flowOrder, undefined);
});
test("drag inserts before or after a target and preserves content and geometry metadata", () => {
  const next = reorderDashboardFlow(widgets, "tasks", "schedule", "after");
  assert.deepEqual(ids(dashboardFlowLanes(next)).main, [
    "summary",
    "schedule",
    "tasks",
    "water",
  ]);
  assert.deepEqual(
    next.map(({ id, x, y, rowSpan }) => ({ id, x, y, rowSpan })),
    widgets.map(({ id, x, y, rowSpan }) => ({ id, x, y, rowSpan })),
  );
  assert.deepEqual(
    ids(dashboardFlowLanes(reorderDashboardFlow(next, "tasks", "summary")))
      .main,
    ["tasks", "summary", "schedule", "water"],
  );
});
test("moving across columns appends safely including an empty destination", () => {
  const next = reorderDashboardFlow(widgets, "water", null, "after", "side");
  assert.deepEqual(ids(dashboardFlowLanes(next)).main, [
    "summary",
    "tasks",
    "schedule",
  ]);
  assert.equal(ids(dashboardFlowLanes(next)).side.at(-1), "water");
  assert.equal(
    reorderDashboardFlow(
      [{ id: "water", lane: "main" }],
      "water",
      null,
      "after",
      "side",
    )[0].lane,
    "side",
  );
  assert.equal(new Set(next.map((w) => w.id)).size, widgets.length);
});
test("hidden widgets retain a place and step controls skip them", () => {
  const hidden = widgets.map((w) =>
    w.id === "tasks" ? { ...w, visible: false } : w,
  );
  const next = stepDashboardFlow(hidden, "summary", 1);
  assert.deepEqual(ids(dashboardFlowLanes(next)).main, [
    "schedule",
    "summary",
    "water",
  ]);
  assert.equal(next.find((w) => w.id === "tasks").visible, false);
  assert.equal(stepDashboardFlow(widgets, "summary", -1), widgets);
  assert.equal(reorderDashboardFlow(widgets, "summary", "missing"), widgets);
  assert.equal(reorderDashboardFlow(widgets, "summary", "summary"), widgets);
});
test("invalid columns recover and custom notes remain visible", () => {
  const next = normalizeDashboardFlow([
    { id: "sticky-note:one", lane: "bad", flowOrder: NaN },
  ]);
  assert.equal(next[0].lane, "side");
  assert.equal(Number.isFinite(next[0].flowOrder), true);
  assert.equal(dashboardFlowLanes(next).side.length, 1);
});
