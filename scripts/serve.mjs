/**
 * Serves a Next static export the way a real static host does: `/record`
 * resolves to `record.html`. Python's http.server hands back a directory
 * listing instead, which makes the accessibility audit measure the listing
 * rather than the app. Fifteen lines beats adding a dependency.
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";

const root = resolve(process.argv[2] ?? "out");
const port = Number(process.argv[3] ?? 3999);
const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".woff2": "font/woff2", ".woff": "font/woff", ".txt": "text/plain",
};

const isFile = (p) => stat(p).then((s) => s.isFile()).catch(() => false);

createServer(async (req, res) => {
  const rel = normalize(decodeURIComponent(req.url.split("?")[0]));
  for (const candidate of [join(root, rel), join(root, `${rel}.html`), join(root, rel, "index.html")]) {
    // resolve() collapses any ../ — refuse anything that climbs out of root
    const full = resolve(candidate);
    if (full !== root && !full.startsWith(root + sep)) continue;
    if (await isFile(full)) {
      res.writeHead(200, { "content-type": TYPES[extname(full)] ?? "application/octet-stream" });
      return res.end(await readFile(full));
    }
  }
  res.writeHead(404, { "content-type": "text/plain" }).end("not found");
}).listen(port, () => console.log(`serving ${root} on http://localhost:${port}`));
