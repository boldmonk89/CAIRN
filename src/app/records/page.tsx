"use client";

import Link from "next/link";
import { Card, Empty, Stat } from "@/components/ui";
import { Medal, Mountain, Ruler } from "@/components/icons";
import { useRuns } from "@/lib/db";
import { PB_DISTANCES, personalBests, totals } from "@/lib/runs";
import { dateLabel, duration, km, paceLabel } from "@/lib/format";

export default function RecordsPage() {
  const { runs, error } = useRuns();
  if (error) return <Empty title="Can't read your runs" body={error} />;
  if (!runs) return <div className="p-4 label text-muted">Loading…</div>;

  const pbs = personalBests(runs);
  const held = new Map(pbs.map((p) => [p.label, p]));
  const all = totals(runs);
  const longest = runs.reduce<(typeof runs)[number] | null>(
    (best, r) => (!best || r.distance > best.distance ? r : best), null);
  const highest = runs.reduce<(typeof runs)[number] | null>(
    (best, r) => (!best || r.elevation > best.elevation ? r : best), null);

  return (
    <div className="px-4 pb-32 pt-8">
      <p className="label text-muted">Medals</p>
      <h1 className="display mt-2 text-[clamp(2.5rem,12vw,3.5rem)]">Records</h1>

      {runs.length === 0 ? (
        <Empty
          title="Nothing to beat yet"
          body="Records appear the first time you run far enough to set one."
        />
      ) : (
        <>
          {/* every standard distance, including the ones still unclaimed —
              an empty slot is a target, which is the point of a medal case */}
          <ul className="mt-7 grid gap-3">
            {PB_DISTANCES.map(({ label, metres }) => {
              const pb = held.get(label);
              return (
                <li key={label}>
                  {pb ? (
                    <Link href={{ pathname: "/run", query: { id: pb.runId } }}>
                      <Card className="flex cursor-pointer items-center gap-4 p-4 transition-colors duration-200 hover:border-gold">
                        <Medal size={26} className="shrink-0 text-gold" />
                        <div className="min-w-0 flex-1">
                          <p className="label text-gold">{label}</p>
                          <p className="text-xs text-muted">{dateLabel(pb.startedAt)}</p>
                        </div>
                        <div className="text-right">
                          <p className="stat text-xl">{duration(pb.seconds * 1000)}</p>
                          <p className="stat text-xs text-muted">
                            {paceLabel(pb.seconds / (metres / 1000))} /km
                          </p>
                        </div>
                      </Card>
                    </Link>
                  ) : (
                    <Card className="flex items-center gap-4 border-dashed p-4 opacity-60">
                      <Medal size={26} className="shrink-0 text-muted" />
                      <p className="label flex-1 text-muted">{label}</p>
                      <p className="text-xs text-muted">
                        run {km(metres, metres >= 10000 ? 1 : 0)} km to claim it
                      </p>
                    </Card>
                  )}
                </li>
              );
            })}
          </ul>

          <h2 className="display mb-3 mt-9 text-xl">Furthest and highest</h2>
          <div className="grid grid-cols-2 gap-3">
            {longest && longest.distance > 0 && (
              <Link href={{ pathname: "/run", query: { id: longest.id } }}>
                <Card className="h-full cursor-pointer p-4 transition-colors duration-200 hover:border-gold">
                  <p className="label flex items-center gap-1.5 text-muted"><Ruler size={14} />Longest</p>
                  <p className="stat mt-1 text-2xl">{km(longest.distance)}<span className="ml-1 text-sm text-muted">km</span></p>
                  <p className="mt-1 text-xs text-muted">{dateLabel(longest.startedAt)}</p>
                </Card>
              </Link>
            )}
            {highest && highest.elevation >= 10 && (
              <Link href={{ pathname: "/run", query: { id: highest.id } }}>
                <Card className="h-full cursor-pointer p-4 transition-colors duration-200 hover:border-gold">
                  <p className="label flex items-center gap-1.5 text-muted"><Mountain size={14} />Most climbing</p>
                  <p className="stat mt-1 text-2xl">{Math.round(highest.elevation)}<span className="ml-1 text-sm text-muted">m</span></p>
                  <p className="mt-1 text-xs text-muted">{dateLabel(highest.startedAt)}</p>
                </Card>
              </Link>
            )}
          </div>

          <Card className="mt-4 p-4">
            <p className="label text-muted">Lifetime</p>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <Stat label="Distance" value={km(all.distance, 1)} unit="km" />
              <Stat label="Runs" value={all.runs} />
              <Stat label="Time" value={duration(all.movingMs)} />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
