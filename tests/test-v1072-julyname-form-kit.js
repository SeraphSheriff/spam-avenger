"use strict";
// Public 1.0.72 release (internal build .73) — the July Name
// registrar form kit (queued-julyname-form-kit.md, approved
// Nov 8 2026). Field evidence: the Nov 8 2026 auto-reply
// from abuse@julyname.com, answering a registrar complaint
// this addon drafted (the dlybrh.com case), states the
// address "is no longer designated" for abuse complaints
// and all complaints go exclusively through
// https://www.juyu.com/jubao_sy.htm. Per Michael's Oct 28
// 2026 deflector rule, the Registrar section for that
// registrar becomes the yellow form-kit lane (evidence box
// + "Open the July Name abuse form" button), replacing the
// email complaint for that registrar only:
//
//  - lib registrarFormLane: RDAP registrar-name match, the
//    abuse contact's domain as the secondary signal.
//  - lib buildRegistrarFormEvidence: the registrar-truthful
//    evidence block in the form-kit skeleton.
//  - content.js: the registrar section renders the kit for
//    the lane (no email complaint, no Open in Gmail, no
//    copy-the-address button), the form open records the
//    lane's launched action; every other registrar keeps
//    the email lane untouched.
//
// The Nov 8 2026 REWORK (after Michael's live walk of the
// form submitted a real report, case JY202611090000004):
// the form's description field rejects anything over
// 1,000 characters, so the full evidence can never be
// pasted into it. The kit now shows and copies a SHORT
// evidence (lib buildRegistrarShortEvidence) built to the
// lane's per-host descriptionCap, framing-aware, with the
// payload link in real https form and a closing line
// sending the reader to the attached screenshot for the
// full headers. The kit note's guide is rewritten hoop by
// hoop for the user at the gate — and corrected where the
// first version was wrong: the screenshot is REQUIRED
// (it was wrongly called optional), the emailed code's
// "can't be empty" error may surface beside an unrelated
// field, and the confirmation's JY report number is the
// user's receipt to save.

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const contentSrc = fs.readFileSync(path.join(ROOT, "content.js"), "utf8");
const libSrc = fs.readFileSync(path.join(ROOT, "lib", "analyze.js"), "utf8");
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

// ---------- registrarFormLane (pure) ----------
const lane = analyze.registrarFormLane;

let l1 = lane({ registrarInfo: { registrar: "July Name Limited",
  registrarAbuse: "abuse@julyname.com" } });
ok("lane: the RDAP name 'July Name Limited' matches",
  !!l1 && l1.label === "July Name");
ok("lane: the form URL is the jubao platform",
  !!l1 && l1.url === "https://www.juyu.com/jubao_sy.htm",
  "got " + (l1 && l1.url));
ok("lane: the link text names the form host",
  !!l1 && l1.linkText === "www.juyu.com/jubao_sy.htm");
ok("lane: the description cap rides the lane as a per-host " +
   "parameter (July Name: 1000)",
  !!l1 && l1.descriptionCap === 1000,
  "got " + (l1 && l1.descriptionCap));

let l2 = lane({ registrarInfo: { registrar: null,
  registrarAbuse: "abuse@julyname.com" } });
ok("lane: the abuse-contact domain alone matches (secondary signal)",
  !!l2 && l2.url === "https://www.juyu.com/jubao_sy.htm");

let l3 = lane({ registrarInfo: { registrar: "NameCheap, Inc.",
  registrarAbuse: "abuse@namecheap.com" } });
ok("lane: another registrar does not match", l3 === null);
ok("lane: no registrar record, no lane",
  lane({}) === null && lane({ registrarInfo: null }) === null &&
  lane(null) === null);

// ---------- buildRegistrarFormEvidence (pure) ----------
const jyA = {
  senderDomain: "dlybrh.com",
  from: "Sophia <mjfibo@dlybrh.com>",
  subject: "Following up",
  date: "Wed, 4 Nov 2026 10:00:00 +0000",
  ip: "196.251.102.74",
  ingressReceived:
    "from mail.dlybrh.com ([196.251.102.74]) by mx.google.com",
  messageId: "<jn-test-1@dlybrh.com>",
  fullHeaders: "From: Sophia <mjfibo@dlybrh.com>\n" +
    "Subject: Following up",
  urls: [],
  registrarInfo: { registrar: "July Name Limited",
    registrarAbuse: "abuse@julyname.com",
    registered: "2026-01-22T04:27:56Z", registrant: null }
};
const ev = analyze.buildRegistrarFormEvidence(jyA);
ok("evidence: built for a July Name record", typeof ev === "string");
// Public 1.0.72 AGE FRAMING (Michael's 90-day line, Nov 8
// 2026): this fixture's domain was registered 2026-01-22
// and the message is dated 2026-11-04 — 286 days later,
// past the line — so the evidence now opens with the
// OLD-domain framing (long-established, compromise or
// spoofing, investigate-and-notify). Before the age gate
// it opened with the young text ("I am reporting a domain
// registered through you that exists to run fraud."). The
// young/old boundary itself is pinned in
// tests/test-v1072-age-framing.js.
ok("evidence: opens as a registrar report about the domain " +
   "(old-domain framing — the fixture domain is 286 days old)",
  ev.indexOf("I am reporting fraud sent using a domain " +
    "registered through you") !== -1 &&
  ev.indexOf("286 days later") !== -1 &&
  ev.indexOf("long-established") !== -1 &&
  ev.indexOf("notify the registrant") !== -1);
ok("evidence: names the domain and the registrar",
  ev.indexOf("Domain: dlybrh.com") !== -1 &&
    ev.indexOf("Registrar: July Name Limited") !== -1);
ok("evidence: carries the registration date",
  ev.indexOf("Registered: Thu, 22 Jan 2026 04:27:56 UTC") !== -1,
  "got " + (ev.match(/Registered: .*/) || [])[0]);
ok("evidence: carries sender, subject and sending IP",
  ev.indexOf("From: Sophia <mjfibo@dlybrh.com>") !== -1 &&
    ev.indexOf("Subject: Following up") !== -1 &&
    ev.indexOf("Sending IP: 196.251.102.74") !== -1);
ok("evidence: carries the full-headers block",
  ev.indexOf("Full headers (plain text, as received):") !== -1 &&
    ev.indexOf("From: Sophia <mjfibo@dlybrh.com>") !== -1);
ok("evidence: null without a registrar record",
  analyze.buildRegistrarFormEvidence({ senderDomain: "x.example" })
    === null);

// ---------- content.js wiring (static) ----------
ok("panel: the July Name section title is the form-kit title",
  contentSrc.indexOf(
    '"Registrar report \\u2014 use their form"') !== -1);
ok("panel: the email-lane title still stands for other registrars",
  contentSrc.indexOf(
    '"Registrar report \\u2014 the domain itself"') !== -1);
ok("panel: the registrar lane consults registrarFormLane",
  contentSrc.indexOf("window.SpamAvenger.registrarFormLane") !== -1);
ok("panel: the evidence box carries the registrar evidence id",
  contentSrc.indexOf('"sf-registrar-evidence"') !== -1);
ok("panel: the button label is exact",
  contentSrc.indexOf('"Open the July Name abuse form"') !== -1);
ok("panel: the email blocks are gated off under the form lane",
  contentSrc.indexOf(
    "if (!regFormLane && ri.registrarAbuse)") !== -1 &&
  contentSrc.indexOf(
    "if (!regFormLane && a.registrarComplaint)") !== -1);
const btnAt = contentSrc.indexOf('"sf-open-registrar-form"');
const btnTail = btnAt === -1 ? "" : contentSrc.slice(btnAt, btnAt + 2600);
ok("panel: the form button records the registrar lane launched",
  btnTail.indexOf('recordLaunched("registrar")') !== -1 &&
    btnTail.indexOf('applyLaunchedBadge("registrar"') !== -1);
ok("panel: the form button opens the lane's form URL",
  btnTail.indexOf("window.open(regFormLane.url") !== -1);
ok("lib: the jubao URL lives in the lib lane, not the panel",
  libSrc.indexOf("https://www.juyu.com/jubao_sy.htm") !== -1 &&
    contentSrc.indexOf("jubao") === -1);
ok("panel: the Gmail compose button still exists for email lanes",
  contentSrc.indexOf('"sf-registrar-compose"') !== -1);

// ---------- the field guide in the kit note ----------
// Public 1.0.72 release (internal build .73): Michael walked
// the real juyu.com form on Nov 8 2026 and a real report
// went through (case JY202611090000004). The guide is
// written TO the user who will face the form, hoop by
// hoop, in the order they are hit. It corrects the first
// guide where the field proved it wrong — above all the
// screenshot, which is REQUIRED, not optional. The guide
// is panel text only — it must never reach the copied
// evidence.
ok("guide: the kit note carries the field guide",
  contentSrc.indexOf('"Walking their form:"') !== -1);
ok("guide: the translate heads-up is there (Chinese form, " +
   "Firefox's address-bar translate icon, right-click path)",
  contentSrc.indexOf("the form is in Chinese") !== -1 &&
    contentSrc.indexOf("translate") !== -1 &&
    contentSrc.indexOf("the icon at the right") !== -1 &&
    contentSrc.indexOf("end of the address bar") !== -1 &&
    contentSrc.indexOf("right-click the") !== -1 &&
    contentSrc.indexOf("Translate Page") !== -1);
ok("guide: the identity choice is named — pick Personal",
  contentSrc.indexOf("who you are, choose") !== -1 &&
    contentSrc.indexOf("Personal.") !== -1);
ok("guide: the 6-digit email code round trip is named " +
   "(Send code), and owned by the registrar, not the addon",
  contentSrc.indexOf("Send code") !== -1 &&
    contentSrc.indexOf("6-digit code") !== -1 &&
    contentSrc.indexOf("registrar's gate, not Spam " +
      "Avenger's") !== -1);
ok("guide: the empty-code scolding is decoded — \u201CIt can't " +
   "be empty\u201D means the code, wherever it pops up",
  contentSrc.indexOf("\\u201CIt can't be empty\\u201D") !== -1 &&
    contentSrc.indexOf("unrelated field") !== -1 &&
    contentSrc.indexOf("means the code") !== -1);
ok("guide: the first report-type box is fraud / phishing email",
  contentSrc.indexOf("check the first box") !== -1 &&
    contentSrc.indexOf("fraud / phishing email") !== -1);
ok("guide: the second box (fraudulent phishing / counterfeit " +
   "websites) is offered for the fake-store case",
  contentSrc.indexOf("check the second box") !== -1 &&
    contentSrc.indexOf("(fraudulent phishing / counterfeit " +
      "websites)") !== -1);
ok("guide: the domain field takes the domain alone, and the " +
   "link field the link as a normal https address, copied " +
   "from the copied text",
  contentSrc.indexOf("The domain field takes the reported " +
    "domain") !== -1 &&
    contentSrc.indexOf("link field") !== -1 &&
    contentSrc.indexOf("normal https address") !== -1 &&
    contentSrc.indexOf("copies already carries the link") !== -1);
ok("guide: the legal-website field means the impersonated " +
   "brand's real website, www.-shaped, and is required",
  contentSrc.indexOf("\\u201Clegal website\\u201D field wants") !== -1 &&
    contentSrc.indexOf("the real website of the brand the " +
      "spam is") !== -1 &&
    contentSrc.indexOf("impersonating") !== -1 &&
    contentSrc.indexOf("www.brand.com") !== -1 &&
    contentSrc.indexOf("a required field") !== -1);
ok("guide: the description field's hard cap is named, with " +
   "the reason the copied text is short",
  contentSrc.indexOf("The description field has a hard cap") !== -1 &&
    contentSrc.indexOf("1,000 characters") !== -1 &&
    contentSrc.indexOf("the button copies is short") !== -1 &&
    contentSrc.indexOf("exactly as copied") !== -1);
ok("guide: the screenshot is REQUIRED (red asterisk), must " +
   "show the domain and the date/time",
  contentSrc.indexOf("A screenshot is required") !== -1 &&
    contentSrc.indexOf("red asterisk") !== -1 &&
    contentSrc.indexOf("reported domain name and the date") !== -1 &&
    contentSrc.indexOf("screenshot upload is optional") === -1);
ok("guide: the Show-original tip is there (three-dot menu, " +
   "summary table, PDF alternative, accepted formats)",
  contentSrc.indexOf("three-dot menu") !== -1 &&
    contentSrc.indexOf("Show original") !== -1 &&
    contentSrc.indexOf("summary table at the top") !== -1 &&
    contentSrc.indexOf("PDF works too") !== -1 &&
    contentSrc.indexOf("up to 8M") !== -1);
ok("guide: the anti-bot shield warning — a blank page or a " +
   "stuck upload means retry, not your mistake",
  contentSrc.indexOf("anti-bot armor") !== -1 &&
    contentSrc.indexOf("loads blank") !== -1 &&
    contentSrc.indexOf("not your mistake") !== -1 &&
    contentSrc.indexOf("reload and try again") !== -1);
ok("guide: errors arrive one at a time — fix the named " +
   "field and submit again",
  contentSrc.indexOf("one at a time") !== -1 &&
    contentSrc.indexOf("fix the field it names") !== -1);
ok("guide: on success, save the JY report number to check " +
   "progress",
  contentSrc.indexOf("report number it shows") !== -1 &&
    contentSrc.indexOf("it starts with JY") !== -1 &&
    contentSrc.indexOf("check the report's progress") !== -1);
ok("guide: panel-only — no guide text in the lib, and none " +
   "in the copied evidence",
  libSrc.indexOf("Walking their form") === -1 &&
    libSrc.indexOf("6-digit code") === -1 &&
    ev.indexOf("6-digit") === -1 &&
    ev.indexOf("address bar") === -1 &&
    ev.indexOf("screenshot upload") === -1);

// ---------- buildRegistrarShortEvidence (pure) ----------
// The kit's copied text after the rework: built to the
// lane's descriptionCap, framing-aware, the payload link
// in real https form, the full headers handed off to the
// required screenshot. The hzxhqz fixture is tonight's
// real specimen driven through analyze(); its Date header
// is garbage on purpose — Node's parser ACCEPTS the real
// malformed header ("Sun, 4 November 2026 6:33:4 0700")
// where Firefox rejects it, so garbage is what forces the
// Received-chain path deterministically (the date-fallback
// suite tells the whole story). The Received stamp is the
// arrival: registration 2025-03-25 to arrival 2026-11-08
// is 593 days — the interval in tonight's accepted
// submission.
const HZ_RAW = [
  "Received: from [196.251.121.165] (port=40410 helo=hzxhqz.com) by ben.ace-host.net with esmtps (TLS1.2) tls TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 (Exim 4.100.1) (envelope-from <mjfgeiha@hzxhqz.com>) id 1xQ70o-0000000H3JR-24je for mjf@colorami.com; Sun, 08 Nov 2026 12:49:02 -0500",
  "Authentication-Results: mx.google.com; spf=pass (google.com: domain of mjfgeiha@hzxhqz.com designates 196.251.121.165 as permitted sender) smtp.mailfrom=mjfgeiha@hzxhqz.com",
  "From: Louis Vuitton <mjfgeiha@hzxhqz.com>",
  "To: mjf <mjf@colorami.com>",
  "Subject: [Black Friday] Louis Vuitton Handbags Starting at $169 - Shop the Luxury Collection",
  "Date: whenever lol not a date",
  "Message-ID: <fpgx3bmq49sjuphos.pfipcidu@j41xhlaqf6p0pr0.lo3>",
  "MIME-Version: 1.0",
  "Content-Type: text/plain; charset=\"windows-1255\""
].join("\n") + "\n\nParisian elegance, uncompromised quality. " +
  "Shop the collection: https://v3.rdhlmn.com/21df6ge/veh.html\n";
const hzA = analyze.analyze(HZ_RAW);
hzA.registrarInfo = { registrar: "July Name Limited",
  registrarAbuse: "abuse@julyname.com",
  registered: "2025-03-25T06:30:39Z", registrant: null };
const sev = analyze.buildRegistrarShortEvidence(hzA);
ok("short: built for the hzxhqz specimen",
  typeof sev === "string");
ok("short: fits the lane's 1,000-character cap",
  typeof sev === "string" && sev.length <= 1000,
  "got " + (sev && sev.length));
ok("short: old-domain framing (593 days, long-established, " +
   "investigate-and-notify — the accepted submission's shape)",
  sev.indexOf("I am reporting fraud sent using a domain " +
    "registered through you") !== -1 &&
  sev.indexOf("593 days later") !== -1 &&
  sev.indexOf("long-established") !== -1 &&
  sev.indexOf("notify the registrant") !== -1 &&
  sev.indexOf("exists to run fraud") === -1);
ok("short: the labeled facts ride in priority order",
  sev.indexOf("Domain: hzxhqz.com") !== -1 &&
  sev.indexOf("Registrar: July Name Limited") !== -1 &&
  sev.indexOf("Registered: Tue, 25 Mar 2025 06:30:39 UTC") !== -1 &&
  sev.indexOf("From: Louis Vuitton <mjfgeiha@hzxhqz.com>") !== -1 &&
  sev.indexOf("Subject: [Black Friday] Louis Vuitton " +
    "Handbags Starting at $169") !== -1 &&
  sev.indexOf("Domain: hzxhqz.com") <
    sev.indexOf("From: Louis Vuitton") &&
  sev.indexOf("From: Louis Vuitton") <
    sev.indexOf("Link: https://"));
ok("short: the sending IP carries its SPF verdict",
  sev.indexOf("Sending IP: 196.251.121.165 (SPF pass)") !== -1);
ok("short: the payload link is in REAL https form, never " +
   "defanged — it goes to an abuse desk",
  sev.indexOf("Link: https://v3.rdhlmn.com/21df6ge/veh.html") !== -1 &&
  sev.indexOf("hxxps") === -1 && sev.indexOf("[.]") === -1);
ok("short: the closing hands the full headers to the " +
   "attached screenshot, and no headers ride in the text",
  sev.indexOf("The full message headers are in the " +
    "screenshot attached to this report.") !== -1 &&
  sev.indexOf("Full headers") === -1 &&
  sev.indexOf("Authentication-Results") === -1);
ok("short: no panel guide text leaks into the copied text",
  sev.indexOf("6-digit") === -1 &&
  sev.indexOf("address bar") === -1 &&
  sev.indexOf("Walking their form") === -1);

// A young July Name domain keeps the young framing and the
// suspension ask, in short form too.
const youngA = {
  senderDomain: "freshbags-example.com",
  from: "Deals <promo@freshbags-example.com>",
  subject: "Designer bags, today only",
  date: "Wed, 4 Nov 2026 10:00:00 +0000",
  ip: "203.0.113.20",
  authResults: { spf: "none", dkim: null, dmarc: null },
  urls: ["https://freshbags-example.com/shop"],
  registrarInfo: { registrar: "July Name Limited",
    registrarAbuse: "abuse@julyname.com",
    registered: "2026-10-26T00:00:00Z", registrant: null }
};
const sevY = analyze.buildRegistrarShortEvidence(youngA);
ok("short: a young domain keeps the young framing and the " +
   "suspension ask, under the cap",
  typeof sevY === "string" && sevY.length <= 1000 &&
  sevY.indexOf("exists to run fraud") !== -1 &&
  sevY.indexOf("suspend the domain") !== -1 &&
  sevY.indexOf("long-established") === -1);

// The cap is guaranteed by construction: adversarial
// lengths shed the subject first, then the link display,
// and the skeleton (domain, closing) survives.
function advA(subj, link, registered) {
  return {
    senderDomain: "spam-example.com",
    from: "Deals <promo@spam-example.com>",
    subject: subj, date: "Wed, 4 Nov 2026 10:00:00 +0000",
    ip: "203.0.113.9",
    authResults: { spf: "fail", dkim: null, dmarc: null },
    urls: link ? [link] : [],
    registrarInfo: { registrar: "July Name Limited",
      registrarAbuse: "abuse@julyname.com",
      registered: registered, registrant: null }
  };
}
const LONG_SUBJ = "SALE ".repeat(600);
const LONG_LINK = "https://cdn.spam-example.com/" +
  "x".repeat(2500) + "/click.html";
const sevAdvY = analyze.buildRegistrarShortEvidence(
  advA(LONG_SUBJ, LONG_LINK, "2026-10-26T00:00:00Z"));
const sevAdvO = analyze.buildRegistrarShortEvidence(
  advA(LONG_SUBJ, LONG_LINK, "2020-01-01T00:00:00Z"));
ok("short: adversarial subject + link, young framing — " +
   "still within the cap",
  typeof sevAdvY === "string" && sevAdvY.length <= 1000,
  "got " + (sevAdvY && sevAdvY.length));
ok("short: adversarial subject + link, old framing — still " +
   "within the cap, domain and closing intact",
  typeof sevAdvO === "string" && sevAdvO.length <= 1000 &&
  sevAdvO.indexOf("Domain: spam-example.com") !== -1 &&
  sevAdvO.indexOf("screenshot attached to this report.") !== -1,
  "got " + (sevAdvO && sevAdvO.length));
const sevSubj = analyze.buildRegistrarShortEvidence(
  advA(LONG_SUBJ, "https://shop.example.com/x",
    "2026-10-26T00:00:00Z"));
ok("short: the subject sheds first — ellipsized to fit, the " +
   "short link survives whole",
  typeof sevSubj === "string" && sevSubj.length <= 1000 &&
  sevSubj.indexOf("\u2026") !== -1 &&
  sevSubj.indexOf("Link: https://shop.example.com/x") !== -1);
const sevLink = analyze.buildRegistrarShortEvidence(
  advA("Hi", LONG_LINK, "2026-10-26T00:00:00Z"));
ok("short: an over-long link display is trimmed to fit",
  typeof sevLink === "string" && sevLink.length <= 1000 &&
  sevLink.indexOf("Link: https://cdn.spam-example.com/") !== -1);
ok("short: the cap is a parameter — a smaller cap is honored",
  analyze.buildRegistrarShortEvidence(youngA, { cap: 300 })
    .length <= 300);
ok("short: null without a registrar record, and null for a " +
   "registrar with no form lane",
  analyze.buildRegistrarShortEvidence(
    { senderDomain: "x.example" }) === null &&
  analyze.buildRegistrarShortEvidence({
    senderDomain: "x.example",
    registrarInfo: { registrar: "NameCheap, Inc.",
      registrarAbuse: "abuse@namecheap.com",
      registered: null } }) === null);
const sevBare = analyze.buildRegistrarShortEvidence(
  advA("Plain", null, null));
ok("short: no link and no registration date still builds a " +
   "complete, under-cap text",
  typeof sevBare === "string" && sevBare.length <= 1000 &&
  sevBare.indexOf("Link:") === -1 &&
  sevBare.indexOf("Registered:") === -1 &&
  sevBare.indexOf("screenshot attached") !== -1);

// ---------- panel wiring: displayed text IS the copied text ----------
ok("panel: the evidence box is filled by the SHORT builder",
  contentSrc.indexOf(".buildRegistrarShortEvidence(a)") !== -1 &&
    contentSrc.indexOf(".buildRegistrarFormEvidence(a)") === -1);
ok("panel: the button copies the very textarea the box shows",
  btnTail.indexOf("rEta.select()") !== -1 &&
    btnTail.indexOf("rEta.value") !== -1);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
