export const createAcademicResourceForm = (type = "file") => ({
  title: "",
  type,
  url: "",
  path: "",
});

export const resourceFileName = (path = "") =>
  String(path).split(/[\\/]/).pop() || String(path);

const normalizeWebUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const candidate = /^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`;

  try {
    const parsed = new URL(candidate);
    if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) {
      return null;
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
};

export const prepareAcademicResource = ({ form = {}, subject = {} }) => {
  const title = String(form.title || "").trim();
  const type = form.type === "link" ? "link" : "file";

  if (!subject.id) {
    return { ok: false, error: "Disciplina não encontrada." };
  }
  if (!title) {
    return { ok: false, error: "Informe um nome para a fonte." };
  }

  if (type === "file") {
    const path = String(form.path || "").trim();
    if (!path) {
      return { ok: false, error: "Selecione um arquivo." };
    }
    return {
      ok: true,
      resource: {
        subjectId: subject.id,
        semesterId: subject.semesterId,
        title,
        type,
        path,
        url: "",
        selected: true,
      },
    };
  }

  const url = normalizeWebUrl(form.url);
  if (!url) {
    return { ok: false, error: "Informe um link HTTP ou HTTPS válido." };
  }
  return {
    ok: true,
    resource: {
      subjectId: subject.id,
      semesterId: subject.semesterId,
      title,
      type,
      path: "",
      url,
      selected: true,
    },
  };
};
