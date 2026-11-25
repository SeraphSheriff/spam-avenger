"use strict";
// Spam Avenger v1.0.86 — ONE bug fix: pasteWarnEl scope.
//
// The bug (Michael, live, Firefox, Nov 24 2026, on the
// Wanshang dismissal notice): the panel died with
// "Something broke (v1.0.85): pasteWarnEl is not defined."
//
// pasteWarnEl (the paste-mode warning helper) was defined
// INSIDE the nested renderDomainTraceSections() function,
// but its fourth call site — the hyperscaler form-lane
// email door (AWS Trust & Safety / Alibaba Cloud, the
// "Or email it instead" section, `pasteWarnEl(awsMail)`)
// — lives OUTSIDE that nested function, in renderResult
// proper. Any message rendering an email-door lane threw
// a ReferenceError and killed the whole panel. The three
// domain-trace call sites (website / link / registrar)
// sat inside the nested function and worked, which is
// why the suites never caught it: no suite drives a live
// Gmail render of the panel (content.js needs the Gmail
// DOM), and the bug is a lexical-scope error.
//
// The fix moves the definition (with its comment) up into
// renderResult scope, before renderDomainTraceSections.
// Body, name, and all four call sites are unchanged.
//
// This test is therefore STRUCTURAL: it brace-matches the
// real function spans in content.js and asserts the
// definition sits in renderResult scope, outside the
// nested function, with every call site inside
// renderResult (hence able to reach it). It also evals
// the extracted function against stubs to prove the moved
// body still behaves (paste plan -> warning element,
// no plan -> null). On the pre-fix source the scope
// assertions FAIL (definition inside the nested span);
// on the fixed source they pass.
//
// Run: node tests/test-v1086-pastewarn-scope.js

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "content.js"), "utf8");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); }
}

// --- span finder -------------------------------------------------
// Blank out strings and comments (keeping positions) so brace
// matching is not thrown by braces in literals, then brace-match
// from a function's opening brace to its close.
function blankStringsAndComments(s) {
  var out = s.split("");
  var i = 0, n = s.length, state = null; // null | "'" | '"' | '`' | 'line' | 'block'
  while (i < n) {
    var c = s[i], d = i + 1 < n ? s[i + 1] : "";
    if (state === null) {
      if (c === "/" && d === "/") { state = "line"; out[i] = " "; }
      else if (c === "/" && d === "*") { state = "block"; out[i] = " "; }
      else if (c === "'" || c === '"' || c === "`") { state = c; out[i] = " "; }
      i++;
    } else if (state === "line") {
      if (c === "\n") state = null; else out[i] = " ";
      i++;
    } else if (state === "block") {
      if (c === "*" && d === "/") { out[i] = " "; out[i + 1] = " "; i += 2; state = null; }
      else { if (c !== "\n") out[i] = " "; i++; }
    } else { // string
      if (c === "\\") { out[i] = " "; if (i + 1 < n && s[i + 1] !== "\n") out[i + 1] = " "; i += 2; }
      else if (c === state) { out[i] = " "; state = null; i++; }
      else { if (c !== "\n") out[i] = " "; i++; }
    }
  }
  return out.join("");
}
const clean = blankStringsAndComments(src);

function spanOf(declNeedle) {
  const at = clean.indexOf(declNeedle);
  if (at === -1) return null;
  const open = clean.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < clean.length; i++) {
    if (clean[i] === "{") depth++;
    else if (clean[i] === "}") { depth--; if (depth === 0) return { start: at, open: open, end: i }; }
  }
  return null;
}
function inside(pos, span) { return !!span && pos > span.start && pos < span.end; }

const renderResult = spanOf("function renderResult(body, a)");
const domainTrace = spanOf("function renderDomainTraceSections()");
const pasteDef = spanOf("function pasteWarnEl(complaint)");

ok("spans found: renderResult, renderDomainTraceSections, pasteWarnEl",
  !!renderResult && !!domainTrace && !!pasteDef);
ok("renderDomainTraceSections is nested inside renderResult",
  inside(domainTrace.start, renderResult) && domainTrace.end < renderResult.end);

// --- the regression assertions -----------------------------------
ok("exactly one pasteWarnEl definition",
  (src.match(/function pasteWarnEl\(complaint\)/g) || []).length === 1);
ok("pasteWarnEl is defined in renderResult scope",
  inside(pasteDef.start, renderResult));
ok("pasteWarnEl is NOT trapped inside renderDomainTraceSections " +
   "(the v1.0.85 crash: the email-door call site cannot reach it there)",
  !inside(pasteDef.start, domainTrace));

// Every call site (an occurrence of `pasteWarnEl(` that is not the
// definition itself) must sit inside renderResult, the scope the
// definition now lives in — nested functions included, since a
// closure over renderResult's scope reaches it from any depth.
const callSites = [];
let idx = 0;
while ((idx = src.indexOf("pasteWarnEl(", idx)) !== -1) {
  if (idx !== pasteDef.start + "function ".length) callSites.push(idx);
  idx += "pasteWarnEl(".length;
}
ok("four pasteWarnEl call sites", callSites.length === 4,
  "got " + callSites.length);
ok("every call site is inside renderResult scope (definition reachable)",
  callSites.every(function (p) { return inside(p, renderResult); }));

const emailDoorCall = src.indexOf("pasteWarnEl(awsMail)");
ok("the email-door call site pasteWarnEl(awsMail) exists, inside " +
   "renderResult and outside renderDomainTraceSections",
  emailDoorCall !== -1 && inside(emailDoorCall, renderResult) &&
  !inside(emailDoorCall, domainTrace));

// --- behavior of the moved body is unchanged ----------------------
(function () {
  const fnText = src.slice(pasteDef.start, pasteDef.end + 1);
  const warnings = [];
  const fakeWindow = { SpamAvenger: {
    PASTE_MODE_WARNING: "PASTE-WARN-TEXT",
    fitGivenComplaint: function (acct, complaint) {
      return complaint && complaint.__paste ? { mode: "paste" } : { mode: "direct" };
    } } };
  function fakeH(tag, attrs, text) { warnings.push([tag, attrs, text]); return { tag: tag }; }
  const factory = new Function("window", "accountIndex", "h",
    "return " + fnText + ";");
  const pasteWarnEl = factory(fakeWindow, function () { return 0; }, fakeH);
  const el = pasteWarnEl({ __paste: true });
  ok("moved pasteWarnEl returns the warning element on a paste plan",
    !!el && warnings.length === 1 && warnings[0][2] === "PASTE-WARN-TEXT");
  ok("moved pasteWarnEl returns null on a direct plan",
    pasteWarnEl({ __paste: false }) === null && warnings.length === 1);
})();

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
