import test from 'node:test';
import assert from 'node:assert/strict';
import { rollingAgendaDays } from './rollingAgenda.js';
test('agenda mostra dois dias antes e depois incluindo fim de semana e virada do mês', () => {
 const days=rollingAgendaDays(new Date(2026,9,1));
 assert.deepEqual(days.map(item=>[item.date.getMonth()+1,item.date.getDate()]),[[9,29],[9,30],[10,1],[10,2],[10,3]]);
 assert.equal(days[2].offset,0); assert.equal(days[4].dayIndex,6);
});
