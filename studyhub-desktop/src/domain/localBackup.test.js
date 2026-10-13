import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalBackup, readLocalBackup } from './localBackup.js';
test('local backups preserve completion, resume positions, decks and deletion markers', () => {
 const state={habits:{list:[{id:'h',completedDates:['2026-10-13']}]},books:{list:[{id:'b',lastPosition:{cfi:'epubcfi(/6/2)',savedAt:100}}]},flashcardDecks:[{id:'d'}],entityDeletionTombstones:[{entityType:'course',entityId:'c',deletedAt:100}],bookCategories:[{id:'custom'}]};
 assert.deepEqual(readLocalBackup(createLocalBackup(state)),state);
});
test('backup export/import exclude account credentials, AI keys and functions', () => {
 const value={courses:[],authToken:'secret',geminiApiKey:'secret',setState(){}};
 assert.deepEqual(readLocalBackup(createLocalBackup(value)),{courses:[]});
});
test('legacy book arrays can be restored; invalid shapes are rejected', () => {
 assert.deepEqual(readLocalBackup({books:[{id:'b'}]}),{books:{list:[{id:'b'}]}});
 assert.throws(()=>readLocalBackup({habits:'bad'}));
 assert.throws(()=>readLocalBackup({authToken:'secret'}));
});
