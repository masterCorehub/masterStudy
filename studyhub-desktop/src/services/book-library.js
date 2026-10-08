import { bookFileType, mergeBookMetadata } from "../domain/bookMetadata.js";
import { getLocalFilePath } from "../utils/localFileUrl.js";
import { retainBookFile } from "./book-files.js";

export function nativeFolderFiles(selection) {
  const root = selection.dirPath.replace(/[\\/]+$/, "");
  return selection.filesList.map(file => ({
    ...file,
    source: file.path,
    relativePath: file.path.slice(root.length + 1).replace(/\\/g, "/"),
  }));
}

export function uploadedFolderFiles(files) {
  return Array.from(files, file => ({
    source: file,
    relativePath: (file.webkitRelativePath || file.name).split("/").slice(1).join("/") || file.name,
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
  }));
}

export async function readFolderFiles(folder) {
  if (folder.mode === "desktop") return nativeFolderFiles(await window.studyhubDesktop.scanDirectory(folder.linkedFolderPath));
  const permission = { mode: "read" };
  if (await folder.handle.queryPermission(permission) !== "granted" && await folder.handle.requestPermission(permission) !== "granted") {
    throw new Error("Autorize o acesso à pasta para sincronizar os livros.");
  }
  const files = [];
  const walk = async (directory, prefix = "") => {
    for await (const entry of directory.values()) {
      if (entry.name.startsWith(".") || ["__MACOSX", "node_modules"].includes(entry.name) || /\.app$/i.test(entry.name)) continue;
      const relativePath = `${prefix}${entry.name}`;
      if (entry.kind === "directory") await walk(entry, `${relativePath}/`);
      else if (bookFileType(entry.name)) {
        const file = await entry.getFile();
        files.push({ source: file, name: file.name, relativePath, size: file.size, lastModified: file.lastModified });
      }
    }
  };
  await walk(folder.handle);
  return files;
}

export async function syncBookLibrary(folder, files, {
  getBooks, addBook, updateBook, onProgress = () => {},
  extractMetadata = async (source, name) => (await import("./book-metadata")).extractBookMetadata(source, name),
  retainFile = retainBookFile,
  scanFiles = files,
}) {
  // A Map deduplicates scan results; folder ID + relative path stays stable
  // even when browser uploads receive a new internal storage address.
  const supported = [...new Map(files.filter(file => bookFileType(file.name)).map(file => [file.relativePath, file])).values()];
  const report = { added: 0, updated: 0, unchanged: 0, missing: 0, errors: [], total: supported.length };
  for (const [index, file] of supported.entries()) {
    onProgress({ current: index + 1, total: supported.length, name: file.name });
    const findBook = () => getBooks().find(book =>
      (book.librarySource?.folderId === folder.id && book.librarySource.relativePath === file.relativePath) ||
      (typeof file.source === "string" && getLocalFilePath(book.filePath) === getLocalFilePath(file.source)));
    let existing = findBook();
    const librarySource = { folderId: folder.id, relativePath: file.relativePath, size: file.size, lastModified: file.lastModified };
    const sameFile = existing?.librarySource && existing.librarySource.size === file.size && existing.librarySource.lastModified === file.lastModified;
    if (existing && (sameFile || !existing.librarySource)) {
      if (JSON.stringify(existing.librarySource) !== JSON.stringify(librarySource) || existing.libraryMissing) updateBook(existing.id, { librarySource, libraryMissing: false });
      report.unchanged++;
      continue;
    }
    try {
      // Process sequentially: PDF/EPUB decoding is memory-intensive. A bad
      // file reports its own error while the remaining books still import.
      // Remote libraries download only new/changed files, inside the per-file
      // error boundary, so one failed download does not abort the library.
      const source = file.loadSource ? await file.loadSource() : file.source;
      const metadata = await extractMetadata(source, file.name);
      existing = findBook();
      const filePath = await retainFile(source, existing?.filePath);
      // Another window may have imported the same file during storage I/O.
      // Recheck before the synchronous commit to avoid a second book record.
      existing = findBook();
      const updates = { ...mergeBookMetadata(existing || {}, metadata), filePath, librarySource, libraryMissing: false };
      if (existing) {
        updateBook(existing.id, updates);
        report.updated++;
      } else {
        addBook({ ...updates, id: `book-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`, title: metadata.title || file.name.replace(/\.(pdf|epub)$/i, ""), author: metadata.author || "Autor desconhecido", status: "TO READ", tags: [] });
        report.added++;
      }
    } catch (error) {
      report.errors.push({ name: file.relativePath, message: error.message });
    }
  }
  // An unchecked book is still present at the source. Only a complete scan
  // can determine absence; selection controls which files are processed.
  const present = new Set(scanFiles.filter(file => bookFileType(file.name)).map(file => file.relativePath));
  for (const book of getBooks()) {
    if (book.librarySource?.folderId !== folder.id) continue;
    const missing = !present.has(book.librarySource.relativePath);
    if (missing) report.missing++;
    if (Boolean(book.libraryMissing) !== missing) updateBook(book.id, { libraryMissing: missing });
  }
  return report;
}
