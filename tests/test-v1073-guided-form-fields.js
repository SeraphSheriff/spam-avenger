"use strict";
// Spam Avenger v1.0.73 — guided form fields for the
// LINK-host kit (queued-guided-form-fields.md).
//
// The sender-IP form kits have carried per-field steps
// since 1.0.69 (each form box named, its own slice of the
// evidence, its own copy button). The link-host kit — the
// lane for the site the spam ADVERTISES — pointed at the
// same forms with one evidence block and no per-box
// guidance, and its facts differ (a hosted site, not a
// sender). AWS is the first desk wired: the hint gains
// linkPick / linkFieldsIntro / linkFields, the lib gains
// the headersBody and linkComment slices, and the link kit
// renders the steps in the mail kit's shape. The mail kit
// itself is untouched — its AWS entry is pinned by
// test-v1069-form-fields.js, fact and all.
//
// Run: node tests/test-v1073-guided-form-fields.js

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const contentSrc = fs.readFileSync(path.join(ROOT, "content.js"), "utf8");
const analyze = require(path.join(ROOT, "lib", "analyze.js"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); }
}

// The hint table, extracted the way the house tests do it.
const m = contentSrc.match(
  /var HYPER_FORM_HINTS = (\{[\s\S]*?\n  \});/);
const hints = vm.runInNewContext("(" + m[1] + ")");
const aws = hints.aws;

// ---------- the hint's link side ----------
ok("aws link: the front-door guidance is link-framed",
  typeof aws.linkPick === "string" &&
  aws.linkPick.indexOf("hosted-resource") !== -1 &&
  aws.linkPick.indexOf("advertised in spam") !== -1);
ok("aws link: the intro names the email fallback desk",
  typeof aws.linkFieldsIntro === "string" &&
  aws.linkFieldsIntro.indexOf("trustandsafety@support.aws.com") !== -1);
ok("aws link: three field steps, in the form's order",
  Array.isArray(aws.linkFields) && aws.linkFields.length === 3 &&
  aws.linkFields[0].box === "Complete email header and body" &&
  aws.linkFields[0].copy === "headersBody" &&
  aws.linkFields[1].box === "URL of abusive email content" &&
  aws.linkFields[1].copy === "urls" &&
  aws.linkFields[2].box === "Comments" &&
  aws.linkFields[2].copy === "linkComment",
  JSON.stringify(aws.linkFields && aws.linkFields.map(function (f) {
    return f.box; })));
ok("aws link: the Comments step states the form's cap",
  aws.linkFields[2].help.indexOf("10,000") !== -1);
ok("aws mail kit: untouched (fields, no fact, same url)",
  aws.fields.length === 4 && aws.fact === undefined &&
  aws.url === "https://repost.aws/knowledge-center/report-aws-abuse");

// ---------- the new slices ----------
const a = {
  ip: "34.185.89.135",
  from: "Hair Health Weekly <support@akisiweb.com>",
  subject: "Cellucare",
  date: "Fri, 20 Nov 2026 10:37:00 -0700",
  fullHeaders: "Received: from mail.example by mx.google.com\n" +
    "From: Hair Health Weekly <support@akisiweb.com>\n" +
    "Subject: Cellucare",
  bodyText: "Buy now at https://shop.example.com/cellucare today",
  urls: ["https://shop.example.com/cellucare"],
  linkHost: {
    url: "https://shop.example.com/cellucare",
    domain: "shop.example.com",
    ip: "52.1.2.3",
    host: "Amazon Web Services"
  }
};
const hb = analyze.buildFormFieldEvidence(a, "headersBody");
ok("headersBody: headers first, defanged body after",
  typeof hb === "string" &&
  hb.indexOf("Full headers") !== -1 &&
  hb.indexOf("Message body") !== -1 &&
  hb.indexOf("hxxps://shop[.]example[.]com") !== -1 &&
  hb.indexOf("https://shop.example.com/cellucare today") === -1,
  hb ? hb.slice(-120) : "null");
ok("headersBody: body-only still builds; neither is null",
  typeof analyze.buildFormFieldEvidence(
    { ip: "1.2.3.4", bodyText: "x" }, "headersBody") === "string" &&
  analyze.buildFormFieldEvidence(
    { ip: "1.2.3.4" }, "headersBody") === null);
const lc = analyze.buildFormFieldEvidence(a, "linkComment");
ok("linkComment: the hosting frame, with the link facts",
  typeof lc === "string" &&
  lc.indexOf("hosted by Amazon Web Services") !== -1 &&
  lc.indexOf("advertised in an unsolicited bulk email") !== -1 &&
  lc.indexOf("Advertised page: https://shop.example.com/cellucare") !== -1 &&
  lc.indexOf("Website IP: 52.1.2.3") !== -1 &&
  lc.indexOf("Originating IP: 34.185.89.135") !== -1,
  lc || "null");
ok("linkComment: no headers ride in the comment slice",
  !!lc && lc.indexOf("Full headers") === -1 &&
  lc.indexOf("Received: from mail.example") === -1);
ok("linkComment: fits the form's 10,000 cap",
  !!lc && lc.length <= 10000);

// ---------- the render wiring ----------
// (The link-host section renders inside
// renderDomainTraceSections, after the traces land.)
const linkAt = contentSrc.indexOf("function renderDomainTraceSections");
const linkSlice = contentSrc.slice(linkAt);
ok("render: the link kit renders the hint's link steps",
  linkSlice.indexOf("lHint.linkFields") !== -1 &&
  linkSlice.indexOf('"Filling in the " + lHint.label +') !== -1 &&
  linkSlice.indexOf("buildFormFieldEvidence(a, fld.copy)") !== -1);
ok("render: the steps use the mail kit's shape (own box, own copy button)",
  linkSlice.indexOf('"sf-form-fields"') !== -1 &&
  linkSlice.indexOf('"sf-form-field"') !== -1 &&
  linkSlice.indexOf('"Copy for the " + fld.box + " field"') !== -1);
ok("render: the link note prefers the link-framed front door",
  linkSlice.indexOf("lHint.linkPick || lHint.pick") !== -1);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
