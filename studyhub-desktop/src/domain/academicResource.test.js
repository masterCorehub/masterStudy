import test from "node:test";
import assert from "node:assert/strict";
import {
  createAcademicResourceForm,
  prepareAcademicResource,
  resourceFileName,
} from "./academicResource.js";

const subject = { id: "subject-1", semesterId: "semester-1" };

test("prepara um arquivo selecionado e preserva seu caminho", () => {
  const result = prepareAcademicResource({
    form: {
      ...createAcademicResourceForm("file"),
      title: "  Material da aula  ",
      path: "C:\\Estudos\\Aula 01.pdf",
    },
    subject,
  });

  assert.deepEqual(result, {
    ok: true,
    resource: {
      subjectId: "subject-1",
      semesterId: "semester-1",
      title: "Material da aula",
      type: "file",
      path: "C:\\Estudos\\Aula 01.pdf",
      url: "",
      selected: true,
    },
  });
  assert.equal(resourceFileName(result.resource.path), "Aula 01.pdf");
});

test("normaliza um link sem protocolo antes de salvar", () => {
  const result = prepareAcademicResource({
    form: {
      ...createAcademicResourceForm("link"),
      title: "Documentação",
      url: "docs.example.com/guia",
    },
    subject,
  });

  assert.equal(result.ok, true);
  assert.equal(result.resource.url, "https://docs.example.com/guia");
  assert.equal(result.resource.path, "");
  assert.equal(result.resource.type, "link");
});

test("rejeita links inseguros e arquivos sem caminho", () => {
  assert.equal(
    prepareAcademicResource({
      form: {
        ...createAcademicResourceForm("link"),
        title: "Inválido",
        url: "javascript:alert(1)",
      },
      subject,
    }).ok,
    false,
  );
  assert.equal(
    prepareAcademicResource({
      form: {
        ...createAcademicResourceForm("file"),
        title: "Sem arquivo",
      },
      subject,
    }).ok,
    false,
  );
});
