import { describe, expect, it } from "vitest";
import type { Fix } from "./geo";
import { achievementsFor, personalBests, summarise, thisWeek, totals, type Run } from "./runs";

const DEG = 1 / 111_194.93;

/** a straight run at a steady pace, starting at `startedAt` */
function track(metres: number, secondsPerKm: number, startedAt = 0, climbPerKm = 0): Fix[] {
  const out: Fix[] = [];
  for (let m = 0; m <= metres; m += 10) {
    out.push({
      lat: m * DEG, lon: 0,
      t: startedAt + (m / 1000) * secondsPerKm * 1000,
      accuracy: 5,
      altitude: climbPerKm ? (m / 1000) * climbPerKm : null,
    });
  }
  return out;
}

const run = (id: string, metres: number, secPerKm: number, startedAt = 0, climbPerKm = 0): Run =>
  summarise(id, track(metres, secPerKm, startedAt, climbPerKm), id, 70);

describe("summarise", () => {
  it("derives the numbers a run card shows", () => {
    const r = run("a", 5000, 300);
    expect(r.distance).toBeGreaterThan(4980);
    expect(Math.round(r.movingMs / 1000)).toBeCloseTo(1500, -1);
    expect(r.calories).toBeGreaterThan(200);
    expect(r.startedAt).toBe(0);
  });

  it("does not fall over on a run with no fixes at all", () => {
    const r = summarise("empty", [], "Ghost run", 70);
    expect(r.distance).toBe(0);
    expect(r.calories).toBe(0);
    expect(r.movingMs).toBe(0);
  });
});

describe("personalBests", () => {
  it("keeps the fastest time at each distance across runs", () => {
    const pbs = personalBests([run("slow", 5000, 330), run("fast", 5000, 300)]);
    const fiveK = pbs.find((p) => p.label === "5K")!;
    expect(fiveK.runId).toBe("fast");
    expect(fiveK.seconds).toBeCloseTo(1500, -1);
  });

  it("records a 1K from a 5K run, but no 10K", () => {
    const labels = personalBests([run("a", 5000, 300)]).map((p) => p.label);
    expect(labels).toContain("1K");
    expect(labels).toContain("5K");
    expect(labels).not.toContain("10K");
  });

  it("has nothing to report with no runs", () => {
    expect(personalBests([])).toEqual([]);
  });
});

describe("achievementsFor", () => {
  it("calls the very first run a first run", () => {
    const a = achievementsFor(run("a", 3000, 330), []);
    expect(a.some((x) => x.kind === "first-run")).toBe(true);
  });

  it("awards a record when the run is genuinely faster", () => {
    const slow = run("slow", 5000, 330);
    const fast = run("fast", 5000, 300);
    const a = achievementsFor(fast, [slow]);
    const pb = a.find((x) => x.kind === "distance-pb" && x.label === "5K");
    expect(pb).toBeDefined();
    expect(pb!.detail).toMatch(/faster/);
  });

  it("awards nothing to a slower repeat of the same route", () => {
    const fast = run("fast", 5000, 300);
    const slow = run("slow", 5000, 330);
    expect(achievementsFor(slow, [fast])).toEqual([]);
  });

  it("does not let a run beat its own record", () => {
    // the classic off-by-one: passing the full history including this run
    const r = run("a", 5000, 300);
    const withItself = achievementsFor(r, [r]);
    expect(withItself.filter((x) => x.kind === "distance-pb")).toEqual([]);
  });

  it("flags the longest run and the biggest climb separately", () => {
    const before = run("before", 5000, 300, 0, 10);
    const longer = run("longer", 8000, 320, 100_000, 40);
    const a = achievementsFor(longer, [before]);
    expect(a.some((x) => x.kind === "longest")).toBe(true);
    expect(a.some((x) => x.kind === "most-elevation")).toBe(true);
  });

  it("does not award a climbing medal for flat GPS noise", () => {
    const a = achievementsFor(run("b", 6000, 330, 100_000), [run("a", 5000, 330)]);
    expect(a.some((x) => x.kind === "most-elevation")).toBe(false);
  });

  it("treats a new longer distance as a first, not as beating a record", () => {
    const a = achievementsFor(run("ten", 10_000, 330, 100_000), [run("five", 5000, 300)]);
    const tenK = a.find((x) => x.kind === "distance-pb" && x.label === "10K");
    expect(tenK!.title).toBe("First 10K");
  });
});

describe("totals and thisWeek", () => {
  it("adds up every run", () => {
    const t = totals([run("a", 5000, 300), run("b", 3000, 330)]);
    expect(t.runs).toBe(2);
    expect(t.distance).toBeGreaterThan(7900);
    expect(t.calories).toBeGreaterThan(0);
  });

  it("counts from Monday, not from seven days ago", () => {
    // local dates, because "this week" means the runner's week, not UTC's
    const wed = new Date(2026, 8, 2, 10).getTime(); // Wednesday
    const monday = new Date(2026, 7, 31, 6).getTime(); // same week
    const sunday = new Date(2026, 7, 30, 20).getTime(); // the week before
    const week = thisWeek(
      [{ ...run("mon", 1000, 300), startedAt: monday },
       { ...run("sun", 1000, 300), startedAt: sunday }],
      wed,
    );
    expect(week.map((r) => r.id)).toEqual(["mon"]);
  });

  it("is empty, not broken, with no runs", () => {
    expect(totals([]).distance).toBe(0);
    expect(thisWeek([])).toEqual([]);
  });
});
