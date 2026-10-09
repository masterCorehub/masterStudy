import { useEffect, useReducer, useState, useRef, forwardRef, useImperativeHandle, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import mermaid from 'mermaid';
import { Icon } from '../ui/Icon';
import { sanitizeGeneratedHtml, sanitizeSvg } from '../utils/sanitizeHtml';
import { markdownToNoteHtml } from '../domain/aiStudio';

mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  theme: 'base',
  themeVariables: {
    primaryColor: '#6366f1',
    primaryBorderColor: '#6366f1',
    lineColor: '#6366f1',
    secondaryColor: '#f5f3ff',
    tertiaryColor: '#fff',
    fontSize: '14px',
  },
  mindmap: {
    padding: 30,
    maxNodeWidth: 400,
    nodeSpacing: 50,
    rankSpacing: 150
  },
  htmlLabels: false,
  markdown: true
});

const isEditorAvailable = (editor) => Boolean(editor && !editor.isDestroyed);

const domSafeAttributes = (attributes = {}) =>
  Object.fromEntries(
    Object.entries(attributes).filter(
      ([, value]) => value == null || ['string', 'number', 'boolean'].includes(typeof value),
    ),
  );

function NoteImageView({ node, selected, updateAttributes, deleteNode }) {
  const width = Math.max(20, Math.min(100, Number(node.attrs.width) || 100));
  return (
    <NodeViewWrapper
      as="span"
      className={`note-image-wrapper ${selected ? 'is-selected' : ''}`}
      style={{ width: `${width}%` }}
      data-width={width}
    >
      <img
        className="note-inline-image"
        src={node.attrs.src}
        alt={node.attrs.alt || ''}
        title={node.attrs.title || ''}
        draggable="false"
      />
      {selected ? (
        <span className="note-image-size-controls" contentEditable={false}>
          <Icon name="photo_size_select_large" />
          <input
            aria-label="Tamanho da imagem"
            type="range"
            min="20"
            max="100"
            step="5"
            value={width}
            onChange={(event) => updateAttributes({ width: Number(event.target.value) })}
          />
          <strong>{width}%</strong>
          {[50, 75, 100].map((size) => (
            <button key={size} type="button" onClick={() => updateAttributes({ width: size })}>
              {size}%
            </button>
          ))}
          <button className="danger" type="button" onClick={deleteNode} title="Remover imagem" aria-label="Remover imagem">
            <Icon name="delete" />
          </button>
        </span>
      ) : null}
    </NodeViewWrapper>
  );
}

const NoteImage = Node.create({
  name: 'noteImage',
  group: 'inline',
  inline: true,
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      src: { default: null },
      alt: { default: '' },
      title: { default: '' },
      width: {
        default: 100,
        parseHTML: (element) => Number(element.getAttribute('data-width') || element.getAttribute('width')) || 100,
      },
    };
  },
  parseHTML() {
    return [{ tag: 'img[src]' }];
  },
  renderHTML({ HTMLAttributes }) {
    const width = Math.max(20, Math.min(100, Number(HTMLAttributes.width) || 100));
    return ['img', mergeAttributes(domSafeAttributes(HTMLAttributes), {
      class: 'note-inline-image',
      loading: 'lazy',
      'data-width': width,
      style: `width: ${width}%;`,
    })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(NoteImageView);
  },
});

const imageFileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    if (!file?.type?.startsWith('image/')) {
      reject(new Error('Selecione um arquivo de imagem.'));
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      reject(new Error('A imagem deve ter no máximo 12 MB.'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    reader.onload = () => {
      const source = String(reader.result || '');
      const image = new Image();
      image.onerror = () => reject(new Error('O arquivo de imagem é inválido.'));
      image.onload = () => {
        const maxDimension = 1800;
        const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, width, height);
        const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        resolve(canvas.toDataURL(outputType, outputType === 'image/jpeg' ? 0.86 : undefined));
      };
      image.src = source;
    };
    reader.readAsDataURL(file);
  });

function getElementBounds(el) {
  if (!el || !el.points || el.points.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const pad = (el.width || 3) / 2;
  for (const pt of el.points) {
    if (pt.x < minX) minX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y > maxY) maxY = pt.y;
  }
  return {
    minX: minX - pad,
    minY: minY - pad,
    maxX: maxX + pad,
    maxY: maxY + pad,
    width: (maxX - minX) + pad * 2,
    height: (maxY - minY) + pad * 2,
  };
}

function getSelectionBounds(elementsList, selectedIndices) {
  if (!selectedIndices || selectedIndices.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let count = 0;
  for (const idx of selectedIndices) {
    const el = elementsList[idx];
    if (!el) continue;
    const b = getElementBounds(el);
    if (!b) continue;
    count++;
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }
  if (count === 0) return null;
  return {
    minX: minX - 4,
    minY: minY - 4,
    maxX: maxX + 4,
    maxY: maxY + 4,
    width: (maxX - minX) + 8,
    height: (maxY - minY) + 8,
  };
}

function isElementInSelectionBox(el, box) {
  if (!el || !el.points || el.points.length === 0 || !box) return false;
  const b = getElementBounds(el);
  if (!b) return false;
  const boxMinX = Math.min(box.startX, box.currentX);
  const boxMaxX = Math.max(box.startX, box.currentX);
  const boxMinY = Math.min(box.startY, box.currentY);
  const boxMaxY = Math.max(box.startY, box.currentY);

  for (const pt of el.points) {
    if (pt.x >= boxMinX && pt.x <= boxMaxX && pt.y >= boxMinY && pt.y <= boxMaxY) {
      return true;
    }
  }
  return !(b.maxX < boxMinX || b.minX > boxMaxX || b.maxY < boxMinY || b.minY > boxMaxY);
}

function isPointInBounds(px, py, bounds) {
  if (!bounds) return false;
  return px >= bounds.minX && px <= bounds.maxX && py >= bounds.minY && py <= bounds.maxY;
}

function isPointNearElement(px, py, el) {
  if (!el || !el.points || el.points.length === 0) return false;
  const threshold = Math.max(10, (el.width || 3) + 6);
  for (let i = 0; i < el.points.length; i++) {
    const pt = el.points[i];
    const dist = Math.hypot(pt.x - px, pt.y - py);
    if (dist <= threshold) return true;
  }
  return false;
}

const DrawingOverlay = forwardRef(({ 
  drawings = [], 
  onDrawingsChange, 
  tool, 
  color, 
  width, 
  drawingMode,
  height,
  displaySettings = {},
  editor
}, ref) => {
  const canvasRef = useRef(null);
  const elements = useRef(drawings);
  const redoStack = useRef([]);
  const isDrawing = useRef(false);
  const smartHighlightStart = useRef(null);
  const isSmartHighlighting = useRef(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Selection states
  const selectedIndicesRef = useRef([]);
  const [selectedCount, setSelectedCount] = useState(0);
  const isSelectingBox = useRef(false);
  const selectionBox = useRef(null);
  const isDraggingSelection = useRef(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const dragInitialElements = useRef([]);

  useEffect(() => {
    setIsDarkMode(document.documentElement.classList.contains('dark'));
  }, []);

  const getActiveColor = useCallback((c) => {
    if (c === 'base') return isDarkMode ? '#ffffff' : '#000000';
    return c;
  }, [isDarkMode]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    
    const selectedSet = new Set(selectedIndicesRef.current);

    // 1. Draw all elements
    elements.current.forEach((el, index) => {
      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = el.composite === 'destination-out' ? 'rgba(0,0,0,1)' : getActiveColor(el.color);
      ctx.lineWidth = el.width || 3;
      ctx.globalCompositeOperation = el.composite || 'source-over';
      ctx.globalAlpha = el.alpha !== undefined ? el.alpha : 1.0;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      if (el.points && el.points.length > 0) {
        ctx.moveTo(el.points[0].x, el.points[0].y);
        for (let i = 1; i < el.points.length; i++) {
          ctx.lineTo(el.points[i].x, el.points[i].y);
        }
      }
      ctx.stroke();

      // If selected, add a subtle highlight around it
      if (selectedSet.has(index)) {
        ctx.save();
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)';
        ctx.lineWidth = (el.width || 3) + 4;
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();
    });

    // 2. Draw selection bounding box if any items selected
    if (selectedIndicesRef.current.length > 0) {
      const bounds = getSelectionBounds(elements.current, selectedIndicesRef.current);
      if (bounds) {
        ctx.save();
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(bounds.minX, bounds.minY, bounds.width, bounds.height);
        
        ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
        ctx.fillRect(bounds.minX, bounds.minY, bounds.width, bounds.height);

        // Corner handles
        ctx.setLineDash([]);
        ctx.fillStyle = '#3b82f6';
        const hSize = 6;
        ctx.fillRect(bounds.minX - hSize / 2, bounds.minY - hSize / 2, hSize, hSize);
        ctx.fillRect(bounds.maxX - hSize / 2, bounds.minY - hSize / 2, hSize, hSize);
        ctx.fillRect(bounds.minX - hSize / 2, bounds.maxY - hSize / 2, hSize, hSize);
        ctx.fillRect(bounds.maxX - hSize / 2, bounds.maxY - hSize / 2, hSize, hSize);
        ctx.restore();
      }
    }

    // 3. Draw live selection rectangle (marquee box)
    if (isSelectingBox.current && selectionBox.current) {
      const box = selectionBox.current;
      const x = Math.min(box.startX, box.currentX);
      const y = Math.min(box.startY, box.currentY);
      const w = Math.abs(box.currentX - box.startX);
      const h = Math.abs(box.currentY - box.startY);

      ctx.save();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x, y, w, h);

      ctx.fillStyle = 'rgba(59, 130, 246, 0.12)';
      ctx.fillRect(x, y, w, h);
      ctx.restore();
    }
  }, [getActiveColor]);

  const undo = useCallback(() => {
    if (elements.current.length === 0) return;
    const newElements = [...elements.current];
    const removed = newElements.pop();
    redoStack.current.push(removed);
    elements.current = newElements;
    selectedIndicesRef.current = [];
    setSelectedCount(0);
    onDrawingsChange?.(newElements);
    redraw();
  }, [onDrawingsChange, redraw]);

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    const newElements = [...elements.current];
    const restored = redoStack.current.pop();
    newElements.push(restored);
    elements.current = newElements;
    selectedIndicesRef.current = [];
    setSelectedCount(0);
    onDrawingsChange?.(newElements);
    redraw();
  }, [onDrawingsChange, redraw]);

  const deleteSelected = useCallback(() => {
    if (selectedIndicesRef.current.length === 0) return;
    const toDeleteSet = new Set(selectedIndicesRef.current);
    redoStack.current.push([...elements.current]);
    const newElements = elements.current.filter((_, idx) => !toDeleteSet.has(idx));
    elements.current = newElements;
    selectedIndicesRef.current = [];
    setSelectedCount(0);
    onDrawingsChange?.(newElements);
    redraw();
  }, [onDrawingsChange, redraw]);

  useImperativeHandle(ref, () => ({
    undo,
    redo,
    deleteSelected,
    hasSelection: selectedCount > 0,
    clear: () => {
      elements.current = [];
      redoStack.current = [];
      selectedIndicesRef.current = [];
      setSelectedCount(0);
      onDrawingsChange?.([]);
      redraw();
    }
  }));

  useEffect(() => {
    if (!drawingMode) return;
    
    const handleKeyDown = (e) => {
      const target = e.target;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIndicesRef.current.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        deleteSelected();
        return;
      }

      const isZ = e.key.toLowerCase() === 'z';
      const isY = e.key.toLowerCase() === 'y';
      const isMod = e.ctrlKey || e.metaKey;
      
      if (isMod && isZ) {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if (isMod && isY) {
        e.preventDefault();
        e.stopPropagation();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [drawingMode, undo, redo, deleteSelected]);

  useEffect(() => {
    elements.current = drawings;
    redraw();
  }, [drawings, redraw]);

  const updateCanvasDimensions = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const parentRect = parent ? parent.getBoundingClientRect() : { width: 800, height: 600 };
    const actualWidth = rect.width > 0 ? rect.width : (parentRect.width || 800);
    const actualHeight = rect.height > 0 ? rect.height : Math.max(height || 0, parentRect.height, parent ? parent.scrollHeight : 0, 500);

    canvas.width = Math.round(actualWidth * dpr);
    canvas.height = Math.round(actualHeight * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    redraw();
  }, [height, redraw]);

  useEffect(() => {
    updateCanvasDimensions();
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const parent = canvas.parentElement;
    const observer = new ResizeObserver(() => {
      updateCanvasDimensions();
    });

    observer.observe(canvas);
    if (parent) observer.observe(parent);

    return () => observer.disconnect();
  }, [updateCanvasDimensions, drawingMode]);

  const getCoordinates = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    const scaleX = rect.width > 0 ? (canvas.width / dpr) / rect.width : 1;
    const scaleY = rect.height > 0 ? (canvas.height / dpr) / rect.height : 1;

    const clientX = e.clientX ?? (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    const clientY = e.clientY ?? (e.touches && e.touches[0] ? e.touches[0].clientY : 0);

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }, []);

  const startDrawing = (e) => {
    if (!drawingMode) return;
    const { x, y } = getCoordinates(e);

    // ─── FERRAMENTA DE SELEÇÃO ──────────────────────────────────────────────
    if (tool === 'select') {
      const bounds = getSelectionBounds(elements.current, selectedIndicesRef.current);
      const isInsideExistingBounds = bounds && isPointInBounds(x, y, bounds);

      if (isInsideExistingBounds) {
        // Iniciar arraste dos elementos selecionados
        isDraggingSelection.current = true;
        dragStartPos.current = { x, y };
        dragInitialElements.current = elements.current.map(el => ({
          ...el,
          points: el.points ? el.points.map(p => ({ ...p })) : []
        }));
        return;
      }

      // Checar se clicou diretamente em algum elemento
      let clickedIdx = -1;
      for (let i = elements.current.length - 1; i >= 0; i--) {
        if (isPointNearElement(x, y, elements.current[i])) {
          clickedIdx = i;
          break;
        }
      }

      if (clickedIdx !== -1) {
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
          const current = new Set(selectedIndicesRef.current);
          if (current.has(clickedIdx)) current.delete(clickedIdx);
          else current.add(clickedIdx);
          selectedIndicesRef.current = Array.from(current);
        } else {
          selectedIndicesRef.current = [clickedIdx];
        }
        setSelectedCount(selectedIndicesRef.current.length);

        // Prepara para mover imediatamente
        isDraggingSelection.current = true;
        dragStartPos.current = { x, y };
        dragInitialElements.current = elements.current.map(el => ({
          ...el,
          points: el.points ? el.points.map(p => ({ ...p })) : []
        }));
        redraw();
        return;
      }

      // Clicou no vazio: limpa seleção e inicia caixa de seleção (Marquee)
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
        selectedIndicesRef.current = [];
        setSelectedCount(0);
      }
      isSelectingBox.current = true;
      selectionBox.current = { startX: x, startY: y, currentX: x, currentY: y };
      redraw();
      return;
    }
    
    // ─── MARCA TEXTO INTELIGENTE ───────────────────────────────────────────
    if (tool === 'highlighter' && isEditorAvailable(editor)) {
      canvasRef.current.style.visibility = 'hidden';
      const clientX = e.clientX ?? (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
      const clientY = e.clientY ?? (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
      const el = document.elementFromPoint(clientX, clientY);
      canvasRef.current.style.visibility = 'visible';
      
      const isTextNode = el && (el.tagName === 'P' || el.tagName === 'H1' || el.tagName === 'H2' || el.tagName === 'H3' || el.tagName === 'LI' || el.tagName === 'SPAN' || el.tagName === 'STRONG' || el.tagName === 'EM');
      
      const posInfo = editor.view.posAtCoords({ left: clientX, top: clientY });
      
      if (posInfo && isTextNode) {
        isSmartHighlighting.current = true;
        smartHighlightStart.current = posInfo.pos;
        return;
      }
    }
    
    // ─── MODO DESENHO LIVRE ────────────────────────────────────────────────
    isSmartHighlighting.current = false;
    isDrawing.current = true;
    redoStack.current = [];
    selectedIndicesRef.current = [];
    setSelectedCount(0);
    
    elements.current.push({
      points: [{ x, y }],
      color: color,
      width: tool === 'highlighter' ? Math.max(16, width * 2) : width,
      composite: tool === 'eraser' ? 'destination-out' : 'source-over',
      alpha: tool === 'highlighter' ? 0.35 : 1.0
    });
  };

  const draw = (e) => {
    if (!drawingMode) return;
    const { x, y } = getCoordinates(e);

    // ─── MOVENDO OU SELECIONANDO ────────────────────────────────────────────
    if (tool === 'select') {
      if (isDraggingSelection.current) {
        const dx = x - dragStartPos.current.x;
        const dy = y - dragStartPos.current.y;
        const selectedSet = new Set(selectedIndicesRef.current);

        elements.current = dragInitialElements.current.map((el, idx) => {
          if (!selectedSet.has(idx) || !el.points) return el;
          return {
            ...el,
            points: el.points.map(p => ({ x: p.x + dx, y: p.y + dy }))
          };
        });
        redraw();
        return;
      }

      if (isSelectingBox.current && selectionBox.current) {
        selectionBox.current.currentX = x;
        selectionBox.current.currentY = y;
        
        const newSelected = [];
        elements.current.forEach((el, idx) => {
          if (isElementInSelectionBox(el, selectionBox.current)) {
            newSelected.push(idx);
          }
        });
        selectedIndicesRef.current = newSelected;
        setSelectedCount(newSelected.length);
        redraw();
        return;
      }
      return;
    }
    
    if (isSmartHighlighting.current && isEditorAvailable(editor)) {
      const clientX = e.clientX ?? (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
      const clientY = e.clientY ?? (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
      const posInfo = editor.view.posAtCoords({ left: clientX, top: clientY });
      if (posInfo) {
        const start = smartHighlightStart.current;
        const current = posInfo.pos;
        const from = Math.min(start, current);
        const to = Math.max(start, current);
        
        if (from !== to) {
          const hexColor = getActiveColor(color);
          editor.chain().setTextSelection({ from, to }).setHighlight({ color: hexColor }).run();
        }
      }
      return;
    }
    
    if (!isDrawing.current) return;
    
    const currentEl = elements.current[elements.current.length - 1];
    currentEl.points.push({ x, y });
    
    const ctx = canvasRef.current.getContext('2d');
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = currentEl.composite === 'destination-out' ? 'rgba(0,0,0,1)' : getActiveColor(currentEl.color);
    ctx.lineWidth = currentEl.width;
    ctx.globalCompositeOperation = currentEl.composite;
    ctx.globalAlpha = currentEl.alpha !== undefined ? currentEl.alpha : 1.0;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    const pts = currentEl.points;
    if (pts.length > 1) {
      ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.stroke();
    }
    ctx.restore();
  };

  const stopDrawing = () => {
    if (tool === 'select') {
      if (isDraggingSelection.current) {
        isDraggingSelection.current = false;
        onDrawingsChange?.(elements.current);
        redraw();
        return;
      }
      if (isSelectingBox.current) {
        isSelectingBox.current = false;
        selectionBox.current = null;
        redraw();
        return;
      }
      return;
    }

    if (isSmartHighlighting.current) {
      isSmartHighlighting.current = false;
      smartHighlightStart.current = null;
      if (isEditorAvailable(editor)) {
        const { to } = editor.state.selection;
        editor.chain().setTextSelection(to).run();
      }
      return;
    }
    
    if (!isDrawing.current) return;
    isDrawing.current = false;
    const committed = elements.current.map(el => ({
      ...el,
      points: [...el.points]
    }));
    onDrawingsChange?.(committed);
  };

  const getCursorClass = () => {
    if (!drawingMode) return 'pointer-events-none opacity-100';
    if (tool === 'select') return 'pointer-events-auto cursor-default';
    return 'pointer-events-auto cursor-crosshair';
  };

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={startDrawing}
      onMouseMove={draw}
      onMouseUp={stopDrawing}
      onMouseLeave={stopDrawing}
      onTouchStart={startDrawing}
      onTouchMove={draw}
      onTouchEnd={stopDrawing}
      className={`absolute top-0 left-0 w-full transition-opacity duration-300 z-[10] drawing-overlay-canvas ${getCursorClass()}`}
      style={{
        height: height > 0 ? `${height}px` : '100%',
        minHeight: '100%',
        width: '100%'
      }}
    />
  );
});

const cleanMermaidCode = (code) => {
  if (!code) return '';
  
  let cleaned = code.trim();
  
  // 1. Try to extract from markdown backticks
  const match = cleaned.match(/```(?:mermaid)?\n?([\s\S]*?)\n?```/);
  if (match) {
    cleaned = match[1].trim();
  } else {
    // 2. Remove backticks if they are just at the start/end
    cleaned = cleaned.replace(/^```(?:mermaid)?\n?/, '').replace(/\n?```$/, '').trim();
  }

  // 3. Remove leading text (lixo) before the actual diagram keyword
  // List of common Mermaid diagram start keywords
  const keywords = [
    'mindmap', 'graph', 'flowchart', 'sequenceDiagram', 'gantt', 
    'classDiagram', 'stateDiagram', 'pie', 'erDiagram', 'journey', 
    'gitGraph', 'requirementDiagram', 'timeline', 'quadrantChart', 
    'xychart', 'kanban', 'architecture'
  ];
  
  let firstKeywordIndex = -1;
  let detectedKeyword = '';

  for (const kw of keywords) {
    const index = cleaned.toLowerCase().indexOf(kw);
    if (index !== -1) {
      // Ensure it's at the start of a line or start of string
      const isStartOfLine = index === 0 || cleaned[index - 1] === '\n';
      if (isStartOfLine && (firstKeywordIndex === -1 || index < firstKeywordIndex)) {
        firstKeywordIndex = index;
        detectedKeyword = kw;
      }
    }
  }

  if (firstKeywordIndex !== -1) {
    cleaned = cleaned.substring(firstKeywordIndex).trim();
  }
  
  // 4. Clean up decorative lines and illegal characters within the diagram
  cleaned = cleaned.split('\n')
    .map(line => {
      // Remove long sequences of decorative characters (5 or more)
      // These are often used by AI to draw "lines" in text
      let l = line.replace(/[-_=*~]{4,}/g, '');
      
      // If the line now contains just a single letter or character after cleaning, 
      // and it was likely part of a decorative line (like "--- A"), we might want to trim it.
      // But let's be conservative to not break legitimate nodes.
      return l.trimEnd();
    })
    .filter(line => {
      const trimmed = line.trim();
      // Filter out lines that are just single decorative-like characters left over
      if (trimmed === '-' || trimmed === '_' || trimmed === '=' || trimmed === '*') return false;
      return line.length > 0;
    })
    .join('\n');

  // 5. Fix specific AI hallucinations for mindmaps
  if (detectedKeyword === 'mindmap') {
    // Fix duplicated mindmap keywords (e.g., 'mindmapmindmap' or 'mindmap mindmap')
    cleaned = cleaned.replace(/^mindmap\s*mindmap/im, 'mindmap');
    
    // Fix text on the same line as mindmap (e.g., 'mindmap POO em C#')
    cleaned = cleaned.replace(/^mindmap([^\n]+)/im, (match, rest) => {
      const text = rest.trim();
      if (!text) return 'mindmap';
      // If it looks like 'mindmap', it was handled above. If there's text, make it the root node.
      return `mindmap\n  root(("${text}"))`;
    });
    
    // Fix unescaped special characters in mindmap nodes that break the parser (like '(', ')', ':')
    let nodeCounter = 0;
    cleaned = cleaned.split('\n').map((line, idx) => {
      if (idx === 0) return line; // First line is 'mindmap'
      const match = line.match(/^(\s*)(.*)$/);
      if (!match) return line;
      
      const indent = match[1];
      const text = match[2].trim();
      
      if (!text) return line;
      
      // Auto-wrap text to prevent truncation in Mermaid and escape special characters
      const shapeMatch = text.match(/^([a-zA-Z0-9_]+\s*)([([{]+)(.*?)([)\]}]+)$/);
      let isShaped = !!shapeMatch;
      let innerText = isShaped ? shapeMatch[3] : text;
      
      // se nao tinha forma, criamos um node genérico
      if (!isShaped) nodeCounter++;
      let prefix = isShaped ? shapeMatch[1] : `node${nodeCounter}`;
      let open = isShaped ? shapeMatch[2] : `(`;
      let close = isShaped ? shapeMatch[4] : `)`;

      innerText = innerText.replace(/^["']|["']$/g, '');
      innerText = innerText.replace(/"/g, "'");

      const words = innerText.split(' ');
      let currentLength = 0;
      let wrapped = '';
      words.forEach(word => {
        if (currentLength + word.length > 30 && currentLength > 0) {
          wrapped += '<br/>' + word;
          currentLength = word.length;
        } else {
          wrapped += (currentLength === 0 ? '' : ' ') + word;
          currentLength += word.length + 1;
        }
      });

      if (!wrapped.startsWith('"')) wrapped = '"' + wrapped + '"';

      return `${indent}${prefix}${open}${wrapped}${close}`;
    }).join('\n');
  }

  return cleaned;
};

const HashtagExtension = Extension.create({
  name: 'hashtag',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('hashtag'),
        state: {
          init(_, { doc }) {
            return getDecorations(doc);
          },
          apply(transaction, oldState) {
            return transaction.docChanged ? getDecorations(transaction.doc) : oldState;
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});

const collapsibleHeadingsKey = new PluginKey('collapsibleHeadings');

const CollapsibleHeadings = Extension.create({
  name: 'collapsibleHeadings',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: collapsibleHeadingsKey,
        state: {
          init: () => new Set(),
          apply(transaction, previous) {
            const collapsed = new Set();
            previous.forEach((position) => {
              const mapped = transaction.docChanged
                ? transaction.mapping.map(position, -1)
                : position;
              if (transaction.doc.nodeAt(mapped)?.type.name === 'heading') collapsed.add(mapped);
            });
            const togglePosition = transaction.getMeta(collapsibleHeadingsKey)?.toggle;
            if (Number.isInteger(togglePosition)) {
              if (collapsed.has(togglePosition)) collapsed.delete(togglePosition);
              else collapsed.add(togglePosition);
            }
            return collapsed;
          },
        },
        props: {
          decorations(state) {
            const collapsed = collapsibleHeadingsKey.getState(state);
            if (!collapsed?.size) return DecorationSet.empty;
            const blocks = [];
            state.doc.forEach((node, offset) => blocks.push({ node, offset }));
            const decorations = [];
            collapsed.forEach((headingPosition) => {
              const headingIndex = blocks.findIndex(({ offset }) => offset === headingPosition);
              if (headingIndex < 0) return;
              const headingBlock = blocks[headingIndex];
              const headingLevel = Number(headingBlock.node.attrs.level || 1);
              decorations.push(
                Decoration.node(
                  headingBlock.offset,
                  headingBlock.offset + headingBlock.node.nodeSize,
                  { class: 'is-collapsed-heading' },
                ),
              );
              for (let index = headingIndex + 1; index < blocks.length; index += 1) {
                const block = blocks[index];
                if (
                  block.node.type.name === 'heading' &&
                  Number(block.node.attrs.level || 1) <= headingLevel
                ) break;
                decorations.push(
                  Decoration.node(block.offset, block.offset + block.node.nodeSize, {
                    class: 'is-collapsed-section',
                  }),
                );
              }
            });
            return DecorationSet.create(state.doc, decorations);
          },
          handleClick(view, position, event) {
            const target = event.target instanceof Element
              ? event.target.closest('h1, h2, h3, h4, h5')
              : null;
            if (!target || !target.closest('.ProseMirror')) return false;
            let headingPosition = null;
            view.state.doc.forEach((node, offset) => {
              if (
                headingPosition === null &&
                node.type.name === 'heading' &&
                position >= offset &&
                position <= offset + node.nodeSize
              ) headingPosition = offset;
            });
            if (headingPosition === null) return false;
            view.dispatch(
              view.state.tr.setMeta(collapsibleHeadingsKey, { toggle: headingPosition }),
            );
            return true;
          },
        },
      }),
    ];
  },
});

function DrawingNodeView({ node, updateAttributes, selected }) {
  const canvasRef = useRef(null);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('base');
  const elements = useRef(node.attrs.elements || []);
  const height = node.attrs.height || 300;
  const isDrawing = useRef(false);

  const getActiveColor = (c) => {
    if (c === 'base') return 'var(--on-surface)';
    return c;
  };

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    
    elements.current.forEach(el => {
      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = el.composite === 'destination-out' ? 'rgba(0,0,0,1)' : getActiveColor(el.color);
      ctx.lineWidth = el.width || 3;
      ctx.globalCompositeOperation = el.composite || 'source-over';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      if (el.points && el.points.length > 0) {
        ctx.moveTo(el.points[0].x, el.points[0].y);
        for (let i = 1; i < el.points.length; i++) {
          ctx.lineTo(el.points[i].x, el.points[i].y);
        }
      }
      ctx.stroke();
      ctx.restore();
    });
  }, []);

  useEffect(() => {
    elements.current = node.attrs.elements || [];
    redraw();
  }, [node.attrs.elements, redraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      redraw();
    }
  }, [redraw, height]);

  const startDrawing = (e) => {
    isDrawing.current = true;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    elements.current.push({
      points: [{ x, y }],
      color: color,
      width: 3,
      composite: tool === 'eraser' ? 'destination-out' : 'source-over'
    });
  };

  const draw = (e) => {
    if (!isDrawing.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const currentEl = elements.current[elements.current.length - 1];
    currentEl.points.push({ x, y });
    
    const ctx = canvasRef.current.getContext('2d');
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = currentEl.composite === 'destination-out' ? 'rgba(0,0,0,1)' : getActiveColor(currentEl.color);
    ctx.lineWidth = currentEl.width;
    ctx.globalCompositeOperation = currentEl.composite;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    const pts = currentEl.points;
    if (pts.length > 1) {
      ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.stroke();
    }
    ctx.restore();
  };

  const stopDrawing = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    // Commit the changes with a deep clone to ensure Tiptap detects the update
    const committed = elements.current.map(el => ({
      ...el,
      points: [...el.points]
    }));
    updateAttributes({ elements: committed });
  };

  const clearCanvas = () => {
    elements.current = [];
    updateAttributes({ elements: [] });
    redraw();
  };

  return (
    <NodeViewWrapper className={`drawing-block my-6 rounded-2xl border-2 transition-all overflow-hidden ${selected ? 'border-[color:var(--primary)] shadow-lg' : 'border-[color:var(--outline-variant)]/50 bg-[color:var(--surface-container-low)] shadow-sm'}`}>
      <div className="flex flex-col" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-2 border-b border-[color:var(--outline-variant)]/30 bg-[color:var(--surface-variant)]/20">
           <div className="flex items-center gap-3">
             <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-[color:var(--on-surface-variant)] opacity-70 mr-2">
              <Icon name="draw" className="text-xs" />
              Desenho
            </div>
            
            <div className="flex items-center gap-1 bg-[color:var(--surface)] rounded-lg p-0.5 shadow-sm border border-[color:var(--outline-variant)]/20">
              <button onClick={() => setTool('pen')} className={`p-1 rounded-md transition-all ${tool === 'pen' ? 'bg-[color:var(--primary)] text-white shadow-sm' : 'text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-variant)]'}`} title="Lápis">
                <Icon name="edit" className="text-[14px]" />
              </button>
              <button onClick={() => setTool('eraser')} className={`p-1 rounded-md transition-all ${tool === 'eraser' ? 'bg-[color:var(--primary)] text-white shadow-sm' : 'text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-variant)]'}`} title="Borracha">
                <Icon name="ink_eraser" className="text-[14px]" />
              </button>
            </div>

            <div className="flex items-center gap-1.5 ml-1">
              {['base', '#a78bfa', '#ec4899', '#10b981', '#f59e0b', '#ef4444'].map(c => (
                <button 
                  key={c} 
                  onClick={() => setColor(c)}
                  className={`w-4 h-4 rounded-full border border-black/5 transition-transform ${color === c ? 'scale-125 ring-2 ring-[color:var(--primary)]/40 shadow-sm' : 'hover:scale-110'}`}
                  style={{ backgroundColor: c === 'base' ? 'var(--on-surface)' : c }}
                />
              ))}
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <button onClick={clearCanvas} className="p-1 rounded-md text-[color:var(--on-surface-variant)] hover:bg-red-500/10 hover:text-red-500 transition-all" title="Limpar">
              <Icon name="delete" className="text-[14px]" />
            </button>
          </div>
        </div>
        
        <div className="relative touch-none bg-white/5" style={{ height: `${height}px` }}>
          <canvas
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            className="w-full h-full cursor-crosshair block"
          />
        </div>
      </div>
    </NodeViewWrapper>
  );
}

function MathNodeView({ node, selected }) {
  const rawLatex = node?.attrs?.latex;
  const latex = typeof rawLatex === 'string'
    ? rawLatex
    : rawLatex == null
      ? ''
      : String(rawLatex);
  const rendered = katex.renderToString(latex, {
    throwOnError: false,
    strict: false,
    output: 'html',
  });

  return (
    <NodeViewWrapper
      as="span"
      className={`mx-1 inline-flex rounded-lg px-2 py-1 align-middle ${selected ? 'bg-[color:var(--primary)]/15 ring-2 ring-[color:var(--primary)]/30' : 'bg-[color:var(--surface-variant)]/35'}`}
      data-math={latex}
      title={`Fórmula: ${latex}`}
    >
      <span dangerouslySetInnerHTML={{ __html: sanitizeGeneratedHtml(rendered) }} />
    </NodeViewWrapper>
  );
}

const MathFormula = Node.create({
  name: 'mathFormula',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-math]',
        getAttrs: (element) => ({ latex: element.getAttribute('data-math') || '' }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const latex = typeof HTMLAttributes.latex === 'string' ? HTMLAttributes.latex : String(HTMLAttributes.latex || '');
    return [
      'span',
      mergeAttributes(domSafeAttributes(HTMLAttributes), {
        'data-math': latex,
        class: 'math-formula',
      }),
      latex,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathNodeView);
  },
});

function MermaidNodeView({ node, selected }) {
  const code = node.attrs.code || '';
  const [svg, setSvg] = useState('');
  const [error, setError] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Pan & Zoom States
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    let isMounted = true;
    const render = async () => {
      if (!code) return;
      try {
        const cleaned = cleanMermaidCode(code);
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
        const { svg: renderedSvg } = await mermaid.render(id, cleaned);
        if (isMounted) {
          setSvg(sanitizeSvg(renderedSvg));
          setError(null);
        }
      } catch (e) {
        if (isMounted) {
          setError(e.message);
        }
      }
    };
    render();
    return () => { isMounted = false; };
  }, [code]);

  // Pan & Zoom Handlers
  const handleZoomIn = (e) => { e?.stopPropagation(); setScale(s => Math.min(s + 0.2, 5)); };
  const handleZoomOut = (e) => { e?.stopPropagation(); setScale(s => Math.max(s - 0.2, 0.2)); };
  const handleReset = (e) => { e?.stopPropagation(); setScale(1); setPosition({ x: 0, y: 0 }); };

  const handleWheel = (e) => {
    if (!isFullscreen) return;
    if (e.deltaY < 0) {
      setScale(s => Math.min(s + 0.1, 5));
    } else {
      setScale(s => Math.max(s - 0.1, 0.2));
    }
  };

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  return (
    <>
      <NodeViewWrapper className={`my-4 p-0 rounded-xl transition-all ${selected ? 'ring-2 ring-[color:var(--primary)]' : ''}`}>
        <div 
          className={`flex flex-col sm:flex-row sm:items-center gap-4 p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-xl border-2 ${selected ? 'border-[color:var(--primary)]' : 'border-[color:var(--outline-variant)]/50'} bg-[color:var(--surface-container-low)] shadow-sm`}
          onClick={() => { if (!error && svg) setIsFullscreen(true); }}
        >
          <div className="w-12 h-12 shrink-0 rounded-lg bg-indigo-500/10 flex items-center justify-center text-[color:var(--primary)]">
            <Icon name="schema" className="text-2xl" />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-[color:var(--on-surface)]">Diagrama de IA</h4>
            <p className="text-xs text-[color:var(--on-surface-variant)] mt-0.5">
              {error ? 'Erro ao renderizar o diagrama' : 'Clique para visualizar em tela cheia'}
            </p>
          </div>
          {error ? (
            <div className="text-red-500 text-[10px] font-mono p-2 bg-red-50 dark:bg-red-900/20 rounded border border-red-100 max-w-xs overflow-hidden text-ellipsis whitespace-nowrap">
              {error}
            </div>
          ) : (
            <button className="self-start sm:self-center px-4 py-2 bg-[color:var(--primary)]/10 text-[color:var(--primary)] rounded-lg text-sm font-semibold hover:bg-[color:var(--primary)]/20 transition-colors">
              Visualizar
            </button>
          )}
        </div>
      </NodeViewWrapper>

      {isFullscreen && createPortal(
        <div className="fixed inset-0 z-[999999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#121212] w-full h-full max-w-7xl rounded-2xl flex flex-col relative overflow-hidden shadow-2xl border border-[color:var(--outline-variant)]/20">
            <div className="flex justify-between items-center px-6 py-4 border-b border-[color:var(--outline-variant)]/30 bg-[color:var(--surface-container-low)] z-10">
              <div className="flex items-center gap-3 text-[color:var(--primary)]">
                <Icon name="schema" className="text-xl" />
                <h3 className="font-bold text-lg text-[color:var(--on-surface)]">Visualização do Diagrama</h3>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); setIsFullscreen(false); }} 
                className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-full transition-colors text-[color:var(--on-surface-variant)]"
                title="Fechar"
              >
                <Icon name="close" className="text-xl" />
              </button>
            </div>
            
            <div 
              className={`flex-1 overflow-hidden bg-gray-50 dark:bg-black/40 mermaid-block mermaid-fullscreen relative select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <div 
                className="w-full h-full flex items-center justify-center pointer-events-none"
                style={{
                  transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                  transformOrigin: 'center',
                  transition: isDragging ? 'none' : 'transform 0.1s ease-out'
                }}
              >
                <div dangerouslySetInnerHTML={{ __html: sanitizeSvg(svg) }} />
              </div>
              
              {/* Controles de Zoom Flutuantes */}
              <div className="absolute bottom-6 right-6 flex items-center gap-2 bg-white dark:bg-[#1e1e1e] p-2 rounded-xl shadow-lg border border-[color:var(--outline-variant)]/30 z-20">
                <button 
                  onClick={handleZoomOut}
                  className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  title="Diminuir Zoom"
                >
                  <Icon name="remove" />
                </button>
                <button 
                  onClick={handleReset}
                  className="px-3 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm font-medium"
                  title="Tamanho Real"
                >
                  {Math.round(scale * 100)}%
                </button>
                <button 
                  onClick={handleZoomIn}
                  className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  title="Aumentar Zoom"
                >
                  <Icon name="add" />
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

const TableNode = Node.create({
  name: 'table',
  group: 'block',
  content: 'tableRow+',
  tableRole: 'table',
  isolating: true,
  parseHTML() {
    return [{ tag: 'table' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['table', mergeAttributes(domSafeAttributes(HTMLAttributes)), 0];
  },
});

const TableRowNode = Node.create({
  name: 'tableRow',
  content: '(tableHeader | tableCell)+',
  tableRole: 'row',
  parseHTML() {
    return [{ tag: 'tr' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['tr', mergeAttributes(domSafeAttributes(HTMLAttributes)), 0];
  },
});

const TableHeaderNode = Node.create({
  name: 'tableHeader',
  content: 'inline*',
  tableRole: 'header_cell',
  parseHTML() {
    return [{ tag: 'th' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['th', mergeAttributes(domSafeAttributes(HTMLAttributes)), 0];
  },
});

const TableCellNode = Node.create({
  name: 'tableCell',
  content: 'inline*',
  tableRole: 'cell',
  parseHTML() {
    return [{ tag: 'td' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['td', mergeAttributes(domSafeAttributes(HTMLAttributes)), 0];
  },
});

const MermaidNode = Node.create({
  name: 'mermaid',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      code: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-mermaid]',
        getAttrs: (element) => ({ code: element.getAttribute('data-mermaid') || '' }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const code = typeof HTMLAttributes.code === 'string' ? HTMLAttributes.code : String(HTMLAttributes.code || '');
    return [
      'div',
      mergeAttributes(domSafeAttributes(HTMLAttributes), {
        'data-mermaid': code,
        class: 'mermaid-diagram',
      }),
      code,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MermaidNodeView);
  },
});

const DrawingNode = Node.create({
  name: 'drawing',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      elements: {
        default: [],
      },
      height: {
        default: 300,
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="drawing"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    // `elements` is the drawing's internal array and must never become a DOM
    // attribute. It remains persisted through the node attributes/state and
    // is rendered by DrawingNodeView.
    return ['div', mergeAttributes(domSafeAttributes(HTMLAttributes), { 'data-type': 'drawing' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DrawingNodeView);
  },
});

function getDecorations(doc) {
  const decorations = [];

  doc.descendants((node, pos) => {
    if (node.isText) {
      const text = node.text;
      const regex = /(^|[\s([{])#[\p{L}\p{N}_-]+(?:\/[\p{L}\p{N}_-]+)*/gu;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const trimmed = match[0].trimStart();
        const offset = match[0].length - trimmed.length;
        decorations.push(
          Decoration.inline(
            pos + match.index + offset,
            pos + match.index + offset + trimmed.length,
            {
              class: 'text-[color:var(--tertiary)] font-bold bg-[color:var(--tertiary)]/10 px-1 rounded',
            },
          ),
        );
      }
    }
  });

  return DecorationSet.create(doc, decorations);
}

const formatPlaybackTime = (time) => {
  const totalSeconds = Math.max(0, Math.floor(time || 0));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
};

const MenuButton = ({ onAction, disabled, isActive, icon, label, title }) => (
  <button
    type="button"
    onMouseDown={(event) => {
      event.preventDefault();
      if (!disabled) {
        onAction?.();
      }
    }}
    disabled={disabled}
    title={title}
    className={`w-8 h-8 rounded flex items-center justify-center transition-colors shrink-0 ${
      isActive
        ? 'bg-[color:var(--surface-variant)] text-[color:var(--primary)]'
        : 'text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-variant)] hover:text-[color:var(--primary)]'
    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
  >
    {icon ? (
      <Icon
        className="text-[18px]"
        name={icon}
        style={icon === 'format_bold' ? { fontVariationSettings: "'wght' 600" } : {}}
      />
    ) : (
      <span className="text-xs font-bold">{label}</span>
    )}
  </button>
);

const Divider = () => <div className="w-px h-5 bg-[color:var(--outline-variant)] mx-1 shrink-0"></div>;

const MenuBar = ({ 
  editor, 
  getCurrentTime, 
  onAddTopicsAbordados,
  drawingMode, 
  onToggleDrawingMode,
  drawingTool,
  setDrawingTool,
  drawingColor,
  setDrawingColor,
  drawingWidth,
  setDrawingWidth,
  undoDrawing,
  redoDrawing,
  clearDrawing,
  deleteSelectedDrawing
}) => {
  const [, forceRender] = useReducer((value) => value + 1, 0);
  const imageInputRef = useRef(null);

  useEffect(() => {
    if (!isEditorAvailable(editor)) return undefined;

    const rerender = () => {
      if (isEditorAvailable(editor)) forceRender();
    };
    editor.on('selectionUpdate', rerender);
    editor.on('transaction', rerender);
    editor.on('focus', rerender);
    editor.on('blur', rerender);

    return () => {
      if (isEditorAvailable(editor)) {
        editor.off('selectionUpdate', rerender);
        editor.off('transaction', rerender);
        editor.off('focus', rerender);
        editor.off('blur', rerender);
      }
    };
  }, [editor]);

  if (!isEditorAvailable(editor)) {
    return null;
  }

  const setLink = () => {
    const { from, to } = editor.state.selection;
    if (from === to && !editor.isActive('link')) {
      window.alert('Selecione um texto para adicionar o link.');
      return;
    }

    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL do Link:', previousUrl);

    if (url === null) {
      return;
    }

    if (url === '') {
      editor
        .chain()
        .focus()
        .setTextSelection({ from, to })
        .extendMarkRange('link')
        .unsetLink()
        .run();
      return;
    }

    const normalizedUrl = /^(https?:|mailto:|#)/i.test(url)
      ? url
      : `https://${url}`;

    editor
      .chain()
      .setTextSelection({ from, to })
      .focus()
      .extendMarkRange('link')
      .setLink({ href: normalizedUrl })
      .run();
  };

  const insertFormula = () => {
    const latex = window.prompt(
      'Fórmula em LaTeX:',
      'E = mc^2',
    );
    if (!latex?.trim()) return;
    editor
      .chain()
      .focus()
      .insertContent({ type: 'mathFormula', attrs: { latex: latex.trim() } })
      .insertContent(' ')
      .run();
  };

  const insertImage = async (file) => {
    if (!file || !isEditorAvailable(editor)) return;
    try {
      const src = await imageFileToDataUrl(file);
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'noteImage',
          attrs: { src, alt: file.name || 'Imagem da nota', title: file.name || '' },
        })
        .insertContent(' ')
        .run();
    } catch (error) {
      window.alert(error?.message || 'Não foi possível inserir a imagem.');
    } finally {
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col border-b border-[color:var(--outline-variant)]/30">
      <div className="flex items-center gap-2 bg-[color:var(--surface-container)] p-2">
        {getCurrentTime && (
          <button
            type="button"
            onClick={() => {
              const time = getCurrentTime();
              if (time !== null && time !== undefined) {
                const timeStr = formatPlaybackTime(time);
                editor
                  .chain()
                  .focus()
                  .insertContent([
                    {
                      type: 'text',
                      text: `⏱ ${timeStr}`,
                      marks: [
                        {
                          type: 'link',
                          attrs: {
                            href: `#time=${time}`,
                          },
                        },
                      ],
                    },
                    {
                      type: 'text',
                      text: ' ',
                    },
                  ])
                  .run();
              }
            }}
            title="Marcar Tempo Atual do Vídeo/Áudio"
            className="shrink-0 rounded-xl border border-[color:var(--primary)]/30 bg-[color:var(--primary)] px-4 py-2 text-xs font-extrabold text-white shadow-[0_10px_24px_rgba(139,92,246,0.28)] transition-all hover:scale-[1.02] hover:bg-[color:var(--secondary)] hover:shadow-[0_14px_28px_rgba(76,175,80,0.28)]"
          >
            <span className="flex items-center gap-1.5">
              <Icon className="text-[16px]" name="timer" />
              Marcar Tempo
            </span>
          </button>
        )}
        {onAddTopicsAbordados && (
          <button
            type="button"
            onClick={onAddTopicsAbordados}
            title="Adicionar ou Gerar Conteúdos Abordados"
            className="shrink-0 rounded-xl border border-purple-500/30 bg-purple-500/10 hover:bg-purple-600 hover:text-white px-3 py-2 text-xs font-black text-purple-600 dark:text-purple-300 shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Icon className="text-[16px] text-amber-500" name="fact_check" />
            <span>Conteúdos Abordados</span>
          </button>
        )}

        <div className="flex min-w-0 flex-1 items-center gap-0.5 flex-wrap gap-y-2">
          <MenuButton onAction={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} icon="undo" title="Desfazer" />
          <MenuButton onAction={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} icon="redo" title="Refazer" />

          <Divider />

          <MenuButton onAction={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} isActive={editor.isActive('heading', { level: 1 })} label="H1" title="Título 1" />
          <MenuButton onAction={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} isActive={editor.isActive('heading', { level: 2 })} label="H2" title="Título 2" />
          <MenuButton onAction={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} isActive={editor.isActive('heading', { level: 3 })} label="H3" title="Título 3" />
          <MenuButton onAction={() => editor.chain().focus().toggleHeading({ level: 4 }).run()} isActive={editor.isActive('heading', { level: 4 })} label="H4" title="Título 4" />
          <MenuButton onAction={() => editor.chain().focus().toggleHeading({ level: 5 }).run()} isActive={editor.isActive('heading', { level: 5 })} label="H5" title="Título 5" />

          <Divider />

          <MenuButton onAction={() => editor.chain().focus().toggleBold().run()} disabled={!editor.can().chain().focus().toggleBold().run()} isActive={editor.isActive('bold')} icon="format_bold" title="Negrito" />
          <MenuButton onAction={() => editor.chain().focus().toggleItalic().run()} disabled={!editor.can().chain().focus().toggleItalic().run()} isActive={editor.isActive('italic')} icon="format_italic" title="Itálico" />
          <MenuButton onAction={() => editor.chain().focus().toggleUnderline().run()} disabled={!editor.can().chain().focus().toggleUnderline().run()} isActive={editor.isActive('underline')} icon="format_underlined" title="Sublinhado" />
          <MenuButton onAction={() => editor.chain().focus().toggleStrike().run()} disabled={!editor.can().chain().focus().toggleStrike().run()} isActive={editor.isActive('strike')} icon="format_strikethrough" title="Tachado" />

          <Divider />

          <MenuButton onAction={() => editor.chain().focus().setTextAlign('left').run()} isActive={editor.isActive({ textAlign: 'left' })} icon="format_align_left" title="Alinhar à Esquerda" />
          <MenuButton onAction={() => editor.chain().focus().setTextAlign('center').run()} isActive={editor.isActive({ textAlign: 'center' })} icon="format_align_center" title="Centralizar" />
          <MenuButton onAction={() => editor.chain().focus().setTextAlign('right').run()} isActive={editor.isActive({ textAlign: 'right' })} icon="format_align_right" title="Alinhar à Direita" />
          <MenuButton onAction={() => editor.chain().focus().setTextAlign('justify').run()} isActive={editor.isActive({ textAlign: 'justify' })} icon="format_align_justify" title="Justificar" />

          <Divider />

          <MenuButton onAction={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive('bulletList')} icon="format_list_bulleted" title="Lista com Marcadores" />
          <MenuButton onAction={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive('orderedList')} icon="format_list_numbered" title="Lista Numerada" />

          <Divider />

          <MenuButton onAction={() => editor.chain().focus().toggleCodeBlock().run()} isActive={editor.isActive('codeBlock')} icon="code" title="Bloco de Código" />
          {editor.isActive('codeBlock') && (
            <select
              value={editor.getAttributes('codeBlock').language || ''}
              onChange={(e) => editor.chain().focus().updateAttributes('codeBlock', { language: e.target.value }).run()}
              className="text-[11px] font-bold bg-[color:var(--surface-container-high)] text-[color:var(--on-surface)] border border-[color:var(--outline-variant)]/30 rounded px-1.5 py-1 outline-none cursor-pointer"
              title="Linguagem de programação do código"
            >
              <option value="">Linguagem (Geral)</option>
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
              <option value="python">Python</option>
              <option value="html">HTML</option>
              <option value="css">CSS</option>
              <option value="cpp">C / C++</option>
              <option value="csharp">C#</option>
              <option value="java">Java</option>
              <option value="sql">SQL</option>
              <option value="json">JSON</option>
              <option value="bash">Bash / Shell</option>
              <option value="rust">Rust</option>
              <option value="go">Go</option>
              <option value="php">PHP</option>
              <option value="ruby">Ruby</option>
            </select>
          )}
          <MenuButton onAction={insertFormula} icon="function" title="Inserir fórmula matemática (LaTeX)" />
          <MenuButton onAction={() => imageInputRef.current?.click()} icon="image" title="Inserir imagem" />
          <input
            ref={imageInputRef}
            className="hidden"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(event) => insertImage(event.target.files?.[0])}
          />

          <Divider />

          <MenuButton onAction={() => editor.chain().focus().toggleHighlight().run()} isActive={editor.isActive('highlight')} icon="format_ink_highlighter" title="Destacar (Highlight)" />
          <MenuButton onAction={setLink} isActive={editor.isActive('link')} icon="link" title="Inserir Link" />
          <MenuButton onAction={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} icon="format_clear" title="Limpar Formatação" />

          <Divider />
          <MenuButton onAction={onToggleDrawingMode} isActive={drawingMode} icon="draw" title="Modo Desenho (Livre)" />
        </div>
      </div>
      
      {drawingMode && (
        <div className="flex items-center gap-4 flex-wrap gap-y-2 bg-[color:var(--surface-container-low)] p-2 px-4 border-t border-[color:var(--outline-variant)]/20 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-1">
            <MenuButton onAction={() => setDrawingTool('select')} isActive={drawingTool === 'select'} icon="highlight_alt" title="Selecionar, Mover e Apagar Traços (ou aperte Delete)" />
            <MenuButton onAction={() => setDrawingTool('pen')} isActive={drawingTool === 'pen'} icon="edit" title="Lápis" />
            <MenuButton onAction={() => setDrawingTool('highlighter')} isActive={drawingTool === 'highlighter'} icon="format_ink_highlighter" title="Marca Texto" />
            <MenuButton onAction={() => setDrawingTool('eraser')} isActive={drawingTool === 'eraser'} icon="ink_eraser" title="Borracha" />
          </div>
          
          <Divider />
          
          <div className="flex items-center gap-1.5">
            {["base", "#a78bfa", "#ec4899", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#6366f1", "#8b5cf6"].map((c) => (
              <button
                key={c}
                onClick={() => setDrawingColor(c)}
                className={`w-6 h-6 rounded-full border border-black/5 transition-all ${
                  drawingColor === c ? "scale-110 ring-2 ring-[color:var(--primary)] shadow-md" : "hover:scale-105"
                }`}
                style={{ backgroundColor: c === "base" ? "var(--on-surface)" : c }}
                title="Cor"
              />
            ))}
          </div>
          
          <Divider />
          
          <div className="flex items-center gap-2">
            <Icon name="line_weight" className="text-[color:var(--on-surface-variant)] text-sm" />
            <input
              type="range"
              min="1"
              max="20"
              value={drawingWidth}
              onChange={(e) => setDrawingWidth(parseInt(e.target.value))}
              className="w-24 accent-[color:var(--primary)]"
              title="Espessura"
            />
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-1">
            {drawingTool === 'select' && (
              <button
                type="button"
                onClick={deleteSelectedDrawing}
                className="px-2.5 py-1 rounded-lg bg-[color:var(--error)]/10 text-[color:var(--error)] hover:bg-[color:var(--error)] hover:text-white text-xs font-bold flex items-center gap-1 transition-all mr-2"
                title="Apagar traços selecionados (ou Delete no teclado)"
              >
                <Icon name="delete" className="text-sm" />
                <span>Apagar Seleção</span>
              </button>
            )}
            <MenuButton onAction={undoDrawing} icon="undo" title="Desfazer Desenho" />
            <MenuButton onAction={redoDrawing} icon="redo" title="Refazer Desenho" />
            <MenuButton 
              onAction={() => {
                if (window.confirm("Limpar todos os desenhos desta nota?")) {
                  clearDrawing();
                }
              }} 
              icon="delete_sweep" 
              title="Limpar Tudo" 
            />
          </div>
        </div>
      )}
    </div>
  );
};

export const RichTextEditor = forwardRef(({
  content,
  drawings = [],
  onDrawingsChange,
  onChange,
  placeholder = 'Comece a estruturar suas ideias...',
  getCurrentTime,
  onTimeClick,
  onAiChatLinkClick,
  onNestedNoteClick,
  onCreateNestedNote,
  nestedNoteTitle,
  onAddTopicsAbordados,
  onSelectionChange,
  readOnly = false,
  documentMode = false,
  displaySettings = {
    maxWidth: 'standard',
    lineMarking: 'none',
    pageLayout: 'infinite'
  },
}, ref) => {
  const [contentHeight, setContentHeight] = useState(0);
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashMenuIndex, setSlashMenuIndex] = useState(0);
  const editorContainerRef = useRef(null);
  const drawingOverlayRef = useRef(null);
  const [drawingMode, setDrawingMode] = useState(false);
  const [drawingTool, setDrawingTool] = useState('pen');
  const [drawingColor, setDrawingColor] = useState('base');
  const [drawingWidth, setDrawingWidth] = useState(3);
  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editable: !readOnly,
    extensions: [
      StarterKit.configure({
        history: {
          depth: 100,
          newGroupDelay: 300,
        },
      }),
      TableNode,
      TableRowNode,
      TableHeaderNode,
      TableCellNode,
      HashtagExtension,
      CollapsibleHeadings,
      MathFormula,
      MermaidNode,
      DrawingNode,
      NoteImage,
      Highlight.configure({
        multicolor: false,
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        isAllowedUri: (url, ctx) => {
          return (
            url.startsWith('#') ||
            url.startsWith('http://') ||
            url.startsWith('https://') ||
            url.startsWith('mailto:') ||
            ctx.defaultValidate(url)
          );
        },
        HTMLAttributes: {
          rel: null,
          target: null,
        },
      }),
    ],
    content,
    autofocus: 'start',
    onUpdate: ({ editor: currentEditor }) => {
      if (!isEditorAvailable(currentEditor)) return;
      onChange?.(currentEditor.getHTML());
      if (!readOnly) {
        const { from } = currentEditor.state.selection;
        const beforeCursor = currentEditor.state.doc.textBetween(0, from + 1, '\n');
        setSlashMenuOpen(/(?:^|\n)\/$/.test(beforeCursor));
      }
    },
    onSelectionUpdate: ({ editor: currentEditor }) => {
      if (!onSelectionChange || !isEditorAvailable(currentEditor)) return;
      const { from, to } = currentEditor.state.selection;
      onSelectionChange(
        from === to
          ? ''
          : currentEditor.state.doc.textBetween(from, to, ' ').trim(),
      );
    },
    editorProps: {
      attributes: {
        class: documentMode
          ? 'focus:outline-none min-h-full w-full text-[color:var(--on-surface)]'
          : 'focus:outline-none min-h-full p-4 w-full h-full text-[color:var(--on-surface)]',
      },
      handlePaste: (_view, event) => {
        const clipboard = event.clipboardData;
        const imageFile = [
          ...Array.from(clipboard?.files || []),
          ...Array.from(clipboard?.items || [])
            .filter((item) => item.kind === 'file')
            .map((item) => item.getAsFile()),
        ].find((file) => file?.type?.startsWith('image/'));
        const html = clipboard?.getData('text/html') || '';
        const embeddedImage = html.match(/<img[^>]+src=["'](data:image\/(?:png|jpe?g|webp|gif);base64,[^"']+)["']/i)?.[1];
        if (!imageFile && !embeddedImage) {
          const plainText = clipboard?.getData('text/plain') || '';
          const containsLatex = /\$\$?[^$\n]+\$\$?|\\\(.+?\\\)/.test(plainText);
          if (!containsLatex) return false;
          event.preventDefault();
          if (isEditorAvailable(editor)) {
            editor.chain().focus().insertContent(markdownToNoteHtml(plainText)).run();
          }
          return true;
        }

        event.preventDefault();
        const imagePromise = embeddedImage
          ? Promise.resolve(embeddedImage)
          : imageFileToDataUrl(imageFile);
        imagePromise
          .then((src) => {
            if (!isEditorAvailable(editor)) return;
            editor
              .chain()
              .focus()
              .insertContent({
                type: 'noteImage',
                attrs: {
                  src,
                  alt: imageFile?.name || 'Imagem colada',
                  title: imageFile?.name || 'Imagem colada',
                },
              })
              .insertContent(' ')
              .run();
          })
          .catch((error) => {
            window.alert(error?.message || 'Não foi possível colar a imagem.');
          });
        return true;
      },
      handleDOMEvents: {
        keydown: (view, event) => {
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
            if (event.shiftKey) {
              if (isEditorAvailable(editor)) editor.commands.redo();
            } else {
              if (isEditorAvailable(editor)) editor.commands.undo();
            }
            event.preventDefault();
            return true;
          }
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
            if (isEditorAvailable(editor)) editor.commands.redo();
            event.preventDefault();
            return true;
          }
          return false;
        },
      },
    },
  });

  useImperativeHandle(ref, () => ({
    insertMermaid: (code) => {
      if (!isEditorAvailable(editor)) return;
      const cleaned = cleanMermaidCode(code);
      editor
        .chain()
        .focus()
        .insertContent({ type: 'mermaid', attrs: { code: cleaned } })
        .run();
    },
    insertDrawing: () => {
      if (!isEditorAvailable(editor)) return;
      editor
        .chain()
        .focus()
        .insertContent({ type: 'drawing' })
        .run();
    },
    replaceSelection: (text) => {
      if (!isEditorAvailable(editor)) return;
      editor.chain().focus().insertContent(text).run();
    },
    appendHtml: (html) => {
      if (!isEditorAvailable(editor) || !html) return;
      editor
        .chain()
        .focus()
        .insertContentAt(editor.state.doc.content.size, html)
        .run();
    },
    insertTopicsBlock: (customHtml) => {
      if (!isEditorAvailable(editor)) return;
      const defaultBlock = `
        <div class="ai-inserted-block my-4 p-4 bg-purple-500/10 border border-purple-500/30 rounded-2xl">
          <h3 class="text-base font-bold text-[color:var(--primary)] flex items-center gap-2 mb-2">
            <span>📚 Conteúdos Abordados</span>
          </h3>
          <ul>
            <li><strong>Tópico 1</strong>: Conteúdo principal abordado...</li>
            <li><strong>Tópico 2</strong>: Conceitos ou assuntos discutidos...</li>
          </ul>
        </div>
      `;
      editor.chain().focus().insertContent(customHtml || defaultBlock).run();
    },
    undoDrawing: () => drawingOverlayRef.current?.undo(),
    redoDrawing: () => drawingOverlayRef.current?.redo(),
    clearDrawing: () => drawingOverlayRef.current?.clear(),
  }));

  useEffect(() => {
    if (isEditorAvailable(editor) && content !== editor.getHTML()) {
      editor.commands.setContent(content, false);
    }
  }, [content, editor]);

  useEffect(() => {
    if (isEditorAvailable(editor)) {
      editor.setEditable(!readOnly);
    }
  }, [readOnly, editor]);

  useEffect(() => {
    if (!isEditorAvailable(editor)) return undefined;

    const editorDom = editor.view?.dom;
    if (!editorDom) return undefined;
    
    const updateHeight = () => {
      if (editorDom.isConnected) setContentHeight(editorDom.scrollHeight);
    };

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(editorDom);
    
    updateHeight();
    
    return () => resizeObserver.disconnect();
  }, [editor]);

  const handleEditorClick = (event) => {
    if (!(event.target instanceof Element)) return;

    const aiChatTarget = event.target.closest('.ai-chat-link-btn, .ai-chat-citation, [data-thread-id]');
    if (aiChatTarget) {
      event.preventDefault();
      event.stopPropagation();
      const threadId = aiChatTarget.getAttribute('data-thread-id') || '';
      const msgId = aiChatTarget.getAttribute('data-msg-id') || '';
      if (onAiChatLinkClick) {
        onAiChatLinkClick({ threadId, msgId });
      }
      return;
    }

    const nestedNoteTarget = event.target.closest('[data-nested-note-id], a[href*="#nested-note="]');
    if (nestedNoteTarget) {
      event.preventDefault();
      event.stopPropagation();
      const nestedId =
        nestedNoteTarget.getAttribute('data-nested-note-id') ||
        nestedNoteTarget.getAttribute('href')?.split('#nested-note=')[1];
      if (nestedId) {
        if (onNestedNoteClick) {
          onNestedNoteClick(nestedId);
        } else {
          import('../store/useStore').then(({ useStudyStore }) => {
            useStudyStore.getState().setActiveNote(nestedId);
          });
        }
      }
      return;
    }

    const target = event.target.closest('a[href*="#time="], [data-timestamp]');
    if (!target) return;

    event.preventDefault();

    const timestampValue =
      target.getAttribute('data-timestamp') ||
      target.getAttribute('data-time') ||
      target.getAttribute('href')?.split('#time=')[1];
    const time = parseFloat(timestampValue || '');

    if (!isNaN(time) && onTimeClick) {
      onTimeClick(time);
    }
  };

  const SLASH_COMMANDS = useMemo(() => [
    {
      id: 'h1',
      label: 'Título 1',
      desc: 'Título grande (# + espaço)',
      icon: 'format_h1',
      run: (ed, range) => ed.chain().focus().deleteRange(range).setHeading({ level: 1 }).run(),
    },
    {
      id: 'h2',
      label: 'Título 2',
      desc: 'Subtítulo médio (## + espaço)',
      icon: 'format_h2',
      run: (ed, range) => ed.chain().focus().deleteRange(range).setHeading({ level: 2 }).run(),
    },
    {
      id: 'h3',
      label: 'Título 3',
      desc: 'Seção menor (### + espaço)',
      icon: 'format_h3',
      run: (ed, range) => ed.chain().focus().deleteRange(range).setHeading({ level: 3 }).run(),
    },
    {
      id: 'bullet',
      label: 'Lista com Marcadores',
      desc: 'Tópicos com marcadores (- + espaço)',
      icon: 'format_list_bulleted',
      run: (ed, range) => ed.chain().focus().deleteRange(range).toggleBulletList().run(),
    },
    {
      id: 'ordered',
      label: 'Lista Numerada',
      desc: 'Lista em sequência (1. + espaço)',
      icon: 'format_list_numbered',
      run: (ed, range) => ed.chain().focus().deleteRange(range).toggleOrderedList().run(),
    },
    {
      id: 'quote',
      label: 'Citação / Destaque',
      desc: 'Bloco de citação (> + espaço)',
      icon: 'format_quote',
      run: (ed, range) => ed.chain().focus().deleteRange(range).toggleBlockquote().run(),
    },
    {
      id: 'code',
      label: 'Bloco de Código',
      desc: 'Trecho com realce de sintaxe',
      icon: 'code',
      run: (ed, range) => ed.chain().focus().deleteRange(range).toggleCodeBlock().run(),
    },
    {
      id: 'table',
      label: 'Tabela',
      desc: 'Tabela simples formatada',
      icon: 'table_chart',
      run: (ed, range) => ed.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    {
      id: 'math',
      label: 'Fórmula Matemática',
      desc: 'Expressão LaTeX com KaTeX',
      icon: 'functions',
      run: (ed, range) => ed.chain().focus().deleteRange(range).insertContent({ type: 'mathFormula', attrs: { formula: 'E = mc^2' } }).run(),
    },
    {
      id: 'mermaid',
      label: 'Diagrama Mermaid',
      desc: 'Fluxograma ou mapa mental',
      icon: 'account_tree',
      run: (ed, range) => ed.chain().focus().deleteRange(range).insertContent({ type: 'mermaid', attrs: { code: 'graph TD;\n  A[Início] --> B[Conceito Principal];' } }).run(),
    },
    {
      id: 'nota',
      label: 'Nota Interna',
      desc: 'Criar nota interna vinculada',
      icon: 'note_add',
      run: async (ed, range) => {
        const title = nestedNoteTitle || 'Nova nota interna';
        let childId;
        let childTitle = title;
        if (onCreateNestedNote) {
          const created = await onCreateNestedNote(title);
          if (created && typeof created === "object") {
            childId = created.id;
            childTitle = created.title || title;
          } else childId = created;
        }
        if (childId) {
          ed.chain().focus().deleteRange(range).insertContent({
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: `↳ ${childTitle}`,
                marks: [{ type: 'link', attrs: { href: `#nested-note=${childId}` } }],
              },
            ],
          }).run();
        }
      },
    },
  ].filter(command => command.id !== "nota" || onCreateNestedNote), [onCreateNestedNote, nestedNoteTitle]);

  const executeSlashCommandItem = async (item) => {
    if (!isEditorAvailable(editor) || !item) return;
    const { from } = editor.state.selection;
    const beforeCursor = editor.state.doc.textBetween(0, from, '\n');
    const slashMatch = beforeCursor.match(/\/[^\/]*$/);
    const start = slashMatch ? from - slashMatch[0].length : from - 1;
    const range = { from: start, to: from };

    await item.run(editor, range);
    setSlashMenuOpen(false);
    setSlashMenuIndex(0);
  };

  const handleEditorKeyDown = async (event) => {
    if (slashMenuOpen) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        event.stopPropagation();
        setSlashMenuIndex((prev) => (prev + 1) % SLASH_COMMANDS.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        setSlashMenuIndex((prev) => (prev - 1 + SLASH_COMMANDS.length) % SLASH_COMMANDS.length);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setSlashMenuOpen(false);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        await executeSlashCommandItem(SLASH_COMMANDS[slashMenuIndex]);
        return;
      }
    }
    if (event.key === '/' && !readOnly) {
      window.requestAnimationFrame(() => {
        setSlashMenuOpen(true);
        setSlashMenuIndex(0);
      });
      return;
    }
  };

  const handleEditorKeyUp = () => {
    if (!isEditorAvailable(editor)) return;
    const { from } = editor.state.selection;
    const beforeCursor = editor.state.doc.textBetween(0, from, '\n');
    setSlashMenuOpen(/(?:^|\n)\/$/.test(beforeCursor));
  };

  return (
    <div
      className={`flex h-full w-full flex-col bg-transparent ${documentMode ? 'note-document-editor' : ''} group relative`}
      onClickCapture={handleEditorClick}
      onKeyUp={handleEditorKeyUp}
    >
      {!readOnly && (
        <MenuBar 
          editor={editor} 
          getCurrentTime={getCurrentTime} 
          onAddTopicsAbordados={onAddTopicsAbordados}
          drawingMode={drawingMode} 
          onToggleDrawingMode={() => setDrawingMode(!drawingMode)}
          drawingTool={drawingTool}
          setDrawingTool={setDrawingTool}
          drawingColor={drawingColor}
          setDrawingColor={setDrawingColor}
          drawingWidth={drawingWidth}
          setDrawingWidth={setDrawingWidth}
          undoDrawing={() => drawingOverlayRef.current?.undo()}
          redoDrawing={() => drawingOverlayRef.current?.redo()}
          clearDrawing={() => drawingOverlayRef.current?.clear()}
          deleteSelectedDrawing={() => drawingOverlayRef.current?.deleteSelected?.()}
        />
      )}
      <div 
        ref={editorContainerRef}
        className={`flex-1 overflow-y-auto w-full tiptap-container custom-scrollbar relative ${
        displaySettings.maxWidth === 'full' ? 'full-width' : ''
      } ${
        displaySettings.lineMarking === 'ruled' ? 'ruled' : 
        displaySettings.lineMarking === 'grid' ? 'grid' : ''
      } ${
        displaySettings.pageLayout === 'paged' ? 'paged' : ''
      }`}>
        {slashMenuOpen && !readOnly ? (
          <div className="note-slash-command-menu absolute left-6 top-4 z-50 w-72 max-h-80 overflow-y-auto rounded-2xl border border-[color:var(--outline-variant)] bg-[color:var(--surface)] p-2 shadow-2xl space-y-1">
            <p className="px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-[color:var(--on-surface-variant)]">Comandos Rápidos (/)</p>
            {SLASH_COMMANDS.map((cmd, cIdx) => (
              <button
                key={cmd.id}
                ref={(el) => {
                  if (slashMenuIndex === cIdx && el) {
                    el.scrollIntoView({ block: 'nearest' });
                  }
                }}
                type="button"
                aria-selected={slashMenuIndex === cIdx}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => executeSlashCommandItem(cmd)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-[color:var(--surface-high)] ${
                  slashMenuIndex === cIdx ? 'bg-[color:var(--surface-high)] ring-1 ring-[color:var(--primary)]' : ''
                }`}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[color:var(--primary)]/10 text-[color:var(--primary)] text-sm">
                  <Icon name={cmd.icon} />
                </span>
                <span className="truncate flex-1">
                  <strong className="block text-xs font-bold text-[color:var(--on-surface)] truncate">{cmd.label}</strong>
                  <small className="block text-[10px] text-[color:var(--on-surface-variant)] truncate">{cmd.desc}</small>
                </span>
              </button>
            ))}
          </div>
        ) : null}
        <EditorContent editor={editor} onKeyDownCapture={handleEditorKeyDown} className="w-full h-full min-h-[150px] outline-none relative z-[2]" />
        <DrawingOverlay
          ref={drawingOverlayRef}
          drawings={drawings}
          onDrawingsChange={onDrawingsChange}
          tool={drawingTool}
          color={drawingColor}
          width={drawingWidth}
          drawingMode={drawingMode}
          height={contentHeight}
          displaySettings={displaySettings}
          editor={editor}
        />
        {isEditorAvailable(editor) && editor.isEmpty && !readOnly && (
          <div className="tiptap-placeholder absolute top-0 left-1/2 -translate-x-1/2 pointer-events-none text-[color:var(--on-surface-variant)]/50 font-body z-[5]">
            {placeholder}
          </div>
        )}
      </div>
    </div>
  );
});
