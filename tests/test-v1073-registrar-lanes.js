"use strict";
// Spam Avenger v1.0.73 — the registrar lane's two fixes:
//
// (1) queued-registrar-no-contact.md: a registrar record
// with NO registrar name and NO abuse contact (Registro.br's
// .br shape — direitodoestado.com.br, Michael's field find
// Nov 21 2026) rendered the Registrar section as a dead-end
// accordion with two fact rows and no action. Now the
// section does not render at all; the facts move to Show
// details as "Domain registered" / "Domain registrant"
// rows, the same ruling Michael made for the website/link
// lanes on Nov 8 2026. Contact-present cases are unchanged.
//
// (2) queued-wanshang-form-only-registrar.md: Wanshang
// Technology (abuse@kh86.cn) retired its email desk — the
// address autoresponds that complaints must go through
// https://ws.nameabuse.net/ instead. Its registrar lane is
// now a form kit like July Name's, branched on the lane's
// `kit`, with the guide written from Michael's live filing
// of Nov 21 2026 (WSABUSE-202611212348-8027).
//
// Run: node tests/test-v1073-registrar-lanes.js

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const contentSrc = fs.readFileSync(path.join(ROOT, "content.js"), "utf8");
const libSrc = fs.readFileSync(path.join(ROOT, "lib", "analyze.js"), "utf8");
const analyze = require(path.join(ROOT, "lib", "analyze.js"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); }
}

// ---------- (1) the .br record shape ----------
const brRdap = {
  objectClassName: "domain",
  ldhName: "direitodoestado.com.br",
  events: [
    { eventAction: "registration", eventDate: "2003-11-13T00:00:00Z" }
  ],
  entities: [
    { roles: ["registrant"],
      vcardArray: ["vcard", [
        ["version", {}, "text", "4.0"],
        ["fn", {}, "text", "Instituto de Direito Público da Bahia"]
      ]] }
  ]
};
const brInfo = analyze.parseDomainRdap(brRdap);
ok("br fixture: no registrar, no abuse contact anywhere",
  brInfo.registrar === null && brInfo.registrarAbuse === null,
  JSON.stringify(brInfo));
ok("br fixture: registered + registrant survive",
  brInfo.registered === "2003-11-13T00:00:00Z" &&
  !!brInfo.registrant &&
  brInfo.registrant.name === "Instituto de Direito Público da Bahia",
  JSON.stringify(brInfo));
ok("br fixture: no form lane fires on a contact-less record",
  analyze.registrarFormLane({ registrarInfo: brInfo }) === null);

// ---------- (1) content wiring ----------
ok("content: the no-contact verdict needs name AND contact " +
   "AND form lane all absent",
  contentSrc.indexOf("!ri.registrar && !ri.registrarAbuse && " +
    "!regFormLanePeek") !== -1);
ok("content: the section render is gated on the verdict",
  contentSrc.indexOf("if (!regNoContact && " +
    "!a.spoofDomainSuppressed && ri &&") !== -1);
ok("content: details gain the Domain registered row",
  contentSrc.indexOf('mkRow("Domain registered"') !== -1);
ok("content: details gain the Domain registrant row",
  contentSrc.indexOf('mkRow("Domain registrant"') !== -1);
ok("content: the registrar section itself still renders " +
   "for contact-present records",
  contentSrc.indexOf('acc.section("sf-sec-registrar"') !== -1);

// a registrar WITH an abuse contact is untouched by the fix
const namedRdap = {
  events: [
    { eventAction: "registration", eventDate: "2026-01-22T04:27:56Z" }
  ],
  entities: [
    { roles: ["registrar"],
      vcardArray: ["vcard", [
        ["version", {}, "text", "4.0"],
        ["fn", {}, "text", "NameCheap, Inc."]
      ]],
      entities: [
        { roles: ["abuse"],
          vcardArray: ["vcard", [
            ["version", {}, "text", "4.0"],
            ["email", {}, "text", "abuse@namecheap.com"]
          ]] }
      ] }
  ]
};
const namedInfo = analyze.parseDomainRdap(namedRdap);
ok("named fixture: registrar + abuse contact parse as before",
  namedInfo.registrar === "NameCheap, Inc." &&
  namedInfo.registrarAbuse === "abuse@namecheap.com",
  JSON.stringify(namedInfo));

// ---------- (2) the Wanshang lane ----------
const lane = analyze.registrarFormLane;
const w1 = lane({ registrarInfo: {
  registrar: "Wanshang Technology",
  registrarAbuse: "abuse@kh86.cn" } });
ok("wanshang: the RDAP name matches",
  !!w1 && w1.label === "Wanshang" && w1.kit === "wanshang");
// v1.0.82 narrows this pin: Wanshang's lane gets the
// same deep link BrandFocus's does — the complaint
// form itself (submit.php on the shared platform),
// not the platform homepage.
ok("wanshang: the form is the nameabuse platform's " +
   "complaint form itself (v1.0.82 deep link)",
  !!w1 && w1.url === "https://ws.nameabuse.net/submit.php" &&
  w1.linkText === "ws.nameabuse.net/submit.php");
ok("wanshang: the description cap is the form's own 2,000",
  !!w1 && w1.descriptionCap === 2000,
  "got " + (w1 && w1.descriptionCap));
const w2 = lane({ registrarInfo: {
  registrar: "Vantage of Convergence (Chengdu) Technology Co., Ltd.",
  registrarAbuse: "abuse@kh86.cn" } });
ok("wanshang: the abuse-contact domain alone matches " +
   "(the field case: a sister company's name, kh86.cn desk)",
  !!w2 && w2.url === "https://ws.nameabuse.net/submit.php");
ok("wanshang: a lookalike domain does not match",
  lane({ registrarInfo: { registrar: "Example Registrar",
    registrarAbuse: "abuse@kh86.cn.evil.example" } }) === null &&
  lane({ registrarInfo: { registrar: "Example Registrar",
    registrarAbuse: "abuse@notkh86.cn" } }) === null);
const jy = lane({ registrarInfo: {
  registrar: "July Name Limited",
  registrarAbuse: "abuse@julyname.com" } });
ok("julyname: the original lane is unchanged, kit-tagged",
  !!jy && jy.label === "July Name" && jy.kit === "julyname" &&
  jy.descriptionCap === 1000 &&
  jy.url === "https://www.juyu.com/jubao_sy.htm");

// ---------- (2) the kit evidence ----------
function mkA(registrarInfo) {
  return {
    senderDomain: "jiuzhicui.com",
    from: "Louis Vuitton <mjfcompany@jiuzhicui.com>",
    subject: "[Black Friday 2026 Deals] Luxury Bags Starting at Just $169",
    date: "Thu, 19 Nov 2026 16:00:55 -0800",
    ip: "196.251.102.239",
    ingressReceived: "from jiuzhicui.com ([196.251.102.239]) by mx.google.com",
    messageId: "<ws-test-1@jiuzhicui.com>",
    fullHeaders: "From: Louis Vuitton <mjfcompany@jiuzhicui.com>",
    urls: ["https://v2.hocnfl.com/56revv2/fvew26fg.html"],
    registrarInfo: registrarInfo
  };
}
const wsEv = analyze.buildRegistrarShortEvidence(mkA({
  registrar: "Wanshang Technology",
  registrarAbuse: "abuse@kh86.cn",
  registered: "2025-12-28T19:16:31Z", registrant: null
}));
ok("wanshang evidence: built, fits the 2,000 cap",
  typeof wsEv === "string" && wsEv.length <= 2000,
  wsEv ? String(wsEv.length) : "null");
ok("wanshang evidence: the closing is the lane's own " +
   "(no screenshot on this form)",
  !!wsEv && wsEv.indexOf("trimmed") !== -1 &&
  wsEv.indexOf("screenshot attached") === -1,
  wsEv ? wsEv.slice(-160) : "null");
ok("wanshang evidence: names the domain and the registrar",
  !!wsEv && wsEv.indexOf("Domain: jiuzhicui.com") !== -1 &&
  wsEv.indexOf("Registrar: Wanshang Technology") !== -1);
const jyEv = analyze.buildRegistrarShortEvidence(mkA({
  registrar: "July Name Limited",
  registrarAbuse: "abuse@julyname.com",
  registered: "2025-12-28T19:16:31Z", registrant: null
}));
ok("julyname evidence: the screenshot closing stands",
  !!jyEv && jyEv.indexOf("screenshot attached to this report.") !== -1 &&
  jyEv.length <= 1000);

// ---------- (2) content wiring ----------
ok("content: the kit render branches on the lane's kit",
  contentSrc.indexOf('regFormLane.kit || "julyname"') !== -1 &&
  contentSrc.indexOf('regKit === "wanshang"') !== -1);
ok("content: the Wanshang button + heading name the form",
  contentSrc.indexOf('"Open the Wanshang abuse form"') !== -1 &&
  contentSrc.indexOf('"Form evidence \\u2014 paste into the Wanshang "') !== -1);
ok("content: v1.0.84 \u2014 the Wanshang steps carry " +
   "its ACTION facts (the complainant-step code and " +
   "the WSABUSE- number); the background facts (URL " +
   "rule lecture, 2,000 cap, Track Complaint) are cut",
  contentSrc.indexOf("6-digit code it emails you") !== -1 &&
  contentSrc.indexOf("valid for ") !== -1 &&
  contentSrc.indexOf("WSABUSE-") !== -1 &&
  contentSrc.indexOf("Track Complaint page") === -1);
ok("content: the July Name steps and button stand " +
   "(v1.0.83 slim shape \u2014 screenshot step, JY number)",
  contentSrc.indexOf('"Open the July Name abuse form"') !== -1 &&
  contentSrc.indexOf("Attach a screenshot that clearly shows") !== -1 &&
  contentSrc.indexOf("it starts with JY") !== -1);
// v1.0.82 narrows this pin: content.js now carries the
// nameabuse STASH plumbing (the pane payload the
// registrar button hands reportfill), so the word
// itself legitimately appears there — what must stay
// lib-only is the platform URL: the panel links
// whatever the lane entry says, never a hardcoded
// nameabuse address.
ok("lib: the nameabuse URL lives in the lib lane, not the panel",
  libSrc.indexOf("https://ws.nameabuse.net/") !== -1 &&
  contentSrc.indexOf("https://ws.nameabuse.net") === -1 &&
  contentSrc.indexOf("https://zy.nameabuse.net") === -1);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
