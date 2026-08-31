"use client";

import Link from "next/link";
import { useState } from "react";
import { AreaChart } from "@/components/chart";
import { Button, Empty } from "@/components/ui";
import { RunCard, RunRow } from "@/components/run-card";
import { Medal, Play, User } from "@/components/icons";
import { putRun, useProfile, useRuns } from "@/lib/db";
import { demoRun } from "@/lib/demo";
import { thisWeek, totals, type Run } from "@/lib/runs";
import { duration, km } from "@/lib/format";

const RANGES = { Week: 7, Month: 30, Year: 365 } as const;
type Range = keyof typeof RANGES;

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

/** Dense stat strip: hairline rules between, not four boxes in a grid. */
function Strip({ items }: { items: [string, string, string?][] }) {
  return (
    <dl className="flex divide-x divide-line border-y border-line">
      {items.map(([label, value, unit]) => (
        <div key={label} className="min-w-0 flex-1 py-3 pl-3 first:pl-0">
          <dt className="label text-muted">{label}</dt>
          <dd className="stat mt-1 truncate text-xl">
            {value}
            {unit && <span className="ml-1 text-[10px] text-muted">{unit}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
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
  const week = thisWeek(runs);
  const [hero, ...rest] = runs;

  return (
    <div className="pb-32">
      <header className="flex items-center gap-1 px-4 pt-5">
        <p className="label flex-1 text-muted">Cairn</p>
        <Link href="/records" aria-label="Your records"
              className="grid h-11 w-11 cursor-pointer place-items-center rounded-full text-muted transition-colors duration-200 hover:bg-card hover:text-ink">
          <Medal size={19} />
        </Link>
        <Link href="/you" aria-label="Your profile"
              className="grid h-11 w-11 cursor-pointer place-items-center rounded-full text-muted transition-colors duration-200 hover:bg-card hover:text-ink">
          <User size={19} />
        </Link>
      </header>

      {/* The hero is one number, not a grid of four. Scale is the whole point:
          if everything is medium-sized, nothing has been designed. */}
      <section className="mt-6 px-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="label text-muted">{range === "Week" ? "This week" : `Last ${days} days`}</p>
          <div className="flex gap-1">
            {(Object.keys(RANGES) as Range[]).map((r) => (
              <button
                key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)}
                className={`label min-h-11 cursor-pointer px-2 transition-colors duration-200 ${
                  range === r ? "text-ink underline decoration-accent decoration-2 underline-offset-8" : "text-muted hover:text-ink"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <p className="mt-1 flex items-baseline gap-2">
          <span className="display text-[clamp(4.5rem,26vw,7rem)] leading-[0.82] text-ink">
            {km(window.distance, 1)}
          </span>
          <span className="label pb-2 text-accent">km</span>
        </p>
      </section>

      <div className="mt-5 px-4">
        <Strip items={[
          ["Runs", String(window.runs)],
          ["Time", duration(window.movingMs)],
          ["Energy", window.calories > 999 ? `${(window.calories / 1000).toFixed(1)}k` : String(window.calories), "kcal"],
        ]} />
      </div>

      {/* full bleed, no card: the plot is the content, a border around it is
          just another box */}
      <section className="mt-8 px-4">
        <AreaChart
          values={buckets.map((m) => m / 1000)}
          labels={labelsFor(days, start)}
          height={132}
          format={(v) => `${v.toFixed(1)} km`}
          caption={`Distance per day over the last ${days} days`}
        />
      </section>

      <div className="mt-8 px-4">
        <Link
          href="/record"
          className="group flex min-h-14 cursor-pointer items-center gap-3 rounded-xl bg-accent px-5 text-accent-ink transition-[filter] duration-200 hover:brightness-110"
        >
          <Play size={18} />
          <span className="flex-1 font-semibold">Record a run</span>
          <span className="label opacity-70">GPS</span>
        </Link>
      </div>

      <section className="mt-12 px-4">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="display text-2xl">
            {runs.length === 0 ? "Nothing yet" : week.length > 0 ? "Lately" : "Last time out"}
          </h2>
          {runs.length > 4 && (
            <Link href="/activities" className="label cursor-pointer text-accent">All {runs.length}</Link>
          )}
        </div>

        {runs.length === 0 ? (
          <Empty
            title={`Hello, ${profile.name}.`}
            body="Hit record, go outside, come back with a line on a map and a number to beat."
            action={<Button variant="ghost" onClick={() => putRun(demoRun()).then(reload)}>Load a demo run instead</Button>}
          />
        ) : (
          <>
            {/* one hero, then dense rows — hierarchy instead of repetition */}
            <ul><RunCard run={hero} /></ul>
            {rest.length > 0 && (
              <ul className="mt-6 border-t border-line">
                {rest.slice(0, 4).map((r) => <RunRow key={r.id} run={r} />)}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}
