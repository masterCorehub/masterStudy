import test from "node:test";
import assert from "node:assert/strict";
import { getLocalFilePath, getLocalFileUrl } from "./localFileUrl.js";

test("gera URL local segura para espaços, cerquilha e porcentagem", () => {
  assert.equal(
    getLocalFileUrl("C:\\Aulas\\Aula #1 50%.mp4"),
    "safe-file://local/C%3A/Aulas/Aula%20%231%2050%25.mp4",
  );
});

test("recupera caminhos file e safe-file para operações nativas", () => {
  assert.equal(getLocalFilePath("safe-file:///C%3A/Aulas/Aula%20%231.mp4"), "C:/Aulas/Aula #1.mp4");
  assert.equal(getLocalFilePath("safe-file://local/C%3A/Aulas/Aula%20%231.mp4"), "C:/Aulas/Aula #1.mp4");
  assert.equal(getLocalFilePath("file:///C:/Aulas/Aula #1.mp4"), "C:/Aulas/Aula #1.mp4");
  assert.equal(getLocalFilePath("https://example.com/aula.mp4"), "");
});

test("normaliza URLs antigas do protocolo que o player rejeitava", () => {
  assert.equal(
    getLocalFileUrl("safe-file:///C%3A/Aulas/Aula%20%231.mp4"),
    "safe-file://local/C%3A/Aulas/Aula%20%231.mp4",
  );
});
