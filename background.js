/* Spam Avenger for Thunderbird — background worker (v1.0.74).
 *
 * Three jobs:
 *
 *  0. Inject reportfill.js into report-form tabs. Thunderbird's static
 *     manifest `content_scripts` do NOT reach ordinary web pages opened
 *     in a Thunderbird tab, so the FTC / Safe Browsing / Google Cloud
 *     guide banners would never appear without this dynamic injection.
 *
 * Two jobs, both network/API proxies for the popup:
 *
 *  1. The lane-gating checks need to fetch the SENDER's and the LINK's
 *     websites (arbitrary hosts a popup cannot read itself), read DNS
 *     answers, and enumerate subdomains via crt.sh. All decisions are
 *     made by lib/analyze.js in the popup; this file only fetches and
 *     hands back raw facts.
 *
 *  2. A message-display bridge: callers that prefer runtime messaging
 *     can ask for the currently viewed Thunderbird message and receive
 *     its raw RFC 822 source plus the decoded header metadata. The
 *     popup fetches directly when it can and uses this as a fallback.
 *
 * No DOM, no state worth keeping. Messages are accepted only in the
 * { sa: 1, kind: ... } shape, hostnames are validated before any fetch,
 * and every fetch is credential-free with a short timeout — a probe
 * must never hang the popup.
 */
(function () {
  "use strict";

  var api = (typeof browser !== "undefined" && browser.runtime)
    ? browser : ((typeof chrome !== "undefined" && chrome.runtime) ? chrome : null);
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

  // The currently displayed Thunderbird message: raw source + the
  // header metadata Thunderbird already decoded. This is the same data
  // popup.js obtains directly; exposing it here lets any panel caller
  // reach it through browser.runtime.sendMessage as well.
  function displayedMessage() {
    if (!api.tabs || !api.messageDisplay || !api.messages) {
      return Promise.resolve(null);
    }
    return api.tabs.query({ active: true, currentWindow: true })
      .then(function (tabs) {
        if (!tabs || !tabs.length || tabs[0].id == null) return null;
        if (api.messageDisplay.getDisplayedMessage) {
          return Promise.resolve(
            api.messageDisplay.getDisplayedMessage(tabs[0].id));
        }
        if (api.messageDisplay.getDisplayedMessages) {
          return Promise.resolve(
            api.messageDisplay.getDisplayedMessages(tabs[0].id))
            .then(function (r) {
              return Array.isArray(r) ? r[0]
                : (r && r.messages ? r.messages[0] : null);
            });
        }
        return null;
      })
      .then(function (message) {
        if (!message || message.id == null) return null;
        function addrs(list) {
          return (list || []).map(function (p) { return p && p.email || ""; })
            .filter(function (e) { return !!e; });
        }
        // Ask for the full IMAP source; retry without options on builds
        // that do not support { download: true }.
        var p = null;
        try { p = api.messages.getRaw(message.id, { download: true }); }
        catch (e) {}
        if (!p || typeof p.then !== "function") {
          try { p = api.messages.getRaw(message.id); } catch (e) { p = ""; }
        }
        return Promise.resolve(p).catch(function () {
          try { return api.messages.getRaw(message.id); }
          catch (e) { return ""; }
        }).then(function (raw) {
          var source = String(raw == null ? "" : raw);
          // A cached IMAP slice can lack the Received chain, which is
          // where the sending server/IP live. Restore it from getFull().
          var head = source.split(/\r?\n\r?\n/)[0];
          if (source && /(^|\r?\n)[ \t]*received[ \t]*:/i.test(head)) {
            return source;
          }
          if (!api.messages.getFull) return source;
          return Promise.resolve(api.messages.getFull(message.id))
            .then(function (full) {
              var lines = ((full && full.headers) || []).map(function (h) {
                return String(h.name || "") + ": " +
                  String(h.value || "").replace(/\r?\n/g, " ");
              });
              if (!lines.length) return source;
              return source ? lines.join("\r\n") + "\r\n" + source
                : lines.join("\r\n") + "\r\n\r\n";
            }, function () { return source; });
        }).then(function (source) {
          return {
            id: message.id,
            rawSource: source,
            metadata: {
              author: String(message.author || ""),
              subject: String(message.subject || ""),
              date: message.date ? String(message.date) : "",
              recipients: addrs(message.recipients),
              cc: addrs(message.cc),
              messageId: String(message.headerMessageId || "")
            }
          };
        });
      })
      .catch(function () { return null; });
  }

  /* ---------- report-form filler: dynamic registration + injection ---------- */

  // Thunderbird's manifest `content_scripts` never fire for regular
  // web pages opened in a Thunderbird tab — those tabs are not mail
  // documents, so the static matches are ignored. Dynamically register
  // the filler as a real content script (the mechanism Thunderbird
  // supports), and keep the per-tab executeScript below as a fallback
  // for a page that was already open when the worker started.
  // The `tabs` permission is REQUIRED: without it Tab.url and
  // changeInfo.url are stripped out, so URL-based injection silently
  // never fires.
  var FILLER_ID = "spam-avenger-reportfill";
  var FILLER_MATCHES = [
    "https://safebrowsing.google.com/*",
    "https://reportfraud.ftc.gov/*",
    "https://support.google.com/*"
  ];
  var injectedUrls = {}; // tabId -> URL already handled for this load

  // Register once per worker startup. A duplicate id (worker restarted
  // without unregistering) is harmless — catch it and carry on.
  if (api.scripting && api.scripting.registerContentScripts) {
    try {
      Promise.resolve(api.scripting.registerContentScripts([{
        id: FILLER_ID,
        matches: FILLER_MATCHES,
        js: ["reportfill.js"],
        runAt: "document_idle"
      }])).catch(function () {});
    } catch (e) {}
  }

  function reportPageUrl(rawUrl) {
    if (!rawUrl || /^(about|moz-extension|chrome-extension|data):/i.test(
        rawUrl)) return false;
    var u;
    try { u = new URL(rawUrl); } catch (e) { return false; }
    var host = (u.hostname || "").toLowerCase();
    if (host === "safebrowsing.google.com" ||
        host === "reportfraud.ftc.gov") return true;
    return host === "support.google.com" &&
      (u.pathname || "").indexOf("cloud_platform_report") !== -1;
  }

  function injectReportFill(tabId, url) {
    if (tabId == null || !api.scripting ||
        !api.scripting.executeScript) return;
    if (injectedUrls[tabId] === url) return;
    injectedUrls[tabId] = url;
    // Probe first: on a host where the static content script did run,
    // reportfill.js is already active (it sets this flag on entry).
    // Injecting a second copy would stack banners and double-fill.
    Promise.resolve(api.scripting.executeScript({
      target: { tabId: tabId },
      func: function () {
        return !!window.__spamAvengerReportFillLoaded;
      }
    })).then(function (results) {
      var loaded = Array.isArray(results) && results.some(function (r) {
        return !!(r && r.result);
      });
      if (loaded) return null;
      return api.scripting.executeScript({
        target: { tabId: tabId },
        files: ["reportfill.js"]
      });
    }).catch(function () {
      // A tab can close or navigate mid-injection. Drop the cache so a
      // later event gets another chance, and never leak a rejection.
      delete injectedUrls[tabId];
    });
  }

  if (api.tabs && api.tabs.onUpdated) {
    api.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
      if (!tab) return;
      // A reload creates a fresh document with a fresh filler marker;
      // clear the per-tab cache so the fallback can run again.
      if (changeInfo.status === "loading") {
        delete injectedUrls[tabId];
        return;
      }
      if (changeInfo.status !== "complete" && !changeInfo.url) return;
      var url = changeInfo.url || tab.url || "";
      if (!reportPageUrl(url)) {
        delete injectedUrls[tabId];
        return;
      }
      injectReportFill(tabId, url);
    });
  }
  if (api.tabs && api.tabs.onCreated) {
    api.tabs.onCreated.addListener(function (tab) {
      if (tab && tab.url && reportPageUrl(tab.url)) {
        injectReportFill(tab.id, tab.url);
      }
    });
  }
  // Tabs already showing a report form when the extension (re)loads.
  if (api.tabs && api.tabs.query) {
    Promise.resolve(api.tabs.query({})).then(function (tabs) {
      (tabs || []).forEach(function (t) {
        if (t && t.url && reportPageUrl(t.url)) {
          injectReportFill(t.id, t.url);
        }
      });
    }).catch(function () {});
  }

  api.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg || msg.sa !== 1) return false;
    if (msg.kind === "displayedMessage") {
      displayedMessage().then(sendResponse);
      return true;
    }
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
