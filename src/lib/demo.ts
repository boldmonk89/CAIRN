import type { Fix } from "./geo";
import { summarise, type Run } from "./runs";

/**
 * A believable 5 km loop with a hill and a fast third kilometre, so the splits,
 * medals and share card can be reviewed without going outside. Deterministic —
 * same route every time.
 */
export function demoRun(startedAt = Date.now() - 3_600_000): Run {
  const centre = { lat: 30.4599, lon: 78.0664 }; // Mussoorie
  const fixes: Fix[] = [];
  const R = 0.0062; // roughly a 1.4 km-wide loop
  let t = startedAt;

  for (let i = 0; i <= 720; i++) {
    const p = i / 720;
    const angle = p * Math.PI * 2 * 3.2; // a bit over three laps
    // squash the circle so it reads as a route, not a perfect ring
    const lat = centre.lat + Math.sin(angle) * R * 0.55 + p * 0.004;
    const lon = centre.lon + Math.cos(angle) * R + Math.sin(angle * 3) * 0.0004;

    // 6:00/km, dropping to 4:30 for the third kilometre, easing back after
    const secPerKm = p < 0.4 ? 360 : p < 0.6 ? 270 : 330;
    if (i > 0) t += (5000 / 720 / 1000) * secPerKm * 1000;

    fixes.push({
      lat, lon, t,
      accuracy: 6 + Math.sin(i) * 2,
      altitude: 2000 + Math.sin(p * Math.PI) * 62, // up and back down
    });
  }
  return summarise(crypto.randomUUID(), fixes, "Demo run · Mussoorie loop", 70);
}
