const DATABASE_NAME = "studyhub-language-lab";
const DATABASE_VERSION = 1;
const STORE_NAME = "transcripts";

let databasePromise = null;

function openDatabase() {
  if (databasePromise) return databasePromise;
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("O armazenamento local de transcrições não está disponível."));
  }

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => {
      databasePromise = null;
      reject(request.error || new Error("Não foi possível abrir o armazenamento de transcrições."));
    });
    request.addEventListener("blocked", () => {
      databasePromise = null;
      reject(new Error("O armazenamento de transcrições está bloqueado por outra janela."));
    });
  });
  return databasePromise;
}

function runTransaction(mode, operation) {
  return openDatabase().then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    let result;
    try {
      result = operation(store);
    } catch (error) {
      reject(error);
      return;
    }
    transaction.addEventListener("complete", () => resolve(result?.result));
    transaction.addEventListener("abort", () => reject(
      transaction.error || new Error("A operação com a transcrição foi cancelada."),
    ));
    transaction.addEventListener("error", () => reject(
      transaction.error || new Error("Não foi possível salvar a transcrição localmente."),
    ));
  }));
}

export function getTranscriptStorageKey(lessonId) {
  const normalizedLessonId = String(lessonId || "").trim();
  return normalizedLessonId ? `lesson:${normalizedLessonId}` : "";
}

export async function saveTranscriptRecord(key, segments, metadata = {}) {
  if (!key) throw new Error("A aula não possui um identificador para salvar a transcrição.");
  const record = {
    key,
    segments,
    metadata,
    updatedAt: Date.now(),
  };
  await runTransaction("readwrite", (store) => store.put(record));
  return record;
}

export async function loadTranscriptRecord(key) {
  if (!key) return null;
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(key);
    request.addEventListener("success", () => resolve(request.result || null));
    request.addEventListener("error", () => reject(
      request.error || new Error("Não foi possível carregar a transcrição local."),
    ));
  });
}
