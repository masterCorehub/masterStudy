import React, { useState, useEffect, useCallback, useRef } from "react";
import { useStudyStore } from "../store/useStore";
import { SCREEN_IDS } from "../app/screenIds";
import { Icon } from "../ui/Icon";
import { PdfReaderEngine } from "./reader/PdfReaderEngine";
import { EpubReaderEngine } from "./reader/EpubReaderEngine";
import { ReaderToolbar } from "./reader/ReaderToolbar";
import { ReaderSidebar } from "./reader/ReaderSidebar";
import { ReaderSelectionMenu } from "./reader/ReaderSelectionMenu";
import { ReaderSettingsPanel } from "./reader/ReaderSettingsPanel";
import { FloatingStickyNote } from "./reader/FloatingStickyNote";

const DEFAULT_SETTINGS = {
  theme: "light",
  fontSize: 16,
  fontFamily: "serif",
  lineSpacing: 1.6,
  scrollMode: "paginated", // "paginated" | "continuous"
};

const THEME_STYLES = {
  light:  { bg: "#ffffff", text: "#1a1a1a" },
  sepia:  { bg: "#f5ede0", text: "#3d2b1f" },
  dark:   { bg: "#1e1e2e", text: "#cdd6f4" },
  night:  { bg: "#0d0d0d", text: "#a0a0a0" },
};

function detectFileType(path) {
  if (!path) return null;
  const strPath = Array.isArray(path) ? path[0] : (typeof path === "string" ? path : String(path));
  if (!strPath || typeof strPath !== "string") return null;
  const cleanPath = strPath.split("?")[0].split("#")[0].toLowerCase();
  if (cleanPath.endsWith(".pdf")) return "pdf";
  if (cleanPath.endsWith(".epub")) return "epub";
  return null;
}

class ReaderErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Reader Error Boundary caught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-[color:var(--surface)] p-8 text-center select-none">
          <div className="w-16 h-16 rounded-3xl bg-red-500/10 text-red-500 flex items-center justify-center mb-4">
            <Icon name="error_outline" className="text-4xl" />
          </div>
          <h3 className="text-xl font-bold text-[color:var(--on-surface)] mb-2">Erro ao carregar o leitor</h3>
          <p className="text-xs text-[color:var(--on-surface-variant)] max-w-md mb-6">
            Ocorreu uma falha durante a leitura do arquivo. Certifique-se de que o arquivo existe no seu computador.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-5 py-2.5 bg-[color:var(--primary)] text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-md"
            >
              Tentar Novamente
            </button>
            <button
              onClick={() => this.props.onNavigate?.("BACK")}
              className="px-5 py-2.5 bg-[color:var(--surface-container-high)] text-[color:var(--on-surface)] rounded-xl text-xs font-bold uppercase tracking-wider"
            >
              Voltar
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export function BookReaderScreen(props) {
  return (
    <ReaderErrorBoundary onNavigate={props.onNavigate}>
      <BookReaderScreenInner {...props} />
    </ReaderErrorBoundary>
  );
}

function BookReaderScreenInner({ onNavigate }) {
  // Store
  const activeBookId = useStudyStore(s => s.activeBookId);
  const books = useStudyStore(s => s.books?.list || []);
  const updateBook = useStudyStore(s => s.updateBook);
  const updateReaderPosition = useStudyStore(s => s.updateReaderPosition);
  const addHighlight = useStudyStore(s => s.addHighlight);
  const removeHighlight = useStudyStore(s => s.removeHighlight);
  const addBookmark = useStudyStore(s => s.addBookmark);
  const removeBookmark = useStudyStore(s => s.removeBookmark);
  const toggleFavorite = useStudyStore(s => s.toggleFavorite);
  const updateReaderSettings = useStudyStore(s => s.updateReaderSettings);

  const book = books.find(b => b.id === activeBookId);
  const fileType = detectFileType(book?.filePath);
  const settings = React.useMemo(() => ({
    ...DEFAULT_SETTINGS,
    ...(book?.readerSettings || {})
  }), [book?.readerSettings?.theme, book?.readerSettings?.fontSize, book?.readerSettings?.fontFamily, book?.readerSettings?.lineSpacing, book?.readerSettings?.scrollMode]);
  const themeColors = THEME_STYLES[settings.theme] || THEME_STYLES.light;

  // Reader state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [currentCfi, setCurrentCfi] = useState(null);
  const [toc, setToc] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState("toc");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectionData, setSelectionData] = useState(null); // { text, page/cfi, position }
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSaveNoteModal, setShowSaveNoteModal] = useState(false);
  const [editingAnnotationId, setEditingAnnotationId] = useState(null);
  const [saveMode, setSaveMode] = useState("note"); // "note" | "quote"
  const [noteForm, setNoteForm] = useState({ content: "", page: "", selectedText: "" });
  const [linkingFile, setLinkingFile] = useState(!book?.filePath);
  const [resumePrompt, setResumePrompt] = useState(false);
  const [isTwoPage, setIsTwoPage] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Ref for EPUB engine
  const epubRef = useRef(null);
  const updateTimeoutRef = useRef(null);

  const handleTotalPages = useCallback((total) => {
    if (total > 0) {
      setTotalPages(total);
      if (book?.id && book.totalPages !== total) {
        updateBook(book.id, { totalPages: total });
      }
    }
  }, [book?.id, book?.totalPages, updateBook]);

  const handlePageChange = useCallback((p, isReport = false) => {
    const pageNum = Math.max(1, totalPages > 0 ? Math.min(p, totalPages) : p);
    
    setCurrentPage(pageNum);

    if (fileType === "epub" && epubRef.current && !isReport) {
      if (pageNum === currentPage + 1) {
        epubRef.current.nextPage();
      } else if (pageNum === currentPage - 1) {
        epubRef.current.prevPage();
      } else {
        epubRef.current.goToPage(pageNum);
      }
    }
    
    if (book?.id) {
      if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);
      updateTimeoutRef.current = setTimeout(() => {
        updateBook(book.id, { readPages: pageNum, lastPosition: { page: pageNum, cfi: currentCfi } });
      }, 500);
    }
  }, [book?.id, totalPages, currentPage, fileType, currentCfi, updateBook]);

  // Fullscreen toggle handler
  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
        setIsFullscreen(false);
      }
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Auto-hide Toolbar (Clean Immersive Reader)
  const [showToolbar, setShowToolbar] = useState(false);
  const hideToolbarTimeoutRef = useRef(null);

  const handleMouseMove = useCallback((e) => {
    if (e.clientY <= 80 || sidebarOpen || settingsOpen || searchOpen || showSaveNoteModal || resumePrompt) {
      setShowToolbar(true);
      if (hideToolbarTimeoutRef.current) clearTimeout(hideToolbarTimeoutRef.current);
    } else {
      if (!sidebarOpen && !settingsOpen && !searchOpen && !showSaveNoteModal && !resumePrompt) {
        if (hideToolbarTimeoutRef.current) clearTimeout(hideToolbarTimeoutRef.current);
        hideToolbarTimeoutRef.current = setTimeout(() => {
          setShowToolbar(false);
        }, 1200);
      }
    }
  }, [sidebarOpen, settingsOpen, searchOpen, showSaveNoteModal, resumePrompt]);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (hideToolbarTimeoutRef.current) clearTimeout(hideToolbarTimeoutRef.current);
    };
  }, [handleMouseMove]);

  // Restore last position
  useEffect(() => {
    if (!book) return;
    if (book.lastPosition?.page && book.lastPosition.page > 1) {
      setResumePrompt(true);
    }
  }, [book?.id]);

  const doResumePosition = () => {
    if (fileType === "pdf" && book.lastPosition?.page) {
      setCurrentPage(book.lastPosition.page);
    } else if (fileType === "epub" && book.lastPosition?.cfi) {
      setCurrentCfi(book.lastPosition.cfi);
    }
    setResumePrompt(false);
  };

  // Auto-save position every time page changes
  useEffect(() => {
    if (!book || currentPage <= 1) return;
    const timer = setTimeout(() => {
      updateReaderPosition(book.id, {
        page: currentPage,
        percent: totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0,
      });
      // Also sync readPages on book
      if (currentPage > (book.readPages || 0)) {
        updateBook(book.id, { readPages: currentPage });
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [currentPage, totalPages]);

  // EPUB CFI save
  useEffect(() => {
    if (!book || !currentCfi) return;
    const timer = setTimeout(() => {
      updateReaderPosition(book.id, { cfi: currentCfi });
    }, 1000);
    return () => clearTimeout(timer);
  }, [currentCfi]);

  // Click outside listener for selection menu
  useEffect(() => {
    const handleDocumentMouseDown = () => {
      // Clear selection UI on background click
      setSelectionData(null);
    };
    const handleMessage = (e) => {
      if (e.data === "EPUB_CLICK") setSelectionData(null);
    };
    
    document.addEventListener("mousedown", handleDocumentMouseDown);
    window.addEventListener("message", handleMessage);

    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  // Auto-heal if filePath was saved as an array previously
  useEffect(() => {
    if (book?.filePath) {
      if (Array.isArray(book.filePath)) {
        const cleanPath = book.filePath[0];
        if (cleanPath) updateBook(book.id, { filePath: cleanPath });
      }
      setLinkingFile(false);
    }
  }, [book?.filePath, book?.id]);

  // ---- HANDLERS ----

  const handleLinkFile = async () => {
    const result = await window.studyhubDesktop?.selectFile({
      properties: ["openFile"],
      filters: [
        { name: "Livros (PDF, EPUB)", extensions: ["pdf", "epub"] },
      ],
    });
    if (!result) return;
    const pathStr = Array.isArray(result)
      ? result[0]
      : (typeof result === 'string' ? result : result?.filePath || result?.filePaths?.[0]);
    if (!pathStr) return;
    updateBook(book.id, { filePath: pathStr });
    setLinkingFile(false);
  };

  const handleToggleBookmark = () => {
    const bookmarks = book?.bookmarks || [];
    const existing = bookmarks.find(bm => bm.page === currentPage);
    if (existing) {
      removeBookmark(book.id, existing.id);
    } else {
      addBookmark(book.id, {
        id: `bm-${Date.now()}`,
        page: currentPage,
        cfi: currentCfi,
        label: `Página ${currentPage}`,
        createdAt: Date.now(),
      });
    }
  };

  const handleToggleFavorite = () => {
    toggleFavorite(book.id, currentPage, currentCfi);
  };

  const lastSelectionRef = useRef(null);

  const handleTextSelected = useCallback((data) => {
    if (data && data.text) {
      lastSelectionRef.current = data;
    }
    setSelectionData(data);
  }, []);

  const handleHighlight = (color) => {
    const sel = selectionData || lastSelectionRef.current;
    if (!sel || !sel.text) return;

    const existing = (book?.highlights || []).find(h => 
      (h.page === sel.page || h.cfi === sel.cfi) && 
      (h.text && sel.text && (h.text.includes(sel.text) || sel.text.includes(h.text)))
    );

    if (existing) {
      if (existing.color === color) {
        removeHighlight(book.id, existing.id);
      } else {
        removeHighlight(book.id, existing.id);
        addHighlight(book.id, {
          id: `hl-${Date.now()}`,
          text: sel.text,
          color: color || "yellow",
          page: sel.page || currentPage,
          cfi: sel.cfi,
          rects: sel.rects || [],
          canvasWidth: sel.canvasWidth,
          canvasHeight: sel.canvasHeight,
          createdAt: Date.now(),
        });
      }
    } else {
      addHighlight(book.id, {
        id: `hl-${Date.now()}`,
        text: sel.text,
        color: color || "yellow",
        page: sel.page || currentPage,
        cfi: sel.cfi,
        rects: sel.rects || [],
        canvasWidth: sel.canvasWidth,
        canvasHeight: sel.canvasHeight,
        createdAt: Date.now(),
      });
    }

    try { window.getSelection()?.removeAllRanges(); } catch {}
    setSelectionData(null);
    lastSelectionRef.current = null;
  };

  const existingHighlight = selectionData ? (book?.highlights || []).find(h => 
    (h.page === selectionData.page || h.cfi === selectionData.cfi) && 
    (h.text && selectionData.text && (h.text.includes(selectionData.text) || selectionData.text.includes(h.text)))
  ) : null;

  const handleOpenSaveModal = (mode, existingNote = null) => {
    setSaveMode(mode);
    setEditingAnnotationId(existingNote?.id || null);

    if (existingNote) {
      setNoteForm({
        selectedText: existingNote.selectedText || existingNote.text || "",
        content: existingNote.content || existingNote.text || "",
        page: String(existingNote.page),
      });
      setShowSaveNoteModal(true);
      return;
    }

    const currentSel = selectionData || lastSelectionRef.current;
    const currentText = currentSel?.text || "";
    const pageNum = String(currentSel?.page || currentPage);

    if (mode === "selected_text") {
      setNoteForm({ selectedText: currentText, content: "", page: pageNum });
    } else if (mode === "page_note") {
      setNoteForm({ selectedText: "", content: "", page: String(currentPage) });
    } else if (mode === "quote") {
      setNoteForm({ selectedText: currentText, content: currentText, page: pageNum });
    }
    setShowSaveNoteModal(true);
  };

  const handleHighlightClick = (highlightId) => {
    const hl = book?.highlights?.find(h => h.id === highlightId);
    if (!hl || !hl.linkedAnnotationId) return;

    if (hl.type === "quote") {
      const quote = book?.quotes?.find(q => q.id === hl.linkedAnnotationId);
      if (quote) handleOpenSaveModal("quote", quote);
    } else if (hl.type === "note") {
      const note = book?.notes?.find(n => n.id === hl.linkedAnnotationId);
      if (note) handleOpenSaveModal("selected_text", note);
    }
  };

  const handleRemoveNote = (noteId) => {
    const existing = book?.notes || [];
    updateBook(book.id, {
      notes: existing.filter(n => n.id !== noteId)
    });
  };

  const handleRemoveQuote = (quoteId) => {
    const existing = book?.quotes || [];
    updateBook(book.id, {
      quotes: existing.filter(q => q.id !== quoteId)
    });
  };

  const handleSaveToBook = (e) => {
    e.preventDefault();
    const currentSel = selectionData || lastSelectionRef.current;
    const timestamp = Date.now();

    if (saveMode === "quote") {
      const existingQuotes = book?.quotes || [];
      const quoteText = noteForm.selectedText || noteForm.content || "";
      const quotePage = Number(noteForm.page) || currentPage;

      if (editingAnnotationId) {
        updateBook(book.id, {
          quotes: existingQuotes.map(q => q.id === editingAnnotationId ? { ...q, text: quoteText, page: quotePage } : q)
        });
      } else {
        const newQuote = {
          id: `quote-${timestamp}`,
          text: quoteText,
          page: quotePage,
          createdAt: timestamp,
        };

        updateBook(book.id, {
          quotes: [newQuote, ...existingQuotes]
        });

        if (quoteText && currentSel?.rects) {
          addHighlight(book.id, {
            id: `hl-quote-${timestamp}`,
            linkedAnnotationId: newQuote.id,
            text: quoteText,
            color: "blue",
            type: "quote",
            page: quotePage,
            cfi: currentSel?.cfi,
            rects: currentSel?.rects || [],
            canvasWidth: currentSel?.canvasWidth,
            canvasHeight: currentSel?.canvasHeight,
            createdAt: timestamp,
          });
        }
      }
    } else {
      const existingNotes = book?.notes || [];
      const notePage = Number(noteForm.page) || currentPage;

      if (editingAnnotationId) {
        updateBook(book.id, {
          notes: existingNotes.map(n => n.id === editingAnnotationId ? { ...n, content: noteForm.content, page: notePage } : n)
        });
      } else {
        const newNote = {
          id: `note-${timestamp}`,
          selectedText: noteForm.selectedText,
          content: noteForm.content,
          page: notePage,
          createdAt: timestamp,
        };

        updateBook(book.id, {
          notes: [newNote, ...existingNotes]
        });

        if (noteForm.selectedText && currentSel?.rects) {
          addHighlight(book.id, {
            id: `hl-note-${timestamp}`,
            linkedAnnotationId: newNote.id,
            text: noteForm.selectedText,
            color: "orange",
            type: "note",
            page: notePage,
            cfi: currentSel?.cfi,
            rects: currentSel?.rects || [],
            canvasWidth: currentSel?.canvasWidth,
            canvasHeight: currentSel?.canvasHeight,
            createdAt: timestamp,
          });
        }
      }
    }

    window.getSelection()?.removeAllRanges();
    setSelectionData(null);
    setShowSaveNoteModal(false);
  };

  const handleBack = () => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("standalone") === "1" || window.history.length <= 1) {
      window.close();
    } else {
      // Always go back to book details (not just generic "BACK" which can land anywhere)
      onNavigate(SCREEN_IDS.BOOK_DETAILS);
    }
  };

  const isBookmarked = (book?.bookmarks || []).some(bm => bm.page === currentPage);
  const isFavorite = (book?.favorites || []).some(f => currentCfi ? f.cfi === currentCfi : f.page === currentPage);

  // ---- LINK FILE SCREEN ----
  if (!book) {
    return (
      <div className="h-screen flex items-center justify-center bg-[color:var(--surface)]">
        <p className="text-[color:var(--on-surface-variant)]">Livro não encontrado.</p>
      </div>
    );
  }

  if (linkingFile) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[color:var(--background)] p-6 select-none">
        <div className="neo-raised bg-[color:var(--surface)] border border-[color:var(--outline-variant)]/20 shadow-2xl rounded-3xl p-12 max-w-xl w-full flex flex-col items-center text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-[color:var(--primary)] via-blue-500 to-indigo-500" />
          
          <div className="w-24 h-24 rounded-3xl bg-[color:var(--primary)]/10 text-[color:var(--primary)] flex items-center justify-center mb-6 shadow-inner">
            <Icon name="menu_book" className="text-6xl" />
          </div>
          
          <h2 className="text-3xl font-extrabold text-[color:var(--on-surface)] mb-3 tracking-tight">
            {book.title}
          </h2>
          
          <p className="text-base text-[color:var(--on-surface-variant)] mb-8 leading-relaxed max-w-md">
            Selecione o arquivo PDF ou EPUB no seu computador para começar a ler este livro.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
            <button
              onClick={() => onNavigate("BACK")}
              className="px-8 py-4 rounded-2xl text-sm font-bold text-[color:var(--on-surface-variant)] bg-[color:var(--surface-container-high)] hover:bg-[color:var(--surface-container-highest)] transition-colors border border-[color:var(--outline-variant)]/30 uppercase tracking-wider"
            >
              Cancelar
            </button>
            <button
              onClick={handleLinkFile}
              className="px-8 py-4 rounded-2xl text-sm font-bold text-white bg-[color:var(--primary)] shadow-lg shadow-[color:var(--primary)]/30 hover:opacity-90 transition-all flex items-center justify-center gap-2.5 uppercase tracking-wider"
            >
              <Icon name="folder_open" className="text-[20px]" />
              Escolher Arquivo (PDF / EPUB)
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- MAIN READER ----

  return (
    <div className="relative flex-1 flex flex-col w-full h-full overflow-hidden select-none bg-[color:var(--surface)]">
      {/* Resume prompt */}
      {resumePrompt && (
        <div
          className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-[color:var(--surface)] border border-[color:var(--primary)]/30 rounded-2xl shadow-2xl px-6 py-4 flex items-center gap-4"
          style={{ WebkitAppRegion: "no-drag" }}
        >
          <Icon name="bookmark" className="text-[color:var(--primary)] text-[24px]" />
          <div>
            <p className="text-sm font-bold text-[color:var(--on-surface)]">Continuar de onde parou?</p>
            <p className="text-xs text-[color:var(--on-surface-variant)]">Última leitura: página {book.lastPosition?.page}</p>
          </div>
          <div className="flex gap-2 ml-2">
            <button onClick={() => setResumePrompt(false)} className="px-3 py-1.5 text-xs font-bold rounded-xl bg-[color:var(--surface-container-high)] text-[color:var(--on-surface)]">
              Do início
            </button>
            <button onClick={doResumePosition} className="px-3 py-1.5 text-xs font-bold rounded-xl bg-[color:var(--primary)] text-white">
              Continuar
            </button>
          </div>
        </div>
      )}

      {/* Top Controls Container (Auto-Hide with smooth height collapse within the app workspace) */}
      <div
        className={`transition-all duration-300 overflow-hidden shrink-0 z-40 bg-[color:var(--surface)] ${
          showToolbar || sidebarOpen || settingsOpen || searchOpen || showSaveNoteModal
            ? "max-h-24 opacity-100 border-b border-[color:var(--outline-variant)]/20 shadow-md"
            : "max-h-0 opacity-0 pointer-events-none"
        }`}
        style={{ WebkitAppRegion: "drag" }}
      >
        <ReaderToolbar
          book={book}
          currentPage={currentPage}
          totalPages={totalPages}
          fileType={fileType}
          isFavorite={isFavorite}
          isBookmarked={isBookmarked}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(o => !o)}
          onBack={handleBack}
          onPageChange={handlePageChange}
          onToggleBookmark={handleToggleBookmark}
          onToggleFavorite={handleToggleFavorite}
          onToggleSettings={() => setSettingsOpen(o => !o)}
          onSearch={() => setSearchOpen(o => !o)}
          onAddPageNote={() => handleOpenSaveModal("page_note")}
          isTwoPage={isTwoPage}
          onToggleTwoPage={() => setIsTwoPage(v => !v)}
          scrollMode={settings.scrollMode || "paginated"}
          onToggleScrollMode={() => {
            const nextMode = (settings.scrollMode || "paginated") === "continuous" ? "paginated" : "continuous";
            updateReaderSettings(book.id, { scrollMode: nextMode });
          }}
          isFullscreen={isFullscreen}
          onToggleFullscreen={handleToggleFullscreen}
          themeColors={themeColors}
          settings={settings}
          onUpdateSettings={upd => updateReaderSettings(book.id, upd)}
        />

        {/* Search bar */}
        {searchOpen && (
          <div className="flex items-center gap-2 px-4 py-2 bg-[color:var(--surface-container-low)] border-b border-[color:var(--outline-variant)]/20">
            <Icon name="search" className="text-[color:var(--on-surface-variant)]" />
            <input
              autoFocus
              type="text"
              placeholder="Buscar no livro..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent outline-none text-sm text-[color:var(--on-surface)] placeholder:text-[color:var(--on-surface-variant)]"
            />
            <button onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
              className="text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]">
              <Icon name="close" />
            </button>
          </div>
        )}
      </div>

      {/* Discreet top-right floating button when controls are hidden */}
      {!showToolbar && !sidebarOpen && !settingsOpen && !searchOpen && (
        <div
          className="absolute top-3 right-4 z-30 transition-opacity duration-300 opacity-60 hover:opacity-100"
          style={{ WebkitAppRegion: "no-drag" }}
        >
          <button
            onClick={() => setShowToolbar(true)}
            onMouseEnter={() => setShowToolbar(true)}
            className="p-2 rounded-2xl bg-[color:var(--surface)]/90 backdrop-blur-md shadow-lg border border-[color:var(--outline-variant)]/30 text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)] transition-all flex items-center gap-1.5 text-xs font-bold"
            title="Mostrar Controles de Leitura"
          >
            <Icon name="tune" className="text-[16px] text-[color:var(--primary)]" />
            <span className="text-[11px]">Controles</span>
          </button>
        </div>
      )}

      {/* Main reading area */}
      <div className="flex flex-1 overflow-hidden relative w-full h-full">
        {/* Sidebar */}
        {sidebarOpen && (
          <ReaderSidebar
            book={book}
            toc={toc}
            currentPage={currentPage}
            onNavigatePage={p => { setCurrentPage(p); }}
            onNavigateCfi={cfi => setCurrentCfi(cfi)}
            onRemoveHighlight={id => removeHighlight(book.id, id)}
            onRemoveBookmark={id => removeBookmark(book.id, id)}
            onRemoveNote={handleRemoveNote}
            onRemoveQuote={handleRemoveQuote}
            onAddPageNote={() => handleOpenSaveModal("page_note")}
            onToggleFavorite={handleToggleFavorite}
            activeTab={sidebarTab}
            onTabChange={setSidebarTab}
          />
        )}

        {/* Reader engine */}
        {fileType === "pdf" && (
          <PdfReaderEngine
            filePath={book.filePath}
            currentPage={currentPage}
            settings={settings}
            isTwoPage={isTwoPage}
            highlights={book.highlights || []}
            searchQuery={searchQuery}
            onTotalPages={handleTotalPages}
            onTextSelected={handleTextSelected}
            onHighlightClick={handleHighlightClick}
            onPageRendered={() => {}}
            onPageChange={handlePageChange}
          />
        )}

        {fileType === "epub" && (
          <EpubReaderEngine
            ref={epubRef}
            filePath={book.filePath}
            currentCfi={currentCfi}
            settings={settings}
            isTwoPage={isTwoPage}
            highlights={book.highlights || []}
            onTotalPages={handleTotalPages}
            onTextSelected={handleTextSelected}
            onHighlightClick={handleHighlightClick}
            onCfiChanged={setCurrentCfi}
            onPageChange={handlePageChange}
            onTocLoaded={setToc}
          />
        )}

        {!fileType && (
          <div className="flex-1 flex flex-col items-center justify-center text-[color:var(--on-surface-variant)]">
            <Icon name="description" className="text-5xl mb-4 opacity-40" />
            <p className="font-bold">Formato de arquivo não suportado.</p>
            <p className="text-xs mt-1">Use arquivos PDF ou EPUB.</p>
            <button onClick={() => setLinkingFile(true)}
              className="mt-6 px-5 py-2.5 bg-[color:var(--primary)] text-white rounded-xl text-sm font-bold">
              Escolher outro arquivo
            </button>
          </div>
        )}

        {/* Floating Page Number Badge at bottom center */}
        {totalPages > 0 && (
          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none select-none transition-opacity duration-300 opacity-90 hover:opacity-100"
            style={{ WebkitAppRegion: "no-drag" }}
          >
            <div className="flex items-center gap-1.5 px-3.5 py-1.2 rounded-full bg-[color:var(--surface)]/90 backdrop-blur-md shadow-xl border border-[color:var(--outline-variant)]/20 text-[color:var(--on-surface-variant)] text-xs font-bold tracking-wide">
              <Icon name="auto_stories" className="text-[14px] text-[color:var(--primary)]" />
              <span>
                {isTwoPage && currentPage + 1 <= totalPages
                  ? `Páginas ${currentPage} – ${currentPage + 1} de ${totalPages}`
                  : `Página ${currentPage} de ${totalPages}`}
              </span>
            </div>
          </div>
        )}

        {/* Floating Bookmark Indicator */}
        {isBookmarked && (
          <div className="absolute top-0 right-16 md:right-32 z-20 pointer-events-none drop-shadow-xl transition-all duration-300 animate-in slide-in-from-top-4 fade-in">
            <svg width="32" height="48" viewBox="0 0 24 36" fill="currentColor" className="text-[color:var(--primary)] opacity-95">
              <path d="M2,0 L22,0 C23.1,0 24,0.9 24,2 L24,36 L12,28 L0,36 L0,2 C0,0.9 0.9,0 2,0 Z" />
            </svg>
            <div className="absolute top-2.5 left-1/2 -translate-x-1/2 flex items-center justify-center w-5 h-5">
              <Icon name="bookmark" className="text-[14px] text-white opacity-80" />
            </div>
          </div>
        )}

        {/* Settings panel */}
        {settingsOpen && (
          <ReaderSettingsPanel
            settings={settings}
            fileType={fileType}
            onUpdate={upd => updateReaderSettings(book.id, upd)}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </div>

      {/* Progress bar at bottom */}
      {totalPages > 0 && (
        <div className="h-1 bg-[color:var(--surface-container-highest)] shrink-0">
          <div
            className="h-full bg-[color:var(--primary)] transition-all duration-300"
            style={{ width: `${(currentPage / totalPages) * 100}%` }}
          />
        </div>
      )}

      {/* Floating selection menu */}
      {selectionData && (
        <ReaderSelectionMenu
          position={selectionData.position}
          selectedText={selectionData.text}
          hasExistingHighlight={!!existingHighlight}
          onHighlight={handleHighlight}
          onRemoveHighlight={() => {
            if (existingHighlight) {
              removeHighlight(book.id, existingHighlight.id);
            }
            try { window.getSelection()?.removeAllRanges(); } catch {}
            setSelectionData(null);
            lastSelectionRef.current = null;
          }}
          onSaveAsNote={() => handleOpenSaveModal("selected_text")}
          onSaveAsQuote={() => handleOpenSaveModal("quote")}
          onCopy={() => { navigator.clipboard.writeText(selectionData.text); setSelectionData(null); }}
          onClose={() => setSelectionData(null)}
        />
      )}

      {/* Floating Sticky Note Widget */}
      {showSaveNoteModal && (
        <FloatingStickyNote
          saveMode={saveMode}
          noteForm={noteForm}
          setNoteForm={setNoteForm}
          onSave={handleSaveToBook}
          onClose={() => setShowSaveNoteModal(false)}
        />
      )}
    </div>
  );
}
