"use client";
import React, { useRef, useEffect } from "react";

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface ServerNode {
  id: string;
  pos: Vec3;
  size: number;
  state: "healthy" | "degraded" | "failed" | "recovering";
  stateTimer: number;
  pulsePhase: number;
  label: string;
}

interface WebhookPacket {
  pos: Vec3;
  vel: Vec3;
  trail: Vec3[];
  state: "normal" | "retrying" | "dropped" | "queued";
  retryCount: number;
  maxRetries: number;
  age: number;
  size: number;
}

interface Connection {
  from: string;
  to: string;
  health: number;
  particles: { t: number; speed: number }[];
}

interface RetryWave {
  origin: Vec3;
  radius: number;
  maxRadius: number;
  alpha: number;
}

interface GridFloor {
  y: number;
  depth: number;
}

export default function TechBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let time = 0;
    let mouseX = -9999;
    let mouseY = -9999;

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

    const handleMouse = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };
    window.addEventListener("mousemove", handleMouse);

    // --- 3D Projection ---
    const FOV = 600;
    const project = (p: Vec3, cx: number, cy: number) => {
      const scale = FOV / (FOV + p.z);
      return { sx: p.x * scale + cx, sy: p.y * scale + cy, scale };
    };

    // --- Isometric helpers ---
    const toIso = (x: number, y: number, z: number): Vec3 => ({
      x: (x - z) * 0.7,
      y: (x + z) * 0.35 - y,
      z: 0,
    });

    // --- Server Nodes (isometric positions) ---
    const W = () => window.innerWidth;
    const H = () => window.innerHeight;

    const servers: ServerNode[] = [
      { id: "source", pos: { x: -400, y: 0, z: 80 }, size: 60, state: "healthy", stateTimer: 0, pulsePhase: 0, label: "SOURCE" },
      { id: "proxy", pos: { x: -120, y: 30, z: 60 }, size: 68, state: "healthy", stateTimer: 0, pulsePhase: 1.2, label: "PROXY" },
      { id: "queue", pos: { x: 120, y: 15, z: 40 }, size: 56, state: "healthy", stateTimer: 0, pulsePhase: 2.4, label: "QUEUE" },
      { id: "worker", pos: { x: 300, y: 32, z: 50 }, size: 64, state: "healthy", stateTimer: 0, pulsePhase: 3.6, label: "WORKER" },
      { id: "dest", pos: { x: 480, y: 0, z: 70 }, size: 60, state: "healthy", stateTimer: 0, pulsePhase: 4.8, label: "DEST" },
    ];

    // --- Connections between servers ---
    const connections: Connection[] = [
      { from: "source", to: "proxy", health: 1, particles: [] },
      { from: "proxy", to: "queue", health: 1, particles: [] },
      { from: "queue", to: "worker", health: 1, particles: [] },
      { from: "worker", to: "dest", health: 1, particles: [] },
    ];

    // Initialize connection particles
    for (const conn of connections) {
      for (let i = 0; i < 4; i++) {
        conn.particles.push({ t: Math.random(), speed: 0.003 + Math.random() * 0.004 });
      }
    }

    // --- Webhook Packets ---
    const packets: WebhookPacket[] = [];
    let packetIdCounter = 0;

    const spawnPacket = () => {
      const src = servers[0];
      packets.push({
        pos: { ...src.pos },
        vel: { x: 0.8 + Math.random() * 0.3, y: 0, z: 0 },
        trail: [],
        state: "normal",
        retryCount: 0,
        maxRetries: 5,
        age: 0,
        size: 12 + Math.random() * 5,
      });
    };

    // --- Retry Waves (visual ripple when a retry happens) ---
    const retryWaves: RetryWave[] = [];

    // --- Failure simulation state ---
    let failureCycleTimer = 0;
    let failureCyclePhase = 0; // 0=healthy, 1=dest fails, 2=retries, 3=recovery
    const FAILURE_CYCLE_DURATION = 12; // seconds

    // --- Draw functions ---
    const drawGridFloor = (cx: number, cy: number) => {
      const gridY = H() * 0.68;
      const gridSize = 50;
      const gridCols = 24;
      const gridRows = 12;
      const vanishX = cx;
      const vanishY = H() * 0.25;

      ctx.save();
      // Horizontal lines
      for (let i = 0; i <= gridRows; i++) {
        const t = i / gridRows;
        const yPos = vanishY + (gridY - vanishY) * Math.pow(t, 0.6);
        const alpha = t * 0.04;
        ctx.beginPath();
        ctx.moveTo(0, yPos);
        ctx.lineTo(W(), yPos);
        ctx.strokeStyle = `rgba(100, 160, 255, ${alpha})`;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
      // Vertical converging lines
      for (let i = -gridCols / 2; i <= gridCols / 2; i++) {
        const baseX = cx + (i / (gridCols / 2)) * W() * 0.7;
        const alpha = 0.03 * (1 - Math.abs(i) / (gridCols / 2 + 1));
        ctx.beginPath();
        ctx.moveTo(vanishX, vanishY);
        ctx.lineTo(baseX, gridY + 30);
        ctx.strokeStyle = `rgba(100, 160, 255, ${Math.max(0, alpha)})`;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
      ctx.restore();
    };

    const drawIsometricServer = (server: ServerNode, cx: number, cy: number) => {
      const iso = toIso(server.pos.x, server.pos.y, server.pos.z);
      const p = project({ x: iso.x, y: iso.y, z: 0 }, cx, cy);
      const s = server.size * p.scale;

      // Pulse
      server.pulsePhase += 0.02;
      const pulse = Math.sin(server.pulsePhase) * 0.15 + 1;

      // State colors
      let bodyColor = "rgba(60, 180, 120, 0.35)";
      let borderColor = "rgba(60, 180, 120, 0.6)";
      let glowColor = "rgba(60, 180, 120, 0.12)";
      let statusDot = "#3cb478";

      if (server.state === "degraded") {
        bodyColor = "rgba(220, 180, 50, 0.35)";
        borderColor = "rgba(220, 180, 50, 0.6)";
        glowColor = "rgba(220, 180, 50, 0.12)";
        statusDot = "#dcb432";
      } else if (server.state === "failed") {
        const failPulse = Math.sin(time * 4) * 0.2 + 0.8;
        bodyColor = `rgba(220, 60, 60, ${0.35 * failPulse})`;
        borderColor = `rgba(220, 60, 60, ${0.7 * failPulse})`;
        glowColor = `rgba(220, 60, 60, ${0.15 * failPulse})`;
        statusDot = "#dc3c3c";
      } else if (server.state === "recovering") {
        const recPulse = Math.sin(time * 3) * 0.3 + 0.7;
        bodyColor = `rgba(80, 200, 255, ${0.35 * recPulse})`;
        borderColor = `rgba(80, 200, 255, ${0.6 * recPulse})`;
        glowColor = `rgba(80, 200, 255, ${0.12 * recPulse})`;
        statusDot = "#50c8ff";
      }

      // Glow
      const glowR = s * 5.5 * pulse;
      const grad = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, glowR);
      grad.addColorStop(0, glowColor);
      grad.addColorStop(1, "transparent");
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, glowR, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Isometric box body (3 faces)
      const topOff = s * 0.4;
      const sideW = s * 0.6;
      const sideH = s * 0.8;

      // Top face
      ctx.beginPath();
      ctx.moveTo(p.sx, p.sy - topOff);
      ctx.lineTo(p.sx + sideW, p.sy - topOff + sideW * 0.3);
      ctx.lineTo(p.sx, p.sy - topOff + sideW * 0.6);
      ctx.lineTo(p.sx - sideW, p.sy - topOff + sideW * 0.3);
      ctx.closePath();
      ctx.fillStyle = bodyColor;
      ctx.fill();
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Left face
      ctx.beginPath();
      ctx.moveTo(p.sx - sideW, p.sy - topOff + sideW * 0.3);
      ctx.lineTo(p.sx, p.sy - topOff + sideW * 0.6);
      ctx.lineTo(p.sx, p.sy + sideH);
      ctx.lineTo(p.sx - sideW, p.sy + sideH - sideW * 0.3);
      ctx.closePath();
      ctx.fillStyle = bodyColor.replace(/[\d.]+\)$/, `${parseFloat(bodyColor.match(/[\d.]+\)$/)?.[0] || "0.35") * 0.7})`);
      ctx.fill();
      ctx.strokeStyle = borderColor;
      ctx.stroke();

      // Right face
      ctx.beginPath();
      ctx.moveTo(p.sx + sideW, p.sy - topOff + sideW * 0.3);
      ctx.lineTo(p.sx, p.sy - topOff + sideW * 0.6);
      ctx.lineTo(p.sx, p.sy + sideH);
      ctx.lineTo(p.sx + sideW, p.sy + sideH - sideW * 0.3);
      ctx.closePath();
      ctx.fillStyle = bodyColor.replace(/[\d.]+\)$/, `${parseFloat(bodyColor.match(/[\d.]+\)$/)?.[0] || "0.35") * 0.5})`);
      ctx.fill();
      ctx.strokeStyle = borderColor;
      ctx.stroke();

      // Status indicator LED
      ctx.beginPath();
      ctx.arc(p.sx, p.sy - topOff - 14, 7, 0, Math.PI * 2);
      ctx.fillStyle = statusDot;
      ctx.fill();
      ctx.shadowColor = statusDot;
      ctx.shadowBlur = 20;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Label
      ctx.font = `${Math.max(13, 16 * p.scale)}px 'SF Mono', 'Fira Code', monospace`;
      ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
      ctx.textAlign = "center";
      ctx.fillText(server.label, p.sx, p.sy + sideH + 14);
    };

    const drawConnection = (conn: Connection, servers: ServerNode[], cx: number, cy: number) => {
      const fromSrv = servers.find(s => s.id === conn.from)!;
      const toSrv = servers.find(s => s.id === conn.to)!;
      const fromIso = toIso(fromSrv.pos.x, fromSrv.pos.y, fromSrv.pos.z);
      const toIsoPos = toIso(toSrv.pos.x, toSrv.pos.y, toSrv.pos.z);
      const pFrom = project(fromIso, cx, cy);
      const pTo = project(toIsoPos, cx, cy);

      // Connection line
      const isDegraded = conn.health < 0.5;
      const lineColor = isDegraded
        ? `rgba(220, 60, 60, ${0.3 + Math.sin(time * 3) * 0.15})`
        : `rgba(100, 180, 255, 0.15)`;

      ctx.beginPath();
      ctx.moveTo(pFrom.sx, pFrom.sy);
      ctx.lineTo(pTo.sx, pTo.sy);
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = isDegraded ? 3.5 : 2;
      ctx.setLineDash(isDegraded ? [4, 4] : []);
      ctx.stroke();
      ctx.setLineDash([]);

      // Animated particles along connection
      for (const particle of conn.particles) {
        particle.t += particle.speed * (isDegraded ? 0.4 : 1);
        if (particle.t > 1) particle.t -= 1;

        const t = particle.t;
        const px = pFrom.sx + (pTo.sx - pFrom.sx) * t;
        const py = pFrom.sy + (pTo.sy - pFrom.sy) * t;

        const pColor = isDegraded
          ? `rgba(220, 100, 60, ${0.6 * (1 - Math.abs(t - 0.5) * 2)})`
          : `rgba(120, 200, 255, ${0.5 * (1 - Math.abs(t - 0.5) * 2)})`;

        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fillStyle = pColor;
        ctx.fill();
      }
    };

    const drawWebhookPacket = (pkt: WebhookPacket, cx: number, cy: number) => {
      // Trail
      if (pkt.trail.length > 1) {
        ctx.beginPath();
        const first = project(pkt.trail[0], cx, cy);
        ctx.moveTo(first.sx, first.sy);
        for (let i = 1; i < pkt.trail.length; i++) {
          const tp = project(pkt.trail[i], cx, cy);
          ctx.lineTo(tp.sx, tp.sy);
        }
        const trailColor = pkt.state === "normal"
          ? "rgba(100, 200, 255, 0.15)"
          : pkt.state === "retrying"
          ? "rgba(255, 180, 50, 0.2)"
          : "rgba(220, 60, 60, 0.2)";
        ctx.strokeStyle = trailColor;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      const p = project(pkt.pos, cx, cy);
      const s = pkt.size * p.scale;

      // Glow based on state
      let glowCol = "rgba(100, 200, 255, 0.3)";
      let coreCol = "rgba(140, 220, 255, 0.9)";
      if (pkt.state === "retrying") {
        const blink = Math.sin(time * 8) > 0 ? 1 : 0.4;
        glowCol = `rgba(255, 180, 50, ${0.3 * blink})`;
        coreCol = `rgba(255, 200, 80, ${0.9 * blink})`;
      } else if (pkt.state === "dropped") {
        glowCol = "rgba(220, 60, 60, 0.4)";
        coreCol = "rgba(255, 80, 80, 0.9)";
      } else if (pkt.state === "queued") {
        glowCol = "rgba(160, 120, 255, 0.3)";
        coreCol = "rgba(180, 140, 255, 0.9)";
      }

      // Outer glow
      const glowR = s * 10;
      const grad = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, glowR);
      grad.addColorStop(0, glowCol);
      grad.addColorStop(1, "transparent");
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, glowR, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Core cube (isometric diamond shape)
      ctx.beginPath();
      ctx.moveTo(p.sx, p.sy - s);
      ctx.lineTo(p.sx + s * 0.7, p.sy);
      ctx.lineTo(p.sx, p.sy + s * 0.5);
      ctx.lineTo(p.sx - s * 0.7, p.sy);
      ctx.closePath();
      ctx.fillStyle = coreCol;
      ctx.fill();

      // Retry count badge
      if (pkt.retryCount > 0) {
        ctx.font = `bold ${Math.max(14, 16 * p.scale)}px 'SF Mono', monospace`;
        ctx.fillStyle = pkt.state === "dropped" ? "rgba(255, 80, 80, 0.9)" : "rgba(255, 200, 80, 0.9)";
        ctx.textAlign = "center";
        ctx.fillText(`R${pkt.retryCount}`, p.sx, p.sy - s - 6);
      }
    };

    const drawRetryWave = (wave: RetryWave, cx: number, cy: number) => {
      const p = project(wave.origin, cx, cy);
      const r = wave.radius * p.scale;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 180, 50, ${wave.alpha * 0.4})`;
      ctx.lineWidth = 3.5;
      ctx.stroke();

      // Inner ring
      if (wave.radius > 20) {
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, r * 0.6, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 180, 50, ${wave.alpha * 0.2})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    };

    const drawFloatingDataParticles = (cx: number, cy: number) => {
      const count = 80;
      for (let i = 0; i < count; i++) {
        const seed = i * 137.508;
        const x = ((seed * 7.31 + time * (8 + (i % 5) * 2)) % W());
        const y = ((seed * 3.17 + time * (3 + (i % 3))) % H());
        const z = 100 + (seed % 400);
        const p = project({ x: x - W() / 2, y: y - H() / 2, z }, cx, cy);
        const alpha = p.scale * 0.35;
        const size = (1.8 + (i % 3) * 0.9) * p.scale;

        // Some particles are "data" (blue), some are "errors" (red)
        const isError = i % 12 === 0;
        const color = isError
          ? `rgba(220, 80, 80, ${alpha * 0.6})`
          : `rgba(100, 180, 255, ${alpha * 0.5})`;

        ctx.beginPath();
        ctx.arc(p.sx, p.sy, size, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }
    };

    const drawScanline = (cx: number) => {
      const scanY = (time * 35) % H();
      const scanGrad = ctx.createLinearGradient(0, scanY - 40, 0, scanY + 40);
      scanGrad.addColorStop(0, "transparent");
      scanGrad.addColorStop(0.5, "rgba(100, 180, 255, 0.012)");
      scanGrad.addColorStop(1, "transparent");
      ctx.fillStyle = scanGrad;
      ctx.fillRect(0, scanY - 40, W(), 80);
    };

    // --- Failure simulation ---
    const updateFailureCycle = (dt: number) => {
      failureCycleTimer += dt;

      const cyclePos = failureCycleTimer % FAILURE_CYCLE_DURATION;
      const prevPhase = failureCyclePhase;

      if (cyclePos < 3) {
        failureCyclePhase = 0; // healthy
      } else if (cyclePos < 4.5) {
        failureCyclePhase = 1; // dest starts failing
      } else if (cyclePos < 9) {
        failureCyclePhase = 2; // retries happening
      } else {
        failureCyclePhase = 3; // recovery
      }

      // Phase transitions
      if (prevPhase !== failureCyclePhase) {
        if (failureCyclePhase === 1) {
          // Destination fails
          servers[4].state = "failed";
          connections[3].health = 0;
        } else if (failureCyclePhase === 2) {
          // Worker starts retrying, queue shows backing up
          servers[3].state = "degraded";
          servers[2].state = "degraded";
        } else if (failureCyclePhase === 3) {
          // Recovery
          servers[4].state = "recovering";
          servers[3].state = "healthy";
          servers[2].state = "healthy";
          connections[3].health = 0.5;
        } else if (failureCyclePhase === 0) {
          // All healthy
          servers.forEach(s => s.state = "healthy");
          connections.forEach(c => c.health = 1);
        }
      }
    };

    // --- Main animation loop ---
    let lastTime = performance.now();

    const draw = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      time += dt;

      const cx = W() / 2;
      const cy = H() / 2;

      ctx.clearRect(0, 0, W(), H());

      // Update failure simulation
      updateFailureCycle(dt);

      // Draw background layers
      drawGridFloor(cx, cy);
      drawFloatingDataParticles(cx, cy);

      // Draw connections
      for (const conn of connections) {
        drawConnection(conn, servers, cx, cy);
      }

      // Draw servers
      for (const server of servers) {
        drawIsometricServer(server, cx, cy);
      }

      // Spawn packets periodically
      if (Math.random() < 0.025) {
        spawnPacket();
      }

      // Update and draw packets
      for (let i = packets.length - 1; i >= 0; i--) {
        const pkt = packets[i];
        pkt.age += dt;

        // Store trail
        pkt.trail.push({ ...pkt.pos });
        if (pkt.trail.length > 30) pkt.trail.shift();

        // Move packet
        if (pkt.state === "normal" || pkt.state === "retrying") {
          pkt.pos.x += pkt.vel.x * 60 * dt;
          pkt.pos.y += pkt.vel.y * 60 * dt;
          pkt.pos.z += pkt.vel.z * 60 * dt;
        }

        // Check if packet reached destination area
        if (pkt.pos.x > servers[4].pos.x - 30 && pkt.state === "normal") {
          if (servers[4].state === "failed") {
            // Packet fails!
            pkt.state = "retrying";
            pkt.retryCount++;

            // Spawn retry wave
            retryWaves.push({
              origin: { ...pkt.pos },
              radius: 0,
              maxRadius: 250,
              alpha: 1,
            });

            // Reverse direction for retry (go back to queue)
            pkt.vel.x = -0.5;
            pkt.vel.y = 0;
            pkt.vel.z = 0;
          } else {
            // Success - remove packet
            packets.splice(i, 1);
            continue;
          }
        }

        // Handle retrying packets
        if (pkt.state === "retrying") {
          // Move back toward queue
          if (pkt.pos.x <= servers[2].pos.x + 20) {
            pkt.state = "queued";
            pkt.vel.x = 0;
            pkt.vel.y = 0;
            pkt.vel.z = 0;
          }
        }

        // Handle queued packets - wait then retry
        if (pkt.state === "queued") {
          const waitTime = Math.pow(2, pkt.retryCount) * 0.5; // exponential backoff
          if (pkt.age > waitTime + 2) {
            if (pkt.retryCount >= pkt.maxRetries) {
              pkt.state = "dropped";
              // Remove after showing dropped state
              setTimeout(() => {
                const idx = packets.indexOf(pkt);
                if (idx > -1) packets.splice(idx, 1);
              }, 2000);
            } else {
              // Retry
              pkt.state = "retrying";
              pkt.vel.x = 0.6 + Math.random() * 0.2;
              pkt.vel.y = 0;
              pkt.vel.z = 0;
            }
          }
        }

        // Remove old dropped packets
        if (pkt.state === "dropped" && pkt.age > 5) {
          packets.splice(i, 1);
          continue;
        }

        // Safety: remove very old packets
        if (pkt.age > 20) {
          packets.splice(i, 1);
          continue;
        }

        drawWebhookPacket(pkt, cx, cy);
      }

      // Update and draw retry waves
      for (let i = retryWaves.length - 1; i >= 0; i--) {
        const wave = retryWaves[i];
        wave.radius += 80 * dt;
        wave.alpha -= dt * 0.8;
        if (wave.alpha <= 0 || wave.radius >= wave.maxRadius) {
          retryWaves.splice(i, 1);
          continue;
        }
        drawRetryWave(wave, cx, cy);
      }

      // Draw scanline
      drawScanline(cx);

      // Draw HUD overlay elements
      drawHUD(cx, cy);

      animId = requestAnimationFrame(draw);
    };

    const drawHUD = (cx: number, cy: number) => {
      // --- RETRY ENGINE (top-right) ---
      const rX = W() - 280;
      const rY = 30;
      const rW = 240;
      const rH = 110;
      
      // Background panel
      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.strokeStyle = "rgba(100, 180, 255, 0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(rX - 14, rY - 14, rW + 28, rH + 28, 10);
      ctx.fill();
      ctx.stroke();
      
      // Header
      ctx.font = "bold 15px 'SF Mono', 'Fira Code', monospace";
      ctx.fillStyle = "rgba(100, 180, 255, 0.7)";
      ctx.textAlign = "left";
      ctx.fillText("RETRY ENGINE", rX, rY + 6);
      
      // Divider
      ctx.beginPath();
      ctx.moveTo(rX, rY + 16);
      ctx.lineTo(rX + rW, rY + 16);
      ctx.strokeStyle = "rgba(100, 180, 255, 0.1)";
      ctx.stroke();
      
      const retrying = packets.filter(p => p.state === "retrying").length;
      const queued = packets.filter(p => p.state === "queued").length;
      const dropped = packets.filter(p => p.state === "dropped").length;
      
      ctx.font = "14px 'SF Mono', 'Fira Code', monospace";
      
      // Status dot + RETRYING
      ctx.beginPath();
      ctx.arc(rX + 8, rY + 38, 5, 0, Math.PI * 2);
      ctx.fillStyle = retrying > 0 ? "rgba(255, 180, 50, 0.8)" : "rgba(60, 180, 120, 0.5)";
      ctx.fill();
      ctx.fillStyle = retrying > 0 ? "rgba(255, 200, 80, 0.9)" : "rgba(255, 255, 255, 0.4)";
      ctx.fillText(`RETRYING`, rX + 20, rY + 43);
      ctx.fillStyle = retrying > 0 ? "rgba(255, 200, 80, 0.9)" : "rgba(255, 255, 255, 0.5)";
      ctx.textAlign = "right";
      ctx.fillText(`${retrying}`, rX + rW, rY + 43);
      ctx.textAlign = "left";
      
      // Status dot + QUEUED
      ctx.beginPath();
      ctx.arc(rX + 8, rY + 62, 5, 0, Math.PI * 2);
      ctx.fillStyle = queued > 0 ? "rgba(160, 120, 255, 0.8)" : "rgba(60, 180, 120, 0.5)";
      ctx.fill();
      ctx.fillStyle = queued > 0 ? "rgba(180, 140, 255, 0.9)" : "rgba(255, 255, 255, 0.4)";
      ctx.fillText(`QUEUED`, rX + 20, rY + 67);
      ctx.fillStyle = queued > 0 ? "rgba(180, 140, 255, 0.9)" : "rgba(255, 255, 255, 0.5)";
      ctx.textAlign = "right";
      ctx.fillText(`${queued}`, rX + rW, rY + 67);
      ctx.textAlign = "left";
      
      // Status dot + DROPPED
      ctx.beginPath();
      ctx.arc(rX + 8, rY + 86, 5, 0, Math.PI * 2);
      ctx.fillStyle = dropped > 0 ? "rgba(220, 60, 60, 0.8)" : "rgba(60, 180, 120, 0.5)";
      ctx.fill();
      ctx.fillStyle = dropped > 0 ? "rgba(255, 80, 80, 0.9)" : "rgba(255, 255, 255, 0.4)";
      ctx.fillText(`DROPPED`, rX + 20, rY + 91);
      ctx.fillStyle = dropped > 0 ? "rgba(255, 80, 80, 0.9)" : "rgba(255, 255, 255, 0.5)";
      ctx.textAlign = "right";
      ctx.fillText(`${dropped}`, rX + rW, rY + 91);
      
      ctx.restore();

      // --- QUEUE DEPTH (bottom-right) ---
      const qX = W() - 300;
      const qY = H() - 160;
      const qW = 260;
      const qH = 120;
      
      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.strokeStyle = "rgba(100, 180, 255, 0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(qX - 14, qY - 14, qW + 28, qH + 28, 10);
      ctx.fill();
      ctx.stroke();
      
      ctx.font = "bold 15px 'SF Mono', 'Fira Code', monospace";
      ctx.fillStyle = "rgba(100, 180, 255, 0.7)";
      ctx.textAlign = "left";
      ctx.fillText("QUEUE DEPTH", qX, qY + 6);
      
      ctx.beginPath();
      ctx.moveTo(qX, qY + 16);
      ctx.lineTo(qX + qW, qY + 16);
      ctx.strokeStyle = "rgba(100, 180, 255, 0.1)";
      ctx.stroke();
      
      // Bar chart
      const barCount = 16;
      const barW = 10;
      const barGap = 5;
      const maxBarH = 55;
      for (let i = 0; i < barCount; i++) {
        const h = (Math.sin(time * 2 + i * 0.5) * 0.5 + 0.5) * maxBarH * 0.5 + 8;
        const isHigh = h > maxBarH * 0.6;
        ctx.fillStyle = isHigh ? "rgba(220, 100, 60, 0.5)" : "rgba(100, 180, 255, 0.35)";
        ctx.fillRect(qX + i * (barW + barGap), qY + 24 + (maxBarH - h), barW, h);
      }
      
      // Active count
      ctx.font = "14px 'SF Mono', 'Fira Code', monospace";
      ctx.fillStyle = "rgba(100, 180, 255, 0.5)";
      ctx.fillText(`ACTIVE: ${packets.filter(p => p.state !== "dropped").length}`, qX, qY + maxBarH + 40);
      
      ctx.restore();

      // --- CIRCUIT BREAKER (bottom-left) ---
      const cbX = 30;
      const cbY = H() - 150;
      const cbW = 220;
      const cbH = 105;
      
      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.strokeStyle = "rgba(100, 180, 255, 0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(cbX - 14, cbY - 14, cbW + 28, cbH + 28, 10);
      ctx.fill();
      ctx.stroke();
      
      ctx.font = "bold 15px 'SF Mono', 'Fira Code', monospace";
      ctx.fillStyle = "rgba(100, 180, 255, 0.7)";
      ctx.textAlign = "left";
      ctx.fillText("CIRCUIT BREAKER", cbX, cbY + 6);
      
      ctx.beginPath();
      ctx.moveTo(cbX, cbY + 16);
      ctx.lineTo(cbX + cbW, cbY + 16);
      ctx.strokeStyle = "rgba(100, 180, 255, 0.1)";
      ctx.stroke();
      
      const cbState = failureCyclePhase === 1 ? "OPEN" : failureCyclePhase === 2 ? "HALF-OPEN" : "CLOSED";
      const cbColor = failureCyclePhase === 1 ? "rgba(220, 60, 60, 0.9)" : failureCyclePhase === 2 ? "rgba(255, 180, 50, 0.8)" : "rgba(60, 180, 120, 0.8)";
      
      // Circuit breaker icon (larger)
      ctx.beginPath();
      ctx.arc(cbX + 14, cbY + 44, 10, 0, Math.PI * 2);
      ctx.fillStyle = cbColor;
      ctx.fill();
      ctx.shadowColor = cbColor;
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;
      
      // State text
      ctx.font = "bold 18px 'SF Mono', 'Fira Code', monospace";
      ctx.fillStyle = cbColor;
      ctx.fillText(cbState, cbX + 32, cbY + 50);
      
      // Connection status
      ctx.font = "12px 'SF Mono', 'Fira Code', monospace";
      ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
      const connHealth = connections[3].health;
      ctx.fillText(`LINK: ${connHealth > 0.8 ? "HEALTHY" : connHealth > 0.3 ? "DEGRADED" : "DOWN"}`, cbX, cbY + 78);
      
      ctx.restore();
    };

    animId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouse);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 pointer-events-none"
      style={{ opacity: 1 }}
    />
  );
}
