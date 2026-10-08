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
import { ReaderSearchPanel } from "./reader/ReaderSearchPanel";
import {
  DEFAULT_READER_SETTINGS,
  READER_THEMES,
  readerProgress,
} from "./reader/readerAppearance";
import {
  selectionAnchor,
  hasTextAnchor,
  samePassage,
  annotationAnchor,
  annotationSelectedText,
  SAVED_PASSAGE_COLOR,
} from "./reader/readerAnnotations";
import { BookFileImport } from "../components/books/BookFileImport";
import { retainBookFile } from "../services/book-files";
import { bookFileType, mergeBookMetadata } from "../domain/bookMetadata";
import { FloatingStickyNote } from "./reader/FloatingStickyNote";

const DEFAULT_SETTINGS = DEFAULT_READER_SETTINGS;
const THEME_STYLES = READER_THEMES;

function detectFileType(path) {
  return bookFileType(Array.isArray(path) ? path[0] : path) || null;
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
          <h3 className="text-xl font-bold text-[color:var(--on-surface)] mb-2">
            Erro ao carregar o leitor
          </h3>
          <p className="text-xs text-[color:var(--on-surface-variant)] max-w-md mb-6">
            Ocorreu uma falha durante a leitura do arquivo. Certifique-se de que
            o arquivo existe no seu computador.
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
  const activeBookId = useStudyStore((s) => s.activeBookId);
  return (
    <ReaderErrorBoundary key={activeBookId} onNavigate={props.onNavigate}>
      <BookReaderScreenInner {...props} />
    </ReaderErrorBoundary>
  );
}

function BookReaderScreenInner({ onNavigate }) {
  // Store
  const activeBookId = useStudyStore((s) => s.activeBookId);
  const books = useStudyStore((s) => s.books?.list || []);
  const updateBook = useStudyStore((s) => s.updateBook);
  const updateReaderPosition = useStudyStore((s) => s.updateReaderPosition);
  const addHighlight = useStudyStore((s) => s.addHighlight);
  const removeHighlight = useStudyStore((s) => s.removeHighlight);
  const addBookmark = useStudyStore((s) => s.addBookmark);
  const removeBookmark = useStudyStore((s) => s.removeBookmark);
  const toggleFavorite = useStudyStore((s) => s.toggleFavorite);
  const updateReaderSettings = useStudyStore((s) => s.updateReaderSettings);

  const book = books.find((b) => b.id === activeBookId);
  const fileType = detectFileType(book?.filePath);
  const settings = React.useMemo(
    () => ({
      ...DEFAULT_SETTINGS,
      ...(book?.readerSettings || {}),
    }),
    [book?.readerSettings],
  );
  const themeColors = THEME_STYLES[settings.theme] || THEME_STYLES.light;

  // Reader state
  const [currentPage, setCurrentPage] = useState(
    () => book?.lastPosition?.page || 1,
  );
  const [totalPages, setTotalPages] = useState(0);
  const [currentCfi, setCurrentCfi] = useState(
    () => book?.lastPosition?.cfi || null,
  );
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
  const [noteForm, setNoteForm] = useState({
    content: "",
    page: "",
    selectedText: "",
  });
  const [linkingFile, setLinkingFile] = useState(!book?.filePath);
  const isTwoPage =
    settings.spread === "double" && settings.scrollMode !== "continuous";
  const setIsTwoPage = (update) =>
    updateReaderSettings(book.id, {
      spread: update(isTwoPage && settings.scrollMode !== "continuous")
        ? "double"
        : "single",
      scrollMode: "paginated",
    });
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Ref for EPUB engine
  const epubRef = useRef(null);
  const pdfRef = useRef(null);
  const [returnPosition, setReturnPosition] = useState(null);
  const [focusTarget, setFocusTarget] = useState(null);
  const [readerNotice, setReaderNotice] = useState("");
  const savedSelectionRef = useRef(null);

  const handleTotalPages = useCallback(
    (total) => {
      if (total > 0) {
        setTotalPages(total);
        if (book?.id) {
          // Character locations drive EPUB navigation without changing its page count.
          if (fileType === "epub" && book.locationCount !== total)
            updateBook(book.id, { locationCount: total });
          else if (fileType === "pdf" && book.totalPages !== total)
            updateBook(book.id, { totalPages: total, pageCountSource: "pdf" });
        }
      }
    },
    [book?.id, book?.totalPages, book?.locationCount, fileType, updateBook],
  );

  const handlePageChange = useCallback(
    (p, isReport = false) => {
      const pageNum = Math.max(1, totalPages > 0 ? Math.min(p, totalPages) : p);

      setCurrentPage(pageNum);

      if (fileType === "epub" && !isReport) epubRef.current?.goToPage(pageNum);
    },
    [book?.id, totalPages, currentPage, fileType, currentCfi, updateBook],
  );

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
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Auto-hide Toolbar (Clean Immersive Reader)
  const [showToolbar, setShowToolbar] = useState(true);
  const hideToolbarTimeoutRef = useRef(null);

  const handleMouseMove = useCallback(
    (e) => {
      const shellTop =
        document.querySelector(".book-reader-shell")?.getBoundingClientRect()
          .top || 0;
      const hasOpenOptions = Boolean(
        document.querySelector(".reader-options[open]"),
      );
      if (
        e.clientY - shellTop <= 90 ||
        hasOpenOptions ||
        sidebarOpen ||
        settingsOpen ||
        searchOpen ||
        showSaveNoteModal
      ) {
        setShowToolbar(true);
        if (hideToolbarTimeoutRef.current)
          clearTimeout(hideToolbarTimeoutRef.current);
      } else {
        if (
          !sidebarOpen &&
          !settingsOpen &&
          !searchOpen &&
          !showSaveNoteModal
        ) {
          if (hideToolbarTimeoutRef.current)
            clearTimeout(hideToolbarTimeoutRef.current);
          hideToolbarTimeoutRef.current = setTimeout(() => {
            if (
              document.activeElement?.matches(":focus-visible") &&
              document.activeElement?.closest(".reader-top-chrome")
            )
              return;
            setShowToolbar(false);
          }, 1200);
        }
      }
    },
    [sidebarOpen, settingsOpen, searchOpen, showSaveNoteModal],
  );

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (hideToolbarTimeoutRef.current)
        clearTimeout(hideToolbarTimeoutRef.current);
    };
  }, [handleMouseMove]);

  // One complete position snapshot preserves EPUB CFI and PDF page together.
  useEffect(() => {
    setCurrentPage(book?.lastPosition?.page || 1);
    setCurrentCfi(book?.lastPosition?.cfi || null);
    setToc([]);
    setReturnPosition(null);
  }, [book?.id]);

  useEffect(() => {
    if (!book?.id || totalPages < 1) return;
    const snapshot = {
      page: currentPage,
      cfi: currentCfi,
      percent: readerProgress(currentPage, totalPages),
    };
    const timer = setTimeout(
      () => updateReaderPosition(book.id, snapshot),
      400,
    );
    return () => {
      clearTimeout(timer);
      // Flush on exit as well, so a quick page turn followed by Back is saved.
      updateReaderPosition(book.id, snapshot);
    };
  }, [book?.id, currentPage, currentCfi, totalPages, updateReaderPosition]);

  const navigateTo = (item) => {
    setReturnPosition({ page: currentPage, cfi: currentCfi });
    if (item.cfi) {
      setCurrentCfi(item.cfi);
      epubRef.current?.displayCfi(item.cfi);
    } else handlePageChange(item.page);
    setFocusTarget({ ...item, requestedAt: Date.now() });
    setSidebarOpen(false);
    setSearchOpen(false);
  };

  const navigateToAnnotation = async (annotation) => {
    setReaderNotice("");
    const anchor = annotationAnchor(annotation, book.highlights);
    if (fileType === "epub" && !anchor.cfi) {
      const text = annotation.selectedText || annotation.text;
      const matches = text ? await epubRef.current?.search(text) : [];
      if (matches?.length === 1) {
        anchor.cfi = matches[0].cfi;
        anchor.page = matches[0].page;
        const field = (book.quotes || []).some((q) => q.id === annotation.id)
          ? "quotes"
          : "notes";
        updateBook(book.id, {
          [field]: (book[field] || []).map((item) =>
            item.id === annotation.id
              ? { ...item, cfi: anchor.cfi, page: anchor.page }
              : item,
          ),
        });
        if (
          !(book.highlights || []).some(
            (h) => h.linkedAnnotationId === annotation.id,
          )
        ) {
          addHighlight(book.id, {
            ...anchor,
            id: `hl-recovered-${annotation.id}`,
            linkedAnnotationId: annotation.id,
            text,
            color: SAVED_PASSAGE_COLOR,
            type: field === "quotes" ? "quote" : "note",
            createdAt: Date.now(),
          });
        }
      } else if (matches?.length > 1) {
        setSidebarOpen(false);
        setSearchOpen(true);
        setSearchQuery(text);
        setReaderNotice(
          "Este trecho antigo aparece mais de uma vez. Escolha a ocorrência correta na busca.",
        );
        return;
      } else {
        setReaderNotice(
          "Esta anotação antiga não tem a localização exata. Abrindo a posição salva.",
        );
      }
    }
    navigateTo(anchor);
  };

  useEffect(() => {
    const close = (e) => {
      if (e.key !== "Escape") return;
      setSidebarOpen(false);
      setSearchOpen(false);
      setSettingsOpen(false);
      setSelectionData(null);
      document.querySelectorAll(".reader-options[open]").forEach((el) => {
        el.open = false;
      });
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

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

  const handleLinkFile = async ({ source, metadata }) => {
    const filePath = await retainBookFile(source);
    const current = useStudyStore
      .getState()
      .books.list.find((item) => item.id === book.id);
    if (!current) return;
    updateBook(book.id, { ...mergeBookMetadata(current, metadata), filePath });
    setLinkingFile(false);
  };

  const handleToggleBookmark = () => {
    const bookmarks = book?.bookmarks || [];
    const existing = bookmarks.find((bm) =>
      currentCfi && bm.cfi ? bm.cfi === currentCfi : bm.page === currentPage,
    );
    if (existing) {
      removeBookmark(book.id, existing.id);
    } else {
      addBookmark(book.id, {
        id: `bm-${Date.now()}`,
        page: currentPage,
        cfi: currentCfi,
        label:
          fileType === "epub"
            ? `Posição ${currentPage}`
            : `Página ${currentPage}`,
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

    const existing = (book?.highlights || []).find(
      (h) =>
        samePassage(h, sel) &&
        h.text &&
        sel.text &&
        (h.text.includes(sel.text) || sel.text.includes(h.text)),
    );

    if (existing) {
      if (existing.color === color) {
        removeHighlight(book.id, existing.id);
      } else {
        // Changing the color must keep the link to the saved note or quote.
        updateBook(book.id, {
          highlights: book.highlights.map((h) =>
            h.id === existing.id ? { ...h, color } : h,
          ),
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

    try {
      window.getSelection()?.removeAllRanges();
      epubRef.current?.clearSelection();
    } catch {}
    setSelectionData(null);
    lastSelectionRef.current = null;
  };

  const existingHighlight = selectionData
    ? (book?.highlights || []).find(
        (h) =>
          samePassage(h, selectionData) &&
          h.text &&
          selectionData.text &&
          (h.text.includes(selectionData.text) ||
            selectionData.text.includes(h.text)),
      )
    : null;

  const handleOpenSaveModal = (mode, existingNote = null) => {
    savedSelectionRef.current =
      mode === "page_note" || existingNote
        ? null
        : selectionData || lastSelectionRef.current;
    setSelectionData(null);
    setSaveMode(mode);
    setEditingAnnotationId(existingNote?.id || null);

    if (existingNote) {
      setNoteForm({
        selectedText: annotationSelectedText(existingNote, book.highlights) || existingNote.text || "",
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
      setNoteForm({
        selectedText: currentText,
        content: currentText,
        page: pageNum,
      });
    }
    setShowSaveNoteModal(true);
  };

  const handleHighlightClick = (highlightId) => {
    const hl = book?.highlights?.find((h) => h.id === highlightId);
    if (!hl || !hl.linkedAnnotationId) return;

    if (hl.type === "quote") {
      const quote = book?.quotes?.find((q) => q.id === hl.linkedAnnotationId);
      if (quote) handleOpenSaveModal("quote", quote);
    } else if (hl.type === "note") {
      const note = book?.notes?.find((n) => n.id === hl.linkedAnnotationId);
      if (note) handleOpenSaveModal("selected_text", note);
    }
  };

  const handleRemoveNote = (noteId) => {
    const existing = book?.notes || [];
    updateBook(book.id, {
      notes: existing.filter((n) => n.id !== noteId),
      highlights: (book.highlights || []).filter(
        (h) => h.linkedAnnotationId !== noteId,
      ),
    });
  };

  const handleRemoveQuote = (quoteId) => {
    const existing = book?.quotes || [];
    updateBook(book.id, {
      quotes: existing.filter((q) => q.id !== quoteId),
      highlights: (book.highlights || []).filter(
        (h) => h.linkedAnnotationId !== quoteId,
      ),
    });
  };

  const handleSaveToBook = (e) => {
    e.preventDefault();
    const currentSel = savedSelectionRef.current;
    const anchor = selectionAnchor(currentSel, currentPage, currentCfi);
    const timestamp = Date.now();

    if (saveMode === "quote") {
      const existingQuotes = book?.quotes || [];
      const quoteText = noteForm.selectedText || noteForm.content || "";
      const quotePage = Number(noteForm.page) || currentPage;

      if (editingAnnotationId) {
        updateBook(book.id, {
          quotes: existingQuotes.map((q) =>
            q.id === editingAnnotationId
              ? { ...q, text: quoteText, page: quotePage }
              : q,
          ),
        });
      } else {
        const newQuote = {
          id: `quote-${timestamp}`,
          text: quoteText,
          ...anchor,
          page: quotePage,
          createdAt: timestamp,
        };

        updateBook(book.id, {
          quotes: [newQuote, ...existingQuotes],
        });

        if (quoteText && hasTextAnchor(anchor)) {
          addHighlight(book.id, {
            id: `hl-quote-${timestamp}`,
            linkedAnnotationId: newQuote.id,
            text: quoteText,
            color: SAVED_PASSAGE_COLOR,
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
          notes: existingNotes.map((n) =>
            n.id === editingAnnotationId
              ? { ...n, content: noteForm.content, page: notePage, selectedText: noteForm.selectedText || annotationSelectedText(n, book.highlights) }
              : n,
          ),
        });
      } else {
        const newNote = {
          id: `note-${timestamp}`,
          selectedText: noteForm.selectedText,
          content: noteForm.content,
          ...anchor,
          page: notePage,
          createdAt: timestamp,
        };

        updateBook(book.id, {
          notes: [newNote, ...existingNotes],
        });

        if (noteForm.selectedText && hasTextAnchor(anchor)) {
          addHighlight(book.id, {
            id: `hl-note-${timestamp}`,
            linkedAnnotationId: newNote.id,
            text: noteForm.selectedText,
            color: SAVED_PASSAGE_COLOR,
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
    epubRef.current?.clearSelection();
    savedSelectionRef.current = null;
    lastSelectionRef.current = null;
    setSelectionData(null);
    setShowSaveNoteModal(false);
  };

  const handleBack = () => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("standalone") === "1" && window.studyhubDesktop) {
      window.close();
    } else {
      // Always go back to book details (not just generic "BACK" which can land anywhere)
      onNavigate(SCREEN_IDS.BOOKS);
    }
  };

  const isBookmarked = (book?.bookmarks || []).some((bm) =>
    currentCfi && bm.cfi ? bm.cfi === currentCfi : bm.page === currentPage,
  );
  const isFavorite = (book?.favorites || []).some((f) =>
    currentCfi ? f.cfi === currentCfi : f.page === currentPage,
  );

  // ---- LINK FILE SCREEN ----
  if (!book) {
    return (
      <div className="h-screen flex items-center justify-center bg-[color:var(--surface)]">
        <p className="text-[color:var(--on-surface-variant)]">
          Livro não encontrado.
        </p>
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
            Selecione o arquivo PDF ou EPUB no seu computador para começar a ler
            este livro.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
            <button
              onClick={() => onNavigate("BACK")}
              className="px-8 py-4 rounded-2xl text-sm font-bold text-[color:var(--on-surface-variant)] bg-[color:var(--surface-container-high)] hover:bg-[color:var(--surface-container-highest)] transition-colors border border-[color:var(--outline-variant)]/30 uppercase tracking-wider"
            >
              Cancelar
            </button>
            <BookFileImport onImport={handleLinkFile} />
          </div>
        </div>
      </div>
    );
  }

  // ---- MAIN READER ----

  return (
    <div
      className="book-reader-shell relative flex-1 flex flex-col w-full h-full overflow-hidden select-none bg-[color:var(--surface)]"
      onFocusCapture={() => setShowToolbar(true)}
    >
      {/* The toolbar overlays a stable viewport: hiding it cannot repaginate EPUB. */}
      <div
        className={`reader-top-chrome ${showToolbar || sidebarOpen || settingsOpen || searchOpen || showSaveNoteModal ? "" : "is-hidden"}`}
      >
        <ReaderToolbar
          book={book}
          currentPage={currentPage}
          totalPages={totalPages}
          fileType={fileType}
          isFavorite={isFavorite}
          isBookmarked={isBookmarked}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => {
            setSidebarOpen((o) => !o);
            setSettingsOpen(false);
            setSearchOpen(false);
          }}
          onBack={handleBack}
          onPageChange={handlePageChange}
          onToggleBookmark={handleToggleBookmark}
          onToggleFavorite={handleToggleFavorite}
          settingsOpen={settingsOpen}
          searchOpen={searchOpen}
          onToggleSettings={() => {
            setSettingsOpen((o) => !o);
            setSidebarOpen(false);
            setSearchOpen(false);
          }}
          onSearch={() => {
            setSearchOpen((o) => !o);
            setSidebarOpen(false);
            setSettingsOpen(false);
          }}
          onAddPageNote={() => handleOpenSaveModal("page_note")}
          isTwoPage={isTwoPage}
          onToggleTwoPage={() => setIsTwoPage((v) => !v)}
          scrollMode={settings.scrollMode || "paginated"}
          onToggleScrollMode={() => {
            const nextMode =
              (settings.scrollMode || "paginated") === "continuous"
                ? "paginated"
                : "continuous";
            updateReaderSettings(book.id, { scrollMode: nextMode });
          }}
          isFullscreen={isFullscreen}
          onToggleFullscreen={handleToggleFullscreen}
          themeColors={themeColors}
          settings={settings}
          onUpdateSettings={(upd) => updateReaderSettings(book.id, upd)}
        />
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
            <Icon
              name="tune"
              className="text-[16px] text-[color:var(--primary)]"
            />
            <span className="text-[11px]">Controles</span>
          </button>
        </div>
      )}

      {/* Main reading area */}
      <div
        className="reader-reading-stage flex flex-1 overflow-hidden relative w-full h-full"
        style={{ backgroundColor: themeColors.bg, color: themeColors.text }}
      >
        {/* Sidebar */}
        {sidebarOpen && (
          <ReaderSidebar
            book={book}
            toc={toc}
            currentPage={currentPage}
            totalPages={totalPages}
            fileType={fileType}
            pdfRef={pdfRef}
            onClose={() => setSidebarOpen(false)}
            onNavigatePage={(p) => navigateTo({ page: p })}
            onNavigateCfi={(cfi) => navigateTo({ cfi })}
            onNavigateAnnotation={navigateToAnnotation}
            onRemoveHighlight={(id) => removeHighlight(book.id, id)}
            onRemoveBookmark={(id) => removeBookmark(book.id, id)}
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
            ref={pdfRef}
            onTocLoaded={setToc}
            filePath={book.filePath}
            currentPage={currentPage}
            settings={settings}
            isTwoPage={isTwoPage}
            highlights={book.highlights || []}
            searchQuery={searchQuery}
            focusTarget={focusTarget}
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
            <button
              onClick={() => setLinkingFile(true)}
              className="mt-6 px-5 py-2.5 bg-[color:var(--primary)] text-white rounded-xl text-sm font-bold"
            >
              Escolher outro arquivo
            </button>
          </div>
        )}

        {searchOpen && (
          <ReaderSearchPanel
            query={searchQuery}
            onQueryChange={setSearchQuery}
            engineRef={fileType === "pdf" ? pdfRef : epubRef}
            onNavigate={navigateTo}
            onClose={() => setSearchOpen(false)}
          />
        )}
        {(settingsOpen || searchOpen || sidebarOpen) && (
          <button
            className="reader-panel-backdrop"
            aria-label="Fechar painel de leitura"
            onClick={() => {
              setSettingsOpen(false);
              setSearchOpen(false);
              setSidebarOpen(false);
            }}
          />
        )}
        {/* Settings panel */}
        {settingsOpen && (
          <ReaderSettingsPanel
            settings={settings}
            fileType={fileType}
            onUpdate={(upd) => updateReaderSettings(book.id, upd)}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </div>

      <footer
        className={`reader-reading-footer ${showToolbar || sidebarOpen || settingsOpen || searchOpen ? "" : "is-quiet"}`}
      >
        <div className="reader-footer-meta">
          <button
            className="reader-return-position"
            disabled={!returnPosition}
            onClick={() => {
              if (returnPosition) {
                if (returnPosition.cfi) setCurrentCfi(returnPosition.cfi);
                else handlePageChange(returnPosition.page);
                setReturnPosition(null);
              }
            }}
          >
            <Icon name="undo" />
            <span>Voltar à leitura</span>
          </button>
          <span>
            {fileType === "epub"
              ? `${readerProgress(currentPage, totalPages)}% lido`
              : `Página ${currentPage} de ${totalPages || "…"}`}
          </span>
          <span className="reader-footer-author">
            {isBookmarked ? "Página marcada" : book.author || "masterStudy"}
          </span>
        </div>
        <div className="reader-progress-controls">
          <button
            aria-label="Voltar uma página"
            disabled={currentPage <= 1}
            onClick={() =>
              fileType === "epub"
                ? epubRef.current?.prevPage()
                : handlePageChange(currentPage - (isTwoPage ? 2 : 1))
            }
          >
            <Icon name="chevron_left" />
          </button>
          <input
            aria-label="Posição no livro"
            type="range"
            min="1"
            max={Math.max(1, totalPages)}
            value={Math.min(currentPage, Math.max(1, totalPages))}
            disabled={!totalPages}
            onChange={(e) => handlePageChange(Number(e.target.value))}
          />
          <button
            aria-label="Avançar uma página"
            disabled={totalPages > 0 && currentPage >= totalPages}
            onClick={() =>
              fileType === "epub"
                ? epubRef.current?.nextPage()
                : handlePageChange(currentPage + (isTwoPage ? 2 : 1))
            }
          >
            <Icon name="chevron_right" />
          </button>
        </div>
      </footer>

      {readerNotice && (
        <div className="reader-notice" role="status">
          {readerNotice}
          <button aria-label="Fechar aviso" onClick={() => setReaderNotice("")}>
            <Icon name="close" />
          </button>
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
            try {
              window.getSelection()?.removeAllRanges();
            } catch {}
            setSelectionData(null);
            lastSelectionRef.current = null;
          }}
          onSaveAsNote={() => handleOpenSaveModal("selected_text")}
          onSaveAsQuote={() => handleOpenSaveModal("quote")}
          onCopy={() => {
            navigator.clipboard.writeText(selectionData.text);
            setSelectionData(null);
          }}
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
