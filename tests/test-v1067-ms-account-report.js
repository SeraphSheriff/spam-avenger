// Spam Avenger v1.0.67 — Microsoft tenant-account case,
// INTEGRATED into the Report Abuse lane (Michael's correction,
// Nov 2 2026: "It shouldn't be a separate lane. It should be
// in the report abuse lane, and just triggered when the
// Microsoft Outlook protection bullshit URL pops up.").
//
// When the traced origin is the Outlook protection pool
// (*.outbound.protection.outlook.com / protection.outlook.com)
// AND SPF/DKIM/DMARC all pass for the From domain — a real
// Microsoft 365 tenant account, not a spoof — the EXISTING
// Report Abuse lane switches its target and content: the
// complaint goes to phish@office365.microsoft.com and its body
// is the account report (the account is the offender; the IP
// is Microsoft's shared pool; full headers ride in the body —
// Microsoft 550-blocks raw .eml attachments, proven in the
// manual Nov 2 send, and the Gmail compose lane cannot attach
// the ZIP workaround either). Every other sender keeps the
// ordinary host abuse-desk complaint, byte for byte.
//
// First live case (Nov 2 2026): Jessica Huber
// <jessica.h@lumeracrescent.co>, "re: Franktown Firearms",
// via mail-centralusazon11021138.outbound.protection
// .outlook.com [52.101.62.138]. Its headers carry the awkward
// real-world shape pinned below: ARC-Authentication-Results
// says spf=pass / dkim=pass / dmarc=pass while a later
// Authentication-Results block says dkim=none / dmarc=none —
// a mechanism counts as passing when ANY block reports pass.
// Run: node tests/test-v1067-ms-account-report.js
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
ok("manifest version is 1.0.67", manifest.version === "1.0.67",
  "got " + manifest.version);
ok("permissions unchanged: storage only",
  JSON.stringify(manifest.permissions) === JSON.stringify(["storage"]));
ok("no new host permissions",
  Array.isArray(manifest.host_permissions) &&
  manifest.host_permissions.length === 11);

// ---------- fixtures ----------
// The Jessica-shaped message (trimmed): protection-pool
// ingress Received, ARC auth all-pass, second auth block
// none/none, a DKIM-Signature blob that must be stripped.
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

// Same protection pool, but the auth does NOT all pass — a
// spoof riding the pool's name must not become an account
// report.
const SPOOF_RAW = MS_RAW
  .replace("dmarc=pass action=none", "dmarc=fail action=none")
  .replace("dkim=pass header.d=lumeracrescent.co", "dkim=fail header.d=lumeracrescent.co");

// Ordinary small-host spam: no protection host, no all-pass.
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

// Auth all-pass but NOT the protection pool (a legit-configured
// small host): no switch — the host complaint stands.
const PASSING_SMALL_RAW = NORMAL_RAW.replace(
  "spf=none smtp.mailfrom=spammy.example",
  "spf=pass smtp.mailfrom=spammy.example; dkim=pass header.d=spammy.example; dmarc=pass header.from=spammy.example");

// ---------- protection-host matcher ----------
ok("protection host: outbound subdomain matches",
  analyze.isMicrosoftProtectionHost(
    "mail-centralusazon11021138.outbound.protection.outlook.com") === true);
ok("protection host: bare protection.outlook.com matches",
  analyze.isMicrosoftProtectionHost("protection.outlook.com") === true);
ok("protection host: trailing dot + case tolerated",
  analyze.isMicrosoftProtectionHost("OUTBOUND.PROTECTION.OUTLOOK.COM.") === true);
ok("protection host: internal prod.outlook.com hop does NOT match",
  analyze.isMicrosoftProtectionHost("SJ0PR16MB4048.namprd16.prod.outlook.com") === false);
ok("protection host: plain outlook.com does NOT match",
  analyze.isMicrosoftProtectionHost("outlook.com") === false &&
  analyze.isMicrosoftProtectionHost("mail.outlook.com") === false);
ok("protection host: lookalike suffix does NOT match",
  analyze.isMicrosoftProtectionHost("evilprotection.outlook.com.example.com") === false &&
  analyze.isMicrosoftProtectionHost("") === false &&
  analyze.isMicrosoftProtectionHost(null) === false);

// ---------- auth parsing ----------
const msA = analyze.analyze(MS_RAW);
ok("auth: ARC all-pass wins over the later none block (real case shape)",
  msA.authResults.spf === "pass" && msA.authResults.dkim === "pass" &&
  msA.authResults.dmarc === "pass",
  JSON.stringify(msA.authResults));
ok("auth: authAllPass true for the real case", msA.authAllPass === true);
ok("authAllPass: any non-pass kills it",
  analyze.authAllPass({ spf: "pass", dkim: "pass", dmarc: "fail" }) === false &&
  analyze.authAllPass({ spf: "pass", dkim: null, dmarc: "pass" }) === false &&
  analyze.authAllPass(null) === false);
const spoofA = analyze.analyze(SPOOF_RAW);
ok("auth: spoof fixture does not all-pass", spoofA.authAllPass === false);

// ---------- analyze(): the case fires on the real shape ----------
ok("analyze: origin IP is the protection pool address",
  msA.ip === "52.101.62.138", msA.ip);
ok("analyze: sending server named from the ingress Received",
  msA.sendingServer ===
    "mail-centralusazon11021138.outbound.protection.outlook.com",
  msA.sendingServer);
ok("analyze: protection host flagged", msA.msProtectionHost === true);
ok("analyze: msAccountReport flagged for the real case",
  msA.msAccountReport === true);
ok("analyze: spoof on the pool is NOT flagged",
  spoofA.msProtectionHost === true && spoofA.msAccountReport === false);
const normalA = analyze.analyze(NORMAL_RAW);
ok("analyze: normal host is NOT flagged",
  normalA.msProtectionHost === false && normalA.msAccountReport === false);
const passingSmallA = analyze.analyze(PASSING_SMALL_RAW);
ok("analyze: all-pass small host is NOT flagged (pool required)",
  passingSmallA.authAllPass === true &&
  passingSmallA.msAccountReport === false);

// ---------- the lane switch: buildComplaint dispatch ----------
msA.abuse = "abuse@microsoft.com"; // what RDAP gives for the pool IP
const msC = analyze.buildComplaint(msA);
ok("lane switch: a complaint IS built despite skip-style inputs",
  !!msC);
ok("lane switch: recipient is the Microsoft phishing desk",
  msC && msC.to === "phish@office365.microsoft.com", msC && msC.to);
ok("lane switch: subject names the sender account",
  msC && msC.subject === "Phishing account report: jessica.h@lumeracrescent.co",
  msC && msC.subject);
ok("account report: body names the sender account",
  msC && msC.body.indexOf("Sender account: jessica.h@lumeracrescent.co") !== -1);
ok("account report: body names the subject",
  msC && msC.body.indexOf("re: Franktown Firearms") !== -1);
ok("account report: body names the sending server + pool IP",
  msC && msC.body.indexOf(
    "mail-centralusazon11021138.outbound.protection.outlook.com") !== -1 &&
  msC.body.indexOf("52.101.62.138") !== -1);
ok("account report: body states the IP is Microsoft's shared pool",
  msC && /shared outbound protection pool/.test(msC.body));
ok("account report: body carries the auth verdicts",
  msC && msC.body.indexOf("SPF pass, DKIM pass, DMARC pass") !== -1 &&
  msC.body.indexOf("lumeracrescent.co") !== -1);
ok("account report: body says the account itself is the offender " +
   "and asks for account action",
  msC && msC.body.indexOf("The account itself is the offender") !== -1 &&
  msC.body.indexOf("take appropriate action on the account") !== -1);
ok("account report: full headers ride in the body",
  msC && msC.body.indexOf("Full headers (plain text, as received):") !== -1 &&
  msC.body.indexOf("ARC-Authentication-Results") !== -1 &&
  msC.body.indexOf("outbound.protection.outlook.com") !== -1);
ok("account report: signature blocks stripped, omission noted",
  msC && msC.body.indexOf("DEADBEEFCAFEBABE") === -1 &&
  msC.body.indexOf("signature blocks omitted") !== -1);
ok("account report: links defanged",
  msC && msC.body.indexOf("hxxps://bait[.]example[.]com/offer") !== -1);
ok("account report: no .eml attachment is designed in (headers in body only)",
  msC && !/\.eml/.test(msC.body) && msC.to.indexOf("office365") !== -1);

// buildMsAccountReport direct + the dispatch honors the flag
// even when the caller sets it from investigate's PTR check.
const direct = analyze.buildMsAccountReport(msA);
ok("buildMsAccountReport: exported and matches the dispatch",
  !!direct && direct.to === msC.to && direct.body === msC.body);
const ptrOnly = analyze.analyze(NORMAL_RAW.replace(
  "spf=none smtp.mailfrom=spammy.example",
  "spf=pass smtp.mailfrom=spammy.example; dkim=pass header.d=spammy.example; dmarc=pass header.from=spammy.example"));
ptrOnly.host = "mail-xyz.outbound.protection.outlook.com";
ptrOnly.msAccountReport = analyze.isMsAccountCase(ptrOnly);
ok("isMsAccountCase: PTR host naming the pool completes the case",
  ptrOnly.msAccountReport === true);

// ---------- non-Microsoft behavior is unchanged ----------
normalA.abuse = "abuse@spammy.example";
const nC = analyze.buildComplaint(normalA);
ok("normal: complaint still goes to the host abuse desk",
  !!nC && nC.to === "abuse@spammy.example", nC && nC.to);
ok("normal: subject is still the network-abuse form",
  !!nC && nC.subject === "Network abuse complaint — spam from 203.0.113.9",
  nC && nC.subject);
ok("normal: body is the host complaint, not an account report",
  !!nC && nC.body.indexOf("I received spam originating from your network:") !== -1 &&
  nC.body.indexOf("The account itself is the offender") === -1 &&
  nC.body.indexOf("phish@office365") === -1);
passingSmallA.abuse = "abuse@spammy.example";
const psC = analyze.buildComplaint(passingSmallA);
ok("all-pass small host: still the host complaint (no switch)",
  !!psC && psC.to === "abuse@spammy.example");
spoofA.abuse = "abuse@microsoft.com";
const spC = analyze.buildComplaint(Object.assign({}, spoofA,
  { skipComplaint: true }));
ok("spoof on the pool: no account report (skip path intact)",
  spC === null);
ok("skipComplaint still nulls a normal build",
  analyze.buildComplaint({ ip: "1.2.3.4", abuse: "a@b.c",
    skipComplaint: true }) === null);
ok("no traced IP: no account report even with the flag set",
  analyze.buildComplaint({ ip: null, msAccountReport: true,
    from: "x@lumeracrescent.co" }) === null);

// ---------- fitForCompose: the switched lane still fits ----------
const plan = analyze.fitForCompose(0, msA);
ok("fitForCompose: switched complaint fits the compose budget",
  !!plan && plan.url.length <= analyze.COMPOSE_URL_BUDGET,
  plan && (plan.mode + " len=" + plan.url.length));
ok("fitForCompose: compose URL is addressed to the phishing desk",
  !!plan && plan.url.indexOf(
    encodeURIComponent("phish@office365.microsoft.com")) !== -1);
ok("fitForCompose: plan complaint is the account report",
  !!plan && plan.complaint.to === "phish@office365.microsoft.com");

// ---------- investigate() wiring (source pins) ----------
ok("investigate: re-checks the case with the PTR host and " +
   "un-skips the complaint lane",
  analyzeSrc.indexOf("a.msAccountReport = isMsAccountCase(a);") !== -1 &&
  analyzeSrc.indexOf("a.skipComplaint = a.msAccountReport") !== -1);
ok("investigate: providerAdvice suppressed when the case fires",
  analyzeSrc.indexOf("!a.msAccountReport && a.skipComplaint") !== -1);
ok("buildComplaint: dispatch precedes the skip/abuse guards",
  analyzeSrc.indexOf("a.msAccountReport || isMsAccountCase(a)") !== -1 &&
  analyzeSrc.indexOf("a.msAccountReport || isMsAccountCase(a)") <
    analyzeSrc.indexOf("if (a.skipComplaint || !a.ip || !a.abuse) return null;"));

// ---------- panel wiring: SAME lane, no separate lane ----------
ok("panel: no separate Microsoft section or lane id exists",
  contentSrc.indexOf("sf-sec-ms") === -1 &&
  contentSrc.indexOf("sf-ms-") === -1);
ok("panel: history lanes unchanged (no new lane recorded)",
  contentSrc.indexOf('var SA_LANES = ["complaint", "ftc", "sb", ' +
    '"fwd", "google", "pid"]') !== -1);
ok("panel: the Azure form kit cannot hijack the Microsoft case",
  contentSrc.indexOf("if (a.msAccountReport) {") !== -1 &&
  contentSrc.indexOf("if (a.msAccountReport) {") <
    contentSrc.indexOf("a.hyperscaler && HYPER_FORM_HINTS[a.hyperscaler]"));
ok("panel: the complaint section explains the switch in-panel",
  contentSrc.indexOf("phish@office365.microsoft.com") !== -1 &&
  contentSrc.indexOf("real Microsoft account") !== -1 &&
  contentSrc.indexOf("about the account itself") !== -1);
ok("panel: the note lives inside the ordinary complaint section",
  (function () {
    const noteAt = contentSrc.indexOf("real Microsoft account");
    const secAt = contentSrc.indexOf(
      'acc.section("sf-sec-complaint", "sf-btn-green"');
    const taAt = contentSrc.indexOf('id: "sf-complaint-text"');
    return secAt !== -1 && noteAt > secAt && taAt > secAt;
  })());
ok("panel: URL lanes untouched (FTC / Safe Browsing / Forward present)",
  contentSrc.indexOf('"Report to FTC"') !== -1 &&
  contentSrc.indexOf('"Report to Google Safe Browsing"') !== -1 &&
  contentSrc.indexOf('"Forward phish to APWG + CISA"') !== -1);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
