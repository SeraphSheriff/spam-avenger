// Spam Avenger v1.0.68 — Microsoft-case details fixes, from
// Michael's live test of v1.0.67 on the Jessica Huber message
// (Nov 2 2026). Three changes, all scoped to the Microsoft
// tenant-account case (origin = Outlook protection pool +
// SPF/DKIM/DMARC all pass); everything else is untouched:
//
//  1. The details panel's "makeup" note flips: for a real
//     account the From address IS the face and the IP is just
//     Microsoft's shared mail truck. The flipped note names
//     the sender account (lib: msDetailsNote).
//  2. The details "Abuse contact" row shows the phishing
//     desk the Report Abuse lane now targets
//     (phish@office365.microsoft.com), not the pool IP's
//     RDAP contact.
//  3. Michael's "no website" tell: in the MS case only,
//     investigate() checks A/AAAA for the sender domain apex
//     and its www host via dns.google (existing permission).
//     ONLY a confirmed-empty result (every query answered,
//     no Answer anywhere) sets a.senderDomainNoWebsite,
//     which adds one sentence to the panel note and one line
//     to the account-report body. Any record, any error, any
//     uncertainty: silence.
//
// Run: node tests/test-v1068-ms-details-note.js
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const contentSrc = fs.readFileSync(path.join(ROOT, "content.js"), "utf8");
const analyzeSrc = fs.readFileSync(
  path.join(ROOT, "lib", "analyze.js"), "utf8");
const analyze = require(path.join(ROOT, "lib", "analyze.js"));
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); }
}

// ---------- manifest ----------
ok("manifest version is 1.0.70", manifest.version === "1.0.70",
  "got " + manifest.version);
ok("permissions unchanged: storage only",
  JSON.stringify(manifest.permissions) === JSON.stringify(["storage"]));
ok("no new host permissions (dns.google already there)",
  Array.isArray(manifest.host_permissions) &&
  manifest.host_permissions.length === 11 &&
  manifest.host_permissions.indexOf("https://dns.google/*") !== -1);

// ---------- fixtures (same shapes as the v1067 suite) ----------
const MS_RAW = [
  "Return-Path: <jessica.h@lumeracrescent.co>",
  "Received: from mail-centralusazon11021138.outbound.protection.outlook.com ([52.101.62.138]:2623 helo=DM5PR21CU001.outbound.protection.outlook.com)",
  "\tby ben.ace-host.net with esmtps id 1xO2AG-0001 for <mjf@colorami.com>;",
  "\tMon, 02 Nov 2026 19:14:14 -0500",
  "ARC-Authentication-Results: i=1; mx.microsoft.com 1; spf=pass",
  " smtp.mailfrom=lumeracrescent.co; dmarc=pass action=none",
  " header.from=lumeracrescent.co; dkim=pass header.d=lumeracrescent.co; arc=none",
  "DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed; d=lumeracrescent.co;",
  " s=selector1; b=DEADBEEFCAFEBABE0123456789==",
  "Authentication-Results: mx.microsoft.com 1; dkim=none (message not signed)",
  " header.d=none;dmarc=none action=none header.from=lumeracrescent.co;",
  "From: Jessica Huber <jessica.h@lumeracrescent.co>",
  "To: mjf@colorami.com",
  "Subject: re: Franktown Firearms",
  "Message-ID: <01a19ec0-8b2d-7db9-aa71-cbd19fd0db3c@lumeracrescent.co>",
  "Date: Tue, 03 Nov 2026 00:13:01 +0000",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Hello, please review the attached offer at https://bait.example.com/offer today."
].join("\n");

// Same case, different sender domain (keeps the domain-website
// cache from leaking between the investigate scenarios below).
const MS_FAIL_RAW = MS_RAW.split("lumeracrescent.co").join("failmail.example")
  .replace("jessica.h@", "huber@");

const NORMAL_RAW = [
  "Received: from mail.spammy.example ([203.0.113.9]) by mx.example with smtp",
  "Authentication-Results: mx.example; spf=none smtp.mailfrom=spammy.example",
  "From: Deals <deals@spammy.example>",
  "Subject: You won",
  "Message-ID: <win@spammy.example>",
  "Date: Wed, 28 Oct 2026 00:00:00 +0000",
  "",
  "Claim at https://spammy.example/win"
].join("\n");

// ---------- 1. the flipped note (lib wording) ----------
const msA = analyze.analyze(MS_RAW);
const BASE_NOTE = "No makeup this time: jessica.h@lumeracrescent.co " +
  "is the face. The IP is just Microsoft's shared mail truck.";
ok("note: MS case gets the flipped note naming the account",
  analyze.msDetailsNote(msA) === BASE_NOTE,
  JSON.stringify(analyze.msDetailsNote(msA)));
const msWeb = Object.assign({}, msA, { senderDomainNoWebsite: true });
ok("note: confirmed no-website adds the domain sentence",
  analyze.msDetailsNote(msWeb) === BASE_NOTE +
    " lumeracrescent.co doesn't even run a website. " +
    "It exists only to send mail.",
  JSON.stringify(analyze.msDetailsNote(msWeb)));
const msNoFlag = Object.assign({}, msA, { senderDomainNoWebsite: false });
ok("note: flag unset/false keeps the base flipped note only",
  analyze.msDetailsNote(msNoFlag) === BASE_NOTE);
const normalA = analyze.analyze(NORMAL_RAW);
ok("note: normal sender gets NO flipped note (old line stands)",
  analyze.msDetailsNote(normalA) === null);
ok("note: null/garbage input returns null",
  analyze.msDetailsNote(null) === null &&
  analyze.msDetailsNote({}) === null);

// ---------- 3a. the tell in the complaint body ----------
const bodyWith = analyze.buildComplaint(msWeb);
ok("body: confirmed no-website adds the Website line",
  !!bodyWith && bodyWith.body.indexOf(
    "lumeracrescent.co has no website (no A or AAAA records for " +
    "the domain or www.lumeracrescent.co). It exists only to " +
    "send mail.") !== -1,
  bodyWith && bodyWith.body.slice(0, 400));
const bodyWithout = analyze.buildComplaint(msA);
ok("body: no flag, no Website line (silence on uncertainty)",
  !!bodyWithout && bodyWithout.body.indexOf("has no website") === -1 &&
  bodyWithout.body.indexOf("Website:") === -1);
const bodyNormal = analyze.buildComplaint(
  Object.assign({}, normalA, { abuse: "abuse@spammy.example",
    senderDomainNoWebsite: true }));
ok("body: flag alone never leaks the tell into a host complaint",
  !!bodyNormal && bodyNormal.body.indexOf("has no website") === -1 &&
  bodyNormal.to === "abuse@spammy.example");

// ---------- panel wiring (source pins) ----------
ok("panel: abuse contact row switches to the phishing desk in the MS case",
  contentSrc.indexOf(
    'a.msAccountReport ? "phish@office365.microsoft.com"') !== -1 &&
  contentSrc.indexOf('mkRow("Abuse contact"') !== -1);
ok("panel: non-MS abuse contact still falls back to RDAP / not published",
  contentSrc.indexOf(': (a.abuse || "not published")') !== -1 ||
  contentSrc.indexOf('(a.abuse || "not published")') !== -1);
ok("panel: details note comes from the lib's flipped note in the MS case",
  contentSrc.indexOf("window.SpamAvenger.msDetailsNote") !== -1 &&
  contentSrc.indexOf("detailNote ||") !== -1);
ok("panel: the original makeup line still stands for normal senders",
  contentSrc.indexOf(
    "address is makeup. The IP is the face underneath.") !== -1);
ok("lib: flipped wording lives in msDetailsNote",
  analyzeSrc.indexOf("No makeup this time: ") !== -1 &&
  analyzeSrc.indexOf("shared mail truck") !== -1 &&
  analyzeSrc.indexOf("doesn't even run a website") !== -1);
ok("desk constant: exported and matches the lane target",
  analyze.MS_PHISH_DESK === "phish@office365.microsoft.com" &&
  bodyWith.to === analyze.MS_PHISH_DESK);

// ---------- 3b. domainNoWebsite verdicts (stubbed DNS) ----------
function dnsStub(table, defaultPayload) {
  return function (url) {
    const u = new URL(url);
    const name = u.searchParams.get("name");
    const type = u.searchParams.get("type");
    const key = name + "/" + type;
    const payload = Object.prototype.hasOwnProperty.call(table, key)
      ? table[key] : defaultPayload;
    if (payload === "REJECT") return Promise.reject(new Error("boom"));
    return Promise.resolve({
      ok: true, json: function () { return Promise.resolve(payload); }
    });
  };
}
const EMPTY = { Status: 0 };                       // NOERROR, no Answer
const NXD = { Status: 3 };                         // NXDOMAIN
const A_REC = { Status: 0, Answer: [{ name: "x", type: 1, TTL: 300, data: "192.0.2.1" }] };
const AAAA_REC = { Status: 0, Answer: [{ name: "x", type: 28, TTL: 300, data: "2001:db8::1" }] };
const SERVFAIL = { Status: 2 };

async function run() {
  global.fetch = dnsStub({}, EMPTY);
  ok("dns: all four queries NOERROR-empty confirms no website",
    await analyze.domainNoWebsite("nodata.example") === true);

  global.fetch = dnsStub({}, NXD);
  ok("dns: NXDOMAIN everywhere also confirms no website",
    await analyze.domainNoWebsite("nxd.example") === true);

  global.fetch = dnsStub({ "hasa.example/A": A_REC }, EMPTY);
  ok("dns: an apex A record means it has web DNS (no tell)",
    await analyze.domainNoWebsite("hasa.example") === false);

  global.fetch = dnsStub({ "wwwonly.example/AAAA": AAAA_REC }, EMPTY);
  ok("dns: a www-only AAAA record also defeats the tell",
    await analyze.domainNoWebsite("wwwonly.example") === false);

  global.fetch = dnsStub({ "servfail.example/AAAA": SERVFAIL }, EMPTY);
  ok("dns: one SERVFAIL among empties = uncertainty, stay silent",
    await analyze.domainNoWebsite("servfail.example") === null);

  global.fetch = dnsStub({}, "REJECT");
  ok("dns: fetch failures = uncertainty, stay silent",
    await analyze.domainNoWebsite("boom.example") === null);

  ok("dns: garbage domain is uncertainty, not a tell",
    await analyze.domainNoWebsite("") === null &&
    await analyze.domainNoWebsite("nodot") === null);

  // ---------- 3c. investigate() end to end ----------
  // Scenario A: DNS works, sender domain answers empty everywhere.
  const queried = [];
  global.fetch = function (url) {
    if (url.indexOf("rdap") !== -1) {
      return Promise.resolve({ ok: false,
        json: function () { return Promise.resolve({}); } });
    }
    const u = new URL(url);
    const name = u.searchParams.get("name");
    const type = u.searchParams.get("type");
    queried.push(name + "/" + type);
    if (type === "PTR") {
      return Promise.resolve({ ok: true, json: function () {
        return Promise.resolve({ Status: 0, Answer: [{ type: 12,
          data: "mail-centralusazon11021138.outbound.protection.outlook.com." }] });
      } });
    }
    return Promise.resolve({ ok: true, json: function () {
      return Promise.resolve(EMPTY);
    } });
  };
  const invA = await analyze.investigate(MS_RAW);
  ok("investigate: MS case confirmed the no-website tell",
    invA.senderDomainNoWebsite === true);
  ok("investigate: it asked A+AAAA for apex and www",
    queried.indexOf("lumeracrescent.co/A") !== -1 &&
    queried.indexOf("lumeracrescent.co/AAAA") !== -1 &&
    queried.indexOf("www.lumeracrescent.co/A") !== -1 &&
    queried.indexOf("www.lumeracrescent.co/AAAA") !== -1,
    queried.join(","));
  ok("investigate: complaint is the account report WITH the tell",
    !!invA.complaint &&
    invA.complaint.to === "phish@office365.microsoft.com" &&
    invA.complaint.body.indexOf("has no website") !== -1);
  ok("investigate: panel note for the real case carries both sentences",
    analyze.msDetailsNote(invA) === BASE_NOTE +
      " lumeracrescent.co doesn't even run a website. " +
      "It exists only to send mail.");

  // Scenario B: every DNS call fails — the pipeline still
  // completes, the account report still builds, and the tell
  // is nowhere.
  global.fetch = function (url) {
    if (url.indexOf("rdap") !== -1) {
      return Promise.resolve({ ok: false,
        json: function () { return Promise.resolve({}); } });
    }
    return Promise.reject(new Error("dns down"));
  };
  const invB = await analyze.investigate(MS_FAIL_RAW);
  ok("investigate: DNS failure never breaks the pipeline",
    invB.stage === "done" && !!invB.complaint);
  ok("investigate: DNS failure leaves the tell unset and unasserted",
    invB.senderDomainNoWebsite === false &&
    invB.complaint.body.indexOf("has no website") === -1 &&
    invB.complaint.to === "phish@office365.microsoft.com");
  ok("investigate: flipped note still shows, without the domain sentence",
    analyze.msDetailsNote(invB) ===
      "No makeup this time: jessica.h@failmail.example is the face. " +
      "The IP is just Microsoft's shared mail truck.",
    JSON.stringify(analyze.msDetailsNote(invB)));

  // Scenario C: a normal sender — the website check never runs.
  queried.length = 0;
  global.fetch = function (url) {
    if (url.indexOf("rdap") !== -1) {
      return Promise.resolve({ ok: false,
        json: function () { return Promise.resolve({}); } });
    }
    const u = new URL(url);
    queried.push(u.searchParams.get("name") + "/" +
      u.searchParams.get("type"));
    return Promise.resolve({ ok: true, json: function () {
      return Promise.resolve(EMPTY);
    } });
  };
  const invC = await analyze.investigate(NORMAL_RAW);
  ok("investigate: normal sender never triggers the website check",
    !invC.senderDomainNoWebsite &&
    queried.indexOf("spammy.example/A") === -1 &&
    queried.indexOf("www.spammy.example/A") === -1,
    queried.join(","));

  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
}

run().catch(function (e) {
  console.log("  FAIL async suite crashed — " + (e && e.stack || e));
  console.log("\n" + pass + " passed, " + (fail + 1) + " failed");
  process.exit(1);
});
