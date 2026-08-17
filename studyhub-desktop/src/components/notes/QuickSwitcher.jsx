import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from '../../ui/Icon';

export const QuickSwitcher = ({
  isOpen,
  onClose,
  notes = [],
  onNoteSelect,
  onCreateNote
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Handle escape key globally when modal is open
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const filteredNotes = useMemo(() => {
    if (!query.trim()) {
      return notes.slice(0, 8); // Show recent or first 8 when empty
    }
    
    const lowerQuery = query.toLowerCase();
    return notes
      .filter(note => (note.title || '').toLowerCase().includes(lowerQuery))
      .slice(0, 8); // Max 8 results
  }, [notes, query]);

  const showCreateOption = query.trim().length > 0 && 
    !filteredNotes.some(n => n.title?.toLowerCase() === query.trim().toLowerCase());

  const totalItems = filteredNotes.length + (showCreateOption ? 1 : 0);

  useEffect(() => {
    // Reset selection when query changes
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    // Scroll selected item into view
    if (listRef.current) {
      const selectedEl = listRef.current.children[selectedIndex];
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % totalItems);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + totalItems) % totalItems);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSelect(selectedIndex);
    }
  };

  const handleSelect = (index) => {
    if (index < filteredNotes.length) {
      onNoteSelect(filteredNotes[index].id);
    } else if (showCreateOption) {
      onCreateNote(query.trim());
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: -20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -20 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        className="relative w-full max-w-[500px] bg-[var(--surface)] border border-[var(--outline-variant)] rounded-xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center px-4 border-b border-[var(--outline-variant)]">
          <Icon name="search" className="w-5 h-5 text-[var(--on-surface-variant)]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ir para o arquivo..."
            className="w-full py-4 pl-3 pr-4 text-lg bg-transparent text-[var(--on-surface)] outline-none placeholder-[var(--on-surface-variant)]"
          />
        </div>

        <div 
          ref={listRef}
          className="max-h-[350px] overflow-y-auto scrollbar-thin py-2"
        >
          {filteredNotes.length === 0 && !showCreateOption ? (
            <div className="px-4 py-8 text-center text-[var(--on-surface-variant)]">
              <p>Nenhuma nota encontrada.</p>
            </div>
          ) : (
            <>
              {filteredNotes.map((note, idx) => (
                <div
                  key={note.id}
                  onClick={() => handleSelect(idx)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center px-4 py-2.5 cursor-pointer transition-colors ${
                    idx === selectedIndex
                      ? 'bg-[var(--primary)]/10 border-l-2 border-[var(--primary)] pl-[14px]'
                      : 'bg-transparent border-l-2 border-transparent hover:bg-[var(--surface-high)]'
                  }`}
                >
                  <Icon 
                    name={note.itemType === 'drawing' ? 'draw' : 'description'} 
                    className={`w-5 h-5 mr-3 ${idx === selectedIndex ? 'text-[var(--primary)]' : 'text-[var(--on-surface-variant)]'}`} 
                  />
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className={`text-sm truncate ${idx === selectedIndex ? 'text-[var(--primary)] font-medium' : 'text-[var(--on-surface)]'}`}>
                      {note.title}
                    </span>
                    {note.path && (
                      <span className="text-xs text-[var(--on-surface-variant)] truncate mt-0.5">
                        {note.path}
                      </span>
                    )}
                  </div>
                  {idx === selectedIndex && (
                    <span className="text-[10px] font-medium tracking-wider text-[var(--primary)] uppercase opacity-70 ml-2">
                      Abrir
                    </span>
                  )}
                </div>
              ))}

              {showCreateOption && (
                <div
                  onClick={() => handleSelect(filteredNotes.length)}
                  onMouseEnter={() => setSelectedIndex(filteredNotes.length)}
                  className={`flex items-center px-4 py-2.5 cursor-pointer transition-colors ${
                    selectedIndex === filteredNotes.length
                      ? 'bg-[var(--primary)]/10 border-l-2 border-[var(--primary)] pl-[14px]'
                      : 'bg-transparent border-l-2 border-transparent hover:bg-[var(--surface-high)]'
                  }`}
                >
                  <div className="flex items-center justify-center w-5 h-5 mr-3 rounded bg-[var(--primary)]/20 text-[var(--primary)]">
                    <Icon name="add" className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className={`text-sm truncate ${selectedIndex === filteredNotes.length ? 'text-[var(--primary)] font-medium' : 'text-[var(--on-surface)]'}`}>
                      Criar nota "{query}"
                    </span>
                  </div>
                  {selectedIndex === filteredNotes.length && (
                    <span className="text-[10px] font-medium tracking-wider text-[var(--primary)] uppercase opacity-70 ml-2">
                      Criar
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        
        <div className="px-4 py-2 border-t border-[var(--outline-variant)] bg-[var(--surface-low)] flex justify-between items-center text-xs text-[var(--on-surface-variant)]">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-high)] border border-[var(--outline-variant)] text-[10px] font-sans">↑</kbd><kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-high)] border border-[var(--outline-variant)] text-[10px] font-sans">↓</kbd> navegar</span>
            <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-high)] border border-[var(--outline-variant)] text-[10px] font-sans">Enter</kbd> selecionar</span>
            <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-high)] border border-[var(--outline-variant)] text-[10px] font-sans">Esc</kbd> fechar</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default QuickSwitcher;
