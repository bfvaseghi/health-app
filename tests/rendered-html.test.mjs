import assert from "node:assert/strict";
import test from "node:test";

test("renders the Baseline app shell", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.match(html, /<title>Baseline<\/title>/i);
  assert.match(html, /private record of sleep, training/i);
  assert.doesNotMatch(html, /codex-preview/i);

  // What makes it installable rather than a page someone bookmarks. These are
  // easy to lose in a metadata refactor and impossible to notice by looking.
  assert.match(html, /<link rel="manifest" href="[^"]*\/manifest\.webmanifest"/i);
  assert.match(html, /<link rel="apple-touch-icon" href="[^"]*\/apple-touch-icon\.png"/i);
  assert.match(html, /<meta name="mobile-web-app-capable" content="yes"/i);
  // Safari still wants the apple-prefixed one to drop the browser chrome.
  assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes"/i);
  assert.match(html, /<meta name="apple-mobile-web-app-title" content="Baseline"/i);
  assert.match(html, /<meta name="viewport" content="[^"]*viewport-fit=cover[^"]*"/i);
});
