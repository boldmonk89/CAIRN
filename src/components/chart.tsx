"use client";

import { useId } from "react";

/**
 * Area/line chart as inline SVG. The references put a chart high on the stats
 * screen with a visible baseline axis, and a running app has plenty to plot —
 * but a charting library for two shapes would be absurd, so this is 60 lines.
 *
 * Colour never carries meaning alone here: every series is labelled, and the
 * highlighted point is announced in the accessible summary.
 */
export function AreaChart({
  values, labels, height = 120, format = String, caption,
}: {
  values: number[];
  labels: string[];
  height?: number;
  format?: (v: number) => string;
  caption: string;
}) {
  const id = useId();
  const W = 300;
  const H = height;
  const pad = { top: 8, bottom: 18, left: 0, right: 0 };
  const plotH = H - pad.top - pad.bottom;

  const max = Math.max(...values, 1);
  const step = values.length > 1 ? W / (values.length - 1) : W;
  const x = (i: number) => i * step;
  const y = (v: number) => pad.top + plotH - (v / max) * plotH;

  // a straight polyline reads as jagged noise; a light cubic smooths it without
  // inventing values between the points
  const line = values.map((v, i) => {
    if (i === 0) return `M ${x(0)} ${y(v)}`;
    const px = x(i - 1), py = y(values[i - 1]);
    const cx = (px + x(i)) / 2;
    return `C ${cx} ${py} ${cx} ${y(v)} ${x(i)} ${y(v)}`;
  }).join(" ");

  const area = `${line} L ${x(values.length - 1)} ${pad.top + plotH} L 0 ${pad.top + plotH} Z`;
  const peak = values.indexOf(Math.max(...values));

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`${caption}. ${values.map((v, i) => `${labels[i]} ${format(v)}`).join(", ")}.`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.38" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {values.some((v) => v > 0) && (
          <>
            <path d={area} fill={`url(#${id}-fill)`} />
            <path d={line} fill="none" stroke="var(--color-accent)" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            <circle cx={x(peak)} cy={y(values[peak])} r="3.5"
                    fill="var(--color-accent)" stroke="var(--color-ground)" strokeWidth="2"
                    vectorEffect="non-scaling-stroke" />
          </>
        )}

        {/* the baseline the references show under the plot */}
        <line x1="0" y1={pad.top + plotH} x2={W} y2={pad.top + plotH}
              stroke="var(--color-line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>

      <figcaption className="mt-1 flex justify-between">
        {labels.map((l, i) => (
          // the accent measures 4.38:1 at this size — under the bar — so the
          // peak is marked with weight and full-strength ink, and the accent
          // dot on the plot carries the colour cue
          <span key={i} className={`label ${i === peak ? "font-bold text-ink" : "text-muted"}`}>{l}</span>
        ))}
      </figcaption>
    </figure>
  );
}

/** Pace over distance. Lower is faster, so the axis is inverted to read right. */
export function PaceChart({
  points, height = 130,
}: { points: { km: number; pace: number }[]; height?: number }) {
  if (points.length < 2) return null;
  const W = 300, H = height, pad = 10;
  const paces = points.map((p) => p.pace);
  const lo = Math.min(...paces), hi = Math.max(...paces);
  const span = Math.max(hi - lo, 1);
  const x = (i: number) => (i / (points.length - 1)) * W;
  // faster (smaller sec/km) sits higher, which is what a runner expects
  const y = (p: number) => pad + ((p - lo) / span) * (H - pad * 2);

  const d = points.map((p, i) => `${i ? "L" : "M"} ${x(i)} ${y(p.pace)}`).join(" ");
  const mm = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" preserveAspectRatio="none"
           aria-label={`Pace across the run, from ${mm(lo)} to ${mm(hi)} per kilometre.`}>
        <path d={`${d} L ${W} ${H} L 0 ${H} Z`} fill="var(--color-accent)" opacity="0.14" />
        <path d={d} fill="none" stroke="var(--color-accent)" strokeWidth="2"
              strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="mt-1 flex justify-between">
        <span className="label text-good">{mm(lo)} fastest</span>
        <span className="label text-muted">{mm(hi)} slowest</span>
      </figcaption>
    </figure>
  );
}

/** Circular progress, the icon-row shape the references use for quick stats. */
export function Ring({
  value, goal, label, sub, size = 68,
}: { value: number; goal: number; label: string; sub: string; size?: number }) {
  const r = (size - 7) / 2;
  const c = 2 * Math.PI * r;
  const pct = goal > 0 ? Math.min(value / goal, 1) : 0;
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
           aria-label={`${label}: ${sub}, ${Math.round(pct * 100)}% of goal`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
                stroke="var(--color-raised)" strokeWidth="5" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
                stroke="var(--color-accent)" strokeWidth="5" strokeLinecap="round"
                strokeDasharray={`${c * pct} ${c}`}
                transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
              className="stat" fontSize={size * 0.24} fill="var(--color-ink)">{sub}</text>
      </svg>
      <span className="label truncate text-muted">{label}</span>
    </div>
  );
}
