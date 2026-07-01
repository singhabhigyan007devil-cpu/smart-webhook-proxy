"use client";
import React, { useRef, useEffect } from "react";

interface Shape {
  x: number;
  y: number;
  z: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  vRotX: number;
  vRotY: number;
  vRotZ: number;
  size: number;
  type: "shield" | "hexgrid" | "circuit" | "node" | "pipe" | "bracket";
  color: string;
  glow: string;
  floatOffset: number;
  floatSpeed: number;
}

function projectPoint(
  x: number, y: number, z: number,
  cx: number, cy: number, fov: number
): { sx: number; sy: number; scale: number } {
  const perspective = fov / (fov + z);
  return {
    sx: x * perspective + cx,
    sy: y * perspective + cy,
    scale: perspective,
  };
}

function rotateX(x: number, y: number, z: number, a: number) {
  const cos = Math.cos(a), sin = Math.sin(a);
  return { x, y: y * cos - z * sin, z: y * sin + z * cos };
}
function rotateY(x: number, y: number, z: number, a: number) {
  const cos = Math.cos(a), sin = Math.sin(a);
  return { x: x * cos + z * sin, y, z: -x * sin + z * cos };
}
function rotateZ(x: number, y: number, z: number, a: number) {
  const cos = Math.cos(a), sin = Math.sin(a);
  return { x: x * cos - y * sin, y: x * sin + y * cos, z };
}

function getEdges(type: string): [number, number, number][][] {
  switch (type) {
    case "shield": {
      const pts: [number, number, number][] = [
        [0,-1.3,0],[-0.9,-0.7,0],[-1,0,0],[-0.7,0.7,0],
        [0,1.2,0],[0.7,0.7,0],[1,0,0],[0.9,-0.7,0],
      ];
      const edges: [number, number][] = [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,0]];
      const front = pts.map(([x,y]) => [x,y,0.3] as [number,number,number]);
      const back = pts.map(([x,y]) => [x,y,-0.3] as [number,number,number]);
      const r: [number,number,number][][] = [];
      edges.forEach(([a,b]) => { r.push([front[a],front[b]]); r.push([back[a],back[b]]); r.push([front[a],back[a]]); });
      // Add inner cross lines for depth
      r.push([front[0], back[4]]);
      r.push([front[4], back[0]]);
      return r;
    }
    case "hexgrid": {
      const r: [number,number,number][][] = [];
      const hexR = 0.4;
      const positions = [
        [0, 0], [-0.7, 0.4], [0.7, 0.4], [-0.7, -0.4], [0.7, -0.4], [0, 0.8], [0, -0.8],
      ];
      for (const [cx, cy] of positions) {
        for (let i = 0; i < 6; i++) {
          const a1 = (i / 6) * Math.PI * 2 + Math.PI / 6;
          const a2 = ((i + 1) / 6) * Math.PI * 2 + Math.PI / 6;
          r.push([
            [cx + Math.cos(a1) * hexR, cy + Math.sin(a1) * hexR, 0],
            [cx + Math.cos(a2) * hexR, cy + Math.sin(a2) * hexR, 0],
          ]);
        }
      }
      return r;
    }
    case "circuit": {
      // Circuit board trace pattern
      const r: [number,number,number][][] = [];
      const tracePoints: [number,number,number][] = [
        [-1, -0.5, 0], [-0.3, -0.5, 0], [-0.3, 0, 0], [0.3, 0, 0],
        [0.3, 0.5, 0], [1, 0.5, 0],
      ];
      for (let i = 0; i < tracePoints.length - 1; i++) {
        r.push([tracePoints[i], tracePoints[i + 1]]);
      }
      // Branch traces
      r.push([[-0.3, -0.5, 0], [-0.3, -1, 0]]);
      r.push([[0.3, 0, 0], [0.3, -0.6, 0]]);
      r.push([[-0.3, 0, 0], [-0.8, 0, 0]]);
      r.push([[0.3, 0.5, 0], [0.8, 0.5, 0]]);
      // Via pads
      const viaPoints: [number,number,number][] = [
        [-0.3, -0.5, 0], [0.3, 0, 0], [-0.3, 0, 0], [0.3, 0.5, 0],
      ];
      for (const vp of viaPoints) {
        for (let i = 0; i < 8; i++) {
          const a1 = (i / 8) * Math.PI * 2;
          const a2 = ((i + 1) / 8) * Math.PI * 2;
          r.push([
            [vp[0] + Math.cos(a1) * 0.08, vp[1] + Math.sin(a1) * 0.08, 0],
            [vp[0] + Math.cos(a2) * 0.08, vp[1] + Math.sin(a2) * 0.08, 0],
          ]);
        }
      }
      return r;
    }
    case "node": {
      // Network node with connections
      const r: [number,number,number][][] = [];
      const center: [number,number,number] = [0, 0, 0];
      const nodes: [number,number,number][] = [
        [0, -1, 0], [0.87, -0.5, 0], [0.87, 0.5, 0],
        [0, 1, 0], [-0.87, 0.5, 0], [-0.87, -0.5, 0],
      ];
      // Connect each node to center
      for (const n of nodes) {
        r.push([center, n]);
      }
      // Connect outer nodes
      for (let i = 0; i < nodes.length; i++) {
        r.push([nodes[i], nodes[(i + 1) % nodes.length]]);
      }
      return r;
    }
    case "pipe": {
      // Pipeline segment
      const r: [number,number,number][][] = [];
      const segs = 12;
      for (let i = 0; i < segs; i++) {
        const a1 = (i / segs) * Math.PI * 2;
        const a2 = ((i + 1) / segs) * Math.PI * 2;
        r.push([
          [Math.cos(a1) * 0.5, Math.sin(a1) * 0.5, -0.8],
          [Math.cos(a2) * 0.5, Math.sin(a2) * 0.5, -0.8],
        ]);
        r.push([
          [Math.cos(a1) * 0.5, Math.sin(a1) * 0.5, 0.8],
          [Math.cos(a2) * 0.5, Math.sin(a2) * 0.5, 0.8],
        ]);
        if (i % 3 === 0) {
          r.push([
            [Math.cos(a1) * 0.5, Math.sin(a1) * 0.5, -0.8],
            [Math.cos(a1) * 0.5, Math.sin(a1) * 0.5, 0.8],
          ]);
        }
      }
      return r;
    }
    case "bracket": {
      // Code bracket shape
      const r: [number,number,number][][] = [];
      r.push([[-0.6, -1, 0], [-0.8, -0.7, 0]]);
      r.push([[-0.8, -0.7, 0], [-0.8, 0.7, 0]]);
      r.push([[-0.8, 0.7, 0], [-0.6, 1, 0]]);
      r.push([[0.6, -1, 0], [0.8, -0.7, 0]]);
      r.push([[0.8, -0.7, 0], [0.8, 0.7, 0]]);
      r.push([[0.8, 0.7, 0], [0.6, 1, 0]]);
      // Inner dots
      r.push([[-0.3, 0, 0], [0.3, 0, 0]]);
      return r;
    }
    default: return [];
  }
}

export default function HeroScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let time = 0;
    let mouseX = 0.5;
    let mouseY = 0.5;

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = rect.width + "px";
        canvas.style.height = rect.height + "px";
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const handleMouse = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = (e.clientX - rect.left) / rect.width;
      mouseY = (e.clientY - rect.top) / rect.height;
    };
    window.addEventListener("mousemove", handleMouse);

    // Engineering-themed shapes
    const shapes: Shape[] = [
      {
        x: 0, y: -25, z: 0,
        rotX: 0, rotY: 0, rotZ: 0,
        vRotX: 0.004, vRotY: 0.007, vRotZ: 0.001,
        size: 120, type: "shield",
        color: "rgba(255, 255, 255, 0.5)",
        glow: "rgba(255, 255, 255, 0.12)",
        floatOffset: 0, floatSpeed: 0.5,
      },
      {
        x: -260, y: 120, z: 50,
        rotX: 0.3, rotY: 0.5, rotZ: 0,
        vRotX: 0.005, vRotY: 0.009, vRotZ: 0.003,
        size: 75, type: "hexgrid",
        color: "rgba(100, 180, 255, 0.35)",
        glow: "rgba(100, 180, 255, 0.1)",
        floatOffset: 1.5, floatSpeed: 0.7,
      },
      {
        x: 280, y: 90, z: 40,
        rotX: 0, rotY: 0.2, rotZ: 0.4,
        vRotX: 0.007, vRotY: 0.005, vRotZ: 0.006,
        size: 65, type: "circuit",
        color: "rgba(60, 200, 120, 0.35)",
        glow: "rgba(60, 200, 120, 0.1)",
        floatOffset: 3.0, floatSpeed: 0.65,
      },
      {
        x: -150, y: -180, z: 60,
        rotX: 1.2, rotY: 0, rotZ: 0,
        vRotX: 0.003, vRotY: 0.012, vRotZ: 0,
        size: 80, type: "node",
        color: "rgba(255, 180, 50, 0.3)",
        glow: "rgba(255, 180, 50, 0.09)",
        floatOffset: 2.0, floatSpeed: 0.6,
      },
      {
        x: 240, y: -160, z: 55,
        rotX: 0.5, rotY: 0.8, rotZ: 0.2,
        vRotX: 0.006, vRotY: 0.004, vRotZ: 0.007,
        size: 55, type: "pipe",
        color: "rgba(160, 120, 255, 0.3)",
        glow: "rgba(160, 120, 255, 0.09)",
        floatOffset: 4.0, floatSpeed: 0.75,
      },
      {
        x: -280, y: -80, z: 80,
        rotX: 0.2, rotY: 0.3, rotZ: 0.1,
        vRotX: 0.008, vRotY: 0.006, vRotZ: 0.004,
        size: 50, type: "bracket",
        color: "rgba(220, 80, 80, 0.3)",
        glow: "rgba(220, 80, 80, 0.09)",
        floatOffset: 5.0, floatSpeed: 0.55,
      },
      {
        x: 80, y: 200, z: 70,
        rotX: 0, rotY: 0.4, rotZ: 0.6,
        vRotX: 0.005, vRotY: 0.01, vRotZ: 0.002,
        size: 45, type: "hexgrid",
        color: "rgba(100, 200, 180, 0.25)",
        glow: "rgba(100, 200, 180, 0.06)",
        floatOffset: 1.0, floatSpeed: 0.85,
      },
      {
        x: -70, y: 220, z: 90,
        rotX: 0.8, rotY: 0.2, rotZ: 0,
        vRotX: 0.004, vRotY: 0.007, vRotZ: 0.005,
        size: 65, type: "circuit",
        color: "rgba(180, 160, 220, 0.2)",
        glow: "rgba(180, 160, 220, 0.05)",
        floatOffset: 3.5, floatSpeed: 0.5,
      },
    ];

    const edgesCache: Record<string, [number,number,number][][]> = {};
    for (const t of ["shield","hexgrid","circuit","node","pipe","bracket"]) {
      edgesCache[t] = getEdges(t);
    }

    // Data flow particles
    const dataParticles: { x: number; y: number; z: number; speed: number; size: number; isRetry: boolean }[] = [];
    for (let i = 0; i < 70; i++) {
      dataParticles.push({
        x: (Math.random() - 0.5) * 800,
        y: (Math.random() - 0.5) * 800,
        z: Math.random() * 500,
        speed: 0.15 + Math.random() * 0.35,
        size: 1.2 + Math.random() * 2.5,
        isRetry: i % 8 === 0,
      });
    }

    // Hexagonal grid background lines
    const drawHexGrid = (cx: number, cy: number) => {
      const hexSize = 70;
      const cols = Math.ceil(W() / (hexSize * 1.5)) + 2;
      const rows = Math.ceil(H() / (hexSize * Math.sqrt(3))) + 2;
      const offsetX = (time * 5) % (hexSize * 1.5);
      const offsetY = (time * 3) % (hexSize * Math.sqrt(3));

      ctx.save();
      ctx.strokeStyle = "rgba(100, 180, 255, 0.035)";
      ctx.lineWidth = 0.9;

      for (let row = -1; row < rows; row++) {
        for (let col = -1; col < cols; col++) {
          const x = col * hexSize * 1.5 + offsetX;
          const y = row * hexSize * Math.sqrt(3) + (col % 2 ? hexSize * Math.sqrt(3) / 2 : 0) + offsetY;

          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i + Math.PI / 6;
            const hx = x + hexSize * 0.5 * Math.cos(angle);
            const hy = y + hexSize * 0.5 * Math.sin(angle);
            if (i === 0) ctx.moveTo(hx, hy);
            else ctx.lineTo(hx, hy);
          }
          ctx.closePath();
          ctx.stroke();
        }
      }
      ctx.restore();
    };

    // Circuit board trace overlay
    const drawCircuitTraces = (cx: number, cy: number) => {
      ctx.save();
      ctx.strokeStyle = "rgba(60, 200, 120, 0.03)";
      ctx.lineWidth = 1.5;

      const traceY = H() * 0.85;
      const traceSpacing = 90;

      for (let i = 0; i < 12; i++) {
        const baseX = i * traceSpacing - 80;
        const jitter = Math.sin(time * 0.5 + i) * 10;

        ctx.beginPath();
        ctx.moveTo(baseX, traceY);
        ctx.lineTo(baseX + 30, traceY);
        ctx.lineTo(baseX + 30 + jitter, traceY - 25);
        ctx.lineTo(baseX + 75 + jitter, traceY - 25);
        ctx.lineTo(baseX + 75 + jitter, traceY + 18);
        ctx.lineTo(baseX + 120 + jitter, traceY + 18);
        ctx.stroke();

        // Via pad
        ctx.beginPath();
        ctx.arc(baseX + 30, traceY, 6, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    };

    const W = () => canvas.width / (window.devicePixelRatio || 1);
    const H = () => canvas.height / (window.devicePixelRatio || 1);

    const draw = () => {
      time += 0.016;
      const w = W();
      const h = H();
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const fov = 500;

      // Mouse parallax
      const parallaxX = (mouseX - 0.5) * 25;
      const parallaxY = (mouseY - 0.5) * 18;

      // Background layers
      drawHexGrid(cx, cy);
      drawCircuitTraces(cx, cy);

      // Perspective grid floor
      ctx.save();
      const gridY = h * 0.72;
      const vanishX = cx + parallaxX;
      const vanishY = h * 0.28 + parallaxY;
      const gridLines = 16;
      const gridSpread = w * 1.1;

      for (let i = 0; i <= gridLines; i++) {
        const t = i / gridLines;
        const yPos = vanishY + (gridY - vanishY) * Math.pow(t, 0.65);
        const alpha = t * 0.05;
        ctx.beginPath();
        ctx.moveTo(0, yPos);
        ctx.lineTo(w, yPos);
        ctx.strokeStyle = `rgba(100, 180, 255, ${alpha})`;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      for (let i = -10; i <= 10; i++) {
        const baseX = cx + (i / 10) * gridSpread;
        const alpha = 0.04 * (1 - Math.abs(i) / 12);
        ctx.beginPath();
        ctx.moveTo(vanishX, vanishY);
        ctx.lineTo(baseX, gridY + 30);
        ctx.strokeStyle = `rgba(100, 180, 255, ${Math.max(0, alpha)})`;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
      ctx.restore();

      // Data flow particles
      for (const p of dataParticles) {
        p.y -= p.speed;
        if (p.y < -300) p.y = 300;
        const pp = projectPoint(p.x + parallaxX * 0.5, p.y + parallaxY * 0.5, p.z, cx, cy, fov);
        const alpha = pp.scale * 0.35;
        ctx.beginPath();
        ctx.arc(pp.sx, pp.sy, p.size * pp.scale, 0, Math.PI * 2);
        ctx.fillStyle = p.isRetry
          ? `rgba(255, 180, 50, ${alpha * 0.7})`
          : `rgba(100, 180, 255, ${alpha})`;
        ctx.fill();
      }

      // Draw 3D shapes
      for (const shape of shapes) {
        shape.rotX += shape.vRotX;
        shape.rotY += shape.vRotY;
        shape.rotZ += shape.vRotZ;

        const floatY = Math.sin(time * shape.floatSpeed + shape.floatOffset) * 12;
        const baseX = shape.x + parallaxX * (1 - shape.z / 400);
        const baseY = shape.y + floatY + parallaxY * (1 - shape.z / 400);
        const baseZ = shape.z;

        const edges = edgesCache[shape.type];

        // Glow
        const gp = projectPoint(baseX, baseY, baseZ, cx, cy, fov);
        const glowR = shape.size * 4.5 * gp.scale;
        const grad = ctx.createRadialGradient(gp.sx, gp.sy, 0, gp.sx, gp.sy, glowR);
        grad.addColorStop(0, shape.glow);
        grad.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(gp.sx, gp.sy, glowR, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // Project and draw edges
        ctx.strokeStyle = shape.color;
        ctx.lineWidth = 1.8;
        ctx.lineCap = "round";

        const projected: { x1: number; y1: number; x2: number; y2: number }[] = [];
        for (const [start, end] of edges) {
          let s = { x: start[0] * shape.size, y: start[1] * shape.size, z: start[2] * shape.size };
          let e2 = { x: end[0] * shape.size, y: end[1] * shape.size, z: end[2] * shape.size };
          s = rotateX(s.x, s.y, s.z, shape.rotX);
          s = rotateY(s.x, s.y, s.z, shape.rotY);
          s = rotateZ(s.x, s.y, s.z, shape.rotZ);
          e2 = rotateX(e2.x, e2.y, e2.z, shape.rotX);
          e2 = rotateY(e2.x, e2.y, e2.z, shape.rotY);
          e2 = rotateZ(e2.x, e2.y, e2.z, shape.rotZ);
          const ps = projectPoint(s.x + baseX, s.y + baseY, s.z + baseZ, cx, cy, fov);
          const pe = projectPoint(e2.x + baseX, e2.y + baseY, e2.z + baseZ, cx, cy, fov);
          projected.push({ x1: ps.sx, y1: ps.sy, x2: pe.sx, y2: pe.sy });
        }

        for (const edge of projected) {
          ctx.beginPath();
          ctx.moveTo(edge.x1, edge.y1);
          ctx.lineTo(edge.x2, edge.y2);
          ctx.stroke();
        }

        // Vertex dots
        const seen = new Set<string>();
        for (const edge of projected) {
          for (const [px, py] of [[edge.x1, edge.y1], [edge.x2, edge.y2]]) {
            const k = `${Math.round(px)},${Math.round(py)}`;
            if (!seen.has(k)) {
              seen.add(k);
              ctx.beginPath();
              ctx.arc(px, py, 3, 0, Math.PI * 2);
              ctx.fillStyle = shape.color;
              ctx.fill();
            }
          }
        }
      }

      // Scan line
      const scanY = (time * 45) % h;
      const scanGrad = ctx.createLinearGradient(0, scanY - 70, 0, scanY + 70);
      scanGrad.addColorStop(0, "transparent");
      scanGrad.addColorStop(0.5, "rgba(100, 180, 255, 0.02)");
      scanGrad.addColorStop(1, "transparent");
      ctx.fillStyle = scanGrad;
      ctx.fillRect(0, scanY - 70, w, 140);

      animId = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouse);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
    />
  );
}
