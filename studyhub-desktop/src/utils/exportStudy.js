function downloadText(filename, content, mime = "text/plain;charset=utf-8") {
  if (typeof document === "undefined") return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportNotesMarkdown(items = []) {
  const content = items.filter((item) => !item.isArchived).map((item) => `# ${item.title || "Nota sem título"}\n\n${item.content || ""}\n\n---\n`).join("\n");
  downloadText(`studyhub-notas-${new Date().toISOString().slice(0, 10)}.md`, content, "text/markdown;charset=utf-8");
}

export function exportFlashcardsCsv(decks = []) {
  const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = ["Deck,Frente,Verso,Próxima revisão", ...decks.flatMap((deck) => (deck.cards || []).map((card) => [deck.title || deck.deckTitle || "Deck", card.front, card.back, card.dueDate ? new Date(card.dueDate).toISOString() : ""].map(escape).join(",")))];
  downloadText("studyhub-flashcards.csv", rows.join("\n"), "text/csv;charset=utf-8");
}
