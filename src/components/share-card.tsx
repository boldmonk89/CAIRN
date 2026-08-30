"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Field, Sheet } from "./ui";
import { Download, Share } from "./icons";
import { km, duration, paceLabel, dateLabel } from "@/lib/format";
import { pace } from "@/lib/geo";
import type { Achievement, Run } from "@/lib/runs";

type Shape = "square" | "story" | "wide";
type Ground = "transparent" | "dark" | "orange";

const SHAPES: Record<Shape, { w: number; h: number; label: string }> = {
  square: { w: 1080, h: 1080, label: "Square 1:1" },
  story: { w: 1080, h: 1920, label: "Story 9:16" },
  wide: { w: 1920, h: 1080, label: "Wide 16:9" },
};

const INK = { transparent: "#ffffff", dark: "#fafaf9", orange: "#141412" };
const DIM = { transparent: "#d6d3d1", dark: "#a8a29e", orange: "#3f1d0c" };
const LINE_COLOUR = { transparent: "#ef3d05", dark: "#ef3d05", orange: "#141412" };

/** family stacks as the browser resolved them, so canvas gets the real fonts */
function fontStacks() {
  const s = getComputedStyle(document.documentElement);
  return {
    display: s.getPropertyValue("--font-display").trim() || "Georgia, serif",
    mono: s.getPropertyValue("--font-mono").trim() || "monospace",
    sans: s.getPropertyValue("--font-sans").trim() || "sans-serif",
  };
}

/** Fit the route into a box, keeping shape. Longitude degrees shrink toward the poles. */
function projectRoute(run: Run, box: { x: number; y: number; w: number; h: number }) {
  const pts = run.track;
  if (pts.length < 2) return [];
  const midLat = (pts[0].lat * Math.PI) / 180;
  const kx = Math.cos(midLat);
  const xs = pts.map((p) => p.lon * kx);
  const ys = pts.map((p) => -p.lat);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1e-9);
  const spanY = Math.max(maxY - minY, 1e-9);
  const scale = Math.min(box.w / spanX, box.h / spanY);
  const offX = box.x + (box.w - spanX * scale) / 2;
  const offY = box.y + (box.h - spanY * scale) / 2;
  return xs.map((x, i) => [offX + (x - minX) * scale, offY + (ys[i] - minY) * scale] as const);
}

function drawCard(
  canvas: HTMLCanvasElement, run: Run, shape: Shape, ground: Ground,
  showRoute: boolean, achievement: Achievement | null,
) {
  const { w, h } = SHAPES[shape];
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const f = fontStacks();

  ctx.clearRect(0, 0, w, h); // transparent unless we paint over it
  if (ground === "dark") {
    ctx.fillStyle = "#141412";
    ctx.fillRect(0, 0, w, h);
  } else if (ground === "orange") {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#ff7a3f");
    g.addColorStop(1, "#e8410a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  const ink = INK[ground], dim = DIM[ground];
  const pad = Math.round(w * 0.075);
  const unit = w / 1080; // scale every size off the square design

  if (showRoute && run.track.length > 1) {
    const boxH = shape === "story" ? h * 0.34 : h * 0.42;
    const route = projectRoute(run, { x: pad, y: h - boxH - pad * 1.6, w: w - pad * 2, h: boxH });
    ctx.strokeStyle = LINE_COLOUR[ground];
    ctx.lineWidth = 10 * unit;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    route.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  }

  let y = pad + 60 * unit;

  if (achievement) {
    ctx.fillStyle = ground === "orange" ? "#141412" : "#fbbf24";
    ctx.font = `700 ${Math.round(30 * unit)}px ${f.mono}`;
    ctx.fillText(achievement.title.toUpperCase(), pad, y);
    y += 46 * unit;
  }

  ctx.fillStyle = dim;
  ctx.font = `500 ${Math.round(28 * unit)}px ${f.mono}`;
  ctx.fillText(dateLabel(run.startedAt).toUpperCase(), pad, y);
  y += 56 * unit;

  ctx.fillStyle = ink;
  ctx.font = `900 ${Math.round(74 * unit)}px ${f.display}`;
  ctx.fillText(run.title, pad, y);
  y += 130 * unit;

  // the number people actually want to show off
  ctx.font = `900 ${Math.round(210 * unit)}px ${f.display}`;
  ctx.fillStyle = ground === "orange" ? "#141412" : "#ef3d05";
  const distance = km(run.distance);
  ctx.fillText(distance, pad, y);
  const distWidth = ctx.measureText(distance).width;
  ctx.font = `500 ${Math.round(46 * unit)}px ${f.mono}`;
  ctx.fillStyle = dim;
  ctx.fillText("KM", pad + distWidth + 18 * unit, y);
  y += 90 * unit;

  const stats: [string, string][] = [
    ["TIME", duration(run.movingMs)],
    ["PACE", `${paceLabel(pace(run.distance, run.movingMs))} /km`],
    ["KCAL", String(run.calories)],
  ];
  if (run.elevation >= 10) stats.push(["ELEV", `${Math.round(run.elevation)} m`]);

  const colW = (w - pad * 2) / stats.length;
  stats.forEach(([label, value], i) => {
    const x = pad + colW * i;
    ctx.fillStyle = dim;
    ctx.font = `500 ${Math.round(26 * unit)}px ${f.mono}`;
    ctx.fillText(label, x, y);
    ctx.fillStyle = ink;
    ctx.font = `500 ${Math.round(52 * unit)}px ${f.mono}`;
    ctx.fillText(value, x, y + 58 * unit);
  });

  ctx.fillStyle = dim;
  ctx.font = `500 ${Math.round(24 * unit)}px ${f.mono}`;
  ctx.fillText("CAIRN", pad, h - pad * 0.6);
}

export function ShareCard({
  run, achievement = null, open, onClose,
}: { run: Run; achievement?: Achievement | null; open: boolean; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [shape, setShape] = useState<Shape>("square");
  const [ground, setGround] = useState<Ground>("transparent");
  const [showRoute, setShowRoute] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  const redraw = useCallback(() => {
    if (!canvas.current) return;
    // fonts must be resolved before canvas measures anything
    document.fonts.ready.then(() => {
      if (canvas.current) drawCard(canvas.current, run, shape, ground, showRoute, achievement);
    });
  }, [run, shape, ground, showRoute, achievement]);

  useEffect(() => { if (open) redraw(); }, [open, redraw]);

  const toBlob = () =>
    new Promise<Blob | null>((res) => canvas.current?.toBlob(res, "image/png") ?? res(null));

  async function download() {
    const blob = await toBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cairn-${km(run.distance)}km-${shape}.png`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus("Saved to your downloads.");
  }

  async function shareOut() {
    const blob = await toBlob();
    if (!blob) return;
    const file = new File([blob], "cairn-run.png", { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: run.title });
        setStatus(null);
      } catch {
        /* the person closed the share sheet — not an error */
      }
    } else {
      await download();
    }
  }

  const chip = (on: boolean) =>
    `min-h-11 cursor-pointer rounded-full border px-4 text-sm font-medium transition-colors duration-200 ${
      on ? "border-accent bg-accent text-accent-ink" : "border-line bg-raised text-ink hover:border-muted"
    }`;

  return (
    <Sheet open={open} onClose={onClose} title="Share this run">
      <div className="grid gap-5">
        {/* the checkerboard shows through wherever the PNG is transparent */}
        <div
          className="grid place-items-center rounded-2xl border border-line p-3"
          style={{
            backgroundColor: "#131110",
            backgroundImage:
              "linear-gradient(45deg,#1c1917 25%,transparent 25%),linear-gradient(-45deg,#1c1917 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#1c1917 75%),linear-gradient(-45deg,transparent 75%,#1c1917 75%)",
            backgroundSize: "18px 18px",
            backgroundPosition: "0 0,0 9px,9px -9px,-9px 0",
          }}
        >
          <canvas
            ref={canvas}
            className="h-auto max-h-[46dvh] w-auto max-w-full rounded-lg"
            aria-label={`Share image: ${run.title}, ${km(run.distance)} kilometres`}
          />
        </div>

        <Field label="Size">
          <div className="rail flex gap-2">
            {(Object.keys(SHAPES) as Shape[]).map((s) => (
              <button key={s} type="button" aria-pressed={shape === s}
                onClick={() => setShape(s)} className={chip(shape === s)}>
                {SHAPES[s].label}
              </button>
            ))}
          </div>
        </Field>

        <Field
          label="Background"
          hint={ground === "transparent" ? "Transparent PNG — drops straight onto a story or a photo." : undefined}
        >
          <div className="rail flex gap-2">
            {([["transparent", "Transparent"], ["dark", "Dark"], ["orange", "Orange"]] as const).map(
              ([g, label]) => (
                <button key={g} type="button" aria-pressed={ground === g}
                  onClick={() => setGround(g)} className={chip(ground === g)}>
                  {label}
                </button>
              ),
            )}
          </div>
        </Field>

        <label className="flex min-h-11 cursor-pointer items-center gap-3">
          <input
            type="checkbox" checked={showRoute}
            onChange={(e) => setShowRoute(e.target.checked)}
            className="h-5 w-5 accent-[#ef3d05]"
          />
          <span className="text-sm font-medium">Include the route line</span>
        </label>

        {status && <p className="text-sm text-good" role="status">{status}</p>}

        <div className="flex gap-3">
          <Button onClick={shareOut} className="flex flex-1 items-center justify-center gap-2">
            <Share size={18} /> Share
          </Button>
          <Button variant="ghost" onClick={download} className="flex flex-1 items-center justify-center gap-2">
            <Download size={18} /> Download
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
