// A saved run, and the maths behind records and medals. Pure functions only —
// storage lives in db.ts so this file can be tested without a browser.

import {
  bestEffort, calories, elevationGain, movingTime, elapsedTime,
  totalDistance, withDistance, type Fix,
} from "./geo";

/**
 * Bumped whenever the maths that derives a run's numbers changes, so already
 * saved runs get recomputed from their raw track instead of keeping figures
 * produced by an older, wronger version.
 *   1 -> 2: GPS noise was being integrated as distance, inflating a walk by
 *           nearly 4x and reporting a 3:00/km pace for it.
 */
export const RUN_VERSION = 2;

export interface Run {
  id: string;
  v?: number;
  startedAt: number; // epoch ms
  title: string;
  note?: string;
  track: Fix[]; // already cleaned when saved
  // Derived once at save time. The list screen shouldn't re-walk 3000 GPS
  // points per card just to draw a number.
  distance: number; // metres
  movingMs: number;
  elapsedMs: number;
  elevation: number; // metres climbed
  calories: number;
}

/** The distances every running app keeps a record for. */
export const PB_DISTANCES = [
  { metres: 1000, label: "1K" },
  { metres: 5000, label: "5K" },
  { metres: 10000, label: "10K" },
  { metres: 21097.5, label: "Half" },
  { metres: 42195, label: "Marathon" },
] as const;

export type PbLabel = (typeof PB_DISTANCES)[number]["label"];

/** Build a Run from a raw track. The single place derived numbers are computed. */
export function summarise(
  id: string, track: Fix[], title: string, weightKg: number, note?: string,
): Run {
  const pts = withDistance(track);
  const distance = totalDistance(pts);
  const movingMs = movingTime(pts);
  return {
    id,
    v: RUN_VERSION,
    startedAt: track[0]?.t ?? Date.now(),
    title,
    note,
    track,
    distance,
    movingMs,
    elapsedMs: elapsedTime(pts),
    elevation: elevationGain(pts),
    calories: calories(distance, movingMs, weightKg),
  };
}

/** Fastest time this run covered each standard distance, where it went that far. */
export function bestsFor(run: Run): Partial<Record<PbLabel, number>> {
  const pts = withDistance(run.track);
  const out: Partial<Record<PbLabel, number>> = {};
  for (const { metres, label } of PB_DISTANCES) {
    const effort = bestEffort(pts, metres);
    if (effort) out[label] = effort.seconds;
  }
  return out;
}

export interface PersonalBest {
  label: PbLabel;
  seconds: number;
  runId: string;
  startedAt: number;
}

/** The standing record at each distance across every run given. */
export function personalBests(runs: Run[]): PersonalBest[] {
  const best = new Map<PbLabel, PersonalBest>();
  for (const run of runs) {
    for (const [label, seconds] of Object.entries(bestsFor(run)) as [PbLabel, number][]) {
      const held = best.get(label);
      if (!held || seconds < held.seconds) {
        best.set(label, { label, seconds, runId: run.id, startedAt: run.startedAt });
      }
    }
  }
  return PB_DISTANCES.map((d) => best.get(d.label)).filter((x): x is PersonalBest => !!x);
}

export type Achievement =
  | { kind: "first-run"; title: string; detail: string }
  | { kind: "distance-pb"; title: string; detail: string; label: PbLabel; seconds: number }
  | { kind: "longest"; title: string; detail: string; metres: number }
  | { kind: "most-elevation"; title: string; detail: string; metres: number };

/**
 * What this run beat. `previous` must NOT include the run itself, or every run
 * ties its own record and nothing is ever a personal best.
 */
export function achievementsFor(run: Run, previous: Run[]): Achievement[] {
  const out: Achievement[] = [];

  if (previous.length === 0) {
    out.push({
      kind: "first-run", title: "First run",
      detail: "The hardest one. Everything from here is a record.",
    });
  }

  const held = new Map(personalBests(previous).map((p) => [p.label, p.seconds]));
  for (const [label, seconds] of Object.entries(bestsFor(run)) as [PbLabel, number][]) {
    const old = held.get(label);
    if (old === undefined) {
      out.push({
        kind: "distance-pb", label, seconds,
        title: `First ${label}`, detail: `Your first recorded ${label}.`,
      });
    } else if (seconds < old) {
      out.push({
        kind: "distance-pb", label, seconds,
        title: `${label} record`, detail: `${Math.round(old - seconds)}s faster than your best.`,
      });
    }
  }

  // A margin, not an exact >. Two runs of the same route measure slightly
  // differently — GPS smoothing is time-dependent, so the slower lap comes out
  // marginally longer — and "longest run" by three metres is not an
  // achievement anyone wants to be shown.
  const farthest = Math.max(0, ...previous.map((r) => r.distance));
  if (previous.length > 0 && run.distance > farthest * 1.02) {
    out.push({
      kind: "longest", metres: run.distance,
      title: "Longest run",
      detail: `${((run.distance - farthest) / 1000).toFixed(2)} km past your previous furthest.`,
    });
  }

  const highest = Math.max(0, ...previous.map((r) => r.elevation));
  if (previous.length > 0 && run.elevation > highest * 1.05 && run.elevation >= 10) {
    out.push({
      kind: "most-elevation", metres: run.elevation,
      title: "Most climbing",
      detail: `${Math.round(run.elevation)} m up, your biggest yet.`,
    });
  }

  return out;
}

export interface Totals {
  runs: number;
  distance: number;
  movingMs: number;
  elevation: number;
  calories: number;
}

export const totals = (runs: Run[]): Totals => ({
  runs: runs.length,
  distance: runs.reduce((s, r) => s + r.distance, 0),
  movingMs: runs.reduce((s, r) => s + r.movingMs, 0),
  elevation: runs.reduce((s, r) => s + r.elevation, 0),
  calories: runs.reduce((s, r) => s + r.calories, 0),
});

/** Runs since the most recent Monday, for the "this week" strip. */
export function thisWeek(runs: Run[], now = Date.now()): Run[] {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  return runs.filter((r) => r.startedAt >= d.getTime());
}
