import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bookFileType,
  bookProgress,
  bookExtent,
  mergeBookMetadata,
  epubReferencePages,
} from "./bookMetadata.js";
import { prepareStudyStateForCloud } from "../services/account-sync.js";

test("book metadata preserves manual names and cover while updating exact PDF count", () => {
  const data = mergeBookMetadata(
    {
      title: "Meu título",
      author: "Meu autor",
      totalPages: 100,
      coverUrl: "custom.jpg",
    },
    {
      title: "PDF",
      author: "Autor",
      totalPages: 3,
      coverUrl: "generated.jpg",
      fileType: "pdf",
      pageCountSource: "pdf",
    },
  );
  assert.equal(data.title, undefined);
  assert.equal(data.author, undefined);
  assert.equal(data.coverUrl, undefined);
  assert.equal(data.totalPages, 3);
  assert.equal(
    mergeBookMetadata(
      { coverUrl: "custom.jpg" },
      { coverUrl: "generated.jpg" },
      { refreshCover: true },
    ).coverUrl,
    "generated.jpg",
  );
});
test("replacement file refreshes imported names and clears invented EPUB page counts", () => {
  const data = mergeBookMetadata(
    {
      title: "Old",
      author: "Autor desconhecido",
      totalPages: 100,
      autoMetadata: { title: "Old" },
    },
    { title: "New", author: "Autor interno", fileType: "epub", totalPages: 0 },
  );
  assert.equal(data.title, "New");
  assert.equal(data.author, "Autor interno");
  assert.equal(data.totalPages, 0);
});
test("EPUB progress uses percentages; missing PDF counts never become NaN", () => {
  assert.equal(bookFileType("book-file://id/My%20Book.EPUB"), "epub");
  assert.equal(bookFileType("/tmp/Meu livro 100% #1.pdf"), "pdf");
  assert.equal(
    bookProgress({
      filePath: "book.epub",
      readPages: 32,
      totalPages: 2,
      lastPosition: { percent: 42.4 },
    }),
    42,
  );
  assert.equal(bookProgress({ totalPages: 0 }), 0);
  assert.equal(bookProgress({ status: "COMPLETED" }), 100);
  assert.equal(bookProgress({ totalPages: 10, readPages: 12 }), 100);
  assert.equal(
    bookExtent({ filePath: "book.epub", totalPages: 99 }),
    "EPUB · leitura em porcentagem",
  );
});
test("only complete numeric EPUB reference page lists are counted", () => {
  assert.equal(epubReferencePages([1, 2, 2, 3]), 3);
  assert.equal(epubReferencePages([1, 3]), 0);
  assert.equal(epubReferencePages([20, 21]), 0);
  assert.equal(epubReferencePages([]), 0);
});
test("browser book references are local assets and are excluded from cloud snapshots", () => {
  const result = prepareStudyStateForCloud({
    books: {
      list: [{ id: "book", filePath: "book-file://id/a.pdf", totalPages: 3 }],
    },
  });
  assert.equal(result.books.list[0].filePath, undefined);
  assert.equal(result.books.list[0].totalPages, 3);
});
