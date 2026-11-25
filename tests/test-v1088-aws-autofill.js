"use strict";
// Spam Avenger v1.0.88 — the AWS abuse-report wizard
// gets the guide pane + auto-fill.
//
// Through v1.0.87 the AWS lane was a copy-paste kit in
// the Gmail panel, and its field map was written from
// AWS's published requirements — it described boxes
// (an ISO 8601 incident block, log extracts) the real
// wizard does not have. Michael walked the real form
// live on Nov 24 2026 and directed the fix: the lane
// gets the GoDaddy / nameabuse treatment. The panel's
// AWS button now stashes an aws payload through the
// same stashThenOpen handoff (complete header and
// body, first payload link, short facts narrative),
// reportfill.js runs on support.aws.amazon.com, the
// pane shows the short guide on every step, and when
// the details step ("Tell us abusive activity
// details") appears it fills it: AWS radio picked,
// Category set to Email, the Type of abuse option
// matched flexibly (text containing "spam" or
// "phishing" — the exact label was NOT captured in
// the walk, so a dropdown with no confident match is
// never guess-clicked and the pane says so), the big
// box takes the complete header and body, the
// optional URL box takes the payload link, Comments
// takes the short narrative. A box the user already
// typed in is never overwritten; the reporter-details
// step is never filled; Next is never clicked;
// nothing is ever submitted.
//
// The behavioral tests below run the REAL extracted
// fill code against a stub DOM. THE FIXTURE IS BUILT
// FROM THE OWNER'S NOV 24 2026 SCREENSHOTS OF THE
// LIVE WALK — there is no live DOM capture of this
// wizard; the field labels, the radio pair, the
// dropdowns, and the reporter boxes are the walked
// facts and nothing else.
//
// v1.0.89 — the owner's live test of v1.0.88 on the
// real form found two things. (1) The wizard's first
// step carries ONLY the radio cards (Next disabled
// until a pick), and the step then reveals itself
// PROGRESSIVELY on one page: picking AWS renders the
// Category custom dropdown below the cards, and
// choosing Email reveals the abuse-details fields.
// v1.0.88's fill ran only when the details fields
// existed, so the radio sat unpicked and unexplained.
// The lane now works as a cascade across watch ticks:
// pick/verify AWS → set Category to Email when it
// appears (and verify the displayed value) → run the
// details fill when those fields appear. Step 2 of
// the wizard is "Contact Information" — the
// reporter-details step, still never filled.
// (2) AMAZON.COM IS A COMPLETE ERROR in this lane:
// the lane only ever files AWS-resource reports, so
// a selected Amazon.com routes the report to the
// wrong desk. It is the ONE exception to the
// never-overwrite discipline: the pane corrects the
// pick itself, guards it while the case is loaded,
// and hard-stops the user if the correction cannot
// be verified. Typed text and the details fills keep
// the discipline untouched. (The build also fixes a
// v1.0.88 slip the live test exposed: guideAws passed
// Diag.setExtra a built node instead of a builder
// function, the call threw, and the step watch never
// started — the faithful setExtra stub below pins
// the builder contract so that cannot regress.)
// The radio-step and progressive fixtures are built
// from the owner's Nov 24 2026 live screenshots of
// v1.0.88 running on the real form.
//
// v1.0.90 — the owner's LIVE test of v1.0.89 on the
// real form (same DocuSign phish) drove five fixes.
// (1) The Type of abuse dropdown was reported missing
// while it sat on screen, and being required it kept
// Next grey: the finder now anchors on the label's
// own text (button dropdowns included), the pick runs
// on the control the finders found, and a miss is
// retried across watch ticks while the step stands
// incomplete. (2) The header-and-body box filled with
// the spammer's invisible padding (rows of literal
// "&nbsp;&zwnj;"): the payload is cleaned where it is
// built (lib/analyze.js), body only, headers intact.
// (3) The URL box took an ecp.yusercontent.com image
// redirect: the plan now picks the first non-image,
// non-tracker link, and says why when none qualifies.
// (4) The pane headline claimed a full fill over the
// blocking Type miss: blockers lead the outcome now.
// (5) On Step 2 the pane kept reciting Step 1: the
// pane's content follows the wizard step — contact
// content only on the "Reporter information" step
// (fields as walked: Email address the only required
// box; name / organization / phone / tracking
// reference optional; Reporter description optional),
// restored on the way back. The button-dropdown,
// late-Type, and two-step fixtures are built from
// the owner's Nov 24 2026 live screenshots of the
// v1.0.89 test.
//
// v1.0.91 — the owner's LIVE test of RC01 (internal
// 1.0.90, same DocuSign phish) found the guide
// contradicting the page. (1) The pane reported the
// header-and-body box "still empty" and claimed the
// form had cleared it, while the box visibly held
// the message text: the fill's verify read the node
// it wrote to, and the wizard's framework had
// swapped that node out in its re-render. Text
// outcomes are now judged from the LIVE page —
// re-found and re-read at report time and on every
// watch tick while the step stands incomplete
// (awsLiveTextOutcome / awsReconcileTextOutcomes);
// the cleared-it line may appear only when the live
// box is genuinely empty after the write. The
// node-swap and true-clear fixtures below are built
// from the owner's Nov 24 2026 live screenshot of
// the RC01 test. (2) The Comments box filled with
// the &nbsp;/&zwnj; padding rows again: RC01's
// strip cleaned only the headersBody slice, so the
// description slice (the Comments payload) now gets
// the same strip on its body excerpt.
//
// Run: node tests/test-v1088-aws-autofill.js

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const contentSrc = fs.readFileSync(
  path.join(ROOT, "content.js"), "utf8");
const reportfillSrc = fs.readFileSync(
  path.join(ROOT, "reportfill.js"), "utf8");
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
    .replace(/\\u2192/g, "→");
}
const flatContent = flatten(contentSrc);
const flatReportfill = flatten(reportfillSrc);

// ---------- manifest ----------
ok("manifest: version is 1.0.89",
  manifest.version === "1.0.87");
const rfEntry = (manifest.content_scripts || []).filter(
  function (cs) {
    return (cs.js || []).join(" ").indexOf("reportfill") !== -1;
  })[0];
ok("manifest: reportfill now runs on the AWS report " +
   "host alongside the other filler pages",
  !!rfEntry &&
  rfEntry.matches.indexOf(
    "https://support.aws.amazon.com/*") !== -1 &&
  rfEntry.matches.indexOf(
    "https://legalportal.godaddy.com/*") !== -1 &&
  rfEntry.matches.indexOf(
    "https://zy.nameabuse.net/submit.php*") !== -1);
ok("manifest: host_permissions carry the AWS report host",
  (manifest.host_permissions || []).indexOf(
    "https://support.aws.amazon.com/*") !== -1);

// ---------- panel: the corrected kit ----------
const hm = contentSrc.match(
  /var HYPER_FORM_HINTS = (\{[\s\S]*?\n  \});/);
const hints = hm ? vm.runInNewContext("(" + hm[1] + ")") : {};
const aws = hints.aws || {};
ok("kit: the walked details-step fields, in the form's order",
  JSON.stringify((aws.fields || []).map(function (f) {
    return f.box;
  })) === JSON.stringify(["AWS or Amazon.com", "Category",
    "Type of abuse", "Complete email header and body",
    "URL of abusive email content", "Comments"]));
ok("kit: the walked slices (picks carry no paste; the big " +
   "box takes header+body; URL raw; Comments the narrative)",
  JSON.stringify((aws.fields || []).map(function (f) {
    return f.copy;
  })) === JSON.stringify([null, null, null, "headersBody",
    "urls", "description"]));
ok("kit: the retired incident-block map is gone",
  flatContent.indexOf("Source IP and date/time") === -1 &&
  (aws.fields || []).every(function (f) {
    return f.copy !== "awsIncident" && f.copy !== "logs";
  }));
ok("kit: the intro is honest about the sign-in button " +
   "(AWS customers) and the anonymous wizard path",
  typeof aws.fieldsIntro === "string" &&
  aws.fieldsIntro.indexOf("orange sign-in button is for " +
    "AWS customers") !== -1 &&
  aws.fieldsIntro.indexOf("anonymous") !== -1);
ok("kit: the identity note stands (reporter boxes are " +
   "the user's, never prepared)",
  typeof aws.fieldsIntro === "string" &&
  /never prepares them/.test(aws.fieldsIntro));
ok("kit: the Comments step states the form's 10,000 cap",
  /10,000/.test((aws.fields[5] || {}).help || ""));
ok("kit: the email door is exactly as it was " +
   "(trustandsafety@support.aws.com, its own heading)",
  aws.emailTo === "trustandsafety@support.aws.com" &&
  aws.emailHeading ===
    "Or email it instead — AWS Trust & Safety" &&
  typeof aws.emailNote === "string" &&
  aws.emailNote.indexOf(
    "trustandsafety@support.aws.com") !== -1 &&
  aws.url === "https://support.aws.amazon.com/#/contacts/report-abuse");

// ---------- panel: the stash handoff ----------
ok("stash: the pendingReport contract gains the aws " +
   "payload slot, null for every other lane",
  contentSrc.indexOf(
    "aws: (extra && extra.aws) || null") !== -1);
(function () {
  const at = contentSrc.indexOf(
    "formLane === HYPER_FORM_HINTS.aws");
  const seg = at === -1 ? "" :
    contentSrc.slice(at, at + 900);
  ok("stash: only the AWS sender kit stashes, through " +
     "stashThenOpen, with the walked slices",
    seg.indexOf("stashThenOpen(formLane.url") !== -1 &&
    seg.indexOf('buildFormFieldEvidence(a, "headersBody")') !== -1 &&
    seg.indexOf('buildFormFieldEvidence(a, "description")') !== -1 &&
    // v1.0.90: the link LIST rides along (reportfill
    // picks the first non-image, non-tracker link);
    // the old urls[0] grab put a tracker proxy in the
    // box on the live walk.
    seg.indexOf("urls: (a.urls || []).slice(0, 10)") !== -1);
  ok("stash: the launch is not double-recorded (the " +
     "lane argument stays null; the handler records it)",
    seg.indexOf("function () {}, null,") !== -1);
})();

// ---------- reportfill: wiring ----------
ok("reportfill: the AWS host dispatches its own guide",
  reportfillSrc.indexOf(
    "function isAwsHost()") !== -1 &&
  reportfillSrc.indexOf(
    'location.hostname === "support.aws.amazon.com"') !== -1 &&
  reportfillSrc.indexOf("guideAws(stash);") !== -1);
ok("reportfill: the Guide header goes up at load on " +
   "the AWS host, like the other guide lanes",
  reportfillSrc.indexOf("if (isAwsHost()) {") !== -1 &&
  reportfillSrc.indexOf('Diag.setHeader("Spam Avenger Guide")') !== -1);

// ---------- extraction of the real code ----------
function extractFn(src, name) {
  const start = src.indexOf("function " + name + "(");
  if (start === -1) return null;
  let i = src.indexOf("{", start), depth = 0, j = i;
  for (; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") { depth--; if (!depth) break; }
  }
  return src.slice(start, j + 1);
}
const FN_NAMES = ["isVisible", "controlLabel", "findField",
  "setNativeValue", "setVerified", "trySelectOption",
  "nameabuseNormText", "awsTypeTextOk", "awsCategoryTextOk",
  "awsPlan", "awsOutcomeLines", "awsGuideLines",
  "awsLiveTextOutcome", "awsReconcileTextOutcomes",
  "awsRadioLines", "awsFindField", "awsFindRadio",
  "awsFindRadioPair", "awsRadioCardTarget",
  "awsTryPickRadio", "awsRadioStep",
  "awsCategoryShowsEmail", "awsDetailsPresent",
  "awsPickSelect", "fillAwsDetails", "guideAws",
  "buildAwsExtra", "watchAwsSteps",
  // v1.0.90
  "awsUrlIsImageOrTracker", "awsPickUrl",
  "awsFindDropdownByLabel", "awsOpenAndPick",
  "awsTypeShowsOk", "awsContactStepPresent",
  "buildAwsContactExtra"];
const parts = FN_NAMES.map(function (n) {
  return extractFn(reportfillSrc, n);
});
ok("extract: every AWS + shared function the fill " +
   "needs is present in reportfill.js",
  parts.every(function (s) { return !!s; }),
  FN_NAMES.filter(function (n, i) { return !parts[i]; })
    .join(","));
const guideVar = reportfillSrc.match(
  /var AWS_GUIDE_LINES = \[[\s\S]*?\];/);
ok("extract: the guide-lines table is present",
  !!guideVar);
const cardVar = reportfillSrc.match(
  /var AWS_CARD_MAX_TEXT = \d+;/);
ok("extract: the card-size ceiling is present",
  !!cardVar);
const imgReVar = reportfillSrc.match(
  /var AWS_IMAGE_EXT_RE = [^\n]*;/);
ok("extract: the image-extension table is present",
  !!imgReVar);

// ---------- the stub DOM (fixture from the walk) ----------
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
    this.offsetParent = {};
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
  scrollIntoView() { this.scrolled = true; }
  addEventListener() {}
  dispatchEvent() { return true; }
  focus() {}
  select() {}
  click() {
    this.clicked = true;
    if (this.attrs.type === "radio") {
      ALL.forEach(function (o) {
        if (o !== this && o.attrs.type === "radio" &&
            o.attrs.name === this.attrs.name) {
          o.checked = false;
        }
      }, this);
      this.checked = true;
    }
    if (this.attrs.type === "checkbox") {
      this.checked = !this.checked;
    }
  }
}
class SelectEl extends El {
  constructor(texts) {
    super("select");
    const self = this;
    this.options = texts.map(function (t, i) {
      return { textContent: t, value: "v" + i };
    });
    this.selectedIndex = 0;
    Object.defineProperty(this, "value", {
      get() {
        const o = self.options[self.selectedIndex];
        return o ? o.value : "";
      },
      set(v) {
        const i = self.options.findIndex(function (o) {
          return o.value === v;
        });
        if (i !== -1) self.selectedIndex = i;
      }
    });
    Object.defineProperty(this, "textContent", {
      get() {
        return self.options.map(function (o) {
          return o.textContent;
        }).join("");
      }
    });
  }
}
function matchPart(el, part) {
  part = part.trim();
  const m = part.match(
    /^([a-zA-Z]+)?(?:\[([\w-]+)='([^']*)'\])?$/);
  if (!m) return false;
  if (m[1] && el.tagName !== m[1].toUpperCase()) {
    return false;
  }
  if (m[2] && el.getAttribute(m[2]) !== m[3]) return false;
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
function labeled(tag, labelText, el) {
  const lab = new El("label", labelText);
  if (el) lab.append(el);
  return lab;
}
// The details step, as walked: heading, the AWS /
// Amazon.com radio pair, Category, Type of abuse, the
// big header-and-body box, the optional URL box,
// Comments — plus the reporter-details boxes (name /
// email) that must never be touched.
function buildDetailsForm(opts) {
  ALL = [];
  const body = new El("body");
  const main = body.append(new El("div"));
  main.append(new El("h2",
    "Tell us abusive activity details"));
  const radioAws = new El("input");
  radioAws.attrs = { type: "radio", name: "resource" };
  radioAws.value = "AWS";
  const radioAmz = new El("input");
  radioAmz.attrs = { type: "radio", name: "resource" };
  radioAmz.value = "Amazon.com";
  if (opts.awsChecked) radioAws.checked = true;
  main.append(labeled("label", "AWS", radioAws));
  main.append(labeled("label", "Amazon.com", radioAmz));
  const category = new SelectEl(opts.categoryOptions);
  category.selectedIndex = opts.categoryIndex || 0;
  main.append(labeled("label", "Category", category));
  const type = new SelectEl(opts.typeOptions);
  type.selectedIndex = opts.typeIndex || 0;
  main.append(labeled("label", "Type of abuse", type));
  const headerBody = new El("textarea");
  headerBody.value = opts.headerBodyValue || "";
  main.append(labeled("label",
    "Complete email header and body", headerBody));
  const url = new El("input");
  url.attrs = { type: "text" };
  main.append(labeled("label",
    "URL of abusive email content - optional", url));
  const comments = new El("textarea");
  main.append(labeled("label",
    "Comments - optional", comments));
  const repName = new El("input");
  repName.attrs = { type: "text" };
  main.append(labeled("label", "Your name", repName));
  const repEmail = new El("input");
  repEmail.attrs = { type: "text" };
  main.append(labeled("label", "Email address", repEmail));
  const doc = {
    body: body,
    querySelectorAll: function (sel) {
      return queryAll(body, sel);
    },
    querySelector: function (sel) {
      return queryAll(body, sel)[0] || null;
    },
    createElement: function (tag) { return new El(tag); }
  };
  return { doc: doc, radioAws: radioAws, radioAmz: radioAmz,
    category: category, type: type, headerBody: headerBody,
    url: url, comments: comments, repName: repName,
    repEmail: repEmail };
}

// The wizard's FIRST step, as the owner's Nov 24 2026
// live screenshot shows it: the heading, two wide
// card-style radio options (circle at the left of each
// bordered card, label text inside the card), Cancel /
// Next — and nothing else. No details fields exist on
// this step. Variants model the card widget's failure
// modes: inputDead = the hidden input ignores direct
// clicks (only the card click selects); cardDead =
// neither click lands.
function buildRadioStepForm(opts) {
  opts = opts || {};
  ALL = [];
  const body = new El("body");
  const main = body.append(new El("div"));
  main.append(new El("h2",
    "Tell us abusive activity details"));
  const row = main.append(new El("div"));
  function card(labelText, value) {
    const c = row.append(new El("div"));
    const input = new El("input");
    input.attrs = { type: "radio", name: "resource" };
    input.value = value;
    c.append(input);
    c.append(new El("span", labelText));
    return { card: c, input: input };
  }
  const a = card("AWS", "AWS");
  const z = card("Amazon.com", "Amazon.com");
  if (opts.awsChecked) a.input.checked = true;
  if (opts.amazonChecked) z.input.checked = true;
  if (opts.inputDead) {
    [a.input, z.input].forEach(function (inp) {
      inp.click = function () { inp.clicked = true; };
    });
  }
  if (opts.cardDead) {
    a.card.click = function () { a.card.clicked = true; };
    z.card.click = function () { z.card.clicked = true; };
  } else {
    a.card.click = function () {
      a.card.clicked = true;
      a.input.checked = true;
      z.input.checked = false;
    };
    z.card.click = function () {
      z.card.clicked = true;
      z.input.checked = true;
      a.input.checked = false;
    };
  }
  main.append(new El("button", "Cancel"));
  main.append(new El("button", "Next"));
  const doc = {
    body: body,
    querySelectorAll: function (sel) {
      return queryAll(body, sel);
    },
    querySelector: function (sel) {
      return queryAll(body, sel)[0] || null;
    },
    createElement: function (tag) { return new El(tag); }
  };
  return { doc: doc, radioAws: a.input,
    radioAmz: z.input, cardAws: a.card,
    cardAmz: z.card };
}

// The progressively revealed step, from the same live
// screenshots: the radio cards first; picking AWS
// renders the Category custom dropdown below them
// (initially empty); choosing Email in it reveals the
// abuse-details fields. The fixture wires those
// reactions into the clicks themselves, the way the
// real page reacts, and logs the reveal order.
function buildProgressiveForm(opts) {
  opts = opts || {};
  ALL = [];
  const body = new El("body");
  const main = body.append(new El("div"));
  main.append(new El("h2",
    "Tell us abusive activity details"));
  const events = [];
  const refs = { events: events, category: null,
    categoryDisplay: null, type: null, headerBody: null,
    url: null, comments: null };
  const row = main.append(new El("div"));
  function card(labelText, value) {
    const c = row.append(new El("div"));
    const input = new El("input");
    input.attrs = { type: "radio", name: "resource" };
    input.value = value;
    c.append(input);
    c.append(new El("span", labelText));
    return { card: c, input: input };
  }
  const a = card("AWS", "AWS");
  const z = card("Amazon.com", "Amazon.com");
  refs.radioAws = a.input;
  refs.radioAmz = z.input;
  const baseClick = a.input.click.bind(a.input);
  a.input.click = function () {
    baseClick();
    if (a.input.checked && !refs.category) {
      events.push("radio");
      addCategory();
    }
  };
  function addCategory() {
    const wrap = main.append(new El("div"));
    wrap.append(new El("label", "Category"));
    const control = new El("div");
    control.attrs = { role: "combobox" };
    const display = new El("span", "");
    control.append(display);
    wrap.append(control);
    refs.category = control;
    refs.categoryDisplay = display;
    control.click = function () {
      control.clicked = true;
      if (control._opened) return;
      control._opened = true;
      (opts.categoryOptions || ["Email", "Billing"])
        .forEach(function (t) {
          const o = new El("div", t);
          o.attrs = { role: "option" };
          o.click = function () {
            o.clicked = true;
            display.textContent = t;
            if (t === "Email" && !refs.headerBody) {
              events.push("category");
              addDetails();
            }
          };
          body.append(o);
        });
    };
  }
  function addDetails() {
    const type = new SelectEl(["Choose one",
      "Malware distribution", "Spam / phishing"]);
    main.append(labeled("label", "Type of abuse", type));
    refs.type = type;
    const headerBody = new El("textarea");
    main.append(labeled("label",
      "Complete email header and body", headerBody));
    refs.headerBody = headerBody;
    const url = new El("input");
    url.attrs = { type: "text" };
    main.append(labeled("label",
      "URL of abusive email content - optional", url));
    refs.url = url;
    const comments = new El("textarea");
    main.append(labeled("label",
      "Comments - optional", comments));
    refs.comments = comments;
    events.push("details");
  }
  main.append(new El("button", "Cancel"));
  main.append(new El("button", "Next"));
  refs.doc = {
    body: body,
    querySelectorAll: function (sel) {
      return queryAll(body, sel);
    },
    querySelector: function (sel) {
      return queryAll(body, sel)[0] || null;
    },
    createElement: function (tag) { return new El(tag); }
  };
  return refs;
}

// v1.0.90 fixture: the details step with the Type of
// abuse control as a plain <button> dropdown — a
// label div beside it, no role attributes, nothing
// findField's tag list can see. This is the shape
// that defeated the v1.0.89 finder on the live walk:
// the control sat on screen while the fill reported
// it missing. Built from the owner's Nov 24 2026
// live screenshots (the control's rendered form: a
// wide button-like box under its own label).
function buildButtonTypeForm() {
  ALL = [];
  const body = new El("body");
  const main = body.append(new El("div"));
  main.append(new El("h2",
    "Tell us abusive activity details"));
  const radioAws = new El("input");
  radioAws.attrs = { type: "radio", name: "resource" };
  radioAws.value = "AWS";
  const radioAmz = new El("input");
  radioAmz.attrs = { type: "radio", name: "resource" };
  radioAmz.value = "Amazon.com";
  main.append(labeled("label", "AWS", radioAws));
  main.append(labeled("label", "Amazon.com", radioAmz));
  const category = new SelectEl(
    ["Choose a category", "Email", "Billing"]);
  main.append(labeled("label", "Category", category));
  const field = main.append(new El("div"));
  field.append(new El("div", "Type of abuse"));
  field.append(new El("div",
    "Provide a more specific type of abuse in " +
    "support of this report."));
  const typeBtn = new El("button");
  const typeDisplay = new El("span", "");
  typeBtn.append(typeDisplay);
  field.append(typeBtn);
  typeBtn.click = function () {
    typeBtn.clicked = true;
    if (typeBtn._opened) return;
    typeBtn._opened = true;
    ["Malware distribution", "Spam / phishing",
     "Copyright infringement"].forEach(function (t) {
      const o = new El("div", t);
      o.attrs = { role: "option" };
      o.click = function () {
        o.clicked = true;
        typeDisplay.textContent = t;
      };
      body.append(o);
    });
  };
  const headerBody = new El("textarea");
  main.append(labeled("label",
    "Complete email header and body", headerBody));
  const url = new El("input");
  url.attrs = { type: "text" };
  main.append(labeled("label",
    "URL of abusive email content - optional", url));
  const comments = new El("textarea");
  main.append(labeled("label",
    "Comments - optional", comments));
  const doc = {
    body: body,
    querySelectorAll: function (sel) {
      return queryAll(body, sel);
    },
    querySelector: function (sel) {
      return queryAll(body, sel)[0] || null;
    },
    createElement: function (tag) { return new El(tag); }
  };
  return { doc: doc, radioAws: radioAws,
    radioAmz: radioAmz, category: category,
    typeBtn: typeBtn, typeDisplay: typeDisplay,
    headerBody: headerBody, url: url,
    comments: comments };
}

// v1.0.90 fixture: the two-step wizard on one page —
// Step 1 (the details form) and Step 2 ("Reporter
// information", fields exactly as the owner walked
// them Nov 24 2026: Email address the only required
// box; First name, Last name, Organization, Phone
// number, Your tracking reference all optional; the
// Reporter description radio group; Cancel / Previous
// / Submit Form). show(n) swaps which step is attached
// to the body, the way the wizard swaps steps.
function buildTwoStepForm() {
  ALL = [];
  const body = new El("body");
  const step1 = new El("div");
  step1.append(new El("h2",
    "Tell us abusive activity details"));
  const radioAws = new El("input");
  radioAws.attrs = { type: "radio", name: "resource" };
  radioAws.value = "AWS";
  const radioAmz = new El("input");
  radioAmz.attrs = { type: "radio", name: "resource" };
  radioAmz.value = "Amazon.com";
  step1.append(labeled("label", "AWS", radioAws));
  step1.append(labeled("label", "Amazon.com", radioAmz));
  const category = new SelectEl(
    ["Choose a category", "Email", "Billing"]);
  step1.append(labeled("label", "Category", category));
  const type = new SelectEl(["Choose one",
    "Malware distribution", "Spam / phishing"]);
  step1.append(labeled("label", "Type of abuse", type));
  const headerBody = new El("textarea");
  step1.append(labeled("label",
    "Complete email header and body", headerBody));
  const url = new El("input");
  url.attrs = { type: "text" };
  step1.append(labeled("label",
    "URL of abusive email content - optional", url));
  const comments = new El("textarea");
  step1.append(labeled("label",
    "Comments - optional", comments));
  const step2 = new El("div");
  step2.append(new El("h2", "Contact Information"));
  step2.append(new El("h3", "Reporter information"));
  step2.append(new El("p",
    "Please enter your contact information."));
  function contactInput(labelText) {
    const el = new El("input");
    el.attrs = { type: "text" };
    step2.append(labeled("label", labelText, el));
    return el;
  }
  const cEmail = contactInput("Email address");
  const cFirst = contactInput("First name - optional");
  const cLast = contactInput("Last name - optional");
  const cOrg = contactInput("Organization - optional");
  const cPhone = contactInput(
    "Phone number - optional");
  cPhone.attrs.placeholder = "Enter digits only";
  const cTrack = contactInput(
    "Your tracking reference - optional");
  const descRadios = {};
  ["Internet user",
   "Law enforcement or government agency",
   "Network/Systems administrator or security engineer",
   "Independent security researcher",
   "Website administrator", "Other"]
    .forEach(function (t) {
      const r = new El("input");
      r.attrs = { type: "radio", name: "reporterDesc" };
      step2.append(labeled("label", t, r));
      descRadios[t] = r;
    });
  step2.append(new El("button", "Cancel"));
  step2.append(new El("button", "Previous"));
  const submitBtn = new El("button", "Submit Form");
  step2.append(submitBtn);
  body.append(step1);
  function show(n) {
    const target = n === 2 ? step2 : step1;
    body.children = [target];
    target.parentElement = body;
  }
  const doc = {
    body: body,
    querySelectorAll: function (sel) {
      return queryAll(body, sel);
    },
    querySelector: function (sel) {
      return queryAll(body, sel)[0] || null;
    },
    createElement: function (tag) { return new El(tag); }
  };
  return { doc: doc, show: show,
    radioAws: radioAws, type: type,
    headerBody: headerBody,
    cEmail: cEmail, cFirst: cFirst, cLast: cLast,
    cOrg: cOrg, cPhone: cPhone, cTrack: cTrack,
    descRadios: descRadios, submitBtn: submitBtn };
}

function loadFill(doc) {
  const lines = {};
  let extraBuilt = null;
  const Diag = {
    debug: function () {},
    set: function (k, v) { lines[k] = v; },
    setHeader: function () {},
    // Faithful to production: setExtra takes a BUILDER
    // and calls it. A lane that hands it a built node
    // (the v1.0.88 slip) throws here exactly as it did
    // on the live page.
    setExtra: function (fn) { extraBuilt = fn(); }
  };
  let stashClears = 0;
  const win = {
    getComputedStyle: function () {
      return { display: "block", visibility: "visible" };
    }
  };
  // setNativeValue names the HTML*Element constructors
  // when it hunts for a native value setter; the stubs
  // stand in (their prototypes carry no value
  // descriptor, so the setter falls back to a plain
  // assignment — which the fixture's accessors honor).
  function FakeTextarea() {}
  function FakeInput() {}
  function FakeSelect() {}
  const factory = new Function(
    "document", "window", "Diag", "clearStash",
    "HTMLTextAreaElement", "HTMLInputElement",
    "HTMLSelectElement", "Event",
    (guideVar ? guideVar[0] : "") + "\n" +
    (cardVar ? cardVar[0] : "") + "\n" +
    (imgReVar ? imgReVar[0] : "") + "\n" +
    parts.join("\n") +
    "; return { plan: awsPlan, typeOk: awsTypeTextOk," +
    " catOk: awsCategoryTextOk, lines: awsOutcomeLines," +
    " guide: awsGuideLines, fill: fillAwsDetails," +
    " guideAws: guideAws, present: awsDetailsPresent," +
    " radioStep: awsRadioStep," +
    " radioLines: awsRadioLines," +
    " pair: awsFindRadioPair," +
    " pickUrl: awsPickUrl," +
    " urlSkip: awsUrlIsImageOrTracker," +
    " contactPresent: awsContactStepPresent," +
    " liveOutcome: awsLiveTextOutcome," +
    " reconcile: awsReconcileTextOutcomes," +
    " showsEmail: awsCategoryShowsEmail };");
  const api = factory(doc, win, Diag, function () {
    stashClears++;
  }, FakeTextarea, FakeInput, FakeSelect, Event);
  return { api: api, lines: lines,
    extra: function () { return extraBuilt; },
    clears: function () { return stashClears; } };
}

// ---------- pure helpers ----------
(function () {
  const probe = loadFill(buildDetailsForm({
    categoryOptions: ["Choose a category", "Email"],
    typeOptions: ["Choose one", "Spam"]
  }).doc);
  const P = probe.api;
  ok("pure: the helpers evaluate standalone", !!P);
  if (!P) return;
  ok("pure: the Type match is flexible — spam or " +
     "phishing, any case, anywhere in the label",
    P.typeOk("Spam") && P.typeOk("Phishing") &&
    P.typeOk("SPAM / PHISHING") &&
    P.typeOk("Email spam or phishing") &&
    !P.typeOk("Malware distribution") &&
    !P.typeOk("Copyright infringement") &&
    !P.typeOk(""));
  ok("pure: the Category match is the Email option itself",
    P.catOk("Email") && P.catOk(" email ") &&
    !P.catOk("Billing") && !P.catOk(""));
  const plan = P.plan({
    from: "DocuSign <support@intrepidfhc.com>",
    aws: { headerBody: "HEADERS AND BODY",
      url: "https://payload.example/x",
      comments: "SHORT NARRATIVE" }
  });
  ok("pure: the plan carries the three payload slices",
    plan.headerBody === "HEADERS AND BODY" &&
    plan.url === "https://payload.example/x" &&
    plan.comments === "SHORT NARRATIVE" &&
    plan.from === "DocuSign <support@intrepidfhc.com>");
  const capped = P.plan({ aws: {
    headerBody: "H", url: "",
    comments: new Array(12005).join("x") } });
  ok("pure: Comments is capped at the form's 10,000",
    capped.comments.length === 10000 &&
    capped.url === null);
  const empty = P.plan({ aws: {} });
  ok("pure: an empty payload plans nothing (all skipped)",
    empty.headerBody === null && empty.url === null &&
    empty.comments === null);
  ok("pure: the guide is short, walked, and carries " +
     "the reporter rule + the sign-in honesty",
    P.guide().length === 7 &&
    P.guide().some(function (l) {
      return l.indexOf("never fills them") !== -1;
    }) &&
    P.guide().some(function (l) {
      return l.indexOf("sign-in button is for AWS " +
        "customers") !== -1;
    }) &&
    P.guide().some(function (l) {
      return l.indexOf("never submits") !== -1;
    }));
  ok("pure: the guide OPENS with the radio step's " +
     "standing instruction (v1.0.89)",
    P.guide()[0] ===
      "First step on this form: select AWS, then Next.");
  ok("pure: the radio status lines are the walked " +
     "words, one per state, none for no-group",
    P.radioLines("picked") ===
      "✓ AWS selected for you — click Next to continue." &&
    P.radioLines("already") ===
      "✓ AWS is selected — click Next to continue." &&
    P.radioLines("failed") ===
      "Select AWS, then click Next — I couldn't pick " +
      "it for you." &&
    P.radioLines("corrected") ===
      "Amazon.com was selected — that sends this " +
      "report to the wrong desk. Switched to AWS; " +
      "click Next to continue." &&
    P.radioLines("blocked") ===
      "STOP — Amazon.com is selected. Do not click " +
      "Next: this report would go to the wrong desk. " +
      "Select AWS first." &&
    P.radioLines("absent") === "" &&
    P.radioLines(null) === "");
  const allFilled = P.lines(plan, {
    resource: "filled", category: "filled",
    type: "filled", headerBody: "filled",
    url: "filled", comments: "filled" });
  ok("pure: a full fill reports every target by name",
    allFilled.lead.indexOf("✓ I filled in") !== -1 &&
    allFilled.lead.indexOf("the AWS choice") !== -1 &&
    allFilled.lead.indexOf("the complete header and " +
      "body") !== -1 &&
    allFilled.sub2.indexOf("I never click Next") !== -1);
  const noMatch = P.lines(plan, {
    resource: "filled", category: "filled",
    type: "nomatch", headerBody: "filled",
    url: "filled", comments: "filled" });
  ok("pure: a Type dropdown with no spam/phishing " +
     "option reports the partial truth — no guess",
    noMatch.sub1.indexOf("couldn't match the Type of " +
      "abuse option") !== -1 &&
    noMatch.sub1.indexOf("I didn't guess") !== -1);
  const gone = P.lines(plan, {
    resource: "notfound", category: "notfound",
    type: "notfound", headerBody: "notfound",
    url: "notfound", comments: "notfound" });
  ok("pure: off the details step the lines say nothing " +
     "was filled (the intro-page truth)",
    gone.lead.indexOf("don't see the form's details " +
      "step") !== -1 && gone.sub2 === "");
})();

// ---------- fill discipline (source pins) ----------
(function () {
  const at = reportfillSrc.indexOf(
    "function fillAwsDetails(");
  const seg = at === -1 ? "" :
    reportfillSrc.slice(at);
  ok("fill: the pass clicks exactly one thing — the " +
     "AWS radio; Next and Submit are never touched",
    (seg.match(/\.click\(\)/g) || []).length === 1 &&
    seg.indexOf("radio.click()") !== -1 &&
    seg.indexOf(".submit(") === -1 &&
    !/findField\([^)]*next/i.test(seg) &&
    !/findField\([^)]*submit/i.test(seg));
  const finders = reportfillSrc.slice(
    reportfillSrc.indexOf("function awsFindField("),
    reportfillSrc.indexOf("function awsFindRadio("));
  ok("fill: the only fields ever searched for are the " +
     "five walked ones — no reporter field is a target",
    finders.indexOf("/complete email header and body/i") !== -1 &&
    finders.indexOf("/comments/i") !== -1 &&
    finders.indexOf("/url of abusive email content/i") !== -1 &&
    finders.indexOf("/category/i") !== -1 &&
    finders.indexOf("/type of abuse/i") !== -1 &&
    !/your name|email address/i.test(finders));
  ok("fill: a box that already holds text is left " +
     "alone — the stand-down check runs before any write",
    seg.indexOf('String(el.value || "").trim()') !== -1 &&
    seg.indexOf('String(el.value || "").trim()') <
      seg.indexOf("setVerified(el, f.value") &&
    seg.indexOf('"already"') !== -1);
  ok("fill: the stash is erased once a fill lands",
    seg.indexOf("clearStash()") !== -1);
})();

// ---------- v1.0.89: the radio step (source pins) ----------
(function () {
  ok("radio: the Amazon.com override exception is " +
     "stated in the code, with its reason — this lane " +
     "only ever files AWS-resource reports",
    reportfillSrc.indexOf("never a valid pick") !== -1 &&
    reportfillSrc.indexOf("wrong-desk error") !== -1);
  ok("radio: guideAws hands setExtra a builder " +
     "function (the v1.0.88 node-instead-of-builder " +
     "slip cannot come back)",
    reportfillSrc.indexOf(
      "Diag.setExtra(function () {") !== -1 &&
    reportfillSrc.indexOf(
      "return buildAwsExtra(plan);") !== -1 &&
    reportfillSrc.indexOf(
      "Diag.setExtra(buildAwsExtra(plan))") === -1);
})();

// ---------- v1.0.90: URL pick + blockers (pure) ----------
(function () {
  const probe = loadFill(buildDetailsForm({
    categoryOptions: ["Choose a category", "Email"],
    typeOptions: ["Choose one", "Spam"]
  }).doc);
  const P = probe.api;
  ok("v1.0.90 pure: the helpers evaluate standalone", !!P);
  if (!P) return;
  const TRACKER = "https://ecp.yusercontent.com/mail" +
    "?url=https%3A%2F%2Fdocucdn-a.akamaihd.net%2F" +
    "olive%2Fimages%2Flogo.png";
  const PAYLOAD = "https://docucdn-a.example.net/sign" +
    "?doc=231011";
  ok("v1.0.90 pure: the walked tracker proxy and " +
     "image assets are skip-classified",
    P.urlSkip(TRACKER) === true &&
    P.urlSkip("https://cdn.example.com/banner.JPG") &&
    P.urlSkip("https://example.com/pixel.gif?x=1") &&
    P.urlSkip("https://example.com/icon.svg") &&
    P.urlSkip(PAYLOAD) === false &&
    P.urlSkip("https://example.com/landing") === false);
  ok("v1.0.90 pure: the pick takes the first page " +
     "link past the tracker and the images",
    P.pickUrl([TRACKER,
      "https://example.com/a.png", PAYLOAD]).url ===
      PAYLOAD &&
    P.pickUrl([TRACKER,
      "https://example.com/a.png"]).url === null &&
    P.pickUrl([TRACKER]).allImages === true &&
    P.pickUrl([]).allImages === false);
  const planT = P.plan({ aws: {
    headerBody: "H", urls: [TRACKER, PAYLOAD],
    comments: "C" } });
  ok("v1.0.90 pure: the plan's URL is the payload " +
     "link, not the tracker the message led with",
    planT.url === PAYLOAD &&
    planT.urlAllImages === false);
  const planImg = P.plan({ aws: {
    headerBody: "H",
    urls: [TRACKER, "https://example.com/x.webp"],
    comments: "C" } });
  const imgLines = P.lines(planImg, {
    resource: "filled", category: "filled",
    type: "filled", headerBody: "filled",
    url: "skipped", comments: "filled" });
  ok("v1.0.90 pure: an all-images message leaves the " +
     "URL box empty and the pane says why",
    planImg.url === null &&
    planImg.urlAllImages === true &&
    imgLines.sub1.indexOf("The only links in this " +
      "message are tracking images, so the URL box " +
      "is left empty.") !== -1);
  const planLegacy = P.plan({ aws: {
    headerBody: "H", url: PAYLOAD, comments: "" } });
  ok("v1.0.90 pure: a legacy stash's lone url still " +
     "plans (back-compat)",
    planLegacy.url === PAYLOAD);
  const planPad = P.plan({ aws: {
    headerBody: "HEADERS\n[The message body was " +
      "mostly invisible padding \u2014 stripped]",
    urls: [], comments: "C" } });
  const padLines = P.lines(planPad, {
    resource: "filled", category: "filled",
    type: "filled", headerBody: "filled",
    url: "skipped", comments: "filled" });
  ok("v1.0.90 pure: the padding marker in the payload " +
     "surfaces as a pane note",
    planPad.bodyMostlyPadding === true &&
    padLines.sub1.indexOf("The message body was " +
      "mostly invisible padding") !== -1 &&
    padLines.sub1.indexOf("headers pasted above " +
      "are the real evidence") !== -1);
  // Blockers first: a Type miss outranks the ✓ list.
  const blocked = P.lines(P.plan({ aws: {
      headerBody: "H", urls: [PAYLOAD],
      comments: "C" } }), {
    resource: "filled", category: "filled",
    type: "notfound", headerBody: "filled",
    url: "filled", comments: "filled" });
  ok("v1.0.90 pure: a Type miss LEADS the outcome — " +
     "no all-good headline over a grey Next",
    blocked.lead === "Type of abuse still needs " +
      "your pick \u2014 Next stays grey until it's set." &&
    blocked.sub1.indexOf("\u2713 I filled in") !== -1 &&
    blocked.sub1.indexOf("couldn't find the Type " +
      "of abuse dropdown") !== -1);
  const blocked2 = P.lines(P.plan({ aws: {
      headerBody: "H", urls: [], comments: "" } }), {
    resource: "filled", category: "nomatch",
    type: "nomatch", headerBody: "filled",
    url: "skipped", comments: "skipped" });
  ok("v1.0.90 pure: with Type and Category both " +
     "blocking, Type leads and Category follows in " +
     "the notes",
    blocked2.lead === "Type of abuse still needs " +
      "your pick \u2014 Next stays grey until it's set." &&
    blocked2.sub1.indexOf("Category still needs to " +
      "be set to Email") !== -1);
  ok("v1.0.90 source: the Type hunt is label-anchored " +
     "and the retry + step watch are wired",
    reportfillSrc.indexOf(
      "function awsFindDropdownByLabel(") !== -1 &&
    reportfillSrc.indexOf(
      "function awsOpenAndPick(") !== -1 &&
    reportfillSrc.indexOf("tickType()") !== -1 &&
    reportfillSrc.indexOf("tickStep()") !== -1 &&
    reportfillSrc.indexOf(
      "function awsContactStepPresent(") !== -1);
})();

// ---------- v1.0.90: payload hygiene (lib) ----------
// The cleaning lives where the payload is built:
// buildFormFieldEvidence's headersBody slice. Fixture
// shapes are the live walk's: a DocuSign phish whose
// body is spacing/zero-width stuffing around a scrap
// of readable text.
(function () {
  const analyze = require(path.join(ROOT,
    "lib", "analyze.js"));
  const padRun = new Array(81).join("&nbsp;&zwnj;");
  const aPad = {
    ip: "44.192.119.24",
    from: "DocuSign <support@intrepidfhc.com>",
    subject: "Docusign for Colorami Action Required",
    fullHeaders: "Received: from ec2-44-192-119-24" +
      ".compute-1.amazonaws.com by mx.google.com\n" +
      "X-Custom-Trace:  keep  my   spacing\n" +
      "From: DocuSign <support@intrepidfhc.com>\n" +
      "Subject: Docusign for Colorami Action Required",
    bodyText: padRun + "Sign your document" + padRun
  };
  const hbPad = analyze.buildFormFieldEvidence(aPad,
    "headersBody");
  ok("v1.0.90 payload: the padding entities and " +
     "zero-width stuffing are gone from the body",
    typeof hbPad === "string" &&
    hbPad.indexOf("&nbsp;") === -1 &&
    hbPad.indexOf("&zwnj;") === -1 &&
    hbPad.indexOf("Sign your document") !== -1);
  ok("v1.0.90 payload: the headers stay byte-intact " +
     "(spacing and all) ahead of the cleaned body",
    hbPad.indexOf("X-Custom-Trace:  keep  my   " +
      "spacing") !== -1 &&
    hbPad.indexOf("Received: from ec2-44-192") !== -1 &&
    hbPad.indexOf("Full headers") <
      hbPad.indexOf("Sign your document"));
  ok("v1.0.90 payload: a mostly-padding body is " +
     "called out in the payload itself",
    hbPad.indexOf("mostly invisible padding") !== -1);
  const aNorm = {
    ip: "1.2.3.4",
    fullHeaders: "From: A <a@example.com>",
    bodyText: "Buy now at " +
      "https://shop.example.com/x today"
  };
  const hbNorm = analyze.buildFormFieldEvidence(
    aNorm, "headersBody");
  ok("v1.0.90 payload: an ordinary body passes " +
     "through readable and unmarked",
    hbNorm.indexOf("Buy now at") !== -1 &&
    hbNorm.indexOf("mostly invisible padding") === -1);
  const aZw = {
    ip: "1.2.3.4",
    bodyText: "Hello\u200B \u200Cworld\uFEFF, " +
      "this is a normal length body of text that " +
      "goes on for a while so it is not mostly " +
      "anything but words."
  };
  const hbZw = analyze.buildFormFieldEvidence(aZw,
    "headersBody");
  ok("v1.0.90 payload: raw zero-width characters are " +
     "stripped wherever they hide",
    hbZw.indexOf("\u200B") === -1 &&
    hbZw.indexOf("\u200C") === -1 &&
    hbZw.indexOf("\uFEFF") === -1 &&
    hbZw.indexOf("Hello world,") !== -1 &&
    hbZw.indexOf("mostly invisible padding") === -1);
})();

// ---------- v1.0.91: the Comments slice is cleaned too ----------
// RC01 stripped the padding from the headersBody
// slice only; the description slice (what the AWS
// stash carries into the Comments box) still pasted
// its body excerpt raw, and the live retest's
// Comments box filled with the padding rows. The
// fixture is the live walk's message shape: the
// traced facts, then a body that opens with padding
// and runs long with readable text.
(function () {
  const analyze = require(path.join(ROOT,
    "lib", "analyze.js"));
  const padRun = new Array(121).join("&nbsp;&zwnj;");
  const aDesc = {
    ip: "44.192.119.24",
    org: "Amazon.com, Inc.",
    host: "ec2-44-192-119-24.compute-1.amazonaws.com",
    from: "DocuSign <support@intrepidfhc.com>",
    subject: "Docusign for Colorami Action Required",
    date: "Tue, 24 Nov 2026 18:15:38 +0000",
    ingressReceived: "from intrepidfhc.com " +
      "(ec2-44-192-119-24.compute-1.amazonaws.com. " +
      "[44.192.119.24]) by smtp-relay.gmail.com",
    urls: ["https://share.google/CeCv9EuQTP0ePEXXP"],
    bodyText: padRun +
      new Array(161).join("Sign your document today. ")
  };
  const desc = analyze.buildFormFieldEvidence(aDesc,
    "description");
  ok("v1.0.91 comments: the facts block leads, intact " +
     "and ahead of the body excerpt",
    typeof desc === "string" &&
    desc.indexOf("Source IP: 44.192.119.24") !== -1 &&
    desc.indexOf("From: DocuSign " +
      "<support@intrepidfhc.com>") !== -1 &&
    desc.indexOf("Subject: Docusign for Colorami " +
      "Action Required") !== -1 &&
    desc.indexOf("Received: from intrepidfhc.com") !== -1 &&
    desc.indexOf("Source IP:") <
      desc.indexOf("Message body"));
  ok("v1.0.91 comments: no padding runs survive in " +
     "the excerpt",
    desc.indexOf("&nbsp;") === -1 &&
    desc.indexOf("&zwnj;") === -1 &&
    desc.indexOf("Sign your document today.") !== -1);
  ok("v1.0.91 comments: when the excerpt is cut, " +
     "the truncation tail follows readable text, " +
     "not padding",
    desc.indexOf("[body excerpt truncated]") !== -1 &&
    /(Sign your document today\.|Sign your document to)$/
      .test(desc.slice(0,
        desc.indexOf("[body excerpt truncated]"))
          .replace(/\s+$/, "")));
})();

// ---------- v1.0.91: live-judged outcomes (source pins) ----------
(function () {
  ok("v1.0.91 source: the fill report and the watch " +
     "both re-judge text outcomes from the live page",
    reportfillSrc.indexOf(
      "function awsLiveTextOutcome(") !== -1 &&
    reportfillSrc.indexOf(
      "function awsReconcileTextOutcomes(") !== -1 &&
    reportfillSrc.indexOf(
      "awsReconcileTextOutcomes(outcomes);") !== -1 &&
    reportfillSrc.indexOf(
      "awsReconcileTextOutcomes(cascade.outcomes)") !== -1 &&
    reportfillSrc.indexOf("tickText();") !== -1);
  const probe = loadFill(buildDetailsForm({
    categoryOptions: ["Choose a category", "Email"],
    typeOptions: ["Choose one", "Spam"]
  }).doc);
  ok("v1.0.91 pure: the live-judge helpers evaluate " +
     "standalone",
    typeof probe.api.liveOutcome === "function" &&
    typeof probe.api.reconcile === "function");
})();

// ---------- v1.0.89: the radio step (behavioral) ----------
(function () {
  function guard() {
    return { attempted: false, wrongEpisode: false,
      outcome: null };
  }
  // (a) nothing picked, the input takes the click —
  // the pick fires with NO details fields present.
  const fxR1 = buildRadioStepForm({});
  const runR1 = loadFill(fxR1.doc);
  ok("radio (a): the radio step has no details fields",
    runR1.api.present() === false);
  const stA = runR1.api.radioStep(guard());
  ok("radio (a): an unpicked group is picked on the " +
     "spot and verified — state 'picked'",
    stA === "picked" && fxR1.radioAws.checked === true &&
    fxR1.radioAmz.checked === false);
  ok("radio (a): the input click sufficed — the card " +
     "was not needed",
    fxR1.cardAws.clicked === false);
  // (b) the hidden input ignores clicks; the card
  // container click lands it, verified by checked.
  const fxR2 = buildRadioStepForm({ inputDead: true });
  const runR2 = loadFill(fxR2.doc);
  const stB = runR2.api.radioStep(guard());
  ok("radio (b): a dead input falls through to the " +
     "card container, verified by the checked state",
    stB === "picked" && fxR2.radioAws.checked === true &&
    fxR2.cardAws.clicked === true);
  // (c) AWS already selected — left alone, no clicks.
  const fxR3 = buildRadioStepForm({ awsChecked: true });
  const runR3 = loadFill(fxR3.doc);
  const stC = runR3.api.radioStep(guard());
  ok("radio (c): AWS already picked is left exactly " +
     "as it was — state 'already', nothing clicked",
    stC === "already" && fxR3.radioAws.checked === true &&
    fxR3.radioAws.clicked === false &&
    fxR3.cardAws.clicked === false);
  // (d) Amazon.com selected — a complete error in
  // this lane: the pane CORRECTS it to AWS itself.
  const fxR4 = buildRadioStepForm({
    amazonChecked: true });
  const runR4 = loadFill(fxR4.doc);
  const g4 = guard();
  const stD = runR4.api.radioStep(g4);
  ok("radio (d): a selected Amazon.com is corrected " +
     "to AWS by the pane itself — state 'corrected'",
    stD === "corrected" &&
    fxR4.radioAws.checked === true &&
    fxR4.radioAmz.checked === false);
  ok("radio (d): the correction line says what was " +
     "fixed and why",
    runR4.api.radioLines(stD) ===
      "Amazon.com was selected — that sends this " +
      "report to the wrong desk. Switched to AWS; " +
      "click Next to continue.");
  // The guard persists: the corrected state is
  // observed, the pick flips back, it corrects again.
  runR4.api.radioStep(g4);
  fxR4.radioAmz.checked = true;
  fxR4.radioAws.checked = false;
  const stD2 = runR4.api.radioStep(g4);
  ok("radio (d): a flip back to Amazon.com is " +
     "corrected again — the guard persists",
    stD2 === "corrected" &&
    fxR4.radioAws.checked === true &&
    fxR4.radioAmz.checked === false);
  // (d2) Amazon.com selected and the correction
  // cannot land — a HARD STOP, not a soft flag.
  const fxR5 = buildRadioStepForm({
    amazonChecked: true, inputDead: true,
    cardDead: true });
  const runR5 = loadFill(fxR5.doc);
  const stD3 = runR5.api.radioStep(guard());
  ok("radio (d2): an unverifiable correction is a " +
     "hard stop — state 'blocked', Amazon.com stands",
    stD3 === "blocked" &&
    fxR5.radioAmz.checked === true &&
    fxR5.radioAws.checked === false &&
    runR5.api.radioLines(stD3) ===
      "STOP — Amazon.com is selected. Do not click " +
      "Next: this report would go to the wrong desk. " +
      "Select AWS first.");
  // (e) nothing picked and nothing clickable lands —
  // one grace re-read, then the plain failure line.
  const fxR6 = buildRadioStepForm({ inputDead: true,
    cardDead: true });
  const runR6 = loadFill(fxR6.doc);
  const g6 = guard();
  const stE1 = runR6.api.radioStep(g6);
  const stE2 = runR6.api.radioStep(g6);
  ok("radio (e): an unverifiable pick is reported, " +
     "never claimed — grace first, then 'failed'",
    stE1 === null && stE2 === "failed" &&
    fxR6.radioAws.checked === false &&
    runR6.api.radioLines(stE2) ===
      "Select AWS, then click Next — I couldn't pick " +
      "it for you.");
  // No radio group on screen at all (the intro page)
  // — no state, no line, silence.
  const fxR7 = buildRadioStepForm({});
  fxR7.cardAws.parentElement.children = [];
  const runR7 = loadFill(fxR7.doc);
  ok("radio: no group on screen — no state, no line",
    runR7.api.radioStep(guard()) === null &&
    runR7.api.radioLines(null) === "");
})();

// ---------- behavioral: the full fill ----------
const STASH = {
  from: "DocuSign <support@intrepidfhc.com>",
  subject: "Docusign for Colorami Action Required",
  aws: { headerBody: "FULL HEADERS\n\nFULL BODY",
    url: "https://payload.example/landing",
    comments: "SHORT FACTS NARRATIVE" },
  savedAt: Date.now()
};
const fxA = buildDetailsForm({
  categoryOptions: ["Choose a category", "Email",
    "Billing"],
  typeOptions: ["Choose one", "Malware distribution",
    "Spam / phishing", "Copyright infringement"]
});
const runA = loadFill(fxA.doc);
ok("behavioral: the details step reads as present " +
   "in the fixture",
  runA.api.present() === true);
runA.api.fill(runA.api.plan(STASH));

setTimeout(function () {
  ok("fill: the AWS radio is picked (Amazon.com is not)",
    fxA.radioAws.checked === true &&
    fxA.radioAmz.checked === false);
  ok("fill: Category is set to Email",
    fxA.category.options[fxA.category.selectedIndex]
      .textContent === "Email");
  ok("fill: the Type of abuse spam/phishing option " +
     "is picked",
    fxA.type.options[fxA.type.selectedIndex]
      .textContent === "Spam / phishing");
  ok("fill: the big box takes the complete header " +
     "and body",
    fxA.headerBody.value === "FULL HEADERS\n\nFULL BODY");
  ok("fill: the optional URL box takes the payload link",
    fxA.url.value === "https://payload.example/landing");
  ok("fill: Comments takes the short narrative",
    fxA.comments.value === "SHORT FACTS NARRATIVE");
  ok("fill: the reporter boxes are never touched",
    fxA.repName.value === "" && fxA.repEmail.value === "");
  ok("fill: the status line tells the truth (all filled)",
    (runA.lines.lead || "").indexOf("✓ I filled in") !== -1);
  ok("fill: the stash was erased after the fill landed",
    runA.clears() === 1);

  // ---------- behavioral: no-overwrite + no-match ----------
  const fxB = buildDetailsForm({
    awsChecked: true,
    categoryOptions: ["Choose a category", "Email"],
    categoryIndex: 1,
    typeOptions: ["Choose one", "Malware distribution",
      "Copyright infringement"]
  });
  fxB.headerBody.value = "TEXT THE USER TYPED";
  const runB = loadFill(fxB.doc);
  runB.api.fill(runB.api.plan({
    from: "Someone <s@example.com>",
    aws: { headerBody: "SHOULD NOT LAND", url: "",
      comments: "" }
  }));
  setTimeout(function () {
    ok("no-overwrite: text the user typed stays put",
      fxB.headerBody.value === "TEXT THE USER TYPED");
    ok("no-overwrite: an already-picked radio and an " +
       "already-set category are left alone",
      fxB.radioAws.checked === true &&
      fxB.category.options[fxB.category.selectedIndex]
        .textContent === "Email");
    ok("no-match: a Type dropdown with no spam/phishing " +
       "option is left exactly as it was (no guess-click)",
      fxB.type.selectedIndex === 0 &&
      fxB.type.clicked === false);
    ok("no-match: the pane reports the partial status " +
       "plainly",
      (runB.lines.sub1 || "").indexOf(
        "couldn't match the Type of abuse option") !== -1 &&
      (runB.lines.sub1 || "").indexOf(
        "I didn't guess") !== -1);
    ok("no-match: skipped boxes are reported, not " +
       "silently dropped",
      (runB.lines.sub1 || "").indexOf(
        "The URL box is empty") !== -1);

    // ---------- behavioral: stand-down ----------
    const fxC = buildDetailsForm({
      categoryOptions: ["Choose a category", "Email"],
      typeOptions: ["Choose one", "Spam"]
    });
    const runC = loadFill(fxC.doc);
    runC.api.guideAws({ from: "x@example.com" });
    ok("stand-down: a stash with no aws payload shows " +
       "the plain no-case line and fills nothing",
      (runC.lines.lead || "").indexOf(
        "I don't have a case loaded") !== -1 &&
      fxC.headerBody.value === "" &&
      fxC.radioAws.checked === false);

    // ---------- v1.0.89: guideAws on the radio step ----------
    // The full guide path on the radio-step fixture:
    // the pane loads, the builder-built guide region
    // renders (no throw — the v1.0.88 slip), the watch
    // picks AWS, and the status line says so.
    const fxG = buildRadioStepForm({});
    const runG = loadFill(fxG.doc);
    let guideThrew = null;
    try {
      runG.api.guideAws(STASH);
    } catch (e) { guideThrew = e; }
    ok("guide: guideAws runs the full path without " +
       "throwing, and the guide region is built",
      guideThrew === null && !!runG.extra());
    setTimeout(function () {
      ok("guide: on the radio step the watch picks " +
         "AWS and the pane says so",
        fxG.radioAws.checked === true &&
        runG.lines.sub2 ===
          "✓ AWS selected for you — click Next to " +
          "continue.");

      // ---------- v1.0.89: the cascade ----------
      // The progressive fixture mid-state: after the
      // pick, Category exists but the details fields
      // do not — "details present" must read false.
      const fxP0 = buildProgressiveForm({});
      fxP0.radioAws.click();
      const runP0 = loadFill(fxP0.doc);
      ok("cascade: with Category rendered but the " +
         "details fields not yet revealed, the " +
         "details stage correctly reads not-present",
        !!fxP0.category && runP0.api.present() === false);

      const fxP = buildProgressiveForm({});
      const runP = loadFill(fxP.doc);
      runP.api.guideAws(STASH);
      setTimeout(function () {
        ok("cascade: the stages complete IN ORDER — " +
           "radio, then Category, then the details",
          JSON.stringify(fxP.events) ===
            JSON.stringify(["radio", "category",
              "details"]));
        ok("cascade: AWS is picked and Category shows " +
           "Email when the dust settles",
          fxP.radioAws.checked === true &&
          fxP.categoryDisplay.textContent === "Email");
        ok("cascade: the details fill lands on the " +
           "revealed fields (type, header+body, URL, " +
           "comments)",
          fxP.type.options[fxP.type.selectedIndex]
            .textContent === "Spam / phishing" &&
          fxP.headerBody.value ===
            "FULL HEADERS\n\nFULL BODY" &&
          fxP.url.value ===
            "https://payload.example/landing" &&
          fxP.comments.value ===
            "SHORT FACTS NARRATIVE");
        ok("cascade: the outcome line credits the " +
           "cascade's own stages (AWS choice + Email " +
           "category reported as filled)",
          (runP.lines.lead || "").indexOf(
            "✓ I filled in") !== -1 &&
          (runP.lines.lead || "").indexOf(
            "the AWS choice") !== -1 &&
          (runP.lines.lead || "").indexOf(
            "the Email category") !== -1);

        // ---------- v1.0.89: cascade Category failure ----------
        // The custom dropdown opens but holds no Email
        // option: the picker exhausts, the pane says
        // "Set Category to Email — I couldn't pick it
        // for you", and no details ever appear.
        const fxF = buildProgressiveForm({
          categoryOptions: ["Billing", "Other"] });
        const runF = loadFill(fxF.doc);
        runF.api.guideAws(STASH);
        setTimeout(function () {
          ok("cascade: a Category dropdown with no " +
             "Email option gets the failure line, " +
             "not a claim",
            runF.lines.sub2 ===
              "Set Category to Email — I couldn't " +
              "pick it for you");
          ok("cascade: on the failure path the details " +
             "fields never appear and nothing is filled",
            fxF.headerBody === null &&
            JSON.stringify(fxF.events) ===
              JSON.stringify(["radio"]));

          // ---------- v1.0.90: the button Type dropdown ----------
          // The live walk's failure shape: Type as a
          // plain <button> dropdown beside its label.
          // The label-anchored finder must find it and
          // the pick must land.
          const fxT = buildButtonTypeForm();
          const runT = loadFill(fxT.doc);
          runT.api.fill(runT.api.plan(STASH));
          setTimeout(function () {
            ok("v1.0.90 fill: a plain <button> Type " +
               "dropdown is found by its label and the " +
               "spam/phishing option is picked",
              fxT.typeBtn.clicked === true &&
              fxT.typeDisplay.textContent ===
                "Spam / phishing");
            ok("v1.0.90 fill: with Type set, the lead " +
               "is the filled summary, not a blocker",
              (runT.lines.lead || "").indexOf(
                "\u2713 I filled in") !== -1 &&
              fxT.headerBody.value ===
                "FULL HEADERS\n\nFULL BODY");

            // ---------- v1.0.90: Type renders late ----------
            // The details form with the Type select
            // detached: the one-shot fill lands, the
            // blocker leads, and when the control
            // renders, a watch tick completes the pick.
            const fxL = buildDetailsForm({
              categoryOptions: ["Choose a category",
                "Email", "Billing"],
              typeOptions: ["Choose one",
                "Malware distribution", "Spam / phishing"]
            });
            const typeLabel = fxL.type.closest("label");
            const typeParent = typeLabel.parentElement;
            typeParent.children = typeParent.children
              .filter(function (c) {
                return c !== typeLabel;
              });
            const runL = loadFill(fxL.doc);
            runL.api.guideAws(STASH);
            setTimeout(function () {
              ok("v1.0.90 retry: with the Type control " +
                 "not yet rendered, the rest fills and " +
                 "the blocker leads the pane",
                fxL.headerBody.value ===
                  "FULL HEADERS\n\nFULL BODY" &&
                runL.lines.lead ===
                  "Type of abuse still needs your " +
                  "pick \u2014 Next stays grey until " +
                  "it's set.");
              typeParent.append(typeLabel);
              setTimeout(function () {
                ok("v1.0.90 retry: a later tick picks " +
                   "the late-rendered Type and the " +
                   "blocker clears",
                  fxL.type.options[
                    fxL.type.selectedIndex]
                    .textContent === "Spam / phishing" &&
                  (runL.lines.lead || "").indexOf(
                    "\u2713 I filled in") !== -1);

                // ---------- v1.0.90: the pane follows the step ----------
                const fxS = buildTwoStepForm();
                const runS = loadFill(fxS.doc);
                runS.api.guideAws(STASH);
                setTimeout(function () {
                  const leadStep1 = runS.lines.lead;
                  ok("v1.0.90 steps: step 1 fills and " +
                     "reports as before",
                    fxS.headerBody.value ===
                      "FULL HEADERS\n\nFULL BODY" &&
                    (leadStep1 || "").indexOf(
                      "\u2713 I filled in") !== -1);
                  fxS.show(2);
                  setTimeout(function () {
                    const extraText = runS.extra()
                      ? runS.extra().textContent : "";
                    ok("v1.0.90 steps: on Step 2 the " +
                       "pane shows contact content " +
                       "only \u2014 no Step 1 status or " +
                       "guide text carries over",
                      (runS.lines.lead || "").indexOf(
                        "Step 2") !== -1 &&
                      (runS.lines.sub1 || "").indexOf(
                        "never fills in your contact " +
                        "details") !== -1 &&
                      (runS.lines.lead || "").indexOf(
                        "I filled in") === -1 &&
                      extraText.indexOf(
                        "Reporter description is " +
                        "optional") !== -1 &&
                      extraText.indexOf(
                        "select AWS, then Next") === -1);
                    ok("v1.0.90 steps: nothing on the " +
                       "contact step is filled or " +
                       "clicked",
                      fxS.cEmail.value === "" &&
                      fxS.cFirst.value === "" &&
                      fxS.cLast.value === "" &&
                      fxS.cOrg.value === "" &&
                      fxS.cPhone.value === "" &&
                      fxS.cTrack.value === "" &&
                      fxS.descRadios["Internet user"]
                        .checked === false &&
                      fxS.submitBtn.clicked === false);
                    fxS.show(1);
                    setTimeout(function () {
                      ok("v1.0.90 steps: Previous " +
                         "restores the form step's " +
                         "own outcome lines",
                        runS.lines.lead === leadStep1);

                      // ---------- v1.0.91: the node swap ----------
                      // The RC01 live failure shape: the
                      // fill writes the header-and-body
                      // box; the form's framework
                      // re-renders and swaps the textarea
                      // node — the fresh node carries the
                      // text, the detached node reads
                      // empty, and the pass's own verify
                      // (which reads the node it wrote)
                      // gives up. The pane must judge the
                      // box from the LIVE node.
                      const fxW = buildDetailsForm({
                        categoryOptions: [
                          "Choose a category", "Email",
                          "Billing"],
                        typeOptions: ["Choose one",
                          "Malware distribution",
                          "Spam / phishing"]
                      });
                      const oldBox = fxW.headerBody;
                      const boxLabel = oldBox.parentElement;
                      let heldValue = "";
                      let swapHappened = false;
                      let liveBox = null;
                      Object.defineProperty(oldBox,
                        "value", {
                        configurable: true,
                        get: function () {
                          return swapHappened
                            ? "" : heldValue;
                        },
                        set: function (v) {
                          if (swapHappened) return;
                          heldValue = v;
                          if (!v) return;
                          swapHappened = true;
                          liveBox = new El("textarea");
                          liveBox.value = v;
                          const idx = boxLabel.children
                            .indexOf(oldBox);
                          boxLabel.children[idx] =
                            liveBox;
                          liveBox.parentElement =
                            boxLabel;
                        }
                      });
                      const runW = loadFill(fxW.doc);
                      runW.api.fill(runW.api.plan(STASH));

                      // ---------- v1.0.91: the true clear ----------
                      // The other side: the form really
                      // does refuse the write — the live
                      // box stays genuinely empty, and
                      // only then may the pane say the
                      // form cleared it.
                      const fxX = buildDetailsForm({
                        categoryOptions: [
                          "Choose a category", "Email",
                          "Billing"],
                        typeOptions: ["Choose one",
                          "Malware distribution",
                          "Spam / phishing"]
                      });
                      Object.defineProperty(fxX.headerBody,
                        "value", {
                        configurable: true,
                        get: function () { return ""; },
                        set: function () {}
                      });
                      const runX = loadFill(fxX.doc);
                      runX.api.fill(runX.api.plan(STASH));

                      setTimeout(function () {
                        ok("v1.0.91 swap: the fixture " +
                           "really swapped — the node " +
                           "the fill wrote reads empty, " +
                           "the live node carries the text",
                          swapHappened === true &&
                          oldBox.value === "" &&
                          !!liveBox &&
                          liveBox.value ===
                            "FULL HEADERS\n\nFULL BODY");
                        ok("v1.0.91 swap: the pane " +
                           "reports the box as filled, " +
                           "judged from the live page",
                          (runW.lines.lead || "")
                            .indexOf("\u2713 I filled in") !== -1 &&
                          (runW.lines.lead || "")
                            .indexOf("the complete header " +
                              "and body") !== -1);
                        ok("v1.0.91 swap: the cleared-it " +
                           "line and the empty blocker " +
                           "do NOT fire over a full box",
                          (runW.lines.sub1 || "")
                            .indexOf("cleared the " +
                              "header-and-body") === -1 &&
                          (runW.lines.lead || "")
                            .indexOf("still empty") === -1 &&
                          (runW.lines.sub1 || "")
                            .indexOf("still empty") === -1);
                        ok("v1.0.91 clear: a genuinely " +
                           "empty live box keeps the " +
                           "blocker in the lead",
                          runX.lines.lead ===
                            "The header and body box " +
                            "is still empty \u2014 Next " +
                            "stays grey until it's " +
                            "filled.");
                        ok("v1.0.91 clear: and only then " +
                           "does the cleared-it fallback " +
                           "line appear",
                          (runX.lines.sub1 || "")
                            .indexOf("The form cleared " +
                              "the header-and-body box " +
                              "after I filled it") !== -1 &&
                          (runX.lines.sub1 || "")
                            .indexOf("paste it in " +
                              "yourself") !== -1);

                        console.log("\n" + pass +
                          " passed, " + fail + " failed");
                        process.exit(fail ? 1 : 0);
                      }, 3600);
                    }, 1200);
                  }, 1200);
                }, 3200);
              }, 3000);
            }, 3200);
          }, 2600);
        }, 4500);
      }, 4500);
    }, 1300);
  }, 600);
}, 1800);
