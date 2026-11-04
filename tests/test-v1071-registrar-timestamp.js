// Spam Avenger v1.0.71 fix — registrar/website launched timestamps.
// Michael's live test, Nov 4 2026: he opened the Registrar
// report for hzxhqz.com (July Name Limited) in Gmail and sent
// it (verified in Sent: abuse@julyname.com, 14:47:57 MST), but
// the panel showed NO timestamp for that lane, while the
// Forward lane above it carried its "✓ 7:29 AM" badge. The
// registrar/website lanes were built in v1.0.70 with a
// deliberate no-history note; this fix supersedes it:
// "website" and "registrar" join SA_LANES, their section
// toggles register as badge targets, wireCompose records the
// launch when a compose opens, the website form button records
// too, and the async domain-trace render presets badges from
// stored history itself (it runs after the main preset pass).
// Version stays 1.0.71 — Michael's call: "we'll call that
// build 71 again."
// Run: node tests/test-v1071-registrar-timestamp.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const contentSrc = fs.readFileSync(path.join(ROOT, "content.js"), "utf8");
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); }
}

ok("manifest version stays 1.0.71", manifest.version === "1.0.71",
  "got " + manifest.version);
ok("no new permissions", JSON.stringify(manifest.permissions) ===
  JSON.stringify(["storage"]));
ok("host permissions still 11", manifest.host_permissions.length === 11);

// ---------- history helpers: the new lanes record + load ----------
const bMark = "// [sa-history-helpers-begin]";
const eMark = "// [sa-history-helpers-end]";
const bi = contentSrc.indexOf(bMark), ei = contentSrc.indexOf(eMark);
ok("history helper block markers found", bi !== -1 && ei > bi);
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
  H = vm.runInNewContext(block + "\n;({ LANES: SA_LANES," +
    " record: saRecordLaunched, load: saLoadLaunched," +
    " preset: saPresetText, launched: saLaunchedText });",
    { document: { createElement: function () { return makeFakeEl(); } } });
}
ok("helpers evaluate standalone", !!H);
ok("SA_LANES includes website and registrar, appended after pid",
  !!H && H.LANES.join(",") ===
    "complaint,ftc,sb,fwd,google,pid,website,registrar",
  H ? H.LANES.join(",") : "no helpers");

function fakeStorage(seed) {
  const data = {};
  if (seed) Object.keys(seed).forEach(function (k) { data[k] = seed[k]; });
  return {
    data: data,
    get: function (key, cb) { const r = {}; r[key] = data[key]; cb(r); },
    set: function (obj, cb) {
      Object.keys(obj).forEach(function (k) { data[k] = obj[k]; });
      if (cb) cb();
    }
  };
}
const TS = 1793843277000; // the July Name send, Nov 4 2026 14:47:57 MST-ish
["registrar", "website"].forEach(function (lane) {
  const st = fakeStorage();
  ok(lane + ": record accepted", H.record(st, "msg-1", lane, TS) === true);
  let got = null;
  H.load(st, "msg-1", function (rec) { got = rec; });
  ok(lane + ": stored timestamp loads back",
    !!got && got[lane] === TS);
  ok(lane + ": preset text is the launched line",
    H.preset("", got, lane) === H.launched(TS));
});
ok("unknown lane still rejected",
  H.record(fakeStorage(), "msg-1", "bogus", TS) === false);

// ---------- source pins: wiring in the domain-trace render ----------
ok("registrar toggle registered as badge target",
  contentSrc.indexOf('badgeTargets.registrar = { el: rSec.toggle }') !== -1);
ok("website toggle registered (complaint branch)",
  contentSrc.indexOf('badgeTargets.website = { el: wSec.toggle }') !== -1);
ok("website toggle registered (form branch)",
  contentSrc.indexOf('badgeTargets.website = { el: wFormSec.toggle }') !== -1);
ok("wireCompose takes a lane",
  contentSrc.indexOf("function wireCompose(btn, complaint, lane)") !== -1);
ok("wireCompose records + badges the lane on click",
  contentSrc.indexOf('recordLaunched(lane);') !== -1 &&
  contentSrc.indexOf('applyLaunchedBadge(lane, Date.now());') !== -1);
ok("registrar compose wired with its lane",
  contentSrc.indexOf('wireCompose(rBtn, a.registrarComplaint, "registrar")') !== -1);
ok("website compose wired with its lane",
  contentSrc.indexOf('wireCompose(wBtn, a.websiteComplaint, "website")') !== -1);
ok("website form button records the website lane",
  contentSrc.indexOf('recordLaunched("website");') !== -1);
ok("async trace render presets website/registrar badges itself",
  contentSrc.indexOf('["website", "registrar"].forEach') !== -1);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
