"use strict";
// Public 1.0.72 release (internal build .73) — the FTC
// category TILE FINDER fix (queued-ftc-tile-finder-fix.md,
// Michael's call Nov 8 2026, after a live capture of the
// FTC category step proved the diagnosis):
//
// The wizard's "An impersonator" tile is a <label>
// wrapping radio cat-radio-1; its full textContent is
// "An impersonator(ex. fake government, business, love
// interest, grandchild)" — ~73 chars, title plus the
// "(ex. ...)" examples folded into the same label.
// scanCategoryView()'s whole-text ≤40-char rule threw
// the tile out before the /impersonat/i test ran, and
// the clean title sits in a nested span the scan never
// visits. In the field: the picker armed, never
// clicked, the 5s window expired, and the guide
// honestly reported failure — on real markup the
// finder simply could not see its tile.
//
// The fix judges a tile by its TITLE (tileTitle: first
// rendered line, cut at the "(ex." examples
// parenthetical) and applies the ≤40 guard + name test
// to the title alone. The guard's purpose survives:
// text that merely buries "impersonator" inside a long
// non-title is still rejected. One diagnostic was
// added: the picker's terminal state (done / failed /
// user) now writes ONE Diag line per walk — before,
// only actual clicks logged, so a stand-down was
// invisible in the console diary.
//
// The finder is driven here against a fixture built
// from the captured catContainer (cat-1 verbatim in
// shape, same-shaped siblings), and the state machine
// is driven exactly as fillFtc drives it.

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

// ---------- extract the pure state machine ----------
const mStart = reportfillSrc.indexOf("var CAT_PICK_WINDOW_MS");
const mEnd = reportfillSrc.indexOf(
  "/* ---------------- FTC ReportFraud wizard");
const machineSeg = reportfillSrc.slice(mStart, mEnd);
const catApi = eval(machineSeg +
  "\n;({ makeCategoryAutoPick: makeCategoryAutoPick," +
  " CAT_PICK_WINDOW_MS: CAT_PICK_WINDOW_MS });");
const makeCategoryAutoPick = catApi.makeCategoryAutoPick;

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

// ---------- the fixture: the captured catContainer ----------
// Shape per the Nov 8 2026 capture: each tile is a
// <label class="form-check-label rf-radio"> wrapping
// <input type="radio" name="category" id="cat-radio-N">
// and spans; textContent concatenates title + examples
// with no separator, innerText puts examples on line 2.
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
  ["cat-radio-3", "Job, investment, money-making " +
    "opportunity, franchise", null],
  ["cat-radio-5", "Sweepstakes, prize, lottery", null],
  ["cat-radio-6", "Phone, internet, TV service", null],
  ["cat-radio-7", "Auto sale, repair", null],
  ["cat-radio-8", "Health",
    "(ex. weight loss, eye care, treatment)"],
  ["cat-radio-9", "Credit, debt, loan",
    "(ex. debt collection, credit report, student loan " +
    "debt relief)"],
  ["cat-radio-10", "Just an annoying call", null],
  ["cat-radio-11", "Something else",
    "(we'll get it to the right place)"]
];
function buildFixture() {
  allRadios = []; radiosById = {};
  const labels = TILE_DEFS.map(function (d) {
    return fakeLabel(fakeRadio(d[0]), d[1], d[2]);
  });
  fixtureEls = labels;
  return labels;
}

// ---------- the diagnosis, in fixture terms ----------
{
  const labels = buildFixture();
  const cat1 = labels[0];
  ok("capture: the impersonator label's whole text busts the old cap",
    cat1.textContent.length > 40 &&
      /impersonat/i.test(cat1.textContent),
    "len=" + cat1.textContent.length);
  ok("title: the label is judged by its title alone",
    tileTitle(cat1) === "An impersonator",
    "got " + JSON.stringify(tileTitle(cat1)));
  const noInner = Object.assign({}, cat1, { innerText: "" });
  ok("title: textContent alone reaches the title via the (ex. cut",
    tileTitle(noInner) === "An impersonator",
    "got " + JSON.stringify(tileTitle(noInner)));
  ok("title: a plain tile's title is its whole text",
    tileTitle(labels[1]) === "Online shopping");
  ok("title: 'Something else' keeps its own name, examples aside",
    tileTitle(labels[9]) === "Something else");
}

// ---------- the finder on the real markup ----------
{
  const labels = buildFixture();
  const view = scanCategoryView();
  ok("finder: the impersonator tile is found in the real markup",
    !!view.tile && view.tileEl === labels[0]);
  ok("finder: it starts unselected, and no other tile is selected",
    view.tile.selected === false && view.otherSelected === false);
  ok("finder: the found tile's radio is the one verification reads",
    tileSelected(labels[0]) === false &&
      radiosById["cat-radio-1"].checked === false);
}

// ---------- the full pick, driven as fillFtc drives it ----------
{
  const labels = buildFixture();
  const p = makeCategoryAutoPick(catApi.CAT_PICK_WINDOW_MS);
  const view = scanCategoryView();
  ok("pick: the machine asks for the click",
    p.step(view, 0) === "click");
  view.tileEl.click(); // the caller clicks the label
  ok("pick: the click checks cat-radio-1 and no other radio",
    radiosById["cat-radio-1"].checked === true &&
      allRadios.filter(function (r) { return r.checked; })
        .length === 1);
  ok("pick: verification reads the selection off the radio",
    tileSelected(view.tileEl) === true);
  p.afterClick(tileSelected(view.tileEl));
  ok("pick: a verified click latches the machine done ('picked')",
    p.getState() === "done" &&
      p.guideLine() ===
        "I selected 'An impersonator' for you.");
}

// ---------- a user's own OTHER selection still stands us down ----------
{
  buildFixture();
  radiosById["cat-radio-11"].checked = true; // "Something else"
  const view = scanCategoryView();
  ok("user's tile: the scan reports the other selection",
    view.otherSelected === true && view.tile.selected === false);
  const p = makeCategoryAutoPick(catApi.CAT_PICK_WINDOW_MS);
  ok("user's tile: the machine stands down for it",
    p.step(view, 0) === null && p.getState() === "user");
}

// ---------- the guard survives: buried text is NOT a tile ----------
{
  const buried = {
    tagName: "BUTTON", className: "",
    textContent: "Were you contacted by an impersonator who " +
      "pretended to be a government agency or a business you " +
      "already trust? Report it here.",
    innerText: "Were you contacted by an impersonator who " +
      "pretended to be a government agency or a business you " +
      "already trust? Report it here.",
    control: null, htmlFor: "",
    getAttribute: function () { return null; },
    querySelector: function () { return null; },
    click: function () {}
  };
  fixtureEls = [buried];
  ok("guard: the buried word leaves a long non-title",
    tileTitle(buried).length > 40);
  ok("guard: a long element burying 'impersonator' is not matched",
    scanCategoryView().tile === null);
  const laterLine = {
    tagName: "LABEL", className: "form-check-label rf-radio",
    textContent: "Choose the best fitAn impersonator" +
      "(ex. fake government, business, love interest, grandchild)",
    innerText: "Choose the best fit\nAn impersonator\n" +
      "(ex. fake government, business, love interest, grandchild)",
    control: null, htmlFor: "",
    getAttribute: function () { return null; },
    querySelector: function () { return null; },
    click: function () {}
  };
  fixtureEls = [laterLine];
  ok("guard: 'impersonator' on a later line is not the title",
    tileTitle(laterLine) === "Choose the best fit" &&
      scanCategoryView().tile === null);
}

// ---------- the stand-down diary line (terminal states) ----------
const diagLines = [];
var Diag = { debug: function (line) { diagLines.push(line); } };
var catPick = null;
var catPickLogged = null;
const lStart = reportfillSrc.indexOf("function logCatPickTerminal()");
const lEnd = reportfillSrc.indexOf("\n    }", lStart);
ok("diary: the terminal logger is extractable",
  lStart !== -1 && lEnd > lStart);
const logCatPickTerminal = eval(
  reportfillSrc.slice(lStart, lEnd + 6) +
  "\n;(logCatPickTerminal);");
const NO_TILE = { tile: null, otherSelected: false };
const TILE_NEW = { tile: { selected: false }, otherSelected: false };
const OTHER_SEL = { tile: { selected: false }, otherSelected: true };
{
  // failed walk: no tile for the whole window
  catPick = makeCategoryAutoPick(catApi.CAT_PICK_WINDOW_MS);
  for (let t = 0; t <= 5000; t += 250) catPick.step(NO_TILE, t);
  ok("diary: the failed walk reached its terminal state",
    catPick.getState() === "failed");
  logCatPickTerminal(); logCatPickTerminal(); logCatPickTerminal();
  ok("diary: the failed stand-down logs exactly one line",
    diagLines.length === 1 &&
      diagLines[0].indexOf("FTC wizard: category auto-pick") !== -1 &&
      diagLines[0].indexOf("stood down") !== -1 &&
      diagLines[0].indexOf("state=failed") !== -1,
    JSON.stringify(diagLines));
  // a fresh walk (new picker instance) re-arms the line
  catPick = makeCategoryAutoPick(catApi.CAT_PICK_WINDOW_MS);
  catPick.step(OTHER_SEL, 0);
  logCatPickTerminal();
  ok("diary: a new walk's user stand-down logs its own line",
    diagLines.length === 2 &&
      diagLines[1].indexOf("state=user") !== -1,
    JSON.stringify(diagLines));
  // a still-trying picker logs nothing
  catPick = makeCategoryAutoPick(catApi.CAT_PICK_WINDOW_MS);
  catPick.step(TILE_NEW, 0);
  logCatPickTerminal();
  ok("diary: a mid-window picker stays silent",
    diagLines.length === 2);
  // the picked terminal state names itself too
  catPick.step(TILE_NEW, 250);
  catPick.afterClick(true);
  logCatPickTerminal(); logCatPickTerminal();
  ok("diary: the picked terminal state logs once, by name",
    diagLines.length === 3 &&
      diagLines[2].indexOf("picked") !== -1 &&
      diagLines[2].indexOf("state=done") !== -1,
    JSON.stringify(diagLines));
}

// ---------- static pins ----------
ok("static: the finder judges tiles via tileTitle",
  reportfillSrc.indexOf("function tileTitle(el)") !== -1 &&
    reportfillSrc.indexOf("tx.search(/\\(\\s*ex\\./i)") !== -1 &&
    reportfillSrc.indexOf("/impersonat/i.test(title)") !== -1);
ok("static: the whole-text match rule is gone",
  reportfillSrc.indexOf(
    "tx.length <= 40 && /impersonat/i.test(tx)") === -1);
ok("static: the watcher calls the terminal logger every pass",
  reportfillSrc.indexOf("logCatPickTerminal();") !== -1 &&
    reportfillSrc.indexOf(
      "var catPickLogged = null;") !== -1);
ok("static: the 5s window and stand-down semantics are untouched",
  reportfillSrc.indexOf("var CAT_PICK_WINDOW_MS = 5000;") !== -1 &&
    machineSeg.indexOf('state = "user"') !== -1 &&
    machineSeg.indexOf('state = "failed"') !== -1);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
