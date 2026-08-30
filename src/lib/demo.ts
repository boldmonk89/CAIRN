import { haversine, type Fix } from "./geo";
import { summarise, type Run } from "./runs";

/**
 * A believable 5 km run, so splits, medals and share cards can be reviewed
 * without going outside. Deterministic.
 *
 * Geometry first, timestamps second: the shape decides the real distance, then
 * the clock is laid onto it from a pace profile. Doing it the other way round
 * (guessing the length, then timing it) is how you end up with a 2:44/km demo.
 */
const TARGET_M = 5200;

export function demoRun(startedAt = Date.now() - 3_600_000): Run {
  const centre = { lat: 30.4599, lon: 78.0664 }; // Mussoorie
  const N = 520;

  // an out-and-back with a bend, drawn in normalised units
  const shape = (p: number): [number, number] => {
    const a = p * Math.PI * 2;
    return [Math.sin(a) * 0.9 + Math.sin(a * 2) * 0.25, -Math.cos(a) * 0.55 + p * 0.35];
  };

  const raw = Array.from({ length: N + 1 }, (_, i) => {
    const [u, v] = shape(i / N);
    return { lat: centre.lat + v * 0.01, lon: centre.lon + u * 0.01 };
  });

  // measure the drawn shape, then scale it about the centre to hit the target
  const drawn = raw.reduce((s, p, i) =>
    i ? s + haversine({ ...raw[i - 1], t: 0, accuracy: 0, altitude: null }, { ...p, t: 0, accuracy: 0, altitude: null }) : 0, 0);
  const k = TARGET_M / drawn;
  const scaled = raw.map((p) => ({
    lat: centre.lat + (p.lat - centre.lat) * k,
    lon: centre.lon + (p.lon - centre.lon) * k,
  }));

  // 5:40/km easy, a 4:35/km push through the third kilometre, 5:20 to finish
  const paceAt = (metres: number) =>
    metres < 2000 ? 340 : metres < 3000 ? 275 : metres < 4200 ? 320 : 305;

  const fixes: Fix[] = [];
  let travelled = 0;
  let t = startedAt;
  for (let i = 0; i <= N; i++) {
    if (i > 0) {
      const step = haversine(
        { ...scaled[i - 1], t: 0, accuracy: 0, altitude: null },
        { ...scaled[i], t: 0, accuracy: 0, altitude: null },
      );
      t += (step / 1000) * paceAt(travelled) * 1000;
      travelled += step;
    }
    fixes.push({
      lat: scaled[i].lat,
      lon: scaled[i].lon,
      t: Math.round(t),
      accuracy: 5 + Math.abs(Math.sin(i * 0.7)) * 3,
      altitude: 2000 + Math.sin((i / N) * Math.PI) * 55, // one climb, one descent
    });
  }
  return summarise(crypto.randomUUID(), fixes, "Demo run · Mussoorie", 70);
}
