"use strict";
// Public 1.0.72 release (internal build .73) — the
// link-host lane joins the launched-stamp system
// (Michael's field catch, Nov 8 2026 evening).
//
// On the verify.colorami.com panel he clicked through the
// Link host lane — accordion opened, "Open in Gmail — just
// click Send" clicked — and NEITHER the section toggle nor
// the inner button carried a timestamp, while the
// Registrar lane in the same panel showed "✓ 8:07 PM" on
// both of its controls. The cause: the link host was never
// in SA_LANES at all. Its compose was wired with a null
// lane (wireCompose recorded nothing) and its form button
// recorded only a sighting, so there was no launch record
// to stamp from and no badge target registered.
//
// The fix is parity with website/registrar, in both of the
// lane's shapes: "linkhost" joins SA_LANES (appended, the
// established order preserved); both section toggles
// register as badgeTargets.linkhost els[0] with the inner
// button pushed in; the email lane's button carries a
// .sf-btn-label span (so wireCompose's paste swap can't
// eat the badge) and is wired with its lane; the form
// button's label moves into a span and its click records
// the launch + badges, exactly like the website form
// button; the async domain-trace render's own preset pass
// covers linkhost alongside website/registrar. The
// sighting still records — recordLaunched writes it
// through saDeskFor's existing linkhost case.
// Run: node tests/test-v1072-linkhost-stamps.js

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

ok("manifest version stays 1.0.73", manifest.version === "1.0.74",
  "got " + manifest.version);
ok("no new permissions", JSON.stringify(manifest.permissions) ===
  JSON.stringify(["storage"]));

// ---------- history helpers: the lane records + loads ----------
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
    " preset: saPresetText, launched: saLaunchedText," +
    " badge: saBadgeText });",
    { document: { createElement: function () { return makeFakeEl(); } } });
}
ok("helpers evaluate standalone", !!H);
ok("SA_LANES includes linkhost, appended after registrar " +
   "(the established lane order preserved)",
  !!H && H.LANES.join(",") ===
    "complaint,ftc,sb,fwd,google,pid,website,registrar,linkhost",
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
const TS = 1793856420000; // the field catch, Nov 8 2026 ~20:07 MST
const st = fakeStorage();
ok("linkhost: record accepted (the lane is in SA_LANES)",
  H.record(st, "msg-9", "linkhost", TS) === true);
let got = null;
H.load(st, "msg-9", function (rec) { got = rec; });
ok("linkhost: stored timestamp loads back",
  !!got && got.linkhost === TS);
ok("linkhost: preset text is the shared launched line",
  H.preset("", got, "linkhost") === H.launched(TS) &&
    H.launched(TS).indexOf("✓ Launched ") === 0);
ok("linkhost: badge text is the shared time-only badge",
  typeof H.badge(TS) === "string" &&
    H.badge(TS).indexOf("✓ ") === 0);
ok("linkhost: a record survives alongside the other lanes",
  H.record(st, "msg-9", "registrar", TS) === true &&
    (function () {
      let r = null;
      H.load(st, "msg-9", function (rec) { r = rec; });
      return !!r && r.linkhost === TS && r.registrar === TS;
    })());
ok("unknown lane still rejected",
  H.record(fakeStorage(), "msg-9", "bogus", TS) === false);

// ---------- source pins: wiring in the domain-trace render ----------
ok("linkhost toggle registered (email branch, els shape)",
  contentSrc.indexOf(
    "badgeTargets.linkhost = { els: [lSec.toggle] }") !== -1);
ok("linkhost toggle registered (form branch, els shape)",
  contentSrc.indexOf(
    "badgeTargets.linkhost = { els: [lFormSec.toggle] }") !== -1);
ok("linkhost compose button joins the badge targets",
  contentSrc.indexOf("badgeTargets.linkhost.els.push(lBtn)") !== -1);
ok("linkhost form button joins the badge targets",
  contentSrc.indexOf("badgeTargets.linkhost.els.push(lFormBtn)") !== -1);
ok("linkhost compose wired WITH its lane (was null)",
  contentSrc.indexOf(
    'wireCompose(lBtn, a.linkComplaint, "linkhost")') !== -1 &&
  contentSrc.indexOf(
    "wireCompose(lBtn, a.linkComplaint, null)") === -1);
ok("linkhost form button records + badges the launch",
  contentSrc.indexOf('recordLaunched("linkhost");') !== -1 &&
  contentSrc.indexOf(
    'applyLaunchedBadge("linkhost", Date.now())') !== -1);
ok("no bare sighting-only recording remains for the lane " +
   "(recordLaunched writes the sighting itself)",
  contentSrc.indexOf('saRecordSighting("linkhost")') === -1);
const lBtnAt = contentSrc.indexOf('"sf-link-compose"');
const lBtnSeg = lBtnAt === -1 ? "" : contentSrc.slice(lBtnAt, lBtnAt + 300);
ok("linkhost compose button carries the .sf-btn-label span " +
   "(the paste swap can no longer eat its badge)",
  lBtnSeg.indexOf("sf-btn-label") !== -1 &&
    lBtnSeg.indexOf("Open in Gmail") !== -1);
const lFormAt = contentSrc.indexOf('"sf-open-link-form"');
const lFormSeg = lFormAt === -1 ? "" : contentSrc.slice(lFormAt, lFormAt + 1200);
ok("linkhost form button carries the .sf-btn-label span too",
  contentSrc.indexOf("lFormBtnLabel") !== -1 &&
    lFormSeg.indexOf("lFormBtnLabel.textContent") !== -1);
ok("async trace render presets linkhost badges in its own pass",
  contentSrc.indexOf(
    '["website", "registrar", "linkhost"].forEach') !== -1);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
