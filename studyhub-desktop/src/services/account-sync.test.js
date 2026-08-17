import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeStudyStates,
  cloudStateSizeBytes,
  prepareStudyStateForCloud,
  serializeStudyState,
} from "./account-sync.js";

test("serializa o estado sem funções do Zustand", () => {
  assert.deepEqual(
    serializeStudyState({ title: "Aula", save() {}, nested: { value: 2 } }),
    { title: "Aula", nested: { value: 2 } },
  );
});

test("remove caminhos e arquivos Base64 do estado enviado à nuvem", () => {
  const prepared = prepareStudyStateForCloud({
    studyItems: [
      {
        id: "arquivo-1",
        type: "file",
        filePath: "/home/aluno/segredo.pdf",
        fileDataUrl: "data:application/pdf;base64,AAAA",
        cloudObjectPath: "users/user/arquivo.pdf",
      },
    ],
  });

  assert.equal(prepared.studyItems[0].filePath, undefined);
  assert.equal(prepared.studyItems[0].fileDataUrl, undefined);
  assert.equal(prepared.studyItems[0].cloudObjectPath, "users/user/arquivo.pdf");
});

test("sincroniza fotos do diário pelo objeto remoto sem expor caminho local", () => {
  const prepared = prepareStudyStateForCloud({
    journalEntries: [
      {
        id: "journal-1",
        photos: [
          {
            id: "photo-1",
            localPath: "/home/aluno/Fotos/privada.jpg",
            cloudObjectPath: "users/user/photo-1.jpg",
            caption: "Uma lembrança",
          },
        ],
      },
    ],
  });

  assert.equal(prepared.journalEntries[0].photos[0].localPath, undefined);
  assert.equal(
    prepared.journalEntries[0].photos[0].cloudObjectPath,
    "users/user/photo-1.jpg",
  );
  assert.equal(prepared.journalEntries[0].photos[0].caption, "Uma lembrança");
});

test("remove imagens Base64 aninhadas sem remover a cena vetorial", () => {
  const prepared = prepareStudyStateForCloud({
    studyItems: [
      {
        id: "drawing-1",
        content: '<p>Antes</p><img src="data:image/png;base64,AAAA" /><p>Depois</p>',
        reference: {
          image: "data:image/png;base64,BBBB",
          drawingScene: { elements: [{ id: "line-1", points: [{ x: 1, y: 2 }] }] },
        },
      },
    ],
  });

  assert.equal(prepared.studyItems[0].reference.image, undefined);
  assert.ok(!prepared.studyItems[0].content.includes("data:image"));
  assert.equal(prepared.studyItems[0].reference.drawingScene.elements.length, 1);
  assert.ok(cloudStateSizeBytes(prepared) > 0);
});

test("mescla edições independentes de dois dispositivos por entidade", () => {
  const base = {
    studyItems: [
      { id: "note-1", title: "Nota", content: "A" },
      { id: "note-2", title: "Outra", content: "B" },
    ],
  };
  const local = {
    studyItems: [
      { id: "note-1", title: "Nota", content: "A local" },
      { id: "note-2", title: "Outra", content: "B" },
    ],
  };
  const remote = {
    studyItems: [
      { id: "note-1", title: "Nota", content: "A" },
      { id: "note-2", title: "Outra", content: "B remoto" },
    ],
  };

  const merged = mergeStudyStates(base, local, remote);
  assert.equal(merged.state.studyItems[0].content, "A local");
  assert.equal(merged.state.studyItems[1].content, "B remoto");
  assert.deepEqual(merged.conflicts, []);
});

test("preserva uma edição concorrente quando o outro dispositivo exclui", () => {
  const base = { tasks: { list: [{ id: "task-1", title: "Inicial" }] } };
  const local = { tasks: { list: [] } };
  const remote = { tasks: { list: [{ id: "task-1", title: "Editada" }] } };
  const merged = mergeStudyStates(base, local, remote);

  assert.equal(merged.state.tasks.list[0].title, "Editada");
  assert.ok(merged.conflicts.some((path) => path.includes("task-1")));
});
