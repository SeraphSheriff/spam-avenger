"use strict";
// Spam Avenger v1.0.92 — the Cloudflare form lane.
//
// The dead end that started it (Michael's Nov 25 2026
// luxury-bags message): the payload page v2.hocnfl.com
// sits behind Cloudflare, so every lookup lands on
// Cloudflare and the real hosting company never shows
// — the panel could only say the link host was hidden
// and stop. Michael's call: Cloudflare knows who the
// host is, so Spam Avenger gets a lane to Cloudflare's
// own abuse form, which forwards the report to the
// hosting provider and the site operator and gives
// the host the origin address.
//
// The lane, end to end:
//   lib/analyze.js — isCloudflareIp /
//     cloudflareVerdictFromAnswers (pure) /
//     cloudflareFrontedFor (DoH over the existing
//     dns.google plumbing). A link host is flagged
//     when any A record sits in Cloudflare's published
//     ranges; the NS signal (ns.cloudflare.com) only
//     strengthens the verdict (via "ns"), never flags
//     alone.
//   content.js — when origin discovery fails on a
//     front-door link host, the gating asks the
//     Cloudflare question too; a fronted verdict sets
//     a.linkCloudflare, and the Link host section then
//     renders the Cloudflare lane (evidence box + one
//     blue button) instead of only the hidden note.
//     The button copies the evidence, stashes the case
//     (urls / comments / evidence / category / domain)
//     through stashThenOpen and opens the form —
//     /phishing for a fraud-bucket message, the front
//     door otherwise.
//   reportfill.js — on abuse.cloudflare.com the guide
//     pane walks the form: the category line for the
//     case, the evidence-box fill (URLs + the Logs or
//     other evidence of abuse box, judged from the
//     LIVE page, RC01/RC02 discipline), and the
//     notification-choice warning. The fill never
//     searches for the reporter's name / email /
//     confirm-email boxes, never touches a checkbox,
//     radio or button, and never submits.
//
// The form's live structure could not be captured
// from here (script-driven page), so — exactly like
// the AWS lane before the owner's walk — the
// behavioral tests run the REAL extracted pure code
// (plan / guide lines / outcome lines) and the lib's
// real detection, and the DOM-touching fill is pinned
// by source shape. Fixture-built; awaits the owner's
// live test.
//
// v1.0.94 (RC05): the owner's RC04 walk of the real
// form (Nov 25 2026) proved the REQUIRED evidence
// field is "Logs or other evidence of abuse" and the
// Comments box the guide filled is optional — the
// pins below that named the comments fill moved to
// the evidence kind, and the walked-form fill itself
// is driven against a fixture in
// tests/test-v1094-rc05.js.
//
// Run: node tests/test-v1092-cloudflare-lane.js

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const contentSrc = fs.readFileSync(
  path.join(ROOT, "content.js"), "utf8");
const reportfillSrc = fs.readFileSync(
  path.join(ROOT, "reportfill.js"), "utf8");
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
const SA = require(path.join(ROOT, "lib", "analyze.js"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else {
    fail++;
    console.log("  FAIL " + name +
      (extra ? " — " + extra : ""));
  }
}
function flatten(src) {
  return src
    .replace(/"\s*\+\s*\n\s*"/g, "")
    .replace(/\\u201C/g, "“")
    .replace(/\\u201D/g, "”")
    .replace(/\\u2014/g, "—")
    .replace(/\\u2019/g, "’")
    .replace(/\\u2192/g, "→")
    .replace(/\\u26A0/g, "⚠")
    .replace(/\\u2713/g, "✓");
}
const flatContent = flatten(contentSrc);
const flatReport = flatten(reportfillSrc);

// ---------- manifest ----------
ok("manifest: version is 1.0.87 (the publish relabel of " +
  "the RC05 build — bumped to internal 1.0.94 for RC05, " +
  "published as 1.0.87; the lane itself landed in 1.0.92)",
  manifest.version === "1.0.87");
const rfEntry = (manifest.content_scripts || []).filter(
  function (cs) {
    return (cs.js || []).join(" ").indexOf("reportfill") !== -1;
  })[0];
ok("manifest: reportfill runs on abuse.cloudflare.com " +
   "alongside the other filler pages",
  !!rfEntry &&
  rfEntry.matches.indexOf(
    "https://abuse.cloudflare.com/*") !== -1 &&
  rfEntry.matches.indexOf(
    "https://support.aws.amazon.com/*") !== -1);
ok("manifest: host_permissions carry abuse.cloudflare.com",
  (manifest.host_permissions || []).indexOf(
    "https://abuse.cloudflare.com/*") !== -1);

// ---------- lib: the range check ----------
ok("ranges: v2.hocnfl.com's first address (172.67.159.214) " +
   "is Cloudflare",
  SA.isCloudflareIp("172.67.159.214") === true);
ok("ranges: v2.hocnfl.com's second address (104.21.82.170) " +
   "is Cloudflare",
  SA.isCloudflareIp("104.21.82.170") === true);
ok("ranges: 104.24.0.0/14 (the range the front-door set " +
   "lacks) is Cloudflare",
  SA.isCloudflareIp("104.24.9.9") === true &&
  SA.isCloudflareIp("104.27.255.255") === true);
ok("ranges: range edges hold (104.16.0.0 in, 104.28.0.1 out)",
  SA.isCloudflareIp("104.16.0.0") === true &&
  SA.isCloudflareIp("104.28.0.1") === false);
ok("ranges: a non-Cloudflare negative — the Vietnam " +
   "sending address 103.81.85.148 is NOT Cloudflare",
  SA.isCloudflareIp("103.81.85.148") === false);
ok("ranges: public DNS and junk are not Cloudflare",
  SA.isCloudflareIp("8.8.8.8") === false &&
  SA.isCloudflareIp("") === false &&
  SA.isCloudflareIp("not-an-ip") === false &&
  SA.isCloudflareIp("2606:4700:4700::1111") === false);

// ---------- lib: the verdict ----------
function ans(type, data) { return { type: type, data: data }; }
const hocnflA = [ans(1, "172.67.159.214"),
  ans(1, "104.21.82.170")];
const hocnflNs = [ans(2, "ligia.ns.cloudflare.com."),
  ans(2, "henrik.ns.cloudflare.com.")];
let v = SA.cloudflareVerdictFromAnswers(hocnflA, hocnflNs);
ok("verdict: the live v2.hocnfl.com shape flags, via ns",
  !!v && v.fronted === true && v.via === "ns" &&
  v.ips.length === 2);
v = SA.cloudflareVerdictFromAnswers(hocnflA,
  [ans(2, "ns1.example-registrar.com.")]);
ok("verdict: Cloudflare A records with foreign NS flag " +
   "via ip",
  !!v && v.fronted === true && v.via === "ip");
v = SA.cloudflareVerdictFromAnswers(
  [ans(1, "103.81.85.148")], hocnflNs);
ok("verdict: Cloudflare NS alone never flags (DNS " +
   "delegation is not proxying)",
  !!v && v.fronted === false);
v = SA.cloudflareVerdictFromAnswers(
  [ans(1, "203.0.113.7")], [ans(2, "ns1.example.com.")]);
ok("verdict: an ordinary host does not flag",
  !!v && v.fronted === false && v.via === "ip");
ok("verdict: a failed A query (null) asserts nothing",
  SA.cloudflareVerdictFromAnswers(null, hocnflNs) === null);
v = SA.cloudflareVerdictFromAnswers([], hocnflNs);
ok("verdict: an answered-empty A side does not flag",
  !!v && v.fronted === false && v.ips.length === 0);
v = SA.cloudflareVerdictFromAnswers(
  [ans(5, "target.example.com."), ans(1, "172.67.159.214")],
  null);
ok("verdict: CNAME rows are skipped, the A record decides; " +
   "a failed NS query doesn't block the ip verdict",
  !!v && v.fronted === true && v.via === "ip" &&
  v.ips.length === 1);

// ---------- lib: the network half fails silent ----------
SA.cloudflareFrontedFor("v2.hocnfl.com").then(function (r) {
  ok("network: cloudflareFrontedFor resolves (a verdict " +
     "or silent null) and never rejects",
    r === null || typeof r.fronted === "boolean");
  SA.cloudflareFrontedFor("").then(function (r2) {
    ok("network: an empty host resolves null",
      r2 === null);
    finish();
  });
});
function finish() {

// ---------- panel: gating + section wiring ----------
ok("gating: the hidden verdict asks the Cloudflare " +
   "question (cloudflareFrontedFor on the link host)",
  flatContent.indexOf("SA.cloudflareFrontedFor(\n                        linkHostName || linkDomain)") !== -1 ||
  contentSrc.indexOf("SA.cloudflareFrontedFor(") !== -1 &&
  contentSrc.indexOf("linkHostName || linkDomain") !== -1);
ok("gating: a fronted verdict sets a.linkCloudflare " +
   "with host, domain and via (v1.0.93: the via now " +
   "comes from the lib's cloudflareViaFor(info, v) " +
   "decision, so the already-resolved address can " +
   "settle it when the fresh verdict is silent — " +
   "the RC03 live miss)",
  contentSrc.indexOf("a.linkCloudflare = {") !== -1 &&
  contentSrc.indexOf("SA.cloudflareViaFor(info, v)") !== -1 &&
  contentSrc.indexOf("via: via") !== -1);
ok("panel: the Cloudflare branch renders when hidden " +
   "AND flagged, ahead of the plain hidden note",
  (function () {
    const cfAt = contentSrc.indexOf(
      "a.linkHostHidden && a.linkCloudflare");
    const noteAt = contentSrc.indexOf(
      "window.SpamAvenger.HOST_HIDDEN_EXPLANATION",
      contentSrc.indexOf("var lh = a.linkHost;"));
    return cfAt !== -1 && noteAt !== -1 && cfAt < noteAt;
  })());
ok("panel: the section is the Link host Cloudflare lane",
  flatContent.indexOf("Link host — report via Cloudflare") !== -1);
ok("panel: the note says the host is hidden behind " +
   "Cloudflare and the form forwards the report",
  flatContent.indexOf("sits behind Cloudflare. Cloudflare hides the company really hosting it") !== -1 &&
  flatContent.indexOf("forwards your report to the hosting provider and the site operator, and gives the host the real server address") !== -1);
ok("panel: the note flags the contact-details choice " +
   "as the user's alone",
  flatContent.indexOf("whether Cloudflare may pass your contact details to the site operator") !== -1);
ok("panel: the button is the blue copy-and-open shape " +
   "and joins the linkhost badge targets",
  contentSrc.indexOf("id: \"sf-open-cf-form\"") !== -1 &&
  flatContent.indexOf("Copy evidence & open the Cloudflare abuse form") !== -1 &&
  contentSrc.indexOf("badgeTargets.linkhost.els.push(cfBtn)") !== -1);
ok("panel: a fraud-bucket message opens the phishing " +
   "form, anything else the front door — read at click time",
  contentSrc.indexOf("var cfPhish = a.bucket === \"fraud\";") !== -1 &&
  contentSrc.indexOf("\"https://abuse.cloudflare.com/phishing\"") !== -1 &&
  contentSrc.indexOf("\"https://abuse.cloudflare.com/\"") !== -1);
ok("panel: the stash carries the cloudflare payload " +
   "(urls, comments, evidence, category, domain)",
  contentSrc.indexOf("cloudflare: {") !== -1 &&
  contentSrc.indexOf("category: cfPhish ? \"phishing\" : \"general\"") !== -1 &&
  contentSrc.indexOf("domain: a.linkCloudflare.host || \"\"") !== -1);
ok("stash: stashThenOpen stores the cloudflare key, " +
   "null for every other lane",
  contentSrc.indexOf("cloudflare: (extra && extra.cloudflare) || null,") !== -1);
ok("panel: the launch records as the linkhost lane",
  (function () {
    const at = contentSrc.indexOf("sf-open-cf-form");
    const seg = contentSrc.slice(at, at + 4200);
    return seg.indexOf("recordLaunched(\"linkhost\")") !== -1 &&
      seg.indexOf("applyLaunchedBadge(\"linkhost\"") !== -1;
  })());

// ---------- reportfill: dispatch + guide ----------
ok("guide: abuse.cloudflare.com is a guide host",
  reportfillSrc.indexOf("function isCloudflareHost()") !== -1 &&
  reportfillSrc.indexOf("location.hostname === \"abuse.cloudflare.com\"") !== -1);
ok("guide: the dispatch runs guideCloudflare under " +
   "the Guide header",
  (function () {
    const at = reportfillSrc.indexOf("isCloudflareHost()) {");
    const seg = reportfillSrc.slice(at, at + 600);
    return seg.indexOf("Diag.setHeader(\"Spam Avenger Guide\")") !== -1 &&
      seg.indexOf("guideCloudflare(stash)") !== -1;
  })());
ok("guide: no stash payload stands the lane down " +
   "gracefully, naming the panel button",
  flatReport.indexOf("I don't have a case loaded for this form. Open the message in Gmail and use Spam Avenger's Cloudflare button in the Link host section") !== -1);

// ---------- extraction of the real pure code ----------
function extractFn(src, name) {
  const start = src.indexOf("function " + name + "(");
  if (start === -1) return null;
  let depth = 0, j = src.indexOf("{", start);
  for (; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") {
      depth--;
      if (!depth) break;
    }
  }
  return src.slice(start, j + 1);
}
const sandbox = {};
["cloudflarePlan", "cloudflareGuideLines",
 "cloudflareOutcomeLines"].forEach(function (n) {
  const code = extractFn(reportfillSrc, n);
  if (code) vm.runInNewContext(code, sandbox);
});
ok("extract: the plan, guide-lines and outcome-lines " +
   "functions are present and load",
  typeof sandbox.cloudflarePlan === "function" &&
  typeof sandbox.cloudflareGuideLines === "function" &&
  typeof sandbox.cloudflareOutcomeLines === "function");

const stash = {
  from: "\"Louis Vuitton\" <mjfwhere@jiuzhicui.com>",
  subject: "[Black Friday 2026 Deals] Luxury Bags",
  urls: ["https://v2.hocnfl.com/56revv2/fvew26fg.html"],
  cloudflare: {
    urls: ["https://v2.hocnfl.com/56revv2/fvew26fg.html",
      "https://v2.hocnfl.com/v2.jpg"],
    comments: "Facts narrative for the comments box.",
    evidence: "URLs in the message:\nhttps://v2.hocnfl.com/x",
    category: "phishing",
    domain: "v2.hocnfl.com"
  }
};
const plan = sandbox.cloudflarePlan(stash);
ok("plan: carries the payload's slices",
  plan.domain === "v2.hocnfl.com" &&
  plan.category === "phishing" &&
  plan.comments === "Facts narrative for the comments box." &&
  plan.urls.length === 2 &&
  plan.urlsText ===
    "https://v2.hocnfl.com/56revv2/fvew26fg.html\n" +
    "https://v2.hocnfl.com/v2.jpg");
const plan2 = sandbox.cloudflarePlan({
  urls: ["https://example.com/a"],
  cloudflare: { category: "something-else" } });
ok("plan: a non-phishing category falls back to " +
   "general, and the stash's own urls ride when the " +
   "payload carries none",
  plan2.category === "general" &&
  plan2.urlsText === "https://example.com/a" &&
  plan2.comments === "" && plan2.evidence === "");

const gl = sandbox.cloudflareGuideLines(plan);
ok("guide lines: the forwarding fact leads",
  gl[0].indexOf("forwards your report to the hosting provider") !== -1 &&
  gl[0].indexOf("real server address") !== -1);
ok("guide lines: a phishing case names Phishing & " +
   "Malware as the category to hold",
  gl[1].indexOf("Phishing & Malware") !== -1 &&
  gl[1].indexOf("change it to that one") !== -1);
const gl2 = sandbox.cloudflareGuideLines(plan2);
ok("guide lines: a general case names General as the " +
   "closest fit and Phishing & Malware as the upgrade",
  gl2[1].indexOf("General") !== -1 &&
  gl2[1].indexOf("closest") !== -1 &&
  gl2[1].indexOf("Phishing & Malware") !== -1);
ok("guide lines: the never-fills line covers name and " +
   "email and submitting",
  gl[2].indexOf("never fills those in") !== -1 &&
  gl[2].indexOf("never submits the form") !== -1);
ok("guide lines: the notification warning names the " +
   "operator as the criminal and forbids sending " +
   "contact details there (v1.0.94: it rides fifth — " +
   "the Lumen sharing line joined ahead of it)",
  gl[4].indexOf("operator is the criminal") !== -1 &&
  gl[4].indexOf("do not let the form send your contact details to the operator") !== -1 &&
  gl[4].indexOf("never touches those choices") !== -1);

let lines = sandbox.cloudflareOutcomeLines(plan,
  { urls: "notfound", evidence: "filled" });
ok("outcomes: a missing URLs box is the blocker and " +
   "leads (never buried under a success line)",
  lines.lead.indexOf("couldn't find the URLs box") !== -1);
lines = sandbox.cloudflareOutcomeLines(plan,
  { urls: "filled", evidence: "notfound" });
ok("outcomes: a missing logs/evidence box leads when " +
   "the URLs fill landed (v1.0.94: the evidence kind " +
   "replaced the RC04 comments kind — the walked " +
   "form's required field is the blocker that matters)",
  lines.lead.indexOf("couldn't find the form's logs-or-evidence box") !== -1);
lines = sandbox.cloudflareOutcomeLines(plan,
  { urls: "filled", evidence: "filled" });
ok("outcomes: a clean fill says so, naming both " +
   "boxes, and the notification warning rides the " +
   "sub-line",
  lines.lead.indexOf("I filled the form's URLs box and logs/evidence box with the evidence.") !== -1 &&
  lines.sub1.indexOf("notification choices") !== -1 &&
  lines.sub1.indexOf("site operator") !== -1);
lines = sandbox.cloudflareOutcomeLines(plan,
  { urls: "user", evidence: "user" });
ok("outcomes: the user's own text is reported as " +
   "left alone, never as a fill",
  lines.lead.indexOf("already hold text") !== -1 &&
  lines.lead.indexOf("left them exactly as they are") !== -1);

// ---------- reportfill: the hard rules, by source ----------
const cfStart = reportfillSrc.indexOf(
  "/* ---------------- Cloudflare abuse form");
const cfSection = cfStart === -1 ? "" :
  reportfillSrc.slice(cfStart);
ok("hard rules: the Cloudflare section exists",
  cfStart !== -1);
ok("hard rules: the field finder searches ONLY the " +
   "urls and evidence kinds (v1.0.94: the evidence " +
   "kind hunts the Logs or other evidence of abuse " +
   "box by label passes; the RC04 comments regex — " +
   "loose enough to land on the optional Comments " +
   "box — is gone)",
  cfSection.indexOf("function cfFindField(kind)") !== -1 &&
  cfSection.indexOf("function cfFindEvidenceBox()") !== -1 &&
  cfSection.indexOf("/logs/i.test(label)") !== -1 &&
  cfSection.indexOf("/evidence of abuse/i") !== -1 &&
  cfSection.indexOf("/comment|detail|description|evidence/i") === -1);
ok("hard rules: the finder never matches name, email " +
   "or confirm fields",
  !/findField\([^)]*(name|e-?mail|confirm)/i.test(cfSection) &&
  cfSection.indexOf("never looked up") !== -1);
ok("hard rules: nothing in the section clicks — no " +
   ".click() anywhere (no submit, no notification " +
   "toggles, no category pick)",
  cfSection.indexOf(".click(") === -1);
ok("hard rules: outcomes are judged live — the " +
   "outcome reader re-finds the box every call",
  cfSection.indexOf("function cfLiveOutcome(plan, kind)") !== -1 &&
  cfSection.indexOf("var el = cfFindField(kind);") !== -1 &&
  cfSection.indexOf("v.indexOf(probe) !== -1 ? \"filled\" : \"user\"") !== -1);
ok("hard rules: a box holding the user's text is " +
   "never a fill target (the watch fills only " +
   "live-empty boxes, capped at 3 attempts)",
  cfSection.indexOf("cfLiveOutcome(plan, kind) !== \"empty\"") !== -1 &&
  cfSection.indexOf("attempts[kind] >= 3") !== -1);
ok("hard rules: the confirmation watch clears the " +
   "single-use stash",
  cfSection.indexOf("cfConfirmationPresent()") !== -1 &&
  cfSection.indexOf("clearStash();") !== -1 &&
  flatReport.indexOf("Cloudflare has your report ✓") !== -1);
ok("guide: the pane extra is handed over as a " +
   "builder function, not a built node (the v1.0.88 " +
   "slip, pinned)",
  cfSection.indexOf("Diag.setExtra(function () {\n      return buildCloudflareExtra(plan);\n    });") !== -1 ||
  cfSection.indexOf("Diag.setExtra(function () {") !== -1 &&
  cfSection.indexOf("return buildCloudflareExtra(plan);") !== -1);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
}
