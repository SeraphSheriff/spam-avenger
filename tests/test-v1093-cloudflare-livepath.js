"use strict";
// Spam Avenger v1.0.93 — the Cloudflare lane's LIVE PATH,
// and the RC04 build label.
//
// The RC03 live miss (Michael, Nov 25 2026): RC03 loaded
// (as believed), the luxury-bags message open in Gmail's
// Spam folder — "Louis Vuitton" from jiuzhicui.com, the
// payload v2.hocnfl.com, the standing Cloudflare-fronted
// example — and the panel showed only the old blocked
// note ("Link host complaint: The company hosting this
// website is hidden…"). No Cloudflare lane anywhere.
//
// The diagnosis, from the code and the shipped zip (the
// RC03 package is byte-identical to its source tree, and
// every lib function below passes on the real data):
//   - link extraction is NOT the break: the real analyzer
//     over the real saved message (quoted-printable body,
//     hrefs mangled as https://////v2.hocnfl.com/////////
//     …) yields the payload URL clean, host v2.hocnfl.com;
//   - the verdict logic is NOT the break: the hocnfl DNS
//     answers flag fronted, via "ns", every time;
//   - the fragile link was the LAST one: RC03's lane
//     depended on two FRESH dns.google queries issued at
//     the very end of the long gating chain, each on
//     dnsAnswerList's 3-second budget, failing SILENT —
//     and the null result was then CACHED for the rest of
//     the page session, so no later open of the message
//     in that tab could ever recover the lane. Meanwhile
//     the gating already held the decisive fact in hand:
//     the address websiteHostFor had resolved for the
//     host (info.ip) WAS a Cloudflare address — that is
//     precisely why origin discovery ran at all.
//   - and the test itself was unverifiable: the panel
//     carried no build identity, so "lane missing" could
//     not be distinguished from "old build still loaded".
//
// The v1.0.93 repairs, all driven below at the seams
// Node can reach (the codebase's harness limit: content
// .js's Gmail-coupled render is pinned by source shape,
// as in every suite since v1.0.64):
//   - the gating decides through the lib's pure
//     cloudflareViaFor(info, verdict): the in-hand
//     address settles the question on its own; the fresh
//     verdict speaks first when it answers, but its
//     silence no longer vetoes the lane;
//   - cloudflareFrontedFor no longer caches a null
//     (failed) verdict, and its A query retries once;
//   - FRONT_DOOR_V4 gains 104.24.0.0/14, the one
//     published Cloudflare range it lacked — a host
//     whose only A record sits there never entered the
//     front-door branch at all;
//   - the panel's red header bar carries the build
//     label: SA_BUILD_LABEL (set by the packaging step)
//     beside the name, with SF_VERSION — read from the
//     manifest at runtime — in parentheses.
//
// Run: node tests/test-v1093-cloudflare-livepath.js

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const contentSrc = fs.readFileSync(
  path.join(ROOT, "content.js"), "utf8");
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
const SA = require(path.join(ROOT, "lib", "analyze.js"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else {
    fail++;
    console.log("  FAIL " + name +
      (extra ? " — " + extra : ""));
  }
}
function finish() {
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
}

// ---------- manifest ----------
ok("manifest: version is 1.0.87 (the publish " +
   "relabel of the RC05 build — same code, store version)",
  manifest.version === "1.0.87");

// ---------- the build label ----------
const labelMatch = contentSrc.match(
  /var SA_BUILD_LABEL = "([^"]*)";/);
ok("label: the SA_BUILD_LABEL constant exists in " +
   "content.js (the one constant the packaging step sets)",
  !!labelMatch);
const buildLabel = labelMatch ? labelMatch[1] : null;
ok("label: this package's label is \"\" — the publish " +
   "relabel of the RC05 drop: Michael called RC05 ready " +
   "to publish as 1.0.87 (Nov 25 2026) and the packaging " +
   "step emptied the RC tag; only the package identity " +
   "moved, the code is RC05's",
  buildLabel === "");
ok("label: the header composes name + label + version " +
   "from the constant and SF_VERSION (never a second " +
   "hardcoded version string)",
  contentSrc.indexOf(
    "(SA_BUILD_LABEL ? \" \\u00B7 \" + SA_BUILD_LABEL : \"\")") !== -1 &&
  contentSrc.indexOf("\" (\" + SF_VERSION + \")\"") !== -1 &&
  contentSrc.indexOf("getManifest") !== -1);
ok("label: the composed header text for this package " +
   "reads 'Spam Avenger · 1.0.87' (the published mode " +
   "of the composition — an empty label shows name and " +
   "plain version; v1.0.94 factored it into content.js's " +
   "saHeaderText and made the version span clickable — " +
   "both modes are driven against the real function " +
   "in test-v1094-rc05.js)",
  "\uD83D\uDEE1\uFE0F Spam Avenger" +
    (buildLabel ? " \u00B7 " + buildLabel +
      " (" + manifest.version + ")"
                : " \u00B7 " + manifest.version) ===
  "\uD83D\uDEE1\uFE0F Spam Avenger \u00B7 1.0.87");

// ---------- the real message through the real analyzer ----------
// The saved original of the Nov 25 luxury-bags message:
// quoted-printable body, hrefs with multiplied slashes
// and soft line breaks through the payload URL.
const rawMsg = fs.readFileSync(path.join(ROOT, "..",
  "luxury-bags-169", "message.txt"), "utf8");
const a = SA.analyze(rawMsg);
ok("message: the analyzer reads the real luxury-bags " +
   "original (From is the jiuzhicui.com sender)",
  !!a && /jiuzhicui\.com/.test(String(a.from || "")) &&
  a.senderDomain === "jiuzhicui.com");
ok("message: the excess-slash payload href normalizes " +
   "to the clean payload URL, first in the list",
  !!a && Array.isArray(a.urls) && a.urls[0] ===
    "https://v2.hocnfl.com/56revv2/fvew26fg.html",
  a && a.urls && a.urls[0]);
ok("message: the primary link's host is v2.hocnfl.com " +
   "and its registrable domain hocnfl.com (the exact " +
   "pair runLaneGating feeds the link branch)",
  SA.primaryLink(a) ===
    "https://v2.hocnfl.com/56revv2/fvew26fg.html" &&
  SA.hostOfUrl(SA.primaryLink(a)) === "v2.hocnfl.com" &&
  SA.primaryLinkDomain(a) === "hocnfl.com");

// ---------- the network seam: real hocnfl answers ----------
// dns.google shapes, as served live on Nov 25 2026:
// v2.hocnfl.com A 172.67.159.214 / 104.21.82.170;
// hocnfl.com NS ligia / henrik.ns.cloudflare.com.
function ans(type, data) {
  return { name: "x", type: type, TTL: 300, data: data };
}
const HOCNFL_A = [ans(1, "172.67.159.214"),
  ans(1, "104.21.82.170")];
const HOCNFL_NS = [ans(2, "ligia.ns.cloudflare.com."),
  ans(2, "henrik.ns.cloudflare.com.")];
// Failure controls for the hygiene tests: hosts whose A
// queries fail until told otherwise, and a one-shot
// failure for the retry test.
const failHosts = { "v9.hocnfl.com": true };
let v8FailuresLeft = 1;
function dnsBody(url) {
  const name = decodeURIComponent(
    (/[?&]name=([^&]+)/.exec(url) || [])[1] || "");
  const type = (/[?&]type=([^&]+)/.exec(url) || [])[1] || "";
  if (type === "A") {
    if (failHosts[name]) return null; // fetch fails outright
    if (name === "v8.hocnfl.com" && v8FailuresLeft > 0) {
      v8FailuresLeft--;
      return null;
    }
    return { Status: 0, Answer: HOCNFL_A };
  }
  if (type === "NS") return { Status: 0, Answer: HOCNFL_NS };
  return { Status: 0, Answer: [] }; // PTR and anything else
}
global.fetch = function (url) {
  const u = String(url);
  if (u.indexOf("https://dns.google/resolve") === 0) {
    const body = dnsBody(u);
    if (body === null) {
      return Promise.resolve({ ok: false,
        json: function () { return Promise.resolve(null); } });
    }
    return Promise.resolve({ ok: true,
      json: function () { return Promise.resolve(body); } });
  }
  // RDAP and everything else: unreachable in the fixture.
  return Promise.resolve({ ok: false,
    json: function () { return Promise.resolve(null); } });
};

// ---------- the gating's facts, from the real lib ----------
SA.websiteHostFor("v2.hocnfl.com").then(function (info) {
  ok("gating facts: websiteHostFor resolves the link " +
     "host to one of its real Cloudflare addresses",
    !!info && HOCNFL_A.some(function (r) {
      return r.data === info.ip;
    }), info && info.ip);
  ok("gating facts: that address is a front-door " +
     "address (the branch condition) AND a Cloudflare " +
     "address (the fact RC03 re-asked DNS for)",
    !!info && SA.isFrontDoorIp(info.ip) &&
    SA.isCloudflareIp(info.ip));
  return SA.cloudflareFrontedFor("v2.hocnfl.com")
    .then(function (verdict) {
      ok("gating facts: the fresh verdict over the same " +
         "answers flags fronted, via ns",
        !!verdict && verdict.fronted === true &&
        verdict.via === "ns");

      // ---------- the decision that decides the render ----------
      ok("decision: fresh verdict + in-hand info → ns",
        SA.cloudflareViaFor(info, verdict) === "ns");
      ok("decision: THE RC03 CASE — fresh verdict silent " +
         "(null), in-hand address already Cloudflare → " +
         "the lane is still offered, via ip",
        SA.cloudflareViaFor(info, null) === "ip");
      ok("decision: a not-fronted fresh verdict does not " +
         "veto the in-hand Cloudflare address either — " +
         "the panel acts on the address it resolved and " +
         "probed",
        SA.cloudflareViaFor(info,
          { fronted: false, via: "ip" }) === "ip");
      ok("decision: an ordinary host (the Vietnam " +
         "sending address) with no verdict → no lane",
        SA.cloudflareViaFor({ ip: "103.81.85.148" },
          null) === null &&
        SA.cloudflareViaFor(null, null) === null &&
        SA.cloudflareViaFor(null,
          { fronted: true, via: "ns" }) === "ns");

      // The branch outcome the render consumes, built the
      // way runLaneGating builds it on this message:
      const linkCloudflare = (function () {
        const via = SA.cloudflareViaFor(info, null);
        return via ? {
          host: "v2.hocnfl.com", domain: "hocnfl.com",
          via: via
        } : null;
      })();
      const linkHostHidden = true; // origin discovery found nothing
      ok("render selection: hidden + flagged (this " +
         "message, RC03's failing shape) selects the " +
         "Cloudflare section, NOT the plain hidden note",
        !!(linkHostHidden && linkCloudflare) &&
        linkCloudflare.host === "v2.hocnfl.com" &&
        linkCloudflare.domain === "hocnfl.com" &&
        linkCloudflare.via === "ip");
      ok("render selection: the source keeps the " +
         "Cloudflare branch ahead of the plain-note " +
         "branch in renderDomainTraceSections",
        (function () {
          const cfAt = contentSrc.indexOf(
            "a.linkHostHidden && a.linkCloudflare");
          const noteAt = contentSrc.indexOf(
            "} else if (a.linkHostHidden) {");
          return cfAt !== -1 && noteAt !== -1 && cfAt < noteAt;
        })());
      ok("gating source: the link branch decides through " +
         "cloudflareViaFor(info, v) and falls back to " +
         "decideCf(null) when the lib check is absent",
        contentSrc.indexOf(
          "SA.cloudflareViaFor(info, v)") !== -1 &&
        contentSrc.indexOf("return decideCf(null);") !== -1);

      // ---------- failure hygiene ----------
      return SA.cloudflareFrontedFor("v9.hocnfl.com")
        .then(function (v1) {
          ok("hygiene: with its A queries failing, the " +
             "check resolves null (silent, as designed)",
            v1 === null);
          failHosts["v9.hocnfl.com"] = false;
          return SA.cloudflareFrontedFor("v9.hocnfl.com");
        }).then(function (v2) {
          ok("hygiene: the null was NOT cached — the same " +
             "host answers on the next open and flags " +
             "(RC03 cached the failure for the session)",
            !!v2 && v2.fronted === true);
          return SA.cloudflareFrontedFor("v8.hocnfl.com");
        }).then(function (v3) {
          ok("hygiene: one failed A query is retried — " +
             "a single transient failure no longer " +
             "decides the lane",
            !!v3 && v3.fronted === true &&
            v8FailuresLeft === 0);

          // ---------- front-door range alignment ----------
          ok("ranges: 104.24.0.0/14 is a front-door range " +
             "now (a host living only there enters the " +
             "branch like any other Cloudflare host)",
            SA.isFrontDoorIp("104.24.9.9") === true &&
            SA.isFrontDoorIp("104.27.255.255") === true &&
            SA.isFrontDoorIp("104.28.0.1") === false);
          finish();
        });
    });
}).catch(function (e) {
  ok("live-path drive completed without rejection", false,
    String(e && e.message || e));
  finish();
});
