"use client";

import { useEffect, useRef } from "react";

// Cyan/emerald "hacker" accent tint, low alpha so it reads as texture
// rather than competing with foreground content.
const COLORS = [
  "rgba(34, 211, 238, 0.55)", // cyan-400
  "rgba(52, 211, 153, 0.55)", // emerald-400
];
const MAX_PARTICLES = 80;
const AREA_PER_PARTICLE = 18_000; // px^2 — controls density on large screens

type Particle = {
  x: number;
  y: number;
  r: number;
  vy: number;
  vx: number;
  color: string;
};

function createParticles(width: number, height: number): Particle[] {
  const count = Math.min(MAX_PARTICLES, Math.round((width * height) / AREA_PER_PARTICLE));
  return Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    r: 0.8 + Math.random() * 1.8,
    vy: -(0.08 + Math.random() * 0.22), // slow drift upward
    vx: (Math.random() - 0.5) * 0.08,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  }));
}

/** Ambient drifting-dot backdrop. Fixed, behind all content, click-through. */
export function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    let particles: Particle[] = [];
    let width = 0;
    let height = 0;
    const dpr = window.devicePixelRatio || 1;

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx!.scale(dpr, dpr);
      particles = createParticles(width, height);
    }

    function draw() {
      ctx!.clearRect(0, 0, width, height);
      for (const p of particles) {
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fillStyle = p.color;
        ctx!.fill();
      }
    }

    function step() {
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        // Wrap around edges instead of respawning — simplest continuous motion.
        if (p.y < -5) p.y = height + 5;
        if (p.x < -5) p.x = width + 5;
        if (p.x > width + 5) p.x = -5;
      }
      draw();
      frame = requestAnimationFrame(step);
    }

    resize();
    window.addEventListener("resize", resize);

    let frame = 0;
    let running = !reduceMotion;

    if (reduceMotion) {
      // Static field: respect the OS setting instead of animating.
      draw();
    } else {
      frame = requestAnimationFrame(step);
    }

    function handleVisibility() {
      if (document.hidden) {
        if (running) cancelAnimationFrame(frame);
        running = false;
      } else if (!reduceMotion && !running) {
        running = true;
        frame = requestAnimationFrame(step);
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 -z-10 pointer-events-none"
    />
  );
}
