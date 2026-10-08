import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "../../ui/Icon";

/**
 * GraphView — Grafo interativo de conexões entre notas (estilo Obsidian)
 * Usa canvas nativo para renderização performática.
 *
 * @param {Object} props
 * @param {Array} props.nodes - Array de nós [{ id, title, tags, path }]
 * @param {Array} props.edges - Array de arestas [{ source, target }]
 * @param {string} props.activeNoteId - ID da nota ativa (para highlight)
 * @param {function} props.onNodeClick - Callback quando um nó é clicado
 * @param {boolean} props.isLocal - Se true, mostra apenas conexões locais da nota ativa
 * @param {string} props.className - Classes CSS adicionais
 */
export function GraphView({
  nodes = [],
  edges = [],
  activeNoteId,
  onNodeClick,
  isLocal = false,
  className = "",
}) {
  const canvasRef = useRef(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const animationRef = useRef(null);
  const simulationRef = useRef(null);
  const [hoveredNode, _setHoveredNode] = useState(null);
  const hoveredNodeRef = useRef(null);
  const setHoveredNode = useCallback((node) => {
    if (hoveredNodeRef.current !== node) {
      hoveredNodeRef.current = node;
      _setHoveredNode(node);
    }
  }, []);

  const [transform, _setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const setTransform = useCallback((updater) => {
    _setTransform((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      transformRef.current = next;
      return next;
    });
  }, []);
  const isDragging = useRef(false);
  const dragNode = useRef(null);
  const lastMouse = useRef({ x: 0, y: 0 });

  // Filtra nós/arestas para modo local
  const { filteredNodes, filteredEdges } = useMemo(() => {
    if (!isLocal || !activeNoteId) return { filteredNodes: nodes, filteredEdges: edges };

    const connectedIds = new Set();
    connectedIds.add(activeNoteId);

    edges.forEach((edge) => {
      if (edge.source === activeNoteId) connectedIds.add(edge.target);
      if (edge.target === activeNoteId) connectedIds.add(edge.source);
    });

    const filteredNodes = nodes.filter((n) => connectedIds.has(n.id));
    const filteredEdges = edges.filter(
      (e) => connectedIds.has(e.source) && connectedIds.has(e.target)
    );

    return { filteredNodes, filteredEdges };
  }, [nodes, edges, activeNoteId, isLocal]);

  // Cores por contexto
  const getNodeColor = useCallback(
    (node) => {
      if (node.id === activeNoteId) return "#6366f1"; // primary/indigo
      if (hoveredNode === node.id) return "#818cf8"; // lighter indigo
      // Cor baseada em tags ou path
      const colorMap = {
        física: "#3b82f6",
        cálculo: "#8b5cf6",
        literatura: "#ec4899",
        anatomia: "#ef4444",
        química: "#10b981",
        história: "#f59e0b",
        biologia: "#22c55e",
      };
      const tag = (node.tags?.[0] || node.path?.split("/")[0] || "").toLowerCase();
      return colorMap[tag] || "#cbd5e1"; // Cor mais clara para melhor visibilidade
    },
    [activeNoteId]
  );

  // Observe the actual canvas box after layout, including panel reopening.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const measure = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      setViewport(previous => previous.width === rect.width && previous.height === rect.height ? previous : { width: rect.width, height: rect.height });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    measure();
    return () => observer.disconnect();
  }, [filteredNodes.length > 0]);

  // Inicializa simulação force-directed
  useEffect(() => {
    if (!filteredNodes.length) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const theme = getComputedStyle(canvas);
    const { width, height } = viewport;
    if (!width || !height) return;
    canvas.width = Math.round(width * window.devicePixelRatio);
    canvas.height = Math.round(height * window.devicePixelRatio);
    // Reset scaling on each resize; accumulated scales distort the drawing.
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);

    // Inicializa posições dos nós em círculo
    const sim = filteredNodes.map((node, i) => {
      const angle = (2 * Math.PI * i) / filteredNodes.length;
      const radius = Math.min(width, height) * 0.3;
      return {
        ...node,
        x: width / 2 + radius * Math.cos(angle) + (Math.random() - 0.5) * 20,
        y: height / 2 + radius * Math.sin(angle) + (Math.random() - 0.5) * 20,
        vx: 0,
        vy: 0,
        radius: node.id === activeNoteId ? 8 : 5,
      };
    });

    const nodeMap = new Map(sim.map((n) => [n.id, n]));
    simulationRef.current = { nodes: sim, nodeMap, width, height };

    // Simulação de força
    const alpha = { value: 1.0 };
    const coolRate = 0.995;

    function tick() {
      if (alpha.value < 0.001) {
        alpha.value = 0;
        return;
      }
      alpha.value *= coolRate;

      // Repulsão entre nós
      for (let i = 0; i < sim.length; i++) {
        for (let j = i + 1; j < sim.length; j++) {
          const dx = sim[j].x - sim[i].x;
          const dy = sim[j].y - sim[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (120 * alpha.value) / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          sim[i].vx -= fx;
          sim[i].vy -= fy;
          sim[j].vx += fx;
          sim[j].vy += fy;
        }
      }

      // Atração pelas arestas
      filteredEdges.forEach((edge) => {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target) return;
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - 80) * 0.02 * alpha.value;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        source.vx += fx;
        source.vy += fy;
        target.vx -= fx;
        target.vy -= fy;
      });

      // Gravidade para o centro
      sim.forEach((node) => {
        node.vx += (width / 2 - node.x) * 0.001 * alpha.value;
        node.vy += (height / 2 - node.y) * 0.001 * alpha.value;
      });

      // Aplicar velocidade com damping
      sim.forEach((node) => {
        if (dragNode.current === node.id) return;
        node.vx *= 0.6;
        node.vy *= 0.6;
        node.x += node.vx;
        node.y += node.vy;
        // Limites
        node.x = Math.max(20, Math.min(width - 20, node.x));
        node.y = Math.max(20, Math.min(height - 20, node.y));
      });
    }

    function draw() {
      tick();

      ctx.clearRect(0, 0, width, height);
      ctx.save();
      const currentTransform = transformRef.current;
      ctx.translate(currentTransform.x, currentTransform.y);
      ctx.scale(currentTransform.scale, currentTransform.scale);

      // Desenha arestas
      filteredEdges.forEach((edge) => {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target) return;

        const currentHoveredNode = hoveredNodeRef.current;
        const isHighlighted =
          edge.source === activeNoteId ||
          edge.target === activeNoteId ||
          edge.source === currentHoveredNode ||
          edge.target === currentHoveredNode;

        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.strokeStyle = isHighlighted
          ? "rgba(99, 102, 241, 0.6)"
          : "rgba(128, 128, 128, 0.25)";
        ctx.setLineDash(edge.kind === "tag" ? [4, 4] : []);
        ctx.lineWidth = isHighlighted ? 1.5 : 0.8;
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // Desenha nós
      sim.forEach((node) => {
        const isActive = node.id === activeNoteId;
        const currentHoveredNode = hoveredNodeRef.current;
        const isHovered = node.id === currentHoveredNode;
        const color = getNodeColor(node);
        const radius = isActive ? 8 : isHovered ? 7 : 5;

        // Glow para nó ativo
        if (isActive || isHovered) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius + 6, 0, 2 * Math.PI);
          ctx.fillStyle =
            typeof color === "string" && color.startsWith("#")
              ? `${color}33`
              : "rgba(99, 102, 241, 0.2)";
          ctx.fill();
        }

        // Nó principal
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();

        // Borda para nó ativo
        if (isActive) {
          ctx.strokeStyle = "rgba(255,255,255,0.3)";
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Label
        if (isHovered || isActive || sim.length < 20) {
          ctx.font = `${isActive ? "600" : "400"} 11px 'Plus Jakarta Sans', sans-serif`;
          ctx.fillStyle =
            isActive || isHovered
              ? theme.getPropertyValue("--on-surface").trim()
              : theme.getPropertyValue("--on-surface-variant").trim();
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          const label = (node.title || "").length > 25
            ? (node.title || "").slice(0, 22) + "..."
            : node.title || "Sem título";
          ctx.fillText(label, node.x, node.y + radius + 6);
        }
      });

      ctx.restore();

      animationRef.current = requestAnimationFrame(draw);
    }

    animationRef.current = requestAnimationFrame(draw);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [filteredNodes, filteredEdges, activeNoteId, getNodeColor, viewport]);

  // Mouse handlers
  const handleMouseMove = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas || !simulationRef.current) return;

    const currentTransform = transformRef.current;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left - currentTransform.x) / currentTransform.scale;
    const my = (e.clientY - rect.top - currentTransform.y) / currentTransform.scale;

    if (dragNode.current && simulationRef.current) {
      const node = simulationRef.current.nodeMap.get(dragNode.current);
      if (node) {
        node.x = mx;
        node.y = my;
        node.vx = 0;
        node.vy = 0;
      }
      return;
    }

    // Pan
    if (isDragging.current && !dragNode.current) {
      setTransform((t) => ({
        ...t,
        x: t.x + e.clientX - lastMouse.current.x,
        y: t.y + e.clientY - lastMouse.current.y,
      }));
      lastMouse.current = { x: e.clientX, y: e.clientY };
      return;
    }

    // Hit test
    let found = null;
    for (const node of simulationRef.current.nodes) {
      const dx = mx - node.x;
      const dy = my - node.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 12) {
        found = node.id;
        break;
      }
    }
    setHoveredNode(found);
    canvas.style.cursor = found ? "pointer" : isDragging.current ? "grabbing" : "grab";
  }, [setHoveredNode, setTransform]);

  const handleMouseDown = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas || !simulationRef.current) return;

    const currentTransform = transformRef.current;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left - currentTransform.x) / currentTransform.scale;
    const my = (e.clientY - rect.top - currentTransform.y) / currentTransform.scale;

    for (const node of simulationRef.current.nodes) {
      const dx = mx - node.x;
      const dy = my - node.y;
      if (Math.sqrt(dx * dx + dy * dy) < 12) {
        dragNode.current = node.id;
        isDragging.current = true;
        return;
      }
    }

    // Pan
    isDragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseUp = useCallback((e) => {
    if (dragNode.current && !isDragging.current) {
      onNodeClick?.(dragNode.current);
    }
    dragNode.current = null;
    isDragging.current = false;
  }, [onNodeClick]);

  const handleClick = useCallback((e) => {
    if (!simulationRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const currentTransform = transformRef.current;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left - currentTransform.x) / currentTransform.scale;
    const my = (e.clientY - rect.top - currentTransform.y) / currentTransform.scale;

    for (const node of simulationRef.current.nodes) {
      const dx = mx - node.x;
      const dy = my - node.y;
      if (Math.sqrt(dx * dx + dy * dy) < 12) {
        onNodeClick?.(node.id);
        return;
      }
    }
  }, [onNodeClick]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.95 : 1.05;
    setTransform((t) => ({
      ...t,
      scale: Math.max(0.3, Math.min(3, t.scale * delta)),
    }));
  }, [setTransform]);

  // Empty state
  if (!filteredNodes.length) {
    return (
      <div className={`flex items-center justify-center h-full text-[var(--on-surface-variant)] opacity-40 ${className}`}>
        <div className="text-center">
          <Icon name="hub" className="text-5xl mb-3 block mx-auto opacity-40" />
          <p className="text-sm font-medium">
            {isLocal ? "Nenhuma conexão encontrada" : "Conecte notas com #tags, [[links]] ou notas internas"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative h-full w-full ${className}`}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block w-full h-full"
        aria-label="Grafo de conexões entre notas"
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onClick={handleClick}
        onWheel={handleWheel}
      />

      {/* Stats overlay */}
      <div className="absolute bottom-3 left-3 text-[10px] text-[var(--on-surface-variant)] opacity-50 select-none font-mono">
        {filteredNodes.length} notas · {filteredEdges.length} conexões
        <div>Tracejadas: tags em comum</div>
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-3 right-3 flex flex-col gap-1">
        <button
          onClick={() => setTransform((t) => ({ ...t, scale: Math.min(3, t.scale * 1.2) }))}
          className="w-7 h-7 rounded-md bg-[var(--surface-high)] flex items-center justify-center text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] transition-colors text-sm"
          title="Zoom in"
        >
          <Icon name="add" className="text-base" />
        </button>
        <button
          onClick={() => setTransform((t) => ({ ...t, scale: Math.max(0.3, t.scale / 1.2) }))}
          className="w-7 h-7 rounded-md bg-[var(--surface-high)] flex items-center justify-center text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] transition-colors text-sm"
          title="Zoom out"
        >
          <Icon name="remove" className="text-base" />
        </button>
        <button
          onClick={() => setTransform({ x: 0, y: 0, scale: 1 })}
          className="w-7 h-7 rounded-md bg-[var(--surface-high)] flex items-center justify-center text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] transition-colors text-sm"
          title="Resetar zoom"
        >
          <Icon name="fit_screen" className="text-base" />
        </button>
      </div>

      {/* Hovered node tooltip */}
      <AnimatePresence>
        {hoveredNode && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="absolute top-3 left-3 bg-[var(--surface-high)] rounded-lg px-3 py-2 text-xs shadow-lg border border-[var(--outline-variant)] max-w-[200px]"
          >
            <p className="font-semibold text-[var(--on-surface)] truncate">
              {filteredNodes.find((n) => n.id === hoveredNode)?.title || "Sem título"}
            </p>
            <p className="text-[var(--on-surface-variant)] mt-0.5">
              {filteredEdges.filter((e) => e.source === hoveredNode || e.target === hoveredNode).length} conexões
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
