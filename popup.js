/* Spam Avenger for Thunderbird — message-display popup orchestrator.
 *
 * This replaces the old Gmail content script as the entry point. There is
 * no mail.google.com DOM to scrape: Thunderbird hands us the message that
 * is currently on screen through its own WebExtension APIs, and we feed
 * the raw source (the complete RFC 822 message, Received headers included)
 * straight into lib/analyze.js. Message metadata from the Thunderbird
 * message header (author, subject, date, recipients) is passed along as a
 * fallback for anything the raw headers do not carry.
 *
 * The panel UI itself still lives in content.js; it is now loaded by this
 * popup as a plain module (window.SpamAvengerUI) instead of being injected
 * into a web page. This file provides the "host bridge" that UI uses for
 * everything that has to leave the popup: stashing the drafted complaint
 * for reportfill.js, opening the report site in a real browser tab, and
 * popping the panel out into a persistent Thunderbird tab.
 *
 * Tab mode: the panel's "Open in tab" control opens
 *   browser.runtime.getURL("popup.html") + "?tabView=1&messageId=<id>"
 * as a regular tab (focusing an existing one when present). In that tab
 * there is no active mail tab to query (the active tab IS the panel), so
 * the message is loaded by id through browser.messages.get() instead.
 * While the tab is open, messageDisplay.onMessageDisplayed keeps it in
 * sync with whichever email the user clicks in Thunderbird.
 */
(function () {
  "use strict";

  // Thunderbird exposes `browser` (Promise based). Chrome-style `chrome`
  // is kept only as a benign fallback so the same file stays testable.
  var api = (typeof browser !== "undefined" && browser && browser.runtime)
    ? browser
    : ((typeof chrome !== "undefined" && chrome && chrome.runtime) ? chrome : null);

  var VERSION = (function () {
    try {
      return (api && api.runtime && api.runtime.getManifest &&
        api.runtime.getManifest().version) || "unknown";
    } catch (e) { return "unknown"; }
  })();

  var SLOT_ID = "sa-panel-slot";
  var STATUS_ID = "sa-status";

  // The persistent tab carries the message id (and, when known, the
  // account email) in its URL. The regular message_display_action
  // dropdown has neither parameter and uses the active mail tab instead.
  var params = new URLSearchParams(window.location.search || "");
  // Accept the old ?detached=1 link too, so a tab opened by an older
  // build still loads cleanly.
  var TAB_VIEW = params.get("tabView") === "1" ||
    params.get("detached") === "1";
  // Thunderbird uses the document title as the tab label. Give the
  // persistent panel tab a short, recognizable name.
  if (TAB_VIEW) {
    try { document.title = "SpamAvenger"; } catch (e) {}
  }
  var URL_MESSAGE_ID = params.get("messageId") || "";
  var URL_ACCOUNT_EMAIL = params.get("accountEmail") || "";

  // Everything the UI needs to know about the message behind this popup.
  // Populated once by loadDisplayedMessage().
  var context = {
    message: null,
    rawSource: "",
    metadata: { author: "", subject: "", date: "", recipients: [], messageId: "" },
    accountEmail: URL_ACCOUNT_EMAIL,
    accountName: "",
    detached: TAB_VIEW
  };

  var hydratedOnce = false;

  function status(text) {
    try {
      var el = document.getElementById(STATUS_ID);
      if (el) el.textContent = text || "";
    } catch (e) {}
  }

  /* ---------------- Thunderbird message access ---------------- */

  // Thunderbird message ids are numbers. Accept the numeric string the
  // "Open in tab" URL carries (or the numeric backup in storage) and hand
  // messages.get a real Number — a string id makes some builds reject
  // the lookup, which used to leave the panel spinning forever.
  function normalizeId(value) {
    if (value == null || value === "") return null;
    var n = Number(value);
    return isFinite(n) && n > 0 ? n : null;
  }

  function errorText(err) {
    try { return String((err && err.message) || err || "unknown error"); }
    catch (e) { return "unknown error"; }
  }

  // A stuck extension API must never leave the popup on its spinner.
  function withTimeout(promise, ms, message) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (!done) { done = true; reject(new Error(message)); }
      }, ms);
      Promise.resolve(promise).then(function (v) {
        if (!done) { done = true; clearTimeout(timer); resolve(v); }
      }, function (e) {
        if (!done) { done = true; clearTimeout(timer); reject(e); }
      });
    });
  }

  // Backup path: "Open in tab" writes { detachedMessageId } to local
  // storage just before creating the tab, in case the URL is altered
  // or the id parameter is dropped on the way in. The key keeps its old
  // name so links written by earlier builds still work.
  function readBackupId() {
    if (!api || !api.storage || !api.storage.local ||
        !api.storage.local.get) return Promise.resolve(null);
    return new Promise(function (resolve) {
      try {
        var r = api.storage.local.get("detachedMessageId");
        if (r && typeof r.then === "function") {
          r.then(function (items) {
            resolve(normalizeId(items && items.detachedMessageId));
          }, function () { resolve(null); });
        } else {
          resolve(null);
        }
      } catch (e) { resolve(null); }
    });
  }

  // The panel tab's active tab is the panel itself, so it must never
  // call tabs.query here. The URL id is authoritative; storage is only a
  // fallback when that id is missing or unusable.
  function getMessageById() {
    if (!api.messages || !api.messages.get) {
      return Promise.reject(
        new Error("browser.messages.get is unavailable"));
    }
    var fromUrl = normalizeId(
      new URLSearchParams(window.location.search).get("messageId"));
    var lookup = fromUrl != null ? Promise.resolve(fromUrl) : readBackupId();
    return lookup.then(function (id) {
      if (id == null) {
        throw new Error("No message id was supplied to this panel tab");
      }
      return withTimeout(
        Promise.resolve(api.messages.get(id)), 10000,
        "Thunderbird did not return the message."
      ).then(function (message) {
        if (!message || message.id == null) {
          throw new Error("Thunderbird could not find that message");
        }
        return message;
      }, function (err) {
        throw new Error("Could not open message " + id + ": " + errorText(err));
      });
    });
  }

  // The message the user is looking at. Thunderbird's messageDisplay API
  // resolves it from the active mail tab — no Gmail legacy message ids,
  // no "show original" HTTP request, no session key. This is exactly:
  //
  //   const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  //   const message = await browser.messageDisplay.getDisplayedMessage(tabs[0].id);
  //   const rawSource = await browser.messages.getRaw(message.id, { download: true });
  //
  // written in promise style so the same code runs in older Thunderbird
  // builds that still accept callback-style WebExtension APIs.
  function getDisplayedMessage() {
    if (!api || !api.messages) {
      return Promise.reject(new Error("Thunderbird message APIs are unavailable"));
    }
    // Panel tab: the active tab is this popup, not a mail tab, so
    // messageDisplay.getDisplayedMessage() and tabs.query must not be
    // called at all. Load the exact numeric id from the URL (or its
    // storage backup) instead.
    if (TAB_VIEW || URL_MESSAGE_ID) {
      return getMessageById();
    }
    if (!api.tabs || !api.messageDisplay) {
      return Promise.reject(new Error("Thunderbird message APIs are unavailable"));
    }
    return api.tabs.query({ active: true, currentWindow: true })
      .then(function (tabs) {
        if (!tabs || !tabs.length || tabs[0].id == null) {
          throw new Error("No active Thunderbird mail tab");
        }
        // getDisplayedMessage is the single-message API Thunderbird
        // documents. getDisplayedMessages (multi-selection) is a fallback
        // for builds that only expose the plural form.
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
        throw new Error("browser.messageDisplay.getDisplayedMessage is unavailable");
      });
  }

  // The IMAP case that produced "Couldn't find the sending server in the
  // headers": getRaw() without options can return whatever is cached
  // locally — a headers-only slice with no Received chain. Asking for a
  // download fixes that when the API supports the options argument;
  // older builds that reject it get a plain retry.
  function getRawSource(id) {
    if (!api.messages || !api.messages.getRaw) {
      return Promise.reject(new Error("browser.messages.getRaw is unavailable"));
    }
    var p = null;
    try { p = api.messages.getRaw(id, { download: true }); } catch (e) {}
    if (p && typeof p.then === "function") {
      return p.catch(function () {
        try { return api.messages.getRaw(id); }
        catch (e) { return ""; }
      });
    }
    return Promise.resolve(p || "");
  }

  function addresses(list) {
    var out = [];
    (list || []).forEach(function (pair) {
      if (pair && pair.email) out.push(pair.email);
    });
    return out;
  }

  function metadataFromMessage(message) {
    var m = message || {};
    return {
      author: String(m.author || ""),
      subject: String(m.subject || ""),
      date: m.date ? String(m.date) : "",
      recipients: addresses(m.recipients),
      cc: addresses(m.cc),
      bcc: addresses(m.bcc),
      messageId: String(m.headerMessageId || m.messageId || "")
    };
  }

  // Load the full raw message plus its Thunderbird metadata for a message
  // that has ALREADY been resolved (from the active tab on first open, or
  // from onMessageDisplayed when the panel tab is following the user).
  // The raw source is what analyze.js really parses; the metadata is
  // handed in alongside it so headers Thunderbird decoded are not lost.
  function hydrateMessage(message, onProgress) {
    function prog(s) { if (onProgress) { try { onProgress(s); } catch (e) {} } }
    if (!message || message.id == null) {
      return Promise.reject(new Error("No message is displayed in Thunderbird"));
    }
    context.message = message;
    context.metadata = metadataFromMessage(message);
    // The first load can trust the account email in the tab URL. After a
    // live sync the user may have switched to a different account, so
    // resolve the identity again from the new message's recipients/folder.
    if (!hydratedOnce && URL_ACCOUNT_EMAIL) {
      context.accountEmail = URL_ACCOUNT_EMAIL;
    } else {
      context.accountEmail = "";
    }
    context.accountName = "";
    hydratedOnce = true;
    prog("Reading the complete message source…");
    return Promise.resolve(getRawSource(message.id)).then(function (rawSource) {
      context.rawSource = String(rawSource == null ? "" : rawSource);
      var SA = window.SpamAvenger || {};
      if (context.rawSource && SA.hasReceivedHeaders &&
          SA.hasReceivedHeaders(context.rawSource)) {
        return null; // complete source — its headers are the evidence
      }
      // Empty source, or a trimmed one missing the Received chain: the
      // sending IP/server live there, so restore them from getFull()'s
      // structured headers (full.headers.received) before analyzing.
      prog("Restoring the Received headers…");
      if (!api.messages || !api.messages.getFull) return null;
      return Promise.resolve(api.messages.getFull(context.message.id))
        .then(function (full) {
          if (SA.rawFromFull) {
            context.rawSource = SA.rawFromFull(full, context.rawSource);
          } else if (!context.rawSource && full && full.headers) {
            // Defensive fallback if an older analyze.js is loaded.
            context.rawSource = (full.headers || []).map(function (h) {
              return String(h.name || "") + ": " +
                String(h.value || "").replace(/\r?\n/g, " ");
            }).join("\r\n") + "\r\n\r\n";
          }
          return full;
        }, function () { return null; });
    }).then(function () {
      if (!context.rawSource) {
        throw new Error("Thunderbird returned no readable message source");
      }
      prog("Finding account identity…");
      return loadAccountIdentity().catch(function () { return null; });
    }).then(function () {
      return context;
    });
  }

  function loadDisplayedMessage(onProgress) {
    function prog(s) { if (onProgress) { try { onProgress(s); } catch (e) {} } }
    prog("Finding the open message…");
    return getDisplayedMessage().then(function (message) {
      return hydrateMessage(message, onProgress);
    });
  }

  // The signed-in account's own address / name. Used by the panel's
  // "send as" hint and by the own-forward catch, replacing the old
  // Gmail page-aria-label scrape.
  function loadAccountIdentity() {
    // The panel tab already knows the sending account from its URL.
    if (context.accountEmail) return Promise.resolve(null);
    if (!api || !api.accounts || !api.accounts.list) return Promise.resolve(null);
    return api.accounts.list().then(function (accounts) {
      var msg = context.message || {};
      var candidate = null;
      (accounts || []).forEach(function (acct) {
        if (candidate) return;
        if (msg.folder && acct.identities) {
          // Prefer the identity whose email received this message.
          var tos = context.metadata.recipients || [];
          for (var i = 0; i < acct.identities.length; i++) {
            var id = acct.identities[i];
            if (id && tos.indexOf(String(id.email || "").toLowerCase()) !== -1) {
              candidate = id;
              return;
            }
          }
        }
        if (!candidate && acct.identities && acct.identities.length) {
          candidate = acct.identities[0];
        }
      });
      if (candidate) {
        context.accountEmail = String(candidate.email || "");
        context.accountName = String(candidate.fullName || candidate.userName || "");
      }
      return candidate;
    });
  }

  /* ---------------- Thunderbird-native host bridge ----------------
   * content.js calls these through window.SpamAvengerHost. Keeping the
   * stash-and-open sequence here guarantees reportfill.js sees the
   * drafted complaint before the report tab starts loading.
   */

  function stashReport(lane) {
    var a = (window.SpamAvengerUI && window.SpamAvengerUI.currentAnalysis &&
      window.SpamAvengerUI.currentAnalysis()) || null;
    if (!a) return Promise.resolve(false);
    var SA = window.SpamAvenger || {};
    var stash = {
      urls: (a.urls || []).slice(0, 10),
      from: a.from || context.metadata.author || "",
      subject: a.subject || context.metadata.subject || "",
      ip: a.ip || "",
      server: a.host || "",
      sextortion: !!(a.sextortion && a.sextortion.flagged),
      wallet: (a.sextortion && a.sextortion.wallet) || null,
      fromSpoofed: !!(SA.fromAddressSpoofed && SA.fromAddressSpoofed(a)),
      lane: lane || "",
      savedAt: Date.now()
    };
    if (!api || !api.storage || !api.storage.local) return Promise.resolve(false);
    return new Promise(function (resolve) {
      try {
        var r = api.storage.local.set({ pendingReport: stash });
        if (r && typeof r.then === "function") {
          r.then(function () { resolve(true); }, function () { resolve(false); });
        } else {
          resolve(true); // callback-style WebExtension API
        }
      } catch (e) { resolve(false); }
    });
  }

  // The tab a new workflow tab should sit to the right of. Inside the
  // persistent panel, tabs.getCurrent() is the Spam Avenger tab itself;
  // from the toolbar dropdown, the active tab is the email being read.
  function workflowBaseTab() {
    if (!api || !api.tabs) return Promise.resolve(null);
    if (TAB_VIEW && api.tabs.getCurrent) {
      return Promise.resolve(api.tabs.getCurrent()).then(function (tab) {
        return tab || activeMailTab();
      }, function () { return activeMailTab(); });
    }
    return activeMailTab();
  }

  // Open an external report form immediately to the right of the base
  // tab: [Email] -> [Spam Avenger] -> [FTC / Safe Browsing / Abuse form].
  function openTab(url) {
    var u = String(url || "");
    if (!u) return Promise.resolve(false);
    if (!api || !api.tabs || !api.tabs.create) {
      try {
        if (typeof window !== "undefined") {
          window.open(u, "_blank", "noopener");
          return Promise.resolve(true);
        }
      } catch (e) {}
      return Promise.resolve(false);
    }
    return workflowBaseTab().then(function (baseTab) {
      return createAdjacentTab(u, baseTab);
    });
  }

  // Open an abuse/government form in a real browser tab. The complaint
  // data is written to storage FIRST, then the tab is created — the
  // reportfill.js content script in that tab must never win the race.
  function openReportForm(url, lane) {
    var target = String(url || "");
    return stashReport(lane).then(function () {
      openTab(target);
      return true;
    });
  }

  // Thunderbird's native compose window. No mail.google.com ?view=cm
  // URL is involved any more: the drafted complaint goes straight into
  // a new message the user reviews and sends themselves.
  function composeComplaint(complaint) {
    var c = complaint || {};
    var opts = {
      to: String(c.to || ""),
      subject: String(c.subject || ""),
      isPlainText: true, plainTextBody: String(c.body || ""), body: String(c.body || "")
    };
    var identityEmail = context.accountEmail;
    if (identityEmail && api && api.accounts && api.accounts.list) {
      // beginNew accepts an identityId; resolving it is best effort.
      return api.accounts.list().then(function (accounts) {
        (accounts || []).forEach(function (acct) {
          (acct.identities || []).forEach(function (id) {
            if (!opts.identityId && id && id.email === identityEmail) {
              opts.identityId = id.id;
            }
          });
        });
        return begin(opts);
      }).catch(function () { return begin(opts); });
    }
    return begin(opts);
  }

  function mailtoFallback(opts) {
    // Last-resort fallback so the lane is never dead — for example when
    // the compose permission is not granted in a given installation.
    var url = "mailto:" + encodeURIComponent(opts.to || "") +
      "?subject=" + encodeURIComponent(opts.subject || "") +
      "&body=" + encodeURIComponent(opts.body || "");
    openTab(url);
  }

  function begin(opts) {
    if (api && api.compose && api.compose.beginNew) {
      try {
        return Promise.resolve(api.compose.beginNew(opts)).catch(function () {
          mailtoFallback(opts);
        });
      } catch (e) {
        mailtoFallback(opts);
        return Promise.resolve();
      }
    }
    mailtoFallback(opts);
    return Promise.resolve();
  }

  // Simple external link (provider website, ICANN form, etc.).
  function openExternal(url) { return openTab(url); }

  // Write the id backup BEFORE the tab starts loading, so even a
  // stripped URL can still recover the message.
  function storeBackupId(id) {
    if (!api || !api.storage || !api.storage.local ||
        !api.storage.local.set) return Promise.resolve(false);
    return new Promise(function (resolve) {
      try {
        var r = api.storage.local.set({ detachedMessageId: id });
        if (r && typeof r.then === "function") {
          r.then(function () { resolve(true); }, function () { resolve(false); });
        } else {
          resolve(true);
        }
      } catch (e) { resolve(false); }
    });
  }

  // The query string is appended AFTER runtime.getURL() rather than
  // passed inside it, which keeps the extension URL well formed on all
  // supported Thunderbird builds.
  function tabViewUrl(id) {
    var url = api.runtime.getURL("popup.html") +
      "?tabView=1&messageId=" + encodeURIComponent(id);
    if (context.accountEmail) {
      url += "&accountEmail=" + encodeURIComponent(context.accountEmail);
    }
    return url;
  }

  // Reuse the persistent panel tab instead of stacking duplicates.
  // Requires the manifest's `tabs` permission; any failure degrades to
  // opening a fresh tab.
  function findPanelTab() {
    if (!api || !api.tabs || !api.tabs.query) return Promise.resolve(null);
    return Promise.resolve(api.tabs.query({})).then(function (tabs) {
      var list = Array.isArray(tabs) ? tabs : [];
      for (var i = 0; i < list.length; i++) {
        var t = list[i];
        if (t && t.url &&
            (t.url.indexOf("popup.html?tabView=1") !== -1 ||
             t.url.indexOf("popup.html?detached=1") !== -1)) {
          return t;
        }
      }
      return null;
    }, function () { return null; });
  }

  function focusPanelTab(tab) {
    try {
      if (api.tabs && api.tabs.update && tab.id != null) {
        api.tabs.update(tab.id, { active: true });
      }
      if (api.windows && api.windows.update && tab.windowId != null) {
        api.windows.update(tab.windowId, { focused: true });
      }
    } catch (e) {}
  }

  // The email tab the user was reading when they clicked "Open in tab".
  // Its index is where the panel tab belongs — immediately to its right.
  function activeMailTab() {
    if (!api || !api.tabs || !api.tabs.query) return Promise.resolve(null);
    return Promise.resolve(api.tabs.query({
      active: true, currentWindow: true
    })).then(function (tabs) {
      return (tabs && tabs[0]) || null;
    }, function () { return null; });
  }

  // Move a reused panel tab next to the active mail tab. A move failure
  // is cosmetic — the tab is still focused and usable. Only a real numeric
  // index is safe to pass; Thunderbird rejects other shapes.
  function movePanelTabNextTo(tab, activeTab) {
    if (!api.tabs || !api.tabs.move || tab.id == null ||
        !activeTab || typeof activeTab.index !== "number" ||
        (activeTab.windowId != null && tab.windowId != null &&
         tab.windowId !== activeTab.windowId)) {
      return Promise.resolve(null);
    }
    try {
      return Promise.resolve(api.tabs.move(tab.id, {
        index: activeTab.index + 1
      })).catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }

  // Create a tab immediately to the right of a base tab. Thunderbird
  // MailExtensions commonly reject openerTabId and sometimes reject index
  // when called from a popup, so index is strictly best-effort: if the
  // indexed create fails, retry immediately without it. This is shared by
  // the panel tab and external report forms, keeping the workflow order
  // [Email] -> [Spam Avenger] -> [FTC / Safe Browsing / Abuse form].
  function createAdjacentTab(url, baseTab) {
    if (!api.tabs || !api.tabs.create) return Promise.resolve(false);
    var plain = { url: url, active: true };
    var indexed = null;
    if (baseTab && typeof baseTab.index === "number") {
      indexed = { url: url, active: true, index: baseTab.index + 1 };
    }
    function create(props) {
      try { return Promise.resolve(api.tabs.create(props)); }
      catch (e) { return Promise.reject(e); }
    }
    // No openerTabId: Thunderbird popups frequently reject it outright.
    var attempt = indexed
      ? create(indexed).catch(function () { return create(plain); })
      : create(plain);
    return attempt.then(function () { return true; }, function () { return false; });
  }

  // "Open in tab" replaces the old pop-out window: one persistent
  // Thunderbird tab, placed next to the email the user was reading and
  // focused if already open. The exact numeric message id travels in
  // the URL (with the account email when known) and is also stashed
  // in storage immediately before the tab is created/moved.
  function openInTab(messageId) {
    var id = normalizeId(messageId != null && messageId !== ""
      ? messageId : (context.message && context.message.id));
    if (id == null || !api || !api.runtime || !api.runtime.getURL ||
        !api.tabs || !api.tabs.create) {
      return Promise.resolve(false);
    }
    var url = tabViewUrl(id);
    // A storage failure never blocks the tab — the URL still carries
    // the id.
    return activeMailTab().then(function (activeTab) {
      return storeBackupId(id).then(function () {
        return findPanelTab().then(function (existing) {
          if (existing) {
            return movePanelTabNextTo(existing, activeTab).then(function () {
              focusPanelTab(existing);
              return true;
            });
          }
          return createAdjacentTab(url, activeTab);
        });
      });
    }).then(function (ok) {
      // Called from the toolbar dropdown. Close it only after the tab
      // call has been dispatched, and never from inside the tab itself.
      if (!TAB_VIEW) setTimeout(closeDropdown, 60);
      return ok;
    });
  }

  function closeDropdown() {
    try { if (typeof window.close === "function") window.close(); }
    catch (e) {}
  }

  window.SpamAvengerHost = {
    version: VERSION,
    context: function () { return context; },
    openReportForm: openReportForm,
    composeComplaint: composeComplaint,
    openExternal: openExternal,
    openInTab: openInTab,
    // Old name kept as an alias so any cached UI copy still works.
    openDetached: openInTab,
    tabView: function () { return TAB_VIEW; },
    detached: function () { return TAB_VIEW; },
    messageId: function () {
      return context.message && context.message.id != null
        ? String(context.message.id) : "";
    },
    accountEmail: function () { return context.accountEmail; },
    accountName: function () { return context.accountName; }
  };

  /* ---------------- Boot ---------------- */

  function slot() { return document.getElementById(SLOT_ID); }

  function renderError(err) {
    var msg = errorText(err);
    var s = slot();
    if (s) {
      // Replace the spinner with a plain, readable failure — never leave
      // a panel tab showing "Finding the open message…" forever.
      s.textContent = "";
      var p = document.createElement("p");
      p.className = "sf-warn";
      p.textContent = TAB_VIEW
        ? "Couldn't open that message (v" + VERSION + "): " + msg +
          ". Select another email in Thunderbird to try again."
        : "Something broke (v" + VERSION + "): " + msg +
          ". Select a message in Thunderbird and open this panel again.";
      s.appendChild(p);
    }
    status(TAB_VIEW
      ? "Couldn't open the message — select another email in Thunderbird."
      : "Ready — open a message and try again.");
  }

  // Small always-visible line at the top of the panel: which email's
  // analysis the user is looking at. In tab mode it updates the moment a
  // new message arrives, so the panel never looks silently stale.
  function updateSyncLine(message) {
    var el = document.getElementById("sa-sync-line");
    if (!el) return;
    var m = message || context.message || {};
    var subject = String(m.subject || context.metadata.subject ||
      "(no subject)");
    var sender = String(m.author || context.metadata.author ||
      "unknown sender");
    el.textContent = "Loaded: " + subject + " — " + sender +
      (TAB_VIEW ? " · auto-sync on" : "");
    el.title = "Subject: " + subject + "\nSender: " + sender;
    el.classList.add("visible");
  }

  // Keep the tab's URL id in step with the message being shown, so a
  // reload of the tab lands on the same email.
  function syncTabUrl(id) {
    if (!TAB_VIEW || id == null) return;
    try {
      var q = "?tabView=1&messageId=" + encodeURIComponent(id);
      if (context.accountEmail) {
        q += "&accountEmail=" + encodeURIComponent(context.accountEmail);
      }
      history.replaceState(null, "", "popup.html" + q);
    } catch (e) {}
  }

  // Feed the current context into the analysis engine and render it.
  // Shared by the first load and every onMessageDisplayed sync.
  function renderAnalysis(body, onStep) {
    var UI = window.SpamAvengerUI;
    UI.setContext({
      rawSource: context.rawSource,
      message: context.message,
      metadata: context.metadata,
      accountEmail: context.accountEmail,
      accountName: context.accountName,
      detached: TAB_VIEW,
      messageKey: context.metadata.messageId ||
        (context.message && String(context.message.id)) || ""
    });
    status("Analyzing the message…");
    // Feed the RAW SOURCE and the Thunderbird metadata directly into
    // the analysis engine. No DOM selectors, no show-original fetch.
    return Promise.resolve(window.SpamAvenger.investigate(
      context.rawSource, onStep, context.metadata
    )).then(function (analysis) {
      status("Report ready — review the lanes below.");
      UI.renderResult(body, analysis);
      // The data-deletion lane also consumes the message metadata: it
      // derives the company domain from the sender address.
      try {
        UI.attachDemandSection(body, ctxForDemand(), analysis);
      } catch (e) {}
      return analysis;
    });
  }

  // Thunderbird builds differ: MV3 documents onMessagesDisplayed(tab,
  // MessageList), while some builds expose onMessageDisplayed(tab,
  // message). Accept either, handing the callback a single message.
  function addMessageDisplayListener(callback) {
    var md = api && api.messageDisplay;
    if (!md) return null;
    if (md.onMessageDisplayed && md.onMessageDisplayed.addListener) {
      md.onMessageDisplayed.addListener(function (tab, message) {
        if (message) callback(message);
      });
      return "onMessageDisplayed";
    }
    if (md.onMessagesDisplayed && md.onMessagesDisplayed.addListener) {
      md.onMessagesDisplayed.addListener(function (tab, displayed) {
        var first = null;
        if (Array.isArray(displayed)) first = displayed[0];
        else if (displayed && displayed.messages) {
          first = displayed.messages[0];
        }
        if (first) callback(first);
      });
      return "onMessagesDisplayed";
    }
    return null;
  }

  // Tab mode only: follow the message the user clicks in Thunderbird.
  // Serialize syncs so a fast click-through cannot interleave two
  // analyses, and ignore repeat notifications for the message already
  // loaded. Never calls tabs.query — the event carries the message.
  function attachDisplaySync(body, onStep) {
    if (!TAB_VIEW) return;
    var lastId = context.message && context.message.id != null
      ? String(context.message.id) : "";
    var chain = Promise.resolve();
    var eventName = addMessageDisplayListener(function (message) {
      if (!message || message.id == null) return;
      var id = String(message.id);
      if (id === lastId) return;
      lastId = id;
      // Show the newly selected email immediately, before analysis.
      updateSyncLine(message);
      var step = function (s) { onStep("Syncing: " + s); };
      chain = chain.then(function () {
        return hydrateMessage(message, step).then(function (ctx) {
          updateSyncLine(ctx.message);
          syncTabUrl(ctx.message.id);
          return renderAnalysis(body, step);
        });
      }).catch(renderError);
    });
    if (!eventName) {
      status("Auto-sync isn't available in this Thunderbird build.");
    }
  }

  function run() {
    var UI = window.SpamAvengerUI;
    if (!UI || !window.SpamAvenger) {
      status("Panel scripts failed to load.");
      return;
    }
    var body = UI.showPanel(slot());
    var onStep = function (s) {
      UI.renderLoading(body, s);
      status(s);
    };
    loadDisplayedMessage(onStep).then(function (ctx) {
      updateSyncLine(ctx.message);
      return renderAnalysis(body, onStep);
    }).then(function () {
      attachDisplaySync(body, onStep);
    }).catch(renderError);
  }

  function ctxForDemand() {
    var m = context.metadata;
    return {
      author: m.author,
      subject: m.subject,
      date: m.date,
      recipients: m.recipients,
      messageId: m.messageId,
      accountEmail: context.accountEmail,
      accountName: context.accountName
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
