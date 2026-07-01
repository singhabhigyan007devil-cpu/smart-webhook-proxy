"use client";
import React, { useRef, useEffect } from "react";

interface Dot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
}

export default function MinimalBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let time = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const W = () => window.innerWidth;
    const H = () => window.innerHeight;

    // Dot grid
    const dots: Dot[] = [];
    const GRID_SPACING = 50;
    const cols = Math.ceil(W() / GRID_SPACING) + 2;
    const rows = Math.ceil(H() / GRID_SPACING) + 2;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        dots.push({
          x: c * GRID_SPACING + (Math.random() - 0.5) * 6,
          y: r * GRID_SPACING + (Math.random() - 0.5) * 6,
          vx: (Math.random() - 0.5) * 0.2,
          vy: (Math.random() - 0.5) * 0.2,
          size: 1.5 + Math.random() * 1,
        });
      }
    }

    const draw = () => {
      time += 0.016;
      ctx.clearRect(0, 0, W(), H());

      // Draw connections between nearby dots
      ctx.save();
      for (let i = 0; i < dots.length; i++) {
        const a = dots[i];
        for (let j = i + 1; j < dots.length; j++) {
          const b = dots[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100) {
            const alpha = (1 - dist / 100) * 0.15;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(100, 160, 255, ${alpha})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }
      ctx.restore();

      // Draw dots
      for (const dot of dots) {
        dot.x += dot.vx;
        dot.y += dot.vy;

        // Subtle pulse
        const pulse = Math.sin(time * 1.5 + dot.x * 0.01 + dot.y * 0.01) * 0.3 + 0.7;

        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(100, 180, 255, ${0.3 * pulse})`;
        ctx.fill();
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
      className="fixed inset-0 z-0 pointer-events-none"
      style={{ opacity: 0.75 }}
    />
  );
}
