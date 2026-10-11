import { getVaultForNote } from './vaults.js';

const cleanPath = path => String(path || '').split('/').filter(Boolean).join('/');
const insidePath = (path, root) => path === root || path.startsWith(`${root}/`);

export function buildVaultTree(notes = [], folders = []) {
  const root = [];
  const byPath = new Map();
  const explicit = new Map(folders.map(folder => [`${folder.vaultId || 'global'}:${cleanPath(folder.path)}`, folder]));

  // Ensure ancestors exist before attaching each folder, including empty folders.
  const ensureFolder = (path, vaultId) => {
    const key = `${vaultId}:${path}`;
    if (byPath.has(key)) return byPath.get(key);
    const parts = path.split('/');
    const name = parts.pop();
    const parent = parts.length ? ensureFolder(parts.join('/'), vaultId) : null;
    const folder = {
      id: `folder-${vaultId}-${path}`, ...explicit.get(key),
      name: explicit.get(key)?.name || name, path, vaultId,
      type: 'folder', children: [],
    };
    byPath.set(key, folder);
    (parent?.children || root).push(folder);
    return folder;
  };

  folders.forEach(folder => {
    const path = cleanPath(folder.path);
    if (path) ensureFolder(path, folder.vaultId || 'global');
  });
  const byId = new Map(notes.map(note => [note.id, { ...note, type: 'note', children: [] }]));
  notes.forEach(note => {
    const item = byId.get(note.id);
    const parent = byId.get(note.parentNoteId);
    const visited = new Set([note.id]);
    let ancestor = parent;
    let validParent = Boolean(parent && getVaultForNote(parent) === getVaultForNote(note));
    while (ancestor) {
      if (visited.has(ancestor.id)) { validParent = false; break; }
      visited.add(ancestor.id);
      ancestor = byId.get(ancestor.parentNoteId);
    }
    if (validParent) { parent.children.push(item); return; }
    const path = cleanPath(note.path);
    (path ? ensureFolder(path, getVaultForNote(note)).children : root).push(item);
  });
  const sort = items => {
    items.sort((a, b) => (a.type === b.type ? 0 : a.type === 'folder' ? -1 : 1) ||
      (a.name || a.title || '').localeCompare(b.name || b.title || '', 'pt-BR', { numeric: true }));
    items.forEach(item => sort(item.children));
  };
  sort(root);
  return root;
}

export function collectVaultDeletion({ notes = [], folders = [], targets = [], activeVaultId = 'global' }) {
  const noteIds = new Set();
  const folderIds = new Set();
  const byId = new Map(notes.map(note => [note.id, note]));
  for (const target of targets) {
    if (target.type !== 'folder') { noteIds.add(target.id); continue; }
    const folder = folders.find(item => item.id === target.id);
    const path = cleanPath(target.path || folder?.path);
    const vaultId = target.vaultId || folder?.vaultId || activeVaultId;
    if (!path) continue;
    folders.forEach(item => {
      if ((item.vaultId || 'global') === vaultId && insidePath(cleanPath(item.path), path)) folderIds.add(item.id);
    });
    notes.forEach(item => {
      if (getVaultForNote(item) === vaultId && insidePath(cleanPath(item.path), path)) noteIds.add(item.id);
    });
  }
  // Follow parent IDs too: internal notes can have a missing or outdated path.
  let changed = true;
  while (changed) {
    changed = false;
    notes.forEach(item => {
      const parent = byId.get(item.parentNoteId);
      if (!noteIds.has(item.id) && noteIds.has(item.parentNoteId) &&
          parent && getVaultForNote(parent) === getVaultForNote(item)) {
        noteIds.add(item.id);
        changed = true;
      }
    });
  }
  return { noteIds, folderIds };
}
