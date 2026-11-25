"use strict";
// Public 1.0.72 release (internal build .73) — the
// Received-chain DATE FALLBACK (Michael-approved,
// Nov 8 2026).
//
// The field failure: the July Name form evidence for
// hzxhqz.com (registered 2025-03-25, ~594 days before
// arrival) opened with the YOUNG registrar framing —
// "exists to run fraud", suspension ask — because the
// analysis date came straight from the spammer's Date
// header, "Sun, 4 November 2026 6:33:4 0700", and
// Firefox's Date parser rejects that malformed string
// where Node/V8 accepts it. No parseable date meant
// domainFreshness returned null (young by default) and
// utcStamp echoed the raw garbage into the
// "Date/time received (UTC)" line.
//
// The fix: ONE effective-message-date resolution
// (lib resolveEffectiveDate / effectiveDate), computed
// in analyze() and routed through every consumer that
// presents the message date as a received time or feeds
// it to freshness:
//   1. the Date header, when it parses — verbatim, so
//      normal mail renders byte-identically;
//   2. the first parseable Received stamp, in header
//      order (topmost Received = final delivery hop =
//      the arrival);
//   3. the moment of analysis.
// The verbatim full-headers quote is NOT a consumer:
// it must not change by a byte in any case.

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

ok("manifest version stays 1.0.73", manifest.version === "1.0.87",
  "got " + manifest.version);

// ---------- (a) the specimen shape: garbage Date, real Received ----------
const HEAD_A = [
  "Received: from mail.hzxhqz.example ([196.251.121.165]) by mx.example with ESMTP; Sun, 08 Nov 2026 12:49:02 -0500",
  "Received: from sender.hzxhqz.example by relay.example with SMTP; Sun, 08 Nov 2026 07:15:00 -0500",
  "From: Louis Vuitton <mjfgeiha@hzxhqz.com>",
  "Subject: [Black Friday] Louis Vuitton Handbags Starting at $169",
  "Date: whenever lol not a date",
  "Message-ID: <fpgx3bmq49sj@hzxhqz.com>"
].join("\n");
const RAW_A = HEAD_A + "\n\nLuxury handbags, best prices.\n";
const REG_OLD = "2025-03-25T06:30:39Z";
function withRegistrar(a, registered) {
  a.registrarInfo = {
    registrar: "July Name Limited",
    registrarAbuse: "abuse@julyname.com",
    registered: registered, registrant: null
  };
  return a;
}
const aA = withRegistrar(analyze.analyze(RAW_A), REG_OLD);
const EXPECT_STAMP = "Sun, 08 Nov 2026 12:49:02 -0500";
const EXPECT_DAYS = Math.floor(
  (Date.parse(EXPECT_STAMP) - Date.parse(REG_OLD)) / 86400000);

ok("(a) analyze retains the Received stamps in header order",
  Array.isArray(aA.receivedStamps) && aA.receivedStamps.length === 2 &&
  aA.receivedStamps[0] === EXPECT_STAMP &&
  aA.receivedStamps[1] === "Sun, 08 Nov 2026 07:15:00 -0500",
  JSON.stringify(aA.receivedStamps));
ok("(a) the raw Date header is still the raw Date header",
  aA.date === "whenever lol not a date", aA.date);
ok("(a) effective date is the topmost Received stamp (the arrival)",
  analyze.effectiveDate(aA) === EXPECT_STAMP &&
  aA.effectiveDate === EXPECT_STAMP,
  analyze.effectiveDate(aA));

const evA = analyze.buildRegistrarFormEvidence(aA);
ok("(a) form evidence takes the OLD framing on a 594-day domain",
  typeof evA === "string" &&
  evA.indexOf("The domain is long-established") !== -1 &&
  evA.indexOf("exists to run fraud") === -1);
ok("(a) form evidence received line renders the Received-derived UTC stamp",
  evA.indexOf("Date/time received (UTC): Sun, 08 Nov 2026 17:49:02 UTC") !== -1);
ok("(a) form evidence never echoes the garbage Date header as a fact",
  evA.indexOf("Date/time received (UTC): whenever") === -1);
ok("(e) form evidence full-headers quote is the raw head, byte for byte",
  evA.indexOf("Full headers (plain text, as received):\n" + HEAD_A) !== -1);

const cA = analyze.buildRegistrarComplaint(aA);
ok("(a) registrar letter takes the OLD framing (subject drops the tag)",
  !!cA && cA.subject === "DNS abuse report — hzxhqz.com",
  cA && cA.subject);
ok("(a) registrar letter states the true interval in days",
  !!cA && cA.body.indexOf("arrived " + EXPECT_DAYS + " days later.") !== -1 &&
  cA.body.indexOf("exists to run fraud") === -1);
ok("(a) registrar letter Date received line is the Received stamp",
  !!cA && cA.body.indexOf("  Date received:  " + EXPECT_STAMP) !== -1);
ok("(e) registrar letter headers quote carries the raw Date line verbatim",
  !!cA && cA.body.indexOf("  Date: whenever lol not a date") !== -1);

// First PARSEABLE stamp wins: a garbage topmost stamp is skipped.
const RAW_A2 = [
  "Received: from a.example by b.example with ESMTP; stamp unreadable",
  "Received: from c.example by d.example with SMTP; Sun, 08 Nov 2026 07:15:00 -0500",
  "From: Louis Vuitton <mjfgeiha@hzxhqz.com>",
  "Subject: x",
  "Date: whenever lol not a date"
].join("\n") + "\n\nbody\n";
const aA2 = analyze.analyze(RAW_A2);
ok("(a) an unparseable topmost stamp is skipped for the next parseable one",
  analyze.effectiveDate(aA2) === "Sun, 08 Nov 2026 07:15:00 -0500",
  analyze.effectiveDate(aA2));

// ---------- (b) Date header absent, Received present ----------
const RAW_B = [
  "Received: from mail.hzxhqz.example ([196.251.121.165]) by mx.example with ESMTP; Sun, 08 Nov 2026 12:49:02 -0500",
  "From: Louis Vuitton <mjfgeiha@hzxhqz.com>",
  "Subject: [Black Friday] Louis Vuitton Handbags Starting at $169",
  "Message-ID: <fpgx3bmq49sj@hzxhqz.com>"
].join("\n") + "\n\nLuxury handbags, best prices.\n";
const aB = withRegistrar(analyze.analyze(RAW_B), REG_OLD);
const evB = analyze.buildRegistrarFormEvidence(aB);
const cB = analyze.buildRegistrarComplaint(aB);
ok("(b) no Date header: effective date still lands on the Received stamp",
  analyze.effectiveDate(aB) === EXPECT_STAMP,
  analyze.effectiveDate(aB));
ok("(b) no Date header: old framing + Received-derived received line",
  typeof evB === "string" &&
  evB.indexOf("The domain is long-established") !== -1 &&
  evB.indexOf("Date/time received (UTC): Sun, 08 Nov 2026 17:49:02 UTC") !== -1 &&
  !!cB && cB.subject === "DNS abuse report — hzxhqz.com");

// ---------- (c) neither Date nor Received: the analysis moment ----------
const RAW_C = [
  "From: Promo <promo@quickloan-deals.com>",
  "Subject: Your loan is ready",
  "Message-ID: <c@quickloan-deals.com>"
].join("\n") + "\n\nGreat rates today.\n";
const REG_C = new Date(Date.now() - 100 * 86400000).toISOString();
const aC = withRegistrar(analyze.analyze(RAW_C), REG_C);
const effC = analyze.effectiveDate(aC);
const frC = analyze.domainFreshness(REG_C, effC);
const cC = analyze.buildRegistrarComplaint(aC);
ok("(c) no usable stamp anywhere: effective date is the analysis moment",
  !!effC && !isNaN(new Date(effC).getTime()) &&
  Math.abs(Date.now() - new Date(effC).getTime()) < 60000,
  effC);
ok("(c) today fallback drives OLD framing for a ~100-day-old domain",
  !!frC && frC.daysBefore >= 99 && frC.daysBefore <= 100 &&
  !!cC && cC.subject === "DNS abuse report — quickloan-deals.com" &&
  cC.body.indexOf("arrived " + frC.daysBefore + " days later.") !== -1,
  cC && cC.subject);

// ---------- (d) parseable Date header: byte-identical to pre-fix ----------
// Goldens captured from the pre-fix lib (Nov 8 2026) for a
// hand-built fixture — no stored effectiveDate, no retained
// stamps — in both freshness shapes (preset on the record,
// and computed from the raw dates by the builders).
const GOLD = {
 "complaint5": {
  "subject": "DNS abuse report — quickloan-deals.com (fraud infrastructure)",
  "body": "Hello Registrar Abuse Team,\n\nI am reporting a domain registered through you that exists to run fraud. quickloan-deals.com was registered on Wed, 06 May 2026 00:00:00 UTC and the fraud message below arrived 5 days later — the domain went from registration to fraud almost immediately.\n\n  Domain:         quickloan-deals.com\n  Registrar:      NameCheap, Inc.\n  Registered:     Wed, 06 May 2026 00:00:00 UTC\n  Claimed sender: Promo <promo@quickloan-deals.com>\n  Subject:        Your loan is ready\n  Date received:  Tue, 3 Nov 2026 09:00:00 +0000\n\nFull headers (plain text, as received):\n  From: Promo <promo@quickloan-deals.com>\n  Date: Tue, 3 Nov 2026 09:00:00 +0000\n  Subject: Your loan is ready\n\nMessage body (plain text, links defanged so spam filters don't eat this report — read hxxps as https and [.] as .):\n  Great rates today.\n\nSpam used as a delivery mechanism for fraud and phishing is DNS Abuse under ICANN's definition, and this domain is fraud infrastructure, not a legitimate registration. Please investigate and suspend the domain. Thank you."
 },
 "evidence5": "I am reporting a domain registered through you that exists to run fraud. quickloan-deals.com was registered on Wed, 06 May 2026 00:00:00 UTC. The message it sent is detailed below; please investigate and suspend the domain.\n\nDomain: quickloan-deals.com\nRegistrar: NameCheap, Inc.\nRegistered: Wed, 06 May 2026 00:00:00 UTC\nFrom: Promo <promo@quickloan-deals.com>\nSubject: Your loan is ready\nDate/time received (UTC): Tue, 03 Nov 2026 09:00:00 UTC\nSending IP: 203.0.113.9\n\nFull headers (plain text, as received):\nFrom: Promo <promo@quickloan-deals.com>\nDate: Tue, 3 Nov 2026 09:00:00 +0000\nSubject: Your loan is ready",
 "complaintRaw5": {
  "subject": "DNS abuse report — quickloan-deals.com",
  "body": "Hello Registrar Abuse Team,\n\nI am reporting fraud sent using a domain registered through you. quickloan-deals.com was registered on Wed, 06 May 2026 00:00:00 UTC and the fraud message below arrived 181 days later. The domain is long-established, so this points to a compromise or spoofing rather than a throwaway registration; the headers below are the evidence.\n\n  Domain:         quickloan-deals.com\n  Registrar:      NameCheap, Inc.\n  Registered:     Wed, 06 May 2026 00:00:00 UTC\n  Claimed sender: Promo <promo@quickloan-deals.com>\n  Subject:        Your loan is ready\n  Date received:  Tue, 3 Nov 2026 09:00:00 +0000\n\nFull headers (plain text, as received):\n  From: Promo <promo@quickloan-deals.com>\n  Date: Tue, 3 Nov 2026 09:00:00 +0000\n  Subject: Your loan is ready\n\nMessage body (plain text, links defanged so spam filters don't eat this report — read hxxps as https and [.] as .):\n  Great rates today.\n\nPlease investigate, notify the registrant that their domain is being used to send fraud, and take appropriate action. Thank you."
 },
 "evidenceRaw5": "I am reporting fraud sent using a domain registered through you. quickloan-deals.com was registered on Wed, 06 May 2026 00:00:00 UTC and the fraud message below arrived 181 days later. The domain is long-established, so this points to a compromise or spoofing rather than a throwaway registration; the headers below are the evidence. The message it sent is detailed below. Please investigate, notify the registrant that their domain is being used to send fraud, and take appropriate action.\n\nDomain: quickloan-deals.com\nRegistrar: NameCheap, Inc.\nRegistered: Wed, 06 May 2026 00:00:00 UTC\nFrom: Promo <promo@quickloan-deals.com>\nSubject: Your loan is ready\nDate/time received (UTC): Tue, 03 Nov 2026 09:00:00 UTC\nSending IP: 203.0.113.9\n\nFull headers (plain text, as received):\nFrom: Promo <promo@quickloan-deals.com>\nDate: Tue, 3 Nov 2026 09:00:00 +0000\nSubject: Your loan is ready",
 "complaint200": {
  "subject": "DNS abuse report — quickloan-deals.com",
  "body": "Hello Registrar Abuse Team,\n\nI am reporting fraud sent using a domain registered through you. quickloan-deals.com was registered on Wed, 06 May 2026 00:00:00 UTC and the fraud message below arrived 200 days later. The domain is long-established, so this points to a compromise or spoofing rather than a throwaway registration; the headers below are the evidence.\n\n  Domain:         quickloan-deals.com\n  Registrar:      NameCheap, Inc.\n  Registered:     Wed, 06 May 2026 00:00:00 UTC\n  Claimed sender: Promo <promo@quickloan-deals.com>\n  Subject:        Your loan is ready\n  Date received:  Tue, 3 Nov 2026 09:00:00 +0000\n\nFull headers (plain text, as received):\n  From: Promo <promo@quickloan-deals.com>\n  Date: Tue, 3 Nov 2026 09:00:00 +0000\n  Subject: Your loan is ready\n\nMessage body (plain text, links defanged so spam filters don't eat this report — read hxxps as https and [.] as .):\n  Great rates today.\n\nPlease investigate, notify the registrant that their domain is being used to send fraud, and take appropriate action. Thank you."
 },
 "evidence200": "I am reporting fraud sent using a domain registered through you. quickloan-deals.com was registered on Wed, 06 May 2026 00:00:00 UTC and the fraud message below arrived 200 days later. The domain is long-established, so this points to a compromise or spoofing rather than a throwaway registration; the headers below are the evidence. The message it sent is detailed below. Please investigate, notify the registrant that their domain is being used to send fraud, and take appropriate action.\n\nDomain: quickloan-deals.com\nRegistrar: NameCheap, Inc.\nRegistered: Wed, 06 May 2026 00:00:00 UTC\nFrom: Promo <promo@quickloan-deals.com>\nSubject: Your loan is ready\nDate/time received (UTC): Tue, 03 Nov 2026 09:00:00 UTC\nSending IP: 203.0.113.9\n\nFull headers (plain text, as received):\nFrom: Promo <promo@quickloan-deals.com>\nDate: Tue, 3 Nov 2026 09:00:00 +0000\nSubject: Your loan is ready",
 "complaintRaw200": {
  "subject": "DNS abuse report — quickloan-deals.com",
  "body": "Hello Registrar Abuse Team,\n\nI am reporting fraud sent using a domain registered through you. quickloan-deals.com was registered on Wed, 06 May 2026 00:00:00 UTC and the fraud message below arrived 181 days later. The domain is long-established, so this points to a compromise or spoofing rather than a throwaway registration; the headers below are the evidence.\n\n  Domain:         quickloan-deals.com\n  Registrar:      NameCheap, Inc.\n  Registered:     Wed, 06 May 2026 00:00:00 UTC\n  Claimed sender: Promo <promo@quickloan-deals.com>\n  Subject:        Your loan is ready\n  Date received:  Tue, 3 Nov 2026 09:00:00 +0000\n\nFull headers (plain text, as received):\n  From: Promo <promo@quickloan-deals.com>\n  Date: Tue, 3 Nov 2026 09:00:00 +0000\n  Subject: Your loan is ready\n\nMessage body (plain text, links defanged so spam filters don't eat this report — read hxxps as https and [.] as .):\n  Great rates today.\n\nPlease investigate, notify the registrant that their domain is being used to send fraud, and take appropriate action. Thank you."
 },
 "evidenceRaw200": "I am reporting fraud sent using a domain registered through you. quickloan-deals.com was registered on Wed, 06 May 2026 00:00:00 UTC and the fraud message below arrived 181 days later. The domain is long-established, so this points to a compromise or spoofing rather than a throwaway registration; the headers below are the evidence. The message it sent is detailed below. Please investigate, notify the registrant that their domain is being used to send fraud, and take appropriate action.\n\nDomain: quickloan-deals.com\nRegistrar: NameCheap, Inc.\nRegistered: Wed, 06 May 2026 00:00:00 UTC\nFrom: Promo <promo@quickloan-deals.com>\nSubject: Your loan is ready\nDate/time received (UTC): Tue, 03 Nov 2026 09:00:00 UTC\nSending IP: 203.0.113.9\n\nFull headers (plain text, as received):\nFrom: Promo <promo@quickloan-deals.com>\nDate: Tue, 3 Nov 2026 09:00:00 +0000\nSubject: Your loan is ready"
}
;
function mkFixture(daysBefore, withFreshness) {
  const a = {
    from: "Promo <promo@quickloan-deals.com>",
    subject: "Your loan is ready",
    date: "Tue, 3 Nov 2026 09:00:00 +0000",
    senderDomain: "quickloan-deals.com",
    urls: [],
    ip: "203.0.113.9",
    fullHeaders: "From: Promo <promo@quickloan-deals.com>\nDate: Tue, 3 Nov 2026 09:00:00 +0000\nSubject: Your loan is ready",
    bodyText: "Great rates today.",
    registrarInfo: {
      registrar: "NameCheap, Inc.",
      registrarAbuse: "abuse@namecheap.com",
      registered: "2026-05-06T00:00:00Z",
      registrant: null
    }
  };
  if (withFreshness) {
    a.registrarInfo.freshness =
      { daysBefore: daysBefore, fresh: daysBefore <= 30 };
  }
  return a;
}
[[5, true, "complaint5", "evidence5"],
 [200, true, "complaint200", "evidence200"],
 [5, false, "complaintRaw5", "evidenceRaw5"],
 [200, false, "complaintRaw200", "evidenceRaw200"]].forEach(function (row) {
  const a = mkFixture(row[0], row[1]);
  const c = analyze.buildRegistrarComplaint(a);
  const ev = analyze.buildRegistrarFormEvidence(a);
  ok("(d) registrar letter byte-identical to pre-fix (" + row[2] + ")",
    !!c && c.subject === GOLD[row[2]].subject && c.body === GOLD[row[2]].body);
  ok("(d) form evidence byte-identical to pre-fix (" + row[3] + ")",
    ev === GOLD[row[3]]);
});

// Through analyze(): a parseable Date header WINS over the
// Received chain — the stamps are only a fallback.
const RAW_D = [
  "Received: from mail.example by mx.example with ESMTP; Sun, 08 Nov 2026 12:49:02 -0500",
  "From: Promo <promo@quickloan-deals.com>",
  "Subject: Your loan is ready",
  "Date: Tue, 3 Nov 2026 09:00:00 +0000"
].join("\n") + "\n\nGreat rates today.\n";
const aD = analyze.analyze(RAW_D);
ok("(d) through analyze(), the Date header is the effective date verbatim",
  analyze.effectiveDate(aD) === "Tue, 3 Nov 2026 09:00:00 +0000",
  analyze.effectiveDate(aD));

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
