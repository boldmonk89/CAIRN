import { describe, expect, it } from "vitest";
import {
  bestEffort, calories, cleanTrack, elevationGain, haversine, movingTime,
  pace, splits, totalDistance, withDistance, type Fix,
} from "./geo";

const fix = (lat: number, lon: number, t: number, accuracy = 5, altitude: number | null = null): Fix =>
  ({ lat, lon, t, accuracy, altitude });

/** a straight run north from the equator at a steady pace */
function straightRun(metres: number, secondsPerKm: number, stepM = 10, alt?: (m: number) => number) {
  // must match haversine's earth model, or the generated track and the measured
  // track disagree by ~0.1% and every assertion below inherits the drift
  const degPerMetre = 1 / 111_194.93;
  const out: Fix[] = [];
  for (let m = 0; m <= metres; m += stepM) {
    out.push(fix(m * degPerMetre, 0, (m / 1000) * secondsPerKm * 1000, 5, alt ? alt(m) : null));
  }
  return out;
}

describe("haversine", () => {
  it("matches a known long-distance pair within 0.5%", () => {
    // London Heathrow to JFK, ~5555 km by great circle
    const d = haversine(fix(51.4700, -0.4543, 0), fix(40.6413, -73.7781, 0));
    expect(d / 1000).toBeGreaterThan(5520);
    expect(d / 1000).toBeLessThan(5590);
  });

  it("measures a degree of latitude as about 111 km", () => {
    expect(haversine(fix(0, 0, 0), fix(1, 0, 0))).toBeCloseTo(111_195, -2);
  });

  it("is zero for the same point and symmetric", () => {
    const a = fix(28.6139, 77.2090, 0), b = fix(19.0760, 72.8777, 0);
    expect(haversine(a, a)).toBe(0);
    expect(haversine(a, b)).toBeCloseTo(haversine(b, a), 6);
  });
});

describe("cleanTrack", () => {
  it("drops fixes the receiver isn't sure about", () => {
    // 0.0001 deg is 11 m, so space the fixes 2 s apart: 5.5 m/s, a 3:00/km pace
    const kept = cleanTrack([fix(0, 0, 0, 5), fix(0.0001, 0, 2000, 90), fix(0.0002, 0, 4000, 5)]);
    expect(kept).toHaveLength(2);
    expect(kept.map((f) => f.accuracy)).toEqual([5, 5]);
  });

  it("drops a teleport but keeps the run either side of it", () => {
    const kept = cleanTrack([
      fix(0, 0, 0), fix(0.0001, 0, 2000),
      fix(5, 5, 4000), // 700+ km in two seconds
      fix(0.0002, 0, 6000),
    ]);
    expect(kept).toHaveLength(3);
    expect(kept.every((f) => f.lat < 1)).toBe(true);
  });

  it("drops duplicate and out-of-order timestamps", () => {
    expect(cleanTrack([fix(0, 0, 1000), fix(0.0001, 0, 1000), fix(0.0002, 0, 500)])).toHaveLength(1);
  });

  it("survives an empty track and one with no usable fixes", () => {
    expect(cleanTrack([])).toEqual([]);
    expect(cleanTrack([fix(0, 0, 0, 500)])).toEqual([]);
    expect(cleanTrack([fix(NaN, 0, 0)])).toEqual([]);
  });
});

describe("distance and pace", () => {
  const pts = withDistance(straightRun(5000, 300)); // 5 km at 5:00/km

  it("measures the track to within a metre or two", () => {
    expect(totalDistance(pts)).toBeGreaterThan(4990);
    expect(totalDistance(pts)).toBeLessThan(5010);
  });

  it("reports the pace it was generated at", () => {
    const p = pace(totalDistance(pts), pts.at(-1)!.t - pts[0].t)!;
    expect(p).toBeGreaterThan(298);
    expect(p).toBeLessThan(302);
  });

  it("refuses to divide by nothing", () => {
    expect(pace(0, 1000)).toBeNull();
    expect(pace(1000, 0)).toBeNull();
  });
});

describe("movingTime", () => {
  it("ignores a two-minute wait at a crossing", () => {
    const run = straightRun(1000, 300);
    const pauseStart = run.at(-1)!;
    // stand still for 120s, then carry on
    const paused: Fix[] = [
      ...run,
      fix(pauseStart.lat, pauseStart.lon, pauseStart.t + 60_000),
      fix(pauseStart.lat, pauseStart.lon, pauseStart.t + 120_000),
    ];
    const pts = withDistance(paused);
    expect(Math.round((pts.at(-1)!.t - pts[0].t) / 1000)).toBe(420); // 7 min elapsed
    expect(Math.round(movingTime(pts) / 1000)).toBe(300); // 5 min moving
  });
});

describe("splits", () => {
  const pts = withDistance(straightRun(5000, 300));

  it("gives one split per kilometre", () => {
    expect(splits(pts)).toHaveLength(5);
  });

  it("times each kilometre at the pace it was run", () => {
    // the tail split is a partial kilometre, so compare pace, not raw seconds
    for (const s of splits(pts)) expect(s.pace!).toBeCloseTo(300, 0);
    for (const s of splits(pts).filter((x) => x.distance === 1000)) {
      expect(s.seconds).toBeCloseTo(300, 0);
    }
  });

  it("keeps the final partial kilometre instead of discarding it", () => {
    const s = splits(withDistance(straightRun(5400, 300)));
    expect(s).toHaveLength(6);
    expect(s.at(-1)!.distance).toBeGreaterThan(350);
    expect(s.at(-1)!.distance).toBeLessThan(450);
  });

  it("returns nothing for a track too short to have a split", () => {
    expect(splits([])).toEqual([]);
    expect(splits(withDistance([fix(0, 0, 0)]))).toEqual([]);
  });
});

describe("bestEffort", () => {
  it("finds a fast kilometre buried inside a slower run", () => {
    // 2 km easy at 6:00, then 1 km hard at 4:00, then 2 km easy again
    const easy1 = straightRun(2000, 360);
    const deg = 1 / 111_194.93;
    const hard: Fix[] = [];
    for (let m = 10; m <= 1000; m += 10) {
      hard.push(fix((2000 + m) * deg, 0, easy1.at(-1)!.t + (m / 1000) * 240_000));
    }
    const easy2: Fix[] = [];
    for (let m = 10; m <= 2000; m += 10) {
      easy2.push(fix((3000 + m) * deg, 0, hard.at(-1)!.t + (m / 1000) * 360_000));
    }
    const pts = withDistance([...easy1, ...hard, ...easy2]);

    const best = bestEffort(pts, 1000)!;
    expect(best.seconds).toBeGreaterThan(235);
    expect(best.seconds).toBeLessThan(250); // the hard kilometre, not the easy ones
  });

  it("returns null when the run is shorter than the target", () => {
    expect(bestEffort(withDistance(straightRun(3000, 300)), 5000)).toBeNull();
    expect(bestEffort([], 1000)).toBeNull();
  });

  it("finds the whole run when the target is the whole run", () => {
    const pts = withDistance(straightRun(5000, 300));
    // 4990 not 5000: floating point leaves the generated track a hair short
    expect(bestEffort(pts, 4990)!.seconds).toBeCloseTo(1497, 0);
  });
});

describe("elevationGain", () => {
  it("adds up the climbs and ignores the descents", () => {
    // up 50 m over the first half, back down over the second
    const pts = withDistance(straightRun(1000, 300, 50, (m) => (m <= 500 ? m / 10 : (1000 - m) / 10)));
    expect(elevationGain(pts)).toBeGreaterThan(45);
    expect(elevationGain(pts)).toBeLessThan(55);
  });

  it("does not read GPS altitude jitter as hills", () => {
    // +/- 2 m of noise on flat ground, under the 3 m threshold
    const pts = withDistance(straightRun(1000, 300, 50, (m) => ((m / 50) % 2 ? 2 : 0)));
    expect(elevationGain(pts)).toBe(0);
  });

  it("copes with a track that has no altitude at all", () => {
    expect(elevationGain(withDistance(straightRun(1000, 300)))).toBe(0);
  });
});

describe("calories", () => {
  it("is in the right ballpark for a 70 kg runner over 5 km", () => {
    // rule of thumb is roughly 1 kcal per kg per km
    const kcal = calories(5000, 25 * 60_000, 70);
    expect(kcal).toBeGreaterThan(280);
    expect(kcal).toBeLessThan(420);
  });

  it("scales with body weight", () => {
    expect(calories(5000, 25 * 60_000, 90)).toBeGreaterThan(calories(5000, 25 * 60_000, 60));
  });

  it("returns zero rather than NaN for a run that never started", () => {
    expect(calories(0, 0, 70)).toBe(0);
    expect(calories(5000, 60_000, 0)).toBe(0);
  });
});
