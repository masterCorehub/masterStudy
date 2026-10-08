import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from '../../ui/Icon';
import { getNoteTags } from '../../domain/frontmatter';

const TreeItem = ({ 
  item, 
  level, 
  activeNoteId,
  selectedIds,
  onNoteSelect,
  onSelectToggle,
  onClearSelection,
  onContextMenu,
  onMoveItem
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const isFolder = item.type === 'folder';
  const hasChildren = Boolean(item.children?.length);
  useEffect(() => {
    const containsActive = children => children?.some(child => child.id === activeNoteId || containsActive(child.children));
    if (containsActive(item.children)) setIsExpanded(true);
  }, [activeNoteId, item.children]);
  const isActive = !isFolder && item.id === activeNoteId;
  const isSelected = selectedIds?.has(item.id);
  const paddingLeft = `${level * 12 + 12}px`;

  const handleClick = (e) => {
    if (e.ctrlKey || e.metaKey) {
      onSelectToggle?.(item.id);
      return;
    }
    
    if (selectedIds && selectedIds.size > 0) {
      onClearSelection?.();
    }
    
    if (isFolder) {
      setIsExpanded(!isExpanded);
    } else {
      onNoteSelect(item.id);
    }
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    onContextMenu(e, item);
  };

  const handleDragStart = (e) => {
    e.dataTransfer.setData('text/plain', item.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (isFolder) {
      setIsDragOver(true);
      // Optional: Auto-expand folder on hover
      if (!isExpanded) {
        setIsExpanded(true);
      }
    }
  };

  const handleDragLeave = (e) => {
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    if (isFolder) {
      const draggedItemId = e.dataTransfer.getData('text/plain');
      if (draggedItemId && draggedItemId !== item.id) {
        onMoveItem?.(draggedItemId, item.path);
      }
    }
  };

  return (
    <div>
      <div
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex items-center w-full py-1.5 pr-2 group cursor-pointer select-none transition-colors ${
          isActive 
            ? 'bg-[var(--primary)]/10 text-[var(--primary)]' 
            : isSelected
            ? 'bg-[var(--primary)]/20 text-[var(--primary)]'
            : isDragOver
            ? 'bg-[var(--primary)]/30 text-[var(--primary)]'
            : 'text-[var(--on-surface-variant)] hover:bg-[var(--surface-high)] hover:text-[var(--on-surface)]'
        }`}
        style={{ paddingLeft }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        <div className="flex items-center justify-center w-5 h-5 mr-1 shrink-0">
          {isSelected ? (
            <Icon name="check_circle" className="w-4 h-4 text-[var(--primary)]" />
          ) : isFolder ? (
            <motion.div animate={{ rotate: isExpanded ? 90 : 0 }} transition={{ duration: 0.15 }}>
              <Icon name="chevron_right" className="w-4 h-4 opacity-70" />
            </motion.div>
          ) : (
            <Icon 
              name={item.itemType === 'drawing' ? 'draw' : 'description'} 
              className={`w-4 h-4 ${isActive ? 'text-[var(--primary)]' : 'opacity-70 group-hover:opacity-100'}`} 
            />
          )}
        </div>
        
        {isFolder && (
          <Icon 
            name={isExpanded ? 'folder_open' : 'folder'} 
            className="w-4 h-4 mr-2 text-[var(--tertiary)] opacity-80" 
          />
        )}
        
        {!isFolder && hasChildren && <button type="button" aria-label={`Mostrar notas internas de ${item.title}`} aria-expanded={isExpanded} onClick={event => { event.stopPropagation(); setIsExpanded(value => !value); }} className="mr-1"><Icon name={isExpanded ? 'expand_more' : 'chevron_right'} /></button>}
        <span className={`text-sm truncate flex-1 ${isActive ? 'font-medium' : ''}`}>
          {item.name || item.title}
        </span>

        {!isFolder && item.pinned && (
          <Icon name="keep" className="w-3.5 h-3.5 opacity-50 ml-2 shrink-0" />
        )}
      </div>

      <AnimatePresence initial={false}>
        {(isFolder || hasChildren) && isExpanded && item.children && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {item.children.map(child => (
              <TreeItem
                key={child.id}
                item={child}
                level={level + 1}
                activeNoteId={activeNoteId}
                selectedIds={selectedIds}
                onNoteSelect={onNoteSelect}
                onSelectToggle={onSelectToggle}
                onClearSelection={onClearSelection}
                onContextMenu={onContextMenu}
                onMoveItem={onMoveItem}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const VaultExplorer = ({
  notes = [],
  folders = [],
  activeNoteId,
  activeTag = null,
  currentVault = null,
  onOpenVaultSwitcher,
  onTagSelect,
  onNoteSelect,
  onCreateNote,
  onCreateFolder,
  onRenameItem,
  onDeleteItem,
  onDeleteMultipleItems,
  onMoveItem,
  searchQuery = '',
  onSearchChange
}) => {
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const handleSelectToggle = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      
      // Auto-add active note if starting a new selection
      if (next.size === 0 && activeNoteId && id !== activeNoteId) {
        next.add(activeNoteId);
      }
      
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleClearSelection = () => setSelectedIds(new Set());

  // Close context menu on click outside
  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Build tree structure
  const tree = useMemo(() => {
    const root = [];
    const itemsByPath = new Map();
    
    // Add explicitly defined folders (if any)
    folders.forEach(f => {
      const folderItem = { ...f, type: 'folder', children: [] };
      itemsByPath.set(f.path, folderItem);
    });

    // Link explicitly defined folders to their parents or root
    folders.forEach(f => {
      const folderItem = itemsByPath.get(f.path);
      if (f.parentId) {
        const parent = itemsByPath.get(f.parentId);
        if (parent) {
          parent.children.push(folderItem);
        } else {
          root.push(folderItem); // fallback se pai não existir
        }
      } else {
        root.push(folderItem);
      }
    });

    const noteItems = new Map(notes.map(note => [note.id, { ...note, type: 'note', children: [] }]));
    // As subnotas pertencem à árvore da nota principal, não à raiz do Vault.
    notes.forEach(note => {
      const path = note.path || '';
      const noteItem = noteItems.get(note.id);
      const parent = noteItems.get(note.parentNoteId);
      let validParent = Boolean(parent && parent.id !== note.id);
      const visited = new Set([note.id]);
      let ancestor = parent;
      while (ancestor) {
        if (visited.has(ancestor.id)) { validParent = false; break; }
        visited.add(ancestor.id);
        ancestor = noteItems.get(ancestor.parentNoteId);
      }
      if (validParent) { parent.children.push(noteItem); return; }

      if (!path) {
        root.push(noteItem);
      } else {
        const parts = path.split('/');
        let currentPath = '';
        let parentCollection = root;

        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          currentPath = currentPath ? `${currentPath}/${part}` : part;
          
          let folder = itemsByPath.get(currentPath);
          if (!folder) {
            folder = {
              id: `folder-${currentPath}`,
              name: part,
              path: currentPath,
              type: 'folder',
              children: []
            };
            itemsByPath.set(currentPath, folder);
            parentCollection.push(folder);
          }
          
          if (i === parts.length - 1) {
            folder.children.push(noteItem);
          } else {
            parentCollection = folder.children;
          }
        }
      }
    });

    // Sort function: folders first, then alphabetically
    const sortItems = (items) => {
      items.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'folder' ? -1 : 1;
        }
        const nameA = (a.name || a.title || '').toLowerCase();
        const nameB = (b.name || b.title || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });
      items.forEach(item => {
        if (item.children) {
          sortItems(item.children);
        }
      });
    };

    sortItems(root);
    return root;
  }, [notes, folders]);

  // Aggregate tags using getNoteTags
  const tags = useMemo(() => {
    const tagCounts = {};
    notes.forEach(note => {
      const noteTags = getNoteTags(note);
      noteTags.forEach(tag => {
        const t = tag.toLowerCase().trim();
        if (t) {
          tagCounts[t] = (tagCounts[t] || 0) + 1;
        }
      });
    });
    return Object.entries(tagCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [notes]);

  const isFiltering = Boolean((searchQuery && searchQuery.trim()) || (activeTag && activeTag.trim()));

  // Filter notes for flat list if searching or filtering by tag (Obsidian style)
  const displayedNotes = useMemo(() => {
    if (!isFiltering) return [];
    
    const query = (searchQuery || '').trim().toLowerCase();
    const tagFilter = (activeTag || '').trim().toLowerCase().replace(/^#/, '');
    
    // Parse search operators (tag:xxx, #xxx, file:xxx, path:xxx)
    let targetTag = null;
    let targetFile = null;
    let targetPath = null;
    let textQuery = query;

    if (query.startsWith('tag:')) {
      targetTag = query.slice(4).trim().replace(/^#/, '');
      textQuery = '';
    } else if (query.startsWith('#')) {
      targetTag = query.slice(1).trim();
      textQuery = '';
    } else if (query.startsWith('file:')) {
      targetFile = query.slice(5).trim();
      textQuery = '';
    } else if (query.startsWith('path:')) {
      targetPath = query.slice(5).trim();
      textQuery = '';
    }

    const filtered = notes.filter(n => {
      const noteTags = getNoteTags(n).map(t => t.toLowerCase());
      const title = (n.title || '').toLowerCase();
      const content = (n.markdownContent || n.content || '').toLowerCase();
      const path = (n.path || '').toLowerCase();

      // Active tag filter
      if (tagFilter) {
        const matchesActiveTag = noteTags.some(t => t === tagFilter || t.startsWith(`${tagFilter}/`));
        if (!matchesActiveTag) return false;
      }

      // Query tag:xxx or #xxx
      if (targetTag) {
        return noteTags.some(t => t.includes(targetTag));
      }

      // Query file:xxx
      if (targetFile) {
        return title.includes(targetFile);
      }

      // Query path:xxx
      if (targetPath) {
        return path.includes(targetPath);
      }

      // General text search: title, content, path or any tag
      if (textQuery) {
        return (
          title.includes(textQuery) ||
          content.includes(textQuery) ||
          path.includes(textQuery) ||
          noteTags.some(t => t.includes(textQuery))
        );
      }

      return true;
    }).map(n => ({ ...n, type: 'note' }));
    
    return filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  }, [searchQuery, activeTag, notes, isFiltering]);

  const handleContextMenu = (e, item) => {
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      item
    });
  };

  const [rootDragOver, setRootDragOver] = useState(false);

  return (
    <div 
      className="w-[260px] h-full flex flex-col bg-[var(--surface-low)] border-r border-[var(--outline-variant)] select-none"
      onDragOver={(e) => {
        e.preventDefault();
        setRootDragOver(true);
      }}
      onDragLeave={() => setRootDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setRootDragOver(false);
        const draggedItemId = e.dataTransfer.getData('text/plain');
        if (draggedItemId) {
          onMoveItem?.(draggedItemId, "");
        }
      }}
    >
      {/* Top Header & Search */}
      <div className="p-3 border-b border-[var(--outline-variant)]">
        {/* Vault Switcher Bar */}
        {currentVault && (
          <button
            type="button"
            onClick={onOpenVaultSwitcher}
            className="w-full mb-2 p-1.5 rounded-lg bg-[var(--surface-high)] hover:bg-[var(--surface-highest)] border border-[var(--outline-variant)]/60 flex items-center justify-between transition-all group text-left"
            title="Trocar de Vault / Criar Novo Cofre"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div 
                className="w-5 h-5 rounded-md flex items-center justify-center text-white text-[12px] shrink-0"
                style={{ backgroundColor: currentVault.color || "#6366f1" }}
              >
                <Icon name={currentVault.icon || "library_books"} className="text-[13px]" />
              </div>
              <span className="text-xs font-bold text-[var(--on-surface)] truncate">
                {currentVault.name || "Vault Geral"}
              </span>
            </div>
            <div className="flex items-center gap-1 text-[var(--on-surface-variant)] group-hover:text-[var(--on-surface)]">
              <Icon name="unfold_more" className="text-[16px]" />
            </div>
          </button>
        )}

        <div className="relative flex items-center mb-2">
          <Icon name="search" className="absolute w-4 h-4 text-[var(--on-surface-variant)] left-3" />
          <input
            type="text"
            placeholder="Buscar notas (#tag, tag:x)..."
            value={searchQuery}
            onChange={(e) => onSearchChange?.(e.target.value)}
            className="w-full py-1.5 pl-9 pr-7 text-xs bg-[var(--surface-inset)] shadow-neo-inset text-[var(--on-surface)] rounded-full outline-none focus:ring-2 focus:ring-[var(--primary)]/50 placeholder-[var(--on-surface-variant)] transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange?.("")}
              className="absolute right-2.5 text-[var(--on-surface-variant)] hover:text-[var(--on-surface)]"
            >
              <Icon name="close" className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Active Tag Filter Pill */}
        {activeTag && (
          <div className="mb-2 flex items-center justify-between px-2.5 py-1 rounded-md bg-[color-mix(in_srgb,var(--primary)_15%,transparent)] text-[var(--primary)] text-xs font-semibold">
            <span className="flex items-center gap-1 truncate">
              <Icon name="tag" className="text-[14px]" />
              #{activeTag}
            </span>
            <button
              type="button"
              onClick={() => onTagSelect?.(null)}
              className="hover:opacity-75 p-0.5"
              title="Limpar filtro de tag"
            >
              <Icon name="close" className="text-[14px]" />
            </button>
          </div>
        )}
        
        <div className="flex gap-2">
          <button 
            onClick={() => onCreateNote('')}
            className="flex items-center justify-center flex-1 h-8 gap-1 text-sm font-medium transition-colors rounded-md bg-[var(--surface-highest)] hover:bg-[var(--surface-high)] text-[var(--on-surface)]"
            title="Nova Nota"
          >
            <Icon name="note_add" className="w-4 h-4" />
          </button>
          <button 
            onClick={() => onCreateFolder('')}
            className="flex items-center justify-center flex-1 h-8 gap-1 text-sm font-medium transition-colors rounded-md bg-[var(--surface-highest)] hover:bg-[var(--surface-high)] text-[var(--on-surface)]"
            title="Nova Pasta"
          >
            <Icon name="create_new_folder" className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Explorer */}
      <div className={`flex-1 overflow-y-auto scrollbar-thin py-2 ${rootDragOver ? 'bg-[var(--primary)]/5' : ''}`}>
        {isFiltering ? (
          displayedNotes.length === 0 ? (
            <div className="px-4 py-8 text-center text-[var(--on-surface-variant)]">
              <Icon name="search_off" className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Nenhuma nota encontrada.</p>
              {activeTag && (
                <button
                  type="button"
                  onClick={() => onTagSelect?.(null)}
                  className="mt-3 text-xs text-[var(--primary)] font-semibold underline"
                >
                  Limpar filtro #{activeTag}
                </button>
              )}
            </div>
          ) : (
            displayedNotes.map(item => (
              <TreeItem
                key={item.id}
                item={item}
                level={0}
                activeNoteId={activeNoteId}
                selectedIds={selectedIds}
                onNoteSelect={onNoteSelect}
                onSelectToggle={handleSelectToggle}
                onClearSelection={handleClearSelection}
                onContextMenu={(e, item) => setContextMenu({ x: e.clientX, y: e.clientY, item })}
                onMoveItem={onMoveItem}
              />
            ))
          )
        ) : tree.length === 0 ? (
          <div className="px-4 py-8 text-center text-[var(--on-surface-variant)]">
            <Icon name="folder_off" className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhuma nota no vault.</p>
          </div>
        ) : (
          tree.map(item => (
            <TreeItem
              key={item.id}
              item={item}
              level={0}
              activeNoteId={activeNoteId}
              selectedIds={selectedIds}
              onNoteSelect={onNoteSelect}
              onSelectToggle={handleSelectToggle}
              onClearSelection={handleClearSelection}
              onContextMenu={(e, item) => setContextMenu({ x: e.clientX, y: e.clientY, item })}
              onMoveItem={onMoveItem}
            />
          ))
        )}
      </div>

      {/* Bulk Action Bar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-[var(--outline-variant)] bg-[var(--surface-high)] px-3 py-2 flex items-center justify-between overflow-hidden"
          >
            <span className="text-xs font-medium text-[var(--primary)]">{selectedIds.size} selecionados</span>
            <div className="flex gap-2">
              <button 
                onClick={handleClearSelection}
                className="w-7 h-7 rounded flex items-center justify-center text-[var(--on-surface-variant)] hover:bg-[var(--surface-highest)] transition-colors"
                title="Cancelar seleção"
              >
                <Icon name="close" className="w-4 h-4" />
              </button>
              <button 
                onClick={() => {
                  if (onDeleteMultipleItems) {
                    const items = Array.from(selectedIds).map(id => {
                      const note = notes.find(n => n.id === id);
                      if (note) return { id, type: 'note' };
                      const folder = folders.find(f => f.id === id);
                      if (folder) return { id, type: 'folder' };
                      return null;
                    }).filter(Boolean);
                    onDeleteMultipleItems(items);
                  }
                  handleClearSelection();
                }}
                className="w-7 h-7 rounded flex items-center justify-center text-[var(--error)] hover:bg-[var(--error)]/10 transition-colors"
                title="Excluir selecionados"
              >
                <Icon name="delete" className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tags Section */}
      <div className="border-t border-[var(--outline-variant)]">
        <button
          onClick={() => setTagsExpanded(!tagsExpanded)}
          className="flex items-center justify-between w-full p-3 text-sm font-medium hover:bg-[var(--surface-high)] transition-colors text-[var(--on-surface)]"
        >
          <div className="flex items-center gap-2">
            <Icon name="tag" className="w-4 h-4 text-[var(--tertiary)]" />
            <span>Tags ({tags.length})</span>
          </div>
          <motion.div animate={{ rotate: tagsExpanded ? 180 : 0 }}>
            <Icon name="expand_more" className="w-4 h-4" />
          </motion.div>
        </button>
        
        <AnimatePresence>
          {tagsExpanded && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: 'auto' }}
              exit={{ height: 0 }}
              className="overflow-hidden"
            >
              <div className="p-3 pt-0 max-h-[150px] overflow-y-auto scrollbar-thin flex flex-wrap gap-1.5">
                {tags.length === 0 ? (
                  <span className="text-xs text-[var(--on-surface-variant)]">Nenhuma tag utilizada.</span>
                ) : (
                  tags.map(tag => {
                    const isActive = activeTag === tag.name || searchQuery === `#${tag.name}`;
                    return (
                      <button
                        key={tag.name}
                        onClick={() => {
                          if (onTagSelect) {
                            onTagSelect(isActive ? null : tag.name);
                          } else {
                            onSearchChange?.(isActive ? '' : `#${tag.name}`);
                          }
                        }}
                        className={`inline-flex items-center px-2 py-1 text-xs rounded-full transition-colors ${
                          isActive
                            ? 'bg-[var(--primary)] text-[var(--on-primary)] font-bold'
                            : 'bg-[var(--surface-highest)] text-[var(--on-surface)] hover:bg-[color-mix(in_srgb,var(--primary)_20%,transparent)] hover:text-[var(--primary)]'
                        }`}
                      >
                        #{tag.name}
                        <span className={`ml-1.5 text-[10px] ${isActive ? 'opacity-90' : 'opacity-60'}`}>{tag.count}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Context Menu Dropdown */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            style={{ top: contextMenu.y, left: contextMenu.x }}
            className="fixed z-50 min-w-[160px] py-1 bg-[var(--surface)] border border-[var(--outline-variant)] rounded-lg shadow-neo-raised overflow-hidden"
          >
            <button
              onClick={() => {
                onRenameItem?.(contextMenu.item.id, contextMenu.item.name || contextMenu.item.title);
                setContextMenu(null);
              }}
              className="flex items-center w-full px-4 py-2 text-sm text-left hover:bg-[var(--surface-high)] text-[var(--on-surface)]"
            >
              <Icon name="edit" className="w-4 h-4 mr-2 opacity-70" />
              Renomear
            </button>
            <button
              onClick={() => {
                onDeleteItem?.(contextMenu.item.id, contextMenu.item.type);
                setContextMenu(null);
              }}
              className="flex items-center w-full px-4 py-2 text-sm text-left text-[var(--error)] hover:bg-[var(--error)]/10"
            >
              <Icon name="delete" className="w-4 h-4 mr-2 opacity-70" />
              Excluir
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default VaultExplorer;
