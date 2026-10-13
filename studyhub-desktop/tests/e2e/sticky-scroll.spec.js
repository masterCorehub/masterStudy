import { test, expect } from 'playwright/test';
import { preparePreview, previewState } from './fixtures/calendarPreview.js';

test('long sticky content scrolls in editing and Markdown without moving the title', async ({ page }) => {
  await page.addInitScript(() => { window.studyhubDesktop = { platform: 'darwin' }; });
  const content = Array.from({ length: 100 }, (_, i) => `Linha ${i + 1}: conteúdo longo`).join('\n');
  await preparePreview(page, { state: { ...previewState, stickyNotes: [{ id: 'scroll', title: 'Nota longa', content, color: 'yellow', updatedAt: 100 }] } });
  await page.setViewportSize({ width: 420, height: 380 });
  await page.goto('http://studyhub.test/?screen=sticky_note_widget&standalone=1&noteId=scroll');
  const title = page.getByRole('textbox', { name: 'Título da nota' });
  const editor = page.getByRole('textbox', { name: 'Conteúdo da nota' });
  await expect(editor).toBeVisible();
  const top = (await title.boundingBox()).y;
  const checkScroll = async locator => {
    expect(await locator.evaluate(el => el.scrollHeight > el.clientHeight && el.clientHeight > 50)).toBe(true);
    await locator.hover();
    await page.mouse.wheel(0, 600);
    await expect.poll(() => locator.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    expect((await title.boundingBox()).y).toBe(top);
  };
  await checkScroll(editor);
  await editor.fill(`# Cabeçalho\n\n${content}`);
  await page.getByRole('button', { name: 'Visualizar Markdown' }).click();
  await checkScroll(page.getByLabel('Nota formatada em Markdown'));
  const footer = page.locator('.sticky-markdown + div');
  await expect(footer).toContainText('Salvo automaticamente');
  await expect(footer).toBeVisible();
});
