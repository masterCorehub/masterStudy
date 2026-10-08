import React, { useState, useMemo, useRef } from "react";
import { Icon } from "../ui/Icon";
import { useStudyStore } from "../store/useStore";
import { BookFileImport } from "../components/books/BookFileImport";
import { BookCover } from "../components/books/BookCover";
import { BookAnnotationExcerpt } from "../components/books/BookAnnotationExcerpt";
import { retainBookFile } from "../services/book-files";
import {
  bookFileType,
  bookExtent,
  bookProgress,
  bookProgressLabel,
  mergeBookMetadata,
} from "../domain/bookMetadata";
import { SCREEN_IDS } from "../app/screenIds";

export function CampusFlowBookDetailsScreen({ onNavigate }) {
  const activeBookId = useStudyStore((state) => state.activeBookId);
  const books = useStudyStore((state) => state.books?.list || []);
  const updateBook = useStudyStore((state) => state.updateBook);
  const deleteBook = useStudyStore((state) => state.deleteBook);
  const setActiveBook = useStudyStore((state) => state.setActiveBook);

  const book = books.find((b) => b.id === activeBookId);
  const editCoverBaseline = useRef("");

  const [activeTab, setActiveTab] = useState("RESUMO"); // RESUMO, ANOTAÇÕES, CITAÇÕES, CAPÍTULOS, METAS, HISTÓRICO, AVALIAÇÃO

  // States for Modals/Forms
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [progressData, setProgressData] = useState({ pages: "", time: "" });

  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [summaryText, setSummaryText] = useState("");

  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "",
    author: "",
    edition: "",
    tags: "",
    totalPages: "",
    coverUrl: "",
  });

  // --- NOTES ---
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [editingNote, setEditingNote] = useState(null); // null = new, object = editing
  const [noteForm, setNoteForm] = useState({
    title: "",
    page: "",
    content: "",
    tags: "",
  });

  const openNewNote = () => {
    setEditingNote(null);
    setNoteForm({ title: "", page: "", content: "", tags: "" });
    setShowNoteModal(true);
  };

  const openEditNote = (note) => {
    setEditingNote(note);
    setNoteForm({
      title: note.title,
      page: note.page || "",
      content: note.content,
      tags: note.tags?.join(", ") || "",
    });
    setShowNoteModal(true);
  };

  const handleSaveNote = (e) => {
    e.preventDefault();
    const tags = noteForm.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const existing = book.notes || [];
    let updatedNotes;
    if (editingNote) {
      updatedNotes = existing.map((n) =>
        n.id === editingNote.id
          ? {
              ...n,
              ...noteForm,
              tags,
              page: Number(noteForm.page) || "",
              updatedAt: Date.now(),
            }
          : n,
      );
    } else {
      updatedNotes = [
        {
          id: `note-${Date.now()}`,
          ...noteForm,
          tags,
          page: Number(noteForm.page) || "",
          createdAt: Date.now(),
        },
        ...existing,
      ];
    }
    updateBook(book.id, { notes: updatedNotes });
    setShowNoteModal(false);
  };

  const handleDeleteNote = (noteId) => {
    updateBook(book.id, {
      notes: (book.notes || []).filter((n) => n.id !== noteId),
    });
  };

  const importBook = async ({ source, metadata, refreshCover }) => {
    const filePath = await retainBookFile(source);
    const current = useStudyStore
      .getState()
      .books.list.find((item) => item.id === book.id);
    if (!current) return;
    updateBook(book.id, {
      ...mergeBookMetadata(current, metadata, { refreshCover }),
      filePath,
    });
  };

  // --- QUOTES ---
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [editingQuote, setEditingQuote] = useState(null);
  const [quoteForm, setQuoteForm] = useState({
    text: "",
    page: "",
    context: "",
  });

  const openNewQuote = () => {
    setEditingQuote(null);
    setQuoteForm({ text: "", page: "", context: "" });
    setShowQuoteModal(true);
  };

  const openEditQuote = (quote) => {
    setEditingQuote(quote);
    setQuoteForm({
      text: quote.text,
      page: quote.page || "",
      context: quote.context || "",
    });
    setShowQuoteModal(true);
  };

  const handleSaveQuote = (e) => {
    e.preventDefault();
    const existing = book.quotes || [];
    let updatedQuotes;
    if (editingQuote) {
      updatedQuotes = existing.map((q) =>
        q.id === editingQuote.id
          ? {
              ...q,
              ...quoteForm,
              page: Number(quoteForm.page) || "",
              updatedAt: Date.now(),
            }
          : q,
      );
    } else {
      updatedQuotes = [
        {
          id: `quote-${Date.now()}`,
          ...quoteForm,
          page: Number(quoteForm.page) || "",
          createdAt: Date.now(),
        },
        ...existing,
      ];
    }
    updateBook(book.id, { quotes: updatedQuotes });
    setShowQuoteModal(false);
  };

  const handleDeleteQuote = (quoteId) => {
    updateBook(book.id, {
      quotes: (book.quotes || []).filter((q) => q.id !== quoteId),
    });
  };

  const handleRemoveBookmark = (bmId) => {
    updateBook(book.id, {
      bookmarks: (book.bookmarks || []).filter((b) => b.id !== bmId),
    });
  };

  const handleRemoveFavorite = (page) => {
    updateBook(book.id, {
      favorites: (book.favorites || []).filter(
        (f) => (typeof f === "object" ? f.page : f) !== page,
      ),
    });
  };

  const handleRemoveHighlight = (hlId) => {
    updateBook(book.id, {
      highlights: (book.highlights || []).filter((h) => h.id !== hlId),
    });
  };

  const coverFileRef = useRef(null);

  const handleCoverFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setEditForm((prev) => ({ ...prev, coverUrl: ev.target.result }));
    };
    reader.readAsDataURL(file);
  };

  if (!book) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[color:var(--on-surface-variant)]">
        <Icon name="error" className="text-4xl mb-4" />
        <p>Livro não encontrado.</p>
        <button
          onClick={() => onNavigate(SCREEN_IDS.BOOKS)}
          className="mt-4 px-4 py-2 bg-[color:var(--primary)] text-[color:var(--on-primary)] rounded-full text-sm font-bold"
        >
          Voltar para Livros
        </button>
      </div>
    );
  }

  // Derived data
  const progressPercent = bookProgress(book);
  const isEpub = bookFileType(book.filePath) === "epub";

  // Handlers
  const handleUpdateProgress = (e) => {
    e.preventDefault();
    const maximum = isEpub ? 100 : book.totalPages;
    const newPages = Math.min(Math.max(0, Number(progressData.pages)), maximum);

    let newStatus = book.status;
    if (newPages > 0 && newPages < maximum) newStatus = "READING";
    if (maximum > 0 && newPages >= maximum) newStatus = "COMPLETED";

    const newHistory = {
      id: Date.now(),
      date: new Date().toISOString(),
      ...(isEpub
        ? { progressPercent: newPages }
        : { pagesRead: newPages - (book.readPages || 0) }),
      timeSpent: Number(progressData.time) || 0,
    };

    updateBook(book.id, {
      ...(isEpub
        ? { lastPosition: { ...book.lastPosition, percent: newPages } }
        : { readPages: newPages }),
      status: newStatus,
      history: [newHistory, ...(book.history || [])],
    });

    setShowProgressModal(false);
    setProgressData({ pages: "", time: "" });
  };

  const saveSummary = () => {
    updateBook(book.id, { summary: summaryText });
    setIsEditingSummary(false);
  };

  const openSummaryEditor = () => {
    setSummaryText(book.summary || "");
    setIsEditingSummary(true);
  };

  const handleEditBook = (e) => {
    e.preventDefault();
    updateBook(book.id, {
      title: editForm.title,
      author: editForm.author,
      edition: editForm.edition,
      tags: editForm.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      totalPages: Number(editForm.totalPages),
      // An automatic recovery can finish while this form is open. Only write
      // the cover when the user changed it, so a stale draft cannot erase it.
      ...(editForm.coverUrl !== editCoverBaseline.current
        ? { coverUrl: editForm.coverUrl, coverSource: "manual" }
        : {}),
      pageCountSource:
        Number(editForm.totalPages) === Number(book.totalPages)
          ? book.pageCountSource
          : "manual",
    });
    setShowEditModal(false);
  };

  const openEditModal = () => {
    editCoverBaseline.current = book.coverUrl || "";
    setEditForm({
      title: book.title,
      author: book.author,
      edition: book.edition || "",
      tags: book.tags ? book.tags.join(", ") : "",
      totalPages: book.totalPages,
      coverUrl: book.coverUrl || "",
    });
    setShowEditModal(true);
  };

  return (
    <main className="flex-1 overflow-y-auto p-8 relative flex flex-col gap-8 bg-[color:var(--surface)] text-[color:var(--on-surface)] neo-background">
      <div className="flex items-center justify-between border-b border-[color:var(--outline-variant)]/20 px-8 py-4">
        <button
          type="button"
          onClick={() => onNavigate("BACK")}
          className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)] transition-colors"
        >
          <Icon name="arrow_back" className="text-[16px]" />
          Voltar
        </button>
        {book && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (book?.id) setActiveBook(book.id);
                if (window.studyhubDesktop?.openBookReaderWindow) {
                  window.studyhubDesktop.openBookReaderWindow(book.id);
                } else {
                  onNavigate(SCREEN_IDS.BOOK_READER);
                }
              }}
              className="px-5 py-2 rounded-xl bg-[color:var(--primary)] text-white font-bold text-xs uppercase tracking-wider shadow-md hover:opacity-90 transition-all flex items-center gap-2"
            >
              <Icon name="auto_stories" className="text-[18px]" />
              Ler Livro
            </button>
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    `Deseja realmente excluir o livro "${book.title || "Selecionado"}"?`,
                  )
                ) {
                  deleteBook(book.id);
                  onNavigate("BACK");
                }
              }}
              className="px-3 py-2 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5"
              title="Excluir livro"
            >
              <Icon name="delete" className="text-[16px]" />
              Excluir
            </button>
          </div>
        )}
      </div>

      {/* Hero Header */}
      <div className="flex flex-col md:flex-row gap-8 bg-[color:var(--surface-container-low)] p-8 rounded-3xl border border-[color:var(--outline-variant)]/20 shadow-sm relative">
        {/* Cover */}
        <div className="w-48 h-72 shrink-0 bg-[color:var(--surface-container-high)] rounded-xl overflow-hidden shadow-lg border border-[color:var(--outline-variant)]/10 flex items-center justify-center text-center p-4">
          <BookCover book={book} alt="Capa do livro" className="w-full h-full object-cover">
            <span className="text-[color:var(--on-surface-variant)] text-xs font-bold uppercase tracking-widest opacity-50">
              Sem Capa
            </span>
          </BookCover>
        </div>

        {/* Info */}
        <div className="flex-1 flex flex-col">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-4xl font-black tracking-tight mb-2 text-[color:var(--on-surface)]">
                {book.title}
              </h1>
              <p className="text-xl text-[color:var(--on-surface-variant)] mb-4 flex items-center gap-2">
                {book.author}
                {book.edition && (
                  <span className="opacity-70 text-sm">• {book.edition}</span>
                )}
              </p>
            </div>

            {/* Options Menu */}
            <div className="flex gap-2">
              <button
                onClick={openEditModal}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-[color:var(--surface-container)] hover:bg-[color:var(--surface-container-high)] text-[color:var(--on-surface-variant)] transition-colors"
                title="Editar informações"
              >
                <Icon name="edit" />
              </button>
              <button
                onClick={() => {
                  if (
                    window.confirm(
                      `Deseja realmente excluir o livro "${book.title}"?`,
                    )
                  ) {
                    deleteBook(book.id);
                    onNavigate("BACK");
                  }
                }}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-[color:var(--surface-container)] hover:bg-red-500/10 text-red-500 transition-colors"
                title="Excluir livro"
              >
                <Icon name="delete" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4 mb-6">
            <span className="text-sm font-bold text-[color:var(--on-surface-variant)] flex items-center gap-1">
              <Icon name="menu_book" className="text-[16px]" />{" "}
              <span data-testid="book-extent">{bookExtent(book)}</span>
            </span>
            <span className="text-sm font-bold text-[color:var(--on-surface-variant)] flex items-center gap-1">
              <Icon name="subject" className="text-[16px]" /> Disciplina Não
              Vinculada
            </span>
          </div>

          {book.tags && book.tags.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-8">
              {book.tags.map((tag, idx) => (
                <span
                  key={idx}
                  className="bg-[color:var(--surface)] text-[color:var(--on-surface)] text-[10px] font-bold px-3 py-1.5 uppercase tracking-wider rounded-md border border-[color:var(--outline-variant)]/20 shadow-sm"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="mt-auto">
            {/* Progress Bar & Actions */}
            <div className="flex flex-col gap-4 bg-[color:var(--surface)] p-6 rounded-2xl border border-[color:var(--outline-variant)]/20 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                      ["COMPLETED", "DONE"].includes(book.status)
                        ? "bg-green-500/10 text-green-500"
                        : book.status === "READING"
                          ? "bg-blue-500/10 text-blue-500"
                          : "bg-[color:var(--surface-container-high)] text-[color:var(--on-surface-variant)]"
                    }`}
                  >
                    {["COMPLETED", "DONE"].includes(book.status)
                      ? "Concluído"
                      : book.status === "READING"
                        ? "Lendo"
                        : "Quero Ler"}
                  </span>
                  <span className="text-sm font-bold text-[color:var(--on-surface-variant)]">
                    {bookProgressLabel(book)}
                  </span>
                </div>
                <span className="text-2xl font-black text-[color:var(--primary)]">
                  {progressPercent}%
                </span>
              </div>

              {/* Custom Progress Bar */}
              <div className="h-4 bg-[color:var(--surface-container-highest)] rounded-full overflow-hidden shadow-inner flex">
                <div
                  className="h-full bg-[color:var(--primary)] transition-all duration-1000 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => {
                    if (window.studyhubDesktop?.openBookReaderWindow) {
                      window.studyhubDesktop.openBookReaderWindow(book.id);
                    } else {
                      onNavigate(SCREEN_IDS.BOOK_READER);
                    }
                  }}
                  className="flex-1 bg-[color:var(--primary)] text-[color:var(--on-primary)] py-3 rounded-xl font-bold uppercase tracking-wider text-xs shadow-md hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                >
                  <Icon name="auto_stories" className="text-[18px]" /> Ler Livro
                </button>
                <button
                  onClick={() => setShowProgressModal(true)}
                  className="flex-1 bg-[color:var(--surface-container-highest)] text-[color:var(--on-surface)] py-3 rounded-xl font-bold uppercase tracking-wider text-xs shadow-sm hover:opacity-80 transition-opacity flex items-center justify-center gap-2"
                >
                  <Icon name="update" className="text-[18px]" /> Progresso
                </button>
              </div>
              <BookFileImport
                filePath={book.filePath}
                fileName={book.fileName || book.filePath?.split(/[\\/]/).pop()}
                onImport={importBook}
                refresh
              />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs and Tab Content Section */}
      <section className="flex flex-col">
        {/* Tabs */}
        <div className="flex overflow-x-auto gap-2 px-1 scrollbar-none border-b border-[color:var(--outline-variant)]/20">
          {[
            { id: "RESUMO", label: "Meu Resumo", icon: "article" },
            {
              id: "ANOTAÇÕES",
              label: "Anotações",
              count: (book.notes || []).length,
              icon: "sticky_note_2",
            },
            {
              id: "CITAÇÕES",
              label: "Citações",
              count: (book.quotes || []).length,
              icon: "format_quote",
            },
            {
              id: "FAVORITOS",
              label: "Páginas Salvas",
              count:
                (book.bookmarks || []).length + (book.favorites || []).length,
              icon: "bookmark",
            },
            {
              id: "GRIFOS",
              label: "Frases Grifadas",
              count: (book.highlights || []).length,
              icon: "border_color",
            },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 rounded-t-2xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 whitespace-nowrap relative top-[1px] ${
                activeTab === tab.id
                  ? "bg-[color:var(--surface-container-low)] text-[color:var(--primary)] border-t border-l border-r border-[color:var(--outline-variant)]/20 shadow-sm z-10"
                  : "text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-container-lowest)] hover:text-[color:var(--on-surface)]"
              }`}
            >
              <Icon name={tab.icon} className="text-[16px]" />
              <span>{tab.label}</span>
              {typeof tab.count === "number" && tab.count > 0 && (
                <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] bg-[color:var(--primary)]/15 text-[color:var(--primary)] font-black">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="bg-[color:var(--surface-container-low)] p-8 rounded-b-3xl rounded-tr-3xl min-h-[400px] border border-[color:var(--outline-variant)]/20 shadow-sm">
          {/* RESUMO TAB */}
          {activeTab === "RESUMO" && (
            <div className="flex flex-col h-full">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-[color:var(--on-surface)]">
                  Meu Resumo
                </h3>
                {!isEditingSummary && (
                  <button
                    onClick={openSummaryEditor}
                    className="text-xs font-bold uppercase tracking-wider text-[color:var(--primary)] hover:opacity-80 flex items-center gap-1"
                  >
                    <Icon name="edit" className="text-[16px]" /> Editar Resumo
                  </button>
                )}
              </div>

              {isEditingSummary ? (
                <div className="flex flex-col gap-4 flex-1">
                  <textarea
                    value={summaryText}
                    onChange={(e) => setSummaryText(e.target.value)}
                    placeholder="Escreva os principais conceitos, o que aprendeu, aplicações práticas..."
                    className="flex-1 min-h-[300px] bg-[color:var(--surface)] border border-[color:var(--outline-variant)]/30 rounded-2xl p-6 outline-none focus:border-[color:var(--primary)] resize-none"
                  />
                  <div className="flex gap-4 justify-end">
                    <button
                      onClick={() => setIsEditingSummary(false)}
                      className="px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-container)]"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={saveSummary}
                      className="px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider bg-[color:var(--primary)] text-[color:var(--on-primary)] shadow-md"
                    >
                      Salvar Resumo
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-[color:var(--surface)] p-8 rounded-2xl border border-[color:var(--outline-variant)]/10 flex-1 whitespace-pre-wrap">
                  {book.summary ? (
                    <p className="text-[color:var(--on-surface)] leading-relaxed">
                      {book.summary}
                    </p>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-[color:var(--on-surface-variant)] opacity-50 py-12">
                      <Icon name="article" className="text-4xl mb-4" />
                      <p>Nenhum resumo adicionado ainda.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ANOTAÇÕES TAB */}
          {activeTab === "ANOTAÇÕES" && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-bold text-[color:var(--on-surface)]">
                    Anotações do Livro
                  </h3>
                  <p className="text-xs text-[color:var(--on-surface-variant)] mt-0.5">
                    {(book.notes || []).length} anotações
                  </p>
                </div>
                <button
                  onClick={openNewNote}
                  className="bg-[color:var(--primary)] text-white px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-md hover:opacity-90 transition-opacity"
                >
                  <Icon name="add" className="text-[16px]" /> Nova Anotação
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {book.notes && book.notes.length > 0 ? (
                  book.notes.map((note) => (
                    <div
                      key={note.id}
                      className="bg-[color:var(--surface)] p-5 rounded-2xl border border-[color:var(--outline-variant)]/20 shadow-sm relative group hover:border-[color:var(--primary)]/50 transition-colors"
                    >
                      {/* Action buttons */}
                      <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEditNote(note)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg bg-[color:var(--surface-container-high)] text-[color:var(--on-surface-variant)] hover:text-[color:var(--primary)] transition-colors"
                        >
                          <Icon name="edit" className="text-[14px]" />
                        </button>
                        <button
                          onClick={() => handleDeleteNote(note.id)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg bg-[color:var(--surface-container-high)] text-[color:var(--on-surface-variant)] hover:text-red-500 transition-colors"
                        >
                          <Icon name="delete" className="text-[14px]" />
                        </button>
                      </div>

                      <div className="flex justify-between items-start mb-2 pr-16">
                        <h4 className="font-bold text-[color:var(--on-surface)] leading-snug">
                          {note.title || "Anotação"}
                        </h4>
                      </div>
                      {note.page && (
                        <span className="inline-block text-[10px] font-bold text-[color:var(--on-surface-variant)] bg-[color:var(--surface-container-high)] px-2 py-1 rounded-md mb-3">
                          Página {note.page}
                        </span>
                      )}
                      <BookAnnotationExcerpt annotation={note} highlights={book.highlights} />
                      <p className="text-sm text-[color:var(--on-surface-variant)] line-clamp-4 mb-4 leading-relaxed whitespace-pre-wrap">
                        {note.content}
                      </p>
                      {note.tags?.length > 0 && (
                        <div className="flex gap-1.5 flex-wrap">
                          {note.tags.map((tag) => (
                            <span
                              key={tag}
                              className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[color:var(--primary)]/10 text-[color:var(--primary)]"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="col-span-full flex flex-col items-center justify-center py-16 text-[color:var(--on-surface-variant)] opacity-50">
                    <Icon name="note_add" className="text-5xl mb-4" />
                    <p className="font-bold">Nenhuma anotação ainda</p>
                    <p className="text-xs mt-1">
                      Crie anotações vinculadas às páginas do livro.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CITAÇÕES TAB */}
          {activeTab === "CITAÇÕES" && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-bold text-[color:var(--on-surface)]">
                    Citações Marcadas
                  </h3>
                  <p className="text-xs text-[color:var(--on-surface-variant)] mt-0.5">
                    {(book.quotes || []).length} citações
                  </p>
                </div>
                <button
                  onClick={openNewQuote}
                  className="bg-[color:var(--primary)] text-white px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-md hover:opacity-90 transition-opacity"
                >
                  <Icon name="format_quote" className="text-[16px]" /> Nova
                  Citação
                </button>
              </div>
              <div className="flex flex-col gap-4">
                {book.quotes && book.quotes.length > 0 ? (
                  book.quotes.map((quote) => (
                    <div
                      key={quote.id}
                      className="group bg-[color:var(--surface)] p-6 rounded-2xl border-l-4 border-l-[color:var(--primary)] border border-[color:var(--outline-variant)]/20 shadow-sm relative hover:border-[color:var(--primary)]/30 transition-colors"
                    >
                      {/* Action buttons */}
                      <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() =>
                            navigator.clipboard.writeText(quote.text)
                          }
                          title="Copiar"
                          className="w-7 h-7 flex items-center justify-center rounded-lg bg-[color:var(--surface-container-high)] text-[color:var(--on-surface-variant)] hover:text-[color:var(--primary)] transition-colors"
                        >
                          <Icon name="content_copy" className="text-[14px]" />
                        </button>
                        <button
                          onClick={() => openEditQuote(quote)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg bg-[color:var(--surface-container-high)] text-[color:var(--on-surface-variant)] hover:text-[color:var(--primary)] transition-colors"
                        >
                          <Icon name="edit" className="text-[14px]" />
                        </button>
                        <button
                          onClick={() => handleDeleteQuote(quote.id)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg bg-[color:var(--surface-container-high)] text-[color:var(--on-surface-variant)] hover:text-red-500 transition-colors"
                        >
                          <Icon name="delete" className="text-[14px]" />
                        </button>
                      </div>

                      <Icon
                        name="format_quote"
                        className="text-5xl text-[color:var(--primary)] opacity-10 absolute top-4 left-4"
                      />
                      <p className="text-base italic text-[color:var(--on-surface)] mb-3 pl-8 relative z-10 leading-relaxed">
                        "{quote.text}"
                      </p>
                      <div className="pl-8 flex flex-col gap-1">
                        {quote.page && (
                          <span className="text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider">
                            Página {quote.page}
                          </span>
                        )}
                        {quote.context && (
                          <p className="text-xs text-[color:var(--on-surface-variant)] opacity-70 italic">
                            {quote.context}
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-[color:var(--on-surface-variant)] opacity-50">
                    <Icon name="format_quote" className="text-5xl mb-4" />
                    <p className="font-bold">Nenhuma citação ainda</p>
                    <p className="text-xs mt-1">
                      Salve trechos importantes e frases marcantes do livro.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* FAVORITOS TAB */}
          {activeTab === "FAVORITOS" && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-bold text-[color:var(--on-surface)] flex items-center gap-2">
                    <Icon name="bookmark" className="text-amber-500" />
                    Páginas Favoritadas e Marcadores
                  </h3>
                  <p className="text-xs text-[color:var(--on-surface-variant)] mt-0.5">
                    {(book.bookmarks || []).length +
                      (book.favorites || []).length}{" "}
                    páginas marcadas
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(book.bookmarks || []).length > 0 ||
                (book.favorites || []).length > 0 ? (
                  <>
                    {(book.bookmarks || []).map((bm) => (
                      <div
                        key={bm.id}
                        className="bg-[color:var(--surface)] p-5 rounded-2xl border border-[color:var(--outline-variant)]/20 shadow-sm flex flex-col justify-between group hover:border-amber-500/40 transition-all"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center font-bold">
                              <Icon name="bookmark" className="text-[20px]" />
                            </div>
                            <div>
                              <h4 className="font-bold text-sm text-[color:var(--on-surface)]">
                                Página {bm.page}
                              </h4>
                              <p className="text-[11px] text-[color:var(--on-surface-variant)]">
                                {bm.label || "Marcador de página"}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleRemoveBookmark(bm.id)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-[color:var(--surface-container-high)] text-[color:var(--on-surface-variant)] hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                            title="Remover Marcador"
                          >
                            <Icon name="delete" className="text-[14px]" />
                          </button>
                        </div>

                        <button
                          onClick={() => {
                            if (window.studyhubDesktop?.openBookReaderWindow) {
                              window.studyhubDesktop.openBookReaderWindow(
                                book.id,
                              );
                            } else {
                              onNavigate(SCREEN_IDS.BOOK_READER);
                            }
                          }}
                          className="w-full mt-2 py-2 px-3 bg-[color:var(--surface-container-high)] hover:bg-[color:var(--primary)] hover:text-white text-[color:var(--on-surface-variant)] rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                        >
                          <Icon name="auto_stories" className="text-[14px]" />
                          Ir para a Página
                        </button>
                      </div>
                    ))}

                    {(book.favorites || []).map((fav, i) => {
                      const pageNum = typeof fav === "object" ? fav.page : fav;
                      return (
                        <div
                          key={`fav-${pageNum}-${i}`}
                          className="bg-[color:var(--surface)] p-5 rounded-2xl border border-[color:var(--outline-variant)]/20 shadow-sm flex flex-col justify-between group hover:border-amber-500/40 transition-all"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center font-bold">
                                <Icon name="star" className="text-[20px]" />
                              </div>
                              <div>
                                <h4 className="font-bold text-sm text-[color:var(--on-surface)]">
                                  Página {pageNum}
                                </h4>
                                <p className="text-[11px] text-[color:var(--on-surface-variant)]">
                                  Página favoritada
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={() => handleRemoveFavorite(pageNum)}
                              className="w-7 h-7 flex items-center justify-center rounded-lg bg-[color:var(--surface-container-high)] text-[color:var(--on-surface-variant)] hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                              title="Remover Favorito"
                            >
                              <Icon name="delete" className="text-[14px]" />
                            </button>
                          </div>

                          <button
                            onClick={() => {
                              if (
                                window.studyhubDesktop?.openBookReaderWindow
                              ) {
                                window.studyhubDesktop.openBookReaderWindow(
                                  book.id,
                                );
                              } else {
                                onNavigate(SCREEN_IDS.BOOK_READER);
                              }
                            }}
                            className="w-full mt-2 py-2 px-3 bg-[color:var(--surface-container-high)] hover:bg-[color:var(--primary)] hover:text-white text-[color:var(--on-surface-variant)] rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                          >
                            <Icon name="auto_stories" className="text-[14px]" />
                            Ir para a Página
                          </button>
                        </div>
                      );
                    })}
                  </>
                ) : (
                  <div className="col-span-full flex flex-col items-center justify-center py-16 text-[color:var(--on-surface-variant)] opacity-50">
                    <Icon name="bookmark_border" className="text-5xl mb-4" />
                    <p className="font-bold">
                      Nenhuma página salva ou favoritada
                    </p>
                    <p className="text-xs mt-1">
                      Marque páginas durante a leitura para acessá-las
                      rapidamente aqui.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* GRIFOS TAB */}
          {activeTab === "GRIFOS" && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-bold text-[color:var(--on-surface)] flex items-center gap-2">
                    <Icon
                      name="border_color"
                      className="text-[color:var(--primary)]"
                    />
                    Frases e Trechos Grifados
                  </h3>
                  <p className="text-xs text-[color:var(--on-surface-variant)] mt-0.5">
                    {(book.highlights || []).length} frases salvas
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                {book.highlights && book.highlights.length > 0 ? (
                  book.highlights.map((hl) => {
                    const colorConfig = {
                      yellow: {
                        border: "border-l-yellow-400",
                        bg: "bg-yellow-400/10",
                        text: "text-yellow-600 dark:text-yellow-400",
                      },
                      green: {
                        border: "border-l-green-500",
                        bg: "bg-green-500/10",
                        text: "text-green-600 dark:text-green-400",
                      },
                      blue: {
                        border: "border-l-blue-500",
                        bg: "bg-blue-500/10",
                        text: "text-blue-600 dark:text-blue-400",
                      },
                      pink: {
                        border: "border-l-pink-500",
                        bg: "bg-pink-500/10",
                        text: "text-pink-600 dark:text-pink-400",
                      },
                      orange: {
                        border: "border-l-orange-500",
                        bg: "bg-orange-500/10",
                        text: "text-orange-600 dark:text-orange-400",
                      },
                    }[hl.color] || {
                      border: "border-l-yellow-400",
                      bg: "bg-yellow-400/10",
                      text: "text-yellow-600 dark:text-yellow-400",
                    };

                    return (
                      <div
                        key={hl.id}
                        className={`group bg-[color:var(--surface)] p-6 rounded-2xl border-l-4 ${colorConfig.border} border border-[color:var(--outline-variant)]/20 shadow-sm relative hover:border-[color:var(--primary)]/30 transition-all flex flex-col justify-between gap-3`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${colorConfig.bg} ${colorConfig.text}`}
                            >
                              Grifo {hl.color || "amarelo"}
                            </span>
                            {hl.page && (
                              <span className="text-xs font-bold text-[color:var(--on-surface-variant)] bg-[color:var(--surface-container-high)] px-2.5 py-0.5 rounded-md">
                                Página {hl.page}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() =>
                                navigator.clipboard.writeText(hl.text)
                              }
                              className="w-7 h-7 flex items-center justify-center rounded-lg bg-[color:var(--surface-container-high)] text-[color:var(--on-surface-variant)] hover:text-[color:var(--primary)] transition-colors"
                              title="Copiar Frase"
                            >
                              <Icon
                                name="content_copy"
                                className="text-[14px]"
                              />
                            </button>
                            <button
                              onClick={() => handleRemoveHighlight(hl.id)}
                              className="w-7 h-7 flex items-center justify-center rounded-lg bg-[color:var(--surface-container-high)] text-[color:var(--on-surface-variant)] hover:text-red-500 transition-colors"
                              title="Apagar Grifo"
                            >
                              <Icon name="delete" className="text-[14px]" />
                            </button>
                          </div>
                        </div>

                        <p className="text-base font-medium text-[color:var(--on-surface)] leading-relaxed whitespace-pre-wrap">
                          "{hl.text}"
                        </p>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-[color:var(--on-surface-variant)] opacity-50">
                    <Icon name="border_color" className="text-5xl mb-4" />
                    <p className="font-bold">Nenhuma frase grifada ainda</p>
                    <p className="text-xs mt-1">
                      Grife trechos no leitor para que suas frases salvas
                      apareçam organizadas aqui.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* NOTE MODAL */}
      {showNoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <form
            onSubmit={handleSaveNote}
            className="bg-[color:var(--surface)] w-full max-w-lg rounded-3xl p-8 shadow-2xl relative"
          >
            <button
              type="button"
              onClick={() => setShowNoteModal(false)}
              className="absolute top-4 right-4 text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]"
            >
              <Icon name="close" />
            </button>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-2xl bg-[color:var(--primary)]/10 text-[color:var(--primary)] flex items-center justify-center">
                <Icon name="sticky_note_2" />
              </div>
              <h2 className="text-xl font-bold text-[color:var(--on-surface)]">
                {editingNote ? "Editar Anotação" : "Nova Anotação"}
              </h2>
            </div>

            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1">
                    Título *
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="Ex: Conceito importante"
                    value={noteForm.title}
                    onChange={(e) =>
                      setNoteForm({ ...noteForm, title: e.target.value })
                    }
                    className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-2.5 outline-none focus:border-[color:var(--primary)] text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1">
                    Página
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="Ex: 42"
                    value={noteForm.page}
                    onChange={(e) =>
                      setNoteForm({ ...noteForm, page: e.target.value })
                    }
                    className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-2.5 outline-none focus:border-[color:var(--primary)] text-sm font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1">
                  Conteúdo *
                </label>
                <textarea
                  required
                  rows={6}
                  placeholder="Escreva sua anotação aqui..."
                  value={noteForm.content}
                  onChange={(e) =>
                    setNoteForm({ ...noteForm, content: e.target.value })
                  }
                  className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 outline-none focus:border-[color:var(--primary)] text-sm resize-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1">
                  Tags (separadas por vírgula)
                </label>
                <input
                  type="text"
                  placeholder="Ex: conceito, revisão, importante"
                  value={noteForm.tags}
                  onChange={(e) =>
                    setNoteForm({ ...noteForm, tags: e.target.value })
                  }
                  className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-2.5 outline-none focus:border-[color:var(--primary)] text-sm"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6 pt-4 border-t border-[color:var(--outline-variant)]/10">
              <button
                type="button"
                onClick={() => setShowNoteModal(false)}
                className="w-1/2 bg-[color:var(--surface-container-high)] text-[color:var(--on-surface)] font-bold py-3 rounded-xl uppercase tracking-wider text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="w-1/2 bg-[color:var(--primary)] text-white font-bold py-3 rounded-xl shadow-md uppercase tracking-wider text-xs"
              >
                {editingNote ? "Salvar Alterações" : "Criar Anotação"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* QUOTE MODAL */}
      {showQuoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <form
            onSubmit={handleSaveQuote}
            className="bg-[color:var(--surface)] w-full max-w-lg rounded-3xl p-8 shadow-2xl relative"
          >
            <button
              type="button"
              onClick={() => setShowQuoteModal(false)}
              className="absolute top-4 right-4 text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]"
            >
              <Icon name="close" />
            </button>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                <Icon name="format_quote" />
              </div>
              <h2 className="text-xl font-bold text-[color:var(--on-surface)]">
                {editingQuote ? "Editar Citação" : "Nova Citação"}
              </h2>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-[10px] font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1">
                  Trecho / Citação *
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="Cole ou escreva a citação aqui..."
                  value={quoteForm.text}
                  onChange={(e) =>
                    setQuoteForm({ ...quoteForm, text: e.target.value })
                  }
                  className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 outline-none focus:border-[color:var(--primary)] text-sm italic resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1">
                    Página
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="Ex: 87"
                    value={quoteForm.page}
                    onChange={(e) =>
                      setQuoteForm({ ...quoteForm, page: e.target.value })
                    }
                    className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-2.5 outline-none focus:border-[color:var(--primary)] text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1">
                    Contexto (opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Cap. 3 — Introdução"
                    value={quoteForm.context}
                    onChange={(e) =>
                      setQuoteForm({ ...quoteForm, context: e.target.value })
                    }
                    className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-2.5 outline-none focus:border-[color:var(--primary)] text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6 pt-4 border-t border-[color:var(--outline-variant)]/10">
              <button
                type="button"
                onClick={() => setShowQuoteModal(false)}
                className="w-1/2 bg-[color:var(--surface-container-high)] text-[color:var(--on-surface)] font-bold py-3 rounded-xl uppercase tracking-wider text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="w-1/2 bg-amber-500 text-white font-bold py-3 rounded-xl shadow-md uppercase tracking-wider text-xs hover:opacity-90 transition-opacity"
              >
                {editingQuote ? "Salvar Alterações" : "Adicionar Citação"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Progress Update Modal */}
      {showProgressModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <form
            onSubmit={handleUpdateProgress}
            className="neo-raised bg-[color:var(--surface)] w-full max-w-sm rounded-3xl p-8 shadow-2xl relative"
          >
            <button
              type="button"
              onClick={() => setShowProgressModal(false)}
              className="absolute top-4 right-4 text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]"
            >
              <Icon name="close" />
            </button>
            <h2 className="text-xl font-bold mb-6 text-[color:var(--on-surface)]">
              Atualizar Progresso
            </h2>

            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-2">
                  {isEpub ? "Porcentagem lida" : "Página atual"}
                </label>
                <div className="relative">
                  <input
                    required
                    type="number"
                    min="0"
                    max={isEpub ? 100 : book.totalPages || undefined}
                    value={progressData.pages}
                    onChange={(e) =>
                      setProgressData({
                        ...progressData,
                        pages: e.target.value,
                      })
                    }
                    placeholder={String(
                      isEpub ? progressPercent : book.readPages || 0,
                    )}
                    className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl pl-4 pr-16 py-3 outline-none focus:border-[color:var(--on-surface)] text-xl font-bold"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[color:var(--on-surface-variant)] font-bold">
                    / {isEpub ? "100%" : book.totalPages || "—"}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-2">
                  Tempo lido hoje (minutos)
                </label>
                <input
                  type="number"
                  min="0"
                  value={progressData.time}
                  onChange={(e) =>
                    setProgressData({ ...progressData, time: e.target.value })
                  }
                  placeholder="Ex: 35"
                  className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-3 outline-none focus:border-[color:var(--on-surface)]"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full mt-8 bg-[color:var(--on-surface)] text-[color:var(--surface)] font-bold py-3 rounded-xl shadow-md transition-all hover:bg-[color:var(--on-surface-variant)] uppercase tracking-widest text-xs"
            >
              Salvar Progresso
            </button>
          </form>
        </div>
      )}

      {/* Edit Book Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <form
            onSubmit={handleEditBook}
            className="neo-raised bg-[color:var(--surface)] w-full max-w-lg rounded-3xl p-8 shadow-2xl relative"
          >
            <button
              type="button"
              onClick={() => setShowEditModal(false)}
              className="absolute top-4 right-4 text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]"
            >
              <Icon name="close" />
            </button>
            <h2 className="text-xl font-bold mb-6 text-[color:var(--on-surface)]">
              Editar Livro
            </h2>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-[10px] font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1">
                  Título
                </label>
                <input
                  required
                  type="text"
                  value={editForm.title}
                  onChange={(e) =>
                    setEditForm({ ...editForm, title: e.target.value })
                  }
                  className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-2 outline-none focus:border-[color:var(--on-surface)] text-sm font-bold"
                />
              </div>
              <div className="col-span-1">
                <label className="block text-[10px] font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1">
                  Autor
                </label>
                <input
                  required
                  type="text"
                  value={editForm.author}
                  onChange={(e) =>
                    setEditForm({ ...editForm, author: e.target.value })
                  }
                  className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-2 outline-none focus:border-[color:var(--on-surface)] text-sm font-bold"
                />
              </div>
              <div className="col-span-1">
                <label className="block text-[10px] font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1">
                  Edição
                </label>
                <input
                  type="text"
                  value={editForm.edition}
                  onChange={(e) =>
                    setEditForm({ ...editForm, edition: e.target.value })
                  }
                  className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-2 outline-none focus:border-[color:var(--on-surface)] text-sm font-bold"
                />
              </div>
              <div className="col-span-1">
                <label className="block text-[10px] font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1">
                  Tags (separadas por vírgula)
                </label>
                <input
                  type="text"
                  value={editForm.tags}
                  onChange={(e) =>
                    setEditForm({ ...editForm, tags: e.target.value })
                  }
                  className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-2 outline-none focus:border-[color:var(--on-surface)] text-sm font-bold"
                />
              </div>
              <div className="col-span-1">
                <label className="block text-[10px] font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-1">
                  Total de Páginas
                </label>
                <input
                  type="number"
                  min="1"
                  value={editForm.totalPages || ""}
                  onChange={(e) =>
                    setEditForm({ ...editForm, totalPages: e.target.value })
                  }
                  className="w-full bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/30 rounded-xl px-4 py-2 outline-none focus:border-[color:var(--on-surface)] text-sm font-bold"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-2">
                  Imagem de Capa
                </label>
                <div className="flex items-center gap-4">
                  {/* Preview */}
                  <div className="w-20 h-28 shrink-0 rounded-xl overflow-hidden border-2 border-dashed border-[color:var(--outline-variant)]/40 bg-[color:var(--surface-container-high)] flex items-center justify-center">
                    {editForm.coverUrl ? (
                      <img
                        src={editForm.coverUrl}
                        alt="Preview da capa"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Icon
                        name="image"
                        className="text-2xl text-[color:var(--on-surface-variant)] opacity-40"
                      />
                    )}
                  </div>
                  {/* Buttons */}
                  <div className="flex flex-col gap-2 flex-1">
                    <input
                      ref={coverFileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleCoverFileChange}
                    />
                    <button
                      type="button"
                      onClick={() => coverFileRef.current?.click()}
                      className="w-full flex items-center justify-center gap-2 bg-[color:var(--primary)] text-white text-xs font-bold py-2.5 px-4 rounded-xl uppercase tracking-wider shadow-sm hover:opacity-90 transition-opacity"
                    >
                      <Icon name="upload" className="text-[16px]" />
                      Escolher Imagem
                    </button>
                    {editForm.coverUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          setEditForm((prev) => ({ ...prev, coverUrl: "" }))
                        }
                        className="w-full flex items-center justify-center gap-2 bg-[color:var(--surface-container-high)] text-[color:var(--on-surface-variant)] text-xs font-bold py-2 px-4 rounded-xl uppercase tracking-wider hover:text-red-500 transition-colors"
                      >
                        <Icon name="delete" className="text-[16px]" />
                        Remover Capa
                      </button>
                    )}
                    <p className="text-[10px] text-[color:var(--on-surface-variant)] opacity-60 text-center">
                      JPG, PNG, WEBP...
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="w-full mt-8 bg-[color:var(--on-surface)] text-[color:var(--surface)] font-bold py-3 rounded-xl shadow-md transition-all hover:bg-[color:var(--on-surface-variant)] uppercase tracking-widest text-xs"
            >
              Salvar Alterações
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
