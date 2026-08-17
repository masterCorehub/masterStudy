import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Icon } from "../../ui/Icon";
import { getLocalFilePath, getLocalFileUrl } from "../../utils/localFileUrl";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const HIGHLIGHT_COLORS = {
  yellow: "rgba(250, 204, 21, 0.42)",
  green:  "rgba(74, 222, 128, 0.42)",
  blue:   "rgba(96, 165, 250, 0.42)",
  pink:   "rgba(244, 114, 182, 0.42)",
  orange: "rgba(251, 146, 60, 0.42)",
};

const THEME_STYLES = {
  light:  { bg: "#ffffff", text: "#1a1a1a", filter: "none" },
  sepia:  { bg: "#f5ede0", text: "#3d2b1f", filter: "sepia(0.55) contrast(0.95) brightness(0.96)" },
  dark:   { bg: "#1e1e2e", text: "#cdd6f4", filter: "invert(0.92) hue-rotate(180deg) contrast(0.95)" },
  night:  { bg: "#0d0d0d", text: "#a0a0a0", filter: "invert(0.96) hue-rotate(180deg) brightness(0.85) contrast(0.95)" },
};

const FONT_FAMILIES = {
  serif: "Georgia, 'Times New Roman', serif",
  sans:  "'Inter', system-ui, sans-serif",
  mono:  "'Courier New', Courier, monospace",
};

async function loadPdfFromPath(filePath) {
  try {
    const localPath = getLocalFilePath(filePath);
    if (localPath && window.studyhubDesktop?.readFileBinary) {
      try {
        const binary = await window.studyhubDesktop.readFileBinary(localPath);
        let uint8 = null;
        if (binary instanceof ArrayBuffer) {
          uint8 = new Uint8Array(binary);
        } else if (ArrayBuffer.isView(binary)) {
          uint8 = new Uint8Array(binary.buffer, binary.byteOffset, binary.byteLength);
        }

        if (uint8) {
          return await getDocument({ data: uint8 }).promise;
        }
      } catch (binErr) {
        console.warn("PDF binary load fallback to URL:", binErr);
      }
    }
    const url = getLocalFileUrl(filePath);
    return await getDocument({ url }).promise;
  } catch (e) {
    console.error("PDF load error:", e);
    return null;
  }
}

function buildTextLayer(textContent, viewport, targetLayer, pageNum, settings) {
  if (!targetLayer) return;
  targetLayer.innerHTML = "";
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
          const ctx = canvas.getContext("2d");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const renderTask = page.render({ canvasContext: ctx, viewport });
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
  { filePath, currentPage, settings, isTwoPage, highlights, searchQuery, onTotalPages, onTextSelected, onPageRendered, onPageChange, onHighlightClick },
  ref
) {
  const [pdfDoc, setPdfDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fitMode, setFitMode] = useState("page"); // "page" | "width" | "custom"
  const [customScale, setCustomScale] = useState(1.0);
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

  useImperativeHandle(ref, () => ({
    getPageCount: () => pdfDoc?.numPages || 0,
  }));

  // Load PDF
  useEffect(() => {
    if (!filePath) return;
    setLoading(true);
    setError(null);
    loadPdfFromPath(filePath).then(doc => {
      if (!doc) { setError("Não foi possível abrir o PDF."); setLoading(false); return; }
      setPdfDoc(doc);
      onTotalPages?.(doc.numPages);
      setLoading(false);
    });
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
        baseScale = Math.min(scaleW, scaleH);
      } else {
        baseScale = availableWidth / unscaledViewport.width;
      }

      const zoomFactor = settings?.pdfZoom || 1.0;
      const nextScale = baseScale * zoomFactor;
      
      setComputedScale(nextScale);
    } catch {}
  }, [pdfDoc, currentPage, isTwoPage, isContinuous, settings?.pdfZoom]);

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

  // Paginated Mode Rendering (Page 1 & Page 2)
  useEffect(() => {
    if (isContinuous || !pdfDoc || !canvasRef.current || computedScale <= 0) return;

    const renderPages = async () => {
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch {}
      }
      if (renderTask2Ref.current) {
        try { renderTask2Ref.current.cancel(); } catch {}
      }

      // Page 1
      const page1 = await pdfDoc.getPage(currentPage);
      const viewport1 = page1.getViewport({ scale: computedScale });
      const canvas1 = canvasRef.current;
      if (canvas1) {
        const ctx1 = canvas1.getContext("2d");
        canvas1.width = viewport1.width;
        canvas1.height = viewport1.height;
        const renderTask1 = page1.render({ canvasContext: ctx1, viewport: viewport1 });
        renderTaskRef.current = renderTask1;
        try {
          await renderTask1.promise;
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
        const viewport2 = page2.getViewport({ scale: computedScale });
        const canvas2 = canvas2Ref.current;
        const ctx2 = canvas2.getContext("2d");
        canvas2.width = viewport2.width;
        canvas2.height = viewport2.height;
        const renderTask2 = page2.render({ canvasContext: ctx2, viewport: viewport2 });
        renderTask2Ref.current = renderTask2;
        try {
          await renderTask2.promise;
          const textContent2 = await page2.getTextContent();
          buildTextLayer(textContent2, viewport2, textLayer2Ref.current, page2Number, settings);
        } catch (e) {
          if (e?.name !== "RenderingCancelledException") console.error(e);
        }
      }

      onPageRendered?.(currentPage);
    };

    renderPages().catch(e => {
      if (e?.name !== "RenderingCancelledException") setError("Erro ao renderizar páginas.");
    });
  }, [pdfDoc, currentPage, computedScale, isTwoPage, isContinuous, settings]);

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
          const anchorNode = selection.anchorNode?.parentElement;
          const selectedPage = Number(anchorNode?.dataset?.page) || currentPage;

          const targetPageEl = document.getElementById(`pdf-page-${selectedPage}`) || canvasRef.current;
          const targetCanvas = targetPageEl?.querySelector?.("canvas") || targetPageEl;
          const canvasBounds = targetCanvas ? targetCanvas.getBoundingClientRect() : null;

          if (canvasBounds && targetCanvas && rangeRects.length > 0 && canvasBounds.width > 0 && canvasBounds.height > 0) {
            const canvasWidth = targetCanvas.width || canvasBounds.width;
            const canvasHeight = targetCanvas.height || canvasBounds.height;
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
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
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
      className={`flex-1 relative w-full h-full ${
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
        <div className="fixed left-4 top-1/2 -translate-y-1/2 w-12 flex items-center justify-center z-30 pointer-events-none">
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
        <div className="fixed right-4 top-1/2 -translate-y-1/2 w-12 flex items-center justify-center z-30 pointer-events-none">
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

      {/* View Mode Controls (Fit Page / Fit Width / Zoom) */}
      {!loading && !error && (
        <div className="fixed bottom-6 right-6 flex items-center gap-1.5 bg-[color:var(--surface)] rounded-2xl shadow-xl border border-[color:var(--outline-variant)]/20 p-1.5 z-30">
          <button
            onClick={() => setFitMode("page")}
            title="Ajustar à Tela"
            className={`px-2.5 py-1 rounded-xl text-[10px] font-bold transition-colors ${
              fitMode === "page"
                ? "bg-[color:var(--primary)] text-white"
                : "text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-container-high)]"
            }`}
          >
            {isContinuous ? "Ajustar" : "Tela Inteira"}
          </button>
          <button
            onClick={() => setFitMode("width")}
            title="Ajustar à Largura"
            className={`px-2.5 py-1 rounded-xl text-[10px] font-bold transition-colors ${
              fitMode === "width"
                ? "bg-[color:var(--primary)] text-white"
                : "text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-container-high)]"
            }`}
          >
            Largura
          </button>
          <div className="h-4 w-px bg-[color:var(--outline-variant)]/20 mx-0.5" />
          <button
            onClick={() => {
              setFitMode("custom");
              setCustomScale(s => Math.min(s + 0.2, 3.0));
            }}
            title="Aumentar Zoom"
            className="w-7 h-7 flex items-center justify-center rounded-xl text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-container-high)] transition-colors"
          >
            <Icon name="add" className="text-[16px]" />
          </button>
          <span className="text-[10px] font-bold text-center text-[color:var(--on-surface-variant)] px-1">
            {Math.round(computedScale * 100)}%
          </span>
          <button
            onClick={() => {
              setFitMode("custom");
              setCustomScale(s => Math.max(s - 0.2, 0.4));
            }}
            title="Diminuir Zoom"
            className="w-7 h-7 flex items-center justify-center rounded-xl text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-container-high)] transition-colors"
          >
            <Icon name="remove" className="text-[16px]" />
          </button>
        </div>
      )}
    </div>
  );
});
