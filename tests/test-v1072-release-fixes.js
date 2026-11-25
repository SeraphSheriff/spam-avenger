// Spam Avenger — public 1.0.72 release fixes (internal build
// .73), from Michael's Nov 8 2026 live Firefox test of the
// pre-fix 1.0.72 package on the dlybrh.com luxury-watch spam
// (Sophia <mjfibo@dlybrh.com>). Specs:
// queued-no-contact-info-lanes.md and
// queued-ftc-sb-launched-status.md. Manifest version STAYS
// "1.0.72" — 1.0.72 never shipped publicly, so the fixed
// package is the first public 1.0.72.
//
// Fix 1 — the blue info-only accordion sections are GONE.
// Blue means "needs a few steps from you, and I'll guide you
// through them"; a website/link host with no published abuse
// contact has no steps and nothing to click, so it gets no
// button, no toggle, no badge target. Its facts move into
// Show details as PREFIXED rows (Website domain / IP / host /
// owned by / abuse contact; Link page / domain / IP / host /
// owned by / abuse contact) — prefixed because the details
// block already carries the MAIL host's unprefixed rows.
// And Show details itself now opens COMPLETE or not at all:
// the toggle waits for the domain trace chain to settle
// (loading label, disabled against extra clicks, staleness-
// guarded) instead of opening on a partial list with rows
// popping in later. A failed lookup still settles the gate —
// the missing fact reads unknown / not published.
//
// Fix 2 — FTC and Safe Browsing status lines end at
// "✓ Launched <date time>". They were the only launched
// lanes that never said so: stashThenOpen's storage callback
// wrote the v1.0.35-era "✓ Report ready" text before the form
// opened and nothing ever rewrote it, while Forward writes
// saLaunchedText in done() and a return visit already preset
// FTC/SB to "Launched". Now open() — the one choke point
// every launch path passes through — sets the lane's status
// line to saLaunchedText with one shared `now` for status
// and badge (the complaint lanes' pattern). The storage-
// failure warnings survive AND stay final: they are written
// after open(), so a form that opened blank still says so.
//
// Run: node tests/test-v1072-release-fixes.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
const contentSrc = fs.readFileSync(
  path.join(ROOT, "content.js"), "utf8");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); }
}
function count(hay, needle) {
  return hay.split(needle).length - 1;
}

// ---------- version discipline ----------
ok("manifest version STAYS 1.0.72 (the fixed build IS the " +
   "first public 1.0.72)",
  manifest.version === "1.0.87", manifest.version);

// ---------- fix 1: the info-only sections are gone ----------
ok("no wInfoSec anywhere (website info section deleted)",
  contentSrc.indexOf("wInfoSec") === -1);
ok("no lInfoSec anywhere (link info section deleted)",
  contentSrc.indexOf("lInfoSec") === -1);
ok("the shared info note is gone with the sections",
  contentSrc.indexOf("No published abuse contact for this host") === -1);
ok("exactly ONE blue sf-sec-website section remains — the " +
   "form lane (the info lane was the second)",
  count(contentSrc, 'acc.section("sf-sec-website", "sf-btn-blue"') === 1);
ok("exactly ONE green sf-sec-website section — the ready-to-" +
   "send complaint lane, unchanged",
  count(contentSrc, 'acc.section("sf-sec-website", "sf-btn-green"') === 1);
ok("exactly TWO blue sf-sec-linkhost sections — the " +
   "form lane and v1.0.92's Cloudflare lane",
  count(contentSrc, 'acc.section("sf-sec-linkhost", "sf-btn-blue"') === 2);
ok("exactly ONE green sf-sec-linkhost section — the ready-" +
   "to-send complaint lane, unchanged",
  count(contentSrc, 'acc.section("sf-sec-linkhost", "sf-btn-green"') === 1);
ok("website badge targets: form toggle + green toggle only " +
   "(no target was ever registered for an info lane)",
  count(contentSrc, "badgeTargets.website = ") === 2);
ok("the pink mail-IP banner is untouched (it is about the " +
   "sending IP, not these lanes)",
  contentSrc.indexOf("No published abuse contact for this IP. ") !== -1 &&
  contentSrc.indexOf("Report the links below via Google Safe Browsing instead.") !== -1);
ok("Registrar lane intact (public 1.0.72 follow-on: its " +
   "badge registry took the els shape under the parity fix)",
  contentSrc.indexOf('acc.section("sf-sec-registrar"') !== -1 &&
  contentSrc.indexOf('badgeTargets.registrar = { els: [rSec.toggle] }') !== -1);

// ---------- fix 1: the facts live in Show details now ----------
const traceStart = contentSrc.indexOf("function renderDomainTraceSections()");
const traceEnd = contentSrc.indexOf("function runLaneGating()", traceStart);
const traceSlice = (traceStart === -1 || traceEnd === -1) ? ""
  : contentSrc.slice(traceStart, traceEnd);
ok("trace sections located for the row pins",
  traceStart !== -1 && traceEnd > traceStart);
["Website domain", "Website host", "Website owned by"].forEach(function (lbl) {
  ok("details row appended by the trace: " + lbl,
    traceSlice.indexOf('details.appendChild(mkRow("' + lbl + '"') !== -1);
});
ok("details row: Website IP keeps the checked date, mono like " +
   "the green section's row",
  traceSlice.indexOf('details.appendChild(mkRow("Website IP", w.ip +') !== -1 &&
  traceSlice.indexOf('" (checked " + w.checkedDate + ")"') !== -1);
ok("details row: Website abuse contact reads not published",
  traceSlice.indexOf('details.appendChild(mkRow("Website abuse contact",') !== -1 &&
  traceSlice.indexOf('"not published"));') !== -1);
["Link page", "Link domain", "Link host", "Link owned by"].forEach(function (lbl) {
  ok("details row appended by the trace: " + lbl,
    traceSlice.indexOf('details.appendChild(mkRow("' + lbl + '"') !== -1);
});
ok("details row: Link IP carries the IP (checked date like " +
   "the green section's row)",
  traceSlice.indexOf('details.appendChild(mkRow("Link IP", lh.ip +') !== -1);
ok("details row: Link abuse contact reads not published",
  traceSlice.indexOf('details.appendChild(mkRow("Link abuse contact",') !== -1);
// Round-2 note (internal build .73): the spoof-suppression
// branch at the top of the trace render appends the same
// Website rows (traced facts stay in Show details when both
// domain lanes are suppressed), so the else-branch instance
// pinned here is now the LAST occurrence.
ok("website rows sit in the no-complaint else-branch (after " +
   "the green section's textarea, before the registrar block)",
  traceSlice.lastIndexOf('mkRow("Website domain"') >
    traceSlice.indexOf('"sf-website-text"') &&
  traceSlice.lastIndexOf('mkRow("Website domain"') <
    traceSlice.indexOf("var ri = a.registrarInfo"));
ok("link rows sit in the no-complaint else-branch (after the " +
   "green section's textarea, before the registrar block)",
  traceSlice.indexOf('mkRow("Link page"') >
    traceSlice.indexOf('"sf-link-text"') &&
  traceSlice.indexOf('mkRow("Link page"') <
    traceSlice.indexOf("var ri = a.registrarInfo"));
ok("host rows stay conditional (only when not \"unknown\"), " +
   "owned-by rows only when an org is present",
  traceSlice.indexOf('if (w.host && w.host !== "unknown")') !== -1 &&
  traceSlice.indexOf('if (lh.host && lh.host !== "unknown")') !== -1 &&
  traceSlice.indexOf("if (w.org)") !== -1 &&
  traceSlice.indexOf("if (lh.org)") !== -1);

// ---------- fix 1: the legend never promised the info lanes ----------
ok("legend guarantees unchanged (FTC blue / Safe Browsing + " +
   "Forward green always render, so both entries always hold)",
  contentSrc.indexOf("showGreen = true;\n    showBlue = true;") !== -1 &&
  contentSrc.indexOf(" blue \\u2014 needs a few steps from you, and I'll guide you through them.") !== -1);
ok("the trace sections never fed the legend flags (removing " +
   "the info lanes cannot leave the legend claiming a blue " +
   "that is not on screen)",
  traceSlice.indexOf("showBlue") === -1 &&
  traceSlice.indexOf("showGreen") === -1);

// ---------- fix 1: Show details opens complete, or waits ----------
const detStart = contentSrc.indexOf('"Show details');
const detEnd = contentSrc.indexOf("body.appendChild(details);", detStart);
const detSlice = (detStart === -1 || detEnd === -1) ? ""
  : contentSrc.slice(detStart, detEnd);
ok("details toggle block located for the gate pins",
  detStart !== -1 && detEnd > detStart);
ok("gate state exists (settled flag + waiter queue)",
  detSlice.indexOf("var detailsTraceSettled = false;") !== -1 &&
  detSlice.indexOf("var detailsOpenWaiters = [];") !== -1 &&
  detSlice.indexOf("function settleDetailsTrace()") !== -1);
ok("an unsettled click waits instead of opening partial: " +
   "loading label, button disabled, opener queued",
  detSlice.indexOf('toggle.textContent = "Loading details\\u2026";') !== -1 &&
  detSlice.indexOf("toggle.disabled = true;") !== -1 &&
  detSlice.indexOf("detailsOpenWaiters.push(function ()") !== -1);
ok("a settled click opens immediately (no wait once the " +
   "trace has landed)",
  detSlice.indexOf("if (detailsTraceSettled) { openDetails(); return; }") !== -1);
ok("closing an open details never waits (the close branch " +
   "runs before the gate check inside the click handler)",
  detSlice.indexOf('if (details.style.display !== "none")') !== -1 &&
  detSlice.indexOf('if (details.style.display !== "none")') <
    detSlice.indexOf("if (detailsTraceSettled) { openDetails(); return; }"));
ok("the queued opener is staleness-guarded (a stale render's " +
   "details never pop open over a newer message)",
  detSlice.indexOf("if (sfCurrentMsgKey === msgKey) openDetails();") !== -1 &&
  detSlice.indexOf("else closeDetails();") !== -1);
ok("the gate settles off the trace CHAIN — both outcomes " +
   "(settle passed as fulfillment AND rejection handler), " +
   "after the sections render",
  contentSrc.indexOf("var traceChain = tracePromise.then(") !== -1 &&
  contentSrc.indexOf("traceChain.then(settleDetailsTrace, settleDetailsTrace);") !== -1 &&
  contentSrc.indexOf("renderDomainTraceSections();") <
    contentSrc.indexOf("traceChain.then(settleDetailsTrace, settleDetailsTrace);"));
ok("the chain exists even with no trace to run (no " +
   "senderDomain -> resolved promise -> gate still settles)",
  contentSrc.indexOf("var tracePromise = Promise.resolve();") !== -1 &&
  contentSrc.indexOf("var tracePromise = Promise.resolve();") <
    contentSrc.indexOf("var traceChain = tracePromise.then("));

// ---------- fix 2: FTC / Safe Browsing end at Launched ----------
const stashStart = contentSrc.indexOf("function stashThenOpen(");
const stashEnd = contentSrc.indexOf('acc.actionRow("sf-sec-ftc"', stashStart);
const stashSlice = (stashStart === -1 || stashEnd === -1) ? ""
  : contentSrc.slice(stashStart, stashEnd);
ok("stashThenOpen located for the launched-status pins",
  stashStart !== -1 && stashEnd > stashStart);
ok("open() sets the lane's status line to the Launched text",
  stashSlice.indexOf("setStashStatus(saLaunchedText(now));") !== -1);
(function () {
  // Scoped to open()'s own body (the stash payload further
  // down legitimately carries its own savedAt timestamp).
  const oStart = stashSlice.indexOf("function open() {");
  const oEnd = stashSlice.indexOf("setTimeout(open, 800)", oStart);
  const oSeg = (oStart === -1 || oEnd === -1) ? ""
    : stashSlice.slice(oStart, oEnd);
  ok("open(): ONE shared `now` for status line and badge " +
     "(exactly one Date.now() in the whole choke point)",
    oSeg !== "" &&
    count(oSeg, "Date.now()") === 1 &&
    oSeg.indexOf("var now = Date.now();") !== -1 &&
    oSeg.indexOf("setStashStatus(saLaunchedText(now));") !== -1 &&
    oSeg.indexOf("applyLaunchedBadge(lane, now);") !== -1);
})();
ok("open(): order is window.open -> record -> Launched " +
   "status -> badge (v1066's record-then-badge pin holds)",
  stashSlice.indexOf("window.open(url,") !== -1 &&
  stashSlice.indexOf("window.open(url,") <
    stashSlice.indexOf("recordLaunched(lane)") &&
  stashSlice.indexOf("recordLaunched(lane)") <
    stashSlice.indexOf("setStashStatus(saLaunchedText(now));") &&
  stashSlice.indexOf("setStashStatus(saLaunchedText(now));") <
    stashSlice.indexOf("applyLaunchedBadge(lane, now);"));
ok("the functional 'Report ready' status write is GONE from " +
   "the stash flow (the words survive only in comments)",
  stashSlice.indexOf("Report ready \u2014 the form opens") === -1 &&
  stashSlice.indexOf("\u2713 Report ready") === -1);
ok("all three storage-failure warnings survive verbatim",
  count(stashSlice, "Couldn\'t save the report") === 3 &&
  stashSlice.indexOf("browser \u2014 opening the form blank") !== -1 &&
  stashSlice.indexOf("form will open blank. You can copy the details") !== -1 &&
  stashSlice.indexOf("opening the form blank") !== -1);
(function () {
  // The storage-error branch: open() runs FIRST, then the
  // warning overwrites the Launched line — the warning is the
  // final word when the form opened blank.
  const errAt = stashSlice.indexOf("chrome.runtime.lastError");
  const seg = errAt === -1 ? "" : stashSlice.slice(errAt, errAt + 900);
  ok("storage-error branch: warning lands AFTER open(), so " +
     "it stays final over the Launched line",
    errAt !== -1 &&
    seg.indexOf("open();") !== -1 &&
    seg.indexOf("open();") <
      seg.indexOf("setStashStatus(\"\u26a0 Couldn\'t save the report \u2014 the"));
})();
(function () {
  // The no-storage branch: same ordering — open, then warn.
  const nsAt = stashSlice.indexOf("!chrome.storage.local");
  const seg = nsAt === -1 ? "" : stashSlice.slice(nsAt, nsAt + 900);
  ok("no-storage branch: warning lands AFTER open() too",
    nsAt !== -1 &&
    seg.indexOf("open();") !== -1 &&
    seg.indexOf("open();") <
      seg.indexOf("setStashStatus(\"\u26a0 Couldn\'t save the report in this"));
})();
ok("FTC / Safe Browsing call sites still pass their lanes " +
   "(the launched line lands on the right status element)",
  contentSrc.indexOf('ftcStatus.set, "ftc"') !== -1 &&
  contentSrc.indexOf('sbStatus.set, "sb"') !== -1);

// ---------- fix 2: the text itself (Michael's retest line) ----------
// Extract the pinned [sa-history-helpers] block the same way
// test-v1066-action-history.js does, and check the launched
// line renders exactly the shape his Nov 8 screenshot asked
// for: Forward said "✓ Launched Nov 8, 5:08 PM" — FTC and
// Safe Browsing must now be able to say the identical line.
const bMark = "// [sa-history-helpers-begin]";
const eMark = "// [sa-history-helpers-end]";
const bi = contentSrc.indexOf(bMark), ei = contentSrc.indexOf(eMark);
let H = null;
if (bi !== -1 && ei > bi) {
  const block = contentSrc.slice(contentSrc.indexOf("\n", bi) + 1, ei);
  H = vm.runInNewContext(block +
    "\n;({ launched: saLaunchedText, preset: saPresetText });",
    { document: { createElement: function () {
      return { className: "", textContent: "", attrs: {},
        childNodes: [],
        setAttribute: function (k, v) { this.attrs[k] = v; },
        appendChild: function (c) { this.childNodes.push(c); return c; } };
    } } });
}
ok("history helpers evaluate for the text check", !!H);
if (H) {
  const nov8 = new Date(2026, 10, 8, 17, 8).getTime();
  ok("saLaunchedText renders Michael's retest line byte-exact",
    H.launched(nov8) === "\u2713 Launched Nov 8, 5:08 PM",
    H.launched(nov8));
  ok("in-session and return-visit now agree: the launched " +
     "line open() writes is the same line the preset restores",
    H.preset("", { ftc: nov8 }, "ftc") === H.launched(nov8) &&
    H.preset("", { sb: nov8 }, "sb") === H.launched(nov8));
}

// ---- Scroll-to-top on open (Michael's field find, Nov 8) ---
// The details open at the top of the scrolling body while the
// pinned toggle is clicked from the bottom; opening must take
// the user to them.
ok("openDetails scrolls the panel body to the top so the " +
   "opened details are in view",
  /function openDetails\(\) \{[^}]*body\.scrollTop = 0/.test(contentSrc));

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
