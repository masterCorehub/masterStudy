import { useEffect, useRef, useState } from "react";
import { useStudyStore } from "../../store/useStore";

const pendingExtractions = new Map();

function recoverCover(filePath) {
  // Library cards can show the same book twice. Share only in-flight reads.
  if (!pendingExtractions.has(filePath)) {
    const request = import("../../services/book-metadata")
      .then(module => module.extractBookMetadata(filePath))
      .finally(() => pendingExtractions.delete(filePath));
    pendingExtractions.set(filePath, request);
  }
  return pendingExtractions.get(filePath);
}

export function BookCover({ book, className, alt = "Capa", children }) {
  const [failedUrl, setFailedUrl] = useState(null);
  const lastAttempt = useRef(null);
  useEffect(() => {
    const needsRecovery = !book.coverUrl || book.coverUrl.startsWith("blob:") || failedUrl === book.coverUrl;
    if (!needsRecovery || !book.filePath || book.coverSource === "manual") return;
    const key = JSON.stringify([book.id, book.filePath, book.coverUrl]);
    if (lastAttempt.current === key) return;
    lastAttempt.current = key;
    // Read the file asynchronously; discard the result if the user changed
    // the file or selected a different cover while extraction was running.
    recoverCover(book.filePath).then(metadata => {
      const store = useStudyStore.getState();
      const current = store.books?.list?.find(item => item.id === book.id);
      if (!metadata.coverUrl || !current || current.filePath !== book.filePath || current.coverUrl !== book.coverUrl || current.coverSource === "manual") return;
      store.updateBook(book.id, { coverUrl: metadata.coverUrl, coverSource: "file" });
    }).catch(() => {
      // Missing files or EPUBs without a cover keep the normal placeholder.
      // Do not retry endlessly or erase an existing image on a failed read.
    });
  }, [book.id, book.filePath, book.coverUrl, book.coverSource, failedUrl]);

  return book.coverUrl && failedUrl !== book.coverUrl
    ? <img src={book.coverUrl} alt={alt} className={className} onError={() => setFailedUrl(book.coverUrl)} />
    : children;
}
