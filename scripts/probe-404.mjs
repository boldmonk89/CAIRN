import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newContext({ viewport: { width: 390, height: 900 } }).then(c => c.newPage());
const bad = [];
p.on("response", r => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url().replace("http://localhost:3999","")}`); });
await p.goto("http://localhost:3999/", { waitUntil: "networkidle" });
await p.evaluate(() => indexedDB.deleteDatabase("cairn"));
await p.reload({ waitUntil: "networkidle" });
console.log("--- after home load ---"); console.log(bad.join("\n") || "none");
bad.length = 0;
await p.getByRole("button", { name: /demo run/i }).click();
await p.waitForTimeout(1200);
await p.getByRole("link", { name: /Demo run/i }).first().click();
await p.waitForTimeout(2500);
console.log("--- after navigating to a run ---"); console.log(bad.join("\n") || "none");
console.log("landed on:", p.url());
const nav = await p.evaluate(() => {
  const links = [...document.querySelectorAll("nav[aria-label='Sections'] a")];
  const w = window.innerWidth;
  return { items: links.length,
    centres: links.map(a => Math.round(100 * (a.getBoundingClientRect().left + a.getBoundingClientRect().width/2) / w)),
    active: links.filter(a => a.getAttribute("aria-current") === "page").map(a => a.textContent.trim()) };
});
console.log("bottom bar:", JSON.stringify(nav));
console.log("title shown:", await p.locator("h1, input").first().inputValue().catch(() => p.locator("h1").first().textContent()));
await p.screenshot({ path: "scripts/run-new.png" });
await p.goto("http://localhost:3999/", { waitUntil: "networkidle" });
await p.waitForTimeout(1500);
await p.screenshot({ path: "scripts/home-new.png" });
await b.close();
