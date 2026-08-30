import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 390, height: 900 } }).then(c => c.newPage());
const errors = [];
page.on("pageerror", e => errors.push(e.message));
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
 await page.evaluate(() => indexedDB.deleteDatabase("cairn"));
 await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: /demo run/i }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: "scripts/home.png" });

await page.getByRole("link", { name: /Demo run/i }).first().click();
await page.waitForTimeout(3000);
await page.screenshot({ path: "scripts/run.png", fullPage: true });

// the polyline lives in the overlay pane and must NOT inherit the tile invert
const check = await page.evaluate(() => {
  const poly = document.querySelector(".leaflet-overlay-pane path");
  const tilePane = document.querySelector(".leaflet-tile-pane");
  return {
    polylineStroke: poly?.getAttribute("stroke") ?? null,
    overlayFilter: getComputedStyle(document.querySelector(".leaflet-overlay-pane")).filter,
    tileFilter: getComputedStyle(tilePane).filter.slice(0, 40),
    splits: document.querySelectorAll("h2").length,
    bodyScrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
});
console.log(JSON.stringify(check, null, 2));
console.log("errors:", errors.slice(0, 6));
await browser.close();
