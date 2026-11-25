"use strict";
// Public 1.0.72 release (internal build .73) — the
// registrar letter's AGE FRAMING (Michael's call, Nov 8
// 2026; the young line drawn at 90 days).
//
// The field failure: the registrar complaint against
// colorami.com (registered Fri, 07 Jul 2000) read "the
// fraud message below arrived 9616 days later — the
// domain went from registration to fraud almost
// immediately" and demanded suspension of a 26-year-old
// domain as "fraud infrastructure". The born-for-fraud
// framing was appended unconditionally whenever a
// registration date existed.
//
// The ruling: daysBefore (registration → message) <= 90
// is YOUNG — the original letter, byte-for-byte (intro,
// "(fraud infrastructure)" subject, suspension closing),
// because for a throwaway domain the interval IS the
// evidence and suspension is the right ask. daysBefore
// > 90 is OLD — a long-established domain sending fraud
// points to a compromise or a spoof (Michael's
// hypothetical: a 10–15-year-old domain whose mail
// server was taken over), so the letter states the dates
// plainly, drops the born-for-fraud claim, and asks the
// registrar to investigate and notify the registrant.
// Exactly 90 is young; 91 is old. No registration date
// (or no computable interval): the original text, no age
// sentence. Both builder sites carry the framing:
// buildRegistrarComplaint (the email lane) and
// buildRegistrarFormEvidence (the form-kit evidence).

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const analyze = require(path.join(ROOT, "lib", "analyze.js"));
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); }
}

ok("manifest version stays 1.0.73", manifest.version === "1.0.84",
  "got " + manifest.version);

const REG = "2026-05-06T00:00:00Z";
const REG_STAMP = "Wed, 06 May 2026 00:00:00 UTC";
function mkA(daysBefore, withFreshness) {
  const a = {
    from: "Promo <promo@quickloan-deals.com>",
    subject: "Your loan is ready",
    date: "Tue, 3 Nov 2026 09:00:00 +0000",
    senderDomain: "quickloan-deals.com",
    urls: [],
    fullHeaders: "From: Promo <promo@quickloan-deals.com>",
    bodyText: "Great rates today.",
    registrarInfo: {
      registrar: "NameCheap, Inc.",
      registrarAbuse: "abuse@namecheap.com",
      registered: REG,
      registrant: null
    }
  };
  if (withFreshness !== false) {
    a.registrarInfo.freshness =
      { daysBefore: daysBefore, fresh: daysBefore <= 30 };
  }
  return a;
}
function mkDated(registered, dateStr) {
  const a = mkA(0, false);
  a.registrarInfo.registered = registered;
  a.date = dateStr;
  return a;
}

const YOUNG_SUBJECT =
  "DNS abuse report — quickloan-deals.com (fraud infrastructure)";
const OLD_SUBJECT = "DNS abuse report — quickloan-deals.com";
const YOUNG_CLOSING =
  "this domain is fraud infrastructure, not a legitimate " +
  "registration. Please investigate and suspend the " +
  "domain. Thank you.";
const OLD_CLOSING =
  "Please investigate, notify the registrant that their " +
  "domain is being used to send fraud, and take " +
  "appropriate action. Thank you.";
function youngIntro(intervalClause) {
  return "I am reporting a domain registered through you " +
    "that exists to run fraud. quickloan-deals.com was " +
    "registered on " + REG_STAMP + intervalClause +
    " — the domain went from registration to fraud " +
    "almost immediately.";
}
function oldIntro(days) {
  return "I am reporting fraud sent using a domain " +
    "registered through you. quickloan-deals.com was " +
    "registered on " + REG_STAMP + " and the fraud " +
    "message below arrived " + days + " days later. The " +
    "domain is long-established, so this points to a " +
    "compromise or spoofing rather than a throwaway " +
    "registration; the headers below are the evidence.";
}

// ---------- buildRegistrarComplaint: young stays young ----------
[[0, " and the fraud message below arrived the same day"],
 [1, " and the fraud message below arrived 1 day later"],
 [30, " and the fraud message below arrived 30 days later"],
 [89, " and the fraud message below arrived 89 days later"],
 [90, " and the fraud message below arrived 90 days later"]
].forEach(function (pair) {
  const days = pair[0];
  const c = analyze.buildRegistrarComplaint(mkA(days));
  ok("complaint: day " + days + " is YOUNG (full original framing)",
    !!c && c.body.indexOf(youngIntro(pair[1])) !== -1 &&
      c.subject === YOUNG_SUBJECT &&
      c.body.indexOf(YOUNG_CLOSING) !== -1 &&
      c.body.indexOf("long-established") === -1,
    c ? c.body.split("\n")[2] : "null complaint");
});

// ---------- buildRegistrarComplaint: old turns old ----------
[91, 365, 9616].forEach(function (days) {
  const c = analyze.buildRegistrarComplaint(mkA(days));
  ok("complaint: day " + days + " is OLD (dates plainly, notify ask)",
    !!c && c.body.indexOf(oldIntro(days)) !== -1 &&
      c.subject === OLD_SUBJECT &&
      c.body.indexOf(OLD_CLOSING) !== -1 &&
      c.body.indexOf("exists to run fraud") === -1 &&
      c.body.indexOf("almost immediately") === -1 &&
      c.body.indexOf("fraud infrastructure") === -1 &&
      c.body.indexOf("suspend") === -1,
    c ? c.body.split("\n")[2] : "null complaint");
});
const oldC = analyze.buildRegistrarComplaint(mkA(9616));
ok("complaint: the OLD letter keeps the facts block untouched",
  !!oldC &&
    oldC.body.indexOf("  Domain:         quickloan-deals.com") !== -1 &&
    oldC.body.indexOf("  Registrar:      NameCheap, Inc.") !== -1 &&
    oldC.body.indexOf("  Registered:     " + REG_STAMP) !== -1 &&
    oldC.body.indexOf(
      "  Claimed sender: Promo <promo@quickloan-deals.com>") !== -1 &&
    oldC.body.indexOf("  Subject:        Your loan is ready") !== -1 &&
    oldC.to === "abuse@namecheap.com");

// The interval computed from the dates themselves (no
// freshness on the record): Aug 10 → Nov 8 is exactly 90;
// Aug 9 → Nov 8 is 91.
const c90 = analyze.buildRegistrarComplaint(
  mkDated("2026-08-10T00:00:00Z", "Sun, 8 Nov 2026 12:00:00 +0000"));
ok("complaint: a computed 90-day interval is YOUNG",
  !!c90 && c90.subject === YOUNG_SUBJECT &&
    c90.body.indexOf("90 days later") !== -1 &&
    c90.body.indexOf("almost immediately") !== -1);
const c91 = analyze.buildRegistrarComplaint(
  mkDated("2026-08-09T00:00:00Z", "Sun, 8 Nov 2026 12:00:00 +0000"));
ok("complaint: a computed 91-day interval is OLD",
  !!c91 && c91.subject === OLD_SUBJECT &&
    c91.body.indexOf("91 days later") !== -1 &&
    c91.body.indexOf("long-established") !== -1);

// No registration date: the original letter, no age claim.
const ndA = mkA(0, false);
delete ndA.registrarInfo.registered;
const ndC = analyze.buildRegistrarComplaint(ndA);
ok("complaint: no registration date keeps the original text",
  !!ndC && ndC.subject === YOUNG_SUBJECT &&
    ndC.body.indexOf("I am reporting a domain registered " +
      "through you that exists to run fraud.\n") !== -1 &&
    ndC.body.indexOf("was registered on") === -1 &&
    ndC.body.indexOf(YOUNG_CLOSING) !== -1);

// ---------- buildRegistrarFormEvidence: same gate ----------
function evIntro(days) {
  const ev = analyze.buildRegistrarFormEvidence(mkA(days));
  return ev ? ev.split("\n")[0] : "";
}
ok("evidence: day 1 is YOUNG (original text byte-for-byte)",
  evIntro(1) === "I am reporting a domain registered " +
    "through you that exists to run fraud. " +
    "quickloan-deals.com was registered on " + REG_STAMP +
    ". The message it sent is detailed below; please " +
    "investigate and suspend the domain.",
  evIntro(1));
ok("evidence: day 90 is YOUNG (boundary)",
  evIntro(90).indexOf("exists to run fraud") !== -1 &&
    evIntro(90).indexOf("suspend the domain") !== -1 &&
    evIntro(90).indexOf("long-established") === -1);
ok("evidence: day 91 is OLD (boundary)",
  evIntro(91) === oldIntro(91) +
    " The message it sent is detailed below. Please " +
    "investigate, notify the registrant that their domain " +
    "is being used to send fraud, and take appropriate " +
    "action.",
  evIntro(91));
const ndEv = analyze.buildRegistrarFormEvidence(ndA);
ok("evidence: no registration date keeps the original text",
  typeof ndEv === "string" &&
    ndEv.indexOf("I am reporting a domain registered " +
      "through you that exists to run fraud. The message " +
      "it sent is detailed below; please investigate and " +
      "suspend the domain.") !== -1);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
