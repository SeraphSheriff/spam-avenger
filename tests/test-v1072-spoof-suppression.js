"use strict";
// Public 1.0.72 release (internal build .73) — never aim
// the domain lanes at a spoofed From domain
// (queued-spoof-domain-lane-suppression.md, Michael's call
// Nov 8 2026; trigger corrected the same day after a source
// check: the details panel's "The From address is spoofed"
// note is UNCONDITIONAL and must NOT key this suppression).
//
// The composite trigger (lib fromDomainSpoofed) fires only
// when ALL THREE hold:
//   (1) provenance — the MX test when the domain publishes
//       MX records (the sending server's registrable domain
//       matches none of the MX hosts' and is not the domain
//       itself); otherwise the message fails to authenticate
//       as the domain (no passing DKIM, no passing SPF);
//   (2) the website probe found a LIVE website on the From
//       domain (gate.senderSite === "live" — parked and
//       nosite never fire, so a throwaway campaign domain's
//       registrar lane survives);
//   (3) no extracted link's domain equals the From domain.
//
// Field shapes pinned here:
//  - the Nov 8 sextortion specimen (From colorami.com: live
//    site, MX at its own hoster, sent from an unrelated
//    Kenyan server, DKIM/DMARC missing) FIRES;
//  - the vitluma.fun campaign shape (no live website) does
//    NOT fire, registrar lane intact;
//  - a spoofed big brand (live site, DMARC fail, unrelated
//    sender, links elsewhere) FIRES.
// Panel side (static pins): runLaneGating nulls BOTH domain
// complaints and sets the flag; renderDomainTraceSections
// prints the labeled suppression note and renders neither
// section; mail/link lanes are untouched.

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

ok("manifest version stays 1.0.73", manifest.version === "1.0.84",
  "got " + manifest.version);

ok("note: the suppression sentence is Michael's exact wording",
  analyze.SPOOF_DOMAIN_EXPLANATION ===
    "The sender address is spoofed, so the website and " +
    "registrar of the domain in the From line belong to " +
    "somebody else \u2014 likely another victim. No complaint " +
    "was prepared against them.",
  "got " + analyze.SPOOF_DOMAIN_EXPLANATION);

// ---------- fromDomainSpoofed: field shapes (pure) ----------
const spoofed = analyze.fromDomainSpoofed;
const LIVE = { senderSite: "live" };

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
ok("trigger: the sextortion shape fires (MX test)",
  spoofed(sexShape(), LIVE) === true);
ok("trigger: the sextortion shape fires on the auth fallback too",
  spoofed(Object.assign(sexShape(), { senderMxDomains: null }),
    LIVE) === true);
ok("trigger: an empty MX answer falls back to the auth test",
  spoofed(Object.assign(sexShape(), { senderMxDomains: [] }),
    LIVE) === true);
ok("trigger: no live website, no fire (parked)",
  spoofed(sexShape(), { senderSite: "parked" }) === false);
ok("trigger: no live website, no fire (nosite)",
  spoofed(sexShape(), { senderSite: "nosite" }) === false);
ok("trigger: no site verdict, no fire",
  spoofed(sexShape(), {}) === false &&
    spoofed(sexShape(), null) === false);
ok("trigger: a passing SPF defeats the auth fallback",
  spoofed(Object.assign(sexShape(), {
    senderMxDomains: null,
    authResults: { spf: "pass", dkim: "none", dmarc: "none" }
  }), LIVE) === false);
ok("trigger: a passing DKIM defeats the auth fallback",
  spoofed(Object.assign(sexShape(), {
    senderMxDomains: null,
    authResults: { spf: "none", dkim: "pass", dmarc: "fail" }
  }), LIVE) === false);
ok("trigger: a sender on the domain's own MX host does not fire",
  spoofed(Object.assign(sexShape(), {
    sendingServer: "mail.acenet-inc.net"
  }), LIVE) === false);
ok("trigger: a sender under the From domain itself does not fire",
  spoofed(Object.assign(sexShape(), {
    sendingServer: "mail.colorami.com"
  }), LIVE) === false);
ok("trigger: a link AT the From domain defeats it (domain is payload)",
  spoofed(Object.assign(sexShape(), {
    urls: ["https://colorami.com/special-offer"]
  }), LIVE) === false);
ok("trigger: a link UNDER the From domain defeats it too",
  spoofed(Object.assign(sexShape(), {
    urls: ["https://www.colorami.com/special-offer"]
  }), LIVE) === false);

// vitluma.fun: a throwaway campaign domain. The decisive
// fact is NO live website — the registrar lane must survive
// even with incomplete auth and an unrelated sending hoster.
function vitlumaShape() {
  return {
    senderDomain: "vitluma.fun",
    from: "Vitluma <news@vitluma.fun>",
    authResults: { spf: "none", dkim: "none", dmarc: "none" },
    sendingServer: "relay.campaignhoster.net",
    host: "relay.campaignhoster.net",
    receivedHosts: ["relay.campaignhoster.net"],
    urls: ["https://vitluma.fun/landing"],
    senderMxDomains: null
  };
}
ok("trigger: vitluma shape does not fire without a live website",
  spoofed(vitlumaShape(), { senderSite: "nosite" }) === false &&
    spoofed(vitlumaShape(), { senderSite: "parked" }) === false);
ok("trigger: vitluma shape does not fire even probed live " +
   "(its own links make it the payload)",
  spoofed(vitlumaShape(), LIVE) === false);

// Spoofed big brand: live site, DMARC fail, unrelated
// sender, links point at the phish domain.
ok("trigger: the spoofed big-brand shape fires",
  spoofed({
    senderDomain: "capitalone.com",
    from: "Capital One <security@capitalone.com>",
    authResults: { spf: "fail", dkim: "fail", dmarc: "fail" },
    sendingServer: "vps.hostingprovider.net",
    host: "vps.hostingprovider.net",
    receivedHosts: ["vps.hostingprovider.net"],
    urls: ["https://capitalone-secure.example/login"],
    senderMxDomains: ["google.com"]
  }, LIVE) === true);

// ---------- content.js wiring (static) ----------
ok("panel: runLaneGating evaluates the trigger on a live site",
  contentSrc.indexOf("SA.fromDomainSpoofed(a, gate)") !== -1 &&
    contentSrc.indexOf(
      'gate.senderSite === "live"') !== -1);
const fireAt = contentSrc.indexOf("a.spoofDomainSuppressed = true");
const fireTail = fireAt === -1 ? "" : contentSrc.slice(fireAt, fireAt + 300);
ok("panel: a fire nulls BOTH domain complaints",
  fireTail.indexOf("a.websiteComplaint = null") !== -1 &&
    fireTail.indexOf("a.registrarComplaint = null") !== -1);
ok("panel: the fire block never touches the link complaint",
  fireTail.indexOf("linkComplaint") === -1);
ok("panel: the suppression note is collected into the blocked group",
  contentSrc.indexOf(
    'placeGateNote("Website host and Registrar:",') !== -1 &&
  contentSrc.indexOf(
    "window.SpamAvenger.SPOOF_DOMAIN_EXPLANATION") !== -1 &&
  // queued-blocked-lanes-group.md: placeGateNote hands the
  // note to the bottom-group collector instead of
  // inserting it in place where the lanes stood.
  (function () {
    var at = contentSrc.indexOf("function placeGateNote");
    var seg = at === -1 ? "" : contentSrc.slice(at, at + 400);
    return seg.indexOf("addBlockedNote(n)") !== -1 &&
      seg.indexOf("insertBefore") === -1;
  })());
ok("panel: the website section is gated off when suppressed",
  contentSrc.indexOf(
    "!a.websiteHostHidden &&\n          !a.spoofDomainSuppressed") !== -1 ||
  contentSrc.indexOf("!a.spoofDomainSuppressed") !== -1);
ok("panel: the registrar section is gated off when suppressed",
  contentSrc.indexOf(
    "if (!a.spoofDomainSuppressed && ri &&") !== -1);
ok("panel: the trigger is NOT the details note (it stays unconditional)",
  contentSrc.indexOf(
    "'The \"From\" address is spoofed. The IP is the face underneath.'")
    !== -1);

// ---------- trace e2e with stubbed fetch ----------
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
    { eventAction: "registration", eventDate: "1998-06-15T04:00:00Z" }
  ],
  entities: [
    { roles: ["registrar"],
      vcardArray: ["vcard", [
        ["version", {}, "text", "4.0"],
        ["fn", {}, "text", "Example Registrar, LLC"]]],
      entities: [
        { roles: ["abuse"],
          vcardArray: ["vcard", [
            ["version", {}, "text", "4.0"],
            ["fn", {}, "text", "Registrar Abuse"],
            ["email", {}, "text", "abuse@registrar.example"]]] } ] }
  ]
};
const RAW_SEX = [
  "From: <mjf@colorami.com>",
  "To: mjf@colorami.com",
  "Subject: Delivery Status Notification.",
  "Date: Sat, 8 Nov 2026 04:47:00 -0800",
  "Message-ID: <spoof-test-1@colorami.com>",
  "Authentication-Results: mx.google.com; spf=neutral " +
    "smtp.mailfrom=colorami.com; dkim=none header.d=colorami.com; " +
    "dmarc=none header.from=colorami.com",
  "Received: from mail.capitalcolours.co.ke ([41.220.121.102]) " +
    "by mx.google.com with ESMTPS; Sat, 8 Nov 2026 04:47:00 -0800",
  "Content-Type: text/plain; charset=UTF-8",
  "",
  "Hello, I have been monitoring your internet activities. " +
  "I secretly embedded malware into an adult site and " +
  "recorded you. I can activate your camera and microphone. " +
  "I have saved these recordings, clips of your " +
  "embarrassing videos. Send the payment and they vanish."
].join("\r\n");

const hosterIpRdap = {
  name: "CAMPAIGN-HOSTING",
  entities: [
    { roles: ["registrant"],
      vcardArray: ["vcard", [
        ["version", {}, "text", "4.0"],
        ["fn", {}, "text", "Campaign Hosting Ltd"]]] },
    { roles: ["abuse"],
      vcardArray: ["vcard", [
        ["version", {}, "text", "4.0"],
        ["fn", {}, "text", "Hosting Abuse"],
        ["email", {}, "text", "abuse@hosting.example"]]] }
  ]
};
const quickloanDomainRdap = {
  ldhName: "quickloan-deals.com",
  events: [
    { eventAction: "registration", eventDate: "2026-05-06T00:00:00Z" }
  ],
  entities: [
    { roles: ["registrar"],
      vcardArray: ["vcard", [
        ["version", {}, "text", "4.0"],
        ["fn", {}, "text", "NameCheap, Inc."]]],
      entities: [
        { roles: ["abuse"],
          vcardArray: ["vcard", [
            ["version", {}, "text", "4.0"],
            ["fn", {}, "text", "Namecheap Abuse Contact"],
            ["email", {}, "text", "abuse@namecheap.com"]]] } ] }
  ]
};
const RAW_QL = [
  "From: Promo <promo@quickloan-deals.com>",
  "To: joe@example.com",
  "Subject: Your loan is ready",
  "Date: Tue, 3 Nov 2026 09:00:00 +0000",
  "Message-ID: <spoof-test-2@quickloan-deals.com>",
  "Authentication-Results: mx.google.com; spf=none " +
    "smtp.mailfrom=quickloan-deals.com; dkim=none; " +
    "dmarc=none header.from=quickloan-deals.com",
  "Received: from mail.quickloan-deals.com ([185.220.101.7]) " +
    "by mx.google.com with ESMTPS; Tue, 3 Nov 2026 09:00:00 +0000",
  "Content-Type: text/plain; charset=UTF-8",
  "",
  "Great rates today. See https://trk.other-example.net/x " +
  "for the details."
].join("\r\n");

function run() {
  stubFetch({
    "name=colorami.com&type=A": {
      Status: 0, Answer: [
        { name: "colorami.com.", type: 1, TTL: 300,
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
  const a = analyze.analyze(RAW_SEX);
  return analyze.traceSenderDomain(a).then(function () { return a; })
  .then(function (a2) {
    ok("trace: the victim domain's website facts are kept",
      !!a2.websiteHost && a2.websiteHost.ip === "192.0.2.55" &&
        a2.websiteHost.abuse === "abuse@acenet-inc.net",
      "got " + JSON.stringify(a2.websiteHost));
    ok("trace: the victim domain's registrar facts are kept",
      !!a2.registrarInfo &&
        a2.registrarInfo.registrar === "Example Registrar, LLC");
    ok("trace: the MX hosts ride the trace as registrable domains",
      JSON.stringify(a2.senderMxDomains) === '["acenet-inc.net"]',
      "got " + JSON.stringify(a2.senderMxDomains));
    ok("trace: both desks existed (complaints built pre-gating)",
      !!a2.websiteComplaint && !!a2.registrarComplaint);
    ok("trace: the traced specimen fires the trigger on a live site",
      spoofed(a2, LIVE) === true);
    ok("trace: the same analysis does not fire when not live",
      spoofed(a2, { senderSite: "nosite" }) === false);

    // Control: the throwaway domain on its own infrastructure
    stubFetch({
      "name=quickloan-deals.com&type=A": {
        Status: 0, Answer: [
          { name: "quickloan-deals.com.", type: 1, TTL: 300,
            data: "185.220.101.99" }] },
      "in-addr.arpa&type=PTR": {
        Status: 0, Answer: [
          { name: "99.101.220.185.in-addr.arpa.", type: 12,
            TTL: 300, data: "host.quickloan-deals.com." }] },
      "rdap.arin.net/registry/ip/185.220.101.99": hosterIpRdap,
      "name=quickloan-deals.com&type=MX": {
        Status: 0, Answer: [
          { name: "quickloan-deals.com.", type: 15, TTL: 300,
            data: "0 mail.quickloan-deals.com." }] },
      "data.iana.org/rdap/dns.json": bootstrapCom,
      "domain/quickloan-deals.com": quickloanDomainRdap
    });
    const q = analyze.analyze(RAW_QL);
    return analyze.traceSenderDomain(q).then(function () { return q; });
  }).then(function (q) {
    ok("control: the website complaint is built as before",
      !!q.websiteComplaint &&
        q.websiteComplaint.to === "abuse@hosting.example",
      "got " + (q.websiteComplaint && q.websiteComplaint.to));
    ok("control: the registrar complaint is built as before",
      !!q.registrarComplaint &&
        q.registrarComplaint.to === "abuse@namecheap.com");
    ok("control: the MX hosts are the domain's own",
      JSON.stringify(q.senderMxDomains) === '["quickloan-deals.com"]',
      "got " + JSON.stringify(q.senderMxDomains));
    ok("control: own-infrastructure sender does not fire the trigger",
      spoofed(q, LIVE) === false);
    console.log("\n" + pass + " passed, " + fail + " failed");
    process.exit(fail ? 1 : 0);
  }).catch(function (e) {
    console.log("\nERROR: " + (e && e.stack || e));
    console.log(pass + " passed, " + fail + " failed");
    process.exit(1);
  });
}
run();
