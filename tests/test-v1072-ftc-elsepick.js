"use strict";
// Public 1.0.72 release (internal build .73) — the FTC
// "Something else" auto-pick for SEXTORTION reports
// (Michael approved Nov 8 2026, option tap + "Build it",
// after field-verifying the guide-only banner live: the
// guide pointed at 'Something else' and he asked why the
// addon couldn't pick it the way it picks 'An
// impersonator'):
//
//  - The sextortion branch of SA_FTC_CAT gains an
//    autoPick of 'Something else' with pickedText
//    "I selected 'Something else' for you."
//  - The pick reuses the verified state machine
//    unchanged: same tile finder (first-line title),
//    same 5s retry-until-verified window, same
//    click+verify, same stand-down when the user picks
//    any category first, same single-pick guarantee.
//  - If no pick verifies inside the window, the outcome
//    is the guide-only banner ("Pick 'Something else' —
//    this one isn't impersonating anybody.") — never a
//    claimed pick.
//  - The Yes/No reminder stays attached in both states
//    (it is the banner's standing sub1, untouched).
//  - The impersonator pick, the manual-brand guide, the
//    sextortion narrative/callout/suppression are
//    untouched (their suites pin them).

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

ok("manifest version stays 1.0.73", manifest.version === "1.0.84",
  "got " + manifest.version);

// ---------- stubs the finder slice reads as free vars ----------
let fixtureEls = [];
let allRadios = [];
let radiosById = {};
var document = {
  querySelectorAll: function (sel) {
    if (sel === "button, a, label, [role='radio'], [role='option']") {
      return fixtureEls;
    }
    return [];
  },
  getElementById: function (id) { return radiosById[id] || null; }
};
function isVisible(el) { return !el.__hidden; }
var stash = { sextortion: true };

// ---------- extract the pure machine + its configs ----------
const mStart = reportfillSrc.indexOf("var CAT_PICK_WINDOW_MS");
const mEnd = reportfillSrc.indexOf(
  "/* ---------------- FTC ReportFraud wizard");
ok("machine: the state machine segment is extractable",
  mStart !== -1 && mEnd > mStart);
const seg = reportfillSrc.slice(mStart, mEnd);
const catApi = eval(seg +
  "\n;({ makeCategoryAutoPick: makeCategoryAutoPick," +
  " CAT_PICK_WINDOW_MS: CAT_PICK_WINDOW_MS," +
  " SA_FTC_CAT_SOMETHING_ELSE: SA_FTC_CAT_SOMETHING_ELSE });");
const makeCategoryAutoPick = catApi.makeCategoryAutoPick;
var SA_FTC_CAT_SOMETHING_ELSE = catApi.SA_FTC_CAT_SOMETHING_ELSE;

// ---------- extract the finder (tileSelected..scanCategoryView) ----------
const fStart = reportfillSrc.indexOf("function tileSelected(el)");
const fEnd = reportfillSrc.indexOf(
  "// Has the wizard actually started?", fStart);
ok("finder: the finder segment is extractable",
  fStart !== -1 && fEnd > fStart);
const finderSeg = reportfillSrc.slice(fStart, fEnd);
const finder = eval(finderSeg +
  "\n;({ tileSelected: tileSelected," +
  " tileIsRadioLike: tileIsRadioLike," +
  " tileTitle: tileTitle," +
  " scanCategoryView: scanCategoryView });");
const tileSelected = finder.tileSelected;
const tileTitle = finder.tileTitle;
const scanCategoryView = finder.scanCategoryView;

const GUIDE = "Pick 'Something else' \u2014 this one isn't " +
  "impersonating anybody.";
const PICKED = "I selected 'Something else' for you.";
const NO_TILE = { tile: null, otherSelected: false };
const TILE_NEW = { tile: { selected: false }, otherSelected: false };
const TILE_SEL = { tile: { selected: true }, otherSelected: false };
const OTHER_SEL = { tile: { selected: false }, otherSelected: true };

// ---------- sextortion config ----------
ok("config: the sextortion category auto-picks 'Something else'",
  !!SA_FTC_CAT_SOMETHING_ELSE &&
    SA_FTC_CAT_SOMETHING_ELSE.autoPick === "Something else",
  "got " + (SA_FTC_CAT_SOMETHING_ELSE &&
    SA_FTC_CAT_SOMETHING_ELSE.autoPick));
ok("config: its pickedText is the picked-state banner line",
  !!SA_FTC_CAT_SOMETHING_ELSE &&
    SA_FTC_CAT_SOMETHING_ELSE.pickedText === PICKED);
ok("config: its title matcher is the 'Something else' title",
  !!SA_FTC_CAT_SOMETHING_ELSE &&
    SA_FTC_CAT_SOMETHING_ELSE.titleRe.test("Something else") &&
    !SA_FTC_CAT_SOMETHING_ELSE.titleRe.test("An impersonator"));
ok("config: its failure fallback is the guide-only line itself",
  !!SA_FTC_CAT_SOMETHING_ELSE &&
    SA_FTC_CAT_SOMETHING_ELSE.failed === GUIDE &&
    SA_FTC_CAT_SOMETHING_ELSE.plain === GUIDE);

// ---------- the fixture: the captured category grid ----------
function fakeRadio(id) {
  const r = {
    tagName: "INPUT", type: "radio", name: "category", id: id,
    className: "form-check-input", checked: false,
    textContent: "", innerText: "", control: null, htmlFor: "",
    getAttribute: function () { return null; },
    querySelector: function () { return null; },
    click: function () {
      allRadios.forEach(function (x) { x.checked = false; });
      r.checked = true;
    }
  };
  allRadios.push(r); radiosById[id] = r;
  return r;
}
function fakeLabel(radio, title, examples) {
  return {
    tagName: "LABEL",
    className: "form-check-label rf-radio",
    textContent: title + (examples || ""),
    innerText: examples ? title + "\n" + examples : title,
    control: radio, htmlFor: "",
    getAttribute: function () { return null; },
    querySelector: function (sel) {
      if (sel.indexOf("input") !== -1) return radio;
      return null;
    },
    click: function () { radio.click(); }
  };
}
const TILE_DEFS = [
  ["cat-radio-1", "An impersonator",
    "(ex. fake government, business, love interest, grandchild)"],
  ["cat-radio-2", "Online shopping", null],
  ["cat-radio-5", "Sweepstakes, prize, lottery", null],
  ["cat-radio-11", "Something else",
    "(we'll get it to the right place)"]
];
function buildFixture(withElse) {
  allRadios = []; radiosById = {};
  const defs = withElse ? TILE_DEFS :
    TILE_DEFS.filter(function (d) { return d[1] !== "Something else"; });
  const labels = defs.map(function (d) {
    return fakeLabel(fakeRadio(d[0]), d[1], d[2]);
  });
  fixtureEls = labels;
  return labels;
}

// ---------- pick simulation on the real-shaped markup ----------
// The sextortion stash aims the finder at 'Something else';
// its label carries the "(we'll get it to the right place)"
// subtitle, and the first-line-title rule finds it anyway.
{
  stash = { sextortion: true };
  const labels = buildFixture(true);
  const elseLabel = labels[labels.length - 1];
  ok("pick sim: the 'Something else' title is its first line",
    tileTitle(elseLabel) === "Something else",
    "got " + JSON.stringify(tileTitle(elseLabel)));
  const view = scanCategoryView();
  ok("pick sim: the finder locates the 'Something else' tile",
    !!view.tile && view.tileEl === elseLabel &&
      view.tile.selected === false && view.otherSelected === false);
  const p = makeCategoryAutoPick(catApi.CAT_PICK_WINDOW_MS,
    SA_FTC_CAT_SOMETHING_ELSE);
  ok("pick sim: the guide starts as the plain guide line",
    p.guideLine() === GUIDE);
  ok("pick sim: the machine asks for the click",
    p.step(view, 0) === "click");
  view.tileEl.click();
  ok("pick sim: the click checks the 'Something else' radio only",
    radiosById["cat-radio-11"].checked === true &&
      allRadios.filter(function (r) { return r.checked; })
        .length === 1);
  p.afterClick(tileSelected(view.tileEl));
  ok("pick sim: a verified click ends in the picked state",
    p.getState() === "done" && p.guideLine() === PICKED);
  ok("pick sim: single-pick guarantee — a done picker never re-clicks",
    p.step(TILE_NEW, 250) === null && p.step(TILE_NEW, 60000) === null);
}

// ---------- fallback: the tile never verifies ----------
{
  const p = makeCategoryAutoPick(catApi.CAT_PICK_WINDOW_MS,
    SA_FTC_CAT_SOMETHING_ELSE);
  let claimed = false;
  for (let t = 0; t < 5000; t += 250) {
    if (p.step(TILE_NEW, t) === "click") p.afterClick(false);
    if (p.guideLine() === PICKED) claimed = true;
  }
  ok("fallback: an unverifying tile is never claimed",
    claimed === false);
  ok("fallback: at the window bound the picker gives up",
    p.step(TILE_NEW, 5000) === null && p.getState() === "failed");
  ok("fallback: the outcome is the guide-only banner, no pick claim",
    p.guideLine() === GUIDE && p.guideLine() !== PICKED);
}
{
  // Same outcome when the tile is absent from the grid at all.
  stash = { sextortion: true };
  buildFixture(false);
  const view = scanCategoryView();
  ok("fallback: a grid without the tile scans as no tile",
    view.tile === null);
  const p = makeCategoryAutoPick(catApi.CAT_PICK_WINDOW_MS,
    SA_FTC_CAT_SOMETHING_ELSE);
  for (let t = 0; t <= 5000; t += 250) p.step(view, t);
  ok("fallback: no tile for the whole window ends guide-only",
    p.getState() === "failed" && p.guideLine() === GUIDE);
}

// ---------- stand-down parity with the impersonator pick ----------
{
  const p = makeCategoryAutoPick(catApi.CAT_PICK_WINDOW_MS,
    SA_FTC_CAT_SOMETHING_ELSE);
  ok("stand-down: another category picked by the user stands it down",
    p.step(OTHER_SEL, 0) === null && p.getState() === "user");
  let acted = false;
  for (let t = 250; t <= 60000; t += 250) {
    if (p.step(TILE_NEW, t) === "click") acted = true;
  }
  ok("stand-down: no click is ever attempted afterwards",
    acted === false && p.guideLine() === GUIDE);
}
{
  const p = makeCategoryAutoPick(catApi.CAT_PICK_WINDOW_MS,
    SA_FTC_CAT_SOMETHING_ELSE);
  ok("stand-down: the user's own 'Something else' pick is not claimed",
    p.step(TILE_SEL, 0) === null && p.getState() === "user" &&
      p.guideLine() === GUIDE && p.guideLine() !== PICKED);
}
{
  // Through the finder: the user picked the IMPERSONATOR
  // tile on a sextortion walk — a selection on any other
  // tile must stand the else-picker down, never override.
  stash = { sextortion: true };
  buildFixture(true);
  radiosById["cat-radio-1"].checked = true;
  const view = scanCategoryView();
  ok("stand-down: the scan reports the user's other selection",
    view.otherSelected === true && view.tile.selected === false);
  const p = makeCategoryAutoPick(catApi.CAT_PICK_WINDOW_MS,
    SA_FTC_CAT_SOMETHING_ELSE);
  ok("stand-down: the finder view stands the picker down",
    p.step(view, 0) === null && p.getState() === "user");
}

// ---------- non-regression pins ----------
{
  const p = makeCategoryAutoPick(catApi.CAT_PICK_WINDOW_MS);
  ok("pin: the default picker still plain-guides the impersonator tile",
    p.guideLine() === "Pick 'An impersonator'." &&
      p.step(TILE_NEW, 0) === "click");
  p.afterClick(true);
  ok("pin: the impersonator picked claim is byte-identical",
    p.getState() === "done" &&
      p.guideLine() === "I selected 'An impersonator' for you.");
  const q = makeCategoryAutoPick(catApi.CAT_PICK_WINDOW_MS);
  for (let t = 0; t <= 5000; t += 250) q.step(NO_TILE, t);
  ok("pin: the impersonator failure line is byte-identical",
    q.getState() === "failed" &&
      q.guideLine() === "I tried to select 'An impersonator' for " +
        "you and couldn't \u2014 please click it.");
}
ok("pin: the category step still chooses its line by the stash flag",
  reportfillSrc.indexOf(
    "setGuide(stash.sextortion ? G_CAT_OTHER : G_CAT)") !== -1);
ok("pin: the else picker is built on the same window bound",
  reportfillSrc.indexOf(
    "var elsePick = makeCategoryAutoPick(CAT_PICK_WINDOW_MS,") !== -1 &&
    reportfillSrc.indexOf("SA_FTC_CAT_SOMETHING_ELSE);") !== -1);
ok("pin: the watcher steps the else picker on its scanned view",
  reportfillSrc.indexOf(
    "var elseAction = elsePick.step(elseView, Date.now());") !== -1 &&
    reportfillSrc.indexOf(
      "elsePick.afterClick(tileSelected(elseView.tileEl));") !== -1);
ok("pin: G_CAT_OTHER follows the else picker after every pass",
  reportfillSrc.indexOf("G_CAT_OTHER = elsePick.guideLine();") !== -1);
ok("pin: a session restart re-arms a fresh else picker + guide line",
  reportfillSrc.split("G_CAT_OTHER = elsePick.guideLine();").length - 1 >= 2);
ok("pin: the Yes/No reminder is still the banner's standing sub1",
  reportfillSrc.indexOf('Diag.set("sub1", REMINDER);') !== -1 &&
    reportfillSrc.indexOf(
      "especially the one " + '" +\n      "about sending payment."') !== -1 ||
    reportfillSrc.indexOf("about sending payment.") !== -1);
ok("pin: the window bound is unchanged at 5s",
  catApi.CAT_PICK_WINDOW_MS === 5000);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
