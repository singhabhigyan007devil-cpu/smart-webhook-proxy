"use client";
import React, { useRef, useEffect } from "react";

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
}

export default function TechBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let particles: Particle[] = [];
    const PARTICLE_COUNT = 90;
    const CONNECTION_DISTANCE = 160;
    const DEPTH = 600;
    let mouseX = -1000;
    let mouseY = -1000;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };
    window.addEventListener("mousemove", handleMouseMove);

    // Initialize particles in 3D space
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        z: Math.random() * DEPTH,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        vz: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 1.5 + 0.5,
      });
    }

    const project = (p: Particle) => {
      const perspective = DEPTH / (DEPTH + p.z);
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      return {
        sx: (p.x - cx) * perspective + cx,
        sy: (p.y - cy) * perspective + cy,
        scale: perspective,
      };
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Update positions
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.z += p.vz;

        // Wrap around edges
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
        if (p.z < 0) p.z = DEPTH;
        if (p.z > DEPTH) p.z = 0;

        // Subtle mouse repulsion
        const proj = project(p);
        const dx = proj.sx - mouseX;
        const dy = proj.sy - mouseY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          const force = (120 - dist) / 120 * 0.015;
          p.vx += dx * force;
          p.vy += dy * force;
        }

        // Dampen velocity
        p.vx *= 0.998;
        p.vy *= 0.998;
        p.vz *= 0.998;
      }

      // Sort back-to-front for depth
      const sorted = [...particles].sort((a, b) => b.z - a.z);

      // Draw connections
      for (let i = 0; i < sorted.length; i++) {
        const a = sorted[i];
        const pa = project(a);
        for (let j = i + 1; j < sorted.length; j++) {
          const b = sorted[j];
          const pb = project(b);
          const dx = pa.sx - pb.sx;
          const dy = pa.sy - pb.sy;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < CONNECTION_DISTANCE) {
            const alpha = (1 - d / CONNECTION_DISTANCE) * 0.15 * pa.scale * pb.scale;
            ctx.beginPath();
            ctx.moveTo(pa.sx, pa.sy);
            ctx.lineTo(pb.sx, pb.sy);
            ctx.strokeStyle = `rgba(100, 180, 255, ${alpha})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      // Draw particles
      for (const p of sorted) {
        const { sx, sy, scale } = project(p);
        const radius = p.size * scale;
        const alpha = scale * 0.7;

        // Outer glow
        const gradient = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius * 4);
        gradient.addColorStop(0, `rgba(100, 180, 255, ${alpha * 0.3})`);
        gradient.addColorStop(1, "rgba(100, 180, 255, 0)");
        ctx.beginPath();
        ctx.arc(sx, sy, radius * 4, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Core dot
        ctx.beginPath();
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(160, 210, 255, ${alpha})`;
        ctx.fill();
      }

      // Subtle grid overlay for depth
      ctx.strokeStyle = "rgba(100, 180, 255, 0.015)";
      ctx.lineWidth = 0.5;
      const gridSize = 80;
      for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 pointer-events-none"
      style={{ opacity: 0.6 }}
    />
  );
}
