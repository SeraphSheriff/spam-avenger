"use strict";
// Spam Avenger v1.0.77 — the GoDaddy form lane, walked.
//
// The v1.0.74 lane (queued-godaddy-form-lane.md) was
// built from GoDaddy's auto-reply alone: the mailbox is
// unmonitored, reports go through "our Abuse Reporting
// Form" at abuseform.com. Michael's live walk of that
// form (Nov 23 2026, screenshots) showed what the reply
// didn't: abuseform.com is a CATEGORY page — Phishing /
// Malware / Child Safety & Exploitation (CSAM) /
// Intellectual Property Infringement / UK/EU Complaints
// / Public Safety and Illegal Content, each with its own
// Create Report button and not a field in sight. The
// phishing report itself lives on GoDaddy's legal
// portal: https://legalportal.godaddy.com/abuse/phishing
//
// The walked form's real fields, top to bottom:
//   1. "Your Email Address" (text)
//   2. "Company or Brand Being Impersonated *" (REQUIRED)
//   3. "URL, Website, or Domain *" (textarea, REQUIRED;
//      "Enter one (1) per line or separate with commas")
//   4. "Was this viewed from a mobile device?" (checkbox)
//   5. "What country did you view this content from?"
//      (select, defaults to "N/A")
//   6. "Description of Issue" (textarea)
//
// v1.0.77: the lane links STRAIGHT to the phishing form;
// the provisional guide is replaced by a walked one (the
// desk framing stays: the mailbox autoresponds that it
// is not monitored, the form is mandatory); and the lane
// carries per-field steps in the hyperscaler kits'
// fieldsIntro + fields shape, rendered by content.js
// under the kit's button. Two new buildFormFieldEvidence
// slices feed them: "brand" (the From display name — the
// same source reportfill's FTC claimed-company fill
// uses) and "registrarDescription" (the kit's own short
// evidence). The other three v1.0.74 desks (Newfold,
// BrandFocus, eNom) stay provisional and untouched.
//
// Run: node tests/test-v1077-godaddy-walked.js

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const contentSrc = fs.readFileSync(path.join(ROOT, "content.js"), "utf8");
const libSrc = fs.readFileSync(path.join(ROOT, "lib", "analyze.js"), "utf8");
const analyze = require(path.join(ROOT, "lib", "analyze.js"));
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); }
}

// ---------- manifest ----------
ok("manifest: version is 1.0.77", manifest.version === "1.0.74");

// ---------- lib: the lane points at the real form ----------
const gd = analyze.registrarFormLane({ registrarInfo: {
  registrar: "GoDaddy.com, LLC",
  registrarAbuse: "abuse@godaddy.com" } });
ok("godaddy: lane identity unchanged",
  !!gd && gd.kit === "godaddy" && gd.label === "GoDaddy" &&
  gd.registrar === "GoDaddy");
ok("godaddy: the link goes straight to the phishing " +
   "report — no category-page stop",
  !!gd && gd.url ===
    "https://legalportal.godaddy.com/abuse/phishing" &&
  gd.linkText === "legalportal.godaddy.com/abuse/phishing");
ok("lib: the old category-page URL is gone from the lib",
  libSrc.indexOf('"https://abuseform.com/"') === -1);
ok("godaddy: still no description cap claimed (the " +
   "walk showed none; the builder default governs)",
  !!gd && gd.descriptionCap == null);
ok("godaddy: the short closing is still the shared " +
   "headers-retained line",
  !!gd && typeof gd.shortClosing === "string" &&
  gd.shortClosing.indexOf("retained by the reporter") !== -1);

// ---------- lib: the walked field guide ----------
ok("godaddy: the lane carries a fieldsIntro",
  !!gd && typeof gd.fieldsIntro === "string" &&
  gd.fieldsIntro.length > 0 &&
  gd.fieldsIntro.indexOf("red asterisk") !== -1);
const boxes = !!gd && Array.isArray(gd.fields)
  ? gd.fields.map(function (f) { return f.box; }) : [];
ok("godaddy: the steps name the form's six real boxes, " +
   "in the form's order",
  JSON.stringify(boxes) === JSON.stringify([
    "Your Email Address",
    "Company or Brand Being Impersonated",
    "URL, Website, or Domain",
    "Was this viewed from a mobile device?",
    "What country did you view this content from?",
    "Description of Issue" ]),
  JSON.stringify(boxes));
const copies = !!gd && Array.isArray(gd.fields)
  ? gd.fields.map(function (f) { return f.copy; }) : [];
ok("godaddy: the copy slices ride the right boxes " +
   "(email/mobile/country carry none)",
  JSON.stringify(copies) === JSON.stringify(
    [null, "brand", "urls", null, null,
     "registrarDescription"]),
  JSON.stringify(copies));
ok("godaddy: every step carries its help line",
  !!gd && gd.fields.every(function (f) {
    return typeof f.help === "string" && f.help.length > 0;
  }));
ok("godaddy: the mobile step says leave the box alone, " +
   "the country step says leave N/A",
  !!gd && gd.fields[3].help.indexOf("leave the box alone") !== -1 &&
  gd.fields[4].help.indexOf("Leave it there") !== -1);
ok("godaddy: the other three v1.0.74 desks gained no " +
   "field steps (their forms are still unwalked)",
  [analyze.registrarFormLane({ registrarInfo: {
      registrar: "Newfold Digital Inc.",
      registrarAbuse: "abuse-whois@newfold.com" } }),
   analyze.registrarFormLane({ registrarInfo: {
      registrar: "BrandFocus",
      registrarAbuse: "abuse3814@brandfocus.cn" } }),
   analyze.registrarFormLane({ registrarInfo: {
      registrar: "eNom, LLC",
      registrarAbuse: "abuse@enom.com" } })]
    .every(function (l) { return !!l && !l.fields; }));

// ---------- lib: the two new slices ----------
const bffe = analyze.buildFormFieldEvidence;
ok("brand: the From display name is the claimed brand",
  bffe({ from: "PayPal <help@southerncofc.org.au>",
    ip: "203.0.113.9" }, "brand") === "PayPal" &&
  bffe({ from: "\"Louis Vuitton\" <mjf@example.com>",
    ip: "203.0.113.9" }, "brand") === "Louis Vuitton");
ok("brand: no traced IP needed — the slice precedes " +
   "the ip guard",
  bffe({ from: "CPF <x@y.example>" }, "brand") === "CPF");
ok("brand: a bare-address From claims nobody — null, " +
   "so the step is skipped",
  bffe({ from: "help@example.com", ip: "203.0.113.9" },
    "brand") === null &&
  bffe({ from: "", ip: "203.0.113.9" }, "brand") === null &&
  bffe(null, "brand") === null);

const gdSpam = {
  registrarInfo: { registrar: "GoDaddy.com, LLC",
    registrarAbuse: "abuse@godaddy.com",
    registered: "2026-11-01T00:00:00Z" },
  senderDomain: "southerncofc.org.au",
  from: "PayPal <help@southerncofc.org.au>",
  subject: "Verify your account",
  ip: "203.0.113.9",
  date: "Sun, 23 Nov 2026 08:00:00 +0000",
  urls: ["https://phish.example.com/login",
    "http://southerncofc.org.au/verify"]
};
ok("description: the slice IS the kit's short evidence " +
   "(the standard complaint text for the case)",
  bffe(gdSpam, "registrarDescription") ===
    analyze.buildRegistrarShortEvidence(gdSpam) &&
  bffe(gdSpam, "registrarDescription")
    .indexOf("southerncofc.org.au") !== -1);
ok("description: no registrar record — null, step skipped",
  bffe({ from: "X <x@y.example>", ip: "203.0.113.9" },
    "registrarDescription") === null);
ok("urls: the message's links, one per line",
  bffe(gdSpam, "urls") ===
    "https://phish.example.com/login\n" +
    "http://southerncofc.org.au/verify");

// ---------- content: the walked kit ----------
const gdSegStart = contentSrc.indexOf('regKit === "godaddy"');
const gdSegEnd = contentSrc.indexOf(
  "the four new desks' field guides");
const gdSeg = gdSegStart === -1 || gdSegEnd <= gdSegStart
  ? "" : contentSrc.slice(gdSegStart, gdSegEnd);
ok("content: GoDaddy has its own walked-guide branch, " +
   "ahead of the provisional branch",
  gdSegStart !== -1 && gdSeg.length > 0);
ok("content: the walked guide keeps the desk framing " +
   "(mailbox not monitored, form mandatory, API bulk lane)",
  gdSeg.indexOf("is not monitored") !== -1 &&
  gdSeg.indexOf("must go through its form") !== -1 &&
  gdSeg.indexOf("developer API") !== -1);
ok("content: the walked guide states the direct landing " +
   "(the category page is skipped entirely)",
  gdSeg.indexOf("category page is skipped") !== -1 &&
  gdSeg.indexOf("the first thing you see is") !== -1);
ok("content: the walked guide is NOT marked provisional",
  gdSeg.indexOf("provisional") === -1);
ok("content: the registrar render grows the per-field " +
   "steps behind the lane's fields",
  contentSrc.indexOf("if (regFormLane.fields && " +
    "regFormLane.fields.length)") !== -1 &&
  contentSrc.indexOf("regFormLane.fieldsIntro") !== -1 &&
  contentSrc.indexOf(
    "buildFormFieldEvidence(a, gfld.copy)") !== -1 &&
  contentSrc.indexOf('"Filling in the " + ' +
    "regFormLane.label +") !== -1);
ok("content: the provisional branch still serves the " +
   "other three desks",
  contentSrc.indexOf('regKit === "newfold"') !== -1 &&
  contentSrc.indexOf('regKit === "brandfocus"') !== -1 &&
  contentSrc.indexOf('regKit === "enom"') !== -1 &&
  contentSrc.indexOf("This guide is provisional") !== -1);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
