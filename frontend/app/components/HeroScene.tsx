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
  type: "cube" | "octahedron" | "shield" | "ring" | "pyramid" | "diamond";
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
    case "cube": {
      const v: [number, number, number][] = [
        [-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],
        [-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],
      ];
      return [[v[0],v[1]],[v[1],v[2]],[v[2],v[3]],[v[3],v[0]],
              [v[4],v[5]],[v[5],v[6]],[v[6],v[7]],[v[7],v[4]],
              [v[0],v[4]],[v[1],v[5]],[v[2],v[6]],[v[3],v[7]]];
    }
    case "octahedron": {
      const v: [number, number, number][] = [
        [0,-1.2,0],[1,0,0],[0,0,1],[-1,0,0],[0,0,-1],[0,1.2,0],
      ];
      return [[v[0],v[1]],[v[0],v[2]],[v[0],v[3]],[v[0],v[4]],
              [v[5],v[1]],[v[5],v[2]],[v[5],v[3]],[v[5],v[4]],
              [v[1],v[2]],[v[2],v[3]],[v[3],v[4]],[v[4],v[1]]];
    }
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
      return r;
    }
    case "ring": {
      const segs = 20;
      const r: [number,number,number][][] = [];
      for (let i = 0; i < segs; i++) {
        const a1 = (i/segs)*Math.PI*2, a2 = ((i+1)/segs)*Math.PI*2;
        r.push([[Math.cos(a1),Math.sin(a1),0],[Math.cos(a2),Math.sin(a2),0]]);
      }
      return r;
    }
    case "pyramid": {
      const apex: [number,number,number] = [0,-1.2,0];
      const base: [number,number,number][] = [[-0.8,0.6,-0.8],[0.8,0.6,-0.8],[0.8,0.6,0.8],[-0.8,0.6,0.8]];
      return [
        [apex,base[0]],[apex,base[1]],[apex,base[2]],[apex,base[3]],
        [base[0],base[1]],[base[1],base[2]],[base[2],base[3]],[base[3],base[0]],
      ];
    }
    case "diamond": {
      const top: [number,number,number] = [0,-1.5,0];
      const bot: [number,number,number] = [0,1.5,0];
      const mid: [number,number,number][] = [[0.8,0,0],[0,0,0.8],[-0.8,0,0],[0,0,-0.8]];
      return [
        [top,mid[0]],[top,mid[1]],[top,mid[2]],[top,mid[3]],
        [bot,mid[0]],[bot,mid[1]],[bot,mid[2]],[bot,mid[3]],
        [mid[0],mid[1]],[mid[1],mid[2]],[mid[2],mid[3]],[mid[3],mid[0]],
      ];
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

    // Muted professional palette - whites, silvers, subtle cool tones
    const shapes: Shape[] = [
      {
        x: 0, y: -30, z: 0,
        rotX: 0, rotY: 0, rotZ: 0,
        vRotX: 0.006, vRotY: 0.009, vRotZ: 0.002,
        size: 60, type: "shield",
        color: "rgba(255, 255, 255, 0.55)",
        glow: "rgba(255, 255, 255, 0.08)",
        floatOffset: 0, floatSpeed: 0.6,
      },
      {
        x: -140, y: 90, z: 40,
        rotX: 0.3, rotY: 0.5, rotZ: 0,
        vRotX: 0.007, vRotY: 0.011, vRotZ: 0.004,
        size: 32, type: "cube",
        color: "rgba(180, 200, 220, 0.45)",
        glow: "rgba(180, 200, 220, 0.06)",
        floatOffset: 1.5, floatSpeed: 0.9,
      },
      {
        x: 160, y: 70, z: 30,
        rotX: 0, rotY: 0.2, rotZ: 0.4,
        vRotX: 0.009, vRotY: 0.006, vRotZ: 0.008,
        size: 28, type: "octahedron",
        color: "rgba(200, 190, 230, 0.4)",
        glow: "rgba(200, 190, 230, 0.06)",
        floatOffset: 3.0, floatSpeed: 0.75,
      },
      {
        x: -80, y: -130, z: 70,
        rotX: 1.2, rotY: 0, rotZ: 0,
        vRotX: 0.004, vRotY: 0.015, vRotZ: 0,
        size: 42, type: "ring",
        color: "rgba(180, 220, 210, 0.35)",
        glow: "rgba(180, 220, 210, 0.05)",
        floatOffset: 2.0, floatSpeed: 0.65,
      },
      {
        x: 130, y: -110, z: 50,
        rotX: 0.5, rotY: 0.8, rotZ: 0.2,
        vRotX: 0.008, vRotY: 0.005, vRotZ: 0.009,
        size: 24, type: "cube",
        color: "rgba(210, 200, 190, 0.35)",
        glow: "rgba(210, 200, 190, 0.05)",
        floatOffset: 4.0, floatSpeed: 0.8,
      },
      {
        x: -160, y: -60, z: 90,
        rotX: 0.2, rotY: 0.3, rotZ: 0.1,
        vRotX: 0.01, vRotY: 0.007, vRotZ: 0.005,
        size: 22, type: "pyramid",
        color: "rgba(190, 210, 230, 0.35)",
        glow: "rgba(190, 210, 230, 0.05)",
        floatOffset: 5.0, floatSpeed: 0.7,
      },
      {
        x: 60, y: 140, z: 60,
        rotX: 0, rotY: 0.4, rotZ: 0.6,
        vRotX: 0.006, vRotY: 0.012, vRotZ: 0.003,
        size: 20, type: "diamond",
        color: "rgba(220, 215, 230, 0.3)",
        glow: "rgba(220, 215, 230, 0.04)",
        floatOffset: 1.0, floatSpeed: 1.0,
      },
      {
        x: -30, y: 160, z: 100,
        rotX: 0.8, rotY: 0.2, rotZ: 0,
        vRotX: 0.005, vRotY: 0.008, vRotZ: 0.006,
        size: 35, type: "ring",
        color: "rgba(200, 200, 215, 0.25)",
        glow: "rgba(200, 200, 215, 0.03)",
        floatOffset: 3.5, floatSpeed: 0.55,
      },
    ];

    const edgesCache: Record<string, [number,number,number][][]> = {};
    for (const t of ["cube","octahedron","shield","ring","pyramid","diamond"]) {
      edgesCache[t] = getEdges(t);
    }

    // Floating particles for atmosphere
    const particles: { x: number; y: number; z: number; speed: number; size: number }[] = [];
    for (let i = 0; i < 40; i++) {
      particles.push({
        x: (Math.random() - 0.5) * 600,
        y: (Math.random() - 0.5) * 600,
        z: Math.random() * 400,
        speed: 0.1 + Math.random() * 0.3,
        size: 0.5 + Math.random() * 1.5,
      });
    }

    const draw = () => {
      time += 0.016;
      const w = canvas.width / (window.devicePixelRatio || 1);
      const h = canvas.height / (window.devicePixelRatio || 1);
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const fov = 500;

      // Subtle mouse parallax offset
      const parallaxX = (mouseX - 0.5) * 20;
      const parallaxY = (mouseY - 0.5) * 15;

      // Draw perspective grid floor
      ctx.save();
      const gridY = h * 0.72;
      const vanishX = cx + parallaxX;
      const vanishY = h * 0.3 + parallaxY;
      const gridLines = 14;
      const gridSpread = w * 1.2;

      // Horizontal lines receding into distance
      for (let i = 0; i <= gridLines; i++) {
        const t = i / gridLines;
        const yPos = vanishY + (gridY - vanishY) * Math.pow(t, 0.7);
        const alpha = t * 0.06;
        ctx.beginPath();
        ctx.moveTo(0, yPos);
        ctx.lineTo(w, yPos);
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // Vertical lines converging to vanishing point
      for (let i = -8; i <= 8; i++) {
        const baseX = cx + (i / 8) * gridSpread;
        const alpha = 0.04 * (1 - Math.abs(i) / 10);
        ctx.beginPath();
        ctx.moveTo(vanishX, vanishY);
        ctx.lineTo(baseX, gridY + 40);
        ctx.strokeStyle = `rgba(255, 255, 255, ${Math.max(0, alpha)})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
      ctx.restore();

      // Draw floating particles
      for (const p of particles) {
        p.y -= p.speed;
        if (p.y < -300) p.y = 300;
        const pp = projectPoint(p.x + parallaxX * 0.5, p.y + parallaxY * 0.5, p.z, cx, cy, fov);
        const alpha = pp.scale * 0.3;
        ctx.beginPath();
        ctx.arc(pp.sx, pp.sy, p.size * pp.scale, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.fill();
      }

      // Draw 3D shapes
      for (const shape of shapes) {
        shape.rotX += shape.vRotX;
        shape.rotY += shape.vRotY;
        shape.rotZ += shape.vRotZ;

        const floatY = Math.sin(time * shape.floatSpeed + shape.floatOffset) * 14;
        const baseX = shape.x + parallaxX * (1 - shape.z / 400);
        const baseY = shape.y + floatY + parallaxY * (1 - shape.z / 400);
        const baseZ = shape.z;

        const edges = edgesCache[shape.type];

        // Draw glow
        const gp = projectPoint(baseX, baseY, baseZ, cx, cy, fov);
        const glowR = shape.size * 3 * gp.scale;
        const grad = ctx.createRadialGradient(gp.sx, gp.sy, 0, gp.sx, gp.sy, glowR);
        grad.addColorStop(0, shape.glow);
        grad.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(gp.sx, gp.sy, glowR, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // Project and draw edges
        ctx.strokeStyle = shape.color;
        ctx.lineWidth = 1.2;
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
              ctx.arc(px, py, 1.8, 0, Math.PI * 2);
              ctx.fillStyle = shape.color;
              ctx.fill();
            }
          }
        }
      }

      // Subtle scan line effect
      const scanY = (time * 40) % h;
      const scanGrad = ctx.createLinearGradient(0, scanY - 30, 0, scanY + 30);
      scanGrad.addColorStop(0, "transparent");
      scanGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.015)");
      scanGrad.addColorStop(1, "transparent");
      ctx.fillStyle = scanGrad;
      ctx.fillRect(0, scanY - 30, w, 60);

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
