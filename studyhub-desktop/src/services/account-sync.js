import { mergeWaterTrackers } from "../domain/waterTracker.js";

export const STUDY_STATE_SCHEMA_VERSION = 15;

const isPlainObject = (value) =>
  Boolean(value) &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

const clone = (value) => {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
};

const comparable = (value) => {
  if (value === undefined) return "__undefined__";
  return JSON.stringify(value);
};

const equal = (left, right) => comparable(left) === comparable(right);

const canMergeById = (...arrays) => {
  const items = arrays.flatMap((items) => (Array.isArray(items) ? items : []));
  return (
    items.length > 0 &&
    items.every(
      (item) =>
        isPlainObject(item) &&
        item.id !== undefined &&
        item.id !== null &&
        String(item.id) !== "",
    )
  );
};

const keyed = (items = []) =>
  new Map(items.map((item) => [String(item.id), item]));

const itemTimestamp = (value) => {
  if (!isPlainObject(value)) return 0;
  const candidate = value.updatedAt ?? value.updated_at ?? value.createdAt ?? 0;
  if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
  const parsed = Date.parse(candidate);
  return Number.isFinite(parsed) ? parsed : 0;
};

const deletionKey = (type, id, collection = "") => `${type}:${collection}:${id}`;

function latestDeletionTombstones(...states) {
  const latest = new Map();
  for (const state of states) {
    for (const tombstone of state?.entityDeletionTombstones || []) {
      const key = deletionKey(tombstone.entityType, tombstone.entityId, tombstone.collection);
      const previous = latest.get(key);
      if (!previous || itemTimestamp(tombstone) >= itemTimestamp(previous)) latest.set(key, tombstone);
    }
    for (const item of state?.universalTrash || []) {
      const key = deletionKey(item.entityType, item.entityId, item.metadata?.collection || "");
      const previous = latest.get(key);
      if (!previous || Number(item.deletedAt) > Number(previous.deletedAt || 0)) {
        latest.set(key, {
          id: key, entityType: item.entityType, entityId: item.entityId,
          collection: item.metadata?.collection || "", deletedAt: Number(item.deletedAt) || 0,
          restoredAt: Number(previous?.restoredAt) || 0, updatedAt: Number(item.deletedAt) || 0,
        });
      }
    }
    // Older app versions had no durable tombstones. Recover their latest
    // delete/restore actions from the existing activity history.
    for (const event of [...(state?.universalHistory || [])].sort((a, b) => Number(a.timestamp) - Number(b.timestamp))) {
      if (!event?.entityType || !event?.entityId) continue;
      if (!["deleted", "restored", "permanently_deleted"].includes(event.action)) continue;
      const key = deletionKey(event.entityType, event.entityId, event.metadata?.collection || "");
      const previous = latest.get(key) || {
        id: key, entityType: event.entityType, entityId: event.entityId,
        collection: event.metadata?.collection || "", deletedAt: 0, restoredAt: 0, updatedAt: 0,
      };
      const eventAt = Number(event.timestamp) || 0;
      if (eventAt < Number(previous.updatedAt || 0)) continue;
      if (event.action === "restored") previous.restoredAt = eventAt;
      else previous.deletedAt = eventAt;
      previous.updatedAt = Number(event.timestamp) || 0;
      latest.set(key, previous);
    }
  }
  return [...latest.values()];
}

export function applyEntityDeletionTombstones(state = {}, ...otherStates) {
  const latestTombstones = latestDeletionTombstones(state, ...otherStates);
  if (!latestTombstones.length) return state;
  const result = { ...state, entityDeletionTombstones: latestTombstones };
  const deleted = new Set(latestTombstones
    .filter((item) => item.deletedAt > 0 && item.deletedAt > Number(item.restoredAt || 0))
    .map((item) => deletionKey(item.entityType, item.entityId, item.collection || "")));
  if (!deleted.size) return result;
  const remove = (type, collection = "") => (item) => !deleted.has(deletionKey(type, item.id, collection));
  if (state.tasks?.list) result.tasks = { ...state.tasks, list: state.tasks.list.filter(remove("task")) };
  if (state.habits?.list) result.habits = { ...state.habits, list: state.habits.list.filter(remove("habit")) };
  if (state.books?.list) result.books = { ...state.books, list: state.books.list.filter(remove("book")) };
  if (state.studyItems) result.studyItems = state.studyItems.filter(remove("study_item"));
  if (state.notes?.list) result.notes = { ...state.notes, list: state.notes.list.filter(remove("study_item")) };
  if (state.dashboardQuickNotes) result.dashboardQuickNotes = state.dashboardQuickNotes.filter(remove("quick_note"));
  if (state.stickyNotes) result.stickyNotes = state.stickyNotes.filter(remove("sticky_note"));
  if (state.knowledgeItems) result.knowledgeItems = state.knowledgeItems.filter(remove("knowledge"));
  if (state.flashcardDecks) result.flashcardDecks = state.flashcardDecks.filter(remove("flashcard_deck"));
  if (state.journalEntries) result.journalEntries = state.journalEntries.filter(remove("journal"));
  if (state.academic) {
    result.academic = { ...state.academic };
    for (const tombstone of latestTombstones.filter((item) =>
      item.entityType === "academic" && item.collection &&
      item.deletedAt > 0 && item.deletedAt > Number(item.restoredAt || 0)
    )) {
      const value = state.academic[tombstone.collection];
      if (Array.isArray(value)) result.academic[tombstone.collection] = value.filter((item) => String(item.id) !== String(tombstone.entityId));
    }
  }
  return result;
}

function mergeNode(base, local, remote, path, report) {
  if (equal(local, remote)) return clone(local);
  if (equal(local, base)) return clone(remote);
  if (equal(remote, base)) return clone(local);

  if (Array.isArray(local) && Array.isArray(remote)) {
    const baseArray = Array.isArray(base) ? base : [];
    if (canMergeById(baseArray, local, remote)) {
      const baseMap = keyed(baseArray);
      const localMap = keyed(local);
      const remoteMap = keyed(remote);
      const order = [
        ...remote.map((item) => String(item.id)),
        ...local.map((item) => String(item.id)),
      ].filter((id, index, all) => all.indexOf(id) === index);

      return order.flatMap((id) => {
        const merged = mergeNode(
          baseMap.get(id),
          localMap.get(id),
          remoteMap.get(id),
          `${path}[${id}]`,
          report,
        );
        return merged === undefined ? [] : [merged];
      });
    }

    report.conflicts.push(path);
    // Primitive arrays are usually tags, filters or ordered preferences. Keep
    // the local order during a simultaneous edit instead of duplicating values.
    return clone(local);
  }

  if (isPlainObject(local) && isPlainObject(remote)) {
    const localTimestamp = itemTimestamp(local);
    const remoteTimestamp = itemTimestamp(remote);
    if (localTimestamp && remoteTimestamp && localTimestamp !== remoteTimestamp) {
      report.conflicts.push(path);
      return clone(localTimestamp > remoteTimestamp ? local : remote);
    }

    const baseObject = isPlainObject(base) ? base : {};
    const result = {};
    const keys = new Set([
      ...Object.keys(baseObject),
      ...Object.keys(remote),
      ...Object.keys(local),
    ]);
    for (const key of keys) {
      const merged = mergeNode(
        baseObject[key],
        local[key],
        remote[key],
        path ? `${path}.${key}` : key,
        report,
      );
      if (merged !== undefined) result[key] = merged;
    }
    return result;
  }

  // If one side deleted an item while the other edited it, preserve the edit.
  // The user can delete it again, while silently discarding the edited value
  // would be unrecoverable without opening snapshot history.
  if (local === undefined && remote !== undefined) {
    report.conflicts.push(path);
    return clone(remote);
  }
  if (remote === undefined && local !== undefined) {
    report.conflicts.push(path);
    return clone(local);
  }

  report.conflicts.push(path);
  return clone(local);
}

export function serializeStudyState(state = {}) {
  return JSON.parse(
    JSON.stringify(state, (_key, value) =>
      typeof value === "function" ? undefined : value,
    ),
  );
}

const LOCAL_PATH_KEYS = new Set([
  "filePath",
  "localPath",
  "pdfPath",
  "audioPath",
  "videoPath",
  "attachmentPath",
  "linkedFolderPath",
]);

const looksLikeLocalValue = (value) =>
  typeof value === "string" &&
  /^(?:[a-z]:[\\/]|\/|file:|safe-file:|book-file:|data:)/i.test(value.trim());

const stripEmbeddedDataUrls = (value) => {
  if (typeof value !== "string") return value;
  if (/^data:/i.test(value.trim())) return undefined;
  if (!/data:[a-z0-9.+-]+\/[a-z0-9.+-]+(?:;[^,]*)?,/i.test(value)) {
    return value;
  }
  return value.replace(
    /data:[a-z0-9.+-]+\/[a-z0-9.+-]+(?:;[^,]*)?,[a-z0-9+/=_\s%-]+/gi,
    "",
  );
};

export function prepareStudyStateForCloud(state = {}) {
  return JSON.parse(
    JSON.stringify(state, function cloudReplacer(key, value) {
      if (typeof value === "function") return undefined;
      if (key === "fileDataUrl" && typeof value === "string") return undefined;
      if (LOCAL_PATH_KEYS.has(key) && looksLikeLocalValue(value)) return undefined;
      if (
        key === "path" &&
        looksLikeLocalValue(value) &&
        ["file", "local-file", "attachment"].includes(
          String(this?.kind || this?.type || this?.itemType || "").toLowerCase(),
        )
      ) {
        return undefined;
      }
      return stripEmbeddedDataUrls(value);
    }),
  );
}

export function cloudStateSizeBytes(state = {}) {
  const json = JSON.stringify(state);
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(json).byteLength;
  }
  return Buffer.byteLength(json, "utf8");
}

export function mergeStudyStates(base = {}, local = {}, remote = {}) {
  const report = { conflicts: [] };
  const state = mergeNode(base, local, remote, "", report) || {};
  if (local.waterTracker || remote.waterTracker) {
    // Intake from another device must not carry an older goal over a new setting.
    state.waterTracker = mergeWaterTrackers(local.waterTracker, remote.waterTracker);
  }
  Object.assign(state, applyEntityDeletionTombstones(state, base, local, remote));
  // Cloud snapshots omit device files and embedded covers. Absence there is
  // not deletion: retain these fields on surviving books, matched by ID.
  const localBooks = new Map((local.books?.list || []).map(book => [String(book.id), book]));
  for (const book of state.books?.list || []) {
    const previous = localBooks.get(String(book.id));
    if (!previous) continue;
    if (!Object.hasOwn(book, "filePath") && looksLikeLocalValue(previous.filePath)) book.filePath = previous.filePath;
    if (!Object.hasOwn(book, "coverUrl") && /^(?:data:image\/|blob:)/i.test(previous.coverUrl || "")) {
      book.coverUrl = previous.coverUrl;
      book.coverSource = previous.coverSource;
    }
  }
  return {
    state,
    conflicts: [...new Set(report.conflicts.filter(Boolean))],
  };
}

export function getCloudDeviceId() {
  if (typeof window === "undefined") return "server";
  const storageKey = "studyhub.cloud-device-id";
  const existing = window.localStorage.getItem(storageKey);
  if (existing) return existing;
  const generated =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(storageKey, generated);
  return generated;
}
