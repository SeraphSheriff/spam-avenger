"use strict";
// Spam Avenger v1.0.74 — four more form desks, the AWS
// email door, the FTC question auto-picks, and the Google
// sign-in note. One build, seven queued specs:
//
// (1) queued-newfold-form-lane.md — Newfold Digital
// (Web.com / Network Solutions) retired its email desk:
// its autoresponder sends every abuse report to
// https://newfold.com/abuse. Form lane, no email door.
// (2) queued-brandfocus-form-lane.md — BrandFocus
// (brandfocus.cn) closed abuse3814@brandfocus.cn to
// complaints; its platform is https://zy.nameabuse.net/
// — the nameabuse.net service is per-registrar
// (ws = Wanshang, zy = BrandFocus).
// (3) queued-enom-form-lane.md — eNom acknowledges email
// but its Compliance team works only from
// https://www.enom.com/help/AbusePolicy.aspx.
// (4) queued-godaddy-form-lane.md — GoDaddy's abuse
// mailbox is unmonitored by its own auto-reply; reports
// go to https://abuseform.com/ (an API lane exists for
// bulk tooling).
// All four kits' field guides are PROVISIONAL — no form
// walked yet — and say so in the panel.
// (5) queued-aws-email-lane.md — AWS's form names an
// email fallback (Trust & Safety); the AWS kit gains a
// one-click email door alongside the form, addressed to
// trustandsafety@support.aws.com (the address the
// v1.0.73 link kit already named). No other form lane
// gains one.
// (6) queued-ftc-guided-picks.md +
// queued-ftc-question-autopicks.md — the FTC filler now
// PICKS the answers a standard report launched from a
// message knows: payment = No, how-it-started = Email,
// three of the four spam checkboxes (first two + last),
// the encounter date from the message's date, and the
// claimed company in the scammer-details box. Same
// verified-pick discipline as the category pick; the
// reporter's own-details section is never touched; the
// sextortion path gets none of it.
// (7) queued-google-form-signin-note.md — one sentence in
// the Google kit's intro: no Google account is needed to
// file; Google emails a verification link instead.
//
// Run: node tests/test-v1074-form-lanes.js

const fs = require("fs");
const path = require("path");

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
function count(src, sub) { return src.split(sub).length - 1; }

// ---------- manifest ----------
ok("manifest: version is 1.0.74", manifest.version === "1.0.84");

// ---------- (1)-(4) lib: the four new lanes ----------
const lane = analyze.registrarFormLane;

const nf = lane({ registrarInfo: {
  registrar: "Newfold Digital Inc.",
  registrarAbuse: "abuse-whois@newfold.com" } });
ok("newfold: RDAP name + abuse contact match",
  !!nf && nf.kit === "newfold" && nf.label === "Newfold");
ok("newfold: the form is newfold.com/abuse",
  !!nf && nf.url === "https://newfold.com/abuse" &&
  nf.linkText === "newfold.com/abuse");
const nf2 = lane({ registrarInfo: {
  registrar: "Web.com", registrarAbuse: "abuse@example.org" } });
ok("newfold: the Web.com brand name matches on its own",
  !!nf2 && nf2.kit === "newfold");
const nf3 = lane({ registrarInfo: {
  registrar: "Network Solutions, LLC",
  registrarAbuse: "abuse@example.org" } });
ok("newfold: Network Solutions matches on its own",
  !!nf3 && nf3.kit === "newfold");

const bf = lane({ registrarInfo: {
  registrar: "BrandFocus",
  registrarAbuse: "abuse3814@brandfocus.cn" } });
ok("brandfocus: RDAP name + abuse contact match",
  !!bf && bf.kit === "brandfocus");
// v1.0.82 narrows this pin: the BrandFocus lane now
// links the complaint form itself (submit.php), not
// the platform homepage — Michael, walking zy live on
// Nov 24 2026: "why make user click complaint.. just
// go to the correct url". linkText follows the GoDaddy
// convention (host + path, no scheme).
ok("brandfocus: the form is its nameabuse subdomain's " +
   "complaint form itself (v1.0.82 deep link)",
  !!bf && bf.url === "https://zy.nameabuse.net/submit.php" &&
  bf.linkText === "zy.nameabuse.net/submit.php");
const bf2 = lane({ registrarInfo: {
  registrar: "BrandFocus Co., Ltd.",
  registrarAbuse: "abuse@zy.nameabuse.net" } });
ok("brandfocus: an abuse contact on zy.nameabuse.net " +
   "still lands on BrandFocus (per-registrar subdomains)",
  !!bf2 && bf2.kit === "brandfocus");

const en = lane({ registrarInfo: {
  registrar: "eNom, LLC", registrarAbuse: "abuse@enom.com" } });
ok("enom: RDAP name + abuse contact match",
  !!en && en.kit === "enom" && en.label === "eNom");
ok("enom: the form is the Abuse Policy page",
  !!en && en.url === "https://www.enom.com/help/AbusePolicy.aspx" &&
  en.linkText === "www.enom.com/help/AbusePolicy.aspx");

const gd = lane({ registrarInfo: {
  registrar: "GoDaddy.com, LLC",
  registrarAbuse: "abuse@godaddy.com" } });
ok("godaddy: RDAP name + abuse contact match",
  !!gd && gd.kit === "godaddy" && gd.label === "GoDaddy");
ok("godaddy: the form is the legal-portal phishing " +
   "report (v1.0.77: Michael's live walk superseded " +
   "this build's abuseform.com category page)",
  !!gd && gd.url ===
    "https://legalportal.godaddy.com/abuse/phishing" &&
  gd.linkText === "legalportal.godaddy.com/abuse/phishing");

// v1.0.81 narrows this pin the way v1.0.80 narrowed the
// July Name gate pin: BrandFocus's platform has since
// been walked (the Nov 21 2026 Wanshang filing on the
// same nameabuse service + Michael's Nov 24 2026 read of
// zy.nameabuse.net), so its lane now claims the
// platform's real 2,000-character description cap with
// the cap closing. The other three still claim none.
ok("three of the four still claim NO description cap " +
   "(their forms are unwalked; the builder's own " +
   "default governs) — BrandFocus now claims 2,000",
  !!nf && nf.descriptionCap == null &&
  !!en && en.descriptionCap == null &&
  !!gd && gd.descriptionCap == null &&
  !!bf && bf.descriptionCap === 2000 &&
  bf.shortClosing.indexOf("fit the form's description " +
    "limit") !== -1);
ok("precedence preserved: Wanshang still wins its record",
  (lane({ registrarInfo: { registrar: "Wanshang Technology",
    registrarAbuse: "abuse@kh86.cn" } }) || {}).kit ===
    "wanshang");
ok("precedence preserved: an unknown registrar gets no lane",
  lane({ registrarInfo: { registrar: "NameCheap, Inc.",
    registrarAbuse: "abuse@namecheap.com" } }) === null);

// short evidence for a new lane: the shared closing, and
// never July Name's screenshot line (none of the four is
// known to take one)
const gdSpam = {
  registrarInfo: { registrar: "GoDaddy.com, LLC",
    registrarAbuse: "abuse@godaddy.com",
    registered: "2026-11-01T00:00:00Z" },
  senderDomain: "southerncofc.org.au",
  from: "Support <help@southerncofc.org.au>",
  subject: "Verify your account",
  ip: "203.0.113.9",
  date: "Sun, 23 Nov 2026 08:00:00 +0000"
};
const gdEv = analyze.buildRegistrarShortEvidence(gdSpam);
ok("godaddy: short evidence builds for the new lane",
  typeof gdEv === "string" && gdEv.indexOf("southerncofc.org.au") !== -1);
ok("godaddy: the evidence closes with the shared " +
   "headers-retained line, not a screenshot line",
  !!gdEv &&
  gdEv.indexOf("the complete original message is retained " +
    "by the reporter") !== -1 &&
  gdEv.indexOf("screenshot") === -1);

// ---------- (1)-(4) content: the kits ----------
ok("content: the generic kit heading is built from the " +
   "lane's label",
  contentSrc.indexOf('regFormLane.label + " abuse form"') !== -1);
ok("content: the generic form button is built from the " +
   "lane's label",
  contentSrc.indexOf('"Open the " + regFormLane.label +') !== -1);
ok("content: v1.0.83 \u2014 the merged box's heading " +
   "names the desk's retired email lane",
  contentSrc.indexOf("Use their form") !== -1 &&
  contentSrc.indexOf("takes no reports by email") !== -1);
ok("content: v1.0.83 \u2014 all four kits have branches " +
   "in the merged actions box (kit-keyed now)",
  contentSrc.indexOf('kit === "newfold"') !== -1 &&
  contentSrc.indexOf('kit === "brandfocus"') !== -1 &&
  contentSrc.indexOf('kit === "enom"') !== -1 &&
  contentSrc.indexOf('kit === "godaddy"') !== -1);
// v1.0.82 narrows this pin: the BrandFocus fragment it
// checked ("will no longer accept domain name abuse")
// was the v1.0.81 walked guide's wording of the
// auto-reply fact; the short guide carries the same
// reply-proven fact in its own first line. The other
// desks' fragments are untouched.
ok("content: v1.0.83 \u2014 the steps carry only " +
   "reply-proven ACTIONS (the background the replies " +
   "proved \u2014 dead mailboxes, the Compliance team, " +
   "the API lane \u2014 is cut, not carried)",
  contentSrc.indexOf("their Compliance") !== -1 &&
  contentSrc.indexOf("Email is dead here: the mailbox") === -1 &&
  contentSrc.indexOf("Web.com and Network Solutions") === -1 &&
  contentSrc.indexOf("developer API") === -1);
ok("content: the unwalked kits' steps are marked " +
   "provisional; the 'Walking their form' guide " +
   "heading is gone (v1.0.83 merged box)",
  contentSrc.indexOf("This guide is provisional") !== -1 &&
  contentSrc.indexOf('"Walking their form:"') === -1);
ok("content: the walked kits stand in their slim " +
   "shape (Wanshang + July Name fragments intact)",
  contentSrc.indexOf('"Open the Wanshang abuse form"') !== -1 &&
  contentSrc.indexOf('"Open the July Name abuse form"') !== -1 &&
  contentSrc.indexOf("Attach a screenshot that clearly shows") !== -1 &&
  contentSrc.indexOf("WSABUSE-") !== -1);

// ---------- (5) the AWS email door ----------
const awsSeg = contentSrc.slice(contentSrc.indexOf("aws: {"),
  contentSrc.indexOf("azure: {"));
const azureSeg = contentSrc.slice(contentSrc.indexOf("azure: {"),
  contentSrc.indexOf("google: {"));
ok("aws: the hint names the Trust & Safety desk",
  awsSeg.indexOf('emailTo: "trustandsafety@support.aws.com"') !== -1);
ok("azure: no email door (its desk never named one)",
  azureSeg.indexOf("emailTo:") === -1);
ok("content: the door renders only behind the lane's emailTo",
  contentSrc.indexOf("if (formLane.emailTo)") !== -1);
ok("content: the door retargets the complaint to the desk",
  contentSrc.indexOf("awsMail = { to: formLane.emailTo") !== -1 &&
  contentSrc.indexOf('"Or email it instead \\u2014 AWS Trust ' +
    '& Safety"') !== -1);
ok("content: the door's button is the sf-aws-email-compose " +
   "Open-in-Gmail shape",
  contentSrc.indexOf('id: "sf-aws-email-compose"') !== -1 &&
  contentSrc.indexOf('id: "sf-aws-email-text"') !== -1 &&
  contentSrc.indexOf("fitGivenComplaint(") !== -1);

// ---------- (7) the Google sign-in sentence ----------
const SIGNIN = "Ignore the Sign in button at the top of " +
  "Google's";
ok("google: the sign-in sentence exists exactly once",
  count(contentSrc, SIGNIN) === 1);
ok("google: it sits inside the Google intro, ahead of the " +
   "past-details closer (which still closes the intro)",
  contentSrc.indexOf(SIGNIN) !== -1 &&
  contentSrc.indexOf(SIGNIN) <
    contentSrc.indexOf("Google may offer details from your " +
      "earlier reports") &&
  contentSrc.indexOf("Google will email you a link to " +
    "verify your") !== -1 &&
  contentSrc.indexOf("address instead") !== -1);

// ---------- (6) content: the stash carries the date ----------
ok("content: the report stash now carries the message date",
  contentSrc.indexOf('date: a.date || ""') !== -1);

// ---------- (6) reportfill: wiring pins ----------
ok("reportfill: the question configs + machines exist",
  rfSrc.indexOf("var SA_FTC_PAY_NO = {") !== -1 &&
  rfSrc.indexOf("var SA_FTC_START_EMAIL = {") !== -1 &&
  rfSrc.indexOf("function makeSpamBoxesPick(windowMs)") !== -1 &&
  rfSrc.indexOf("function claimedCompany(stash)") !== -1 &&
  rfSrc.indexOf("function encounterDateParts(stash)") !== -1);
ok("reportfill: SCOPE GATE — the sextortion path builds " +
   "none of the new pickers",
  rfSrc.indexOf("var payPick = stash.sextortion ? null") !== -1 &&
  rfSrc.indexOf("var startPick = stash.sextortion ? null") !== -1 &&
  rfSrc.indexOf("var spamPick = stash.sextortion ? null") !== -1);
ok("reportfill: the sextortion coaching lines are kept " +
   "byte-for-byte",
  rfSrc.indexOf('? "If you didn\'t pay them anything, pick No. " +') !== -1 &&
  rfSrc.indexOf('"(Only you can answer this one.)"') !== -1);
ok("reportfill: the picks run before the narrative fill " +
   "(the fill ends the pre-fill watch)",
  rfSrc.indexOf("runDetailFills();") !== -1 &&
  rfSrc.indexOf("runDetailFills();") <
    rfSrc.indexOf("savedNarrative = savedNarrative ||"));
ok("reportfill: the fills touch exactly two labeled boxes " +
   "(date + claimed company) — findLabeledInput has no " +
   "other callers, so the your-details section is " +
   "structurally out of reach",
  count(rfSrc, "findLabeledInput(") === 3 &&
  rfSrc.indexOf("/when did you encounter|encounter the scam/i") !== -1 &&
  rfSrc.indexOf("/pretend|impersonat|company or organization/i") !== -1);
ok("reportfill: the restart re-arms the new pickers too",
  rfSrc.indexOf("spamPick = makeSpamBoxesPick(CAT_PICK_WINDOW_MS)") !== -1 &&
  rfSrc.indexOf('dateFillState = "waiting"') !== -1);

// ---------- (6) reportfill: the machines, behaviorally ----------
// Same extraction as the category auto-pick suite: the
// pure segment between the window constant and the
// wizard section.
const segStart = rfSrc.indexOf("var CAT_PICK_WINDOW_MS");
const segEnd = rfSrc.indexOf(
  "/* ---------------- FTC ReportFraud wizard");
ok("reportfill: the pure segment is extractable",
  segStart !== -1 && segEnd > segStart);
const seg = rfSrc.slice(segStart, segEnd);
const rf = new Function(seg +
  "; return { W: CAT_PICK_WINDOW_MS," +
  " makeCategoryAutoPick: makeCategoryAutoPick," +
  " makeSpamBoxesPick: makeSpamBoxesPick," +
  " PAY: SA_FTC_PAY_NO, START: SA_FTC_START_EMAIL," +
  " claimedCompany: claimedCompany," +
  " encounterDateParts: encounterDateParts };")();

// the payment pick: a category machine wearing the No config
const pay = rf.makeCategoryAutoPick(rf.W, rf.PAY);
ok("payment: the plain line coaches before any pick",
  pay.guideLine() === "If you didn't pay them anything, pick No.");
ok("payment: an unselected No in view asks for the click",
  pay.step({ tile: { selected: false }, tileEl: {},
    otherSelected: false }, 1000) === "click");
pay.afterClick(true);
ok("payment: a verified click finishes the pick",
  pay.getState() === "done");
ok("payment: the guide then states the pick, by name",
  pay.guideLine() ===
    "I selected 'No' for you \u2014 you didn't send them any payment.");
const payUser = rf.makeCategoryAutoPick(rf.W, rf.PAY);
payUser.step({ tile: { selected: false }, tileEl: {},
  otherSelected: true }, 1000);
ok("payment: the user's own selection stands the picker down",
  payUser.getState() === "user" &&
  payUser.guideLine() === "If you didn't pay them anything, pick No.");
const payLate = rf.makeCategoryAutoPick(rf.W, rf.PAY);
payLate.step({ tile: null, tileEl: null, otherSelected: false }, 1000);
ok("payment: a late-rendering option expires to failed, " +
   "and the guide admits the try",
  payLate.step({ tile: null, tileEl: null, otherSelected: false },
    1000 + rf.W) === null &&
  payLate.getState() === "failed" &&
  payLate.guideLine() ===
    "I tried to select 'No' for you and couldn't \u2014 please click it.");

// the started pick: the Email config
const start = rf.makeCategoryAutoPick(rf.W, rf.START);
ok("started: the plain line is the old coaching line",
  start.guideLine() === "This came by email \u2014 pick Email.");
start.step({ tile: { selected: false }, tileEl: {},
  otherSelected: false }, 1000);
start.afterClick(true);
ok("started: a verified click states the Email pick",
  start.getState() === "done" &&
  start.guideLine() ===
    "I selected 'Email' for you \u2014 this came by email.");

// the spam boxes: three of four, never the third
const boxes = rf.makeSpamBoxesPick(rf.W);
ok("boxes: a fresh group asks for exactly [0, 1, 3]",
  JSON.stringify(boxes.step(
    { boxes: [false, false, false, false] }, 1000)) ===
    "[0,1,3]");
boxes.afterClick(0, true);
boxes.afterClick(1, true);
ok("boxes: two verified, one to go — the next pass asks " +
   "only for the last",
  JSON.stringify(boxes.step(
    { boxes: [true, true, false, false] }, 1100)) === "[3]");
boxes.afterClick(3, true);
ok("boxes: all three verified finishes the pick",
  boxes.getState() === "done" &&
  JSON.stringify(boxes.step(
    { boxes: [true, true, false, true] }, 1200)) === "[]");
const boxesThird = rf.makeSpamBoxesPick(rf.W);
ok("boxes: the third box already checked is the user's " +
   "hand — stand down, touch nothing",
  JSON.stringify(boxesThird.step(
    { boxes: [false, false, true, false] }, 1000)) === "[]" &&
  boxesThird.getState() === "user");
const boxesOwn = rf.makeSpamBoxesPick(rf.W);
ok("boxes: a target found checked unverified is the " +
   "user's hand too",
  JSON.stringify(boxesOwn.step(
    { boxes: [true, false, false, false] }, 1000)) === "[]" &&
  boxesOwn.getState() === "user");
const boxesFail = rf.makeSpamBoxesPick(rf.W);
boxesFail.step({ boxes: [false, false, false, false] }, 1000);
boxesFail.afterClick(0, false); // the click didn't take
ok("boxes: unverified clicks expire to failed at the window",
  JSON.stringify(boxesFail.step(
    { boxes: [false, false, false, false] }, 1000 + rf.W)) ===
    "[]" &&
  boxesFail.getState() === "failed");
const boxesWait = rf.makeSpamBoxesPick(rf.W);
ok("boxes: no group on screen yet — no opinion, no clock",
  JSON.stringify(boxesWait.step(null, 1000)) === "[]" &&
  boxesWait.getState() === "waiting");

// the fills' value derivations
ok("company: the From display name is the claimed company",
  rf.claimedCompany({ from: "\"Louis Vuitton\" <mjf@example.com>" }) ===
    "Louis Vuitton" &&
  rf.claimedCompany({ from: "PayPal <mjf@example.com>" }) ===
    "PayPal");
ok("company: a bare-address From claims nobody — blank",
  rf.claimedCompany({ from: "mjf@example.com" }) === "" &&
  rf.claimedCompany({ from: "" }) === "" &&
  rf.claimedCompany({}) === "");
const parts = rf.encounterDateParts(
  { date: "Wed, 19 Nov 2026 12:00:00 +0000" });
ok("date: the message date splits into both field shapes",
  !!parts && parts.iso === "2026-11-19" &&
  parts.us === "11/19/2026",
  JSON.stringify(parts));
ok("date: an absent or unparseable date fills nothing",
  rf.encounterDateParts({}) === null &&
  rf.encounterDateParts({ date: "" }) === null &&
  rf.encounterDateParts({ date: "not a date" }) === null);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
