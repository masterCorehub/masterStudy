import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preparePreview, previewState } from '../tests/e2e/fixtures/calendarPreview.js';

process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const output = path.resolve('../branding/screenshots');
const frameDir = '/tmp/masterstudy-readme-frames';
await fs.mkdir(output, { recursive: true });
await fs.mkdir(frameDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let frame = 0;
// Capturar a interface durante ações reais permite reproduzir o percurso no GIF.
async function record(count = 6) {
  for (let i = 0; i < count; i++) {
    await page.screenshot({ path: path.join(frameDir, `${String(frame++).padStart(4, '0')}.png`) });
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}
async function dismissAlerts() {
  while (await page.getByTitle('Dispensar alerta', { exact: true }).count()) {
    await page.getByTitle('Dispensar alerta', { exact: true }).first().click();
  }
}
const titles = ['Fundamentos de programação', 'Aprender com autonomia', 'Ideias em movimento', 'Estruturas de dados'];
const colors = ['#315c53', '#8b5b39', '#514973', '#3b526b'];
const cover = (title, index) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 450"><rect width="300" height="450" fill="${colors[index]}"/><rect x="22" y="22" width="256" height="406" rx="4" fill="none" stroke="#f2eade" opacity=".3"/><text x="40" y="70" font-family="sans-serif" font-size="12" fill="#f2eade">BIBLIOTECA DE EXEMPLO</text><path d="M45 170h72l33 18 33-18h72v105h-72l-33 18-33-18H45z" fill="none" stroke="#f2eade" stroke-width="3"/><text x="40" y="338" font-family="sans-serif" font-size="18" fill="#f2eade">${title.split(' ').slice(0,2).join(' ')}</text><text x="40" y="365" font-family="sans-serif" font-size="18" fill="#f2eade">${title.split(' ').slice(2).join(' ')}</text><text x="40" y="400" font-family="sans-serif" font-size="11" fill="#f2eade">CONTEÚDO FICTÍCIO</text></svg>`);
const state = { ...previewState,
  academic: { ...previewState.academic,
    subjects: previewState.academic.subjects.map((subject, index) => ({ ...subject, name: ['Programação', 'Estruturas de Dados', 'Sistemas Distribuídos', 'Eletrônica'][index] || subject.name })),
    aiChatHistories: { one: [
      { role: 'user', content: 'Como posso revisar funções antes de resolver os exercícios?', time: '10:00' },
      { role: 'ai', content: 'Uma sugestão de estudo: primeiro explique o que a função recebe e devolve. Depois escreva um exemplo pequeno e compare o resultado com o esperado. Para praticar, crie uma função que calcula a média de três notas.\n\nEsta conversa é um exemplo fictício de apresentação.', time: '10:01' },
    ] },
  },
  tasks: { list: [
    { id: 'read', title: 'Ler o capítulo de funções', dueDate: '2026-10-08', status: 'pending', subtasks: [] },
    { id: 'practice', title: 'Resolver três exercícios', dueDate: '2026-10-08', status: 'pending', subtasks: [] },
    { id: 'notes', title: 'Organizar anotações da aula', dueDate: '2026-10-08', completedDate: '2026-10-08', status: 'completed', subtasks: [] },
  ] },
  books: { list: titles.map((title, i) => ({ id: `demo-${i}`, title, author: 'Biblioteca de exemplo', status: i === 0 ? 'READING' : 'TO READ', totalPages: 240, readPages: i === 0 ? 72 : 0, categoryId: 'category-technology', coverUrl: cover(title, i), coverSource: 'manual' })) },
};
try {
  await preparePreview(page, { state });
  await page.goto('http://studyhub.test');
  await page.getByRole('heading', { name: 'Hoje', exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await dismissAlerts();
  await page.screenshot({ path: path.join(output, 'hoje.png') });
  await record();
  const input = page.getByPlaceholder('Adicionar tarefa para hoje...');
  await input.fill('Revisar funções');
  await record(4);
  await input.press('Enter');
  const taskWidget = page.locator('.today-panel').filter({ has: page.getByRole('heading', { name: /Tarefas de hoje/ }) });
  await taskWidget.getByText('Revisar funções', { exact: true }).waitFor();
  await record();
  await taskWidget.getByRole('button', { name: 'Concluir tarefa Revisar funções', exact: true }).click();
  await taskWidget.getByRole('button', { name: 'Reabrir tarefa Revisar funções', exact: true }).waitFor();
  await record();
  const nav = page.getByRole('navigation', { name: 'Navegação principal' });
  await nav.getByRole('button', { name: 'Cursos e Disciplinas', exact: true }).click();
  await page.getByRole('heading', { name: 'Cursos e Disciplinas', exact: true }).waitFor();
  await dismissAlerts();
  await record();
  await page.screenshot({ path: path.join(output, 'disciplinas.png') });
  await nav.getByRole('button', { name: 'Livros', exact: true }).click();
  await page.getByText(titles[0], { exact: true }).first().waitFor();
  await dismissAlerts();
  await record(9);
  await page.setViewportSize({ width: 1280, height: 1280 });
  await page.screenshot({ path: path.join(output, 'biblioteca.png') });
  await page.setViewportSize({ width: 1280, height: 860 });
  await nav.getByRole('button', { name: 'Cursos e Disciplinas', exact: true }).click();
  await page.getByText('Programação', { exact: true }).first().click();
  await page.getByRole('heading', { name: 'Programação', exact: true }).waitFor();
  await page.getByText('Como posso revisar funções antes de resolver os exercícios?', { exact: true }).waitFor();
  await dismissAlerts();
  await page.screenshot({ path: path.join(output, 'estudio.png') });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Capturas e ${frame} quadros gerados com dados fictícios.`);
} finally { await browser.close(); }
