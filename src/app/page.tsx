"use client";

import Link from "next/link";
import { Button, Card, Empty, Stat } from "@/components/ui";
import { RunCard } from "@/components/run-card";
import { Medal, Play } from "@/components/icons";
import { putRun, useProfile, useRuns } from "@/lib/db";
import { demoRun } from "@/lib/demo";
import { personalBests, thisWeek, totals } from "@/lib/runs";
import { duration, km } from "@/lib/format";
import { paceLabel } from "@/lib/format";

export default function HomePage() {
  const { runs, error, reload } = useRuns();
  const { profile } = useProfile();

  if (error) {
    return (
      <Empty title="Can't read your runs" body={error} />
    );
  }
  if (!runs) return <div className="p-5 label text-muted">Loading…</div>;

  const week = totals(thisWeek(runs));
  const pbs = personalBests(runs);

  return (
    <div className="px-4 pb-32 pt-8">
      <p className="label text-muted">Cairn</p>
      <h1 className="display mt-2 text-[clamp(2.5rem,12vw,3.5rem)]">
        {runs.length === 0 ? "Start\nsomething." : `Hello,\n${profile.name}.`}
      </h1>

      <Card className="mt-7 p-5">
        <p className="label text-muted">This week</p>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Stat label="Distance" value={km(week.distance, 1)} unit="km" />
          <Stat label="Time" value={duration(week.movingMs)} />
          <Stat label="Runs" value={week.runs} />
        </div>
      </Card>

      <Link
        href="/record"
        className="mt-4 flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-accent px-5 font-semibold text-accent-ink transition-[filter] duration-200 hover:brightness-110"
      >
        <Play size={20} /> Record a run
      </Link>

      {pbs.length > 0 && (
        <section className="mt-9">
          <div className="mb-3 flex items-center gap-2">
            <Medal size={18} className="text-gold" />
            <h2 className="display text-xl">Personal bests</h2>
          </div>
          <ul className="rail flex gap-3">
            {pbs.map((pb) => (
              <li key={pb.label}>
                <Link href={{ pathname: "/run", query: { id: pb.runId } }}>
                  <Card className="min-w-28 cursor-pointer p-4 transition-colors duration-200 hover:border-gold">
                    <p className="label text-gold">{pb.label}</p>
                    <p className="stat mt-1 text-2xl">{duration(pb.seconds * 1000)}</p>
                    <p className="label mt-1 text-muted">
                      {paceLabel(pb.seconds / (({"1K":1,"5K":5,"10K":10,"Half":21.0975,"Marathon":42.195})[pb.label]))} /km
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-9">
        <h2 className="display mb-3 text-xl">Recent</h2>
        {runs.length === 0 ? (
          <Empty
            title="No runs yet"
            body="Hit record, go outside, come back with a line on a map and a number to beat."
            action={
              <Button
                variant="ghost"
                onClick={() => putRun(demoRun()).then(reload)}
              >
                Load a demo run instead
              </Button>
            }
          />
        ) : (
          <>
            <ul className="grid gap-3">
              {runs.slice(0, 5).map((r) => <RunCard key={r.id} run={r} />)}
            </ul>
            {runs.length > 5 && (
              <Link href="/activities" className="label mt-4 block cursor-pointer text-accent underline">
                All {runs.length} activities
              </Link>
            )}
          </>
        )}
      </section>
    </div>
  );
}
