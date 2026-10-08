import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../../ui/Icon";

const MIN_SELECTION_SIZE = 8;

const getTranslatorApi = () => globalThis.window?.studyhubDesktop?.translator;

const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);

export const normalizeSelection = (start, end, bounds) => {
  const startX = clamp(start.x, 0, bounds.width);
  const startY = clamp(start.y, 0, bounds.height);
  const endX = clamp(end.x, 0, bounds.width);
  const endY = clamp(end.y, 0, bounds.height);

  return {
    x: Math.min(startX, endX),
    y: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  };
};

const cropScreenshot = (image, selection, viewportBounds) => {
  if (!image?.naturalWidth || !image?.naturalHeight) {
    throw new Error("A captura ainda não terminou de carregar.");
  }

  const scaleX = image.naturalWidth / viewportBounds.width;
  const scaleY = image.naturalHeight / viewportBounds.height;
  const sourceX = Math.round(selection.x * scaleX);
  const sourceY = Math.round(selection.y * scaleY);
  const sourceWidth = Math.max(1, Math.round(selection.width * scaleX));
  const sourceHeight = Math.max(1, Math.round(selection.height * scaleY));
  const canvas = globalThis.document.createElement("canvas");

  canvas.width = Math.min(sourceWidth, image.naturalWidth - sourceX);
  canvas.height = Math.min(sourceHeight, image.naturalHeight - sourceY);

  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Não foi possível preparar o recorte.");

  context.drawImage(
    image,
    sourceX,
    sourceY,
    canvas.width,
    canvas.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  return canvas.toDataURL("image/png");
};

export function CaptureOverlay() {
  const rootRef = useRef(null);
  const imageRef = useRef(null);
  const dragStartRef = useRef(null);
  const mountedRef = useRef(true);
  const cancelingRef = useRef(false);
  const [capture, setCapture] = useState(null);
  const [selection, setSelection] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState("loading");
  const [error, setError] = useState("");

  const handleCancel = useCallback(async () => {
    if (cancelingRef.current) return;
    cancelingRef.current = true;
    setPhase("canceling");

    try {
      const api = getTranslatorApi();
      if (api?.cancelCapture) await api.cancelCapture();
      else await api?.close?.();
    } catch (cancelError) {
      if (mountedRef.current) {
        setError(cancelError?.message || "Não foi possível cancelar a captura.");
        setPhase("error");
        cancelingRef.current = false;
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const api = getTranslatorApi();

    if (!api?.getCapture) {
      setError("A captura de tela não está disponível. Reinicie o masterStudy.");
      setPhase("error");
    } else {
      Promise.resolve(api.getCapture())
        .then((nextCapture) => {
          if (!mountedRef.current) return;
          if (!nextCapture?.live && !nextCapture?.imageDataUrl) throw new Error("A imagem da tela não foi recebida.");
          setCapture({
            displayId: nextCapture.displayId,
            imageDataUrl: nextCapture.imageDataUrl,
            live: Boolean(nextCapture.live),
          });
          if (nextCapture.live) {
            setPhase("ready");
            getTranslatorApi()?.captureReady?.();
            globalThis.setTimeout(() => rootRef.current?.focus(), 0);
          } else {
            setPhase("loading");
          }
        })
        .catch((captureError) => {
          if (!mountedRef.current) return;
          setError(captureError?.message || "Não foi possível carregar a captura.");
          setPhase("error");
        });
    }

    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      handleCancel();
    };
    globalThis.window?.addEventListener("keydown", onKeyDown);

    return () => {
      mountedRef.current = false;
      globalThis.window?.removeEventListener("keydown", onKeyDown);
    };
  }, [handleCancel]);

  const pointFromEvent = (event) => {
    const bounds = rootRef.current?.getBoundingClientRect();
    if (!bounds) return null;
    return {
      x: clamp(event.clientX - bounds.left, 0, bounds.width),
      y: clamp(event.clientY - bounds.top, 0, bounds.height),
      bounds,
    };
  };

  const submitSelection = async (nextSelection) => {
    const api = getTranslatorApi();
    const rootBounds = rootRef.current?.getBoundingClientRect();
    if (!api?.completeSelection || !capture || !rootBounds || (!capture.live && !imageRef.current)) {
      setError("Não foi possível preparar esta seleção.");
      setPhase("error");
      return;
    }

    setPhase("submitting");
    setError("");

    try {
      const imageDataUrl = capture.live
        ? undefined
        : cropScreenshot(imageRef.current, nextSelection, rootBounds);
      await api.completeSelection({
        displayId: capture.displayId,
        imageDataUrl,
        selection: nextSelection,
      });
    } catch (selectionError) {
      if (!mountedRef.current) return;
      setError(selectionError?.message || "Não foi possível recortar esta área.");
      setPhase("error");
    }
  };

  const handlePointerDown = (event) => {
    if (event.button !== 0 || !capture || ["loading", "submitting", "canceling"].includes(phase)) return;
    const point = pointFromEvent(event);
    if (!point) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragStartRef.current = { x: point.x, y: point.y };
    setSelection({ x: point.x, y: point.y, width: 0, height: 0 });
    setDragging(true);
    setError("");
    setPhase("ready");
  };

  const handlePointerMove = (event) => {
    if (!dragging || !dragStartRef.current) return;
    const point = pointFromEvent(event);
    if (!point) return;
    setSelection(normalizeSelection(dragStartRef.current, point, point.bounds));
  };

  const handlePointerUp = (event) => {
    if (!dragging || !dragStartRef.current) return;
    const point = pointFromEvent(event);
    const start = dragStartRef.current;
    dragStartRef.current = null;
    setDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (!point) return;

    const nextSelection = normalizeSelection(start, point, point.bounds);
    if (nextSelection.width < MIN_SELECTION_SIZE || nextSelection.height < MIN_SELECTION_SIZE) {
      setSelection(null);
      return;
    }

    setSelection(nextSelection);
    submitSelection(nextSelection);
  };

  const handlePointerCancel = (event) => {
    dragStartRef.current = null;
    setDragging(false);
    setSelection(null);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const selectionLabelPosition = selection?.y > 34
    ? { bottom: "calc(100% + 8px)" }
    : { top: "calc(100% + 8px)" };

  return (
    <main
      aria-label="Seleção de área para tradução"
      className={`translator-capture-overlay relative h-screen w-screen select-none overflow-hidden outline-none ${capture?.live ? "is-live bg-transparent" : "bg-slate-950"} ${phase === "ready" || phase === "error" ? "cursor-crosshair" : "cursor-wait"}`}
      onPointerCancel={handlePointerCancel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      ref={rootRef}
      tabIndex={-1}
    >
      {capture && !capture.live ? (
        <img
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-fill"
          draggable="false"
          onError={() => {
            setError("A imagem da tela não pôde ser exibida.");
            setPhase("error");
          }}
          onLoad={() => {
            setPhase("ready");
            getTranslatorApi()?.captureReady?.();
            globalThis.setTimeout(() => rootRef.current?.focus(), 0);
          }}
          ref={imageRef}
          src={capture.imageDataUrl}
        />
      ) : null}

      {!selection ? <div className="pointer-events-none absolute inset-0 bg-slate-950/50" /> : null}

      {selection ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-10 border-2 border-violet-400 bg-transparent shadow-[0_0_0_1px_rgba(255,255,255,0.7)]"
          style={{
            left: selection.x,
            top: selection.y,
            width: selection.width,
            height: selection.height,
            boxShadow: "0 0 0 9999px rgba(2, 6, 23, 0.55), inset 0 0 0 1px rgba(255,255,255,0.7)",
          }}
        >
          {dragging && selection.width >= MIN_SELECTION_SIZE && selection.height >= MIN_SELECTION_SIZE ? (
            <span
              className="absolute left-0 whitespace-nowrap rounded-lg bg-slate-950/90 px-2 py-1 text-[10px] font-bold text-white shadow-xl"
              style={selectionLabelPosition}
            >
              {Math.round(selection.width)} × {Math.round(selection.height)} px
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 top-5 z-20 flex justify-center px-5">
        <div
          className="pointer-events-auto flex max-w-[calc(100vw-40px)] items-center gap-3 rounded-2xl border border-white/15 bg-slate-950/90 px-4 py-3 text-white shadow-2xl backdrop-blur-md"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-500/20 text-violet-300">
            <Icon className="text-xl" name="screenshot_region" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-black">
              {phase === "submitting" ? "Preparando tradução…" : "Selecione o texto na tela"}
            </p>
            <p className="mt-0.5 truncate text-[10px] font-semibold text-slate-300">
              Arraste para marcar uma área · Esc para cancelar
            </p>
          </div>
          <button
            aria-label="Cancelar captura"
            className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-300 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-violet-400"
            onClick={handleCancel}
            onPointerDown={(event) => event.stopPropagation()}
            type="button"
          >
            <Icon className="text-lg" name="close" />
          </button>
        </div>
      </div>

      {phase === "loading" || phase === "submitting" || phase === "canceling" ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-slate-950/25">
          <div aria-live="polite" className="flex items-center gap-3 rounded-2xl bg-slate-950/90 px-4 py-3 text-xs font-bold text-white shadow-2xl" role="status">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-300/30 border-t-violet-300" />
            {phase === "loading"
              ? "Carregando a tela…"
              : phase === "canceling"
                ? "Cancelando…"
                : "Recortando a seleção…"}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-30 flex justify-center px-5">
          <div
            className="pointer-events-auto max-w-md rounded-2xl border border-red-300/20 bg-slate-950/95 p-4 text-white shadow-2xl backdrop-blur-md"
            onPointerDown={(event) => event.stopPropagation()}
            role="alert"
          >
            <div className="flex items-start gap-3">
              <Icon className="mt-0.5 text-xl text-red-400" name="error" />
              <div className="min-w-0">
                <p className="text-xs font-black">Falha na captura</p>
                <p className="mt-1 text-[11px] font-medium leading-5 text-slate-300">{error}</p>
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                className="rounded-lg px-3 py-2 text-[11px] font-black text-slate-300 hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/25"
                onClick={handleCancel}
                type="button"
              >
                Cancelar
              </button>
              {selection ? (
                <button
                  className="rounded-lg bg-violet-500 px-3 py-2 text-[11px] font-black text-white hover:bg-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-300"
                  onClick={() => submitSelection(selection)}
                  type="button"
                >
                  Tentar novamente
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default CaptureOverlay;
