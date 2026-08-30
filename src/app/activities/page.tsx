"use client";

import { Empty, Stat, Card } from "@/components/ui";
import { RunCard } from "@/components/run-card";
import { useRuns } from "@/lib/db";
import { totals } from "@/lib/runs";
import { duration, km } from "@/lib/format";

export default function ActivitiesPage() {
  const { runs, error } = useRuns();
  if (error) return <Empty title="Can't read your runs" body={error} />;
  if (!runs) return <div className="p-5 label text-muted">Loading…</div>;

  const all = totals(runs);

  return (
    <div className="px-5 pb-32 pt-8">
      <h1 className="display text-[clamp(2.25rem,10vw,3rem)]">Activities</h1>

      <Card className="mt-6 p-5">
        <p className="label text-muted">All time</p>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Stat label="Distance" value={km(all.distance, 1)} unit="km" />
          <Stat label="Time" value={duration(all.movingMs)} />
          <Stat label="Runs" value={all.runs} />
        </div>
      </Card>

      {runs.length === 0 ? (
        <Empty title="Nothing here yet" body="Your saved runs will stack up on this page." />
      ) : (
        <ul className="mt-6 grid gap-3">
          {runs.map((r) => <RunCard key={r.id} run={r} />)}
        </ul>
      )}
    </div>
  );
}
