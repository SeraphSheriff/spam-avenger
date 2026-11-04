// Spam Avenger v1.0.71 — the remarks-scan fallback in
// extractAbuse, from the GhostyNet case (Nov 4 2026).
//
// AFRINIC's record for GhostyNet's block 196.251.121.0/24
// carries NO structured abuse entity with an email; the only
// abuse pointer is a free-text remarks line, "Abuse email:
// ghostynet@airmail.cc". Every structured-field reader —
// Spam Avenger included — reported "not published", and the
// panel fell back to the FTC / Safe Browsing lanes with no
// desk to complain to.
//
// The fix: after the entity walk comes up empty, scan the
// RDAP object's remarks, but ONLY a remark that is about
// abuse, and take the first email-shaped token in it.
// Conservative on purpose: a remark that merely contains an
// email address (billing, tech contact, anything else) must
// never surface as an abuse contact.
//
// Pins:
//  - the GhostyNet shape: entity with no abuse email +
//    abuse address only in remarks -> the remarks address;
//  - a structured abuse entity still wins over remarks
//    (structured data outranks free text);
//  - an abuse remark with no email in it -> null;
//  - a non-abuse remark containing an email -> null;
//  - an object with NO entities key at all still gets the
//    remarks scan (the old early return skipped it);
//  - null / empty inputs stay null.
//
// extractAbuse is shared, so the registrar lane
// (parseDomainRdap's fallback) inherits the same reach.
//
// Run: node tests/test-v1071-remarks-abuse.js
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const analyze = require(path.join(ROOT, "lib", "analyze.js"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); }
}

// ---------- the GhostyNet shape ----------
const ghostynet = {
  handle: "196.251.121.0 - 196.251.121.255",
  type: "ASSIGNED PA",
  status: ["active"],
  entities: [
    {
      objectClassName: "entity",
      handle: "GHOSTYNET-1",
      roles: ["registrant"],
      vcardArray: ["vcard", [
        ["fn", {}, "text", "GhostyNet"]
      ]]
    }
  ],
  remarks: [
    {
      description: ["Abuse email: ghostynet@airmail.cc"]
    }
  ]
};
ok("ghostynet: abuse email found in remarks",
  analyze.extractAbuse(ghostynet) === "ghostynet@airmail.cc",
  String(analyze.extractAbuse(ghostynet)));

// ---------- structured abuse entity beats remarks ----------
const structured = {
  entities: [
    {
      objectClassName: "entity",
      roles: ["abuse"],
      vcardArray: ["vcard", [
        ["fn", {}, "text", "Abuse Desk"],
        ["email", {}, "text", "realabuse@example.net"]
      ]]
    }
  ],
  remarks: [
    { description: ["Abuse email: other@elsewhere.example"] }
  ]
};
ok("structured abuse entity wins over remarks",
  analyze.extractAbuse(structured) === "realabuse@example.net",
  String(analyze.extractAbuse(structured)));

// ---------- abuse remark with no email -> null ----------
const abuseNoEmail = {
  entities: [],
  remarks: [
    { title: "Abuse", description: ["Report abuse via our web form."] }
  ]
};
ok("abuse remark without an email -> null",
  analyze.extractAbuse(abuseNoEmail) === null);

// ---------- non-abuse remark with an email -> null ----------
const nonAbuse = {
  entities: [],
  remarks: [
    { title: "Billing", description: ["Billing contact: pay@example.com"] },
    { description: ["Tech contact tech@example.org for network issues."] }
  ]
};
ok("non-abuse remarks containing emails -> null",
  analyze.extractAbuse(nonAbuse) === null);

// ---------- no entities key at all ----------
const noEntities = {
  remarks: [
    { title: "Abuse contact", description: ["abuse@noentities.example"] }
  ]
};
ok("object without entities still gets the remarks scan",
  analyze.extractAbuse(noEntities) === "abuse@noentities.example",
  String(analyze.extractAbuse(noEntities)));

// ---------- title alone can carry the pointer ----------
const titleCarries = {
  entities: [],
  remarks: [
    { title: "Abuse reports to abuse@title.example", description: ["See title."] }
  ]
};
ok("abuse address in the remark title is found",
  analyze.extractAbuse(titleCarries) === "abuse@title.example",
  String(analyze.extractAbuse(titleCarries)));

// ---------- empty shapes stay null ----------
ok("null input -> null", analyze.extractAbuse(null) === null);
ok("empty object -> null", analyze.extractAbuse({}) === null);
ok("entities but no abuse anywhere -> null",
  analyze.extractAbuse({ entities: [
    { roles: ["technical"],
      vcardArray: ["vcard", [["email", {}, "text", "noc@example.com"]]] }
  ] }) === null);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
