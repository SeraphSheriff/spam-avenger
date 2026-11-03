// Spam Avenger v1.0.69 (combined build) — per-field form
// kits for Google Cloud, AWS, and OVHcloud.
// (v1.0.70: Azure joined these lanes — Michael's screenshot
// of the real MSRC Report Details step showed pickers, a
// Source IP box, and a 2,000-character Report notes cap, so
// the v1.0.69 one-field Azure kit was retired and azure
// declares `fields` too; its map is pinned in
// test-v1070-azure-msrc-steps.js. This suite's three lanes
// are unchanged.) The three forms here split the report
// across their own boxes, and
// one paste fits none of them, so their lane entries now
// declare `fields`: each field names the form's box, gives
// Joe a one-line instruction, and carries its own Copy
// button with the evidence slice that box wants (lib
// buildFormFieldEvidence). Field maps were built from the
// forms as verified 2026-11-02:
//   Google — the live form page fetched: Name + Email
//     (reporter identity), Abuse date, Abuse details
//     (required, 1,000-character cap, guidance asks for the
//     abusive IPs/URLs), Additional logs (a FILE UPLOAD),
//     and the service question (v1.0.65 pick stands).
//   AWS — the form is a script-driven page whose boxes
//     could not be read directly; the map follows AWS's own
//     published requirements (Trust & Safety reporting FAQ
//     + the report-aws-abuse article): type of abuse, dates
//     and times with time zone, source IP addresses, log
//     extracts, specific URLs for abusive content.
//   OVHcloud — the abuse-form terms: the location (a URL
//     or an IP address), a description of the infringement
//     (transferred to the service owner), logs/technical
//     elements; the FAQ adds category-first and no personal
//     data in the forwarded fields.
// Reporter-identity fields are never prepared: no slice
// carries the user's name or address, and every lane's
// fieldsIntro says those boxes are the user's own.
// Run: node tests/test-v1069-form-fields.js
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

// ---------- manifest: this build is 1.0.70 ----------
ok("manifest version is 1.0.70 (combined build)",
  manifest.version === "1.0.70", "got " + manifest.version);
ok("permissions unchanged: storage only",
  JSON.stringify(manifest.permissions) === JSON.stringify(["storage"]));
ok("no new host permissions",
  Array.isArray(manifest.host_permissions) &&
  manifest.host_permissions.length === 11);
ok("buildFormFieldEvidence is exported",
  typeof analyze.buildFormFieldEvidence === "function");

// ---------- the shipped lane data (extracted verbatim) ----------
const m = contentSrc.match(/var HYPER_FORM_HINTS = (\{[\s\S]*?\n  \});/);
ok("HYPER_FORM_HINTS table extractable from content.js", !!m);
const hints = m ? vm.runInNewContext("(" + m[1] + ")") : {};
const mo = contentSrc.match(/var OVH_FORM_HINT = (\{[\s\S]*?\});/);
const ovhHint = mo ? vm.runInNewContext("(" + mo[1] + ")") : {};

function boxes(lane) {
  return (lane.fields || []).map(function (f) { return f.box; });
}
function copies(lane) {
  return (lane.fields || []).map(function (f) { return f.copy; });
}
ok("google fields: the live form's evidence boxes, in order",
  JSON.stringify(boxes(hints.google)) ===
    JSON.stringify(["Abuse date", "Abuse details", "Additional logs"]));
ok("google field slices: date / capped details / logs",
  JSON.stringify(copies(hints.google)) ===
    JSON.stringify(["date", "googleDetails", "logs"]));
ok("aws fields: AWS's published requirements, in order",
  JSON.stringify(boxes(hints.aws)) ===
    JSON.stringify(["Type of abuse", "Source IP and date/time",
      "Log extracts", "URLs in the message"]));
ok("aws field slices: pick-only / incident / logs / raw urls",
  JSON.stringify(copies(hints.aws)) ===
    JSON.stringify([null, "awsIncident", "logs", "urls"]));
ok("ovh fields: the terms' required elements, in order",
  JSON.stringify(boxes(ovhHint)) ===
    JSON.stringify(["Category", "Location", "Description",
      "Logs / technical elements"]));
ok("ovh field slices: pick-only / ip / description / logs",
  JSON.stringify(copies(ovhHint)) ===
    JSON.stringify([null, "ip", "description", "logs"]));
ok("every steps lane carries the identity note (identity boxes are the user's)",
  [hints.google, hints.aws, ovhHint].every(function (l) {
    return typeof l.fieldsIntro === "string" &&
      /never prepares them/.test(l.fieldsIntro);
  }));
ok("steps lanes keep fact/details unset (azure's fact/showLink flags stay azure-only)",
  hints.google.fact === undefined && hints.google.details === undefined &&
  hints.aws.fact === undefined && hints.aws.details === undefined &&
  ovhHint.fact === undefined && ovhHint.details === undefined);
ok("azure declares fields since v1.0.70 (map pinned in the v1070 suite)",
  Array.isArray(hints.azure.fields) &&
  hints.azure.fields.length === 4 &&
  hints.azure.details === undefined &&
  hints.azure.url ===
    "https://msrc.microsoft.com/report/abuse?ThreatType=IpAddress&IncidentType=Spam");

// ---------- panel wiring (the kit segment) ----------
const kitStart = contentSrc.indexOf("var formLane = null;");
const emailStart = contentSrc.indexOf(
  'acc.section("sf-sec-complaint", "sf-btn-green"');
const kitSeg = (kitStart !== -1 && emailStart !== -1)
  ? contentSrc.slice(kitStart, emailStart) : "";
ok("kit segment located", kitSeg.length > 0);
ok("steps render from the lane's fields list, inside the form-lane branch",
  kitSeg.indexOf("if (formLane.fields && formLane.fields.length)") !== -1 &&
  kitSeg.indexOf("buildFormFieldEvidence(a, fld.copy)") !== -1);
ok("steps render under the tenant-account guard (formLane resolution is upstream)",
  contentSrc.indexOf("if (a.msAccountReport)") !== -1 &&
  contentSrc.indexOf("if (a.msAccountReport)") <
    contentSrc.indexOf("if (formLane.fields"));
ok("identity note renders from fieldsIntro",
  kitSeg.indexOf("formLane.fieldsIntro") !== -1);
ok("each step names the form's box and its copy button names it too",
  kitSeg.indexOf('"For the form\\u2019s \\u201C" + fld.box') !== -1 &&
  kitSeg.indexOf('"Copy for the " + fld.box + " field"') !== -1);
ok("a step whose slice cannot be built is skipped, not shown empty",
  kitSeg.indexOf("if (fld.copy && !fTxt) return;") !== -1);
ok("field copy buttons are copy-only: the kit still has exactly one form opener",
  (kitSeg.match(/window\.open\(/g) || []).length === 1 &&
  kitSeg.indexOf("formLane.fields") <
    kitSeg.length); // render exists; opener count pinned above
ok("field copies record no launch (nothing is filed until the user submits)",
  kitSeg.slice(kitSeg.indexOf("if (formLane.fields"))
    .indexOf("recordLaunched") === -1);
ok("no new .sf-btn-label spans (v1.0.70: back to 2 — the Azure copy-details span retired)",
  (contentSrc.match(/"class": "sf-btn-label"/g) || []).length === 2);

// ---------- lib: the slices ----------
// One spam fixture, three forms. Modeled on the real
// GOOGL-2 case (the hyperscaler suite's fixture) with links.
const SPAM = {
  ip: "34.139.191.104",
  org: "Google LLC",
  abuse: "google-cloud-compliance@google.com",
  host: "104.191.139.34.bc.googleusercontent.com",
  from: "Colorami <no-reply@colorami.com>",
  subject: "You Have Incoming Pending messages",
  date: "Wed, 28 Oct 2026 16:35:00 +0000",
  messageId: "<lure@colorami.com>",
  ingressReceived: "from mail-sor-f41.google.com ([34.139.191.104]) " +
    "by ben.ace-host.net with smtp",
  urls: [
    "https://w2.example-phish.com/login",
    "http://cdn.example-phish.com/x.png"
  ],
  fullHeaders:
    "From: Colorami <no-reply@colorami.com>\n" +
    "Subject: You Have Incoming Pending messages\n" +
    "DKIM-Signature: v=1; a=rsa-sha256; d=colorami.com;\n\tb=deadbeefcafe\n" +
    "Received: from mail-sor-f41.google.com ([34.139.191.104]) " +
    "by ben.ace-host.net with smtp\n" +
    "Date: Wed, 28 Oct 2026 16:35:00 +0000",
  bodyText: "Dear customer, verify your pending messages now: " +
    "https://w2.example-phish.com/login"
};
const F = function (k, a) {
  return analyze.buildFormFieldEvidence(a || SPAM, k);
};

// ip / date — the single-value boxes.
ok("ip slice is the bare source IP", F("ip") === "34.139.191.104");
ok("date slice is the ISO day (YYYY-MM-DD) of the message",
  F("date") === "2026-10-28");
ok("date slice is null when the date won't parse (step is skipped)",
  F("date", Object.assign({}, SPAM, { date: "last Tuesday" })) === null);

// urls — raw, one per line, capped at 10.
ok("urls slice carries the literal URLs, one per line (a URL box needs them as-is)",
  F("urls") === SPAM.urls.join("\n") &&
  F("urls").indexOf("[.]") === -1);
const manyUrls = [];
for (let i = 0; i < 12; i++) manyUrls.push("https://link" + i + ".example/x");
ok("urls slice caps at 10",
  F("urls", Object.assign({}, SPAM, { urls: manyUrls }))
    .split("\n").length === 10);
ok("urls slice is null with no URLs (step is skipped)",
  F("urls", Object.assign({}, SPAM, { urls: [] })) === null);

// googleDetails — sized for the 1,000-character box.
const gd = F("googleDetails");
ok("google details: fits the form's 1,000-character cap",
  gd.length <= 1000, "got " + gd.length);
ok("google details: IP, From, Subject, defanged link",
  gd.indexOf("IP address 34.139.191.104") !== -1 &&
  gd.indexOf("From: Colorami <no-reply@colorami.com>") !== -1 &&
  gd.indexOf("Subject: You Have Incoming Pending messages") !== -1 &&
  gd.indexOf("hxxps://w2[.]example-phish[.]com/login") !== -1);
ok("google details: points at the logs upload for the headers",
  gd.indexOf("Additional logs") !== -1 &&
  gd.indexOf("Full headers (plain text") === -1);
const gdBig = F("googleDetails", Object.assign({}, SPAM, {
  fullHeaders: "X-Filler: " + "a".repeat(9000) + "\n" +
    "From: Colorami <no-reply@colorami.com>"
}));
ok("google details: still within cap with a giant header block",
  gdBig.length <= 1000 && gdBig.indexOf("aaaaaaaa") === -1);

// awsIncident — AWS's incident lines.
const aw = F("awsIncident");
ok("aws incident: type, ISO 8601 date/time, time zone, source IP",
  aw.indexOf("Type of abuse: Spam / phishing email") !== -1 &&
  aw.indexOf("2026-10-28T16:35:00.000Z") !== -1 &&
  aw.indexOf("Time zone: UTC") !== -1 &&
  aw.indexOf("Source IP address: 34.139.191.104") !== -1);
ok("aws incident: claimed sender and subject ride along",
  aw.indexOf("Claimed sender: Colorami <no-reply@colorami.com>") !== -1 &&
  aw.indexOf("Subject: You Have Incoming Pending messages") !== -1);

// logs — Received line + trimmed full headers.
const lg = F("logs");
ok("logs: ingress Received line first, then the full headers",
  lg.indexOf("Received: from mail-sor-f41.google.com " +
    "([34.139.191.104])") !== -1 &&
  lg.indexOf("Full headers (plain text, as received):") !== -1 &&
  lg.indexOf("Received: from mail-sor-f41.google.com") <
    lg.indexOf("Full headers"));
ok("logs: signatures stripped like every other lane (trimHeaders)",
  lg.indexOf("DKIM-Signature") === -1 &&
  lg.indexOf("deadbeefcafe") === -1 &&
  lg.indexOf("signature blocks omitted") !== -1);
const lgBig = F("logs", Object.assign({}, SPAM, {
  fullHeaders: "X-Filler: " + "a".repeat(12000)
}));
ok("logs: header evidence capped at 8000 with the usual note",
  lgBig.indexOf("[headers truncated at 8000 characters]") !== -1 &&
  lgBig.length < 8400);
ok("logs: falls back to key headers with no full block",
  F("logs", Object.assign({}, SPAM, { fullHeaders: "" }))
    .indexOf("Message-ID: <lure@colorami.com>") !== -1);
ok("logs: null with neither headers nor a Received line (step is skipped)",
  F("logs", Object.assign({}, SPAM,
    { fullHeaders: "", ingressReceived: null })) === null);

// description — OVHcloud's facts-only narrative.
const de = F("description");
ok("description: summary, facts, defanged links, body excerpt",
  de.indexOf("sent from IP address 34.139.191.104") !== -1 &&
  de.indexOf("Source IP: 34.139.191.104") !== -1 &&
  de.indexOf("hxxps://w2[.]example-phish[.]com/login") !== -1 &&
  de.indexOf("Message body (plain text, links defanged):") !== -1 &&
  de.indexOf("verify your pending messages") !== -1);
ok("description: NO full headers (those ride the logs step)",
  de.indexOf("Full headers") === -1 &&
  de.indexOf("DKIM-Signature") === -1);
ok("description: no reporter identity anywhere in the slice",
  de.indexOf("mjf@") === -1 && de.indexOf("spamdodger") === -1 &&
  de.indexOf("Michael") === -1);
const deBig = F("description", Object.assign({}, SPAM, {
  bodyText: "spam ".repeat(3000)
}));
ok("description: capped at 4000 with a truncation note on a monster body",
  deBig.length <= 4000 && deBig.indexOf("truncated") !== -1);

// degenerate inputs.
ok("no IP / no analysis / unknown key -> null",
  analyze.buildFormFieldEvidence({ ip: null }, "ip") === null &&
  analyze.buildFormFieldEvidence(null, "ip") === null &&
  F("nonsense") === null);

// ---------- the tenant case stays out of every kit ----------
// Detection join: a Google Cloud RDAP still resolves to the
// google lane whose fields render above, while the tenant
// guard upstream of the whole form-lane branch (pinned in
// test-v1067/v1069) keeps MS account mail in the email lane.
function vcard(fn, email) {
  const rows = [["version", {}, "text", "4.0"], ["fn", {}, "text", fn]];
  if (email) rows.push(["email", {}, "text", email]);
  return ["vcard", rows];
}
ok("google cloud RDAP still resolves to the google steps lane",
  analyze.hyperscalerOf({
    name: "GOOGLE-CLOUD",
    entities: [{ roles: ["registrant"], vcardArray: vcard("Google LLC") }]
  }) === "google" && !!hints.google.fields);
ok("small host still resolves to no form lane at all",
  analyze.hyperscalerOf({
    name: "HETZNER-1608237",
    entities: [{ roles: ["registrant"], vcardArray: vcard("Hetzner Online GmbH") }]
  }) === null);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
