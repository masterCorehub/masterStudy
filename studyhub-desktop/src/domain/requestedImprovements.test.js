import test from 'node:test';
import assert from 'node:assert/strict';
import { referencedNotes } from './wikilinks.js';
import { normalizeAcademicData } from './academic.js';
test('notas internas e wikilinks resolvem relações por ID e título', () => {
  const child = { id: 'child', title: 'Interna', vaultId: 'one', content: '<a href="#nested-note=target">Referência</a> [[Alvo]]' };
  const target = { id: 'target', title: 'Alvo', vaultId: 'one' };
  assert.deepEqual(referencedNotes(child, [child, target]).map(note => note.id), ['target']);
  assert.deepEqual(referencedNotes(child, [child, { ...target, vaultId: 'two' }]), []);
});
test('migração preserva conversa antiga e múltiplos chats separados', () => {
  const academic = normalizeAcademicData({ aiChatHistories: { subject: [{ role: 'user', content: 'Antiga' }] } });
  assert.equal(academic.aiChats.subject[0].messages[0].content, 'Antiga');
  const chats = [{ id: 'one', title: 'Um', messages: [] }, { id: 'two', title: 'Dois', messages: [{ role: 'user', content: 'Outro' }] }];
  assert.deepEqual(normalizeAcademicData({ aiChats: { subject: chats } }).aiChats.subject, chats);
});
