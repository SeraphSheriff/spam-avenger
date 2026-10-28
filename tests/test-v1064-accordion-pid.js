// Spam Avenger v1.0.64 — accordion + PID-removal tests.
// v1.0.64 (Michael's order, Oct 28) does three things:
//   (1) the PID section loses its RDAP registration-contact
//       suggestion — fetch, chip, and "Looking up…" status
//       text — exactly as Outlook v1.2.3 did;
//   (2) the panel's lanes become an Outlook-style accordion
//       (all collapsed on open, strictly one section open);
//   (3) the version goes to 1.0.64 for both stores.
// This suite pins all three, plus the reportfill.js restore
// (the scrapped walkthrough build must not ship) and the
// manifest length limits (the v1.0.25 Chrome lesson).
// Run: node tests/test-v1064-accordion-pid.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const contentSrc = fs.readFileSync(path.join(ROOT, "content.js"), "utf8");
const cssSrc = fs.readFileSync(path.join(ROOT, "panel.css"), "utf8");
const reportfillSrc = fs.readFileSync(path.join(ROOT, "reportfill.js"), "utf8");
const demandSrc = fs.readFileSync(path.join(ROOT, "lib", "demand.js"), "utf8");
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); }
}

// ---------- manifest ----------
ok("manifest version is 1.0.64", manifest.version === "1.0.64",
  "got " + manifest.version);
ok("manifest description within Chrome's 132-char limit",
  typeof manifest.description === "string" &&
  manifest.description.length <= 132,
  "length " + (manifest.description || "").length);
ok("manifest name present and sane",
  typeof manifest.name === "string" && manifest.name.length <= 75,
  "length " + (manifest.name || "").length);
ok("gecko id unchanged",
  manifest.browser_specific_settings &&
  manifest.browser_specific_settings.gecko &&
  manifest.browser_specific_settings.gecko.id ===
    "spam-avenger-gmail@seraphsheriff.github.io");

// ---------- (1) PID: the RDAP suggestion is gone ----------
ok("PID render never calls the registration-contact fetch",
  !/D\.fetchRegistrationContact/.test(contentSrc) &&
  !/SpamDemand\.fetchRegistrationContact/.test(contentSrc));
ok("no 'Registration record lists' suggestion string in content.js",
  contentSrc.indexOf("Registration record lists") === -1);
ok("no 'Use this address' chip action in content.js",
  contentSrc.indexOf("Use this address") === -1);
ok("RDAP state machinery gone (rdapState / rdapContact / srcEl)",
  !/\brdapState\b|\brdapContact\b|\bsrcEl\b/.test(contentSrc));
ok("no sf-demand-src class referenced in content.js",
  contentSrc.indexOf("sf-demand-src") === -1);
ok("no .sf-demand-src rule left in panel.css",
  cssSrc.indexOf(".sf-demand-src {") === -1 &&
  cssSrc.indexOf(".sf-demand-src:hover") === -1);
ok("Send-to field is never assigned a value by the panel",
  !/toField\.value\s*=/.test(contentSrc));
ok("website errand still present (the only guidance path)",
  contentSrc.indexOf("'s website \\u2197") !== -1 &&
  contentSrc.indexOf("Paste the address from their website") !== -1);
ok("lib/demand.js keeps fetchRegistrationContact on the shelf",
  /fetchRegistrationContact/.test(demandSrc));

// ---------- reportfill.js: the scrapped walkthrough stays out ----------
ok("reportfill.js carries no walkthrough-build strings",
  reportfillSrc.indexOf("showWalkthrough") === -1 &&
  reportfillSrc.indexOf("watchForLateStash") === -1 &&
  reportfillSrc.indexOf("walkthrough") === -1);

// ---------- (2) accordion wiring in renderResult ----------
const ORDER = ["sf-sec-complaint", "sf-sec-ftc", "sf-sec-sb",
  "sf-sec-fwd", "sf-sec-google", "sf-sec-pid"];
let lastIdx = -1, orderOk = true;
ORDER.forEach(function (id) {
  const i = Math.max(contentSrc.indexOf('acc.section("' + id + '"'),
    contentSrc.indexOf('acc.actionRow("' + id + '"'));
  if (i === -1 || i < lastIdx) orderOk = false;
  lastIdx = i;
});
ok("sections created in the Outlook order (complaint, FTC, SB, " +
   "Forward, Google, PID)", orderOk);
["sf-compose",
 "sf-report-phish", "sf-demand-draft",
 "sf-demand-open"].forEach(function (id) {
  ok("button id preserved: " + id,
    contentSrc.indexOf('id: "' + id + '"') !== -1 ||
    contentSrc.indexOf('"id": "' + id + '"') !== -1 ||
    contentSrc.indexOf('id="' + id + '"') !== -1);
});
// The orange Copy button was REMOVED on Michael's call
// (2026-10-28, after the buttons audit flagged it as the lead
// superfluous candidate): nobody used it, and the complaint
// textarea stays for anyone who wants the raw text. Pin its
// absence — and that the one send path survives intact.
ok("Copy complaint button is REMOVED (id, label, orange plumbing)",
  contentSrc.indexOf("sf-copy") === -1 &&
  contentSrc.indexOf("Copy complaint") === -1 &&
  contentSrc.indexOf("showOrange") === -1);
ok("Open in Gmail is the one send path, intact",
  contentSrc.indexOf('id: "sf-compose"') !== -1 &&
  contentSrc.indexOf("Open in Gmail") !== -1 &&
  contentSrc.indexOf("fitForCompose") !== -1);
ok("complaint textarea still rendered for manual copying",
  contentSrc.indexOf('id: "sf-complaint-text"') !== -1 ||
  contentSrc.indexOf('"sf-complaint-text"') !== -1);
ok("per-section stash status lines (sf-ftc-status / sf-sb-status)",
  contentSrc.indexOf("sf-ftc-status") !== -1 &&
  contentSrc.indexOf("sf-sb-status") !== -1);
// Michael's call (2026-10-28, test6 retest): Safe Browsing's
// section held nothing but a button repeating its own title —
// the nested button is REMOVED and the row itself fires the
// lane through the accordion's actionRow.
ok("Safe Browsing nested button REMOVED; the row fires the lane",
  contentSrc.indexOf("sf-report-sb") === -1 &&
  contentSrc.indexOf("function actionRow(") !== -1 &&
  contentSrc.indexOf('acc.actionRow("sf-sec-sb"') !== -1 &&
  contentSrc.indexOf(
    "safebrowsing.google.com/safebrowsing/report_phish/") !== -1);
// Same ruling an hour later for FTC: its section also held only
// a button and a status line, so its row fires the lane too.
ok("FTC nested button REMOVED; the row fires the lane",
  contentSrc.indexOf("sf-report-ftc") === -1 &&
  contentSrc.indexOf('acc.actionRow("sf-sec-ftc"') !== -1 &&
  contentSrc.indexOf("https://reportfraud.ftc.gov/") !== -1);
// And for Forward — with its twist: the button is a live status
// surface, so the row keeps the sf-fwd-phish id and
// gmailForwardPhish writes its states through the label span.
ok("Forward nested button REMOVED; row keeps sf-fwd-phish as status surface",
  contentSrc.indexOf('acc.section("sf-sec-fwd"') === -1 &&
  contentSrc.indexOf('acc.actionRow("sf-sec-fwd"') !== -1 &&
  contentSrc.indexOf('"sf-fwd-phish"') !== -1 &&
  contentSrc.indexOf('querySelector(".sf-acc-label")') !== -1 &&
  contentSrc.indexOf('setLabel("Opening forward') !== -1 &&
  contentSrc.indexOf(
    'setLabel("Forward addressed \\u2014 review and hit Send")') !== -1);
ok("shared sf-stash-status is gone",
  contentSrc.indexOf("sf-stash-status") === -1);
ok("legend is inserted directly above the stack",
  contentSrc.indexOf("body.insertBefore(legend, stack)") !== -1);
ok("'Also report it:' label row is gone (toggles are the labels)",
  contentSrc.indexOf('"sf-links"') === -1 &&
  !/h\("b", null, "Also report it/.test(contentSrc));
ok("accordion CSS present (toggle / panel / caret)",
  cssSrc.indexOf(".sf-acc-toggle") !== -1 &&
  cssSrc.indexOf(".sf-acc-panel") !== -1 &&
  cssSrc.indexOf(".sf-acc-caret") !== -1);
ok("accordion toggle colors defined outside .sf-actions scope",
  /button\.sf-acc-toggle\.sf-btn-green/.test(cssSrc) &&
  /button\.sf-acc-toggle\.sf-btn-blue/.test(cssSrc));

// ---------- (2) accordion behavior: extract + drive the factory ----------
// Minimal fake DOM. h() here deliberately mirrors content.js's
// own h(): string children become text nodes, element children
// are appended as-is, and ARRAYS ARE NOT FLATTENED — the
// factory must normalize labels itself (the PID toggle passes
// an array so one word can be bold).
function FakeEl(tag) {
  this.tagName = tag; this.children = []; this.style = {};
  this.className = ""; this.attrs = {}; this.listeners = {};
  this._text = "";
}
FakeEl.prototype.appendChild = function (c) { this.children.push(c); return c; };
FakeEl.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); };
FakeEl.prototype.getAttribute = function (k) { return this.attrs[k]; };
FakeEl.prototype.addEventListener = function (ev, fn) {
  (this.listeners[ev] = this.listeners[ev] || []).push(fn);
};
FakeEl.prototype.click = function () {
  (this.listeners.click || []).forEach(function (fn) { fn({}); });
};
Object.defineProperty(FakeEl.prototype, "textContent", {
  get: function () {
    return this._text + this.children.map(function (c) {
      return c.isText ? c.text : c.textContent;
    }).join("");
  },
  set: function (v) { this._text = String(v); this.children = []; }
});
const fakeDocument = {
  createElement: function (tag) { return new FakeEl(tag); },
  createTextNode: function (t) { return { isText: true, text: String(t) }; }
};
function fakeH(tag, attrs) {
  const el = new FakeEl(tag);
  if (attrs) {
    for (const k in attrs) {
      if (k === "class") el.className = attrs[k];
      else el.setAttribute(k, attrs[k]);
    }
  }
  for (let i = 2; i < arguments.length; i++) {
    const c = arguments[i];
    if (c == null || c === false) continue;
    el.appendChild(typeof c === "string" ? fakeDocument.createTextNode(c) : c);
  }
  return el;
}

const start = contentSrc.indexOf("function makeAccordion(stack) {");
ok("makeAccordion factory found in content.js", start !== -1);
let factorySrc = "";
if (start !== -1) {
  // brace-match from the factory's opening brace
  let depth = 0, end = -1;
  for (let i = contentSrc.indexOf("{", start); i < contentSrc.length; i++) {
    if (contentSrc[i] === "{") depth++;
    else if (contentSrc[i] === "}") { depth--; if (!depth) { end = i; break; } }
  }
  factorySrc = contentSrc.slice(start, end + 1);
}
const sandbox = { h: fakeH, document: fakeDocument };
const makeAccordion = vm.runInNewContext(
  factorySrc + "\n;makeAccordion;", sandbox);
ok("factory evaluates against the fake DOM",
  typeof makeAccordion === "function");

if (typeof makeAccordion === "function") {
  const stack = new FakeEl("div");
  const acc = makeAccordion(stack);
  const bold = fakeH("b", null, "unwanted");
  const sA = acc.section("sf-sec-a", "sf-btn-green", "Alpha");
  const sB = acc.section("sf-sec-b", "sf-btn-blue", "Bravo");
  const sP = acc.section("sf-sec-pid", "sf-btn-blue",
    ["Not Spam but still ", bold, "?"]);

  ok("stack children interleave toggle,panel in creation order",
    stack.children.length === 6 &&
    stack.children[0] === sA.toggle && stack.children[1] === sA.panel &&
    stack.children[2] === sB.toggle && stack.children[3] === sB.panel &&
    stack.children[4] === sP.toggle && stack.children[5] === sP.panel);
  ok("all sections start collapsed",
    [sA, sB, sP].every(function (s) {
      return s.panel.style.display === "none" &&
        s.toggle.getAttribute("aria-expanded") === "false";
    }));
  ok("toggle ids/aria-controls wire to their panels",
    sA.toggle.getAttribute("aria-controls") === "sf-sec-a-panel" &&
    sA.panel.attrs.id === "sf-sec-a-panel");
  ok("array label renders caret + text + bold element + text, in order",
    sP.toggle.textContent === "\u25B8Not Spam but still unwanted?" &&
    sP.toggle.children[2] === bold);

  sB.toggle.click();
  ok("clicking a toggle opens only that section",
    sB.panel.style.display === "" && sA.panel.style.display === "none" &&
    sP.panel.style.display === "none" &&
    sB.toggle.getAttribute("aria-expanded") === "true");
  ok("open section's caret flips to \u25BE",
    sB.toggle.children[0].textContent === "\u25BE" &&
    sA.toggle.children[0].textContent === "\u25B8");
  sP.toggle.click();
  ok("opening another section closes the first (one-open)",
    sP.panel.style.display === "" && sB.panel.style.display === "none" &&
    sB.toggle.getAttribute("aria-expanded") === "false");
  sP.toggle.click();
  ok("clicking the open section's toggle closes it",
    sP.panel.style.display === "none" &&
    sP.toggle.getAttribute("aria-expanded") === "false");

  const stack2 = new FakeEl("div");
  const acc2 = makeAccordion(stack2);
  const fresh = acc2.section("sf-sec-x", "sf-btn-green", "Fresh");
  ok("a fresh accordion starts all-collapsed (panel reset)",
    fresh.panel.style.display === "none" &&
    fresh.toggle.getAttribute("aria-expanded") === "false");
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
