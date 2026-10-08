// One palette is shared by the controls and both rendering engines.
export const READER_THEMES = {
  light: { label: 'Original', bg: '#fcfbf8', text: '#292720', link: '#9a591f', filter: 'none' },
  sepia: { label: 'Papel', bg: '#f3e7cf', text: '#463a29', link: '#92501b', filter: 'sepia(.55) contrast(.95) brightness(.96)' },
  dark: { label: 'Calmo', bg: '#343432', text: '#e4e0d7', link: '#e9b67d', filter: 'invert(.86) hue-rotate(180deg)' },
  night: { label: 'Noite', bg: '#171817', text: '#bdbeb6', link: '#d5a875', filter: 'invert(.96) hue-rotate(180deg) brightness(.85)' },
};
export const READER_FONTS = { serif: "Georgia, 'Times New Roman', serif", sans: "'Inter', system-ui, sans-serif", mono: "'Courier New', monospace" };
export const DEFAULT_READER_SETTINGS = { theme: 'light', fontSize: 19, fontFamily: 'serif', lineSpacing: 1.65, scrollMode: 'paginated', margin: 40, textAlign: 'left', pdfZoom: 1, pdfFit: 'page', spread: 'single' };
export function readerProgress(page, total) {
  return total > 1 ? Math.max(0, Math.min(100, Math.round(((page - 1) / (total - 1)) * 100))) : 0;
}
