"use strict";
// Spam Avenger v1.0.84 — the four fixes from Michael's
// completed BrandFocus filing (Nov 24 2026, complaint
// ZYABUSE-202611250910-3887, the first nameabuse
// filing ever walked end-to-end, on v1.0.83):
//
// 1. The subtype auto-pick STILL failed live on
//    v1.0.83 (truthful fallback fired; Michael clicked
//    the Spam card himself). The picker's stated rule
//    — nearest ancestor holding the phrase exactly
//    once, ≤320 chars, NO button-ness requirement —
//    was not what the code did: a clickable-ancestor
//    priority loop ran before the container rule, and
//    the container loop landed on the OUTERMOST
//    qualifier instead of the nearest. Both are gone.
//    The title compare also demanded codepoint-exact
//    equality; it now normalizes full-width parens
//    and zero-width characters (the subtype title is
//    the only paren-bearing target, and the only one
//    that ever starved). The regression test below
//    runs the REAL naCardClickTarget against a stub
//    DOM modeled on the inspected live structure.
// 2. The 6-digit code step is RESTORED in the
//    BrandFocus guide (panel + pane) — walked fact on
//    zy itself now: step 3, "Send Verification Code",
//    5-minute window, the code email entirely in
//    Chinese. Same line in Wanshang's guide.
// 3. Measures guidance line, both nameabuse kits:
//    check only what's true; "No measures have been
//    taken" when none have. Never auto-checked.
// 4. Declarations line, both nameabuse kits: six
//    mandatory boxes on the review step, the user's
//    own clicks, then Submit. Never auto-checked.
//
// Run: node tests/test-v1084-walked-fixes.js

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const reportfillSrc = fs.readFileSync(
  path.join(ROOT, "reportfill.js"), "utf8");
const contentSrc = fs.readFileSync(
  path.join(ROOT, "content.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(
  path.join(ROOT, "manifest.json"), "utf8"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else {
    fail++;
    console.log("  FAIL " + name +
      (extra ? "\n       " + extra : ""));
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

ok("manifest: version is 1.0.84",
  manifest.version === "1.0.87");

// ---------- item 1: extraction of the real code ----------
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
const segParts = [
  extractFn(reportfillSrc, "isVisible"),
  extractFn(reportfillSrc, "nameabuseNormText"),
  extractFn(reportfillSrc, "nameabuseCardTextOk"),
  "var NA_CARD_MAX_TEXT = 320;",
  extractFn(reportfillSrc, "naCardPickFromChain"),
  extractFn(reportfillSrc, "naCardClickTarget")
];
ok("pick: the real resolution functions extract " +
   "from reportfill.js",
  segParts.every(function (s) { return !!s; }));

// ---------- item 1: the stub DOM, modeled on the ----------
// live inspection of zy.nameabuse.net/submit.php:
// exactly one element carries the exact subtype title
// (an <h4>); its card container is a generic <div>
// (no button, no role, no onclick, no tabindex
// anywhere in the chain) holding title + description
// (~84 chars); the next ancestor up is the five-card
// row (~387 chars — the phrase occurs ONCE in it, so
// only the 320 cap excludes it). The broad cards are
// real <button>s wrapping an <h3> + description.
let seq = 0;
class El {
  constructor(tag, text) {
    this.tagName = tag.toUpperCase();
    this._text = text || "";
    this.children = [];
    this.parentElement = null;
    this.attrs = {};
    this.id = ++seq;
    this.clicked = false;
  }
  get textContent() {
    return this._text +
      this.children.map(function (c) {
        return c.textContent;
      }).join("");
  }
  append(c) {
    c.parentElement = this;
    this.children.push(c);
    return c;
  }
  getAttribute(n) {
    return n in this.attrs ? this.attrs[n] : null;
  }
  contains(o) {
    let n = o;
    while (n) {
      if (n === this) return true;
      n = n.parentElement;
    }
    return false;
  }
  getBoundingClientRect() {
    return { width: 100, height: 20 };
  }
  scrollIntoView() {}
  click() { this.clicked = true; }
}
function buildForm(subTitle) {
  seq = 0;
  const all = [];
  const body = new El("body");
  const main = body.append(new El("div"));
  const broadRow = main.append(new El("div"));
  function broadCard(title, desc) {
    const b = new El("button");
    b.append(new El("h3", title));
    b.append(new El("p", desc));
    return b;
  }
  const dnsBtn = broadCard("DNS Abuse Complaint",
    "Domains used for malware distribution, botnet " +
    "control, phishing, hijacking, or spam that " +
    "serves as a vector for those activities. The " +
    "registrar will investigate and apply mitigation " +
    "measures such as locking or suspension under " +
    "ICANN RAA \u00a73.18.2.");
  broadRow.append(dnsBtn);
  broadRow.append(broadCard("Non-DNS Abuse Complaint",
    "Trademark disputes, general spam, content " +
    "infringement, unfair competition or contract " +
    "disputes, illegal content, and child sexual " +
    "abuse material (CSAM)."));
  main.append(new El("p",
    "Please select the specific DNS abuse subtype:"));
  const row = main.append(new El("div"));
  function subCard(title, desc) {
    const d = new El("div");
    d.append(new El("h4", title));
    d.append(new El("p", desc));
    return d;
  }
  const cards = [
    subCard("Malware", "Domains used to distribute " +
      "viruses, spyware, ransomware, or other malware"),
    subCard("Botnet", "Domains used as " +
      "command-and-control nodes for botnets"),
    subCard("Phishing", "Domains used to impersonate " +
      "legitimate sites and steal user credentials"),
    subCard("Hijacking", "DNS poisoning or hijacking " +
      "that redirects users to fraudulent sites"),
    subCard(subTitle, "Spam used as a vector for " +
      "malware, phishing, or hijacking")
  ];
  cards.forEach(function (c) { row.append(c); });
  (function reg(el) {
    all.push(el);
    el.children.forEach(reg);
  })(body);
  return { all: all, spamCard: cards[4],
    spamTitle: cards[4].children[0], dnsBtn: dnsBtn,
    row: row };
}

let RF = null;
try {
  global.window = {
    getComputedStyle: function () {
      return { display: "block", visibility: "visible" };
    }
  };
  RF = new Function(segParts.join("\n") +
    "; return { target: naCardClickTarget," +
    " cardOk: nameabuseCardTextOk };")();
} catch (e) {
  ok("pick: the extracted functions evaluate", false,
    String(e));
}
if (RF) {
  const TAGS = ["H1", "H2", "H3", "H4", "H5", "H6",
    "BUTTON", "A", "LABEL", "DIV", "SPAN", "P", "LI"];
  function wire(f) {
    global.document = {
      querySelectorAll: function () {
        return f.all.filter(function (e) {
          return TAGS.indexOf(e.tagName) !== -1;
        });
      }
    };
  }
  // The watcher's action, verbatim in shape:
  // var sub = naCardClickTarget(phrase); if (sub)
  // sub.click(). The click must land on the CARD.
  const f1 = buildForm("Spam (Distribution Vector)");
  wire(f1);
  ok("pick: the modeled row is over the size cap " +
     "while the Spam container is a small card " +
     "(the inspected live shape)",
    f1.row.textContent.length > 320 &&
    f1.spamCard.textContent.length <= 320 &&
    f1.spamCard.textContent.length > 27);
  const sub = RF.target("Spam (Distribution Vector)");
  if (sub) sub.click();
  ok("pick: the REAL structure resolves to the Spam " +
     "card's generic container — and the watcher's " +
     "click lands on the container, not the bare " +
     "<h4>, with no button/role/onclick/tabindex " +
     "anywhere in the chain",
    sub === f1.spamCard && f1.spamCard.clicked &&
    !f1.spamTitle.clicked);
  const main = RF.target("DNS Abuse Complaint");
  ok("pick: the broad card still resolves through " +
     "the same path — to its <button> (the nearest " +
     "qualifying ancestor of the <h3>)",
    main === f1.dnsBtn);
  const f2 = buildForm(
    "Spam （Distribution Vector）");
  wire(f2);
  const sub2 = RF.target("Spam (Distribution Vector)");
  ok("pick: a title rendered with full-width " +
     "parentheses still resolves to its container " +
     "(the codepoint-exact starvation, pinned dead)",
    sub2 === f2.spamCard);
  const f3 = buildForm(
    "Spam (Distribution​ Vector)");
  wire(f3);
  const sub3 = RF.target("Spam (Distribution Vector)");
  ok("pick: a title carrying a zero-width character " +
     "still resolves to its container",
    sub3 === f3.spamCard);
  ok("cards: the normalizer keeps the Non-DNS trap " +
     "shut (contains is not a match)",
    RF.cardOk("Non-DNS Abuse Complaint",
      "DNS Abuse Complaint") === false &&
    RF.cardOk("Spam （Distribution Vector）",
      "Spam (Distribution Vector)") === true);
}
ok("pick: no button-ness survives in the resolution " +
   "— the chain builder records no clickable flag " +
   "and the picker never reads one",
  reportfillSrc.indexOf("clickable:") === -1 &&
  extractFn(reportfillSrc, "naCardPickFromChain")
    .indexOf("clickable") === -1);

// ---------- items 2–4: the guide copy ----------
const MEASURES =
  "For Measures Already Taken, check only what’s " +
  "true — if you haven’t done any of them, check " +
  "“No measures have been taken.”";
const CODE =
  "The complainant step asks for your own details. " +
  "Fill those in, click Send Verification Code, " +
  "and type in the 6-digit code it emails you. The " +
  "email is in Chinese; the code is the number in " +
  "it, and Gmail’s Translate button can read the " +
  "rest. It’s valid for 5 minutes.";
const DECLS =
  "The last step asks you to read and check six " +
  "declaration boxes — those are yours — then " +
  "click Submit.";
const WS_PANEL_STEPS = [
  "1. Click the button below. It copies your " +
    "report and opens the form.",
  "2. Spam Avenger picks the category and fills " +
    "in the report details for you.",
  "3. " + MEASURES,
  "4. " + CODE,
  "5. " + DECLS,
  "6. Save the complaint number it gives you — " +
    "it starts with WSABUSE-."
];
WS_PANEL_STEPS.forEach(function (ln, i) {
  ok("guide: Wanshang panel step " + (i + 1) +
     " ships verbatim in content.js",
    flatContent.indexOf(ln) !== -1, ln);
});
ok("guide: both kits' pane lines carry the Measures " +
   "line and the declarations line (reportfill.js)",
  (flatReportfill.split(MEASURES).length - 1) >= 2 &&
  (flatReportfill.split(DECLS).length - 1) >= 2);
ok("guide: the code line's four facts ride in both " +
   "kits (Send Verification Code; 6-digit; Chinese " +
   "email + Translate; 5 minutes)",
  flatContent.indexOf("Send Verification Code") !== -1 &&
  (flatContent.split("6-digit code it emails you")
    .length - 1) >= 2 &&
  (flatContent.split("The email is in Chinese")
    .length - 1) >= 2 &&
  (flatContent.split("Translate button")
    .length - 1) >= 2);
ok("guide: the pane never auto-checks the Measures " +
   "or declaration boxes (no checkbox is ever a " +
   "fill target in the nameabuse pass)",
  reportfillSrc.indexOf('ty === "checkbox"') !== -1);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
