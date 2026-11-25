"use strict";
// Public 1.0.72 release (internal build .73) — blocked-lane
// notes move to a group at the bottom of the stack
// (queued-blocked-lanes-group.md, Michael's direction
// Nov 8 2026). Field evidence: on a fraud phish with a
// spoofed From, the suppression note rendered mid-stack,
// between the Forward row and the Link host lane — an
// explanation of absence interrupting the list of things
// the user can actually do.
//
// The change: every note that stands in for a blocked
// lane (every placeGateNote output, plus the mail lane's
// two labeled sf-warn stand-ins) is COLLECTED during the
// render and shown as ONE group at the bottom of the
// stack — after the PID section, before the body's
// "Nothing is sent automatically" footer — under a
// separator rule and a bold "Blocked lanes" heading, in
// the order the lanes would have appeared. Labels and
// wording are byte-identical to the in-place versions.
// No blocked lanes → no group, no heading. NOT in the
// group: the sextortion banner, red flags, send-as hints,
// status lines, the repeat-offender note.
//
// Pins:
//  - static: the collector wiring in content.js (both
//    mail warnings route through it, placeGateNote hands
//    its note to it and no longer inserts in place, the
//    group materializes at the end of renderResult), the
//    heading string exists exactly once, panel.css
//    carries the group styles.
//  - behavioral: the collector block is extracted from
//    content.js and driven under a fake DOM — group lands
//    after the PID section with the heading exactly once,
//    two blocked notes keep lane order, a clean render
//    shows no group at all.

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.join(__dirname, "..");
const contentSrc = fs.readFileSync(path.join(ROOT, "content.js"), "utf8");
const cssSrc = fs.readFileSync(path.join(ROOT, "panel.css"), "utf8");
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

ok("manifest version stays 1.0.73", manifest.version === "1.0.84",
  "got " + manifest.version);

// ---------- static wiring ----------
ok("static: the heading is constructed exactly once",
  count(contentSrc,
    'h("p", { "class": "sf-blocked-heading" }, "Blocked lanes")') === 1,
  "got " + count(contentSrc,
    'h("p", { "class": "sf-blocked-heading" }, "Blocked lanes")'));
ok("static: both mail-lane warnings route through the collector",
  count(contentSrc, 'addBlockedNote(h("p", { "class": "sf-warn"') === 2,
  "got " + count(contentSrc, 'addBlockedNote(h("p", { "class": "sf-warn"'));
ok("static: placeGateNote no longer inserts a note in place",
  contentSrc.indexOf("insertBefore(n, pidToggle)") === -1 &&
  contentSrc.indexOf("addBlockedNote(n)") !== -1);
ok("static: the group materializes at the end of renderResult",
  contentSrc.indexOf("blockedGroupLive = true;") !== -1 &&
  contentSrc.indexOf("blockedGroupLive = true;") >
    contentSrc.indexOf('acc.section("sf-sec-pid"'),
  "flip must come after the PID section is built");
ok("static: the group is appended to the stack itself",
  contentSrc.indexOf("stack.appendChild(blockedGroupEl)") !== -1);
ok("static: panel.css carries the group styles",
  cssSrc.indexOf(".sf-blocked-group") !== -1 &&
  cssSrc.indexOf(".sf-blocked-rule") !== -1 &&
  cssSrc.indexOf(".sf-blocked-heading") !== -1);

// ---------- fake DOM (mirrors content.js h / clearEl) ----------
function FakeEl(tag) {
  this.tagName = tag; this.children = []; this.style = {};
  this.className = ""; this.attrs = {}; this.parent = null;
  this._text = "";
}
FakeEl.prototype.appendChild = function (c) {
  if (c.parent) {
    const i = c.parent.children.indexOf(c);
    if (i !== -1) c.parent.children.splice(i, 1);
  }
  c.parent = this; this.children.push(c); return c;
};
FakeEl.prototype.removeChild = function (c) {
  const i = this.children.indexOf(c);
  if (i !== -1) this.children.splice(i, 1);
  if (c.parent === this) c.parent = null;
  return c;
};
FakeEl.prototype.remove = function () {
  if (this.parent) this.parent.removeChild(this);
};
Object.defineProperty(FakeEl.prototype, "firstChild", {
  get: function () { return this.children[0] || null; }
});
FakeEl.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); };
FakeEl.prototype.getAttribute = function (k) { return this.attrs[k]; };
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
function fakeClearEl(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

// Extract the collector block (state + the two functions)
// verbatim from content.js and drive it.
const blockAt = contentSrc.indexOf("var blockedNotes = [];");
let blockSrc = "";
if (blockAt !== -1) {
  const fnAt = contentSrc.indexOf("function addBlockedNote", blockAt);
  let depth = 0, end = -1;
  for (let i = contentSrc.indexOf("{", fnAt); i < contentSrc.length; i++) {
    if (contentSrc[i] === "{") depth++;
    else if (contentSrc[i] === "}") { depth--; if (!depth) { end = i; break; } }
  }
  if (end !== -1) blockSrc = contentSrc.slice(blockAt, end + 1);
}
ok("harness: the collector block was extracted from content.js",
  blockSrc.indexOf("function renderBlockedGroup") !== -1 &&
  blockSrc.indexOf("function addBlockedNote") !== -1);

function freshCollector() {
  const stack = new FakeEl("div");
  const sandbox = {
    h: fakeH, stack: stack, clearEl: fakeClearEl,
    document: fakeDocument
  };
  const api = vm.runInNewContext(blockSrc +
    "\n;({ addBlockedNote: addBlockedNote," +
    " renderBlockedGroup: renderBlockedGroup," +
    " goLive: function () {" +
    " blockedGroupLive = true; renderBlockedGroup(); } });",
    sandbox);
  return { api: api, stack: stack };
}
function noteEl(cls, label, sentence) {
  return fakeH("p", { "class": cls },
    fakeH("b", null, label), " " + sentence);
}

// ---------- clean render: no group, no heading ----------
(function () {
  const c = freshCollector();
  c.stack.appendChild(fakeH("div", { id: "sf-sec-pid-toggle" }));
  c.api.goLive();
  ok("clean render: no group element in the stack",
    !c.stack.children.some(function (el) {
      return el.className === "sf-blocked-group";
    }));
  ok("clean render: no heading text anywhere",
    c.stack.textContent.indexOf("Blocked lanes") === -1);
})();

// ---------- blocked render: group after PID, lane order ----------
(function () {
  const c = freshCollector();
  const pidToggle = fakeH("div", { id: "sf-sec-pid-toggle" });
  const pidPanel = fakeH("div", { id: "sf-sec-pid-panel" });
  c.stack.appendChild(pidToggle);
  c.stack.appendChild(pidPanel);
  // Sync arrival (the mail lane's stand-in) collects only —
  // the group must not materialize mid-render.
  const mailNote = noteEl("sf-warn", "Abuse complaint:",
    "No published abuse contact for this IP. " +
    "Report the links below via Google Safe Browsing instead.");
  c.api.addBlockedNote(mailNote);
  ok("deferred: a mid-render arrival does not materialize the group",
    c.stack.children.length === 2);
  // A second sync-shape arrival: the spoof suppression
  // note, with the lib's exact sentence.
  const spoofNote = noteEl("sf-note", "Website host and Registrar:",
    analyze.SPOOF_DOMAIN_EXPLANATION);
  c.api.addBlockedNote(spoofNote);
  c.api.goLive();
  const group = c.stack.children[c.stack.children.length - 1];
  ok("group: renders as the stack's last child, after the PID section",
    !!group && group.className === "sf-blocked-group" &&
    c.stack.children.indexOf(group) >
      c.stack.children.indexOf(pidPanel));
  ok("group: opens with the separator rule, then the heading",
    !!group && group.children.length === 4 &&
    group.children[0].tagName === "hr" &&
    group.children[0].className === "sf-blocked-rule" &&
    group.children[1].className === "sf-blocked-heading" &&
    group.children[1].textContent === "Blocked lanes");
  ok("group: the heading renders exactly once",
    count(c.stack.textContent, "Blocked lanes") === 1);
  ok("group: two blocked notes keep lane order",
    !!group && group.children[2] === mailNote &&
    group.children[3] === spoofNote);
  ok("group: the suppression note sits inside it, wording byte-identical",
    !!group && group.children[3].textContent ===
      "Website host and Registrar: " +
        analyze.SPOOF_DOMAIN_EXPLANATION);
  // Async arrival (a gate note landing after the sync
  // render): the group re-renders in place — still last,
  // still one heading, order preserved.
  const linkNote = noteEl("sf-note", "Link host complaint:",
    analyze.HOST_HIDDEN_EXPLANATION);
  c.api.addBlockedNote(linkNote);
  ok("group: a late arrival joins the same group, still last, one heading",
    c.stack.children[c.stack.children.length - 1] === group &&
    group.children.length === 5 &&
    group.children[4] === linkNote &&
    count(c.stack.textContent, "Blocked lanes") === 1);
})();

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
