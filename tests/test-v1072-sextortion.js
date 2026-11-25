"use strict";
// Public 1.0.72 release (internal build .73) — sextortion
// handling (queued-sextortion-handling.md, Michael's call
// Nov 8 2026, after he walked the FTC wizard on a real
// sextortion message by hand and found the guide pushing
// "An impersonator", the narrative opening with the
// phishing line, and nothing telling a frightened recipient
// it is a mass-mailed ransom bluff):
//
//  - lib detectSextortion: a crypto wallet PLUS at least
//    one demand marker, or at least THREE distinct
//    extortion markers. One marker never flags.
//  - analyze() carries a.sextortion = { flagged, wallet }.
//  - classifyBucket NEVER promotes a flagged message to
//    "fraud" (Michael's hard ruling — the APWG + CISA
//    forward stays hidden for sextortion).
//  - content.js: the panel callout as an UP-FRONT sf-warn
//    banner on the panel body (placement corrected Nov 8
//    2026 — it began inside the details block, but Michael
//    ruled a frightened user never expands the toggle),
//    and the stash gains sextortion + wallet for reportfill.
//  - reportfill: the FTC narrative opens with the
//    sextortion line and names the wallet, and closes
//    with the spoof sentence when the EVIDENCE proves
//    the From forged (another domain's server sent it,
//    DKIM never passed aligned — the lib's
//    fromAddressSpoofed, stashed as fromSpoofed); the category
//    guide points at "Something else" (the FTC tile's
//    actual label — there is no "Other" tile) and the
//    impersonator tile is never auto-picked; the filled
//    banner claims no
//    phishing link on a 0-URL stash. Non-sextortion
//    narrative output stays byte-identical.

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const contentSrc = fs.readFileSync(path.join(ROOT, "content.js"), "utf8");
const reportfillSrc = fs.readFileSync(path.join(ROOT, "reportfill.js"), "utf8");
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

// ---------- detectSextortion (pure) ----------
const det = analyze.detectSextortion;

let d1 = det("I secretly embedded malware into an adult site " +
  "and recorded you. I can activate your camera and microphone " +
  "at any moment. These embarrassing videos are saved.");
ok("detector: the Nov 8 specimen's phrases flag with no wallet",
  d1.flagged === true && d1.wallet === null);

let d2 = det("Your device is infected. Pay in bitcoin to " +
  "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh and it goes away.");
ok("detector: wallet + one demand marker flags",
  d2.flagged === true &&
    d2.wallet === "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh");

let d3 = det("Send the payment within 48 hours to " +
  "0x742d35Cc6634C0532925a3b844Bc454e4438f44e to keep this quiet.");
ok("detector: ETH wallet + deadline marker flags",
  d3.flagged === true &&
    d3.wallet === "0x742d35Cc6634C0532925a3b844Bc454e4438f44e");

let d4 = det("Donate to our open-source project: " +
  "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh — thanks!");
ok("detector: a wallet alone (no marker) does not flag",
  d4.flagged === false);

let d5 = det("Verify your account — it has been suspended. " +
  "Sign in here: https://evil.example/login");
ok("detector: a normal phish does not flag", d5.flagged === false);

let d6 = det("This week in tech: the best webcam for streaming, " +
  "reviewed and ranked.");
ok("detector: a legit newsletter mentioning 'webcam' once " +
  "does not flag", d6.flagged === false);

let d7 = det("I recorded you at your desk. Nice webcam, by the way.");
ok("detector: two distinct markers (below three, no wallet) " +
  "do not flag", d7.flagged === false);

// ---------- analyze() on the Nov 8 specimen shape ----------
const RAW_SEX = [
  "From: <mjf@colorami.com>",
  "To: mjf@colorami.com",
  "Subject: Delivery Status Notification.",
  "Date: Sat, 8 Nov 2026 04:47:00 -0800",
  "Message-ID: <sex-test-1@colorami.com>",
  "Authentication-Results: mx.google.com; spf=neutral " +
    "smtp.mailfrom=colorami.com; dkim=none header.d=colorami.com; " +
    "dmarc=none header.from=colorami.com",
  "Received: from mail.capitalcolours.co.ke ([41.220.121.102]) " +
    "by mx.google.com with ESMTPS; Sat, 8 Nov 2026 04:47:00 -0800",
  "Content-Type: text/plain; charset=UTF-8",
  "",
  "Hello, I have been monitoring your internet activities for " +
  "some time. I secretly embedded malware into an adult site, " +
  "and while you visited it I recorded you. I can activate " +
  "your camera and microphone at any moment. I have saved " +
  "these recordings, clips of your embarrassing videos. " +
  "Nobody has to see them. Send the payment and everything " +
  "gets deleted."
].join("\r\n");

const aSex = analyze.analyze(RAW_SEX);
ok("analyze: the specimen is flagged sextortion",
  !!aSex.sextortion && aSex.sextortion.flagged === true);
ok("analyze: the specimen carries no wallet",
  !!aSex.sextortion && aSex.sextortion.wallet === null);
ok("analyze: sender domain and sending server parsed",
  aSex.senderDomain === "colorami.com" &&
    aSex.sendingServer === "mail.capitalcolours.co.ke",
  "got " + aSex.senderDomain + " / " + aSex.sendingServer);

// Michael's hard ruling: sextortion is NOT promoted to the
// fraud bucket, so the APWG + CISA forward stays hidden.
ok("classify: the flagged specimen is NOT fraud bucket",
  analyze.classifyBucket(aSex, {}) !== "fraud",
  "got " + analyze.classifyBucket(aSex, {}));
ok("classify: classifyBucket never reads the sextortion flag",
  analyze.classifyBucket.toString().indexOf("sextortion") === -1);

// ---------- reportfill detailsText ----------
const rfStart = reportfillSrc.indexOf("function detailsText");
const rfEnd = reportfillSrc.indexOf("// Set a field's value");
let seg = reportfillSrc.slice(rfStart, rfEnd);
seg = seg.slice(0, seg.lastIndexOf("}") + 1);
const detailsText = eval("(" + seg + ")");

const sexStash = {
  sextortion: true,
  wallet: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
  urls: [], from: "<mjf@colorami.com>",
  subject: "Delivery Status Notification.",
  ip: "41.220.121.102", server: "mail.capitalcolours.co.ke"
};
const sexText = detailsText(sexStash, 3000);
ok("narrative: sextortion stash opens with the sextortion line",
  sexText.split("\n")[0] ===
    "I received a sextortion (extortion) email demanding payment.",
  "got " + sexText.split("\n")[0]);
ok("narrative: the wallet line names the demanded wallet",
  sexText.split("\n")[1] ===
    "Payment was demanded to this crypto wallet: " +
    "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh");
ok("narrative: no phishing line anywhere in the sextortion text",
  sexText.indexOf("phishing/spam email") === -1);

const sexNoWallet = detailsText({
  sextortion: true, wallet: null, urls: [],
  from: "<mjf@colorami.com>", subject: "Delivery Status Notification.",
  ip: "41.220.121.102", server: ""
}, 3000);
ok("narrative: sextortion without a wallet has no wallet line",
  sexNoWallet.indexOf("crypto wallet") === -1 &&
    sexNoWallet.split("\n")[0] ===
      "I received a sextortion (extortion) email demanding payment.");

const sexWithUrl = detailsText({
  sextortion: true, wallet: null,
  urls: ["https://x.example/pay"], from: "A <a@b.example>",
  subject: "S", ip: "1.2.3.4", server: ""
}, 3000);
ok("narrative: URL line rules unchanged under the sextortion opening",
  sexWithUrl.indexOf("Phishing URL: https://x.example/pay") !== -1);

// Non-sextortion output is byte-identical to before the change.
const plainUrl = detailsText({
  urls: ["https://phish.example/login"],
  from: "Promo <promo@deals.example>", subject: "Hi there",
  ip: "203.0.113.9", server: "mail.deals.example"
}, 3000);
ok("narrative: plain stash with a URL is byte-identical",
  plainUrl ===
    "I received a phishing/spam email containing a link to a " +
    "phishing page.\n" +
    "Phishing URL: https://phish.example/login\n" +
    "Claimed sender: Promo <promo@deals.example>\n" +
    "Subject: Hi there\n" +
    "Sending IP: 203.0.113.9 (server: mail.deals.example)",
  "got " + JSON.stringify(plainUrl));

const plainNoUrl = detailsText({
  urls: [], from: "Promo <promo@deals.example>",
  subject: "Hi there", ip: "203.0.113.9", server: ""
}, 3000);
ok("narrative: plain 0-URL stash is byte-identical",
  plainNoUrl ===
    "I received a phishing/spam email.\n" +
    "Claimed sender: Promo <promo@deals.example>\n" +
    "Subject: Hi there\n" +
    "Sending IP: 203.0.113.9",
  "got " + JSON.stringify(plainNoUrl));

// ---------- reportfill guide + filled-lead (static) ----------
ok("guide: the 'Something else' category line exists for sextortion",
  reportfillSrc.indexOf("Pick 'Something else' \\u2014 this one isn't") !== -1 &&
    reportfillSrc.indexOf("impersonating anybody.") !== -1);
ok("guide: the category step picks the line by the stash flag",
  reportfillSrc.indexOf(
    "setGuide(stash.sextortion ? G_CAT_OTHER : G_CAT)") !== -1);
ok("guide: the impersonator auto-pick never runs for sextortion",
  // (Was the v1.0.37 one-shot gate, "if (!categoryTried &&
  // !stash.sextortion &&"; the auto-pick is the verified
  // state machine now — see test-v1072-ftc-autopick.js —
  // and the sextortion exclusion is its outer guard. Since
  // the Nov 8 2026 extension, the else branch runs the
  // SAME machine at the "Something else" tile instead —
  // see test-v1072-ftc-elsepick.js.)
  reportfillSrc.indexOf("if (!stash.sextortion) {") !== -1 &&
    reportfillSrc.indexOf(
      "catPick.step(catView, Date.now())") !== -1 &&
    reportfillSrc.indexOf(
      "elsePick.step(elseView, Date.now())") !== -1);
ok("filled lead: computed from the stash's URL count",
  reportfillSrc.indexOf(
    "var FILLED_LEAD = (stash.urls && stash.urls.length)") !== -1);
ok("filled lead: the 0-URL variant claims no phishing link",
  reportfillSrc.indexOf(
    "for you \\u2014 the sender details from the email.") !== -1);

// ---------- content.js: callout + stash fields (static) ----------
ok("panel: the sextortion callout renders with its exact wording",
  contentSrc.indexOf("This looks like sextortion: a ransom bluff " +
    "sent to") !== -1 &&
  contentSrc.indexOf("has no video and no access to your device.") !== -1 &&
  contentSrc.indexOf("Don't pay.") !== -1);
ok("panel: the callout is gated on the analysis flag",
  contentSrc.indexOf(
    "if (a.sextortion && a.sextortion.flagged)") !== -1);
// Placement (Michael's correction, Nov 8 2026): the callout's
// one home is the top of the panel body — appended to body
// itself as a standing sf-warn banner, above the legend and
// the lane stack, and NOT inside the details block (a
// frightened user never expands Show details).
const sexGateAt = contentSrc.indexOf(
  "if (a.sextortion && a.sextortion.flagged)");
const sexGateSeg = sexGateAt === -1 ? "" :
  contentSrc.slice(sexGateAt, sexGateAt + 600);
ok("panel: the callout is appended to the panel body, not details",
  sexGateSeg.indexOf("body.appendChild") !== -1 &&
  sexGateSeg.indexOf("details.appendChild") === -1);
ok("panel: the callout renders as an sf-warn banner",
  sexGateSeg.indexOf('"class": "sf-warn"') !== -1);
ok("panel: the callout has one home only (single construction site)",
  contentSrc.split("This looks like sextortion").length - 1 === 1);
ok("panel: the callout is built before the legend and lane stack",
  sexGateAt !== -1 &&
  sexGateAt < contentSrc.indexOf(
    'var stack = h("div", { "class": "sf-stack"') &&
  sexGateAt < contentSrc.indexOf(
    "body.insertBefore(legend, stack)"));
ok("stash: the pendingReport gains sextortion + wallet",
  contentSrc.indexOf(
    "sextortion: !!(a.sextortion && a.sextortion.flagged)") !== -1 &&
  contentSrc.indexOf(
    "wallet: (a.sextortion && a.sextortion.wallet) || null") !== -1);

// ---------- the narrative's closing spoof sentence ----------
// Gated on EVIDENCE, not the sextortion flag alone: the
// stash's fromSpoofed is set (in content.js, from the lib's
// fromAddressSpoofed) only when another domain's server
// sent the message AND DKIM never passed aligned for the
// From domain. Michael approved the sentence Nov 8 2026.
const SPOOF_LINE = "The From address appears spoofed; the " +
  "sending IP is not associated with the claimed sender's " +
  "domain.";

const sexSpoofText = detailsText({
  sextortion: true,
  wallet: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
  fromSpoofed: true,
  urls: [], from: "<mjf@colorami.com>",
  subject: "Delivery Status Notification.",
  ip: "41.220.121.102", server: "mail.capitalcolours.co.ke"
}, 3000);
ok("narrative: proven-spoof sextortion closes with the spoof line",
  sexSpoofText ===
    "I received a sextortion (extortion) email demanding " +
      "payment.\n" +
    "Payment was demanded to this crypto wallet: " +
      "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh\n" +
    "Claimed sender: <mjf@colorami.com>\n" +
    "Subject: Delivery Status Notification.\n" +
    "Sending IP: 41.220.121.102 " +
      "(server: mail.capitalcolours.co.ke)\n" +
    SPOOF_LINE,
  "got " + JSON.stringify(sexSpoofText));
ok("narrative: the spoof line is the FINAL line",
  sexSpoofText.split("\n").pop() === SPOOF_LINE);

const sexNoSpoofText = detailsText(sexStash, 3000);
ok("narrative: sextortion without the spoof evidence gets no line",
  sexNoSpoofText.indexOf("appears spoofed") === -1 &&
    sexNoSpoofText.split("\n").pop() ===
      "Sending IP: 41.220.121.102 " +
      "(server: mail.capitalcolours.co.ke)");

const plainSpoofFlag = detailsText({
  fromSpoofed: true,
  urls: ["https://phish.example/login"],
  from: "Promo <promo@deals.example>", subject: "Hi there",
  ip: "203.0.113.9", server: "mail.deals.example"
}, 3000);
ok("narrative: a NON-sextortion stash never gets the line",
  plainSpoofFlag === plainUrl &&
    plainSpoofFlag.indexOf("appears spoofed") === -1);

// The lib predicate on the field case (the Nov 8 specimen,
// already analyzed above as aSex): unrelated Kenyan server,
// DKIM missing.
ok("spoof evidence: the specimen has no aligned DKIM pass",
  aSex.dkimAligned === false);
ok("spoof evidence: the specimen's From is proven spoofed",
  analyze.fromAddressSpoofed(aSex) === true);

// The control: a sextortion-flagged message genuinely sent
// by the From domain's own server, DKIM passing aligned —
// the sentence must NOT be earned.
const RAW_CONTROL = [
  "From: <mjf@colorami.com>",
  "To: mjf@colorami.com",
  "Subject: Delivery Status Notification.",
  "Date: Sat, 8 Nov 2026 05:02:00 -0800",
  "Message-ID: <sex-test-2@colorami.com>",
  "Authentication-Results: mx.google.com; " +
    "dkim=pass header.d=colorami.com header.s=sel1; " +
    "spf=pass smtp.mailfrom=colorami.com; " +
    "dmarc=pass header.from=colorami.com",
  "Received: from mail.colorami.com ([68.171.219.131]) " +
    "by mx.google.com with ESMTPS; Sat, 8 Nov 2026 05:02:00 -0800",
  "Content-Type: text/plain; charset=UTF-8",
  "",
  "Hello, I have been monitoring your internet activities for " +
  "some time. I secretly embedded malware into an adult site, " +
  "and while you visited it I recorded you. I can activate " +
  "your camera and microphone at any moment. I have saved " +
  "these recordings, clips of your embarrassing videos. " +
  "Nobody has to see them. Send the payment and everything " +
  "gets deleted."
].join("\r\n");
const aCtl = analyze.analyze(RAW_CONTROL);
ok("spoof evidence: the control is still flagged sextortion",
  !!aCtl.sextortion && aCtl.sextortion.flagged === true);
ok("spoof evidence: the control's DKIM passed aligned",
  aCtl.dkimAligned === true);
ok("spoof evidence: the control's From is NOT proven spoofed",
  analyze.fromAddressSpoofed(aCtl) === false);

// The predicate's legs, pinned one at a time.
ok("spoof evidence: aligned DKIM from an ESP server is not spoofed",
  analyze.fromAddressSpoofed({
    senderDomain: "colorami.com",
    sendingServer: "mail.esp.example", host: "",
    dkimAligned: true
  }) === false);
ok("spoof evidence: foreign server + no aligned DKIM is spoofed",
  analyze.fromAddressSpoofed({
    senderDomain: "colorami.com",
    sendingServer: "mail.capitalcolours.co.ke", host: "",
    dkimAligned: false
  }) === true);
ok("spoof evidence: the domain's own server is never spoofed",
  analyze.fromAddressSpoofed({
    senderDomain: "colorami.com",
    sendingServer: "mail.colorami.com", host: "",
    dkimAligned: false
  }) === false);
ok("spoof evidence: no server on record proves nothing",
  analyze.fromAddressSpoofed({
    senderDomain: "colorami.com",
    sendingServer: "", host: "", dkimAligned: false
  }) === false);
ok("spoof evidence: a DKIM pass for ANOTHER domain is not aligned",
  analyze.dkimAlignedPass([{
    name: "authentication-results",
    value: "mx.google.com; dkim=pass header.d=esp.example; " +
      "spf=pass smtp.mailfrom=colorami.com"
  }], "colorami.com") === false &&
  analyze.dkimAlignedPass([{
    name: "authentication-results",
    value: "mx.google.com; dkim=pass header.d=colorami.com"
  }], "colorami.com") === true);

// The stash field itself (static): computed from the lib
// predicate at the same choke point as sextortion/wallet.
ok("stash: the pendingReport gains fromSpoofed from the lib verdict",
  contentSrc.indexOf(
    "fromSpoofed: !!(window.SpamAvenger &&") !== -1 &&
  contentSrc.indexOf(
    "window.SpamAvenger.fromAddressSpoofed(a))") !== -1);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
