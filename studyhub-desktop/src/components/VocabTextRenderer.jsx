import React from 'react';
import { useStudyStore } from '../store/useStore';

export function VocabTextRenderer({ text, className = "" }) {
  const vocabulary = useStudyStore((state) => state.vocabulary) || {};
  const toggleWordStatus = useStudyStore((state) => state.toggleWordStatus);

  if (!text) return null;

  // Split the text into tokens (words and non-words) using Unicode properties
  const tokens = String(text).split(/([\p{L}\p{M}\p{N}]+)/gu);

  return (
    <span className={`vocab-text-renderer leading-loose ${className}`}>
      {tokens.map((token, index) => {
        // Even indices are separators (whitespace, punctuation)
        if (index % 2 === 0) {
          return <span key={index}>{token}</span>;
        }

        const cleanWord = token.toLowerCase();
        
        // Ignore pure numbers
        if (/^\d+$/.test(cleanWord)) {
          return <span key={index}>{token}</span>;
        }

        const status = vocabulary[cleanWord];

        // Define styling based on vocabulary status
        let statusClass = "border-b-[2.5px] border-red-500/70 hover:bg-red-500/20 cursor-pointer transition-colors"; // Unknown
        
        if (status === "seen") {
          statusClass = "border-b-[2.5px] border-emerald-500/70 hover:bg-emerald-500/20 cursor-pointer transition-colors"; // Known/Seen
        } else if (status === "learning") {
          statusClass = "border-b-[2.5px] border-amber-500/70 hover:bg-amber-500/20 cursor-pointer transition-colors"; // Learning
        }

        return (
          <span
            key={index}
            onClick={(e) => {
              e.stopPropagation();
              toggleWordStatus(cleanWord);
            }}
            className={`relative rounded-sm ${statusClass}`}
            title={`Clique para alterar o status de "${cleanWord}"`}
          >
            {token}
          </span>
        );
      })}
    </span>
  );
}
