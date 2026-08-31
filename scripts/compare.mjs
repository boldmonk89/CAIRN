import { chromium } from "playwright";
const b = await chromium.launch();
for (const url of ["http://localhost:3000", "http://localhost:3999"]) {
  const p = await b.newContext({ viewport: { width: 390, height: 900 } }).then(c => c.newPage());
  const errs = [];
  p.on("pageerror", e => errs.push(e.message));
  try {
    await p.goto(url + "/", { waitUntil: "networkidle", timeout: 20000 });
    await p.evaluate(() => indexedDB.deleteDatabase("cairn"));
    await p.reload({ waitUntil: "networkidle" });
    const demo = await p.getByRole("button", { name: /demo run/i }).count();
    if (demo) { await p.getByRole("button", { name: /demo run/i }).click(); await p.waitForTimeout(1200); }
    const has = await p.evaluate(() => ({
      rings: document.querySelectorAll("svg circle[stroke-dasharray]").length,
      chart: document.querySelectorAll("figure svg path").length,
      chips: [...document.querySelectorAll("button[aria-pressed]")].map(b => b.textContent.trim()),
      navItems: document.querySelectorAll("nav[aria-label='Sections'] a").length,
      cta: !!document.querySelector("a[href='/record']"),
      cardMedia: document.querySelectorAll("li a .absolute").length,
      accent: getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim(),
    }));
    console.log(url, JSON.stringify(has));
  } catch (e) { console.log(url, "FAILED:", e.message.split("\n")[0]); }
  if (errs.length) console.log("   errors:", errs.slice(0, 3));
  await p.context().close();
}
await b.close();
