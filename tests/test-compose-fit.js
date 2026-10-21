// Spam Avenger v1.0.59 — header-trim + compose-fit tests
// (v1.0.59 adds the 8,200-char cliff regression at the bottom).
// Run: node tests/test-compose-fit.js
"use strict";
const fs = require("fs");
const path = require("path");
const A = require("../lib/analyze.js");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); }
}

// ---------- trimHeaders ----------
const rawHeaders = [
  "Delivered-To: spamdodger@gmail.com",
  "ARC-Seal: i=1; a=rsa-sha256; t=1792393823; cv=none;",
  "        d=google.com; s=arc-20260327;",
  "        b=QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWV09PT0=",
  "ARC-Message-Signature: i=1; a=rsa-sha256; c=relaxed/relaxed;",
  "        d=google.com; s=arc-20260327;",
  "        b=QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWV09PT0=",
  "ARC-Authentication-Results: i=1; mx.google.com;",
  "        dkim=pass header.i=@example.com;",
  "        spf=pass (google.com: domain of x@example.com designates 1.2.3.4)",
  "Authentication-Results: mx.google.com;",
  "        dkim=pass header.i=@example.com header.s=mail;",
  "        spf=pass smtp.mailfrom=x@example.com",
  "Return-Path: <x@example.com>",
  "Received: from mail.example.com (mail.example.com. [1.2.3.4])",
  "        by mx.google.com with ESMTPS id abc123",
  "        for <spamdodger@gmail.com>;",
  "        Mon, 19 Oct 2026 00:10:23 -0700 (PDT)",
  "DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed;",
  "        d=example.com; s=mail;",
  "        b=QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWV09PT0=",
  "DomainKey-Signature: a=rsa-sha1; c=nofws; q=dns; s=mail;",
  "        b=QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWV09PT0=;",
  "From: Spammer <x@example.com>",
  "Subject: Your Cloud ID has been locked",
  "Message-ID: <abc@example.com>",
  "Date: Mon, 19 Oct 2026 02:24:28 +0000"
].join("\n");

const th = A.trimHeaders(rawHeaders);
ok("trimHeaders flags stripped", th.stripped === true);
ok("no ARC-Seal line survives", !/ARC-Seal:/.test(th.text));
ok("no ARC-Message-Signature survives", !/ARC-Message-Signature:/.test(th.text));
ok("no DKIM-Signature survives", !/DKIM-Signature:/.test(th.text));
ok("no DomainKey-Signature survives", !/DomainKey-Signature:/.test(th.text));
ok("signature blob gone", th.text.indexOf("QUJDREVGR0hJ") === -1);
ok("Received kept, folded lines kept",
  /Received: from mail\.example\.com/.test(th.text) &&
  /by mx\.google\.com with ESMTPS/.test(th.text));
ok("Authentication-Results kept", /Authentication-Results: mx\.google\.com/.test(th.text));
ok("ARC-Authentication-Results kept (verdict, not a signature)",
  /ARC-Authentication-Results:/.test(th.text));
ok("From/Subject/Message-ID kept",
  /From: Spammer/.test(th.text) && /Subject: Your Cloud ID/.test(th.text) &&
  /Message-ID: <abc@example\.com>/.test(th.text));

const clean = A.trimHeaders("From: a@b.c\nSubject: hi");
ok("clean headers: stripped=false", clean.stripped === false);
ok("clean headers unchanged", clean.text === "From: a@b.c\nSubject: hi");

// ---------- buildComplaint ----------
function mkAnalysis(over) {
  const a = {
    ip: "141.11.18.118", abuse: "report@abuseradar.com",
    host: "dfusion.toms.com", from: "spamdodger <alert@vebho.example>",
    subject: "Your Cloud ID has been locked",
    date: "Mon, 19 Oct 2026 02:24:28 +0000",
    urls: ["https://storage.googleapis.com/strow/strw_v2.html#?act=cl&pid=32452"],
    fullHeaders: rawHeaders,
    bodyText: "We couldn't renew your cloud storage subscription. " +
      "Visit https://storage.googleapis.com/strow/strw_v2.html to update billing."
  };
  Object.assign(a, over || {});
  return a;
}
const SIG_LINE = /^\s+(ARC-Seal|ARC-Message-Signature|DKIM-Signature|DomainKey-Signature):/im;

const c = A.buildComplaint(mkAnalysis());
ok("complaint built", !!c);
ok("complaint has no signature header lines", !SIG_LINE.test(c.body));
ok("complaint notes the omission", c.body.indexOf("signature blocks omitted") !== -1);
ok("complaint keeps Received chain", c.body.indexOf("Received: from mail.example.com") !== -1);
ok("links defanged, path intact",
  c.body.indexOf("hxxps://storage[.]googleapis[.]com/strow/strw_v2.html#?act=cl&pid=32452") !== -1);
ok("body excerpt present", c.body.indexOf("Message body (plain text") !== -1);

// ---------- fitForCompose ----------
const planSmall = A.fitForCompose(0, mkAnalysis());
ok("small complaint: direct mode", planSmall.mode === "direct", planSmall.mode);
ok("small complaint: url within budget",
  planSmall.url.length <= A.COMPOSE_URL_BUDGET, String(planSmall.url.length));

const bigBody = "Your cloud storage is full. ".repeat(900); // ~25k chars
const bigHeaders = rawHeaders + "\nX-Custom-Bulk: " + "z".repeat(30000);
const aBig = mkAnalysis({ fullHeaders: bigHeaders, bodyText: bigBody });
const planBig = A.fitForCompose(0, aBig);
ok("monster complaint: url within budget",
  planBig.url.length <= A.COMPOSE_URL_BUDGET,
  planBig.mode + " len=" + planBig.url.length);
ok("monster complaint: shrunk or paste (not direct)",
  planBig.mode === "shrunk" || planBig.mode === "paste", planBig.mode);
if (planBig.mode === "paste") {
  ok("paste mode: url carries the paste instruction",
    planBig.url.indexOf(encodeURIComponent("copied it to your clipboard")) !== -1);
  ok("paste mode: complaint is the unshrunk build",
    planBig.complaint.body === A.buildComplaint(aBig).body);
}
if (planBig.mode === "shrunk") {
  ok("shrunk complaint keeps the defanged links",
    planBig.complaint.body.indexOf("hxxps://storage[.]googleapis[.]com") !== -1);
}

const aMid = mkAnalysis({ bodyText: "padding ".repeat(500) }); // 4000 chars
const planMid = A.fitForCompose(0, aMid);
ok("mid complaint: url within budget",
  planMid.url.length <= A.COMPOSE_URL_BUDGET,
  planMid.mode + " len=" + planMid.url.length);

// ---------- real fixture end-to-end ----------
const fixture = fs.readFileSync(
  path.join(__dirname, "..", "..", "test-samples", "storage-phish-2026-10-17.eml"), "utf8");
const fa = A.analyze(fixture);
fa.abuse = "abuse@example.com"; // RDAP normally supplies this in investigate()
const fc = A.buildComplaint(fa);
ok("fixture: complaint built", !!fc);
if (fc) {
  ok("fixture: no signature header lines in complaint", !SIG_LINE.test(fc.body));
  ok("fixture: full-headers section present",
    fc.body.indexOf("Full headers (plain text, as received):") !== -1);
  const fplan = A.fitForCompose(0, fa);
  ok("fixture: compose url within budget",
    fplan.url.length <= A.COMPOSE_URL_BUDGET,
    fplan.mode + " len=" + fplan.url.length);
  console.log("       fixture complaint chars=" + fc.body.length +
    ", compose mode=" + fplan.mode + ", url chars=" + fplan.url.length);
}

// ---------- regressions ----------
ok("defangUrl unchanged",
  A.defangUrl("https://storage.googleapis.com/a.b/c?x=1") ===
  "hxxps://storage[.]googleapis[.]com/a.b/c?x=1");
ok("defangText unchanged",
  A.defangText("go http://evil.example.com/x now") ===
  "go hxxp://evil[.]example[.]com/x now");
ok("buildComplaint null without abuse contact",
  A.buildComplaint({ ip: "1.2.3.4" }) === null);
ok("buildComplaint null when skipped",
  A.buildComplaint({ ip: "1.2.3.4", abuse: "a@b.c", skipComplaint: true }) === null);

// ---------- v1.0.61: placeholder reverse DNS ----------
// Field case, Oct 20 2026: the Anthem Blue Cross EFT phish was sent from
// 103.244.33.253 (abuse: ipadmin@ishanitech.biz), whose PTR record is
// the literal placeholder "undefined.hostname.localhost". v1.0.60
// printed it verbatim on the complaint's Server name line, making the
// complaint itself look buggy. Placeholder hostnames now print as
// "no valid reverse DNS record"; real hostnames are untouched.
const aAnthem = mkAnalysis({
  ip: "103.244.33.253", abuse: "ipadmin@ishanitech.biz",
  host: "undefined.hostname.localhost",
  from: "\"Anthem Blue Cross\" colorami.com - Eft Settlement <dse_NA4_mjf@secure.net>",
  subject: "You've received an encrypted message from Anthem Blue Cross EFT Settlement",
  date: "21 Oct 2026 02:15:21 +0530",
  urls: ["https://_wildcard_.freouaoniondocuindustrials.com/a/aa/HDFVDNFMVISDKDLLDORHFBSEFDNV423SOEU/DQOEILSDGSFJXSDGEOWHQNNNAQUEWGXIAPOWPFI/index.php"],
  fullHeaders: "", bodyText: ""
});
const cAnthem = A.buildComplaint(aAnthem);
ok("anthem fixture: complaint built", !!cAnthem);
ok("anthem fixture: placeholder PTR prints as no valid reverse DNS record",
  cAnthem.body.indexOf("  Server name:    no valid reverse DNS record") !== -1);
ok("anthem fixture: junk hostname nowhere in complaint",
  cAnthem.body.indexOf("undefined.hostname.localhost") === -1);
ok("displayHost: 'unknown' (no PTR answer) collapses",
  A.displayHost("unknown") === "no valid reverse DNS record");
ok("displayHost: bare localhost collapses",
  A.displayHost("localhost") === "no valid reverse DNS record");
ok("displayHost: trailing-dot placeholder collapses",
  A.displayHost("undefined.hostname.localhost.") === "no valid reverse DNS record");
ok("displayHost: empty collapses",
  A.displayHost("") === "no valid reverse DNS record");
ok("displayHost: real hostname passes through",
  A.displayHost("dfusion.toms.com") === "dfusion.toms.com");
ok("complaint keeps a real server name verbatim",
  A.buildComplaint(mkAnalysis()).body.indexOf("  Server name:    dfusion.toms.com") !== -1);

// ---------- v1.0.59: the 8,200-char cliff (Defect 1 regression) ----------
// Field failure, Oct 20 2026: an iCloud phish (82.152.197.57) whose
// v1.0.58 plan landed at an 8,997-char compose URL — inside the old
// 10,000 budget — and Gmail still answered "Error 400". Probing
// mail.google.com with content-free URLs found the real limit: an
// absolute URL of 8,200 chars is accepted, 8,201 is a 400. This
// fixture rebuilds that message's measured shape (header block
// ~5.6k pre-trim / ~3.1k post-trim, body ~7.7k, a fragment-bearing
// googleapis link, styled-Unicode From, emoji Subject) and pins
// the behavior the fix must hold.
ok("budget is 8000, under the measured 8200 cliff",
  A.COMPOSE_URL_BUDGET === 8000 && A.COMPOSE_URL_BUDGET <= 8200);

const recvLines = [];
for (let ri = 0; ri < 18; ri++) {
  recvLines.push("Received: from mx" + ri + ".relay.example (mx" + ri +
    ".relay.example. [10.1.0." + ri + "]) by mx.google.com with ESMTPS id ffacd" + ri +
    " for <spamdodger@gmail.com>; Tue, 20 Oct 2026 12:40:1" + (ri % 10) + " -0700 (PDT)");
}
const cliffHeaders = [
  "Delivered-To: spamdodger@gmail.com",
  "ARC-Seal: i=1; a=rsa-sha256; t=1792525337; cv=none;",
  "        d=google.com; s=arc-20260327;",
  "        b=" + "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVp".repeat(9),
  "DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed;",
  "        d=ttqfy.sxv; s=mail;",
  "        b=" + "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVp".repeat(9)
].concat(recvLines, [
  "From: \uD835\uDDE3ayment_Declined <alert-347-860450@ttqfy.sxv>",
  "Subject: We've blocked your account! \uD83D\uDEAB Your photos and videos will be deleted",
  "Message-ID: <cliff@example.com>",
  "Date: Tue, 20 Oct 2026 12:42:17 -0700"
]).join("\n");

const aCliff = mkAnalysis({
  ip: "82.152.197.57", abuse: "report@abuseradar.com",
  host: "dfusion.toms.com",
  from: "\uD835\uDDE3ayment_Declined <alert-347-860450@ttqfy.sxv>",
  subject: "We've blocked your account! \uD83D\uDEAB Your photos and videos will be deleted on20-10-2026",
  date: "Tue, 20 Oct 2026 12:42:17 -0700",
  urls: ["https://storage.googleapis.com/strow/strw_v3.html#?act=cl&pid=32531_md&uid=4&vid=2243974&ofid=452&lid=347&cid=860450"],
  fullHeaders: cliffHeaders,
  bodyText: ("Your photos and videos will be deleted! " +
    "Your payment method has expired. Please update your payment information. ").repeat(60)
});
const fullCliff = A.buildComplaint(aCliff);
const fullCliffUrl = A.composeUrl(0, fullCliff);
ok("cliff fixture: unshrunk URL would die at Gmail (>8200)",
  fullCliffUrl.length > 8200, "len=" + fullCliffUrl.length);

const planCliff = A.fitForCompose(0, aCliff);
ok("cliff fixture: plan URL under budget AND under the cliff",
  planCliff.url.length <= A.COMPOSE_URL_BUDGET && planCliff.url.length <= 8200,
  planCliff.mode + " len=" + planCliff.url.length);
ok("cliff fixture: not direct mode (the full complaint cannot fit)",
  planCliff.mode === "shrunk" || planCliff.mode === "paste", planCliff.mode);
ok("cliff fixture: defanged link intact, fragment uncut",
  planCliff.complaint.body.indexOf(
    "hxxps://storage[.]googleapis[.]com/strow/strw_v3.html#?act=cl&pid=32531_md&uid=4") !== -1);
ok("cliff fixture: no raw # anywhere in the compose URL",
  planCliff.url.indexOf("#") === -1);
ok("cliff fixture: compose URL is printable ASCII only",
  /^[\x21-\x7E]+$/.test(planCliff.url));
const cliffRoundTrip = decodeURIComponent(
  A.composeUrl(0, planCliff.complaint).split("&body=")[1]);
ok("cliff fixture: body param round-trips byte-for-byte",
  cliffRoundTrip === planCliff.complaint.body);
ok("cliff fixture: styled Unicode + emoji survive encoding",
  planCliff.complaint.body.indexOf("\uD83D\uDEAB") !== -1 &&
  cliffRoundTrip.indexOf("\uD83D\uDEAB") !== -1);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
