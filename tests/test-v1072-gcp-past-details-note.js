// Spam Avenger, public 1.0.72 — the Google Cloud kit's
// past-details line. From Michael's live walk of the GCP
// abuse form (Nov 8 2026): Google Support's form keeps his
// earlier support cases and offers their fields back in a
// "Use past details" panel on the left of the form, prefill
// checkboxes and all. His call: the light touch — one
// sentence in the kit's panel instructions telling Joe what
// that panel is, so it doesn't spook him ("That's Google
// remembering your past cases, not Spam Avenger"). The
// sentence closes the Google lane's fieldsIntro — the note
// that introduces the field-by-field action steps — so it
// renders in the PANEL, never inside the copied evidence.
// Scope is the Google kit only: the panel is a Google
// Support feature, so OVH / Azure / AWS / registrar kits
// carry no such line. These pins hold all of that.
// Run: node tests/test-v1072-gcp-past-details-note.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const contentSrc = fs.readFileSync(path.join(ROOT, "content.js"), "utf8");
const libSrc = fs.readFileSync(path.join(ROOT, "lib", "analyze.js"), "utf8");
const reportfillSrc = fs.readFileSync(path.join(ROOT, "reportfill.js"), "utf8");
const analyze = require(path.join(ROOT, "lib", "analyze.js"));
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); }
}

const SENTENCE = "Google may offer details from your earlier " +
  "reports on the left side of this form. That's Google " +
  "remembering your past cases, not Spam Avenger \u2014 " +
  "use them or ignore them.";

// ---------- manifest ----------
ok("manifest version is 1.0.73 (combined build)",
  manifest.version === "1.0.74", "got " + manifest.version);

// ---------- the shipped lane table (extracted verbatim) ----------
const m = contentSrc.match(/var HYPER_FORM_HINTS = (\{[\s\S]*?\n  \});/);
ok("HYPER_FORM_HINTS table extractable from content.js", !!m);
const hints = m ? vm.runInNewContext("(" + m[1] + ")") : {};
const mo = contentSrc.match(/var OVH_FORM_HINT = (\{[\s\S]*?\});/);
const ovhHint = mo ? vm.runInNewContext("(" + mo[1] + ")") : {};

// ---------- the sentence, in the Google kit's intro ----------
ok("google lane present in the table", !!hints.google);
ok("google fieldsIntro carries the past-details sentence",
  !!hints.google && typeof hints.google.fieldsIntro === "string" &&
  hints.google.fieldsIntro.indexOf(SENTENCE) !== -1);
ok("the sentence CLOSES the google fieldsIntro (appended, not buried)",
  !!hints.google && typeof hints.google.fieldsIntro === "string" &&
  hints.google.fieldsIntro.slice(-SENTENCE.length) === SENTENCE);
ok("the sentence appears exactly once in the google intro",
  !!hints.google &&
  hints.google.fieldsIntro.split(SENTENCE).length - 1 === 1);
ok("the sentence's source fragment is unique in content.js",
  contentSrc.split("use them or ignore them").length - 1 === 1);

// ---------- wiring: the intro is the action-steps note ----------
const kitStart = contentSrc.indexOf("var formLane = null;");
const emailStart = contentSrc.indexOf(
  'acc.section("sf-sec-complaint", "sf-btn-green"');
const kitSeg = (kitStart !== -1 && emailStart !== -1)
  ? contentSrc.slice(kitStart, emailStart) : "";
ok("kit segment located", kitSeg.length > 0);
ok("the field-by-field steps render under the lane's label heading",
  kitSeg.indexOf('"Filling in the " + formLane.label') !== -1);
ok("the kit renders formLane.fieldsIntro as the steps' intro note",
  kitSeg.indexOf("formLane.fieldsIntro") !== -1 &&
  kitSeg.indexOf('fwrap.appendChild(h("p", { "class": "sf-note" },') !== -1);

// ---------- no other kit carries it ----------
["aws", "azure"].forEach(function (k) {
  ok(k + " fieldsIntro has no past-details sentence",
    !!hints[k] && typeof hints[k].fieldsIntro === "string" &&
    hints[k].fieldsIntro.indexOf(SENTENCE) === -1);
  ok(k + " lane entry carries the sentence nowhere at all",
    JSON.stringify(hints[k] || {}).indexOf(SENTENCE) === -1);
});
ok("ovh fieldsIntro has no past-details sentence",
  typeof ovhHint.fieldsIntro === "string" &&
  ovhHint.fieldsIntro.indexOf(SENTENCE) === -1);
ok("ovh lane entry carries the sentence nowhere at all",
  JSON.stringify(ovhHint).indexOf(SENTENCE) === -1);
ok("the rest of the google entry carries it only via the intro " +
   "(no second copy in pick/fields)",
  !!hints.google &&
  JSON.stringify(hints.google).split(SENTENCE).length - 1 === 1);

// ---------- never inside the copied evidence ----------
// Every evidence builder (standard block, per-field slices,
// hosting/link blocks, the registrar kits) lives in the lib —
// the sentence living only in content.js kit data keeps it
// out of all of them; the behavioral checks below prove it.
ok("the sentence is absent from lib/analyze.js (all evidence builders)",
  libSrc.indexOf(SENTENCE) === -1);
ok("the sentence is absent from reportfill.js (FTC/SB lanes untouched)",
  reportfillSrc.indexOf(SENTENCE) === -1);

const SPAM = {
  ip: "34.139.191.104",
  org: "Google LLC",
  abuse: "google-cloud-compliance@google.com",
  host: "104.191.139.34.bc.googleusercontent.com",
  from: "Colorami <no-reply@colorami.com>",
  subject: "You Have Incoming Pending messages",
  date: "Wed, 28 Oct 2026 16:35:00 +0000",
  messageId: "<lure@colorami.com>",
  ingressReceived: "from mail-sor-f41.google.com ([34.139.191.104]) " +
    "by ben.ace-host.net with smtp",
  urls: [
    "https://w2.example-phish.com/login",
    "http://cdn.example-phish.com/x.png"
  ],
  fullHeaders:
    "From: Colorami <no-reply@colorami.com>\n" +
    "Subject: You Have Incoming Pending messages\n" +
    "DKIM-Signature: v=1; a=rsa-sha256; d=colorami.com;\n\tb=deadbeefcafe\n" +
    "Received: from mail-sor-f41.google.com ([34.139.191.104]) " +
    "by ben.ace-host.net with smtp\n" +
    "Date: Wed, 28 Oct 2026 16:35:00 +0000",
  bodyText: "Dear customer, verify your pending messages now: " +
    "https://w2.example-phish.com/login"
};
const block = analyze.buildFormEvidence(SPAM);
ok("the standard form evidence block builds for the fixture",
  typeof block === "string" && block.length > 0);
ok("the standard evidence block does NOT carry the sentence",
  typeof block === "string" && block.indexOf(SENTENCE) === -1);
["date", "googleDetails", "logs"].forEach(function (k) {
  const slice = analyze.buildFormFieldEvidence(SPAM, k);
  ok("google's \"" + k + "\" step slice does NOT carry the sentence",
    typeof slice === "string" && slice.indexOf(SENTENCE) === -1);
});
["buildHostingFormEvidence", "buildLinkFormEvidence",
 "buildRegistrarFormEvidence"].forEach(function (fn) {
  if (typeof analyze[fn] !== "function") return;
  let out = null;
  try { out = analyze[fn](SPAM); } catch (e) {}
  ok(fn + " output does NOT carry the sentence",
    typeof out !== "string" || out.indexOf(SENTENCE) === -1);
});

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
