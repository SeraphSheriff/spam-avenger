// Spam Avenger v1.0.69 — the Azure form kit, upgraded.
// From Michael's live Outlook test (Nov 2 2026): an Azure-
// hosted spam (origin IP owned by Microsoft, but NOT the
// protection.outlook.com tenant case) whose panel only
// offered the abuse@microsoft.com email — a desk that
// deflects Azure abuse to the MSRC web form. His direction:
// rather than just telling the user "go there, do this,"
// give them the link AND a little information — a copy-paste
// kind of deal.
// So, inside the EXISTING form kit (no new lane; the email
// complaint machinery is untouched), the Azure lane gained:
//   - the MSRC link with its picks pre-picked
//     (ThreatType=IpAddress&IncidentType=Spam), shown as a
//     link under the evidence box, not just opened by a
//     button;
//   - ONE factual line: "This host takes abuse reports
//     through its web form; the form is where a case gets
//     opened.";
//   - (v1.0.69) a details block mirroring the emailed
//     complaint's evidence, behind a copy-only button.
// v1.0.70 UPDATE: Michael filed the MSRC form by hand and
// screenshotted both steps — the Contact step's Additional
// information box caps at 15,000 characters (the mirror
// block FIT, ~9,200 used), the Report Details step has
// pickers, a Source IP box, and a Report notes box capped
// at 2,000. The standalone copy-details BUTTON is retired;
// the mirror block itself stays, retargeted as the
// Additional information step slice, and azure declares
// per-field steps like the other lanes — all pinned in
// test-v1070-azure-msrc-steps.js. What THIS suite still pins:
// the lane's URL/fact data, the printed link, the standard
// evidence block in the box, the retirement itself, the MS
// tenant guard, and the lib-level mirror block —
// buildFormEvidence's opts.mirrorComplaint REMAINS in the
// lib (the Outlook build's shared engine references it),
// default off, byte-identical when unused.
// Run: node tests/test-v1069-azure-form-kit.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

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

const MSRC_URL =
  "https://msrc.microsoft.com/report/abuse?ThreatType=IpAddress&IncidentType=Spam";
const FACT_LINE =
  "This host takes abuse reports through its web form; the form is where a case gets opened.";

// ---------- manifest ----------
ok("manifest version is 1.0.70", manifest.version === "1.0.70",
  "got " + manifest.version);
ok("permissions unchanged: storage only",
  JSON.stringify(manifest.permissions) === JSON.stringify(["storage"]));
ok("no new host permissions",
  Array.isArray(manifest.host_permissions) &&
  manifest.host_permissions.length === 11);

// ---------- the shipped azure entry (extracted verbatim) ----------
const m = contentSrc.match(/var HYPER_FORM_HINTS = (\{[\s\S]*?\n  \});/);
ok("HYPER_FORM_HINTS table extractable from content.js", !!m);
const hints = m ? vm.runInNewContext("(" + m[1] + ")") : {};
ok("azure form link is exactly the parameterized MSRC URL",
  hints.azure && hints.azure.url === MSRC_URL,
  hints.azure && hints.azure.url);
ok("azure linkText is the exact URL (what's shown is the link)",
  hints.azure && hints.azure.linkText === MSRC_URL);
ok("azure carries the one factual line, verbatim",
  hints.azure && hints.azure.fact === FACT_LINE);
ok("azure's v1.0.69 `details` flag is retired (v1.0.70: fields instead)",
  hints.azure && hints.azure.details === undefined &&
  Array.isArray(hints.azure.fields));
ok("google lane unchanged: no fact, no details flag",
  hints.google && hints.google.fact === undefined &&
  hints.google.details === undefined);
ok("aws lane unchanged: no fact, no details flag",
  hints.aws && hints.aws.fact === undefined &&
  hints.aws.details === undefined);
const mo = contentSrc.match(/var OVH_FORM_HINT = (\{[\s\S]*?\});/);
const ovhHint = mo ? vm.runInNewContext("(" + mo[1] + ")") : {};
ok("ovh lane unchanged: no fact, no details flag",
  ovhHint.fact === undefined && ovhHint.details === undefined);

// ---------- panel wiring (the kit segment) ----------
const kitStart = contentSrc.indexOf("var formLane = null;");
const emailStart = contentSrc.indexOf(
  'acc.section("sf-sec-complaint", "sf-btn-green"');
const kitSeg = (kitStart !== -1 && emailStart !== -1)
  ? contentSrc.slice(kitStart, emailStart) : "";
ok("kit segment located", kitSeg.length > 0);
ok("fact line renders from the lane entry, above the instruction note",
  kitSeg.indexOf("if (formLane.fact)") !== -1 &&
  kitSeg.indexOf("formLane.fact") <
    kitSeg.indexOf("Your report details are in the box below"));
ok("v1.0.70: the box fills with the STANDARD block (no mirror wiring left)",
  kitSeg.indexOf("buildFormEvidence(a) || ") !== -1 &&
  contentSrc.indexOf("formLane.details") === -1 &&
  contentSrc.indexOf("{ mirrorComplaint: true }") === -1);
ok("the form link renders as a link (lane URL + linkText), behind showLink",
  kitSeg.indexOf("if (formLane.showLink)") !== -1 &&
  kitSeg.indexOf("href: formLane.url") !== -1 &&
  kitSeg.indexOf("formLane.linkText") !== -1 &&
  kitSeg.indexOf('"Abuse form: "') !== -1);
ok("v1.0.70 retirement: the copy-details button is gone entirely",
  contentSrc.indexOf("sf-form-details-copy") === -1 &&
  contentSrc.indexOf('"Copy the details for the form"') === -1 &&
  kitSeg.indexOf("copyDetailsBtn") === -1);
ok("the copy+open button is still the kit's only form opener + badge target",
  (kitSeg.match(/window\.open\(/g) || []).length === 1 &&
  kitSeg.indexOf("els.push(formBtn)") !== -1);

// ---------- lib: the complaint-mirroring details block ----------
// Fixture mirrors Michael's real Azure case (the Outlook
// screenshot, Nov 2): "Cloud Team" FINAL WARNING lure from
// 52.242.95.45, no reverse DNS, imgur + acros.fun links.
const AZ = {
  ip: "52.242.95.45",
  org: "Microsoft Corporation",
  abuse: "abuse@microsoft.com",
  host: null,
  from: "Cloud Team <VWJRT8JP@0gjiueaplmtubdhyxp.1rpykig1.com>",
  subject: "FINAL WARNING regarding your account",
  date: "Mon, 02 Nov 2026 03:06:00 +0000",
  messageId: "<cloudteam@0gjiueaplmtubdhyxp.1rpykig1.com>",
  ingressReceived:
    "from 0gjiueaplmtubdhyxp.1rpykig1.com ([52.242.95.45]) " +
    "by ben.ace-host.net with esmtp",
  urls: [
    "https://i.imgur.com/1Q2V0Hd.png",
    "http://HC00bRf6dp.acros.fun/cl/3147_rd/2007/0/280/294/6a2f0e52500cba7f2b29bbdb"
  ],
  fullHeaders:
    "From: Cloud Team <VWJRT8JP@0gjiueaplmtubdhyxp.1rpykig1.com>\n" +
    "Subject: FINAL WARNING regarding your account\n" +
    "DKIM-Signature: v=1; a=rsa-sha256; d=1rpykig1.com;\n\tb=deadbeefcafe\n" +
    "X-Originating-IP: [52.242.95.45]\n" +
    "Date: Mon, 02 Nov 2026 03:06:00 +0000",
  bodyText: "Verify now or lose the account."
};
const details = analyze.buildFormEvidence(AZ, { mirrorComplaint: true });
ok("details block builds for the Azure case",
  typeof details === "string" && details.length > 0);
ok("details: source IP line",
  details.indexOf("Source IP: 52.242.95.45") !== -1);
ok("details: server line (displayHost of no-PTR, like the complaint)",
  details.indexOf("Server: " + analyze.displayHost(AZ.host)) !== -1 &&
  analyze.displayHost(AZ.host) === "no valid reverse DNS record");
ok("details: date renders as a UTC stamp",
  details.indexOf("Date/time (UTC): Mon, 02 Nov 2026 03:06:00 UTC") !== -1);
ok("details: From and Subject lines",
  details.indexOf("From: Cloud Team <VWJRT8JP@0gjiueaplmtubdhyxp.1rpykig1.com>") !== -1 &&
  details.indexOf("Subject: FINAL WARNING regarding your account") !== -1);
ok("details: ingress Received line",
  details.indexOf("Received: from 0gjiueaplmtubdhyxp.1rpykig1.com ([52.242.95.45])") !== -1);
ok("details: both URLs present, defanged",
  details.indexOf(analyze.defangUrl(AZ.urls[0])) !== -1 &&
  details.indexOf(analyze.defangUrl(AZ.urls[1])) !== -1 &&
  details.indexOf("hxxps://i[.]imgur[.]com/1Q2V0Hd.png") !== -1);
ok("details: full headers with signatures stripped (trimHeaders, like the email)",
  details.indexOf("Full headers (plain text, as received):") !== -1 &&
  details.indexOf("X-Originating-IP: [52.242.95.45]") !== -1 &&
  details.indexOf("DKIM-Signature") === -1 &&
  details.indexOf("deadbeefcafe") === -1 &&
  details.indexOf("signature blocks omitted") !== -1);
ok("details: no reporter identity beyond the complaint's contents",
  details.indexOf("mjf@") === -1 && details.indexOf("spamdodger") === -1);

// ---------- the standard block is unchanged (other lanes) ----------
const standard = analyze.buildFormEvidence(AZ);
ok("standard block (no opt) has NO server line and NO links block",
  standard.indexOf("Server:") === -1 &&
  standard.indexOf("Links in message") === -1);
ok("standard block still carries the base facts + headers",
  standard.indexOf("Source IP: 52.242.95.45") !== -1 &&
  standard.indexOf("Full headers (plain text, as received):") !== -1);
ok("explicit mirrorComplaint:false matches the default block",
  analyze.buildFormEvidence(AZ, { mirrorComplaint: false }) === standard &&
  analyze.buildFormEvidence(AZ, {}) === standard);

// ---------- parity with the emailed complaint's evidence ----------
const comp = analyze.buildComplaint(AZ);
ok("the email complaint itself is unchanged (still builds, still abuse@microsoft.com)",
  !!comp && comp.to === "abuse@microsoft.com" &&
  comp.subject === "Network abuse complaint \u2014 spam from 52.242.95.45");
ok("parity: complaint's server name matches the details' server line",
  comp.body.indexOf("Server name:    " + analyze.displayHost(AZ.host)) !== -1);
ok("parity: every defanged link in the details is in the complaint",
  AZ.urls.every(function (u) {
    return details.indexOf(analyze.defangUrl(u)) !== -1 &&
      comp.body.indexOf(analyze.defangUrl(u)) !== -1;
  }));
ok("parity: the trimmed header evidence appears in both",
  details.indexOf("X-Originating-IP: [52.242.95.45]") !== -1 &&
  comp.body.indexOf("X-Originating-IP: [52.242.95.45]") !== -1);
// Header cap parity: a >8000-char header block truncates the
// same way in both (same cap, same note).
const bigHeaders = "X-Filler: " + "a".repeat(9000) + "\n" +
  "From: Cloud Team <x@y.example>\nDate: Mon, 02 Nov 2026 03:06:00 +0000";
const bigAZ = Object.assign({}, AZ, { fullHeaders: bigHeaders });
const bigDetails = analyze.buildFormEvidence(bigAZ, { mirrorComplaint: true });
const bigComp = analyze.buildComplaint(bigAZ);
ok("parity: header cap 8000 applies to both, with the same note",
  bigDetails.indexOf("[headers truncated at 8000 characters]") !== -1 &&
  bigComp.body.indexOf("[headers truncated at 8000 characters]") !== -1);
// Link cap parity: 12 URLs in, 10 defanged lines out, both.
const manyUrls = [];
for (let i = 0; i < 12; i++) manyUrls.push("https://link" + i + ".example/x");
const manyAZ = Object.assign({}, AZ, { urls: manyUrls });
const manyDetails = analyze.buildFormEvidence(manyAZ, { mirrorComplaint: true });
const manyComp = analyze.buildComplaint(manyAZ);
ok("parity: links capped at 10 in both blocks",
  (manyDetails.match(/\n {2}- hxxp/g) || []).length === 10 &&
  (manyComp.body.match(/\n {4}- hxxp/g) || []).length === 10);

// ---------- the MS tenant case never reaches this kit ----------
// The guard is load-bearing: the protection pool's RDAP reads
// as a Microsoft block, so hyperscalerOf DOES say 'azure' for
// MSFT space — only the msAccountReport guard keeps tenant
// mail out of the form kit and in the phish-desk email lane.
function vcard(fn, email) {
  const rows = [["version", {}, "text", "4.0"], ["fn", {}, "text", fn]];
  if (email) rows.push(["email", {}, "text", email]);
  return ["vcard", rows];
}
const msftRdap = {
  name: "MSFT",
  entities: [{ roles: ["registrant"], vcardArray: vcard("Microsoft Corporation"),
    entities: [{ roles: ["abuse"],
      vcardArray: vcard("Microsoft Abuse Contact", "abuse@microsoft.com") }] }]
};
ok("guard is load-bearing: MSFT RDAP alone reads as 'azure'",
  analyze.hyperscalerOf(msftRdap) === "azure");
ok("panel guard: the msAccountReport check precedes the hyperscaler resolution",
  contentSrc.indexOf("if (a.msAccountReport)") !== -1 &&
  contentSrc.indexOf("if (a.msAccountReport)") <
    contentSrc.indexOf("a.hyperscaler && HYPER_FORM_HINTS[a.hyperscaler]"));
ok("kit link renders only inside the formLane branch (guard upstream)",
  contentSrc.indexOf("formLane.showLink") >
    contentSrc.indexOf("if (formLane) {"));
const MS_RAW = [
  "Received: from mail-centralusazon11021138.outbound.protection.outlook.com ([52.101.62.138]:2623 helo=DM5PR21CU001.outbound.protection.outlook.com)",
  "\tby ben.ace-host.net with esmtps id 1xO2AG-0001 for <mjf@colorami.com>;",
  "\tMon, 02 Nov 2026 19:14:14 -0500",
  "ARC-Authentication-Results: i=1; mx.microsoft.com 1; spf=pass",
  " smtp.mailfrom=lumeracrescent.co; dmarc=pass action=none",
  " header.from=lumeracrescent.co; dkim=pass header.d=lumeracrescent.co; arc=none",
  "From: Jessica Huber <jessica.h@lumeracrescent.co>",
  "Subject: re: Franktown Firearms",
  "Message-ID: <01a19ec0@lumeracrescent.co>",
  "Date: Tue, 03 Nov 2026 00:13:01 +0000",
  "",
  "Hello, please review the attached offer."
].join("\n");
const msA = analyze.analyze(MS_RAW);
ok("tenant case still flags as an account report (not a form case)",
  msA.msAccountReport === true);
msA.abuse = "abuse@microsoft.com";
const msC = analyze.buildComplaint(msA);
ok("tenant complaint still goes to the phish desk, not any form",
  !!msC && msC.to === "phish@office365.microsoft.com");

// ---------- non-hyperscaler senders unchanged ----------
ok("small host: no hyperscaler flag, plain email complaint as before",
  analyze.hyperscalerOf({
    name: "HETZNER-1608237",
    entities: [{ roles: ["registrant"], vcardArray: vcard("Hetzner Online GmbH") }]
  }) === null);
const smallC = analyze.buildComplaint({
  ip: "203.0.113.9", abuse: "abuse@hetzner.com",
  host: "static.9.113.0.203.clients.your-server.de",
  from: "a@b.example", subject: "spam",
  date: "Wed, 28 Oct 2026 00:00:00 +0000", fullHeaders: "", bodyText: ""
});
ok("small host complaint still builds to its abuse desk",
  !!smallC && smallC.to === "abuse@hetzner.com");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
