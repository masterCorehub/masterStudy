import { getLocalFilePath, getLocalFileUrl } from "../utils/localFileUrl.js";

const FILE_PREFIX = "book-file://";
export const isStoredBookFile = (path) =>
  String(path || "").startsWith(FILE_PREFIX);

async function withBookFiles(action, mode = "readonly") {
  // IndexedDB stores binary files without filling the small localStorage quota.
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open("masterStudy-book-files", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("files");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("Não foi possível abrir o armazenamento dos livros."));
  });
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction("files", mode);
      const request = action(transaction.objectStore("files"));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = transaction.onabort = () =>
        reject(
          new Error("Não foi possível guardar o arquivo neste navegador."),
        );
    });
  } finally {
    database.close();
  }
}

export async function retainBookFile(source, previousPath) {
  if (typeof source === "string") return source;
  // getRandomValues also works in local previews where randomUUID is unavailable.
  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const path = isStoredBookFile(previousPath) ? previousPath : `${FILE_PREFIX}${id}/${encodeURIComponent(source.name)}`;
  await withBookFiles((store) => store.put(source, path), "readwrite");
  return path;
}

// Directory handles use IndexedDB structured cloning, not JSON. The link is
// device-specific and never becomes part of account/cloud snapshots.
export const loadBookLibraryFolder = () => withBookFiles(store => store.get("library-folder"));
export const saveBookLibraryFolder = (folder) => withBookFiles(store => store.put(folder, "library-folder"), "readwrite");
export const loadDriveLibrary = () => withBookFiles(store => store.get("drive-library"));
export const saveDriveLibrary = (library) => withBookFiles(store => store.put(library, "drive-library"), "readwrite");

export async function readBookBytes(source) {
  if (source instanceof Blob) return new Uint8Array(await source.arrayBuffer());
  if (isStoredBookFile(source)) {
    const file = await withBookFiles((store) => store.get(source));
    if (!file)
      throw new Error(
        "Este arquivo não está neste navegador. Vincule o PDF ou EPUB novamente.",
      );
    return new Uint8Array(await file.arrayBuffer());
  }
  const localPath = getLocalFilePath(source);
  if (localPath && window.studyhubDesktop?.readFileBinary) {
    const binary = await window.studyhubDesktop.readFileBinary(localPath);
    if (binary instanceof ArrayBuffer) return new Uint8Array(binary);
    if (ArrayBuffer.isView(binary))
      return new Uint8Array(
        binary.buffer,
        binary.byteOffset,
        binary.byteLength,
      );
    throw new Error("Não foi possível ler o arquivo selecionado.");
  }
  const response = await fetch(getLocalFileUrl(source));
  if (!response.ok)
    throw new Error("Não foi possível acessar o arquivo do livro.");
  return new Uint8Array(await response.arrayBuffer());
}
