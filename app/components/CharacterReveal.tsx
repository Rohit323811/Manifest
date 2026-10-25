"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type Phase = "idle" | "flowing" | "revealed";

type Particle = { x: number; y: number; startY: number; delay: number; duration: number; glyph: string; alpha: number; sway: number };

const GLYPHS = "@%#*+=-:.";
const IMAGE_SRC = "/winged-demon.png";

export function CharacterReveal() {
  const panelRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (run === 0) return;
    const panel = panelRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!panel || !canvas || !context) return;

    let frame = 0;
    let cancelled = false;
    let started = false;
    const source = new window.Image();

    const beginFlow = () => {
      if (cancelled || started) return;
      started = true;
      const width = panel.clientWidth;
      const height = panel.clientHeight;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

      const scale = Math.min(width / source.width, height / source.height);
      const imageWidth = source.width * scale;
      const imageHeight = source.height * scale;
      const imageLeft = (width - imageWidth) / 2;
      const imageTop = (height - imageHeight) / 2;
      const columns = 72;
      const rows = Math.max(1, Math.round(columns * (source.height / source.width) * 0.6));
      const sample = document.createElement("canvas");
      sample.width = columns;
      sample.height = rows;
      const sampleContext = sample.getContext("2d", { willReadFrequently: true });
      if (!sampleContext) return;
      sampleContext.drawImage(source, 0, 0, columns, rows);
      const pixels = sampleContext.getImageData(0, 0, columns, rows).data;
      const cellWidth = imageWidth / columns;
      const cellHeight = imageHeight / rows;
      const particles: Particle[] = [];

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const pixel = (row * columns + column) * 4;
          const red = pixels[pixel];
          const green = pixels[pixel + 1];
          const blue = pixels[pixel + 2];
          if (green < 24 || green < red * 1.35 || green < blue * 1.25) continue;
          const brightness = Math.min(1, green / 255);
          const glyphIndex = Math.min(GLYPHS.length - 1, Math.floor(brightness * GLYPHS.length));
          const x = imageLeft + (column + 0.5) * cellWidth;
          const y = imageTop + (row + 0.5) * cellHeight;
          particles.push({
            x, y, startY: y - 55 - Math.random() * 75,
            delay: (column / columns) * 120 + Math.random() * 50,
            duration: 600 + Math.random() * 150,
            glyph: GLYPHS[glyphIndex], alpha: 0.58 + brightness * 0.42,
            sway: Math.random() * Math.PI * 2,
          });
        }
      }

      const startedAt = performance.now();
      const finishAt = 950;
      context.font = String(Math.max(5, cellHeight * 0.96)) + "px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      context.textAlign = "center";
      context.textBaseline = "middle";

      const draw = (now: number) => {
        if (cancelled) return;
        const elapsed = now - startedAt;
        context.clearRect(0, 0, width, height);
        for (const particle of particles) {
          const localTime = elapsed - particle.delay;
          if (localTime < 0) continue;
          const progress = Math.min(1, localTime / particle.duration);
          const eased = 1 - Math.pow(1 - progress, 3);
          context.globalAlpha = particle.alpha;
          context.fillStyle = "#22c55e";
          context.fillText(
            particle.glyph,
            particle.x + Math.sin(elapsed * 0.003 + particle.sway) * 1.2 * (1 - eased),
            particle.startY + (particle.y - particle.startY) * eased,
          );
        }
        if (elapsed >= finishAt) {
          setPhase("revealed");
          return;
        }
        frame = window.requestAnimationFrame(draw);
      };
      frame = window.requestAnimationFrame(draw);
    };

    source.onload = beginFlow;
    source.onerror = () => setPhase("idle");
    source.src = IMAGE_SRC;
    if (source.complete && source.naturalWidth > 0) beginFlow();
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      source.onload = null;
      source.onerror = null;
    };
  }, [run]);

  const startFlow = () => {
    if (phase === "flowing") return;
    setPhase("flowing");
    setRun((current) => current + 1);
  };

  return (
    <div className="relative mx-auto w-full max-w-[600px] px-3 pb-8 pt-3 sm:px-5">
      <div className="pointer-events-none absolute inset-5 border border-green-900/40" />
      <div className="pointer-events-none absolute inset-0 bg-green-500/[0.035] blur-3xl" />
      <div ref={panelRef} className="relative mx-auto flex aspect-[3/4] min-h-[420px] max-h-[72vh] w-full max-w-[540px] items-center justify-center overflow-hidden border border-green-700/50 bg-[#020503] shadow-[0_0_70px_rgba(34,197,94,0.09)]" aria-label="Winged figure reveal">
        <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_center,rgba(34,197,94,0.12),transparent_70%)]" />
        <div className="pointer-events-none absolute inset-0 z-20 bg-[linear-gradient(rgba(34,197,94,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(34,197,94,0.045)_1px,transparent_1px)] bg-[size:32px_32px] opacity-40" />
        <Image src={IMAGE_SRC} alt="Winged anime character formed from ASCII characters" width={1086} height={1448} priority className={"absolute inset-0 z-10 h-full w-full object-contain transition-opacity duration-700 " + (phase === "revealed" ? "opacity-100" : "opacity-0")} />
        <canvas ref={canvasRef} aria-hidden="true" className={"absolute inset-0 z-30 h-full w-full transition-opacity duration-700 " + (phase === "flowing" ? "opacity-100" : "opacity-0")} />

        <div className="pointer-events-none absolute left-4 top-4 z-40 flex items-center gap-2 border border-green-900/70 bg-black/70 px-3 py-2 backdrop-blur-sm">
          <span className={"h-1.5 w-1.5 rounded-full " + (phase === "flowing" ? "animate-pulse bg-green-300 shadow-[0_0_10px_#22c55e]" : phase === "revealed" ? "bg-green-400" : "bg-green-950")} />
          <span className="text-[8px] font-semibold tracking-[0.2em] text-green-500">MANIFEST / 001</span>
        </div>
        <div className="pointer-events-none absolute right-4 top-4 z-40 border border-green-950/80 bg-black/70 px-3 py-2 text-[8px] tracking-[0.18em] text-green-800 backdrop-blur-sm">
          {phase === "idle" ? "STANDBY" : phase === "flowing" ? "SYNCHRONIZING" : "ONLINE"}
        </div>

        {phase === "idle" && <div className="relative z-40 px-5 text-center"><p className="font-sans text-2xl font-semibold tracking-[-0.04em] text-green-300 drop-shadow-[0_0_14px_rgba(34,197,94,0.55)] sm:text-3xl">Wanna see a magic trick? <span aria-label="devil">😈</span></p></div>}

        <span className="pointer-events-none absolute left-3 top-3 z-40 h-5 w-5 border-l border-t border-green-500/60" />
        <span className="pointer-events-none absolute right-3 top-3 z-40 h-5 w-5 border-r border-t border-green-500/60" />
        <span className="pointer-events-none absolute bottom-3 left-3 z-40 h-5 w-5 border-b border-l border-green-500/60" />
        <span className="pointer-events-none absolute bottom-3 right-3 z-40 h-5 w-5 border-b border-r border-green-500/60" />

        <div className="absolute inset-x-0 bottom-0 z-50 bg-gradient-to-t from-black via-black/95 to-black/0 px-4 pb-4 pt-14 sm:px-5">
          <div className="flex items-center justify-between gap-3 border-t border-green-800/40 pt-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className={"relative flex h-2 w-2 shrink-0 rounded-full " + (phase === "flowing" ? "animate-pulse bg-green-300" : phase === "revealed" ? "bg-green-400" : "bg-green-950")}>
                {phase === "flowing" && <span className="absolute inset-0 animate-ping rounded-full bg-green-400/70" />}
              </span>
              <div className="min-w-0">
                <p aria-live="polite" className="truncate text-[8px] font-bold tracking-[0.18em] text-green-400 sm:text-[9px]">{phase === "idle" ? "SYSTEM READY" : phase === "flowing" ? "CHARACTERS IN MOTION" : "IMAGE MANIFESTED"}</p>
                <p className="mt-1 hidden truncate text-[8px] tracking-[0.08em] text-green-900 sm:block">{phase === "idle" ? "FIG. 001 / SOURCE IMAGE" : phase === "flowing" ? "FOLLOWING SOURCE SIGNAL" : "1086 × 1448 / ORIGINAL IMAGE"}</p>
              </div>
            </div>
            <button type="button" onClick={startFlow} disabled={phase === "flowing"} className="group relative inline-flex min-h-11 shrink-0 items-center justify-center gap-4 overflow-hidden border border-green-300/80 bg-green-500 px-4 text-[9px] font-black tracking-[0.16em] text-black shadow-[0_0_24px_rgba(34,197,94,0.2)] transition duration-300 hover:border-green-100 hover:bg-green-300 hover:shadow-[0_0_36px_rgba(34,197,94,0.4)] disabled:cursor-wait disabled:opacity-70 sm:px-5 sm:text-[10px]">
              <span className="absolute inset-y-0 left-0 w-1 bg-white/50 transition-all duration-300 group-hover:w-full group-hover:bg-white/10" />
              <span className="relative">{phase === "revealed" ? "RUN AGAIN" : phase === "flowing" ? "BUILDING..." : "PRESS IT"}</span>
              <span aria-hidden="true" className="relative text-sm transition-transform group-hover:translate-x-1">→</span>
            </button>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between px-1 text-[8px] tracking-[0.2em] text-green-950"><span>VISUAL BUFFER <span className="text-green-800">/</span> 01</span><span>RGB <span className="text-green-700">34 · 197 · 94</span></span></div>
    </div>
  );
}
