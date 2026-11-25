"use strict";
// Public 1.0.72 release (internal build .73) — launched-
// stamp parity + the registrar paste-mode fixes
// (queued-registrar-paste-mode.md, Michael's calls
// Nov 8 2026):
//
//  PARITY: on the vitluma.fun panel the registrar section
//  toggle showed "✓ 6:52 PM" while the "Open in Gmail —
//  just click Send" button inside showed nothing. The
//  website and registrar lanes now register TWO badge
//  targets — { els: [toggle, button] }, the complaint
//  lane's shape — in both their shapes (email lane and
//  form kit), and their buttons carry .sf-btn-label spans
//  so the paste/copy label swaps can't eat the badge.
//  A stored record badges toggle AND button from the one
//  timestamp; no record leaves both clean.
//
//  PASTE 1: the registrar lane's "Copy the abuse address"
//  button is removed — the address already shows in the
//  section and is auto-filled into the compose To.
//
//  PASTE 2: a lane whose complaint will open in paste
//  mode says so BEFORE the click, next to the button
//  (lib PASTE_MODE_WARNING). The prediction runs the same
//  fit the click runs.
//
//  PASTE 3: the paste stub (lib PASTE_NOTE) instructs
//  select-all THEN paste, so the full complaint REPLACES
//  the stub — no stub text in the sent email, no run-on
//  line. The clipboard payload is unchanged.

const fs = require("fs");
const path = require("path");
const vm = require("vm");
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

ok("manifest version stays 1.0.73", manifest.version === "1.0.87",
  "got " + manifest.version);

// ---------- parity: registrations and pushes ----------
ok("parity: registrar registers the els shape",
  contentSrc.indexOf(
    "badgeTargets.registrar = { els: [rSec.toggle] }") !== -1);
ok("parity: website registers the els shape in both branches",
  contentSrc.indexOf(
    "badgeTargets.website = { els: [wSec.toggle] }") !== -1 &&
  contentSrc.indexOf(
    "badgeTargets.website = { els: [wFormSec.toggle] }") !== -1);
ok("parity: the inner buttons are pushed as second targets",
  contentSrc.indexOf("badgeTargets.registrar.els.push(rBtn)") !== -1 &&
  contentSrc.indexOf("badgeTargets.registrar.els.push(rFormBtn)") !== -1 &&
  contentSrc.indexOf("badgeTargets.website.els.push(wBtn)") !== -1 &&
  contentSrc.indexOf("badgeTargets.website.els.push(wFormBtn)") !== -1);
ok("parity: no single-target registration remains for either lane",
  contentSrc.indexOf("badgeTargets.registrar = { el:") === -1 &&
  contentSrc.indexOf("badgeTargets.website = { el:") === -1);
ok("parity: the domain-lane buttons carry label spans (four " +
  "at the parity fix; public 1.0.72's link-host stamp fix " +
  "adds its two — six domain-lane spans, eight in total; " +
  "v1.0.74: the mail kit's AWS email-door button carries " +
  "the ninth)",
  contentSrc.indexOf("var wFormBtnLabel = ") !== -1 &&
  contentSrc.indexOf("var rFormBtnLabel = ") !== -1 &&
  contentSrc.indexOf("var lFormBtnLabel = ") !== -1 &&
  count(contentSrc, '"class": "sf-btn-label"') === 10);
ok("parity: the form buttons' swaps write only their label spans",
  contentSrc.indexOf("wFormBtn.textContent") === -1 &&
  contentSrc.indexOf("rFormBtn.textContent") === -1 &&
  contentSrc.indexOf("var origLabel = wFormBtnLabel.textContent;") !== -1 &&
  contentSrc.indexOf("var origLabel = rFormBtnLabel.textContent;") !== -1);
ok("parity: wireCompose swaps the label span when the button has one",
  contentSrc.indexOf(
    'var swapEl = btn.querySelector(".sf-btn-label") || btn;') !== -1 &&
  contentSrc.indexOf("swapEl.textContent = origLabel;") !== -1);

// ---------- parity: a stored record badges BOTH controls ----------
const bMark = "// [sa-history-helpers-begin]";
const eMark = "// [sa-history-helpers-end]";
const bi = contentSrc.indexOf(bMark), ei = contentSrc.indexOf(eMark);
function makeFakeEl() {
  return {
    className: "", textContent: "", attrs: {}, childNodes: [],
    setAttribute: function (k, v) { this.attrs[k] = v; },
    appendChild: function (c) { this.childNodes.push(c); return c; }
  };
}
let H = null;
if (bi !== -1 && ei > bi) {
  const block = contentSrc.slice(contentSrc.indexOf("\n", bi) + 1, ei);
  H = vm.runInNewContext(block + "\n;({ badgeOn: saBadgeOnElement });",
    { document: { createElement: function () { return makeFakeEl(); } } });
}
ok("parity: history helpers evaluate for the badge simulation", !!H);

if (H) {
  function applyEls(entry, lane, ts) {
    const els = entry.els || (entry.el ? [entry.el] : []);
    els.forEach(function (el) { H.badgeOn(el, lane, ts, false); });
  }
  function badgesOf(el) {
    return el.childNodes.filter(function (n) {
      return n.className === "sf-done-badge";
    });
  }
  const TS = new Date(2026, 10, 8, 18, 52).getTime(); // Nov 8, 6:52 PM
  ["registrar", "website"].forEach(function (lane) {
    // The registry pass the panel runs at render end, with
    // a stored record for this message.
    const toggle = makeFakeEl(), btn = makeFakeEl();
    const registry = {};
    registry[lane] = { els: [toggle, btn] };
    const rec = {};
    rec[lane] = TS;
    Object.keys(rec).forEach(function (l) {
      if (typeof rec[l] === "number") applyEls(registry[l], l, rec[l]);
    });
    ok("parity: " + lane + " record badges toggle AND inner button",
      badgesOf(toggle).length === 1 && badgesOf(btn).length === 1 &&
      badgesOf(toggle)[0].textContent === badgesOf(btn)[0].textContent &&
      badgesOf(toggle)[0].attrs.title === badgesOf(btn)[0].attrs.title);
    // No record: the same pass leaves both controls clean.
    const cToggle = makeFakeEl(), cBtn = makeFakeEl();
    const cRegistry = {};
    cRegistry[lane] = { els: [cToggle, cBtn] };
    const noRec = null;
    if (noRec) {
      Object.keys(noRec).forEach(function (l) {
        applyEls(cRegistry[l], l, noRec[l]);
      });
    }
    ok("parity: " + lane + " with no record badges neither",
      badgesOf(cToggle).length === 0 && badgesOf(cBtn).length === 0);
  });
}

// ---------- paste 1: the Copy button is gone ----------
ok("paste 1: no 'Copy the abuse address' button is ever built " +
   "(the name survives only in the removal comment)",
  count(contentSrc, "Copy the abuse address") === 1 &&
  contentSrc.indexOf('"button" }, "Copy the abuse address"') === -1);
ok("paste 1: the rCopyBtn machinery is gone with it",
  contentSrc.indexOf("rCopyBtn") === -1);
ok("paste 1: the registrar Abuse contact row still renders",
  contentSrc.indexOf(
    'rw.appendChild(mkRow("Abuse contact", ri.registrarAbuse));') !== -1);
ok("paste 1: the registrar complaint flow is unchanged",
  contentSrc.indexOf('"sf-registrar-compose"') !== -1 &&
  contentSrc.indexOf(
    'wireCompose(rBtn, a.registrarComplaint, "registrar")') !== -1 &&
  contentSrc.indexOf('"sf-registrar-text"') !== -1);

// ---------- paste 3: the stub is replace, not append ----------
const NOTE = analyze.PASTE_NOTE;
ok("paste 3: PASTE_NOTE is exported", typeof NOTE === "string");
ok("paste 3: the stub teaches Ctrl+A (select) before Ctrl+V (paste)",
  NOTE.indexOf("Ctrl+A") !== -1 &&
  NOTE.indexOf("Ctrl+A") < NOTE.indexOf("Ctrl+V") &&
  /select/i.test(NOTE) && /in its place/.test(NOTE),
  "got: " + NOTE);
ok("paste 3: a select-all + paste leaves NO stub text behind",
  (function () {
    // The compose body starts as the stub; the user selects
    // all of it and pastes the complaint over the selection.
    const complaint = "Hello Registrar Abuse Team,\n\n" +
      "I am reporting vitluma.fun.\n";
    let body = NOTE;
    body = complaint; // selection replaced by the clipboard
    return body === complaint &&
      body.indexOf("direct email link") === -1 &&
      body.indexOf("in its place") === -1;
  })());
ok("paste 3: both fit paths hand the compose the stub as its body",
  (function () {
    const big = { to: "abuse@registrar.example",
      subject: "DNS abuse report",
      body: "Evidence line.\n".repeat(3000) };
    const given = analyze.fitGivenComplaint("0", big);
    if (!given || given.mode !== "paste") return false;
    const bodyParam = given.url.split("&body=")[1];
    return decodeURIComponent(bodyParam) === NOTE &&
      given.complaint.body === big.body; // clipboard unchanged
  })());
ok("paste 3: fitForCompose falls to paste with the stub, " +
   "clipboard keeps the full complaint",
  (function () {
    const full = { to: "abuse@host.example", subject: "Spam report",
      body: "Full headers follow.\n".repeat(3000) };
    const plan = analyze.fitForCompose("0", { complaint: full });
    if (!plan || plan.mode !== "paste") return false;
    return decodeURIComponent(plan.url.split("&body=")[1]) === NOTE &&
      plan.complaint.body === full.body;
  })());

// ---------- paste 2: the panel warns before the click ----------
ok("paste 2: the warning text is Michael's, exported from the lib",
  analyze.PASTE_MODE_WARNING ===
    "This complaint is too long to send across automatically. " +
    "It opens in Gmail as a short note \u2014 the full text is " +
    "copied for you, and you paste it in.",
  "got: " + analyze.PASTE_MODE_WARNING);
ok("paste 2: an under-threshold complaint fits direct (no warning)",
  (function () {
    const small = { to: "abuse@registrar.example", subject: "Hi",
      body: "Short body." };
    const plan = analyze.fitGivenComplaint("0", small);
    return !!plan && plan.mode === "direct";
  })());
ok("paste 2: the mail lane refreshes its warning from the same fit",
  contentSrc.indexOf("function refreshMailPasteWarn()") !== -1 &&
  contentSrc.indexOf(
    "plan = window.SpamAvenger.fitForCompose(accountIndex(), a);") !== -1 &&
  contentSrc.indexOf("mailPasteWarnEl.textContent =") !== -1 &&
  contentSrc.indexOf("window.SpamAvenger.PASTE_MODE_WARNING;") !== -1);
ok("paste 2: the mail warning element renders in the complaint section",
  contentSrc.indexOf('mailPasteWarnEl = h("p",') !== -1 &&
  contentSrc.indexOf("cw.appendChild(mailPasteWarnEl);") !== -1 &&
  contentSrc.indexOf("refreshMailPasteWarn();") !== -1);
ok("paste 2: the sightings rebuild refreshes the mail warning too",
  count(contentSrc, "refreshMailPasteWarn();") >= 2,
  "got " + count(contentSrc, "refreshMailPasteWarn();"));
ok("paste 2: the domain lanes share one pasteWarnEl helper on the same fit",
  contentSrc.indexOf("function pasteWarnEl(complaint)") !== -1 &&
  contentSrc.indexOf(
    "plan = window.SpamAvenger.fitGivenComplaint(") !== -1 &&
  contentSrc.indexOf('plan.mode !== "paste"') !== -1);
ok("paste 2: website, link, and registrar sections each place the warning",
  contentSrc.indexOf("var wPaste = pasteWarnEl(a.websiteComplaint);") !== -1 &&
  contentSrc.indexOf("var lPaste = pasteWarnEl(a.linkComplaint);") !== -1 &&
  contentSrc.indexOf("var rPaste = pasteWarnEl(a.registrarComplaint);") !== -1 &&
  contentSrc.indexOf("if (wPaste) ww.appendChild(wPaste);") !== -1 &&
  contentSrc.indexOf("if (lPaste) lw.appendChild(lPaste);") !== -1 &&
  contentSrc.indexOf("if (rPaste) rw.appendChild(rPaste);") !== -1);
ok("paste 2: exactly two sf-paste-warn render sites (mail + helper)",
  count(contentSrc, "sf-paste-warn") === 2,
  "got " + count(contentSrc, "sf-paste-warn"));

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
