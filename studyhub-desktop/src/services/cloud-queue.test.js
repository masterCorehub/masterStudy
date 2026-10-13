import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileQueuedStudyState } from './account-sync.js';
test('old offline queue cannot restore a deleted course or uncheck a habit', () => {
 const current={courses:[],entityDeletionTombstones:[{entityType:'course',entityId:'c',deletedAt:200,updatedAt:200}],habits:{list:[{id:'h',updatedAt:200,completedDates:['2026-10-13'],completionChanges:{'2026-10-13':{completed:true,updatedAt:200}}}]}};
 const pending={courses:[{id:'c',updatedAt:100}],habits:{list:[{id:'h',updatedAt:100,completedDates:[]}]}};
 const result=reconcileQueuedStudyState(current,pending);
 assert.deepEqual(result.courses,[]);
 assert.deepEqual(result.habits.list[0].completedDates,['2026-10-13']);
});
test('legitimate queued additions are retained without reverting newer edits', () => {
 const current={stickyNotes:[{id:'n',content:'Current',updatedAt:300}]};
 const pending={stickyNotes:[{id:'n',content:'Old',updatedAt:100},{id:'queued',content:'Unsent',updatedAt:200}]};
 const result=reconcileQueuedStudyState(current,pending);
 assert.equal(result.stickyNotes.find(n=>n.id==='n').content,'Current');
 assert.equal(result.stickyNotes.find(n=>n.id==='queued').content,'Unsent');
});
test('absent queue returns serializable current data without store functions', () => {
 assert.deepEqual(reconcileQueuedStudyState({courses:[],update(){}},null),{courses:[]});
});
