// Spam Avenger v1.0.64 — form-lane (hyperscaler + OVH) tests.
// The form-kit design (Michael's call, 2026-10-28, superseding
// the same-day hint build): when the traced host sits on a
// Google Cloud / AWS / Azure block (lib/analyze.js
// hyperscalerOf) or is OVHcloud (the v1.0.27 contact/org
// match), the panel builds NO email complaint — those desks
// deflect emailed complaints to their own abuse form anyway,
// so building the email first just hands them the excuse. The
// Abuse complaint section renders as a FORM KIT instead: a
// blue "Abuse report — use their form" section holding the
// prepared evidence block (lib buildFormEvidence) and a
// button opening the provider's abuse form. Detection is
// RDAP-identity only and must never trip on big MAILBOX
// providers — that path is skipComplaint and is pinned
// untouched here. RDAP fixtures mirror the real records
// fetched 2026-10-28 (ARIN RDAP for 35.233.242.130,
// 52.0.0.1, 13.64.0.1; plus the GOOGL-2 miss on
// 34.139.191.104 and the plain-GOOGLE POC check on
// 142.250.80.1 / 8.8.8.8).
// Run: node tests/test-hyperscaler-hint.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const contentSrc = fs.readFileSync(path.join(ROOT, "content.js"), "utf8");
const analyzeSrc = fs.readFileSync(
  path.join(ROOT, "lib", "analyze.js"), "utf8");
const analyze = require(path.join(ROOT, "lib", "analyze.js"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); }
}

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

// ---------- wiring: investigate() sets the flag ----------
ok("investigate() assigns a.hyperscaler from the fetched RDAP",
  analyzeSrc.indexOf("a.hyperscaler = rdap ? hyperscalerOf(rdap) : null;")
    !== -1);
ok("hyperscalerOf is exported for the panel/tests",
  typeof analyze.hyperscalerOf === "function");
ok("buildFormEvidence is exported for the panel/tests",
  typeof analyze.buildFormEvidence === "function");

// ---------- detection: the real Google Cloud case ----------
// ARIN RDAP for 35.233.242.130 (the message Michael live-tested):
// net GOOGLE-CLOUD, registrant Google LLC, nested abuse POC
// "GC Abuse" <google-cloud-compliance@google.com>.
const gcpRdap = {
  name: "GOOGLE-CLOUD",
  entities: [entity(["registrant"], "Google LLC", null, [
    entity(["noc", "abuse"], "GC Abuse",
      "google-cloud-compliance@google.com")])]
};
ok("Google Cloud block (real case) -> hyperscaler 'google'",
  analyze.hyperscalerOf(gcpRdap) === "google");
ok("real case org resolves to Google LLC",
  analyze.extractOrg(gcpRdap) === "Google LLC");
ok("real case abuse contact is the cloud compliance desk",
  analyze.extractAbuse(gcpRdap) === "google-cloud-compliance@google.com");

// ---------- detection: the GOOGL-2 miss (Michael's live test) ----------
// ARIN RDAP for 34.139.191.104: net GOOGL-2 (NET-34-128-0-0-1),
// registrant Google LLC — no CLOUD token anywhere in name/org,
// so the original name/org rules returned null, yet the
// complaint correctly targeted the GC Abuse POC (GCABU-ARIN,
// fn "GC Abuse", google-cloud-compliance@google.com — the
// same desk as GOOGLE-CLOUD's). The abuse-POC identity is now
// a signal.
function withHandle(e, handle) { e.handle = handle; return e; }
const googl2 = {
  name: "GOOGL-2",
  entities: [withHandle(entity(["registrant"], "Google LLC", null, [
    withHandle(entity(["noc", "abuse"], "GC Abuse",
      "google-cloud-compliance@google.com"), "GCABU-ARIN"),
    withHandle(entity(["technical", "administrative"], "Google LLC",
      "arin-contact@google.com"), "ZG39-ARIN")]), "GOOGL-2")]
};
ok("GOOGL-2 block (real missed case) -> 'google' via GC Abuse POC",
  analyze.hyperscalerOf(googl2) === "google");
ok("missed case complaint still lands on Cloud Compliance",
  analyze.extractAbuse(googl2) === "google-cloud-compliance@google.com");
// The fn signal alone (no cloud email on the POC) also fires.
const gcFnOnly = {
  name: "GOOGL-2",
  entities: [entity(["registrant"], "Google LLC", null, [
    entity(["abuse"], "GC Abuse")])]
};
ok("GC Abuse fn without the cloud email -> 'google'",
  analyze.hyperscalerOf(gcFnOnly) === "google");

// ---------- detection: AWS shapes ----------
// EC2-flavored named block.
const awsNamed = {
  name: "AMAZON-EC2-7",
  entities: [entity(["registrant"], "Amazon Technologies Inc.")]
};
ok("AMAZON-EC2 net name -> 'aws'",
  analyze.hyperscalerOf(awsNamed) === "aws");
// The 52.0.0.0/10 allocation: net name is the handle-style
// "AT-88-Z"; the registrant org carries the identity.
const awsHandleNamed = {
  name: "AT-88-Z",
  entities: [entity(["registrant"], "Amazon Technologies Inc.", null, [
    entity(["abuse"], "Amazon EC2 Abuse",
      "trustandsafety@support.aws.com")])]
};
ok("handle-named AWS block (AT-88-Z) -> 'aws' via registrant org",
  analyze.hyperscalerOf(awsHandleNamed) === "aws");
// The AEA8-ARIN "Amazon EC2 Abuse" POC (verified on AT-88-Z and
// AMAZON-S3, 2026-10-28) is a signal in its own right: it fires
// even when neither the net name nor the registrant org says
// Amazon.
const awsPocOnly = {
  name: "CUSTOMER-NET-9",
  entities: [entity(["registrant"], "Example Hosting LLC", null, [
    entity(["abuse"], "Amazon EC2 Abuse",
      "trustandsafety@support.aws.com")])]
};
ok("'Amazon EC2 Abuse' POC alone -> 'aws'",
  analyze.hyperscalerOf(awsPocOnly) === "aws");

// ---------- detection: Azure shapes ----------
// ARIN RDAP for 13.64.0.1: net MSFT, registrant Microsoft Corp.
const azureMsft = {
  name: "MSFT",
  entities: [entity(["registrant"], "Microsoft Corporation", null, [
    entity(["abuse"], "Microsoft Abuse Contact", "abuse@microsoft.com")])]
};
ok("MSFT net + Microsoft registrant -> 'azure'",
  analyze.hyperscalerOf(azureMsft) === "azure");
const azureNamed = {
  name: "MICROSOFT",
  entities: [entity(["registrant"], "Microsoft Corporation")]
};
ok("MICROSOFT net name -> 'azure'",
  analyze.hyperscalerOf(azureNamed) === "azure");
const azureNet = {
  name: "AZURE-CLOUD",
  entities: [entity(["registrant"], "Microsoft Corporation")]
};
ok("AZURE net name -> 'azure'",
  analyze.hyperscalerOf(azureNet) === "azure");

// ---------- detection: no false fires ----------
// Ordinary small host: no form lane.
const smallHost = {
  name: "HETZNER-1608237",
  entities: [entity(["registrant"], "Hetzner Online GmbH", null, [
    entity(["abuse"], "Abuse", "abuse@hetzner.com")])]
};
ok("normal small host -> no hyperscaler",
  analyze.hyperscalerOf(smallHost) === null);
// OVHcloud: hyperscalerOf itself stays silent — the OVH form
// lane is the panel's own contact/org match, not the lib flag.
const ovhRdap = {
  name: "OVH",
  entities: [entity(["registrant"], "OVH SAS", null, [
    entity(["abuse"], "Abuse", "abuse@ovh.net")])]
};
ok("OVHcloud -> no hyperscaler flag (panel's own form-lane match)",
  analyze.hyperscalerOf(ovhRdap) === null);
// A plain GOOGLE net block (corporate/mail space, no CLOUD
// marker) must NOT trip the cloud lane.
const googleCorp = {
  name: "GOOGLE",
  entities: [entity(["registrant"], "Google LLC")]
};
ok("plain GOOGLE net block (no cloud marker) -> no hyperscaler",
  analyze.hyperscalerOf(googleCorp) === null);
// And a REALISTIC plain-GOOGLE record stays null too: real
// GOOGLE / GOGL blocks (142.250.80.1, 8.8.8.8 — fetched
// 2026-10-28) carry ABUSE5250-ARIN "Abuse"
// <network-abuse@google.com>, NOT the GC Abuse POC — so the
// POC signal does not widen onto plain Google space.
const googlePlainReal = {
  name: "GOOGLE",
  entities: [entity(["registrant"], "Google LLC", null, [
    entity(["abuse"], "Abuse", "network-abuse@google.com")])]
};
ok("realistic plain GOOGLE (network-abuse POC) -> no hyperscaler",
  analyze.hyperscalerOf(googlePlainReal) === null);
// Azure is deliberately NOT keyed on its abuse POC: MAC74-ARIN
// "Microsoft Abuse Contact" <abuse@microsoft.com> is
// Microsoft's general abuse desk (mail included). A record
// carrying only that POC, with no Azure net/org markers, must
// not fire.
const msAbusePocOnly = {
  name: "CUSTOMER-NET-10",
  entities: [entity(["registrant"], "Example Hosting LLC", null, [
    entity(["abuse"], "Microsoft Abuse Contact", "abuse@microsoft.com")])]
};
ok("Microsoft general abuse POC alone -> no hyperscaler",
  analyze.hyperscalerOf(msAbusePocOnly) === null);
// Degenerate inputs.
ok("hyperscalerOf(null) -> null", analyze.hyperscalerOf(null) === null);
ok("hyperscalerOf({}) -> null", analyze.hyperscalerOf({}) === null);

// ---------- mailbox path untouched ----------
// skipComplaint machinery (PTR whitelist + provider advice) is
// the separate lane for big mailbox providers; pin it intact.
ok("Gmail PTR host still whitelisted (skipComplaint lane intact)",
  analyze.whitelisted("mail-ej1-f52.google.com") === true);
ok("Outlook protection PTR host still whitelisted",
  analyze.whitelisted("outbound.protection.outlook.com") === true);
ok("provider advice for Gmail still present",
  /real Gmail account/.test(analyze.providerAdvice("google.com") || ""));

// ---------- lib: buildFormEvidence (behavioral) ----------
// Fixture mirrors the real fetched message Michael tested
// (the "Incoming Pending Messages" lure spoofing his own
// provider, sent from the GOOGL-2 Google Cloud block).
const evAnalysis = {
  ip: "34.139.191.104",
  org: "Google LLC",
  from: "Colorami <no-reply@colorami.com>",
  subject: "You Have Incoming Pending messages",
  date: "Wed, 28 Oct 2026 16:35:00 +0000",
  messageId: "<lure@colorami.com>",
  ingressReceived: "from mail-sor-f41.google.com ([34.139.191.104]) " +
    "by ben.ace-host.net with smtp",
  fullHeaders:
    "From: Colorami <no-reply@colorami.com>\n" +
    "Subject: You Have Incoming Pending messages\n" +
    "DKIM-Signature: v=1; a=rsa-sha256; d=colorami.com;\n\tb=deadbeefcafe\n" +
    "Received: from mail-sor-f41.google.com ([34.139.191.104]) " +
    "by ben.ace-host.net with smtp\n" +
    "Date: Wed, 28 Oct 2026 16:35:00 +0000"
};
const ev = analyze.buildFormEvidence(evAnalysis);
ok("evidence block builds for a traced analysis",
  typeof ev === "string" && ev.length > 0);
ok("evidence summary names the source IP",
  ev.indexOf("sent from IP address 34.139.191.104") !== -1);
ok("evidence carries the labeled Source IP line",
  ev.indexOf("Source IP: 34.139.191.104") !== -1);
ok("evidence date renders as a UTC stamp",
  ev.indexOf("Date/time (UTC): Wed, 28 Oct 2026 16:35:00 UTC") !== -1);
ok("evidence carries the From line",
  ev.indexOf("From: Colorami <no-reply@colorami.com>") !== -1);
ok("evidence carries the Subject line",
  ev.indexOf("Subject: You Have Incoming Pending messages") !== -1);
ok("evidence carries the ingress Received line",
  ev.indexOf("Received: from mail-sor-f41.google.com " +
    "([34.139.191.104])") !== -1);
ok("evidence includes the full headers",
  ev.indexOf("Full headers (plain text, as received):") !== -1 &&
  ev.indexOf("Date: Wed, 28 Oct 2026 16:35:00 +0000") !== -1);
ok("evidence strips signature blocks (trimHeaders, like the email)",
  ev.indexOf("DKIM-Signature") === -1 &&
  ev.indexOf("deadbeefcafe") === -1 &&
  ev.indexOf("signature blocks omitted") !== -1);
// No full headers: the key-headers fallback still carries the
// ingress line + Message-ID.
const evFallback = analyze.buildFormEvidence({
  ip: "203.0.113.9", from: "x@y.example", subject: "s", date: "",
  messageId: "<m@x>", ingressReceived: "from h ([203.0.113.9]) by mx",
  fullHeaders: ""
});
ok("evidence falls back to key headers without a full block",
  evFallback.indexOf("Key headers as evidence:") !== -1 &&
  evFallback.indexOf("Message-ID: <m@x>") !== -1);
// Unparseable dates pass through raw; missing analysis is null.
ok("unparseable date passes through raw",
  analyze.buildFormEvidence({ ip: "203.0.113.9", date: "last Tuesday" })
    .indexOf("Date/time (UTC): last Tuesday") !== -1);
ok("buildFormEvidence returns null with no IP",
  analyze.buildFormEvidence({ ip: null }) === null &&
  analyze.buildFormEvidence(null) === null);

// ---------- lib: buildComplaint unchanged (the panel decides) ----------
// The lib still builds the email for ANY host with an abuse
// contact — normal hosts AND hyperscalers alike. Only the
// panel's rendering changed.
const emSmall = analyze.buildComplaint({
  ip: "203.0.113.9", abuse: "abuse@hetzner.com",
  host: "static.9.113.0.203.clients.your-server.de",
  from: "a@b.example", subject: "spam", date: "Wed, 28 Oct 2026 00:00:00 +0000",
  fullHeaders: "", bodyText: ""
});
ok("buildComplaint still builds the email for a small host",
  !!emSmall && emSmall.to === "abuse@hetzner.com" &&
  emSmall.subject.indexOf("203.0.113.9") !== -1);
const emHyper = analyze.buildComplaint({
  ip: "34.139.191.104", abuse: "google-cloud-compliance@google.com",
  host: "104.191.139.34.bc.googleusercontent.com",
  from: "a@b.example", subject: "spam", date: "Wed, 28 Oct 2026 00:00:00 +0000",
  fullHeaders: "", bodyText: ""
});
ok("buildComplaint still builds for a hyperscaler (panel suppresses it)",
  !!emHyper && emHyper.to === "google-cloud-compliance@google.com");

// ---------- panel wiring: the form kit replaces email + hint ----------
// Slice the form-kit segment: from the lane resolution to the
// email branch's (green) section creation.
const kitStart = contentSrc.indexOf("var formLane = null;");
const emailStart = contentSrc.indexOf(
  'acc.section("sf-sec-complaint", "sf-btn-green"');
ok("form-lane resolution exists inside the complaint branch",
  kitStart !== -1 && emailStart !== -1 && kitStart < emailStart &&
  kitStart > contentSrc.indexOf("if (a.complaint) {"));
const kitSeg = (kitStart !== -1 && emailStart !== -1)
  ? contentSrc.slice(kitStart, emailStart) : "";
ok("kit section is created before the email section (form lanes first)",
  contentSrc.indexOf('acc.section("sf-sec-complaint", "sf-btn-blue"')
    !== -1 &&
  contentSrc.indexOf('acc.section("sf-sec-complaint", "sf-btn-blue"')
    < emailStart);
ok("kit section toggle is YELLOW and labeled 'Abuse report — use their form'",
  kitSeg.indexOf('acc.section("sf-sec-complaint", "sf-btn-blue"') !== -1 &&
  kitSeg.indexOf("Abuse report ") !== -1 &&
  kitSeg.indexOf(" use their form") !== -1);
ok("hyperscaler check runs before the OVH match (hyperscaler wins)",
  kitSeg.indexOf("a.hyperscaler && HYPER_FORM_HINTS[a.hyperscaler]") !== -1 &&
  kitSeg.indexOf("a.hyperscaler && HYPER_FORM_HINTS[a.hyperscaler]") <
    kitSeg.indexOf("/ovh/i.test(c.to"));
ok("OVH detection regex is unchanged (v1.0.27 contact/org match)",
  contentSrc.indexOf('/ovh/i.test(c.to + " " + (a.org || ""))') !== -1);
ok("OVH match resolves to the OVH form entry",
  kitSeg.indexOf("formLane = OVH_FORM_HINT") !== -1);
ok("kit instruction copy ships (form is the only lane, box holds the ask)",
  kitSeg.indexOf("only acts on reports sent through ") !== -1 &&
  kitSeg.indexOf("deflected to that form anyway") !== -1 &&
  kitSeg.indexOf("prepared in the box below") !== -1);
ok("kit renders the evidence box (title + textarea + lib builder)",
  kitSeg.indexOf("Form evidence \\u2014 paste into the ") !== -1 &&
  kitSeg.indexOf('id: "sf-evidence-text"') !== -1 &&
  kitSeg.indexOf("buildFormEvidence(a)") !== -1);
ok("kit form button: id, blue, copy+open label, copies evidence then opens the lane URL",
  kitSeg.indexOf('id: "sf-open-abuse-form"') !== -1 &&
  kitSeg.indexOf('"class": "sf-btn-blue"') !== -1 &&
  kitSeg.indexOf('"Copy evidence & open the " + formLane.label + " abuse form"') !== -1 &&
  kitSeg.indexOf('document.execCommand("copy")') !== -1 &&
  kitSeg.indexOf("navigator.clipboard.writeText(eta.value)") !== -1 &&
  kitSeg.indexOf('window.open(formLane.url, "_blank", "noopener")') !== -1);
ok("kit has NO email UI (no compose, no complaint text, no textarea)",
  kitSeg.indexOf("sf-compose") === -1 &&
  kitSeg.indexOf("Open in Gmail") === -1 &&
  kitSeg.indexOf("Ready-to-send complaint") === -1 &&
  kitSeg.indexOf('"To: " + c.to') === -1 &&
  kitSeg.indexOf("sf-complaint-text") === -1 &&
  kitSeg.indexOf("Heads up") === -1);
ok("old hint machinery is gone panel-wide (both Heads-ups, both notes)",
  contentSrc.indexOf("hsNote") === -1 &&
  contentSrc.indexOf("ovhNote") === -1 &&
  contentSrc.indexOf("Heads up: this host is") === -1 &&
  contentSrc.indexOf("Heads up: this server belongs to OVHcloud") === -1 &&
  contentSrc.indexOf("desk may not act on an emailed complaint") === -1);
// The email branch below the kit is untouched.
const emailSeg = emailStart !== -1
  ? contentSrc.slice(emailStart,
      contentSrc.indexOf("} else if (a.ip && !a.skipComplaint)")) : "";
ok("email branch intact (green toggle, complaint box, Open in Gmail)",
  emailSeg.indexOf("Abuse complaint \\u2014 ready to send") !== -1 &&
  emailSeg.indexOf("Ready-to-send complaint") !== -1 &&
  emailSeg.indexOf('id: "sf-complaint-text"') !== -1 &&
  emailSeg.indexOf('id: "sf-compose"') !== -1 &&
  emailSeg.indexOf("Open in Gmail \\u2014 just click Send") !== -1);

// ---------- the shipped form-lane data (extracted verbatim) ----------
const m = contentSrc.match(/var HYPER_FORM_HINTS = (\{[\s\S]*?\n  \});/);
ok("HYPER_FORM_HINTS table extractable from content.js", !!m);
const hints = m ? vm.runInNewContext("(" + m[1] + ")") : {};
ok("google lane: label + verified form URL",
  hints.google && hints.google.label === "Google Cloud" &&
  hints.google.url ===
    "https://support.google.com/code/contact/cloud_platform_report");
ok("aws lane: label + verified abuse-report URL",
  hints.aws && hints.aws.label === "Amazon AWS" &&
  hints.aws.url === "https://repost.aws/knowledge-center/report-aws-abuse");
ok("azure lane: label + verified MSRC abuse URL",
  hints.azure && hints.azure.label === "Microsoft Azure" &&
  hints.azure.url === "https://msrc.microsoft.com/report/abuse");
const mo = contentSrc.match(/var OVH_FORM_HINT = (\{[\s\S]*?\});/);
ok("OVH_FORM_HINT extractable from content.js", !!mo);
const ovhHint = mo ? vm.runInNewContext("(" + mo[1] + ")") : {};
ok("ovh lane: label + the URL the retired hint chip used",
  ovhHint.label === "OVHcloud" &&
  ovhHint.url === "https://www.ovhcloud.com/en/abuse/");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
