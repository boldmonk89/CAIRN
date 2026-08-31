"use client";

import Link from "next/link";
import { useState } from "react";
import { AreaChart, Ring } from "@/components/chart";
import { Button, Card, Empty } from "@/components/ui";
import { RunCard } from "@/components/run-card";
import { Clock, Flame, Medal, Play, Ruler, User } from "@/components/icons";
import { putRun, useProfile, useRuns } from "@/lib/db";
import { demoRun } from "@/lib/demo";
import { thisWeek, totals, type Run } from "@/lib/runs";
import { duration, km } from "@/lib/format";

const RANGES = { Week: 7, Month: 30, Year: 365 } as const;
type Range = keyof typeof RANGES;

/** distance per day across the window, oldest first */
function daily(runs: Run[], days: number) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  const buckets = new Array(days).fill(0);
  for (const r of runs) {
    const i = Math.floor((r.startedAt - start.getTime()) / 86_400_000);
    if (i >= 0 && i < days) buckets[i] += r.distance;
  }
  return { buckets, start };
}

/** thin the x labels so they never collide at 320px */
function labelsFor(days: number, start: Date) {
  const every = days <= 7 ? 1 : days <= 30 ? 7 : 60;
  return Array.from({ length: days }, (_, i) => {
    if (i % every !== 0 && i !== days - 1) return "";
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return days <= 7
      ? d.toLocaleDateString(undefined, { weekday: "narrow" })
      : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  });
}

export default function HomePage() {
  const { runs, error, reload } = useRuns();
  const { profile } = useProfile();
  const [range, setRange] = useState<Range>("Week");

  if (error) return <Empty title="Can't read your runs" body={error} />;
  if (!runs) return <div className="px-4 pt-8 label text-muted">Loading…</div>;

  const days = RANGES[range];
  const { buckets, start } = daily(runs, days);
  const window = totals(runs.filter((r) => r.startedAt >= start.getTime()));
  const week = totals(thisWeek(runs));

  return (
    <div className="pb-32">
      {/* header: mark on the left, actions on the right — the shape every
          reference screen opens with */}
      <header className="flex items-center gap-2 px-4 pt-5">
        <p className="display flex-1 text-2xl">Cairn</p>
        <Link href="/records" aria-label="Your records"
              className="grid h-11 w-11 cursor-pointer place-items-center rounded-full text-muted transition-colors duration-200 hover:bg-raised hover:text-ink">
          <Medal size={20} />
        </Link>
        <Link href="/you" aria-label="Your profile"
              className="grid h-11 w-11 cursor-pointer place-items-center rounded-full text-muted transition-colors duration-200 hover:bg-raised hover:text-ink">
          <User size={20} />
        </Link>
      </header>

      <h1 className="display mt-3 px-4 text-[clamp(2.25rem,11vw,3.25rem)]">
        {runs.length === 0 ? "Start\nsomething." : `Hello,\n${profile.name}.`}
      </h1>

      {/* range chips, directly under the title */}
      <div className="rail mt-4 flex gap-2 px-4">
        {(Object.keys(RANGES) as Range[]).map((r) => (
          <button
            key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)}
            className={`min-h-11 shrink-0 cursor-pointer rounded-full border px-5 text-sm font-medium transition-colors duration-200 ${
              range === r ? "border-accent bg-accent text-accent-ink" : "border-line bg-card text-ink hover:border-muted"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {/* four rings, the quick-stat row the references run under the header */}
      <div className="mt-5 grid grid-cols-4 gap-2 px-4">
        <Ring label="Distance" sub={km(window.distance, 0)} value={window.distance} goal={days * 4000} />
        <Ring label="Runs" sub={String(window.runs)} value={window.runs} goal={Math.max(days / 2, 1)} />
        <Ring label="Hours" sub={String(Math.round(window.movingMs / 3_600_000))} value={window.movingMs} goal={days * 1_800_000} />
        <Ring label="Kcal" sub={window.calories > 999 ? `${Math.round(window.calories / 1000)}k` : String(window.calories)} value={window.calories} goal={days * 400} />
      </div>

      <Card className="mx-4 mt-5 p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <p className="label text-muted">Distance · last {days} days</p>
          <p className="stat text-lg">{km(window.distance, 1)}<span className="ml-1 text-xs text-muted">km</span></p>
        </div>
        <AreaChart
          values={buckets.map((m) => m / 1000)}
          labels={labelsFor(days, start)}
          format={(v) => `${v.toFixed(1)} km`}
          caption={`Distance per day over the last ${days} days`}
        />
      </Card>

      <div className="px-4">
        <Link
          href="/record"
          className="mt-5 flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent px-5 font-semibold text-accent-ink transition-[filter] duration-200 hover:brightness-110"
        >
          <Play size={20} /> Record a run
        </Link>

        {week.runs > 0 && (
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span className="flex items-center gap-1.5"><Ruler size={13} />{km(week.distance, 1)} km this week</span>
            <span className="flex items-center gap-1.5"><Clock size={13} />{duration(week.movingMs)}</span>
            <span className="flex items-center gap-1.5"><Flame size={13} />{week.calories.toLocaleString()} kcal</span>
          </p>
        )}

        <section className="mt-9">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="display text-xl">Recent</h2>
            {runs.length > 3 && (
              <Link href="/activities" className="label cursor-pointer text-accent">All {runs.length}</Link>
            )}
          </div>

          {runs.length === 0 ? (
            <Empty
              title="No runs yet"
              body="Hit record, go outside, come back with a line on a map and a number to beat."
              action={<Button variant="ghost" onClick={() => putRun(demoRun()).then(reload)}>Load a demo run instead</Button>}
            />
          ) : (
            <ul className="grid gap-4">
              {runs.slice(0, 3).map((r) => <RunCard key={r.id} run={r} />)}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
