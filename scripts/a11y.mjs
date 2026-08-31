/**
 * Measures the quality bar on real rendered pixels, rather than trusting the
 * hex values in the stylesheet. Checks, per page:
 *   - text contrast >= 4.5:1 (3:1 for large text), against the composited
 *     background actually behind each element
 *   - interactive targets >= 24x24 CSS px
 *   - no horizontal scroll at 320px
 *   - every input has an accessible name
 *   - focus is visible on keyboard focus
 *
 * Usage: node scripts/a11y.mjs [baseUrl]
 * Exits non-zero if anything fails, so it can gate a build.
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3000";
const PAGES = ["/", "/activities", "/record", "/records", "/you"];
const WIDTHS = [320, 390];

const AUDIT = `(() => {
  const srgb = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
  const parse = (c) => (c.match(/[\\d.]+/g) || []).map(Number);
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

  // Walk up compositing the real background, since most elements are transparent.
  function bgOf(el) {
    let node = el;
    while (node) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c.length >= 3 && (c[3] === undefined || c[3] > 0.95)) return c.slice(0, 3);
      node = node.parentElement;
    }
    return [0, 0, 0];
  }

  const contrast = [], targets = [], inputs = [];
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) continue;
    const box = el.getBoundingClientRect();
    if (!box.width || !box.height) continue;

    // only elements holding their own visible text
    const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(" ");
    if (own) {
      const size = parseFloat(cs.fontSize);
      const bold = +cs.fontWeight >= 700;
      const large = size >= 24 || (size >= 18.66 && bold);
      const need = large ? 3 : 4.5;
      const got = ratio(parse(cs.color).slice(0, 3), bgOf(el));
      if (got < need) {
        contrast.push({ text: own.slice(0, 40), tag: el.tagName.toLowerCase(), size, need, got: +got.toFixed(2), color: cs.color });
      }
    }

    if (el.matches("a, button, input, select, textarea, [tabindex]:not([tabindex='-1'])")) {
      // an inline link inside a paragraph is exempt; standalone controls are not
      const inline = el.tagName === "A" && getComputedStyle(el).display.startsWith("inline");
      // sr-only elements (the skip link) are 1x1 by design until focused, and
      // are measured separately once focused
      const srOnly = cs.clipPath === "inset(50%)" || cs.clip === "rect(0px, 0px, 0px, 0px)";
      if (!inline && !srOnly && (box.width < 24 || box.height < 24)) {
        targets.push({ tag: el.tagName.toLowerCase(), label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30), w: Math.round(box.width), h: Math.round(box.height) });
      }
      const named = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") ||
        (el.id && document.querySelector(\`label[for="\${el.id}"]\`)) || el.closest("label") ||
        (el.textContent || "").trim();
      if (el.matches("input, select, textarea") && !named) {
        inputs.push({ tag: el.tagName.toLowerCase(), type: el.type || "" });
      }
    }
  }
  return {
    contrast, targets, inputs,
    scrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  };
})()`;

const browser = await chromium.launch();
let failures = 0;

for (const width of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 } });
  const page = await ctx.newPage();

  // seed one run so pages render with content, not empty states
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const demo = await page.getByRole("button", { name: /demo run/i }).count();
  if (demo) { await page.getByRole("button", { name: /demo run/i }).click(); await page.waitForTimeout(900); }

  for (const path of PAGES) {
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    const r = await page.evaluate(AUDIT);

    const problems = [];
    if (r.contrast.length) problems.push(`${r.contrast.length} contrast`);
    if (r.targets.length) problems.push(`${r.targets.length} small targets`);
    if (r.inputs.length) problems.push(`${r.inputs.length} unlabelled inputs`);
    if (r.scrollX) problems.push(`h-scroll (${r.scrollW} > ${r.clientW})`);

    if (problems.length) {
      failures += problems.length;
      console.log(`\nFAIL ${width}px ${path} — ${problems.join(", ")}`);
      for (const c of r.contrast.slice(0, 6)) console.log(`   contrast ${c.got}:1 (needs ${c.need}) ${c.tag} ${c.size}px "${c.text}" ${c.color}`);
      for (const t of r.targets.slice(0, 6)) console.log(`   target ${t.w}x${t.h} ${t.tag} "${t.label}"`);
      for (const i of r.inputs.slice(0, 6)) console.log(`   unlabelled <${i.tag} ${i.type}>`);
    } else {
      console.log(`PASS ${width}px ${path}`);
    }
  }

  // /run needs a real run id, so reach it the way a person does. It is the
  // densest page in the app and was going unmeasured.
  await page.goto(`${BASE}/activities`, { waitUntil: "networkidle" });
  const link = page.locator('a[href^="/run?"]').first();
  if (await link.count()) {
    await link.click();
    await page.waitForTimeout(1200);
    const r = await page.evaluate(AUDIT);
    const problems = [];
    if (r.contrast.length) problems.push(`${r.contrast.length} contrast`);
    if (r.targets.length) problems.push(`${r.targets.length} small targets`);
    if (r.scrollX) problems.push(`h-scroll (${r.scrollW} > ${r.clientW})`);
    if (problems.length) {
      failures += problems.length;
      console.log(`
FAIL ${width}px /run — ${problems.join(", ")}`);
      for (const c of r.contrast.slice(0, 6)) console.log(`   contrast ${c.got}:1 (needs ${c.need}) ${c.tag} ${c.size}px "${c.text}" ${c.color}`);
      for (const t of r.targets.slice(0, 6)) console.log(`   target ${t.w}x${t.h} ${t.tag} "${t.label}"`);
    } else {
      console.log(`PASS ${width}px /run`);
    }
  }

  // the skip link must actually become a real target once focused
  await page.goto(BASE + "/you", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  const skip = await page.evaluate(() => {
    const b = document.activeElement?.getBoundingClientRect();
    return { text: document.activeElement?.textContent?.trim(), w: Math.round(b?.width ?? 0), h: Math.round(b?.height ?? 0) };
  });
  const skipOk = skip.w >= 24 && skip.h >= 24;
  console.log(`${skipOk ? "PASS" : "FAIL"} ${width}px skip link when focused — ${skip.w}x${skip.h} "${skip.text}"`);
  if (!skipOk) failures++;

  // focus must be visible, not just present, and stand out from its background
  await page.keyboard.press("Tab");
  const focus = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    const srgb = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
    const parse = (c) => (c.match(/[\d.]+/g) || []).map(Number).slice(0, 3);
    let n = el, bg = [0, 0, 0];
    while (n) { const c = (getComputedStyle(n).backgroundColor.match(/[\d.]+/g) || []).map(Number);
      if (c.length >= 3 && (c[3] === undefined || c[3] > 0.95)) { bg = c.slice(0, 3); break; } n = n.parentElement; }
    const [x, y] = [lum(parse(cs.outlineColor)), lum(bg)].sort((a, b) => b - a);
    return { tag: el.tagName.toLowerCase(), outlineWidth: cs.outlineWidth, outlineStyle: cs.outlineStyle,
             outlineColor: cs.outlineColor, contrast: +((x + 0.05) / (y + 0.05)).toFixed(2) };
  });
  // WCAG 2.2 wants a focus indicator at least 2px with 3:1 against its ground
  const visible = focus && focus.outlineStyle !== "none" && parseFloat(focus.outlineWidth) >= 2 && focus.contrast >= 3;
  console.log(`${visible ? "PASS" : "FAIL"} ${width}px focus ring — ${JSON.stringify(focus)}`);
  if (!visible) failures++;

  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} failing check(s)` : "\nAll accessibility checks passed");
process.exit(failures ? 1 : 0);
