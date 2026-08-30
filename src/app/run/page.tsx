"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { RouteMap } from "@/components/route-map";
import { ShareCard } from "@/components/share-card";
import { Button, Card, Empty, Sheet, Stat, inputClass } from "@/components/ui";
import { Back, Clock, Flame, Medal, Mountain, Ruler, Share, Trash } from "@/components/icons";
import { getRun, putRun, removeRun } from "@/lib/db";
import { bestsFor, PB_DISTANCES, type Achievement, type Run } from "@/lib/runs";
import { pace, splits, withDistance } from "@/lib/geo";
import { dateLabel, duration, km, paceLabel, timeLabel } from "@/lib/format";

function RunDetail() {
  const id = useSearchParams().get("id") ?? "";
  const router = useRouter();
  const [run, setRun] = useState<Run | null | undefined>(undefined);
  const [earned, setEarned] = useState<Achievement[]>([]);
  const [sharing, setSharing] = useState<Achievement | null | "run">(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (!id) { setRun(null); return; }
    getRun(id).then((r) => {
      setRun(r ?? null);
      if (r) setTitle(r.title);
    });
    // medals are handed over from the recorder for this one visit
    try {
      const raw = sessionStorage.getItem(`cairn.earned.${id}`);
      if (raw) {
        setEarned(JSON.parse(raw));
        sessionStorage.removeItem(`cairn.earned.${id}`);
      }
    } catch { /* no session storage: just skip the celebration */ }
  }, [id]);

  const analysis = useMemo(() => {
    if (!run) return null;
    const pts = withDistance(run.track);
    const kmSplits = splits(pts);
    const fastest = Math.min(...kmSplits.map((s) => s.pace ?? Infinity));
    return { kmSplits, fastest, bests: bestsFor(run) };
  }, [run]);

  if (run === undefined) return <div className="p-5 label text-muted">Loading…</div>;
  if (run === null) {
    return (
      <div className="pt-10">
        <Empty
          title="That run is gone"
          body="It may have been deleted."
          action={<Link href="/activities"><Button variant="ghost">Back to activities</Button></Link>}
        />
      </div>
    );
  }

  async function saveTitle() {
    const next = title.trim();
    if (!run || !next || next === run.title) return;
    const updated = { ...run, title: next };
    await putRun(updated);
    setRun(updated);
  }

  const avg = pace(run.distance, run.movingMs);

  return (
    <div className="pb-32">
      <div className="relative h-60 border-b border-line">
        <RouteMap track={run.track} className="absolute inset-0 h-full w-full" />
        <Link
          href="/activities"
          aria-label="Back to activities"
          className="absolute left-3 top-3 z-[1000] grid h-11 w-11 cursor-pointer place-items-center rounded-full border border-line bg-ground/90 text-ink backdrop-blur"
        >
          <Back />
        </Link>
      </div>

      <div className="px-5 pt-6">
        <p className="label text-muted">
          {dateLabel(run.startedAt)} · {timeLabel(run.startedAt)}
        </p>
        <label className="mt-1 block">
          <span className="sr-only">Run title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            maxLength={80}
            className="display w-full bg-transparent text-[clamp(2rem,9vw,2.75rem)] outline-none focus-visible:outline-2 focus-visible:outline-accent"
          />
        </label>

        {earned.length > 0 && (
          <section className="mt-6 grid gap-3" aria-label="Records set on this run">
            {earned.map((a, i) => (
              <Card key={i} className="flex items-center gap-4 border-gold/40 bg-gold/10 p-4">
                <Medal size={30} className="shrink-0 text-gold" />
                <div className="min-w-0 flex-1">
                  <p className="display text-xl text-gold">{a.title}</p>
                  <p className="text-sm text-muted">{a.detail}</p>
                </div>
                <Button variant="ghost" onClick={() => setSharing(a)} className="min-h-11 shrink-0 px-3">
                  <Share size={18} />
                  <span className="sr-only">Share this record</span>
                </Button>
              </Card>
            ))}
          </section>
        )}

        <div className="mt-7">
          <Stat label="Distance" value={<span className="text-accent">{km(run.distance)}</span>} unit="km" size="hero" />
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-4">
          {[
            [<Clock key="c" size={15} />, "Moving time", duration(run.movingMs)],
            [<Clock key="e" size={15} />, "Elapsed", duration(run.elapsedMs)],
            [<Ruler key="p" size={15} />, "Avg pace", `${paceLabel(avg)} /km`],
            [<Flame key="k" size={15} />, "Calories", `${run.calories} kcal`],
            [<Mountain key="m" size={15} />, "Elevation", `${Math.round(run.elevation)} m`],
            [<Ruler key="g" size={15} />, "GPS points", String(run.track.length)],
          ].map(([icon, label, value]) => (
            <Card key={String(label)} className="p-4">
              <dt className="label flex items-center gap-1.5 text-muted">{icon}{label}</dt>
              <dd className="stat mt-1 text-2xl">{value}</dd>
            </Card>
          ))}
        </dl>

        <Button onClick={() => setSharing("run")} className="mt-5 flex w-full items-center justify-center gap-2">
          <Share size={18} /> Share this run
        </Button>

        {analysis && analysis.kmSplits.length > 0 && (
          <section className="mt-9">
            <h2 className="display mb-3 text-xl">Splits</h2>
            <Card className="divide-y divide-line">
              {analysis.kmSplits.map((s) => {
                const width = s.pace && Number.isFinite(analysis.fastest)
                  ? Math.max(8, (analysis.fastest / s.pace) * 100)
                  : 8;
                const isFastest = s.pace === analysis.fastest;
                return (
                  <div key={s.index} className="flex items-center gap-3 p-3">
                    <span className="stat w-8 shrink-0 text-sm text-muted">
                      {s.distance === 1000 ? s.index : km(s.distance, 2)}
                    </span>
                    <div className="h-7 flex-1 overflow-hidden rounded-md bg-raised">
                      <div
                        className={`h-full rounded-md ${isFastest ? "bg-gold" : "bg-accent"}`}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                    <span className="stat w-20 shrink-0 text-right text-sm">
                      {paceLabel(s.pace)}
                      <span className="text-muted"> /km</span>
                    </span>
                  </div>
                );
              })}
            </Card>
            <p className="mt-2 text-xs text-muted">
              Bar length is speed, so longer is faster. Gold is your quickest kilometre.
            </p>
          </section>
        )}

        {analysis && Object.keys(analysis.bests).length > 0 && (
          <section className="mt-9">
            <h2 className="display mb-3 text-xl">Best efforts</h2>
            <Card className="divide-y divide-line">
              {PB_DISTANCES.filter((d) => analysis.bests[d.label]).map((d) => (
                <div key={d.label} className="flex items-center justify-between p-3">
                  <span className="label text-muted">{d.label}</span>
                  <span className="stat text-lg">{duration(analysis.bests[d.label]! * 1000)}</span>
                </div>
              ))}
            </Card>
            <p className="mt-2 text-xs text-muted">
              The fastest stretch of this run covering each distance, wherever it happened.
            </p>
          </section>
        )}

        <Button variant="danger" onClick={() => setConfirmDelete(true)} className="mt-9 flex w-full items-center justify-center gap-2">
          <Trash size={18} /> Delete this run
        </Button>
      </div>

      <ShareCard
        run={run}
        achievement={sharing === "run" ? null : sharing}
        open={sharing !== null}
        onClose={() => setSharing(null)}
      />

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this run?">
        <p className="text-sm text-muted">
          {km(run.distance)} km, {duration(run.movingMs)}, recorded {dateLabel(run.startedAt)}. The
          GPS track goes with it and there is no undo.
        </p>
        <div className="mt-5 flex gap-3">
          <Button variant="ghost" onClick={() => setConfirmDelete(false)} className="flex-1">Keep it</Button>
          <Button
            variant="danger"
            className="flex-1"
            onClick={async () => { await removeRun(run.id); router.replace("/activities"); }}
          >
            Delete
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

export default function RunPage() {
  return (
    <Suspense fallback={<div className="p-5 label text-muted">Loading…</div>}>
      <RunDetail />
    </Suspense>
  );
}
