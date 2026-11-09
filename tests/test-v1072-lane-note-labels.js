"use strict";
// Public 1.0.72 release (internal build .73) — every note
// that stands in for a missing lane names the lane
// (queued-lane-note-labels.md, Michael's call Nov 8 2026).
// Field evidence: on the vitluma.fun panel the no-website
// note rendered directly under the Report to FTC row and
// its Launched status line, and read as an FTC warning.
// The fix is attribution: the note OPENS with the lane's
// name as a bold lead-in; the existing sentence is
// unchanged. (Placement moved later the same day: the
// stand-in notes are now COLLECTED into the Blocked lanes
// group at the bottom of the stack —
// queued-blocked-lanes-group.md — where notes from several
// lanes sit side by side and the labels do even more work.
// These pins still guard the labels and the wording;
// placement pins live in test-v1072-blocked-lanes-group.js.)
//
// Pins:
//  - placeGateNote renders a bold label + the sentence.
//  - no-live-website note: "Website host complaint:" lead.
//  - hidden-hosting note (website): same lead.
//  - hidden-hosting note (link host): "Link host complaint:".
//  - spoof suppression note: "Website host and Registrar:".
//  - audit finds: the two mail-lane stack warnings (no
//    published abuse contact; big-provider no-complaint)
//    open with "Abuse complaint:" in bold too.
//  - NOT lane stand-ins, unchanged: the sextortion callout,
//    the details spoof note, the repeat-sighting note.

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const contentSrc = fs.readFileSync(path.join(ROOT, "content.js"), "utf8");
const analyze = require(path.join(ROOT, "lib", "analyze.js"));
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

ok("manifest version stays 1.0.72", manifest.version === "1.0.72",
  "got " + manifest.version);

// The sentences themselves are unchanged (the lib constants
// still carry the bare sentences; labels are render-side).
ok("sentences: the no-website sentence is unchanged",
  analyze.NO_SITE_EXPLANATION ===
    "The domain is only used to send spam and has no live " +
    "website, so reporting abuse to a hosting company is " +
    "not viable/useful.",
  "got " + analyze.NO_SITE_EXPLANATION);
ok("sentences: the hidden-hosting sentence is unchanged",
  analyze.HOST_HIDDEN_EXPLANATION ===
    "The company hosting this website is hidden, so a " +
    "hosting complaint can't be delivered.",
  "got " + analyze.HOST_HIDDEN_EXPLANATION);

// placeGateNote renders label (bold) + sentence.
const pgAt = contentSrc.indexOf("function placeGateNote");
const pgSeg = pgAt === -1 ? "" : contentSrc.slice(pgAt, pgAt + 400);
ok("render: placeGateNote takes a label and renders it bold",
  pgSeg.indexOf("function placeGateNote(label, text)") !== -1 &&
    pgSeg.indexOf('h("b", null, label)') !== -1);

ok("lead: the no-live-website note names the website host lane",
  contentSrc.indexOf('placeGateNote("Website host complaint:",')
    !== -1 &&
  contentSrc.indexOf(
    "window.SpamAvenger.NO_SITE_EXPLANATION") !== -1);
ok("lead: the hidden-hosting note names the website host lane",
  count(contentSrc,
    'placeGateNote("Website host complaint:",') === 2);
ok("lead: the link-host hidden note names the link host lane",
  contentSrc.indexOf('placeGateNote("Link host complaint:",')
    !== -1);
ok("lead: the spoof suppression note names both domain lanes",
  contentSrc.indexOf('placeGateNote("Website host and Registrar:",')
    !== -1);

// Audit finds: the mail lane's two stack warnings carry the
// lane's bold lead too, wording after the label unchanged.
ok("audit: both mail-lane warnings open with the bold lane name",
  count(contentSrc, 'h("b", null, "Abuse complaint:")') === 2,
  "got " + count(contentSrc, 'h("b", null, "Abuse complaint:")'));
ok("audit: the no-contact warning's sentence is unchanged",
  contentSrc.indexOf("No published abuse contact for this IP. ")
    !== -1 &&
  contentSrc.indexOf(
    "Report the links below via Google Safe Browsing instead.")
    !== -1);
ok("audit: the big-provider warning's sentence is unchanged",
  contentSrc.indexOf("no complaint generated (it would hit " +
    "the wrong target)") !== -1);

// NOT lane stand-ins — unchanged.
const sexAt = contentSrc.indexOf("This looks like sextortion");
const sexSeg = sexAt === -1 ? "" : contentSrc.slice(
  Math.max(0, sexAt - 300), sexAt + 300);
ok("unchanged: the sextortion callout carries no lane label",
  sexSeg.indexOf("complaint:") === -1 &&
    sexSeg.indexOf('h("b", null, label)') === -1);
ok("unchanged: the details spoof note carries no lane label",
  contentSrc.indexOf(
    "'The \"From\" address is spoofed. The IP is the face underneath.'")
    !== -1);
const repAt = contentSrc.indexOf("sf-repeat-note");
const repSeg = repAt === -1 ? "" : contentSrc.slice(
  Math.max(0, repAt - 200), repAt + 200);
ok("unchanged: the repeat-sighting note carries no lane label",
  repSeg.indexOf("complaint:") === -1);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
