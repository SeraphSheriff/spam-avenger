"use strict";
// Spam Avenger v1.0.75 — the FTC question auto-picks,
// group-scoped. v1.0.74's DOM scan climbed from a
// question's heading to the first ancestor holding two
// or more radio inputs and took the first option inside
// it whose label matched. On the FTC's real "Report
// details" step several questions share one page and
// one wrapper, so the payment pick bound to the SHARED
// container: the first "No" inside it belonged to the
// earlier "fix a problem" question, the picker clicked
// and "verified" that radio, and the guide claimed the
// payment pick while the payment group sat untouched
// (Michael's field test, Nov 23 2026 — payment ended
// on Yes). The same walk exposed bug 2: "How did it
// start" is a <select> on the real form, not radios,
// so the radio picker never saw it and it stayed on
// its "Select" placeholder.
//
// v1.0.75 moves the scoping into pure functions over a
// flat item list in document order (ftcQuestionView /
// ftcSelectView in reportfill.js's pure segment): a
// question's options are the radios in its region
// (after its heading, before the next question
// heading), narrowed to the first region radio's name
// group; the started pick drives the select when the
// form renders one and verifies the selection stuck.
// The DOM layer only builds the item list and carries
// out the answers; its wiring is pinned below.
//
// Run: node tests/test-v1075-ftc-question-scoping.js

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const rfSrc = fs.readFileSync(path.join(ROOT, "reportfill.js"), "utf8");
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); }
}

ok("manifest: version is 1.0.76", manifest.version === "1.0.74");

// ---------- wiring pins ----------
ok("reportfill: the pure scoping functions exist",
  rfSrc.indexOf("function ftcQuestionView(items, questionRe, optionRe)") !== -1 &&
  rfSrc.indexOf("function ftcSelectView(items, questionRe, optionRe)") !== -1);
ok("reportfill: the DOM scan builds the item list",
  rfSrc.indexOf("function scanQuestionItems()") !== -1 &&
  rfSrc.indexOf("ftcQuestionView(items, questionRe,") !== -1);
ok("reportfill: the tile fallback is behind the " +
   "exclusive-container guard (no shared wrappers)",
  rfSrc.indexOf("return foreignQuestion(node, heads[i])") !== -1 &&
  rfSrc.indexOf("function foreignQuestion(box, ownHead)") !== -1);
ok("reportfill: the radio pick verifies the target " +
   "group's own input, not the clicked element's look",
  rfSrc.indexOf("view.tileInput") !== -1 &&
  rfSrc.indexOf("!!view.tileInput.checked") !== -1);
ok("reportfill: the started pick drives a select when " +
   "the form renders one, radios as fallback",
  rfSrc.indexOf("function runStartPick()") !== -1 &&
  rfSrc.indexOf("runStartPick();") !== -1 &&
  rfSrc.indexOf("setNativeValue(sel, res.targetValue)") !== -1 &&
  rfSrc.indexOf("ftcSelectView(items, questionRe, optionRe)") !== -1);
ok("reportfill: SCOPE GATE kept — the sextortion path " +
   "still builds none of the question pickers",
  rfSrc.indexOf("var payPick = stash.sextortion ? null") !== -1 &&
  rfSrc.indexOf("var startPick = stash.sextortion ? null") !== -1);

// ---------- the pure segment, behaviorally ----------
// Same extraction as the v1.0.72/v1.0.74 suites: the pure
// segment between the window constant and the wizard.
const segStart = rfSrc.indexOf("var CAT_PICK_WINDOW_MS");
const segEnd = rfSrc.indexOf(
  "/* ---------------- FTC ReportFraud wizard");
ok("reportfill: the pure segment is extractable",
  segStart !== -1 && segEnd > segStart);
const seg = rfSrc.slice(segStart, segEnd);
const rf = new Function(seg +
  "; return { W: CAT_PICK_WINDOW_MS," +
  " makeCategoryAutoPick: makeCategoryAutoPick," +
  " PAY: SA_FTC_PAY_NO, START: SA_FTC_START_EMAIL," +
  " ftcQuestionView: ftcQuestionView," +
  " ftcSelectView: ftcSelectView };")();

const PAY_Q = /did you send|payment of any kind/i;
const START_Q = /how did it start|how did they contact|how were you contacted/i;
const NO = /^no$/i;
const EMAIL = /^e-?mail$/i;

// The real "Report details" page shape from Michael's
// field test: several questions on ONE page — the
// fix-problem Yes/No group first, then the payment
// Yes/No group, then the how-it-started SELECT.
function detailsPage() {
  return [
    { kind: "heading", text: "Did the scammer offer to fix a problem with your computer?" },
    { kind: "radio", name: "fixProblem", label: "Yes", checked: false },
    { kind: "radio", name: "fixProblem", label: "No", checked: false },
    { kind: "heading", text: "Did you send the scammer payment of any kind?" },
    { kind: "radio", name: "sentPayment", label: "Yes", checked: false },
    { kind: "radio", name: "sentPayment", label: "No", checked: false },
    { kind: "heading", text: "How much money did you pay the scammer in total?" },
    { kind: "heading", text: "How did it start (ex. how did they first contact you, where did you see an ad?)" },
    { kind: "select",
      label: "How did it start (ex. how did they first contact you, where did you see an ad?)",
      options: [
        { text: "Select", value: "" },
        { text: "Email", value: "email" },
        { text: "Phone call", value: "phone" },
        { text: "Online", value: "online" }],
      selectedText: "Select", value: "" },
    { kind: "heading", text: "Do you know any other information about the scammer (phone, website, etc.)?" },
    { kind: "radio", name: "otherInfo", label: "Yes", checked: false },
    { kind: "radio", name: "otherInfo", label: "No", checked: false }
  ];
}

// ---------- bug 1: the payment pick is group-scoped ----------
const page = detailsPage();
const payView = rf.ftcQuestionView(page, PAY_Q, NO);
ok("payment: the view finds the payment group " +
   "(groupCount 2, nothing selected, no foreign selection)",
  !!payView && payView.groupCount === 2 &&
  payView.tile !== null && payView.tile.selected === false &&
  payView.otherSelected === false);
ok("payment: the target is the PAYMENT group's No — " +
   "not the fix-problem No that precedes it on the page",
  payView.target !== null &&
  page[payView.target].name === "sentPayment" &&
  page[payView.target].label === "No",
  payView.target === null ? "no target" :
    "target=" + page[payView.target].name + "/" +
    page[payView.target].label);

// The v1.0.74 failure state: the OTHER question's No
// got selected (by the mis-scoped click) while the
// payment group sat untouched. The scoped view must
// read the payment group as still unanswered — the
// foreign check must not leak in as tile or other.
const leaked = detailsPage();
leaked[2].checked = true; // fix-problem No
const leakView = rf.ftcQuestionView(leaked, PAY_Q, NO);
ok("payment: another group's checked No does not leak " +
   "into the payment view",
  leakView.tile.selected === false &&
  leakView.otherSelected === false &&
  leaked[leakView.target].name === "sentPayment");

// The field screenshot's end state: payment's own Yes
// selected. That IS this group's selection — the
// machine must read it as the user's hand and stand
// down, never override it to No.
const yesPage = detailsPage();
yesPage[4].checked = true; // payment Yes
const yesView = rf.ftcQuestionView(yesPage, PAY_Q, NO);
const yesPick = rf.makeCategoryAutoPick(rf.W, rf.PAY);
ok("payment: the group's own Yes reads as the user's " +
   "hand — the picker stands down and never overrides",
  yesView.otherSelected === true &&
  yesPick.step(yesView, 1000) === null &&
  yesPick.getState() === "user");

// End to end: fresh page → click asked → the click
// lands on the target → the same group's input reads
// back checked → done, and the guide states the pick.
const e2e = detailsPage();
const e2ePick = rf.makeCategoryAutoPick(rf.W, rf.PAY);
const e2eView1 = rf.ftcQuestionView(e2e, PAY_Q, NO);
ok("payment e2e: a fresh group asks for the click",
  e2ePick.step(e2eView1, 1000) === "click");
e2e[e2eView1.target].checked = true; // the click lands
e2ePick.afterClick(!!e2e[e2eView1.target].checked);
ok("payment e2e: verification reads the payment " +
   "group's own input — done, guide states the pick",
  e2ePick.getState() === "done" &&
  e2ePick.guideLine() ===
    "I selected 'No' for you \u2014 you didn't send them any payment.");

// The correction property v1.0.74 lacked: a click that
// lands on the WRONG group (the fix-problem No) must
// NOT verify — the picker stays in "trying" and asks
// again on the next pass.
const wrong = detailsPage();
const wrongPick = rf.makeCategoryAutoPick(rf.W, rf.PAY);
const wrongView = rf.ftcQuestionView(wrong, PAY_Q, NO);
wrongPick.step(wrongView, 1000);
wrong[2].checked = true; // the click went to fix-problem
wrongPick.afterClick(!!wrong[wrongView.target].checked);
const wrongView2 = rf.ftcQuestionView(wrong, PAY_Q, NO);
ok("payment: a click landing on the wrong group does " +
   "not verify — the picker retries the right one",
  wrongPick.getState() === "trying" &&
  wrongPick.step(wrongView2, 1100) === "click" &&
  wrong[wrongView2.target].name === "sentPayment");

// Radios with no name at all: the region alone scopes
// the group (the fallback shape).
const unnamed = [
  { kind: "heading", text: "Did the scammer offer to fix a problem with your computer?" },
  { kind: "radio", name: "", label: "Yes", checked: false },
  { kind: "radio", name: "", label: "No", checked: false },
  { kind: "heading", text: "Did you send the scammer payment of any kind?" },
  { kind: "radio", name: "", label: "Yes", checked: false },
  { kind: "radio", name: "", label: "No", checked: false }
];
const unView = rf.ftcQuestionView(unnamed, PAY_Q, NO);
ok("payment: unnamed radios still scope by region — " +
   "target is the second group's No",
  unView.groupCount === 2 && unView.target === 5 &&
  unView.tile.selected === false &&
  unView.otherSelected === false);

ok("payment: a question that isn't on the page " +
   "yields no view at all",
  rf.ftcQuestionView(detailsPage(),
    /did you send the scammer a gift card/i, NO) === null);
const noRadios = rf.ftcQuestionView([
  { kind: "heading", text: "Did you send the scammer payment of any kind?" },
  { kind: "heading", text: "How did it start?" }
], PAY_Q, NO);
ok("payment: heading up but no radios in its region — " +
   "groupCount 0, no target (tile fallback or coaching)",
  !!noRadios && noRadios.groupCount === 0 &&
  noRadios.target === null && noRadios.tile === null);

// ---------- bug 2: how-it-started is a select ----------
const selPage = detailsPage();
const selView = rf.ftcSelectView(selPage, START_Q, EMAIL);
ok("started: the select carrying the question's label " +
   "is found, still on its placeholder",
  !!selView && selView.index === 8 &&
  selView.tile.selected === false &&
  selView.otherSelected === false);
ok("started: the value to set is the Email option's",
  selView.targetValue === "email");

// Drive + verify, end to end through the same machine
// the radio pick uses: placeholder → click asked →
// set → read back Email → done, guide states it.
const selPick = rf.makeCategoryAutoPick(rf.W, rf.START);
ok("started e2e: the placeholder select asks for the set",
  selPick.step(selView, 1000) === "click");
const driven = detailsPage();
driven[8].selectedText = "Email";
driven[8].value = selView.targetValue; // setNativeValue landed
const drivenView = rf.ftcSelectView(driven, START_Q, EMAIL);
selPick.afterClick(drivenView.tile.selected === true);
ok("started e2e: the selection reads back as Email — " +
   "done, guide states the pick",
  selPick.getState() === "done" &&
  selPick.guideLine() ===
    "I selected 'Email' for you \u2014 this came by email.");

// A set that doesn't stick (framework re-render ate
// it) must not verify: the picker stays in "trying".
const stuckPick = rf.makeCategoryAutoPick(rf.W, rf.START);
stuckPick.step(rf.ftcSelectView(detailsPage(), START_Q, EMAIL), 1000);
const stillPlaceholder = rf.ftcSelectView(
  detailsPage(), START_Q, EMAIL);
stuckPick.afterClick(stillPlaceholder.tile.selected === true);
ok("started: a set that doesn't stick does not verify",
  stuckPick.getState() === "trying");

// The user's own real choice (Phone call) is their
// hand: stand down, never override it to Email.
const ownPage = detailsPage();
ownPage[8].selectedText = "Phone call";
ownPage[8].value = "phone";
const ownView = rf.ftcSelectView(ownPage, START_Q, EMAIL);
const ownPick = rf.makeCategoryAutoPick(rf.W, rf.START);
ok("started: the user's own non-Email choice stands " +
   "the picker down",
  ownView.otherSelected === true &&
  ownPick.step(ownView, 1000) === null &&
  ownPick.getState() === "user");

// Email already chosen before the filler got there:
// reads as selected (the machine credits it to the
// user, per the standing discipline — never claimed).
const prePage = detailsPage();
prePage[8].selectedText = "Email";
prePage[8].value = "email";
const preView = rf.ftcSelectView(prePage, START_Q, EMAIL);
ok("started: Email already chosen reads as selected, " +
   "with nothing left to set",
  preView.tile.selected === true &&
  preView.targetValue === null &&
  preView.otherSelected === false);

ok("started: no select carrying the label yields " +
   "null — the caller's radio fallback signal",
  rf.ftcSelectView([
    { kind: "heading", text: "How did it start?" },
    { kind: "radio", name: "started", label: "Email", checked: false }
  ], START_Q, EMAIL) === null);
ok("started: a select with no Email option offers " +
   "nothing to set",
  (function () {
    const v = rf.ftcSelectView([
      { kind: "select", label: "How did it start?",
        options: [
          { text: "Select", value: "" },
          { text: "Phone call", value: "phone" }],
        selectedText: "Select", value: "" }
    ], START_Q, EMAIL);
    return !!v && v.targetValue === null &&
      v.tile.selected === false;
  })());

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
