"use strict";
// Spam Avenger v1.0.94 — RC05: the Cloudflare guide
// fills the RIGHT box, and the queued version feature
// (header version + click-to-check) rides along.
//
// ITEM 1 — the Cloudflare guide filled the wrong box.
// Michael walked the real form in his own Firefox
// with RC04 (Nov 25 2026): the guide filled Evidence
// URLs correctly and the category landed on Phishing
// & Malware, but the form's REQUIRED evidence field —
// "Logs or other evidence of abuse", below Evidence
// URLs — stood empty and validation-flagged, because
// the guide aimed at the OPTIONAL Comments box
// instead. The walked facts: the form also requires
// name / email / confirm email (the user's own, never
// filled), the DSA certification checkbox and the
// human check (never touched), and the logs field's
// own text warns it may be released to third parties
// such as the Lumen Database. The fix: the guide's
// second fill kind is now "evidence" — the logs box,
// found by label passes shaped so they cannot land
// on Evidence URLs or Comments — filled with the
// lane's prepared evidence payload; Comments is left
// for the user; the pane's status names the URLs box
// and the logs/evidence box truthfully; and the guide
// carries one plain line about the third-party
// sharing. The fill below is DRIVEN against a stub
// DOM whose field set mirrors the walked form.
//
// ITEM 2 — the queued version feature
// (queued-version-check.md, Michael's call Nov 25
// 2026: it rides the next build; no RC of its own).
// (a) A published build (SA_BUILD_LABEL "") renders
// the header as name + plain version — "Spam
// Avenger · 1.0.87", no parentheses, no dangling
// separator; an RC build keeps "Spam Avenger · RCnn
// (x.y.z)". The composition is content.js's pure
// saHeaderText, driven in both modes below.
// (b) The header's version span is clickable: it
// checks the latest release of GitHub repo
// SeraphSheriff/spam-avenger against the running
// version and reports up to date / update available
// (with the browser's store page) / ahead of the
// current release / a quiet couldn't-check. The
// comparison (saVersionCompare / saUpdateVerdict)
// and the store pick (saStoreUrl) are pure and
// driven below, the fetch-failure case included;
// the click wiring is pinned by source shape.
// api.github.com joins host_permissions for the
// lookup (the wildcard already covered it; the
// explicit entry documents the one outside call the
// panel itself makes).
//
// Run: node tests/test-v1094-rc05.js

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const contentSrc = fs.readFileSync(
  path.join(ROOT, "content.js"), "utf8");
const reportfillSrc = fs.readFileSync(
  path.join(ROOT, "reportfill.js"), "utf8");
const cssSrc = fs.readFileSync(
  path.join(ROOT, "panel.css"), "utf8");
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else {
    fail++;
    console.log("  FAIL " + name +
      (extra ? " — " + extra : ""));
  }
}
function flatten(src) {
  return src
    .replace(/"\s*\+\s*\n\s*"/g, "")
    .replace(/\\u201C/g, "“")
    .replace(/\\u201D/g, "”")
    .replace(/\\u2014/g, "—")
    .replace(/\\u2019/g, "’")
    .replace(/\\u26A0/g, "⚠")
    .replace(/\\u2713/g, "✓");
}
const flatReport = flatten(reportfillSrc);

function extractFn(src, name) {
  const start = src.indexOf("function " + name + "(");
  if (start === -1) return null;
  let depth = 0, j = src.indexOf("{", start);
  for (; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") {
      depth--;
      if (!depth) break;
    }
  }
  return src.slice(start, j + 1);
}

// ---------- package identity ----------
ok("manifest: version is 1.0.87 (the publish " +
   "relabel of the RC05 build — internal 1.0.94's " +
   "code under the store version; the relabel is " +
   "packaging, not a code change)",
  manifest.version === "1.0.87");
const labelMatch = contentSrc.match(
  /var SA_BUILD_LABEL = "([^"]*)";/);
ok("label: this package's SA_BUILD_LABEL is \"\" — " +
   "the publish relabel emptied the RC05 tag, so " +
   "the header reads 'Spam Avenger · 1.0.87'",
  !!labelMatch && labelMatch[1] === "");
ok("manifest: host_permissions carry api.github.com " +
   "for the update check (20 in the set)",
  (manifest.host_permissions || []).indexOf(
    "https://api.github.com/*") !== -1 &&
  manifest.host_permissions.length === 20);
const rfEntry = (manifest.content_scripts || []).filter(
  function (cs) {
    return (cs.js || []).join(" ").indexOf("reportfill") !== -1;
  })[0];
ok("manifest: the update-check host is a permission " +
   "only — reportfill does NOT run on api.github.com",
  !!rfEntry && rfEntry.matches.indexOf(
    "https://api.github.com/*") === -1);

// ---------- item 2: the pure header + compare code ----------
const cSandbox = {};
["saHeaderText", "saVersionCompare", "saUpdateVerdict",
 "saStoreUrl"].forEach(function (n) {
  const code = extractFn(contentSrc, n);
  if (code) vm.runInNewContext(code, cSandbox);
});
// saStoreUrl reads the two store constants; hand the
// sandbox the real values from the source.
["SA_AMO_URL", "SA_CHROME_URL"].forEach(function (n) {
  const m = contentSrc.match(new RegExp(
    "var " + n + " =\\s*\"([^\"]+)\""));
  if (m) cSandbox[n] = m[1];
});
ok("extract: the header composer, the version " +
   "compare, the verdict and the store pick are " +
   "present in content.js and load",
  typeof cSandbox.saHeaderText === "function" &&
  typeof cSandbox.saVersionCompare === "function" &&
  typeof cSandbox.saUpdateVerdict === "function" &&
  typeof cSandbox.saStoreUrl === "function");

ok("header: an RC build composes name · tag (version)",
  cSandbox.saHeaderText("RC05", "1.0.94") ===
    "\uD83D\uDEE1\uFE0F Spam Avenger \u00B7 RC05 (1.0.94)");
ok("header: a published build composes name · plain " +
   "version — no parentheses, no dangling separator",
  cSandbox.saHeaderText("", "1.0.87") ===
    "\uD83D\uDEE1\uFE0F Spam Avenger \u00B7 1.0.87");

ok("compare: newer / equal / ahead, numerically " +
   "(1.0.9 < 1.0.10, never lexical)",
  cSandbox.saVersionCompare("1.0.86", "1.0.87") === -1 &&
  cSandbox.saVersionCompare("1.0.87", "1.0.87") === 0 &&
  cSandbox.saVersionCompare("1.0.94", "1.0.87") === 1 &&
  cSandbox.saVersionCompare("1.0.9", "1.0.10") === -1);
ok("compare: the GitHub tag's leading v is ignored " +
   "and missing parts count as 0",
  cSandbox.saVersionCompare("1.0.87", "v1.0.87") === 0 &&
  cSandbox.saVersionCompare("1.0.87", "v1.0.87.0") === 0 &&
  cSandbox.saVersionCompare("1.0.87", "v1.0.88") === -1);
ok("compare: an unparsable side yields null, never " +
   "a guessed ordering",
  cSandbox.saVersionCompare("1.0.87", "garbage") === null &&
  cSandbox.saVersionCompare("", "1.0.87") === null &&
  cSandbox.saVersionCompare("1.0.87", null) === null);

ok("verdict: a newer release is an update",
  cSandbox.saUpdateVerdict("1.0.86", "v1.0.87") === "update");
ok("verdict: the same release is current",
  cSandbox.saUpdateVerdict("1.0.87", "v1.0.87") === "current");
ok("verdict: a running build past the latest " +
   "release is ahead (the test-build case)",
  cSandbox.saUpdateVerdict("1.0.94", "v1.0.87") === "ahead");
ok("verdict: a failed lookup (null / empty / " +
   "garbage tag) is unknown — the pane says " +
   "couldn't-check and claims nothing",
  cSandbox.saUpdateVerdict("1.0.94", null) === "unknown" &&
  cSandbox.saUpdateVerdict("1.0.94", "") === "unknown" &&
  cSandbox.saUpdateVerdict("1.0.94", "garbage") === "unknown");

ok("store pick: a Firefox user agent gets the AMO " +
   "listing, anything else the Chrome Web Store item",
  cSandbox.saStoreUrl("Mozilla/5.0 (Windows NT 10.0; " +
    "Win64; x64; rv:160.0) Gecko/20100101 Firefox/160.0") ===
    "https://addons.mozilla.org/addon/spam-avenger-for-gmail/" &&
  cSandbox.saStoreUrl("Mozilla/5.0 Chrome/140.0") ===
    "https://chromewebstore.google.com/detail/gbgcemlglaifhnomdpckccijdajghoaf" &&
  cSandbox.saStoreUrl("") ===
    "https://chromewebstore.google.com/detail/gbgcemlglaifhnomdpckccijdajghoaf");

ok("wiring: the header renders the name and version " +
   "as two spans whose text joins to saHeaderText's " +
   "output, and the version span carries the click",
  contentSrc.indexOf("var titleSpan = h(\"span\", null,") !== -1 &&
  contentSrc.indexOf("var verSpan = h(\"span\", { \"class\": \"sf-ver\",") !== -1 &&
  contentSrc.indexOf("verSpan.addEventListener(\"click\", function () {") !== -1 &&
  contentSrc.indexOf("runUpdateCheck(updateLine);") !== -1 &&
  contentSrc.indexOf("SA_BUILD_LABEL ? \" (\" + SF_VERSION + \")\"") !== -1 &&
  contentSrc.indexOf(": \" \\u00B7 \" + SF_VERSION);") !== -1);
ok("wiring: the check fetches the repo's latest " +
   "release and reports through saUpdateVerdict",
  contentSrc.indexOf("var SA_RELEASES_API =") !== -1 &&
  contentSrc.indexOf("\"https://api.github.com/repos/SeraphSheriff/spam-avenger/releases/latest\"") !== -1 &&
  contentSrc.indexOf("p = fetch(SA_RELEASES_API, {") !== -1 &&
  contentSrc.indexOf("saUpdateVerdict(SF_VERSION, tag)") !== -1 &&
  flatReport !== null); // (flatten sanity — report read)
ok("wiring: the result lands in a line under the " +
   "header, styled in panel.css, and a failed check " +
   "says so quietly",
  contentSrc.indexOf("{ \"class\": \"sf-update-line\" }") !== -1 &&
  contentSrc.indexOf("Couldn't check for ") !== -1 &&
  cssSrc.indexOf("#spam-avenger-panel .sf-ver") !== -1 &&
  cssSrc.indexOf("#spam-avenger-panel .sf-update-line") !== -1);

// ---------- item 1: the pure guide code ----------
const rSandbox = {};
["cloudflarePlan", "cloudflareGuideLines",
 "cloudflareOutcomeLines"].forEach(function (n) {
  const code = extractFn(reportfillSrc, n);
  if (code) vm.runInNewContext(code, rSandbox);
});
ok("extract: the plan, guide-lines and outcome-lines " +
   "functions are present and load",
  typeof rSandbox.cloudflarePlan === "function" &&
  typeof rSandbox.cloudflareGuideLines === "function" &&
  typeof rSandbox.cloudflareOutcomeLines === "function");

const stash = {
  from: "\"Louis Vuitton\" <mjfwhere@jiuzhicui.com>",
  subject: "[Black Friday 2026 Deals] Luxury Bags",
  urls: ["https://v2.hocnfl.com/56revv2/fvew26fg.html"],
  cloudflare: {
    urls: ["https://v2.hocnfl.com/56revv2/fvew26fg.html",
      "https://v2.hocnfl.com/v2.jpg"],
    comments: "Description slice alone.",
    evidence: "URLs in the message:\n" +
      "https://v2.hocnfl.com/56revv2/fvew26fg.html\n\n" +
      "Description slice alone.",
    category: "phishing",
    domain: "v2.hocnfl.com"
  }
};
const plan = rSandbox.cloudflarePlan(stash);
ok("plan: the logs-box payload is the lane's " +
   "prepared evidence text (the combined payload " +
   "the panel builds)",
  plan.evidenceText === plan.evidence &&
  plan.evidenceText.indexOf("URLs in the message:") === 0);
const planFallback = rSandbox.cloudflarePlan({
  cloudflare: { comments: "Description slice alone." } });
ok("plan: with no combined text the description " +
   "slice alone is the logs-box payload",
  planFallback.evidenceText === "Description slice alone.");

const gl = rSandbox.cloudflareGuideLines(plan);
ok("guide lines: the fills line names the logs-or-" +
   "evidence box as the required field and leaves " +
   "Comments to the user",
  gl.length === 5 &&
  gl[2].indexOf("logs-or-evidence box") !== -1 &&
  gl[2].indexOf("Logs or other evidence of abuse") !== -1 &&
  gl[2].indexOf("required") !== -1 &&
  gl[2].indexOf("Comments box is optional") !== -1 &&
  gl[2].indexOf("never submits") !== -1);
ok("guide lines: the sharing line names the Lumen " +
   "Database and the facts-only reason",
  gl[3].indexOf("Lumen Database") !== -1 &&
  gl[3].indexOf("third parties") !== -1 &&
  gl[3].indexOf("abuse facts only") !== -1 &&
  gl[3].indexOf("never your personal details") !== -1);

let lines = rSandbox.cloudflareOutcomeLines(plan,
  { urls: "filled", evidence: "filled" });
ok("outcomes: a clean fill names BOTH boxes " +
   "truthfully (the RC04 wording claimed a comments " +
   "fill and never mentioned the required box)",
  lines.lead === "I filled the form's URLs box and " +
    "logs/evidence box with the evidence.");
lines = rSandbox.cloudflareOutcomeLines(plan,
  { urls: "user", evidence: "filled" });
ok("outcomes: an evidence-only fill names the " +
   "logs/evidence box alone",
  lines.lead === "I filled the form's logs/evidence " +
    "box with the evidence.");
lines = rSandbox.cloudflareOutcomeLines(plan,
  { urls: "filled", evidence: "user" });
ok("outcomes: a URLs-only fill names the URLs box " +
   "alone",
  lines.lead === "I filled the form's URLs box with " +
    "the evidence.");
lines = rSandbox.cloudflareOutcomeLines(plan,
  { urls: "filled", evidence: "notfound" });
ok("outcomes: a missing logs/evidence box is the " +
   "blocker and names the form's required field",
  lines.lead.indexOf("couldn't find the form's " +
    "logs-or-evidence box") !== -1 &&
  lines.lead.indexOf("the form requires it") !== -1);

// ---------- item 1: the fill, driven on the walked form ----------
// The stub DOM (the AWS suite's harness shape). The
// fixture's field set mirrors Michael's Nov 25 2026
// walk of https://abuse.cloudflare.com/phishing, in
// the form's order: name / email / confirm email,
// the optional Title / Company / Telephone, Evidence
// URLs, Logs or other evidence of abuse (required),
// Comments (optional), the notification checkboxes
// (forward-to-host and forward-to-owner pre-checked,
// the include-my-details boxes unchecked), the DSA
// certification checkbox, and Submit.
let ALL = [];
class El {
  constructor(tag, text) {
    this.tagName = tag.toUpperCase();
    this._text = text || "";
    this.children = [];
    this.parentElement = null;
    this.attrs = {};
    this.style = {};
    this.value = "";
    this.checked = false;
    this.clicked = false;
    ALL.push(this);
  }
  get textContent() {
    return this._text + this.children.map(function (c) {
      return c.textContent;
    }).join("");
  }
  set textContent(v) { this._text = v; this.children = []; }
  append(c) {
    c.parentElement = this;
    this.children.push(c);
    return c;
  }
  appendChild(c) { return this.append(c); }
  getAttribute(n) {
    return n in this.attrs ? this.attrs[n] : null;
  }
  setAttribute(n, v) { this.attrs[n] = v; }
  closest(sel) {
    let n = this;
    while (n) {
      if (sel === "label" && n.tagName === "LABEL") return n;
      n = n.parentElement;
    }
    return null;
  }
  contains(o) {
    let n = o;
    while (n) {
      if (n === this) return true;
      n = n.parentElement;
    }
    return false;
  }
  querySelectorAll(sel) { return queryAll(this, sel); }
  querySelector(sel) {
    return queryAll(this, sel)[0] || null;
  }
  getBoundingClientRect() {
    return { width: 100, height: 20 };
  }
  addEventListener() {}
  dispatchEvent() { return true; }
  focus() {}
  select() {}
  click() { this.clicked = true; }
}
function matchPart(el, part) {
  part = part.trim();
  const m = part.match(
    /^([a-zA-Z]+)?(?:\[([\w-]+)(\*?=)'([^']*)'\])?$/);
  if (!m) return false;
  if (m[1] && el.tagName !== m[1].toUpperCase()) {
    return false;
  }
  if (m[2]) {
    const v = el.getAttribute(m[2]);
    if (v === null) return false;
    if (m[3] === "*=" ? v.indexOf(m[4]) === -1 : v !== m[4]) {
      return false;
    }
  }
  return true;
}
function queryAll(root, sel) {
  const parts = sel.split(",");
  const out = [];
  (function walk(node) {
    node.children.forEach(function (c) {
      if (parts.some(function (p) {
        return matchPart(c, p);
      })) out.push(c);
      walk(c);
    });
  })(root);
  return out;
}
function labeled(labelText, el) {
  const lab = new El("label", labelText);
  if (el) lab.append(el);
  return lab;
}
function buildWalkedForm(opts) {
  opts = opts || {};
  ALL = [];
  const body = new El("body");
  const main = body.append(new El("div"));
  function textInput(label) {
    const el = new El("input");
    el.attrs = { type: "text" };
    main.append(labeled(label, el));
    return el;
  }
  function area(label, placeholder) {
    const el = new El("textarea");
    if (placeholder) {
      el.attrs = { placeholder: placeholder };
    }
    main.append(labeled(label, el));
    return el;
  }
  function check(label, checked) {
    const el = new El("input");
    el.attrs = { type: "checkbox" };
    el.checked = !!checked;
    main.append(labeled(label, el));
    return el;
  }
  const name = textInput("Your full name");
  const email = textInput("Your email address");
  const confirm = textInput("Confirm email address");
  textInput("Title");
  textInput("Company name");
  textInput("Telephone");
  const urls = area("Evidence URLs");
  let logs = null;
  if (!opts.noLogs) {
    logs = area("Logs or other evidence of abuse",
      "Provide a detailed description of the " +
      "infringement, including any necessary access " +
      "details and the exact steps needed to view " +
      "the content.");
    if (opts.logsValue) logs.value = opts.logsValue;
  }
  const comments = area("Comments");
  const fwdHost = check("Please forward my report to " +
    "the website hosting provider.", true);
  const incHost = check("Include my name and contact " +
    "information with the report to the website " +
    "hosting provider.", false);
  const fwdOwner = check("Please forward my report " +
    "to the website owner.", true);
  const dsa = check("DSA certification of bona fide " +
    "belief", false);
  const submit = new El("button", "Submit");
  main.append(submit);
  const doc = {
    body: body,
    querySelectorAll: function (sel) {
      return queryAll(body, sel);
    },
    querySelector: function (sel) {
      return queryAll(body, sel)[0] || null;
    },
    getElementById: function () { return null; },
    createElement: function (tag) { return new El(tag); }
  };
  return { doc: doc, name: name, email: email,
    confirm: confirm, urls: urls, logs: logs,
    comments: comments, fwdHost: fwdHost,
    incHost: incHost, fwdOwner: fwdOwner, dsa: dsa,
    submit: submit };
}

const CF_FN_NAMES = [
  "isVisible", "controlLabel", "setNativeValue",
  "setVerified", "cloudflarePlan", "cfScanFields",
  "cfFindEvidenceBox", "cfFindField", "cfLiveOutcome",
  "cloudflareOutcomeLines", "cfConfirmationPresent",
  "watchCloudflare"];
const cfParts = CF_FN_NAMES.map(function (n) {
  return extractFn(reportfillSrc, n);
});
ok("extract: every Cloudflare fill function the " +
   "drive needs is present in reportfill.js",
  cfParts.every(function (s) { return !!s; }),
  CF_FN_NAMES.filter(function (n, i) {
    return !cfParts[i];
  }).join(","));

function loadFill(doc) {
  const lines = {};
  let clears = 0;
  let tickFn = null;
  const Diag = {
    debug: function () {},
    set: function (k, v) { lines[k] = v; },
    setHeader: function () {},
    setExtra: function (fn) { fn(); }
  };
  const win = {
    getComputedStyle: function () {
      return { display: "block", visibility: "visible" };
    }
  };
  function FakeTextarea() {}
  function FakeInput() {}
  function FakeSelect() {}
  const factory = new Function(
    "document", "window", "Diag", "clearStash",
    "HTMLTextAreaElement", "HTMLInputElement",
    "HTMLSelectElement", "Event", "setTimeout",
    "setInterval", "clearInterval",
    cfParts.join("\n") +
    "; return { plan: cloudflarePlan," +
    " find: cfFindField, outcome: cfLiveOutcome," +
    " watch: watchCloudflare };");
  const api = factory(doc, win, Diag, function () {
    clears++;
  }, FakeTextarea, FakeInput, FakeSelect, Event,
    function (fn) { fn(); return 0; },
    function (fn) { tickFn = fn; return 1; },
    function () {});
  return { api: api, lines: lines,
    tick: function () { if (tickFn) tickFn(); },
    clears: function () { return clears; } };
}

// The finder, on the walked field set.
(function () {
  const f = buildWalkedForm({});
  const L = loadFill(f.doc);
  ok("finder: the URLs kind lands on Evidence URLs",
    L.api.find("urls") === f.urls);
  ok("finder: the evidence kind lands on the Logs " +
     "or other evidence of abuse box — not Evidence " +
     "URLs, not the optional Comments box",
    L.api.find("evidence") === f.logs &&
    L.api.find("evidence") !== f.urls &&
    L.api.find("evidence") !== f.comments);
})();

// The fill itself: both boxes land, everything else
// on the form is exactly as the user left it.
(function () {
  const f = buildWalkedForm({});
  const L = loadFill(f.doc);
  const p = L.api.plan(stash);
  L.api.watch(p);
  L.tick(); L.tick(); L.tick();
  ok("fill: the Evidence URLs box holds the case's " +
     "URLs, one per line",
    f.urls.value === p.urlsText);
  ok("fill: the Logs or other evidence of abuse box " +
     "holds the prepared evidence payload",
    f.logs.value === p.evidenceText &&
    f.logs.value.indexOf("URLs in the message:") === 0);
  ok("fill: the optional Comments box is left for " +
     "the user — empty, untouched",
    f.comments.value === "");
  ok("fill: the reporter's name, email and confirm " +
     "email boxes are never filled",
    f.name.value === "" && f.email.value === "" &&
    f.confirm.value === "");
  ok("fill: nothing on the form was clicked — not " +
     "Submit, not the DSA certification, not a " +
     "notification checkbox — and the walked " +
     "checkbox states stand unchanged",
    !f.submit.clicked && !f.dsa.clicked &&
    !f.fwdHost.clicked && !f.incHost.clicked &&
    !f.fwdOwner.clicked &&
    f.fwdHost.checked === true &&
    f.fwdOwner.checked === true &&
    f.incHost.checked === false &&
    f.dsa.checked === false);
  ok("fill: the pane's settled line names the URLs " +
     "box and the logs/evidence box, and the " +
     "single-use stash was cleared",
    L.lines.lead === "I filled the form's URLs box " +
      "and logs/evidence box with the evidence." &&
    L.clears() >= 1);
})();

// The user's own text in the required box is never
// overwritten.
(function () {
  const f = buildWalkedForm({
    logsValue: "My own words about this site." });
  const L = loadFill(f.doc);
  const p = L.api.plan(stash);
  ok("user text: the live outcome for a box holding " +
     "the user's words is 'user', not a fill target",
    L.api.outcome(p, "evidence") === "user");
  L.api.watch(p);
  L.tick(); L.tick();
  ok("user text: the watch fills the URLs box and " +
     "leaves the user's logs text exactly as typed",
    f.urls.value === p.urlsText &&
    f.logs.value === "My own words about this site." &&
    L.lines.lead === "I filled the form's URLs box " +
      "with the evidence.");
})();

// A form with no logs box: the blocker leads, the
// URLs fill still lands.
(function () {
  const f = buildWalkedForm({ noLogs: true });
  const L = loadFill(f.doc);
  const p = L.api.plan(stash);
  L.api.watch(p);
  L.tick(); L.tick();
  ok("missing box: the pane leads with the " +
     "logs-or-evidence blocker and the URLs fill " +
     "still landed",
    L.lines.lead.indexOf("couldn't find the form's " +
      "logs-or-evidence box") !== -1 &&
    f.urls.value === p.urlsText);
})();

// The finder's later passes, on minimal forms: a
// label carrying the phrase without "logs", and a
// box findable only by its instruction text.
(function () {
  ALL = [];
  const body = new El("body");
  const urls = new El("textarea");
  urls.attrs = { "aria-label": "Evidence URLs" };
  body.append(urls);
  const logs = new El("textarea");
  body.append(labeled("Evidence of abuse", logs));
  const doc = {
    body: body,
    querySelectorAll: function (sel) {
      return queryAll(body, sel);
    },
    querySelector: function (sel) {
      return queryAll(body, sel)[0] || null;
    },
    getElementById: function () { return null; },
    createElement: function (tag) { return new El(tag); }
  };
  const L = loadFill(doc);
  ok("finder pass 2: a label carrying 'evidence of " +
     "abuse' without 'logs' still finds the box",
    L.api.find("evidence") === logs &&
    L.api.find("urls") === urls);
})();
(function () {
  ALL = [];
  const body = new El("body");
  const urls = new El("textarea");
  urls.attrs = { "aria-label": "Evidence URLs" };
  body.append(urls);
  const logs = new El("textarea");
  logs.attrs = { placeholder: "Provide a detailed " +
    "description of the infringement, including any " +
    "necessary access details." };
  body.append(logs);
  const doc = {
    body: body,
    querySelectorAll: function (sel) {
      return queryAll(body, sel);
    },
    querySelector: function (sel) {
      return queryAll(body, sel)[0] || null;
    },
    getElementById: function () { return null; },
    createElement: function (tag) { return new El(tag); }
  };
  const L = loadFill(doc);
  ok("finder pass 3: a box with no usable label is " +
     "found by its own instruction text",
    L.api.find("evidence") === logs);
})();

// ---------- the hard rules, by source ----------
const cfStart = reportfillSrc.indexOf(
  "/* ---------------- Cloudflare abuse form");
const cfSection = cfStart === -1 ? "" :
  reportfillSrc.slice(cfStart);
ok("hard rules: the Cloudflare section still clicks " +
   "nothing at all (no .click() anywhere)",
  cfStart !== -1 && cfSection.indexOf(".click(") === -1);
ok("hard rules: the watch fills only the urls and " +
   "evidence kinds now — the comments kind is gone " +
   "from the fill loop",
  cfSection.indexOf("[\"urls\", \"evidence\"].forEach") !== -1 &&
  cfSection.indexOf("[\"urls\", \"comments\"]") === -1 &&
  cfSection.indexOf("plan.evidenceText") !== -1);
ok("hard rules: the pane's hand-paste fallback " +
   "offers the same evidence payload the fill uses",
  cfSection.indexOf("var text = plan.evidenceText;") !== -1);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
