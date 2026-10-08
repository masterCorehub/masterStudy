import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import Epub from "epubjs";
import { Icon } from "../../ui/Icon";
import { readBookBytes } from "../../services/book-files";
import { READER_THEMES, READER_FONTS } from "./readerAppearance";
import { animatePageTurn } from "./readerPageTurn";

async function resolveSrc(filePath) {
  const bytes = await readBookBytes(filePath);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
function applyTheme(rendition, settings) {
  const theme = READER_THEMES[settings.theme] || READER_THEMES.light;
  rendition.themes.default({
    html: { background: theme.bg, "scroll-behavior": "auto" },
    body: {
      background: theme.bg + " !important", color: theme.text + " !important",
      "font-family": (READER_FONTS[settings.fontFamily] || READER_FONTS.serif) + " !important",
      "font-size": settings.fontSize + "px !important", "line-height": settings.lineSpacing + " !important",
      "padding": `24px ${settings.margin || 40}px !important`,
      "text-align": (settings.textAlign || "left") + " !important",
      "overflow-wrap": "break-word", "hyphens": "auto",
    },
    "p, li": { "font-size": "inherit !important", "line-height": "inherit !important" },
    a: { color: theme.link + " !important" },
    "img, svg": { "max-width": "100% !important", height: "auto !important" },
    pre: { "white-space": "pre-wrap !important", "overflow-wrap": "anywhere" },
    "::selection": { background: "#e8bc7866 !important" },
  });
}
function flattenToc(items, level = 0) {
  return (items || []).flatMap(item => [{ label: item.label?.trim(), cfi: item.href, level }, ...flattenToc(item.subitems, level + 1)]);
}

export const EpubReaderEngine = forwardRef(function EpubReaderEngine(props, ref) {
  const { filePath, settings, currentCfi, isTwoPage, highlights } = props;
  const containerRef = useRef(null);
  const bookRef = useRef(null);
  const renditionRef = useRef(null);
  const callbacks = useRef(props);
  callbacks.current = props; // Long-lived EPUB listeners always call the latest React handlers.
  const positionRef = useRef(currentCfi);
  if (currentCfi) positionRef.current = currentCfi;
  const turnBusy = useRef(false);
  const searchQueue = useRef(Promise.resolve());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const theme = READER_THEMES[settings.theme] || READER_THEMES.light;
  const continuous = settings.scrollMode === "continuous";

  const turn = async direction => {
    if (turnBusy.current || !renditionRef.current) return;
    turnBusy.current = true;
    try {
      const rendition = renditionRef.current;
      const before = rendition.currentLocation()?.start?.cfi;
      await rendition[direction]();
      if (rendition === renditionRef.current && callbacks.current.settings.scrollMode !== "continuous" && rendition.currentLocation()?.start?.cfi !== before) {
        animatePageTurn(containerRef.current, direction);
      }
    }
    catch (err) { console.warn("EPUB page turn:", err); }
    finally { turnBusy.current = false; }
  };
  useImperativeHandle(ref, () => ({
    nextPage: () => turn("next"),
    prevPage: () => turn("prev"),
    clearSelection: () => renditionRef.current?.getContents().forEach(contents => contents.window.getSelection()?.removeAllRanges()),
    getLayout: () => ({ columns: renditionRef.current?.layout?.divisor || 1 }),
    goToPage: page => {
      const cfi = bookRef.current?.locations.cfiFromLocation(Math.max(0, page - 1));
      if (cfi) renditionRef.current?.display(cfi);
    },
    displayCfi: cfi => renditionRef.current?.display(cfi),
    search: query => {
      const task = searchQueue.current.catch(() => {}).then(async () => {
      const book = bookRef.current;
      if (!book) return [];
      const results = [];
      // Search the whole spine sequentially, releasing sections after scanning.
      for (const section of book.spine.spineItems) {
        if (bookRef.current !== book) break;
        const alreadyLoaded = !!section.document;
        await section.load(book.load.bind(book));
        try {
          results.push(...section.find(query).map(match => ({ ...match, page: book.locations.locationFromCfi(match.cfi) + 1, label: book.navigation?.get(section.href)?.label || "Trecho do livro" })));
        } finally { if (!alreadyLoaded) section.unload(); }
        if (results.length >= 100) break;
      }
      return results.slice(0, 100);
      });
      searchQueue.current = task;
      return task;
    },
  }));

  useEffect(() => {
    let cancelled = false;
    let instance;
    setLoading(true); setError("");
    const load = async () => {
      try {
        const src = await resolveSrc(filePath);
        if (cancelled) return;
        instance = Epub(src, { openAs: typeof src === "string" ? "epub" : "binary" });
        bookRef.current = instance;
        await instance.ready;
        if (cancelled) return;
        const rendition = instance.renderTo(containerRef.current, {
          width: "100%", height: "100%",
          flow: continuous ? "scrolled-doc" : "paginated",
          manager: continuous ? "continuous" : "default",
          spread: isTwoPage && !continuous ? "always" : "none", minSpreadWidth: 1,
        });
        renditionRef.current = rendition;
        applyTheme(rendition, callbacks.current.settings);
        // Install hooks BEFORE display; the first chapter needs them too.
        rendition.hooks.content.register(contents => {
          const doc = contents.document;
          doc.addEventListener("mousemove", event => {
            const frame = contents.window.frameElement?.getBoundingClientRect();
            window.dispatchEvent(new MouseEvent("mousemove", { clientX: (frame?.left || 0) + event.clientX, clientY: (frame?.top || 0) + event.clientY }));
          });
          let lastWheel = 0;
          let startTouch = null;
          doc.addEventListener("wheel", event => {
            if (callbacks.current.settings.scrollMode === "continuous" || event.ctrlKey) return;
            // Vertical trackpad movements remain available for text selection;
            // deliberate horizontal swipes turn a page once per gesture.
            if (Math.abs(event.deltaX) < Math.max(20, Math.abs(event.deltaY))) return;
            event.preventDefault();
            if (Date.now() - lastWheel < 650) return;
            lastWheel = Date.now(); turn(event.deltaX > 0 ? "next" : "prev");
          }, { passive: false });
          doc.addEventListener("touchstart", e => { startTouch = e.touches[0]?.clientX; }, { passive: true });
          doc.addEventListener("touchend", e => {
            if (startTouch == null || callbacks.current.settings.scrollMode === "continuous" || contents.window.getSelection()?.toString()) return;
            const distance = (e.changedTouches[0]?.clientX ?? startTouch) - startTouch;
            if (Math.abs(distance) > 70) turn(distance < 0 ? "next" : "prev");
            startTouch = null;
          });
          doc.addEventListener("mousedown", () => window.postMessage("EPUB_CLICK", window.location.origin));
          doc.addEventListener("keydown", e => {
            if (e.key === "Escape") window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
            else handleKey(e);
          });
        });
        const report = loc => {
          if (cancelled || !loc?.start?.cfi) return;
          positionRef.current = loc.start.cfi;
          callbacks.current.onCfiChanged?.(loc.start.cfi);
          const index = instance.locations.locationFromCfi(loc.start.cfi);
          if (typeof index === "number" && index >= 0) callbacks.current.onPageChange?.(index + 1, true);
        };
        rendition.on("relocated", report);
        rendition.on("selected", (cfi, contents) => {
          const selection = contents.window.getSelection();
          const text = selection?.toString()?.trim();
          if (!text || !selection.rangeCount) return;
          const rect = selection.getRangeAt(0).getBoundingClientRect();
          const frame = contents.window.frameElement?.getBoundingClientRect() || containerRef.current.getBoundingClientRect();
          callbacks.current.onTextSelected?.({ text, cfi, position: { x: frame.left + rect.left + rect.width / 2, y: frame.top + rect.top - 8 } });
        });
        callbacks.current.onTocLoaded?.(flattenToc((await instance.loaded.navigation).toc));
        try { await rendition.display(positionRef.current || undefined); }
        catch (err) { if (!positionRef.current) throw err; await rendition.display(); }
        if (cancelled) return;
        setLoading(false);
        await instance.locations.generate(1600);
        if (cancelled) return;
        // Locations are character-based positions, not visual page numbers.
        callbacks.current.onTotalPages?.(instance.locations.length());
        report(rendition.location);
      } catch (err) {
        if (!cancelled) { console.error("EPUB load:", err); setError("Não foi possível abrir este EPUB."); setLoading(false); }
      }
    };
    load();
    return () => {
      cancelled = true;
      if (bookRef.current === instance) { bookRef.current = null; renditionRef.current = null; }
      try { instance?.destroy(); } catch {}
    };
  }, [filePath, continuous]);

  function handleKey(e) {
    if (e.target?.closest?.("input, textarea, select, button, [contenteditable=true]") || e.ctrlKey || e.metaKey || e.altKey) return;
    if (callbacks.current.settings.scrollMode === "continuous" && ["ArrowUp", "ArrowDown", "PageUp", "PageDown", " "].includes(e.key)) return;
    if (["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); turn("prev"); }
    if (["ArrowRight", "PageDown", " "].includes(e.key)) { e.preventDefault(); turn(e.shiftKey ? "prev" : "next"); }
  }
  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);
  useEffect(() => {
    if (!renditionRef.current || loading || !currentCfi || renditionRef.current.location?.start?.cfi === currentCfi) return;
    renditionRef.current.display(currentCfi).catch(err => console.warn("EPUB destination:", err));
  }, [currentCfi, loading]);
  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition || loading) return;
    const cfi = positionRef.current;
    applyTheme(rendition, settings);
    rendition.spread(isTwoPage && !continuous ? "always" : "none", 1);
    rendition.resize();
    if (cfi) rendition.display(cfi).catch(() => {});
  }, [settings, isTwoPage, loading, continuous]);
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      const container = containerRef.current;
      const rendition = renditionRef.current;
      // renderTo starts its manager asynchronously; a resize can arrive first.
      if (rendition?.manager?.rendered && rendition.manager.stage && container.clientWidth && container.clientHeight) rendition.resize(container.clientWidth, container.clientHeight);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition || loading) return;
    const colors = { yellow: "#f5ce57", green: "#8fce9b", blue: "#8ebeea", pink: "#eaa4c9", orange: "#e8ad73" };
    const added = [];
    for (const h of highlights || []) {
      if (!h.cfi || added.includes(h.cfi)) continue;
      try {
        rendition.annotations.highlight(h.cfi, {}, () => callbacks.current.onHighlightClick?.(h.id), "reader-passage-highlight", { fill: colors[h.color] || colors.yellow, "fill-opacity": ".4", "mix-blend-mode": settings.theme === "dark" || settings.theme === "night" ? "screen" : "multiply" });
        added.push(h.cfi);
      } catch {}
    }
    return () => added.forEach(cfi => { try { rendition.annotations.remove(cfi, "highlight"); } catch {} });
  }, [highlights, loading, settings.theme]);

  return <div className="reader-epub-engine" style={{ background: theme.bg, color: theme.text }}>
    <div className={`reader-epub-paper ${isTwoPage ? "is-spread" : ""}`} ref={containerRef} />
    {loading && <div className="reader-loading" role="status"><Icon name="auto_stories" /><p>Abrindo seu livro…</p></div>}
    {error && <div className="reader-loading" role="alert"><Icon name="error_outline" /><p>{error}</p></div>}
    {!loading && !error && !continuous && <>
      <button className="reader-edge-turn previous" aria-label="Página anterior" onClick={() => turn("prev")}><Icon name="chevron_left" /></button>
      <button className="reader-edge-turn next" aria-label="Próxima página" onClick={() => turn("next")}><Icon name="chevron_right" /></button>
    </>}
  </div>;
});
