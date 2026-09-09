import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { createSourceArchive } from "../build/source-archive.ts";
import { readZipDirectory, readZipEntryText } from "../app/import/zip.ts";

test("source export includes rebuild inputs and excludes runtime records and symlinks", async () => {
  const root = mkdtempSync(join(tmpdir(), "baseline-source-"));
  const files = {
    "package.json": '{"name":"synthetic-project"}',
    "app/page.tsx": "export default function Page() { return null; }",
    "worker/index.ts": "export default {};",
    ".openai/hosting.json": '{"d1":"DB","r2":null}',
    "drizzle/0000_schema.sql": "CREATE TABLE sample (id INTEGER);",
    "drizzle/meta/_journal.json": "{}",
    "public/fonts/hanken-grotesk.woff2": "synthetic font",
    "tests/fixtures/strong-sample.csv": "synthetic fixture",
    "scripts/build-verified.sh": "#!/bin/sh\nexit 0\n",
    ".env": "SECRET",
    "data/health.json": "PRIVATE",
    "app/backup.json": "PRIVATE",
    "tests/fixtures/health.csv": "PRIVATE",
    "public/qa.html": "PRIVATE",
    "public/baseline-source.zip": "old archive",
    "private.ts": "PRIVATE",
  };
  try {
    for (const [name, data] of Object.entries(files)) {
      mkdirSync(join(root, name, ".."), { recursive: true });
      writeFileSync(join(root, name), data);
    }
    symlinkSync(join(root, "private.ts"), join(root, "app/linked.ts"));
    const bytes = createSourceArchive(root);
    const archive = new File([bytes], "source.zip");
    let central = bytes.readUInt32LE(bytes.length - 6);
    while (bytes.readUInt32LE(central) === 0x02014b50) {
      const nameLength = bytes.readUInt16LE(central + 28);
      const name = bytes.subarray(central + 46, central + 46 + nameLength).toString();
      if (name.endsWith(".sh")) {
        assert.equal(bytes.readUInt16LE(central + 4) >> 8, 3);
        assert.equal(bytes.readUInt32LE(central + 38) >>> 16, 0o100755);
      }
      central += 46 + nameLength;
    }
    const entries = await readZipDirectory(archive);
    const names = entries.map((entry) => entry.name).sort();
    assert.deepEqual(names, Object.keys(files).slice(0, 9).map((name) => `baseline/${name}`).sort());
    for (const entry of entries) {
      assert.equal(await readZipEntryText(archive, entry), files[entry.name.slice(9)]);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});


test("source download uses a cached archive offline and never caches API requests", async () => {
  const listeners = new Map();
  const entries = new Map();
  const cache = {
    async put(key, response) { entries.set(key, response); },
  };
  let online = true;
  vm.runInNewContext(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), {
    self: { location: { origin: "https://baseline.example" }, addEventListener: (name, fn) => listeners.set(name, fn) },
    caches: { open: async () => cache, match: async (key) => entries.get(key)?.clone() },
    fetch: async () => {
      if (!online) throw new Error("offline");
      return new Response("synthetic source bytes", { headers: { "Content-Type": "application/zip" } });
    },
    Request, Response, URL,
  });
  const run = (path) => {
    let response;
    listeners.get("fetch")({ request: new Request(`https://baseline.example${path}`), respondWith: (value) => { response = value; } });
    return response;
  };
  assert.equal(await (await run("/baseline-source.zip")).text(), "synthetic source bytes");
  online = false;
  assert.equal(await (await run("/baseline-source.zip")).text(), "synthetic source bytes");
  assert.equal(run("/api/health-state"), undefined);
  assert.deepEqual([...entries.keys()], ["/baseline-source.zip"]);
});
