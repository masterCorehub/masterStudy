export function bookFileType(source) {
  const name = typeof source === "string" ? source : source?.name || "";
  const fileName = /^(?:https?:|book-file:|safe-file:|file:)/i.test(name)
    ? name.split(/[?#]/)[0]
    : name;
  return fileName.match(/\.(pdf|epub)$/i)?.[1].toLowerCase() || "";
}

export function bookProgress(book) {
  if (["DONE", "COMPLETED"].includes(book?.status)) return 100;
  // EPUB locations depend on typography; they are not printed page numbers.
  const value =
    bookFileType(book?.filePath) === "epub"
      ? book?.lastPosition?.percent || 0
      : Number(book?.totalPages) > 0
        ? ((Number(book?.readPages) || 0) / Number(book.totalPages)) * 100
        : 0;
  return Math.round(Math.max(0, Math.min(100, Number(value) || 0)));
}

export function bookExtent(book) {
  if (bookFileType(book?.filePath) === "epub") {
    return book?.pageCountSource === "epub-reference"
      ? `${book.totalPages} páginas de referência`
      : book?.pageCountSource === "manual" && book.totalPages > 0
        ? `${book.totalPages} páginas informadas · EPUB`
        : "EPUB · leitura em porcentagem";
  }
  return Number(book?.totalPages) > 0
    ? `${book.totalPages} páginas`
    : "Páginas não informadas";
}

export function bookProgressLabel(book) {
  return bookFileType(book?.filePath) === "epub"
    ? `${bookProgress(book)}% lido`
    : Number(book?.totalPages) > 0
      ? `${book.readPages || 0} / ${book.totalPages} páginas`
      : "Progresso não informado";
}

export function mergeBookMetadata(
  current,
  metadata,
  { refreshCover = false } = {},
) {
  const previous = current.autoMetadata || {};
  const updates = {
    fileName: metadata.fileName,
    fileType: metadata.fileType,
    pageCountSource: metadata.pageCountSource,
    autoMetadata: {
      title: metadata.title,
      author: metadata.author,
      totalPages: metadata.totalPages,
    },
  };
  for (const field of ["title", "author"]) {
    // Fill missing/previously imported values; preserve names the user edited.
    if (
      !current[field] ||
      current[field] === previous[field] ||
      (field === "author" && current[field] === "Autor desconhecido")
    ) {
      updates[field] = metadata[field] || current[field] || "";
    }
  }
  updates.totalPages =
    metadata.totalPages ||
    (metadata.fileType === "epub" && current.pageCountSource !== "manual"
      ? 0
      : current.totalPages || 0);
  if (
    metadata.coverUrl &&
    (refreshCover || !current.coverUrl || current.coverSource === "file")
  ) {
    updates.coverUrl = metadata.coverUrl;
    updates.coverSource = "file";
  }
  return updates;
}

export function epubReferencePages(pages = []) {
  const values = [
    ...new Set(pages.filter((value) => Number.isInteger(value) && value > 0)),
  ].sort((a, b) => a - b);
  // Only a complete numbered page list gives a defensible reference count.
  return values.length && values.every((page, index) => page === index + 1)
    ? values.length
    : 0;
}
