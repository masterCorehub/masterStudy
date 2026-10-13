import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAccessMode, browserAccessMode, changeAccessMode, ACCESS_MODE_KEY } from './accessMode.js';
const base = { configured: true, desktop: true };
test('new desktop installations start local without an account', () => assert.equal(resolveAccessMode(base),'local'));
test('missing Supabase configuration always permits local use', () => assert.equal(resolveAccessMode({ ...base, configured:false, preference:'cloud' }),'local'));
test('existing signed-in accounts retain cloud mode', () => assert.equal(resolveAccessMode({ ...base, hasSession:true }),'cloud'));
test('local preference wins over a cached account or recovery callback', () => assert.equal(resolveAccessMode({ ...base, hasSession:true, preference:'local', authCallback:true }),'local'));
test('configured web keeps account entry but supports explicit local mode', () => {
 assert.equal(resolveAccessMode({ ...base, desktop:false }),'cloud');
 assert.equal(resolveAccessMode({ ...base, desktop:false, preference:'local' }),'local');
});
test('first local desktop launch is remembered and mode change reloads services', () => {
 const data=new Map(); let reloads=0;
 const browser={ studyhubDesktop:{}, location:{href:'file:///app/index.html',reload:()=>reloads++},localStorage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),get length(){return data.size},key:i=>[...data.keys()][i]} };
 assert.equal(browserAccessMode(true,browser),'local');
 assert.equal(data.get(ACCESS_MODE_KEY),'local');
 changeAccessMode('cloud',browser);
 assert.equal(data.get(ACCESS_MODE_KEY),'cloud'); assert.equal(reloads,1);
});
test('unavailable browser storage does not block local desktop startup', () => {
 const browser={studyhubDesktop:{},location:{href:'file:///app/index.html'},localStorage:{getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}}};
 assert.equal(browserAccessMode(true,browser),'local');
});
