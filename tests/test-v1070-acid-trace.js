// Spam Avenger v1.0.70 (folds into the shelved build —
// no version bump) — the ACID-style sender-domain trace,
// from Michael's Nov 3 2026 run of the RrSG ACID tool on the
// .shop Fifteen case and his "build it" call. The panel's
// mail lane is lane 1; this adds, lazily and from public
// data only (DNS-over-HTTPS + RDAP, both already permitted):
//
//  lane 2, WEBSITE HOST: the From domain's A record (CNAMEs
//  followed, capped) -> RDAP of the resolving IP -> hosting
//  org + abuse contact + a hosting-shaped complaint (or the
//  shared form-kit presentation when the IP belongs to a
//  form-only host). The real case's shape: 13 of 15 fraud
//  domains' websites sat on Eonix/ServerHub while the mail
//  came from ServerGate — a desk the mail trace never sees.
//
//  lane 3, REGISTRAR: domain RDAP (IANA bootstrap -> registry
//  base, rdap.org fallback) -> registrar, registrar abuse
//  contact, registration date with freshness against the
//  message's arrival (<= 30 days before = the fresh-domain
//  tell, flagged in the panel), registrant when unredacted,
//  and a DNS Abuse complaint. The real case: Namecheap,
//  registered 2026-11-02, registrant published in the open.
//
// Pins that matter:
//  - the trace runs from the panel (traceSenderDomain),
//    NEVER from investigate() — the v1.0.68 suite pins that a
//    normal sender triggers no sender-domain DNS there;
//  - whitelisted mailbox-provider domains skip the trace
//    without a single fetch (their "website host" and
//    registrar are noise beside the Report lane);
//  - a website resolving to the mail lane's own IP + abuse
//    desk is suppressed (one desk, one complaint);
//  - NO new manifest permissions: host_permissions stays 11
//    (dns.google, rdap.org, data.iana.org were already in);
//  - SA_LANES is untouched — the new lanes record no action
//    history (deliberate; the pinned lane list stays as-is).
//
// The domain-RDAP fetch path exercised here is the rdap.org
// fallback (the fixture IANA bootstrap omits the test TLD).
// The bootstrap-hit path mirrors lib/demand.js's established
// chain and is covered by its conventions.
//
// Run: node tests/test-v1070-acid-trace.js
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const contentSrc = fs.readFileSync(path.join(ROOT, "content.js"), "utf8");
const analyze = require(path.join(ROOT, "lib", "analyze.js"));
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); }
}

// ---------- manifest: no version bump, no new hosts ----------
ok("manifest version stays 1.0.70", manifest.version === "1.0.70",
  "got " + manifest.version);
ok("host_permissions unchanged at 11",
  manifest.host_permissions.length === 11,
  "got " + manifest.host_permissions.length);
ok("host_permissions include rdap.org",
  manifest.host_permissions.some(function (h) {
    return h.indexOf("rdap.org") !== -1; }));
ok("host_permissions include data.iana.org",
  manifest.host_permissions.some(function (h) {
    return h.indexOf("data.iana.org") !== -1; }));
ok("permissions still storage-only",
  JSON.stringify(manifest.permissions) === '["storage"]');

// ---------- fixtures ----------
const domainRdapNamecheap = {
  ldhName: "breaathiizen.shop",
  status: ["client transfer prohibited"],
  events: [
    { eventAction: "registration", eventDate: "2026-11-02T07:38:57Z" },
    { eventAction: "expiration", eventDate: "2027-11-02T07:38:57Z" }
  ],
  entities: [
    { roles: ["registrar"], handle: "1068",
      vcardArray: ["vcard", [
        ["version", {}, "text", "4.0"],
        ["fn", {}, "text", "NameCheap, Inc."]]],
      entities: [
        { roles: ["abuse"],
          vcardArray: ["vcard", [
            ["version", {}, "text", "4.0"],
            ["fn", {}, "text", "Namecheap Abuse Contact"],
            ["email", {}, "text", "abuse@namecheap.com"]]] } ] },
    { roles: ["registrant"],
      vcardArray: ["vcard", [
        ["version", {}, "text", "4.0"],
        ["fn", {}, "text", "Amit Kushwaha"],
        ["adr", {}, "text", ["", "", "Indore", "", "Madhya Pradesh", "", "IN"]],
        ["email", {}, "text", "rohansharmars3786265@gmail.com"],
        ["tel", {}, "uri", "tel:+1.9165499840"]]] }
  ]
};
const domainRdapRedacted = {
  ldhName: "quiet-fraud.example",
  events: [
    { eventAction: "registration", eventDate: "2026-10-30T03:11:00Z" }
  ],
  entities: [
    { roles: ["registrar"],
      vcardArray: ["vcard", [
        ["version", {}, "text", "4.0"],
        ["fn", {}, "text", "Tucows Domains Inc."]]],
      entities: [
        { roles: ["abuse"],
          vcardArray: ["vcard", [
            ["version", {}, "text", "4.0"],
            ["email", {}, "text", "domainabuse@tucows.com"]]] } ] },
    { roles: ["registrant"],
      vcardArray: ["vcard", [
        ["version", {}, "text", "4.0"],
        ["fn", {}, "text", "REDACTED FOR PRIVACY"],
        ["org", {}, "text", "REDACTED FOR PRIVACY"],
        ["email", {}, "text", "REDACTED FOR PRIVACY"]]] }
  ]
};
const eonixIpRdap = {
  name: "SHUB-NETBLK-NYC",
  entities: [
    { roles: ["registrant"],
      vcardArray: ["vcard", [
        ["version", {}, "text", "4.0"],
        ["fn", {}, "text", "Eonix Corporation"]]] },
    { roles: ["abuse"],
      vcardArray: ["vcard", [
        ["version", {}, "text", "4.0"],
        ["fn", {}, "text", "Eonix Abuse"],
        ["email", {}, "text", "poc@eonix.net"]]] }
  ]
};
// IANA bootstrap WITHOUT the test TLDs -> forces the
// rdap.org fallback for domain RDAP in the e2e trace.
const bootstrapNoShop = {
  services: [ [["com"], ["https://rdap.verisign.com/com/v1/"]] ]
};

let fetchLog = [];
function stubFetch(map) {
  global.fetch = function (url) {
    fetchLog.push(String(url));
    const keys = Object.keys(map);
    for (let i = 0; i < keys.length; i++) {
      if (String(url).indexOf(keys[i]) !== -1) {
        const v = map[keys[i]];
        if (v === "REJECT") return Promise.reject(new Error("down"));
        return Promise.resolve({
          ok: true, status: 200,
          json: function () { return Promise.resolve(v); }
        });
      }
    }
    return Promise.reject(new Error("unstubbed: " + url));
  };
}

// ---------- pickAFromAnswers (pure) ----------
const pick = analyze.pickAFromAnswers;
let p1 = pick([{ name: "x.", type: 1, TTL: 60, data: "104.206.252.110" }]);
ok("pickA: plain A record wins", !!p1 && p1.ip === "104.206.252.110");
let p2 = pick([
  { name: "x.", type: 5, TTL: 60, data: "cdn.example.net." },
  { name: "cdn.example.net.", type: 1, TTL: 60, data: "192.0.2.9" }]);
ok("pickA: A beats CNAME when the answer carries both",
  !!p2 && p2.ip === "192.0.2.9");
let p3 = pick([{ name: "x.", type: 5, TTL: 60, data: "cdn.example.net." }]);
ok("pickA: CNAME-only answer yields the target",
  !!p3 && p3.cname === "cdn.example.net");
ok("pickA: private A is not a website IP",
  pick([{ name: "x.", type: 1, TTL: 60, data: "10.0.0.5" }]) === null);
ok("pickA: empty / null answers yield null",
  pick([]) === null && pick(null) === null);

// ---------- parseDomainRdap (pure) ----------
const parsed = analyze.parseDomainRdap(domainRdapNamecheap);
ok("rdap parse: registrar name", parsed.registrar === "NameCheap, Inc.",
  "got " + parsed.registrar);
ok("rdap parse: registrar abuse from the nested entity",
  parsed.registrarAbuse === "abuse@namecheap.com",
  "got " + parsed.registrarAbuse);
ok("rdap parse: registration event date",
  parsed.registered === "2026-11-02T07:38:57Z");
ok("rdap parse: unredacted registrant named",
  !!parsed.registrant && parsed.registrant.name === "Amit Kushwaha");
ok("rdap parse: unredacted registrant email kept",
  !!parsed.registrant &&
    parsed.registrant.email === "rohansharmars3786265@gmail.com");
const parsedRed = analyze.parseDomainRdap(domainRdapRedacted);
ok("rdap parse: redacted registrant drops to null",
  parsedRed.registrant === null);
ok("rdap parse: redacted record still yields registrar + abuse",
  parsedRed.registrar === "Tucows Domains Inc." &&
    parsedRed.registrarAbuse === "domainabuse@tucows.com");
ok("rdap parse: redacted record still yields the date",
  parsedRed.registered === "2026-10-30T03:11:00Z");
const parsedEmpty = analyze.parseDomainRdap(null);
ok("rdap parse: null record -> all-null block",
  parsedEmpty.registrar === null && parsedEmpty.registered === null &&
    parsedEmpty.registrarAbuse === null &&
    parsedEmpty.registrant === null);
const parsedNoEvents = analyze.parseDomainRdap({ entities: [] });
ok("rdap parse: missing events -> registered null",
  parsedNoEvents.registered === null);

// ---------- domainFreshness (pure) ----------
const fresh = analyze.domainFreshness;
let f1 = fresh("2026-11-02T07:38:57Z", "2026-11-04T12:00:00Z");
ok("freshness: 2 days before, fresh",
  !!f1 && f1.daysBefore === 2 && f1.fresh === true);
let f0 = fresh("2026-11-02T07:38:57Z", "2026-11-02T09:00:00Z");
ok("freshness: same day, fresh",
  !!f0 && f0.daysBefore === 0 && f0.fresh === true);
let f30 = fresh("2026-10-03T00:00:00Z", "2026-11-02T00:00:00Z");
ok("freshness: exactly 30 days, still fresh",
  !!f30 && f30.daysBefore === 30 && f30.fresh === true);
let f31 = fresh("2026-10-02T00:00:00Z", "2026-11-02T00:00:00Z");
ok("freshness: 31 days, not fresh",
  !!f31 && f31.daysBefore === 31 && f31.fresh === false);
let fOld = fresh("2025-11-02T00:00:00Z", "2026-11-02T00:00:00Z");
ok("freshness: a year old, not fresh",
  !!fOld && fOld.daysBefore === 365 && fOld.fresh === false);
ok("freshness: unparseable date -> null",
  fresh("garbage", "2026-11-02T00:00:00Z") === null);
let fNeg = fresh("2026-11-05T00:00:00Z", "2026-11-02T00:00:00Z");
ok("freshness: registered after arrival is never fresh",
  !!fNeg && fNeg.daysBefore < 0 && fNeg.fresh === false);

// ---------- complaint builders (pure, literal analysis) ----------
const hostA = {
  from: "Breath Fresh <breath@breaathiizen.shop>",
  subject: "Your breath stinks",
  date: "Tue, 3 Nov 2026 12:00:00 +0000",
  senderDomain: "breaathiizen.shop",
  urls: ["https://breaathiizen.shop/landing"],
  fullHeaders: "From: Breath Fresh <breath@breaathiizen.shop>\n" +
    "Received: from mail.breaathiizen.shop ([161.199.35.234])",
  bodyText: "Fix your breath today.",
  websiteHost: {
    domain: "breaathiizen.shop", ip: "104.206.252.110",
    host: "host.breaathiizen.shop", org: "Eonix Corporation",
    abuse: "poc@eonix.net", hyperscaler: null, formLane: null,
    checkedDate: "2026-11-03"
  }
};
const hc = analyze.buildHostingComplaint(hostA);
ok("hosting complaint: addressed to the website abuse desk",
  !!hc && hc.to === "poc@eonix.net");
ok("hosting complaint: subject names domain and IP",
  !!hc && hc.subject.indexOf("breaathiizen.shop") !== -1 &&
    hc.subject.indexOf("104.206.252.110") !== -1);
ok("hosting complaint: body carries the domain",
  !!hc && hc.body.indexOf("breaathiizen.shop") !== -1);
ok("hosting complaint: body carries the resolving IP",
  !!hc && hc.body.indexOf("104.206.252.110") !== -1);
ok("hosting complaint: body carries the checked date",
  !!hc && hc.body.indexOf("2026-11-03") !== -1);
ok("hosting complaint: fraud-forward wording",
  !!hc && /fraud/i.test(hc.body) && /fraud/i.test(hc.subject));
ok("hosting complaint: asks to suspend hosting",
  !!hc && hc.body.indexOf("suspend hosting") !== -1);
ok("hosting complaint: headers ride in the body",
  !!hc && hc.body.indexOf("161.199.35.234") !== -1);
const hostFormLane = JSON.parse(JSON.stringify(hostA));
hostFormLane.websiteHost.formLane = "azure";
ok("hosting complaint: null for a form-only host",
  analyze.buildHostingComplaint(hostFormLane) === null);
const hostNoAbuse = JSON.parse(JSON.stringify(hostA));
hostNoAbuse.websiteHost.abuse = null;
ok("hosting complaint: null with no abuse contact",
  analyze.buildHostingComplaint(hostNoAbuse) === null);
ok("hosting complaint: null with no website trace",
  analyze.buildHostingComplaint({}) === null);

const regA = {
  from: "Breath Fresh <breath@breaathiizen.shop>",
  subject: "Your breath stinks",
  date: "Tue, 3 Nov 2026 12:00:00 +0000",
  senderDomain: "breaathiizen.shop",
  urls: ["https://breaathiizen.shop/landing"],
  fullHeaders: "From: Breath Fresh <breath@breaathiizen.shop>",
  bodyText: "Fix your breath today.",
  registrarInfo: {
    registrar: "NameCheap, Inc.", registrarAbuse: "abuse@namecheap.com",
    registered: "2026-11-02T07:38:57Z",
    registrant: { name: "Amit Kushwaha", org: null,
                  email: "rohansharmars3786265@gmail.com" },
    freshness: { daysBefore: 1, fresh: true }
  }
};
const rc = analyze.buildRegistrarComplaint(regA);
ok("registrar complaint: addressed to the registrar abuse desk",
  !!rc && rc.to === "abuse@namecheap.com");
ok("registrar complaint: DNS Abuse theme",
  !!rc && rc.body.indexOf("DNS Abuse") !== -1 &&
    rc.subject.indexOf("DNS abuse") !== -1);
ok("registrar complaint: registration date in the body",
  !!rc && rc.body.indexOf("02 Nov 2026") !== -1,
  "utcStamp renders the RDAP date in the codebase's UTC format");
ok("registrar complaint: the interval is stated",
  !!rc && rc.body.indexOf("1 day later") !== -1);
ok("registrar complaint: fraud-forward wording",
  !!rc && /fraud/i.test(rc.body));
ok("registrar complaint: asks to suspend the domain",
  !!rc && rc.body.indexOf("suspend the") !== -1 &&
    rc.body.indexOf("domain") !== -1);
ok("registrar complaint: null with no abuse contact",
  analyze.buildRegistrarComplaint({ registrarInfo: {} }) === null);

// ---------- website form lane + form evidence ----------
ok("formLane: hyperscaler wins",
  analyze.websiteFormLane({ hyperscaler: "azure", abuse: "x@y.z" }) ===
    "azure");
ok("formLane: OVH abuse contact matches",
  analyze.websiteFormLane({ abuse: "abuse@ovh.net" }) === "ovh");
ok("formLane: OVH org matches",
  analyze.websiteFormLane({ org: "OVH SAS" }) === "ovh");
ok("formLane: plain host -> null",
  analyze.websiteFormLane({ abuse: "poc@eonix.net",
    org: "Eonix Corporation" }) === null);
const hfe = analyze.buildHostingFormEvidence(hostA);
ok("hosting form evidence: names domain and IP",
  !!hfe && hfe.indexOf("breaathiizen.shop") !== -1 &&
    hfe.indexOf("104.206.252.110") !== -1);
ok("hosting form evidence: truthful hosted wording",
  !!hfe && hfe.indexOf("is hosted on your network") !== -1 &&
    hfe.indexOf("sent this spam from") === -1);
ok("hosting form evidence: headers included",
  !!hfe && hfe.indexOf("161.199.35.234") !== -1);
ok("hosting form evidence: null with no website trace",
  analyze.buildHostingFormEvidence({}) === null);

// ---------- fitGivenComplaint ----------
const shortPlan = analyze.fitGivenComplaint("me@example.com", {
  to: "poc@eonix.net", subject: "Hi", body: "short body" });
ok("fitGiven: short complaint goes direct",
  !!shortPlan && shortPlan.mode === "direct" &&
    shortPlan.url.indexOf("https://mail.google.com/mail/") === 0);
ok("fitGiven: plan keeps the full complaint",
  !!shortPlan && shortPlan.complaint.body === "short body");
const bigBody = new Array(30001).join("x");
const bigPlan = analyze.fitGivenComplaint("me@example.com", {
  to: "poc@eonix.net", subject: "Big", body: bigBody });
ok("fitGiven: oversized complaint goes paste mode",
  !!bigPlan && bigPlan.mode === "paste");
ok("fitGiven: paste URL stays within the budget",
  !!bigPlan && bigPlan.url.length <= 8000,
  "got " + (bigPlan && bigPlan.url.length));
ok("fitGiven: paste plan still carries the whole body",
  !!bigPlan && bigPlan.complaint.body.length === 30000);
ok("fitGiven: null without a recipient",
  analyze.fitGivenComplaint("me@example.com", { body: "x" }) === null);

// ---------- panel source pins ----------
ok("panel: website section id present",
  contentSrc.indexOf("sf-sec-website") !== -1);
ok("panel: registrar section id present",
  contentSrc.indexOf("sf-sec-registrar") !== -1);
ok("panel: trace kicked off from renderResult",
  contentSrc.indexOf("traceSenderDomain") !== -1);
ok("panel: sections anchor above the PID toggle",
  contentSrc.indexOf("#sf-sec-pid-toggle") !== -1);
ok("panel: website complaint textarea id",
  contentSrc.indexOf("sf-website-text") !== -1);
ok("panel: registrar complaint textarea id",
  contentSrc.indexOf("sf-registrar-text") !== -1);
ok("panel: fresh-domain tell wording present",
  contentSrc.indexOf("fresh-domain fraud tell") !== -1);
ok("panel: SA_LANES unchanged (no new history lanes)",
  contentSrc.indexOf(
    'var SA_LANES = ["complaint", "ftc", "sb", "fwd", "google", "pid"];'
  ) !== -1);

// ---------- async: resolution + end-to-end trace ----------
const RAW = [
  "From: Breath Fresh <breath@breaathiizen.shop>",
  "To: joe@example.com",
  "Subject: Your breath stinks",
  "Date: Tue, 3 Nov 2026 12:00:00 +0000",
  "Message-ID: <trace-test-1@breaathiizen.shop>",
  "Received: from mail.breaathiizen.shop ([161.199.35.234]) " +
    "by mx.google.com with ESMTP; Tue, 3 Nov 2026 12:00:00 +0000",
  "Content-Type: text/plain; charset=UTF-8",
  "",
  "Fix your breath now: https://breaathiizen.shop/landing"
].join("\r\n");

function run() {
  // websiteIpFor: direct A
  fetchLog = [];
  stubFetch({
    "name=apex.example&type=A": {
      Status: 0, Answer: [
        { name: "apex.example.", type: 1, TTL: 300,
          data: "104.206.252.110" }] }
  });
  return analyze.websiteIpFor("apex.example").then(function (ip) {
    ok("websiteIpFor: direct A resolves", ip === "104.206.252.110");

    // websiteIpFor: CNAME chain across two queries
    fetchLog = [];
    stubFetch({
      "name=www.chain.example&type=A": {
        Status: 0, Answer: [
          { name: "www.chain.example.", type: 5, TTL: 300,
            data: "chain.example." }] },
      "name=chain.example&type=A": {
        Status: 0, Answer: [
          { name: "chain.example.", type: 1, TTL: 300,
            data: "192.0.2.9" }] }
    });
    return analyze.websiteIpFor("www.chain.example");
  }).then(function (ip) {
    ok("websiteIpFor: CNAME followed to the A record",
      ip === "192.0.2.9");
    ok("websiteIpFor: both names were queried, in order",
      fetchLog.length === 2 &&
        fetchLog[0].indexOf("www.chain.example") !== -1 &&
        fetchLog[1].indexOf("name=chain.example") !== -1);

    // websiteIpFor: NXDOMAIN -> null
    stubFetch({
      "name=gone.example&type=A": { Status: 3, Answer: [] }
    });
    return analyze.websiteIpFor("gone.example");
  }).then(function (ip) {
    ok("websiteIpFor: NXDOMAIN -> null", ip === null);

    // websiteIpFor: fetch failure -> null
    stubFetch({ "name=down.example&type=A": "REJECT" });
    return analyze.websiteIpFor("down.example");
  }).then(function (ip) {
    ok("websiteIpFor: network failure -> null", ip === null);

    // websiteIpFor: CNAME loop is capped, not endless
    fetchLog = [];
    stubFetch({
      "name=loop.example&type=A": {
        Status: 0, Answer: [
          { name: "loop.example.", type: 5, TTL: 60,
            data: "loop2.example." }] },
      "name=loop2.example&type=A": {
        Status: 0, Answer: [
          { name: "loop2.example.", type: 5, TTL: 60,
            data: "loop.example." }] }
    });
    return analyze.websiteIpFor("loop.example");
  }).then(function (ip) {
    const aQueries = fetchLog.filter(function (u) {
      return u.indexOf("type=A") !== -1; }).length;
    ok("websiteIpFor: CNAME loop -> null", ip === null);
    ok("websiteIpFor: loop fetches are capped (<= 5)",
      aQueries >= 2 && aQueries <= 5, "got " + aQueries);

    // end-to-end: analyze + trace the .shop Fifteen shape
    fetchLog = [];
    stubFetch({
      "name=breaathiizen.shop&type=A": {
        Status: 0, Answer: [
          { name: "breaathiizen.shop.", type: 1, TTL: 300,
            data: "104.206.252.110" }] },
      "in-addr.arpa&type=PTR": {
        Status: 0, Answer: [
          { name: "110.252.206.104.in-addr.arpa.", type: 12,
            TTL: 300, data: "host.breaathiizen.shop." }] },
      "rdap.arin.net/registry/ip/104.206.252.110": eonixIpRdap,
      "data.iana.org/rdap/dns.json": bootstrapNoShop,
      "rdap.org/domain/breaathiizen.shop": domainRdapNamecheap
    });
    const a = analyze.analyze(RAW);
    return analyze.traceSenderDomain(a).then(function () { return a; });
  }).then(function (a) {
    ok("trace: website IP resolved",
      !!a.websiteHost && a.websiteHost.ip === "104.206.252.110");
    ok("trace: website org from IP RDAP",
      !!a.websiteHost && a.websiteHost.org === "Eonix Corporation");
    ok("trace: website abuse contact",
      !!a.websiteHost && a.websiteHost.abuse === "poc@eonix.net");
    ok("trace: website is not a form lane",
      !!a.websiteHost && a.websiteHost.formLane === null);
    ok("trace: hosting complaint built to the website desk",
      !!a.websiteComplaint &&
        a.websiteComplaint.to === "poc@eonix.net");
    ok("trace: registrar named",
      !!a.registrarInfo &&
        a.registrarInfo.registrar === "NameCheap, Inc.");
    ok("trace: registrar abuse contact",
      !!a.registrarInfo &&
        a.registrarInfo.registrarAbuse === "abuse@namecheap.com");
    ok("trace: registrant surfaced (unredacted record)",
      !!a.registrarInfo && !!a.registrarInfo.registrant &&
        a.registrarInfo.registrant.name === "Amit Kushwaha");
    ok("trace: freshness computed against the message date",
      !!a.registrarInfo && !!a.registrarInfo.freshness &&
        a.registrarInfo.freshness.daysBefore === 1 &&
        a.registrarInfo.freshness.fresh === true);
    ok("trace: registrar complaint carries the interval",
      !!a.registrarComplaint &&
        a.registrarComplaint.body.indexOf("1 day later") !== -1);

    // whitelisted sender domain: no fetches, no lanes
    fetchLog = [];
    const g = analyze.analyze(
      RAW.replace("breath@breaathiizen.shop", "someone@gmail.com")
         .replace("mail.breaathiizen.shop", "mail.gmail.com")
         .replace("<trace-test-1@breaathiizen.shop>",
                  "<trace-test-2@gmail.com>"));
    return analyze.traceSenderDomain(g).then(function () { return g; });
  }).then(function (g) {
    ok("trace: whitelisted domain performs no fetches",
      fetchLog.length === 0, "got " + fetchLog.length);
    ok("trace: whitelisted domain leaves both lanes null",
      g.websiteHost === null && g.registrarInfo === null);

    // duplicate target: website == mail lane's IP + desk
    fetchLog = [];
    stubFetch({
      "name=breaathiizen.shop&type=A": {
        Status: 0, Answer: [
          { name: "breaathiizen.shop.", type: 1, TTL: 300,
            data: "104.206.252.110" }] },
      "in-addr.arpa&type=PTR": { Status: 0, Answer: [] },
      "rdap.arin.net/registry/ip/104.206.252.110": eonixIpRdap,
      "data.iana.org/rdap/dns.json": bootstrapNoShop,
      "rdap.org/domain/breaathiizen.shop": domainRdapNamecheap
    });
    const dup = analyze.analyze(RAW);
    dup.ip = "104.206.252.110";
    dup.abuse = "poc@eonix.net";
    return analyze.traceSenderDomain(dup).then(function () { return dup; });
  }).then(function (dup) {
    ok("trace: website on the mail lane's own desk is suppressed",
      dup.websiteHost === null && dup.websiteComplaint === null);
    ok("trace: registrar lane still lands when website is suppressed",
      !!dup.registrarInfo &&
        dup.registrarInfo.registrar === "NameCheap, Inc.");
  }).then(function () {
    console.log("\n" + pass + " passed, " + fail + " failed");
    process.exit(fail ? 1 : 0);
  }).catch(function (e) {
    console.log("\nERROR: " + (e && e.stack || e));
    console.log(pass + " passed, " + fail + " failed");
    process.exit(1);
  });
}
run();
