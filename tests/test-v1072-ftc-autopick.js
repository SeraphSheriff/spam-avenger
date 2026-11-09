"use strict";
// Public 1.0.72 release (internal build .73) — the FTC
// impersonator auto-pick, rebuilt (queued-ftc-autopick-
// verified.md, Michael's call Nov 8 2026, after his field
// report that the tile usually sat UNSELECTED under a
// guide line claiming "I already selected it if I could"):
//
//  - The v1.0.37 one-shot (categoryTried latched before
//    the search, one unverified click, no retry) is now a
//    pure state machine, makeCategoryAutoPick: the watcher
//    feeds it one view per pass; it retries while the
//    category step is up, latches "done" only when a click
//    of ours verifies selected in the same breath, stands
//    down forever for the user's own selections, and
//    gives up at the ~5-second window.
//  - The guide line (G_CAT) follows the machine's state
//    and only states what the state proves: plain
//    instruction before, a claim only after a verified
//    click of ours, an honest couldn't after the window.
//  - Sextortion untouched: no auto-pick, G_CAT_OTHER
//    stands (its pins live in test-v1072-sextortion.js).
//
// The machine is exercised here pass by pass, exactly as
// the throttled watcher drives it (each step() call is
// one watcher pass, timestamps are the pass clock); the
// DOM glue in fillFtc is pinned statically.

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const reportfillSrc = fs.readFileSync(path.join(ROOT, "reportfill.js"), "utf8");
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); }
}

ok("manifest version stays 1.0.72", manifest.version === "1.0.72",
  "got " + manifest.version);

// ---------- extract the pure machine ----------
const mStart = reportfillSrc.indexOf("var CAT_PICK_WINDOW_MS");
const mEnd = reportfillSrc.indexOf(
  "/* ---------------- FTC ReportFraud wizard");
ok("machine: the state machine segment is extractable",
  mStart !== -1 && mEnd > mStart);
const seg = reportfillSrc.slice(mStart, mEnd);
const catApi = eval(seg +
  "\n;({ makeCategoryAutoPick: makeCategoryAutoPick," +
  " CAT_PICK_WINDOW_MS: CAT_PICK_WINDOW_MS });");
const makeCategoryAutoPick = catApi.makeCategoryAutoPick;

const PLAIN = "Pick 'An impersonator'.";
const CLAIM = "I selected 'An impersonator' for you.";
const TRIED = "I tried to select 'An impersonator' for you " +
  "and couldn't \u2014 please click it.";
const NO_TILE = { tile: null, otherSelected: false };
const TILE_NEW = { tile: { selected: false }, otherSelected: false };
const TILE_SEL = { tile: { selected: true }, otherSelected: false };
const OTHER_SEL = { tile: { selected: false }, otherSelected: true };

ok("machine: Michael's bound is ~5 seconds",
  catApi.CAT_PICK_WINDOW_MS >= 3000 &&
    catApi.CAT_PICK_WINDOW_MS <= 5000,
  "got " + catApi.CAT_PICK_WINDOW_MS);

// ---------- late-rendering tile (spec case 1) ----------
// The tile renders only on the third watcher pass: it
// gets clicked, the click verifies, the latch sets, and
// the guide may claim the selection — only then.
{
  const p = makeCategoryAutoPick(catApi.CAT_PICK_WINDOW_MS);
  ok("late tile: before it renders, no click and a plain guide",
    p.step(NO_TILE, 0) === null && p.guideLine() === PLAIN);
  ok("late tile: second pass, still nothing to click",
    p.step(NO_TILE, 250) === null && p.getState() === "trying");
  ok("late tile: third pass offers the click",
    p.step(TILE_NEW, 500) === "click");
  ok("late tile: guide still plain until the click verifies",
    p.guideLine() === PLAIN);
  p.afterClick(true); // the click selected it, verified at once
  ok("late tile: verified click latches done, guide claims it",
    p.getState() === "done" && p.guideLine() === CLAIM);
  ok("late tile: a done picker never clicks again",
    p.step(TILE_NEW, 750) === null);
}

// ---------- the click never selects (spec case 2) ----------
// Attempts continue through the whole window, then stop;
// the guide shows the tried-and-couldn't line and NEVER
// the claimed line.
{
  const p = makeCategoryAutoPick(catApi.CAT_PICK_WINDOW_MS);
  let claimed = false;
  let clicks = 0;
  for (let t = 0; t < 5000; t += 250) {
    if (p.step(TILE_NEW, t) === "click") { clicks++; p.afterClick(false); }
    if (p.guideLine() === CLAIM) claimed = true;
  }
  ok("stubborn tile: clicks were attempted through the window",
    clicks >= 10, "got " + clicks);
  ok("stubborn tile: the guide never claimed a selection",
    claimed === false);
  ok("stubborn tile: at the bound the picker gives up",
    p.step(TILE_NEW, 5000) === null && p.getState() === "failed");
  ok("stubborn tile: the guide admits it couldn't",
    p.guideLine() === TRIED);
  ok("stubborn tile: a failed picker stays stopped",
    p.step(TILE_NEW, 5250) === null &&
      p.step(TILE_NEW, 60000) === null);
}

// ---------- user pre-selects a different category (spec case 3) ----------
// No click is attempted, nothing is overridden, ever.
{
  const p = makeCategoryAutoPick(catApi.CAT_PICK_WINDOW_MS);
  ok("user's category: first sight of it stands the picker down",
    p.step(OTHER_SEL, 0) === null && p.getState() === "user");
  let acted = false;
  for (let t = 250; t <= 60000; t += 250) {
    if (p.step(TILE_NEW, t) === "click") acted = true;
    if (p.step(OTHER_SEL, t) === "click") acted = true;
  }
  ok("user's category: no click is ever attempted afterwards",
    acted === false);
  ok("user's category: the guide claims nothing for it",
    p.guideLine() === PLAIN);
}

// ---------- user selects the impersonator tile themselves ----------
// A selection we never verified is credited to the user:
// stand down, and the guide must NOT claim it.
{
  const p = makeCategoryAutoPick(catApi.CAT_PICK_WINDOW_MS);
  ok("user's own pick: a pre-selected tile stands the picker down",
    p.step(TILE_SEL, 0) === null && p.getState() === "user");
  ok("user's own pick: the guide does not claim their click",
    p.guideLine() === PLAIN && p.guideLine() !== CLAIM);
}

// ---------- a click that only shows on a later pass ----------
// Our click didn't verify in the same breath; when the
// tile turns up selected on the next pass, the picker
// credits the USER (it cannot prove otherwise) and
// stands down without claiming.
{
  const p = makeCategoryAutoPick(catApi.CAT_PICK_WINDOW_MS);
  ok("late verify: the click goes out",
    p.step(TILE_NEW, 0) === "click");
  p.afterClick(false); // not selected in the same breath
  ok("late verify: still trying, guide still plain",
    p.getState() === "trying" && p.guideLine() === PLAIN);
  ok("late verify: a later selection is credited to the user",
    p.step(TILE_SEL, 250) === null && p.getState() === "user" &&
      p.guideLine() === PLAIN);
}

// ---------- guide truthfulness, all states (static) ----------
ok("guide: the old hedged line is deleted as code",
  // (The words survive only inside history comments
  // recording what was removed — the string-concatenation
  // fragment of the old G_CAT definition must not.)
  reportfillSrc.indexOf("I already \" +") === -1 &&
    reportfillSrc.indexOf(
      "\"selected it if I could.\";") === -1);
ok("guide: G_CAT starts as the plain instruction",
  reportfillSrc.indexOf(
    "var G_CAT = \"Pick 'An impersonator'.\";") !== -1);
ok("guide: the three truthful lines are the machine's own",
  seg.indexOf("I selected 'An impersonator' for you.") !== -1 &&
    seg.indexOf("I tried to select 'An impersonator' for ") !== -1 &&
    seg.indexOf("and couldn't \\u2014 please click it.") !== -1 &&
    seg.indexOf("Pick 'An impersonator'.") !== -1);
ok("guide: the category step still chooses by the stash flag",
  reportfillSrc.indexOf(
    "setGuide(stash.sextortion ? G_CAT_OTHER : G_CAT)") !== -1);

// ---------- fillFtc wiring (static) ----------
ok("wiring: the one-shot latch is gone from the code",
  reportfillSrc.indexOf("categoryTried = false") === -1 &&
    reportfillSrc.indexOf("categoryTried = true") === -1 &&
    reportfillSrc.indexOf("if (!categoryTried") === -1);
ok("wiring: fillFtc builds the picker with the window bound",
  reportfillSrc.indexOf(
    "var catPick = makeCategoryAutoPick(CAT_PICK_WINDOW_MS);") !== -1);
ok("wiring: each pass steps the picker on the scanned view",
  reportfillSrc.indexOf(
    "var catAction = catPick.step(catView, Date.now());") !== -1);
ok("wiring: a click is verified in the same breath",
  reportfillSrc.indexOf(
    "catPick.afterClick(tileSelected(catView.tileEl));") !== -1);
ok("wiring: G_CAT follows the picker after every pass",
  reportfillSrc.indexOf("G_CAT = catPick.guideLine();") !== -1);
ok("wiring: the picker runs only behind the wizard + step gates",
  reportfillSrc.indexOf(
    "if (CATEGORY_RE.test(catText) || catView.tile) {") !== -1);
ok("wiring: a session restart re-arms a fresh picker + plain line",
  reportfillSrc.indexOf(
    "catPick = makeCategoryAutoPick(CAT_PICK_WINDOW_MS);") !== -1 &&
    reportfillSrc.split("G_CAT = catPick.guideLine();").length - 1 >= 2);
// (The match-rule fragment pinned here was the
// whole-text ≤40 rule through the first .73 build; the
// tile-finder fix — queued-ftc-tile-finder-fix.md —
// replaced it with the title rule: the wizard's real
// tile text runs ~76 chars with its "(ex. ...)"
// examples folded in, so the whole-text rule discarded
// the tile before the name test. The title-rule pins
// live in tests/test-v1072-ftc-tile-finder.js.)
ok("wiring: the view scan matches the tile by its title",
  reportfillSrc.indexOf("function scanCategoryView()") !== -1 &&
    reportfillSrc.indexOf("function tileTitle(el)") !== -1 &&
    reportfillSrc.indexOf(
      "title.length <= 40 &&") !== -1 &&
    reportfillSrc.indexOf(
      "/impersonat/i.test(title)") !== -1);
ok("wiring: selection is verified off the radio, not the text",
  reportfillSrc.indexOf("function tileSelected(el)") !== -1 &&
    reportfillSrc.indexOf('getAttribute("aria-checked")') !== -1 &&
    reportfillSrc.indexOf("input && input.checked") !== -1);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
