import React from "react";
import { Icon } from "../../ui/Icon";

export function ReaderToolbar(p) {
  const [page, setPage] = React.useState(String(p.currentPage));
  const optionsRef = React.useRef(null);
  React.useEffect(() => {
    // Native details menus do not dismiss on outside clicks automatically.
    const dismiss = (event) => {
      if (!optionsRef.current?.contains(event.target)) optionsRef.current?.removeAttribute("open");
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  React.useEffect(() => setPage(String(p.currentPage)), [p.currentPage]);
  const control = (label, icon, action, active = false) => <button type="button" aria-label={label} title={label} onClick={action} aria-pressed={active} className={`reader-control ${active ? "is-active" : ""}`}><Icon name={icon} filled={active} /></button>;
  return <header className="reader-books-toolbar" style={{ WebkitAppRegion: "drag" }}>
    <div className="reader-control-group">
      <button className="reader-library-back" onClick={p.onBack} aria-label="Voltar à biblioteca"><Icon name="chevron_left" /><span>Biblioteca</span></button>
      {control("Sumário e anotações", "format_list_bulleted", p.onToggleSidebar, p.sidebarOpen)}
    </div>
    <div className="reader-book-caption"><strong>{p.book?.title}</strong><small>{p.book?.author || "Sua leitura"}</small></div>
    <div className="reader-control-group">
      {control("Buscar no livro", "search", p.onSearch, p.searchOpen)}
      {control("Temas e ajustes", "text_fields", p.onToggleSettings, p.settingsOpen)}
      {control("Duas páginas", "menu_book", p.onToggleTwoPage, p.isTwoPage && p.scrollMode !== "continuous")}
      {control(p.isBookmarked ? "Remover marcador" : "Marcar página", "bookmark", p.onToggleBookmark, p.isBookmarked)}
      {control(p.isFavorite ? "Remover página dos favoritos" : "Favoritar página", "favorite", p.onToggleFavorite, p.isFavorite)}
      {control(p.isFullscreen ? "Sair da tela cheia" : "Tela cheia", p.isFullscreen ? "fullscreen_exit" : "fullscreen", p.onToggleFullscreen, p.isFullscreen)}
      <details ref={optionsRef} className="reader-options"><summary aria-label="Mais opções de leitura"><Icon name="more_horiz" /></summary>
        <div className="reader-options-panel">
          <form onSubmit={e => { e.preventDefault(); p.onPageChange(Number(page) || 1); e.currentTarget.closest("details").open = false; }}>
            <label>{p.fileType === "epub" ? "Posição" : "Página"} <input aria-label="Ir para página" inputMode="numeric" type="number" min="1" max={p.totalPages || undefined} value={page} onChange={e => setPage(e.target.value)} /> de {p.totalPages || "…"}</label><button type="submit">Ir</button>
          </form>
          <button onClick={p.onAddPageNote}><Icon name="note_add" /> Anotar nesta página</button>
          <small>← → mudar de página · Esc fechar painéis</small>
        </div>
      </details>
    </div>
  </header>;
}
