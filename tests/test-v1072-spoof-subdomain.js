"use strict";
// Public 1.0.72 release (internal build .73) — the spoof
// suppression's subdomain escape (field failure, Nov 8
// 2026 evening; queued-spoof-domain-lane-suppression.md).
//
// The specimen: "Webmail Support
// <support@verify.colorami.com>", a cPanel phish
// impersonating the recipient's own host, sent from a
// Google Cloud IP, its only link at keithguastella.com.
// The panel killed the website lane on the NO-LIVE-WEBSITE
// gate and drafted a full Registrar complaint against
// colorami.com (DomainSpot LLC) — the exact self-report
// the suppression exists to prevent. It had fired
// correctly hours earlier for the sextortion specimen,
// whose From domain was colorami.com itself.
//
// AUTOPSY (the wire): legs (1) MX and (3) links always
// graded the REGISTRABLE domain — traceSenderDomain fills
// a.senderMxDomains from mxHostDomains(registrable) and
// fromDomainSpoofed compares links against domRg. Leg (2),
// liveness, was graded by the PANEL on the raw From HOST:
// runLaneGating probed a.senderDomain verbatim
// (verify.colorami.com → no website → gate.senderSite
// "nosite"), so the suppression branch (which required
// senderSite "live") never ran, the flow fell into the
// nosite branch (website lane only), and the registrar
// complaint — built against the registrable domain —
// survived.
//
// THE FIX: every leg grades the domain the lanes complain
// about. runLaneGating now also probes/verdicts the
// registrable domain (gate.senderSiteRg), and
// fromDomainSpoofed's liveness leg reads senderSiteRg
// when the panel took one (senderSite stays the fallback
// and still drives the website lane's own gates, whose
// behavior is unchanged).

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

ok("manifest version stays 1.0.73", manifest.version === "1.0.74",
  "got " + manifest.version);

// ---------- the registrable helper is exported ----------
ok("lib: registrableDomain is exported for the panel",
  typeof analyze.registrableDomain === "function" &&
    analyze.registrableDomain("verify.colorami.com") === "colorami.com" &&
    analyze.registrableDomain("colorami.com") === "colorami.com");

// ---------- fromDomainSpoofed: the subdomain shape ----------
const spoofed = analyze.fromDomainSpoofed;

// The field specimen, as an analysis: From host a
// subdomain of the victim's domain; MX on the apex at the
// victim's hoster; sent from an unrelated cloud server;
// the only link points at the phish host, not the domain.
function verifyShape() {
  return {
    senderDomain: "verify.colorami.com",
    from: "Webmail Support <support@verify.colorami.com>",
    authResults: { spf: "permerror", dkim: "none", dmarc: "none" },
    sendingServer: "mail.gcp-instance.example",
    host: "mail.gcp-instance.example",
    receivedHosts: ["mail.gcp-instance.example"],
    urls: ["https://keithguastella.com/webcpnel#mjf@colorami.com"],
    senderMxDomains: ["acenet-inc.net"]
  };
}
ok("trigger: the subdomain specimen FIRES when the apex site is live " +
   "(the From host itself has no site — the old escape)",
  spoofed(verifyShape(),
    { senderSite: "nosite", senderSiteRg: "live" }) === true);
ok("trigger: the subdomain specimen does not fire when the apex " +
   "has no live site either",
  spoofed(verifyShape(),
    { senderSite: "nosite", senderSiteRg: "nosite" }) === false &&
  spoofed(verifyShape(),
    { senderSite: "nosite", senderSiteRg: "parked" }) === false);
ok("trigger: the registrable verdict GOVERNS — a live subdomain " +
   "site does not fire when the apex is not live",
  spoofed(verifyShape(),
    { senderSite: "live", senderSiteRg: "nosite" }) === false);
ok("trigger: the subdomain specimen does not fire on the From " +
   "host's verdict alone (no registrable verdict taken)",
  spoofed(verifyShape(), { senderSite: "nosite" }) === false);
ok("trigger: a link AT the apex still defeats the subdomain shape " +
   "(leg 3 grades the registrable domain)",
  spoofed(Object.assign(verifyShape(), {
    urls: ["https://colorami.com/reset-password"]
  }), { senderSite: "nosite", senderSiteRg: "live" }) === false);
ok("trigger: a sender on the apex's own MX still defeats the " +
   "subdomain shape (leg 1)",
  spoofed(Object.assign(verifyShape(), {
    sendingServer: "mail.acenet-inc.net"
  }), { senderSite: "nosite", senderSiteRg: "live" }) === false);

// The sextortion shape (From host IS the registrable
// domain): one verdict serves both scopes; the plain
// senderSite gate the original suite pins still fires it.
function sexShape() {
  return {
    senderDomain: "colorami.com",
    from: "<mjf@colorami.com>",
    authResults: { spf: "neutral", dkim: "none", dmarc: "none" },
    sendingServer: "mail.capitalcolours.co.ke",
    host: "mail.capitalcolours.co.ke",
    receivedHosts: ["mail.capitalcolours.co.ke"],
    urls: [],
    senderMxDomains: ["acenet-inc.net"]
  };
}
ok("trigger: the sextortion shape still fires (host-verdict gate)",
  spoofed(sexShape(), { senderSite: "live" }) === true);
ok("trigger: the sextortion shape still fires (both verdicts live)",
  spoofed(sexShape(),
    { senderSite: "live", senderSiteRg: "live" }) === true);

// vitluma.fun: the registrable domain itself, no live
// website anywhere — must NOT fire, registrar lane intact.
ok("trigger: the vitluma shape still does not fire",
  spoofed({
    senderDomain: "vitluma.fun",
    from: "Vitluma <news@vitluma.fun>",
    authResults: { spf: "none", dkim: "none", dmarc: "none" },
    sendingServer: "relay.campaignhoster.net",
    host: "relay.campaignhoster.net",
    receivedHosts: ["relay.campaignhoster.net"],
    urls: ["https://vitluma.fun/landing"],
    senderMxDomains: null
  }, { senderSite: "nosite", senderSiteRg: "nosite" }) === false);

// A spoofed big brand from a subdomain of the brand.
ok("trigger: a spoofed big-brand SUBDOMAIN fires on the apex verdict",
  spoofed({
    senderDomain: "verify.paypal.com",
    from: "PayPal <support@verify.paypal.com>",
    authResults: { spf: "fail", dkim: "fail", dmarc: "fail" },
    sendingServer: "vps.hostingprovider.net",
    host: "vps.hostingprovider.net",
    receivedHosts: ["vps.hostingprovider.net"],
    urls: ["https://paypal-secure.example/login"],
    senderMxDomains: ["google.com"]
  }, { senderSite: "nosite", senderSiteRg: "live" }) === true);

// ---------- content.js wiring (static) ----------
ok("panel: the gate carries a registrable-domain verdict slot",
  contentSrc.indexOf("senderSiteRg: null") !== -1);
ok("panel: runLaneGating derives the registrable domain",
  contentSrc.indexOf("SA.registrableDomain(senderDomain)") !== -1);
ok("panel: the registrable verdict is recorded on the gate",
  contentSrc.indexOf("gate.senderSiteRg = v") !== -1);
ok("panel: the suppression call still hands the lib the whole gate",
  contentSrc.indexOf("SA.fromDomainSpoofed(a, gate)") !== -1);

// ---------- trace e2e: the specimen end to end ----------
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
const bootstrapCom = {
  services: [ [["com"], ["https://rdap.verisign.com/com/v1/"]] ]
};
const acenetIpRdap = {
  name: "ACENET-NET",
  entities: [
    { roles: ["registrant"],
      vcardArray: ["vcard", [
        ["version", {}, "text", "4.0"],
        ["fn", {}, "text", "AceNet, Inc."]]] },
    { roles: ["abuse"],
      vcardArray: ["vcard", [
        ["version", {}, "text", "4.0"],
        ["fn", {}, "text", "AceNet Abuse"],
        ["email", {}, "text", "abuse@acenet-inc.net"]]] }
  ]
};
const coloramiDomainRdap = {
  ldhName: "colorami.com",
  events: [
    { eventAction: "registration", eventDate: "2000-07-07T18:50:46Z" }
  ],
  entities: [
    { roles: ["registrar"],
      vcardArray: ["vcard", [
        ["version", {}, "text", "4.0"],
        ["fn", {}, "text", "DomainSpot LLC"]]],
      entities: [
        { roles: ["abuse"],
          vcardArray: ["vcard", [
            ["version", {}, "text", "4.0"],
            ["fn", {}, "text", "Registrar Abuse"],
            ["email", {}, "text",
              "icann-abuse-reports@tierra.net"]]] } ] }
  ]
};
const RAW_VERIFY = [
  "From: Webmail Support <support@verify.colorami.com>",
  "To: mjf@colorami.com",
  "Subject: Server Warning For mjf@colorami.com",
  "Date: Thu, 5 Nov 2026 10:42:54 -0800",
  "Message-ID: <spoof-test-3@verify.colorami.com>",
  "Authentication-Results: mx.google.com; spf=permerror " +
    "smtp.mailfrom=verify.colorami.com; dkim=none; " +
    "dmarc=none header.from=colorami.com",
  "Received: from mail.gcp-instance.example ([34.53.123.234]) " +
    "by mx.google.com with ESMTPS; Thu, 5 Nov 2026 10:42:54 -0800",
  "Content-Type: text/plain; charset=UTF-8",
  "",
  "Server warning: verify your account now at " +
  "https://keithguastella.com/webcpnel#mjf@colorami.com"
].join("\r\n");

stubFetch({
  "name=verify.colorami.com&type=A": {
    Status: 0, Answer: [
      { name: "verify.colorami.com.", type: 1, TTL: 300,
        data: "192.0.2.55" }] },
  "in-addr.arpa&type=PTR": {
    Status: 0, Answer: [
      { name: "55.2.0.192.in-addr.arpa.", type: 12, TTL: 300,
        data: "host.acenet-inc.net." }] },
  "rdap.arin.net/registry/ip/192.0.2.55": acenetIpRdap,
  "name=colorami.com&type=MX": {
    Status: 0, Answer: [
      { name: "colorami.com.", type: 15, TTL: 300,
        data: "10 mail.acenet-inc.net." }] },
  "data.iana.org/rdap/dns.json": bootstrapCom,
  "domain/colorami.com": coloramiDomainRdap
});
const va = analyze.analyze(RAW_VERIFY);
analyze.traceSenderDomain(va).then(function () {
  ok("trace: the specimen's MX hosts are the apex's",
    JSON.stringify(va.senderMxDomains) === '["acenet-inc.net"]',
    "got " + JSON.stringify(va.senderMxDomains));
  ok("trace: the registrar complaint WAS built against the apex " +
     "(pre-gating — the complaint the panel must suppress)",
    !!va.registrarComplaint &&
      va.registrarComplaint.to === "icann-abuse-reports@tierra.net" &&
      va.registrarComplaint.subject.indexOf("colorami.com") !== -1,
    "got " + (va.registrarComplaint &&
      va.registrarComplaint.subject));
  ok("trace: the specimen fires on the apex-live gate (the fix)",
    spoofed(va,
      { senderSite: "nosite", senderSiteRg: "live" }) === true);
  ok("trace: the specimen escaped on the host-only gate (the bug, " +
     "pinned as the regression)",
    spoofed(va, { senderSite: "nosite" }) === false);
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
}).catch(function (e) {
  console.log("\nERROR: " + (e && e.stack || e));
  console.log(pass + " passed, " + fail + " failed");
  process.exit(1);
});
