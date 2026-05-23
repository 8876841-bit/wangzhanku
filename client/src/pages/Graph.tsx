import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { getCategoryIcon, getCategoryLabel } from "@/lib/noteUtils";

// Simple force-directed graph using canvas
interface Node {
  id: number;
  title: string;
  category: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

interface Edge {
  source: number;
  target: number;
  relationType: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  idea: "#f59e0b",
  question: "#3b82f6",
  person: "#10b981",
  skill: "#8b5cf6",
  todo: "#f97316",
  experience: "#22c55e",
  quote: "#06b6d4",
  other: "#94a3b8",
};

export default function Graph() {
  const { isAuthenticated } = useAuth({ redirectOnUnauthenticated: true });
  const [, navigate] = useLocation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const selectedNodeRef = useRef<Node | null>(null);
  const isDraggingRef = useRef(false);
  const dragNodeRef = useRef<Node | null>(null);

  const { data: graphData } = trpc.notes.getGraph.useQuery(undefined, { enabled: isAuthenticated });

  useEffect(() => {
    if (!graphData || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width;
    const H = canvas.height;

    // Initialize nodes with random positions
    nodesRef.current = graphData.nodes.map((n) => ({
      id: n.id,
      title: n.title || "未命名",
      category: n.category,
      x: Math.random() * (W - 100) + 50,
      y: Math.random() * (H - 100) + 50,
      vx: 0,
      vy: 0,
      radius: 24,
    }));

    edgesRef.current = graphData.edges.map((e) => ({
      source: e.sourceNoteId,
      target: e.targetNoteId,
      relationType: e.relationType || "related",
    }));

    const getNode = (id: number) => nodesRef.current.find((n) => n.id === id);

    function simulate() {
      const nodes = nodesRef.current;
      const edges = edgesRef.current;

      // Repulsion between nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = 2000 / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          nodes[i].vx -= fx;
          nodes[i].vy -= fy;
          nodes[j].vx += fx;
          nodes[j].vy += fy;
        }
      }

      // Attraction along edges
      for (const edge of edges) {
        const s = getNode(edge.source);
        const t = getNode(edge.target);
        if (!s || !t) continue;
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const targetDist = 120;
        const force = (dist - targetDist) * 0.03;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        s.vx += fx;
        s.vy += fy;
        t.vx -= fx;
        t.vy -= fy;
      }

      // Center gravity
      for (const node of nodes) {
        node.vx += (W / 2 - node.x) * 0.002;
        node.vy += (H / 2 - node.y) * 0.002;
      }

      // Apply velocity with damping
      for (const node of nodes) {
        if (dragNodeRef.current?.id === node.id) continue;
        node.vx *= 0.85;
        node.vy *= 0.85;
        node.x += node.vx;
        node.y += node.vy;
        node.x = Math.max(node.radius, Math.min(W - node.radius, node.x));
        node.y = Math.max(node.radius, Math.min(H - node.radius, node.y));
      }
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);

      // Draw edges
      for (const edge of edgesRef.current) {
        const s = getNode(edge.source);
        const t = getNode(edge.target);
        if (!s || !t) continue;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.strokeStyle = "rgba(148, 163, 184, 0.4)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Draw nodes
      for (const node of nodesRef.current) {
        const color = CATEGORY_COLORS[node.category] || "#94a3b8";
        const isSelected = selectedNodeRef.current?.id === node.id;

        // Shadow
        ctx.shadowColor = color;
        ctx.shadowBlur = isSelected ? 12 : 4;

        // Circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? color : color + "cc";
        ctx.fill();
        ctx.strokeStyle = isSelected ? "white" : color;
        ctx.lineWidth = isSelected ? 2.5 : 1.5;
        ctx.stroke();

        ctx.shadowBlur = 0;

        // Icon
        ctx.font = "14px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "white";
        ctx.fillText(getCategoryIcon(node.category), node.x, node.y);

        // Label
        ctx.font = "10px -apple-system, sans-serif";
        ctx.fillStyle = "#334155";
        ctx.textBaseline = "top";
        const label = node.title.length > 8 ? node.title.slice(0, 8) + "…" : node.title;
        ctx.fillText(label, node.x, node.y + node.radius + 4);
      }
    }

    function loop() {
      simulate();
      draw();
      animRef.current = requestAnimationFrame(loop);
    }

    animRef.current = requestAnimationFrame(loop);

    // Mouse/touch events
    function getNodeAt(x: number, y: number): Node | null {
      for (const node of nodesRef.current) {
        const dx = x - node.x;
        const dy = y - node.y;
        if (Math.sqrt(dx * dx + dy * dy) <= node.radius + 5) return node;
      }
      return null;
    }

    function getCanvasPos(e: MouseEvent | TouchEvent): { x: number; y: number } {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      if ("touches" in e) {
        return {
          x: (e.touches[0].clientX - rect.left) * scaleX,
          y: (e.touches[0].clientY - rect.top) * scaleY,
        };
      }
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    }

    const onMouseDown = (e: MouseEvent) => {
      const { x, y } = getCanvasPos(e);
      const node = getNodeAt(x, y);
      if (node) {
        isDraggingRef.current = true;
        dragNodeRef.current = node;
        selectedNodeRef.current = node;
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !dragNodeRef.current) return;
      const { x, y } = getCanvasPos(e);
      dragNodeRef.current.x = x;
      dragNodeRef.current.y = y;
      dragNodeRef.current.vx = 0;
      dragNodeRef.current.vy = 0;
    };

    const onMouseUp = (e: MouseEvent) => {
      const { x, y } = getCanvasPos(e);
      if (!isDraggingRef.current) {
        const node = getNodeAt(x, y);
        if (node) navigate(`/note/${node.id}`);
      }
      isDraggingRef.current = false;
      dragNodeRef.current = null;
    };

    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseup", onMouseUp);

    return () => {
      cancelAnimationFrame(animRef.current);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseup", onMouseUp);
    };
  }, [graphData, navigate]);

  const nodeCount = graphData?.nodes.length || 0;
  const edgeCount = graphData?.edges.length || 0;

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-foreground">知识关联图</h1>
          <div className="text-xs text-muted-foreground">
            {nodeCount} 个节点 · {edgeCount} 条关联
          </div>
        </div>

        {nodeCount === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">🕸️</div>
            <p className="text-muted-foreground text-sm">还没有足够的笔记生成关联图</p>
            <p className="text-xs text-muted-foreground mt-1">至少需要 2 条笔记，AI 会自动发现关联</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-2xl border border-border overflow-hidden">
              <canvas
                ref={canvasRef}
                width={700}
                height={480}
                className="w-full"
                style={{ cursor: "grab" }}
              />
            </div>

            {/* Legend */}
            <div className="bg-white rounded-xl border border-border p-3">
              <p className="text-xs text-muted-foreground mb-2 font-medium">图例</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
                  <div key={cat} className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-xs text-muted-foreground">{getCategoryLabel(cat)}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">点击节点查看详情 · 拖拽移动节点</p>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
