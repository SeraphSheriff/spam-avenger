"use strict";
// Public 1.0.72 release (internal build .73) — the
// own-forward catch (queued-own-forward-catch.md,
// Michael's find Nov 8 2026; Oct 28 2026 precedent):
//
// Clicking the shield on the user's OWN forward of a spam
// message exhausts the header fetch ("download had no
// headers… try 2: HTTP 404; try 3: HTTP 404") and the
// panel said "Something broke" — an addon-bug reading for
// a message that simply carries no traceable headers.
// Now: when the fetch fails with that signature AND the
// anchored message is the user's own forward, the panel
// shows a plain explanation (lib OWN_FORWARD_EXPLANATION)
// pointing at the original message. And in a mixed thread
// the anchor prefers the first non-self message, so the
// panel traces the original directly.
//
// The detector (lib ownForwardVerdict) is pure over page
// signals: it fires on the sender being the account's own
// identity. Short of that it needs a "Forwarded message"
// block PLUS at least two corroborators — a Fwd:/FW:
// subject, the sender's display name equalling the
// account holder's name, the APWG + CISA desk pair as
// recipients. The two-of rule is the widened rebuild
// (Michael-approved Nov 8 2026) after the first build's
// subjectFwd-AND-block requirement missed his 5:43 PM
// forward in the field: that specimen's subject carried
// NO Fwd: prefix, but its sender name was his own and it
// was addressed to the desk pair. One corroborator alone
// (someone else's forward TO the user) never fires.

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

// ---------- the detector ----------
const verdict = analyze.ownForwardVerdict;
const BLOCK = "\n---------- Forwarded message ---------\n" +
  "From: Sophia <mjfibo@dlybrh.com>\n" +
  "Subject: [Black Friday 2026 Deals] Discover Luxury Timepieces\n\n" +
  "Buy a watch.\n";

const DESKS = ["contact@cisa.dhs.gov", "reportphishing@apwg.org"];

ok("detector: specimen A fires — the Nov 8 5:09 PM forward " +
   "(Fwd: subject + forwarded block + desk-pair recipients; " +
   "sender is his send-as identity, not the account's primary " +
   "address): subject and desk pair are the two corroborators",
  verdict({
    subject: "Fwd: [Black Friday 2026 Deals] Discover Luxury " +
      "Timepieces Starting at $250",
    senderEmail: "mjf@colorami.com",
    bodyText: "Please take care of this." + BLOCK,
    recipientEmails: DESKS,
    accountEmail: "spamdodger@gmail.com"
  }) === true);
ok("detector: FW: subject + block + desk pair fires too",
  verdict({
    subject: "FW: report", senderEmail: "desk@example.net",
    bodyText: "see below" + BLOCK,
    recipientEmails: DESKS,
    accountEmail: "user@gmail.com"
  }) === true);
ok("detector: the sender being the account itself fires alone",
  verdict({
    subject: "Quarterly numbers", senderEmail: "user@gmail.com",
    bodyText: "No block here.", accountEmail: "user@gmail.com"
  }) === true);
ok("detector: own sender + block fires under any subject",
  verdict({
    subject: "As promised", senderEmail: "user@gmail.com",
    bodyText: "here it is" + BLOCK,
    accountEmail: "USER@gmail.com"
  }) === true);
ok("detector: a Fwd: subject alone (someone else's forward, " +
   "no block) does not fire",
  verdict({
    subject: "Fwd: funny cat", senderEmail: "friend@example.net",
    bodyText: "thought you'd like this",
    accountEmail: "user@gmail.com"
  }) === false);
ok("detector: a forwarded block alone (plain subject, other " +
   "sender) does not fire",
  verdict({
    subject: "That spam you asked about",
    senderEmail: "friend@example.net",
    bodyText: "here it is" + BLOCK,
    accountEmail: "user@gmail.com"
  }) === false);
ok("detector: a normal message never fires",
  verdict({
    subject: "Your receipt", senderEmail: "shop@example.com",
    bodyText: "Thanks for your order.",
    accountEmail: "user@gmail.com"
  }) === false);
ok("detector: empty signals never fire",
  verdict({}) === false && verdict(null) === false &&
  verdict({ subject: "", senderEmail: "", bodyText: "",
    accountEmail: "" }) === false);
ok("detector: the block path works when the account " +
   "address is unreadable (subject + desk pair carry it)",
  verdict({
    subject: "Fwd: deals", senderEmail: "mjf@colorami.com",
    bodyText: "x" + BLOCK, recipientEmails: DESKS,
    accountEmail: "", accountName: ""
  }) === true);
ok("detector: 'Re: Fwd:' does not count as begins-with-Fwd",
  verdict({
    subject: "Re: Fwd: deals", senderEmail: "pal@example.net",
    bodyText: "no block", accountEmail: "user@gmail.com"
  }) === false);

// ---------- the widened rule (Nov 8 2026 rebuild) ----------
const BAG_BLOCK = "\n---------- Forwarded message ---------\n" +
  "From: Leather Goods <promo@rjfzzo.com>\n" +
  "Subject: [Black Friday 2026] Vintage Style. Leather " +
  "Travel Bag. Top Quality at the Lowest Price.\n\nShop now.\n";

ok("detector: specimen B fires — THE field failure (Nov 8 " +
   "5:43 PM): NO Fwd: prefix, but the block, the holder's " +
   "own name as sender name, and the desk pair are all " +
   "there; sender is the send-as identity",
  verdict({
    subject: "[Black Friday 2026] Vintage Style. Leather " +
      "Travel Bag. Top Quality at the Lowest Price.",
    senderEmail: "mjf@colorami.com",
    senderName: "Michael Fiorella",
    bodyText: "Please take care of this." + BAG_BLOCK,
    recipientEmails: DESKS,
    accountEmail: "spamdodger@gmail.com",
    accountName: "Michael Fiorella"
  }) === true);
ok("detector: a stranger's forward TO the user (block + " +
   "Fwd: subject, stranger name, user as recipient) does " +
   "not fire — subject is only one corroborator",
  verdict({
    subject: "Fwd: look at this spam",
    senderEmail: "friend@example.net",
    senderName: "Fred Friend",
    bodyText: "thoughts?" + BAG_BLOCK,
    recipientEmails: ["user@gmail.com"],
    accountEmail: "user@gmail.com",
    accountName: "Ursula User"
  }) === false);
ok("detector: block + desk pair alone (plain subject, " +
   "stranger name) does not fire — one corroborator",
  verdict({
    subject: "Quarterly numbers",
    senderEmail: "desk@example.net",
    senderName: "Deb Desk",
    bodyText: "see below" + BAG_BLOCK,
    recipientEmails: DESKS,
    accountEmail: "user@gmail.com",
    accountName: "Ursula User"
  }) === false);
ok("detector: block + name match alone (plain subject, " +
   "user as recipient) does not fire — one corroborator",
  verdict({
    subject: "That thing",
    senderEmail: "mjf@colorami.com",
    senderName: "Michael Fiorella",
    bodyText: "see below" + BAG_BLOCK,
    recipientEmails: ["spamdodger@gmail.com"],
    accountEmail: "other@gmail.com",
    accountName: "Michael Fiorella"
  }) === false);
ok("detector: half the desk pair is no pair — block + " +
   "Fwd: + APWG only does not fire",
  verdict({
    subject: "Fwd: deals",
    senderEmail: "desk@example.net",
    bodyText: "x" + BAG_BLOCK,
    recipientEmails: ["reportphishing@apwg.org"],
    accountEmail: "user@gmail.com"
  }) === false);
ok("detector: no block, no fire — subject + name + desk " +
   "pair without the forwarded block does not fire",
  verdict({
    subject: "Fwd: deals",
    senderEmail: "mjf@colorami.com",
    senderName: "Michael Fiorella",
    bodyText: "Just a normal note, no quoted forward.",
    recipientEmails: DESKS,
    accountEmail: "spamdodger@gmail.com",
    accountName: "Michael Fiorella"
  }) === false);
ok("detector: empty names never name-match — block + " +
   "Fwd: with both names blank stays at one corroborator",
  verdict({
    subject: "Fwd: deals",
    senderEmail: "desk@example.net",
    senderName: "", accountName: "",
    bodyText: "x" + BAG_BLOCK,
    recipientEmails: ["user@gmail.com"],
    accountEmail: "user@gmail.com"
  }) === false &&
  verdict({
    subject: "Fwd: deals",
    senderEmail: "desk@example.net",
    senderName: "Michael Fiorella", accountName: "   ",
    bodyText: "x" + BAG_BLOCK,
    recipientEmails: ["user@gmail.com"],
    accountEmail: "user@gmail.com"
  }) === false);
ok("detector: a partial name never name-matches — first " +
   "name only, block + Fwd: stays at one corroborator",
  verdict({
    subject: "Fwd: deals",
    senderEmail: "mjf@colorami.com",
    senderName: "Michael",
    bodyText: "x" + BAG_BLOCK,
    recipientEmails: ["spamdodger@gmail.com"],
    accountEmail: "spamdodger@gmail.com",
    accountName: "Michael Fiorella"
  }) === false);
ok("detector: name match is case/whitespace-insensitive " +
   "and pairs with the desk pair (shouted desk addresses, " +
   "caps block) to fire without any Fwd:",
  verdict({
    subject: "Vintage Style. Leather Travel Bag.",
    senderEmail: "mjf@colorami.com",
    senderName: "  michael   fiorella ",
    bodyText: "---------- FORWARDED MESSAGE ---------\nx",
    recipientEmails: ["REPORTPHISHING@APWG.ORG",
      "Contact@CISA.DHS.gov"],
    accountEmail: "spamdodger@gmail.com",
    accountName: "Michael Fiorella"
  }) === true);
ok("detector: lowercase 'fwd:' counts as the subject " +
   "corroborator alongside the desk pair",
  verdict({
    subject: "fwd: deals",
    senderEmail: "desk@example.net",
    bodyText: "x" + BAG_BLOCK,
    recipientEmails: DESKS,
    accountEmail: "user@gmail.com"
  }) === true);

// ---------- the explanation ----------
ok("explanation: the panel copy is the spec's plain wording",
  analyze.OWN_FORWARD_EXPLANATION ===
    "This is your own forward of a spam message, not the " +
    "original. Gmail won't hand over the original's headers " +
    "from a forward, so there's nothing to trace here. Open " +
    "the original message and click the shield there.",
  "got: " + analyze.OWN_FORWARD_EXPLANATION);

// ---------- signal gathering (extracted, fake DOM) ----------
const vm = require("vm");
function extractFn(src, startNeedle, endNeedle) {
  const a = src.indexOf(startNeedle);
  const b = a === -1 ? -1 : src.indexOf(endNeedle, a);
  return (a === -1 || b === -1) ? "" : src.slice(a, b);
}
class FakeEl {
  constructor(opts) {
    opts = opts || {};
    this._attrs = opts.attrs || {};
    this.textContent = opts.text || "";
    this._qs = opts.qs || {};
    this._qsa = opts.qsa || {};
  }
  getAttribute(n) {
    return Object.prototype.hasOwnProperty.call(this._attrs, n)
      ? this._attrs[n] : null;
  }
  querySelector(sel) { return this._qs[sel] || null; }
  querySelectorAll(sel) { return this._qsa[sel] || []; }
}

const sigSrc = extractFn(contentSrc,
  "function pageMessageSignals(el)", "function messageElById");
ok("gathering: pageMessageSignals extracted from content.js",
  sigSrc.indexOf("recipientEmails") !== -1 &&
  sigSrc.indexOf("senderName") !== -1);
const pageSignals = vm.runInNewContext(
  sigSrc + "\n;pageMessageSignals;", {});

const gD = new FakeEl({
  attrs: { email: "mjf@colorami.com", name: "Michael Fiorella" },
  text: "Michael Fiorella" });
const g2a = new FakeEl({ attrs: { email: "contact@cisa.dhs.gov" } });
const g2b = new FakeEl({
  attrs: { email: "reportphishing@apwg.org" } });
const hb = new FakeEl({ qsa: { "[email]": [gD, g2a, g2b] } });
const a3s = new FakeEl({
  text: "Please take care of this." + BAG_BLOCK });
const msgEl = new FakeEl({
  qs: { ".gD": gD, ".go": null, ".a3s": a3s, ".hb": hb },
  qsa: { ".g2[email]": [g2a, g2b] } });
const sig = pageSignals(msgEl);
ok("gathering: the expanded specimen yields sender, name, " +
   "both desk recipients (the sender node inside the header " +
   "block is excluded, no duplicates), and the block body",
  sig.senderEmail === "mjf@colorami.com" &&
  sig.senderName === "Michael Fiorella" &&
  sig.recipientEmails.length === 2 &&
  sig.recipientEmails.indexOf("contact@cisa.dhs.gov") !== -1 &&
  sig.recipientEmails.indexOf("reportphishing@apwg.org") !== -1 &&
  /forwarded message/i.test(sig.bodyText),
  JSON.stringify(sig));
ok("gathering: the name falls back to the span's text when " +
   "the name attribute is absent",
  pageSignals(new FakeEl({
    qs: { ".gD": new FakeEl({
      attrs: { email: "mjf@colorami.com" },
      text: "Michael Fiorella" }) }
  })).senderName === "Michael Fiorella");
ok("gathering: a collapsed message yields empty signals, " +
   "which can never corroborate anything",
  JSON.stringify(pageSignals(new FakeEl({}))) ===
    JSON.stringify({ senderEmail: "", senderName: "",
      recipientEmails: [], bodyText: "" }) &&
  pageSignals(null).recipientEmails.length === 0);

const acctHolder = { els: [] };
const acctNameSrc = extractFn(contentSrc,
  "function signedInAccountName()", "function messageOpen()");
ok("gathering: signedInAccountName extracted from content.js",
  acctNameSrc.indexOf("Google Account:") !== -1);
const signedInAccountName = vm.runInNewContext(
  acctNameSrc + "\n;signedInAccountName;",
  { document: { querySelectorAll: function () {
      return acctHolder.els; } } });
acctHolder.els = [new FakeEl({ attrs: {
  "aria-label":
    "Google Account: Michael Fiorella (spamdodger@gmail.com)" } })];
ok("gathering: the holder name parses out of the account " +
   "control's aria-label",
  signedInAccountName() === "Michael Fiorella",
  "got " + signedInAccountName());
acctHolder.els = [new FakeEl({ attrs: {
  "aria-label": "Google Account",
  title:
    "Google Account: Michael Fiorella (spamdodger@gmail.com)" } })];
ok("gathering: a bare aria-label falls back to the title",
  signedInAccountName() === "Michael Fiorella");
acctHolder.els = [];
ok("gathering: no account control reads as an absent name",
  signedInAccountName() === "");

// ---------- content.js wiring ----------
ok("content: page signals are read from the message element",
  contentSrc.indexOf("function pageMessageSignals(el)") !== -1 &&
  contentSrc.indexOf('el.querySelector(".gD")') !== -1 &&
  contentSrc.indexOf('el.querySelector(".go")') !== -1 &&
  contentSrc.indexOf('el.querySelector(".a3s")') !== -1);
ok("content: the on-page verdict feeds subject + account address",
  contentSrc.indexOf("function ownForwardOnPage(el)") !== -1 &&
  contentSrc.indexOf('document.querySelector("h2.hP")') !== -1 &&
  contentSrc.indexOf("accountEmail: signedInAccountEmail()") !== -1);
ok("content: the on-page verdict feeds the widened signals " +
   "(sender name, recipients, account holder name)",
  contentSrc.indexOf("senderName: sig.senderName") !== -1 &&
  contentSrc.indexOf("recipientEmails: sig.recipientEmails") !== -1 &&
  contentSrc.indexOf("accountName: signedInAccountName()") !== -1 &&
  contentSrc.indexOf("function signedInAccountName()") !== -1);
ok("content: page signals gather recipients from the " +
   "header's addressed nodes",
  contentSrc.indexOf('querySelectorAll(".g2[email]")') !== -1 &&
  contentSrc.indexOf('querySelector(".hb")') !== -1);
ok("content: the anchor prefers the first non-self message in " +
   "a mixed thread",
  contentSrc.indexOf("if (els.length > 1 && ownForwardOnPage(els[0]))") !== -1 &&
  contentSrc.indexOf("if (!ownForwardOnPage(els[i]))") !== -1);
const clickAt = contentSrc.indexOf("function onShieldClick()");
const clickSlice = clickAt === -1 ? "" :
  contentSrc.slice(clickAt, clickAt + 3200);
ok("content: the catch is gated on the exhausted-headers signature",
  clickSlice.indexOf(
    'msg.indexOf("wouldn\'t hand over the headers") !== -1') !== -1 &&
  clickSlice.indexOf("ownForwardOnPage(messageElById(mid))") !== -1);
ok("content: on a catch the explanation replaces Something broke",
  clickSlice.indexOf(
    "window.SpamAvenger.OWN_FORWARD_EXPLANATION") !== -1 &&
  clickSlice.indexOf('"sf-note"') !== -1);
ok("content: genuine failures keep the Something broke text",
  clickSlice.indexOf('"Something broke (v" + SF_VERSION + "): "') !== -1 &&
  clickSlice.indexOf(
    "Try reloading Gmail and clicking the shield again.") !== -1);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
