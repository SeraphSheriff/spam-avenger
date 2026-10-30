// Spam Avenger v1.0.65 test2 — URL slash normalization tests.
// Michael's live catch (2026-10-30): a Safe Browsing report
// launched from the panel handed Google the URL
// "https://////w2.xiongmao-outdoor.com////////g4herty////////
// s234r3wa1.html" — slashes multiplied in the scheme separator
// and all down the path. Fix: extractUrls() runs every collected
// URL through normalizeUrl(), so all lanes (Safe Browsing / FTC
// stash and prefill, URL picker, complaint text, form-kit
// evidence) only ever see the clean form. Normalization touches
// only the part before any ? or #: the query string and fragment
// pass through byte-for-byte.
// Run: node tests/test-url-normalize.js
"use strict";
const A = require("../lib/analyze.js");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); }
}

// ---------- normalizeUrl ----------
const MANGLED = "https://////w2.xiongmao-outdoor.com////////g4herty////////s234r3wa1.html";
const CLEAN = "https://w2.xiongmao-outdoor.com/g4herty/s234r3wa1.html";
ok("xiongmao live case: multiplied slashes collapse to the clean URL",
  A.normalizeUrl(MANGLED) === CLEAN, A.normalizeUrl(MANGLED));
ok("slashes only after the scheme: separator comes out as exactly ://",
  A.normalizeUrl("https:////evil.example.com/landing") === "https://evil.example.com/landing",
  A.normalizeUrl("https:////evil.example.com/landing"));
ok("runs of slashes mid-path collapse to single slashes",
  A.normalizeUrl("https://evil.example.com/a////b//c.html") === "https://evil.example.com/a/b/c.html",
  A.normalizeUrl("https://evil.example.com/a////b//c.html"));
ok("http (not just https) URLs normalize too",
  A.normalizeUrl("http:////evil.example.com//a") === "http://evil.example.com/a",
  A.normalizeUrl("http:////evil.example.com//a"));
ok("already-clean URL passes through unchanged",
  A.normalizeUrl("https://storage.googleapis.com/lifawrfvhblise/L.html") ===
  "https://storage.googleapis.com/lifawrfvhblise/L.html");
ok("query string keeps its // byte-for-byte while the path collapses",
  A.normalizeUrl("https://evil.example.com//go//now?next=https://other.example//x//y&u=1") ===
  "https://evil.example.com/go/now?next=https://other.example//x//y&u=1",
  A.normalizeUrl("https://evil.example.com//go//now?next=https://other.example//x//y&u=1"));
ok("fragment keeps its // byte-for-byte while the path collapses",
  A.normalizeUrl("https://evil.example.com//a#sec//tion") === "https://evil.example.com/a#sec//tion",
  A.normalizeUrl("https://evil.example.com//a#sec//tion"));
ok("non-URL string passes through unchanged",
  A.normalizeUrl("just some // text with //// slashes") === "just some // text with //// slashes");
ok("schemeless host/path passes through unchanged",
  A.normalizeUrl("w2.xiongmao-outdoor.com////////g4herty") === "w2.xiongmao-outdoor.com////////g4herty");

// ---------- downstream: defanging works again on the cleaned URL ----------
// defangUrl() no-ops on a slash-mangled URL (its host group cannot
// start on a slash); on the normalized form it defangs as designed.
ok("defangUrl defangs the normalized xiongmao URL",
  A.defangUrl(A.normalizeUrl(MANGLED)) === "hxxps://w2[.]xiongmao-outdoor[.]com/g4herty/s234r3wa1.html",
  A.defangUrl(A.normalizeUrl(MANGLED)));

// ---------- end-to-end: analyze() on a lure carrying the mangled href ----------
const raw = [
  "From: Outdoor Deals <deals@xiongmao-outdoor.com>",
  "Subject: Your order is waiting",
  "Date: Fri, 30 Oct 2026 09:02:11 -0600",
  "Content-Type: text/html; charset=UTF-8",
  "",
  "<html><body>",
  '<a href="' + MANGLED + '">Track your package</a>',
  "</body></html>",
  ""
].join("\r\n");
const a = A.analyze(raw);
ok("analyze: urls[0] is the clean xiongmao URL, not the mangled one",
  a.urls[0] === CLEAN, (a.urls || []).join(" | "));
ok("analyze: no collected URL still carries a multiplied slash",
  (a.urls || []).every(function (u) { return !/\/\/\//.test(u.replace(/^https?:\/\//, "")) &&
    u.indexOf("////") === -1; }),
  (a.urls || []).join(" | "));

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
