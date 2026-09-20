import Foundation

/// The Home Screen widgets' feed builder: JavaScript the shell injects into
/// the live site at document start, after `bridge.js`, as
/// `ShellConfig.extraBootScript` (main frame only). It reads the page's own
/// browser-side copy of the record (`localStorage["bardia-health-v1"]`),
/// reduces it to numbers, dates, `HH:MM` times, category words and — for the
/// training card only — the workout and exercise names as Strong spells
/// them, and hands the result to `window.nativeShell.widgetFeed(feed)`; the
/// shell writes it as `widget-feed.json` in the App Group and reloads both
/// widgets. Notes, journal text, medication and lab names never leave the page.
///
/// Compiled into the app target only. Kept as a Swift string rather than a
/// bundled resource so the app-side type check and the JavaScript tests can
/// both read it from one place: the script is everything between the `#"""`
/// and `"""#` delimiters, unchanged.
///
/// What it never does: fetch, read a response body, touch `location`, read
/// `bardia-health-theme` or any other key, run when `window.nativeShell` is
/// absent (a foreign origin, or a plain browser), or throw into the page.
enum BaselineFeedScript {
    static let source = #"""
/* Baseline widget feed. Home origin only; numbers, dates, category words and Strong's lift names. */
(function () {
  "use strict";
  try {
    var KEY = "bardia-health-v1";
    var AUTH_KEY = "__baseline.widgetAuth";
    var ns = window.nativeShell;
    // The shell gives nativeShell to the app's own origin alone, and native
    // drops "app" messages from any other frame; a sign-in host never gets here.
    if (!ns || typeof ns.widgetFeed !== "function") return;

    var DAY_MS = 86400000;
    var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    var TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
    var SOURCE_PRIORITY = { oura: 5, apple: 4, whoop: 3, manual: 2, other: 1 };
    var LISTS = ["medications", "medicationDoses", "dailyEntries", "sleepEntries", "labResults", "workoutSets",
      "therapyNotes", "thoughtJournal", "thoughtLoops", "loopEvents", "habits", "habitEvents", "progressPhotos"];
    var demo = /(?:^|[?&])demo=1(?:&|$)/.test(location.search);

    /* ------------------------------------------------------------ dates -- */

    function pad(n) { return (n < 10 ? "0" : "") + n; }
    // The page's todayLocal(): the device's own calendar day.
    function todayLocal() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
    function utc(date) { var p = date.split("-"); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
    // A real calendar day, as the page's validIsoDate: "2026-99-99" is not one.
    function isDate(v) { return typeof v === "string" && DATE_RE.test(v) && new Date(utc(v)).toISOString().slice(0, 10) === v; }
    function addDays(date, n) { return new Date(utc(date) + n * DAY_MS).toISOString().slice(0, 10); }
    function weekday(date) { return new Date(date + "T12:00:00Z").getUTCDay(); }
    // Monday, as app/training/coach.ts measures "this week".
    function weekStart(date) { return addDays(date, -((weekday(date) + 6) % 7)); }
    function num(v) { return typeof v === "number" && isFinite(v) ? v : null; }
    function list(v) { return Array.isArray(v) ? v : []; }
    function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : null; }
    function newestFirst(a, b) { return a.d < b.d ? 1 : a.d > b.d ? -1 : 0; }
    // Whole weeks between two Mondays (weeksBetween in app/training/coach.ts).
    function weeksBetween(a, b) { return Math.round((utc(b) - utc(a)) / (7 * DAY_MS)); }

    /* --------------------------------------------------------- lifting -- */

    // A name as Strong spells it, capped; the superset asterisk is a note
    // about the sitting, not part of the name (normalizeWorkoutSet).
    function liftName(v) { return typeof v === "string" ? v.replace(/^\*+\s*/, "").trim().slice(0, 40) : ""; }
    // The load of a set: only a loaded set carries one (assisted and
    // bodyweight sets keep null, as the page normalises them).
    function load(st) {
      if (st.loadMode === "assisted" || st.loadMode === "bodyweight") return null;
      var w = num(st.weightLb);
      return w !== null && w > 0 ? w : null;
    }
    // Epley (estimateOneRepMax): past fifteen reps it declines to guess.
    function e1rm(w, r) { return w !== null && r !== null && w > 0 && r > 0 && r <= 15 ? Math.round(w * (1 + r / 30) * 10) / 10 : null; }
    // betterSet: by estimated max, or by reps when nothing is loaded.
    function better(a, b) {
      if (!b) return true;
      var x = e1rm(a.w, a.reps), y = e1rm(b.w, b.reps);
      if (x !== null || y !== null) return (x || 0) > (y || 0);
      return (a.reps || 0) > (b.reps || 0);
    }
    // compareWorkoutStarts: imported timestamps compare alike with "T" or " ".
    function laterStart(a, b) { var x = a.replace("T", " "), y = b.replace("T", " "); return x < y ? 1 : x > y ? -1 : 0; }

    function stamp() {
      return { v: 1, app: "baseline", builtAt: new Date().toISOString(), builtOn: todayLocal() };
    }

    /* ----------------------------------------------------------- record -- */

    // The envelope (format "baseline-local") or a pre-envelope bare state.
    function readState() {
      var raw = null;
      try { raw = localStorage.getItem(KEY); } catch (e) { return null; }
      if (typeof raw !== "string" || !raw) return null;
      var parsed = null;
      try { parsed = JSON.parse(raw); } catch (e) { return null; }
      parsed = obj(parsed);
      if (!parsed) return null;
      return obj(parsed.format === "baseline-local" ? parsed.state : parsed);
    }

    function build() {
      var feed = stamp();
      if (auth === "out") { feed.status = "signed-out"; return feed; }
      if (auth === "denied") { feed.status = "denied"; return feed; }
      var state = readState();
      if (!state) { feed.status = "empty"; return feed; }
      var any = false;
      for (var l = 0; l < LISTS.length; l++) { if (list(state[LISTS[l]]).length) { any = true; break; } }
      if (!any) { feed.status = "empty"; return feed; }
      feed.status = "ok";

      var today = todayLocal();
      var from14 = addDays(today, -13);
      var from90 = addDays(today, -89);

      var g = obj(state.goals) || {};
      feed.goals = {
        sleepHours: num(g.sleepHours) !== null ? g.sleepHours : 9,
        waterTargetMl: num(g.waterTargetMl),
        proteinTargetG: num(g.proteinTargetG),
        trackMedication: typeof g.trackMedication === "boolean" ? g.trackMedication : true
      };

      // Medications: schedule and answers only. Names and ids stay on the page.
      var meds = [];
      var doses = list(state.medicationDoses);
      var medications = list(state.medications);
      for (var m = 0; m < medications.length; m++) {
        var med = obj(medications[m]);
        if (!med || med.archived || typeof med.id !== "string" || !med.id) continue;
        var weekly = med.schedule === "weekly";
        var dueDay = weekly && typeof med.dueDay === "number" && med.dueDay >= 0 && med.dueDay <= 6 && med.dueDay % 1 === 0 ? med.dueDay : null;
        var answers = {};
        for (var d = 0; d < doses.length; d++) {
          var dose = obj(doses[d]);
          if (!dose || dose.medicationId !== med.id || !isDate(dose.date)) continue;
          if (dose.date < from14 || dose.date > today) continue;
          answers[dose.date] = dose.taken === true;
        }
        meds.push({ schedule: weekly ? "weekly" : "daily", dueDay: dueDay, doses: answers });
      }
      feed.meds = meds;

      // Days: the numbers a check-in holds, for the last 14 days. A journal
      // entry counts as a journaled day, as Today reads it.
      var journalDates = {};
      var journal = list(state.thoughtJournal);
      for (var j = 0; j < journal.length; j++) { var je = obj(journal[j]); if (je && isDate(je.date)) journalDates[je.date] = true; }
      var byDate = {};
      var daily = list(state.dailyEntries);
      for (var e = 0; e < daily.length; e++) { var de = obj(daily[e]); if (de && isDate(de.date) && !byDate[de.date]) byDate[de.date] = de; }
      var dayKeys = {};
      var key;
      for (key in byDate) { if (key >= from14 && key <= today) dayKeys[key] = true; }
      for (key in journalDates) { if (key >= from14 && key <= today) dayKeys[key] = true; }
      var days = [];
      var keys = Object.keys(dayKeys).sort().reverse();
      for (var k = 0; k < keys.length; k++) {
        var dk = keys[k], row = byDate[dk] || {};
        var w = num(row.weightLb), p = num(row.proteinG), wa = num(row.waterMl), mm = num(row.meditationMinutes);
        var jj = row.journaled === true || !!journalDates[dk];
        if (w === null && p === null && wa === null && mm === null && !jj) continue;
        var day = { d: dk };
        if (w !== null) day.w = w;
        if (p !== null) day.p = p;
        if (wa !== null) day.wa = wa;
        if (mm !== null) day.med = mm;
        if (jj) day.j = true;
        days.push(day);
      }
      feed.days = days;

      // Weights: up to 30 readings within 90 days.
      var weights = [];
      for (key in byDate) {
        if (key < from90 || key > today) continue;
        var wv = num(byDate[key].weightLb);
        if (wv !== null) weights.push({ d: key, w: wv });
      }
      weights.sort(newestFirst);
      feed.weights = weights.slice(0, 30);

      // Nights: one per date, the preferred source (oura > apple > whoop > manual > other).
      var preferred = {};
      var sleep = list(state.sleepEntries);
      for (var s = 0; s < sleep.length; s++) {
        var se = obj(sleep[s]);
        if (!se || !isDate(se.date) || se.date > today) continue;
        var rank = SOURCE_PRIORITY[se.source] || 0;
        var current = preferred[se.date];
        if (!current || rank > current.rank) preferred[se.date] = { rank: rank, entry: se };
      }
      function night(date) {
        var en = preferred[date].entry, out = { d: date };
        var h = num(en.durationHours);
        if (h !== null) out.h = h;
        if (TIME_RE.test(String(en.bedtime))) out.bed = en.bedtime;
        if (TIME_RE.test(String(en.wakeTime))) out.wake = en.wakeTime;
        return out;
      }
      var nightKeys = Object.keys(preferred).sort().reverse();
      var nights = [];
      for (var n = 0; n < nightKeys.length; n++) { if (nightKeys[n] >= from14) nights.push(night(nightKeys[n])); }
      feed.nights = nights;
      feed.latestNight = nightKeys.length ? night(nightKeys[0]) : null;

      // Training: sessions are distinct startedAt values. Dates, counts and
      // loads, plus the workout and exercise names as Strong spells them
      // (capped at 40 characters); never a note.
      var sets = list(state.workoutSets);
      var sessions = {}, workoutDates = {}, lastWorkout = null;
      // Per session (buildWorkoutSessions) and per exercise
      // (buildExerciseSummaries): what the Workouts list prints.
      var byStart = {}, byLift = {}, setsToDate = 0;
      for (var t = 0; t < sets.length; t++) {
        var st = obj(sets[t]);
        if (!st || !isDate(st.date) || st.date > today) continue;
        var startKey = typeof st.startedAt === "string" && st.startedAt ? st.startedAt : st.date;
        sessions[startKey] = st.date;
        workoutDates[st.date] = true;
        if (lastWorkout === null || st.date > lastWorkout) lastWorkout = st.date;
        setsToDate++;
        var lift = liftName(st.exercise), w = load(st), r = num(st.reps);
        var session = byStart[startKey];
        if (!session) session = byStart[startKey] = { d: st.date, label: liftName(st.workoutName), lifts: {}, sets: 0, vol: 0, min: null, top: null };
        session.sets++;
        session.vol += (w || 0) * (r || 0);
        if (session.min === null) { var dur = num(st.durationSeconds); if (dur !== null && dur > 0) session.min = Math.round(dur / 60); }
        if (!lift) continue;
        session.lifts[lift] = true;
        var candidate = { lift: lift, w: w, reps: r, d: st.date, key: startKey };
        if (better(candidate, session.top)) session.top = candidate;
        var ex = byLift[lift];
        if (!ex) ex = byLift[lift] = { sessions: {}, best: null, loaded: false, recent: 0 };
        if (w !== null) ex.loaded = true;
        var es = ex.sessions[startKey];
        if (!es) es = ex.sessions[startKey] = { key: startKey, top: null };
        if (better(candidate, es.top)) es.top = candidate;
        if (better(candidate, ex.best)) ex.best = candidate;
      }
      if (lastWorkout !== null) {
        var ws = weekStart(today), thisWeek = 0, sk;
        for (sk in sessions) { if (sessions[sk] >= ws && sessions[sk] <= today) thisWeek++; }
        // workoutWeekStreak (app/training/coach.ts): consecutive weeks with a
        // workout; a week still in progress does not break the run.
        var trained = {}, wd;
        for (wd in workoutDates) trained[weekStart(wd)] = true;
        var cursor = trained[ws] ? ws : addDays(ws, -7), streak = 0;
        while (trained[cursor]) { streak++; cursor = addDays(cursor, -7); }
        var recent = [];
        for (wd in workoutDates) { if (wd >= from14) recent.push(wd); }
        recent.sort().reverse();

        // The last three sessions, newest first.
        var startKeys = Object.keys(byStart).sort(laterStart);
        var recentSessions = [];
        for (var q = 0; q < startKeys.length && q < 3; q++) {
          var ss = byStart[startKeys[q]];
          var one = { d: ss.d, lifts: Object.keys(ss.lifts).length, sets: ss.sets, vol: Math.round(ss.vol) };
          if (ss.label) one.label = ss.label;
          if (ss.min !== null) one.min = ss.min;
          if (ss.top) {
            one.top = { lift: ss.top.lift };
            if (ss.top.w !== null) one.top.w = ss.top.w;
            if (ss.top.reps !== null) one.top.reps = ss.top.reps;
          }
          recentSessions.push(one);
        }

        // Eight weeks ending this week, oldest first: sessions and volume.
        var weeks = [];
        for (var wi = 7; wi >= 0; wi--) {
          var s0 = addDays(ws, -7 * wi), s1 = addDays(s0, 6), n = 0, wvol = 0;
          for (sk in byStart) { if (byStart[sk].d >= s0 && byStart[sk].d <= s1) { n++; wvol += byStart[sk].vol; } }
          weeks.push({ s: s0, n: n, vol: Math.round(wvol) });
        }

        // The week's target, as Today prints "2 of 4": the block week's chosen
        // days (currentBlockWeek, buildBlock: two or more, at most four, else
        // two), once the record holds enough to plan from (ten sets).
        var planned = null;
        if (setsToDate >= 10) {
          var chosen = list(g.trainingDays), weekIndex = 0;
          var blockStart = typeof g.trainingBlockStart === "string" && isDate(g.trainingBlockStart) ? g.trainingBlockStart : null;
          var trainedWeeks = Object.keys(trained).sort();
          if (blockStart) {
            weekIndex = ((weeksBetween(blockStart, ws) % 4) + 4) % 4;
          } else if (trainedWeeks.length && weeksBetween(trainedWeeks[trainedWeeks.length - 1], ws) < 3) {
            var anchor = trainedWeeks[0];
            for (var a = 1; a < trainedWeeks.length; a++) { if (weeksBetween(trainedWeeks[a - 1], trainedWeeks[a]) >= 3) anchor = trainedWeeks[a]; }
            weekIndex = ((weeksBetween(anchor, ws) % 4) + 4) % 4;
          }
          var picked = num(chosen[weekIndex]);
          planned = picked !== null && picked >= 2 ? Math.min(4, Math.round(picked)) : 2;
        }

        // trainingHabit: sessions per trained week over the six weeks ending
        // on the last training day, one decimal ("You train 3.5× a week").
        var habitStart = addDays(lastWorkout, -41), habitSessions = 0, habitWeeks = {};
        for (sk in byStart) { if (byStart[sk].d >= habitStart && byStart[sk].d <= lastWorkout) { habitSessions++; habitWeeks[weekStart(byStart[sk].d)] = true; } }
        var usual = habitSessions ? Math.round(habitSessions / Math.max(1, Object.keys(habitWeeks).length) * 10) / 10 : null;

        // The staples: up to four exercises by sessions in those eight weeks,
        // each with its best-ever set (betterSet) and whether that set is a
        // record of the last 30 days (recentPersonalRecords: a first attempt
        // is not a record, there is nothing to beat).
        var from30 = addDays(today, -29), from56 = addDays(ws, -49), liftKeys = Object.keys(byLift), li, lk;
        for (li = 0; li < liftKeys.length; li++) {
          var exr = byLift[liftKeys[li]];
          for (lk in exr.sessions) { if (sessions[lk] >= from56) exr.recent++; }
        }
        liftKeys.sort(function (a, b) {
          var x = byLift[a], y = byLift[b];
          return y.recent - x.recent || (x.best.d < y.best.d ? 1 : x.best.d > y.best.d ? -1 : 0) || (a < b ? -1 : a > b ? 1 : 0);
        });
        var lifts = [];
        for (li = 0; li < liftKeys.length && lifts.length < 4; li++) {
          var exl = byLift[liftKeys[li]], best = exl.best;
          if (!exl.recent || !best) continue;
          var row = { lift: liftKeys[li], d: best.d };
          if (best.w !== null) row.w = best.w;
          if (best.reps !== null) row.reps = best.reps;
          var max = e1rm(best.w, best.reps);
          if (max !== null) row.max = max;
          var record = false;
          if (best.d >= from30 && best.d <= today && Object.keys(exl.sessions).length >= 2) {
            var bodyweight = !exl.loaded, previous = null;
            for (lk in exl.sessions) {
              if (lk >= best.key) continue;
              var topSet = exl.sessions[lk].top;
              var rank = !topSet ? 0 : bodyweight ? (topSet.reps || 0) : (e1rm(topSet.w, topSet.reps) || 0);
              if (previous === null || rank > previous) previous = rank;
            }
            var current = bodyweight ? (best.reps || 0) : (e1rm(best.w, best.reps) || 0);
            record = previous !== null && current > previous;
          }
          row.pr = record;
          lifts.push(row);
        }

        feed.training = {
          lastWorkout: lastWorkout,
          thisWeek: thisWeek,
          weekStart: ws,
          streakWeeks: streak,
          importedAt: typeof state.importedAt === "string" && isDate(state.importedAt.slice(0, 10)) ? state.importedAt.slice(0, 10) : null,
          days: recent,
          planned: planned,
          usual: usual,
          weeks: weeks,
          sessions: recentSessions,
          lifts: lifts
        };
      } else {
        feed.training = null;
      }

      // latestRecordDate (app/health-model.ts): the newest dated entry, dates only.
      var latest = null;
      function consider(items) {
        for (var i = 0; i < items.length; i++) {
          var it = obj(items[i]);
          if (it && isDate(it.date) && (latest === null || it.date > latest)) latest = it.date;
        }
      }
      consider(daily); consider(sleep); consider(sets); consider(doses); consider(list(state.labResults));
      consider(list(state.therapyNotes)); consider(journal); consider(list(state.progressPhotos));
      feed.latest = latest;
      return feed;
    }

    /* ------------------------------------------------------------- send -- */

    var auth = null;
    try { auth = sessionStorage.getItem(AUTH_KEY); } catch (e) { auth = null; }
    if (auth !== "out" && auth !== "denied") auth = null;

    var timer = 0, last = "";
    // The debounce (500 ms) and the changed-content check keep a tap on the
    // page from reloading the widget's timelines; a flush (force) always sends.
    function send(force) {
      clearTimeout(timer); timer = 0;
      var feed;
      try { feed = build(); } catch (e) { feed = stamp(); feed.status = "empty"; }
      var signature = "";
      try { signature = JSON.stringify(Object.assign({}, feed, { builtAt: "" })); } catch (e) { signature = ""; }
      if (!force && signature && signature === last) return;
      last = signature;
      try { ns.widgetFeed(feed); } catch (e) { /* ignore */ }
    }
    function later() { clearTimeout(timer); timer = setTimeout(function () { send(false); }, 500); }
    function setAuth(value) {
      auth = value;
      try { if (value) sessionStorage.setItem(AUTH_KEY, value); else sessionStorage.removeItem(AUTH_KEY); } catch (e) { /* ignore */ }
      send(true);
    }
    function isLocal(store) { try { return store === window.localStorage; } catch (e) { return false; } }

    // Chained after bridge.js's wrappers, so its mirror sees every write first.
    var proto = typeof Storage === "function" ? Storage.prototype : null;
    if (proto) {
      var setItem = proto.setItem, removeItem = proto.removeItem, clear = proto.clear;
      proto.setItem = function (key) {
        var result = setItem.apply(this, arguments);
        if (isLocal(this) && String(key) === KEY) later();
        return result;
      };
      proto.removeItem = function (key) {
        var result = removeItem.apply(this, arguments);
        if (isLocal(this) && String(key) === KEY) later();
        return result;
      };
      proto.clear = function () {
        var result = clear.apply(this, arguments);
        if (isLocal(this)) later();
        return result;
      };
    }
    // Leaving the page stamps builtAt: "last opened".
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") send(true); });
    window.addEventListener("pagehide", function () { send(true); });
    // The page's post-hydration write has landed by now (bridge snapshots at +1200).
    window.addEventListener("load", function () { setTimeout(function () { send(true); }, 1500); });

    // Sign-out is invisible in localStorage (a 401 returns before any write),
    // so watch the status of the page's own request; the body is never read,
    // and the demo never fetches or writes, so it installs no hooks.
    if (!demo) {
      if (typeof window.fetch === "function") {
        var nativeFetch = window.fetch;
        window.fetch = function (input) {
          var result = nativeFetch.apply(window, arguments);
          try {
            result.then(function (response) {
              try {
                var url = new URL(response.url || (typeof input === "string" ? input : input && input.url) || "", location.href);
                if (url.origin === location.origin && url.pathname === "/api/health-state") {
                  if (response.status === 401) setAuth("out");
                  else if (response.status === 403) setAuth("denied");
                  else if (response.ok && auth) setAuth(null);
                }
              } catch (e) { /* ignore */ }
            }, function () { /* the page handles its own failures */ });
          } catch (e) { /* ignore */ }
          return result;
        };
      }
      document.addEventListener("click", function (event) {
        try {
          var target = event.target;
          if (target && typeof target.closest === "function" && target.closest('a[href^="/signout-with-chatgpt"]')) setAuth("out");
        } catch (e) { /* ignore */ }
      }, true);
    }

    send(true);
  } catch (e) { /* the widget is a convenience; the page never pays for it */ }
})();
"""#
}
