import test from "node:test";
import assert from "node:assert/strict";
import { parseWaterTarget, waterTrackerForDate, mergeWaterTrackers } from "./waterTracker.js";
import { mergeStudyStates } from "../services/account-sync.js";

test("accepts liters, milliliters, explicit units and decimal commas", () => {
  for (const input of [4, "4", "4 L", "4000", "4000ml", "4000 ML"]) {
    assert.equal(parseWaterTarget(input), 4000, String(input));
  }
  for (const input of ["4,5", "4.5 l", "4500 ml"]) {
    assert.equal(parseWaterTarget(input), 4500, input);
  }
  for (const [input, expected] of [["0,5 L", 500], ["500 ml", 500], ["15 L", 15000], [15000, 15000]]) {
    assert.equal(parseWaterTarget(input), expected);
  }
});

test("rejects invalid syntax and values outside the converted range", () => {
  for (const input of ["", null, undefined, "abc", "4x", "4e3", "-4", "4,5,6", "400 ml", "16 L", 16000, 0, Infinity]) {
    assert.equal(parseWaterTarget(input), null, String(input));
  }
});

test("day rollover resets only consumption and keeps custom settings", () => {
  const tracker = {
    date: "2026-10-08", targetMl: 4500, consumedMl: 1200,
    cupSizeMl: 300, bottleSizeMl: 750, updatedAt: 10,
    lastIntakeAmount: 300, lastIntakeAt: 10,
  };
  const next = waterTrackerForDate(tracker, "2026-10-09");
  assert.equal(next.targetMl, 4500);
  assert.equal(next.cupSizeMl, 300);
  assert.equal(next.bottleSizeMl, 750);
  assert.equal(next.consumedMl, 0);
  assert.equal(next.lastIntakeAt, undefined);
  assert.equal(next.settingsUpdatedAt, 10);
  assert.equal(waterTrackerForDate(tracker, tracker.date).consumedMl, 1200);
});

test("stale database settings cannot overwrite a newer local goal", () => {
  const local = { date: "2026-10-09", targetMl: 4500, consumedMl: 250, settingsUpdatedAt: 20, consumptionUpdatedAt: 30, updatedAt: 30 };
  const stale = { date: "2026-10-09", targetMl: 2000, consumedMl: 500, settingsUpdatedAt: 10, consumptionUpdatedAt: 40, updatedAt: 40 };
  const merged = mergeWaterTrackers(local, stale);
  assert.equal(merged.targetMl, 4500);
  assert.equal(merged.consumedMl, 500);
  assert.equal(merged.settingsUpdatedAt, 20);
  assert.equal(mergeWaterTrackers(local, undefined), local);
  assert.equal(mergeWaterTrackers(undefined, local), local);
});

test("cloud merging preserves independent settings and consumption changes", () => {
  const base = { waterTracker: { date: "2026-10-08", targetMl: 2000, consumedMl: 250, settingsUpdatedAt: 10, consumptionUpdatedAt: 10, updatedAt: 10 } };
  const local = { waterTracker: { ...base.waterTracker, targetMl: 4000, cupSizeMl: 300, settingsUpdatedAt: 20, updatedAt: 20 } };
  const remote = { waterTracker: { ...base.waterTracker, date: "2026-10-09", consumedMl: 750, consumptionUpdatedAt: 30, updatedAt: 30 } };
  const merged = mergeStudyStates(base, local, remote).state.waterTracker;
  assert.equal(merged.targetMl, 4000);
  assert.equal(merged.cupSizeMl, 300);
  assert.equal(merged.date, "2026-10-09");
  assert.equal(merged.consumedMl, 750);
  assert.equal(mergeStudyStates(base, remote, local).state.waterTracker.targetMl, 4000);
});

test("a newer remote setting still applies and legacy timestamps remain supported", () => {
  const old = { date: "2026-10-09", targetMl: 3000, consumedMl: 1000, updatedAt: 10 };
  const incoming = { ...old, targetMl: 5000, settingsUpdatedAt: 20, consumptionUpdatedAt: 5, updatedAt: 20 };
  const merged = mergeWaterTrackers(old, incoming);
  assert.equal(merged.targetMl, 5000);
  assert.equal(merged.consumedMl, 1000);
});
