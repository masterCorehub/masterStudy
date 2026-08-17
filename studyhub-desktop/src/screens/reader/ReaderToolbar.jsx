import React from "react";
import { Icon } from "../../ui/Icon";

export function ReaderToolbar({
  book,
  currentPage,
  totalPages,
  fileType,
  isFavorite,
  isBookmarked,
  sidebarOpen,
  onToggleSidebar,
  onBack,
  onPageChange,
  onToggleBookmark,
  onToggleFavorite,
  onToggleSettings,
  onSearch,
  onAddPageNote,
  isTwoPage,
  onToggleTwoPage,
  scrollMode,
  onToggleScrollMode,
  isFullscreen,
  onToggleFullscreen,
  themeColors,
  settings,
  onUpdateSettings,
}) {
  const tc = themeColors || { bg: 'var(--surface)', text: 'var(--on-surface-variant)' };
  const percent = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;
  const [inputPageVal, setInputPageVal] = React.useState(String(currentPage));

  React.useEffect(() => {
    setInputPageVal(String(currentPage));
  }, [currentPage]);

  const handleCommitPage = () => {
    const parsed = parseInt(inputPageVal, 10);
    if (!isNaN(parsed) && parsed >= 1) {
      onPageChange(parsed);
    } else {
      setInputPageVal(String(currentPage));
    }
  };

  return (
    <div
      className="flex items-center gap-3 px-4 h-14 border-b border-[color:var(--outline-variant)]/20 shrink-0 z-10 select-none cursor-move transition-colors overflow-hidden max-w-full"
      style={{ WebkitAppRegion: "drag", backgroundColor: tc.bg, color: tc.text }}
    >
      {/* Back + sidebar (no-drag) */}
      <div className="flex items-center gap-1" style={{ WebkitAppRegion: "no-drag" }}>
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-bold transition-colors px-2 py-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10"
          style={{ color: tc.text }}
        >
          <Icon name="arrow_back" className="text-[16px]" />
          <span className="hidden sm:inline">Voltar</span>
        </button>
        <button
          onClick={onToggleSidebar}
          title="Painel lateral"
          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${sidebarOpen ? "bg-black/20 dark:bg-white/20" : "hover:bg-black/10 dark:hover:bg-white/10"}`}
          style={{ color: tc.text }}
        >
          <Icon name="menu_book" className="text-[18px]" />
        </button>
      </div>

      {/* Book title (drag region - can be dragged) */}
      <div className="flex-1 text-center min-w-0 pointer-events-none">
        <p className="text-xs font-bold truncate" style={{ color: tc.text }}>{book?.title}</p>
        <p className="text-[10px] truncate opacity-70" style={{ color: tc.text }}>{book?.author}</p>
      </div>

      {/* Page controls (no-drag) */}
      {(fileType === "pdf" || fileType === "epub") && (
        <div
          className="flex items-center gap-1.5 rounded-xl px-2 py-1 bg-black/5 dark:bg-white/5"
          style={{ WebkitAppRegion: "no-drag" }}
        >
          <button
            onClick={() => onPageChange(currentPage - (isTwoPage ? 2 : 1))}
            disabled={currentPage <= 1}
            className="w-6 h-6 flex items-center justify-center rounded-lg disabled:opacity-30 transition-colors hover:bg-black/10 dark:hover:bg-white/10"
            style={{ color: tc.text }}
          >
            <Icon name="chevron_left" className="text-[18px]" />
          </button>
          <div className="flex items-center gap-1">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={inputPageVal}
              onChange={e => setInputPageVal(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  handleCommitPage();
                  e.target.blur();
                }
              }}
              onBlur={handleCommitPage}
              className="w-10 text-center text-xs font-bold bg-transparent outline-none border-b border-transparent focus:border-current"
              style={{ color: tc.text }}
            />
            <span className="text-[10px] opacity-70" style={{ color: tc.text }}>/ {totalPages || "?"}</span>
          </div>
          <button
            onClick={() => onPageChange(currentPage + (isTwoPage ? 2 : 1))}
            disabled={currentPage >= totalPages}
            className="w-6 h-6 flex items-center justify-center rounded-lg disabled:opacity-30 transition-colors hover:bg-black/10 dark:hover:bg-white/10"
            style={{ color: tc.text }}
          >
            <Icon name="chevron_right" className="text-[18px]" />
          </button>
        </div>
      )}

      {/* PDF Zoom Controls (- / +) */}
      {fileType === "pdf" && (
        <div
          className="flex items-center gap-1 rounded-xl px-2 py-1 bg-black/5 dark:bg-white/5"
          style={{ WebkitAppRegion: "no-drag" }}
        >
          <button
            onClick={() => {
              const current = settings?.pdfZoom || 1.0;
              const next = Math.max(1.0, Math.round((current - 0.1) * 10) / 10);
              onUpdateSettings?.({ pdfZoom: next });
            }}
            title="Diminuir Zoom (-)"
            className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-black/10 dark:hover:bg-white/10 text-xs font-extrabold transition-colors active:scale-95"
            style={{ color: tc.text }}
          >
            -
          </button>
          <span className="text-[10px] font-bold px-1 min-w-[36px] text-center" style={{ color: tc.text }}>
            {Math.round((settings?.pdfZoom || 1.0) * 100)}%
          </span>
          <button
            onClick={() => {
              const current = settings?.pdfZoom || 1.0;
              const next = Math.min(3.0, Math.round((current + 0.1) * 10) / 10);
              onUpdateSettings?.({ pdfZoom: next });
            }}
            title="Aumentar Zoom (+)"
            className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-black/10 dark:hover:bg-white/10 text-xs font-extrabold transition-colors active:scale-95"
            style={{ color: tc.text }}
          >
            +
          </button>
        </div>
      )}

      {/* Progress badge */}
      <span
        className="hidden md:flex items-center text-[10px] font-bold text-[color:var(--primary)] bg-[color:var(--primary)]/10 px-2 py-1 rounded-full"
        style={{ WebkitAppRegion: "no-drag" }}
      >
        {percent}%
      </span>

      {/* Action buttons (no-drag) */}
      <div className="flex items-center gap-1" style={{ WebkitAppRegion: "no-drag" }}>
        {/* Scroll Mode Toggle (Paginado vs Rolagem Contínua) */}
        <button
          onClick={onToggleScrollMode}
          title={scrollMode === "continuous" ? "Modo de Leitura: Rolagem Fluida (Clique para Paginado)" : "Modo de Leitura: Paginado (Clique para Rolagem Fluida)"}
          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
            scrollMode === "continuous"
              ? "bg-[color:var(--primary)]/20 text-[color:var(--primary)] font-bold"
              : "hover:bg-black/10 dark:hover:bg-white/10"
          }`}
          style={scrollMode === "continuous" ? {} : { color: tc.text }}
        >
          <Icon name={scrollMode === "continuous" ? "swap_vert" : "auto_stories"} className="text-[18px]" />
        </button>

        {/* Toggle Two-Page / Single Page View */}
        {scrollMode !== "continuous" && (
          <button
            onClick={onToggleTwoPage}
            title={isTwoPage ? "Modo 1 Página" : "Modo 2 Páginas Lado a Lado (Página Dupla)"}
            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
              isTwoPage
                ? "bg-black/20 dark:bg-white/20"
                : "hover:bg-black/10 dark:hover:bg-white/10"
            }`}
            style={{ color: tc.text }}
          >
            <Icon name="menu_book" className="text-[18px]" />
          </button>
        )}

        {/* Toggle Real Fullscreen */}
        <button
          onClick={onToggleFullscreen}
          title={isFullscreen ? "Sair da Tela Cheia" : "Modo Tela Cheia Imersivo"}
          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
            isFullscreen
              ? "bg-black/20 dark:bg-white/20"
              : "hover:bg-black/10 dark:hover:bg-white/10"
          }`}
          style={{ color: tc.text }}
        >
          <Icon name={isFullscreen ? "fullscreen_exit" : "fullscreen"} className="text-[18px]" />
        </button>

        <button
          onClick={onAddPageNote}
          title="Criar Anotação da Página"
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors opacity-70 hover:opacity-100"
          style={{ color: tc.text }}
        >
          <Icon name="note_add" className="text-[18px]" />
        </button>

        <button
          onClick={onSearch}
          title="Buscar no livro"
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors opacity-70 hover:opacity-100"
          style={{ color: tc.text }}
        >
          <Icon name="search" className="text-[18px]" />
        </button>

        <button
          onClick={onToggleFavorite}
          title={isFavorite ? "Remover dos favoritos" : "Favoritar página"}
          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${isFavorite ? "bg-amber-500/20 text-amber-500" : "hover:bg-black/10 dark:hover:bg-white/10 opacity-70 hover:opacity-100"}`}
          style={isFavorite ? {} : { color: tc.text }}
        >
          <Icon name={isFavorite ? "star" : "star_border"} className="text-[18px]" />
        </button>

        <button
          onClick={onToggleBookmark}
          title={isBookmarked ? "Remover marcador" : "Marcar página"}
          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${isBookmarked ? "bg-black/20 dark:bg-white/20" : "hover:bg-black/10 dark:hover:bg-white/10 opacity-70 hover:opacity-100"}`}
          style={{ color: tc.text }}
        >
          <Icon name={isBookmarked ? "bookmark" : "bookmark_border"} className="text-[18px]" />
        </button>

        <button
          onClick={onToggleSettings}
          title="Configurações de leitura"
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors opacity-70 hover:opacity-100"
          style={{ color: tc.text }}
        >
          <Icon name="text_fields" className="text-[18px]" />
        </button>
      </div>
    </div>
  );
}
