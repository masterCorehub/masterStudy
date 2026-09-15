import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStudyStore } from "../store/useStore";
import { Icon } from "../ui/Icon";
import { SCREEN_IDS } from "../app/screenIds";

import { RichTextEditor } from "../components/RichTextEditor";
import { markdownToNoteHtml } from "../domain/aiStudio";
import { VaultExplorer } from "../components/notes/VaultExplorer";
import { EditorTabs } from "../components/notes/EditorTabs";
import { shortcutLabel } from "../utils/keyboardShortcuts";
import { GraphView } from "../components/notes/GraphView";
import { BacklinksPanel } from "../components/notes/BacklinksPanel";
import { TagsPanel } from "../components/notes/TagsPanel";
import { QuickSwitcher } from "../components/notes/QuickSwitcher";
import { VaultSwitcherModal } from "../components/notes/VaultSwitcherModal";

// Lógica de domínio
import { 
  extractAllTags, 
  stringifyFrontmatter, 
  parseFrontmatter,
  getNoteTags
} from "../domain/frontmatter";
import { 
  getAllVaults, 
  filterNotesByVault, 
  filterFoldersByVault, 
  getVaultForNote 
} from "../domain/vaults";
import { extractWikilinks, buildLinkGraph } from "../domain/wikilinks";
import { markdownToHtml, htmlToMarkdown } from "../domain/markdownUtils";

export function NotesScreen({ onNavigate }) {
  const store = useStudyStore();
  const [editorView, setEditorView] = useState(null);
  const [showQuickSwitcher, setShowQuickSwitcher] = useState(false);
  const [isVaultSwitcherOpen, setIsVaultSwitcherOpen] = useState(false);
  
  // Estado local para o conteúdo do editor da aba atual
  const [currentContent, setCurrentContent] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  
  // Custom prompt modal state to replace window.prompt
  const [promptDialog, setPromptDialog] = useState(null); // { title, defaultValue, onConfirm }
  const [confirmDialog, setConfirmDialog] = useState(null); // { title, message, onConfirm }
  
  // Sidebar state
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const lastNavigatedNoteIdRef = useRef(null);

  // Desestruturação segura do store
  const studyItems = store.studyItems || [];
  const vaultFolders = store.vaultFolders || [];
  const editorViewMode = store.editorViewMode || "live";
  const activeSidePanel = store.activeSidePanel || "backlinks";
  const vaultSearchQuery = store.vaultSearchQuery || "";
  const activeTag = store.activeTag || null;
  const activeVaultId = store.activeVaultId || "global";
  const activeTabId = store.activeTabId;
  const customVaults = store.customVaults || [];
  const academicData = store.academic || {};
  const courses = store.courses || [];

  // Lista de todos os vaults (Geral, Disciplinas, Cursos, Personalizados)
  const allVaults = useMemo(() => {
    return getAllVaults({
      academic: academicData,
      courses,
      customVaults,
      studyItems,
    });
  }, [academicData, courses, customVaults, studyItems]);

  const currentVault = useMemo(() => {
    return (
      allVaults.find((v) => v.id === activeVaultId) ||
      allVaults[0] || {
        id: "global",
        name: "Vault Geral",
        icon: "folder",
        type: "global",
      }
    );
  }, [allVaults, activeVaultId]);

  // Filtra todas as notas do sistema
  const allNotes = useMemo(() => {
    return studyItems.filter(
      (item) => item.itemType === "note" || item.itemType === "drawing" || item.type === "note"
    );
  }, [studyItems]);

  // Filtra apenas as notas pertencentes ao vault ativo
  const vaultNotes = useMemo(() => {
    return filterNotesByVault(allNotes, activeVaultId);
  }, [allNotes, activeVaultId]);

  // Filtra as abas abertas pertencentes ao vault ativo
  const openTabs = useMemo(() => {
    const rawTabs = (store.openTabs || []).filter(t => t && t.id);
    if (activeVaultId === "all") return rawTabs;
    return rawTabs.filter(tab => {
      const noteItem = studyItems.find(n => n.id === tab.id);
      if (!noteItem) return false;
      const noteVaultId = getVaultForNote(noteItem);
      return noteVaultId === activeVaultId;
    });
  }, [store.openTabs, activeVaultId, studyItems]);

  // Filtra as pastas pertencentes ao vault ativo
  const displayedVaultFolders = useMemo(() => {
    return filterFoldersByVault(vaultFolders, activeVaultId);
  }, [vaultFolders, activeVaultId]);

  const activeNote = useMemo(() => {
    if (!activeTabId) return null;
    const note = allNotes.find((n) => n.id === activeTabId) || null;
    if (!note) return null;
    if (activeVaultId === "all") return note;
    const noteVaultId = getVaultForNote(note);
    return noteVaultId === activeVaultId ? note : null;
  }, [allNotes, activeTabId, activeVaultId]);

  // Extrai todas as tags do vault ativo para autocomplete e painéis
  const allVaultTags = useMemo(() => {
    const set = new Set();
    vaultNotes.forEach((note) => {
      const content =
        note.id === activeNote?.id
          ? currentContent
          : note.markdownContent || note.content;
      const noteTags = getNoteTags(note, content);
      noteTags.forEach((t) => set.add(t));
    });
    return Array.from(set).sort();
  }, [vaultNotes, activeNote?.id, currentContent]);

  // Calcula arestas do grafo baseadas em wikilinks e tags do vault ativo
  const graphEdges = useMemo(() => {
    const edges = [];
    vaultNotes.forEach(sourceNote => {
      const content = sourceNote.markdownContent || sourceNote.content;
      if (!content || typeof content !== 'string') return;
      
      const matches = [...content.matchAll(/\[\[(.*?)\]\]/g)];
      matches.forEach(match => {
        const targetTitle = match[1];
        const targetNote = vaultNotes.find(n => n.title?.toLowerCase() === targetTitle.toLowerCase());
        if (targetNote && targetNote.id !== sourceNote.id) {
          edges.push({ source: sourceNote.id, target: targetNote.id });
        }
      });
    });
    return edges;
  }, [vaultNotes]);

  // Sincroniza navegação externa (activeNoteId) abrindo a aba e trocando de vault se necessário
  useEffect(() => {
    if (store.activeNoteId && store.activeNoteId !== lastNavigatedNoteIdRef.current) {
      lastNavigatedNoteIdRef.current = store.activeNoteId;
      const target = studyItems.find((n) => n.id === store.activeNoteId);
      if (target) {
        const noteVaultId = getVaultForNote(target);
        if (noteVaultId && noteVaultId !== activeVaultId && activeVaultId !== "all") {
          store.setActiveVaultId(noteVaultId);
        }
        if (store.activeNoteId !== activeTabId) {
          store.openTab(target);
        }
      }
    }
  }, [store.activeNoteId, activeTabId, studyItems, activeVaultId]);

  const handleSelectVault = (vId) => {
    lastNavigatedNoteIdRef.current = null;
    store.setActiveVaultId(vId);

    // Checa se há abas abertas pertencentes ao novo vault
    const tabsInVault = (store.openTabs || []).filter((tab) => {
      const noteItem = studyItems.find((n) => n.id === tab.id);
      if (!noteItem) return false;
      const nVaultId = getVaultForNote(noteItem);
      return vId === "all" || nVaultId === vId;
    });

    if (tabsInVault.length > 0) {
      const firstTab = studyItems.find((n) => n.id === tabsInVault[0].id);
      if (firstTab) {
        store.openTab(firstTab);
      }
    } else {
      store.setActiveTabId(null);
    }
  };

  // Carrega conteúdo ao trocar de aba
  useEffect(() => {
    if (activeNote) {
      let content = activeNote.content || activeNote.markdownContent || "";
      if (typeof content === "string" && content.trim() && !content.trim().startsWith("<")) {
        content = markdownToNoteHtml(content);
      }
      setCurrentContent(content);
    } else {
      setCurrentContent("");
    }
  }, [activeTabId, activeNote?.id]);

  // Atalhos de teclado globais
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Cmd/Ctrl+O para Quick Switcher
      if ((e.ctrlKey || e.metaKey) && e.key === "o") {
        e.preventDefault();
        setShowQuickSwitcher((v) => !v);
      }
      // Cmd/Ctrl+S para salvar
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
      // Cmd/Ctrl+W para fechar aba
      if ((e.ctrlKey || e.metaKey) && e.key === "w") {
        e.preventDefault();
        if (activeTabId) store.closeTab(activeTabId);
      }
      // F2 para renomear
      if (e.key === "F2" && activeNote) {
        e.preventDefault();
        const newTitle = prompt("Novo título:", activeNote.title);
        if (newTitle && newTitle.trim()) {
          store.updateStudyItem(activeNote.id, { title: newTitle.trim() });
          store.updateTabTitle(activeNote.id, newTitle.trim());
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTabId, activeNote, currentContent]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleSave = useCallback(() => {
    if (!activeNote) return;
    store.updateStudyItem(activeNote.id, {
      content: currentContent,
      markdownContent: currentContent,
      updatedAt: Date.now(),
    });
    store.setTabDirty(activeNote.id, false);
  }, [activeNote, currentContent, store]);

  const handleContentChange = useCallback((newHtml) => {
    setCurrentContent(newHtml);
    if (activeNote?.id) {
      store.updateStudyItem(activeNote.id, {
        content: newHtml,
        markdownContent: newHtml,
        updatedAt: Date.now(),
      });
      store.setTabDirty(activeNote.id, false);
    }
  }, [activeNote?.id, store]);

  const handleDrawingsChange = useCallback((newDrawings) => {
    if (activeNote?.id) {
      store.updateStudyItem(activeNote.id, {
        drawings: newDrawings,
        updatedAt: Date.now(),
      });
    }
  }, [activeNote?.id, store]);

  // Autosave com debounce (2 segundos após parar de digitar)
  useEffect(() => {
    if (!activeNote || !store.openTabs.find(t => t.id === activeNote.id)?.isDirty) return;

    const timer = setTimeout(() => {
      handleSave();
    }, 2000);

    return () => clearTimeout(timer);
  }, [currentContent, activeNote, handleSave, store.openTabs]);

  const handleCreateNote = useCallback((folderPath = "") => {
    setPromptDialog({
      title: "Nome da nota:",
      defaultValue: "Nova Nota",
      onConfirm: (noteTitle) => {
        if (!noteTitle) return;
        const newNoteId = `note-${Date.now()}`;
        const newNote = {
          id: newNoteId,
          title: noteTitle,
          itemType: "note",
          path: typeof folderPath === "string" ? folderPath : "",
          markdownContent: "",
          vaultId: activeVaultId,
          academicSubjectId: currentVault?.subjectId || null,
          sourceCourseId: currentVault?.courseId || null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        store.addStudyItem(newNote);
        store.openTab(newNote);
      }
    });
  }, [store, activeVaultId, currentVault]);

  const handleCreateFolder = useCallback((parentPath = "") => {
    setPromptDialog({
      title: "Nome da nova pasta:",
      defaultValue: "Nova Pasta",
      onConfirm: (folderName) => {
        if (!folderName) return;
        store.addVaultFolder({
          name: folderName,
          path: typeof parentPath === "string" && parentPath ? `${parentPath}/${folderName}` : folderName,
          parentId: typeof parentPath === "string" && parentPath ? parentPath : null,
          vaultId: activeVaultId,
        });
      }
    });
  }, [store, activeVaultId]);

  const handleRenameItem = useCallback((id, oldName) => {
    setPromptDialog({
      title: "Renomear para:",
      defaultValue: oldName || "",
      onConfirm: (newName) => {
        if (!newName || newName === oldName) return;
        const isFolder = vaultFolders.some(f => f.id === id);
        if (isFolder) {
          store.renameVaultFolder(id, newName);
        } else {
          store.updateStudyItem(id, { title: newName });
          store.updateTabTitle(id, newName);
        }
      }
    });
  }, [vaultFolders, store]);

  const [dontAskDeleteAgain, setDontAskDeleteAgain] = useState(false);

  const handleDeleteItem = useCallback((id, type) => {
    const executeDelete = () => {
      if (type === "folder") {
        store.deleteVaultFolder(id);
      } else {
        store.deleteNote(id);
        store.closeTab(id);
      }
    };

    if (store.appSettings?.suppressDeleteConfirmation) {
      executeDelete();
      return;
    }

    setDontAskDeleteAgain(false);
    setConfirmDialog({
      title: "Confirmar Exclusão",
      message: type === "folder"
        ? "Tem certeza que deseja excluir esta pasta e suas notas?"
        : "Tem certeza que deseja excluir esta nota?",
      onConfirm: executeDelete,
    });
  }, [store]);

  const handleDeleteMultipleItems = useCallback((items) => {
    // items is an array of { id, type }
    if (!items || items.length === 0) return;
    
    const executeDelete = () => {
      const ids = items.map(i => i.id);
      const types = items.map(i => i.type);
      store.deleteMultipleItems(ids, types);
      items.forEach((item) => {
        if (item.type !== "folder") {
          store.closeTab(item.id);
        }
      });
    };

    if (store.appSettings?.suppressDeleteConfirmation) {
      executeDelete();
      return;
    }

    setDontAskDeleteAgain(false);
    setConfirmDialog({
      title: "Excluir Múltiplos",
      message: `Tem certeza que deseja excluir os ${items.length} itens selecionados?`,
      onConfirm: executeDelete,
    });
  }, [store]);

  const handleWikilinkClick = useCallback((targetTitle) => {
    // Busca a nota pelo título (case insensitive)
    const target = allNotes.find(n => n.title?.toLowerCase() === targetTitle.toLowerCase());
    if (target) {
      store.openTab(target);
    } else {
      // Cria a nota silenciosamente sem a confirmação feia
      const newNoteId = `note-${Date.now()}`;
      const newNote = {
        id: newNoteId,
        title: targetTitle,
        itemType: "note",
        path: "",
        markdownContent: "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      store.addStudyItem(newNote);
      store.openTab(newNote);
    }
  }, [allNotes, store]);

  // ─── Renderização Principal ─────────────────────────────────────────────

  return (
    <div className="flex w-full h-full bg-[var(--background)] text-[var(--on-surface)] overflow-hidden relative">
      
      {/* Custom Prompt Modal */}
      {promptDialog && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-[var(--surface)] p-6 rounded-2xl shadow-xl w-full max-w-sm border border-[var(--outline-variant)]">
            <h3 className="text-lg font-bold mb-4">{promptDialog.title}</h3>
            <input 
              type="text"
              autoFocus
              className="w-full bg-[var(--background)] border border-[var(--outline)] rounded-lg p-3 outline-none focus:border-[var(--primary)] mb-6"
              defaultValue={promptDialog.defaultValue}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  promptDialog.onConfirm(e.target.value);
                  setPromptDialog(null);
                } else if (e.key === 'Escape') {
                  setPromptDialog(null);
                }
              }}
              id="custom-prompt-input"
            />
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setPromptDialog(null)}
                className="px-4 py-2 rounded-lg text-[var(--on-surface-variant)] hover:bg-[var(--surface-high)] font-medium"
              >
                Cancelar
              </button>
              <button 
                onClick={() => {
                  const val = document.getElementById('custom-prompt-input').value;
                  promptDialog.onConfirm(val);
                  setPromptDialog(null);
                }}
                className="px-4 py-2 rounded-lg bg-[var(--primary)] text-[var(--on-primary)] font-bold hover:brightness-110"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Confirm Modal com Opção de Não Perguntar Novamente */}
      {confirmDialog && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-[var(--surface)] p-6 rounded-2xl shadow-xl w-full max-w-sm border border-[var(--outline-variant)] text-[var(--on-surface)]">
            <h3 className="text-lg font-bold mb-2">{confirmDialog.title}</h3>
            <p className="text-[var(--on-surface-variant)] text-sm mb-4 leading-relaxed">{confirmDialog.message}</p>
            
            <label className="flex items-center gap-2.5 mb-6 text-xs text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] cursor-pointer select-none">
              <input 
                type="checkbox" 
                checked={dontAskDeleteAgain} 
                onChange={(e) => setDontAskDeleteAgain(e.target.checked)}
                className="w-4 h-4 rounded text-[var(--primary)] border-[var(--outline-variant)] accent-[var(--primary)] cursor-pointer"
              />
              <span>Não mostrar esta confirmação novamente</span>
            </label>

            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 rounded-xl text-[var(--on-surface-variant)] hover:bg-[var(--surface-high)] font-medium text-xs transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={() => {
                  if (dontAskDeleteAgain) {
                    store.updateAppSettings?.({ suppressDeleteConfirmation: true });
                  }
                  confirmDialog.onConfirm();
                  setConfirmDialog(null);
                }}
                className="px-4 py-2 rounded-xl bg-[var(--error)] text-white font-bold text-xs hover:brightness-110 shadow-sm transition-all"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. Left Sidebar: Vault Explorer */}
      {isLeftSidebarOpen ? (
        <div className="w-[260px] h-full flex-shrink-0 border-r border-[var(--outline-variant)] bg-[var(--surface-lowest)] flex flex-col transition-all">
          <div className="p-3 border-b border-[var(--outline-variant)] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-1.5 text-[var(--primary)] font-bold text-xs">
              <Icon name="library_books" className="text-[16px]" />
              <span>VAULT</span>
            </div>
            <button 
              onClick={() => setIsLeftSidebarOpen(false)}
              className="w-7 h-7 rounded hover:bg-[var(--surface-high)] flex items-center justify-center text-[var(--on-surface-variant)] transition-colors"
              title="Recolher menu lateral"
            >
              <Icon name="menu_open" className="text-[18px]" />
            </button>
          </div>
        
        <div className="flex-1 overflow-hidden">
          <VaultExplorer
            notes={vaultNotes}
            folders={displayedVaultFolders}
            activeNoteId={activeTabId}
            activeTag={activeTag}
            currentVault={currentVault}
            onOpenVaultSwitcher={() => setIsVaultSwitcherOpen(true)}
            onTagSelect={(tag) => store.setActiveTag(tag)}
            onNoteSelect={(id) => {
              const note = allNotes.find(n => n.id === id);
              if (note) store.openTab(note);
            }}
            onCreateNote={handleCreateNote}
            onCreateFolder={handleCreateFolder}
            onRenameItem={handleRenameItem}
            onDeleteItem={handleDeleteItem}
            onDeleteMultipleItems={handleDeleteMultipleItems}
            onMoveItem={store.moveNoteToFolder}
            searchQuery={store.vaultSearchQuery || ''}
            onSearchChange={store.setVaultSearchQuery}
          />
        </div>
      </div>
      ) : (
        <div className="w-12 h-full flex-shrink-0 border-r border-[var(--outline-variant)] bg-[var(--surface-lowest)] flex flex-col items-center py-3 gap-2 transition-all">
          <button 
            onClick={() => setIsLeftSidebarOpen(true)}
            className="w-8 h-8 rounded hover:bg-[var(--surface-high)] flex items-center justify-center text-[var(--on-surface-variant)] transition-colors"
            title="Expandir menu lateral"
          >
            <Icon name="menu" className="text-[20px]" />
          </button>
        </div>
      )}

      {/* 2. Middle: Editor Workspace */}
      <div className="flex-1 flex flex-col min-w-0 bg-[var(--background)] relative">
        
        {/* Workspace Header / Tabs */}
        {openTabs.length > 0 ? (
          <div className="flex flex-col shrink-0">
            <EditorTabs
              tabs={openTabs}
              activeTabId={activeTabId}
              onTabSelect={(id) => {
                if (id === "__new__") {
                  handleCreateNote();
                } else {
                  const note = allNotes.find(n => n.id === id);
                  store.openTab(note || { id });
                }
              }}
              onTabClose={store.closeTab}
              onTabReorder={store.reorderTabs}
              onTabPin={store.toggleTabPin}
            />
            
            {/* Note Sub-header */}
            {activeNote && (
              <div className="h-10 border-b border-[var(--outline-variant)] flex items-center justify-between px-4 bg-[var(--surface-lowest)] shrink-0">
                <div className="flex items-center gap-2">
                  <Icon name="description" className="text-sm text-[var(--primary)]" />
                  <span className="text-xs font-bold truncate max-w-[300px]">
                    {activeNote.title || "Sem título"}
                  </span>
                  {activeNote.path && (
                    <span className="text-[11px] text-[var(--on-surface-variant)] opacity-60 truncate max-w-[200px]">
                      • {activeNote.path}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-[var(--on-surface-variant)] opacity-70 flex items-center gap-1">
                    <Icon name="check_circle" className="text-xs text-emerald-500" />
                    Salvo
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Empty Workspace */
          <div className="flex-1 flex flex-col items-center justify-center text-[var(--on-surface-variant)] opacity-50">
            <Icon name="note_stack" className="text-7xl mb-6 opacity-30" />
            <h2 className="text-xl font-bold mb-2 text-[var(--on-surface)]">Nenhuma nota aberta</h2>
            <p className="text-sm">Selecione uma nota na barra lateral ou crie uma nova.</p>
            <div className="mt-8 flex gap-4 flex-wrap justify-center">
              <button 
                onClick={() => handleCreateNote()}
                className="px-6 py-2 rounded-xl bg-[var(--primary)] text-[var(--on-primary)] font-semibold shadow-md hover:brightness-110 transition-all opacity-100"
              >
                Criar nota
              </button>
              <button 
                onClick={() => setShowQuickSwitcher(true)}
                className="px-6 py-2 rounded-xl bg-[var(--surface-high)] text-[var(--on-surface)] font-medium border border-[var(--outline-variant)] hover:bg-[var(--surface-highest)] transition-all opacity-100 flex items-center gap-2"
              >
                <Icon name="search" />
                Abrir nota ({shortcutLabel("Mod+O")})
              </button>
            </div>
          </div>
        )}

        {/* Editor Content Area */}
        {activeNote && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative bg-[var(--surface)]">
            <RichTextEditor
              key={activeNote.id}
              content={currentContent}
              drawings={activeNote.drawings || []}
              onDrawingsChange={handleDrawingsChange}
              onChange={handleContentChange}
              documentMode={true}
              placeholder="Comece a estruturar suas ideias... Digite # para títulos, - para listas ou / para inserir blocos..."
            />
          </div>
        )}
      </div>

      {/* 3. Right Sidebar: Info / Graph / Backlinks */}
      {isRightSidebarOpen ? (
        <div className="w-[300px] h-full flex-shrink-0 border-l border-[var(--outline-variant)] bg-[var(--surface-lowest)] flex flex-col transition-all">
          {/* Right Sidebar Tabs */}
          <div className="flex items-center h-12 border-b border-[var(--outline-variant)] shrink-0 px-2">
            <button
              onClick={() => setIsRightSidebarOpen(false)}
              className="w-8 h-8 rounded hover:bg-[var(--surface-high)] flex items-center justify-center text-[var(--on-surface-variant)] transition-colors mr-1"
              title="Recolher painel direito"
            >
              <Icon name="last_page" className="text-[20px]" />
            </button>
            <div className="flex items-center justify-around flex-1">
              {[
                { id: "backlinks", icon: "link", title: "Backlinks" },
                { id: "tags", icon: "tag", title: "Tags" },
                { id: "graph", icon: "hub", title: "Grafo Local" }
              ].map(panel => (
                <button
                  key={panel.id}
                  onClick={() => store.setActiveSidePanel(panel.id)}
                  title={panel.title}
                  className={`
                    w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200
                    ${activeSidePanel === panel.id
                      ? "bg-[color-mix(in_srgb,var(--primary)_15%,transparent)] text-[var(--primary)]"
                      : "text-[var(--on-surface-variant)] hover:bg-[var(--surface-high)] hover:text-[var(--on-surface)]"
                    }
                  `}
                >
                  <Icon name={panel.icon} className="text-[20px]" filled={activeSidePanel === panel.id} />
                </button>
              ))}
            </div>
          </div>

          {/* Right Sidebar Content */}
          <div className="flex-1 overflow-hidden">
            {activeSidePanel === "backlinks" && (
              <BacklinksPanel
                currentNote={activeNote}
                currentContent={currentContent}
                allNotes={allNotes}
                onNoteClick={(id) => {
                  const n = allNotes.find(x => x.id === id);
                  if (n) store.openTab(n);
                }}
              />
            )}

            {activeSidePanel === "tags" && (
              <TagsPanel
                notes={vaultNotes}
                currentNote={activeNote}
                currentContent={currentContent}
                activeTag={activeTag}
                onTagSelect={(tag) => store.setActiveTag(tag)}
              />
            )}

            {activeSidePanel === "graph" && (
              <div className="w-full h-full">
                <GraphView
                  nodes={vaultNotes}
                  edges={graphEdges}
                  activeNoteId={activeTabId}
                  isLocal={true}
                  onNodeClick={(id) => {
                    const n = allNotes.find(x => x.id === id);
                    if (n) store.openTab(n);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="w-12 h-full flex-shrink-0 border-l border-[var(--outline-variant)] bg-[var(--surface-lowest)] flex flex-col items-center py-4 transition-all">
          <button 
            onClick={() => setIsRightSidebarOpen(true)}
            className="w-8 h-8 rounded hover:bg-[var(--surface-high)] flex items-center justify-center text-[var(--on-surface-variant)] transition-colors"
            title="Expandir painel direito"
          >
            <Icon name="first_page" className="text-[20px]" />
          </button>
        </div>
      )}

      {/* Quick Switcher Modal */}
      <QuickSwitcher
        isOpen={showQuickSwitcher}
        onClose={() => setShowQuickSwitcher(false)}
        notes={vaultNotes}
        onNoteSelect={(note) => {
          store.openTab(note);
          setShowQuickSwitcher(false);
        }}
        onCreateNote={(title) => {
          const newNoteId = `note-${Date.now()}`;
          const newNote = {
            id: newNoteId,
            title: title,
            itemType: "note",
            path: "",
            markdownContent: "",
            vaultId: activeVaultId,
            academicSubjectId: currentVault?.subjectId || null,
            sourceCourseId: currentVault?.courseId || null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          store.addStudyItem(newNote);
          store.openTab(newNote);
          setShowQuickSwitcher(false);
        }}
      />

      {/* Vault Switcher Modal (Obsidian-Style) */}
      <VaultSwitcherModal
        isOpen={isVaultSwitcherOpen}
        onClose={() => setIsVaultSwitcherOpen(false)}
        vaults={allVaults}
        activeVaultId={activeVaultId}
        onSelectVault={handleSelectVault}
        onCreateVault={(data) => store.addCustomVault(data)}
        onDeleteVault={(vId) => store.deleteCustomVault(vId)}
      />

    </div>
  );
}
