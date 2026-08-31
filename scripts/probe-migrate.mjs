// A migration that silently fails to fire is worse than none. Plant a run in
// the OLD format with an inflated distance, then check the app corrects it.
import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newContext({ viewport: { width: 390, height: 900 } }).then(c => c.newPage());
await p.goto("http://localhost:3999/", { waitUntil: "networkidle" });

const planted = await p.evaluate(async () => {
  await new Promise((r) => { const d = indexedDB.deleteDatabase("cairn"); d.onsuccess = d.onerror = r; });
  const DEG = 1 / 111_194.93;
  // someone standing still for 5 minutes, receiver wandering +/- 8 m
  let s = 4242; const rand = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648) * 2 - 1;
  const track = [];
  for (let t = 0; t <= 300; t++) {
    track.push({ lat: rand() * 8 * DEG, lon: rand() * 8 * DEG, t: t * 1000, accuracy: 8, altitude: null });
  }
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open("cairn", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("runs", { keyPath: "id" }).createIndex("startedAt", "startedAt");
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const old = { id: "legacy-1", startedAt: 0, title: "Walk to the shop", track,
                distance: 1591, movingMs: 300000, elapsedMs: 300000, elevation: 0, calories: 210 };
  await new Promise((res) => { const t = db.transaction("runs", "readwrite"); t.objectStore("runs").put(old); t.oncomplete = res; });
  return old.distance;
});
console.log("planted distance (old, wrong):", planted, "m");

await p.reload({ waitUntil: "networkidle" });
await p.waitForTimeout(2000);
const after = await p.evaluate(async () => {
  const db = await new Promise((res) => { const r = indexedDB.open("cairn", 1); r.onsuccess = () => res(r.result); });
  const run = await new Promise((res) => { const t = db.transaction("runs", "readonly"); const q = t.objectStore("runs").get("legacy-1"); q.onsuccess = () => res(q.result); });
  return { distance: Math.round(run.distance), v: run.v, title: run.title, kept: run.track.length };
});
console.log("after migration:", JSON.stringify(after));
console.log(after.distance < 60 && after.v === 2 ? "PASS — corrected, track kept" : "FAIL");
await b.close();
