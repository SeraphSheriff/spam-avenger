// Spam Avenger v1.0.72 — lane gating, from Michael's Nov 6
// 2026 rulings (queued-lane-gating-feature.md):
//
//  - The sender domain's website is checked live. Dead or
//    parked -> the website-host complaint lane is suppressed
//    and the panel shows his exact sentence: "The domain is
//    only used to send spam and has no live website, so
//    reporting abuse to a hosting company is not
//    viable/useful." Thin-but-real small-business sites must
//    NOT classify as no-site.
//  - The primary link gets the same check; Safe Browsing is
//    offered only when there is a live page to report.
//  - A site behind a front-door proxy network: origin found
//    -> complaint aims at the real host; origin hidden ->
//    the lane turns off with "The company hosting this
//    website is hidden, so a hosting complaint can't be
//    delivered." The front-door company is never named.
//  - Auth summary: "Missing standard SPF, DKIM, and DMARC
//    authentication" for the all-missing case, term list
//    adapted to what is actually missing.
//  - Repeat offenders: sightings match by origin IP first,
//    then From domain; the panel note leads with "Your last
//    report of this sender was on <date>." and the
//    encouragement scales with the count; complaints gain a
//    prior-report section that scales the same way.
//  - Three-way classification: fraud/phish (APWG+CISA
//    forward offered only here), throwaway UCE, legitimate
//    company (PID lane primary).
//
// Pins:
//  - both explanation sentences, byte-exact;
//  - the site-probe classification matrix, incl. the
//    front-door 52x rule and the confirmed-empty-DNS rule
//    (uncertainty is NEVER "nosite");
//  - parked-page detection incl. the "gift cards for sale"
//    false-positive guard;
//  - front-door IP ranges (104.21.31.65 is one; a spammer's
//    bare IP is not) and origin picking (front-door and
//    private candidates are skipped);
//  - the auth summary matrix ("fail" is present, not
//    missing; nothing missing -> null);
//  - bucket fixtures shaped on the two Nov 6 cases (Stoltz
//    MCA pitch -> uce; Capital One phish -> fraud);
//  - repeat matching/wording/pruning.
//
// Run: node tests/test-v1072-lane-gating.js
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const A = require(path.join(ROOT, "lib", "analyze.js"));
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
const contentSrc = fs.readFileSync(
  path.join(ROOT, "content.js"), "utf8");
const bgSrc = fs.readFileSync(
  path.join(ROOT, "background.js"), "utf8");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); }
}

// ---------- manifest / wiring ----------
ok("manifest version is 1.0.73", manifest.version === "1.0.87",
  manifest.version);
ok("manifest declares the background worker (both keys)",
  manifest.background &&
  manifest.background.service_worker === "background.js" &&
  Array.isArray(manifest.background.scripts) &&
  manifest.background.scripts[0] === "background.js");
ok("manifest host permissions cover arbitrary site checks",
  manifest.host_permissions.indexOf("https://*/*") !== -1 &&
  manifest.host_permissions.indexOf("http://*/*") !== -1 &&
  manifest.host_permissions.indexOf("https://crt.sh/*") !== -1);
ok("permissions stay storage-only",
  JSON.stringify(manifest.permissions) ===
    JSON.stringify(["storage"]));
ok("background worker: probe/doh/crtsh message kinds",
  /kind === "probe"/.test(bgSrc) && /kind === "doh"/.test(bgSrc) &&
  /kind === "crtsh"/.test(bgSrc));
ok("content: gating + classification wired into render",
  /runLaneGating\(\)/.test(contentSrc) &&
  /applyClassification\(true\)/.test(contentSrc) &&
  /applyClassification\(false\)/.test(contentSrc));
ok("content: sightings live in storage.local under one key",
  /SA_SIGHTINGS_KEY = "saSightings"/.test(contentSrc) &&
  /saRecordSighting\(lane\)/.test(contentSrc));
ok("content: sightings never touch sync storage or cookies",
  !/saSightings[\s\S]{0,200}storage\.sync/.test(contentSrc) &&
  contentSrc.indexOf("document.cookie") === -1);

// ---------- the two explanation sentences (byte-exact) ----------
ok("no-site explanation is Michael's exact sentence",
  A.NO_SITE_EXPLANATION ===
    "The domain is only used to send spam and has no live " +
    "website, so reporting abuse to a hosting company is not " +
    "viable/useful.",
  A.NO_SITE_EXPLANATION);
ok("hidden-host explanation names nobody",
  A.HOST_HIDDEN_EXPLANATION ===
    "The company hosting this website is hidden, so a " +
    "hosting complaint can't be delivered." &&
  !/cloudflare/i.test(A.HOST_HIDDEN_EXPLANATION),
  A.HOST_HIDDEN_EXPLANATION);

// ---------- parked-page detection ----------
ok("parked: sedo parking body",
  A.isParkedPage("This domain is parked with Sedo. sedoparking",
    "<html><body>parked</body></html>") === true);
ok("parked: domain-for-sale body",
  A.isParkedPage("This domain is for sale. Make an offer today.",
    "<html></html>") === true);
ok("parked: bodis marker",
  A.isParkedPage("bodis.com parking page",
    "<html></html>") === true);
ok("NOT parked: a real bakery page mentioning sales",
  A.isParkedPage("Sunrise Bakery — fresh bread daily. " +
    "Gift cards for sale in store. Wedding cakes to order.",
    "<html><body>lots</body></html>") === false);
ok("NOT parked: a rich real page",
  A.isParkedPage("Welcome to Miller Plumbing, family owned " +
    "since 1987. Call us for repairs, installs and 24/7 " +
    "emergency service across the county.",
    "<html>" + "x".repeat(3000) + "</html>") === false);
ok("parked: near-empty shell with no script",
  A.isParkedPage("", "<html><body></body></html>") === true);
ok("NOT parked: near-empty text but a script app shell",
  A.isParkedPage("", "<html><body><script src=\"/app.js\">" +
    "</script>" + "y".repeat(300) + "</body></html>") === false);

// ---------- site-probe classification ----------
function resp(status, text, raw) {
  return { outcome: "response", status: status,
    finalHost: "example.com", contentType: "text/html",
    text: text || "", raw: raw || "" };
}
const REAL = "Welcome to our shop. We sell tools and hardware " +
  "to the whole county, call us today for a quote.";
ok("classify: 200 real page -> live",
  A.classifySiteProbe({ dnsEmpty: false, frontDoor: false,
    probe: resp(200, REAL) }) === "live");
ok("classify: 200 parked page -> parked",
  A.classifySiteProbe({ dnsEmpty: false, frontDoor: false,
    probe: resp(200, "This domain is parked.",
      "<html></html>") }) === "parked");
ok("classify: 404 from a real server -> live (it answered)",
  A.classifySiteProbe({ dnsEmpty: false, frontDoor: false,
    probe: resp(404, "not found") }) === "live");
ok("classify: 522 behind a front door -> nosite",
  A.classifySiteProbe({ dnsEmpty: false, frontDoor: true,
    probe: resp(522, "Connection timed out") }) === "nosite");
ok("classify: 522 NOT behind a front door -> live",
  A.classifySiteProbe({ dnsEmpty: false, frontDoor: false,
    probe: resp(522, "weird origin code") }) === "live");
ok("classify: probe error + confirmed-empty DNS -> nosite",
  A.classifySiteProbe({ dnsEmpty: true, frontDoor: false,
    probe: { outcome: "error", error: "TypeError" } }) ===
    "nosite");
ok("classify: probe error + DNS has records -> unknown",
  A.classifySiteProbe({ dnsEmpty: false, frontDoor: false,
    probe: { outcome: "error", error: "TypeError" } }) ===
    "unknown");
ok("classify: probe error + DNS unknown -> unknown",
  A.classifySiteProbe({ dnsEmpty: null, frontDoor: false,
    probe: { outcome: "error", error: "AbortError" } }) ===
    "unknown");
ok("classify: no probe + confirmed-empty DNS -> nosite (DNS is the confirmed fact)",
  A.classifySiteProbe({ dnsEmpty: true, frontDoor: false,
    probe: null }) === "nosite");
ok("classify: no probe + DNS has records -> unknown",
  A.classifySiteProbe({ dnsEmpty: false, frontDoor: false,
    probe: null }) === "unknown");

// ---------- front-door ranges + origin picking ----------
ok("front door: 104.21.31.65 (the Stoltz website IP)",
  A.isFrontDoorIp("104.21.31.65") === true);
ok("front door: 172.67.x.x",
  A.isFrontDoorIp("172.67.154.9") === true);
ok("front door: 162.159.x.x",
  A.isFrontDoorIp("162.159.1.1") === true);
ok("front door: 2606:4700:: v6",
  A.isFrontDoorIp("2606:4700:3031::ac43:9a01") === true);
ok("NOT front door: the Capital One spammer IP 45.137.98.233",
  A.isFrontDoorIp("45.137.98.233") === false);
ok("NOT front door: a random host IP",
  A.isFrontDoorIp("192.0.2.44") === false);
ok("NOT front door: garbage / empty",
  A.isFrontDoorIp("banana") === false &&
  A.isFrontDoorIp("") === false &&
  A.isFrontDoorIp(null) === false);
ok("pickOriginIp skips front-door + private, takes the real one",
  A.pickOriginIp(["104.21.31.65", "192.168.1.5",
    "203.0.113.77", "198.51.100.2"]) === "203.0.113.77");
ok("pickOriginIp: all front-door -> null (genuinely hidden)",
  A.pickOriginIp(["104.21.31.65", "172.67.1.1"]) === null);
ok("pickOriginIp: empty -> null",
  A.pickOriginIp([]) === null && A.pickOriginIp(null) === null);

// ---------- auth summary ----------
ok("auth: all missing -> Michael's exact sentence",
  A.authSummaryLine({ spf: "none", dkim: "none", dmarc: "none" }) ===
    "Missing standard SPF, DKIM, and DMARC authentication");
ok("auth: nulls count as missing too",
  A.authSummaryLine({ spf: null, dkim: null, dmarc: null }) ===
    "Missing standard SPF, DKIM, and DMARC authentication");
ok("auth: one missing (DMARC)",
  A.authSummaryLine({ spf: "pass", dkim: "pass", dmarc: "none" }) ===
    "Missing standard DMARC authentication");
ok("auth: two missing (SPF + DMARC)",
  A.authSummaryLine({ spf: "none", dkim: "pass", dmarc: "none" }) ===
    "Missing standard SPF and DMARC authentication");
ok("auth: a FAIL is present, not missing",
  A.authSummaryLine({ spf: "fail", dkim: "pass", dmarc: "pass" }) ===
    null);
ok("auth: all passing -> null (no line)",
  A.authSummaryLine({ spf: "pass", dkim: "pass", dmarc: "pass" }) ===
    null);
ok("auth: no auth record at all -> null",
  A.authSummaryLine(null) === null &&
  A.authSummaryLine(undefined) === null);

// ---------- primary link ----------
const coA = {
  senderDomain: "cslconsulting.com",
  urls: ["http://_filepdfad_.jornaldocomerciocampanha.com/pdf/"]
};
ok("primaryLinkDomain: the Capital One lure domain",
  A.primaryLinkDomain(coA) === "jornaldocomerciocampanha.com",
  String(A.primaryLinkDomain(coA)));
ok("primaryLinkDomain: no urls -> null",
  A.primaryLinkDomain({ urls: [] }) === null &&
  A.primaryLinkDomain({}) === null);
ok("primaryLink: first url wins",
  A.primaryLink({ urls: ["https://a.example/x",
    "https://b.example/y"] }) === "https://a.example/x");

// ---------- three-way classification ----------
// The phish fixtures run through the REAL analyze() pipeline —
// the classifier consumes exactly what analyze() produces
// (a.flags strings, a.authResults, a.urls), so the fixtures
// must too.
const stoltz = {
  authResults: { spf: "pass", dkim: "pass", dmarc: "pass" },
  authAllPass: true, msAccountReport: true, skipComplaint: false,
  subject: "Franktown Firearms's standby line",
  bodyText: "Hi, we offer standby lines of credit for " +
    "businesses. Reply to discuss terms.",
  urls: [], flags: []
};
ok("bucket: Stoltz MCA pitch (MS tenant, no website) -> uce",
  A.classifyBucket(stoltz, { senderSite: "nosite" }) === "uce",
  A.classifyBucket(stoltz, { senderSite: "nosite" }));
const capOne = A.analyze([
  "From: Capital One <noreply@cslconsulting.com>",
  "To: mjf@colorami.com",
  "Subject: You Have a new Secure Message.",
  "Date: Fri, 6 Nov 2026 01:43:00 -0700",
  "Content-Type: text/plain; charset=UTF-8",
  "",
  "You have a new secure message. View Document: " +
  "http://_filepdfad_.jornaldocomerciocampanha.com/pdf/"
].join("\r\n"));
ok("bucket fixture: analyze() flags the link mismatch",
  capOne.flags.some(function (f) {
    return f.indexOf("links go somewhere completely different") !== -1;
  }), JSON.stringify(capOne.flags));
ok("bucket: Capital One phish -> fraud",
  A.classifyBucket(capOne, { linkSite: "live" }) === "fraud",
  A.classifyBucket(capOne, { linkSite: "live" }));
const plainPhish = A.analyze([
  "From: Some Bank <alerts@somebank.example>",
  "Subject: Action required",
  "Authentication-Results: mx.google.com; spf=pass " +
    "smtp.mailfrom=somebank.example; dkim=pass " +
    "header.i=@somebank.example; dmarc=pass " +
    "header.from=somebank.example",
  "Content-Type: text/plain",
  "",
  "Please verify your account to avoid suspension."
].join("\r\n"));
ok("bucket: ordinary phish (phishing phrase) -> fraud",
  A.classifyBucket(plainPhish, {}) === "fraud");
const legit = {
  authResults: { spf: "pass", dkim: "pass", dmarc: "pass" },
  authAllPass: true, msAccountReport: false, skipComplaint: false,
  subject: "Your November statement is ready",
  bodyText: "Your November statement is ready to view.",
  urls: [], flags: []
};
ok("bucket: legit company, live site, clean -> legit",
  A.classifyBucket(legit, { senderSite: "live" }) === "legit");
ok("bucket: same company, site unverified -> uce (not legit)",
  A.classifyBucket(legit, { senderSite: "unknown" }) === "uce");
ok("bucket: legit signals + pressure tactic flag -> uce",
  A.classifyBucket(Object.assign({}, legit, {
    flags: ["Contains pressure tactic ('act now')."]
  }), { senderSite: "live" }) === "uce");
ok("bucket: MS tenant can never be legit",
  A.classifyBucket(Object.assign({}, legit, {
    msAccountReport: true
  }), { senderSite: "live" }) === "uce");

// ---------- Safe Browsing gating ----------
ok("sb: live lure -> shown",
  A.sbLaneVisible(capOne, { linkSite: "live" }) === true);
ok("sb: dead link host -> suppressed",
  A.sbLaneVisible(capOne, { linkSite: "nosite" }) === false);
ok("sb: parked link host -> suppressed",
  A.sbLaneVisible(capOne, { linkSite: "parked" }) === false);
ok("sb: unprobed link -> shown (never suppress on uncertainty)",
  A.sbLaneVisible(capOne, {}) === true &&
  A.sbLaneVisible(capOne, { linkSite: "unknown" }) === true);
ok("sb: no urls at all -> suppressed (nothing to report)",
  A.sbLaneVisible(stoltz, { linkSite: "live" }) === false);

// ---------- repeat offenders ----------
const NOV2 = new Date(2026, 10, 2, 9, 15).getTime();
const NOV4 = new Date(2026, 10, 4, 18, 40).getTime();
const NOV5 = new Date(2026, 10, 5, 7, 5).getTime();
ok("formatReportDate: Nov 2, 2026",
  A.formatReportDate(NOV2) === "Nov 2, 2026",
  A.formatReportDate(NOV2));
ok("ordinal: 2nd / 3rd / 4th / 11th / 13th / 22nd",
  A.ordinal(2) === "2nd" && A.ordinal(3) === "3rd" &&
  A.ordinal(4) === "4th" && A.ordinal(11) === "11th" &&
  A.ordinal(13) === "13th" && A.ordinal(22) === "22nd");
const sightings = [
  { ip: "45.137.98.233", domain: "cslconsulting.com", ts: NOV2,
    desk: "abuse@xsserver.eu", action: "complaint" },
  { ip: "45.137.98.233", domain: "cslconsulting.com", ts: NOV4,
    desk: "reportphishing@apwg.org + contact@cisa.dhs.gov",
    action: "fwd" },
  { ip: "45.137.98.233", domain: "cslconsulting.com", ts: NOV5,
    desk: "", action: "analyzed" },
  { ip: "198.51.100.9", domain: "other.example", ts: NOV4,
    desk: "abuse@other.example", action: "complaint" }
];
const byIp = A.matchReports(sightings, "45.137.98.233",
  "cslconsulting.com");
ok("match: IP wins, reports counted, analyzed excluded",
  byIp && byIp.matchedBy === "ip" && byIp.count === 2 &&
  byIp.lastTs === NOV4,
  JSON.stringify(byIp));
const byDomain = A.matchReports(sightings, "203.0.113.1",
  "cslconsulting.com");
ok("match: domain fallback when the IP is new",
  byDomain && byDomain.matchedBy === "domain" &&
  byDomain.count === 2,
  JSON.stringify(byDomain));
ok("match: nothing prior -> null",
  A.matchReports(sightings, "192.0.2.1", "fresh.example") === null);
const note1 = A.repeatPanelNote({ count: 1, lastTs: NOV2 });
ok("note (2nd report): leads with last-report date + date",
  note1.indexOf("Your last report of this sender was on " +
    "Nov 2, 2026.") === 0 && /2nd report/.test(note1) &&
  /strengthens/.test(note1),
  note1);
const note3 = A.repeatPanelNote({ count: 3, lastTs: NOV5 });
ok("note (4th report): pattern stated plainly",
  note3.indexOf("Your last report of this sender was on " +
    "Nov 5, 2026.") === 0 && /4th report/.test(note3) &&
  /kept abusing after 3 earlier reports/.test(note3),
  note3);
ok("note: never the 'still sending' framing",
  !/still sending/i.test(note1) && !/still sending/i.test(note3));
const sec1 = A.priorReportSection({ count: 1, dates: [NOV2] });
ok("section (2nd report): singular prior report + date",
  /Prior report:/.test(sec1) && /Nov 2, 2026/.test(sec1) &&
  /continued since/.test(sec1), sec1);
const sec3 = A.priorReportSection({ count: 3,
  dates: [NOV2, NOV4, NOV5] });
ok("section (4th report): count, dates, escalation language",
  /Prior reports:/.test(sec3) && /3 times/.test(sec3) &&
  /report number 4/.test(sec3) &&
  /persistent abuse pattern/.test(sec3), sec3);
ok("section: no priors -> empty",
  A.priorReportSection(null) === "" &&
  A.priorReportSection({ count: 0 }) === "");

// pruning: 600 entries -> 500, newest kept, analyzed dropped first
const big = [];
for (let i = 0; i < 600; i++) {
  big.push({ ip: "1.1.1.1", domain: "x.example", ts: 1000 + i,
    desk: "d", action: i % 3 === 0 ? "analyzed" : "complaint" });
}
const pruned = A.pruneSightings(big);
ok("prune: capped at 500", pruned.length === 500,
  String(pruned.length));
ok("prune: newest kept",
  pruned[pruned.length - 1].ts === 1599);
const bigAnalyzedFirst = [];
for (let i = 0; i < 500; i++) {
  bigAnalyzedFirst.push({ ip: "1.1.1.1", domain: "x.example",
    ts: 1000 + i, desk: "d", action: "analyzed" });
}
for (let i = 0; i < 100; i++) {
  bigAnalyzedFirst.push({ ip: "1.1.1.1", domain: "x.example",
    ts: 2000 + i, desk: "d", action: "complaint" });
}
const pruned2 = A.pruneSightings(bigAnalyzedFirst);
ok("prune: reports survive over analyzed rows",
  pruned2.filter(function (s) {
    return s.action === "complaint";
  }).length === 100 && pruned2.length === 500);

// ---------- complaints gain the prior-report section ----------
const RAW = [
  "Received: from cslconsulting.com ([45.137.98.233])",
  "From: Capital One <noreply@cslconsulting.com>",
  "Subject: You Have a new Secure Message.",
  "Date: Fri, 6 Nov 2026 01:43:00 -0700"
].join("\n");
function mkComplaintA(over) {
  const a = {
    ip: "45.137.98.233", abuse: "abuse@xsserver.eu",
    host: "cslconsulting.com",
    from: "Capital One <noreply@cslconsulting.com>",
    subject: "You Have a new Secure Message.",
    date: "Fri, 6 Nov 2026 01:43:00 -0700",
    urls: ["http://_filepdfad_.jornaldocomerciocampanha.com/pdf/"],
    fullHeaders: RAW, bodyText: "View Document"
  };
  Object.assign(a, over || {});
  return a;
}
const plain = A.buildComplaint(mkComplaintA());
ok("complaint without priors: no prior-report section",
  plain && !/Prior report/.test(plain.body));
const repeated = A.buildComplaint(mkComplaintA({
  priorReports: { count: 2, dates: [NOV2, NOV4], lastTs: NOV4,
    matchedBy: "ip" }
}));
ok("complaint with priors: section present, scales",
  repeated && /Prior reports:/.test(repeated.body) &&
  /2 times/.test(repeated.body) &&
  /report number 3/.test(repeated.body));

// ---------- link-host complaint ----------
const linkA = mkComplaintA({
  linkHost: {
    domain: "jornaldocomerciocampanha.com", ip: "177.92.10.4",
    org: "Brazilian Host Ltda", abuse: "abuse@brhost.example",
    host: "jornaldocomerciocampanha.com", formLane: null,
    url: "http://_filepdfad_.jornaldocomerciocampanha.com/pdf/"
  }
});
const lc = A.buildLinkComplaint(linkA);
ok("link complaint: aimed at the link host's desk",
  lc && lc.to === "abuse@brhost.example" &&
  /fraud page at jornaldocomerciocampanha\.com/.test(lc.subject) &&
  /177\.92\.10\.4/.test(lc.body),
  lc ? lc.subject : "null");
ok("link complaint: form-only host -> null (form kit instead)",
  A.buildLinkComplaint(mkComplaintA({
    linkHost: { domain: "x.example", ip: "203.0.113.5",
      org: "Big Cloud", abuse: "abuse-form-only",
      formLane: "google", url: "https://x.example/lure" }
  })) === null);
ok("link complaint: no linkHost -> null",
  A.buildLinkComplaint(mkComplaintA()) === null);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
