"use strict";
// Spam Avenger v1.0.73 — the abuse complaint's blocked note
// must not point at a Safe Browsing lane that isn't present
// (queued-abuse-note-sb-reference.md, Nov 8 2026).
//
// The note read "No published abuse contact for this IP.
// Report the links below via Google Safe Browsing instead."
// unconditionally — but the SB lane itself is gated (bucket
// + provider gates settle in applyClassification's final
// pass), so on a panel with no SB lane the pointer dangled.
// Now the pointer sentence rides in a span marked
// sf-abuse-sb-fallback, and the same final pass that removes
// the SB lane removes the span. The pinned sentence itself
// stays in the source (three older suites pin it) — what
// changed is that it no longer always survives to the eye.
//
// Run: node tests/test-v1073-abuse-note-sb.js

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const contentSrc = fs.readFileSync(path.join(ROOT, "content.js"), "utf8");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); }
}

// ---------- the note's construction ----------
const noteAt = contentSrc.indexOf("No published abuse contact for this IP.");
const noteSlice = contentSrc.slice(noteAt - 700, noteAt + 500);
ok("note: the contact fact and the pointer are separate pieces",
  noteSlice.indexOf('"No published abuse contact for this IP. "') !== -1 &&
  noteSlice.indexOf('h("span", { "class": "sf-abuse-sb-fallback" }') !== -1);
ok("note: the pointer sentence keeps its exact wording",
  noteSlice.indexOf('"Report the links below via Google Safe Browsing instead."') !== -1 &&
  noteSlice.indexOf('"No published abuse contact for this IP. "') !== -1);
ok("note: the label and the collection are unchanged",
  noteSlice.indexOf('h("b", null, "Abuse complaint:")') !== -1 &&
  noteSlice.indexOf("addBlockedNote(h(") !== -1);

// ---------- the final-pass removal ----------
const acAt = contentSrc.indexOf("function applyClassification");
const acSlice = contentSrc.slice(acAt, acAt + 2600);
ok("final pass: the span removal rides the SB-lane removal",
  acSlice.indexOf("!SA.sbLaneVisible(a, a.laneGate || {})") !== -1 &&
  acSlice.indexOf('stack.querySelectorAll(".sf-abuse-sb-fallback")') !== -1 &&
  acSlice.indexOf("sbRow.toggle.remove()") !== -1);
const laneGoneAt = acSlice.indexOf("sbRow.toggle.remove()");
const spanGoneAt = acSlice.indexOf(".sf-abuse-sb-fallback");
ok("final pass: lane and pointer fall in the same verdict block",
  laneGoneAt !== -1 && spanGoneAt > laneGoneAt &&
  spanGoneAt - laneGoneAt < 900);
ok("final pass: nothing removes the span when the lane stays",
  (contentSrc.match(/sf-abuse-sb-fallback/g) || []).length === 3,
  "occurrences: " + ((contentSrc.match(/sf-abuse-sb-fallback/g) || []).length) +
  " (comment + construction + removal)");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
