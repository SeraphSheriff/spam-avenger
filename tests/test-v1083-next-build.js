"use strict";
// Spam Avenger v1.0.83 — the six-item build Michael
// queued on Nov 24 2026 after live-testing v1.0.82 on
// the wlcxh.com luxury-watch spam:
//
// 1. Firefox site-permission check. His fresh load had
//    the toolbar icon but no shield: Firefox had the
//    add-on's site permissions at NONE and nothing
//    anywhere said so. The popup now checks the Gmail
//    origin on open and offers a one-click grant; the
//    background badges the toolbar action "!" while
//    ungranted. Chrome passes silently.
// 2. Domain-trace progress row. The registrar lane
//    took 10+ seconds with no working indicator; the
//    panel now shows a placeholder row where the
//    sections land, with phase updates, removed when
//    the trace chain settles.
// 3. Guide boxes cut to actions only — covered by the
//    updated v1072–v1082 suites (BrandFocus's steps are
//    Michael's approved copy verbatim; the 6-digit
//    code step is Wanshang-only).
// 4. Nameabuse auto-pick fix. The pane claimed total
//    failure while the DNS Abuse card sat selected:
//    the subtype cards are generic containers (the
//    click must land on the card, not the bare title),
//    the row can overflow off-screen (scroll first),
//    and the form's button reads "Next →" (the exact
//    matcher failed on the arrow). Fallbacks now
//    report partial progress truthfully.
// 5. The guide pane is resizable, and the user's size
//    survives the watchdog's banner recreations.
// 6. Abuse URL fallback — covered in the v1082 suite
//    (the form requires ≥1 URL; the reported domain
//    itself goes in when no on-domain URL exists).
//
// This suite pins items 1, 2, 4 and 5.
//
// Run: node tests/test-v1083-next-build.js

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const contentSrc = fs.readFileSync(
  path.join(ROOT, "content.js"), "utf8");
const reportfillSrc = fs.readFileSync(
  path.join(ROOT, "reportfill.js"), "utf8");
const backgroundSrc = fs.readFileSync(
  path.join(ROOT, "background.js"), "utf8");
const popupSrc = fs.readFileSync(
  path.join(ROOT, "popup.html"), "utf8");
const panelCss = fs.readFileSync(
  path.join(ROOT, "panel.css"), "utf8");
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else {
    fail++;
    console.log("  FAIL " + name +
      (extra ? " — " + extra : ""));
  }
}

// ---------- manifest ----------
ok("manifest: version is 1.0.83",
  manifest.version === "1.0.84");

// ---------- item 1: the permission check ----------
const demand = require(path.join(ROOT, "lib", "demand.js"));
ok("perm: demand.js exports the check's pieces",
  Array.isArray(demand.GMAIL_ACCESS_ORIGINS) &&
  typeof demand.gmailAccessWarning === "function" &&
  typeof demand.gmailAccessGranted === "function" &&
  typeof demand.requestGmailAccess === "function" &&
  typeof demand.initPermissionSlot === "function");
ok("perm: the check asks about the Gmail origin ONLY " +
   "(never the manifest's wildcards, never <all_urls>)",
  JSON.stringify(demand.GMAIL_ACCESS_ORIGINS) ===
    JSON.stringify(["https://mail.google.com/*"]));
ok("perm: the warning fires ONLY on an explicit " +
   "ungranted answer",
  demand.gmailAccessWarning(false) === true &&
  demand.gmailAccessWarning(true) === false);
ok("perm: an unanswerable check stays silent (Chrome " +
   "with its install-time grant, or no API at all)",
  demand.gmailAccessWarning(null) === false &&
  demand.gmailAccessWarning(undefined) === false);
// In Node there is no chrome/browser global, so the
// adapter must answer null (silent), never throw.
let grantedAnswer = "unset";
demand.gmailAccessGranted(function (v) { grantedAnswer = v; });
ok("perm: with no permissions API the check answers " +
   "null and does not throw",
  grantedAnswer === null);
let requestAnswer = "unset";
demand.requestGmailAccess(function (v) { requestAnswer = v; });
ok("perm: with no permissions API the request answers " +
   "null and does not throw",
  requestAnswer === null);
ok("perm: the popup carries the slot the warning " +
   "renders into, ahead of the pitch",
  popupSrc.indexOf('id="sa-permission-slot"') !== -1 &&
  popupSrc.indexOf('id="sa-permission-slot"') <
    popupSrc.indexOf("One click traces"));
ok("perm: the popup wiring runs the check on open " +
   "(popup-only DOMContentLoaded init)",
  fs.readFileSync(path.join(ROOT, "lib", "demand.js"),
    "utf8").indexOf("api.initPermissionSlot()") !== -1);
ok("perm: the warning copy names the symptom and the " +
   "fix (no shield → allow access)",
  fs.readFileSync(path.join(ROOT, "lib", "demand.js"),
    "utf8").indexOf("the red shield can't appear") !== -1 &&
  fs.readFileSync(path.join(ROOT, "lib", "demand.js"),
    "utf8").indexOf("Allow access to Gmail") !== -1);
ok("perm: the popup footer names Firefox now (it " +
   "said Chrome / Edge / Brave only)",
  popupSrc.indexOf("Desktop Chrome, Edge, Brave and " +
    "Firefox.") !== -1 &&
  popupSrc.indexOf("Desktop Chrome / Edge / Brave.") === -1);

// ---------- item 1: the toolbar badge ----------
ok("badge: the background checks the same Gmail " +
   "origin and badges the action while ungranted",
  backgroundSrc.indexOf(
    '"https://mail.google.com/*"') !== -1 &&
  backgroundSrc.indexOf("function refreshGmailBadge()") !== -1 &&
  backgroundSrc.indexOf("setBadgeText") !== -1 &&
  backgroundSrc.indexOf('granted ? "" : "!"') !== -1);
ok("badge: it re-checks on install, startup, and " +
   "permission changes (grant clears it, revoke " +
   "restores it)",
  backgroundSrc.indexOf("onInstalled.addListener(refreshGmailBadge)") !== -1 &&
  backgroundSrc.indexOf("onStartup.addListener(refreshGmailBadge)") !== -1 &&
  backgroundSrc.indexOf("onAdded.addListener(refreshGmailBadge)") !== -1 &&
  backgroundSrc.indexOf("onRemoved.addListener(refreshGmailBadge)") !== -1);

// ---------- item 2: the trace progress row ----------
const rrAt = contentSrc.indexOf(
  "// v1.0.83: the domain-trace progress row");
const rrEnd = contentSrc.indexOf("blockedGroupLive = true;",
  rrAt);
const rrSeg = rrAt === -1 ? "" :
  contentSrc.slice(rrAt, rrEnd === -1 ? undefined : rrEnd);
ok("trace: the row is built only when a trace will " +
   "actually run (traceSenderDomain + a sender domain)",
  rrSeg.indexOf("var traceWanted = !!(window.SpamAvenger" +
    ".traceSenderDomain &&") !== -1 &&
  rrSeg.indexOf("if (traceWanted) {") !== -1 &&
  rrSeg.indexOf('"sf-trace-row"') !== -1);
ok("trace: phase 1 names the domain check; the row " +
   "carries the panel spinner",
  rrSeg.indexOf("Checking the sender") !== -1 &&
  rrSeg.indexOf("website and registrar lanes still loading") !== -1 &&
  rrSeg.indexOf('"sf-spin"') !== -1);
ok("trace: phase 2 fires when the chain moves to the " +
   "website checks (after the staleness guard)",
  rrSeg.indexOf("setTracePhase(") !== -1 &&
  rrSeg.indexOf("the sender") !== -1 &&
  rrSeg.indexOf("return runLaneGating();") !== -1 &&
  rrSeg.indexOf("setTracePhase(") <
    rrSeg.indexOf("return runLaneGating();"));
ok("trace: the row is removed when the chain settles " +
   "— on the success path AND the failure path",
  rrSeg.indexOf("finishTraceRow();\n      try { renderDomainTraceSections();") !== -1 &&
  rrSeg.indexOf("}, function () { finishTraceRow(); });") !== -1 &&
  rrSeg.indexOf("traceChain.then(finishTraceRow, finishTraceRow);") !== -1);
ok("trace: every touch is gated on the render's own " +
   "msgKey (a stale chain never writes into a newer " +
   "panel)",
  rrSeg.indexOf("function setTracePhase(text) {\n" +
    "      if (sfCurrentMsgKey !== msgKey) return;") !== -1 &&
  rrSeg.indexOf("function finishTraceRow() {\n" +
    "      if (sfCurrentMsgKey !== msgKey) return;") !== -1);
ok("trace: the row is parked directly above the PID " +
   "section (where the real sections land)",
  rrSeg.indexOf('stack.querySelector(\n        "#sf-sec-pid-toggle")') !== -1 &&
  rrSeg.indexOf("stack.insertBefore(traceRow, tracePidToggle)") !== -1);
ok("trace: the row has panel CSS (spinner shrunk to " +
   "sit inline)",
  panelCss.indexOf(".sf-trace-row") !== -1 &&
  panelCss.indexOf(".sf-trace-row .sf-spin") !== -1);

// ---------- item 4: the card pick + Next matcher ----------
// The pure helpers, extracted + run.
let P = null;
(function () {
  const a = reportfillSrc.indexOf("var CAT_PICK_WINDOW_MS");
  const b = reportfillSrc.indexOf(
    "/* ---------------- FTC ReportFraud wizard");
  if (a === -1 || b === -1 || b <= a) return;
  const seg = reportfillSrc.slice(a, b);
  P = new Function(seg +
    "; return { nextOk: nameabuseNextTextOk," +
    " cardOk: nameabuseCardTextOk };")();
})();
ok("pure: the nameabuse matchers evaluate standalone", !!P);
if (P) {
  ok("next: the form's real button label matches " +
     "(\"Next →\", arrow and all)",
    P.nextOk("Next \u2192") === true);
  ok("next: a bare \"Next\" still matches",
    P.nextOk("Next") === true);
  ok("next: other trailing decoration matches " +
     "(guillemet, angle bracket, stray whitespace)",
    P.nextOk("Next \u00bb") === true &&
    P.nextOk("  Next > ") === true);
  ok("next: a different button never matches " +
     "(\"Next step\" is another word, not decoration)",
    P.nextOk("Next step") === false &&
    P.nextOk("Next page") === false);
  ok("next: non-Next labels never match",
    P.nextOk("Submit") === false &&
    P.nextOk("") === false &&
    P.nextOk(null) === false);
}
// The chain picker lives in the DOM section; extract it
// on its own markers.
let pick = null;
(function () {
  const a = reportfillSrc.indexOf("var NA_CARD_MAX_TEXT");
  const b = reportfillSrc.indexOf(
    "function naCardClickTarget(", a);
  if (a === -1 || b === -1 || b <= a) return;
  pick = new Function(reportfillSrc.slice(a, b) +
    "; return naCardPickFromChain;")();
})();
ok("pure: the card-chain picker evaluates standalone",
  typeof pick === "function");
if (pick) {
  const PH = "Spam (Distribution Vector)";
  const title = { clickable: false, hits: 1, text: PH };
  // v1.0.84: the rule is the NEAREST phrase-once
  // ancestor carrying more than the title, ≤320 chars
  // — no button-ness anywhere. (The v1.0.83 fixtures
  // below were rewritten where they encoded the old
  // clickable-priority rule; the descriptors' legacy
  // "clickable" fields are now ignored by the picker.)
  ok("pick: the broad-card shape (a real <button> " +
     "wrapping the title) still clicks the button — " +
     "it is the NEAREST qualifying ancestor of the " +
     "title, picked on the container rule alone",
    pick([title,
      { clickable: true, hits: 1,
        text: "DNS Abuse Complaint Domains used for " +
          "malware distribution, botnet control, " +
          "phishing, hijacking, or spam that serves " +
          "as a vector for those activities." }],
      "DNS Abuse Complaint") === 1);
  ok("pick: a clickable ancestor further up no " +
     "longer wins over the nearest qualifying " +
     "container (the v1.0.83 priority gate, pinned " +
     "dead)",
    pick([title,
      { clickable: false, hits: 1,
        text: PH + " Spam used as a vector for " +
          "malware, phishing, or hijacking" },
      { clickable: true, hits: 1,
        text: PH + " " + "x".repeat(270) }], PH) === 1);
  ok("pick: the subtype shape (generic containers, no " +
     "clickable ancestor) clicks the CARD — title + " +
     "description — not the bare title",
    pick([title,
      { clickable: false, hits: 1,
        text: PH + " Report domains that distribute " +
          "spam or bulk unsolicited messages to " +
          "many recipients." },
      { clickable: false, hits: 5,
        text: PH + " x ".repeat(300) }], PH) === 1);
  ok("pick: the row of all five cards is never the " +
     "target (real shape: the phrase occurs ONCE in " +
     "the row — it is excluded by size alone, ~387 " +
     "chars over the 320 cap)",
    pick([title,
      { clickable: false, hits: 1,
        text: PH + " Spam used as a vector for " +
          "malware, phishing, or hijacking" },
      { clickable: false, hits: 1,
        text: "Malware Botnet Phishing Hijacking " +
          PH + " " + "x".repeat(320) }], PH) === 1);
  ok("pick: with no qualifying ancestor the title " +
     "itself is the target (the old fallback)",
    pick([title,
      { clickable: false, hits: 2,
        text: PH + " " + PH }], PH) === 0);
  ok("pick: an empty chain is a no-match",
    pick([], PH) === -1 && pick(null, PH) === -1);
}
ok("pick: the click target is scrolled into view " +
   "before it is returned (the row overflows the " +
   "right edge at narrow widths)",
  reportfillSrc.indexOf("scrollIntoView(") !== -1 &&
  reportfillSrc.indexOf('block: "nearest", inline: "nearest"') !== -1);
ok("pick: the Next finder runs on the tolerant " +
   "matcher now, still exactly-one-or-no-match",
  reportfillSrc.indexOf("if (nameabuseNextTextOk(t)) found.push(el);") !== -1 &&
  reportfillSrc.indexOf("return found.length === 1 ? found[0] : null;") !== -1);

// ---------- item 5: the resizable pane ----------
ok("pane: the banner is resizable with sane bounds " +
   "and an internal scroll (never off-screen)",
  reportfillSrc.indexOf("resize:both !important;") !== -1 &&
  reportfillSrc.indexOf("min-width:260px !important;") !== -1 &&
  reportfillSrc.indexOf("max-width:90vw !important;") !== -1 &&
  reportfillSrc.indexOf("min-height:120px !important;") !== -1 &&
  reportfillSrc.indexOf(
    "max-height:calc(100vh - 24px) !important;") !== -1 &&
  reportfillSrc.indexOf("overflow:auto !important;") !== -1);
ok("pane: the user's size is module state, re-applied " +
   "on every ensure() recreation",
  reportfillSrc.indexOf("var userSize = null") !== -1 &&
  reportfillSrc.indexOf("if (userSize) {") !== -1 &&
  reportfillSrc.indexOf(
    'el.style.setProperty("width", userSize.w + "px",') !== -1 &&
  reportfillSrc.indexOf(
    'el.style.setProperty("height", userSize.h + "px",') !== -1);
ok("pane: only a genuine corner drag is captured " +
   "(mousedown in the grip corner, then mouseup)",
  reportfillSrc.indexOf('el.addEventListener("mousedown"') !== -1 &&
  reportfillSrc.indexOf('el.addEventListener("mouseup"') !== -1 &&
  reportfillSrc.indexOf("r.right - 24") !== -1 &&
  reportfillSrc.indexOf("r.bottom - 24") !== -1 &&
  reportfillSrc.indexOf("if (dragCorner) captureBannerSize();") !== -1);
ok("pane: captured sizes are sanity-checked before " +
   "they are stored",
  reportfillSrc.indexOf("function bannerSizeSane(sz)") !== -1 &&
  reportfillSrc.indexOf("function captureBannerSize()") !== -1);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
