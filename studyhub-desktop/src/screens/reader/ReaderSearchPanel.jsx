import React, { useEffect, useState } from 'react';
import { Icon } from '../../ui/Icon';

export function ReaderSearchPanel({ query, onQueryChange, engineRef, onNavigate, onClose }) {
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    // Debounce and cancellation prevent old results replacing a newer search.
    let cancelled = false;
    setResults([]);
    setError('');
    setBusy(query.trim().length >= 2);
    const timer = setTimeout(async () => {
      if (query.trim().length < 2) return;
      try {
        const found = await engineRef.current?.search(query.trim());
        if (!cancelled) setResults(found || []);
      } catch {
        if (!cancelled) setError('Não foi possível buscar neste livro. Tente novamente.');
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, engineRef]);
  return <aside className="reader-search-panel" aria-label="Busca no livro">
    <div className="reader-panel-heading"><h2>Buscar no livro</h2><button aria-label="Fechar busca" onClick={onClose}><Icon name="close" /></button></div>
    <label className="reader-search-field"><Icon name="search" /><input autoFocus aria-label="Buscar no livro" placeholder="Palavra ou trecho…" value={query} onChange={e => onQueryChange(e.target.value)} /></label>
    <p className="reader-panel-intro" role="status">{error || (busy ? 'Procurando no livro…' : query.trim().length < 2 ? 'Digite pelo menos 2 caracteres.' : `${results.length} resultados${results.length === 100 ? ' (limite de 100)' : ''}`)}</p>
    <div className="reader-search-results">{results.map((item, index) => <button key={index} onClick={() => onNavigate(item)}><small>{item.label || `Página ${item.page}`}</small><span>{item.excerpt}</span><Icon name="chevron_right" /></button>)}</div>
  </aside>;
}
