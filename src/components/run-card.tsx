"use client";

import Link from "next/link";
import { Flame, Medal, Mountain } from "./icons";
import { pace } from "@/lib/geo";
import { dateLabel, duration, km, paceLabel, timeLabel } from "@/lib/format";
import type { Run } from "@/lib/runs";

/** Route as a plain SVG polyline — a list of these should not spin up a Leaflet
 *  map each. Sized to fill whatever box it is given. */
export function RouteGlyph({ run, className = "" }: { run: Run; className?: string }) {
  const pts = run.track;
  if (pts.length < 2) return null;

  const kx = Math.cos((pts[0].lat * Math.PI) / 180);
  const xs = pts.map((p) => p.lon * kx);
  const ys = pts.map((p) => -p.lat);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1e-9);
  const spanY = Math.max(maxY - minY, 1e-9);
  const scale = Math.min(96 / spanX, 96 / spanY);
  const path = xs
    .map((x, i) =>
      `${((x - minX) * scale + (100 - spanX * scale) / 2).toFixed(1)},${((ys[i] - minY) * scale + (100 - spanY * scale) / 2).toFixed(1)}`)
    .join(" ");

  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden preserveAspectRatio="xMidYMid meet">
      <polyline points={path} fill="none" stroke="currentColor"
                strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/**
 * A tall media block with the numbers sitting over it — the shape the
 * references use for their main content cards, rather than a text row with a
 * thumbnail beside it.
 */
export function RunCard({ run, medals = 0 }: { run: Run; medals?: number }) {
  const stats: [string, string][] = [
    ["Distance", `${km(run.distance)} km`],
    ["Time", duration(run.movingMs)],
    ["Pace", `${paceLabel(pace(run.distance, run.movingMs))}`],
  ];

  return (
    <li>
      <Link
        href={{ pathname: "/run", query: { id: run.id } }}
        className="group block cursor-pointer overflow-hidden rounded-xl border border-line bg-card transition-colors duration-200 hover:border-muted"
      >
        <div className="relative h-44 overflow-hidden bg-raised">
          <RouteGlyph run={run} className="absolute inset-0 h-full w-full p-6 text-accent" />
          {/* the scrim is what keeps the overlaid text above 4.5:1 on any route */}
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-card via-card/85 to-transparent" />

          <div className="absolute left-4 right-4 top-4 flex items-start gap-2">
            <p className="label flex-1 text-muted">
              {dateLabel(run.startedAt)} · {timeLabel(run.startedAt)}
            </p>
            {medals > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-gold/15 px-2 py-1 text-gold">
                <Medal size={13} />
                <span className="label">{medals}</span>
              </span>
            )}
          </div>

          <h3 className="display absolute bottom-3 left-4 right-4 truncate text-2xl">{run.title}</h3>
        </div>

        <dl className="grid grid-cols-3 divide-x divide-line border-t border-line">
          {stats.map(([label, value]) => (
            <div key={label} className="px-3 py-3">
              <dt className="label text-muted">{label}</dt>
              <dd className="stat mt-0.5 text-lg">{value}</dd>
            </div>
          ))}
        </dl>

        {(run.calories > 0 || run.elevation >= 10) && (
          <p className="flex items-center gap-4 border-t border-line px-3 py-2 text-xs text-muted">
            {run.calories > 0 && (
              <span className="flex items-center gap-1.5"><Flame size={13} />{run.calories} kcal</span>
            )}
            {run.elevation >= 10 && (
              <span className="flex items-center gap-1.5"><Mountain size={13} />{Math.round(run.elevation)} m up</span>
            )}
          </p>
        )}
      </Link>
    </li>
  );
}
