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
  type: "server" | "database" | "queue" | "webhook" | "shield";
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
      r.push([front[0], back[4]]);
      r.push([front[4], back[0]]);
      return r;
    }
    case "server": {
      const r: [number,number,number][][] = [];
      const front: [number,number,number][] = [[-1,-1.5,0.5],[1,-1.5,0.5],[1,1.5,0.5],[-1,1.5,0.5]];
      const back: [number,number,number][] = [[-1,-1.5,-0.5],[1,-1.5,-0.5],[1,1.5,-0.5],[-1,1.5,-0.5]];
      for(let i=0; i<4; i++) {
        r.push([front[i], front[(i+1)%4]]);
        r.push([back[i], back[(i+1)%4]]);
        r.push([front[i], back[i]]);
      }
      for(let y of [-0.5, 0.5]) {
        r.push([[-1,y,0.5],[1,y,0.5]]);
        r.push([[-1,y,-0.5],[1,y,-0.5]]);
        r.push([[-1,y,0.5],[-1,y,-0.5]]);
        r.push([[1,y,0.5],[1,y,-0.5]]);
      }
      return r;
    }
    case "database": {
      const r: [number,number,number][][] = [];
      const segs = 12;
      const layers = [-1, 0, 1];
      const circles: [number,number,number][][] = [[], [], []];
      for(let i=0; i<segs; i++) {
        const a = (i/segs) * Math.PI * 2;
        const x = Math.cos(a) * 0.8;
        const z = Math.sin(a) * 0.8;
        layers.forEach((y, lIndex) => {
          circles[lIndex].push([x,y,z]);
        });
      }
      for(let lIndex=0; lIndex<3; lIndex++) {
        for(let i=0; i<segs; i++) {
          r.push([circles[lIndex][i], circles[lIndex][(i+1)%segs]]);
        }
      }
      for(let i=0; i<segs; i+=2) {
        r.push([circles[0][i], circles[2][i]]);
      }
      return r;
    }
    case "queue": {
      const r: [number,number,number][][] = [];
      for(let zOffset of [-0.6, 0, 0.6]) {
        const pts: [number,number,number][] = [
          [-0.8, -0.8, zOffset], [0.8, -0.8, zOffset],
          [0.8, 0.8, zOffset], [-0.8, 0.8, zOffset]
        ];
        for(let i=0; i<4; i++) {
          r.push([pts[i], pts[(i+1)%4]]);
        }
      }
      const edges: [number,number,number][] = [[-0.8,-0.8,0], [0.8,-0.8,0], [0.8,0.8,0], [-0.8,0.8,0]];
      for(const e of edges) {
        r.push([[e[0], e[1], -0.6], [e[0], e[1], 0.6]]);
      }
      return r;
    }
    case "webhook": {
      const r: [number,number,number][][] = [];
      r.push([[-0.8, -0.5, 0], [0.8, -0.5, 0]]);
      r.push([[0.8, -0.5, 0], [0.8, 0.5, 0]]);
      r.push([[0.8, 0.5, 0], [-0.8, 0.5, 0]]);
      r.push([[-0.8, 0.5, 0], [-0.8, -0.5, 0]]);
      r.push([[-0.8, 0.5, 0], [0, 0, 0]]);
      r.push([[0.8, 0.5, 0], [0, 0, 0]]);
      r.push([[0, -0.5, 0], [0, -1.2, 0]]);
      r.push([[0, -1.2, 0], [-0.3, -0.9, 0]]);
      r.push([[0, -1.2, 0], [0.3, -0.9, 0]]);
      const r3d: [number,number,number][][] = [];
      for(const [p1, p2] of r) {
        r3d.push([[p1[0], p1[1], 0.2], [p2[0], p2[1], 0.2]]);
        r3d.push([[p1[0], p1[1], -0.2], [p2[0], p2[1], -0.2]]);
        r3d.push([[p1[0], p1[1], 0.2], [p1[0], p1[1], -0.2]]);
      }
      return r3d;
    }
    default: return [];
  }
}

export default function ArchitectureScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let time = 0;

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

    // Fixed architecture shapes (Source -> Proxy -> Destination)
    const shapes: Shape[] = [
      {
        x: -400, y: 0, z: 100,
        rotX: 0.2, rotY: 0.4, rotZ: 0,
        vRotX: 0.002, vRotY: 0.005, vRotZ: 0.001,
        size: 100, type: "server",
        color: "rgba(255, 255, 255, 0.4)",
        glow: "rgba(255, 255, 255, 0.1)",
        floatOffset: 0, floatSpeed: 0.8,
      },
      {
        x: 0, y: 0, z: 100,
        rotX: 0.1, rotY: -0.2, rotZ: 0.1,
        vRotX: 0.003, vRotY: 0.002, vRotZ: 0.004,
        size: 130, type: "shield",
        color: "rgba(255, 255, 255, 0.5)",
        glow: "rgba(255, 255, 255, 0.15)",
        floatOffset: 1.5, floatSpeed: 0.6,
      },
      {
        x: 400, y: 0, z: 100,
        rotX: 0.3, rotY: -0.5, rotZ: 0,
        vRotX: 0.004, vRotY: -0.003, vRotZ: 0.002,
        size: 100, type: "database",
        color: "rgba(255, 255, 255, 0.4)",
        glow: "rgba(255, 255, 255, 0.1)",
        floatOffset: 3.0, floatSpeed: 0.7,
      },
    ];

    const edgesCache: Record<string, [number,number,number][][]> = {};
    for (const t of ["server", "shield", "database", "queue", "webhook"]) {
      edgesCache[t] = getEdges(t);
    }

    // Data particles moving along lines
    const dataParticles: { progress: number; speed: number; link: number; size: number }[] = [];
    for (let i = 0; i < 20; i++) {
      dataParticles.push({
        progress: Math.random(),
        speed: 0.002 + Math.random() * 0.003,
        link: Math.random() > 0.5 ? 0 : 1, // 0 = Source->Proxy, 1 = Proxy->Dest
        size: 2 + Math.random() * 2,
      });
    }

    const W = () => canvas.width / (window.devicePixelRatio || 1);
    const H = () => canvas.height / (window.devicePixelRatio || 1);

    const draw = () => {
      time += 0.016;
      const w = W();
      const h = H();
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const fov = 600;

      // Draw connection lines
      ctx.save();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      
      const pSrc = projectPoint(-400, Math.sin(time * 0.8) * 12, 100, cx, cy, fov);
      const pProxy = projectPoint(0, Math.sin(time * 0.6 + 1.5) * 12, 100, cx, cy, fov);
      const pDest = projectPoint(400, Math.sin(time * 0.7 + 3.0) * 12, 100, cx, cy, fov);
      
      ctx.moveTo(pSrc.sx, pSrc.sy);
      ctx.lineTo(pProxy.sx, pProxy.sy);
      ctx.lineTo(pDest.sx, pDest.sy);
      ctx.stroke();
      ctx.restore();

      // Draw flowing particles
      for (const p of dataParticles) {
        p.progress += p.speed;
        if (p.progress > 1) {
          p.progress = 0;
          p.link = Math.random() > 0.5 ? 0 : 1;
        }

        let startX, startY, endX, endY;
        if (p.link === 0) {
          startX = -400; startY = Math.sin(time * 0.8) * 12;
          endX = 0; endY = Math.sin(time * 0.6 + 1.5) * 12;
        } else {
          startX = 0; startY = Math.sin(time * 0.6 + 1.5) * 12;
          endX = 400; endY = Math.sin(time * 0.7 + 3.0) * 12;
        }

        const currentX = startX + (endX - startX) * p.progress;
        const currentY = startY + (endY - startY) * p.progress;
        
        const pt = projectPoint(currentX, currentY, 100, cx, cy, fov);
        
        ctx.beginPath();
        ctx.arc(pt.sx, pt.sy, p.size * pt.scale, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${0.8 * Math.sin(p.progress * Math.PI)})`;
        ctx.fill();
        
        // trail
        ctx.beginPath();
        ctx.arc(pt.sx - (endX - startX)*0.01, pt.sy - (endY - startY)*0.01, p.size * pt.scale * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${0.3 * Math.sin(p.progress * Math.PI)})`;
        ctx.fill();
      }

      // Draw 3D shapes
      const sortedShapes = [...shapes].sort((a, b) => b.z - a.z);
      for (const shape of sortedShapes) {
        shape.rotX += shape.vRotX;
        shape.rotY += shape.vRotY;
        shape.rotZ += shape.vRotZ;

        const floatY = Math.sin(time * shape.floatSpeed + shape.floatOffset) * 12;
        const baseX = shape.x;
        const baseY = shape.y + floatY;
        const baseZ = shape.z;

        const edges = edgesCache[shape.type];

        const gp = projectPoint(baseX, baseY, baseZ, cx, cy, fov);
        const glowR = shape.size * 2 * gp.scale;
        const grad = ctx.createRadialGradient(gp.sx, gp.sy, 0, gp.sx, gp.sy, glowR);
        grad.addColorStop(0, shape.glow);
        grad.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(gp.sx, gp.sy, glowR, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.strokeStyle = shape.color;
        ctx.lineWidth = 1.5;
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

        const seen = new Set<string>();
        for (const edge of projected) {
          for (const [px, py] of [[edge.x1, edge.y1], [edge.x2, edge.y2]]) {
            const k = `${Math.round(px)},${Math.round(py)}`;
            if (!seen.has(k)) {
               seen.add(k);
               ctx.beginPath();
               ctx.arc(px, py, 2.5, 0, Math.PI * 2);
               ctx.fillStyle = shape.color;
               ctx.fill();
            }
          }
        }
      }

      animId = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  );
}
