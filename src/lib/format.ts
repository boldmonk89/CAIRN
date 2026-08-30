// Display formatting. Every function here takes a number and returns a string;
// none of them does arithmetic that matters.

const pad = (n: number) => String(Math.floor(n)).padStart(2, "0");

/** 1:23:45 for anything over an hour, 23:45 below it. */
export function duration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Always h:mm:ss — for the running clock, so digits don't jump around. */
export function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 3600)}:${pad((total % 3600) / 60)}:${pad(total % 60)}`;
}

/** 5:00 — minutes and seconds per kilometre. */
export function paceLabel(secondsPerKm: number | null): string {
  if (secondsPerKm === null || !Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return "—";
  return `${Math.floor(secondsPerKm / 60)}:${pad(secondsPerKm % 60)}`;
}

export const km = (metres: number, digits = 2) => (metres / 1000).toFixed(digits);

export const dateLabel = (ts: number) =>
  new Date(ts).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

export const timeLabel = (ts: number) =>
  new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/** "Morning run" / "Evening run" — the default title, same idea as Strava's. */
export function defaultTitle(ts: number): string {
  const h = new Date(ts).getHours();
  const part = h < 5 ? "Night" : h < 12 ? "Morning" : h < 17 ? "Afternoon" : h < 21 ? "Evening" : "Night";
  return `${part} run`;
}
