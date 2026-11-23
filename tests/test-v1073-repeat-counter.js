"use strict";
// Spam Avenger v1.0.73 — the repeat-offender counter counts
// DISTINCT reports, not lane launches
// (queued-repeat-counter-lane-launches.md, Michael's field
// find Nov 21 2026: "fifth report on this sender!?!?!?").
//
// The bug: every lane launch wrote a "report" sighting, so
// one message worked through five lanes in one morning read
// back as five reports of its sender. The fix is two-layered:
//   - lib matchReports collapses sightings into distinct
//     reports: same message key (`msg`) = one report; records
//     written before the key existed collapse per calendar
//     day instead.
//   - content.js saWriteSighting now stamps the message key
//     on each sighting and skips a report sighting when this
//     message already has one against the same sender.
// Panel note and priorReportSection wording are unchanged —
// they become true once the count means distinct reports.
//
// Run: node tests/test-v1073-repeat-counter.js

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const contentSrc = fs.readFileSync(path.join(ROOT, "content.js"), "utf8");
const analyze = require(path.join(ROOT, "lib", "analyze.js"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); }
}

const IP = "34.185.89.135"; // the GCP sender of the field case
const DOM = "direitodoestado.com.br";
const D1 = new Date(2026, 10, 21, 7, 30).getTime(); // Nov 21, 07:30
const D1b = new Date(2026, 10, 21, 7, 32).getTime(); // Nov 21, 07:32
const D2 = new Date(2026, 10, 22, 9, 5).getTime();  // Nov 22, 09:05

function sighting(over) {
  return Object.assign({
    ip: IP, domain: DOM, ts: D1, desk: "abuse desk",
    action: "complaint", msg: "<m1@mail.gmail.com>"
  }, over || {});
}

// ---------- matchReports: the msg-key collapse ----------
const fiveLanes = [
  sighting({ action: "complaint", ts: D1 }),
  sighting({ action: "ftc", ts: D1 }),
  sighting({ action: "sb", ts: D1b }),
  sighting({ action: "fwd", ts: D1b }),
  sighting({ action: "linkhost", ts: D1b })
];
const m1 = analyze.matchReports(fiveLanes, IP, DOM);
ok("five lane launches on ONE message -> count 1",
  !!m1 && m1.count === 1 && m1.dates.length === 1,
  JSON.stringify(m1));
ok("the one report's date is the first launch of the session",
  !!m1 && m1.dates[0] === D1 && m1.lastTs === D1b);

const twoMessages = fiveLanes.concat([
  sighting({ action: "complaint", ts: D2, msg: "<m2@mail.gmail.com>" })
]);
const m2 = analyze.matchReports(twoMessages, IP, DOM);
ok("same IP, a second message on a later day -> count 2",
  !!m2 && m2.count === 2 && m2.dates.length === 2 &&
  m2.dates[0] === D1 && m2.dates[1] === D2 && m2.lastTs === D2,
  JSON.stringify(m2));

const sameDayTwoMessages = [
  sighting({ action: "complaint", ts: D1 }),
  sighting({ action: "fwd", ts: D1b, msg: "<m9@mail.gmail.com>" })
];
const m3 = analyze.matchReports(sameDayTwoMessages, IP, DOM);
ok("two DIFFERENT messages the same day still count 2 " +
   "(the msg key, not the day, is the unit)",
  !!m3 && m3.count === 2, JSON.stringify(m3));

// ---------- matchReports: the legacy (no-msg) collapse ----------
const legacyMorning = [
  { ip: IP, domain: DOM, ts: D1, desk: "d", action: "complaint" },
  { ip: IP, domain: DOM, ts: D1, desk: "d", action: "ftc" },
  { ip: IP, domain: DOM, ts: D1b, desk: "d", action: "sb" },
  { ip: IP, domain: DOM, ts: D1b, desk: "d", action: "fwd" }
];
const m4 = analyze.matchReports(legacyMorning, IP, DOM);
ok("legacy records (no msg): one morning's four launches -> count 1",
  !!m4 && m4.count === 1 && m4.dates[0] === D1,
  JSON.stringify(m4));
const legacyTwoDays = legacyMorning.concat([
  { ip: IP, domain: DOM, ts: D2, desk: "d", action: "complaint" }
]);
const m5 = analyze.matchReports(legacyTwoDays, IP, DOM);
ok("legacy records across two days -> count 2",
  !!m5 && m5.count === 2 && m5.lastTs === D2,
  JSON.stringify(m5));

// ---------- the panel note tells the truth now ----------
const note = analyze.repeatPanelNote(m1);
ok("the note on the field case no longer claims a 5th report",
  !!note && /2nd report/.test(note) &&
  note.indexOf("Nov 21, 2026") !== -1, note || "null");
const sec = analyze.priorReportSection(m2);
ok("the complaint section counts distinct reports too",
  /reported this sender 2 times/.test(sec) &&
  /report number 3/.test(sec), sec);

// ---------- cleanSighting carries the key ----------
const cleaned = analyze.pruneSightings([
  sighting({ msg: "<keep@mail.gmail.com>" }),
  sighting({ msg: 42 }),
  sighting({ msg: undefined })
]);
ok("cleanSighting: msg survives as a string, junk becomes ''",
  cleaned.length === 3 &&
  cleaned[0].msg === "<keep@mail.gmail.com>" &&
  cleaned[1].msg === "42" && cleaned[2].msg === "");

// ---------- content.js: the write side (extracted, fake store) ----------
function extractFn(src, startNeedle, endNeedle) {
  const a = src.indexOf(startNeedle);
  const b = a === -1 ? -1 : src.indexOf(endNeedle, a);
  return (a === -1 || b === -1) ? "" : src.slice(a, b);
}
const wsrc = extractFn(contentSrc,
  "function saWriteSighting(action, desk)",
  "function saRecordSighting(lane)");
ok("write: saWriteSighting extracted from content.js",
  wsrc.indexOf("msg") !== -1 && wsrc.indexOf("dup") !== -1);

const storeData = {};
const fakeStore = {
  get: function (key, cb) {
    const res = {};
    res[key] = storeData[key];
    cb(res);
  },
  set: function (payload, cb) {
    Object.keys(payload).forEach(function (k) {
      storeData[k] = payload[k];
    });
    if (cb) cb();
  }
};
const sandbox = {
  window: { SpamAvenger: analyze },
  SA_SIGHTINGS_KEY: "saSightings",
  sfCurrentAnalysis: { ip: IP, senderDomain: DOM },
  sfCurrentMsgKey: "<m1@mail.gmail.com>",
  saStorageLocal: function () { return fakeStore; },
  saHistoryKey: function () { return null; },
  currentMessageId: function () { return null; }
};
const saWriteSighting = vm.runInNewContext(
  wsrc + "\n;saWriteSighting;", sandbox);
function reports() {
  return (storeData.saSightings || []).filter(function (s) {
    return s.action !== "analyzed";
  });
}
["complaint", "ftc", "sb", "fwd", "linkhost"].forEach(
  function (lane) { saWriteSighting(lane, "some desk"); });
ok("write: five lane launches on one message store ONE report",
  reports().length === 1 &&
  reports()[0].msg === "<m1@mail.gmail.com>",
  JSON.stringify(storeData.saSightings));
saWriteSighting("analyzed", "");
saWriteSighting("analyzed", "");
ok("write: 'analyzed' sightings are never deduped",
  (storeData.saSightings || []).filter(function (s) {
    return s.action === "analyzed";
  }).length === 2);
sandbox.sfCurrentMsgKey = "<m2@mail.gmail.com>";
saWriteSighting("complaint", "some desk");
ok("write: a different message stores a second report",
  reports().length === 2 &&
  reports()[1].msg === "<m2@mail.gmail.com>",
  JSON.stringify(reports()));

// ---------- static wiring ----------
ok("content: the sighting is stamped with the message key",
  contentSrc.indexOf("msg: msgKey") !== -1 &&
  contentSrc.indexOf("sfCurrentMsgKey ||") !== -1);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
