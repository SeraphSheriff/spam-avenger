"use strict";
// Spam Avenger v1.0.81 — the BrandFocus registrar form
// lane's guide is promoted from provisional to WALKED.
//
// The lane shipped in v1.0.74 with a two-line provisional
// guide: BrandFocus (brandfocus.cn) retired its email
// desk (abuse3814@brandfocus.cn auto-replies, in Chinese
// and English, that the mailbox will no longer accept
// domain name abuse complaints) and pointed at
// https://zy.nameabuse.net/ — but the form had never been
// walked, so the lane claimed no description cap and the
// guide said only what the reply proved. Michael hit
// that thinness live on Nov 24 2026: the published build
// said "use their form" and gave him almost nothing to
// walk in with.
//
// The walk facts were already on file: zy.nameabuse.net
// is the same nameabuse reporting service Wanshang uses
// (ws.nameabuse.net), under this registrar's own
// subdomain, run for Guizhou Zhongyu Zhike Network
// Technology Co., Ltd. — the registrar behind the
// BrandFocus desk (Michael's live field case: the RDAP
// registrar name is that legal name; only the abuse
// contact carries the BrandFocus name). Michael's live
// Wanshang filing of Nov 21 2026 (complaint
// WSABUSE-202611212348-8027, status "Under Review")
// walked that service end-to-end: Submit Complaint; an
// emailed 6-digit verification code with a 5-minute
// window (the first code arrived late; a resend was
// used and the second code accepted); a description
// field capped at 2,000 characters; an abuse-URL field
// that rejects URLs on any domain but the complained
// one; a complaint number tracked on the Track
// Complaint page. Michael's live read of
// zy.nameabuse.net on Nov 24 2026 added the platform's
// own Scope of Review: malware, botnet and phishing are
// the DNS Abuse it acts on, while "general spam" is
// Non-DNS Abuse referred to 12321 / the relevant
// authority — so the guide frames a spam report as a
// domain registered and used to send scam spam, with
// the full sample as the evidence.
//
// So this build: the lane claims descriptionCap: 2000
// with Wanshang's cap closing (the short evidence the
// box shows and the button copies now builds against
// the real cap), and the kit leaves the shared
// provisional branch for its own note + walked guide,
// Wanshang-shaped. Newfold, eNom and Alibaba stay
// provisional, untouched.
//
// v1.0.82 supersedes the guide + URL halves of this
// build (the cap half stands): Michael tested the
// walked guide live and killed it — a wall of text no
// user will read — and the lane dumped him on the
// platform homepage to hunt for the form. The guide is
// now eight one-line facts, the lane links submit.php
// itself, and a guide pane on the form picks the spam
// category and fills the details step. The pins below
// were updated to that reality; the pane itself is
// pinned by tests/test-v1082-brandfocus-pane.js.
//
// Run: node tests/test-v1081-brandfocus-walked.js

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const contentSrc = fs.readFileSync(path.join(ROOT, "content.js"), "utf8");
// v1.0.83: the v1082 flatten — joins the source's
// string concatenations back into whole lines and
// decodes its \uXXXX escapes, so shipped copy can be
// asserted exactly.
function flatten(src) {
  return src
    .replace(/"\s*\+\s*\n\s*"/g, "")
    .replace(/\\u201C/g, "\u201C")
    .replace(/\\u201D/g, "\u201D")
    .replace(/\\u2014/g, "\u2014")
    .replace(/\\u2192/g, "\u2192");
}
const flatContent = flatten(contentSrc);
const analyze = require(path.join(ROOT, "lib", "analyze.js"));
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); }
}

// ---------- manifest ----------
ok("manifest: version is 1.0.81", manifest.version === "1.0.86");

// ---------- lib: the lane ----------
const lane = analyze.registrarFormLane;

// Michael's live field case (the Nov 24 2026 luxury-watch
// spam run): the RDAP registrar name is the registrar's
// legal name — only the abuse contact carries the
// BrandFocus name, exactly the Wanshang field case's
// shape (a sister-company RDAP name, the desk's domain
// on the abuse contact).
const bf = lane({ registrarInfo: {
  registrar: "Guizhou Zhongyu Zhike Network Technology Co., Ltd.",
  registrarAbuse: "abuse3814@brandfocus.cn" } });
ok("brandfocus: the field case matches on the abuse " +
   "contact under the registrar's legal name",
  !!bf && bf.kit === "brandfocus" && bf.label === "BrandFocus");
ok("brandfocus: the form is its nameabuse subdomain's " +
   "complaint form itself (v1.0.82 deep link)",
  !!bf && bf.url === "https://zy.nameabuse.net/submit.php" &&
  bf.linkText === "zy.nameabuse.net/submit.php");
ok("brandfocus: the lane now claims the platform's real " +
   "description cap — 2,000 characters",
  !!bf && bf.descriptionCap === 2000);
ok("brandfocus: the closing is the cap closing (headers " +
   "trimmed to fit the description limit), not the " +
   "shared paste-ready line",
  !!bf &&
  bf.shortClosing.indexOf("fit the form's description " +
    "limit") !== -1 &&
  bf.shortClosing.indexOf("complete original message is " +
    "retained by the reporter") !== -1 &&
  bf.shortClosing.indexOf("paste-ready") === -1);
ok("brandfocus: the lane stays form-only (no emailStays, " +
   "no per-field steps)",
  !!bf && bf.emailStays === undefined && !bf.fields);
ok("brandfocus: the legal name with an unrelated abuse " +
   "contact gets NO lane (the desk is identified by its " +
   "abuse contact when the name is the legal name)",
  lane({ registrarInfo: {
    registrar: "Guizhou Zhongyu Zhike Network Technology Co., Ltd.",
    registrarAbuse: "abuse@example.org" } }) === null);
ok("precedence preserved: Wanshang still wins its record",
  (lane({ registrarInfo: { registrar: "Wanshang Technology",
    registrarAbuse: "abuse@kh86.cn" } }) || {}).kit === "wanshang");
ok("precedence preserved: Alibaba still wins its record",
  (lane({ registrarInfo: {
    registrar: "Alibaba Cloud Computing Ltd. d/b/a HiChina",
    registrarAbuse: "DomainAbuse@service.aliyun.com" } }) || {})
    .kit === "alibaba");
ok("precedence preserved: an unknown registrar gets no lane",
  lane({ registrarInfo: { registrar: "NameCheap, Inc.",
    registrarAbuse: "abuse@namecheap.com" } }) === null);

// ---------- lib: the short evidence under the cap ----------
// The wlcxh.com record from the Nov 24 2026 run (the
// message Michael ran the published build on).
const bfSpam = {
  registrarInfo: {
    registrar: "Guizhou Zhongyu Zhike Network Technology Co., Ltd.",
    registrarAbuse: "abuse3814@brandfocus.cn",
    registered: "2025-12-24T00:00:00Z" },
  senderDomain: "wlcxh.com",
  from: "Luxury Watches <mjfmisappropriate@wlcxh.com>",
  subject: "[Black Friday] Luxury Watches Starting at $250 - Elevate Your Everyday Look",
  ip: "103.81.85.236",
  date: "Tue, 24 Nov 2026 09:00:00 +0000",
  urls: ["https://bb.qtly2024.com/5vwse6dg/bbveg.html"]
};
const bfEv = analyze.buildRegistrarShortEvidence(bfSpam);
ok("brandfocus: short evidence builds for the field case",
  typeof bfEv === "string" && bfEv.indexOf("wlcxh.com") !== -1 &&
  bfEv.indexOf("Registrar: Guizhou Zhongyu Zhike") !== -1);
ok("brandfocus: the evidence closes with the cap closing, " +
   "not a screenshot line and not the shared line",
  !!bfEv &&
  bfEv.indexOf("fit the form's description limit") !== -1 &&
  bfEv.indexOf("screenshot") === -1 &&
  bfEv.indexOf("paste-ready") === -1);
ok("brandfocus: the evidence fits the claimed 2,000 cap",
  !!bfEv && bfEv.length <= 2000, bfEv && String(bfEv.length));
// Cap enforcement: a pathological subject sheds before
// anything else does, and the closing survives whole.
const bfLong = Object.assign({}, bfSpam,
  { subject: "x".repeat(3000) });
const bfEvLong = analyze.buildRegistrarShortEvidence(bfLong);
ok("brandfocus: an over-cap message is held to the cap " +
   "with the closing intact",
  !!bfEvLong && bfEvLong.length <= 2000 &&
  bfEvLong.indexOf("complete original message is " +
    "retained by the reporter") !== -1,
  bfEvLong && String(bfEvLong.length));

// ---------- content: the kit ----------
ok("content: v1.0.83 \u2014 the kits render ONE merged " +
   "actions-only box (regActionsBox), BrandFocus with " +
   "its own branch",
  contentSrc.indexOf("function regActionsBox(kit, lane)") !== -1 &&
  contentSrc.indexOf('kit === "brandfocus"') !== -1 &&
  contentSrc.indexOf("rw.appendChild(regActionsBox(regKit, regFormLane))") !== -1);
// v1.0.83: the note and the "Walking their form" guide
// merged into the one box. Its BrandFocus content is
// Michael's approved copy verbatim: the heading and
// the four numbered steps \u2014 actions only, no
// background. The "out" checks are scoped to the
// BrandFocus branch of regActionsBox: several of the
// old guide's phrases legitimately live in other
// kits' steps (Wanshang's code step above all), so
// "gone" is only meaningful inside this branch.
const bfBoxAt = contentSrc.indexOf("function regActionsBox(kit, lane)");
const bfAt = bfBoxAt === -1 ? -1 :
  contentSrc.indexOf('if (kit === "brandfocus")', bfBoxAt);
const bfEnd = bfAt === -1 ? -1 :
  contentSrc.indexOf('} else if (kit === "wanshang")', bfAt);
const bfSeg = bfAt === -1 || bfEnd === -1 ? "" :
  contentSrc.slice(bfAt, bfEnd);
ok("content: the BrandFocus actions branch is extractable",
  bfSeg.length > 0);
ok("content: the box opens with the approved heading",
  flatContent.indexOf("Use their form \u2014 this " +
    "registrar takes no reports by email.") !== -1);
ok("content: step 1 is the button click (copies the " +
   "report, opens the form)",
  bfSeg.indexOf("1. Click the button below. It copies " +
    "your") !== -1 &&
  bfSeg.indexOf("report and opens the form.") !== -1);
ok("content: step 2 is the auto-pick + fill, in the " +
   "approved words",
  bfSeg.indexOf("2. Spam Avenger picks the category " +
    "and") !== -1 &&
  bfSeg.indexOf("fills in the report details for you.") !== -1);
ok("content: v1.0.84 \u2014 step 3 is the Measures " +
   "line (check only what's true)",
  bfSeg.indexOf("3. For Measures Already Taken, check only") !== -1 &&
  bfSeg.indexOf("have been taken.") !== -1);
ok("content: v1.0.84 \u2014 step 4 is the code step, " +
   "restored and placed at the complainant step " +
   "(walked on zy itself, ZYABUSE-202611250910-3887: " +
   "Send Verification Code, the emailed 6-digit " +
   "code, the Chinese code email, 5 minutes)",
  bfSeg.indexOf("4. The complainant step asks for your own") !== -1 &&
  bfSeg.indexOf("6-digit code it emails you. The email is") !== -1 &&
  bfSeg.indexOf("in Chinese; the code is the number in") !== -1);
ok("content: v1.0.84 \u2014 step 5 is the declarations " +
   "line and step 6 closes with the complaint number",
  bfSeg.indexOf("5. The last step asks you to read and") !== -1 &&
  bfSeg.indexOf("check six declaration boxes") !== -1 &&
  bfSeg.indexOf("6. Save the complaint number it gives you.") !== -1);
ok("content: the old guide's background stays out of " +
   "the BrandFocus branch (dead-desk story, platform " +
   "kinship, scope warning, caps lecture)",
  bfSeg.indexOf("Email is dead here") === -1 &&
  bfSeg.indexOf("Same reporting service Wanshang") === -1 &&
  bfSeg.indexOf("Scope warning") === -1 &&
  bfSeg.indexOf("2,000") === -1 &&
  bfSeg.indexOf("Track Complaint") === -1 &&
  bfSeg.indexOf("will no longer accept domain name " +
    "abuse") === -1 &&
  bfSeg.indexOf("English link at the top right") === -1 &&
  bfSeg.indexOf("after its window and a resend was " +
    "needed") === -1);

// The provisional line survives only where the form
// was never walked: Newfold and eNom. BrandFocus,
// Wanshang, July Name, GoDaddy and Alibaba carry
// walked (or desk-proven) steps instead.
ok("content: Newfold and eNom keep the provisional " +
   "line in the merged box; the walked kits don't",
  contentSrc.indexOf('kit === "newfold"') !== -1 &&
  contentSrc.indexOf('kit === "enom"') !== -1 &&
  contentSrc.indexOf("This guide is provisional") !== -1 &&
  bfSeg.indexOf("provisional") === -1);

// Regression: the walked neighbours are intact, in
// their new slim shape.
ok("content: the Wanshang kit keeps its code step and " +
   "button (v1.0.83 slim steps)",
  contentSrc.indexOf("WSABUSE-") !== -1 &&
  contentSrc.indexOf('"Open the Wanshang abuse form"') !== -1 &&
  flatContent.indexOf("type in the 6-digit code it " +
    "emails you") !== -1);
ok("content: the July Name kit keeps its own walked " +
   "steps (Personal, its code, screenshot)",
  flatContent.indexOf("choose Personal") !== -1 &&
  flatContent.indexOf("Attach a screenshot that " +
    "clearly shows") !== -1);
ok("content: the Alibaba kit keeps its desk-proven " +
   "steps (Illegal Information Reporting; the heading " +
   "no longer claims email is dead)",
  flatContent.indexOf("Illegal Information " +
    "Reporting") !== -1 &&
  flatContent.indexOf("email desk answers, but it " +
    "directs reports") !== -1);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
