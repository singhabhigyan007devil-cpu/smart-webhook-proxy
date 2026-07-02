"use client";
import React, { useRef, useEffect } from "react";

interface Bar {
  x: number;
  y: number;
  z: number;
  targetHeight: number;
  currentHeight: number;
  speed: number;
  baseZ: number;
}

function projectPoint(x: number, y: number, z: number, cx: number, cy: number, fov: number) {
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

export default function OutcomeScene() {
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

    // Create bars
    const bars: Bar[] = [];
    for (let i = 0; i < 9; i++) {
      for (let j = 0; j < 3; j++) {
        bars.push({
          x: -280 + i * 70,
          y: 0,
          z: -70 + j * 70,
          targetHeight: 20 + Math.random() * 80 + (i * 25), // Trending up towards the right
          currentHeight: 0,
          speed: 0.02 + Math.random() * 0.03,
          baseZ: -70 + j * 70
        });
      }
    }

    const draw = () => {
      time += 0.01;
      const w = canvas.width / (window.devicePixelRatio || 1);
      const h = canvas.height / (window.devicePixelRatio || 1);
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2 + 100;
      const fov = 800;

      const rotX = 0.5; // Look down slightly
      const rotY = Math.sin(time * 0.4) * 0.15 - 0.2; // Slowly pan

      ctx.lineWidth = 1;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // Draw grid
      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      for(let i = -350; i <= 350; i += 70) {
        // x lines
        let p1 = rotateY(i, 0, -150, rotY);
        p1 = rotateX(p1.x, p1.y, p1.z, rotX);
        let p2 = rotateY(i, 0, 150, rotY);
        p2 = rotateX(p2.x, p2.y, p2.z, rotX);
        
        const proj1 = projectPoint(p1.x, p1.y, p1.z + 400, cx, cy, fov);
        const proj2 = projectPoint(p2.x, p2.y, p2.z + 400, cx, cy, fov);
        
        ctx.beginPath();
        ctx.moveTo(proj1.sx, proj1.sy);
        ctx.lineTo(proj2.sx, proj2.sy);
        ctx.stroke();
      }
      for(let i = -140; i <= 140; i += 70) {
        // z lines
        let p3 = rotateY(-350, 0, i, rotY);
        p3 = rotateX(p3.x, p3.y, p3.z, rotX);
        let p4 = rotateY(350, 0, i, rotY);
        p4 = rotateX(p4.x, p4.y, p4.z, rotX);
        
        const proj3 = projectPoint(p3.x, p3.y, p3.z + 400, cx, cy, fov);
        const proj4 = projectPoint(p4.x, p4.y, p4.z + 400, cx, cy, fov);
        
        ctx.beginPath();
        ctx.moveTo(proj3.sx, proj3.sy);
        ctx.lineTo(proj4.sx, proj4.sy);
        ctx.stroke();
      }

      // Draw bars (sort by Z for proper rendering order)
      const transformedBars = bars.map(b => {
        // Animate height
        const target = b.targetHeight + Math.sin(time * 3 + b.x * 0.01) * 15;
        b.currentHeight += (target - b.currentHeight) * b.speed;
        
        const center = rotateY(b.x, 0, b.z, rotY);
        const rotatedCenter = rotateX(center.x, center.y, center.z, rotX);
        return { ...b, renderZ: rotatedCenter.z };
      }).sort((a, b) => b.renderZ - a.renderZ);

      for (const b of transformedBars) {
        const height = b.currentHeight;
        const w2 = 18; // half width
        
        // Define 8 corners of the bar
        const corners = [
          {x: b.x - w2, y: 0, z: b.z - w2},
          {x: b.x + w2, y: 0, z: b.z - w2},
          {x: b.x + w2, y: 0, z: b.z + w2},
          {x: b.x - w2, y: 0, z: b.z + w2},
          {x: b.x - w2, y: -height, z: b.z - w2},
          {x: b.x + w2, y: -height, z: b.z - w2},
          {x: b.x + w2, y: -height, z: b.z + w2},
          {x: b.x - w2, y: -height, z: b.z + w2},
        ];

        const projected = corners.map(c => {
          let p = rotateY(c.x, c.y, c.z, rotY);
          p = rotateX(p.x, p.y, p.z, rotX);
          return projectPoint(p.x, p.y, p.z + 400, cx, cy, fov);
        });

        // Draw edges
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.1 + (height / 250) * 0.3})`;
        
        // Bottom
        ctx.beginPath();
        ctx.moveTo(projected[0].sx, projected[0].sy);
        ctx.lineTo(projected[1].sx, projected[1].sy);
        ctx.lineTo(projected[2].sx, projected[2].sy);
        ctx.lineTo(projected[3].sx, projected[3].sy);
        ctx.closePath();
        ctx.stroke();

        // Top
        ctx.beginPath();
        ctx.moveTo(projected[4].sx, projected[4].sy);
        ctx.lineTo(projected[5].sx, projected[5].sy);
        ctx.lineTo(projected[6].sx, projected[6].sy);
        ctx.lineTo(projected[7].sx, projected[7].sy);
        ctx.closePath();
        ctx.stroke();

        // Fill Top for solid effect
        ctx.fillStyle = `rgba(255, 255, 255, ${0.05 + (height / 300) * 0.2})`;
        ctx.fill();

        // Verticals
        for(let i=0; i<4; i++) {
          ctx.beginPath();
          ctx.moveTo(projected[i].sx, projected[i].sy);
          ctx.lineTo(projected[i+4].sx, projected[i+4].sy);
          ctx.stroke();
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
