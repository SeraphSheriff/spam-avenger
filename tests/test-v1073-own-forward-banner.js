"use strict";
// Spam Avenger v1.0.73 — the own-forward banner on the
// header-fetch SUCCESS path (queued-own-forward-catch.md,
// Nov 21 2026 addendum).
//
// The catch built into 1.0.72 only fired when the header
// fetch FAILED. On the direitodoestado.com.br forward copy
// (Nov 21 2026) the fetch SUCCEEDED, so the panel rendered
// in full with no sign the open message was Michael's own
// APWG/CISA forward. Now renderResult runs the same verdict
// on the anchored message and banners the panel when it
// fires. The failure-path catch and the detector itself are
// untouched (test-v1072-own-forward-catch.js still owns
// those); this file owns the new surface and the wording.
//
// Run: node tests/test-v1073-own-forward-banner.js

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const contentSrc = fs.readFileSync(path.join(ROOT, "content.js"), "utf8");
const analyze = require(path.join(ROOT, "lib", "analyze.js"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); }
}

// ---------- the banner wording (spec-pinned) ----------
ok("lib: OWN_FORWARD_BANNER carries the spec's wording",
  analyze.OWN_FORWARD_BANNER ===
    "This is your own forward of a spam message, not the " +
    "original \u2014 open the original to work from its headers.",
  JSON.stringify(analyze.OWN_FORWARD_BANNER));

// ---------- the success-path wiring ----------
const renderStart = contentSrc.indexOf("function renderResult");
const renderEnd = contentSrc.indexOf("function applyClassification",
  renderStart);
const renderSlice = contentSrc.slice(renderStart, renderEnd);
ok("render: renderResult extracted for inspection",
  renderStart !== -1 && renderSlice.length > 1000);
ok("render: the verdict runs on the anchored message",
  renderSlice.indexOf("messageElById(currentMessageId())") !== -1 &&
  renderSlice.indexOf("ownForwardOnPage(owfEl)") !== -1);
ok("render: the banner element carries its own class",
  renderSlice.indexOf('"sf-warn sf-own-forward-banner"') !== -1 &&
  renderSlice.indexOf("window.SpamAvenger.OWN_FORWARD_BANNER") !== -1);
const bannerAt = renderSlice.indexOf("sf-own-forward-banner");
const stackAt = renderSlice.indexOf('var stack = h("div"');
ok("render: the banner lands above the lane stack",
  bannerAt !== -1 && stackAt !== -1 && bannerAt < stackAt);
ok("render: a detection failure shows nothing (guarded)",
  renderSlice.indexOf("} catch (e) {}") !== -1 &&
  renderSlice.indexOf("if (owfEl && ownForwardOnPage(owfEl)") !== -1);

// ---------- the failure path is untouched ----------
ok("failure path: the header-failure catch still stands",
  contentSrc.indexOf('msg.indexOf("wouldn\'t hand over the headers")') !== -1 &&
  contentSrc.indexOf("window.SpamAvenger.OWN_FORWARD_EXPLANATION") !== -1 &&
  typeof analyze.OWN_FORWARD_EXPLANATION === "string");

// ---------- the anchor preference is untouched ----------
ok("anchor: a mixed thread still anchors on the original",
  contentSrc.indexOf("if (els.length > 1 && ownForwardOnPage(els[0]))") !== -1);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
