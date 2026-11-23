/* Spam Avenger for Gmail — background worker (v1.0.73).
 *
 * A thin network proxy for the panel, and nothing more. It
 * exists for one reason: the lane-gating checks need to fetch
 * the SENDER's and the LINK's websites (arbitrary hosts a
 * content script cannot read — page-origin CORS), read DNS
 * answers, and enumerate subdomains via crt.sh. All decisions
 * are made by lib/analyze.js in the panel; this file only
 * fetches and hands back raw facts.
 *
 * It runs as a service worker in Chrome and as an event page
 * in Firefox (the manifest carries both background keys and
 * points them at this one file — hence: no importScripts, no
 * DOM, no state worth keeping). Messages are accepted only in
 * the { sa: 1, kind: ... } shape the content script sends,
 * hostnames are validated before any fetch, and every fetch
 * is credential-free with a short timeout — a probe must never
 * hang the panel.
 */
(function () {
  "use strict";

  var api = (typeof chrome !== "undefined" && chrome.runtime)
    ? chrome : ((typeof browser !== "undefined") ? browser : null);
  if (!api || !api.runtime || !api.runtime.onMessage) return;

  var HOST_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

  function fetchText(url, timeoutMs, cap) {
    return new Promise(function (resolve) {
      var ctl = (typeof AbortController !== "undefined")
        ? new AbortController() : null;
      var timer = setTimeout(function () {
        if (ctl) { try { ctl.abort(); } catch (e) {} }
      }, timeoutMs);
      var done = false;
      function finish(v) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(v);
      }
      var p;
      try {
        p = fetch(url, {
          credentials: "omit",
          redirect: "follow",
          signal: ctl ? ctl.signal : undefined,
          headers: { "Accept": "text/html,application/xhtml+xml,*/*" }
        });
      } catch (e) {
        finish(null);
        return;
      }
      Promise.resolve(p).then(function (res) {
        var finalHost = "";
        try {
          finalHost = new URL(res.url).hostname || "";
        } catch (e) {}
        var out = {
          status: res.status,
          finalUrl: res.url || url,
          finalHost: finalHost,
          contentType: (res.headers && res.headers.get)
            ? (res.headers.get("content-type") || "") : ""
        };
        // Bodies are read only for page-shaped answers; the
        // classification needs a snippet, never the whole page.
        if (!/html|text|xhtml/i.test(out.contentType) &&
            out.contentType !== "") {
          out.text = "";
          out.raw = "";
          finish(out);
          return;
        }
        res.text().then(function (t) {
          var full = String(t || "");
          out.raw = full.slice(0, cap);
          out.text = full.replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
            .trim().slice(0, 4000);
          finish(out);
        }, function () {
          out.text = "";
          out.raw = "";
          finish(out);
        });
      }, function (err) {
        finish({ error: String((err && err.name) || "fetch-failed") });
      });
    });
  }

  // Probe one host's website: HTTPS first (the modern web),
  // plain HTTP when HTTPS fails outright at network level.
  // An HTTP error status is still an ANSWER (a real server
  // refusing is a real server) — only a network failure falls
  // through to the second scheme.
  function probeSite(host) {
    if (!HOST_RE.test(String(host || ""))) {
      return Promise.resolve({ outcome: "error", error: "bad-host" });
    }
    return fetchText("https://" + host + "/", 6000, 9000)
      .then(function (r) {
        if (r && !r.error) {
          return { outcome: "response", status: r.status,
            finalUrl: r.finalUrl, finalHost: r.finalHost,
            contentType: r.contentType, text: r.text, raw: r.raw };
        }
        return fetchText("http://" + host + "/", 6000, 9000)
          .then(function (r2) {
            if (r2 && !r2.error) {
              return { outcome: "response", status: r2.status,
                finalUrl: r2.finalUrl, finalHost: r2.finalHost,
                contentType: r2.contentType, text: r2.text,
                raw: r2.raw };
            }
            return { outcome: "error",
              error: (r2 && r2.error) || (r && r.error) || "fetch-failed" };
          });
      });
  }

  // One DNS-over-HTTPS question, answered as the parsed reply
  // (or null). dns.google is already a permitted host; running
  // it here keeps the origin-discovery queries in one place.
  function doh(name, type) {
    var n = String(name || "").toLowerCase().replace(/\.$/, "");
    var t = String(type || "A").toUpperCase();
    if (!HOST_RE.test(n) ||
        ["A", "AAAA", "MX", "TXT", "CNAME"].indexOf(t) === -1) {
      return Promise.resolve(null);
    }
    return fetchText("https://dns.google/resolve?name=" +
      encodeURIComponent(n) + "&type=" + encodeURIComponent(t),
      5000, 60000).then(function (r) {
        if (!r || r.error || !r.raw) return null;
        try { return JSON.parse(r.raw); } catch (e) { return null; }
      });
  }

  // Subdomain enumeration from Certificate Transparency
  // (crt.sh): every name that has ever carried a certificate
  // for this domain. Returns the de-duplicated hostname list
  // (wildcards stripped, the apex itself dropped), or null
  // when the service can't be reached — callers treat null as
  // "no extra candidates", never as an error.
  function crtsh(domain) {
    var d = String(domain || "").toLowerCase().replace(/\.$/, "")
      .replace(/^www\./, "");
    if (!HOST_RE.test(d)) return Promise.resolve(null);
    return fetchText("https://crt.sh/?q=%25." +
      encodeURIComponent(d) + "&output=json", 8000, 400000)
      .then(function (r) {
        if (!r || r.error || !r.raw) return null;
        var rows;
        try { rows = JSON.parse(r.raw); } catch (e) { return null; }
        if (!Array.isArray(rows)) return null;
        var seen = {};
        var out = [];
        rows.forEach(function (row) {
          var names = String((row && row.name_value) || "")
            .split(/\n/);
          names.forEach(function (nm) {
            nm = nm.trim().toLowerCase()
              .replace(/^\*\./, "").replace(/\.$/, "");
            if (nm && nm !== d && !seen[nm] &&
                nm.endsWith("." + d)) {
              seen[nm] = 1;
              out.push(nm);
            }
          });
        });
        return out.slice(0, 300);
      });
  }

  api.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg || msg.sa !== 1) return false;
    if (msg.kind === "probe") {
      probeSite(msg.host).then(sendResponse);
      return true;
    }
    if (msg.kind === "doh") {
      doh(msg.name, msg.type).then(sendResponse);
      return true;
    }
    if (msg.kind === "crtsh") {
      crtsh(msg.domain).then(sendResponse);
      return true;
    }
    return false;
  });
})();
