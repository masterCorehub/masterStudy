import { useMemo, useState } from "react";
import { useStudyStore } from "../../store/useStore";
import { allBookCategories } from "../../domain/bookCategories";
import { bookCategorizationPrompt, parseBookCategorization } from "../../domain/bookCategorization";
import { Icon } from "../../ui/Icon";

export function BookAiCategorizer({ books, categories }) {
  const categorizeBook = useStudyStore(state => state.categorizeBook);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const allCategories = useMemo(() => allBookCategories(categories), [categories]);
  const bookById = useMemo(() => new Map(books.map(book => [book.id, book])), [books]);
  const suggest = async () => {
    setOpen(true); setLoading(true); setError(""); setSuggestions([]);
    try {
      const chat = window.studyhubDesktop?.academicAI?.chat;
      if (!chat) throw new Error("A categorização por IA está disponível no aplicativo desktop.");
      const response = await chat({ format: "json", messages: [
        { role: "system", content: "Você é um bibliotecário cuidadoso. Responda somente JSON válido e não invente categorias." },
        { role: "user", content: bookCategorizationPrompt(books, categories) },
      ] });
      const raw = response?.message || response?.content || response;
      setSuggestions(parseBookCategorization(raw, books, categories));
    } catch (failure) { setError(failure.message || "Não foi possível categorizar os livros."); }
    finally { setLoading(false); }
  };
  const updateSuggestion = (bookId, categoryId) => setSuggestions(current => current.map(item => item.bookId === bookId ? { ...item, categoryId: categoryId || null, confidence: 1, reason: "Escolha revisada manualmente." } : item));
  const apply = () => { suggestions.forEach(item => categorizeBook(item.bookId, item.categoryId)); setOpen(false); setSuggestions([]); };
  return <>
    <button type="button" onClick={suggest} disabled={loading || !books.length} className="flex items-center gap-1.5 rounded-lg border border-[color:var(--outline-variant)] px-3 py-2 text-xs font-semibold text-[color:var(--on-surface)] hover:bg-[color:var(--surface-container)] disabled:opacity-50">
      <Icon name="auto_awesome" className="text-[15px]" /> {loading ? "Analisando…" : "Categorizar com IA"}
    </button>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={event => event.target === event.currentTarget && !loading && setOpen(false)}>
      <section role="dialog" aria-modal="true" aria-labelledby="book-ai-title" className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[color:var(--outline-variant)] bg-[color:var(--surface)] p-5 text-[color:var(--on-surface)] shadow-xl">
        <div className="flex items-start justify-between gap-3"><div><h2 id="book-ai-title" className="text-lg font-semibold">Sugestões de categorização</h2><p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">Revise as sugestões antes de aplicar. A IA não cria categorias novas.</p></div><button type="button" onClick={() => setOpen(false)} disabled={loading} aria-label="Fechar sugestões" className="rounded-lg px-2 py-1 hover:bg-[color:var(--surface-container)]">✕</button></div>
        {loading && <p role="status" className="mt-5 text-sm text-[color:var(--on-surface-variant)]">Analisando títulos, autores e descrições…</p>}
        {error && <p role="alert" className="mt-5 rounded-lg bg-[color:var(--error-container)] p-3 text-sm text-[color:var(--on-error-container)]">{error}</p>}
        {!loading && !error && !suggestions.length && <p className="mt-5 text-sm text-[color:var(--on-surface-variant)]">Nenhuma sugestão segura foi encontrada.</p>}
        {!loading && suggestions.length > 0 && <div className="mt-5 space-y-2">{suggestions.map(item => { const book = bookById.get(item.bookId); return <div key={item.bookId} className="rounded-xl border border-[color:var(--outline-variant)] p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold">{book?.title || item.bookId}</p><p className="text-xs text-[color:var(--on-surface-variant)]">{item.reason}</p></div><select aria-label={`Categoria sugerida para ${book?.title || item.bookId}`} value={item.categoryId || ""} onChange={event => updateSuggestion(item.bookId, event.target.value)} className="rounded-lg border border-[color:var(--outline-variant)] bg-[color:var(--surface)] px-2 py-1.5 text-xs"><option value="">Sem categoria</option>{allCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div></div>; })}</div>}
        <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-xs">Cancelar</button><button type="button" onClick={apply} disabled={loading || !suggestions.length} className="rounded-lg bg-[color:var(--primary)] px-3 py-2 text-xs font-semibold text-[color:var(--on-primary)] disabled:opacity-50">Aplicar sugestões</button></div>
      </section>
    </div>}
  </>;
}
