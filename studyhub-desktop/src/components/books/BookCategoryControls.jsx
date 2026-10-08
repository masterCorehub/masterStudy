import { useState } from "react";
import { useStudyStore } from "../../store/useStore";
import { booksInCategory } from "../../domain/bookCategories";
import { Icon } from "../../ui/Icon";

export function BookCategoryControls({ categories, books, selected, onSelect }) {
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const current = categories.find(category => category.id === selected);
  const customCurrent = current?.custom;
  const edit = category => { setEditing(category?.id || "new"); setName(category?.name || ""); setError(""); };
  const chip = (id, label, count, icon) => <button key={id} type="button" aria-pressed={selected === id} onClick={() => { onSelect(id); setEditing(null); }} className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${selected === id ? "border-[color:var(--primary)] bg-[color:var(--primary)] text-[color:var(--on-primary)]" : "border-[color:var(--outline-variant)] bg-[color:var(--surface-container-low)] text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]"}`}>{icon && <Icon name={icon} className="text-[14px]" />}{label} <span className="opacity-70">{count}</span></button>;
  return <section className="mb-5 text-[color:var(--on-surface)]" aria-label="Categorias de livros">
    <div className="flex items-center justify-between gap-3"><h2 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--on-surface-variant)]">Categorias</h2><button onClick={() => edit(null)} className="rounded-lg px-3 py-2 text-xs hover:bg-[color:var(--surface-container)]">+ Criar categoria</button></div>
    <div className="mt-2 flex gap-2 overflow-x-auto pb-2" aria-label="Filtros de categoria">
      {chip("all", "Todas", books.length)}
      {chip("uncategorized", "Sem categoria", booksInCategory(books, categories, "uncategorized").length)}
      {categories.map(category => chip(category.id, category.name, booksInCategory(books, categories, category.id).length, category.icon))}
    </div>
    {customCurrent && <div className="flex gap-2"><button onClick={() => edit(current)} className="px-2 py-1 text-xs text-[color:var(--on-surface-variant)]">Renomear categoria</button><button onClick={() => { if (window.confirm(`Excluir a categoria “${current.name}”? Os livros serão mantidos em Sem categoria.`)) { useStudyStore.getState().deleteBookCategory(current.id); onSelect("uncategorized"); setEditing(null); } }} className="px-2 py-1 text-xs text-[color:var(--on-surface-variant)]">Excluir categoria</button></div>}
    {editing && <form aria-label="Editar categoria de livros" className="mt-2 flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); try { const store = useStudyStore.getState(); if (editing === "new") onSelect(store.createBookCategory(name)); else store.renameBookCategory(editing, name); setEditing(null); } catch (failure) { setError(failure.message); } }}>
      <input autoFocus aria-label="Nome da categoria" maxLength={40} value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Desenvolvimento pessoal" className="rounded-lg border border-[color:var(--outline-variant)] bg-[color:var(--surface)] px-3 py-2 text-xs" />
      <button className="rounded-lg bg-[color:var(--primary)] px-3 py-2 text-xs text-[color:var(--on-primary)]">Salvar categoria</button><button type="button" onClick={() => setEditing(null)} className="px-2 text-xs">Cancelar</button>
      {error && <p role="alert" className="w-full text-xs text-[color:var(--error)]">{error}</p>}
    </form>}
  </section>;
}
