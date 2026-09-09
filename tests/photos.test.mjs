import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { demoHealthState } from "../app/demo-state.ts";
import { photoDateOption, photoInterval, photoSelection, photoTimeline } from "../app/photo-timeline.ts";
import { clearOwnerPhotos, handlePhotoRequest, photoPrefix } from "../app/photo-api.ts";
import { typedPhoto } from "../app/photo-format.ts";
import { PhotoCompare } from "../app/ui/photo-compare.tsx";
import { createBaselineArchive, parseBackupFile, restoreArchivePhotos } from "../app/portability.ts";

import { createSourceArchive } from "../build/source-archive.ts";

const TODAY = "2026-09-08";
const photo = (id, date) => ({ id, date, weightLb: null, bodyFatPercent: null, note: "" });
const records = [photo("c", TODAY), photo("a", "2026-07-28"), photo("b", "2026-08-18")];
const timeline = photoTimeline(records, TODAY);

test("photos retain every date and stable same-day ordering without changing the record", () => {
  const source = [...records, photo("d", TODAY), photo("future", "2026-10-01")];
  const before = JSON.stringify(source);
  assert.deepEqual(photoTimeline(source, TODAY).map(p => p.id), ["a", "b", "c", "d"]);
  assert.equal(JSON.stringify(source), before);
  assert.equal(photoDateOption(source[0], photoTimeline(source, TODAY)), " · Photo 1");
  assert.equal(photoDateOption(source[3], photoTimeline(source, TODAY)), " · Photo 2");
  assert.equal(photoDateOption(source[1], source), "");
});

test("timeline opens at the latest photo, and comparison opens at earliest and latest", () => {
  const result = photoSelection(timeline);
  assert.equal(result.selected.id, "c");
  assert.equal(result.index, 2);
  assert.equal(result.from.id, "a");
  assert.equal(result.to.id, "c");
  assert.equal(result.days, 42);
  for (const selected of timeline) assert.equal(photoSelection(timeline, selected.id).selected.id, selected.id);
  for (const earlier of timeline) for (const later of timeline) {
    const pair = photoSelection(timeline, "c", earlier.id, later.id);
    assert.notEqual(pair.from.id, pair.to.id);
    assert.ok(pair.from.date <= pair.to.date);
  }
  assert.deepEqual(photoSelection(timeline, "b", "a", "b").days, 21);
});

test("date edits, deletions and empty records cannot leave a stale comparison", () => {
  const removed = timeline.filter(p => p.id !== "c");
  const result = photoSelection(removed, "c", "a", "c");
  assert.equal(result.selected.id, "b");
  assert.equal(result.to.id, "b");
  const reordered = photoTimeline(timeline.map(p => p.id === "a" ? { ...p, date: "2026-09-07" } : p), TODAY);
  assert.equal(photoSelection(reordered, "a", "a", "b").from.id, "b");
  assert.equal(photoSelection(reordered, "a").selected.id, "a");
  assert.equal(photoSelection([timeline[0]], "c", "a", "c").from, null);
  assert.equal(photoSelection([]).selected, null);
  assert.equal(photoSelection([]).index, -1);
});

test("elapsed time uses calendar days across daylight saving, months and years", () => {
  for (const [a, b, days] of [["2026-03-07", "2026-03-09", 2], ["2025-12-31", "2026-01-01", 1], [TODAY, TODAY, 0]]) {
    const pair = photoSelection([photo("a", a), photo("b", b)]);
    assert.equal(pair.days, days);
  }
  assert.deepEqual([0, 1, 2, 7, 21, 42].map(photoInterval), ["Same day", "1 day apart", "2 days apart", "1 week apart", "3 weeks apart", "6 weeks apart"]);
});

test("photo UI exposes a simple timeline, labelled controls and the dated fake examples", () => {
  const state = demoHealthState(TODAY);
  const render = photos => renderToStaticMarkup(createElement(PhotoCompare, {
    state: { ...state, progressPhotos: photos }, today: TODAY, onAddPhoto: async () => {}, onUpdatePhoto() {}, onDeletePhoto() {}, onNotice() {}, loadImage: async () => null,
  }));
  const html = render(state.progressPhotos);
  assert.match(html, /Timeline/);
  assert.match(html, /Compare dates/);
  assert.match(html, /3 of 3/);
  assert.match(html, /aria-label="Previous photo"/);
  assert.match(html, /aria-label="Next photo" disabled/);
  assert.match(html, /aria-label="Photo date"/);
  assert.match(html, /Enlarge photo from/);
  assert.match(html, /Fictional example · generated image/);
  assert.equal((html.match(/aria-label="View photo from/g) ?? []).length, 3);
  const single = render([state.progressPhotos[0]]);
  assert.doesNotMatch(single, /Compare dates|Previous photo|Next photo/);
  assert.match(single, /Add another date/);
  const empty = render([]);
  assert.match(empty, /Add your first progress photo/);
  assert.doesNotMatch(empty, /Photo unavailable|Loading photo/);
});

function fakeBucket() {
  const data = new Map();
  const bucket = {
    data,
    async get(key) {
      const item = data.get(key);
      return item ? { body: new Response(item.bytes).body, size: item.bytes.byteLength, httpMetadata: item.httpMetadata } : null;
    },
    async put(key, bytes, options) { data.set(key, { bytes, ...options }); },
    async delete(keys) { for (const key of [keys].flat()) data.delete(key); },
    async list({ prefix }) { return { objects: [...data.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })), truncated: false }; },
  };
  return bucket;
}
const request = (method, options = {}) => new Request("https://baseline.example/api/photos/example", { method, ...options });
const ownerDeps = bucket => ({ userId: async () => "owner@example.test", isOwner: async id => id === "owner@example.test", bucket: () => bucket });
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const upload = () => request("PUT", { body: png, headers: { "Content-Type": "image/png", Origin: "https://baseline.example" } });

test("private photo routes reject anonymous, non-owner and cross-site requests before storage", async () => {
  const bucket = () => { throw new Error("Storage must not be accessed"); };
  for (const method of ["GET", "PUT", "DELETE"]) {
    const anon = await handlePhotoRequest(request(method), "example", { userId: async () => null, isOwner: async () => true, bucket });
    assert.equal(anon.status, 401);
    assert.equal(anon.headers.get("cache-control"), "private, no-store");
    const stranger = await handlePhotoRequest(request(method), "example", { userId: async () => "stranger@example.test", isOwner: async () => false, bucket });
    assert.equal(stranger.status, 403);
  }
  for (const headers of [{ Origin: "https://elsewhere.example" }, { "Sec-Fetch-Site": "cross-site" }]) {
    assert.equal((await handlePhotoRequest(request("DELETE", { headers }), "example", { ...ownerDeps(), bucket })).status, 403);
  }
});

test("photo bytes persist by owner and round trip with private response headers", async () => {
  const bucket = fakeBucket();
  const deps = ownerDeps(bucket);
  assert.equal((await handlePhotoRequest(upload(), "example", deps)).status, 204);
  const response = await handlePhotoRequest(request("GET"), "example", deps);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), png);
  assert.equal(bucket.data.size, 1);
  const foreignScope = { ...deps, userId: async () => "different@example.test", isOwner: async () => true };
  assert.equal((await handlePhotoRequest(request("GET"), "example", foreignScope)).status, 404);
  assert.equal((await handlePhotoRequest(request("DELETE"), "example", deps)).status, 204);
  assert.equal((await handlePhotoRequest(request("DELETE"), "example", deps)).status, 204);
  assert.equal((await handlePhotoRequest(request("GET"), "example", deps)).status, 404);
});

test("invalid, oversized and failed uploads cannot report success", async () => {
  const bucket = fakeBucket();
  const deps = ownerDeps(bucket);
  assert.equal((await handlePhotoRequest(request("PUT", { body: "<svg/>", headers: { "Content-Type": "image/svg+xml" } }), "example", deps)).status, 415);
  assert.equal((await handlePhotoRequest(request("PUT", { body: png, headers: { "Content-Type": "image/png", "Content-Length": String(11 * 1024 * 1024) } }), "example", deps)).status, 413);
  const chunks = [new Uint8Array(6 * 1024 * 1024), new Uint8Array(5 * 1024 * 1024)];
  const body = new ReadableStream({ pull(controller) { const next = chunks.shift(); if (next) controller.enqueue(next); else controller.close(); } });
  assert.equal((await handlePhotoRequest(request("PUT", { body, duplex: "half", headers: { "Content-Type": "image/png" } }), "example", deps)).status, 413);
  assert.equal(bucket.data.size, 0);
  const broken = { ...bucket, async put() { throw new Error("Fake storage failure"); } };
  assert.equal((await handlePhotoRequest(upload(), "example", ownerDeps(broken))).status, 503);
});

test("full erase walks all pages and keeps other owners' objects", async () => {
  const prefix = await photoPrefix("owner@example.test");
  const foreign = await photoPrefix("other@example.test");
  const keys = [`${prefix}a`, `${prefix}b`, `${foreign}c`];
  const bucket = fakeBucket();
  for (const key of keys) await bucket.put(key, png.buffer, { httpMetadata: { contentType: "image/png" } });
  let page = 0;
  bucket.list = async options => {
    assert.equal(options.prefix, prefix);
    if (page++ === 0) return { objects: [{ key: keys[0] }], truncated: true, cursor: "next" };
    assert.equal(options.cursor, "next");
    return { objects: [{ key: keys[1] }], truncated: false };
  };
  await clearOwnerPhotos(bucket, "owner@example.test");
  assert.deepEqual([...bucket.data.keys()], [keys[2]]);
});

test("legacy blank-type images retain their actual format", async () => {
  assert.equal((await typedPhoto(new Blob([png]))).type, "image/png");
  assert.equal((await typedPhoto(new Blob([new Uint8Array([255, 216, 255])]))).type, "image/jpeg");
  assert.equal((await typedPhoto(new Blob(["GIF89a"])) ).type, "image/gif");
  await assert.rejects(typedPhoto(new Blob(["not an image"])), /Choose a JPEG/);
});

test("dated photo archives restore bytes and MIME types for every supported format", async () => {
  const state = demoHealthState(TODAY);
  const types = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
  state.progressPhotos = types.map((type, index) => photo(`photo-${index}`, index < 2 ? "2026-07-28" : TODAY));
  const source = new Blob([createSourceArchive(process.cwd())]);
  const archive = await createBaselineArchive(state, null, source, async id => new Blob([id], { type: types[Number(id.split("-")[1])] }));
  const parsed = await parseBackupFile(new File([archive], "fake-backup.zip", { type: "application/zip" }));
  assert.equal(parsed.photoEntries.length, types.length);
  let restored;
  assert.equal(await restoreArchivePhotos(parsed, async images => { restored = images; }), types.length);
  for (const image of restored) {
    assert.equal(image.blob.type, types[Number(image.id.split("-")[1])]);
    assert.equal(await image.blob.text(), image.id);
    assert.equal(parsed.state.progressPhotos.find(p => p.id === image.id).date, state.progressPhotos.find(p => p.id === image.id).date);
  }
  await assert.rejects(restoreArchivePhotos(parsed, async () => { throw new Error("Fake failed save"); }), /Fake failed save/);
});

test("photo storage works without browser storage and never reports a failed upload or delete as saved", async t => {
  const { savePhoto, loadPhoto, deletePhoto } = await import("../app/ui/photo-store.ts");
  const bucket = fakeBucket();
  const methods = [];
  let failure = false;
  t.mock.method(globalThis, "fetch", async (path, options) => {
    methods.push(options.method);
    if (failure) return new Response("Fake failure", { status: 503 });
    const id = decodeURIComponent(path.split("/").at(-1));
    return handlePhotoRequest(new Request(`https://baseline.example${path}`, options), id, ownerDeps(bucket));
  });
  await savePhoto("client-roundtrip", new Blob([png], { type: "image/png" }));
  const [first, second] = await Promise.all([loadPhoto("client-roundtrip"), loadPhoto("client-roundtrip")]);
  assert.equal(first, second, "simultaneous main image and thumbnail share their load");
  assert.deepEqual(new Uint8Array(await first.arrayBuffer()), png);
  assert.deepEqual(methods, ["PUT", "GET"]);
  failure = true;
  await assert.rejects(savePhoto("failed-save", new Blob([png], { type: "image/png" })), /unavailable/);
  await assert.rejects(deletePhoto("client-roundtrip"), /unavailable/);
  assert.equal(bucket.data.size, 1);
  failure = false;
  await deletePhoto("client-roundtrip");
  assert.equal(await loadPhoto("client-roundtrip"), null);
});

function memoryIDB(values) {
  const db = {
    close() {},
    transaction() {
      const transaction = {
        objectStore: () => Object.fromEntries(["get", "put", "delete", "clear"].map(method => [method, (...args) => {
          const req = {};
          queueMicrotask(() => {
            if (method === "get") req.result = values.get(args[0]);
            if (method === "put") values.set(args[1], args[0]);
            if (method === "delete") values.delete(args[0]);
            if (method === "clear") values.clear();
            req.onsuccess?.();
            queueMicrotask(() => transaction.oncomplete?.());
          });
          return req;
        }])),
      };
      return transaction;
    },
  };
  return { open() { const request = { result: db }; queueMicrotask(() => request.onsuccess?.()); return request; } };
}

test("opening a legacy photo carries it forward, and deleting it cannot race its migration", async t => {
  const { loadPhoto, deletePhoto } = await import("../app/ui/photo-store.ts");
  const local = new Map([["legacy", new Blob([png])], ["already-synced", { blob: new Blob([png], { type: "image/png" }), synced: true }]]);
  globalThis.indexedDB = memoryIDB(local);
  t.after(() => { delete globalThis.indexedDB; });
  const bucket = fakeBucket();
  const calls = [];
  let started;
  let continueUpload;
  const uploading = new Promise(resolve => { started = resolve; });
  const uploadReady = new Promise(resolve => { continueUpload = resolve; });
  t.mock.method(globalThis, "fetch", async (path, options) => {
    calls.push(options.method);
    if (options.method === "PUT") { started(); await uploadReady; }
    return handlePhotoRequest(new Request(`https://baseline.example${path}`, options), decodeURIComponent(path.split("/").at(-1)), ownerDeps(bucket));
  });
  const photoPromise = loadPhoto("legacy");
  await uploading;
  const removing = deletePhoto("legacy");
  continueUpload();
  assert.equal((await photoPromise).type, "image/png");
  await removing;
  assert.deepEqual(calls, ["GET", "PUT", "DELETE"]);
  assert.equal(local.has("legacy"), false);
  assert.equal(bucket.data.size, 0);
  assert.equal(await loadPhoto("already-synced"), null, "a stale local cache cannot resurrect a remotely deleted photo");
  assert.equal(bucket.data.size, 0);
});

test("full erase drains ongoing photo writes and blocks new migrations until it finishes", async t => {
  const { savePhoto, loadPhoto, pausePhotoStorage, resumePhotoStorage } = await import("../app/ui/photo-store.ts");
  t.after(resumePhotoStorage);
  let started;
  let finish;
  const began = new Promise(resolve => { started = resolve; });
  const pending = new Promise(resolve => { finish = resolve; });
  t.mock.method(globalThis, "fetch", async () => { started(); await pending; return new Response(null, { status: 204 }); });
  const saving = savePhoto("being-saved", new Blob([png], { type: "image/png" }));
  await began;
  let drained = false;
  const drain = pausePhotoStorage().then(() => { drained = true; });
  assert.equal(drained, false);
  assert.equal(await loadPhoto("blocked-photo"), null);
  await assert.rejects(savePhoto("blocked-save", new Blob([png], { type: "image/png" })), /being erased/);
  finish();
  await saving;
  await drain;
  assert.equal(drained, true);
});
