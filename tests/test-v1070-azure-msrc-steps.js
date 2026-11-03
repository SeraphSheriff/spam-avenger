// Spam Avenger v1.0.70 — the Azure kit becomes per-field
// steps, mapped from the REAL MSRC form.
// Michael filed the form by hand (Nov 2 2026) and
// screenshotted both of its steps. The form has TWO big
// text boxes, on different steps:
//   - "Additional information" (Contact Information step)
//     — cap 15,000 characters. He pasted the v1.0.69 kit's
//     full details block there and it FIT (form counter:
//     5,834/15,000 remaining, ~9,166 used, including the
//     block's 8,000-char-truncated headers).
//   - "Report notes" (Report Details step) — cap 2,000
//     characters, next to the Incident date / time / Time
//     zone pickers and the IP addresses section (Source IP
//     address required in its own box; Source port,
//     Destination IP, Destination port optional).
// So the v1.0.69 single-block kit (mirror block in the
// panel's box + its own copy button) becomes steps in the
// form's order, like the other three lanes' kits:
//   "Additional information"  -> the "additionalInfo"
//     slice: the SAME full details block
//     (buildFormEvidence, mirrorComplaint), kept and
//     retargeted at the box it fits (pinned ≤ 15,000)
//   "Source IP address"       -> the "ip" slice
//   "Incident date and time"  -> the "incidentStamp"
//     slice: the received moment in UTC, presented for
//     the pickers, with the time-zone steer
//   "Report notes"            -> the "msrcNotes" slice:
//     the SHORT version (narrative, From/Subject/IP/
//     server/date, defanged links, ingress Received), NO
//     full headers — they live in Additional information.
//     HARD 2,000 cap, pinned.
// The Contact step's Name/Email boxes are the reporter's
// own: azure's fieldsIntro says so, and no slice prepares
// identity. The fact line and the printed parameterized
// link stay. The standard evidence block and the emailed
// complaint are untouched. The MS tenant-account guard
// stands absolute: the tenant case never sees any of this.
// Run: node tests/test-v1070-azure-msrc-steps.js
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
const az = hints.azure || {};
function boxes(lane) {
  return (lane.fields || []).map(function (f) { return f.box; });
}
function copies(lane) {
  return (lane.fields || []).map(function (f) { return f.copy; });
}
ok("azure keeps the exact parameterized MSRC URL + linkText",
  az.url === MSRC_URL && az.linkText === MSRC_URL);
ok("azure keeps the one factual line, verbatim",
  az.fact === FACT_LINE);
ok("azure prints the link (showLink), and the `details` flag is gone",
  az.showLink === true && az.details === undefined);
ok("azure fields: the form's boxes, in the form's order (Contact step first)",
  JSON.stringify(boxes(az)) === JSON.stringify(
    ["Additional information", "Source IP address",
     "Incident date and time", "Report notes"]),
  JSON.stringify(boxes(az)));
ok("azure field slices: additionalInfo / ip / incidentStamp / msrcNotes",
  JSON.stringify(copies(az)) === JSON.stringify(
    ["additionalInfo", "ip", "incidentStamp", "msrcNotes"]),
  JSON.stringify(copies(az)));
ok("azure's intro carries the identity note (Contact-step name/email are the user's own)",
  typeof az.fieldsIntro === "string" &&
  az.fieldsIntro.indexOf("Contact Information") !== -1 &&
  /never prepares them/.test(az.fieldsIntro));
ok("additional-information help names the 15,000-character box it fits",
  /15,000/.test((az.fields[0] || {}).help || ""));
ok("source-IP help: the port/destination boxes are optional, leave blank",
  /leave them blank/.test((az.fields[1] || {}).help || "") &&
  /Source port/.test((az.fields[1] || {}).help || ""));
ok("report-notes help names the form's 2,000-character cap",
  /2,000/.test((az.fields[3] || {}).help || ""));

// ---------- the other three lanes are unchanged ----------
const mo = contentSrc.match(/var OVH_FORM_HINT = (\{[\s\S]*?\});/);
const ovhHint = mo ? vm.runInNewContext("(" + mo[1] + ")") : {};
ok("google/aws/ovh field maps unchanged",
  JSON.stringify(boxes(hints.google)) ===
    JSON.stringify(["Abuse date", "Abuse details", "Additional logs"]) &&
  JSON.stringify(boxes(hints.aws)) ===
    JSON.stringify(["Type of abuse", "Source IP and date/time",
      "Log extracts", "URLs in the message"]) &&
  JSON.stringify(boxes(ovhHint)) ===
    JSON.stringify(["Category", "Location", "Description",
      "Logs / technical elements"]));

// ---------- panel wiring ----------
const kitStart = contentSrc.indexOf("var formLane = null;");
const emailStart = contentSrc.indexOf(
  'acc.section("sf-sec-complaint", "sf-btn-green"');
const kitSeg = (kitStart !== -1 && emailStart !== -1)
  ? contentSrc.slice(kitStart, emailStart) : "";
ok("kit segment located", kitSeg.length > 0);
ok("retired: the standalone copy-details button + details flag are gone",
  contentSrc.indexOf("formLane.details") === -1 &&
  contentSrc.indexOf("sf-form-details-copy") === -1 &&
  contentSrc.indexOf('"Copy the details for the form"') === -1);
ok("the panel itself never fills its box with the mirror block (it rides as a step slice)",
  kitSeg.indexOf("buildFormEvidence(a) || ") !== -1 &&
  kitSeg.indexOf("mirrorComplaint") === -1);
ok("azure's steps ride the same generic fields renderer as the other lanes",
  kitSeg.indexOf("if (formLane.fields && formLane.fields.length)") !== -1 &&
  kitSeg.indexOf("buildFormFieldEvidence(a, fld.copy)") !== -1 &&
  kitSeg.indexOf("buildFormFieldEvidence(a, fld.copy)") >
    kitSeg.indexOf("if (formLane) {"));
ok("the printed link is azure's (showLink), inside the guarded branch",
  kitSeg.indexOf("if (formLane.showLink)") !== -1 &&
  kitSeg.indexOf('"Abuse form: "') !== -1);

// ---------- fixtures ----------
// Mirrors Michael's hand-filed case (his Nov 2 screenshots):
// an Azure-rented box at 20.69.240.100, no reverse DNS, the
// message received Sun Nov 1 2026, 02:47:55 UTC.
const AZ = {
  ip: "20.69.240.100",
  org: "Microsoft Corporation",
  abuse: "abuse@microsoft.com",
  host: null,
  from: "Riverbend Ranch <no-reply@-7y0qeL6OHIaPOks.bNovY.store>",
  subject: "(1) Important Message for spamdodger",
  date: "Sun, 01 Nov 2026 02:47:55 +0000",
  messageId: "<riverbend@bNovY.store>",
  ingressReceived:
    "from bNovY.store ([20.69.240.100]) by ben.ace-host.net with esmtp",
  urls: ["https://riverbend.example/claim?x=1"],
  fullHeaders:
    "From: Riverbend Ranch <no-reply@-7y0qeL6OHIaPOks.bNovY.store>\n" +
    "Subject: (1) Important Message for spamdodger\n" +
    "X-Originating-IP: [20.69.240.100]\n" +
    "Date: Sun, 01 Nov 2026 02:47:55 +0000",
  bodyText: "Your ranch reward is waiting."
};

// ---------- slice: ip ----------
ok("ip slice is the bare source IP",
  analyze.buildFormFieldEvidence(AZ, "ip") === "20.69.240.100");

// ---------- slice: incidentStamp ----------
const stamp = analyze.buildFormFieldEvidence(AZ, "incidentStamp");
ok("incidentStamp presents the pickers' values (date + time, UTC)",
  typeof stamp === "string" &&
  stamp.indexOf("Date: 2026-11-01") !== -1 &&
  stamp.indexOf("Time: 02:47 UTC") !== -1,
  stamp);
ok("incidentStamp carries the compact full stamp for the copy",
  stamp.indexOf("2026-11-01 02:47:55 UTC") !== -1);
ok("incidentStamp steers the Time zone box to UTC/GMT",
  stamp.indexOf("UTC/GMT") !== -1);
ok("incidentStamp is null on an unparseable date (step is skipped)",
  analyze.buildFormFieldEvidence(
    Object.assign({}, AZ, { date: "not a date" }),
    "incidentStamp") === null);
ok("incidentStamp converts offsets to UTC",
  analyze.buildFormFieldEvidence(
    Object.assign({}, AZ, { date: "Sun, 01 Nov 2026 04:47:55 +0200" }),
    "incidentStamp").indexOf("2026-11-01 02:47:55 UTC") !== -1);

// ---------- slice: additionalInfo (the full block, kept) ----------
const addl = analyze.buildFormFieldEvidence(AZ, "additionalInfo");
ok("additionalInfo IS the mirror block (same builder, same output)",
  addl === analyze.buildFormEvidence(AZ, { mirrorComplaint: true }));
ok("additionalInfo fits the Contact box's 15,000 cap on a light fixture",
  typeof addl === "string" && addl.length <= 15000,
  addl && addl.length);
ok("additionalInfo: server line + defanged links + full headers (the mirror traits)",
  addl.indexOf("Server: no valid reverse DNS record") !== -1 &&
  addl.indexOf("hxxps://riverbend[.]example/claim?x=1") !== -1 &&
  addl.indexOf("Full headers (plain text, as received):") !== -1 &&
  addl.indexOf("X-Originating-IP: [20.69.240.100]") !== -1);

// ---------- slice: msrcNotes (the short block) ----------
const notes = analyze.buildFormFieldEvidence(AZ, "msrcNotes");
ok("msrcNotes builds and fits the cap",
  typeof notes === "string" && notes.length <= 2000,
  notes && notes.length);
ok("msrcNotes: the Azure narrative + the account/customer ask",
  notes.indexOf("computer rented on Microsoft Azure") !== -1 &&
  notes.indexOf("Please investigate the account or customer") !== -1);
ok("msrcNotes: points at Additional information for the full headers",
  notes.indexOf("Full headers are in the Additional information") !== -1);
ok("msrcNotes: From, Subject, Source IP, Server, Date lines",
  notes.indexOf("From: Riverbend Ranch") !== -1 &&
  notes.indexOf("Subject: (1) Important Message for spamdodger") !== -1 &&
  notes.indexOf("Source IP: 20.69.240.100") !== -1 &&
  notes.indexOf("Server: no valid reverse DNS record") !== -1 &&
  notes.indexOf("Date/time (UTC): Sun, 01 Nov 2026 02:47:55 UTC") !== -1);
ok("msrcNotes: ingress Received line + defanged link",
  notes.indexOf("Received: from bNovY.store ([20.69.240.100])") !== -1 &&
  notes.indexOf(analyze.defangUrl(AZ.urls[0])) !== -1 &&
  notes.indexOf("hxxps://riverbend[.]example/claim?x=1") !== -1);
ok("msrcNotes: NO full headers ride here (they live in Additional information)",
  notes.indexOf("X-Originating-IP") === -1 &&
  notes.indexOf("Full headers (plain text") === -1);
ok("msrcNotes: no reporter identity prepared",
  notes.indexOf("mjf@") === -1 && notes.indexOf("spamdodger@") === -1);

// ---------- header-heavy fixture: both boxes, both caps ----------
// ~11,000 characters of headers — over the mirror block's
// own 8,000 cap, so the block truncates them and still
// lands ~9,000 total, far under the Additional information
// box's 15,000 (Michael's real paste: ~9,166 used). The
// notes never see a single header line.
const heavyLines = [];
for (let i = 0; i < 200; i++) {
  heavyLines.push("X-Trace-" + ("00" + i).slice(-3) + ": " + "a".repeat(40));
}
const heavyHeaders =
  "From: Riverbend Ranch <no-reply@-7y0qeL6OHIaPOks.bNovY.store>\n" +
  "Subject: (1) Important Message for spamdodger\n" +
  "DKIM-Signature: v=1; a=rsa-sha256; d=bNovY.store;\n\tb=deadbeefcafe\n" +
  heavyLines.join("\n") + "\n" +
  "Date: Sun, 01 Nov 2026 02:47:55 +0000";
const heavyAZ = Object.assign({}, AZ, { fullHeaders: heavyHeaders });
const heavyAddl = analyze.buildFormFieldEvidence(heavyAZ, "additionalInfo");
ok("additionalInfo HARD fit: header-heavy block ≤ 15,000 characters",
  typeof heavyAddl === "string" && heavyAddl.length <= 15000,
  heavyAddl && heavyAddl.length);
ok("additionalInfo: headers carried with the 8,000 cap + notes, signatures stripped",
  heavyAddl.indexOf("[headers truncated at 8000 characters]") !== -1 &&
  heavyAddl.indexOf("signature blocks omitted") !== -1 &&
  heavyAddl.indexOf("X-Trace-000: " + "a".repeat(40)) !== -1 &&
  heavyAddl.indexOf("DKIM-Signature") === -1 &&
  heavyAddl.indexOf("deadbeefcafe") === -1);
const heavyNotes = analyze.buildFormFieldEvidence(heavyAZ, "msrcNotes");
ok("msrcNotes: header-heavy case still fits 2,000 with zero header lines",
  typeof heavyNotes === "string" && heavyNotes.length <= 2000 &&
  heavyNotes.indexOf("X-Trace-") === -1 &&
  heavyNotes.indexOf("Source IP: 20.69.240.100") !== -1 &&
  heavyNotes.indexOf("computer rented on Microsoft Azure") !== -1,
  heavyNotes && heavyNotes.length);

// ---------- msrcNotes caps + fallbacks ----------
const manyUrls = [];
for (let i = 0; i < 12; i++) manyUrls.push("https://link" + i + ".example/x");
const manyNotes = analyze.buildFormFieldEvidence(
  Object.assign({}, AZ, { urls: manyUrls }), "msrcNotes");
ok("msrcNotes: defanged links capped at 10",
  (manyNotes.match(/\n {2}- hxxp/g) || []).length === 10 &&
  manyNotes.length <= 2000);
ok("msrcNotes: builds without fullHeaders (facts carry it alone)",
  (function () {
    const n = analyze.buildFormFieldEvidence(
      Object.assign({}, AZ, { fullHeaders: "" }), "msrcNotes");
    return typeof n === "string" && n.length <= 2000 &&
      n.indexOf("Source IP: 20.69.240.100") !== -1;
  })());
ok("msrcNotes: an unparseable date still builds (raw stamp passes through)",
  (function () {
    const n = analyze.buildFormFieldEvidence(
      Object.assign({}, AZ, { date: "not a date" }), "msrcNotes");
    return typeof n === "string" && n.length <= 2000 &&
      n.indexOf("Source IP: 20.69.240.100") !== -1;
  })());
ok("additionalInfo: no fullHeaders falls back to key headers, like the block does",
  (function () {
    const n = analyze.buildFormFieldEvidence(
      Object.assign({}, AZ, { fullHeaders: "" }), "additionalInfo");
    return typeof n === "string" &&
      n.indexOf("Key headers as evidence:") !== -1 &&
      n.indexOf("Message-ID: <riverbend@bNovY.store>") !== -1;
  })());
ok("all three new slices are null without a traced IP",
  analyze.buildFormFieldEvidence(
    Object.assign({}, AZ, { ip: null }), "additionalInfo") === null &&
  analyze.buildFormFieldEvidence(
    Object.assign({}, AZ, { ip: null }), "msrcNotes") === null &&
  analyze.buildFormFieldEvidence(
    Object.assign({}, AZ, { ip: null }), "incidentStamp") === null);

// ---------- the standard block + complaint are untouched ----------
ok("standard evidence block unchanged (no Server/links creep)",
  (function () {
    const s = analyze.buildFormEvidence(AZ);
    return s.indexOf("Server:") === -1 &&
      s.indexOf("Links in message") === -1 &&
      s.indexOf("Full headers (plain text, as received):") !== -1;
  })());
ok("the emailed complaint machinery is untouched",
  (function () {
    const c = analyze.buildComplaint(AZ);
    return !!c && c.to === "abuse@microsoft.com" &&
      c.subject === "Network abuse complaint \u2014 spam from 20.69.240.100";
  })());

// ---------- the MS tenant case never reaches this kit ----------
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
ok("tenant case still flags as an account report, never a form case",
  analyze.analyze(MS_RAW).msAccountReport === true);
ok("panel guard: the tenant check precedes the form-lane resolution",
  contentSrc.indexOf("if (a.msAccountReport)") !== -1 &&
  contentSrc.indexOf("if (a.msAccountReport)") <
    contentSrc.indexOf("a.hyperscaler && HYPER_FORM_HINTS[a.hyperscaler]") &&
  contentSrc.indexOf("a.hyperscaler && HYPER_FORM_HINTS[a.hyperscaler]") <
    contentSrc.indexOf("if (formLane.fields"));

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
