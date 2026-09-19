/*
 * bridge.js — the native shell's page-side half.
 *
 * The native app injects this at document start, before any of the page's own
 * scripts run, together with a `window.__shellBoot` object it builds per
 * launch. The page is the unmodified web app; this file gives it the handful
 * of things a WKWebView cannot do by itself:
 *
 *   1. A localStorage mirror. Every write is echoed to native storage, and any
 *      key native remembers but WebKit has lost is put back before the app
 *      boots. WebKit's storage is the live copy; the mirror is insurance.
 *   2. Downloads. `<a download>` clicks on blob:/data: URLs are turned into a
 *      native share sheet (iPhone/iPad) or a save panel (Mac).
 *   3. Web Share. navigator.share / canShare always go through the native
 *      sheet, files included.
 *   4. window.print() → the native print panel.
 *   5. Chrome sync. The page's real background colour is reported so the
 *      status bar and the areas outside the page match it in every theme.
 *   6. Notifications. A Notification polyfill plus a scheduler for repeating
 *      local notifications, so reminders fire while the app is closed.
 *
 * Nothing here changes how the page looks or behaves when the native handler
 * is absent (e.g. when this file is loaded in a plain browser for testing).
 */
(function () {
  "use strict";
  if (window.__shell) return;

  var boot = window.__shellBoot || {};
  var handler = null;
  try {
    handler = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.shell || null;
  } catch (e) { handler = null; }

  function post(message) {
    if (!handler) return false;
    try { handler.postMessage(message); return true; } catch (e) { return false; }
  }

  // Requests that native answers later resolve through __shell.settle(id, ok, payload).
  var pending = Object.create(null);
  var nextId = 1;
  function call(message) {
    return new Promise(function (resolve, reject) {
      var id = nextId++;
      pending[id] = { resolve: resolve, reject: reject };
      message.id = id;
      if (!post(message)) {
        delete pending[id];
        reject(new Error("The native shell is not available."));
      }
    });
  }

  var shell = {
    version: 1,
    platform: typeof boot.platform === "string" ? boot.platform : "ios",
    available: !!handler,
    post: post,
    call: call,
    settle: function (id, ok, payload) {
      var p = pending[id];
      if (!p) return;
      delete pending[id];
      if (ok) { p.resolve(payload); return; }
      var message = typeof payload === "string" && payload ? payload : "The request was cancelled.";
      // A dismissed share sheet must look exactly like Safari's cancelled
      // Web Share: a DOMException named AbortError, which pages test by name.
      if (message === "AbortError" && typeof DOMException === "function") {
        p.reject(new DOMException("The request was cancelled.", "AbortError"));
      } else {
        p.reject(new Error(message));
      }
    }
  };
  window.__shell = shell;

  /* ------------------------------------------------------------ storage -- */

  (function storageMirror() {
    var ls;
    try { ls = window.localStorage; } catch (e) { return; }
    if (!ls) return;

    // Put back anything native remembers that WebKit no longer has. Existing
    // keys always win: the live store is the truth, the mirror is the backup.
    //
    // Once per native launch only. The boot script is fixed for the life of
    // the web view and re-runs on every reload and cross-document navigation;
    // applying it again would resurrect keys the page has since deleted on
    // purpose ("erase everything", a disconnected token). sessionStorage
    // survives reloads within the same web view, so it carries the marker.
    var restore = boot.restore;
    var launchId = typeof boot.launchId === "string" ? boot.launchId : "";
    var restoredThisLaunch = false;
    try { restoredThisLaunch = !!launchId && sessionStorage.getItem("__shell.restoredLaunch") === launchId; } catch (e) { /* ignore */ }
    if (restore && typeof restore === "object" && !restoredThisLaunch) {
      var keys = Object.keys(restore);
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (typeof restore[key] !== "string") continue;
        try { if (ls.getItem(key) === null) ls.setItem(key, restore[key]); } catch (e) { /* quota or privacy mode */ }
      }
      try { if (launchId) sessionStorage.setItem("__shell.restoredLaunch", launchId); } catch (e) { /* ignore */ }
    }

    var proto = Storage.prototype;
    var setItem = proto.setItem, removeItem = proto.removeItem, clear = proto.clear;
    proto.setItem = function (key, value) {
      var result = setItem.call(this, key, value);
      if (this === ls) post({ type: "storage", op: "set", key: String(key), value: String(value) });
      return result;
    };
    proto.removeItem = function (key) {
      var result = removeItem.call(this, key);
      if (this === ls) post({ type: "storage", op: "remove", key: String(key) });
      return result;
    };
    proto.clear = function () {
      var result = clear.call(this);
      if (this === ls) post({ type: "storage", op: "clear" });
      return result;
    };

    // A full snapshot whenever the page goes away, so the mirror is exact
    // even if an incremental message was lost.
    function snapshot() {
      var data = {};
      try {
        for (var i = 0; i < ls.length; i++) {
          var k = ls.key(i);
          if (k !== null) data[k] = ls.getItem(k);
        }
      } catch (e) { return; }
      post({ type: "storageSnapshot", data: data });
    }
    shell.snapshotStorage = snapshot;
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") snapshot();
    });
    window.addEventListener("pagehide", snapshot);
    window.addEventListener("load", function () { setTimeout(snapshot, 1200); });
  })();

  /* ---------------------------------------------------------- downloads -- */

  var exportsApi = (function downloads() {
    // Blob URLs are often revoked right after the click (the page is tidy),
    // and fetch() would then fail. Keep the Blob itself, keyed by its URL,
    // so the export can read it after revocation.
    var blobs = new Map();
    var MAX_TRACKED = 32;
    if (typeof URL.createObjectURL === "function") {
      var createObjectURL = URL.createObjectURL, revokeObjectURL = URL.revokeObjectURL;
      URL.createObjectURL = function (object) {
        var url = createObjectURL.apply(URL, arguments);
        if (object instanceof Blob) {
          blobs.set(url, object);
          if (blobs.size > MAX_TRACKED) blobs.delete(blobs.keys().next().value);
        }
        return url;
      };
      URL.revokeObjectURL = function (url) {
        blobs.delete(url);
        return revokeObjectURL.apply(URL, arguments);
      };
    }

    function isLocalHref(href) { return /^(blob|data):/i.test(String(href || "")); }

    function utf8ToBase64(text) {
      return btoa(unescape(encodeURIComponent(text)));
    }

    function readBlob(blob) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () {
          var dataUrl = String(reader.result || "");
          var comma = dataUrl.indexOf(",");
          resolve({ mime: blob.type || "application/octet-stream", base64: comma >= 0 ? dataUrl.slice(comma + 1) : "" });
        };
        reader.onerror = function () { reject(reader.error || new Error("The file could not be read.")); };
        reader.readAsDataURL(blob);
      });
    }

    function parseDataUrl(href) {
      var match = /^data:([^,]*?)(;base64)?,(.*)$/i.exec(href);
      if (!match) return null;
      var mime = match[1] || "text/plain";
      if (match[2]) return { mime: mime, base64: match[3] };
      var text;
      try { text = decodeURIComponent(match[3]); } catch (e) { text = match[3]; }
      return { mime: mime, base64: utf8ToBase64(text) };
    }

    // Resolve the bytes behind a blob:/data: href. Synchronous lookup first,
    // then the async reads, so a revoke right after the click cannot race us.
    function payloadFor(href) {
      if (/^data:/i.test(href)) {
        var parsed = parseDataUrl(href);
        return parsed ? Promise.resolve(parsed) : Promise.reject(new Error("Unreadable data URL."));
      }
      var blob = blobs.get(href);
      if (blob) return readBlob(blob);
      return fetch(href).then(function (r) { return r.blob(); }).then(readBlob);
    }

    function exportHref(href, filename) {
      var name = filename ? String(filename) : "download";
      return payloadFor(href).then(function (payload) {
        return call({ type: "exportFile", name: name, mime: payload.mime, base64: payload.base64 });
      });
    }

    function exportText(name, text, mime) {
      return call({ type: "exportFile", name: String(name || "download.txt"), mime: mime || "text/plain", base64: utf8ToBase64(String(text)) });
    }

    if (handler) {
      var click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (this.hasAttribute("download") && isLocalHref(this.href)) {
          exportHref(this.href, this.getAttribute("download")).catch(function () {});
          return;
        }
        return click.apply(this, arguments);
      };
      document.addEventListener("click", function (event) {
        if (event.defaultPrevented) return;
        var target = event.target;
        var anchor = target && typeof target.closest === "function" ? target.closest("a[download]") : null;
        if (!anchor || !isLocalHref(anchor.href)) return;
        event.preventDefault();
        exportHref(anchor.href, anchor.getAttribute("download")).catch(function () {});
      }, true);
    }

    return { exportHref: exportHref, exportText: exportText, readBlob: readBlob };
  })();

  /* -------------------------------------------------------------- share -- */

  var shareApi = (function share() {
    function fileEntry(file) {
      return exportsApi.readBlob(file).then(function (payload) {
        return { name: file.name ? String(file.name) : "file", mime: payload.mime, base64: payload.base64 };
      });
    }
    function shareData(data) {
      data = data || {};
      var files = Array.isArray(data.files) ? data.files : [];
      return Promise.all(files.map(fileEntry)).then(function (entries) {
        return call({
          type: "share",
          title: data.title ? String(data.title) : "",
          text: data.text ? String(data.text) : "",
          url: data.url ? String(data.url) : "",
          files: entries
        }).then(function () { return undefined; });
      });
    }
    function canShare(data) {
      if (!data || typeof data !== "object") return false;
      if (Array.isArray(data.files)) {
        return data.files.length > 0 && data.files.every(function (f) { return f instanceof Blob; });
      }
      return !!(data.text || data.url || data.title);
    }
    if (handler) {
      try {
        navigator.share = shareData;
        navigator.canShare = canShare;
      } catch (e) { /* read-only navigator in an exotic engine; leave native share alone */ }
    }
    return { share: shareData, canShare: canShare };
  })();

  /* -------------------------------------------------------------- print -- */

  if (handler) {
    window.print = function () { post({ type: "print" }); };
  }

  /* -------------------------------------------------------------- chrome -- */

  (function chromeSync() {
    if (!handler) return;
    var last = "";
    function backgroundOf(element) {
      if (!element) return "";
      try { return getComputedStyle(element).backgroundColor || ""; } catch (e) { return ""; }
    }
    function isTransparent(color) {
      return !color || color === "transparent" || /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0(?:\.0+)?\s*\)$/.test(color);
    }
    function report() {
      var background = backgroundOf(document.body);
      if (isTransparent(background)) background = backgroundOf(document.documentElement);
      var systemDark = false;
      try { systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches; } catch (e) { /* ignore */ }
      var signature = background + "|" + systemDark;
      if (signature === last) return;
      last = signature;
      post({ type: "chrome", background: background, systemDark: systemDark });
    }
    shell.reportChrome = report;

    function observe() {
      report();
      try {
        var observer = new MutationObserver(function () { report(); });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
        if (document.body) observer.observe(document.body, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
      } catch (e) { /* ignore */ }
      try {
        var media = window.matchMedia("(prefers-color-scheme: dark)");
        var onChange = function () { setTimeout(report, 50); };
        if (media.addEventListener) media.addEventListener("change", onChange);
        else if (media.addListener) media.addListener(onChange);
      } catch (e) { /* ignore */ }
      // Stylesheets and theme scripts can land a beat after DOMContentLoaded.
      setTimeout(report, 250);
      setTimeout(report, 1000);
      setTimeout(report, 2500);
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", observe);
    else observe();
    window.addEventListener("pageshow", function () { setTimeout(report, 50); });
  })();

  /* ------------------------------------------------------ notifications -- */

  var notificationsApi = (function notifications() {
    var permission = typeof boot.notificationPermission === "string" ? boot.notificationPermission : "default";

    function sanitizeItems(items) {
      if (!Array.isArray(items)) return [];
      var out = [];
      for (var i = 0; i < items.length && out.length < 64; i++) {
        var item = items[i] || {};
        var hour = Number(item.hour), minute = Number(item.minute);
        if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) continue;
        out.push({
          id: item.id ? String(item.id).slice(0, 64) : ("t" + hour + "-" + minute),
          hour: hour,
          minute: minute,
          title: item.title ? String(item.title).slice(0, 120) : "",
          body: item.body ? String(item.body).slice(0, 400) : ""
        });
      }
      return out;
    }

    var api = {
      /** The permission as native last reported it: "granted" | "denied" | "default". */
      get permission() { return permission; },
      /** Ask the system. Resolves with the new permission string. */
      request: function () {
        return call({ type: "notifications", action: "request" }).then(function (result) {
          permission = result && result.permission ? String(result.permission) : permission;
          return permission;
        });
      },
      /** Resolves with { permission, scheduled: [ids] }. */
      status: function () {
        return call({ type: "notifications", action: "status" }).then(function (result) {
          if (result && result.permission) permission = String(result.permission);
          return result || { permission: permission, scheduled: [] };
        });
      },
      /** Replace every repeating daily notification with these {id, hour, minute, title, body} items. */
      schedule: function (items) { return post({ type: "notifications", action: "schedule", items: sanitizeItems(items) }); },
      clear: function () { return post({ type: "notifications", action: "clear" }); },
      /** Show one notification right now (foreground banner too). */
      notify: function (title, body) {
        return post({ type: "notifications", action: "now", title: String(title || ""), body: String(body || "") });
      },
      _setPermission: function (value) { permission = String(value || "default"); }
    };

    // WKWebView has no Notification API. When the app opted in, offer one that
    // is backed by local notifications, so pages that feature-detect it keep
    // their reminder UI.
    if (handler && boot.notifications && typeof window.Notification !== "function") {
      var ShellNotification = function (title, options) {
        options = options || {};
        this.title = String(title);
        this.body = options.body ? String(options.body) : "";
        this.tag = options.tag ? String(options.tag) : "";
        this.onclick = null; this.onclose = null; this.onerror = null; this.onshow = null;
        api.notify(this.title, this.body);
      };
      ShellNotification.prototype.close = function () {};
      ShellNotification.prototype.addEventListener = function () {};
      ShellNotification.prototype.removeEventListener = function () {};
      ShellNotification.requestPermission = function (callback) {
        return api.request().then(function (result) {
          if (typeof callback === "function") { try { callback(result); } catch (e) { /* ignore */ } }
          return result;
        });
      };
      Object.defineProperty(ShellNotification, "permission", { get: function () { return permission; } });
      window.Notification = ShellNotification;
    }
    return api;
  })();

  /* ----------------------------------------------------------- haptics -- */

  function haptic(kind) { post({ type: "haptic", kind: kind ? String(kind) : "light" }); }

  /* ----------------------------------------------------- public surface -- */

  // What an app may feature-detect if it wants to be shell-aware. Everything
  // above works without the app knowing; this is for opt-in extras such as
  // reminders that must fire while the app is closed.
  window.nativeShell = {
    version: 1,
    platform: shell.platform,
    available: !!handler,
    notifications: notificationsApi,
    share: shareApi.share,
    canShare: shareApi.canShare,
    exportFile: exportsApi.exportHref,
    exportText: exportsApi.exportText,
    print: function () { post({ type: "print" }); },
    haptic: haptic,
    /** Hand the Home Screen widget what it should show (a JSON-serialisable object). */
    widgetFeed: function (feed) {
      var json;
      try { json = JSON.stringify(feed === undefined ? null : feed); } catch (e) { return false; }
      return post({ type: "app", name: "widgetFeed", payload: json });
    },
    /** Send an app-specific message: native routes it to the app's own handler. */
    send: function (name, payload) { return post({ type: "app", name: String(name), payload: payload === undefined ? null : payload }); },
    request: function (name, payload) { return call({ type: "app", name: String(name), payload: payload === undefined ? null : payload }); }
  };
})();
