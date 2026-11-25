"use strict";
// Spam Avenger v1.0.80 — the Alibaba Cloud form lane, in
// both of the places Alibaba deflects to a form:
//
// (1) REGISTRAR desk — Alibaba Cloud Computing Ltd. d/b/a
// HiChina. NOT form-only: Alibaba's own documentation
// lists DomainAbuse@service.aliyun.com as a reporting
// method and the desk answered Michael's live fkjigh.com
// complaint (the luxury-watch spam's sending domain) the
// same morning it was sent, Nov 24 2026 — but the reply
// closed by directing reports to the Alibaba Cloud
// Reporting Center (https://www.alibabacloud.com/report),
// the form-preference pattern the other registrar lanes
// exist for. So the lane carries emailStays: the panel
// renders the form kit as the front door AND keeps the
// registrar email complaint below it — the AWS two-door
// shape, on the registrar lane. The Reporting Center is
// a script-driven page that has not been walked, so the
// kit claims no description cap and its guide is marked
// provisional, like the v1.0.74 unwalked desks.
// (2) HOST desk — Alibaba Cloud IP space joins
// hyperscalerOf ("alibaba"), with a HYPER_FORM_HINTS kit
// whose steps follow Alibaba's published reporting
// guidance (choose "Illegal Information Reporting", not
// the intellectual-property "Infringement Reporting";
// attach valid proof) rather than the form's pixels —
// the AWS kit's discipline. Its emailTo door is the
// same DomainAbuse desk, with the lane's own heading and
// note (the door block's text moved onto the lane
// entries this build; AWS's entry carries its v1.0.74
// text verbatim).
// No reportfill auto-fill: the form is unwalked and
// JS-rendered, so the lane is a copy-box kit + straight
// link, and reportfill/manifest gain no alibabacloud
// wiring.
//
// Run: node tests/test-v1080-alibaba-form-lane.js

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const contentSrc = fs.readFileSync(path.join(ROOT, "content.js"), "utf8");
const libSrc = fs.readFileSync(path.join(ROOT, "lib", "analyze.js"), "utf8");
const rfSrc = fs.readFileSync(path.join(ROOT, "reportfill.js"), "utf8");
const analyze = require(path.join(ROOT, "lib", "analyze.js"));
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); }
}

// ---------- manifest ----------
ok("manifest: version is 1.0.80", manifest.version === "1.0.84");
ok("manifest: no reportfill wiring for alibabacloud " +
   "(the form is unwalked — kit + link only)",
  JSON.stringify(manifest).indexOf("alibabacloud") === -1 &&
  rfSrc.indexOf("alibabacloud") === -1);

// ---------- (1) lib: the registrar lane ----------
const lane = analyze.registrarFormLane;

// The live case: fkjigh.com, the luxury-watch spam's
// sending domain (Oct 15 2026 run; complaint answered
// Nov 24 2026 with the form deflection).
const ali = lane({ registrarInfo: {
  registrar: "Alibaba Cloud Computing Ltd. d/b/a HiChina",
  registrarAbuse: "DomainAbuse@service.aliyun.com" } });
ok("alibaba registrar: the fkjigh.com record matches " +
   "(RDAP name + abuse contact)",
  !!ali && ali.kit === "alibaba" && ali.label === "Alibaba Cloud");
ok("alibaba registrar: the form is the Reporting Center",
  !!ali && ali.url === "https://www.alibabacloud.com/report" &&
  ali.linkText === "www.alibabacloud.com/report");
ok("alibaba registrar: the lane keeps the email door " +
   "(emailStays — the desk reads email; the form is the " +
   "front door, not the only door)",
  !!ali && ali.emailStays === true);
ok("alibaba registrar: NO description cap claimed " +
   "(the form is unwalked; the builder's own default " +
   "governs, like the v1.0.74 desks)",
  !!ali && ali.descriptionCap == null);
const aliName = lane({ registrarInfo: {
  registrar: "HiChina", registrarAbuse: "abuse@example.org" } });
ok("alibaba registrar: a HiChina-only RDAP name matches " +
   "on its own", !!aliName && aliName.kit === "alibaba");
const aliAbuse = lane({ registrarInfo: {
  registrar: "Some Registrar Co.",
  registrarAbuse: "domainabuse@service.aliyun.com" } });
ok("alibaba registrar: an aliyun.com abuse contact " +
   "matches on its own",
  !!aliAbuse && aliAbuse.kit === "alibaba");
ok("alibaba registrar: a lookalike domain does NOT match",
  lane({ registrarInfo: { registrar: "Some Registrar Co.",
    registrarAbuse: "abuse@aliyun.com.evil.example" } }) === null);
ok("precedence preserved: Wanshang still wins its record",
  (lane({ registrarInfo: { registrar: "Wanshang Technology",
    registrarAbuse: "abuse@kh86.cn" } }) || {}).kit === "wanshang");
ok("precedence preserved: GoDaddy still wins its record",
  (lane({ registrarInfo: { registrar: "GoDaddy.com, LLC",
    registrarAbuse: "abuse@godaddy.com" } }) || {}).kit === "godaddy");
ok("precedence preserved: July Name still wins its record",
  (lane({ registrarInfo: { registrar: "July Name Limited",
    registrarAbuse: "abuse@julyname.com" } }) || {}).kit ===
    "julyname");
ok("precedence preserved: an unknown registrar gets no lane",
  lane({ registrarInfo: { registrar: "NameCheap, Inc.",
    registrarAbuse: "abuse@namecheap.com" } }) === null);

// Short evidence for the new lane: the shared closing,
// never a screenshot line (the Center is not known to
// take one), and inside the default cap.
const aliSpam = {
  registrarInfo: { registrar: "Alibaba Cloud Computing Ltd. d/b/a HiChina",
    registrarAbuse: "DomainAbuse@service.aliyun.com",
    registered: "2025-12-08T00:00:00Z" },
  senderDomain: "fkjigh.com",
  from: "Gabriella <mjffhovrbvv@fkjigh.com>",
  subject: "[Limited Time Offer] Elevate Your Wristwear - Luxury Watches From $250",
  ip: "196.251.121.138",
  date: "Wed, 15 Oct 2026 12:00:00 +0000"
};
const aliEv = analyze.buildRegistrarShortEvidence(aliSpam);
ok("alibaba registrar: short evidence builds for the lane",
  typeof aliEv === "string" && aliEv.indexOf("fkjigh.com") !== -1);
ok("alibaba registrar: the evidence closes with the shared " +
   "headers-retained line, not a screenshot line",
  !!aliEv &&
  aliEv.indexOf("the complete original message is retained " +
    "by the reporter") !== -1 &&
  aliEv.indexOf("screenshot") === -1);
ok("alibaba registrar: the evidence fits the default cap",
  !!aliEv && aliEv.length <= 1000, aliEv && String(aliEv.length));

// ---------- (2) lib: host detection ----------
function vcard(fn, email) {
  const rows = [["version", {}, "text", "4.0"], ["fn", {}, "text", fn]];
  if (email) rows.push(["email", {}, "text", email]);
  return ["vcard", rows];
}
function entity(roles, fn, email, nested) {
  const e = { roles: roles, vcardArray: vcard(fn, email) };
  if (nested) e.entities = nested;
  return e;
}
// APNIC shape: an ALIBABA net name over an Alibaba
// registrant org.
const aliNet = {
  name: "ALIBABA-CN-NET",
  entities: [entity(["registrant"],
    "Alibaba (China) Technology Co., Ltd.")]
};
ok("alibaba host: ALIBABA net name + Alibaba org -> 'alibaba'",
  analyze.hyperscalerOf(aliNet) === "alibaba");
const aliOrg = {
  name: "APNIC-STATIC",
  entities: [entity(["registrant"], "Alibaba Cloud LLC")]
};
ok("alibaba host: the registrant org alone -> 'alibaba'",
  analyze.hyperscalerOf(aliOrg) === "alibaba");
const aliYunNet = {
  name: "ALIYUN-CN-NET",
  entities: [entity(["registrant"], "Some Holder")]
};
ok("alibaba host: an ALIYUN net name alone -> 'alibaba'",
  analyze.hyperscalerOf(aliYunNet) === "alibaba");
const plainNet = {
  name: "EXAMPLE-NET",
  entities: [entity(["registrant"], "Example Hosting Ltd.")]
};
ok("alibaba host: an unrelated block stays null",
  analyze.hyperscalerOf(plainNet) === null);
ok("host precedence preserved: a Google Cloud block " +
   "still reads 'google'",
  analyze.hyperscalerOf({
    name: "GOOGLE-CLOUD",
    entities: [entity(["registrant"], "Google LLC")]
  }) === "google");

// ---------- (2) content: the host kit ----------
const m = contentSrc.match(/var HYPER_FORM_HINTS = (\{[\s\S]*?\n  \});/);
ok("HYPER_FORM_HINTS table extractable from content.js", !!m);
const hints = m ? vm.runInNewContext("(" + m[1] + ")") : {};
ok("alibaba kit: label + Reporting Center URL",
  hints.alibaba && hints.alibaba.label === "Alibaba Cloud" &&
  hints.alibaba.url === "https://www.alibabacloud.com/report" &&
  hints.alibaba.linkText === "www.alibabacloud.com/report");
ok("alibaba kit: the one fact line is the 5-business-day " +
   "forwarding",
  !!hints.alibaba && typeof hints.alibaba.fact === "string" &&
  hints.alibaba.fact.indexOf("5 business days") !== -1);
ok("alibaba kit: the steps are the published-guidance set",
  !!hints.alibaba && Array.isArray(hints.alibaba.fields) &&
  JSON.stringify(hints.alibaba.fields.map(function (f) {
    return f.box; })) ===
    JSON.stringify(["Report type", "Description",
      "Proof of abuse", "URLs in the message"]) &&
  JSON.stringify(hints.alibaba.fields.map(function (f) {
    return f.copy; })) ===
    JSON.stringify([null, "description", "logs", "urls"]));
ok("alibaba kit: the report-type step names the right " +
   "door (Illegal Information, not Infringement)",
  !!hints.alibaba &&
  hints.alibaba.fields[0].help.indexOf("Illegal Information") !== -1 &&
  hints.alibaba.fields[0].help.indexOf("Infringement") !== -1);
ok("alibaba kit: the intro marks the guide provisional " +
   "and names the possible sign-in",
  !!hints.alibaba &&
  hints.alibaba.fieldsIntro.indexOf("provisional") !== -1 &&
  hints.alibaba.fieldsIntro.indexOf("sign in") !== -1);
ok("alibaba kit: the email door is the DomainAbuse desk, " +
   "with the lane's own heading and note",
  !!hints.alibaba &&
  hints.alibaba.emailTo === "DomainAbuse@service.aliyun.com" &&
  hints.alibaba.emailHeading.indexOf("Alibaba") !== -1 &&
  hints.alibaba.emailNote.indexOf(
    "DomainAbuse@service.aliyun.com") !== -1);
ok("aws kit: the door is unchanged — Trust & Safety, " +
   "with the v1.0.74 heading text now on its entry",
  !!hints.aws &&
  hints.aws.emailTo === "trustandsafety@support.aws.com" &&
  hints.aws.emailHeading ===
    "Or email it instead \u2014 AWS Trust & Safety" &&
  hints.aws.emailNote.indexOf("the fallback") !== -1);
ok("google/azure kits: still no email door",
  !!hints.google && hints.google.emailTo === undefined &&
  !!hints.azure && hints.azure.emailTo === undefined);
ok("content: the door block reads the lane's own " +
   "heading and note",
  contentSrc.indexOf("formLane.emailHeading") !== -1 &&
  contentSrc.indexOf("formLane.emailNote") !== -1);

// The kit's field slices build for a real-shaped message.
const aliMsg = {
  ip: "47.88.10.20",
  org: "Alibaba (China) Technology Co., Ltd.",
  from: "Gabriella <mjffhovrbvv@fkjigh.com>",
  subject: "Luxury Watches From $250",
  date: "Wed, 15 Oct 2026 12:00:00 +0000",
  ingressReceived: "from fkjigh.com ([196.251.121.138])",
  fullHeaders: "Received: from fkjigh.com ([196.251.121.138])\n" +
    "From: Gabriella <mjffhovrbvv@fkjigh.com>\n" +
    "Subject: Luxury Watches From $250",
  urls: ["https://ccs.76j10.com/5reghdf2h/ccgr6y.html"]
};
ok("alibaba kit: the description slice builds",
  typeof analyze.buildFormFieldEvidence(aliMsg, "description") ===
    "string");
ok("alibaba kit: the proof (logs) slice builds",
  typeof analyze.buildFormFieldEvidence(aliMsg, "logs") === "string");
ok("alibaba kit: the URLs slice builds",
  analyze.buildFormFieldEvidence(aliMsg, "urls") ===
    "https://ccs.76j10.com/5reghdf2h/ccgr6y.html");

// ---------- (1) content: the registrar kit ----------
ok("content: v1.0.83 \u2014 the Alibaba kit has its own " +
   "branch in the merged actions box",
  contentSrc.indexOf("function regActionsBox(kit, lane)") !== -1 &&
  contentSrc.indexOf('kit === "alibaba"') !== -1);
ok("content: the box heading tells the truth about " +
   "the desk (answers email, but directs reports to " +
   "its form \u2014 never that email is dead)",
  contentSrc.indexOf("email desk answers, but it directs reports") !== -1 &&
  contentSrc.indexOf("to its own form") !== -1);
ok("content: the guide names the right door and the " +
   "wrong one",
  contentSrc.indexOf("Illegal Information Reporting") !== -1 &&
  contentSrc.indexOf("Infringement Reporting") !== -1);
const aliBoxAt = contentSrc.indexOf('kit === "alibaba"');
const aliBoxEnd = contentSrc.indexOf('kit === "newfold"',
  aliBoxAt);
const aliSeg = aliBoxAt === -1 || aliBoxEnd === -1 ? "" :
  contentSrc.slice(aliBoxAt, aliBoxEnd);
ok("content: v1.0.83 \u2014 the steps carry the " +
   "evidence upload ACTION; the background (5-day " +
   "forwarding, the sign-in lecture, the China-side " +
   "center) is cut from the REGISTRAR kit's steps " +
   "(the host kit's own facts are a different section)",
  aliSeg.indexOf("upload the full original message") !== -1 &&
  aliSeg.indexOf("plain text (.txt) file") !== -1 &&
  aliSeg.indexOf("5 business") === -1 &&
  aliSeg.indexOf("sign in with an Alibaba Cloud") === -1);
ok("content: v1.0.83 \u2014 Alibaba's steps are NOT " +
   "marked provisional (its path is desk-proven by " +
   "the desk's own reply); the provisional line " +
   "belongs to Newfold/eNom only",
  contentSrc.indexOf("This guide is provisional") !== -1);
ok("content: emailStays renders the email door under the " +
   "registrar form kit (heading from the lane's label)",
  contentSrc.indexOf("regFormLane.emailStays") !== -1 &&
  contentSrc.indexOf("regEmailStays") !== -1 &&
  contentSrc.indexOf('"Or email it instead \\u2014 " + regFormLane.label') !== -1);
ok("content: form-only lanes keep the retired-desk " +
   "render (the emailStays conditions are additive)",
  contentSrc.indexOf("(!regFormLane || regEmailStays) && " +
    "a.registrarComplaint") !== -1 &&
  contentSrc.indexOf("(!regFormLane || regEmailStays) && " +
    "ri.registrarAbuse") !== -1);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
