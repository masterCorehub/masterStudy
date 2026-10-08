// Public HTML/download endpoints only: no Google API keys or account cookies.
const decode = text => String(text).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
const text = html => decode(html.replace(/<[^>]*>/g, "")).trim();
function parseLink(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("Cole o link completo do arquivo ou pasta do Drive."); }
  if (url.protocol !== "https:" || url.hostname !== "drive.google.com") throw new Error("Use um link público HTTPS de drive.google.com.");
  const folder = url.pathname.match(/\/folders\/([\w-]+)(?:\/|$)/);
  const id = folder?.[1] || url.pathname.match(/\/file\/d\/([\w-]+)(?:\/|$)/)?.[1] || url.searchParams.get("id");
  if (!id || !/^[\w-]+$/.test(id)) throw new Error("Link do Drive inválido.");
  return { id, folder: Boolean(folder), resourceKey: url.searchParams.get("resourcekey") || "" };
}
function parseFolder(html) {
  if (!/flip-entries|folderview/i.test(html)) throw new Error("Não foi possível listar esta pasta pública. Confira o compartilhamento ou importe os links dos livros individualmente.");
  const entries = [];
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const link = decode(match[1]);
      const parsed = parseLink(link);
      const name = text(match[2]);
      if (name) entries.push({ ...parsed, name, link });
    } catch { /* Ignore navigation and Google-native documents. */ }
  }
  return { name: text(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "Livros do Drive"), entries };
}
function allowed(url) {
  const parsed = new URL(url);
  return parsed.protocol === "https:" && ["drive.google.com", "drive.usercontent.google.com"].includes(parsed.hostname);
}
function client(fetchImpl = fetch, maxBytes = 150 * 1024 * 1024) {
  const cookies = new Map();
  const request = async (initial, limit = maxBytes) => {
    let url = initial;
    for (let hop = 0; hop < 8; hop++) {
      if (!allowed(url)) throw new Error("O Drive redirecionou para uma página de login ou endereço não suportado.");
      const response = await fetchImpl(url, { redirect: "manual", signal: AbortSignal.timeout(120000), headers: { "User-Agent": "Mozilla/5.0", ...(cookies.size ? { Cookie: [...cookies.values()].join("; ") } : {}) } });
      for (const cookie of response.headers.getSetCookie?.() || []) { const value = cookie.split(";")[0]; cookies.set(value.split("=")[0], value); }
      if (response.status >= 300 && response.status < 400) { url = new URL(response.headers.get("location"), url).href; continue; }
      if (!response.ok) throw new Error("O Drive não liberou o arquivo. Confira o compartilhamento público e a permissão de download.");
      if (Number(response.headers.get("content-length") || 0) > limit) throw new Error("Arquivo grande demais para esta importação. Use o aplicativo do Mac ou uma pasta local.");
      const chunks = []; let length = 0;
      for await (const chunk of response.body) {
        length += chunk.length;
        if (length > limit) { await response.body.cancel().catch(() => {}); throw new Error("Arquivo grande demais para esta importação. Use o aplicativo do Mac ou uma pasta local."); }
        chunks.push(Buffer.from(chunk));
      }
      return { bytes: Buffer.concat(chunks), headers: response.headers };
    }
    throw new Error("O Drive não concluiu o download. Tente novamente.");
  };
  return request;
}
async function listPublicDrive(link, options = {}) {
  const root = parseLink(link), request = client(options.fetchImpl);
  const files = [], visited = new Set();
  const walk = async (item, prefix = "") => {
    if (visited.has(item.id)) return;
    visited.add(item.id);
    if (visited.size > 100) throw new Error("Escolha uma pasta menor, com até 100 subpastas.");
    const url = new URL("https://drive.google.com/embeddedfolderview");
    url.searchParams.set("id", item.id);
    if (item.resourceKey) url.searchParams.set("resourcekey", item.resourceKey);
    const result = parseFolder((await request(url.href, 10 * 1024 * 1024)).bytes.toString());
    // The public view can truncate large folders. Refuse a partial sync.
    if (result.entries.length >= 50) throw new Error("Esta pasta pode ter uma lista incompleta no Drive. Divida-a em pastas com menos de 50 itens ou importe links individuais.");
    for (const entry of result.entries) {
      if (entry.folder) await walk(entry, `${prefix}${entry.name}/`);
      else if (/\.(pdf|epub)$/i.test(entry.name)) files.push({ ...entry, displayPath: `${prefix}${entry.name}` });
    }
    return result.name;
  };
  let name;
  if (root.folder) name = await walk(root);
  else {
    const page = (await request(`https://drive.google.com/file/d/${root.id}/view${root.resourceKey ? `?resourcekey=${encodeURIComponent(root.resourceKey)}` : ""}`, 10 * 1024 * 1024)).bytes.toString();
    name = text(page.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/\s*[-–] Google Drive$/, "");
    if (!/\.(pdf|epub)$/i.test(name)) throw new Error("O link não mostra um PDF ou EPUB público acessível.");
    files.push({ ...root, name, displayPath: name });
  }
  return { folder: { id: `drive-${root.id}`, name, link, mode: "drive-public-direct" }, files };
}
async function downloadPublicDrive(file, options = {}) {
  if (!file || !/^[\w-]+$/.test(file.id) || !/\.(pdf|epub)$/i.test(file.name)) throw new Error("Arquivo do Drive inválido.");
  const request = client(options.fetchImpl, options.maxBytes);
  const url = new URL("https://drive.usercontent.google.com/download");
  url.searchParams.set("id", file.id); url.searchParams.set("export", "download");
  if (file.resourceKey) url.searchParams.set("resourcekey", file.resourceKey);
  let result = await request(url.href);
  if (/text\/html/i.test(result.headers.get("content-type") || "")) {
    const html = result.bytes.toString();
    const form = html.match(/<form\b[^>]*action=["']([^"']+)["'][^>]*>([\s\S]*?)<\/form>/i);
    if (!form) throw new Error("O Drive não liberou o download. O arquivo pode estar privado, bloqueado ou com limite de downloads.");
    const confirm = new URL(decode(form[1]), url);
    if (!allowed(confirm.href)) throw new Error("Confirmação de download do Drive inválida.");
    for (const input of form[2].matchAll(/<input\b([^>]+)>/gi)) {
      const name = input[1].match(/\bname=["']([^"']+)["']/i)?.[1];
      const value = input[1].match(/\bvalue=["']([^"']*)["']/i)?.[1];
      if (name && value !== undefined) confirm.searchParams.set(name, decode(value));
    }
    if (confirm.searchParams.get("id") !== file.id) throw new Error("Confirmação não corresponde ao livro selecionado.");
    result = await request(confirm.href);
  }
  const pdf = result.bytes.subarray(0, 1024).includes(Buffer.from("%PDF-"));
  const epub = result.bytes[0] === 0x50 && result.bytes[1] === 0x4b;
  if ((/\.pdf$/i.test(file.name) && !pdf) || (/\.epub$/i.test(file.name) && !epub)) throw new Error("O Drive retornou uma página ou arquivo inválido, não o livro. Confira a permissão de download.");
  return result.bytes;
}
module.exports = { parseLink, parseFolder, listPublicDrive, downloadPublicDrive };
