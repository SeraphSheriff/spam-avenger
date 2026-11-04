// Spam Avenger v1.0.66 — per-message action history tests.
// v1.0.66 (Michael's ask, Oct 31 2026): when a lane is LAUNCHED
// for a message, the panel remembers it (chrome.storage.local,
// keyed by the message, lanes + timestamps only, pruned to the
// 100 most recently touched messages), and coming back to the
// same message presets each lane's status line to
// "✓ Launched <Mon D, H:MM AM/PM>" ("✓ Complaint opened ..." for
// the complaint lane). Nothing is ever disabled, and the wording
// is never "Sent"/"Submitted" — the user reviews and sends or
// submits everything themselves outside the panel.
// This suite drives the extracted [sa-history-helpers] block
// against a fake chrome.storage.local, and pins the lane wiring
// in renderResult / gmailForwardPhish / markAlreadyReported by
// source position, in the style of test-v1064-accordion-pid.js.
// Run: node tests/test-v1066-action-history.js
//
// v1.0.66-test2 (Michael's live test of test1, Oct 31 2026):
// "I didn't see any change." test1's marks were small status
// lines under rows and inside collapsed sections — invisible on
// a fresh panel. test2 adds a ✓ badge on each lane's OUTER
// control (section toggle / action-row button), applied both
// from the stored record on panel open and in-session at the
// moment a lane launches; the recording triggers stay audited
// onto the REAL action buttons' click paths (inner compose /
// form buttons, the FTC/SB/Forward row buttons, the PID lane's
// Open-in-Gmail button) — expand/collapse toggles and the PID
// Draft button must never record. The PID lane ("pid") joins
// SA_LANES. The test2 tests are appended below the test1 ones.
//
// v1.0.66-test3 (Michael's call after the test2 live test,
// Oct 31 2026): the PID badge moves OFF the blue section
// toggle (a pure expand/collapse control) and onto the green
// action button itself — sf-demand-open, "Open in Gmail —
// just click Send". Because renderDemandStep builds that
// button asynchronously (after D.loadDetails() resolves), the
// render-end preset pass cannot reach it; the demand step
// presets its own badge at build time, guarded against the
// panel having moved on to a different message. The test3
// pins below replace the test2 pid-registry pins.
//
// v1.0.66-test4 (Michael's follow-up call after the test3 live
// test, Oct 31 2026): the PID toggle badge comes BACK — as a
// display-only MIRROR of the green button's badge. Both carry
// the identical timestamp in every path: the render-end pass
// badges the toggle from the stored record (collapsed section,
// never expanded), the demand step's self-preset applies the
// same stored timestamp to button AND toggle, and the in-
// session click badges both with one shared `now`. The toggle
// still never RECORDS — that test3 principle stands; only the
// test3 pins asserting the toggle could never carry a badge
// are superseded, and they are marked as such below.
//
// v1.0.66-test5 (Michael's call after the test4 live test,
// Oct 31 2026): the ABUSE (complaint) lane takes the PID
// shape — the badge lives on the inner action button itself
// (the form kit's "Copy evidence & open the <X> abuse form"
// button AND the email lane's "Open in Gmail — just click
// Send" button), and the section toggle carries the mirror.
// Complaint therefore registers TWO badge targets
// ({ els: [toggle, button] }); applyLaunchedBadge walks the
// els array, and every other lane keeps the single { el }
// shape. One `now` per click feeds the record, the status
// line, and both badges. HAZARD handled in the build: both
// complaint buttons used to rewrite their WHOLE textContent
// for the "Copied!…" confirmation (restored 6s later) — a
// badge child would be wiped, and a captured "original label"
// would bake badge text into the restore string. Each
// button's label now lives in its own .sf-btn-label span
// (the actionRow .sf-acc-label arrangement), the swaps write
// only that span, and the badge rides as a sibling. The
// test5 pins below cover the dual registration, the shared
// `now`, the label-span-only swaps, and a helper-driven
// simulation of the swap/restore end state.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const contentSrc = fs.readFileSync(path.join(ROOT, "content.js"), "utf8");
const cssSrc = fs.readFileSync(path.join(ROOT, "panel.css"), "utf8");
const reportfillSrc = fs.readFileSync(path.join(ROOT, "reportfill.js"), "utf8");
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); }
}

// ---------- manifest: version bumped, NOTHING else grew ----------
ok("manifest version is 1.0.70", manifest.version === "1.0.70",
  "got " + manifest.version);
ok("permissions unchanged: storage only",
  JSON.stringify(manifest.permissions) === JSON.stringify(["storage"]));
ok("no new host permissions (still the 1.0.65 set)",
  Array.isArray(manifest.host_permissions) &&
  manifest.host_permissions.length === 11);

// ---------- extract the history helpers ----------
const bMark = "// [sa-history-helpers-begin]";
const eMark = "// [sa-history-helpers-end]";
const bi = contentSrc.indexOf(bMark), ei = contentSrc.indexOf(eMark);
ok("history helper block markers found", bi !== -1 && ei > bi);
// Minimal fake DOM for the test2 badge applier: elements are
// plain objects with childNodes/appendChild/setAttribute, and
// document.createElement hands out fresh ones.
function makeFakeEl() {
  return {
    className: "", textContent: "", attrs: {}, childNodes: [],
    setAttribute: function (k, v) { this.attrs[k] = v; },
    appendChild: function (c) { this.childNodes.push(c); return c; }
  };
}
const fakeDocument = { createElement: function () { return makeFakeEl(); } };

let H = null;
if (bi !== -1 && ei > bi) {
  const block = contentSrc.slice(
    contentSrc.indexOf("\n", bi) + 1, ei);
  H = vm.runInNewContext(block + "\n;({" +
    "KEY: SA_HISTORY_KEY, MAX: SA_HISTORY_MAX, LANES: SA_LANES," +
    "key: saHistoryKey, prune: saPruneHistory, fmt: saFormatWhen," +
    "launched: saLaunchedText, opened: saOpenedText," +
    "preset: saPresetText, record: saRecordLaunched," +
    "load: saLoadLaunched," +
    "fmtTime: saFormatTime, badgeText: saBadgeText," +
    "badgeTitle: saBadgeTitle, badgeOn: saBadgeOnElement });",
    { document: fakeDocument });
}
ok("history helpers evaluate standalone",
  !!H && typeof H.key === "function" && typeof H.record === "function");

// ---------- fake chrome.storage.local ----------
function fakeStorage(seed) {
  const data = {};
  if (seed) Object.keys(seed).forEach(function (k) { data[k] = seed[k]; });
  return {
    data: data,
    get: function (key, cb) {
      const res = {};
      if (Object.prototype.hasOwnProperty.call(data, key)) res[key] = data[key];
      cb(res);
    },
    set: function (payload, cb) {
      Object.keys(payload).forEach(function (k) { data[k] = payload[k]; });
      if (cb) cb();
    }
  };
}
const T0 = new Date(2026, 9, 31, 10, 15).getTime(); // Oct 31, 10:15 AM local

if (H) {
  // ---------- key selection ----------
  ok("key: analysis Message-ID preferred over legacy id",
    H.key({ messageId: "<abc@example.com>" }, "legacy123") ===
      "<abc@example.com>");
  ok("key: Message-ID trimmed",
    H.key({ messageId: "  <abc@example.com>  " }, null) ===
      "<abc@example.com>");
  ok("key: legacy fallback when Message-ID empty",
    H.key({ messageId: "" }, "legacy123") === "legacy123");
  ok("key: legacy fallback when Message-ID blank/whitespace",
    H.key({ messageId: "   " }, "legacy123") === "legacy123");
  ok("key: legacy fallback when analysis is null",
    H.key(null, "legacy123") === "legacy123");
  ok("key: null when neither exists",
    H.key({ messageId: "" }, "") === null && H.key(null, null) === null);

  // ---------- formatting ----------
  ok("format: Oct 31, 10:15 AM",
    H.fmt(T0) === "Oct 31, 10:15 AM", H.fmt(T0));
  ok("format: midnight is 12:00 AM, minutes zero-padded",
    H.fmt(new Date(2026, 0, 5, 0, 5).getTime()) === "Jan 5, 12:05 AM");
  ok("format: noon is 12 PM",
    H.fmt(new Date(2026, 11, 25, 12, 30).getTime()) === "Dec 25, 12:30 PM");
  ok("launched text: check + Launched + when",
    H.launched(T0) === "\u2713 Launched Oct 31, 10:15 AM");
  ok("opened text: check + Complaint opened + when",
    H.opened(T0) === "\u2713 Complaint opened Oct 31, 10:15 AM");
  ok("wording is never Sent/Submitted",
    !/Sent|Submitted/.test(H.launched(T0)) &&
    !/Sent|Submitted/.test(H.opened(T0)));

  // ---------- recording ----------
  const st = fakeStorage();
  ok("record: write initiated for a valid lane",
    H.record(st, "msg1", "ftc", T0) === true);
  ok("record: stored under the single history key",
    !!st.data[H.KEY] && !!st.data[H.KEY].msg1);
  ok("record: lane timestamp stored",
    st.data[H.KEY].msg1.ftc === T0);
  H.record(st, "msg1", "sb", T0 + 1000);
  ok("record: second lane merges into the same record",
    st.data[H.KEY].msg1.ftc === T0 && st.data[H.KEY].msg1.sb === T0 + 1000);
  H.record(st, "msg1", "ftc", T0 + 2000);
  ok("record: re-launch overwrites the lane timestamp",
    st.data[H.KEY].msg1.ftc === T0 + 2000 &&
    st.data[H.KEY].msg1.sb === T0 + 1000);
  ok("record: hygiene — only lane keys, only numbers",
    Object.keys(st.data[H.KEY].msg1).every(function (k) {
      return H.LANES.indexOf(k) !== -1 &&
        typeof st.data[H.KEY].msg1[k] === "number";
    }));
  ok("record: unknown lane rejected, nothing written",
    H.record(st, "msg1", "bogus", T0) === false &&
    !("bogus" in st.data[H.KEY].msg1));
  ok("record: null key rejected",
    H.record(st, null, "ftc", T0) === false);
  ok("record: no storage at all is a quiet false",
    H.record(null, "msg1", "ftc", T0) === false &&
    H.record(undefined, "msg1", "ftc", T0) === false);
  // Failure paths must never throw — a history write can never
  // break the lane it rides along with.
  const throwingGet = { get: function () { throw new Error("boom"); },
    set: function () {} };
  let threw = false;
  try { H.record(throwingGet, "msg1", "ftc", T0); } catch (e) { threw = true; }
  ok("record: throwing storage.get is swallowed (returns false)",
    !threw && H.record(throwingGet, "msg1", "ftc", T0) === false);
  const throwingSet = fakeStorage();
  throwingSet.set = function () { throw new Error("boom"); };
  threw = false;
  try { H.record(throwingSet, "msg1", "ftc", T0); } catch (e) { threw = true; }
  ok("record: throwing storage.set is swallowed", !threw);
  ok("lane still opens after a failed record (regression shape)",
    (function () {
      let opened = false;
      H.record(throwingGet, "msg1", "ftc", T0); // must not throw
      opened = true; // the lane's own open() call
      return opened;
    })());

  // ---------- pruning ----------
  const big = {};
  for (let i = 0; i < 105; i++) big["m" + i] = { ftc: T0 + i * 1000 };
  const pruned = H.prune(big, 100);
  ok("prune: caps at 100 records", Object.keys(pruned).length === 100);
  ok("prune: oldest-by-newest-ts dropped, newest kept",
    !("m0" in pruned) && !("m4" in pruned) &&
    ("m5" in pruned) && ("m104" in pruned));
  const prunedBad = H.prune({ a: null, b: { ftc: "nope" },
    c: { sb: T0 }, d: "junk" }, 100);
  ok("prune: malformed records dropped, valid kept",
    Object.keys(prunedBad).length === 1 && !!prunedBad.c);
  const stBig = fakeStorage({ saActionHistory: big });
  H.record(stBig, "brand-new", "google", T0 + 999999);
  ok("record: write path prunes the store to 100",
    Object.keys(stBig.data[H.KEY]).length === 100 &&
    !!stBig.data[H.KEY]["brand-new"] && !("m0" in stBig.data[H.KEY]));

  // ---------- loading ----------
  let loaded = "unset";
  H.load(st, "msg1", function (rec) { loaded = rec; });
  ok("load: returns the record for a known message",
    !!loaded && loaded.sb === T0 + 1000);
  H.load(st, "never-seen", function (rec) { loaded = rec; });
  ok("load: null for an unknown message", loaded === null);
  H.load(null, "msg1", function (rec) { loaded = rec; });
  ok("load: null when storage unavailable", loaded === null);
  threw = false;
  try {
    H.load(throwingGet, "msg1", function (rec) { loaded = rec; });
  } catch (e) { threw = true; }
  ok("load: throwing storage reports null, never throws",
    !threw && loaded === null);

  // ---------- preset logic ----------
  ok("preset: FTC record presets the launched line",
    H.preset("", { ftc: T0 }, "ftc") === "\u2713 Launched Oct 31, 10:15 AM");
  ok("preset: complaint lane uses the opened wording",
    H.preset("", { complaint: T0 }, "complaint") ===
      "\u2713 Complaint opened Oct 31, 10:15 AM");
  ok("preset: a status from THIS session is never overwritten",
    H.preset("\u2713 Report ready — the form opens filled in.",
      { ftc: T0 }, "ftc") === null);
  ok("preset: no record for the lane -> null",
    H.preset("", { sb: T0 }, "ftc") === null &&
    H.preset("", null, "ftc") === null);
  ok("preset: never disables — returns text or null only",
    typeof H.preset("", { fwd: T0 }, "fwd") === "string");

  // ---------- test2: the pid lane joins the store ----------
  ok("lanes: pid included, test1 lanes intact and in order " +
    "(v1.0.71: website/registrar appended after pid)",
    JSON.stringify(H.LANES.slice(0, 6)) === JSON.stringify(
      ["complaint", "ftc", "sb", "fwd", "google", "pid"]) &&
    JSON.stringify(H.LANES.slice(6)) === JSON.stringify(
      ["website", "registrar"]),
    JSON.stringify(H.LANES));
  const stPid = fakeStorage();
  ok("record: pid lane accepted and stored",
    H.record(stPid, "msgP", "pid", T0) === true &&
    stPid.data[H.KEY].msgP.pid === T0);
  ok("preset: pid record presets the launched line",
    H.preset("", { pid: T0 }, "pid") ===
      "\u2713 Launched Oct 31, 10:15 AM");

  // ---------- test2: badge text / title formatting ----------
  ok("time format: 10:15 AM", H.fmtTime(T0) === "10:15 AM");
  ok("time format: midnight/noon",
    H.fmtTime(new Date(2026, 0, 5, 0, 5).getTime()) === "12:05 AM" &&
    H.fmtTime(new Date(2026, 11, 25, 12, 30).getTime()) === "12:30 PM");
  ok("badge text: check + short time",
    H.badgeText(T0) === "\u2713 10:15 AM", H.badgeText(T0));
  ok("badge text: no timestamp -> bare check",
    H.badgeText(null) === "\u2713" && H.badgeText(undefined) === "\u2713");
  ok("badge title: form lanes use the launched line",
    H.badgeTitle("ftc", T0, false) === "\u2713 Launched Oct 31, 10:15 AM" &&
    H.badgeTitle("pid", T0, false) === "\u2713 Launched Oct 31, 10:15 AM");
  ok("badge title: complaint uses the opened line",
    H.badgeTitle("complaint", T0, false) ===
      "\u2713 Complaint opened Oct 31, 10:15 AM");
  ok("badge title: google banner case is the already-reported line",
    H.badgeTitle("google", T0, true) ===
      "Already reported to Google \u2713" &&
    H.badgeTitle("google", null, true) ===
      "Already reported to Google \u2713");

  // ---------- test2: badge application on a (fake) control ----------
  const host = makeFakeEl();
  host.appendChild({ className: "sf-acc-caret" });
  host.appendChild({ className: "sf-acc-label" });
  const b1 = H.badgeOn(host, "ftc", T0, false);
  ok("badge: created as span.sf-done-badge",
    !!b1 && b1.className === "sf-done-badge");
  ok("badge: text is check + short time, title is the full line",
    b1.textContent === "\u2713 10:15 AM" &&
    b1.attrs.title === "\u2713 Launched Oct 31, 10:15 AM");
  ok("badge: appended AFTER the existing children (never inside the label)",
    host.childNodes.length === 3 && host.childNodes[2] === b1 &&
    host.childNodes[1].className === "sf-acc-label");
  const b2 = H.badgeOn(host, "ftc", T0 + 3600000, false);
  ok("badge: second application updates in place, never stacks",
    b2 === b1 && host.childNodes.length === 3 &&
    b1.textContent === "\u2713 11:15 AM");
  const hostC = makeFakeEl();
  const bC = H.badgeOn(hostC, "complaint", T0, false);
  ok("badge: complaint title carries the opened wording",
    bC.attrs.title === "\u2713 Complaint opened Oct 31, 10:15 AM");
  const hostG = makeFakeEl();
  const bG = H.badgeOn(hostG, "google", null, true);
  ok("badge: google banner case — bare check + already-reported title",
    bG.textContent === "\u2713" &&
    bG.attrs.title === "Already reported to Google \u2713");
  ok("badge: null element is a quiet null",
    H.badgeOn(null, "ftc", T0, false) === null);

  // ---------- test4: the PID mirror across the async order —
  // the demand step renders AFTER the render-end history pass.
  // Three paths, one stored record, identical timestamps:
  // (a) render end badges the TOGGLE from the record via the
  // registry (section never expanded); (b) the demand step
  // builds later and self-presets the BUTTON, re-mirroring the
  // same timestamp onto the toggle; (c) an in-session click
  // badges both with one shared `now`. Driven here through the
  // real helpers in the real order, with the registry modeled
  // exactly as renderResult builds it.
  const stAsync = fakeStorage();
  stAsync.data[H.KEY] = { msgA: { pid: T0 } };
  const pidToggle = makeFakeEl();
  const reg4 = { pid: { el: pidToggle } };
  function applyReg4(lane, ts) {
    const t = reg4[lane];
    if (t && t.el) H.badgeOn(t.el, lane, ts, false);
  }
  const toggleBadges = function () {
    return pidToggle.childNodes.filter(function (n) {
      return n.className === "sf-done-badge";
    });
  };
  // Pass 1 (render end): the history loads and the registry
  // pass badges the toggle straight from the stored record.
  H.load(stAsync, "msgA", function (rec) {
    if (rec) Object.keys(rec).forEach(function (lane) {
      if (typeof rec[lane] === "number") applyReg4(lane, rec[lane]);
    });
  });
  ok("mirror (a): render-end pass badges the pid toggle from " +
     "the stored record",
    toggleBadges().length === 1 &&
    toggleBadges()[0].textContent === "\u2713 10:15 AM" &&
    toggleBadges()[0].attrs.title ===
      "\u2713 Launched Oct 31, 10:15 AM");
  // Pass 2 (the demand step builds later): it loads the
  // history itself, badges the freshly built button, and
  // re-mirrors the SAME stored timestamp onto the toggle.
  const demandBtn = makeFakeEl();
  H.load(stAsync, "msgA", function (rec) {
    if (rec && typeof rec.pid === "number") {
      H.badgeOn(demandBtn, "pid", rec.pid, false);
      H.badgeOn(pidToggle, "pid", rec.pid, false);
    }
  });
  const pidBadges = demandBtn.childNodes.filter(function (n) {
    return n.className === "sf-done-badge";
  });
  ok("async order: late-built demand button still gets its " +
     "preset badge",
    pidBadges.length === 1 &&
    pidBadges[0].textContent === "\u2713 10:15 AM" &&
    pidBadges[0].attrs.title ===
      "\u2713 Launched Oct 31, 10:15 AM");
  ok("mirror (b): after the demand-step preset, button and " +
     "toggle wear the IDENTICAL badge",
    toggleBadges().length === 1 &&
    toggleBadges()[0].textContent === pidBadges[0].textContent &&
    toggleBadges()[0].attrs.title === pidBadges[0].attrs.title);
  // Path (c): an in-session click records with one `now` and
  // badges BOTH elements with that same value — in place,
  // never stacked, never divergent.
  const clickNow = T0 + 3600000;
  H.record(stAsync, "msgA", "pid", clickNow);
  H.badgeOn(demandBtn, "pid", clickNow, false);
  H.badgeOn(pidToggle, "pid", clickNow, false);
  ok("mirror (c): in-session click badges button and toggle " +
     "with one identical timestamp",
    stAsync.data[H.KEY].msgA.pid === clickNow &&
    demandBtn.childNodes.filter(function (n) {
      return n.className === "sf-done-badge";
    }).length === 1 &&
    toggleBadges().length === 1 &&
    pidBadges[0].textContent === "\u2713 11:15 AM" &&
    toggleBadges()[0].textContent === pidBadges[0].textContent &&
    toggleBadges()[0].attrs.title === pidBadges[0].attrs.title);
  // A message with no pid record leaves BOTH clean, through
  // both passes (registry pass + demand-step build).
  const cleanBtn = makeFakeEl();
  const cleanToggle = makeFakeEl();
  const regClean = { pid: { el: cleanToggle } };
  H.load(stAsync, "msgB", function (rec) {
    if (rec) Object.keys(rec).forEach(function (lane) {
      const t = regClean[lane];
      if (t && t.el && typeof rec[lane] === "number") {
        H.badgeOn(t.el, lane, rec[lane], false);
      }
    });
    if (rec && typeof rec.pid === "number") {
      H.badgeOn(cleanBtn, "pid", rec.pid, false);
      H.badgeOn(cleanToggle, "pid", rec.pid, false);
    }
  });
  ok("mirror: no pid record -> button AND toggle stay clean",
    cleanBtn.childNodes.length === 0 &&
    cleanToggle.childNodes.length === 0);

  // ---------- test5: the complaint lane's TWO targets —
  // inner button + toggle mirror, one stored record. Modeled
  // exactly as renderResult now registers them: complaint's
  // entry is { els: [toggle, button] } and applyLaunchedBadge
  // walks the array (the other lanes' { el } shape is
  // exercised by the pid simulation above).
  function applyEls(entry, lane, ts) {
    const els = entry.els || (entry.el ? [entry.el] : []);
    els.forEach(function (el) { H.badgeOn(el, lane, ts, false); });
  }
  function badgesOf(el) {
    return el.childNodes.filter(function (n) {
      return n.className === "sf-done-badge";
    });
  }
  const stC = fakeStorage();
  stC.data[H.KEY] = { msgC: { complaint: T0 } };
  const cToggle = makeFakeEl();
  const cBtn = makeFakeEl();
  const regC = { complaint: { els: [cToggle, cBtn] } };
  // Render end: the registry pass applies the record to BOTH
  // registered elements.
  H.load(stC, "msgC", function (rec) {
    if (rec) Object.keys(rec).forEach(function (lane) {
      if (typeof rec[lane] === "number" && regC[lane]) {
        applyEls(regC[lane], lane, rec[lane]);
      }
    });
  });
  ok("test5 preset: one complaint record badges button AND " +
     "toggle with the identical badge",
    badgesOf(cToggle).length === 1 && badgesOf(cBtn).length === 1 &&
    badgesOf(cBtn)[0].textContent === "\u2713 10:15 AM" &&
    badgesOf(cBtn)[0].attrs.title ===
      "\u2713 Complaint opened Oct 31, 10:15 AM" &&
    badgesOf(cToggle)[0].textContent ===
      badgesOf(cBtn)[0].textContent &&
    badgesOf(cToggle)[0].attrs.title ===
      badgesOf(cBtn)[0].attrs.title);
  // In-session: one shared `now` re-badges both, in place.
  const cNow = T0 + 3600000;
  H.record(stC, "msgC", "complaint", cNow);
  applyEls(regC.complaint, "complaint", cNow);
  ok("test5 in-session: one shared `now` updates both badges " +
     "in place, never stacked, never divergent",
    stC.data[H.KEY].msgC.complaint === cNow &&
    badgesOf(cToggle).length === 1 && badgesOf(cBtn).length === 1 &&
    badgesOf(cBtn)[0].textContent === "\u2713 11:15 AM" &&
    badgesOf(cToggle)[0].textContent ===
      badgesOf(cBtn)[0].textContent &&
    badgesOf(cToggle)[0].attrs.title ===
      badgesOf(cBtn)[0].attrs.title);
  // No record for the message: both stay clean.
  const cleanCToggle = makeFakeEl();
  const cleanCBtn = makeFakeEl();
  const regCleanC = { complaint: { els: [cleanCToggle, cleanCBtn] } };
  H.load(stC, "never-reported", function (rec) {
    if (rec) Object.keys(rec).forEach(function (lane) {
      if (typeof rec[lane] === "number" && regCleanC[lane]) {
        applyEls(regCleanC[lane], lane, rec[lane]);
      }
    });
  });
  ok("test5: no complaint record -> button AND toggle stay clean",
    cleanCBtn.childNodes.length === 0 &&
    cleanCToggle.childNodes.length === 0);

  // ---------- test5: the label-swap end state — the badge
  // survives the "Copied!…" swap and the 6s restore, because
  // the swap writes only the label span and the badge is its
  // sibling. Simulated with the real badge helper on a fake
  // button shaped exactly like the shipped one:
  // [span.sf-btn-label][span.sf-done-badge].
  const swapBtn = makeFakeEl();
  const swapLabel = makeFakeEl();
  swapLabel.className = "sf-btn-label";
  swapLabel.textContent = "Open in Gmail \u2014 just click Send";
  swapBtn.appendChild(swapLabel);
  H.badgeOn(swapBtn, "complaint", T0, false);
  // The click: swap the label (label span only), badge stays.
  const origLabel = swapLabel.textContent;
  swapLabel.textContent =
    "Copied! Paste into the email (Ctrl+V), then Send";
  ok("test5 swap: during the Copied! label the badge survives " +
     "as the label span's sibling",
    swapBtn.childNodes.length === 2 &&
    swapBtn.childNodes[0] === swapLabel &&
    badgesOf(swapBtn).length === 1 &&
    badgesOf(swapBtn)[0].textContent === "\u2713 10:15 AM");
  // The 6s restore writes the captured label back — captured
  // from the LABEL span, so no badge text can bake into it.
  swapLabel.textContent = origLabel;
  ok("test5 end state: restored label + badge, exactly one " +
     "of each, label byte-identical",
    swapBtn.childNodes.length === 2 &&
    swapLabel.textContent === "Open in Gmail \u2014 just click Send" &&
    badgesOf(swapBtn).length === 1 &&
    badgesOf(swapBtn)[0].attrs.title ===
      "\u2713 Complaint opened Oct 31, 10:15 AM");
}

// ---------- lane wiring (source pins) ----------
ok("store key is saActionHistory",
  contentSrc.indexOf('"saActionHistory"') !== -1);
ok("render captures the message key (analysis + legacy fallback)",
  contentSrc.indexOf("saHistoryKey(a, currentMessageId())") !== -1 &&
  contentSrc.indexOf("sfCurrentMsgKey = msgKey") !== -1);

// FTC / SB: record inside stashThenOpen's open() choke point.
const stashStart = contentSrc.indexOf("function stashThenOpen(");
const stashEnd = contentSrc.indexOf("acc.actionRow(\"sf-sec-ftc\"");
ok("stashThenOpen takes a lane and records at open()",
  stashStart !== -1 && stashEnd > stashStart &&
  contentSrc.slice(stashStart, stashEnd)
    .indexOf("recordLaunched(lane)") !== -1 &&
  contentSrc.slice(stashStart, stashEnd)
    .indexOf("window.open(url,") !== -1 &&
  contentSrc.slice(stashStart, stashEnd)
    .indexOf("window.open(url,") <
  contentSrc.slice(stashStart, stashEnd)
    .indexOf("recordLaunched(lane)"));
ok("FTC call site passes its lane",
  contentSrc.indexOf('ftcStatus.set, "ftc"') !== -1);
ok("Safe Browsing call site passes its lane",
  contentSrc.indexOf('sbStatus.set, "sb"') !== -1);
ok("pendingReport stash contract untouched (shape + key)",
  contentSrc.indexOf("chrome.storage.local.set({ pendingReport: {") !== -1 &&
  contentSrc.indexOf("savedAt: Date.now()") !== -1 &&
  reportfillSrc.indexOf('chrome.storage.local.get("pendingReport"') !== -1 &&
  reportfillSrc.indexOf('chrome.storage.local.remove("pendingReport")') !== -1);

// Complaint: compose button opens, then records (both branches).
const compOpen = contentSrc.indexOf("window.open(plan.url,");
ok("compose button records 'complaint' after window.open",
  compOpen !== -1 &&
  contentSrc.slice(compOpen, compOpen + 600)
    .indexOf('recordLaunched("complaint")') !== -1);
ok("form-kit button records 'complaint' after opening the form",
  contentSrc.indexOf("window.open(formLane.url,") !== -1 &&
  contentSrc.slice(contentSrc.indexOf("window.open(formLane.url,"),
    contentSrc.indexOf("window.open(formLane.url,") + 600)
    .indexOf('recordLaunched("complaint")') !== -1);
ok("complaint launched-status element exists (both branches)",
  (contentSrc.match(/id": "sf-complaint-status"/g) || []).length === 2 ||
  (contentSrc.match(/"id": "sf-complaint-status"/g) || []).length === 2);

// Forward: record in done(), status line under the row.
const fwdStart = contentSrc.indexOf("function gmailForwardPhish()");
const fwdDone = contentSrc.indexOf("function done()", fwdStart);
ok("gmailForwardPhish done() records 'fwd' and writes the status line",
  fwdStart !== -1 && fwdDone > fwdStart &&
  contentSrc.slice(fwdDone, fwdDone + 900)
    .indexOf('recordLaunched("fwd")') !== -1 &&
  contentSrc.slice(fwdDone, fwdDone + 900)
    .indexOf('getElementById("sf-fwd-status")') !== -1);
ok("forward status line rendered under the row (sf-fwd-status)",
  contentSrc.indexOf('mkStashStatus("sf-fwd-status")') !== -1);

// Google: r.ok branch + markAlreadyReported record; banner wins.
const rbStart = contentSrc.indexOf('id: "sf-report-phish"');
const rbSlice = rbStart === -1 ? "" : contentSrc.slice(rbStart, rbStart + 2600);
ok("Google button r.ok branch records 'google'",
  rbSlice.indexOf('recordLaunched("google")') !== -1 &&
  rbSlice.indexOf('recordLaunched("google")') >
    rbSlice.indexOf("if (r.ok)"));
const marStart = contentSrc.indexOf("function markAlreadyReported()");
ok("markAlreadyReported() records 'google'",
  marStart !== -1 &&
  contentSrc.slice(marStart, marStart + 500)
    .indexOf('recordLaunched("google")') !== -1);
ok("google launched-status element exists (sf-google-status)",
  contentSrc.indexOf("sf-google-status") !== -1);
ok("render checks Gmail's banner and shows Already reported",
  contentSrc.indexOf('googleStatusEl.textContent = ' +
    '"Already reported to Google \\u2713"') !== -1 &&
  (contentSrc.match(/reported this message as phishing/g) || [])
    .length >= 2);

// Display: the history load presets every lane, lanes stay live.
const loadCall = contentSrc.indexOf("saLoadLaunched(saStorageLocal(), msgKey");
ok("render loads history for the current message and presets lanes",
  loadCall !== -1 &&
  ["ftc", "sb", "fwd", "complaint", "google"].every(function (lane) {
    return contentSrc.slice(loadCall, loadCall + 2000)
      .indexOf('preset(') !== -1 &&
      contentSrc.slice(loadCall, loadCall + 2000)
        .indexOf('"' + lane + '"') !== -1;
  }));
ok("no history code disables a lane (no disabled=true on presets)",
  contentSrc.slice(loadCall, loadCall + 2000)
    .indexOf("disabled") === -1);

// ---------- test2: badge registry + application (source pins) ----------
ok("SA_LANES in source gained pid, test1 order preserved " +
  "(v1.0.71: website/registrar appended, original order intact)",
  contentSrc.indexOf('var SA_LANES = ["complaint", "ftc", "sb", ' +
    '"fwd", "google", "pid",') !== -1);
["ftc", "sb", "fwd", "google", "pid"].forEach(function (lane) {
  ok("badge target registered for lane: " + lane,
    contentSrc.indexOf("badgeTargets." + lane + " = { el:") !== -1);
});
// test5: complaint registers TWO targets per branch — the
// toggle first (the mirror), then the inner button pushed in
// once built — under the els-array shape, and applyLaunchedBadge
// walks that array.
ok("test5: complaint registers the toggle as els[0] in both branches",
  contentSrc.indexOf("badgeTargets.complaint = { els: [kitSec.toggle] }") !== -1 &&
  contentSrc.indexOf("badgeTargets.complaint = { els: [compSec.toggle] }") !== -1);
ok("test5: both complaint buttons are pushed in as the second target",
  contentSrc.indexOf("badgeTargets.complaint.els.push(formBtn)") !== -1 &&
  contentSrc.indexOf("badgeTargets.complaint.els.push(compBtn)") !== -1);
ok("test5: applyLaunchedBadge walks the els array (single-el " +
   "lanes unchanged)",
  contentSrc.indexOf("var els = t.els || (t.el ? [t.el] : [])") !== -1 &&
  contentSrc.indexOf("saBadgeOnElement(els[i], lane, ts, already)") !== -1);
// test4 SUPERSEDES the two test3 pins that stood here ("pid is
// NOT registered as a badge target" / "nothing badges the pid
// toggle"): Michael's follow-up call restores the toggle badge
// as a display-only mirror of the green button's badge.
ok("test4: pid's registered target is its section toggle — " +
   "the mirror surface",
  contentSrc.indexOf("badgeTargets.pid = { el: pidSec.toggle }") !== -1);
ok("test4: pid recording exists ONLY in the demand open " +
   "handler — the toggle mirror never records",
  (contentSrc.match(/recordLaunched\("pid"\)/g) || []).length === 1);
ok("badge applier appends the span to the control element itself",
  contentSrc.indexOf("el.appendChild(badge)") !== -1 &&
  contentSrc.indexOf('badge.className = "sf-done-badge"') !== -1);
const cbSlice = contentSrc.slice(loadCall, loadCall + 3200);
ok("history-load callback applies badges from the record",
  cbSlice.indexOf("applyLaunchedBadge(lane, rec[lane])") !== -1);
ok("history-load callback shows the google badge in the banner case",
  cbSlice.indexOf('applyLaunchedBadge("google",') !== -1 &&
  cbSlice.indexOf("true);") !== -1);
ok("registry is read at callback time: the callback consults " +
   "the live registry object",
  loadCall !== -1 &&
  cbSlice.indexOf("badgeTargets is consulted HERE") !== -1 &&
  contentSrc.indexOf("badgeTargets[lane]") !== -1);
ok("panel.css defines .sf-done-badge as the readable pill",
  cssSrc.indexOf(".sf-done-badge") !== -1 &&
  cssSrc.indexOf("background: rgba(255,255,255,.28)") !== -1 &&
  cssSrc.indexOf("border-radius: 999px") !== -1 &&
  cssSrc.indexOf("white-space: nowrap") !== -1);

// ---------- test2: in-session badges on the real buttons ----------
const compBtnIdx = contentSrc.indexOf('compBtn.addEventListener("click"');
ok("compBtn click badges the complaint toggle in-session",
  compBtnIdx !== -1 &&
  contentSrc.slice(compBtnIdx, compBtnIdx + 2200)
    .indexOf('applyLaunchedBadge("complaint"') !== -1);
const formBtnIdx = contentSrc.indexOf('formBtn.addEventListener("click"');
ok("formBtn click badges the complaint toggle in-session",
  formBtnIdx !== -1 &&
  contentSrc.slice(formBtnIdx, formBtnIdx + 2400)
    .indexOf('applyLaunchedBadge("complaint"') !== -1);
// test5: each complaint handler applies ONE shared `now` —
// captured once, after window.open — to the status line and
// (via the registry, so button + toggle together) the badges.
function handlerSharesNow(idx, sliceLen) {
  if (idx === -1) return false;
  const s = contentSrc.slice(idx, idx + sliceLen);
  const openAt = s.indexOf("window.open(");
  const nowAt = s.indexOf("var now = Date.now();");
  return openAt !== -1 && nowAt > openAt &&
    (s.match(/Date\.now\(\)/g) || []).length === 1 &&
    s.indexOf('complaintStatusEl.textContent = saOpenedText(now)') !== -1 &&
    s.indexOf('applyLaunchedBadge("complaint", now)') !== -1 &&
    s.indexOf('applyLaunchedBadge("complaint", now)') > nowAt;
}
ok("test5: compBtn handler — one shared `now` badges button + " +
   "toggle after window.open",
  handlerSharesNow(compBtnIdx, 2200));
ok("test5: formBtn handler — one shared `now` badges button + " +
   "toggle after window.open",
  handlerSharesNow(formBtnIdx, 2400));
ok("complaint recording lives ONLY in the two button handlers",
  (contentSrc.match(/recordLaunched\("complaint"\)/g) || [])
    .length === 2);

// ---------- test5: the label-swap hazard is structurally gone ----------
ok("test5: neither complaint button's whole textContent is " +
   "written anywhere anymore",
  contentSrc.indexOf("formBtn.textContent") === -1 &&
  contentSrc.indexOf("compBtn.textContent") === -1);
ok("test5: both complaint labels live in .sf-btn-label spans (v1.0.70: back to two — the third span carried the Azure kit's copy-details label, retired with the v1.0.69 single-block kit)",
  (contentSrc.match(/"class": "sf-btn-label"/g) || []).length === 2 &&
  contentSrc.indexOf("var formBtnLabel = ") !== -1 &&
  contentSrc.indexOf("var compBtnLabel = ") !== -1);
ok("test5: the swaps write ONLY the label spans",
  contentSrc.indexOf("var origLabel = formBtnLabel.textContent;") !== -1 &&
  contentSrc.indexOf("formBtnLabel.textContent = copied") !== -1 &&
  contentSrc.indexOf("formBtnLabel.textContent = origLabel; }, 6000)") !== -1 &&
  contentSrc.indexOf("var origLabel = compBtnLabel.textContent;") !== -1 &&
  contentSrc.indexOf("compBtnLabel.textContent = origLabel; }, 6000)") !== -1);
ok("test5: visible labels and swap texts byte-identical to before",
  contentSrc.indexOf('"Copy evidence & open the " + formLane.label + ' +
    '" abuse form"') !== -1 &&
  contentSrc.indexOf('"Open in Gmail \\u2014 just click Send"') !== -1 &&
  contentSrc.indexOf('"Copied! The form is open \\u2014 paste into its ' +
    'details field (Ctrl+V or right-click \\u2192 Paste)"') !== -1 &&
  contentSrc.indexOf('"The form is open \\u2014 copy the box text above ' +
    'and paste it in"') !== -1 &&
  contentSrc.indexOf('"Copied! Paste into the email (Ctrl+V), then Send"')
    !== -1);
ok("history-load callback presets the complaint line (status " +
   "unchanged) alongside the dual badge pass",
  cbSlice.indexOf('preset(complaintStatusEl, "complaint")') !== -1);
ok("stashThenOpen open(): record then badge, both after window.open",
  stashStart !== -1 && stashEnd > stashStart &&
  (function () {
    const s = contentSrc.slice(stashStart, stashEnd);
    return s.indexOf("window.open(url,") !== -1 &&
      s.indexOf("applyLaunchedBadge(lane") >
        s.indexOf("recordLaunched(lane)") &&
      s.indexOf("recordLaunched(lane)") > s.indexOf("window.open(url,");
  })());
ok("fwd done(): badge lands on the row button via its established id",
  fwdStart !== -1 && fwdDone > fwdStart &&
  contentSrc.slice(fwdDone, fwdDone + 1500)
    .indexOf('getElementById("sf-fwd-phish")') !== -1 &&
  contentSrc.slice(fwdDone, fwdDone + 1500)
    .indexOf("saBadgeOnElement(rbBadge") !== -1);
ok("Google button r.ok branch badges the section toggle in-session",
  rbSlice.indexOf('applyLaunchedBadge("google"') !== -1);
ok("markAlreadyReported(): badge lands on the google toggle by id",
  marStart !== -1 &&
  contentSrc.slice(marStart, marStart + 1600)
    .indexOf('getElementById("sf-sec-google-toggle")') !== -1 &&
  contentSrc.slice(marStart, marStart + 1600)
    .indexOf("saBadgeOnElement(gt,") !== -1);

// ---------- test2: PID lane trigger (Open button only) ----------
const obIdx = contentSrc.indexOf('openBtn.addEventListener("click"');
const obSlice = obIdx === -1 ? "" : contentSrc.slice(obIdx, obIdx + 2200);
ok("PID openBtn: the empty-To guard precedes any recording",
  obIdx !== -1 && obSlice.indexOf("if (!to)") !== -1 &&
  obSlice.indexOf("if (!to)") < obSlice.indexOf('recordLaunched("pid")'));
ok("PID openBtn: records pid and badges the BUTTON itself " +
   "after window.open",
  obSlice.indexOf("window.open(url,") !== -1 &&
  obSlice.indexOf('recordLaunched("pid")') >
    obSlice.indexOf("window.open(url,") &&
  obSlice.indexOf('saBadgeOnElement(openBtn, "pid"') >
    obSlice.indexOf('recordLaunched("pid")'));
ok("test4: PID openBtn mirrors the SAME click moment onto " +
   "the toggle — one shared `now` for both badges",
  (function () {
    const n = obSlice.indexOf("var now = Date.now();");
    if (n === -1) return false;
    const tail = obSlice.slice(n, n + 400);
    return (tail.match(/Date\.now\(\)/g) || []).length === 1 &&
      tail.indexOf('saBadgeOnElement(openBtn, "pid", now, false)') !== -1 &&
      tail.indexOf('saBadgeOnElement(pidSec.toggle, "pid", now, false)') !== -1 &&
      tail.indexOf('saBadgeOnElement(pidSec.toggle, "pid", now, false)') >
        tail.indexOf('saBadgeOnElement(openBtn, "pid", now, false)');
  })());

// ---------- test3: the demand step presets its own badge ----------
const dsStart = contentSrc.indexOf("function renderDemandStep");
const dsEnd = contentSrc.indexOf("\n      D.loadDetails()", dsStart);
const dsSlice = (dsStart === -1 || dsEnd === -1) ? ""
  : contentSrc.slice(dsStart, dsEnd);
ok("test3: demand step loads history itself and badges the " +
   "open button from the stored pid record",
  dsStart !== -1 && dsEnd > dsStart &&
  dsSlice.indexOf("saLoadLaunched(saStorageLocal(), msgKey") !== -1 &&
  dsSlice.indexOf('saBadgeOnElement(openBtn, "pid", rec.pid') !== -1);
ok("test4: demand step mirrors the SAME stored timestamp " +
   "onto the toggle, right after badging the button",
  dsSlice.indexOf(
    'saBadgeOnElement(pidSec.toggle, "pid", rec.pid, false)') !== -1 &&
  dsSlice.indexOf(
    'saBadgeOnElement(pidSec.toggle, "pid", rec.pid, false)') >
    dsSlice.indexOf('saBadgeOnElement(openBtn, "pid", rec.pid'));
ok("test3: the build-time check runs AFTER the button exists",
  dsSlice.indexOf('id: "sf-demand-open"') !== -1 &&
  dsSlice.indexOf("saLoadLaunched(saStorageLocal(), msgKey") >
    dsSlice.indexOf('id: "sf-demand-open"'));
ok("test3: demand-step preset is guarded against the panel " +
   "having moved on to a different message",
  dsSlice.indexOf("sfCurrentMsgKey !== msgKey") !== -1);

// ---------- test2: toggles and draft NEVER record (trigger audit) ----------
const secStart = contentSrc.indexOf("function section(id, toggleClass, label)");
const secEnd = contentSrc.indexOf("function actionRow", secStart);
const secSlice = (secStart === -1 || secEnd === -1) ? ""
  : contentSrc.slice(secStart, secEnd);
ok("accordion section() toggle handler never records or badges",
  secStart !== -1 && secEnd > secStart &&
  secSlice.indexOf('addEventListener("click"') !== -1 &&
  secSlice.indexOf("recordLaunched") === -1 &&
  secSlice.indexOf("Badge") === -1);
const dbIdx = contentSrc.indexOf('draftBtn.addEventListener("click"');
ok("PID draftBtn (expand only) never records or badges",
  dbIdx !== -1 &&
  contentSrc.slice(dbIdx, dbIdx + 450).indexOf("recordLaunched") === -1 &&
  contentSrc.slice(dbIdx, dbIdx + 450).indexOf("Badge") === -1);
const detIdx = contentSrc.indexOf('"Show details');
ok("Show-details toggle never records",
  detIdx !== -1 &&
  contentSrc.slice(detIdx, detIdx + 900).indexOf("recordLaunched") === -1);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
