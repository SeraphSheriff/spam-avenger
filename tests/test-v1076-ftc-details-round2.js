"use strict";
// Spam Avenger v1.0.76 — FTC "Report details" lane,
// field-test round 2. Michael's v1.0.75 walk of the
// live ReportFraud form fixed "How did it start"
// (the select now lands on Email) but left two
// failures on the same composite page:
//
// A) "Did you send the scammer payment of any kind?"
//    still ended on Yes. Two code defects compound:
//    (1) the picks ran exactly once — the narrative
//    fill in the same pre-fill pass flips the watch
//    to post-fill mode, and postFillPass never stepped
//    the pickers again, so the machines' ~5-second
//    retry window collapsed into a single scan; and
//    (2) the machine latched its "user" stand-down on
//    the FIRST sight of the group's Yes checked, with
//    no way to tell a form-rendered default from the
//    user's own click — a pre-checked Yes was
//    untouchable forever. v1.0.76: the post-fill pass
//    keeps stepping the picks while the composite
//    page is up (runQuestionPicks, gated on the
//    page's <textarea> node, the v1.0.45
//    discriminator); the payment machine gains
//    correctDefault — a selection present before the
//    group was ever seen unanswered is treated as
//    the form's default and corrected with the same
//    retry-until-verified discipline, while a
//    selection appearing after an open sighting is
//    still the user's hand and stands the machine
//    down for good; and click verification re-scans
//    the group fresh instead of trusting the
//    captured (possibly re-rendered-away) input node.
//    The radio scan also records each radio's group
//    label (fieldset legend / radiogroup aria), and
//    ftcQuestionView can scope a group from it when
//    no heading item carries the question.
//
// B) The four spam experience boxes sat unchecked.
//    v1.0.74's scan collected a box only when its
//    label mentioned "spam" — patterns written from
//    Michael's spoken paraphrase. The live labels
//    (below, verbatim) contain "spam" in only two of
//    four, so the scan gathered two boxes, the
//    exactly-four guard rejected the group, and the
//    picker was never fed. v1.0.76: the group is
//    anchored on its heading ("Did you experience
//    any of the following?") and the targets are
//    identified by the real label texts via the
//    pure spamBoxTargets — the pornographic box is
//    excluded by its own words, never by position
//    alone.
//
// Run: node tests/test-v1076-ftc-details-round2.js

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
function count(hay, needle) {
  return hay.split(needle).length - 1;
}

ok("manifest: version is 1.0.76", manifest.version === "1.0.84");

// ---------- wiring pins ----------
ok("reportfill: the question-pick step is extracted " +
   "and runs in BOTH watch modes",
  rfSrc.indexOf("function runQuestionPicks()") !== -1 &&
  count(rfSrc, "runQuestionPicks();") === 2 &&
  rfSrc.indexOf("runQuestionPicks();") >
    rfSrc.indexOf("function attempt()") &&
  rfSrc.lastIndexOf("runQuestionPicks();") >
    rfSrc.indexOf("function postFillPass()"));
ok("reportfill: the post-fill continuation is gated " +
   "on the composite page's textarea node (the " +
   "review step repeats the question text but has " +
   "no textarea — the picks can never fire there)",
  rfSrc.indexOf('document.querySelector("textarea") &&') !== -1 &&
  rfSrc.indexOf("QUESTION_RE.test(t)) {\n        runQuestionPicks();") !== -1);
ok("reportfill: the payment picker is built with " +
   "correctDefault, at declaration and on re-arm",
  rfSrc.indexOf("function newPayPick()") !== -1 &&
  rfSrc.indexOf("cfg.correctDefault = true") !== -1 &&
  rfSrc.indexOf("var payPick = stash.sextortion ? null : newPayPick();") !== -1 &&
  rfSrc.indexOf("payPick = newPayPick();") !== -1);
ok("reportfill: SCOPE GATE kept — the sextortion " +
   "path still builds none of the question pickers",
  rfSrc.indexOf("var payPick = stash.sextortion ? null") !== -1 &&
  rfSrc.indexOf("var spamPick = stash.sextortion ? null") !== -1);
ok("reportfill: click verification re-scans the " +
   "group fresh (a re-render can replace the input " +
   "node the click was aimed at)",
  rfSrc.indexOf("var fresh = scanQuestionView(questionRe, optionRe);") !== -1 &&
  rfSrc.indexOf("!!fresh.tile.selected") !== -1 &&
  rfSrc.indexOf("!!view.tileInput.checked") !== -1);
ok("reportfill: the radio scan records each radio's " +
   "group label for the heading-independent scope",
  rfSrc.indexOf('el.closest("fieldset, [role=\'radiogroup\']")') !== -1 &&
  rfSrc.indexOf("group: grp,") !== -1);
ok("reportfill: the spam-box scan is anchored on " +
   "the experience heading and the real labels — " +
   "the paraphrase /spam/-only collection is gone",
  rfSrc.indexOf("function experienceScope()") !== -1 &&
  rfSrc.indexOf("/did you experience any of the following/i") !== -1 &&
  rfSrc.indexOf("spamBoxTargets(labels)") !== -1 &&
  rfSrc.indexOf("boxes.length === 4 ? boxes : null") === -1);

// ---------- the pure segment, behaviorally ----------
const segStart = rfSrc.indexOf("var CAT_PICK_WINDOW_MS");
const segEnd = rfSrc.indexOf(
  "/* ---------------- FTC ReportFraud wizard");
ok("reportfill: the pure segment is extractable",
  segStart !== -1 && segEnd > segStart);
const seg = rfSrc.slice(segStart, segEnd);
const rf = new Function(seg +
  "; return { W: CAT_PICK_WINDOW_MS," +
  " makeCategoryAutoPick: makeCategoryAutoPick," +
  " makeSpamBoxesPick: makeSpamBoxesPick," +
  " spamBoxTargets: spamBoxTargets," +
  " ftcQuestionView: ftcQuestionView," +
  " PAY: SA_FTC_PAY_NO };")();

const PAY_Q = /did you send|payment of any kind/i;
const NO = /^no$/i;

// The live "Report details" page, Michael's Nov 23
// 2026 screenshot, as an item list: fix-problem
// group, payment group, money fields, the started
// select, the sender-email field, the experience
// group, the scammer-details section.
function detailsPage() {
  return [
    { kind: "heading", text: "Did the scammer offer to fix a problem with your computer?" },
    { kind: "radio", name: "fixProblem", group: "Did the scammer offer to fix a problem with your computer?", label: "Yes", checked: false },
    { kind: "radio", name: "fixProblem", group: "Did the scammer offer to fix a problem with your computer?", label: "No", checked: false },
    { kind: "heading", text: "Did you send the scammer payment of any kind?" },
    { kind: "radio", name: "sentPayment", group: "Did you send the scammer payment of any kind?", label: "Yes", checked: false },
    { kind: "radio", name: "sentPayment", group: "Did you send the scammer payment of any kind?", label: "No", checked: false },
    { kind: "heading", text: "How much money did you pay the scammer in total?" },
    { kind: "heading", text: "How did it start (ex. how did they first contact you, where did you see an ad?)" },
    { kind: "select",
      label: "How did it start (ex. how did they first contact you, where did you see an ad?)",
      options: [
        { text: "Select", value: "" },
        { text: "Email", value: "email" },
        { text: "Phone call", value: "phone" }],
      selectedText: "Select", value: "" },
    { kind: "heading", text: "What was the sender's email address?" },
    { kind: "heading", text: "Did you experience any of the following? Please select all that apply:" },
    { kind: "heading", text: "Details about the scammer" },
    { kind: "heading", text: "Which company did they pretend to be?" }
  ];
}

// ---------- A: the group-label scope (no heading) ----------
// The payment question's text never surfaces as a
// heading item; the radios carry it as their group
// label. The view must still scope the payment group.
const noHead = detailsPage().filter(function (it) {
  return !(it.kind === "heading" &&
    /did you send/i.test(it.text));
});
const nhView = rf.ftcQuestionView(noHead, PAY_Q, NO);
ok("payment: with no heading item, the radios' group " +
   "label still scopes the payment group",
  !!nhView && nhView.groupCount === 2 &&
  nhView.tile !== null && nhView.tile.selected === false &&
  nhView.otherSelected === false &&
  noHead[nhView.target].name === "sentPayment" &&
  noHead[nhView.target].label === "No");

// ---------- A: correctDefault ----------
function payMachine() {
  const cfg = {};
  for (const k in rf.PAY) cfg[k] = rf.PAY[k];
  cfg.correctDefault = true;
  return rf.makeCategoryAutoPick(rf.W, cfg);
}
function payView(yes, no) {
  return { tile: { selected: no }, tileEl: {},
    otherSelected: yes };
}
// The field state: the walker's first-ever view of
// the group already shows Yes. Never seen unanswered
// → the form's rendered default → correct it.
const corr = payMachine();
ok("payment: a Yes present at first sight (never " +
   "seen unanswered) is treated as the form's " +
   "default — the correction click is offered",
  corr.step(payView(true, false), 1000) === "click");
corr.afterClick(true);
ok("payment: a verified correction finishes the " +
   "pick and the guide states it",
  corr.getState() === "done" &&
  corr.guideLine() ===
    "I selected 'No' for you \u2014 you didn't send them any payment.");
// The user's own hand: the group was seen unanswered
// first, THEN a Yes appears — stand down forever.
const ownHand = payMachine();
ownHand.step(payView(false, false), 1000);
ok("payment: a Yes appearing after the group was " +
   "seen unanswered is the user's hand — stand " +
   "down, never override",
  ownHand.step(payView(true, false), 1100) === null &&
  ownHand.getState() === "user");
// A correction that won't stick retries inside the
// window, then honestly fails.
const stubborn = payMachine();
stubborn.step(payView(true, false), 1000);
stubborn.afterClick(false);
ok("payment: an unverified correction retries " +
   "inside the window, then fails honestly",
  stubborn.step(payView(true, false), 1100) === "click" &&
  stubborn.step(payView(true, false), 1000 + rf.W) === null &&
  stubborn.getState() === "failed");
// Without correctDefault (every other machine), the
// original rule is untouched: first-sight Yes = user.
const plain = rf.makeCategoryAutoPick(rf.W, rf.PAY);
ok("payment: without correctDefault the standing " +
   "rule is unchanged — first-sight Yes stands down",
  plain.step(payView(true, false), 1000) === null &&
  plain.getState() === "user");
// The target already chosen at first sight: the
// answer is already right; the machine credits it
// to the user per the standing discipline.
const preNo = payMachine();
ok("payment: No already selected at first sight " +
   "reads as the user's hand (never claimed)",
  preNo.step(payView(false, true), 1000) === null &&
  preNo.getState() === "user");

// ---------- B: the real spam labels ----------
const REAL_LABELS = [
  "I am getting spam e-mails and I want them to stop",
  "I cannot opt out of receiving e-mails from this company",
  "I received an e-mail that displayed pornographic images",
  "I received a spam e-mail with a missing or misleading subject line or from address"
];
ok("boxes: the four REAL labels yield Michael's " +
   "three — [0, 1, 3], the pornographic box excluded",
  JSON.stringify(rf.spamBoxTargets(REAL_LABELS)) === "[0,1,3]");
ok("boxes: the exclusion follows the WORDS, not " +
   "the position — reordered labels still protect " +
   "the pornographic box",
  JSON.stringify(rf.spamBoxTargets([
    REAL_LABELS[2], REAL_LABELS[0], REAL_LABELS[3],
    REAL_LABELS[1]])) === "[1,2,3]");
ok("boxes: no pornographic label in view — no " +
   "textual ruling (the caller may fall back to " +
   "position only because nothing is endangered)",
  rf.spamBoxTargets([
    "I am getting spam I cannot opt out of receiving emails",
    "I received a spam email with a misleading or missing subject",
    "Something else entirely",
    "A fourth unrelated box"]) === null);
ok("boxes: a pornographic label but too few " +
   "positive confirmations — no ruling",
  rf.spamBoxTargets([
    REAL_LABELS[2], "Unrelated box A",
    "Unrelated box B", "Unrelated box C"]) === null);
ok("boxes: anything but exactly four labels — " +
   "no ruling",
  rf.spamBoxTargets(REAL_LABELS.slice(0, 3)) === null &&
  rf.spamBoxTargets(null) === null);

// The picker fed the real targets, end to end.
const realPick = rf.makeSpamBoxesPick(rf.W);
ok("boxes: fed the real group, the picker asks for " +
   "exactly the three textual targets",
  JSON.stringify(realPick.step(
    { boxes: [false, false, false, false],
      targets: rf.spamBoxTargets(REAL_LABELS) }, 1000)) ===
    "[0,1,3]");
realPick.afterClick(0, true);
realPick.afterClick(1, true);
realPick.afterClick(3, true);
ok("boxes: all three verified — done, and the " +
   "pornographic box was never asked for",
  realPick.getState() === "done" &&
  JSON.stringify(realPick.step(
    { boxes: [true, true, false, true],
      targets: [0, 1, 3] }, 1200)) === "[]");
// Targets latch from the first view that carries
// them; a later targetless view can't move them.
const latchPick = rf.makeSpamBoxesPick(rf.W);
latchPick.step({ boxes: [false, false, false, false],
  targets: [1, 2, 3] }, 1000);
ok("boxes: targets latch on the first carrying " +
   "view — a later plain view keeps them",
  JSON.stringify(latchPick.step(
    { boxes: [false, false, false, false] }, 1100)) ===
    "[1,2,3]");
// The v1.0.74 behavior is the default when no
// targets ride in the view.
const defPick = rf.makeSpamBoxesPick(rf.W);
ok("boxes: no targets in view — the positional " +
   "ruling [0, 1, 3] still applies",
  JSON.stringify(defPick.step(
    { boxes: [false, false, false, false] }, 1000)) ===
    "[0,1,3]");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
