/* Spam Avenger for Gmail — content script.
 * Injects the shield button into Gmail, fetches "show original" for the
 * open message, runs the analysis, and renders the results panel.
 * Everything runs locally in your browser. The only network calls are
 * RDAP + reverse-DNS lookups of the SPAMMER's IP.
 *
 * Note: this file deliberately never uses innerHTML. All dynamic text
 * goes through textContent, so there is no HTML-injection surface.
 */
(function () {
  "use strict";

  // v1.0.32: read the version from the manifest so error messages
  // always tag the build that's actually running. The old hardcoded
  // "1.0.25" string survived five releases and made a real error
  // report look like it came from an ancient build.
  var SF_VERSION = (function () {
    try {
      if (typeof chrome !== "undefined" && chrome.runtime &&
          chrome.runtime.getManifest) {
        return chrome.runtime.getManifest().version || "unknown";
      }
    } catch (e) {}
    return "unknown";
  })();
  var BTN_ID = "spam-avenger-btn";
  var PANEL_ID = "spam-avenger-panel";

  // Form lanes (v1.0.64): some hosts act ONLY on reports filed
  // through their own abuse form — the hyperscaler clouds
  // (lib/analyze.js sets a.hyperscaler for Google Cloud / AWS /
  // Azure blocks) and OVHcloud (the v1.0.27 contact/org match in
  // renderResult). For those hosts the panel builds NO email
  // complaint (Michael's call, 2026-10-28): an emailed complaint
  // is deflected to the form anyway, so the section is a FORM
  // KIT instead — the prepared evidence block (lib
  // buildFormEvidence) plus a button opening the provider's
  // form below. Form URLs verified live 2026-10-28. The AWS
  // entry is the abuse-report page AWS itself prints in its
  // blocks' RDAP remarks ("For fastest response, please submit
  // abuse reports via the AWS webform").
  var HYPER_FORM_HINTS = {
    google: { label: "Google Cloud",
      url: "https://support.google.com/code/contact/cloud_platform_report",
      linkText: "support.google.com/code/contact/cloud_platform_report",
      // v1.0.65: the one form-specific pick Joe has to make on
      // the Google form — the spam these reports cover comes
      // off Compute Engine VMs, so that's the service to pick.
      pick: "For the service question, pick Compute Engine." },
    aws: { label: "Amazon AWS",
      url: "https://repost.aws/knowledge-center/report-aws-abuse",
      linkText: "repost.aws/knowledge-center/report-aws-abuse" },
    azure: { label: "Microsoft Azure",
      url: "https://msrc.microsoft.com/report/abuse",
      linkText: "msrc.microsoft.com/report/abuse" }
  };

  // The fourth form lane: OVHcloud (same shape as the table
  // above; its detection is the v1.0.27 contact/org match in
  // renderResult, not a.hyperscaler). The URL is the one the
  // retired v1.0.27 hint chip linked.
  var OVH_FORM_HINT = { label: "OVHcloud",
    url: "https://www.ovhcloud.com/en/abuse/",
    linkText: "ovhcloud.com/en/abuse" };

  // Tiny DOM builder: h("div", {class: "x", id: "y"}, childEl, "text", ...)
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        if (k === "class") el.className = attrs[k];
        else el.setAttribute(k, attrs[k]);
      }
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return el;
  }

  function clearEl(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function accountIndex() {
    var m = location.pathname.match(/\/mail\/u\/(\d+)/);
    return m ? m[1] : "0";
  }

  function messageOpen() {
    // A message/thread view has a legacy message id in the DOM.
    return !!document.querySelector("[data-legacy-message-id]");
  }

  function currentMessageId() {
    var el = document.querySelector("[data-legacy-message-id]");
    return el ? el.getAttribute("data-legacy-message-id") : null;
  }

  // v1.0.63: the ik text scans, hoisted out of ikParam so the async
  // bootstrap hunt below can run the identical patterns over raw
  // server HTML. Serialized markup escapes & as &amp; — match both.
  function scanIkText(text) {
    if (!text) return null;
    var m = text.match(/[?&]ik=([a-f0-9]{6,})/) ||
            text.match(/&amp;ik=([a-f0-9]{6,})/) ||
            text.match(/"ik"\s*:\s*"([a-f0-9]{6,})"/);
    return m ? m[1] : null;
  }

  // Split a JS array literal's contents on top-level commas only —
  // string- and nesting-aware, so "a,b" or [1,2] inside an element
  // never splits it.
  function splitTopLevel(s) {
    var parts = [], depth = 0, inStr = null, esc = false, cur = "";
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (inStr) {
        cur += c;
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === inStr) inStr = null;
        continue;
      }
      if (c === '"' || c === "'") { inStr = c; cur += c; continue; }
      if (c === "[" || c === "{") depth++;
      else if (c === "]" || c === "}") depth--;
      if (c === "," && depth === 0) { parts.push(cur); cur = ""; continue; }
      cur += c;
    }
    if (cur !== "" || s.length) parts.push(cur);
    return parts;
  }

  function unquoteJs(tok) {
    var t = String(tok == null ? "" : tok).replace(/^\s+|\s+$/g, "");
    if (t.length >= 2 &&
        ((t[0] === '"' && t[t.length - 1] === '"') ||
         (t[0] === "'" && t[t.length - 1] === "'"))) {
      return t.slice(1, -1).replace(/\\(.)/g, "$1");
    }
    return t;
  }

  // v1.0.63: pull ik out of a serialized GLOBALS array literal
  // ("GLOBALS=[...]"), where the key sits at index 9 with no label
  // for the regex scans to catch. The shape is validated before the
  // value is trusted.
  function ikFromGlobalsLiteral(text) {
    if (!text) return null;
    var from = 0;
    for (var attempt = 0; attempt < 5; attempt++) {
      var gi = text.indexOf("GLOBALS", from);
      if (gi === -1) return null;
      from = gi + 7;
      var start = text.indexOf("[", gi);
      if (start === -1) return null;
      var depth = 0, inStr = null, esc = false, end = -1;
      for (var i = start; i < text.length; i++) {
        var c = text[i];
        if (inStr) {
          if (esc) esc = false;
          else if (c === "\\") esc = true;
          else if (c === inStr) inStr = null;
          continue;
        }
        if (c === '"' || c === "'") { inStr = c; continue; }
        if (c === "[") depth++;
        else if (c === "]") { depth--; if (depth === 0) { end = i; break; } }
      }
      if (end === -1) continue;
      var items = splitTopLevel(text.slice(start + 1, end));
      if (items.length < 10) continue;
      var v = unquoteJs(items[9]);
      if (v && /^[a-f0-9]{6,}$/.test(v)) return v;
    }
    return null;
  }

  // Every text-based ik source, in order: labeled forms first, then
  // the positional GLOBALS extraction.
  function ikFromRawText(text) {
    return scanIkText(text) || ikFromGlobalsLiteral(text);
  }

  // v1.0.63: fetch the raw Gmail bootstrap HTML and hunt the key in
  // the un-serialized text. Chrome content scripts live in an
  // isolated world — no wrappedJSObject — and the DOM Gmail renders
  // may not expose the key to the sync scans at all (Oct 21 field
  // failure: two ik-less show-original requests, both HTTP 404).
  // The server's own HTML still ships the bootstrap the page booted
  // from, escapes and all, exactly as delivered.
  function fetchIkBootstrap(acct) {
    var p;
    try {
      p = fetch("https://mail.google.com/mail/u/" + acct + "/",
        { credentials: "include" });
    } catch (e) {
      return Promise.resolve(null);
    }
    return Promise.resolve(p).then(function (res) {
      if (!res.ok) return null;
      return res.text();
    }, function () { return null; }).then(function (text) {
      if (typeof text !== "string") return null;
      return ikFromRawText(text);
    });
  }

  function ikParam() {
    // Gmail's session key ("ik") is required by its show-original endpoint.
    // Hunt for it in several places; page markup varies by Gmail version.
    var found = null;
    try {
      // Page-context globals (classic Gmail exposes GLOBALS[9] === ik).
      // Firefox content scripts reach them via wrappedJSObject.
      var pg = (typeof wrappedJSObject !== "undefined") ? wrappedJSObject : window;
      if (pg && pg.GLOBALS && pg.GLOBALS[9] && /^[a-f0-9]{6,}$/.test(pg.GLOBALS[9])) {
        return String(pg.GLOBALS[9]);
      }
    } catch (e) {}
    var pageHtml = "";
    try { pageHtml = document.documentElement.innerHTML; } catch (e) {}
    found = ikFromRawText(pageHtml);
    if (found) return found;
    try {
      var scripts = document.querySelectorAll("script");
      for (var i = 0; i < scripts.length; i++) {
        found = ikFromRawText(scripts[i].textContent || "");
        if (found) return found;
      }
    } catch (e) {}
    return null;
  }

  function shieldSvg() {
    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "26");
    svg.setAttribute("height", "26");
    svg.setAttribute("aria-hidden", "true");
    var paths = [
      ["#fff", "M12 2l8 3v6c0 5-3.5 9.3-8 11-4.5-1.7-8-6-8-11V5l8-3z"],
      ["#c0392b", "M12 4.2l6 2.2v4.9c0 3.9-2.7 7.3-6 8.7-3.3-1.4-6-4.8-6-8.7V6.4l6-2.2z"],
      ["#fff", "M13.2 6.5l-4.9 5.2 2.1 2.1 2.8-3 3.4 4.2 2-1.6-5.4-6.9z"]
    ];
    paths.forEach(function (pd) {
      var p = document.createElementNS(NS, "path");
      p.setAttribute("fill", pd[0]);
      p.setAttribute("d", pd[1]);
      svg.appendChild(p);
    });
    return svg;
  }

  function ensureButton() {
    if (document.getElementById(BTN_ID)) return;
    var btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.title = "Spam Avenger: trace who really sent this email";
    btn.setAttribute("aria-label", btn.title);
    btn.appendChild(shieldSvg());
    btn.addEventListener("click", onShieldClick);
    document.body.appendChild(btn);
  }

  function syncButton() {
    var btn = document.getElementById(BTN_ID);
    if (!btn) return;
    btn.style.display = messageOpen() ? "flex" : "none";
  }

  // Drives Gmail's own "Report phishing" flow for the open message:
  // opens the message's three-dot menu and clicks the menu item.
  // Returns {ok, dbg}; Gmail still asks the user to confirm, so nothing
  // is reported without their say-so.
  function gmailReportPhishing() {
    function fail(dbg) { return { ok: false, dbg: dbg }; }
    try {
      var msgEl = document.querySelector("[data-legacy-message-id]");
      if (!msgEl) return fail("no message element");
      var inDoc = document.querySelectorAll('[aria-label="More message options"]').length;
      var more = null, root = msgEl;
      var labels = ["More message options", "More", "More options"];
      while (root && root !== document.body && !more) {
        for (var l = 0; l < labels.length; l++) {
          more = root.querySelector('[aria-label="' + labels[l] + '"]');
          if (more) break;
        }
        root = root.parentElement;
      }
      if (!more) {
        // Diagnostics: button labels near the message, so the selector
        // can be fixed to match this Gmail layout.
        var seen = [], seenSet = {}, scope = msgEl, u, i, al;
        for (u = 0; u < 4 && scope; u++) scope = scope.parentElement;
        var btns = (scope || document).querySelectorAll("button,[role=button]");
        for (i = 0; i < btns.length && seen.length < 10; i++) {
          al = btns[i].getAttribute("aria-label");
          if (al && !seenSet[al]) { seenSet[al] = 1; seen.push(al); }
        }
        return fail("More buttons in page: " + inDoc +
          "; nearby: " + seen.join(" / "));
      }
      more.click();
      var tries = 0;
      var timer = setInterval(function () {
        tries++;
        var items = document.querySelectorAll(
          '[role="menuitem"],[role="menuitemradio"],[role="menuitemcheckbox"]');
        for (var i = 0; i < items.length; i++) {
          var mt = (items[i].textContent || "").trim().toLowerCase();
          if (mt === "report phishing") {
            clearInterval(timer);
            items[i].click();
            return;
          }
          if (mt === "report not phishing") {
            // Already reported: Gmail swaps the menu item out.
            clearInterval(timer);
            more.click(); // close the menu
            markAlreadyReported();
            return;
          }
        }
        if (tries > 25) clearInterval(timer); // ~5s: give up quietly
      }, 200);
      return { ok: true };
    } catch (e) {
      return fail("exception");
    }
  }

  // Diagnostic helper: aria-labels of buttons near the message, used to
  // fix selectors when Gmail's layout doesn't match expectations.
  function nearbyButtonLabels(msgEl, cap) {
    var seen = [], seenSet = {}, scope = msgEl, u, i, al;
    for (u = 0; u < 4 && scope; u++) scope = scope.parentElement;
    var btns = (scope || document).querySelectorAll("button,[role=button]");
    for (i = 0; i < btns.length && seen.length < (cap || 12); i++) {
      al = btns[i].getAttribute("aria-label");
      if (al && !seenSet[al]) { seenSet[al] = 1; seen.push(al); }
    }
    return seen;
  }

  // Walks up from the message to its "More message options" menu button.
  function findMoreButton(msgEl) {
    var more = null, root = msgEl;
    var labels = ["More message options", "More", "More options"];
    while (root && root !== document.body && !more) {
      for (var l = 0; l < labels.length; l++) {
        more = root.querySelector('[aria-label="' + labels[l] + '"]');
        if (more) break;
      }
      root = root.parentElement;
    }
    return more;
  }

  // Marks the report button "already reported" (message was previously
  // reported: Gmail drops "Report phishing" from the menu and shows a
  // banner instead).
  function markAlreadyReported() {
    var rb2 = document.getElementById("sf-report-phish");
    if (rb2) {
      rb2.disabled = true;
      rb2.textContent = "Already reported to Google \u2713";
      setTimeout(function () {
        rb2.disabled = false;
        rb2.textContent = "Report phishing to Google";
      }, 8000);
    }
  }

  // Forward-to addresses for phishing intake (industry + government).
  var SF_FWD_TO = ["reportphishing@apwg.org", "contact@cisa.dhs.gov"];

  // Opens the message's three-dot menu, clicks its Forward item, then
  // prefills the forward compose's To field with the APWG + CISA intake
  // addresses. The user reviews the forward and hits Send themselves.
  // Updates the panel button directly.
  function gmailForwardPhish() {
    var rb = document.getElementById("sf-fwd-phish");
    // v1.0.64: sf-fwd-phish is an accordion action row now, not a
    // plain button — its label lives in a .sf-acc-label span next
    // to the \u2197 glyph. Status writes go to the span so the glyph
    // survives; fall back to the element itself if the span is
    // ever absent.
    function setLabel(t) {
      if (!rb) return;
      var lbl = rb.querySelector(".sf-acc-label");
      if (lbl) lbl.textContent = t; else rb.textContent = t;
    }
    function fail(dbg) {
      if (rb) {
        rb.disabled = true;
        setLabel("Couldn't open forward (" + String(dbg).slice(0, 160) +
          ") \u2014 forward it manually");
      }
      return { ok: false, dbg: dbg };
    }
    function done() {
      if (rb) {
        setLabel("Forward addressed \u2014 review and hit Send");
        // Re-arm: if the user closed the compose without sending,
        // they get the button back instead of a dead panel.
        setTimeout(function () {
          rb.disabled = false;
          setLabel("Forward phish to APWG + CISA");
        }, 12000);
      }
      return { ok: true };
    }
    // All "Send"-labeled buttons currently on the page (compose windows).
    function findSendButtons() {
      var out = [];
      var els = document.querySelectorAll('button, [role="button"]');
      for (var i = 0; i < els.length; i++) {
        var t = (els[i].textContent || "").trim().toLowerCase();
        var al = (els[i].getAttribute("aria-label") || "").toLowerCase();
        if (t === "send" || al === "send") out.push(els[i]);
      }
      return out;
    }
    // Collects addressable fields that live in the SAME compose window as
    // the given Send button (shared non-body ancestor), so page-level
    // inputs like the Gmail search box are excluded without knowing the
    // compose's markup.
    function collectCandidates(sendBtn) {
      var anc = {}, p = sendBtn, u = 0, key = 0;
      while (p && u < 14) { anc[key++] = p; p = p.parentElement; u++; }
      function inAncestors(el) {
        for (var k = 0; k < key; k++) if (anc[k] === el) return true;
        return false;
      }
      var out = [];
      var els = document.querySelectorAll(
        'input, textarea, [contenteditable="true"], ' +
        '[role="combobox"], [role="textbox"]');
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (el.type === "hidden") continue;
        if (el.closest && el.closest("#" + PANEL_ID)) continue;
        var al = (el.getAttribute("aria-label") || "").toLowerCase();
        if (al.indexOf("message body") !== -1) continue;
        var q = el.parentElement, v = 0, same = false;
        while (q && v < 14) {
          if (inAncestors(q) && q !== document.body &&
              q !== document.documentElement) { same = true; break; }
          q = q.parentElement; v++;
        }
        if (!same) continue;
        var desc = el.tagName.toLowerCase();
        if (el.id) desc += "#" + el.id;
        var nm = el.getAttribute("name");
        if (nm) desc += "[name=" + nm + "]";
        var ala = el.getAttribute("aria-label");
        if (ala) desc += "[aria=" + ala.slice(0, 24) + "]";
        var cls = String(el.className || "").split(" ")[0];
        if (cls) desc += "." + cls.slice(0, 18);
        var val = (el.value !== undefined) ? el.value : (el.textContent || "");
        out.push({ el: el, desc: desc,
          empty: (val || "").trim() === "", vis: !!el.offsetParent });
      }
      return out;
    }
    // Picks the To field: explicit name/aria match first, then the only
    // empty visible field (a fresh forward compose has exactly one: To).
    function pickCandidate(cands) {
      var i, c;
      for (i = 0; i < cands.length; i++) {
        c = cands[i];
        var nm = (c.el.getAttribute("name") || "").toLowerCase();
        var al = (c.el.getAttribute("aria-label") || "").toLowerCase();
        if (nm === "to" || al === "to") return c;
      }
      for (i = 0; i < cands.length; i++) {
        c = cands[i];
        if (c.vis && c.empty) return c;
      }
      return null;
    }
    // Finds the visible "To" label inside the same compose as the Send
    // button (nbsp-tolerant; panel excluded).
    // True when the addresses visibly landed (field or its chip row).
    function verifyFill(el) {
      var pv = el.value || el.textContent || "";
      if (pv.indexOf("apwg") !== -1) return true;
      if (el.parentElement &&
          (el.parentElement.textContent || "").indexOf("apwg") !== -1) return true;
      return false;
    }
    function fillField(el) {
      try { el.focus(); } catch (e) {}
      var v = SF_FWD_TO.join(", ");
      // Try the editing pipeline first (works on Gmail's div widgets);
      // fall back to direct value/text assignment.
      var before = el.value || el.textContent || "";
      var inserted = false;
      try { inserted = document.execCommand("insertText", false, v); } catch (e) {}
      var after = el.value || el.textContent || "";
      if (!inserted || after === before) {
        var filled = false;
        try {
          Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype, "value").set.call(el, v);
          filled = true;
        } catch (e0) {}
        if (!filled) {
          try {
            Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype, "value").set.call(el, v);
            filled = true;
          } catch (e1) {}
        }
        if (!filled) {
          try { el.value = v; filled = ("value" in el); } catch (e2) {}
        }
        if (!filled) el.textContent = v;
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent("keydown",
        { key: "Enter", keyCode: 13, which: 13, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent("keyup",
        { key: "Enter", keyCode: 13, which: 13, bubbles: true }));
      try { el.blur(); } catch (e) {}
    }
    // Fillable-element test (excludes body and our own panel).
    function isFillable(el) {
      if (!el || el === document.body || el === document.documentElement) return false;
      if (el.closest && el.closest("#" + PANEL_ID)) return false;
      var tag = (el.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea") return el.type !== "hidden";
      if (el.getAttribute("contenteditable") === "true") return true;
      var r = el.getAttribute("role");
      return r === "combobox" || r === "textbox";
    }
    // Nearest element whose visible text is exactly "To" and which comes
    // before the Send button in document order (the compose's To label).
    function findToLabelNear(sendBtn) {
      var best = null;
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
      var node;
      while ((node = walker.nextNode())) {
        var t = (node.textContent || "").replace(/[\s\u00A0]+/g, " ").trim();
        if (t !== "To") continue;
        if (node.closest && node.closest("#" + PANEL_ID)) continue;
        var pos;
        try { pos = node.compareDocumentPosition(sendBtn); } catch (e) { continue; }
        if (!(pos & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
        best = node; // last match wins = nearest to Send
      }
      return best;
    }
    // Addresses the fresh compose: tries autofocused field, direct
    // candidates, then To-label click as fallback.
    function addressCompose(freshSend) {
      var ae = document.activeElement;
      if (isFillable(ae)) {
        fillField(ae);
        if (verifyFill(ae)) { done(); return; }
      }
      var cands = collectCandidates(freshSend);
      var pick = pickCandidate(cands);
      var fp = function (c) {
        return c.desc + (c.empty ? "(empty)" : "") + (c.vis ? "" : "(hid)");
      };
      if (pick) {
        fillField(pick.el);
        if (verifyFill(pick.el)) { done(); return; }
      }
      focusToInput(freshSend, function (el) {
        if (!el) {
          fail("To input not focusable; candidates [" +
            cands.slice(0, 8).map(fp).join(" | ") + "]");
          return;
        }
        fillField(el);
        if (verifyFill(el)) done();
        else fail("fill missed on focused " + (el.tagName || "?").toLowerCase());
      });
    }
    function contactPickerOpen() {
      return (document.body.textContent || "").indexOf("Select contacts") !== -1;
    }
    function closeContactPicker() {
      if (!contactPickerOpen()) return;
      try {
        document.dispatchEvent(new KeyboardEvent("keydown",
          { key: "Escape", keyCode: 27, which: 27, bubbles: true }));
      } catch (e) {}
    }
    // Focuses Gmail's To input by clicking the input area next to the To
    // label (NOT the label itself: that opens the contact picker).
    // Calls done(fillableEl or null).
    function focusToInput(sendBtn, done) {
      closeContactPicker();
      var lab = findToLabelNear(sendBtn);
      if (!lab) { done(null); return; }
      var steps = [];
      var row = lab.parentElement;
      if (row) {
        for (var i = 0; i < row.children.length; i++) {
          var k = row.children[i];
          if (k === lab) continue;
          var t = (k.textContent || "").replace(/[\s\u00A0]+/g, " ").trim();
          if (/^(Cc|Bcc|Cc Bcc)$/.test(t)) continue;
          steps.push({ el: k });
        }
        steps.push({ el: row });
      }
      steps.push({ coord: true });
      var si = 0;
      function next() {
        if (si >= steps.length) { done(null); return; }
        var s = steps[si++];
        try {
          if (s.coord) {
            var r = lab.getBoundingClientRect();
            var el = document.elementFromPoint(r.right + 60, r.top + r.height / 2);
            if (el && !(el.closest && el.closest("#" + PANEL_ID))) el.click();
          } else {
            s.el.click();
          }
        } catch (e) {}
        setTimeout(function () {
          closeContactPicker();
          var ae = document.activeElement;
          if (isFillable(ae)) { done(ae); return; }
          next();
        }, 350);
      }
      next();
    }
    function fillCompose(sendBefore) {
      var t2 = 0;
      var timer2 = setInterval(function () {
        try {
          t2++;
          var sends = findSendButtons();
          var freshSend = null, i;
          for (i = 0; i < sends.length; i++) {
            if (sendBefore.indexOf(sends[i]) === -1) { freshSend = sends[i]; break; }
          }
          if (!freshSend && t2 <= 20) return; // keep waiting (~5s)
          clearInterval(timer2);
          if (!freshSend) {
            fail("no new compose (send buttons " + sendBefore.length +
              "\u2192" + sends.length + ")");
            return;
          }
          addressCompose(freshSend);
        } catch (e) {
          clearInterval(timer2);
          fail("exception");
        }
      }, 250);
    }
    try {
      var msgEl = document.querySelector("[data-legacy-message-id]");
      if (!msgEl) return fail("no message element");
      var more = findMoreButton(msgEl);
      if (!more) {
        return fail("no message menu; nearby: " +
          nearbyButtonLabels(msgEl, 12).join(" / "));
      }
      var sendBefore = findSendButtons();
      if (rb) { rb.disabled = true; setLabel("Opening forward\u2026"); }
      more.click();
      var tries = 0;
      var timer = setInterval(function () {
        try {
          tries++;
          var items = document.querySelectorAll(
            '[role="menuitem"],[role="menuitemradio"],[role="menuitemcheckbox"]');
          for (var i = 0; i < items.length; i++) {
            if ((items[i].textContent || "").trim().toLowerCase() === "forward") {
              clearInterval(timer);
              items[i].click();
              fillCompose(sendBefore);
              return;
            }
          }
          if (tries > 25) { // ~5s
            clearInterval(timer);
            fail("no Forward item in menu");
          }
        } catch (e) {
          clearInterval(timer);
          fail("exception");
        }
      }, 200);
      return { ok: true, pending: true };
    } catch (e) {
      return fail("exception");
    }
  }

  // Builds the panel shell and returns its .sf-body element.
  function showPanel() {
    closePanel();
    var wrap = document.createElement("div");
    wrap.id = PANEL_ID;
    var card = h("div", { "class": "sf-card" });
    var head = h("div", { "class": "sf-head" },
      h("span", null, "\uD83D\uDEE1\uFE0F Spam Avenger"));
    var x = h("button", { "class": "sf-x", "aria-label": "Close" }, "\u2715");
    x.addEventListener("click", closePanel);
    head.appendChild(x);
    var body = h("div", { "class": "sf-body" });
    card.appendChild(head);
    card.appendChild(body);
    wrap.appendChild(card);
    document.body.appendChild(wrap);
    return body;
  }

  function closePanel() {
    var p = document.getElementById(PANEL_ID);
    if (p) p.remove();
  }

  function mkRow(label, value, mono) {
    return h("div", { "class": "sf-row" },
      h("span", null, label),
      h("b", mono ? { "class": "sf-mono" } : null, String(value)));
  }

  function renderLoading(body, step) {
    clearEl(body);
    body.appendChild(
      h("div", { "class": "sf-loading" },
        h("div", { "class": "sf-spin" }),
        h("p", null, step || "Working\u2026")));
  }

  // v1.0.64: the accordion factory, ported from Spam Avenger
  // for Outlook v1.2.0 (Michael's design call there, applied
  // here at his Oct 28 order): the panel's tasks render as a
  // stack of full-width toggles with everything collapsed;
  // clicking one expands its panel directly below it, opening
  // another closes the first (strictly one open at a time),
  // and clicking the open section's toggle closes it. A fresh
  // render builds a fresh stack, so a new message always
  // starts all-collapsed with no leftover state. Expanding a
  // section NEVER fires its action — every lane's work stays
  // behind the inner buttons, exactly as before. One exception,
  // Michael's call (2026-10-28): a lane whose section would hold
  // nothing but a button repeating its own title gets an
  // actionRow instead — a lookalike row that fires on click.
  // makeAccordion(stackEl) -> { section(id, toggleClass, label),
  //                             actionRow(id, toggleClass, label, onFire) }
  // label is a string or an array of strings/elements (the PID
  // toggle bolds one word, like its retired fight toggle did).
  function makeAccordion(stack) {
    var currentSection = null;
    function section(id, toggleClass, label) {
      var caret = h("span", { "class": "sf-acc-caret" }, "\u25B8");
      var tgl = h("button", {
        "class": "sf-acc-toggle " + toggleClass, "type": "button",
        "id": id + "-toggle", "aria-expanded": "false",
        "aria-controls": id + "-panel"
      }, caret);
      var parts = Array.isArray(label) ? label : [label];
      parts.forEach(function (p) {
        tgl.appendChild(
          typeof p === "string" ? document.createTextNode(p) : p);
      });
      var panel = h("div", { "class": "sf-acc-panel", "id": id + "-panel" });
      panel.style.display = "none";
      var sec = { toggle: tgl, panel: panel };
      sec.setOpen = function (open) {
        panel.style.display = open ? "" : "none";
        caret.textContent = open ? "\u25BE" : "\u25B8";
        tgl.setAttribute("aria-expanded", open ? "true" : "false");
      };
      tgl.addEventListener("click", function () {
        if (currentSection === sec) {
          sec.setOpen(false);
          currentSection = null;
        } else {
          if (currentSection) currentSection.setOpen(false);
          sec.setOpen(true);
          currentSection = sec;
        }
      });
      stack.appendChild(tgl);
      stack.appendChild(panel);
      return sec;
    }
    // v1.0.64 (Michael's call, 2026-10-28, in the test6 retest):
    // a lane whose section would hold NOTHING but a button
    // repeating the section's own title doesn't get a section —
    // it gets this lookalike row that FIRES on click. First
    // user: Safe Browsing; FTC and Forward followed under the
    // same ruling the same day. The glyph is \u2197 (opens a
    // page), not the \u25B8 caret, which promises an expansion.
    // The label rides in a .sf-acc-label span so a lane whose
    // label doubles as its status surface (Forward) can rewrite
    // the words without eating the glyph. btnId overrides the
    // button's id for a lane whose machinery looks it up by an
    // established id (Forward: sf-fwd-phish).
    function actionRow(id, toggleClass, label, onFire, btnId) {
      var glyph = h("span", { "class": "sf-acc-caret" }, "\u2197");
      var btn = h("button", {
        "class": "sf-acc-toggle " + toggleClass, "type": "button",
        "id": btnId || (id + "-toggle")
      }, glyph);
      var labelEl = h("span", { "class": "sf-acc-label" });
      var parts = Array.isArray(label) ? label : [label];
      parts.forEach(function (p) {
        labelEl.appendChild(
          typeof p === "string" ? document.createTextNode(p) : p);
      });
      btn.appendChild(labelEl);
      btn.addEventListener("click", onFire);
      stack.appendChild(btn);
      return { toggle: btn, labelEl: labelEl };
    }
    return { section: section, actionRow: actionRow };
  }

  function renderResult(body, a) {
    clearEl(body);
    // v1.0.36: the info block (meta grid, makeup callout, Red flags)
    // starts collapsed behind a toggle — good info, but it buries the
    // action buttons for a non-technical user. The panel opens focused
    // on the actions; the details are one click away. Every fresh
    // panel starts collapsed (no stored state). Warnings and errors
    // are NEVER placed inside the collapsed area.
    var details = h("div", { "class": "sf-details" });
    details.style.display = "none";
    var toggle = h("button", {
      "class": "sf-details-toggle", "type": "button",
      "aria-expanded": "false"
    }, "Show details \u25B8");
    toggle.addEventListener("click", function () {
      var open = details.style.display !== "none";
      details.style.display = open ? "none" : "";
      toggle.textContent = open ? "Show details \u25B8" : "Hide details \u25BE";
      toggle.setAttribute("aria-expanded", open ? "false" : "true");
    });
    // v1.0.46: the toggle is PINNED in its own bar between the
    // header and the scrolling .sf-body, not inside the body.
    // Inside the body it scrolled with the content, and (with the
    // old bottom-anchored panel) it jumped up/down on every
    // toggle. Pinned, flipping it changes ONLY the details
    // container's display, its own label, and aria-expanded: no
    // re-render, no scroll reset, nothing above the details
    // block moves. (The panel's top anchor lives in panel.css.)
    var card = body.parentNode;
    if (card) {
      var oldBar = card.querySelector(".sf-togglebar");
      if (oldBar) oldBar.remove();
      card.insertBefore(
        h("div", { "class": "sf-togglebar" }, toggle), body);
    } else {
      body.appendChild(toggle); // fallback: pre-1.0.46 placement
    }
    body.appendChild(details);
    details.appendChild(mkRow("From", a.from || "unknown"));
    details.appendChild(mkRow("Subject", a.subject || "(no subject)"));
    if (!a.ip) {
      body.appendChild(h("p", { "class": "sf-warn" },
        "Couldn't find the sending server in the headers. " +
        "That happens with mailing lists, forwards, and some bulk senders. " +
        "Nothing to complain to directly \u2014 but the report links below still apply."));
    } else {
      details.appendChild(mkRow("Sending IP", a.ip, true));
      details.appendChild(mkRow("Server", a.host || "unknown"));
      details.appendChild(mkRow("Owned by", a.org || "unknown"));
      details.appendChild(mkRow("Abuse contact", a.abuse || "not published"));
      details.appendChild(h("p", { "class": "sf-note" },
        'The "From" address is makeup. The IP is the face underneath.'));
    }
    if (a.flags && a.flags.length) {
      var fw = h("div", { "class": "sf-flags" }, h("b", null, "Red flags"));
      var ul = h("ul");
      a.flags.forEach(function (f) { ul.appendChild(h("li", null, f)); });
      fw.appendChild(ul);
      details.appendChild(fw);
    }
    // v1.0.48: which button colors this render actually puts on
    // screen — the legend below is built from these flags, so it
    // never explains a color that isn't there.
    var showGreen = false, showBlue = false;
    // v1.0.64: the task stack — every lane below renders as an
    // accordion section (makeAccordion), in the Outlook order.
    // Status warnings that used to sit between the lanes are
    // appended to the stack directly, never inside a section.
    var stack = h("div", { "class": "sf-stack", "id": "sf-stack" });
    body.appendChild(stack);
    var acc = makeAccordion(stack);
    // The Gmail-native report button is built inside the
    // big-provider branch below, but its section sits fifth in
    // the stack (after Forward), so the branch hands the button
    // up through this variable.
    var reportPhishBtn = null;
    if (a.complaint) {
      var c = a.complaint;
      // Form lanes first (v1.0.64, Michael's call 2026-10-28):
      // hyperscaler clouds and OVHcloud act only on reports sent
      // through their own abuse form — building the email anyway
      // just hands the desk its deflection excuse ("use our
      // form"), so those panels get the FORM KIT instead: the
      // prepared evidence block plus one button that copies the
      // evidence and opens the form. No email text, no Open-in-Gmail, no hint chip —
      // the section IS the guidance. Detection is unchanged:
      // the lib's a.hyperscaler flag, and the v1.0.27 OVH match
      // on the abuse contact/org. The hyperscaler check runs
      // first and wins if both ever fire (impossible in
      // practice — the networks are disjoint).
      var formLane = null;
      if (a.hyperscaler && HYPER_FORM_HINTS[a.hyperscaler]) {
        formLane = HYPER_FORM_HINTS[a.hyperscaler];
      } else if (/ovh/i.test(c.to + " " + (a.org || ""))) {
        formLane = OVH_FORM_HINT;
      }
      if (formLane) {
        var kitSec = acc.section("sf-sec-complaint", "sf-btn-blue",
          "Abuse report \u2014 use their form");
        var kw = h("div", { "class": "sf-complaint" });
        // v1.0.65 (Michael's edit, 2026-10-28): the note tells
        // Joe ONLY what he has to do — details are copied to
        // the clipboard, paste with Ctrl+V or right-click, plus
        // the lane's service pick where there is one. The old
        // copy justified the lane (deflection policy, why no
        // email) — "full of shit no Joe user gives a shit
        // about," his words, and he's right: it's gone.
        kw.appendChild(h("p", { "class": "sf-note" },
          "Your report details are in the box below. The " +
          "button copies them to your clipboard and opens the " +
          formLane.label + " abuse form. " +
          (formLane.pick ? formLane.pick + " " : "") +
          "On the form, paste into the details field \u2014 " +
          "Ctrl+V, or right-click and choose Paste \u2014 then " +
          "submit the form."));
        kw.appendChild(h("b", null,
          "Form evidence \u2014 paste into the " + formLane.label +
          " abuse form"));
        var eta = h("textarea", { id: "sf-evidence-text" });
        eta.readOnly = true;
        eta.value = window.SpamAvenger.buildFormEvidence(a) || "";
        kw.appendChild(eta);
        // v1.0.64 (Michael's call, 2026-10-28, after his live
        // test): ONE button does the whole lane — it copies the
        // evidence to the clipboard, then opens the form, so the
        // user's only job on the form is Ctrl+V. (The Copy button
        // cut from the email lane stays cut: there, Open in
        // Gmail does the work. Here the lane IS copy-and-paste,
        // so the copy earns its place — folded into this button.)
        var formBtn = h("button", { id: "sf-open-abuse-form",
          "class": "sf-btn-blue", "type": "button" },
          "Copy evidence & open the " + formLane.label + " abuse form");
        showBlue = true; // the form button is a blue control
        formBtn.addEventListener("click", function () {
          var copied = false;
          try {
            eta.focus();
            eta.select();
            copied = document.execCommand("copy");
          } catch (e) {}
          if (!copied && navigator.clipboard) {
            navigator.clipboard.writeText(eta.value).catch(function () {});
            copied = true; // best-effort; the box text stays selected
          }
          var origLabel = formBtn.textContent;
          formBtn.textContent = copied
            ? "Copied! The form is open \u2014 paste into its details field (Ctrl+V or right-click \u2192 Paste)"
            : "The form is open \u2014 copy the box text above and paste it in";
          setTimeout(function () { formBtn.textContent = origLabel; }, 6000);
          window.open(formLane.url, "_blank", "noopener");
        });
        kw.appendChild(h("div", { "class": "sf-actions" }, formBtn));
        kitSec.panel.appendChild(kw);
      } else {
      var compSec = acc.section("sf-sec-complaint", "sf-btn-green",
        "Abuse complaint \u2014 ready to send");
      var cw = h("div", { "class": "sf-complaint" },
        h("b", null, "Ready-to-send complaint"));
      var ta = h("textarea", { id: "sf-complaint-text" });
      ta.readOnly = true;
      ta.value = "To: " + c.to + "\nSubject: " + c.subject + "\n\n" + c.body;
      cw.appendChild(ta);
      // v1.0.64 (Michael’s call, 2026-10-28): the orange "Copy
      // complaint" button is gone — real users never used it,
      // and anyone technical enough to want the raw text can
      // copy it straight from the textarea above. "Open in
      // Gmail" is the one send path.
      var compBtn = h("button", { id: "sf-compose",
        "class": "sf-btn-green" }, "Open in Gmail \u2014 just click Send");
      showGreen = true; // Open in Gmail
      cw.appendChild(h("div", { "class": "sf-actions" }, compBtn));
      compSec.panel.appendChild(cw);
      compBtn.addEventListener("click", function () {
        // v1.0.58: a complaint carrying full headers can exceed
        // Gmail's compose-link length limit and die on a bare
        // "Error 400". fitForCompose shrinks the complaint in steps
        // until the link fits; if nothing fits, it hands back a
        // short compose and we copy the FULL complaint so the user
        // just pastes it in (the compose itself says so).
        var plan = window.SpamAvenger.fitForCompose(accountIndex(), a);
        if (!plan) return;
        if (plan.mode === "paste") {
          if (navigator.clipboard) {
            navigator.clipboard.writeText(plan.complaint.body).catch(function () {});
          }
          var origLabel = compBtn.textContent;
          compBtn.textContent = "Copied! Paste into the email (Ctrl+V), then Send";
          setTimeout(function () { compBtn.textContent = origLabel; }, 6000);
        }
        window.open(plan.url, "_blank", "noopener");
      });
      }
    } else if (a.ip && !a.skipComplaint) {
      stack.appendChild(h("p", { "class": "sf-warn" },
        "No published abuse contact for this IP. " +
        "Report the links below via Google Safe Browsing instead."));
    } else if (a.skipComplaint) {
      stack.appendChild(h("p", { "class": "sf-warn" },
        a.providerAdvice ||
        ("This came from a big mailbox provider\u2019s own servers \u2014 " +
         "no complaint generated (it would hit the wrong target).")));
      if (a.gmailAutoReport) {
        var rb = h("button", { id: "sf-report-phish",
          "class": "sf-btn-green" }, "Report phishing to Google");
        showGreen = true;
        rb.addEventListener("click", function () {
          // Already-reported messages show a Gmail banner ("You reported
          // this message as phishing") instead of the report dialog.
          if ((document.body.textContent || "").indexOf(
                "reported this message as phishing") !== -1) {
            markAlreadyReported();
            return;
          }
          var r = gmailReportPhishing();
          rb.disabled = true;
          if (r.ok) {
            rb.textContent = "Opening Gmail\u2019s report dialog\u2026";
            // Re-arm: if the user cancels Gmail's dialog, the button
            // comes back instead of staying dead until a page refresh.
            setTimeout(function () {
              rb.disabled = false;
              rb.textContent = "Report phishing to Google";
            }, 8000);
          } else {
            rb.textContent = "Couldn't open it (" + String(r.dbg).slice(0, 140) +
              ") \u2014 use the three-dot menu manually";
          }
        });
        reportPhishBtn = rb;
      }
    }
    // v1.0.38: color-code legend, right above the report buttons
    // and OUTSIDE the collapsed details block, so a first-time
    // user learns what green/blue mean before they have to pick.
    // v1.0.48: the legend is built from the show* flags set above,
    // listing ONLY the colors this render actually uses (the
    // report row below always renders, so green and blue are
    // guaranteed by it: FTC is blue,
    // Safe Browsing and Forward are green).
    // v1.0.64: "the report row" is the accordion stack now —
    // the legend is inserted directly above it, and green and
    // blue are guaranteed by the FTC / Safe Browsing /
    // Forward section toggles, which always render.
    showGreen = true;
    showBlue = true;
    var legend = h("p", { "class": "sf-legend" }, "Button colors: ");
    var legendEntries = [];
    if (showGreen) legendEntries.push(["sf-dot-green",
      " green \u2014 Spam Avenger does the work; you just review and send."]);
    if (showBlue) legendEntries.push(["sf-dot-blue",
      " blue \u2014 needs a few steps from you, and I'll guide you through them."]);
    legendEntries.forEach(function (e, i) {
      legend.appendChild(h("span", { "class": e[0] }, "\u25CF"));
      legend.appendChild(document.createTextNode(
        e[1] + (i < legendEntries.length - 1 ? " " : "")));
    });
    // v1.0.64: the legend is inserted directly above the
    // accordion stack — the section toggles carry the colors
    // now. The old "Also report it:" label div is gone: the
    // toggles are the labels.
    body.insertBefore(legend, stack);
    // A status line under the report buttons confirming, in plain
    // user language, whether the case data was saved for the
    // report form before the form page opens. (v1.0.31–34 this was
    // a diagnostic readout with link counts; v1.0.35 made it
    // user-facing — see the setStashStatus calls below.)
    // v1.0.64: one status line PER report lane: a status written
    // for the FTC lane must land with the FTC lane (directly
    // under its row), not in one shared line under a row of
    // buttons that no longer exists.
    function mkStashStatus(id) {
      var el = h("p", { "class": "sf-fine sf-status", id: id }, "");
      return {
        el: el,
        set: function (msg) { try { el.textContent = msg; } catch (e) {} }
      };
    }
    var ftcStatus = mkStashStatus("sf-ftc-status");
    var sbStatus = mkStashStatus("sf-sb-status");
    // v1.0.30: the report-form links are proper action BUTTONS now.
    // On click: no default navigation — the handler stashes the case
    // details in chrome.storage.local and WAITS for the write to land
    // before opening the form in a new tab, so reportfill.js on the
    // other side can never beat the stash (the v1.0.29 race: the tab
    // opened first and the filler found nothing). The stash never
    // leaves this browser, the filler erases it after use (and
    // ignores it after 30 minutes), and the user still reviews and
    // submits every report themselves. If storage is unavailable the
    // page still opens — a blank form beats a dead button.
    function stashThenOpen(url, setStashStatus) {
      return function (ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        var opened = false;
        function open() {
          if (opened) return;
          opened = true;
          window.open(url, "_blank", "noopener");
        }
        try {
          if (typeof chrome === "undefined" || !chrome.storage ||
              !chrome.storage.local) {
            setStashStatus("⚠ Couldn't save the report in this " +
              "browser — opening the form blank");
            open();
            return;
          }
          // Safety net: if the set callback somehow never fires, the
          // button still opens the page instead of feeling dead. In
          // practice the local write lands in a few ms, long before
          // this fires, so the stash still wins the ordering.
          setTimeout(open, 800);
          chrome.storage.local.set({ pendingReport: {
            urls: (a.urls || []).slice(0, 10),
            from: a.from || "",
            subject: a.subject || "",
            ip: a.ip || "",
            server: a.host || "",
            savedAt: Date.now()
          } }, function () {
            // v1.0.31: the v1.0.30 callback never checked lastError,
            // so a failed write looked exactly like a saved stash.
            // v1.0.35: the wording is user-facing now — no link
            // counts or storage jargon, just ready / not ready.
            if (chrome.runtime && chrome.runtime.lastError) {
              setStashStatus("⚠ Couldn't save the report — the " +
                "form will open blank. You can copy the details " +
                "from this panel and paste them in.");
            } else {
              setStashStatus("✓ Report ready — the form opens " +
                "filled in. Just review and submit.");
            }
            open();
          });
        } catch (e) {
          setStashStatus("⚠ Couldn't save the report — " +
            "opening the form blank");
          open();
        }
      };
    }
    // v1.0.34: no deep link into the wizard exists — ReportFraud
    // is a client-rendered app and its served HTML has no usable
    // "Report Now" href (checked 2026-10-17) — so the button
    // opens the homepage and reportfill.js's guide line walks the
    // user in from there.
    // v1.0.64 (Michael's call, 2026-10-28, an hour after the
    // Safe Browsing flattening): same shape, same ruling — the
    // FTC section held only its button and the stash status,
    // so the row launches the lane and the status prints
    // underneath the row. The guided walkthrough itself lives
    // in reportfill.js's banner on the FTC site, not here.
    acc.actionRow("sf-sec-ftc", "sf-btn-blue",
      "Report to FTC",
      stashThenOpen("https://reportfraud.ftc.gov/", ftcStatus.set));
    stack.appendChild(ftcStatus.el);
    // v1.0.64 (Michael's call, 2026-10-28): Safe Browsing has no
    // section and no nested button — its panel held nothing but
    // a button repeating the title, a dead click. The row itself
    // launches the lane (stash, then the form opens filled).
    // Its status line lives directly under the row.
    acc.actionRow("sf-sec-sb", "sf-btn-green",
      "Report to Google Safe Browsing",
      stashThenOpen(
        "https://safebrowsing.google.com/safebrowsing/report_phish/",
        sbStatus.set));
    stack.appendChild(sbStatus.el);
    // v1.0.64 (Michael's call, 2026-10-28): Forward flattens
    // too — its section held only its button. The one adaptation:
    // that button is a live status surface (Opening\u2026 /
    // addressed / failure states), so the row's label span takes
    // over the job and the row keeps the button's established
    // id, sf-fwd-phish, which gmailForwardPhish looks up.
    acc.actionRow("sf-sec-fwd", "sf-btn-green",
      "Forward phish to APWG + CISA",
      function () { gmailForwardPhish(); }, "sf-fwd-phish");
    // The Gmail-native lane has no Outlook equivalent; it keeps
    // its own section, fifth in the stack, and exists only in
    // the big-provider case that builds the button.
    if (reportPhishBtn) {
      var googleSec = acc.section("sf-sec-google", "sf-btn-green",
        "Report phishing to Google");
      googleSec.panel.appendChild(
        h("div", { "class": "sf-actions" }, reportPhishBtn));
    }
    body.appendChild(h("p", { "class": "sf-fine" },
      "Nothing is sent automatically. You review and send the complaint yourself."));

    // v1.0.49: "Your data in their hands" — a formal data-deletion
    // demand to the company behind this email, generated by
    // lib/demand.js from the user's own stored details. The
    // finished letter opens in the user's own Gmail compose —
    // they review and send it themselves; nothing is ever
    // auto-sent. If the user's details were never saved, the
    // section shows the shared mini-form (same storage keys as
    // the popup) instead of the demand button.
    // v1.0.51: the section lives at the BOTTOM of the panel,
    // below "Also report it" and the closing fine print, in its
    // own ruled-off zone. The report flow above is for strangers
    // and scammers; this one ends a relationship with a company
    // the user once dealt with, and Michael's live test said it
    // must not read as one more row of the attack flow. The
    // explainer copy says exactly that.
    // v1.0.52: the zone starts COLLAPSED behind a toggle bar
    // built exactly like the "Show details" toggle (same
    // .sf-details-toggle chrome, same glyph flip and
    // aria-expanded bookkeeping) but independent of it — every
    // fresh render starts collapsed, whatever the details
    // toggle's state. The label is Michael's wording: it names
    // the user's situation, not a metaphor.
    // v1.0.53: two live-test refinements — the details form is
    // ZIP-only (the state picker is gone from lib/demand.js;
    // the ZIP derives the state or the letter goes general),
    // and the demand step sanity-checks the Send-to domain's
    // mail servers (lib/demand.js checkRecipientMx, DNS-over-
    // HTTPS) in an advisory status line under the field. The
    // check never disables the compose button: the user
    // reviews and sends, same as everything else here.
    // The recipient itself is a ranked candidate list
    // (lib/demand.js demandCandidates): privacy@<domain> did
    // not exist at the first real target (civicdialogues.org,
    // hand-checked), so the sender's own mailbox — root twin
    // first, then the exact address — outranks the guess.
    // v1.0.54: the chip row also offers the role mailboxes
    // companies actually staff at the root domain (contact@,
    // info@, support@ — lib/demand.js demandChips, capped at
    // 6): Civic Dialogues' footer and its privacy notice §6.6
    // both designate contact@<root> for data requests. And the
    // website lookup is framed as an errand, not just a link:
    // an "Open <domain>'s website" button plus one instruction
    // line (footer / Privacy Policy / paste it in) REPLACING
    // the v1.0.53 hint paragraph — the privacy@ point is
    // folded into the instruction's last clause instead of
    // stacked as a second hint.
    // v1.0.55: Michael's live-test verdicts — the whole guess
    // system is DELETED (no default, no chips: the first real
    // letter nearly went out to a guessed info@). The toggle
    // goes BLUE with "unwanted" bolded, so the section
    // advertises itself. Send-to starts EMPTY in all cases.
    // The sender root domain's RDAP registration record
    // (lib/demand.js fetchRegistrationContact) is consulted,
    // and a contact found there is offered as ONE clickable
    // suggestion row — never auto-filled, because registrar
    // contacts are iffy (and known dead ends like Amazon
    // Registrar's AWS abuse desk are hard-excluded in
    // lib/demand.js, so they never even surface). Otherwise
    // the website errand is the story: Joe finds the published
    // address and pastes it in. An empty To can no longer open a compose: the Open
    // button focuses the field and flashes the instruction
    // line instead. The letter is always addressed to the
    // company behind the SENDER domain — never renamed to a
    // registrar the RDAP record happened to surface.
    // v1.0.64: two changes (Michael's rulings, Oct 27–28).
    // (1) The RDAP registration-contact suggestion is REMOVED —
    // the fetch, the suggestion row, and the "Looking up the
    // domain's registration contact…" status text are all gone
    // (Outlook v1.2.3 parity): a deletion demand goes to the
    // company that emailed the user, at the address it
    // publishes — never to a registrar's abuse desk, which
    // belongs to the complaint lane only. lib/demand.js keeps
    // fetchRegistrationContact on the shelf; nothing in this
    // panel calls it anymore. The website errand below is the
    // only guidance path, and Send-to still starts EMPTY.
    // (2) The section is an accordion section now: the
    // .sf-fight zone and its toggle are retired, the section
    // toggle owns visibility, and the flow renders into the
    // section's panel unchanged.
    (function () {
      var D = (typeof window !== "undefined") ? window.SpamDemand : null;
      if (!D) return;
      // v1.0.64: the accordion section toggle replaces the
      // retired .sf-fight zone + fight toggle. It stays BLUE
      // with "unwanted" BOLDED (Michael's v1.0.55 call: the
      // collapsed section has to advertise itself, and blue
      // is this panel's "you have a move here" color; the bold
      // word is the one Joe is scanning for). The demand flow
      // renders into the section's panel.
      var pidSec = acc.section("sf-sec-pid", "sf-btn-blue",
        ["Not Spam but still ", h("b", null, "unwanted"), "?"]);
      var wrap = h("div", { "class": "sf-demand" });
      pidSec.panel.appendChild(wrap);

      // v1.0.51: the explainer both section states show — the
      // report flow above is for strangers; this section is for a
      // company the user once had a relationship with.
      var EXPLAINER = "The buttons above are for strangers and " +
        "scammers. This one is for a company you once dealt with — " +
        "signed up, bought something, or clicked 'accept' on a " +
        "terms box years ago. Their email may be perfectly legal " +
        "and still unwanted. If you want the relationship over " +
        "and your data gone, this drafts a formal deletion demand " +
        "using your state's privacy law.";

      function renderDetailsForm() {
        clearEl(wrap);
        wrap.appendChild(h("b", null, "Your data in their hands"));
        wrap.appendChild(h("p", { "class": "sf-demand-intro" },
          EXPLAINER));
        wrap.appendChild(h("p", { "class": "sf-fine" },
          "It needs your details once to fill the letter in \u2014 " +
          "they stay in your browser and are used for nothing else."));
        wrap.appendChild(D.buildDetailsForm(function (saved) {
          renderDemandStep(saved);
        }));
      }

      function renderDemandStep(det) {
        clearEl(wrap);
        wrap.appendChild(h("b", null, "Your data in their hands"));
        wrap.appendChild(h("p", { "class": "sf-demand-intro" },
          EXPLAINER));
        var senderDom = D.registrableDomain(a.senderDomain || "");
        var step = h("div", { "class": "sf-demand-step" });
        step.style.display = "none";
        var draftBtn = h("button", { id: "sf-demand-draft",
          "class": "sf-btn-green", "type": "button" },
          "Draft a data-deletion demand");
        wrap.appendChild(h("div", { "class": "sf-actions" }, draftBtn));
        wrap.appendChild(h("p", { "class": "sf-fine sf-demand-sub" },
          "\u2014 opens in Gmail, just review + Send"));
        wrap.appendChild(step);
        draftBtn.addEventListener("click", function () {
          var open = step.style.display !== "none";
          step.style.display = open ? "none" : "";
          draftBtn.textContent = open ? "Draft a data-deletion demand"
            : "Hide the demand \u25BE";
          if (!open) runMxCheck();
        });

        step.appendChild(h("div", { "class": "sf-row" },
          h("span", null, "Send to")));
        // v1.0.55: NO guessed default, NO auto-fill — the field
        // starts EMPTY in all cases. It gets its value only
        // from the user's own paste (the website errand below).
        // The placeholder says where the address should come
        // from.
        var toField = h("input", { "class": "sf-input",
          "type": "text", "aria-label": "Demand recipient" });
        toField.placeholder = "Paste the address from their website";
        step.appendChild(toField);

        // v1.0.53: advisory mail-server sanity check under the
        // Send-to field. Says whether the recipient DOMAIN has
        // mail servers at all (a mailbox can never be proven
        // from a browser, and the copy says so). Advisory only —
        // nothing here ever disables the compose button.
        var mxEl = h("p", { "class": "sf-demand-mx" }, "");
        mxEl.style.display = "none";
        step.appendChild(mxEl);
        var mxTimer = null;
        var mxSeq = 0;
        function setMx(kind, text) {
          mxEl.textContent = text || "";
          mxEl.className = "sf-demand-mx" +
            (kind ? " sf-mx-" + kind : "");
          mxEl.style.display = text ? "" : "none";
        }
        function runMxCheck() {
          var dom = D.mxDomainOf(toField.value);
          var seq = ++mxSeq;
          if (!dom) { setMx("", ""); return; }
          setMx("muted", "Checking whether " + dom +
            " can receive email\u2026");
          D.checkRecipientMx(toField.value).then(function (res) {
            // A newer check (or an edit since) supersedes this one.
            if (seq !== mxSeq) return;
            if (D.mxDomainOf(toField.value) !== dom) return;
            var cls = res.kind === "ok" ? "ok"
              : res.kind === "error" ? "muted"
              : res.kind === "none" ? "" : "warn";
            setMx(cls, res.text);
          }).catch(function () {
            // checkRecipientMx never rejects by design; this is
            // belt-and-braces so the panel can never throw here.
            if (seq === mxSeq) {
              setMx("muted", "Couldn't check " + dom +
                "'s mail servers \u2014 the address is a best guess.");
            }
          });
        }
        function scheduleMxCheck() {
          if (mxTimer) clearTimeout(mxTimer);
          mxTimer = setTimeout(runMxCheck, 600);
        }
        toField.addEventListener("input", scheduleMxCheck);

        // v1.0.54: the website lookup as an explicit errand.
        // A plain link-out to the sender's root domain (no new
        // permissions — it just opens their homepage) plus one
        // instruction line saying what to hunt for and where
        // the find goes. This block REPLACES the v1.0.53 hint
        // paragraph; the privacy@ point survives folded into
        // the instruction's last clause.
        // v1.0.55: with the guess system gone, this errand is
        // the primary way the field gets filled.
        // v1.0.64: with the RDAP suggestion gone too, it is
        // the ONLY way — by design. The instruction line is
        // kept in a variable: the empty-To guard on the Open
        // button flashes it (flashInstr).
        var instrEl = null;
        if (senderDom) {
          var lookupBtn = h("button", { "class": "sf-lookup-btn",
            "type": "button" },
            "Open " + senderDom + "'s website \u2197");
          lookupBtn.addEventListener("click", function () {
            window.open("https://" + senderDom + "/",
              "_blank", "noopener");
          });
          step.appendChild(lookupBtn);
          instrEl = h("p", { "class": "sf-fine sf-demand-instr" },
            "Look for an email address in the footer or on " +
            "their Privacy Policy page. If you find one, paste " +
            "it into the Send to box above \u2014 a published " +
            "address beats any guess we can make, and privacy@ " +
            "is almost always a guess.");
          step.appendChild(instrEl);
        }

        var instrFlashTimer = null;
        function flashInstr() {
          if (!instrEl) return;
          instrEl.classList.remove("sf-flash");
          void instrEl.offsetWidth; // restart the highlight
          instrEl.classList.add("sf-flash");
          if (instrFlashTimer) clearTimeout(instrFlashTimer);
          instrFlashTimer = setTimeout(function () {
            instrEl.classList.remove("sf-flash");
          }, 1800);
        }

        var letterBox = h("div", {});
        letterBox.style.display = "none";
        var letterTa = h("textarea", {});
        letterTa.readOnly = true;
        letterBox.appendChild(letterTa);
        var pToggle = h("button", {
          "class": "sf-details-toggle", "type": "button",
          "aria-expanded": "false"
        }, "Preview the letter \u25B8");
        pToggle.addEventListener("click", function () {
          var open = letterBox.style.display !== "none";
          letterBox.style.display = open ? "none" : "";
          pToggle.textContent = open ? "Preview the letter \u25B8"
            : "Hide letter \u25BE";
          pToggle.setAttribute("aria-expanded", open ? "false" : "true");
        });
        step.appendChild(pToggle);
        step.appendChild(letterBox);

        var openBtn = h("button", { id: "sf-demand-open",
          "class": "sf-btn-green", "type": "button" },
          "Open in Gmail \u2014 just click Send");
        step.appendChild(h("div", { "class": "sf-actions" }, openBtn));
        step.appendChild(h("p", { "class": "sf-fine" },
          "Goes out from you: " + det.name + " (" + det.email + ")" +
          (det.state ? ", " + (D.stateName(det.state) || det.state) : "") +
          ". Details live only in this browser \u2014 change them any " +
          "time from the toolbar popup."));

        // The letter is regenerated alongside recipient changes
        // so the preview always matches what the compose will
        // carry — but its TEXT no longer depends on the To
        // field at all (v1.0.55): it is always addressed to the
        // company behind the SENDER domain. The To address is
        // just transport — an address the user pastes may
        // belong to a registrar (support.aws.com), and the
        // company the demand names must never be renamed to
        // match it.
        var letter = null;
        function refresh() {
          letter = D.buildDemand({
            name: det.name, email: det.email, state: det.state,
            companyDomain: senderDom
          });
          letterTa.value = "Subject: " + letter.subject + "\n\n" + letter.body;
        }
        toField.addEventListener("input", refresh);
        refresh();

        openBtn.addEventListener("click", function () {
          var to = toField.value.trim();
          if (!to) {
            // v1.0.55: an empty To must never open a compose
            // (earlier builds could, on a guessed default the
            // user never saw). Point at the empty field AND
            // flash the errand that fills it.
            toField.focus();
            flashInstr();
            return;
          }
          if (!letter) refresh();
          var url = "https://mail.google.com/mail/u/" + accountIndex() +
            "/?view=cm&fs=1" +
            "&to=" + encodeURIComponent(to) +
            "&su=" + encodeURIComponent(letter.subject) +
            "&body=" + encodeURIComponent(letter.body);
          window.open(url, "_blank", "noopener");
        });
      }

      D.loadDetails().then(function (det) {
        if (D.detailsComplete(det)) renderDemandStep(det);
        else renderDetailsForm();
      });
    })();
  }

  function fetchOriginal(mid, onStep, ikIn) {
    // v1.0.63: the caller (fetchOriginalWithRetry) resolves the key —
    // sync hunts plus the async bootstrap fetch — and passes it in.
    // A call without ikIn keeps the old sync-only behavior.
    var ik = (typeof ikIn !== "undefined") ? ikIn : ikParam();
    var acct = accountIndex();
    var urls = [];
    if (ik) {
      urls.push("https://mail.google.com/mail/u/" + acct + "/?ui=2&ik=" + ik +
        "&view=om&th=" + encodeURIComponent(mid));
    }
    urls.push("https://mail.google.com/mail/u/" + acct + "/?ui=2&view=om&th=" +
      encodeURIComponent(mid));
    urls.push("https://mail.google.com/mail/u/" + acct + "/?view=om&th=" +
      encodeURIComponent(mid));

    function cleanErr(e) {
      try {
        if (e && e.message) return String(e.message);
        return String(e);
      } catch (x) {
        return "unknown error";
      }
    }

    function step(s) {
      if (onStep) { try { onStep(s); } catch (e) {} }
    }

    var failures = [];

    // One candidate view=om URL → Promise<raw string | null>.
    //
    // v1.0.33 root cause: Gmail's "show original" page is now just a
    // summary table (Message ID / From / Subject / SPF…) plus a
    // "Download Original" link — the message BODY never appears in
    // the page text, so scraping innerText returned headers-only text
    // and every link in the body was lost. The raw message lives
    // behind that page's own Download link, so follow it: fetch the
    // link's target and use its text verbatim (no DOMParser pass —
    // it IS the raw message). Only when there is no download link,
    // or the download fetch fails, fall back to the pre-1.0.33
    // page-text scrape for this candidate.
    function fetchCandidate(pageUrl, n) {
      function note(msg) { failures.push("try " + n + ": " + msg); }
      var p;
      try {
        p = fetch(pageUrl, { credentials: "include" });
      } catch (e) {
        note("couldn't start request");
        return Promise.resolve(null);
      }
      return Promise.resolve(p).then(function (res) {
        if (!res.ok) {
          note("HTTP " + res.status);
          return null; // try next form
        }
        return res.text();
      }, function () {
        note("network error");
        return null; // network-level fail -> try next form
      }).then(function (html) {
        if (typeof html !== "string") return html; // came from note() path
        var doc = new DOMParser().parseFromString(html, "text/html");
        // Pre-1.0.33 behavior: the page's visible text, used as a
        // fallback when the download route isn't available.
        function fallback() {
          var text = doc.body ? doc.body.innerText : "";
          if (text && text.indexOf("Received:") !== -1) return text;
          note("page had no headers");
          return null;
        }
        // The page's own "Download Original" anchor: match its
        // visible text, with the download URL shape as a fallback.
        var anchors = doc.querySelectorAll("a");
        var dl = null;
        for (var j = 0; j < anchors.length; j++) {
          var label = (anchors[j].textContent || "").trim();
          var href = anchors[j].getAttribute("href") || "";
          if (/download original/i.test(label) ||
              href.indexOf("disp=att") !== -1 ||
              href.indexOf("view=att") !== -1) {
            dl = anchors[j];
            break;
          }
        }
        if (!dl) {
          note("no download link on page");
          return fallback();
        }
        var dlUrl = dl.getAttribute("href") || "";
        try { dlUrl = new URL(dlUrl, pageUrl).href; } catch (e) {}
        var dp;
        try {
          dp = fetch(dlUrl, { credentials: "include" });
        } catch (e) {
          note("download couldn't start");
          return fallback();
        }
        return Promise.resolve(dp).then(function (res2) {
          if (!res2.ok) {
            note("download HTTP " + res2.status);
            return fallback();
          }
          return res2.text().then(function (raw) {
            // The download target is the raw message itself — return
            // it untouched when it looks like one.
            if (raw && raw.indexOf("Received:") !== -1) return raw;
            note("download had no headers");
            return fallback();
          });
        }, function () {
          note("download network error");
          return fallback();
        });
      });
    }

    function attempt(i) {
      if (i >= urls.length) {
        throw new Error("Gmail wouldn't hand over the headers. " +
          failures.join("; "));
      }
      step("Fetching full headers (try " + (i + 1) + "/" + urls.length + ")\u2026");
      return fetchCandidate(urls[i], i + 1).then(function (raw) {
        if (raw !== null) return raw;
        return attempt(i + 1);
      }).catch(function (e) {
        // Normalize to a plain string: Firefox wraps cross-compartment
        // rejection values in an unreadable wrapper otherwise.
        throw new Error(cleanErr(e));
      });
    }
    return attempt(0);
  }

  // v1.0.63: resolve the session key, run the fetch, and on a
  // headers failure make ONE fresh-key retry. Resolution order:
  // the sync hunts (instant, and in Firefox they always hit); only
  // when they come up empty does the async bootstrap fetch run —
  // the Chrome path. The retry covers a stale scraped key: if the
  // bootstrap produces a DIFFERENT key than the one that just
  // failed, the ik-form request runs once more with it. When no
  // key exists anywhere, the error says so instead of leaving the
  // user staring at bare 404s.
  function fetchOriginalWithRetry(mid, onStep) {
    var acct = accountIndex();
    function step0(s) { if (onStep) { try { onStep(s); } catch (e) {} } }
    var firstIk = ikParam();
    var start;
    if (firstIk) {
      start = Promise.resolve(firstIk);
    } else {
      step0("Fetching Gmail session key\u2026");
      start = fetchIkBootstrap(acct).then(function (b) {
        firstIk = b;
        return b;
      });
    }
    return start.then(function (ik) {
      return fetchOriginal(mid, onStep, ik);
    }).catch(function (err) {
      var msg = "";
      try { msg = String((err && err.message) || err); } catch (x) {}
      if (msg.indexOf("wouldn't hand over") === -1) throw err;
      return fetchIkBootstrap(acct).then(function (ik2) {
        if (ik2 && ik2 !== firstIk) return fetchOriginal(mid, onStep, ik2);
        if (!firstIk && !ik2) {
          throw new Error(msg + " No Gmail session key could be found" +
            " — reload Gmail and try again.");
        }
        throw err;
      });
    });
  }

  function onShieldClick() {
    var mid = currentMessageId();
    if (!mid) {
      var body0 = showPanel();
      body0.appendChild(h("p", { "class": "sf-warn" },
        "Open a single email first, then click the shield."));
      return;
    }
    var panel = showPanel();
    function prog(s) { renderLoading(panel, s); }
    prog("Finding the open message\u2026");
    var p;
    try {
      p = fetchOriginalWithRetry(mid, prog);
    } catch (e) {
      p = Promise.reject(e);
    }
    Promise.resolve(p).then(function (raw) {
      return window.SpamAvenger.investigate(raw, prog);
    }).then(function (a) {
      renderResult(panel, a);
    }).catch(function (err) {
      var msg;
      try {
        msg = String((err && err.message) || err);
      } catch (x) {
        msg = "unreadable error object";
      }
      clearEl(panel);
      panel.appendChild(h("p", { "class": "sf-warn" },
        "Something broke (v" + SF_VERSION + "): " + msg +
        ". Try reloading Gmail and clicking the shield again."));
    });
  }

  // Boot: inject button, keep it in sync with Gmail's SPA navigation.
  ensureButton();
  syncButton();
  var obs = new MutationObserver(function () {
    ensureButton();
    syncButton();
  });
  obs.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("hashchange", syncButton);
})();
