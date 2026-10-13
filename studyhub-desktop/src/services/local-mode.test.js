import test from 'node:test';
import assert from 'node:assert/strict';
import { collaborationCloud, collaborationCloudConfigured, collaborationCloudEnabled, localMode } from './collaboration-cloud.js';
test('without Supabase environment the cloud service has no session or subscriptions', async () => {
 assert.equal(collaborationCloudConfigured,false);
 assert.equal(collaborationCloudEnabled,false);
 assert.equal(localMode,true);
 assert.equal(await collaborationCloud.getSession(),null);
 let calls=0;
 const unsubscribe=collaborationCloud.onAuthStateChange(()=>calls++);
 unsubscribe();
 collaborationCloud.subscribeAccountState('local-user',()=>calls++)();
 assert.equal(calls,0);
 await assert.rejects(collaborationCloud.loadAccountState(),/Ative a sincronização/);
});
