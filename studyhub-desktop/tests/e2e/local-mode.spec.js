import { test, expect } from 'playwright/test';
import { preparePreview, previewState } from './fixtures/calendarPreview.js';
import fs from 'node:fs';

for (const scenario of [{ name:'fresh desktop', desktop:true },{ name:'browser local option', desktop:false, accessMode:'local' },{ name:'local with a cached account', desktop:true, authenticated:true, accessMode:'local' }]) {
 test(`local mode: ${scenario.name} opens without login and preserves data`, async ({page}) => {
  const requests=[]; const errors=[];
  page.on('request', request => { if (/\/auth\/v1|\/rest\/v1/.test(request.url()) || new URL(request.url()).hostname.endsWith('.supabase.co')) requests.push(request.url()); });
  page.on('websocket',socket=>requests.push(socket.url()));
  page.on('pageerror', error => errors.push(error.message));
  await preparePreview(page, { ...scenario, authenticated:scenario.authenticated ?? false, state:{ ...previewState, habits:{list:[{id:'local-habit',title:'Ler',completedDates:['2026-10-08']}]}, stickyNotes:[{id:'local-note',title:'Sem servidor',content:'Minha nota local',updatedAt:100}], courses:[{id:'local-course',title:'Curso local',modules:[],lessons:[]}] } });
  await page.goto('http://studyhub.test');
  await expect(page.getByRole('button',{name:'Modo local'})).toBeVisible();
  await expect(page.getByRole('textbox',{name:'E-mail',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Modo local'}).click();
  await expect(page.getByText('Modo local ativo',{exact:true})).toBeVisible();
  let expectedContent = 'Minha nota local';
  if (scenario.name === 'fresh desktop') {
    await page.getByRole('button',{name:'Dados & Backup',exact:true}).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button',{name:/Baixar Arquivo JSON/}).click(),
    ]);
    const backup = JSON.parse(fs.readFileSync(await download.path(),'utf8'));
    expect(backup.habits.list[0].completedDates).toEqual(['2026-10-08']);
    expect(backup.stickyNotes[0].content).toBe('Minha nota local');
    expect(backup).not.toHaveProperty('collaboration');
    expectedContent = 'Restaurada pelo backup local';
    backup.stickyNotes[0].content = expectedContent;
    // Accept the deliberate replace confirmation and its completion alert.
    page.on('dialog', dialog => dialog.accept());
    await page.locator('input[type="file"][accept=".json"]').setInputFiles({
      name:'local-backup.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(backup)),
    });
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('studyhub-storage-v2')).state.stickyNotes[0].content)).toBe(expectedContent);
  }
  await page.reload();
  await expect(page.getByRole('button',{name:'Modo local'})).toBeVisible();
  const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('studyhub-storage-v2')).state);
  expect(state.habits.list[0].completedDates).toEqual(['2026-10-08']);
  expect(state.stickyNotes[0].content).toBe(expectedContent);
  expect(state.courses.some(course=>course.id==='local-course')).toBe(true);
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
 });
}
