import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Icon } from "../../ui/Icon";
import { readBookBytes } from "../../services/book-files";

import { READER_THEMES, READER_FONTS } from "./readerAppearance";
import { animatePageTurn } from "./readerPageTurn";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const HIGHLIGHT_COLORS = {
  yellow: "rgba(250, 204, 21, 0.42)",
  green:  "rgba(74, 222, 128, 0.42)",
  blue:   "rgba(96, 165, 250, 0.42)",
  pink:   "rgba(244, 114, 182, 0.42)",
  orange: "rgba(251, 146, 60, 0.42)",
};

const THEME_STYLES = READER_THEMES;
const FONT_FAMILIES = READER_FONTS;

async function loadPdfFromPath(filePath) {
  try {
    return await getDocument({ data: await readBookBytes(filePath) }).promise;
  } catch (e) {
    console.error("PDF load error:", e);
    return null;
  }
}

function renderSharpPage(page, canvas, viewport) {
  // Keep CSS coordinates for selection, but use Retina pixels for sharp text.
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.floor(viewport.width * pixelRatio);
  canvas.height = Math.floor(viewport.height * pixelRatio);
  canvas.style.width = viewport.width + "px";
  canvas.style.height = viewport.height + "px";
  return page.render({ canvasContext: canvas.getContext("2d"), viewport, transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0] });
}

function buildTextLayer(textContent, viewport, targetLayer, pageNum, settings) {
  if (!targetLayer) return;
  targetLayer.innerHTML = "";
  targetLayer.dataset.page = pageNum;
  targetLayer.style.width = `${viewport.width}px`;
  targetLayer.style.height = `${viewport.height}px`;

  const fragment = document.createDocumentFragment();

  textContent.items.forEach(item => {
    if (!item.str) return;

    const tr = item.transform;
    let x = 0, y = 0;
    if (typeof viewport.convertToViewportPoint === "function") {
      const pt = viewport.convertToViewportPoint(tr[4], tr[5]);
      x = pt[0];
      y = pt[1];
    } else {
      x = tr[4] * viewport.scale;
      y = viewport.height - (tr[5] * viewport.scale);
    }

    const fontHeight = (Math.sqrt(tr[2] * tr[2] + tr[3] * tr[3]) || Math.abs(tr[3]) || 12) * viewport.scale;

    const span = document.createElement("span");
    span.textContent = item.str;
    span.dataset.page = pageNum;
    span.style.position = "absolute";
    span.style.left = `${x}px`;
    span.style.top = `${y - (fontHeight * 0.85)}px`;
    span.style.fontSize = `${fontHeight}px`;
    span.style.fontFamily = FONT_FAMILIES[settings?.fontFamily] || FONT_FAMILIES.sans;
    span.style.lineHeight = "1";
    span.style.whiteSpace = "pre";
    span.style.cursor = "text";
    span.style.color = "transparent";
    span.style.transformOrigin = "0% 0%";
    span.style.userSelect = "text";
    span.style.webkitUserSelect = "text";
    span.style.pointerEvents = "auto";
    
    fragment.appendChild(span);
  });

  targetLayer.appendChild(fragment);

  const spans = targetLayer.querySelectorAll("span");
  let idx = 0;
  textContent.items.forEach(item => {
    if (!item.str) return;
    const span = spans[idx++];
    if (!span) return;

    const targetWidth = item.width * viewport.scale;
    if (targetWidth > 0) {
      const domWidth = span.getBoundingClientRect().width;
      if (domWidth > 0) {
        const scaleX = targetWidth / domWidth;
        span.style.transform = `scaleX(${scaleX})`;
      }
    }

    let content = item.str;
    if (item.hasEOL) {
      content += "\n";
    } else if (!content.endsWith(" ")) {
      content += " ";
    }
    span.textContent = content;
  });
}

// Highly reliable & fluid single page component in Continuous Scroll Mode
function PdfContinuousPage({
  pdfDoc,
  pageNum,
  currentPage,
  computedScale,
  settings,
  highlights,
  isDarkTheme,
  theme,
  onHighlightClick,
}) {
  const isNearby = Math.abs(pageNum - (currentPage || 1)) <= 4;
  const [isVisible, setIsVisible] = useState(isNearby);
  const [pageDimensions, setPageDimensions] = useState({ width: 600, height: 800 });
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const textLayerRef = useRef(null);
  const renderTaskRef = useRef(null);
  const renderedScaleRef = useRef(null);

  // IntersectionObserver for pre-rendering ahead of scroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
          }
        });
      },
      { rootMargin: "1200px 0px 1200px 0px", threshold: 0.01 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Update page dimensions when scale changes
  useEffect(() => {
    if (!pdfDoc) return;
    let active = true;
    pdfDoc.getPage(pageNum).then((page) => {
      if (!active) return;
      const vp = page.getViewport({ scale: computedScale || 1.0 });
      setPageDimensions({ width: vp.width, height: vp.height });
    }).catch(() => {});
    return () => { active = false; };
  }, [pdfDoc, pageNum, computedScale]);

  // Render canvas & text layer
  useEffect(() => {
    if (!pdfDoc || (!isVisible && !isNearby) || computedScale <= 0) return;
    if (renderedScaleRef.current === computedScale && canvasRef.current && canvasRef.current.dataset.rendered === "true") return;

    let active = true;

    const render = async () => {
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch {}
      }
      try {
        const page = await pdfDoc.getPage(pageNum);
        if (!active) return;

        const viewport = page.getViewport({ scale: computedScale });
        const canvas = canvasRef.current;
        if (canvas) {
          const renderTask = renderSharpPage(page, canvas, viewport);
          renderTaskRef.current = renderTask;
          await renderTask.promise;
          if (!active) return;

          canvas.dataset.rendered = "true";
          renderedScaleRef.current = computedScale;

          const textContent = await page.getTextContent();
          if (active && textLayerRef.current) {
            buildTextLayer(textContent, viewport, textLayerRef.current, pageNum, settings);
          }
        }
      } catch (e) {
        if (e?.name !== "RenderingCancelledException") console.error("PDF render error:", e);
      }
    };

    render();

    return () => {
      active = false;
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch {}
      }
    };
  }, [pdfDoc, pageNum, isVisible, isNearby, computedScale, settings]);

  const pageHighlights = highlights?.filter(h => h.page === pageNum) || [];

  return (
    <div
      ref={containerRef}
      id={`pdf-page-${pageNum}`}
      className="relative shadow-2xl rounded-sm my-4 select-none shrink-0 pdf-page-card bg-white"
      style={{
        width: pageDimensions.width,
        height: pageDimensions.height,
        contain: "layout style paint",
        transform: "translateZ(0)",
      }}
    >
      <canvas ref={canvasRef} style={{ display: "block", filter: theme.filter, width: "100%", height: "100%" }} />
      
      {/* Highlights Overlay */}
      <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
        {pageHighlights.map(h => {
          const viewBoxW = h.canvasWidth || pageDimensions.width;
          const viewBoxH = h.canvasHeight || pageDimensions.height;
          return (
            <svg
              key={h.id}
              data-highlight-id={h.id}
              viewBox={`0 0 ${viewBoxW} ${viewBoxH}`}
              className="absolute inset-0 w-full h-full"
              style={{ mixBlendMode: isDarkTheme ? "screen" : "multiply" }}
            >
              {h.rects?.map((rect, i) => {
                if (h.type === "quote") {
                  return (
                    <g key={`${h.id}-${i}`} className="cursor-pointer" style={{ pointerEvents: "auto" }} onClick={() => onHighlightClick?.(h.id)}>
                      <rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} fill={HIGHLIGHT_COLORS[h.color] || HIGHLIGHT_COLORS.blue} rx="3" opacity="0.6" />
                      <line x1={rect.x} y1={rect.y + rect.height} x2={rect.x + rect.width} y2={rect.y + rect.height} stroke="#3b82f6" strokeWidth="2" strokeDasharray="4 2" />
                    </g>
                  );
                }
                if (h.type === "note") {
                  return (
                    <g key={`${h.id}-${i}`} className="cursor-pointer" style={{ pointerEvents: "auto" }} onClick={() => onHighlightClick?.(h.id)}>
                      <rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} fill={HIGHLIGHT_COLORS[h.color] || HIGHLIGHT_COLORS.orange} rx="3" opacity="0.6" />
                      <path d={`M${rect.x + rect.width - 4},${rect.y - 4} l8,0 l0,8 Z`} fill="#f97316" />
                    </g>
                  );
                }
                return (
                  <rect
                    key={`${h.id}-${i}`}
                    x={rect.x} y={rect.y} width={rect.width} height={rect.height}
                    fill={HIGHLIGHT_COLORS[h.color] || HIGHLIGHT_COLORS.yellow}
                    rx="3"
                  />
                );
              })}
            </svg>
          );
        })}
      </div>

      {/* Text selection layer */}
      <div
        ref={textLayerRef}
        className="pdf-text-layer absolute inset-0 overflow-hidden z-20"
        style={{ userSelect: "text", WebkitUserSelect: "text", pointerEvents: "auto" }}
      />

      <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] font-bold text-[color:var(--on-surface-variant)] opacity-75 tracking-wider uppercase pointer-events-none">
        Pág. {pageNum}
      </div>
    </div>
  );
}

export const PdfReaderEngine = forwardRef(function PdfReaderEngine(
  { filePath, currentPage, settings, isTwoPage, highlights, searchQuery, onTotalPages, onTextSelected, onPageRendered, onPageChange, onHighlightClick, onTocLoaded, focusTarget },
  ref
) {
  const [pdfDoc, setPdfDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [computedScale, setComputedScale] = useState(1.0);

  const isContinuous = (settings?.scrollMode || "paginated") === "continuous";

  const canvasRef = useRef(null);
  const textLayerRef = useRef(null);
  const canvas2Ref = useRef(null);
  const textLayer2Ref = useRef(null);
  const containerRef = useRef(null);
  const renderTaskRef = useRef(null);
  const renderTask2Ref = useRef(null);
  const isScrollingToPageRef = useRef(false);
  const lastReportedPageRef = useRef(currentPage);

  const latestCallbacks = useRef({ onTotalPages, onTocLoaded });
  latestCallbacks.current = { onTotalPages, onTocLoaded };
  useImperativeHandle(ref, () => ({
    getPageCount: () => pdfDoc?.numPages || 0,
    thumbnail: async pageNum => {
      if (!pdfDoc) return "";
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 120 / page.getViewport({ scale: 1 }).width });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width; canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      return canvas.toDataURL();
    },
    search: async query => {
      if (!pdfDoc) return [];
      const matches = [];
      const needle = query.toLocaleLowerCase();
      for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const text = (await page.getTextContent()).items.map(item => item.str).join(" ");
        const lower = text.toLocaleLowerCase();
        let offset = 0;
        while ((offset = lower.indexOf(needle, offset)) !== -1) {
          matches.push({ page: pageNum, excerpt: text.slice(Math.max(0, offset - 50), offset + query.length + 100) });
          offset += needle.length;
          if (matches.length >= 100) return matches;
        }
      }
      return matches;
    },
  }));

  useEffect(() => {
    let cancelled = false;
    let loaded;
    setLoading(true); setError(null);
    loadPdfFromPath(filePath).then(async doc => {
      loaded = doc;
      if (cancelled) { doc?.destroy(); return; }
      if (!doc) { setError("Não foi possível abrir o PDF."); setLoading(false); return; }
      setPdfDoc(doc);
      latestCallbacks.current.onTotalPages?.(doc.numPages);
      setLoading(false);
      const outline = await doc.getOutline();
      const walk = async (items, level = 0) => {
        const entries = [];
        for (const item of items || []) {
          let page;
          try {
            const dest = typeof item.dest === "string" ? await doc.getDestination(item.dest) : item.dest;
            if (dest?.[0] != null) page = typeof dest[0] === "number" ? dest[0] + 1 : (await doc.getPageIndex(dest[0])) + 1;
          } catch {}
          entries.push({ label: item.title, page, level }, ...await walk(item.items, level + 1));
        }
        return entries;
      };
      if (!cancelled) latestCallbacks.current.onTocLoaded?.(await walk(outline));
    }).catch(err => { if (!cancelled) { console.error("PDF outline:", err); } });
    return () => { cancelled = true; loaded?.destroy(); };
  }, [filePath]);

  const updateScale = useCallback(async () => {
    if (!pdfDoc || !containerRef.current) return;
    try {
      const page = await pdfDoc.getPage(currentPage || 1);
      const unscaledViewport = page.getViewport({ scale: 1.0 });
      const container = containerRef.current;
      
      const widthFactor = (!isContinuous && isTwoPage) ? 2 : 1;
      const availableWidth = Math.max((container.clientWidth - ((!isContinuous && isTwoPage) ? 48 : 32)) / widthFactor, 150);
      const availableHeight = Math.max(container.clientHeight - 32, 150);

      let baseScale = 1.0;
      if (!isContinuous) {
        const scaleW = availableWidth / unscaledViewport.width;
        const scaleH = availableHeight / unscaledViewport.height;
        baseScale = settings.pdfFit === "width" ? scaleW : Math.min(scaleW, scaleH);
      } else {
        baseScale = availableWidth / unscaledViewport.width;
      }

      const zoomFactor = settings?.pdfZoom || 1.0;
      const nextScale = baseScale * zoomFactor;
      
      setComputedScale(nextScale);
    } catch {}
  }, [pdfDoc, currentPage, isTwoPage, isContinuous, settings?.pdfZoom, settings?.pdfFit]);

  // Recalculate scale whenever container resizes (e.g., toolbar show/hide)
  useEffect(() => {
    updateScale();
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      updateScale();
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [updateScale]);

  // Smooth scroll to target page in Continuous Mode when currentPage changes externally (TOC / toolbar / bookmark)
  useEffect(() => {
    if (!isContinuous || !containerRef.current || !pdfDoc) return;
    if (currentPage === lastReportedPageRef.current) return;

    const targetEl = document.getElementById(`pdf-page-${currentPage}`);
    if (targetEl && !isScrollingToPageRef.current) {
      isScrollingToPageRef.current = true;
      lastReportedPageRef.current = currentPage;
      targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
      const timer = setTimeout(() => {
        isScrollingToPageRef.current = false;
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [currentPage, isContinuous, pdfDoc]);

  // High-performance scroll listener to track active page without re-render jank
  useEffect(() => {
    if (!isContinuous || !containerRef.current || !pdfDoc) return;
    const container = containerRef.current;
    let ticking = false;

    const handleScroll = () => {
      if (isScrollingToPageRef.current) return;
      if (!ticking) {
        window.requestAnimationFrame(() => {
          ticking = false;
          if (!container) return;
          const containerMid = container.scrollTop + container.clientHeight / 3;

          for (let p = 1; p <= pdfDoc.numPages; p++) {
            const el = document.getElementById(`pdf-page-${p}`);
            if (el) {
              const top = el.offsetTop;
              const height = el.offsetHeight;
              if (containerMid >= top && containerMid < top + height + 32) {
                if (p !== lastReportedPageRef.current) {
                  lastReportedPageRef.current = p;
                  onPageChange?.(p);
                }
                break;
              }
            }
          }
        });
        ticking = true;
      }
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [isContinuous, pdfDoc, onPageChange]);

  const renderedPositionRef = useRef(null);
  // Paginated Mode Rendering (Page 1 & Page 2)
  useEffect(() => {
    if (isContinuous || !pdfDoc || !canvasRef.current || computedScale <= 0) return;

    let cancelled = false;
    const renderPages = async () => {
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch {}
      }
      if (renderTask2Ref.current) {
        try { renderTask2Ref.current.cancel(); } catch {}
      }

      // Page 1
      const page1 = await pdfDoc.getPage(currentPage);
      if (cancelled) return;
      const viewport1 = page1.getViewport({ scale: computedScale });
      const canvas1 = canvasRef.current;
      if (canvas1) {
        const renderTask1 = renderSharpPage(page1, canvas1, viewport1);
        renderTaskRef.current = renderTask1;
        try {
          await renderTask1.promise;
          if (cancelled) return;
          const textContent1 = await page1.getTextContent();
          buildTextLayer(textContent1, viewport1, textLayerRef.current, currentPage, settings);
        } catch (e) {
          if (e?.name !== "RenderingCancelledException") console.error(e);
        }
      }

      // Page 2 (if isTwoPage and page exists)
      const page2Number = currentPage + 1;
      if (isTwoPage && page2Number <= pdfDoc.numPages && canvas2Ref.current) {
        const page2 = await pdfDoc.getPage(page2Number);
        if (cancelled) return;
        const viewport2 = page2.getViewport({ scale: computedScale });
        const canvas2 = canvas2Ref.current;
        const renderTask2 = renderSharpPage(page2, canvas2, viewport2);
        renderTask2Ref.current = renderTask2;
        try {
          await renderTask2.promise;
          if (cancelled) return;
          const textContent2 = await page2.getTextContent();
          buildTextLayer(textContent2, viewport2, textLayer2Ref.current, page2Number, settings);
        } catch (e) {
          if (e?.name !== "RenderingCancelledException") console.error(e);
        }
      }

      const previous = renderedPositionRef.current;
      renderedPositionRef.current = { filePath, page: currentPage };
      // Wait for both pages before animating their text and highlights together.
      if (previous?.filePath === filePath && previous.page !== currentPage) {
        const direction = currentPage > previous.page ? "next" : "prev";
        animatePageTurn(canvasRef.current?.parentElement, direction);
        if (isTwoPage) animatePageTurn(canvas2Ref.current?.parentElement, direction);
      }
      onPageRendered?.(currentPage);
    };

    renderPages().catch(e => {
      if (!cancelled && e?.name !== "RenderingCancelledException") setError("Erro ao renderizar páginas.");
    });
    return () => { cancelled = true; renderTaskRef.current?.cancel(); renderTask2Ref.current?.cancel(); };
  }, [pdfDoc, currentPage, computedScale, isTwoPage, isContinuous, settings]);

  useEffect(() => {
    if (!focusTarget || !pdfDoc || loading || focusTarget.page !== currentPage) return;
    const timer = setTimeout(() => {
      const root = containerRef.current;
      const highlight = Array.from(root?.querySelectorAll("svg[data-highlight-id]") || []).find(el => el.dataset.highlightId === focusTarget.highlightId);
      const container = isContinuous ? root : highlight?.closest(".relative.flex") || root;
      const rect = highlight?.querySelector("rect");
      if (!rect || !container) return;
      const bounds = rect.getBoundingClientRect();
      const viewport = container.getBoundingClientRect();
      container.scrollBy({ top: bounds.top - viewport.top - viewport.height / 2, left: bounds.left - viewport.left - viewport.width / 2, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      rect.animate([{ stroke: "#bb812d", strokeWidth: "2px" }, { stroke: "transparent", strokeWidth: "2px" }], { duration: 1400 });
    }, 300);
    return () => clearTimeout(timer);
  }, [focusTarget, pdfDoc, loading, currentPage, computedScale, isContinuous]);

  // Text selection handling across pages
  useEffect(() => {
    const checkSelection = () => {
      const selection = window.getSelection();
      const rawText = selection?.toString() || "";
      const text = rawText.replace(/[ \t]+/g, " ").replace(/ \n /g, "\n").trim();
      if (text && text.length > 1) {
        try {
          const range = selection.getRangeAt(0);
          const rangeRects = Array.from(range.getClientRects());
          const anchorNode = selection.anchorNode?.nodeType === Node.TEXT_NODE ? selection.anchorNode.parentElement : selection.anchorNode;
          // Keyboard/DOM selections may anchor on the span itself, not its text node.
          const selectedPage = Number(anchorNode?.closest?.("[data-page]")?.dataset?.page) || currentPage;

          const targetPageEl = document.getElementById(`pdf-page-${selectedPage}`) || (selectedPage === currentPage + 1 ? canvas2Ref.current : canvasRef.current);
          const targetCanvas = targetPageEl?.querySelector?.("canvas") || targetPageEl;
          const canvasBounds = targetCanvas ? targetCanvas.getBoundingClientRect() : null;

          if (canvasBounds && targetCanvas && rangeRects.length > 0 && canvasBounds.width > 0 && canvasBounds.height > 0) {
            const canvasWidth = canvasBounds.width;
            const canvasHeight = canvasBounds.height;
            const scaleX = canvasWidth / canvasBounds.width;
            const scaleY = canvasHeight / canvasBounds.height;

            const relativeRects = rangeRects.map(r => ({
              x: (r.left - canvasBounds.left) * scaleX,
              y: (r.top - canvasBounds.top) * scaleY,
              width: r.width * scaleX,
              height: r.height * scaleY,
            })).filter(r => r.width > 1 && r.height > 1);

            const mainRect = range.getBoundingClientRect();

            onTextSelected?.({
              text,
              page: selectedPage,
              rects: relativeRects,
              canvasWidth,
              canvasHeight,
              position: { x: mainRect.left + mainRect.width / 2, y: mainRect.top - 8 }
            });
            return;
          }
        } catch {}
      }
    };

    const handleMouseUp = () => {
      setTimeout(checkSelection, 50);
    };

    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, [currentPage, onTextSelected]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target?.closest?.("input, textarea, select, button, [contenteditable=true]") || e.ctrlKey || e.metaKey || e.altKey) return;
      const container = containerRef.current;

      if (isContinuous && container) {
        const lineStep = 60; // 1 line step scroll like Koodo Reader
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
          if (pdfDoc && currentPage < pdfDoc.numPages) onPageChange?.(currentPage + 1);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          if (currentPage > 1) onPageChange?.(currentPage - 1);
        }
      } else {
        if (e.repeat) return;
        const step = isTwoPage ? 2 : 1;
        if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp") {
          e.preventDefault();
          if (currentPage > 1) onPageChange?.(Math.max(1, currentPage - step));
        } else if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ") {
          e.preventDefault();
          if (pdfDoc && currentPage < pdfDoc.numPages) onPageChange?.(Math.min(pdfDoc.numPages, currentPage + step));
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentPage, pdfDoc, isTwoPage, isContinuous, onPageChange]);

  const theme = THEME_STYLES[settings?.theme] || THEME_STYLES.light;
  const isDarkTheme = settings?.theme === "dark" || settings?.theme === "night";

  return (
    <div
      ref={containerRef}
      className={`reader-pdf-engine flex-1 relative w-full h-full ${
        isContinuous
          ? "overflow-y-auto overflow-x-auto flex flex-col items-center py-6 gap-6 scroll-smooth pdf-continuous-container"
          : "overflow-auto flex items-center justify-center"
      }`}
      style={{
        backgroundColor: theme.bg,
        WebkitOverflowScrolling: "touch",
        overscrollBehaviorY: "contain",
      }}
    >
      {/* Selection Highlight Styles */}
      <style>{`
        .pdf-text-layer ::selection {
          background: rgba(59, 130, 246, 0.35) !important;
          color: transparent !important;
        }
        .pdf-text-layer ::-moz-selection {
          background: rgba(59, 130, 246, 0.35) !important;
          color: transparent !important;
        }
        .pdf-continuous-container {
          scroll-behavior: smooth;
        }
        .pdf-page-card {
          contain: layout style paint;
          transform: translateZ(0);
        }
      `}</style>

      {loading && (
        <div className="flex flex-col items-center justify-center gap-4 py-20" style={{ color: theme.text }}>
          <Icon name="hourglass_top" className="text-4xl animate-spin text-[color:var(--primary)]" />
          <p className="text-sm font-bold">Carregando PDF...</p>
        </div>
      )}

      {error && (
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-red-400">
          <Icon name="error" className="text-4xl" />
          <p className="text-sm font-bold">{error}</p>
        </div>
      )}

      {/* CONTINUOUS SCROLL VIEW */}
      {!loading && !error && isContinuous && pdfDoc && (
        <div className="flex flex-col items-center py-4 gap-6 w-full max-w-full">
          {Array.from({ length: pdfDoc.numPages }, (_, i) => i + 1).map(pageNum => (
            <PdfContinuousPage
              key={pageNum}
              pdfDoc={pdfDoc}
              pageNum={pageNum}
              currentPage={currentPage}
              computedScale={computedScale}
              settings={settings}
              highlights={highlights}
              isDarkTheme={isDarkTheme}
              theme={theme}
              onHighlightClick={onHighlightClick}
            />
          ))}
        </div>
      )}

      {/* PAGINATED VIEW */}
      {!loading && !error && !isContinuous && (
        <div className="relative flex items-center justify-center gap-4 w-full h-full overflow-auto p-4">
          {/* Page 1 */}
          <div className="relative shadow-2xl rounded-sm bg-white transition-all duration-200">
            <canvas ref={canvasRef} style={{ display: "block", filter: theme.filter }} />

            {/* SVG viewBox highlight overlay Page 1 */}
            <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
              {highlights?.filter(h => h.page === currentPage).map(h => {
                const viewBoxW = h.canvasWidth || (canvasRef.current?.width || 100);
                const viewBoxH = h.canvasHeight || (canvasRef.current?.height || 100);
                return (
                  <svg
                    key={h.id}
                    data-highlight-id={h.id}
                    viewBox={`0 0 ${viewBoxW} ${viewBoxH}`}
                    className="absolute inset-0 w-full h-full"
                    style={{ mixBlendMode: isDarkTheme ? "screen" : "multiply" }}
                  >
                    {h.rects?.map((rect, i) => {
                      if (h.type === "quote") {
                        return (
                          <g key={`${h.id}-${i}`} className="cursor-pointer" style={{ pointerEvents: "auto" }} onClick={() => onHighlightClick?.(h.id)}>
                            <rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} fill={HIGHLIGHT_COLORS[h.color] || HIGHLIGHT_COLORS.blue} rx="3" opacity="0.6" />
                            <line x1={rect.x} y1={rect.y + rect.height} x2={rect.x + rect.width} y2={rect.y + rect.height} stroke="#3b82f6" strokeWidth="2" strokeDasharray="4 2" />
                          </g>
                        );
                      }
                      if (h.type === "note") {
                        return (
                          <g key={`${h.id}-${i}`} className="cursor-pointer" style={{ pointerEvents: "auto" }} onClick={() => onHighlightClick?.(h.id)}>
                            <rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} fill={HIGHLIGHT_COLORS[h.color] || HIGHLIGHT_COLORS.orange} rx="3" opacity="0.6" />
                            <path d={`M${rect.x + rect.width - 4},${rect.y - 4} l8,0 l0,8 Z`} fill="#f97316" />
                          </g>
                        );
                      }
                      return (
                        <rect
                          key={`${h.id}-${i}`}
                          x={rect.x} y={rect.y} width={rect.width} height={rect.height}
                          fill={HIGHLIGHT_COLORS[h.color] || HIGHLIGHT_COLORS.yellow}
                          rx="3"
                        />
                      );
                    })}
                  </svg>
                );
              })}
            </div>

            {/* Text selection layer Page 1 */}
            <div
              ref={textLayerRef}
              className="pdf-text-layer absolute inset-0 overflow-hidden z-20"
              style={{ userSelect: "text", WebkitUserSelect: "text", pointerEvents: "auto" }}
            />

            <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] font-bold text-[color:var(--on-surface-variant)] opacity-75 tracking-wider uppercase pointer-events-none">
              Pág. {currentPage}
            </div>
          </div>

          {/* Page 2 (if Two-Page mode is enabled) */}
          {isTwoPage && currentPage + 1 <= (pdfDoc?.numPages || 0) && (
            <div className="relative shadow-2xl rounded-sm bg-white transition-all duration-200">
              <canvas ref={canvas2Ref} style={{ display: "block", filter: theme.filter }} />

              <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
                {highlights?.filter(h => h.page === currentPage + 1).map(h => {
                  const viewBoxW = h.canvasWidth || (canvas2Ref.current?.width || 100);
                  const viewBoxH = h.canvasHeight || (canvas2Ref.current?.height || 100);
                  return (
                    <svg
                      key={h.id}
                      data-highlight-id={h.id}
                      viewBox={`0 0 ${viewBoxW} ${viewBoxH}`}
                      className="absolute inset-0 w-full h-full"
                      style={{ mixBlendMode: isDarkTheme ? "screen" : "multiply" }}
                    >
                    {h.rects?.map((rect, i) => {
                      if (h.type === "quote") {
                        return (
                          <g key={`${h.id}-${i}`} className="cursor-pointer" style={{ pointerEvents: "auto" }} onClick={() => onHighlightClick?.(h.id)}>
                            <rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} fill={HIGHLIGHT_COLORS[h.color] || HIGHLIGHT_COLORS.blue} rx="3" opacity="0.6" />
                            <line x1={rect.x} y1={rect.y + rect.height} x2={rect.x + rect.width} y2={rect.y + rect.height} stroke="#3b82f6" strokeWidth="2" strokeDasharray="4 2" />
                          </g>
                        );
                      }
                      if (h.type === "note") {
                        return (
                          <g key={`${h.id}-${i}`} className="cursor-pointer" style={{ pointerEvents: "auto" }} onClick={() => onHighlightClick?.(h.id)}>
                            <rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} fill={HIGHLIGHT_COLORS[h.color] || HIGHLIGHT_COLORS.orange} rx="3" opacity="0.6" />
                            <path d={`M${rect.x + rect.width - 4},${rect.y - 4} l8,0 l0,8 Z`} fill="#f97316" />
                          </g>
                        );
                      }
                      return (
                        <rect
                          key={`${h.id}-${i}`}
                          x={rect.x} y={rect.y} width={rect.width} height={rect.height}
                          fill={HIGHLIGHT_COLORS[h.color] || HIGHLIGHT_COLORS.yellow}
                          rx="3"
                        />
                      );
                    })}
                    </svg>
                  );
                })}
              </div>

              <div
                ref={textLayer2Ref}
                className="pdf-text-layer absolute inset-0 overflow-hidden z-20"
                style={{ userSelect: "text", WebkitUserSelect: "text", pointerEvents: "auto" }}
              />

              <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] font-bold text-[color:var(--on-surface-variant)] opacity-75 tracking-wider uppercase pointer-events-none">
                Pág. {currentPage + 1}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Prev page lateral button */}
      {!loading && !error && (
        <div className="reader-pdf-edge previous">
          <button
            onClick={() => currentPage > 1 && onPageChange?.(Math.max(1, currentPage - (!isContinuous && isTwoPage ? 2 : 1)))}
            disabled={currentPage <= 1}
            aria-label="Página anterior"
            className="w-10 h-10 flex items-center justify-center rounded-full bg-[color:var(--surface)] shadow-xl border border-[color:var(--outline-variant)]/40 text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)] transition-all opacity-40 hover:opacity-100 disabled:opacity-0 pointer-events-auto"
          >
            <Icon name="chevron_left" className="text-[24px]" />
          </button>
        </div>
      )}

      {/* Next page lateral button */}
      {!loading && !error && (
        <div className="reader-pdf-edge next">
          <button
            onClick={() => pdfDoc && currentPage < pdfDoc.numPages && onPageChange?.(Math.min(pdfDoc.numPages, currentPage + (!isContinuous && isTwoPage ? 2 : 1)))}
            disabled={pdfDoc && currentPage >= pdfDoc.numPages}
            aria-label="Próxima página"
            className="w-10 h-10 flex items-center justify-center rounded-full bg-[color:var(--surface)] shadow-xl border border-[color:var(--outline-variant)]/40 text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)] transition-all opacity-40 hover:opacity-100 disabled:opacity-0 pointer-events-auto"
          >
            <Icon name="chevron_right" className="text-[24px]" />
          </button>
        </div>
      )}


    </div>
  );
});
