"use strict";
// Spam Avenger v1.0.78 — the GoDaddy lane fills its form.
//
// v1.0.77 gave the lane a direct link to GoDaddy's
// phishing report (legalportal.godaddy.com/abuse/
// phishing) plus a walked copy-box guide in the panel.
// Michael field-tested it the same day (Nov 23 2026):
// the Description of Issue copy worked, but the form's
// other fields sat empty — his direction: "seems like
// we can fill in more for the user, and maybe a guide
// pane." The form is a plain web form, so v1.0.78 gives
// it the FTC / Safe Browsing treatment: the panel's
// GoDaddy button stashes the case (with the lane's
// brand / reported-domain / description payload merged
// into the stash), reportfill.js runs on the form page,
// fills the four fillable boxes, shows the "Spam
// Avenger Guide" pane saying what it filled and what
// it left (and why), verifies every write — and NEVER
// submits.
//
// The fill mapping (the v1.0.77 slices):
//   email       the reporter's saved PID-lane address
//               (chrome.storage.local "sa_user_email",
//               lib/demand.js's DETAIL_KEYS.email) when
//               one exists; otherwise the box stays
//               empty and the guide says it needs the
//               user's email. Never invented.
//   brand       the "brand" slice (From display name).
//   urls        the "urls" slice, one link per line,
//               with the reported domain on its own
//               line when no link already names it.
//   description the "registrarDescription" slice.
// The mobile checkbox and the country select are left
// exactly as the form presents them. A box the user
// already filled is never overwritten. The v1.0.77
// panel kit (evidence box + per-field copy steps)
// stays as the fallback path.
//
// Run: node tests/test-v1078-godaddy-autofill.js

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const contentSrc = fs.readFileSync(
  path.join(ROOT, "content.js"), "utf8");
const libSrc = fs.readFileSync(
  path.join(ROOT, "lib", "analyze.js"), "utf8");
const reportfillSrc = fs.readFileSync(
  path.join(ROOT, "reportfill.js"), "utf8");
const demandSrc = fs.readFileSync(
  path.join(ROOT, "lib", "demand.js"), "utf8");
const analyze = require(path.join(ROOT, "lib", "analyze.js"));
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else {
    fail++;
    console.log("  FAIL " + name +
      (extra ? " — " + extra : ""));
  }
}

// ---------- manifest ----------
ok("manifest: version is 1.0.78",
  manifest.version === "1.0.86");
const rfEntry = (manifest.content_scripts || []).filter(
  function (cs) {
    return (cs.js || []).join(" ").indexOf("reportfill") !== -1;
  })[0];
ok("manifest: reportfill now runs on the GoDaddy legal " +
   "portal (the filler's page)",
  !!rfEntry && rfEntry.matches.indexOf(
    "https://legalportal.godaddy.com/*") !== -1 &&
  rfEntry.matches.indexOf(
    "https://safebrowsing.google.com/*") !== -1 &&
  rfEntry.matches.indexOf(
    "https://reportfraud.ftc.gov/*") !== -1);
ok("manifest: host_permissions carry the legal portal " +
   "alongside the other filler pages",
  (manifest.host_permissions || []).indexOf(
    "https://legalportal.godaddy.com/*") !== -1);

// ---------- reportfill: page match + dispatch ----------
ok("reportfill: the GoDaddy host dispatches its own fill",
  reportfillSrc.indexOf(
    'location.hostname === "legalportal.godaddy.com"') !== -1 &&
  reportfillSrc.indexOf("function fillGoDaddy(") !== -1);
(function () {
  // v1.0.79: the search anchors on the callback's else-if
  // branch specifically — v1.0.79 added an earlier
  // page-load hero-watch block that also names the host,
  // and the first occurrence no longer reaches this
  // branch within the window. The assertions are
  // unchanged: they pin THIS branch's behavior.
  const at = reportfillSrc.indexOf(
    '} else if (location.hostname === ' +
    '"legalportal.godaddy.com")');
  const seg = at === -1 ? "" :
    reportfillSrc.slice(at, at + 1600);
  ok("reportfill: the GoDaddy banner is the Guide pane " +
     "(header set on the branch, like the FTC's)",
    seg.indexOf('Diag.setHeader("Spam Avenger Guide")') !== -1);
  ok("reportfill: the branch reads the saved email under " +
     "its own key, apart from the report stash",
    seg.indexOf("chrome.storage.local.get(" +
      "SA_USER_EMAIL_KEY") !== -1 &&
    seg.indexOf("fillGoDaddy(stash") !== -1);
})();
ok("reportfill: the stash read keeps its long-standing " +
   "shape (the v1.0.66 contract)",
  reportfillSrc.indexOf(
    'chrome.storage.local.get("pendingReport"') !== -1 &&
  reportfillSrc.indexOf(
    'chrome.storage.local.remove("pendingReport")') !== -1);
ok("reportfill: the email key is demand.js's key, named " +
   "once and pinned against its source",
  reportfillSrc.indexOf(
    'var SA_USER_EMAIL_KEY = "sa_user_email";') !== -1 &&
  demandSrc.indexOf('email: "sa_user_email"') !== -1);

// ---------- reportfill: the fill pass itself ----------
const gdFillAt = reportfillSrc.indexOf(
  "function fillGoDaddy(");
// v1.0.82 narrows this segment: fillGoDaddy is no
// longer the file's last pass — the nameabuse section
// (with its own category clicks and step-2 fill)
// follows it, and these pins are about the GoDaddy
// pass only. The segment now ends where that section
// begins; the assertions are unchanged.
const gdFillEnd = reportfillSrc.indexOf(
  "/* ---------------- nameabuse platform");
const gdFillSeg = gdFillAt === -1 ? "" :
  reportfillSrc.slice(gdFillAt,
    gdFillEnd === -1 ? undefined : gdFillEnd);
ok("fill: the four fillable boxes are found by their " +
   "walked labels",
  gdFillSeg.indexOf("/your email/i") !== -1 &&
  gdFillSeg.indexOf("/impersonat/i") !== -1 &&
  gdFillSeg.indexOf("/url, website, or domain/i") !== -1 &&
  gdFillSeg.indexOf("/description of issue/i") !== -1);
ok("fill: exactly four fields are planned — the mobile " +
   "checkbox and the country select are never in the map",
  (gdFillSeg.match(/\{ key: "/g) || []).length === 4 &&
  gdFillSeg.indexOf("selectedIndex") === -1 &&
  gdFillSeg.indexOf('"checkbox"') === -1);
ok("fill: NO-SUBMIT is structural — the pass contains no " +
   "click call and no submit reference at all",
  gdFillSeg.indexOf(".click(") === -1 &&
  gdFillSeg.toLowerCase().indexOf("submit") === -1);
ok("fill: a box that already holds text is left alone — " +
   "the stand-down check runs before any write",
  gdFillSeg.indexOf('String(el.value || "").trim()') !== -1 &&
  gdFillSeg.indexOf('String(el.value || "").trim()') <
    gdFillSeg.indexOf("setVerified(el, plan") &&
  gdFillSeg.indexOf('"already"') !== -1);
ok("fill: every write is verified (setVerified), and the " +
   "stash is erased once a fill lands",
  gdFillSeg.indexOf("setVerified(el, plan[f.key].value") !== -1 &&
  gdFillSeg.indexOf("clearStash()") !== -1);

// ---------- reportfill: the pure plan + guide lines ----------
// Extract reportfill's pure segment the same way the FTC
// suites do: from the first machine constant to the FTC
// wizard marker, evaluated with no DOM at all.
let P = null;
(function () {
  const a = reportfillSrc.indexOf("var CAT_PICK_WINDOW_MS");
  const b = reportfillSrc.indexOf(
    "/* ---------------- FTC ReportFraud wizard");
  if (a === -1 || b === -1 || b <= a) return;
  const seg = reportfillSrc.slice(a, b);
  P = new Function(seg +
    "; return { plan: godaddyPlan, urlText: godaddyUrlText," +
    " lines: godaddyOutcomeLines," +
    " claimed: claimedCompany };")();
})();
ok("pure: the GoDaddy plan helpers evaluate standalone", !!P);

const FIX = {
  from: "PayPal <help@southerncofc.org.au>",
  subject: "Your account has been limited",
  urls: ["https://southerncofc.org.au/login",
         "https://track.example.net/x"],
  godaddy: { brand: "PayPal",
    domain: "southerncofc.org.au",
    description: "DESC TEXT" }
};
if (P) {
  const plan = P.plan(FIX, "reporter@example.com");
  ok("plan: the saved email fills the email box",
    plan.email.value === "reporter@example.com" &&
    plan.email.why === null);
  ok("plan: the brand slice fills the brand box",
    plan.brand.value === "PayPal");
  ok("plan: the links fill the URL box one per line, " +
     "and the domain is NOT duplicated — a link already " +
     "names it",
    plan.urls.value ===
      "https://southerncofc.org.au/login\n" +
      "https://track.example.net/x",
    JSON.stringify(plan.urls.value));
  ok("plan: the description slice fills the description",
    plan.description.value === "DESC TEXT");

  const appended = P.urlText({
    urls: ["https://other.example.org/a"],
    godaddy: { domain: "evil-example.com" } });
  ok("plan: the reported domain rides on its own line " +
     "when no link names it",
    appended === "https://other.example.org/a\n" +
      "evil-example.com",
    JSON.stringify(appended));
  const subNamed = P.urlText({
    urls: ["https://login.evil-example.com/x"],
    godaddy: { domain: "evil-example.com" } });
  ok("plan: a subdomain link names the domain — no " +
     "extra line",
    subNamed === "https://login.evil-example.com/x");

  const noEmail = P.plan(FIX, "");
  ok("plan: no saved email — the box stays empty, the " +
     "reason is named, nothing is invented",
    noEmail.email.value === null &&
    noEmail.email.why === "nosaved");
  const badEmail = P.plan(FIX, "not an address");
  ok("plan: a non-address in storage is no address at all",
    badEmail.email.value === null &&
    badEmail.email.why === "nosaved");

  const bare = P.plan(
    { from: "x@y.example", urls: [] }, "r@example.com");
  ok("plan: a bare-address From with no payload names " +
     "no brand, no links, no description",
    bare.brand.value === null && bare.brand.why === "nobrand" &&
    bare.urls.value === null && bare.urls.why === "nolinks" &&
    bare.description.value === null &&
    bare.description.why === "nodesc");
  const fallback = P.plan(
    { from: "\"CPF\" <a@b.example>", urls: [],
      godaddy: null }, "");
  ok("plan: with no payload brand, the From display name " +
     "is the fallback (the claimed-company derivation)",
    fallback.brand.value === "CPF");

  const allFilled = P.lines(plan, {
    email: "filled", brand: "filled",
    urls: "filled", description: "filled" });
  ok("guide: a full fill says so, names all four boxes, " +
     "and closes with review-then-submit",
    allFilled.lead.indexOf(
      "I filled in the GoDaddy form for you") !== -1 &&
    allFilled.lead.indexOf("your email address") !== -1 &&
    allFilled.lead.indexOf("the impersonated brand") !== -1 &&
    allFilled.lead.indexOf("the links") !== -1 &&
    allFilled.lead.indexOf("the description") !== -1 &&
    allFilled.sub2.indexOf("I never submit for you") !== -1 &&
    allFilled.sub1 === "");
  const noEmailLines = P.lines(noEmail, {
    email: "skipped", brand: "filled",
    urls: "filled", description: "filled" });
  ok("guide: a missing saved email is explained — the " +
     "box needs the user's own address",
    noEmailLines.sub1.indexOf("email box is still empty") !== -1 &&
    noEmailLines.sub1.indexOf("never invent one") !== -1);
  const userText = P.lines(plan, {
    email: "already", brand: "already",
    urls: "already", description: "already" });
  ok("guide: boxes the user filled themselves are " +
     "reported as left alone, never as filled",
    userText.lead.indexOf("already had") !== -1 &&
    userText.lead.indexOf("left your text alone") !== -1 &&
    userText.lead.indexOf("I filled in") === -1);
  const changed = P.lines(plan, {
    email: "notfound", brand: "notfound",
    urls: "notfound", description: "notfound" });
  ok("guide: a form that matches nothing falls back to " +
     "the panel's copy boxes",
    changed.lead.indexOf("couldn't fill") !== -1 &&
    changed.sub1.indexOf("copy boxes") !== -1);
  const noDesc = P.lines(bare, {
    email: "filled", brand: "skipped",
    urls: "skipped", description: "skipped" });
  ok("guide: an unplanned description points at the " +
     "panel's copy box",
    noDesc.sub1.indexOf("description box is empty") !== -1 &&
    noDesc.sub1.indexOf("copy box in the Gmail panel") !== -1);
}

// ---------- lib: the kit copy tells the fill story ----------
const gd = analyze.registrarFormLane({ registrarInfo: {
  registrar: "GoDaddy.com, LLC",
  registrarAbuse: "abuse@godaddy.com" } });
ok("lib: the fieldsIntro now says the button fills the " +
   "boxes, with the steps as the by-hand fallback",
  !!gd && gd.fieldsIntro.indexOf(
    "fills these boxes") !== -1 &&
  gd.fieldsIntro.indexOf("by-hand fallback") !== -1 &&
  gd.fieldsIntro.indexOf("red asterisk") !== -1);
ok("lib: the email step explains the saved-details " +
   "source — and still carries no copy slice",
  !!gd && gd.fields[0].copy === null &&
  gd.fields[0].help.indexOf("data-deletion letters") !== -1 &&
  gd.fields[0].help.indexOf("the filler puts") !== -1);
ok("lib: the other copy slices are unchanged",
  !!gd && JSON.stringify(gd.fields.map(function (f) {
    return f.copy; })) === JSON.stringify(
    [null, "brand", "urls", null, null,
     "registrarDescription"]));

// ---------- content: the panel launches the fill ----------
ok("content: stashThenOpen takes the optional payload",
  contentSrc.indexOf(
    "function stashThenOpen(url, setStashStatus, lane, extra)") !== -1);
ok("content: the stash gains the godaddy payload only " +
   "when a lane supplies one (null otherwise)",
  contentSrc.indexOf(
    "godaddy: (extra && extra.godaddy) || null") !== -1);
(function () {
  const at = contentSrc.indexOf("var gdPayload");
  const seg = at === -1 ? "" :
    contentSrc.slice(at, at + 1400);
  ok("content: the payload is built from the lane's own " +
     "slices (brand + registrarDescription)",
    seg.indexOf('buildFormFieldEvidence(a, "brand")') !== -1 &&
    seg.indexOf('"registrarDescription"') !== -1 &&
    seg.indexOf("registrableDomain(") !== -1);
})();
ok("content: the GoDaddy button launches stash-then-open " +
   "under the registrar lane, with its own status line",
  contentSrc.indexOf(
    "stashThenOpen(regFormLane.url, gdStatus.set,") !== -1 &&
  contentSrc.indexOf('"registrar", gdPayload)();') !== -1 &&
  contentSrc.indexOf(
    'mkStashStatus("sf-godaddy-status")') !== -1 &&
  contentSrc.indexOf("rw.appendChild(gdStatus.el)") !== -1);
ok("content: the button is labeled for the fill, and " +
   "the generic open-the-form label survives for the " +
   "other kits",
  contentSrc.indexOf('"Report to GoDaddy"') !== -1 &&
  contentSrc.indexOf('"Open the " + regFormLane.label +') !== -1);
ok("content: v1.0.83 — the GoDaddy steps tell the " +
   "honest story: form opens, Spam Avenger fills, " +
   "user reviews and submits",
  contentSrc.indexOf("Spam Avenger fills in the boxes it") !== -1 &&
  contentSrc.indexOf("Review the filled form") !== -1 &&
  contentSrc.indexOf("Submit the form yourself") !== -1 &&
  contentSrc.indexOf("is ever sent for you") !== -1);
ok("content: the GoDaddy steps name the guide pane " +
   "on the form page",
  contentSrc.indexOf("guide pane on the form page says") !== -1 &&
  contentSrc.indexOf("what it filled and what it left") !== -1);

// ---------- content: the fallback kit is intact ----------
ok("fallback: the evidence box still renders (its text " +
   "is the description slice)",
  contentSrc.indexOf('"sf-registrar-evidence"') !== -1 &&
  contentSrc.indexOf(
    "buildRegistrarShortEvidence(a)") !== -1);
ok("fallback: the per-field copy steps still render " +
   "under the button",
  contentSrc.indexOf(
    "if (regFormLane.fields && regFormLane.fields.length)") !== -1 &&
  contentSrc.indexOf(
    '"Filling in the " + regFormLane.label +') !== -1);
ok("fallback: the other kits' copy-and-open handler is " +
   "untouched (their label swap + record still stand)",
  contentSrc.indexOf("Copied! The form is open \\u2014 " +
    "paste into its description field") !== -1 &&
  contentSrc.indexOf('recordLaunched("registrar")') !== -1 &&
  contentSrc.indexOf("window.open(regFormLane.url") !== -1);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
