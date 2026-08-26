/**
 * Enough of a service worker to make this an app you can open in a gym
 * basement.
 *
 * The record itself is already offline — it lives in this browser's storage and
 * syncs when it can — so the only thing missing was the shell. That is all this
 * caches: the document and the built assets. Nothing from /api ever goes in,
 * because that is the record, and a stale copy of the record is worse than no
 * copy at all.
 *
 * Bump SHELL when the caching rules below change. The built assets carry
 * content hashes in their names, so a deploy invalidates them on its own.
 */
const SHELL = "baseline-shell-v4";

function isHealthyDocument(response) {
  if (!response.ok || response.redirected) return false;
  const type = response.headers.get("content-type") ?? "";
  if (!/^text\/html\b/i.test(type)) return false;
  try {
    return new URL(response.url).origin === self.location.origin;
  } catch {
    return false;
  }
}

async function installShell() {
  const cache = await caches.open(SHELL);
  const documentRequest = new Request("/", {
    cache: "reload",
    credentials: "same-origin",
  });
  const documentResponse = await fetch(documentRequest);
  if (!isHealthyDocument(documentResponse)) {
    throw new Error("Baseline shell was not available");
  }

  const html = await documentResponse.clone().text();
  const assetPaths = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)]
    .map((match) => new URL(match[1], self.location.origin))
    .filter((url) => url.origin === self.location.origin && isImmutable(url))
    .map((url) => `${url.pathname}${url.search}`);

  await Promise.all(
    [...new Set(assetPaths)].map(async (path) => {
      const response = await fetch(
        new Request(path, { cache: "reload", credentials: "same-origin" }),
      );
      if (!response.ok || response.redirected) {
        throw new Error(`Baseline asset was not available: ${path}`);
      }
      await cache.put(path, response);
    }),
  );
  await cache.put("/", documentResponse);
}

self.addEventListener("install", (event) => {
  // Cache the document and the exact hashed assets it names as one unit. A
  // half-installed shell can open offline but remain stuck before hydration.
  event.waitUntil(installShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== SHELL).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

/** A page being opened, rather than something the page asked for. */
function isNavigation(request) {
  return request.mode === "navigate";
}

/**
 * Content-hashed builds. The name changes whenever the bytes do, so serving one
 * from the cache can never be serving the wrong one.
 */
function isImmutable(url) {
  return /\/assets\/|\.[0-9a-f]{8,}\.(js|css|woff2?)$/.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // The record syncs or it does not. It is never served from a cache.
  if (url.pathname.startsWith("/api/")) return;

  if (isNavigation(request)) {
    // Demo mode must fail closed. Never store its navigation as the normal `/`
    // shell, and never answer it with a cached real-record navigation.
    if (url.searchParams.get("demo") === "1") {
      event.respondWith(fetch(new Request(request, { cache: "no-store" })));
      return;
    }
    // Network first, so a deploy is picked up the moment there is a network;
    // the cached document is what makes the app open when there is not.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (isHealthyDocument(response)) {
            const copy = response.clone();
            void caches.open(SHELL).then((cache) => cache.put("/", copy));
          }
          return response;
        })
        .catch(() => caches.match("/").then((cached) => cached ?? Response.error())),
    );
    return;
  }

  if (isImmutable(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches.open(SHELL).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Everything else same-origin: show what is cached, and replace it in the
  // background so the next load is current.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(SHELL).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached ?? Response.error());
      return cached ?? network;
    }),
  );
});
