import { useSyncExternalStore } from "react";
import { useStudyStore } from "../store/useStore";
import { syncBookLibrary } from "./book-library";
import { saveBookLibraryFolder, saveDriveLibrary } from "./book-files";
import { allBookCategories } from "../domain/bookCategories";

let snapshot = null;
const listeners = new Set();
const publish = value => { snapshot = value; for (const listener of listeners) listener(); };
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export const useBookImportJob = () => useSyncExternalStore(subscribe, () => snapshot, () => null);
export const dismissBookImportJob = () => { if (snapshot?.status !== "running") publish(null); };

export function startBookImport({ folder, files, scanFiles, targetCategoryId, kind }) {
  if (snapshot?.status === "running") throw new Error("Uma importação já está em andamento. Aguarde a conclusão para iniciar outra.");
  if (!files.length) throw new Error("Selecione pelo menos um livro.");
  const base = { name: folder.name, total: files.length, current: 0, status: "running", report: null, error: "" };
  publish(base);
  // This promise belongs to the application, not to the dialog lifecycle.
  // Closing the dialog or changing screens does not stop its processing.
  const completion = (async () => {
    try {
      const report = await syncBookLibrary(folder, files, {
        scanFiles,
        getBooks: () => useStudyStore.getState().books?.list || [],
        addBook: book => {
          const store = useStudyStore.getState();
          const categoryId = allBookCategories(store.bookCategories || []).some(item => item.id === targetCategoryId) ? targetCategoryId : null;
          store.addBook({ ...book, categoryId, categoryAssignmentSource: "manual" });
        },
        updateBook: (id, updates) => useStudyStore.getState().updateBook(id, updates),
        onProgress: progress => publish({ ...base, ...progress }),
      });
      await (kind === "drive" ? saveDriveLibrary : saveBookLibraryFolder)({ ...folder, lastSyncAt: Date.now() });
      publish({ ...base, current: files.length, status: "done", report });
    } catch (error) { publish({ ...snapshot, status: "failed", error: error.message || "Não foi possível concluir a importação." }); }
  })();
  return completion;
}
