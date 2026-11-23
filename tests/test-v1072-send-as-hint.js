"use strict";
// Public 1.0.72 release (internal build .73) — the send-as
// hint (queued-send-as-hint.md, Michael's call Nov 8 2026,
// widened by him in the asking: the hint fires whenever
// the address the spam was sent to differs from the
// signed-in account's address — multiple Gmail identities
// included, not custom domains only):
//
//  - lib analyze() carries a.recipient: the To header's
//    first address, Delivered-To as the fallback.
//  - lib sendAsHintFor(recipient, accountEmail) is the
//    pure trigger, fed the account address content.js read
//    off the page: differ -> fire (either domain); equal
//    -> silent; account unreadable -> the custom-domain
//    fallback (non-Gmail recipient fires, @gmail.com /
//    @googlemail.com stays silent rather than guessing).
//  - lib sendAsHintText names the recipient from the
//    headers, never a hardcoded address.
//  - content.js reads the account address ONLY from the
//    header account control's "Google Account" aria-label,
//    computes the hint once per render, and drops the line
//    into every lane that opens a Gmail compose: mail
//    host, website host, link host, registrar (email lane
//    only — the July Name form kit opens a form), and PID
//    (where the hint names it a letter). Forward, FTC and
//    Safe Browsing get none, and the addon never touches
//    the compose's From itself — the hint is a reminder.

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
function count(hay, needle) {
  return hay.split(needle).length - 1;
}

ok("manifest version stays 1.0.73", manifest.version === "1.0.74",
  "got " + manifest.version);

// ---------- recipientOf / analyze().recipient ----------
function rawMsg(extraHeaders) {
  return "From: Cheap Meds <deals@spammy.example>\r\n" +
    "Subject: You won\r\n" +
    "Date: Sat, 8 Nov 2026 10:00:00 -0700\r\n" +
    "Message-ID: <abc@spammy.example>\r\n" +
    extraHeaders +
    "\r\nBuy now.\r\n";
}

let a1 = analyze.analyze(rawMsg(
  "To: Michael Fiorella <mjf@colorami.com>\r\n"));
ok("recipient: To header's address is captured",
  a1.recipient === "mjf@colorami.com", "got " + a1.recipient);

let a2 = analyze.analyze(rawMsg(
  "To: undisclosed-recipients:;\r\n" +
  "Delivered-To: second.identity@gmail.com\r\n"));
ok("recipient: Delivered-To is the fallback when To has no address",
  a2.recipient === "second.identity@gmail.com", "got " + a2.recipient);

let a3 = analyze.analyze(rawMsg(
  "To: mjf@colorami.com\r\n" +
  "Delivered-To: spamdodger@gmail.com\r\n"));
ok("recipient: a usable To wins over Delivered-To",
  a3.recipient === "mjf@colorami.com", "got " + a3.recipient);

let a4 = analyze.analyze(rawMsg(""));
ok("recipient: no To and no Delivered-To reads empty",
  a4.recipient === "", "got " + JSON.stringify(a4.recipient));

ok("recipientOf is exported from the lib",
  typeof analyze.recipientOf === "function");

// ---------- sendAsHintFor (the trigger, injected accounts) ----------
const hintFor = analyze.sendAsHintFor;

ok("trigger: fetched custom-domain recipient differs -> fires",
  hintFor("mjf@colorami.com", "spamdodger@gmail.com") ===
    "mjf@colorami.com");
ok("trigger: second @gmail.com identity differs -> fires",
  hintFor("second.identity@gmail.com", "spamdodger@gmail.com") ===
    "second.identity@gmail.com");
ok("trigger: recipient equals the account address -> silent",
  hintFor("spamdodger@gmail.com", "spamdodger@gmail.com") === null);
ok("trigger: equality is case-insensitive",
  hintFor("SpamDodger@Gmail.com", "spamdodger@gmail.com") === null);
ok("fallback: account unreadable + custom-domain recipient -> fires",
  hintFor("mjf@colorami.com", "") === "mjf@colorami.com");
ok("fallback: account unreadable + @gmail.com recipient -> silent",
  hintFor("someone@gmail.com", "") === null);
ok("fallback: account unreadable + @googlemail.com -> silent",
  hintFor("someone@googlemail.com", "") === null);
ok("fallback: account unreadable (null) + custom domain -> fires",
  hintFor("owner@their-domain.org", null) === "owner@their-domain.org");
ok("trigger: no recipient -> silent whatever the account",
  hintFor("", "spamdodger@gmail.com") === null &&
  hintFor(null, "") === null);
ok("trigger: a recipient with no @ is not an address -> silent",
  hintFor("undisclosed-recipients", "spamdodger@gmail.com") === null);

// ---------- sendAsHintText (names the header address) ----------
const hintText = analyze.sendAsHintText;

ok("text: names the recipient from the headers",
  hintText("mjf@colorami.com") ===
    "This spam was addressed to mjf@colorami.com. If the " +
    "complaint opens under a different From address, use " +
    "the From dropdown in the compose and send it as " +
    "mjf@colorami.com.",
  "got " + hintText("mjf@colorami.com"));
ok("text: a different recipient is named, never a hardcoded one",
  hintText("owner@their-domain.org").indexOf(
    "owner@their-domain.org") !== -1 &&
  hintText("owner@their-domain.org").indexOf("colorami") === -1);
ok("text: the PID lane names it a letter",
  hintText("mjf@colorami.com", "letter").indexOf(
    "If the letter opens under a different From address") !== -1);

// ---------- content.js wiring ----------
ok("content: the account address is read from the header " +
   "account control's aria-label",
  contentSrc.indexOf("function signedInAccountEmail()") !== -1 &&
  contentSrc.indexOf('[aria-label^="Google Account"]') !== -1);
ok("content: the hint is computed once per render from the " +
   "analysis recipient + the page-read account address",
  contentSrc.indexOf("sendAsHintFor(a.recipient,") !== -1 &&
  contentSrc.indexOf("signedInAccountEmail())") !== -1);
ok("content: one hint factory, marker class sf-sendas-hint",
  count(contentSrc, "sf-sendas-hint") === 1 &&
  contentSrc.indexOf('"sf-fine sf-sendas-hint"') !== -1 &&
  contentSrc.indexOf("sendAsHintText(sendAsAddr, what)") !== -1);
ok("content: the hint rides the four bare-call lanes " +
   "(mail host, website host, link host, registrar) plus " +
   "v1.0.74's fifth — the AWS email door inside the mail " +
   "kit, an email lane like the other four",
  count(contentSrc, "= sendAsHintEl();") === 5,
  "got " + count(contentSrc, "= sendAsHintEl();"));
ok("content: the PID lane calls it with 'letter'",
  count(contentSrc, 'sendAsHintEl("letter")') === 1);
ok("content: each lane appends its own hint element",
  contentSrc.indexOf("if (compSendAs) cw.appendChild(compSendAs);") !== -1 &&
  contentSrc.indexOf("if (wSendAs) ww.appendChild(wSendAs);") !== -1 &&
  contentSrc.indexOf("if (lSendAs) lw.appendChild(lSendAs);") !== -1 &&
  contentSrc.indexOf("if (rSendAs) rw.appendChild(rSendAs);") !== -1 &&
  contentSrc.indexOf("if (pidSendAs) step.appendChild(pidSendAs);") !== -1);
ok("content: the registrar hint sits in the email-compose " +
   "branch only (the July Name form kit opens a form)",
  contentSrc.indexOf('wireCompose(rBtn, a.registrarComplaint, ' +
    '"registrar");\n          var rSendAs = sendAsHintEl();') !== -1);
ok("content: reminder only — content.js never drives the " +
   "compose's From dropdown itself",
  count(contentSrc, "From dropdown") === 0);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
