/**
 * Next's static export writes its RSC payloads into directories —
 * `out/record/__next.record/__PAGE__.txt` — but the client requests them with
 * a dot: `/record/__next.record.__PAGE__.txt`. On a host with rewrites that is
 * papered over. Inside an APK there is no host, so every client-side
 * navigation fires a 404 first and falls back to a full reload.
 *
 * This writes the dot-named copy next to the directory. Run after `next build`.
 */
import { readdir, copyFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.argv[2] ?? "out";
let copied = 0;

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("__next.")) {
      for (const file of await readdir(path, { withFileTypes: true })) {
        if (file.isFile()) {
          await copyFile(join(path, file.name), join(dir, `${entry.name}.${file.name}`));
          copied++;
        }
      }
    }
    await walk(path);
  }
}

await walk(root);
console.log(`flatten-rsc: wrote ${copied} dot-named payload${copied === 1 ? "" : "s"}`);
