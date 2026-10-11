import test from 'node:test';
import assert from 'node:assert/strict';
import { applyStickyUpdate, mergeStickyNote } from './stickySync.js';
import { toggleStickyTask, stickyTaskLines } from './stickyTasks.js';
import { organizeLessonNote, isClassNote } from './lessonNoteOrganization.js';
test('broadcast antigo não reverte texto e alteração de cor preserva conteúdo', () => {
 const note = { id:'n', content:'Novo texto', color:'yellow', updatedAt:200, fieldUpdatedAt:{content:200,color:100} };
 assert.equal(applyStickyUpdate(note, {content:'Texto antigo',updatedAt:150}).content, 'Novo texto');
 const merged = mergeStickyNote(note,{id:'n',content:'Texto antigo',color:'blue',updatedAt:300,fieldUpdatedAt:{content:150,color:300}});
 assert.equal(merged.content,'Novo texto'); assert.equal(merged.color,'blue');
});
test('tarefas iguais alternam somente a selecionada e ignoram código', () => {
 const text='- [ ] Estudar\n- [ ] Estudar\n```\n- [ ] Código\n```';
 assert.deepEqual(stickyTaskLines(text),[0,1]);
 assert.equal(toggleStickyTask(text,1),text.replace('- [ ] Estudar\n```','- [x] Estudar\n```'));
});
test('nota da aula herda caminho, mantém organização manual e separa notas comuns', () => {
 const courses=[{id:'java',title:'Java',modules:[{id:'fund',title:'Fundamentos',lessons:[{id:'var',title:'Variáveis'}]}]}];
 const note={id:'n',sourceCourseId:'java',sourceModuleId:'fund',sourceLessonId:'var'};
 assert.equal(organizeLessonNote(note,courses).path,'Fundamentos/Variáveis');
 assert.equal(organizeLessonNote({...note,path:'Java/Fundamentos/Variáveis'},courses).path,'Fundamentos/Variáveis');
 assert.equal(organizeLessonNote({...note,path:'Minha pasta'},courses).path,'Minha pasta');
 assert.equal(isClassNote(note),true); assert.equal(isClassNote({title:'Solta'}),false);
});
