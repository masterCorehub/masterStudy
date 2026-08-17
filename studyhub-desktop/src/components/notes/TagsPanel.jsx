import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "../../ui/Icon";
import { getNoteTags } from "../../domain/frontmatter";

/**
 * TagsPanel — Painel lateral direito mostrando as tags da nota atual e todas as tags do vault com contagem
 *
 * @param {Object} props
 * @param {Array} props.notes - Todas as notas do vault
 * @param {Object} [props.currentNote] - A nota atualmente aberta
 * @param {string} [props.currentContent] - Conteúdo markdown atual da nota no editor
 * @param {function} props.onTagSelect - Callback quando uma tag é selecionada para filtro
 * @param {string} props.activeTag - A tag atualmente selecionada para filtro
 * @param {string} props.className - Classes adicionais
 */
export function TagsPanel({
  notes = [],
  currentNote = null,
  currentContent = "",
  onTagSelect,
  activeTag = null,
  className = "",
}) {
  const [searchQuery, setSearchQuery] = useState("");

  // Tags da nota atualmente aberta no editor
  const noteTags = useMemo(() => {
    if (!currentNote) return [];
    return getNoteTags(currentNote, currentContent);
  }, [currentNote, currentContent]);

  // Extrai e conta todas as tags únicas de todo o vault
  const vaultTagsList = useMemo(() => {
    const counts = {};

    notes.forEach((note) => {
      const content =
        note.id === currentNote?.id
          ? currentContent
          : note.markdownContent || note.content;
      const tags = getNoteTags(note, content);
      tags.forEach((tag) => {
        const t = tag.toLowerCase().trim();
        if (t) counts[t] = (counts[t] || 0) + 1;
      });
    });

    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [notes, currentNote?.id, currentContent]);

  const filteredTags = useMemo(() => {
    if (!searchQuery.trim()) return vaultTagsList;
    const q = searchQuery.toLowerCase().trim().replace(/^#/, "");
    return vaultTagsList.filter((t) => t.name.toLowerCase().includes(q));
  }, [vaultTagsList, searchQuery]);

  return (
    <div className={`flex flex-col h-full bg-[var(--surface-lowest)] text-[var(--on-surface)] select-none ${className}`}>
      
      {/* ── 1. TAGS DA NOTA ATUAL ── */}
      {currentNote ? (
        <div className="p-4 border-b border-[var(--outline-variant)]">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--primary)]">
              <Icon name="label" className="text-[16px]" />
              <span>Tags desta nota</span>
            </div>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[var(--surface-high)] text-[var(--on-surface-variant)]">
              {noteTags.length}
            </span>
          </div>

          {noteTags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 max-h-[140px] overflow-y-auto scrollbar-thin">
              {noteTags.map((tag) => {
                const isActive = activeTag === tag.toLowerCase();
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => onTagSelect?.(isActive ? null : tag.toLowerCase())}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                      isActive
                        ? "bg-[var(--primary)] text-[var(--on-primary)] shadow-sm"
                        : "bg-[var(--surface-high)] text-[var(--on-surface)] hover:bg-[color-mix(in_srgb,var(--primary)_15%,transparent)] hover:text-[var(--primary)]"
                    }`}
                    title={isActive ? "Remover filtro desta tag" : `Filtrar vault por #${tag}`}
                  >
                    <span>#{tag}</span>
                    {isActive ? (
                      <Icon name="close" className="text-[12px]" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-xs text-[var(--on-surface-variant)] opacity-70 leading-relaxed bg-[var(--surface)] p-2.5 rounded-lg border border-dashed border-[var(--outline-variant)]">
              Nenhuma tag nesta nota.<br />
              <span className="opacity-75">Use <code className="text-[var(--primary)] font-mono">#tag</code> no texto ou <code className="text-[var(--primary)] font-mono">tags: []</code> no cabeçalho.</span>
            </div>
          )}
        </div>
      ) : null}

      {/* ── 2. TODAS AS TAGS DO VAULT ── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="px-4 pt-3 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--on-surface-variant)]">
            <Icon name="tag" className="text-[16px]" />
            <span>Tags do Vault</span>
          </div>
          <span className="text-[11px] font-semibold text-[var(--on-surface-variant)]">
            {vaultTagsList.length} tags
          </span>
        </div>

        {/* Busca de Tags */}
        <div className="px-3 pb-2 pt-1">
          <div className="relative">
            <Icon
              name="search"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-[var(--on-surface-variant)] opacity-60"
            />
            <input
              type="text"
              placeholder="Buscar tag no vault..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 pl-8 pr-3 text-xs bg-[var(--surface-high)] border border-[var(--outline-variant)] rounded-lg text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)] placeholder:text-[var(--on-surface-variant)] placeholder:opacity-50 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--on-surface-variant)] hover:text-[var(--on-surface)]"
              >
                <Icon name="close" className="text-[14px]" />
              </button>
            )}
          </div>
        </div>

        {/* Botão limpar filtro ativo */}
        {activeTag && (
          <div className="px-3 pb-2">
            <button
              type="button"
              onClick={() => onTagSelect?.(null)}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[color-mix(in_srgb,var(--primary)_15%,transparent)] text-[var(--primary)] hover:bg-[color-mix(in_srgb,var(--primary)_25%,transparent)] transition-colors text-left"
            >
              <span className="flex items-center gap-1.5 truncate">
                <Icon name="filter_alt" className="text-[14px]" />
                Filtrando por: <strong>#{activeTag}</strong>
              </span>
              <Icon name="close" className="text-[14px] shrink-0" />
            </button>
          </div>
        )}

        {/* Lista de tags do Vault */}
        <div className="flex-1 overflow-y-auto px-2 pb-4 scrollbar-thin">
          {filteredTags.length === 0 ? (
            <div className="text-center py-8 text-xs text-[var(--on-surface-variant)] opacity-60">
              {searchQuery ? "Nenhuma tag correspondente." : "Nenhuma tag no vault."}
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {filteredTags.map((tag) => {
                const isActive = activeTag === tag.name;
                return (
                  <button
                    key={tag.name}
                    type="button"
                    onClick={() => onTagSelect?.(isActive ? null : tag.name)}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors text-left group ${
                      isActive
                        ? "bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] text-[var(--primary)] font-bold shadow-sm"
                        : "text-[var(--on-surface)] hover:bg-[var(--surface-high)]"
                    }`}
                  >
                    <span className="truncate flex-1 flex items-center gap-1">
                      <span className="opacity-50 text-[11px]">#</span>
                      {tag.name}
                    </span>
                    <span
                      className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-colors ${
                        isActive
                          ? "bg-[var(--primary)] text-[var(--on-primary)]"
                          : "bg-[var(--surface-high)] text-[var(--on-surface-variant)] group-hover:bg-[var(--outline-variant)]"
                      }`}
                    >
                      {tag.count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
