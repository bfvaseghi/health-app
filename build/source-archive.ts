import { lstatSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import type { Plugin } from "vite";

const ROOT_FILES = new Set([
  ".gitignore", ".openai/hosting.json", "README.md", "package.json", "package-lock.json",
  "tsconfig.json", "vite.config.ts", "next.config.ts", "postcss.config.mjs",
  "eslint.config.mjs", "drizzle.config.ts",
]);
const PUBLIC_FILES = new Set([
  "manifest.webmanifest", "sw.js", "favicon.svg", "apple-touch-icon.png", "icon-192.png",
  "icon-512.png", "icon-maskable-512.png", "file.svg", "globe.svg", "window.svg",
  "fonts/instrument-serif.woff2", "fonts/instrument-serif-italic.woff2", "fonts/hanken-grotesk.woff2",
]);

function allowed(name: string): boolean {
  if (ROOT_FILES.has(name)) return true;
  if (name.startsWith("public/")) return PUBLIC_FILES.has(name.slice(7));
  if (/^(app|build|db|worker|scripts|tests|examples)\//.test(name)) {
    return /\.(ts|tsx|mjs|js|css|sh|svg|ico)$/.test(name) || name === "tests/fixtures/strong-sample.csv";
  }
  return /^drizzle\/[^/]+\.sql$/.test(name) || /^drizzle\/meta\/(\d+_snapshot|_journal)\.json$/.test(name);
}

function crc32(data: Uint8Array): number {
  let crc = 0xffff_ffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb8_8320 : 0);
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

/** Packages source and bundled assets. Never follows symlinks or scans runtime storage. */
export function createSourceArchive(root: string): Buffer {
  const names: string[] = [];
  function collect(relative: string) {
    const absolute = join(root, relative);
    let stat;
    try { stat = lstatSync(absolute); } catch { return; }
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) {
      for (const name of readdirSync(absolute).sort()) {
        if (!name.startsWith(".") && name !== "node_modules") collect(`${relative}/${name}`);
      }
    } else if (stat.isFile() && allowed(relative)) names.push(relative);
  }
  for (const name of ROOT_FILES) collect(name);
  for (const name of ["app", "build", "db", "worker", "scripts", "tests", "examples", "drizzle", "public"]) collect(name);
  const parts: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const name of [...new Set(names)].sort()) {
    const filename = Buffer.from(`baseline/${name}`);
    const bytes = readFileSync(join(root, name));
    const compressed = deflateRawSync(bytes);
    const checksum = crc32(bytes);
    const local = Buffer.alloc(30 + filename.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(33, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(bytes.length, 22);
    local.writeUInt16LE(filename.length, 26);
    filename.copy(local, 30);
    const central = Buffer.alloc(46 + filename.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    local.copy(central, 6, 4, 30);
    central.writeUInt32LE((name.startsWith("scripts/") && name.endsWith(".sh") ? 0o100755 : 0o100644) * 65536, 38);
    central.writeUInt32LE(offset, 42);
    filename.copy(central, 46);
    parts.push(local, compressed);
    directory.push(central);
    offset += local.length + compressed.length;
  }
  const central = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(directory.length, 8);
  end.writeUInt16LE(directory.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, central, end]);
}

export function sourceArchive(): Plugin {
  let root = "";
  let building = false;
  return {
    name: "baseline-source-archive",
    configResolved(config) { root = config.root; building = config.command === "build"; },
    buildStart() {
      if (building) writeFileSync(join(root, "public/baseline-source.zip"), createSourceArchive(root));
    },
    configureServer(server) {
      server.middlewares.use("/baseline-source.zip", (_request, response) => {
        response.setHeader("Content-Type", "application/zip");
        response.setHeader("Content-Disposition", 'attachment; filename="baseline-source.zip"');
        response.setHeader("Cache-Control", "no-store");
        response.end(createSourceArchive(root));
      });
    },
  };
}
