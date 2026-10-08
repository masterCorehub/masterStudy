import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from '../../ui/Icon';
import {
  extractWikilinks,
  findBacklinks,
  findUnlinkedMentions,
  resolveWikilink
} from '../../domain/wikilinks';
import { referencedNotes } from '../../domain/wikilinks';

const SectionHeader = ({ title, count, isExpanded, onToggle }) => (
  <button
    onClick={onToggle}
    className="flex items-center justify-between w-full py-2 px-3 text-sm font-medium transition-colors rounded-lg hover:bg-[var(--surface-high)] text-[var(--on-surface)] group outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
  >
    <div className="flex items-center gap-2">
      <motion.div
        animate={{ rotate: isExpanded ? 90 : 0 }}
        transition={{ duration: 0.2 }}
        className="text-[var(--on-surface-variant)] group-hover:text-[var(--on-surface)]"
      >
        <Icon name="chevron_right" className="w-4 h-4" />
      </motion.div>
      <span>{title}</span>
    </div>
    {count > 0 && (
      <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-bold rounded-full bg-[var(--surface-highest)] text-[var(--on-surface-variant)]">
        {count}
      </span>
    )}
  </button>
);

const HighlightedContext = ({ context, match }) => {
  if (!context || !match) return <span className="text-sm">{context}</span>;
  
  const lowerContext = context.toLowerCase();
  const lowerMatch = match.toLowerCase();
  const startIndex = lowerContext.indexOf(lowerMatch);
  
  if (startIndex === -1) return <span className="text-sm">{context}</span>;
  
  const before = context.substring(0, startIndex);
  const matchedText = context.substring(startIndex, startIndex + match.length);
  const after = context.substring(startIndex + match.length);
  
  return (
    <span className="text-xs leading-relaxed text-[var(--on-surface-variant)]">
      {before}
      <span className="text-[var(--primary)] bg-[var(--primary)]/10 px-0.5 rounded font-medium">
        {matchedText}
      </span>
      {after}
    </span>
  );
};

const LinkItem = ({ title, context, match, onClick }) => (
  <button
    onClick={onClick}
    className="flex flex-col w-full gap-1 p-3 text-left transition-colors rounded-lg hover:bg-[var(--surface-high)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
  >
    <span className="text-sm font-medium text-[var(--on-surface)] truncate w-full">
      {title}
    </span>
    {context && (
      <div className="pl-3 border-l-2 border-[var(--surface-highest)] mt-1">
        <HighlightedContext context={context} match={match} />
      </div>
    )}
  </button>
);

export const BacklinksPanel = ({ currentNote, currentContent, allNotes, onNoteClick }) => {
  const [expandedSections, setExpandedSections] = useState({
    links: true,
    backlinks: true,
    unlinked: false,
  });

  const toggleSection = (section) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const { links, backlinks, unlinkedMentions } = useMemo(() => {
    if (!currentNote || !allNotes) {
      return { links: [], backlinks: [], unlinkedMentions: [] };
    }

    const contentToParse = currentContent !== undefined 
      ? currentContent 
      : (currentNote.markdownContent || currentNote.content || '');

    const wikilinks = extractWikilinks(contentToParse);
    const outgoingLinks = wikilinks.map(link => {
      const resolved = resolveWikilink(link.target, allNotes);
      return {
        id: resolved?.id,
        title: resolved ? resolved.title : link.target,
        alias: link.alias,
        isResolved: !!resolved
      };
    });

    const incomingLinks = allNotes.filter(note => note.id !== currentNote.id && referencedNotes(note, allNotes).some(target => target.id === currentNote.id)).map(note => ({ noteId: note.id, noteTitle: note.title, context: 'Esta nota menciona a nota aberta.' }));
    const unlinked = findUnlinkedMentions(currentNote.title, allNotes) || [];

    return {
      links: [...new Map([...outgoingLinks, ...incomingLinks.map(note => ({ id: note.noteId, title: note.noteTitle, context: note.context }))].map(note => [note.id || note.title, note])).values()],
      backlinks: incomingLinks,
      unlinkedMentions: unlinked
    };
  }, [currentNote, currentContent, allNotes]);

  if (!currentNote) return null;

  const renderSectionContent = (items, type, emptyMessage) => {
    if (items.length === 0) {
      return (
        <div className="py-4 text-center">
          <p className="text-xs text-[var(--on-surface-variant)]">{emptyMessage}</p>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-1 mt-1">
        {items.map((item, idx) => (
          <LinkItem
            key={`${type}-${item.id || idx}`}
            title={item.title || item.noteTitle}
            context={item.context}
            match={currentNote.title}
            onClick={() => {
              if (item.id || item.noteId) {
                onNoteClick(item.id || item.noteId);
              }
            }}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="w-[280px] lg:w-[320px] h-full flex flex-col bg-[var(--surface)] border-l border-[var(--outline-variant)] overflow-hidden">
      <div className="p-4 border-b border-[var(--outline-variant)]">
        <h2 className="text-lg font-semibold text-[var(--on-surface)]">Conexões</h2>
      </div>

      <div className="flex-1 p-3 overflow-y-auto scrollbar-thin">
        {/* Outgoing Links */}
        <div className="mb-4">
          <SectionHeader
            title="Links mencionados"
            count={links.length}
            isExpanded={expandedSections.links}
            onToggle={() => toggleSection('links')}
          />
          <AnimatePresence initial={false}>
            {expandedSections.links && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                {renderSectionContent(links, 'link', 'Nenhum link mencionado nesta nota.')}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Backlinks */}
        <div className="mb-4">
          <SectionHeader
            title="Backlinks"
            count={backlinks.length}
            isExpanded={expandedSections.backlinks}
            onToggle={() => toggleSection('backlinks')}
          />
          <AnimatePresence initial={false}>
            {expandedSections.backlinks && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                {renderSectionContent(backlinks, 'backlink', 'Nenhuma nota vinculada a esta.')}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Unlinked Mentions */}
        <div>
          <SectionHeader
            title="Menções não linkadas"
            count={unlinkedMentions.length}
            isExpanded={expandedSections.unlinked}
            onToggle={() => toggleSection('unlinked')}
          />
          <AnimatePresence initial={false}>
            {expandedSections.unlinked && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                {renderSectionContent(unlinkedMentions, 'unlinked', 'Nenhuma menção não vinculada encontrada.')}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default BacklinksPanel;
