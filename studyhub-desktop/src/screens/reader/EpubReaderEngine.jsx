import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import Epub from "epubjs";
import { Icon } from "../../ui/Icon";
import { getLocalFilePath, getLocalFileUrl } from "../../utils/localFileUrl";

const THEME_STYLES = {
  light:  { bg: "#ffffff", text: "#1a1a1a", link: "#2563eb" },
  sepia:  { bg: "#f5ede0", text: "#3d2b1f", link: "#92400e" },
  dark:   { bg: "#1e1e2e", text: "#cdd6f4", link: "#89b4fa" },
  night:  { bg: "#0d0d0d", text: "#a0a0a0", link: "#6b7280" },
};

const FONT_FAMILIES = {
  serif: "Georgia, 'Times New Roman', serif",
  sans:  "'Inter', system-ui, sans-serif",
  mono:  "'Courier New', Courier, monospace",
};

async function resolveSrc(filePath) {
  if (!filePath) return "";
  const localPath = getLocalFilePath(filePath);
  if (localPath && window.studyhubDesktop?.readFileBinary) {
    try {
      const binary = await window.studyhubDesktop.readFileBinary(localPath);
      let buffer = null;
      if (binary instanceof ArrayBuffer) {
        buffer = binary;
      } else if (ArrayBuffer.isView(binary)) {
        buffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength);
      }

      if (buffer) {
        return buffer;
      }
    } catch (binErr) {
      console.warn("EPUB binary load fallback to URL:", binErr);
    }
  }
  return getLocalFileUrl(filePath);
}

function buildThemeCss(settings) {
  const theme = THEME_STYLES[settings?.theme] || THEME_STYLES.light;
  const fontFamily = FONT_FAMILIES[settings?.fontFamily] || FONT_FAMILIES.serif;
  const fontSize = settings?.fontSize || 16;
  const lineHeight = settings?.lineSpacing || 1.6;
  return { theme, fontFamily, fontSize, lineHeight };
}

export const EpubReaderEngine = forwardRef(function EpubReaderEngine(
  { filePath, currentCfi, settings, isTwoPage, highlights, onTotalPages, onTextSelected, onCfiChanged, onPageChange, onTocLoaded, onHighlightClick },
  ref
) {
  const containerRef = useRef(null);
  const bookRef = useRef(null);
  const renditionRef = useRef(null);
  const mountedRef = useRef(true);
  const lastPageTurnRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [loadingStep, setLoadingStep] = useState("Lendo arquivo...");
  const [error, setError] = useState(null);
  const [hoverZone, setHoverZone] = useState(null);

  const applyTheme = useCallback((rendition, s) => {
    if (!rendition) return;
    const currentSettings = s || settings;
    const { theme, fontFamily, fontSize, lineHeight } = buildThemeCss(currentSettings);
    const isContinuous = (currentSettings?.scrollMode || "paginated") === "continuous";
    rendition.themes.default({
      html: {
        "overflow-y": isContinuous ? "auto !important" : "hidden !important",
        "-webkit-overflow-scrolling": "touch !important",
        "scroll-behavior": "smooth !important",
      },
      body: {
        background: `${theme.bg} !important`,
        color: `${theme.text} !important`,
        fontFamily: `${fontFamily} !important`,
        fontSize: `${fontSize}px !important`,
        lineHeight: `${lineHeight} !important`,
        padding: isContinuous ? "24px 36px 48px 36px !important" : "24px 48px !important",
        margin: isContinuous ? "0 auto !important" : "0 !important",
        "max-width": isContinuous ? "800px !important" : "none !important",
        "-webkit-overflow-scrolling": "touch !important",
        "scroll-behavior": "smooth !important",
      },
      "a": { color: `${theme.link} !important` },
      "::selection": { background: "rgba(99,102,241,0.3) !important" },
      "img": { "max-width": "100% !important", height: "auto !important" },
      "svg": { "max-width": "100% !important" },
      "table": { "max-width": "100% !important", "overflow-x": "auto !important" },
      "pre": { "max-width": "100% !important", "overflow-x": "auto !important", "white-space": "pre-wrap !important" },
    });
  }, [settings]);

  // Handle Highlights
  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition || loading) return;

    // Remove existing annotations
    const currAnnotations = rendition.annotations?._annotations;
    if (currAnnotations) {
      Object.keys(currAnnotations).forEach(cfi => rendition.annotations.remove(cfi, "highlight"));
      Object.keys(currAnnotations).forEach(cfi => rendition.annotations.remove(cfi, "underline"));
    }

    // Add new highlights
    if (highlights && highlights.length > 0) {
      highlights.forEach(h => {
        if (!h.cfi) return;
        try {
          if (h.type === "quote") {
            rendition.annotations.highlight(h.cfi, {}, (e) => { onHighlightClick?.(h.id); }, undefined, {
              fill: "rgba(59, 130, 246, 0.2)",
              "border-bottom": "2px dashed #3b82f6",
              "cursor": "pointer"
            });
          } else if (h.type === "note") {
            rendition.annotations.highlight(h.cfi, {}, (e) => { onHighlightClick?.(h.id); }, undefined, {
              fill: "rgba(249, 115, 22, 0.3)",
              "border-bottom": "2px solid #f97316",
              "cursor": "pointer"
            });
          } else {
            rendition.annotations.highlight(h.cfi, {}, (e) => { onHighlightClick?.(h.id); }, undefined, {
              fill: "rgba(250, 204, 21, 0.4)",
              "cursor": "pointer"
            });
          }
        } catch(e) {}
      });
    }
  }, [highlights, loading, onHighlightClick]);

  const prevPage = useCallback(() => {
    const now = Date.now();
    if (now - lastPageTurnRef.current < 500) return;
    lastPageTurnRef.current = now;
    if (renditionRef.current) {
      renditionRef.current.prev();
    }
  }, []);

  const nextPage = useCallback(() => {
    const now = Date.now();
    if (now - lastPageTurnRef.current < 500) return;
    lastPageTurnRef.current = now;
    if (renditionRef.current) {
      renditionRef.current.next();
    }
  }, []);

  const goToPage = useCallback((page) => {
    if (bookRef.current && bookRef.current.locations && renditionRef.current) {
      try {
        // page is 1-indexed from UI, locations are 0-indexed
        const locIndex = Math.max(0, page - 1);
        const cfi = bookRef.current.locations.cfiFromLocation(locIndex);
        if (cfi) {
          renditionRef.current.display(cfi);
        }
      } catch (err) {
        console.error("Error going to page:", err);
      }
    }
  }, []);

  useImperativeHandle(ref, () => ({
    nextPage,
    prevPage,
    goToPage,
    displayCfi: (cfi) => renditionRef.current?.display(cfi),
  }));

  // Update spread and recalculate layout when isTwoPage changes
  useEffect(() => {
    if (renditionRef.current && !loading) {
      try {
        const rendition = renditionRef.current;
        const currCfi = rendition.location?.start?.cfi;
        rendition.spread(isTwoPage ? "always" : "none", isTwoPage ? 1 : 9999);
        
        // Force resize to apply any max-width CSS changes based on isTwoPage
        if (containerRef.current) {
          rendition.resize(containerRef.current.clientWidth, containerRef.current.clientHeight);
        }

        if (currCfi) {
          renditionRef.current.display(currCfi);
        }
      } catch (err) {
        console.error("Spread toggle error:", err);
      }
    }
  }, [isTwoPage, loading]);

  const lastEmittedCfiRef = useRef(null);

  // Handle external CFI changes (e.g. from TOC or Bookmarks)
  useEffect(() => {
    if (!renditionRef.current || loading || !currentCfi) return;
    if (currentCfi === lastEmittedCfiRef.current) return;
    try {
      const currentLoc = renditionRef.current.location?.start?.cfi;
      const currentHref = renditionRef.current.location?.start?.href;
      
      if (currentLoc !== currentCfi && currentHref !== currentCfi) {
        lastEmittedCfiRef.current = currentCfi;
        renditionRef.current.display(currentCfi);
      }
    } catch (e) {
      console.error("Error displaying CFI:", e);
    }
  }, [currentCfi, loading]);

  // Window resize handler for EPUB rendition
  useEffect(() => {
    const handleResize = () => {
      if (renditionRef.current && containerRef.current) {
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        if (w > 0 && h > 0) {
          try {
            renditionRef.current.resize(w, h);
          } catch {}
        }
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (!filePath || !containerRef.current) return;

    const loadEpub = async () => {
      try {
        setLoading(true);
        setError(null);
        setLoadingStep("Lendo arquivo...");

        const src = await resolveSrc(filePath);
        if (!mountedRef.current) return;

        setLoadingStep("Inicializando livro...");

        if (bookRef.current) {
          try { bookRef.current.destroy(); } catch {}
          bookRef.current = null;
          renditionRef.current = null;
        }

        const openOptions = typeof src === "string" ? { openAs: "epub" } : { openAs: "binary" };
        const book = Epub(src, openOptions);
        bookRef.current = book;

        const containerWidth = containerRef.current?.clientWidth || window.innerWidth;
        const containerHeight = containerRef.current?.clientHeight || window.innerHeight;

        const isContinuous = settings?.scrollMode === "continuous";
        const rendition = book.renderTo(containerRef.current, {
          width: "100%",
          height: "100%",
          flow: isContinuous ? "scrolled" : "paginated",
          manager: "default",
          spread: isTwoPage && !isContinuous ? "always" : "none",
          minSpreadWidth: isTwoPage ? 1 : 9999,
        });
        renditionRef.current = rendition;

        applyTheme(rendition, settings);

        setLoadingStep("Renderizando...");

        try {
          if (currentCfi) {
            await rendition.display(currentCfi);
          } else {
            await rendition.display();
          }
        } catch (dispErr) {
          console.warn("EPUB rendition.display with CFI failed, falling back to start:", dispErr);
          try {
            await rendition.display();
          } catch (err2) {
            console.error("EPUB display failed completely:", err2);
          }
        }

        if (!mountedRef.current) return;

        setLoading(false);

        // Generate locations for page number count (1600 chars ≈ 1 visual page)
        book.ready.then(() => {
          return book.locations.generate(1600);
        }).then(() => {
          if (mountedRef.current && book.locations) {
            const total = book.locations.total || 0;
            if (total > 0) {
              onTotalPages?.(total);
              // Report initial page position now that locations are ready
              const loc = renditionRef.current?.location;
              if (loc?.start?.cfi) {
                try {
                  const pg = book.locations.locationFromCfi(loc.start.cfi);
                  if (pg && pg > 0) onPageChange?.(pg, true);
                } catch {}
              }
            }
          }
        }).catch(() => {});

        // Load TOC
        book.loaded.navigation.then(nav => {
          if (!mountedRef.current) return;
          onTocLoaded?.(flattenToc(nav.toc));
        }).catch(() => {});

        // Neutralize wheel trackpad inertia in paginated mode
        rendition.hooks.content.register((contents) => {
          const doc = contents.document;
          let wheelTimer = null;
          doc.addEventListener("wheel", (e) => {
            const isCont = settings?.scrollMode === "continuous";
            if (isCont) return;

            e.preventDefault();
            if (wheelTimer) return;
            
            wheelTimer = setTimeout(() => { wheelTimer = null; }, 600);
            
            if (e.deltaY > 0 || e.deltaX > 0) {
              nextPage();
            } else if (e.deltaY < 0 || e.deltaX < 0) {
              prevPage();
            }
          }, { passive: false });
        });

        // Selection event
        rendition.on("selected", (cfiRange, contents) => {
          const selection = contents.window.getSelection();
          const text = selection?.toString()?.trim();
          if (text && text.length > 1) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            const containerRect = containerRef.current?.getBoundingClientRect() || { top: 0, left: 0 };
            onTextSelected?.({
              text,
              cfi: cfiRange,
              position: {
                x: containerRect.left + rect.left + rect.width / 2,
                y: containerRect.top + rect.top - 8,
              }
            });
          }
        });

        // Outside click handler
        rendition.on("mousedown", () => {
          window.parent.postMessage("EPUB_CLICK", "*");
        });
        rendition.on("touchstart", () => {
          window.parent.postMessage("EPUB_CLICK", "*");
        });

        // Keyboard navigation inside EPUB iframe
        rendition.on("keydown", (e) => {
          if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
          const isContinuous = (settings?.scrollMode || "continuous") === "continuous";
          const container = containerRef.current?.parentElement || containerRef.current;

          if (isContinuous && container) {
            const lineStep = 60;
            const pageStep = container.clientHeight * 0.85;

            if (e.key === "ArrowDown") {
              e.preventDefault();
              container.scrollBy({ top: lineStep, behavior: "smooth" });
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              container.scrollBy({ top: -lineStep, behavior: "smooth" });
            } else if (e.key === "PageDown" || (e.key === " " && !e.shiftKey)) {
              e.preventDefault();
              container.scrollBy({ top: pageStep, behavior: "smooth" });
            } else if (e.key === "PageUp" || (e.key === " " && e.shiftKey)) {
              e.preventDefault();
              container.scrollBy({ top: -pageStep, behavior: "smooth" });
            } else if (e.key === "ArrowRight") {
              e.preventDefault();
              nextPage();
            } else if (e.key === "ArrowLeft") {
              e.preventDefault();
              prevPage();
            }
          } else {
            if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp") {
              e.preventDefault();
              prevPage();
            } else if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ") {
              e.preventDefault();
              nextPage();
            }
          }
        });

        rendition.on("relocated", (location) => {
          if (!mountedRef.current) return;
          if (location.start?.cfi) {
            lastEmittedCfiRef.current = location.start.cfi;
            onCfiChanged?.(location.start.cfi);
          }
          // Only report page if locations have been generated
          if (book.locations && book.locations.total > 0 && location.start?.cfi) {
            try {
              const pg = book.locations.locationFromCfi(location.start.cfi);
              if (typeof pg === "number" && pg >= 0) {
                // locations are 0-indexed, display as 1-indexed
                onPageChange?.(pg + 1, true);
              }
            } catch {}
          }
        });

      } catch (e) {
        console.error("EPUB load error:", e);
        if (mountedRef.current) {
          setError("Não foi possível abrir o EPUB.");
          setLoading(false);
        }
      }
    };

    loadEpub();

    return () => {
      mountedRef.current = false;
    };
  }, [filePath, settings?.scrollMode]);

  // Apply theme live without reloading the book
  useEffect(() => {
    if (renditionRef.current && !loading) {
      applyTheme(renditionRef.current, settings);
    }
  }, [settings?.theme, settings?.fontSize, settings?.fontFamily, settings?.lineSpacing]);

  // Keyboard navigation on outer window
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      const isContinuous = (settings?.scrollMode || "paginated") === "continuous";
      const container = containerRef.current?.parentElement || containerRef.current;

      if (isContinuous && container) {
        const lineStep = 60;
        const pageStep = container.clientHeight * 0.85;

        if (e.key === "ArrowDown") {
          e.preventDefault();
          container.scrollBy({ top: lineStep, behavior: "smooth" });
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          container.scrollBy({ top: -lineStep, behavior: "smooth" });
        } else if (e.key === "PageDown" || (e.key === " " && !e.shiftKey)) {
          e.preventDefault();
          container.scrollBy({ top: pageStep, behavior: "smooth" });
        } else if (e.key === "PageUp" || (e.key === " " && e.shiftKey)) {
          e.preventDefault();
          container.scrollBy({ top: -pageStep, behavior: "smooth" });
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          nextPage();
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          prevPage();
        }
      } else {
        if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp") {
          e.preventDefault();
          prevPage();
        } else if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ") {
          e.preventDefault();
          nextPage();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [prevPage, nextPage, settings?.scrollMode]);

  const theme = THEME_STYLES[settings?.theme] || THEME_STYLES.light;

  return (
    <div className="flex-1 flex relative overflow-hidden" style={{ backgroundColor: theme.bg, maxWidth: "100%", maxHeight: "100%" }}>
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 z-20"
          style={{ backgroundColor: theme.bg }}>
          <div className="relative w-16 h-16">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: `${theme.text}10` }}>
              <Icon name="auto_stories" className="text-4xl" style={{ color: theme.text, opacity: 0.7 }} />
            </div>
            <svg className="absolute inset-0 w-full h-full animate-spin" viewBox="0 0 64 64" fill="none">
              <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="3"
                className="text-[color:var(--primary)] opacity-20" />
              <path d="M32 4 A28 28 0 0 1 60 32" stroke="currentColor" strokeWidth="3"
                strokeLinecap="round" className="text-[color:var(--primary)]" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm font-bold" style={{ color: theme.text }}>{loadingStep}</p>
            <p className="text-xs mt-1 opacity-50" style={{ color: theme.text }}>EPUB</p>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-20">
          <Icon name="error" className="text-5xl text-red-500" />
          <p className="text-sm font-bold text-[color:var(--on-surface)]">{error}</p>
          <p className="text-xs text-[color:var(--on-surface-variant)]">Verifique se o arquivo é um EPUB válido.</p>
        </div>
      )}

      {/* Prev page button */}
      {!loading && !error && (
        <div className="absolute left-4 top-0 bottom-0 w-16 flex items-center justify-center z-30 pointer-events-none">
          <button
            onClick={prevPage}
            aria-label="Página anterior"
            className="w-10 h-10 flex items-center justify-center rounded-full bg-[color:var(--surface)] shadow-xl border border-[color:var(--outline-variant)]/40 text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)] transition-all opacity-40 hover:opacity-100 pointer-events-auto"
          >
            <Icon name="chevron_left" className="text-[24px]" />
          </button>
        </div>
      )}

      {/* EPUB render target */}
      <div className={`flex-1 flex justify-center w-full h-full ${(settings?.scrollMode || "paginated") === "continuous" ? "overflow-y-auto overflow-x-hidden" : "overflow-hidden"}`}
        style={{ scrollbarWidth: (settings?.scrollMode || "paginated") === "paginated" ? "none" : undefined }}
      >
        <div ref={containerRef} className={`w-full h-full ${!isTwoPage || (settings?.scrollMode || "paginated") === "continuous" ? "max-w-[800px]" : "max-w-7xl"}`}
          style={{ overflow: "hidden" }}
        />
      </div>

      {/* Next page button */}
      {!loading && !error && (
        <div className="absolute right-4 top-0 bottom-0 w-16 flex items-center justify-center z-30 pointer-events-none">
          <button
            onClick={nextPage}
            aria-label="Próxima página"
            className="w-10 h-10 flex items-center justify-center rounded-full bg-[color:var(--surface)] shadow-xl border border-[color:var(--outline-variant)]/40 text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)] transition-all opacity-40 hover:opacity-100 pointer-events-auto"
          >
            <Icon name="chevron_right" className="text-[24px]" />
          </button>
        </div>
      )}
    </div>
  );
});

function flattenToc(items, level = 0) {
  const result = [];
  for (const item of (items || [])) {
    result.push({ label: item.label?.trim(), cfi: item.href, level });
    if (item.subitems?.length) result.push(...flattenToc(item.subitems, level + 1));
  }
  return result;
}
