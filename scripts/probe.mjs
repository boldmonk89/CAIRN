import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:3000/record";
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  permissions: ["geolocation"],
  geolocation: { latitude: 30.4599, longitude: 78.0664 },
});
const page = await ctx.newPage();

const console_ = [], failed = [], tiles = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console_.push(`${m.type()}: ${m.text()}`); });
page.on("pageerror", (e) => console_.push(`pageerror: ${e.message}`));
page.on("requestfailed", (r) => failed.push(`${r.failure()?.errorText} ${r.url().slice(0, 110)}`));
page.on("response", (r) => { if (/cartocdn|tile\.openstreetmap/.test(r.url())) tiles.push(`${r.status()} ${r.url().slice(-40)}`); });

await page.goto(url, { waitUntil: "networkidle" }).catch(() => {});
await page.waitForTimeout(3500);

const info = await page.evaluate(() => {
  const c = document.querySelector(".leaflet-container");
  if (!c) return { container: null };
  const cs = getComputedStyle(c);
  const imgs = [...document.querySelectorAll("img.leaflet-tile")];
  return {
    container: { w: c.clientWidth, h: c.clientHeight, background: cs.backgroundColor },
    panes: !!c.querySelector(".leaflet-map-pane"),
    tileLayers: document.querySelectorAll(".leaflet-tile-pane .leaflet-layer").length,
    tileImgs: imgs.length,
    loadedImgs: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
    firstSrc: imgs[0]?.src ?? null,
  };
});

console.log("URL           ", url);
console.log("leaflet info  ", JSON.stringify(info, null, 2));
console.log("tile responses", tiles.length ? tiles.slice(0, 5) : "NONE REQUESTED");
console.log("failed reqs   ", failed.slice(0, 8));
console.log("console       ", console_.slice(0, 10));

await page.screenshot({ path: process.argv[3] ?? "scripts/probe.png", fullPage: false });
await browser.close();
