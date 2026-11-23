"use strict";
// Spam Avenger v1.0.73 — the ICANN escalation offer
// (queued-icann-escalation.md + icann-escalation-
// groundwork-nov17.md).
//
// When a registrar collects enough un-actioned reports,
// the panel offers the escalation kit: the bulk-domain
// CSV in the exact shape ICANN's compliance form accepted
// from Michael by hand (case 01684242: header row
// `domain`, one domain per line, .csv only), an evidence
// file, and the form's front-door selections. Records are
// written at recordLaunched (registrar lane only, deduped
// per registrar+domain, earliest standing); the trigger is
// 3+ distinct domains with the oldest 7+ days old;
// dismissal parks the offer until the count grows.
//
// Run: node tests/test-v1073-icann-escalation.js

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

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 10, 21, 9, 0).getTime();
const KEY = "namecheap, inc.";
function rec(domain, daysAgo, registrar) {
  return { registrar: registrar || KEY,
    registrarName: "NameCheap, Inc.",
    registrarAbuse: "abuse@namecheap.com",
    domain: domain, ip: "1.2.3.4", host: "h.example",
    ts: NOW - daysAgo * DAY };
}

// ---------- the key ----------
ok("key: the RDAP name keys the records, lowercased",
  analyze.icannRegistrarKey({ registrar: "NameCheap, Inc.",
    registrarAbuse: "abuse@namecheap.com" }) === KEY);
ok("key: the abuse contact keys it when no name is published",
  analyze.icannRegistrarKey({ registrar: null,
    registrarAbuse: "Abuse@Example.com" }) === "abuse@example.com");
ok("key: neither means no key",
  analyze.icannRegistrarKey({}) === "" &&
  analyze.icannRegistrarKey(null) === "");

// ---------- the trigger ----------
const three = [rec("a.shop", 10), rec("b.shop", 9), rec("c.shop", 8)];
const t1 = analyze.icannEscalationTrigger(three, KEY, NOW);
ok("trigger: 3 domains, oldest 10 days -> fires",
  !!t1 && t1.count === 3 && t1.oldestTs === NOW - 10 * DAY &&
  t1.domains.join(",") === "a.shop,b.shop,c.shop",
  JSON.stringify(t1));
ok("trigger: 2 domains -> silent",
  analyze.icannEscalationTrigger(three.slice(0, 2), KEY, NOW) === null);
ok("trigger: 3 domains but the oldest is 6 days -> silent",
  analyze.icannEscalationTrigger(
    [rec("a.shop", 6), rec("b.shop", 5), rec("c.shop", 4)],
    KEY, NOW) === null);
ok("trigger: another registrar's records don't count",
  analyze.icannEscalationTrigger(
    [rec("a.shop", 10, "other registrar"),
     rec("b.shop", 10, "other registrar"),
     rec("c.shop", 10, "other registrar")], KEY, NOW) === null);
const dupes = [rec("a.shop", 3), rec("a.shop", 12),
  rec("b.shop", 9), rec("c.shop", 8)];
const t5 = analyze.icannEscalationTrigger(dupes, KEY, NOW);
ok("trigger: a re-reported domain counts once, at its EARLIEST ts",
  !!t5 && t5.count === 3 && t5.oldestTs === NOW - 12 * DAY,
  JSON.stringify(t5));

// ---------- the CSV (the accepted shape, byte-checked) ----------
const csv = analyze.buildIcannDomainCsv(
  ["B.shop", "a.shop", " c.shop "]);
ok("csv: header row, one domain per line, sorted input kept in order, trimmed + lowered",
  csv === "domain\nb.shop\na.shop\nc.shop\n",
  JSON.stringify(csv));
ok("csv: no quotes, no extra columns, no commentary",
  csv.indexOf('"') === -1 && csv.indexOf(",") === -1 &&
  csv.split("\n").length === 5);

// ---------- the evidence file ----------
const a = {
  senderDomain: "a.shop",
  from: "Pills <x@a.shop>",
  subject: "Cheap pills",
  date: "Fri, 20 Nov 2026 10:00:00 -0700",
  ip: "1.2.3.4",
  fullHeaders: "Received: from a.shop by mx.google.com\nFrom: Pills <x@a.shop>",
  bodyText: "Buy at https://a.shop/x now",
  registrarInfo: { registrar: "NameCheap, Inc.",
    registrarAbuse: "abuse@namecheap.com",
    registered: "2026-11-19T07:48:42Z", registrant: null }
};
const ev = analyze.buildIcannEvidence(a, {
  registrar: "NameCheap, Inc.",
  registrarAbuse: "abuse@namecheap.com",
  domains: ["a.shop", "b.shop", "c.shop"],
  count: 3, oldestTs: NOW - 10 * DAY
});
ok("evidence: narrative names the registrar, the count, the duty",
  !!ev && ev.indexOf("NameCheap, Inc.") !== -1 &&
  ev.indexOf("not actioned: 3") !== -1 &&
  ev.indexOf("3.18") !== -1 &&
  ev.indexOf("reasonable and") !== -1);
ok("evidence: the domain list and the oldest date ride along",
  !!ev && ev.indexOf("- a.shop") !== -1 &&
  ev.indexOf("Oldest report: 2026-11-11") !== -1);
ok("evidence: the registrar complaint and the sample follow",
  !!ev && ev.indexOf("Hello Registrar Abuse Team,") !== -1 &&
  ev.indexOf("Original message sample") !== -1 &&
  ev.indexOf("Received: from a.shop by mx.google.com") !== -1 &&
  ev.indexOf("hxxps://a[.]shop/x") !== -1);

// ---------- the record write (extracted, fake store) ----------
function extractFn(src, startNeedle, endNeedle) {
  const x = src.indexOf(startNeedle);
  const y = x === -1 ? -1 : src.indexOf(endNeedle, x);
  return (x === -1 || y === -1) ? "" : src.slice(x, y);
}
const wsrc = extractFn(contentSrc,
  "function saWriteRegistrarReport()",
  "// v1.0.73: download a text file");
ok("write: saWriteRegistrarReport extracted from content.js",
  wsrc.indexOf("SA_REGISTRAR_REPORTS_KEY") !== -1);
const storeData = {};
const fakeStore = {
  get: function (key, cb) {
    const res = {};
    res[key] = storeData[key];
    cb(res);
  },
  set: function (payload, cb) {
    Object.keys(payload).forEach(function (k) {
      storeData[k] = payload[k];
    });
    if (cb) cb();
  }
};
const sandbox = {
  window: { SpamAvenger: analyze },
  SA_REGISTRAR_REPORTS_KEY: "saRegistrarReports",
  sfCurrentAnalysis: {
    senderDomain: "a.shop", ip: "1.2.3.4", host: "h.example",
    registrarInfo: { registrar: "NameCheap, Inc.",
      registrarAbuse: "abuse@namecheap.com" }
  },
  saStorageLocal: function () { return fakeStore; },
  Date: Date
};
const saWriteRegistrarReport = vm.runInNewContext(
  wsrc + "\n;saWriteRegistrarReport;", sandbox);
saWriteRegistrarReport();
saWriteRegistrarReport(); // same message relaunched
ok("write: one record per (registrar, domain)",
  (storeData.saRegistrarReports || []).length === 1 &&
  storeData.saRegistrarReports[0].registrar === KEY &&
  storeData.saRegistrarReports[0].domain === "a.shop",
  JSON.stringify(storeData.saRegistrarReports));
sandbox.sfCurrentAnalysis = {
  senderDomain: "b.shop", ip: "1.2.3.4", host: "h.example",
  registrarInfo: { registrar: "NameCheap, Inc.",
    registrarAbuse: "abuse@namecheap.com" }
};
saWriteRegistrarReport();
ok("write: a second domain adds a second record",
  (storeData.saRegistrarReports || []).length === 2);

// ---------- the panel wiring ----------
ok("content: the record write hangs off the registrar launch only",
  contentSrc.indexOf('if (lane === "registrar")') !== -1 &&
  contentSrc.indexOf("saWriteRegistrarReport();") !== -1);
ok("content: the offer renders off the registrar section",
  contentSrc.indexOf("renderIcannEscalationOffer(ri)") !== -1 &&
  contentSrc.indexOf('"sf-sec-icann"') !== -1);
ok("content: liveness gates the kit (probe outcome 'response')",
  contentSrc.indexOf('r.outcome === "response"') !== -1 &&
  contentSrc.indexOf("liveDomains.length") !== -1);
ok("content: dismissal parks the offer at the count it had",
  contentSrc.indexOf("SA_ICANN_DISMISSED_KEY") !== -1 &&
  contentSrc.indexOf("trig.count <= dismissed[key]") !== -1 &&
  contentSrc.indexOf("dmap[key] = trig.count") !== -1);
ok("content: the kit downloads both files and opens the real form",
  contentSrc.indexOf('saDownloadText("icann-domains.csv"') !== -1 &&
  contentSrc.indexOf('saDownloadText("icann-evidence.txt"') !== -1 &&
  contentSrc.indexOf("https://icann-nsp.my.site.com/compliance/s/abuse-domain") !== -1);
ok("content: the selection card carries the spec's choices",
  contentSrc.indexOf("registrar did not take reasonable") !== -1 &&
  contentSrc.indexOf("Spam, Pharmaceutical, and") !== -1 &&
  contentSrc.indexOf("signedInAccountName()") !== -1);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
