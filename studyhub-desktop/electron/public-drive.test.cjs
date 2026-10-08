const test = require("node:test");
const assert = require("node:assert/strict");
const { parseLink, parseFolder, listPublicDrive, downloadPublicDrive } = require("./public-drive.cjs");
const folder = entries => `<title>Livros &amp; estudos</title><div class="flip-entries">${entries}</div>`;
const entry = (id, name, kind = "file/d") => `<a href="https://drive.google.com/${kind}/${id}${kind === 'file/d' ? '/view' : ''}"><div>${name}</div></a>`;
test("links públicos somente no domínio permitido; pastas e arquivos", () => {
  assert.equal(parseLink("https://drive.google.com/drive/folders/root").folder, true);
  assert.equal(parseLink("https://drive.google.com/file/d/book/view").id, "book");
  assert.equal(parseLink("https://drive.google.com/uc?id=book").id, "book");
  for (const url of ["http://drive.google.com/uc?id=x", "https://evil.test/uc?id=x", "https://drive.google.com/uc?id=x%27"]) assert.throws(() => parseLink(url));
});
test("listagem pública recursiva interpreta HTML sem executar scripts", async () => {
  const fetchImpl = async url => new Response(folder(new URL(url).searchParams.get("id") === "root" ? entry("sub", "Subpasta", "drive/folders") + entry("pdf", "Meu &amp; livro.pdf") + entry("txt", "ignorar.txt") : entry("epub", "Livro.epub")));
  const result = await listPublicDrive("https://drive.google.com/drive/folders/root", { fetchImpl });
  assert.equal(result.files.length, 2);
  assert.equal(result.files[0].displayPath, "Subpasta/Livro.epub");
  assert.equal(result.files[1].name, "Meu & livro.pdf");
  assert.throws(() => parseFolder("<title>Sign in</title>"), /listar/);
});
test("lista um único livro público pelo título", async () => {
  const result = await listPublicDrive("https://drive.google.com/file/d/pdf/view", { fetchImpl: async () => new Response("<title>Meu livro.pdf - Google Drive</title>") });
  assert.equal(result.files[0].name, "Meu livro.pdf");
});
test("download direto valida bytes e rejeita HTML disfarçado", async () => {
  const bytes = await downloadPublicDrive({ id: "pdf", name: "Livro.pdf" }, { fetchImpl: async () => new Response("%PDF-1.7 test") });
  assert.equal(bytes.toString(), "%PDF-1.7 test");
  await assert.rejects(downloadPublicDrive({ id: "pdf", name: "Livro.pdf" }, { fetchImpl: async () => new Response("<html>Login</html>") }), /inválido/);
});
test("confirmação de download usa o mesmo ID e parâmetros do formulário", async () => {
  let calls = 0;
  const bytes = await downloadPublicDrive({ id: "pdf", name: "Livro.pdf" }, { fetchImpl: async url => {
    if (!calls++) return new Response('<form action="https://drive.usercontent.google.com/download"><input name="id" value="pdf"><input name="confirm" value="t"><input name="uuid" value="token"></form>', { headers: { "Content-Type": "text/html" } });
    assert.equal(new URL(url).searchParams.get("uuid"), "token");
    return new Response("%PDF-1.7 test");
  } });
  assert.ok(bytes.length); assert.equal(calls, 2);
});
test("nega redirecionamento externo, tamanho excessivo e pasta truncada", async () => {
  await assert.rejects(downloadPublicDrive({ id: "pdf", name: "Livro.pdf" }, { fetchImpl: async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/secret" } }) }), /redirecionou/);
  await assert.rejects(downloadPublicDrive({ id: "pdf", name: "Livro.pdf" }, { maxBytes: 2, fetchImpl: async () => new Response("%PDF-1.7") }), /grande/);
  await assert.rejects(listPublicDrive("https://drive.google.com/drive/folders/root", { fetchImpl: async () => new Response(folder(Array.from({length:50}, (_, i) => entry(`id${i}`, `Livro${i}.pdf`)).join(""))) }), /incompleta/);
});
