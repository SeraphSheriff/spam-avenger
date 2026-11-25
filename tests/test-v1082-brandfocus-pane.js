"use strict";
// Spam Avenger v1.0.82 — the BrandFocus lane rebuilt:
// short guide, deep link, and a guide pane on the form.
//
// Michael tested v1.0.81 live on the wlcxh.com
// luxury-watch spam (Nov 24 2026) and gave two
// verdicts: the seven-paragraph walked guide was a
// wall of text no user will read, and the lane dumped
// him on the platform homepage to hunt for the
// complaint form — "why make user click complaint..
// just go to the correct url, and land them here:
// https://zy.nameabuse.net/submit.php and put the
// guide card/panel on this page." Walking submit.php
// live the same day, he added two more pieces: the
// pane picks step 1's category itself (DNS Abuse
// Complaint, then Spam (Distribution Vector), then
// Next — scam spam is the distribution-vector case in
// the form's own definition; the referral-only
// Non-DNS "General Spam" path is never the pick), and
// it fills step 2's details (defanged affected
// domain; an abuse URL only when the message carries
// one on the reported domain itself; the short
// evidence as the description, inside the form's
// 50–2,000 window) — GoDaddy fill discipline: report
// each field, never overwrite the user's text, never
// click step 2's Next (step 3 is the user's own
// details), never submit.
//
// So this build: the panel guide is eight one-line
// facts; both nameabuse lanes (BrandFocus at zy,
// Wanshang at ws — one platform, per-registrar
// subdomains) link submit.php itself; the registrar
// button stashes a nameabuse payload alongside the
// copy; reportfill runs on submit.php only and walks
// the form with the pane. Wanshang's panel kit text
// and walked guide are unchanged — the pane serves
// its submit page through the same host-keyed path.
//
// Run: node tests/test-v1082-brandfocus-pane.js

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const contentSrc = fs.readFileSync(
  path.join(ROOT, "content.js"), "utf8");
const reportfillSrc = fs.readFileSync(
  path.join(ROOT, "reportfill.js"), "utf8");
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

// Join a source file's string concatenations back into
// whole lines and decode its \uXXXX escapes, so the
// exact shipped guide text can be asserted.
function flatten(src) {
  return src
    .replace(/"\s*\+\s*\n\s*"/g, "")
    .replace(/\\u201C/g, "\u201C")
    .replace(/\\u201D/g, "\u201D")
    .replace(/\\u2014/g, "\u2014")
    .replace(/\\u2019/g, "\u2019")
    .replace(/\\u2192/g, "\u2192");
}
const flatContent = flatten(contentSrc);

// ---------- manifest ----------
ok("manifest: version is 1.0.82",
  manifest.version === "1.0.86");
const rfEntry = (manifest.content_scripts || []).filter(
  function (cs) {
    return (cs.js || []).indexOf("reportfill.js") !== -1;
  })[0];
const rfMatches = (rfEntry && rfEntry.matches) || [];
ok("manifest: reportfill is wired to BOTH nameabuse " +
   "submit pages",
  rfMatches.indexOf(
    "https://zy.nameabuse.net/submit.php*") !== -1 &&
  rfMatches.indexOf(
    "https://ws.nameabuse.net/submit.php*") !== -1);
ok("manifest: reportfill is NOT wired to any other " +
   "nameabuse page (submit.php only — the pane stands " +
   "down everywhere else on the platform by " +
   "construction)",
  rfMatches.filter(function (m) {
    return m.indexOf("nameabuse.net") !== -1 &&
      m.indexOf("submit.php") === -1;
  }).length === 0);
ok("manifest: host permissions name both nameabuse " +
   "hosts (the GoDaddy wiring pattern)",
  manifest.host_permissions.indexOf(
    "https://zy.nameabuse.net/*") !== -1 &&
  manifest.host_permissions.indexOf(
    "https://ws.nameabuse.net/*") !== -1);

// ---------- lib: the deep links ----------
const lane = analyze.registrarFormLane;
const bf = lane({ registrarInfo: {
  registrar: "Guizhou Zhongyu Zhike Network Technology Co., Ltd.",
  registrarAbuse: "abuse3814@brandfocus.cn" } });
ok("brandfocus: the lane URL is the complaint form " +
   "itself, not the platform homepage",
  !!bf && bf.url === "https://zy.nameabuse.net/submit.php" &&
  bf.linkText === "zy.nameabuse.net/submit.php");
const ws = lane({ registrarInfo: {
  registrar: "Wanshang Technology",
  registrarAbuse: "abuse@kh86.cn" } });
ok("wanshang: the same deep link on the same platform",
  !!ws && ws.url === "https://ws.nameabuse.net/submit.php" &&
  ws.linkText === "ws.nameabuse.net/submit.php");

// ---------- the guide: v1.0.83 actions only ----------
// Michael's call (Nov 24 2026): the guide boxes carried
// background \u2014 dead-mailbox stories, platform kinship,
// scope warnings, caps on boxes the pane fills itself.
// Cut to what the user DOES. The BrandFocus panel steps
// are his approved copy, verbatim; the pane carries
// steps 2+ (step 1 is the panel button click that
// brought the user to the form).
//
// v1.0.84: Michael's completed BrandFocus filing the
// same day (ZYABUSE-202611250910-3887) walked three
// steps v1.0.83's guide didn't have: the Measures
// checkboxes (the form's step 2), the emailed 6-digit
// code at the complainant step (the form's step 3
// \u2014 real on zy after all; the code email is
// entirely in Chinese), and the six declaration
// boxes (the form's step 4). The panel is six steps
// now; the code step runs long (~275 chars), so the
// old 200-char cap pin becomes 300 \u2014 still no
// wall of text.
const BF_PANEL_STEPS = [
  "1. Click the button below. It copies your report " +
    "and opens the form.",
  "2. Spam Avenger picks the category and fills in " +
    "the report details for you.",
  "3. For Measures Already Taken, check only " +
    "what\u2019s true \u2014 if you haven\u2019t " +
    "done any of them, check \u201CNo measures " +
    "have been taken.\u201D",
  "4. The complainant step asks for your own " +
    "details. Fill those in, click Send " +
    "Verification Code, and type in the " +
    "6-digit code it emails you. The email is " +
    "in Chinese; the code is the number in " +
    "it, and Gmail\u2019s Translate button " +
    "can read the rest. It\u2019s valid for " +
    "5 minutes.",
  "5. The last step asks you to read and " +
    "check six declaration boxes \u2014 those " +
    "are yours \u2014 then click Submit.",
  "6. Save the complaint number it gives you."
];
ok("guide: the BrandFocus box is a heading + six " +
   "numbered steps, no step over 300 characters (the " +
   "wall of text stays dead)",
  BF_PANEL_STEPS.length === 6 && BF_PANEL_STEPS.every(
    function (ln) { return ln.length <= 300; }));
BF_PANEL_STEPS.forEach(function (ln, i) {
  ok("guide: BrandFocus panel step " + (i + 1) +
     " ships verbatim in content.js",
    flatContent.indexOf(ln) !== -1, ln);
});
ok("guide: the BrandFocus heading ships verbatim in " +
   "content.js",
  flatContent.indexOf("Use their form \u2014 this " +
    "registrar takes no reports by email.") !== -1);
ok("guide: the 6-digit code step IS in the BrandFocus " +
   "panel steps now (walked on zy itself, " +
   "ZYABUSE-202611250910-3887), with the Measures and " +
   "declarations steps",
  BF_PANEL_STEPS.some(function (ln) {
    return ln.indexOf("6-digit code") !== -1 &&
      ln.indexOf("Send Verification Code") !== -1;
  }) &&
  BF_PANEL_STEPS.some(function (ln) {
    return ln.indexOf("Measures Already Taken") !== -1;
  }) &&
  BF_PANEL_STEPS.some(function (ln) {
    return ln.indexOf("six declaration boxes") !== -1;
  }));

// ---------- the pure helpers, extracted + run ----------
let P = null;
(function () {
  const a = reportfillSrc.indexOf("var CAT_PICK_WINDOW_MS");
  const b = reportfillSrc.indexOf(
    "/* ---------------- FTC ReportFraud wizard");
  if (a === -1 || b === -1 || b <= a) return;
  const seg = reportfillSrc.slice(a, b);
  P = new Function(seg +
    "; return { guideLines: NAMEABUSE_GUIDE_LINES," +
    " defang: nameabuseDefang," +
    " guideFor: nameabuseGuideLines," +
    " cardOk: nameabuseCardTextOk," +
    " plan: nameabusePlan," +
    " catLines: nameabuseCategoryLines," +
    " outLines: nameabuseOutcomeLines };")();
})();
ok("pure: the nameabuse helpers evaluate standalone", !!P);

if (P) {
  ok("guide: the BrandFocus pane lines are the panel " +
     "steps 2\u20134 verbatim (pinned to each other)",
    JSON.stringify(P.guideFor("brandfocus")) ===
      JSON.stringify(BF_PANEL_STEPS.slice(1).map(
        function (ln) { return ln.slice(3); })),
    JSON.stringify(P.guideFor("brandfocus")));
  ok("guide: the Wanshang pane lines KEEP the 6-digit " +
     "code step and the WSABUSE- number (its own " +
     "walked facts)",
    P.guideFor("wanshang").some(function (ln) {
      return ln.indexOf("6-digit code") !== -1;
    }) &&
    P.guideFor("wanshang").some(function (ln) {
      return ln.indexOf("WSABUSE-") !== -1;
    }));
  ok("guide: v1.0.84 \\u2014 the BrandFocus pane lines " +
     "carry the code step (walked on zy itself, " +
     "ZYABUSE-202611250910-3887), the Measures line " +
     "and the declarations line",
    P.guideFor("brandfocus").some(function (ln) {
      return ln.indexOf("6-digit code") !== -1 &&
        ln.indexOf("Send Verification Code") !== -1 &&
        ln.indexOf("Chinese") !== -1;
    }) &&
    P.guideFor("brandfocus").some(function (ln) {
      return ln.indexOf("Measures Already Taken") !== -1;
    }) &&
    P.guideFor("brandfocus").some(function (ln) {
      return ln.indexOf("six declaration boxes") !== -1;
    }));
  ok("guide: v1.0.84 \\u2014 the Wanshang pane lines " +
     "carry the same three walked steps (its code " +
     "line keeps the resend clause from its own walk)",
    P.guideFor("wanshang").some(function (ln) {
      return ln.indexOf("6-digit code") !== -1 &&
        ln.indexOf("resend once") !== -1;
    }) &&
    P.guideFor("wanshang").some(function (ln) {
      return ln.indexOf("Measures Already Taken") !== -1;
    }) &&
    P.guideFor("wanshang").some(function (ln) {
      return ln.indexOf("six declaration boxes") !== -1;
    }));

  // ---------- defang ----------
  ok("defang: a bare domain defangs whole",
    P.defang("wlcxh.com", false) === "wlcxh[.]com");
  ok("defang: a URL drops its scheme, defangs the " +
     "host, keeps the path",
    P.defang("https://wlcxh.com/a/b?x=1", true) ===
      "wlcxh[.]com/a/b?x=1");
  ok("defang: empty stays empty",
    P.defang("", true) === "" && P.defang(null) === "");

  // ---------- the card matcher ----------
  ok("cards: the DNS Abuse title matches exactly",
    P.cardOk("DNS Abuse Complaint",
      "DNS Abuse Complaint") === true);
  ok("cards: whitespace is normalized before the " +
     "compare",
    P.cardOk("  DNS Abuse\n  Complaint ",
      "DNS Abuse Complaint") === true);
  ok("cards: the Non-DNS card does NOT match the DNS " +
     "phrase (it merely contains it — the trap this " +
     "matcher exists for)",
    P.cardOk("Non-DNS Abuse Complaint",
      "DNS Abuse Complaint") === false);
  ok("cards: a title with its description attached " +
     "does NOT match (titles only)",
    P.cardOk("DNS Abuse Complaint Domains used for " +
      "malware distribution, botnet control...",
      "DNS Abuse Complaint") === false);
  ok("cards: the subtype title matches exactly",
    P.cardOk("Spam (Distribution Vector)",
      "Spam (Distribution Vector)") === true);

  // ---------- the plan: the wlcxh.com field case ----------
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
  const evidence = analyze.buildRegistrarShortEvidence(bfSpam);
  const stash = {
    urls: bfSpam.urls,
    nameabuse: { kit: "brandfocus", label: "BrandFocus",
      domain: "wlcxh.com", description: evidence }
  };
  const plan = P.plan(stash);
  ok("plan: the wlcxh case plans the defanged domain",
    plan.domain === "wlcxh.com" &&
    plan.domainDefanged === "wlcxh[.]com");
  ok("plan: the wlcxh case plans the DOMAIN ITSELF " +
     "as the abuse URL (v1.0.83 fallback — the form " +
     "requires at least one URL), reason recorded",
    plan.abuseUrl === "wlcxh[.]com" &&
    plan.abuseUrlFallback === true &&
    plan.abuseUrlWhy === "otherdomain");
  ok("plan: the description is the kit's short " +
     "evidence, inside the form's 50–2,000 window",
    plan.description === evidence &&
    evidence.length >= 50 && evidence.length <= 2000,
    "evidence is " + evidence.length + " chars");
  const sameDom = P.plan({
    urls: ["https://wlcxh.com/trc/abc"],
    nameabuse: { kit: "brandfocus", label: "BrandFocus",
      domain: "wlcxh.com", description: evidence } });
  ok("plan: a URL on the reported domain itself IS " +
     "planned, defanged — and is NOT a fallback",
    sameDom.abuseUrl === "wlcxh[.]com/trc/abc" &&
    sameDom.abuseUrlFallback === false);
  const subDom = P.plan({
    urls: ["https://click.wlcxh.com/x"],
    nameabuse: { kit: "brandfocus", label: "BrandFocus",
      domain: "wlcxh.com", description: evidence } });
  ok("plan: a subdomain of the reported domain counts " +
     "as on the domain",
    subDom.abuseUrl === "click[.]wlcxh[.]com/x");
  const noLinks = P.plan({
    urls: [],
    nameabuse: { kit: "brandfocus", label: "BrandFocus",
      domain: "wlcxh.com", description: evidence } });
  ok("plan: no links at all — the domain itself " +
     "stands in (v1.0.83 fallback), reason recorded",
    noLinks.abuseUrl === "wlcxh[.]com" &&
    noLinks.abuseUrlFallback === true &&
    noLinks.abuseUrlWhy === "nolinks");
  const shortDesc = P.plan({
    urls: [],
    nameabuse: { kit: "brandfocus", label: "BrandFocus",
      domain: "wlcxh.com", description: "too short" } });
  ok("plan: a description under the form's 50-char " +
     "floor is not planned for filling",
    shortDesc.description === null &&
    shortDesc.descriptionWhy === "tooshort");
  const longDesc = P.plan({
    urls: [],
    nameabuse: { kit: "brandfocus", label: "BrandFocus",
      domain: "wlcxh.com",
      description: "x".repeat(2001) } });
  ok("plan: a description over the 2,000 cap is not " +
     "planned for filling",
    longDesc.description === null &&
    longDesc.descriptionWhy === "toolong");

  // ---------- the category lines ----------
  const picked = P.catLines("picked");
  ok("category: the picked report states plainly what " +
     "was selected and that nothing was submitted",
    picked.lead.indexOf("Selected DNS Abuse") !== -1 &&
    picked.lead.indexOf("Spam (Distribution Vector)") !== -1 &&
    picked.lead.indexOf("nothing submitted") !== -1);
  const fellBack = P.catLines("fallback");
  ok("category: the fallback names the exact clicks " +
     "for the user, DNS path first",
    fellBack.lead.indexOf("click DNS Abuse Complaint") !== -1 &&
    fellBack.lead.indexOf("Spam (Distribution Vector)") !== -1 &&
    fellBack.lead.indexOf("then Next") !== -1 &&
    fellBack.sub1.indexOf("didn't guess-click") !== -1);
  const fellSub = P.catLines("fallback-sub");
  ok("category: v1.0.83 — dying in the subtype " +
     "state reports the DNS card as LANDED and asks " +
     "only for the clicks that are left",
    fellSub.lead.indexOf("I selected DNS Abuse") !== -1 &&
    fellSub.lead.indexOf("couldn't match the Spam " +
      "(Distribution Vector) card") !== -1 &&
    fellSub.lead.indexOf("click that one, then Next") !== -1 &&
    fellSub.lead.indexOf("couldn't pick the category") === -1);
  const fellNext = P.catLines("fallback-next");
  ok("category: v1.0.83 — dying at Next reports " +
     "BOTH cards as picked and asks only for Next",
    fellNext.lead.indexOf("I selected DNS Abuse") !== -1 &&
    fellNext.lead.indexOf("couldn't match the Next " +
      "button") !== -1 &&
    fellNext.lead.indexOf("click Next to continue") !== -1);

  // ---------- the outcome lines ----------
  const filledLines = P.outLines(plan,
    { domain: "filled", abuseUrl: "filled",
      description: "filled" });
  ok("outcome: a landed fill is reported field by field",
    filledLines.lead.indexOf("\u2713 I filled in") !== -1 &&
    filledLines.lead.indexOf("affected domain") !== -1 &&
    filledLines.lead.indexOf("description") !== -1);
  ok("outcome: v1.0.83 — the fallback abuse URL " +
     "is explained: the form requires one, the domain " +
     "itself went in, the real links ride in the " +
     "description (the 'empty on purpose' line is gone)",
    filledLines.sub1.indexOf("requires at least one " +
      "abuse URL") !== -1 &&
    filledLines.sub1.indexOf("reported domain itself") !== -1 &&
    filledLines.sub1.indexOf("different domain") !== -1 &&
    filledLines.sub1.indexOf("ride in the description") !== -1 &&
    filledLines.sub1.indexOf("empty on purpose") === -1);
  const noLinkLines = P.outLines(noLinks,
    { domain: "filled", abuseUrl: "filled",
      description: "filled" });
  ok("outcome: v1.0.83 — the no-links fallback " +
     "says the same, with its own reason",
    noLinkLines.sub1.indexOf("requires at least one " +
      "abuse URL") !== -1 &&
    noLinkLines.sub1.indexOf("no links I could find") !== -1);
  ok("outcome: the standing lines leave the optional " +
     "fields alone, point at Evidence Upload, and hand " +
     "step 3 to the user",
    filledLines.sub2.indexOf("Registration years and " +
      "Official Website") !== -1 &&
    filledLines.sub2.indexOf("Evidence Upload") !== -1 &&
    filledLines.sub2.indexOf(".txt") !== -1 &&
    filledLines.sub2.indexOf("never fill those in") !== -1);
  const alreadyLines = P.outLines(plan,
    { domain: "already", abuseUrl: "skipped",
      description: "already" });
  ok("outcome: user text already in the boxes is " +
     "reported as left alone, never as filled",
    alreadyLines.lead.indexOf("already had") !== -1 &&
    alreadyLines.lead.indexOf("left your text alone") !== -1 &&
    alreadyLines.lead.indexOf("\u2713 I filled") === -1);
  const goneLines = P.outLines(plan,
    { domain: "notfound", abuseUrl: "notfound",
      description: "notfound" });
  ok("outcome: an unrecognizable form gets the honest " +
     "failure line and no step-3 lecture",
    goneLines.lead.indexOf("couldn't fill the details " +
      "step in") !== -1 && goneLines.sub2 === "");
}

// ---------- reportfill: the wiring ----------
ok("wiring: both nameabuse hosts are recognized, and " +
   "the kit follows the host (zy = BrandFocus, " +
   "ws = Wanshang)",
  reportfillSrc.indexOf("function isNameabuseHost()") !== -1 &&
  reportfillSrc.indexOf(
    'location.hostname === "zy.nameabuse.net"') !== -1 &&
  reportfillSrc.indexOf(
    'location.hostname === "ws.nameabuse.net"') !== -1 &&
  reportfillSrc.indexOf("function nameabuseKitForHost()") !== -1 &&
  reportfillSrc.indexOf('"brandfocus" : "wanshang"') !== -1);
ok("wiring: the pane gates on the submit.php path " +
   "itself, not just the host",
  reportfillSrc.indexOf("function isNameabuseFormPage()") !== -1 &&
  reportfillSrc.indexOf(
    "/\\/submit\\.php$/.test(location.pathname") !== -1);
ok("wiring: the Guide header goes up at load on the " +
   "nameabuse hosts, like GoDaddy's",
  reportfillSrc.indexOf("if (isNameabuseHost())") !== -1 &&
  reportfillSrc.indexOf('Diag.setHeader("Spam Avenger Guide")') !== -1);
ok("wiring: the stash callback routes nameabuse " +
   "hosts to the guide",
  reportfillSrc.indexOf("} else if (isNameabuseHost()) {") !== -1 &&
  reportfillSrc.indexOf("guideNameabuse(stash);") !== -1);
ok("wiring: a payload for the OTHER desk (or none) " +
   "stands the guide down with a plain line — no " +
   "clicks, no fills",
  reportfillSrc.indexOf(
    "payload.kit !== nameabuseKitForHost()") !== -1 &&
  reportfillSrc.indexOf("I don't have a case loaded") !== -1);
ok("wiring: the banner gains the extra region the " +
   "pane's guide + copy box live in",
  reportfillSrc.indexOf("setExtra: function (fn)") !== -1 &&
  reportfillSrc.indexOf("function buildNameabuseExtra(plan)") !== -1 &&
  reportfillSrc.indexOf("nameabuseGuideLines(plan.kit).forEach") !== -1 &&
  reportfillSrc.indexOf("Copy the report text") !== -1);

// ---------- reportfill: the category auto-pick ----------
const watchAt = reportfillSrc.indexOf(
  "function watchNameabuseSteps(");
const fillAt = reportfillSrc.indexOf(
  "function fillNameabuseStep2(");
const watchSeg = watchAt === -1 ? "" :
  reportfillSrc.slice(watchAt,
    fillAt === -1 ? undefined : fillAt);
ok("category: the step watch exists ahead of the fill",
  watchAt !== -1 && fillAt > watchAt);
ok("category: it clicks the DNS Abuse card, then the " +
   "Spam (Distribution Vector) card, then Next — in " +
   "that order",
  watchSeg.indexOf('naCardClickTarget(\n            "DNS Abuse Complaint")') !== -1 &&
  watchSeg.indexOf('"Spam (Distribution Vector)"') !== -1 &&
  watchSeg.indexOf("naFindNextButton()") !== -1 &&
  watchSeg.indexOf('"DNS Abuse Complaint"') <
    watchSeg.indexOf('"Spam (Distribution Vector)"') &&
  watchSeg.indexOf('"Spam (Distribution Vector)"') <
    watchSeg.indexOf("naFindNextButton()"));
ok("category: the Non-DNS path is never a click " +
   "target anywhere in reportfill",
  reportfillSrc.indexOf('naCardClickTarget(\n            "Non-DNS') === -1 &&
  reportfillSrc.indexOf('naCardClickTarget("Non-DNS') === -1 &&
  reportfillSrc.indexOf('naCardClickTarget(\n            "General') === -1 &&
  reportfillSrc.indexOf('naCardClickTarget("General') === -1);
ok("category: both outcomes are reported through the " +
   "pure lines (picked + fallback)",
  watchSeg.indexOf('nameabuseCategoryLines("picked")') !== -1 &&
  watchSeg.indexOf('nameabuseCategoryLines(status)') !== -1 &&
  watchSeg.indexOf('"fallback-sub"') !== -1 &&
  watchSeg.indexOf('"fallback-next"') !== -1);
ok("category: the watch is interval-driven and capped " +
   "like the other lanes (~15 minutes)",
  watchSeg.indexOf("setInterval(function () {") !== -1 &&
  watchSeg.indexOf("15 * 60 * 1000") !== -1);
ok("category: a user already past step 1 (step 2 " +
   "visible) skips the picking entirely",
  watchSeg.indexOf("if (naStep2Visible())") !== -1 &&
  watchSeg.indexOf('phase = "details"') !== -1);

// ---------- reportfill: the step-2 fill ----------
const fillSeg = fillAt === -1 ? "" :
  reportfillSrc.slice(fillAt);
ok("fill: the pass plans exactly three fields — " +
   "domain, abuse URL, description (registration " +
   "years and Official Website are not in the plan)",
  fillSeg.indexOf('{ key: "domain", value: plan.domainDefanged }') !== -1 &&
  fillSeg.indexOf('{ key: "abuseUrl", value: plan.abuseUrl }') !== -1 &&
  fillSeg.indexOf('{ key: "description", value: plan.description }') !== -1 &&
  (fillSeg.match(/\{ key: "/g) || []).length === 3);
ok("fill: NO-SUBMIT is structural in the pass — no " +
   "click call, no submit reference (the GoDaddy pin, " +
   "mirrored)",
  fillSeg.indexOf(".click(") === -1 &&
  fillSeg.toLowerCase().indexOf("submit") === -1);
ok("fill: a box the user already filled is never " +
   "overwritten (the stand-down check runs before " +
   "any write)",
  fillSeg.indexOf('String(el.value || "").trim()') !== -1 &&
  fillSeg.indexOf('outcomes[f.key] = "already"') !== -1 &&
  fillSeg.indexOf('String(el.value || "").trim()') <
    fillSeg.indexOf("setVerified(el, f.value"));
ok("fill: writes go through the verified setter, and " +
   "the stash is erased once a fill lands",
  fillSeg.indexOf("setVerified(el, f.value, function (ok)") !== -1 &&
  fillSeg.indexOf("if (anyFilled) clearStash();") !== -1);
ok("fill: fields match by the form's own labels and " +
   "placeholders; the number and file inputs are " +
   "never candidates",
  reportfillSrc.indexOf("function naFindField(kind)") !== -1 &&
  reportfillSrc.indexOf("/affected domain/i") !== -1 &&
  reportfillSrc.indexOf("/detailed description/i") !== -1 &&
  reportfillSrc.indexOf('ty === "number"') !== -1 &&
  reportfillSrc.indexOf('ty === "file"') !== -1);

// ---------- content: the stash plumbing ----------
ok("content: the registrar button builds the " +
   "nameabuse payload for both kits (kit, label, " +
   "domain, the short-evidence description)",
  contentSrc.indexOf("var naPayload = null;") !== -1 &&
  contentSrc.indexOf('regKit === "brandfocus" ||') !== -1 &&
  contentSrc.indexOf('regKit === "wanshang")') !== -1 &&
  contentSrc.indexOf("naPayload = { nameabuse: {") !== -1 &&
  contentSrc.indexOf("kit: regKit,") !== -1 &&
  contentSrc.indexOf("label: regFormLane.label,") !== -1);
ok("content: the copy/open is stashed-first for the " +
   "nameabuse kits and direct for every other kit",
  contentSrc.indexOf("var proceed = function () {") !== -1 &&
  contentSrc.indexOf(
    "if (naPayload) { stashNaThen(proceed); return; }") !== -1 &&
  contentSrc.indexOf("function stashNaThen(done)") !== -1);
ok("content: the shared stash write carries the " +
   "nameabuse slot (null for every other lane)",
  contentSrc.indexOf(
    "nameabuse: (extra && extra.nameabuse) || null,") !== -1);

// ---------- the neighbours ----------
ok("wanshang: v1.0.84 — its panel box carries the " +
   "same walked steps as BrandFocus (Measures, the " +
   "complainant-step code, the declarations) + the " +
   "WSABUSE- number (its walked facts)",
  contentSrc.indexOf("WSABUSE-") !== -1 &&
  flatContent.indexOf("type in the 6-digit code it " +
    "emails you") !== -1 &&
  flatContent.indexOf("it starts with WSABUSE-.") !== -1 &&
  contentSrc.indexOf('"Open the Wanshang abuse form"') !== -1);
ok("others: the GoDaddy and FTC lanes are untouched",
  reportfillSrc.indexOf("function fillGoDaddy(") !== -1 &&
  reportfillSrc.indexOf("function fillFtc(stash)") !== -1 &&
  reportfillSrc.indexOf("function fillSafeBrowsing(stash)") !== -1);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
