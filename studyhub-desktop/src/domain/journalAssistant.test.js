import test from 'node:test';
import assert from 'node:assert/strict';
import { journalAssistantSources, buildJournalAssistantRequest } from './journalAssistant.js';
test('padrões usam somente entradas com texto do mês escolhido', () => {
 const entries = [{ id:'a', entryDate:'2026-10-08', content:'Estudei mais devagar.' }, { id:'b', entryDate:'2026-09-30', content:'Outro mês.' }, { id:'c', entryDate:'2026-10-01', content:'Organizei meus estudos.' }, { id:'d', entryDate:'2026-10-09', content:'' }];
 const sources = journalAssistantSources('patterns', {}, entries, '2026-10');
 assert.deepEqual(sources.map(item=>item.id), ['c','a']);
 const request = buildJournalAssistantRequest('patterns', sources);
 assert.match(request.prompt, /datas e os títulos/);
 assert.doesNotMatch(request.prompt, /Outro mês/);
});
test('revisão usa apenas a entrada aberta e início aceita uma página vazia', () => {
 const draft={id:'open',content:'Minha voz.',entryDate:'2026-10-10'};
 const sources=journalAssistantSources('revise',draft,[{id:'other',content:'Texto privado de outra entrada'}],'2026-10');
 assert.equal(sources.length,1);
 assert.equal(sources[0].id,'open');
 assert.match(buildJournalAssistantRequest('revise',sources).prompt,/preservando primeira pessoa/);
 assert.doesNotThrow(()=>buildJournalAssistantRequest('start',[{content:''}]));
 assert.throws(()=>buildJournalAssistantRequest('patterns',sources),/pelo menos duas/);
});
