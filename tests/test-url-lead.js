// Spam Avenger v1.0.64 — lead-URL picker tests.
// Michael's live-test catch (2026-10-28): on the German "Medicare
// Kit" lure, both report lanes led with a Wikimedia-hosted logo
// image because analyze() returned URLs in raw-text order and the
// lanes lead with urls[0]. Fix: analyze() partitions the list —
// page candidates first, asset URLs (image/media/font/style
// extensions) after — so the lead is the landing page whenever
// the message has one. Nothing is dropped.
// Run: node tests/test-url-lead.js
"use strict";
const A = require("../lib/analyze.js");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); }
}

// ---------- isAssetUrl ----------
ok("wikimedia thumb .svg.png is an asset",
  A.isAssetUrl("https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Logo_Doctolib.svg/960px-Logo_Doctolib.svg.png") === true);
ok("hosted .png file is an asset",
  A.isAssetUrl("https://snaparia.com/file_b594c757-f859-43b3-8083-4e4c95c334d7.png") === true);
ok(".jpg with a query string is an asset",
  A.isAssetUrl("https://cdn.example.com/banner.jpg?w=600&h=200") === true);
ok("tracking .gif is an asset",
  A.isAssetUrl("https://track.example.com/open.gif?id=42") === true);
ok("googleapis .html page is NOT an asset",
  A.isAssetUrl("https://storage.googleapis.com/lifawrfvhblise/L.html") === false);
ok("bare landing path is NOT an asset",
  A.isAssetUrl("https://evil.example.com/landing") === false);
ok(".php page is NOT an asset",
  A.isAssetUrl("https://evil.example.com/login.php?u=1") === false);
ok("extension in the query only does NOT make it an asset",
  A.isAssetUrl("https://evil.example.com/go?next=logo.png") === false);

// ---------- leadWithPages ----------
const LOGO = "https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Logo_Doctolib.svg/960px-Logo_Doctolib.svg.png";
const HOSTED_PNG = "https://snaparia.com/file_b594c757-f859-43b3-8083-4e4c95c334d7.png";
const PHISH = "https://storage.googleapis.com/lifawrfvhblise/L.html";
const medicareOrder = A.leadWithPages([LOGO, HOSTED_PNG, PHISH]);
ok("medicare set: the phish page leads",
  medicareOrder[0] === PHISH, medicareOrder.join(" | "));
ok("medicare set: nothing dropped, assets keep order after pages",
  medicareOrder.length === 3 && medicareOrder[1] === LOGO && medicareOrder[2] === HOSTED_PNG);
ok("all-assets set: order untouched (urls[0] falls back to first asset)",
  JSON.stringify(A.leadWithPages([LOGO, HOSTED_PNG])) === JSON.stringify([LOGO, HOSTED_PNG]));
ok("pages keep their relative order",
  JSON.stringify(A.leadWithPages(["https://a.example/1", LOGO, "https://b.example/2"])) ===
  JSON.stringify(["https://a.example/1", "https://b.example/2", LOGO]));
ok("empty list stays empty", A.leadWithPages([]).length === 0);

// ---------- end-to-end: analyze() on a lure-shaped message ----------
const raw = [
  "Received: from mail.jesuscopy.com (211.8.168.34.bc.googleusercontent.com. [34.168.8.211])",
  "        by mx.google.com with ESMTPS id abc123",
  "        for <mjf@colorami.com>;",
  "        Wed, 28 Oct 2026 12:04:42 -0700 (PDT)",
  "From: Medicare Kit <support@jesuscopy.com>",
  "Subject: Nur noch heute verfuegbar: Ihr persoenliches Angebot!",
  "Date: Wed, 28 Oct 2026 12:04:42 -0700",
  "Content-Type: text/html; charset=UTF-8",
  "",
  "<html><body>",
  '<img src="' + LOGO + '" alt="doctolib Logo">',
  '<a href="' + HOSTED_PNG + '">Medicare Kit</a>',
  '<a href="' + PHISH + '">UMFRAGE STARTEN</a>',
  "</body></html>",
  ""
].join("\r\n");
const a = A.analyze(raw);
ok("analyze: urls[0] is the phishing page, not the logo",
  a.urls[0] === PHISH, (a.urls || []).join(" | "));
ok("analyze: all three links still present as evidence",
  a.urls.length === 3 && a.urls.indexOf(LOGO) !== -1 && a.urls.indexOf(HOSTED_PNG) !== -1);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
