import React, { useEffect, useRef, useState } from "react";
import { Icon } from "../../ui/Icon";
import { BookAnnotationExcerpt } from "../../components/books/BookAnnotationExcerpt";

const HIGHLIGHT_COLORS = {
  yellow: "#fef08a",
  green: "#bbf7d0",
  blue: "#bfdbfe",
  pink: "#fbcfe8",
  orange: "#fed7aa",
};

function formatDate(ts) {
  return new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function ReaderSidebar({ book, toc, currentPage, onNavigatePage, onNavigateCfi, onNavigateAnnotation, onRemoveHighlight, onRemoveBookmark, onToggleFavorite, onRemoveNote, onRemoveQuote, onAddPageNote, activeTab, onTabChange, onClose, totalPages, fileType, pdfRef }) {
  const highlights = book?.highlights || [];
  const bookmarks = book?.bookmarks || [];
  const favorites = book?.favorites || [];
  const notes = book?.notes || [];
  const quotes = book?.quotes || [];

  const tabs = [
    { id: "toc", icon: "list", label: "Índice" },
    { id: "bookmarks", icon: "bookmark", label: "Marcadores" },
    { id: "favorites", icon: "star", label: "Favoritos" },
    { id: "highlights", icon: "format_ink_highlighter", label: "Grifos" },
    { id: "notes", icon: "sticky_note_2", label: "Notas" },
    { id: "quotes", icon: "format_quote", label: "Citações" },
  ];

  return (
    <aside className="reader-library-panel" aria-label="Sumário e anotações">
      <div className="reader-panel-heading"><h2>Seu livro</h2><button aria-label="Fechar sumário" onClick={onClose}><Icon name="close" /></button></div>
      <div className="reader-sidebar-book"><strong>{book.title}</strong><small>{book.author || "Biblioteca pessoal"}</small></div>
      {/* Tab bar */}
      <div className="reader-sidebar-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            title={tab.label}
            className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors ${
              activeTab === tab.id
                ? "bg-[color:var(--primary)] text-white"
                : "text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-container-high)]"
            }`}
          >
            <Icon name={tab.icon} className="text-[14px]" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">

        {/* TABLE OF CONTENTS */}
        {activeTab === "toc" && (
          <div>
            <p className="text-[10px] font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-3 px-1">Índice</p>
            {toc && toc.length > 0 ? (
              toc.map((item, i) => (
                <button
                  key={i}
                  onClick={() => item.cfi ? onNavigateCfi(item.cfi) : item.page ? onNavigatePage(item.page) : null}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-[color:var(--on-surface)] hover:bg-[color:var(--surface-container-high)] transition-colors"
                  style={{ paddingLeft: `${12 + (item.level || 0) * 12}px` }}
                >
                  {item.label}
                  {item.page && <span className="ml-auto float-right text-[color:var(--on-surface-variant)] text-[10px]">p.{item.page}</span>}
                </button>
              ))
            ) : (
              <p className="reader-panel-intro">{fileType === "pdf" ? "Este PDF não tem sumário. Navegue pelas páginas abaixo." : "Este livro não contém um sumário."}</p>
            )}
          </div>
        )}

        {activeTab === "toc" && fileType === "pdf" && <div className="reader-thumbnails">{Array.from({ length: totalPages }, (_, i) => <PdfThumbnail key={i} page={i + 1} pdfRef={pdfRef} active={currentPage === i + 1} onNavigate={onNavigatePage} />)}</div>}

        {/* BOOKMARKS */}
        {activeTab === "bookmarks" && (
          <div>
            <p className="text-[10px] font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-3 px-1">
              Marcadores de Página
            </p>
            {bookmarks.length > 0 ? bookmarks.map(bm => (
              <div key={bm.id} className="group flex items-center gap-2 bg-[color:var(--surface)] rounded-xl px-3 py-2.5 hover:border-[color:var(--primary)]/30 border border-transparent transition-colors cursor-pointer"
                onClick={() => bm.cfi ? onNavigateCfi(bm.cfi) : onNavigatePage(bm.page)}>
                <Icon name="bookmark" className="text-[color:var(--primary)] text-[18px] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-[color:var(--on-surface)] truncate">
                    {bm.label || `Página ${bm.page}`}
                  </p>
                  <p className="text-[10px] text-[color:var(--on-surface-variant)]">{formatDate(bm.createdAt)}</p>
                </div>
                <button onClick={e => { e.stopPropagation(); onRemoveBookmark(bm.id); }}
                  className="opacity-0 group-hover:opacity-100 text-[color:var(--on-surface-variant)] hover:text-red-500 transition-all">
                  <Icon name="close" className="text-[14px]" />
                </button>
              </div>
            )) : <EmptyState icon="bookmark_border" text="Nenhum marcador ainda" />}
          </div>
        )}

        {/* FAVORITES */}
        {activeTab === "favorites" && (
          <div>
            <p className="text-[10px] font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-3 px-1">
              Páginas Favoritas
            </p>
            {favorites.length > 0 ? favorites.map(fav => (
              <div key={fav.id} className="group flex items-center gap-2 bg-[color:var(--surface)] rounded-xl px-3 py-2.5 border border-transparent hover:border-amber-500/30 transition-colors cursor-pointer"
                onClick={() => fav.cfi ? onNavigateCfi(fav.cfi) : onNavigatePage(fav.page)}>
                <Icon name="star" className="text-amber-500 text-[18px] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-[color:var(--on-surface)]">Página {fav.page}</p>
                  <p className="text-[10px] text-[color:var(--on-surface-variant)]">{formatDate(fav.createdAt)}</p>
                </div>
                <button onClick={e => { e.stopPropagation(); onToggleFavorite(fav.page, fav.cfi); }}
                  className="opacity-0 group-hover:opacity-100 text-[color:var(--on-surface-variant)] hover:text-red-500 transition-all">
                  <Icon name="close" className="text-[14px]" />
                </button>
              </div>
            )) : <EmptyState icon="star_border" text="Nenhum favorito ainda" />}
          </div>
        )}

        {/* HIGHLIGHTS */}
        {activeTab === "highlights" && (
          <div>
            <p className="text-[10px] font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-3 px-1">
              Grifos ({highlights.length})
            </p>
            {highlights.length > 0 ? highlights.map(h => (
              <div key={h.id}
                className="group bg-[color:var(--surface)] rounded-xl p-3 border border-transparent hover:border-[color:var(--outline-variant)]/30 transition-colors cursor-pointer"
                onClick={() => onNavigateAnnotation(h)}>
                <div className="flex items-start gap-2">
                  <div className="w-1 rounded-full self-stretch mt-0.5 shrink-0" style={{ backgroundColor: HIGHLIGHT_COLORS[h.color] || "#fef08a" }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[color:var(--on-surface)] leading-relaxed italic line-clamp-3">"{h.text}"</p>
                    <p className="text-[10px] text-[color:var(--on-surface-variant)] mt-1">
                      p.{h.page} • {formatDate(h.createdAt)}
                    </p>
                  </div>
                  <button onClick={e => { e.stopPropagation(); onRemoveHighlight(h.id); }}
                    className="opacity-0 group-hover:opacity-100 text-[color:var(--on-surface-variant)] hover:text-red-500 transition-all shrink-0">
                    <Icon name="close" className="text-[14px]" />
                  </button>
                </div>
              </div>
            )) : <EmptyState icon="format_ink_highlighter" text="Nenhum grifo ainda" />}
          </div>
        )}

        {/* NOTES & QUOTES */}
        {(activeTab === "notes" || activeTab === "quotes") && (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-[10px] font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider">
                {activeTab === "quotes" ? `Citações (${quotes.length})` : `Anotações (${notes.length})`}
              </p>
              <button
                onClick={onAddPageNote}
                className="flex items-center gap-1 text-[10px] font-bold text-[color:var(--primary)] hover:underline"
              >
                <Icon name="add" className="text-[14px]" />
                Página {currentPage}
              </button>
            </div>

            {(activeTab === "quotes" ? quotes.length === 0 : notes.length === 0) && (
              <div className="text-center py-8">
                <EmptyState icon="sticky_note_2" text="Nenhuma anotação ainda" />
                <button
                  onClick={onAddPageNote}
                  className="mt-2 px-3 py-1.5 bg-[color:var(--primary)]/10 text-[color:var(--primary)] text-xs font-bold rounded-xl hover:bg-[color:var(--primary)]/20 transition-colors inline-flex items-center gap-1.5"
                >
                  <Icon name="note_add" className="text-[14px]" />
                  Anotar página {currentPage}
                </button>
              </div>
            )}

            {(activeTab === "notes" ? notes : []).map(n => (
              <div
                key={n.id}
                className="group relative bg-[color:var(--surface)] rounded-xl p-3 border border-[color:var(--outline-variant)]/20 hover:border-[color:var(--primary)]/30 transition-colors cursor-pointer"
                onClick={() => onNavigateAnnotation(n)}
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Icon name="sticky_note_2" className="text-[14px] text-[color:var(--primary)]" />
                  <span className="text-[10px] font-bold text-[color:var(--primary)] uppercase tracking-wider">Anotação</span>
                  {n.page && <span className="ml-auto text-[10px] font-bold text-[color:var(--on-surface-variant)] bg-[color:var(--surface-container-high)] px-1.5 py-0.5 rounded-md">p.{n.page}</span>}
                  {onRemoveNote && (
                    <button
                      onClick={e => { e.stopPropagation(); onRemoveNote(n.id); }}
                      className="opacity-0 group-hover:opacity-100 text-[color:var(--on-surface-variant)] hover:text-red-500 transition-all ml-1"
                      title="Excluir anotação"
                    >
                      <Icon name="close" className="text-[14px]" />
                    </button>
                  )}
                </div>

                <BookAnnotationExcerpt annotation={n} highlights={highlights} />

                {n.content && <p className="text-xs text-[color:var(--on-surface-variant)] leading-relaxed">{n.content}</p>}
                <button aria-label="Abrir anotação no livro" className="text-xs text-[color:var(--primary)] mt-2" onClick={e => { e.stopPropagation(); onNavigateAnnotation(n); }}>Ir para trecho</button>
              </div>
            ))}

            {(activeTab === "quotes" ? quotes : []).map(q => (
              <div
                key={q.id}
                className="group relative bg-[color:var(--surface)] rounded-xl p-3 border-l-4 border-l-amber-500 border border-[color:var(--outline-variant)]/20 hover:border-amber-500/40 transition-colors cursor-pointer"
                onClick={() => onNavigateAnnotation(q)}
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Icon name="format_quote" className="text-[14px] text-amber-500" />
                  <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Citação</span>
                  {q.page && <span className="ml-auto text-[10px] font-bold text-[color:var(--on-surface-variant)] bg-[color:var(--surface-container-high)] px-1.5 py-0.5 rounded-md">p.{q.page}</span>}
                  {onRemoveQuote && (
                    <button
                      onClick={e => { e.stopPropagation(); onRemoveQuote(q.id); }}
                      className="opacity-0 group-hover:opacity-100 text-[color:var(--on-surface-variant)] hover:text-red-500 transition-all ml-1"
                      title="Excluir citação"
                    >
                      <Icon name="close" className="text-[14px]" />
                    </button>
                  )}
                </div>
                <p className="text-xs italic text-[color:var(--on-surface-variant)] leading-relaxed line-clamp-4">"{q.text}"</p>
                <button aria-label="Abrir citação no livro" className="text-xs text-[color:var(--primary)] mt-2" onClick={e => { e.stopPropagation(); onNavigateAnnotation(q); }}>Ir para trecho</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function EmptyState({ icon, text }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-[color:var(--on-surface-variant)] opacity-40">
      <Icon name={icon} className="text-4xl mb-2" />
      <p className="text-xs font-bold text-center">{text}</p>
    </div>
  );
}

function PdfThumbnail({ page, pdfRef, active, onNavigate }) {
  const element = useRef(null);
  const [image, setImage] = useState("");
  useEffect(() => {
    let cancelled = false;
    const observer = new IntersectionObserver(async entries => {
      if (!entries[0].isIntersecting) return;
      observer.disconnect();
      try {
        const url = await pdfRef.current?.thumbnail(page);
        if (!cancelled) setImage(url);
      } catch {}
    }, { rootMargin: "150px" });
    observer.observe(element.current);
    return () => { cancelled = true; observer.disconnect(); };
  }, [page, pdfRef]);
  return <button ref={element} aria-label={`Abrir página ${page}`} aria-current={active ? "page" : undefined} className={active ? "is-active" : ""} onClick={() => onNavigate(page)}>{image ? <img src={image} alt="" /> : <span className="reader-thumbnail-placeholder"><Icon name="description" /></span>}<small>{page}</small></button>;
}
