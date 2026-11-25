"use strict";
// Spam Avenger v1.0.79 — the GoDaddy lane's hero flash.
//
// v1.0.78's fill worked in Michael's live test (Nov 23
// 2026): brand, links and description filled, he reviewed
// and submitted himself, and GoDaddy's confirmation page
// read "Submission Complete / Thank You! Your abuse
// report has been successfully submitted" with a "DCU
// Ticket Numbers:" list — one DCU number per submitted
// URL (DCU102475070 through DCU102475080 in his run, 11
// tickets including the bare domain). But the Spam
// Avenger Guide pane was still sitting on that page
// showing the stale fill lines ("Give it a quick review,
// then click Submit"). His words: "almost perfect.. a
// hero flash at the end will finish the polish."
//
// v1.0.79: a hero watch runs on legalportal.godaddy.com
// from page load (and is re-armed when the fill pass
// finishes). When the confirmation wording is on screen,
// the pane swaps — all three lines at once, via
// Diag.hero() — to a hero finish: filled-accent pane,
// oversized checkmark headline "✓ Filed with GoDaddy",
// the DCU ticket count when the numbers parse, and no
// submit language anywhere. The fill pass checks for the
// confirmation before writing anything (a confirmation
// page gets no fill copy), and the stash callback hands
// the pane to the watch when the confirmation is already
// up, so no stash line can overwrite the hero. The
// no-submit guarantee stays structural, the other lanes
// are untouched, and the v1.0.77/78 panel kit stays as
// the fallback path.
//
// Run: node tests/test-v1079-godaddy-hero.js

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const contentSrc = fs.readFileSync(
  path.join(ROOT, "content.js"), "utf8");
const reportfillSrc = fs.readFileSync(
  path.join(ROOT, "reportfill.js"), "utf8");
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
ok("manifest: version is 1.0.79",
  manifest.version === "1.0.84");

// ---------- the pure helpers, extracted + run ----------
let P = null;
(function () {
  const a = reportfillSrc.indexOf("var CAT_PICK_WINDOW_MS");
  const b = reportfillSrc.indexOf(
    "/* ---------------- FTC ReportFraud wizard");
  if (a === -1 || b === -1 || b <= a) return;
  const seg = reportfillSrc.slice(a, b);
  P = new Function(seg +
    "; return { conf: godaddyConfirmation," +
    " hero: godaddyHeroLines," +
    " lines: godaddyOutcomeLines };")();
})();
ok("pure: the confirmation + hero helpers evaluate " +
   "standalone", !!P);

// The owner's live confirmation page, Nov 23 2026 — the
// heading, the thank-you sentence, and the DCU list
// (one number per URL, bare domain last).
const NUMS = [];
for (let n = 70; n <= 80; n++) NUMS.push("DCU1024750" + n);
const CONFIRM_TEXT =
  "Submission Complete\n" +
  "Thank You!\n" +
  "Your abuse report has been successfully submitted. " +
  "Our team will review your report and take appropriate " +
  "action.\n" +
  "DCU Ticket Numbers:\n" +
  NUMS.map(function (d, i) {
    return (i === NUMS.length - 1
      ? "shopointcy.com" : "http://l2.revotas.com/trc/" + i) +
      ": " + d;
  }).join("\n") + "\n" +
  "What Happens Next?\n" +
  "Our team will review and investigate the reported " +
  "content.";

if (P) {
  const full = P.conf(CONFIRM_TEXT);
  ok("fixture: the owner's confirmation page confirms",
    full.confirmed === true);
  ok("fixture: all 11 DCU tickets parse, in page order",
    full.count === 11 &&
    full.tickets[0] === "DCU102475070" &&
    full.tickets[10] === "DCU102475080",
    JSON.stringify(full.tickets));
  ok("fixture: the heading alone confirms (no DCU list)",
    P.conf("Submission Complete").confirmed === true &&
    P.conf("Submission Complete").count === 0);
  ok("fixture: the thank-you sentence alone confirms",
    P.conf("Your abuse report has been successfully " +
      "submitted.").confirmed === true);
  ok("fixture: a repeated DCU number is still one ticket",
    P.conf("Submission Complete\nDCU102475070 and again " +
      "DCU102475070").count === 1);
  const form = P.conf(
    "Report Abuse\nYour Email Address\nCompany or Brand " +
    "Being Impersonated *\nURL, Website, or Domain *\n" +
    "Was this viewed from a mobile device?\nWhat country " +
    "did you view this content from?\nDescription of " +
    "Issue\nSubmit");
  ok("fixture: the unsubmitted form does NOT confirm",
    form.confirmed === false && form.count === 0);
  const fillLines = P.lines(
    { email: { value: "r@example.com", why: null },
      brand: { value: "PayPal", why: null },
      urls: { value: "https://x.example/", why: null },
      description: { value: "D", why: null } },
    { email: "filled", brand: "filled",
      urls: "filled", description: "filled" });
  ok("fixture: the pane's own fill lines do NOT confirm " +
     "(the banner rides in the page text it scans)",
    P.conf(fillLines.lead + "\n" + fillLines.sub1 + "\n" +
      fillLines.sub2).confirmed === false);

  // ---------- the hero lines ----------
  const hero11 = P.hero(full);
  ok("hero: the headline is the checkmark finish line",
    hero11.lead.indexOf("Filed with GoDaddy") !== -1 &&
    hero11.lead.indexOf("\u2713") !== -1);
  ok("hero: the ticket count is stated when it parses",
    hero11.sub1.indexOf("11") !== -1 &&
    hero11.sub1.indexOf("DCU") !== -1);
  const hero1 = P.hero(P.conf(
    "Submission Complete\nDCU102475070"));
  ok("hero: one ticket reads singular",
    hero1.sub1.indexOf("1 DCU ticket") !== -1 &&
    hero1.sub1.indexOf("tickets") === -1);
  const hero0 = P.hero(P.conf("Submission Complete"));
  ok("hero: no numbers — a plain acceptance line, no " +
     "count claimed",
    hero0.sub1.indexOf("accepted your abuse report") !== -1 &&
    !/\d/.test(hero0.sub1));
  [hero11, hero1, hero0].forEach(function (h, i) {
    const all = (h.lead + "\n" + h.sub1 + "\n" + h.sub2)
      .toLowerCase();
    ok("hero: state " + (i + 1) + " carries NO submit " +
       "language at all — nothing left to press",
      all.indexOf("submit") === -1 &&
      all.indexOf("quick review") === -1 &&
      all.indexOf("never submit") === -1);
    ok("hero: state " + (i + 1) + " closes like a finish " +
       "line, not an instruction block",
      h.sub2.indexOf("All done") !== -1);
  });
}

// ---------- the hero treatment in the banner ----------
ok("banner: Diag gains a hero() swap — all three lines " +
   "replaced together, hero mode on",
  reportfillSrc.indexOf("hero: function (lines)") !== -1 &&
  reportfillSrc.indexOf("heroMode = true;") !== -1 &&
  reportfillSrc.indexOf("state.lead = (lines && lines.lead)") !== -1 &&
  reportfillSrc.indexOf("state.sub1 = (lines && lines.sub1)") !== -1 &&
  reportfillSrc.indexOf("state.sub2 = (lines && lines.sub2)") !== -1);
ok("banner: the hero look is a filled accent + oversized " +
   "lead, re-applied by ensure() so a recreated banner " +
   "comes back heroic",
  reportfillSrc.indexOf("function applyHero()") !== -1 &&
  reportfillSrc.indexOf(
    'el.style.setProperty("background", PULSE_GREEN, "important")') !== -1 &&
  reportfillSrc.indexOf(
    'leadEl.style.setProperty("font-size", "26px", "important")') !== -1 &&
  (reportfillSrc.match(/applyHero\(\);/g) || []).length >= 2);
ok("banner: the attention pulse settles on the accent " +
   "in hero mode (dark otherwise)",
  reportfillSrc.indexOf(
    "heroMode ? PULSE_GREEN : PULSE_DARK") !== -1);

// ---------- the watch ----------
const watchAt = reportfillSrc.indexOf(
  "function watchGoDaddyHero()");
const watchSeg = watchAt === -1 ? "" :
  reportfillSrc.slice(watchAt,
    reportfillSrc.indexOf("function fillGoDaddy("));
ok("watch: the hero watch exists ahead of the fill pass",
  watchAt !== -1 && watchSeg.length > 0);
ok("watch: observer + interval, capped at ~15 minutes " +
   "like the other lanes",
  watchSeg.indexOf("new MutationObserver") !== -1 &&
  watchSeg.indexOf("setInterval(check, 1000)") !== -1 &&
  watchSeg.indexOf("15 * 60 * 1000") !== -1);
ok("watch: on confirmation it swaps the pane via " +
   "Diag.hero() with the parsed lines, then stands down",
  watchSeg.indexOf("Diag.hero(godaddyHeroLines(conf))") !== -1 &&
  watchSeg.indexOf("stopGd()") !== -1);
ok("watch: it never clicks anything",
  watchSeg.indexOf(".click(") === -1);
ok("watch: the text collector reads headings AND the " +
   "rendered body (the confirmation is div/span markup)",
  reportfillSrc.indexOf("function godaddyPageText()") !== -1 &&
  reportfillSrc.indexOf("document.body.innerText") !== -1);
ok("watch: armed from page load on the portal, from " +
   "the stash callback, from the fill stand-down and " +
   "from the fill hand-off (4 call sites)",
  (reportfillSrc.match(/watchGoDaddyHero\(\);/g) || [])
    .length >= 4);
(function () {
  const initAt = reportfillSrc.indexOf("Diag.init();");
  // v1.0.82 widens this window: the nameabuse hosts'
  // own load-time Guide-header block now sits between
  // the GoDaddy arming and the stash read, so the read
  // lands further down the file. The assertions are
  // unchanged: they pin the arming's order.
  const seg = initAt === -1 ? "" :
    reportfillSrc.slice(initAt, initAt + 2200);
  ok("watch: the page-load arming sets the Guide header " +
     "and starts before the stash read",
    seg.indexOf('location.hostname === ' +
      '"legalportal.godaddy.com"') !== -1 &&
    seg.indexOf('Diag.setHeader("Spam Avenger Guide")') !== -1 &&
    seg.indexOf("watchGoDaddyHero();") !== -1 &&
    seg.indexOf("watchGoDaddyHero();") <
      seg.indexOf('chrome.storage.local.get("pendingReport"'));
})();
(function () {
  const at = reportfillSrc.indexOf(
    'chrome.storage.local.get("pendingReport"');
  const seg = at === -1 ? "" :
    reportfillSrc.slice(at, at + 2200);
  ok("callback: a confirmation already on screen " +
     "outranks the stash lines — the callback returns " +
     "before the no-stash message can fire",
    seg.indexOf(
      "godaddyConfirmation(godaddyPageText()).confirmed") !== -1 &&
    seg.indexOf(
      "godaddyConfirmation(godaddyPageText()).confirmed") <
      seg.indexOf('Diag.debug("stash: none in storage")') &&
    seg.indexOf("watchGoDaddyHero();") !== -1);
})();

// ---------- the fill stands down on a confirmation page ----------
(function () {
  // v1.0.82 narrows this segment the way the v1.0.78
  // suite's was: the nameabuse section follows
  // fillGoDaddy in the file now, and these pins are
  // about the GoDaddy pass only.
  const gdStart = reportfillSrc.indexOf(
    "function fillGoDaddy(");
  const gdEnd = reportfillSrc.indexOf(
    "/* ---------------- nameabuse platform");
  const seg = gdStart === -1 ? "" :
    reportfillSrc.slice(gdStart,
      gdEnd === -1 ? undefined : gdEnd);
  ok("fill: the confirmation check runs before any " +
     "fill copy is set",
    seg.indexOf(
      "godaddyConfirmation(godaddyPageText()).confirmed") !== -1 &&
    seg.indexOf(
      "godaddyConfirmation(godaddyPageText()).confirmed") <
      seg.indexOf("Filling in the GoDaddy form from"));
  ok("fill: the hand-off to the hero watch lands in " +
     "finishFill",
    seg.indexOf("watchGoDaddyHero();") !== -1 &&
    seg.indexOf("GoDaddy: fill pass done") <
      seg.lastIndexOf("watchGoDaddyHero();"));
  ok("fill: NO-SUBMIT stays structural in the pass — " +
     "no click call, no submit reference (the v1.0.78 " +
     "pin, re-checked over the new code)",
    seg.indexOf(".click(") === -1 &&
    seg.toLowerCase().indexOf("submit") === -1);
  ok("fill: still exactly four planned fields — the " +
     "mobile checkbox and country select stay untouched",
    (seg.match(/\{ key: "/g) || []).length === 4 &&
    seg.indexOf("selectedIndex") === -1 &&
    seg.indexOf('"checkbox"') === -1);
})();

// ---------- the other lanes + the fallback kit ----------
ok("others: the Safe Browsing celebration is untouched",
  reportfillSrc.indexOf(
    "function sbSubmissionConfirmed(text)") !== -1 &&
  reportfillSrc.indexOf("You did it!") !== -1);
ok("others: the FTC flow is untouched",
  reportfillSrc.indexOf("function fillFtc(stash)") !== -1 &&
  reportfillSrc.indexOf("CONGRATS_LEAD") !== -1);
ok("fallback: the v1.0.77/78 panel kit still renders " +
   "its evidence box + copy steps",
  contentSrc.indexOf('"sf-registrar-evidence"') !== -1 &&
  contentSrc.indexOf(
    "if (regFormLane.fields && regFormLane.fields.length)") !== -1);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
