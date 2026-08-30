"use client";

import Link from "next/link";
import { Card } from "./ui";
import { Flame, Mountain } from "./icons";
import { pace } from "@/lib/geo";
import { dateLabel, duration, km, paceLabel, timeLabel } from "@/lib/format";
import type { Run } from "@/lib/runs";

/** Route drawn as a plain SVG polyline — a list of twelve of these should not
 *  spin up twelve Leaflet maps. */
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
    .map((x, i) => `${((x - minX) * scale + (100 - spanX * scale) / 2).toFixed(1)},${((ys[i] - minY) * scale + (100 - spanY * scale) / 2).toFixed(1)}`)
    .join(" ");

  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <polyline
        points={path} fill="none" stroke="currentColor"
        strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round"
      />
    </svg>
  );
}

export function RunCard({ run }: { run: Run }) {
  return (
    <Card as="li" className="overflow-hidden">
      <Link href={`/runs/${run.id}`} className="block cursor-pointer p-4 transition-colors duration-200 hover:bg-raised">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <p className="label text-muted">
              {dateLabel(run.startedAt)} · {timeLabel(run.startedAt)}
            </p>
            <h3 className="display mt-1 truncate text-2xl">{run.title}</h3>
          </div>
          <RouteGlyph run={run} className="h-14 w-14 shrink-0 text-accent" />
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-2">
          {[
            ["Distance", `${km(run.distance)} km`],
            ["Time", duration(run.movingMs)],
            ["Pace", `${paceLabel(pace(run.distance, run.movingMs))} /km`],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="label text-muted">{label}</dt>
              <dd className="stat mt-0.5 text-lg">{value}</dd>
            </div>
          ))}
        </dl>

        {(run.calories > 0 || run.elevation >= 10) && (
          <p className="mt-3 flex items-center gap-4 text-xs text-muted">
            {run.calories > 0 && (
              <span className="flex items-center gap-1.5"><Flame size={14} />{run.calories} kcal</span>
            )}
            {run.elevation >= 10 && (
              <span className="flex items-center gap-1.5"><Mountain size={14} />{Math.round(run.elevation)} m up</span>
            )}
          </p>
        )}
      </Link>
    </Card>
  );
}
