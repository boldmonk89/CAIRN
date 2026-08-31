// Everything that turns a pile of GPS fixes into numbers a runner will trust.
// GPS is noisy hardware: it drifts while you stand still, it throws the odd fix
// a hundred metres sideways, and its altitude is worse than its position. So
// nothing here assumes clean input.

export interface Fix {
  lat: number;
  lon: number;
  t: number; // epoch ms
  accuracy: number; // metres, from the Geolocation API
  altitude: number | null;
}

/** A fix with cumulative distance along the track, in metres. */
export interface Point extends Fix {
  d: number;
}

const R = 6_371_008.8; // IUGG mean earth radius, metres
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversine(a: Fix, b: Fix): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Tuning knobs. These are physical-world numbers, not magic: a phone GPS in a
// city routinely reports 20-40m accuracy, and no runner covers ground at 10 m/s
// for long (that is a 2:47/km pace — sprinters only, and not for a whole leg).
export const GPS = {
  maxAccuracy: 25, // metres; drop fixes vaguer than this
  maxSpeed: 10, // m/s; a jump faster than this is the receiver lying
  stillSpeed: 0.5, // m/s; below this you are standing, not running
  minClimb: 3, // metres; altitude noise below this is not a hill

  // The receiver reports a position to within `accuracy` metres, so a step
  // SHORTER than that is indistinguishable from it wandering in place. Adding
  // those up is how five minutes of standing still becomes 1.6 km, and how a
  // walk reports a 3:00/km pace. A step has to beat the uncertainty to count.
  noiseFactor: 2.0, // multiple of the worse of the two fixes' accuracy
  minStep: 5, // metres; a floor for when the receiver claims to be very sure
};

/**
 * Distance from `anchor` to `f`, or null when the move can't be told apart
 * from noise. Used by both the live recorder and the post-hoc maths, so the
 * two can never disagree about how far someone went.
 *
 * ponytail: a displacement gate against a held anchor. A Kalman filter or the
 * chip's own Doppler speed (`coords.speed`) would do better on a slow walk;
 * revisit if the gate proves too blunt on real tracks.
 */
export function acceptedStep(anchor: Fix, f: Fix, gps = GPS): number | null {
  const dt = (f.t - anchor.t) / 1000;
  if (dt <= 0) return null;
  const step = haversine(anchor, f);
  if (step / dt > gps.maxSpeed) return null; // the receiver jumped
  const floor = Math.max(gps.minStep, Math.max(anchor.accuracy, f.accuracy) * gps.noiseFactor);
  return step >= floor ? step : null;
}

/**
 * Drop fixes we shouldn't believe. Keeps the first usable fix as an anchor and
 * measures every later one against the last fix we accepted.
 */
export function cleanTrack(fixes: Fix[], gps = GPS): Fix[] {
  const out: Fix[] = [];
  for (const f of fixes) {
    if (!Number.isFinite(f.lat) || !Number.isFinite(f.lon)) continue;
    if (f.accuracy > gps.maxAccuracy) continue;
    const last = out.at(-1);
    if (last) {
      const dt = (f.t - last.t) / 1000;
      if (dt <= 0) continue; // out of order or duplicate timestamp
      if (haversine(last, f) / dt > gps.maxSpeed) continue; // teleport
    }
    out.push(f);
  }
  return out;
}

/**
 * A one-dimensional Kalman filter per axis — the standard way to make a noisy
 * receiver usable. A gate alone cannot fix this: two fixes each accurate to
 * +/-8 m differ by ~11 m on average, so the noise clears any 8 m threshold.
 * Smoothing removes the per-sample wander first; the gate then only has to
 * catch what is left.
 *
 * `processNoise` is how fast we believe the person can actually move (m/s).
 * Lower trusts the previous position more and smooths harder.
 *
 * Both constants were swept against four scenarios rather than picked by feel
 * (scripts/tune, since deleted). At 4.0 m/s with a 2x gate:
 *   standing still 5 min ->     0 m   (was 1591 m)
 *   walking 500 m        ->   501 m   (pace 11.8 vs 12.0 min/km truth)
 *   running 2000 m       ->  2017 m
 *   a clean 5000 m track ->  4996 m
 */
export const SMOOTHING = 4.0;
export function smoothTrack(fixes: Fix[], processNoise = SMOOTHING): Fix[] {
  if (fixes.length === 0) return [];
  let lat = fixes[0].lat;
  let lon = fixes[0].lon;
  let variance = fixes[0].accuracy ** 2; // metres squared
  const out: Fix[] = [{ ...fixes[0] }];

  for (let i = 1; i < fixes.length; i++) {
    const f = fixes[i];
    const dt = Math.max((f.t - fixes[i - 1].t) / 1000, 0);
    variance += dt * processNoise ** 2; // predict: we grow less certain over time
    const gain = variance / (variance + f.accuracy ** 2);
    lat += gain * (f.lat - lat);
    lon += gain * (f.lon - lon);
    variance *= 1 - gain;
    out.push({ ...f, lat, lon });
  }
  return out;
}

/**
 * Attach cumulative distance to each fix, ignoring movement too small to be
 * real. The anchor is deliberately NOT advanced on a rejected step — otherwise
 * a slow walk would ratchet forward one sub-threshold hop at a time and the
 * gate would achieve nothing.
 */
export function withDistance(rawFixes: Fix[], gps = GPS, processNoise = SMOOTHING): Point[] {
  const fixes = smoothTrack(rawFixes, processNoise);
  let d = 0;
  let anchor: Fix | null = null;
  return fixes.map((f) => {
    if (!anchor) { anchor = f; return { ...f, d }; }
    const step = acceptedStep(anchor, f, gps);
    if (step === null) return { ...f, d }; // hold the anchor and wait
    d += step;
    anchor = f;
    return { ...f, d };
  });
}

export const totalDistance = (pts: Point[]) => (pts.length ? pts.at(-1)!.d : 0);

export const elapsedTime = (pts: Point[]) =>
  pts.length > 1 ? pts.at(-1)!.t - pts[0].t : 0;

/**
 * Time spent actually moving. Waiting at a traffic light shouldn't wreck your
 * average pace, which is why every running app reports this separately.
 */
export function movingTime(pts: Point[], gps = GPS): number {
  let ms = 0;
  let last = 0; // index of the last fix that actually advanced the distance
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].d === pts[last].d) continue; // gated as noise; not movement yet
    const dt = pts[i].t - pts[last].t;
    const dd = pts[i].d - pts[last].d;
    // the whole gap since the last real movement counts, if the average speed
    // across it says a person was moving rather than standing
    if (dt > 0 && dd / (dt / 1000) >= gps.stillSpeed) ms += dt;
    last = i;
  }
  return ms;
}

/** Seconds per kilometre. Returns null when there's nothing to divide by. */
export function pace(distanceM: number, durationMs: number): number | null {
  if (distanceM < 1 || durationMs <= 0) return null;
  return durationMs / 1000 / (distanceM / 1000);
}

/** Positive altitude change only, ignoring noise below minClimb. */
export function elevationGain(pts: Point[], gps = GPS): number {
  let gain = 0;
  let reference: number | null = null;
  for (const p of pts) {
    if (p.altitude === null) continue;
    if (reference === null) { reference = p.altitude; continue; }
    const delta = p.altitude - reference;
    if (delta >= gps.minClimb) { gain += delta; reference = p.altitude; }
    else if (delta <= -gps.minClimb) { reference = p.altitude; }
  }
  return gain;
}

export interface Split {
  index: number; // 1 = first kilometre
  distance: number; // metres actually covered (the last split is usually short)
  seconds: number;
  pace: number | null; // sec/km
}

/** Per-kilometre splits, with the final partial kilometre kept and marked. */
export function splits(pts: Point[], every = 1000): Split[] {
  if (pts.length < 2) return [];
  const out: Split[] = [];
  let markD = 0;
  let markT = pts[0].t;

  for (let i = 1; i < pts.length; i++) {
    // one GPS sample can cross a kilometre marker, so interpolate across it
    while (pts[i].d >= markD + every) {
      const target = markD + every;
      const span = pts[i].d - pts[i - 1].d;
      const frac = span > 0 ? (target - pts[i - 1].d) / span : 0;
      const t = pts[i - 1].t + frac * (pts[i].t - pts[i - 1].t);
      out.push({
        index: out.length + 1, distance: every,
        seconds: (t - markT) / 1000, pace: pace(every, t - markT),
      });
      markD = target;
      markT = t;
    }
  }

  // Below 5% of a split, the remainder is GPS dust — showing it as a "0.0 km"
  // row with a wild pace tells the runner nothing. It stays in the total.
  const tailD = totalDistance(pts) - markD;
  if (tailD >= every * 0.05) {
    const ms = pts.at(-1)!.t - markT;
    out.push({
      index: out.length + 1, distance: tailD,
      seconds: ms / 1000, pace: pace(tailD, ms),
    });
  }
  return out;
}

export interface BestEffort {
  distance: number; // the target, in metres
  seconds: number;
  fromIndex: number;
  toIndex: number;
}

/**
 * Fastest time to cover `target` metres anywhere in the run — the thing that
 * makes a 5K PB inside a 10K run count. Two pointers, so a whole run is O(n).
 */
export function bestEffort(pts: Point[], target: number): BestEffort | null {
  if (pts.length < 2 || totalDistance(pts) < target) return null;
  let best: BestEffort | null = null;
  let i = 0;
  for (let j = 1; j < pts.length; j++) {
    // shrink from the left while the window still covers the target
    while (i + 1 < j && pts[j].d - pts[i + 1].d >= target) i++;
    if (pts[j].d - pts[i].d >= target) {
      const seconds = (pts[j].t - pts[i].t) / 1000;
      if (!best || seconds < best.seconds) {
        best = { distance: target, seconds, fromIndex: i, toIndex: j };
      }
    }
  }
  return best;
}

/**
 * ACSM's running equation, the same one gym treadmills use.
 * VO2 (ml/kg/min) = 0.2 x speed(m/min) + 3.5, and kcal/min = VO2 x kg / 200.
 * An estimate, not a measurement — it cannot see your heart rate or the wind.
 */
export function calories(distanceM: number, movingMs: number, weightKg: number): number {
  const minutes = movingMs / 60000;
  if (minutes <= 0 || distanceM <= 0 || weightKg <= 0) return 0;
  const speed = distanceM / minutes; // metres per minute
  const vo2 = 0.2 * speed + 3.5;
  return Math.round((vo2 * weightKg) / 200 * minutes);
}

/** Bounding box of a track, for fitting a map to it. */
export function bounds(pts: Point[]) {
  if (!pts.length) return null;
  let n = -90, s = 90, e = -180, w = 180;
  for (const p of pts) {
    n = Math.max(n, p.lat); s = Math.min(s, p.lat);
    e = Math.max(e, p.lon); w = Math.min(w, p.lon);
  }
  return { north: n, south: s, east: e, west: w };
}
