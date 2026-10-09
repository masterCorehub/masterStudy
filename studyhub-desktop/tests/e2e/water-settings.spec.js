import { test, expect } from "playwright/test";
import fs from "node:fs";
import { preparePreview, previewState } from "./fixtures/calendarPreview.js";

const widget = page => page.locator('[data-dashboard-widget-id="water"]');
const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem("studyhub-storage-v2")).state.waterTracker);
const openSettings = async page => {
  await widget(page).getByRole("button", { name: "Configurações de Hidratação" }).click();
  return page.getByRole("textbox", { name: "Meta Diária de Água" });
};

test("water goal accepts L/ml, validates, persists and survives reset/day rollover", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await preparePreview(page);
  await page.goto("http://studyhub.test");
  for (const [input, expected] of [["4000ml", 4000], ["4,5 L", 4500], ["4000", 4000], ["4", 4000]]) {
    const field = await openSettings(page);
    await field.fill(input);
    await page.getByRole("button", { name: "Salvar Alterações" }).click();
    await expect(widget(page)).toContainText(`de ${expected} ml`);
    expect((await saved(page)).targetMl).toBe(expected);
  }
  let field = await openSettings(page);
  await field.fill("16000 ml");
  await page.getByRole("button", { name: "Salvar Alterações" }).click();
  await expect(page.getByRole("alert")).toContainText("500 a 15000 ml");
  expect((await saved(page)).targetMl).toBe(4000);
  await field.fill("4,5 L");
  await page.getByRole("button", { name: "Salvar Alterações" }).click();
  await widget(page).getByRole("button", { name: /250 ml/ }).click();
  await expect(widget(page)).toContainText("250 de 4500 ml");
  await page.reload();
  await expect(widget(page)).toContainText("250 de 4500 ml");
  field = await openSettings(page);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Zerar consumo de hoje" }).click();
  await expect(widget(page)).toContainText("0 de 4500 ml");
  await widget(page).getByRole("button", { name: /250 ml/ }).click();
  await expect(widget(page)).toContainText("250 de 4500 ml");
  await page.clock.setSystemTime(new Date(2026, 9, 9, 12));
  await page.reload();
  await expect(widget(page)).toContainText("0 de 4500 ml");
  await widget(page).getByRole("button", { name: /500 ml/ }).click();
  await expect(widget(page)).toContainText("500 de 4500 ml");
  expect((await saved(page)).targetMl).toBe(4500);
  fs.mkdirSync("qa/water-settings", { recursive: true });
  await openSettings(page);
  await page.screenshot({ path: "qa/water-settings/goal-persisted.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("desktop hydration and database change events preserve a newer saved goal", async ({ page }) => {
  const old = { date: "2026-10-08", targetMl: 2000, consumedMl: 250, settingsUpdatedAt: 10, consumptionUpdatedAt: 10, updatedAt: 10 };
  await page.addInitScript(({ old, previewState }) => {
    window.studyhubDesktop = {
      studyDatabase: {
        load: async () => ({ state: { ...previewState, waterTracker: old } }),
        save: async () => ({}),
      },
      onStudyDataChanged: callback => { window.notifyWaterDatabaseChange = callback; return () => {}; },
    };
  }, { old, previewState });
  await preparePreview(page, { state: { ...previewState, waterTracker: { ...old, targetMl: 4000, settingsUpdatedAt: 20, updatedAt: 20 } } });
  await page.goto("http://studyhub.test");
  await expect(widget(page)).toContainText("250 de 4000 ml");
  const field = await openSettings(page);
  await field.fill("4500 ml");
  await page.getByRole("button", { name: "Salvar Alterações" }).click();
  await page.evaluate(() => window.notifyWaterDatabaseChange());
  await expect(widget(page)).toContainText("250 de 4500 ml");
  await page.reload();
  await expect(widget(page)).toContainText("250 de 4500 ml");
  expect((await saved(page)).targetMl).toBe(4500);
});
