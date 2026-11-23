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
      pick: "For the service question, pick Compute Engine.",
      // v1.0.69 (combined): per-field steps — the Google form
      // (verified live 2026-11-02) splits the report across
      // its own boxes, and one paste fits none of them: its
      // "Abuse details" box caps at 1,000 characters and the
      // headers go in as an uploaded log file instead. Each
      // field below names the form's box and carries the
      // evidence slice that box wants (lib
      // buildFormFieldEvidence builds the slices). The form's
      // name/email boxes are the reporter's own — steps never
      // cover identity fields, only evidence fields.
      // Public 1.0.72: the intro closes with Michael's
      // past-details line (his call, Nov 8 2026) — Google
      // Support's form offers details from the reporter's
      // earlier cases ("Use past details", on the left of
      // the form), and Joe should hear up front that the
      // memory is Google's, not the addon's, before it
      // startles him. Google's kit only: the panel is a
      // Google Support feature.
      // v1.0.74 (queued-google-form-signin-note.md,
      // Michael's tap Nov 21 2026): one more startle of the
      // same class, answered the same way — the page's
      // header carries a "Sign in" button that reads like
      // a developer login is required. It isn't: Michael
      // filed the form signed out the same evening and
      // Google emailed a "Verify your email now" link
      // instead. The sentence sits just ahead of the
      // past-details closer, so that line still closes the
      // intro. Google's kit only, like the closer.
      fieldsIntro: "The form's first boxes are your name and " +
        "email address \u2014 those are yours to fill in, and " +
        "Spam Avenger never prepares them. The steps below " +
        "cover the form's evidence fields, one box at a time. " +
        "Ignore the Sign in button at the top of Google's " +
        "page \u2014 you don't need a Google account to file " +
        "this. Google will email you a link to verify your " +
        "address instead. " +
        "Google may offer details from your earlier reports " +
        "on the left side of this form. That's Google " +
        "remembering your past cases, not Spam Avenger " +
        "\u2014 use them or ignore them.",
      fields: [
        { box: "Abuse date",
          help: "The day the message arrived, in the date " +
            "box's YYYY-MM-DD shape.",
          copy: "date" },
        { box: "Abuse details",
          help: "Google caps this box at 1,000 characters, " +
            "so this copy is the short version: the IP, the " +
            "message facts, and the links. The full headers " +
            "go in the logs upload below, not here.",
          copy: "googleDetails" },
        { box: "Additional logs",
          help: "This one is a file upload, not a paste box. " +
            "Copy the log text, save it as a plain text file " +
            "(for example abuse-log.txt), and upload that file.",
          copy: "logs" } ] },
    aws: { label: "Amazon AWS",
      url: "https://repost.aws/knowledge-center/report-aws-abuse",
      linkText: "repost.aws/knowledge-center/report-aws-abuse",
      // v1.0.69 (combined): per-field steps, mapped from what
      // AWS itself says a report must carry (Trust & Safety
      // reporting FAQ + the report-aws-abuse knowledge-center
      // article, checked 2026-11-02: type of abuse, dates and
      // times with the time zone, source IP addresses, log
      // extracts, and the specific URLs for abusive content).
      // The form itself is a script-driven page whose boxes
      // could not be read directly, so these steps follow
      // AWS's published requirements rather than its pixels.
      fieldsIntro: "The form starts by asking who you " +
        "are \u2014 your name and email are yours to fill in, " +
        "and Spam Avenger never prepares them. The steps " +
        "below cover the evidence AWS asks a report to carry.",
      fields: [
        { box: "Type of abuse",
          help: "Pick the spam / abusive-email option " +
            "\u2014 AWS routes the report by it. Nothing to " +
            "paste here.",
          copy: null },
        { box: "Source IP and date/time",
          help: "AWS asks for the source IP, the date and " +
            "time of the incident, and the time zone " +
            "\u2014 one incident block, dates in ISO 8601.",
          copy: "awsIncident" },
        { box: "Log extracts",
          help: "AWS asks for log extracts that show the " +
            "activity. For an email, the log is the " +
            "message's Received line and its full headers.",
          copy: "logs" },
        { box: "URLs in the message",
          help: "For abusive content AWS asks for the " +
            "specific URLs. These are un-defanged, exactly " +
            "as they appeared \u2014 a URL box needs the " +
            "literal addresses.",
          copy: "urls" } ],
      // v1.0.73 (queued-guided-form-fields.md): the same
      // form, walked for the LINK-host report \u2014 the kit
      // above covers a sender on AWS; these cover a site
      // AWS hosts that the spam advertises (the form fields
      // Michael's own link-host filing used on Nov 21 2026).
      // The form's front door separates reports about an
      // email resource from reports about a hosted resource;
      // a link report takes the hosted door. If the form
      // will not take the report at all, AWS's abuse desk
      // also reads email \u2014 trustandsafety@support.aws.com
      // \u2014 and the intro below says so on the panel.
      linkPick: "Front door: this report is about a site " +
        "AWS hosts, not about mail AWS sent \u2014 take the " +
        "hosted-resource door if the form offers one. For " +
        "the abuse type, the substance is \u201chosting a " +
        "site advertised in spam\u201d; the form has no " +
        "exact choice for that (and \u201cPhishing\u201d " +
        "fits only when the page itself harvests " +
        "credentials), so pick the closest website-abuse " +
        "wording it offers.",
      linkFieldsIntro: "Same form as the sender report " +
        "above, different facts \u2014 these steps are for " +
        "the hosted site. If the form won't take the " +
        "report, the same facts can be emailed to " +
        "trustandsafety@support.aws.com instead.",
      linkFields: [
        { box: "Complete email header and body",
          help: "The whole message in one paste \u2014 for a " +
            "report that arrived by email, the form wants " +
            "the header and the body together.",
          copy: "headersBody" },
        { box: "URL of abusive email content",
          help: "The advertised page's address, exactly " +
            "as it appeared \u2014 un-defanged, like the " +
            "sender report's URL box.",
          copy: "urls" },
        { box: "Comments",
          help: "What this report is, in the hosting " +
            "frame: the site is hosted by AWS and was " +
            "advertised in spam. The form caps this box " +
            "at 10,000 characters; the text below fits.",
          copy: "linkComment" } ],
      // v1.0.74 (queued-aws-email-lane.md, Michael's call
      // Nov 23 2026): the email door, restored for THIS
      // desk only. AWS's own form names an email fallback
      // for people who can't use the form — its Trust &
      // Safety desk, the same address the v1.0.73 link kit
      // above already names in its intro — and Michael
      // filed by email himself that morning and prefers
      // the lane. So the mail kit below the form steps
      // offers the complaint by email too: the same
      // complaint the lib built (subject and body, full
      // sample riding in the body as on every email kit),
      // addressed to this desk, opened in Gmail in one
      // click. The form lane above stays exactly as it
      // was — this is an ADDITIONAL door, not a swap, and
      // no other form lane gains one: their desks deflect
      // email by policy, which is why they are form kits
      // at all.
      emailTo: "trustandsafety@support.aws.com" },
    azure: { label: "Microsoft Azure",
      // The MSRC URL carries its picks with it —
      // ThreatType=IpAddress + IncidentType=Spam pre-picked
      // (Michael's link, Nov 2 2026, out of his Outlook test of
      // an Azure-hosted spam whose panel only offered the
      // abuse@microsoft.com email). `fact` is his one
      // information line, and `showLink` prints the
      // parameterized link under the evidence box — both
      // stay. v1.0.70 reworks the kit around the form's real
      // shape, from Michael's screenshots of his hand filing
      // (Nov 2 2026): the form has TWO text boxes on two
      // steps. The Contact Information step's Additional
      // information box caps at 15,000 characters — the
      // v1.0.69 mirror-complaint details block (8000-char
      // header cap) FITS it (his paste used ~9,200), so the
      // block stays, retargeted as that box's step slice
      // ("additionalInfo"). The Report Details step's
      // Report notes box caps at 2,000, so it gets a short
      // slice instead ("msrcNotes": facts + defanged links,
      // no headers). Between them sit the Source IP box and
      // the Incident date / time / Time zone pickers. Azure
      // now declares `fields` like the other three lanes —
      // one step per real box, in the form's order, each
      // slice built by lib buildFormFieldEvidence — and the
      // evidence box above the steps holds the standard
      // block, same as theirs. The old standalone
      // copy-details button is retired; the steps carry
      // their own copy buttons.
      url: "https://msrc.microsoft.com/report/abuse?ThreatType=IpAddress&IncidentType=Spam",
      linkText: "https://msrc.microsoft.com/report/abuse?ThreatType=IpAddress&IncidentType=Spam",
      fact: "This host takes abuse reports through its web form; the form is where a case gets opened.",
      showLink: true,
      fieldsIntro: "The form's Contact Information step " +
        "comes first \u2014 its name and email boxes are " +
        "yours to fill in, and Spam Avenger never prepares " +
        "them. The steps below cover the form's evidence " +
        "boxes, in the form's order.",
      fields: [
        { box: "Additional information",
          help: "On the form's Contact Information step. " +
            "This is the big paste: the full report, with " +
            "the complete headers. The box caps at 15,000 " +
            "characters, and this copy fits it.",
          copy: "additionalInfo" },
        { box: "Source IP address",
          help: "On the Report Details step, the form gives " +
            "the source IP its own box. The Source port, " +
            "Destination IP address, and Destination port " +
            "boxes are optional \u2014 for email spam, leave " +
            "them blank.",
          copy: "ip" },
        { box: "Incident date and time",
          help: "The form splits this into three required " +
            "boxes: Incident date, Incident time, and Time " +
            "zone. The box below gives the message's moment " +
            "in UTC \u2014 set the form's date and time boxes " +
            "from it, and pick UTC/GMT in the Time zone box " +
            "if it's offered.",
          copy: "incidentStamp" },
        { box: "Report notes",
          help: "On the Report Details step. This box caps " +
            "at 2,000 characters, so this copy is the short " +
            "version: the facts and the defanged links, no " +
            "headers \u2014 the full headers ride in the " +
            "Additional information paste above.",
          copy: "msrcNotes" } ] }
  };

  // The fourth form lane: OVHcloud (same shape as the table
  // above; its detection is the v1.0.27 contact/org match in
  // renderResult, not a.hyperscaler). The URL is the one the
  // retired v1.0.27 hint chip linked.
  var OVH_FORM_HINT = { label: "OVHcloud",
    url: "https://www.ovhcloud.com/en/abuse/",
    linkText: "ovhcloud.com/en/abuse",
    // v1.0.69 (combined): per-field steps, mapped from
    // OVHcloud's own abuse-form terms (checked 2026-11-02: a
    // valid report gives the location of the activity — a
    // URL or an IP address — a description of the
    // infringement, and logs/technical elements; OVHcloud's
    // FAQ adds that a category is picked first and that only
    // logs and technical elements are forwarded to the
    // service owner, with no personal data in those fields).
    fieldsIntro: "The form asks who you are and wants an " +
      "email address for the outcome \u2014 those are yours " +
      "to fill in, and Spam Avenger never prepares them. " +
      "The steps below cover the report's evidence fields.",
    fields: [
      { box: "Category",
        help: "Pick the category for unsolicited email / " +
          "spam \u2014 OVHcloud routes the report by it. " +
          "Nothing to paste here.",
        copy: null },
      { box: "Location",
        help: "OVHcloud asks for the location of the " +
          "reported activity, a URL or an IP address. For " +
          "email spam that is the sending IP address.",
        copy: "ip" },
      { box: "Description",
        help: "OVHcloud requires a description of what " +
          "happened, and sends it to the service owner " +
          "\u2014 so this copy is facts only: what " +
          "arrived, from where, and when. No names, no " +
          "personal information.",
        copy: "description" },
      { box: "Logs / technical elements",
        help: "OVHcloud forwards only logs and technical " +
          "elements to the service owner, and says to keep " +
          "personal data out of these fields. This copy is " +
          "the message's Received line and full headers " +
          "\u2014 give it a once-over for your own address " +
          "before you submit.",
        copy: "logs" } ] };

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

  // Public 1.0.72 release (internal build .73): the
  // signed-in account's own email address, read off the
  // Gmail page for the send-as hint (lib sendAsHintFor).
  // The header's account control carries it in its
  // aria-label — "Google Account: <name> (<email>)" — so
  // only elements whose label OPENS with "Google Account"
  // are trusted, and the address must extract cleanly.
  // Anything else (a layout that hides it, a label without
  // an address) returns "" and the lib falls back to its
  // custom-domain rule: the hint then fires only for a
  // non-Gmail recipient and never guesses at a Gmail one.
  function signedInAccountEmail() {
    try {
      var els = document.querySelectorAll(
        '[aria-label^="Google Account"]');
      for (var i = 0; i < els.length; i++) {
        var label = els[i].getAttribute("aria-label") || "";
        var m = label.match(/\(([^()]*@[^()]*)\)/) ||
          label.match(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
        if (m) return m[1];
      }
    } catch (e) {}
    return "";
  }

  // The account holder's display name, read off the same
  // control ("Google Account: <name> (<email>)" in its
  // aria-label, or its title when the label is bare). The
  // own-forward catch corroborates a send-as forward by
  // the sender's display name matching the holder's. No
  // readable name returns "" and that corroborator simply
  // goes absent — never an error.
  function signedInAccountName() {
    try {
      var els = document.querySelectorAll(
        '[aria-label^="Google Account"]');
      for (var i = 0; i < els.length; i++) {
        var texts = [els[i].getAttribute("aria-label") || "",
          els[i].getAttribute("title") || ""];
        for (var j = 0; j < texts.length; j++) {
          var m = texts[j].match(
            /^Google Account:\s*(.+?)\s*\([^()]*@[^()]*\)/);
          if (m && m[1]) return m[1].trim();
        }
      }
    } catch (e) {}
    return "";
  }

  function messageOpen() {
    // A message/thread view has a legacy message id in the DOM.
    return !!document.querySelector("[data-legacy-message-id]");
  }

  // Public 1.0.72 release (internal build .73): the
  // own-forward catch (queued-own-forward-catch.md) — page
  // signals for one message element: its visible sender
  // (the name span's email attribute, or the address shown
  // beside it), the sender's display name (the same span's
  // name attribute, or its text), the recipients (their
  // email attributes, on the header's .g2 chips and any
  // other addressed node in the header block, the sender
  // itself excluded), and whether its body carries
  // Gmail's "Forwarded message" block. A collapsed message
  // renders none of these, so its signals come back empty
  // and every decision built on them degrades to the old
  // behavior. Any signal that cannot be read is simply
  // absent — never an error.
  function pageMessageSignals(el) {
    var sig = { senderEmail: "", senderName: "",
      recipientEmails: [], bodyText: "" };
    if (!el) return sig;
    try {
      var nameEl = el.querySelector(".gD");
      var em = nameEl ? nameEl.getAttribute("email") : null;
      if (em) sig.senderEmail = em;
      if (nameEl) {
        var nm = nameEl.getAttribute("name") ||
          (nameEl.textContent || "");
        if (nm && nm.trim()) sig.senderName = nm.trim();
      }
      if (!sig.senderEmail) {
        var goEl = el.querySelector(".go");
        var m = goEl && (goEl.textContent || "")
          .match(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
        if (m) sig.senderEmail = m[1];
      }
      var seen = {};
      function addRcpt(node) {
        var a = node && node.getAttribute &&
          node.getAttribute("email");
        if (a && !seen[a]) {
          seen[a] = true;
          sig.recipientEmails.push(a);
        }
      }
      var rEls = el.querySelectorAll(".g2[email]");
      for (var i = 0; i < rEls.length; i++) addRcpt(rEls[i]);
      var hb = el.querySelector(".hb");
      if (hb) {
        var hEls = hb.querySelectorAll("[email]");
        for (var j = 0; j < hEls.length; j++) {
          if (hEls[j] !== nameEl) addRcpt(hEls[j]);
        }
      }
      var bodyEl = el.querySelector(".a3s");
      sig.bodyText = bodyEl ? (bodyEl.textContent || "") : "";
    } catch (e) {}
    return sig;
  }

  function messageElById(mid) {
    var els = document.querySelectorAll("[data-legacy-message-id]");
    for (var i = 0; i < els.length; i++) {
      if (els[i].getAttribute("data-legacy-message-id") === mid) {
        return els[i];
      }
    }
    return null;
  }

  // The lib detector's verdict for one message element:
  // its own signals plus the thread subject and the
  // signed-in account's address and holder name.
  function ownForwardOnPage(el) {
    var SA = window.SpamAvenger;
    if (!el || !SA || !SA.ownForwardVerdict) return false;
    var sig = pageMessageSignals(el);
    var subjEl = document.querySelector("h2.hP");
    return SA.ownForwardVerdict({
      subject: subjEl ? (subjEl.textContent || "") : "",
      senderEmail: sig.senderEmail,
      senderName: sig.senderName,
      bodyText: sig.bodyText,
      recipientEmails: sig.recipientEmails,
      accountEmail: signedInAccountEmail(),
      accountName: signedInAccountName()
    });
  }

  function currentMessageId() {
    var els = document.querySelectorAll("[data-legacy-message-id]");
    if (!els.length) return null;
    // Public 1.0.72 release (internal build .73): in a
    // mixed thread (the Oct 28 shape — the user's own
    // APWG/CISA forward sitting above the original spam),
    // anchor on the first message that is NOT the user's
    // own forward when the top one is, so the panel traces
    // the original instead of failing on the forward. When
    // nothing can be told apart, the first message anchors,
    // exactly as before.
    if (els.length > 1 && ownForwardOnPage(els[0])) {
      for (var i = 1; i < els.length; i++) {
        if (!ownForwardOnPage(els[i])) {
          return els[i].getAttribute("data-legacy-message-id");
        }
      }
    }
    return els[0].getAttribute("data-legacy-message-id");
  }

  // v1.0.66: per-message action history (Michael's ask, 2026-10-31).
  // When the user LAUNCHES a lane for a message — opens the FTC or
  // Safe Browsing form, opens the complaint compose, gets the
  // forward addressed, opens Gmail's own report dialog — the panel
  // remembers it, keyed by the message, so coming back to the same
  // email shows "✓ Launched <when>" instead of inviting a duplicate
  // run. The store holds ONLY message keys, lane names, and
  // timestamps — no subjects, addresses, URLs, or complaint text —
  // in chrome.storage.local under one key, pruned to the 100 most
  // recently touched messages. The wording is "Launched"/"Opened",
  // never "Sent"/"Submitted": the user reviews and sends or
  // submits everything themselves, outside this panel.
  // [sa-history-helpers-begin]
  var SA_HISTORY_KEY = "saActionHistory";
  var SA_HISTORY_MAX = 100;
  var SA_LANES = ["complaint", "ftc", "sb", "fwd", "google", "pid",
    "website", "registrar", "linkhost"];

  // The record key for a message: the analysis Message-ID (the
  // header, from lib/analyze.js) when there is one, else the Gmail
  // DOM legacy message id. Null when neither exists — history is
  // simply skipped for such a message.
  function saHistoryKey(analysis, legacyId) {
    var mid = (analysis && analysis.messageId)
      ? String(analysis.messageId).trim() : "";
    if (mid) return mid;
    var leg = legacyId ? String(legacyId).trim() : "";
    return leg || null;
  }

  function saNewestTs(rec) {
    var n = 0;
    if (rec && typeof rec === "object") {
      for (var k in rec) {
        if (Object.prototype.hasOwnProperty.call(rec, k) &&
            typeof rec[k] === "number" && rec[k] > n) n = rec[k];
      }
    }
    return n;
  }

  // Drops malformed records and keeps at most `max` messages —
  // the ones whose newest lane timestamp is most recent.
  function saPruneHistory(hist, max) {
    var out = {};
    if (!hist || typeof hist !== "object") return out;
    var keys = Object.keys(hist).filter(function (k) {
      return hist[k] && typeof hist[k] === "object" &&
        saNewestTs(hist[k]) > 0;
    });
    keys.sort(function (x, y) {
      return saNewestTs(hist[y]) - saNewestTs(hist[x]);
    });
    var keep = keys.slice(0,
      (typeof max === "number" && max > 0) ? max : SA_HISTORY_MAX);
    keep.forEach(function (k) { out[k] = hist[k]; });
    return out;
  }

  // "10:15 AM" — local time only (the badge form of a timestamp).
  // A non-number or non-positive ts is no timestamp at all
  // (new Date(null) is the epoch, not an invalid date) — "".
  function saFormatTime(ts) {
    if (typeof ts !== "number" || !(ts > 0)) return "";
    var d = new Date(ts);
    if (isNaN(d.getTime())) return "";
    var hrs = d.getHours();
    var ap = hrs < 12 ? "AM" : "PM";
    var h12 = hrs % 12;
    if (h12 === 0) h12 = 12;
    var min = d.getMinutes();
    if (min < 10) min = "0" + min;
    return h12 + ":" + min + " " + ap;
  }

  // "Oct 31, 10:15 AM" — local time, no year (the store prunes to
  // the last 100 touched messages, so a record is never old).
  function saFormatWhen(ts) {
    if (typeof ts !== "number" || !(ts > 0)) return "";
    var d = new Date(ts);
    if (isNaN(d.getTime())) return "";
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return months[d.getMonth()] + " " + d.getDate() + ", " +
      saFormatTime(ts);
  }

  function saLaunchedText(ts) {
    return "\u2713 Launched " + saFormatWhen(ts);
  }

  function saOpenedText(ts) {
    return "\u2713 Complaint opened " + saFormatWhen(ts);
  }

  // v1.0.66-test2: the badge that rides on a lane's OUTER control
  // (its section toggle or action-row button — the always-visible
  // part). test1's marks were small status lines under rows and
  // inside collapsed sections, so on a fresh panel a returning
  // user saw literally no change (Michael's live test). The
  // badge text is short — "✓ 10:42 AM" — and the full launched
  // line rides in its title attribute.
  function saBadgeText(ts) {
    var t = saFormatTime(ts);
    return t ? "\u2713 " + t : "\u2713";
  }

  function saBadgeTitle(lane, ts, already) {
    if (already) return "Already reported to Google \u2713";
    return lane === "complaint"
      ? saOpenedText(ts) : saLaunchedText(ts);
  }

  // Creates the badge span on `el` (a lane's toggle/button) or
  // updates the one already there. Finds an existing badge among
  // el's children by class, so repeat calls never stack badges.
  // Appended LAST, after the caret/glyph and label children —
  // for Forward that means after (never inside) the .sf-acc-label
  // span its machinery rewrites. Any DOM failure is swallowed:
  // a badge must never break the lane it decorates.
  function saBadgeOnElement(el, lane, ts, already) {
    if (!el) return null;
    try {
      var badge = null;
      var kids = el.childNodes || [];
      for (var i = 0; i < kids.length; i++) {
        if (kids[i] && kids[i].className === "sf-done-badge") {
          badge = kids[i];
          break;
        }
      }
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "sf-done-badge";
        el.appendChild(badge);
      }
      badge.textContent = saBadgeText(ts);
      badge.setAttribute("title", saBadgeTitle(lane, ts, already));
      return badge;
    } catch (e) {
      return null;
    }
  }

  // What a lane's status line should be preset to on panel open:
  // the launched/opened line when a record exists for the lane,
  // or null to leave the line alone. A status already showing
  // text from THIS session (e.g. a fresh click's "Report ready")
  // is never overwritten by the stale record.
  function saPresetText(currentText, rec, lane) {
    if (currentText) return null;
    if (!rec || typeof rec[lane] !== "number") return null;
    return lane === "complaint"
      ? saOpenedText(rec[lane]) : saLaunchedText(rec[lane]);
  }

  // Fire-and-forget: records lane=now for key in the store held
  // by `storage` (a chrome.storage.local-shaped object). Returns
  // true when a write was initiated. Every failure — no storage,
  // bad key, unknown lane, storage throwing — is swallowed and
  // reported as false; a lane must NEVER break or stall because
  // its history write failed.
  function saRecordLaunched(storage, key, lane, now) {
    if (!storage || !key || SA_LANES.indexOf(lane) === -1) return false;
    try {
      storage.get(SA_HISTORY_KEY, function (res) {
        try {
          var hist = (res && typeof res[SA_HISTORY_KEY] === "object" &&
            res[SA_HISTORY_KEY]) ? res[SA_HISTORY_KEY] : {};
          var next = {};
          Object.keys(hist).forEach(function (k) { next[k] = hist[k]; });
          var rec = {};
          if (next[key] && typeof next[key] === "object") {
            Object.keys(next[key]).forEach(function (l) {
              if (SA_LANES.indexOf(l) !== -1 &&
                  typeof next[key][l] === "number") rec[l] = next[key][l];
            });
          }
          rec[lane] = (typeof now === "number" && now > 0) ? now : Date.now();
          next[key] = rec;
          var payload = {};
          payload[SA_HISTORY_KEY] = saPruneHistory(next, SA_HISTORY_MAX);
          storage.set(payload, function () {
            try {
              if (typeof chrome !== "undefined" && chrome.runtime &&
                  chrome.runtime.lastError) { /* swallowed on purpose */ }
            } catch (e) {}
          });
        } catch (e) {}
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  // Loads the history record for one message key (or null) and
  // hands it to cb. Any failure reports null — the panel just
  // renders without indicators, exactly as before v1.0.66.
  function saLoadLaunched(storage, key, cb) {
    function done(rec) { try { cb(rec || null); } catch (e) {} }
    if (!storage || !key || typeof cb !== "function") { done(null); return; }
    try {
      storage.get(SA_HISTORY_KEY, function (res) {
        var hist = (res && typeof res[SA_HISTORY_KEY] === "object" &&
          res[SA_HISTORY_KEY]) ? res[SA_HISTORY_KEY] : null;
        var rec = hist ? hist[key] : null;
        done(rec && typeof rec === "object" ? rec : null);
      });
    } catch (e) {
      done(null);
    }
  }
  // [sa-history-helpers-end]

  // The message key for the message the panel is currently
  // showing, captured at render time (renderResult). Top-level
  // lane machinery (gmailForwardPhish) has no analysis object, so
  // it records against this; the DOM legacy id is the fallback
  // when no render captured a key.
  var sfCurrentMsgKey = null;

  function saStorageLocal() {
    try {
      if (typeof chrome !== "undefined" && chrome.storage &&
          chrome.storage.local) return chrome.storage.local;
    } catch (e) {}
    return null;
  }

  // Records a launched lane for the current message. Never
  // throws, never delays the caller.
  function recordLaunched(lane) {
    try {
      var key = sfCurrentMsgKey || saHistoryKey(null, currentMessageId());
      if (!key) return;
      saRecordLaunched(saStorageLocal(), key, lane, Date.now());
    } catch (e) {}
    saRecordSighting(lane);
    // v1.0.73 (queued-icann-escalation.md): a registrar
    // launch also lays down the report record the ICANN
    // escalation trigger counts — one per (registrar,
    // domain), earliest standing.
    if (lane === "registrar") {
      try { saWriteRegistrarReport(); } catch (e) {}
    }
  }

  // v1.0.72: repeat-offender memory — sightings. Where the
  // action history above is keyed by MESSAGE (what did I do
  // about this email), sightings are keyed by SENDER (what
  // have I reported about this IP / domain, across every
  // message): origin IP, From domain, date, the desk the lane
  // aimed at, and the action. v1.0.73 adds the message key, so
  // the count the lib reads back is distinct reports, not
  // lane launches. They live in the extension's own
  // chrome.storage.local under one key — never cookies, never
  // storage.sync, nothing leaves the machine — pruned to the
  // newest 500 by lib pruneSightings. A sighting is written
  // when a report lane LAUNCHES (recordLaunched above is the
  // one choke point every lane passes through) and once per
  // analysis with action "analyzed" (which the repeat note
  // never counts — opening a panel is not a report). If the
  // store is wiped (uninstall, a manual data clear), the
  // history simply resets and nothing else breaks.
  var SA_SIGHTINGS_KEY = "saSightings";

  // v1.0.73 (queued-icann-escalation.md): the registrar
  // report records the ICANN escalation counts, and its
  // dismissal memory. Same store, same rules as sightings:
  // chrome.storage.local only, nothing leaves the machine.
  // A record is { registrar (the lib's key), registrarName,
  // registrarAbuse, domain, registered, ip, host, ts } —
  // written when
  // the registrar lane launches, deduped per (registrar,
  // domain) with the earliest report standing, because the
  // trigger's age test reads the oldest. The dismissal map
  // is { registrarKey: countAtDismissal } — the offer stays
  // parked until the registrar's count grows past it.
  var SA_REGISTRAR_REPORTS_KEY = "saRegistrarReports";
  var SA_ICANN_DISMISSED_KEY = "saIcannEscalationDismissed";
  var ICANN_ESCALATION_URL =
    "https://icann-nsp.my.site.com/compliance/s/abuse-domain";

  function saWriteRegistrarReport() {
    var a = sfCurrentAnalysis;
    if (!a || !a.registrarInfo) return;
    var SA = window.SpamAvenger;
    if (!SA || !SA.icannRegistrarKey) return;
    var key = SA.icannRegistrarKey(a.registrarInfo);
    var domain = a.senderDomain || "";
    if (!key || !domain) return;
    var store = saStorageLocal();
    if (!store) return;
    store.get(SA_REGISTRAR_REPORTS_KEY, function (res) {
      var list = (res && res[SA_REGISTRAR_REPORTS_KEY]) || [];
      if (!Array.isArray(list)) list = [];
      for (var i = 0; i < list.length; i++) {
        if (list[i] && list[i].registrar === key &&
            list[i].domain === domain) {
          return; // already recorded — the earliest stands
        }
      }
      list.push({
        registrar: key,
        registrarName: a.registrarInfo.registrar || "",
        registrarAbuse: a.registrarInfo.registrarAbuse || "",
        domain: domain,
        registered: a.registrarInfo.registered || "",
        ip: a.ip || "",
        host: a.host || "",
        ts: Date.now()
      });
      var payload = {};
      payload[SA_REGISTRAR_REPORTS_KEY] = list;
      store.set(payload, function () {});
    });
  }

  // v1.0.73: download a text file the panel built (the
  // ICANN kit's CSV + evidence). Same Blob + object-URL
  // shape as any in-page download; the anchor is removed
  // and the URL revoked once the click has landed. Never
  // throws — a failed download leaves the form button's
  // other half (the form open) still working.
  function saDownloadText(filename, text) {
    try {
      var blob = new Blob([String(text || "")],
        { type: "text/plain" });
      var url = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      setTimeout(function () {
        try { URL.revokeObjectURL(url); } catch (e) {}
        try { link.remove(); } catch (e) {}
      }, 4000);
    } catch (e) {}
  }

  // The analysis the panel is currently showing, captured at
  // render time — sightings and gating read the sender's IP /
  // domain from it, the same way lane machinery reads the
  // message key from sfCurrentMsgKey.
  var sfCurrentAnalysis = null;

  function saDeskFor(lane, a) {
    if (!a) return "";
    switch (lane) {
      case "complaint":
        return a.complaint ? String(a.complaint.to || "") : "";
      case "website":
        return a.websiteComplaint
          ? String(a.websiteComplaint.to || "")
          : (a.websiteHost ? String(a.websiteHost.org || "") : "");
      case "registrar":
        return a.registrarInfo
          ? String(a.registrarInfo.registrarAbuse || "") : "";
      case "linkhost":
        return a.linkComplaint
          ? String(a.linkComplaint.to || "")
          : (a.linkHost ? String(a.linkHost.org || "") : "");
      case "ftc": return "ReportFraud.ftc.gov (FTC)";
      case "sb": return "Google Safe Browsing";
      case "fwd": return "reportphishing@apwg.org + contact@cisa.dhs.gov";
      case "google": return "Google (Report phishing)";
      case "pid": return "the company (data-deletion demand)";
      default: return "";
    }
  }

  // Fire-and-forget sighting write. Every failure is
  // swallowed: repeat memory must never break or stall a lane.
  // v1.0.73 (queued-repeat-counter-lane-launches.md): the
  // sighting also carries the current message key (`msg`),
  // and a REPORT sighting is skipped when this message
  // already has one against the same sender (same msg + IP +
  // domain) — one message worked through five lanes is one
  // report, and the store should say so at write time too.
  // (lib matchReports dedupes again at read time, which also
  // covers records written before the key existed.)
  function saWriteSighting(action, desk) {
    try {
      var a = sfCurrentAnalysis;
      var store = saStorageLocal();
      if (!a || !store) return;
      var SA = window.SpamAvenger;
      var msgKey = "";
      try {
        msgKey = sfCurrentMsgKey ||
          saHistoryKey(null, currentMessageId()) || "";
      } catch (e) {}
      var sighting = {
        ip: a.ip || "",
        domain: String(a.senderDomain || "").toLowerCase(),
        ts: Date.now(),
        desk: desk || "",
        action: action || "",
        msg: msgKey
      };
      store.get(SA_SIGHTINGS_KEY, function (res) {
        try {
          var list = (res && Array.isArray(res[SA_SIGHTINGS_KEY]))
            ? res[SA_SIGHTINGS_KEY] : [];
          if (sighting.action !== "analyzed" && sighting.msg) {
            var dup = list.some(function (s) {
              return s && s.action !== "analyzed" &&
                s.msg === sighting.msg &&
                String(s.ip || "") === sighting.ip &&
                String(s.domain || "").toLowerCase() ===
                  sighting.domain;
            });
            if (dup) return; // this message already reported it
          }
          list.push(sighting);
          var payload = {};
          payload[SA_SIGHTINGS_KEY] = (SA && SA.pruneSightings)
            ? SA.pruneSightings(list) : list.slice(-500);
          store.set(payload, function () {
            try {
              if (typeof chrome !== "undefined" && chrome.runtime &&
                  chrome.runtime.lastError) { /* swallowed */ }
            } catch (e) {}
          });
        } catch (e) {}
      });
    } catch (e) {}
  }

  function saRecordSighting(lane) {
    var a = sfCurrentAnalysis;
    saWriteSighting(lane, a ? saDeskFor(lane, a) : "");
  }

  // Loads the pruned sighting list (or []) and hands it to cb.
  // Any failure reports [] — the panel renders without the
  // repeat note, exactly as before v1.0.72.
  function saLoadSightings(cb) {
    function done(list) { try { cb(list || []); } catch (e) {} }
    var store = saStorageLocal();
    if (!store || typeof cb !== "function") { done([]); return; }
    try {
      store.get(SA_SIGHTINGS_KEY, function (res) {
        var list = (res && Array.isArray(res[SA_SIGHTINGS_KEY]))
          ? res[SA_SIGHTINGS_KEY] : [];
        var SA = window.SpamAvenger;
        done((SA && SA.pruneSightings)
          ? SA.pruneSightings(list) : list);
      });
    } catch (e) {
      done([]);
    }
  }

  // --- v1.0.72: background-worker messaging + site probing ---
  // The background worker (background.js) is a thin network
  // proxy: it fetches pages, DNS answers, and crt.sh lists the
  // content script cannot read itself. Every call resolves
  // null on ANY failure (no worker, timeout, bad reply) and
  // callers treat null as "no information" — the panel then
  // behaves exactly as it did before v1.0.72.
  function saBg(msg, timeoutMs) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () {
        if (!done) { done = true; resolve(null); }
      }, timeoutMs || 12000);
      function finish(v) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(v == null ? null : v);
      }
      try {
        if (typeof chrome === "undefined" || !chrome.runtime ||
            !chrome.runtime.sendMessage) {
          finish(null);
          return;
        }
        msg.sa = 1;
        chrome.runtime.sendMessage(msg, function (resp) {
          try {
            if (chrome.runtime.lastError) { finish(null); return; }
          } catch (e) {}
          finish(resp);
        });
      } catch (e) {
        finish(null);
      }
    });
  }

  function saProbeSiteHost(host) {
    return saBg({ kind: "probe", host: host }, 15000);
  }

  // One DoH answer list via the worker, with lib
  // dnsAnswerList's semantics: [] for NXDOMAIN or an
  // answered-empty result, null on any error or uncertainty.
  function saDohAnswers(name, type) {
    return saBg({ kind: "doh", name: name, type: type }, 8000)
      .then(function (d) {
        if (!d || typeof d.Status !== "number") return null;
        if (d.Status === 3) return [];
        if (d.Status !== 0) return null;
        return Array.isArray(d.Answer) ? d.Answer : [];
      }).catch(function () { return null; });
  }

  // Origin discovery: when a website's public address belongs
  // to a front-door proxy network, hunt the REAL host through
  // the leaks such setups leave — subdomains that bypass the
  // front door (the classic grey-cloud set, plus every name
  // Certificate Transparency has ever seen for the domain),
  // the domain's own MX targets, and SPF ip4 mechanisms.
  // Resolves the origin IP, or null when no candidate is a
  // real non-front-door host (genuinely hidden from outside).
  function saDiscoverOrigin(domain) {
    var SA = window.SpamAvenger;
    if (!SA || !SA.websiteIpFor || !SA.pickOriginIp) {
      return Promise.resolve(null);
    }
    var root = String(domain || "").toLowerCase().replace(/\.$/, "");
    var D = (typeof window !== "undefined") ? window.SpamDemand : null;
    if (D && D.registrableDomain) {
      root = D.registrableDomain(root) || root;
    }
    if (!root || root.indexOf(".") === -1) {
      return Promise.resolve(null);
    }
    var names = ["mail", "cpanel", "webmail", "ftp", "direct",
      "dev", "origin", "panel", "server", "host"].map(function (p) {
        return p + "." + root;
      });
    var ips = [];
    function collect(ip) { if (ip) ips.push(ip); }
    return saBg({ kind: "crtsh", domain: root }, 12000)
      .then(function (subs) {
        if (Array.isArray(subs)) {
          subs.forEach(function (s) {
            if (names.indexOf(s) === -1) names.push(s);
          });
        }
        names = names.slice(0, 30);
        var jobs = names.map(function (n) {
          return SA.websiteIpFor(n).then(collect)
            .catch(function () {});
        });
        jobs.push(saDohAnswers(root, "MX").then(function (ans) {
          if (!ans) return null;
          var hosts = [];
          ans.forEach(function (r) {
            if (r.type === 15 && r.data) {
              hosts.push(String(r.data).trim().split(/\s+/).pop()
                .replace(/\.$/, "").toLowerCase());
            }
          });
          return Promise.all(hosts.slice(0, 4).map(function (hn) {
            return SA.websiteIpFor(hn).then(collect)
              .catch(function () {});
          }));
        }).catch(function () {}));
        jobs.push(saDohAnswers(root, "TXT").then(function (ans) {
          if (!ans) return;
          ans.forEach(function (r) {
            if (r.type !== 16 || !r.data) return;
            var txt = String(r.data).replace(/"/g, "");
            var m, re = /ip4:\s*(\d{1,3}(?:\.\d{1,3}){3})/g;
            while ((m = re.exec(txt))) collect(m[1]);
          });
        }).catch(function () {}));
        return Promise.all(jobs);
      }).then(function () {
        return SA.pickOriginIp(ips);
      }).catch(function () { return null; });
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
    // v1.0.66: Gmail itself says this lane is done — that IS a
    // launched (indeed completed) Google report, so record it.
    recordLaunched("google");
    var rb2 = document.getElementById("sf-report-phish");
    if (rb2) {
      rb2.disabled = true;
      rb2.textContent = "Already reported to Google \u2713";
      setTimeout(function () {
        rb2.disabled = false;
        rb2.textContent = "Report phishing to Google";
      }, 8000);
    }
    // v1.0.66-test2: badge the Google section's toggle too, so
    // the done mark is visible on the always-visible outer
    // control, not only inside the (collapsed) section. No
    // timestamp is claimed — Gmail reported this at some
    // earlier point; the title carries the already-reported
    // wording and the badge text is a bare check.
    var gt = document.getElementById("sf-sec-google-toggle");
    if (gt) saBadgeOnElement(gt, "google", null, true);
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
      // v1.0.66: the forward compose is addressed — the lane was
      // launched. Record it and show it on the status line under
      // the row (the label itself re-arms below, so the launched
      // note lives on the separate status element).
      recordLaunched("fwd");
      var fs = document.getElementById("sf-fwd-status");
      if (fs) fs.textContent = saLaunchedText(Date.now());
      // v1.0.66-test2: badge the row button itself, in-session.
      // The button is this very element (id sf-fwd-phish); the
      // badge goes on the button AFTER its label span, never
      // inside .sf-acc-label (setLabel rewrites that span and
      // the re-arm below would eat a badge placed there).
      var rbBadge = document.getElementById("sf-fwd-phish");
      if (rbBadge) saBadgeOnElement(rbBadge, "fwd", Date.now(), false);
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
    // Public 1.0.72 release (internal build .73), Michael's
    // call Nov 8 2026: Show details opens with ALL the facts
    // or not at all. The header rows above are in hand now,
    // but the website / link host rows only exist once the
    // domain trace at the bottom of this render settles — so
    // a click that lands while the trace is still running
    // waits on this gate (loading label, button disabled so
    // extra clicks are ignored) and opens complete the moment
    // the trace chain settles. A failed lookup settles the
    // gate too: the details open with the missing fact
    // reading unknown / not published, never half-finished.
    var detailsTraceSettled = false;
    var detailsOpenWaiters = [];
    function settleDetailsTrace() {
      if (detailsTraceSettled) return;
      detailsTraceSettled = true;
      var ws = detailsOpenWaiters;
      detailsOpenWaiters = [];
      ws.forEach(function (fn) { try { fn(); } catch (e) {} });
    }
    function openDetails() {
      details.style.display = "";
      toggle.textContent = "Hide details \u25BE";
      toggle.setAttribute("aria-expanded", "true");
      // The details block sits at the TOP of the scrolling
      // body, but the toggle is pinned and gets clicked from
      // wherever the user has scrolled to — usually the
      // bottom, after working the lanes. Without this, the
      // details open out of view and the click looks like it
      // did nothing (Michael's field find, Nov 8 2026).
      // Opening the details takes the user to them.
      try { body.scrollTop = 0; } catch (e) {}
    }
    function closeDetails() {
      details.style.display = "none";
      toggle.textContent = "Show details \u25B8";
      toggle.setAttribute("aria-expanded", "false");
    }
    toggle.addEventListener("click", function () {
      if (details.style.display !== "none") {
        closeDetails();
        return;
      }
      if (detailsTraceSettled) { openDetails(); return; }
      toggle.disabled = true;
      toggle.textContent = "Loading details\u2026";
      detailsOpenWaiters.push(function () {
        toggle.disabled = false;
        // The panel may have moved on to another message
        // while the trace ran; never pop a stale render's
        // details open.
        if (sfCurrentMsgKey === msgKey) openDetails();
        else closeDetails();
      });
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
      // v1.0.68: in the Microsoft tenant-account case, the
      // abuse contact that matters is the phishing desk the
      // Report Abuse lane now targets — not the pool IP's
      // RDAP contact (abuse@microsoft.com) — and the makeup
      // line below is backwards (the From account is real),
      // so the lib builds a flipped note naming the account.
      details.appendChild(mkRow("Abuse contact",
        a.msAccountReport ? "phish@office365.microsoft.com"
                          : (a.abuse || "not published")));
      // v1.0.72: the authentication results as ONE statement
      // (lib authSummaryLine) — Michael's wording: the correct
      // technical terms in a plain sentence ("Missing standard
      // SPF, DKIM, and DMARC authentication"), with the term
      // list adapted to whichever mechanisms are actually
      // missing. Shown only when something IS missing; the
      // per-mechanism verdicts ride in the complaint evidence
      // as before.
      var authLine = window.SpamAvenger.authSummaryLine
        ? window.SpamAvenger.authSummaryLine(a.authResults)
        : null;
      if (authLine) {
        details.appendChild(mkRow("Authentication", authLine));
      }
      var detailNote = a.msAccountReport && window.SpamAvenger.msDetailsNote
        ? window.SpamAvenger.msDetailsNote(a) : null;
      details.appendChild(h("p", { "class": "sf-note" },
        detailNote ||
        'The "From" address is spoofed. The IP is the face underneath.'));
    }
    if (a.flags && a.flags.length) {
      var fw = h("div", { "class": "sf-flags" }, h("b", null, "Red flags"));
      var ul = h("ul");
      a.flags.forEach(function (f) { ul.appendChild(h("li", null, f)); });
      fw.appendChild(ul);
      details.appendChild(fw);
    }
    // Public 1.0.72 release (internal build .73): the
    // sextortion callout (lib detectSextortion flagged the
    // body in analyze) — the one thing a frightened recipient
    // needs to hear, in plain words: it is a mass-mailed
    // ransom bluff, and paying is the only way it works.
    // PLACEMENT CORRECTED Nov 8 2026 (Michael's field note):
    // the callout does NOT live in Show details — a
    // frightened user never expands the toggle, and calming
    // them is the panel's first job. It renders UP FRONT on
    // the body itself, above the legend and every lane, as
    // a standing sf-warn banner (the pink warning family,
    // like the no-contact note in the stack). One home
    // only. The report lanes below are untouched (the FTC
    // lane carries the message — the classifier never sees
    // this flag, so no forward is offered for it).
    if (a.sextortion && a.sextortion.flagged) {
      body.appendChild(h("p", { "class": "sf-warn" },
        "This looks like sextortion: a ransom bluff sent to " +
        "thousands of people. The sender almost certainly " +
        "has no video and no access to your device. " +
        "Don't pay."));
    }
    // Public 1.0.73 release: the own-forward banner on the
    // header-fetch SUCCESS path too (queued-own-forward-
    // catch.md, Nov 21 2026 addendum). The catch built into
    // 1.0.72 only fired when the header fetch FAILED; on the
    // direitodoestado.com.br forward copy the fetch
    // SUCCEEDED, so the panel rendered in full with no sign
    // it was Michael's own APWG/CISA forward rather than
    // the original spam. The verdict runs on the message
    // the panel is anchored to — currentMessageId already
    // prefers a non-self message in a mixed thread, so a
    // banner here means the panel really is sitting on the
    // forward copy. It renders beside the sextortion
    // banner, above every lane; the lanes below stay live
    // (the catch's job was never to block work, only to say
    // plainly which message is open). Detection failure —
    // the forward markers not expanded in the page — shows
    // nothing: the safe direction, per the catch's rule
    // that a false "this is yours" is worse than a miss.
    try {
      var owfEl = messageElById(currentMessageId());
      if (owfEl && ownForwardOnPage(owfEl) &&
          window.SpamAvenger.OWN_FORWARD_BANNER) {
        body.appendChild(h("p",
          { "class": "sf-warn sf-own-forward-banner" },
          window.SpamAvenger.OWN_FORWARD_BANNER));
      }
    } catch (e) {}
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
    // Public 1.0.72 release (internal build .73): notes that
    // stand in for a BLOCKED lane are COLLECTED here and shown
    // as one group at the bottom of the stack
    // (queued-blocked-lanes-group.md, Michael's direction
    // Nov 8 2026). In place, an explanation of absence sat
    // mid-stack interrupting the lanes the user can actually
    // run — his field catch: the spoof suppression note
    // rendered between the Forward row and the Link host
    // lane. Now the actionable lanes read clean top to
    // bottom, and every blocked lane's labeled note waits
    // together under a "Blocked lanes" heading, in the order
    // the lanes would have appeared. Collected: every
    // placeGateNote output and the mail lane's two labeled
    // sf-warn stand-ins. NOT collected: the sextortion
    // banner (panel top by design), red-flag callouts,
    // send-as hints, status lines, the repeat-offender
    // note — those belong where they already are.
    var blockedNotes = [];
    var blockedGroupEl = null;
    var blockedGroupLive = false;
    function renderBlockedGroup() {
      if (!blockedNotes.length) {
        if (blockedGroupEl) {
          blockedGroupEl.remove();
          blockedGroupEl = null;
        }
        return;
      }
      if (!blockedGroupEl) {
        blockedGroupEl = h("div", { "class": "sf-blocked-group",
          "id": "sf-blocked-group" });
      }
      clearEl(blockedGroupEl);
      blockedGroupEl.appendChild(
        h("hr", { "class": "sf-blocked-rule" }));
      blockedGroupEl.appendChild(
        h("p", { "class": "sf-blocked-heading" }, "Blocked lanes"));
      blockedNotes.forEach(function (n) {
        blockedGroupEl.appendChild(n);
      });
      // (Re)appended LAST in the stack: after the PID
      // section, before the body's "Nothing is sent
      // automatically" footer — the footer is a body child,
      // so end-of-stack is exactly that seam. Re-appending
      // on each arrival keeps the group last while the
      // async domain sections slot in above the PID toggle.
      stack.appendChild(blockedGroupEl);
    }
    function addBlockedNote(noteEl) {
      blockedNotes.push(noteEl);
      // Mid-render arrivals only collect: materializing now
      // would strand the group under the lanes the rest of
      // this synchronous render still appends. The call at
      // the end of renderResult flips the group live; later
      // (async) arrivals render into it immediately.
      if (blockedGroupLive) renderBlockedGroup();
    }
    var acc = makeAccordion(stack);
    // The Gmail-native report button is built inside the
    // big-provider branch below, but its section sits fifth in
    // the stack (after Forward), so the branch hands the button
    // up through this variable.
    var reportPhishBtn = null;
    // v1.0.66: this render's message key for the action-history
    // store, and the per-lane launched-status elements (built by
    // whichever branch renders the lane; the history preset at
    // the bottom of the render fills them in).
    var msgKey = saHistoryKey(a, currentMessageId());
    sfCurrentMsgKey = msgKey;
    // v1.0.72: sightings + gating read the current analysis
    // from here (lane launches happen long after this render
    // returns). The analysis itself leaves an "analyzed"
    // sighting — never counted by the repeat note, which is
    // about REPORTS.
    sfCurrentAnalysis = a;
    saWriteSighting("analyzed", "");
    // Public 1.0.72 release (internal build .73): the
    // send-as hint (queued-send-as-hint.md, Michael's call
    // Nov 8 2026). When the address this spam was sent to
    // differs from the signed-in account's own address,
    // every lane that opens a Gmail compose carries one
    // small line naming the address to send as — a fresh
    // compose defaults to the account's default identity,
    // and a complaint should leave from the address that
    // received the spam. The comparison and the fallback
    // (account address unreadable -> custom-domain
    // recipients only) are the lib's sendAsHintFor, fed the
    // address read off this page; the panel never touches
    // the compose's From itself. sendAsHintEl() returns a
    // fresh element per lane (an element can only hang in
    // one place), or null when no hint fires.
    var sendAsAddr = window.SpamAvenger.sendAsHintFor
      ? window.SpamAvenger.sendAsHintFor(a.recipient,
          signedInAccountEmail())
      : null;
    function sendAsHintEl(what) {
      if (!sendAsAddr) return null;
      return h("p", { "class": "sf-fine sf-sendas-hint" },
        window.SpamAvenger.sendAsHintText(sendAsAddr, what));
    }
    // v1.0.72: repeat-offender note. Prior REPORTS of this
    // sender (same origin IP first, From domain as fallback —
    // lib matchReports) put an encouragement line at the top
    // of the stack and a prior-report section into the drafted
    // complaints (a.priorReports, read by the lib builders).
    // The mail complaint is already built by investigate(), so
    // when priors exist it is rebuilt here and the textarea
    // re-filled; the website / registrar / link complaints are
    // built later in the trace, after this has landed, and
    // pick the section up on their own. Async and best-effort:
    // no priors (or no storage) leaves the panel exactly as it
    // rendered. The wording is Michael's: it leads with "Your
    // last report of this sender was on <date>." and scales
    // with the count — never "still sending".
    saLoadSightings(function (list) {
      var SA = window.SpamAvenger;
      if (!SA || !SA.matchReports || sfCurrentMsgKey !== msgKey) {
        return;
      }
      var m = SA.matchReports(list, a.ip, a.senderDomain);
      if (!m || !m.count) return;
      a.priorReports = m;
      if (a.complaint) {
        var nc = SA.buildComplaint(a);
        if (nc) {
          a.complaint = nc;
          var taEl = document.getElementById("sf-complaint-text");
          if (taEl) {
            taEl.value = "To: " + nc.to + "\nSubject: " +
              nc.subject + "\n\n" + nc.body;
          }
          // The rebuilt complaint can flip the mail lane's
          // fit to paste mode — keep its warning truthful.
          refreshMailPasteWarn();
        }
      }
      var note = SA.repeatPanelNote ? SA.repeatPanelNote(m) : null;
      if (note) {
        stack.insertBefore(
          h("p", { "class": "sf-note sf-repeat-note" }, note),
          stack.firstChild);
      }
    });
    var complaintStatusEl = null, googleStatusEl = null;
    // v1.0.66-test2: badge targets for this render — each lane
    // registers the element of its OUTER, always-visible control
    // (section toggle or action-row button) as it renders:
    // badgeTargets[lane] = { el }. applyLaunchedBadge reads the
    // registry AT CALL TIME, never a snapshot: the history-load
    // callback at the bottom of this render fires asynchronously
    // (chrome.storage callbacks always do), by which point the
    // synchronous remainder of the render has completed the
    // registry.
    // v1.0.66-test4: the PID lane IS in this registry, but its
    // registered target — the blue section toggle — carries
    // only a DISPLAY-ONLY MIRROR of the badge that lives on the
    // green Open-in-Gmail button inside the section. History:
    // test3 (Michael's call) took the badge off the toggle
    // entirely, leaving it on the green button alone; test4
    // (his follow-up call, same day) restores it on the toggle
    // as a mirror, so a collapsed PID section still shows at a
    // glance that the lane was launched. The single source of
    // truth stays the saActionHistory record: the toggle badge
    // is always applied from the same stored timestamp (or the
    // same click-moment value) as the button badge — never an
    // independently computed time — and the toggle still never
    // RECORDS anything (see the pid section below). The green
    // button is built asynchronously by the demand step, so it
    // presets its own badge (and re-mirrors the toggle) there;
    // see renderDemandStep below.
    // v1.0.66-test5: the COMPLAINT lane follows the same
    // button-plus-mirror shape as PID (Michael's call after the
    // test4 live test): its badge lives on the inner action
    // button itself — the form kit's "Copy evidence & open the
    // form" button or the email lane's "Open in Gmail" button —
    // and the section toggle carries the mirror. So complaint
    // registers TWO targets ({ els: [toggle, button] } below);
    // every other lane keeps the single-target { el } shape.
    // Both complaint elements are built synchronously in this
    // render, before the history-load callback fires, so the
    // callback presets both from the one stored timestamp; the
    // in-session click applies one shared `now` to both.
    // Public 1.0.72 release (internal build .73): website and
    // registrar join the two-target shape — Michael's field
    // catch on the vitluma.fun panel (Nov 8 2026): the
    // registrar section toggle showed "✓ 6:52 PM" while the
    // "Open in Gmail" button inside the section showed
    // nothing, so the button he actually clicked looked
    // unlaunched. Their entries are { els: [toggle, button] }
    // like complaint's, in both their shapes (email lane and
    // form kit), and their buttons carry .sf-btn-label spans
    // so the paste/copy label swaps can't eat the badge. The
    // trace render's own async preset (below) and the history
    // callback both walk the els array, so a return visit
    // stamps both controls from the stored timestamp. The
    // link host lane joins the same two-target shape later
    // the same evening, on its own field catch (its toggle
    // and its "Open in Gmail" button both stayed unstamped
    // after a launch — it was never in SA_LANES at all, and
    // recorded only a sighting).
    var badgeTargets = {};
    // Public 1.0.72 release (internal build .73): the mail
    // lane's paste-mode warning element (queued-registrar-
    // paste-mode.md item 2), refreshed by refreshMailPasteWarn
    // below — once when the section builds, and again from
    // the sightings callback above whenever a prior-report
    // rebuild replaces a.complaint (a longer rebuilt body can
    // flip the fit to paste mode after the section rendered).
    var mailPasteWarnEl = null;
    function refreshMailPasteWarn() {
      if (!mailPasteWarnEl) return;
      var plan = null;
      try {
        plan = window.SpamAvenger.fitForCompose(accountIndex(), a);
      } catch (e) {}
      var paste = !!(plan && plan.mode === "paste");
      mailPasteWarnEl.style.display = paste ? "" : "none";
      if (paste) {
        mailPasteWarnEl.textContent =
          window.SpamAvenger.PASTE_MODE_WARNING;
      }
    }
    function applyLaunchedBadge(lane, ts, already) {
      var t = badgeTargets[lane];
      if (!t) return;
      var els = t.els || (t.el ? [t.el] : []);
      for (var i = 0; i < els.length; i++) {
        saBadgeOnElement(els[i], lane, ts, already);
      }
    }
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
      // v1.0.67: the Microsoft tenant-account case (a.msAccountReport,
      // set by lib/analyze.js) stays in THIS email lane — its
      // complaint already targets phish@office365.microsoft.com
      // about the account. It must never be diverted to the Azure
      // form kit: a protection-pool IP's RDAP can read as a
      // Microsoft/MSFT block, but this is a mailbox tenant
      // account, not a rented Azure VM.
      if (a.msAccountReport) {
        formLane = null;
      } else if (a.hyperscaler && HYPER_FORM_HINTS[a.hyperscaler]) {
        formLane = HYPER_FORM_HINTS[a.hyperscaler];
      } else if (/ovh/i.test(c.to + " " + (a.org || ""))) {
        formLane = OVH_FORM_HINT;
      }
      if (formLane) {
        var kitSec = acc.section("sf-sec-complaint", "sf-btn-blue",
          "Abuse report \u2014 use their form");
        // v1.0.66-test5: els[0] is the toggle (the mirror);
        // the form button itself is pushed in below, the
        // moment it exists — both are badged together.
        badgeTargets.complaint = { els: [kitSec.toggle] };
        var kw = h("div", { "class": "sf-complaint" });
        // v1.0.65 (Michael's edit, 2026-10-28): the note tells
        // Joe ONLY what he has to do — details are copied to
        // the clipboard, paste with Ctrl+V or right-click, plus
        // the lane's service pick where there is one. The old
        // copy justified the lane (deflection policy, why no
        // email) — "full of shit no Joe user gives a shit
        // about," his words, and he's right: it's gone.
        // v1.0.69: a lane can still carry ONE factual line
        // (azure's `fact`: the form is where a case gets
        // opened) — information Michael explicitly asked for,
        // rendered above the instruction note. It is a fact,
        // not the old justification copy.
        if (formLane.fact) {
          kw.appendChild(h("p", { "class": "sf-note" }, formLane.fact));
        }
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
        // The box holds the standard form block (lib
        // buildFormEvidence) for every form lane. (v1.0.69
        // filled azure's box with the complaint-mirroring
        // block; since v1.0.70 that block rides as azure's
        // "Additional information" step slice instead — the
        // MSRC form's 15,000-character box is its real home.)
        eta.value = window.SpamAvenger.buildFormEvidence(a) || "";
        kw.appendChild(eta);
        // Lanes flagged `showLink` (azure): the form link
        // itself, shown as a link under the box — the exact
        // parameterized MSRC URL from the table, not just a
        // button's side effect. (v1.0.69 tied this to the
        // retired `details` flag; the link stays, the flag
        // is its own now.)
        if (formLane.showLink) {
          kw.appendChild(h("p", { "class": "sf-fine" },
            "Abuse form: ",
            h("a", { href: formLane.url, target: "_blank",
              rel: "noopener" }, formLane.linkText)));
        }
        // v1.0.64 (Michael's call, 2026-10-28, after his live
        // test): ONE button does the whole lane — it copies the
        // evidence to the clipboard, then opens the form, so the
        // user's only job on the form is Ctrl+V. (The Copy button
        // cut from the email lane stays cut: there, Open in
        // Gmail does the work. Here the lane IS copy-and-paste,
        // so the copy earns its place — folded into this button.)
        // v1.0.66-test5: the button's label lives in its OWN
        // span (.sf-btn-label) and the badge rides as a SIBLING
        // span — the click handler below rewrites the label for
        // its "Copied!…" confirmation, and a whole-button
        // textContent write would wipe a badge child (and a
        // captured "original label" would bake badge text into
        // the restore string). Same arrangement the actionRow's
        // .sf-acc-label uses for Forward. The visible label —
        // and the swap/restore texts — are unchanged.
        var formBtnLabel = h("span", { "class": "sf-btn-label" },
          "Copy evidence & open the " + formLane.label + " abuse form");
        var formBtn = h("button", { id: "sf-open-abuse-form",
          "class": "sf-btn-blue", "type": "button" }, formBtnLabel);
        badgeTargets.complaint.els.push(formBtn);
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
          var origLabel = formBtnLabel.textContent;
          formBtnLabel.textContent = copied
            ? "Copied! The form is open \u2014 paste into its details field (Ctrl+V or right-click \u2192 Paste)"
            : "The form is open \u2014 copy the box text above and paste it in";
          setTimeout(function () { formBtnLabel.textContent = origLabel; }, 6000);
          window.open(formLane.url, "_blank", "noopener");
          // v1.0.66: the form-kit lane IS the complaint lane for
          // these hosts — the evidence was copied and the form
          // opened, so record the launch.
          recordLaunched("complaint");
          // v1.0.66-test5: ONE `now` for the status line and
          // BOTH badges — this button and its mirror on the
          // section toggle — so the two can never disagree.
          // The badge span is a sibling of the label span, so
          // it rides through the "Copied!…" swap above and is
          // still there when the label restores 6s later. The
          // trigger is THIS inner button's click, never the
          // toggle's own expand/collapse click.
          var now = Date.now();
          if (complaintStatusEl) {
            complaintStatusEl.textContent = saOpenedText(now);
          }
          applyLaunchedBadge("complaint", now);
        });
        // v1.0.70: the copy-only "Copy the details for the
        // form" button azure carried in v1.0.69 is retired
        // with the single-block kit it served — the per-field
        // steps below each carry their own copy button now.
        var kitActions = h("div", { "class": "sf-actions" });
        kitActions.appendChild(formBtn);
        kw.appendChild(kitActions);
        // v1.0.69 (combined): per-field steps for the forms
        // whose boxes each want a different slice of the
        // evidence (the lane entry's `fields` list). Michael's
        // rule from the Azure test, generalized: don't just
        // point at the form, hand over what goes in each box.
        // Each step names the form's box, says the one thing
        // Joe has to do with it, and — when the box takes a
        // paste — shows that field's slice in its own box
        // with its own Copy button. The copy buttons are
        // copy-only: no form open, no launched record (nothing
        // is filed until Joe submits the form himself). Steps
        // whose slice can't be built (no URLs for a URL box,
        // no date that parses) are skipped outright rather
        // than shown empty. All four lanes declare `fields`
        // since v1.0.70, azure included.
        if (formLane.fields && formLane.fields.length) {
          var fwrap = h("div", { "class": "sf-form-fields" });
          fwrap.appendChild(h("b", null,
            "Filling in the " + formLane.label +
            " form, field by field"));
          if (formLane.fieldsIntro) {
            fwrap.appendChild(h("p", { "class": "sf-note" },
              formLane.fieldsIntro));
          }
          formLane.fields.forEach(function (fld) {
            var fTxt = fld.copy
              ? window.SpamAvenger.buildFormFieldEvidence(a, fld.copy)
              : null;
            if (fld.copy && !fTxt) return; // no slice, no step
            var fBlock = h("div", { "class": "sf-form-field" });
            fBlock.appendChild(h("b", null,
              "For the form\u2019s \u201C" + fld.box +
              "\u201D field"));
            if (fld.help) {
              fBlock.appendChild(h("p", { "class": "sf-fine" },
                fld.help));
            }
            if (fld.copy) {
              var fTa = h("textarea", {});
              fTa.readOnly = true;
              fTa.value = fTxt;
              fBlock.appendChild(fTa);
              var fBtn = h("button", { "class": "sf-btn-blue",
                "type": "button" },
                "Copy for the " + fld.box + " field");
              fBtn.addEventListener("click", function () {
                var copied = false;
                try {
                  fTa.focus();
                  fTa.select();
                  copied = document.execCommand("copy");
                } catch (e) {}
                if (!copied && navigator.clipboard) {
                  navigator.clipboard.writeText(fTa.value)
                    .catch(function () {});
                  copied = true; // best-effort; text stays selected
                }
                var origLabel = fBtn.textContent;
                fBtn.textContent = copied
                  ? "Copied! Paste it into the form\u2019s " +
                    fld.box + " field (Ctrl+V or right-click " +
                    "\u2192 Paste)"
                  : "Select the box above and copy it (Ctrl+C)";
                setTimeout(function () {
                  fBtn.textContent = origLabel;
                }, 6000);
              });
              fBlock.appendChild(fBtn);
            }
            fwrap.appendChild(fBlock);
          });
          kw.appendChild(fwrap);
        }
        // v1.0.74 (queued-aws-email-lane.md, Michael's call
        // Nov 23 2026): the email door, for the one form
        // lane whose desk reads email — AWS Trust & Safety
        // (see the hint's emailTo note). Only a lane
        // carrying emailTo grows this block; today that is
        // AWS alone, and the form kit above it is untouched.
        // The shape is the registrar email lane's: the
        // complaint in a box (To / Subject / body — the
        // full sample rides in the body, as on every email
        // kit), one green Open-in-Gmail button, the send-as
        // hint, the paste-mode warning. The complaint is
        // RETARGETED: the lane's own object (c) is addressed
        // to whatever abuse contact the RDAP named, and
        // this one must land on the Trust & Safety desk the
        // hint names — same subject, same body, new To. The
        // click runs fitGivenComplaint against the retargeted
        // object (the fit the wired lanes use) and records
        // a launch of this section's own lane, badged and
        // status-lined exactly like the form button's click.
        if (formLane.emailTo) {
          var awsMail = { to: formLane.emailTo,
            subject: c.subject, body: c.body };
          kw.appendChild(h("b", null,
            "Or email it instead \u2014 AWS Trust & Safety"));
          kw.appendChild(h("p", { "class": "sf-note" },
            "AWS also takes this report by email at " +
            formLane.emailTo + " \u2014 the fallback its own " +
            "form names for people who can't use the form. " +
            "The complaint below is the same report, " +
            "addressed to that desk; the button opens it " +
            "in Gmail, ready to send. The form above stays " +
            "available either way."));
          var emTa = h("textarea",
            { id: "sf-aws-email-text" });
          emTa.readOnly = true;
          emTa.value = "To: " + awsMail.to + "\nSubject: " +
            awsMail.subject + "\n\n" + awsMail.body;
          kw.appendChild(emTa);
          var emBtnLabel = h("span",
            { "class": "sf-btn-label" },
            "Open in Gmail \u2014 just click Send");
          var emBtn = h("button",
            { id: "sf-aws-email-compose",
              "class": "sf-btn-green" }, emBtnLabel);
          badgeTargets.complaint.els.push(emBtn);
          showGreen = true; // Open in Gmail (the email door)
          var emSendAs = sendAsHintEl();
          if (emSendAs) kw.appendChild(emSendAs);
          var emPaste = pasteWarnEl(awsMail);
          if (emPaste) kw.appendChild(emPaste);
          kw.appendChild(
            h("div", { "class": "sf-actions" }, emBtn));
          emBtn.addEventListener("click", function () {
            var plan = window.SpamAvenger.fitGivenComplaint(
              accountIndex(), awsMail);
            if (!plan) return;
            if (plan.mode === "paste") {
              if (navigator.clipboard) {
                navigator.clipboard.writeText(
                  plan.complaint.body).catch(function () {});
              }
              var origLabel = emBtnLabel.textContent;
              emBtnLabel.textContent =
                "Copied! Paste into the email (Ctrl+V), then Send";
              setTimeout(function () {
                emBtnLabel.textContent = origLabel;
              }, 6000);
            }
            window.open(plan.url, "_blank", "noopener");
            recordLaunched("complaint");
            var now = Date.now();
            if (complaintStatusEl) {
              complaintStatusEl.textContent = saOpenedText(now);
            }
            applyLaunchedBadge("complaint", now);
          });
        }
        // v1.0.66: launched-status line for the complaint lane.
        complaintStatusEl = h("p", { "class": "sf-fine sf-status",
          "id": "sf-complaint-status" }, "");
        kw.appendChild(complaintStatusEl);
        kitSec.panel.appendChild(kw);
      } else {
      var compSec = acc.section("sf-sec-complaint", "sf-btn-green",
        "Abuse complaint \u2014 ready to send");
      // v1.0.66-test5: els[0] is the toggle (the mirror);
      // the compose button itself is pushed in below, the
      // moment it exists — both are badged together.
      badgeTargets.complaint = { els: [compSec.toggle] };
      var cw = h("div", { "class": "sf-complaint" },
        h("b", null, "Ready-to-send complaint"));
      // v1.0.67 (Michael's correction, Nov 2 2026): NOT a
      // separate lane — this is the same Report Abuse lane,
      // switched. When the traced origin is Microsoft's Outlook
      // protection pool and the account's SPF/DKIM/DMARC all
      // pass, the complaint below is addressed to Microsoft's
      // phishing desk (phish@office365.microsoft.com) and
      // reports the sender's ACCOUNT, because the IP is
      // Microsoft's shared pool and a host complaint against
      // it would hit the wrong target. The note says so; the
      // section, textarea, and Open-in-Gmail flow are the
      // ordinary complaint lane's, unchanged.
      if (a.msAccountReport) {
        cw.appendChild(h("p", { "class": "sf-note" },
          "This came from a real Microsoft account on " +
          "Microsoft's shared Outlook protection servers, so " +
          "this report goes to Microsoft's phishing desk " +
          "about the account itself \u2014 not a host complaint " +
          "against the shared IP."));
      }
      var ta = h("textarea", { id: "sf-complaint-text" });
      ta.readOnly = true;
      ta.value = "To: " + c.to + "\nSubject: " + c.subject + "\n\n" + c.body;
      cw.appendChild(ta);
      // v1.0.64 (Michael’s call, 2026-10-28): the orange "Copy
      // complaint" button is gone — real users never used it,
      // and anyone technical enough to want the raw text can
      // copy it straight from the textarea above. "Open in
      // Gmail" is the one send path.
      // v1.0.66-test5: the label lives in its OWN span
      // (.sf-btn-label), the badge rides as a SIBLING span —
      // the paste-mode confirmation below rewrites the label,
      // and a whole-button textContent write would wipe a
      // badge child (same hazard as the form-kit button; see
      // there). Visible label and swap texts unchanged.
      var compBtnLabel = h("span", { "class": "sf-btn-label" },
        "Open in Gmail \u2014 just click Send");
      var compBtn = h("button", { id: "sf-compose",
        "class": "sf-btn-green" }, compBtnLabel);
      badgeTargets.complaint.els.push(compBtn);
      showGreen = true; // Open in Gmail
      var compSendAs = sendAsHintEl();
      if (compSendAs) cw.appendChild(compSendAs);
      mailPasteWarnEl = h("p",
        { "class": "sf-note sf-paste-warn" }, "");
      mailPasteWarnEl.style.display = "none";
      cw.appendChild(mailPasteWarnEl);
      refreshMailPasteWarn();
      cw.appendChild(h("div", { "class": "sf-actions" }, compBtn));
      // v1.0.66: launched-status line for the complaint lane,
      // inside the section under the compose button.
      complaintStatusEl = h("p", { "class": "sf-fine sf-status",
        "id": "sf-complaint-status" }, "");
      cw.appendChild(complaintStatusEl);
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
          var origLabel = compBtnLabel.textContent;
          compBtnLabel.textContent = "Copied! Paste into the email (Ctrl+V), then Send";
          setTimeout(function () { compBtnLabel.textContent = origLabel; }, 6000);
        }
        window.open(plan.url, "_blank", "noopener");
        // v1.0.66: the compose (direct, shrunk, or paste mode)
        // actually opened — the complaint lane was launched.
        recordLaunched("complaint");
        // v1.0.66-test5: ONE `now` for the status line and
        // BOTH badges — this button and its mirror on the
        // section toggle (the PID shape). The badge span is a
        // sibling of the label span, so the paste-mode swap
        // above can't wipe it. The trigger is THIS inner
        // button's click, never the toggle's own
        // expand/collapse click.
        var now = Date.now();
        if (complaintStatusEl) {
          complaintStatusEl.textContent = saOpenedText(now);
        }
        applyLaunchedBadge("complaint", now);
      });
      }
    } else if (a.ip && !a.skipComplaint) {
      // Public 1.0.72 release (internal build .73): this
      // warning is the abuse complaint lane's stand-in, so
      // it opens with the lane's name in bold like every
      // lane stand-in note (see placeGateNote) — the wording
      // after the label is unchanged. And like every
      // stand-in it is COLLECTED into the Blocked lanes
      // group at the bottom of the stack (see
      // addBlockedNote), not appended where the lane would
      // have rendered.
      // Public 1.0.73 release (queued-abuse-note-sb-
      // reference.md): the Safe Browsing pointer sentence
      // rides in its own span. Whether the SB lane will
      // actually be on the panel isn't known at this first
      // pass (the lane's final gating verdict lands in
      // applyClassification), so the sentence is provisional:
      // the final pass removes the span when no SB lane is
      // visible, leaving the contact fact standing alone —
      // a blocked note must never point at a lane that
      // isn't there.
      addBlockedNote(h("p", { "class": "sf-warn" },
        h("b", null, "Abuse complaint:"), " " +
        "No published abuse contact for this IP. ",
        h("span", { "class": "sf-abuse-sb-fallback" },
          "Report the links below via Google Safe Browsing instead.")));
    } else if (a.skipComplaint) {
      addBlockedNote(h("p", { "class": "sf-warn" },
        h("b", null, "Abuse complaint:"), " " +
        (a.providerAdvice ||
        ("This came from a big mailbox provider\u2019s own servers \u2014 " +
         "no complaint generated (it would hit the wrong target)."))));
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
            // v1.0.66: Gmail's report dialog is on its way — the
            // Google lane was launched.
            recordLaunched("google");
            if (googleStatusEl) {
              googleStatusEl.textContent = saLaunchedText(Date.now());
            }
            // v1.0.66-test2: badge the Google section toggle
            // in-session (this inner button is the trigger).
            applyLaunchedBadge("google", Date.now());
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
    // v1.0.70: the ACID-style sender-domain trace — lanes 2
    // and 3 beside the mail lane above. The RrSG's ACID tool
    // splits an abuse case three ways (mail host / website
    // host / registrar) because a fraud operation rents all
    // three separately; Michael's Nov 3 2026 hand-run on a
    // real case found two desks the mail trace never sees.
    // The lib traces the From domain lazily
    // (traceSenderDomain): A-record resolution (CNAMEs
    // followed) -> IP RDAP for the website host, and domain
    // RDAP for the registrar block. It runs HERE, after the
    // mail lanes have rendered, never inside investigate() —
    // the mail pipeline's network behavior is pinned, and
    // these lanes are garnish: any failure simply means the
    // sections below never appear. The sections are built
    // only when the trace lands, and only while this render
    // is still the current message (the PID lane's staleness
    // guard, same msgKey). They slot in directly above the
    // PID section — the fight order reads mail host, website
    // host, registrar, then the report lanes and PID below.
    // v1.0.71 fix (Michael's live test, Nov 4 2026): the new
    // sections DO get action-history lanes/badges now. He sent
    // the registrar complaint (July Name, hzxhqz.com) and the
    // panel showed no timestamp at all, while the Forward lane
    // right above it carried its \u2713 badge \u2014 so he could not
    // tell the lane had run. "website" and "registrar" joined
    // SA_LANES, their section toggles are registered in
    // badgeTargets below, wireCompose records the launch, and
    // the history preset at the end of this function badges a
    // returning panel (these sections render asynchronously,
    // after the main render's own preset callback has fired).
    function renderDomainTraceSections() {
      var w = a.websiteHost;
      var pidToggle = stack.querySelector("#sf-sec-pid-toggle");
      // v1.0.72: lane-gating outcomes that REPLACE a section
      // with one plain explanation line (runLaneGating ran
      // before this render and recorded them on the analysis):
      // the sender domain has no live website (Michael's exact
      // sentence — no button, no drafted complaint), or a
      // website exists but the company hosting it is hidden
      // behind a front-door proxy whose origin never leaked
      // (names nobody — the front-door company is never
      // mentioned to the user). The registrar section and the
      // report lanes are untouched by both.
      // Public 1.0.72 release (internal build .73): every
      // note that stands in for an absent lane OPENS with
      // the lane's name in bold (Michael's call, Nov 8
      // 2026) — an unlabeled explanation reads as a
      // NEIGHBORING lane's warning (his vitluma.fun catch:
      // the no-website note sat under the FTC row and read
      // as an FTC warning). The sentence itself is
      // unchanged; the label does the attributing. And the
      // note no longer renders in place at all: it is
      // COLLECTED into the Blocked lanes group at the
      // bottom of the stack (see addBlockedNote), where
      // the labels matter even more — notes from several
      // lanes sit side by side there, each naming its own.
      function placeGateNote(label, text) {
        var n = h("p", { "class": "sf-note" },
          h("b", null, label), " " + text);
        addBlockedNote(n);
        return n;
      }
      // Public 1.0.72 release (internal build .73): the
      // paste-mode warning (queued-registrar-paste-mode.md
      // item 2) — when a lane's complaint will open in paste
      // mode, its section says so BEFORE the click, next to
      // the button, so the user never discovers paste mode
      // inside the compose. The prediction runs the same fit
      // the click will run (fitGivenComplaint, same account,
      // same complaint object), so the warning and the click
      // can never disagree.
      function pasteWarnEl(complaint) {
        var plan = null;
        try {
          plan = window.SpamAvenger.fitGivenComplaint(
            accountIndex(), complaint);
        } catch (e) {}
        if (!plan || plan.mode !== "paste") return null;
        return h("p", { "class": "sf-note sf-paste-warn" },
          window.SpamAvenger.PASTE_MODE_WARNING);
      }
      if (a.spoofDomainSuppressed) {
        // Public 1.0.72 release (internal build .73): the
        // From domain is spoofed (runLaneGating's composite
        // trigger) — BOTH domain lanes are suppressed and
        // this one note stands where they would have. It
        // supersedes the website-only gate notes below: it
        // explains both absences.
        placeGateNote("Website host and Registrar:",
          window.SpamAvenger.SPOOF_DOMAIN_EXPLANATION);
        // The traced facts are still evidence: the website
        // rows join Show details in the same prefixed form
        // the no-contact branch below uses. (The Show
        // details gate holds the toggle until this render,
        // so the rows are present before it can first open.)
        if (w && w.ip) {
          details.appendChild(mkRow("Website domain",
            w.domain || "unknown"));
          details.appendChild(mkRow("Website IP", w.ip +
            (w.checkedDate ? " (checked " + w.checkedDate + ")" : ""),
            true));
          if (w.host && w.host !== "unknown") {
            details.appendChild(mkRow("Website host", w.host));
          }
          if (w.org) {
            details.appendChild(mkRow("Website owned by", w.org));
          }
          details.appendChild(mkRow("Website abuse contact",
            w.abuse || "not published"));
        }
      } else if (a.websiteSuppressed) {
        placeGateNote("Website host complaint:",
          window.SpamAvenger.NO_SITE_EXPLANATION);
      } else if (a.websiteHostHidden) {
        placeGateNote("Website host complaint:",
          window.SpamAvenger.HOST_HIDDEN_EXPLANATION);
      }
      function placeAbovePid(sec) {
        if (pidToggle) {
          stack.insertBefore(sec.toggle, pidToggle);
          stack.insertBefore(sec.panel, pidToggle);
        }
      }
      // Shared Open-in-Gmail wiring for the two new email
      // complaints: the mail lane's flow (fit, paste fallback
      // with the full text copied, label swap) against the
      // lane's own complaint via fitGivenComplaint.
      // Public 1.0.72 release (internal build .73): the
      // website and registrar buttons now carry the launched
      // badge beside a .sf-btn-label span, exactly like the
      // mail lane's — so the label swap rewrites the span
      // when the button has one (see the click handler).
      function wireCompose(btn, complaint, lane) {
        btn.addEventListener("click", function () {
          var plan = window.SpamAvenger.fitGivenComplaint(
            accountIndex(), complaint);
          if (!plan) return;
          // v1.0.71 fix: the compose opened \u2014 the lane was
          // launched, same wording as every other lane
          // ("Launched", never "Sent": the user reviews and
          // sends in the compose themselves).
          // Public 1.0.72 release (internal build .73): the
          // badge now lives on this button TOO (the stamp
          // parity fix — see the registry comment above), so
          // the paste label swap below rewrites the button's
          // .sf-btn-label span when it has one, never the
          // whole button: a textContent write would wipe the
          // badge span riding beside the label (the complaint
          // lane's test5 hazard). Every wired button carries
          // the span since the link host joined the stamp
          // system; a button without one keeps the
          // whole-button swap.
          if (lane) {
            recordLaunched(lane);
            applyLaunchedBadge(lane, Date.now());
          }
          if (plan.mode === "paste") {
            if (navigator.clipboard) {
              navigator.clipboard.writeText(plan.complaint.body)
                .catch(function () {});
            }
            var swapEl = btn.querySelector(".sf-btn-label") || btn;
            var origLabel = swapEl.textContent;
            swapEl.textContent =
              "Copied! Paste into the email (Ctrl+V), then Send";
            setTimeout(function () {
              swapEl.textContent = origLabel;
            }, 6000);
          }
          window.open(plan.url, "_blank", "noopener");
        });
      }
      if (w && w.ip && !a.websiteSuppressed && !a.websiteHostHidden &&
          !a.spoofDomainSuppressed) {
        var hint = w.formLane === "ovh" ? OVH_FORM_HINT
          : (w.formLane ? HYPER_FORM_HINTS[w.formLane] : null);
        if (w.formLane && hint) {
          // Form-only website host: the mail lane's form-kit
          // presentation governs — evidence box + one button
          // that copies it and opens the host's own form. The
          // evidence block is the lib's website-truthful one
          // (buildHostingFormEvidence): the mail kit's slices
          // claim the message was SENT from the report IP,
          // which is false for a website address, so this lane
          // carries no per-field steps.
          var wFormSec = acc.section("sf-sec-website", "sf-btn-blue",
            "Website host \u2014 use their form");
          badgeTargets.website = { els: [wFormSec.toggle] };
          placeAbovePid(wFormSec);
          var wfw = h("div", { "class": "sf-complaint" });
          if (hint.fact) {
            wfw.appendChild(h("p", { "class": "sf-note" }, hint.fact));
          }
          wfw.appendChild(h("p", { "class": "sf-note" },
            "The website for " + w.domain + " \u2014 the domain " +
            "that sent this message \u2014 is hosted by " +
            hint.label + " at " + w.ip + ". Your report " +
            "details are in the box below. The button copies " +
            "them to your clipboard and opens the " +
            hint.label + " abuse form. " +
            (hint.pick ? hint.pick + " " : "") +
            "On the form, paste into the details field \u2014 " +
            "Ctrl+V, or right-click and choose Paste \u2014 " +
            "then submit the form."));
          wfw.appendChild(h("b", null,
            "Form evidence \u2014 paste into the " + hint.label +
            " abuse form"));
          var wEta = h("textarea", { id: "sf-website-evidence" });
          wEta.readOnly = true;
          wEta.value =
            window.SpamAvenger.buildHostingFormEvidence(a) || "";
          wfw.appendChild(wEta);
          if (hint.showLink) {
            wfw.appendChild(h("p", { "class": "sf-fine" },
              "Abuse form: ",
              h("a", { href: hint.url, target: "_blank",
                rel: "noopener" }, hint.linkText)));
          }
          var wFormBtnLabel = h("span", { "class": "sf-btn-label" },
            "Copy evidence & open the " + hint.label + " abuse form");
          var wFormBtn = h("button", { id: "sf-open-website-form",
            "class": "sf-btn-blue", "type": "button" }, wFormBtnLabel);
          badgeTargets.website.els.push(wFormBtn);
          wFormBtn.addEventListener("click", function () {
            var copied = false;
            try {
              wEta.focus();
              wEta.select();
              copied = document.execCommand("copy");
            } catch (e) {}
            if (!copied && navigator.clipboard) {
              navigator.clipboard.writeText(wEta.value)
                .catch(function () {});
              copied = true;
            }
            var origLabel = wFormBtnLabel.textContent;
            wFormBtnLabel.textContent = copied
              ? "Copied! The form is open \u2014 paste into its details field (Ctrl+V or right-click \u2192 Paste)"
              : "The form is open \u2014 copy the box text above and paste it in";
            setTimeout(function () {
              wFormBtnLabel.textContent = origLabel;
            }, 6000);
            recordLaunched("website");
            applyLaunchedBadge("website", Date.now());
            window.open(hint.url, "_blank", "noopener");
          });
          wfw.appendChild(
            h("div", { "class": "sf-actions" }, wFormBtn));
          wFormSec.panel.appendChild(wfw);
        } else if (a.websiteComplaint) {
          var wSec = acc.section("sf-sec-website", "sf-btn-green",
            "Website host complaint \u2014 ready to send");
          badgeTargets.website = { els: [wSec.toggle] };
          placeAbovePid(wSec);
          var ww = h("div", { "class": "sf-complaint" });
          ww.appendChild(h("p", { "class": "sf-note" },
            "Separate from the mail host above: this is who " +
            "hosts the sender domain's WEBSITE \u2014 another " +
            "desk holding a piece of the same fraud " +
            "operation."));
          ww.appendChild(mkRow("Domain", w.domain || "unknown"));
          ww.appendChild(mkRow("Website IP", w.ip +
            (w.checkedDate ? " (checked " + w.checkedDate + ")" : ""),
            true));
          if (w.host && w.host !== "unknown") {
            ww.appendChild(mkRow("Host", w.host));
          }
          if (w.org) ww.appendChild(mkRow("Owned by", w.org));
          ww.appendChild(mkRow("Abuse contact",
            a.websiteComplaint.to));
          var wTa = h("textarea", { id: "sf-website-text" });
          wTa.readOnly = true;
          wTa.value = "To: " + a.websiteComplaint.to +
            "\nSubject: " + a.websiteComplaint.subject +
            "\n\n" + a.websiteComplaint.body;
          ww.appendChild(wTa);
          var wBtn = h("button", { id: "sf-website-compose",
            "class": "sf-btn-green" },
            h("span", { "class": "sf-btn-label" },
              "Open in Gmail \u2014 just click Send"));
          badgeTargets.website.els.push(wBtn);
          wireCompose(wBtn, a.websiteComplaint, "website");
          var wSendAs = sendAsHintEl();
          if (wSendAs) ww.appendChild(wSendAs);
          var wPaste = pasteWarnEl(a.websiteComplaint);
          if (wPaste) ww.appendChild(wPaste);
          ww.appendChild(h("div", { "class": "sf-actions" }, wBtn));
          wSec.panel.appendChild(ww);
        } else {
          // Public 1.0.72 release (internal build .73),
          // Michael's call Nov 8 2026: NO blue info-only
          // section here. Blue means "needs a few steps from
          // you, and I'll guide you through them" — a host
          // with no published abuse contact has no steps and
          // nothing to click, so there is no button, no
          // toggle, and no badge target. The facts move into
          // Show details as prefixed rows instead (prefixed
          // because the details block already carries the
          // MAIL host's unprefixed Sending IP / Server /
          // Owned by / Abuse contact rows). The Show details
          // gate at the top of this render holds the toggle
          // until this trace settles, so these rows are
          // always present the first time the details open.
          details.appendChild(mkRow("Website domain",
            w.domain || "unknown"));
          details.appendChild(mkRow("Website IP", w.ip +
            (w.checkedDate ? " (checked " + w.checkedDate + ")" : ""),
            true));
          if (w.host && w.host !== "unknown") {
            details.appendChild(mkRow("Website host", w.host));
          }
          if (w.org) {
            details.appendChild(mkRow("Website owned by", w.org));
          }
          details.appendChild(mkRow("Website abuse contact",
            "not published"));
        }
      }
      // v1.0.72: the LINK host section — whoever hosts the
      // page the message's primary link leads to, traced by
      // runLaneGating (live check on the link's host, then the
      // same DNS + RDAP identity work as the website lane,
      // with front-door origin discovery behind it). Phish
      // payloads virtually never live on the From domain; they
      // live where the button points, and that host is the
      // killable asset. Rendered only when the link's page is
      // LIVE (a dead or parked link host gets no section — the
      // Safe Browsing gating in applyClassification covers the
      // consequence) and its desk isn't the mail lane's own
      // (runLaneGating suppresses that duplicate). The three
      // shapes mirror the website section's exactly.
      var lh = a.linkHost;
      if (a.linkHostHidden) {
        placeGateNote("Link host complaint:",
          window.SpamAvenger.HOST_HIDDEN_EXPLANATION);
      } else if (lh && lh.ip) {
        var lHint = lh.formLane === "ovh" ? OVH_FORM_HINT
          : (lh.formLane ? HYPER_FORM_HINTS[lh.formLane] : null);
        if (lh.formLane && lHint) {
          var lFormSec = acc.section("sf-sec-linkhost", "sf-btn-blue",
            "Link host — use their form");
          // Public 1.0.72 release (internal build .73): the
          // link host joins the launched-stamp system
          // (Michael's field catch, Nov 8 2026 — its toggle
          // and button never stamped while the registrar
          // lane beside it stamped both). Two-target shape
          // like website/registrar: toggle first, the inner
          // button pushed in below.
          badgeTargets.linkhost = { els: [lFormSec.toggle] };
          placeAbovePid(lFormSec);
          var lfw = h("div", { "class": "sf-complaint" });
          if (lHint.fact) {
            lfw.appendChild(h("p", { "class": "sf-note" }, lHint.fact));
          }
          lfw.appendChild(h("p", { "class": "sf-note" },
            "The page this message's link leads to — " +
            (lh.url || lh.domain) + " — is hosted by " +
            lHint.label + " at " + lh.ip + ". Your report " +
            "details are in the box below. The button copies " +
            "them to your clipboard and opens the " +
            lHint.label + " abuse form. " +
            ((lHint.linkPick || lHint.pick)
              ? (lHint.linkPick || lHint.pick) + " " : "") +
            "On the form, paste into the details field — " +
            "Ctrl+V, or right-click and choose Paste — " +
            "then submit the form."));
          lfw.appendChild(h("b", null,
            "Form evidence — paste into the " + lHint.label +
            " abuse form"));
          var lEta = h("textarea", { id: "sf-link-evidence" });
          lEta.readOnly = true;
          lEta.value =
            window.SpamAvenger.buildLinkFormEvidence(a) || "";
          lfw.appendChild(lEta);
          if (lHint.showLink) {
            lfw.appendChild(h("p", { "class": "sf-fine" },
              "Abuse form: ",
              h("a", { href: lHint.url, target: "_blank",
                rel: "noopener" }, lHint.linkText)));
          }
          var lFormBtnLabel = h("span", { "class": "sf-btn-label" },
            "Copy evidence & open the " + lHint.label + " abuse form");
          var lFormBtn = h("button", { id: "sf-open-link-form",
            "class": "sf-btn-blue", "type": "button" }, lFormBtnLabel);
          badgeTargets.linkhost.els.push(lFormBtn);
          lFormBtn.addEventListener("click", function () {
            var copied = false;
            try {
              lEta.focus();
              lEta.select();
              copied = document.execCommand("copy");
            } catch (e) {}
            if (!copied && navigator.clipboard) {
              navigator.clipboard.writeText(lEta.value)
                .catch(function () {});
              copied = true;
            }
            // The label lives in its own span (the website
            // form button's arrangement): the swap rewrites
            // the span, never the whole button, so the
            // launched badge riding beside it survives.
            var origLabel = lFormBtnLabel.textContent;
            lFormBtnLabel.textContent = copied
              ? "Copied! The form is open — paste into its details field (Ctrl+V or right-click → Paste)"
              : "The form is open — copy the box text above and paste it in";
            setTimeout(function () {
              lFormBtnLabel.textContent = origLabel;
            }, 6000);
            // recordLaunched also records the sighting
            // (saDeskFor has the linkhost case) — the launch
            // this button always made, now timestamped like
            // every other lane's.
            recordLaunched("linkhost");
            applyLaunchedBadge("linkhost", Date.now());
            window.open(lHint.url, "_blank", "noopener");
          });
          lfw.appendChild(
            h("div", { "class": "sf-actions" }, lFormBtn));
          // Public 1.0.73 release (queued-guided-form-
          // fields.md): per-field steps for the link-host
          // kit. The sender-IP kit has carried them since
          // 1.0.69; this kit pointed at the same form with
          // one evidence block and no per-box guidance, and
          // its facts differ (a hosted site, not a sender).
          // Same shape as the mail kit's steps: each names
          // the form's box, carries that box's slice with
          // its own copy button, and is skipped when its
          // slice can't be built. Copy-only buttons — the
          // launch stays the kit button above.
          if (lHint.linkFields && lHint.linkFields.length) {
            var lfWrap = h("div", { "class": "sf-form-fields" });
            lfWrap.appendChild(h("b", null,
              "Filling in the " + lHint.label +
              " form, field by field"));
            if (lHint.linkFieldsIntro) {
              lfWrap.appendChild(h("p", { "class": "sf-note" },
                lHint.linkFieldsIntro));
            }
            lHint.linkFields.forEach(function (fld) {
              var lfTxt = fld.copy
                ? window.SpamAvenger.buildFormFieldEvidence(a, fld.copy)
                : null;
              if (fld.copy && !lfTxt) return; // no slice, no step
              var lfBlock = h("div", { "class": "sf-form-field" });
              lfBlock.appendChild(h("b", null,
                "For the form\u2019s \u201C" + fld.box +
                "\u201D field"));
              if (fld.help) {
                lfBlock.appendChild(h("p", { "class": "sf-fine" },
                  fld.help));
              }
              if (fld.copy) {
                var lfTa = h("textarea", {});
                lfTa.readOnly = true;
                lfTa.value = lfTxt;
                lfBlock.appendChild(lfTa);
                var lfBtn = h("button", { "class": "sf-btn-blue",
                  "type": "button" },
                  "Copy for the " + fld.box + " field");
                lfBtn.addEventListener("click", function () {
                  var copied = false;
                  try {
                    lfTa.focus();
                    lfTa.select();
                    copied = document.execCommand("copy");
                  } catch (e) {}
                  if (!copied && navigator.clipboard) {
                    navigator.clipboard.writeText(lfTa.value)
                      .catch(function () {});
                    copied = true; // best-effort; text stays selected
                  }
                  var origLabel = lfBtn.textContent;
                  lfBtn.textContent = copied
                    ? "Copied! Paste it into the form\u2019s " +
                      fld.box + " field (Ctrl+V or right-click " +
                      "\u2192 Paste)"
                    : "Select the box above and copy it (Ctrl+C)";
                  setTimeout(function () {
                    lfBtn.textContent = origLabel;
                  }, 6000);
                });
                lfBlock.appendChild(lfBtn);
              }
              lfWrap.appendChild(lfBlock);
            });
            lfw.appendChild(lfWrap);
          }
          lFormSec.panel.appendChild(lfw);
        } else if (a.linkComplaint) {
          var lSec = acc.section("sf-sec-linkhost", "sf-btn-green",
            "Link host complaint — ready to send");
          badgeTargets.linkhost = { els: [lSec.toggle] };
          placeAbovePid(lSec);
          var lw = h("div", { "class": "sf-complaint" });
          lw.appendChild(h("p", { "class": "sf-note" },
            "Separate from the mail host above and from the " +
            "sender's own website: this is who hosts the PAGE " +
            "this message's link leads to — the page its " +
            "readers are sent to."));
          lw.appendChild(mkRow("Page", lh.url || "unknown"));
          lw.appendChild(mkRow("Domain", lh.domain || "unknown"));
          lw.appendChild(mkRow("Website IP", lh.ip +
            (lh.checkedDate ? " (checked " + lh.checkedDate + ")" : ""),
            true));
          if (lh.host && lh.host !== "unknown") {
            lw.appendChild(mkRow("Host", lh.host));
          }
          if (lh.org) lw.appendChild(mkRow("Owned by", lh.org));
          lw.appendChild(mkRow("Abuse contact", a.linkComplaint.to));
          var lTa = h("textarea", { id: "sf-link-text" });
          lTa.readOnly = true;
          lTa.value = "To: " + a.linkComplaint.to +
            "\nSubject: " + a.linkComplaint.subject +
            "\n\n" + a.linkComplaint.body;
          lw.appendChild(lTa);
          var lBtn = h("button", { id: "sf-link-compose",
            "class": "sf-btn-green" },
            h("span", { "class": "sf-btn-label" },
              "Open in Gmail — just click Send"));
          badgeTargets.linkhost.els.push(lBtn);
          // The lane name rides wireCompose now (it used to
          // be null, with a bare sighting recorded by a
          // second listener): wireCompose records the launch
          // AND the sighting through recordLaunched, and
          // badges this button; the toggle mirrors it.
          wireCompose(lBtn, a.linkComplaint, "linkhost");
          var lSendAs = sendAsHintEl();
          if (lSendAs) lw.appendChild(lSendAs);
          var lPaste = pasteWarnEl(a.linkComplaint);
          if (lPaste) lw.appendChild(lPaste);
          lw.appendChild(h("div", { "class": "sf-actions" }, lBtn));
          lSec.panel.appendChild(lw);
        } else {
          // Public 1.0.72 release (internal build .73): the
          // link host takes the same ruling as the website
          // host above — no blue info-only section, no
          // button, no toggle, no badge target. Its facts
          // move into Show details as prefixed rows, present
          // before the details can first open (the trace
          // gate at the top of this render sees to that).
          details.appendChild(mkRow("Link page",
            lh.url || "unknown"));
          details.appendChild(mkRow("Link domain",
            lh.domain || "unknown"));
          details.appendChild(mkRow("Link IP", lh.ip +
            (lh.checkedDate ? " (checked " + lh.checkedDate + ")" : ""),
            true));
          if (lh.host && lh.host !== "unknown") {
            details.appendChild(mkRow("Link host", lh.host));
          }
          if (lh.org) {
            details.appendChild(mkRow("Link owned by", lh.org));
          }
          details.appendChild(mkRow("Link abuse contact",
            "not published"));
        }
      }
      var ri = a.registrarInfo;
      // v1.0.73 (queued-registrar-no-contact.md): a registrar
      // record with NO registrar name and NO abuse contact —
      // Registro.br's .br shape: the registry registers
      // direct and its RDAP names no abuse desk anywhere —
      // leaves the section below nothing it can offer: no
      // form lane, no built complaint (it needs the abuse
      // address), not even the fallback note (which needs it
      // too). The section rendered anyway and dead-ended on
      // two fact rows (Michael's field find, Nov 21 2026).
      // Per his Nov 8 2026 ruling for the website/link lanes,
      // a dead-end section must not render: its facts move
      // to Show details as rows instead, in this same trace
      // pass, before the details can first open.
      var regFormLanePeek = (!a.spoofDomainSuppressed && ri &&
        window.SpamAvenger.registrarFormLane)
        ? window.SpamAvenger.registrarFormLane(a) : null;
      var regNoContact = !a.spoofDomainSuppressed && !!ri &&
        !ri.registrar && !ri.registrarAbuse && !regFormLanePeek;
      if (regNoContact) {
        if (ri.registered) {
          details.appendChild(mkRow("Domain registered",
            String(ri.registered).slice(0, 10)));
        }
        if (ri.registrant) {
          var ncRegParts = [ri.registrant.name,
            ri.registrant.org, ri.registrant.email]
            .filter(function (x) { return !!x; });
          if (ncRegParts.length) {
            details.appendChild(mkRow("Domain registrant",
              ncRegParts.join(", ")));
          }
        }
      }
      if (!regNoContact && !a.spoofDomainSuppressed && ri && (ri.registrar ||
                 ri.registered || ri.registrarAbuse ||
                 ri.registrant)) {
        // Public 1.0.72 release (internal build .73): July
        // Name Limited takes abuse reports only through its
        // own form (lib registrarFormLane) — for that
        // registrar alone, this section renders as the form
        // kit instead of the email lane.
        var regFormLane = window.SpamAvenger.registrarFormLane
          ? window.SpamAvenger.registrarFormLane(a) : null;
        var rSec = acc.section("sf-sec-registrar",
          regFormLane ? "sf-btn-blue"
            : (a.registrarComplaint ? "sf-btn-green"
               : "sf-btn-blue"),
          regFormLane ? "Registrar report \u2014 use their form"
            : "Registrar report \u2014 the domain itself");
        badgeTargets.registrar = { els: [rSec.toggle] };
        placeAbovePid(rSec);
        var rw = h("div", { "class": "sf-complaint" });
        if (ri.registrar) {
          rw.appendChild(mkRow("Registrar", ri.registrar));
        }
        if (ri.registered) {
          rw.appendChild(mkRow("Registered",
            String(ri.registered).slice(0, 10)));
        }
        if (ri.freshness && ri.freshness.fresh) {
          var phrase = ri.freshness.daysBefore === 0
            ? "the same day this email arrived"
            : (ri.freshness.daysBefore === 1
              ? "1 day before this email arrived"
              : ri.freshness.daysBefore +
                " days before this email arrived");
          rw.appendChild(h("p", { "class": "sf-warn" },
            "\u26A0 Registered " + phrase + " \u2014 a classic " +
            "fresh-domain fraud tell. Legitimate businesses " +
            "rarely start sending mail the week they register."));
        }
        if (ri.registrant) {
          var regParts = [ri.registrant.name, ri.registrant.org,
            ri.registrant.email].filter(function (x) { return !!x; });
          if (regParts.length) {
            rw.appendChild(mkRow("Registrant",
              regParts.join(", ")));
          }
        }
        if (regFormLane) {
          // The registrar form kit, same shape as a deflector
          // host's: the evidence box plus one button that
          // copies it and opens the registrar's own form. No
          // email complaint, no Open in Gmail, no
          // copy-the-address button in this section — the
          // email desk is retired, so the fact rows above are
          // all that remains of the email presentation. The
          // form open is the lane's launched action, badged
          // like every form kit. v1.0.73: TWO kits share this
          // render — July Name's (the original) and Wanshang
          // Technology's (queued-wanshang-form-only-
          // registrar.md) — branched on the lane's `kit`: the
          // note, the field guide, the evidence heading and
          // the button label are each kit's own; the box, the
          // link line and the button machinery are shared.
          // v1.0.74: FOUR more kits join — Newfold,
          // BrandFocus, eNom and GoDaddy (their queued files,
          // Nov 23 2026) — on the generic branch below: one
          // shared note and heading/button built from the
          // lane's own label, with each kit's own short
          // PROVISIONAL field guide (none of the four forms
          // has been walked end-to-end yet).
          // v1.0.77: GoDaddy leaves the generic branch —
          // Michael walked its form live (Nov 23 2026) and
          // the v1.0.74 lane landed him on a category page
          // with no fields on it. Its kit now links straight
          // to the phishing report (the lane's URL, in lib),
          // carries a WALKED guide of its own below, and —
          // like the hyperscaler kits — renders the lane's
          // per-field steps under its button. The other
          // three stay provisional.
          var regKit = regFormLane.kit || "julyname";
          if (regKit === "wanshang") {
            rw.appendChild(h("p", { "class": "sf-note" },
              "This registrar doesn't take abuse reports by " +
              "email \u2014 reports go through its own form. Your " +
              "report details are in the box below. The button " +
              "copies them to your clipboard and opens the " +
              "Wanshang abuse form. On the form, paste into " +
              "the description field \u2014 Ctrl+V, or right-click " +
              "and choose Paste \u2014 then submit the form."));
          } else if (regKit === "julyname") {
            rw.appendChild(h("p", { "class": "sf-note" },
              "This registrar doesn't take abuse reports by " +
              "email \u2014 reports go through its own form. Your " +
              "report details are in the box below. The button " +
              "copies them to your clipboard and opens the " +
              "July Name abuse form. On the form, paste into " +
              "the details field \u2014 Ctrl+V, or right-click " +
              "and choose Paste \u2014 then submit the form."));
          } else if (regKit === "godaddy") {
            // v1.0.78: the note changes because the button
            // does — it no longer just copies and opens.
            // The GoDaddy form is a plain web form, so it
            // gets the FTC / Safe Browsing treatment: the
            // button stashes the case and opens the form,
            // and reportfill.js fills the boxes in on the
            // other side. The evidence box and the
            // per-field steps below stay as the by-hand
            // fallback.
            rw.appendChild(h("p", { "class": "sf-note" },
              "This registrar doesn't take abuse reports by " +
              "email \u2014 reports go through its own form. " +
              "The button below opens that form and Spam " +
              "Avenger fills in its boxes for you: the brand " +
              "being impersonated, the message's links, the " +
              "description, and your email address if you " +
              "saved one for your data-deletion letters. " +
              "You review the filled form and submit it " +
              "yourself \u2014 nothing is ever sent for you. " +
              "The boxes below stay here in case you'd " +
              "rather paste everything in by hand."));
          } else {
            rw.appendChild(h("p", { "class": "sf-note" },
              "This registrar doesn't take abuse reports by " +
              "email \u2014 reports go through its own form. Your " +
              "report details are in the box below. The button " +
              "copies them to your clipboard and opens the " +
              regFormLane.label + " abuse form. On the form, " +
              "paste into the description field \u2014 Ctrl+V, or " +
              "right-click and choose Paste \u2014 then submit " +
              "the form."));
          }
          // Public 1.0.72 release (internal build .73): the
          // field guide to the registrar's own form, REWRITTEN
          // after Michael's live walk of Nov 8 2026 (a real
          // report went through: case JY202611090000004).
          // Every word is written TO the user who will face
          // this form, second person, in the order the hoops
          // are hit: Chinese only; an emailed verification
          // code whose "can't be empty" error may surface
          // beside an unrelated field; a REQUIRED legal-
          // website field; a description box capped at 1,000
          // characters (which is why the kit now copies a
          // short text); a REQUIRED screenshot that must
          // show the domain and the date; an anti-bot shield
          // that can serve a blank page; and errors that
          // arrive one at a time. It corrects the earlier
          // guide on the screenshot, which is required, not
          // optional. Panel-only text — none of it enters
          // the copied evidence.
          if (regKit === "wanshang") {
            // v1.0.73: the Wanshang field guide, written
            // from Michael's live walk of the real form on
            // Nov 21 2026 (his jiuzhicui.com report went
            // through: complaint WSABUSE-202611212348-8027).
            // The hoops, in the order they are hit: Chinese
            // only; an emailed 6-digit verification code
            // with a 5-minute life (his first code arrived
            // late and a resend was needed); an abuse-URL
            // field that rejects any URL on a domain other
            // than the complained one; a description capped
            // at 2,000 characters (why the kit copies a
            // short text); a WSABUSE- complaint number and
            // a Track Complaint page. Panel-only text.
            rw.appendChild(h("p", { "class": "sf-note" },
              h("b", null, "Walking their form:"), h("br"),
              "Heads-up: the form is in Chinese. To read it " +
              "in English, use your browser's translate " +
              "button \u2014 in Firefox, the icon at the right " +
              "end of the address bar (or right-click the " +
              "page and choose Translate Page).", h("br"),
              "The form verifies your email before it lets " +
              "you file: enter an email address you can " +
              "read and it sends a 6-digit code, good for " +
              "five minutes. Mail can arrive late \u2014 if " +
              "no code lands, use the form's resend once " +
              "and enter the newest code.", h("br"),
              "For the abuse type, choose DNS Abuse / " +
              "Phishing.", h("br"),
              "The abuse-URL field must point at the " +
              "reported domain itself \u2014 the form rejects " +
              "URLs on any other domain. The spam's real " +
              "links ride in the description instead: the " +
              "text the button copies already carries " +
              "them, so paste it in exactly as copied.", h("br"),
              "The description field caps at 2,000 " +
              "characters, and the form rejects anything " +
              "longer. That cap is why the text the button " +
              "copies is short.", h("br"),
              "When it accepts, write down the complaint " +
              "number \u2014 it starts with WSABUSE-. A " +
              "confirmation email follows, and the site's " +
              "Track Complaint page shows the report's " +
              "progress under that number."));
          } else if (regKit === "julyname") {
          rw.appendChild(h("p", { "class": "sf-note" },
            h("b", null, "Walking their form:"), h("br"),
            "Heads-up: the form is in Chinese. To read it " +
            "in English, use your browser's translate " +
            "button \u2014 in Firefox, the icon at the right " +
            "end of the address bar (or right-click the " +
            "page and choose Translate Page).", h("br"),
            "Where the form asks who you are, choose " +
            "Personal.", h("br"),
            "Enter an email address you can read, then " +
            "click \u201CSend code\u201D: the form emails you a " +
            "6-digit code to type into the verification " +
            "field. That's the " +
            "registrar's gate, not Spam Avenger's. " +
            "If you submit with the code field " +
            "empty, the form answers \u201CIt can't be empty\u201D " +
            "\u2014 and that error may pop up next to an " +
            "unrelated field. The scolding means the code.", h("br"),
            "For the report type, check the first box " +
            "\u2014 fraud / phishing email. If the spam " +
            "links to a fake store, check the second box " +
            "(fraudulent phishing / counterfeit websites) " +
            "too.", h("br"),
            "The domain field takes the reported domain " +
            "alone. The link field takes the spam's link " +
            "as a normal https address \u2014 the text the " +
            "button copies already carries the link in " +
            "that form, so copy it from there.", h("br"),
            "The \u201Clegal website\u201D field wants " +
            "the real website of the brand the spam is " +
            "impersonating, written like www.brand.com " +
            "\u2014 and it is a required field: the form " +
            "will not submit without it.", h("br"),
            "The description field has a hard cap: " +
            "1,000 characters, and the form rejects " +
            "anything longer. That cap is why the text " +
            "the button copies is short. Paste it in " +
            "exactly as copied \u2014 the full headers " +
            "ride in the screenshot below.", h("br"),
            "A screenshot is required \u2014 the field has " +
            "a red asterisk \u2014 and it must clearly show " +
            "the reported domain name and the date and " +
            "time. The easy source is this message itself: " +
            "open Gmail's three-dot menu on the message " +
            "and choose \u201CShow original\u201D, then screenshot " +
            "the summary table at the top \u2014 it shows " +
            "the sender, the domain, the subject and the " +
            "date in one frame. Printing that page to a " +
            "PDF works too; the form takes png, jpg, gif " +
            "or pdf up to 8M.", h("br"),
            "Their site runs anti-bot armor: if a page " +
            "loads blank, or an upload won't stick, that " +
            "is their shield, not your mistake \u2014 " +
            "reload and try again.", h("br"),
            "The form reports problems one at a time: " +
            "fix the field it names, submit again, and " +
            "the next problem \u2014 if there is one \u2014 " +
            "will name the next field.", h("br"),
            "When it finally accepts, write down the " +
            "report number it shows \u2014 it starts with JY. " +
            "A notification email follows, and you can " +
            "check the report's progress with that number."));
          } else if (regKit === "godaddy") {
            // v1.0.77: the GoDaddy field guide, written
            // from Michael's live walk of the real form on
            // Nov 23 2026. The v1.0.74 lane opened
            // abuseform.com — GoDaddy's Report Abuse page,
            // a category picker (Phishing, Malware, Child
            // Safety, Intellectual Property, UK/EU
            // Complaints, Public Safety) with no field on
            // it. The lane's link now opens the phishing
            // report itself (legalportal.godaddy.com/abuse/
            // phishing), and the per-field steps under the
            // button walk its boxes in its order. What
            // remains for this guide is the desk's framing
            // and the one navigation fact. Panel-only text.
            rw.appendChild(h("p", { "class": "sf-note" },
              h("b", null, "Walking their form:"), h("br"),
              "What the email desk does: nothing \u2014 " +
              "GoDaddy's own auto-reply says its abuse " +
              "mailbox is not monitored, and that a " +
              "report must go through its form. Emailing " +
              "it again changes nothing.", h("br"),
              "The button below opens the phishing report " +
              "itself \u2014 the category page is skipped " +
              "entirely, so the first thing you see is " +
              "the form.", h("br"),
              // v1.0.78: the fill itself — the guide pane
              // on the form page reports what landed.
              "When the form opens, Spam Avenger fills " +
              "in the boxes it can, and the guide pane " +
              "in the corner of the form page says what " +
              "it filled and what it left, and why. " +
              "Check those lines before you submit; if " +
              "a box sits empty, its copy is in the " +
              "steps under the button.", h("br"),
              "Reporting in bulk? GoDaddy also takes " +
              "abuse reports through its developer API " +
              "(the abuse endpoint under " +
              "developer.godaddy.com) \u2014 a lane for " +
              "tooling, not for a single report like " +
              "this one."));
          } else {
            // v1.0.74: the four new desks' field guides —
            // PROVISIONAL, every one. None of these forms
            // has been walked end-to-end yet; each desk was
            // proven form-only by the reply to Michael's own
            // emailed complaint (Nov 23 2026), and the
            // guides carry only what those replies prove,
            // plus the one instruction that survives any
            // form: the evidence in the box IS the report.
            // A live filing walk replaces a guide's
            // provisional lines with field facts, exactly
            // as the July Name and Wanshang walks did for
            // theirs. Panel-only text, like every guide.
            // v1.0.77: THREE desks remain on this branch —
            // GoDaddy's walk landed (see its own branch
            // above), exactly the replacement this comment
            // predicted.
            var regGuideLines = [];
            if (regKit === "newfold") {
              regGuideLines.push(
                "What the email desk does: it answers with " +
                "an autoresponder \u2014 do not reply \u2014 that " +
                "sends every abuse report (phishing, " +
                "malware, and spam used to deliver them) to " +
                "this form. An emailed complaint goes no " +
                "further.");
              regGuideLines.push(
                "Newfold Digital is the company behind " +
                "Web.com and Network Solutions, so this one " +
                "form covers all three brands' domains.");
            } else if (regKit === "brandfocus") {
              regGuideLines.push(
                "What the email desk does: its auto-reply " +
                "(in Chinese and English) says the mailbox " +
                "will no longer accept domain name abuse " +
                "complaints \u2014 every report goes through " +
                "its online reporting platform instead.");
              regGuideLines.push(
                "The platform is the same outsourced " +
                "abuse-report service Wanshang uses, under " +
                "this registrar's own subdomain \u2014 expect " +
                "the same shape there, including an emailed " +
                "verification code before the form lets " +
                "you file.");
            } else if (regKit === "enom") {
              regGuideLines.push(
                "What the email desk does: it acknowledges " +
                "the email, but nothing is acted on there " +
                "\u2014 the reply routes abuse issues to this " +
                "form, where the Compliance team picks " +
                "them up (\u201ca member of our team will " +
                "reach out\u201d, in their words).");
              regGuideLines.push(
                "eNom is a Tucows registrar; the form is " +
                "its Abuse Policy page \u2014 fill out all " +
                "the required fields, in their words, and " +
                "give as much detail as possible: the text " +
                "the button copies is that detail.");
            }
            regGuideLines.push(
              "This guide is provisional \u2014 this form " +
              "hasn't been walked end-to-end yet. If a " +
              "field doesn't match these notes, trust the " +
              "form in front of you: the text the button " +
              "copies is the report itself, and it goes " +
              "into whichever field asks what happened.");
            var regGuide = h("p", { "class": "sf-note" },
              h("b", null, "Walking their form:"));
            regGuideLines.forEach(function (ln) {
              regGuide.appendChild(h("br"));
              regGuide.appendChild(
                document.createTextNode(ln));
            });
            rw.appendChild(regGuide);
          }
          rw.appendChild(h("b", null,
            regKit === "wanshang"
              ? "Form evidence \u2014 paste into the Wanshang " +
                "abuse form"
              : regKit === "julyname"
              ? "Form evidence \u2014 paste into the July Name " +
                "abuse form"
              : "Form evidence \u2014 paste into the " +
                regFormLane.label + " abuse form"));
          var rEta = h("textarea",
            { id: "sf-registrar-evidence" });
          rEta.readOnly = true;
          // The July Name kit shows and copies the SHORT
          // evidence (lib buildRegistrarShortEvidence):
          // the registrar's description field caps at the
          // lane's descriptionCap, which the full evidence
          // can never fit. What the user sees in this box
          // is exactly what the button copies.
          rEta.value = window.SpamAvenger
            .buildRegistrarShortEvidence(a) || "";
          rw.appendChild(rEta);
          rw.appendChild(h("p", { "class": "sf-fine" },
            "Abuse form: ",
            h("a", { href: regFormLane.url, target: "_blank",
              rel: "noopener" }, regFormLane.linkText)));
          // v1.0.78: the GoDaddy auto-fill launch pieces —
          // the launched-status line under the button, and
          // the payload reportfill.js fills from (the
          // lane's v1.0.77 slices: brand, reported domain,
          // description). The domain derivation mirrors
          // the lib's registrar evidence builders exactly.
          // Declared ahead of the button: the handler below
          // closes over both.
          var gdStatus = regKit === "godaddy"
            ? mkStashStatus("sf-godaddy-status") : null;
          var gdPayload = null;
          if (regKit === "godaddy") {
            var gdDom = "";
            try {
              gdDom = window.SpamAvenger.registrableDomain(
                  a.senderDomain || "") ||
                ((window.SpamAvenger.senderEmail(a.from)
                  .match(/@([\w.-]+)/) || [])[1] || "");
            } catch (e) {}
            gdPayload = { godaddy: {
              brand: window.SpamAvenger
                .buildFormFieldEvidence(a, "brand"),
              domain: gdDom,
              description: window.SpamAvenger
                .buildFormFieldEvidence(a,
                  "registrarDescription")
            } };
          }
          var rFormBtnLabel = h("span",
            { "class": "sf-btn-label" },
            regKit === "godaddy"
              ? "Report to GoDaddy"
              : regKit === "wanshang"
              ? "Open the Wanshang abuse form"
              : regKit === "julyname"
              ? "Open the July Name abuse form"
              : "Open the " + regFormLane.label +
                " abuse form");
          var rFormBtn = h("button",
            { id: "sf-open-registrar-form",
              "class": "sf-btn-blue", "type": "button" },
            rFormBtnLabel);
          badgeTargets.registrar.els.push(rFormBtn);
          rFormBtn.addEventListener("click", function () {
            if (regKit === "godaddy") {
              // v1.0.78: stash-then-open, like the FTC and
              // Safe Browsing buttons — the launched record
              // and badge ride stashThenOpen's open() choke
              // point under the "registrar" lane, exactly
              // as this button's copy-and-open handler
              // recorded them by hand for the other kits.
              stashThenOpen(regFormLane.url, gdStatus.set,
                "registrar", gdPayload)();
              return;
            }
            var copied = false;
            try {
              rEta.focus();
              rEta.select();
              copied = document.execCommand("copy");
            } catch (e) {}
            if (!copied && navigator.clipboard) {
              navigator.clipboard.writeText(rEta.value)
                .catch(function () {});
              copied = true;
            }
            var origLabel = rFormBtnLabel.textContent;
            rFormBtnLabel.textContent = copied
              ? (regKit === "julyname"
                ? "Copied! The form is open \u2014 paste into its details field (Ctrl+V or right-click \u2192 Paste)"
                : "Copied! The form is open \u2014 paste into its description field (Ctrl+V or right-click \u2192 Paste)")
              : "The form is open \u2014 copy the box text above and paste it in";
            setTimeout(function () {
              rFormBtnLabel.textContent = origLabel;
            }, 6000);
            recordLaunched("registrar");
            applyLaunchedBadge("registrar", Date.now());
            window.open(regFormLane.url, "_blank", "noopener");
          });
          rw.appendChild(
            h("div", { "class": "sf-actions" }, rFormBtn));
          // v1.0.78: the GoDaddy launched-status line sits
          // under its button, like the FTC lane's.
          if (gdStatus) rw.appendChild(gdStatus.el);
          // v1.0.77: per-field steps for a registrar lane
          // that carries them (the lane's fieldsIntro +
          // fields, the hyperscaler kits' shape — GoDaddy
          // is the first registrar lane walked closely
          // enough to declare them). Same conventions as
          // the hyperscaler steps: each step names the
          // form's box, says the one thing to do with it,
          // and — when the box takes a paste — shows that
          // field's slice in its own box with its own Copy
          // button. The copy buttons are copy-only: no form
          // open, no launched record. Steps whose slice
          // can't be built (no claimed brand for the brand
          // box, no links for the URL box) are skipped
          // outright rather than shown empty.
          if (regFormLane.fields && regFormLane.fields.length) {
            var gwrap = h("div", { "class": "sf-form-fields" });
            gwrap.appendChild(h("b", null,
              "Filling in the " + regFormLane.label +
              " form, field by field"));
            if (regFormLane.fieldsIntro) {
              gwrap.appendChild(h("p", { "class": "sf-note" },
                regFormLane.fieldsIntro));
            }
            regFormLane.fields.forEach(function (gfld) {
              var gTxt = gfld.copy
                ? window.SpamAvenger
                    .buildFormFieldEvidence(a, gfld.copy)
                : null;
              if (gfld.copy && !gTxt) return; // no slice, no step
              var gBlock = h("div",
                { "class": "sf-form-field" });
              gBlock.appendChild(h("b", null,
                "For the form\u2019s \u201C" + gfld.box +
                "\u201D field"));
              if (gfld.help) {
                gBlock.appendChild(h("p",
                  { "class": "sf-fine" }, gfld.help));
              }
              if (gfld.copy) {
                var gTa = h("textarea", {});
                gTa.readOnly = true;
                gTa.value = gTxt;
                gBlock.appendChild(gTa);
                var gBtn = h("button",
                  { "class": "sf-btn-blue", "type": "button" },
                  "Copy for the " + gfld.box + " field");
                gBtn.addEventListener("click", function () {
                  var copied = false;
                  try {
                    gTa.focus();
                    gTa.select();
                    copied = document.execCommand("copy");
                  } catch (e) {}
                  if (!copied && navigator.clipboard) {
                    navigator.clipboard.writeText(gTa.value)
                      .catch(function () {});
                    copied = true; // best-effort; text stays selected
                  }
                  var origLabel = gBtn.textContent;
                  gBtn.textContent = copied
                    ? "Copied! Paste it into the form\u2019s " +
                      gfld.box + " field (Ctrl+V or " +
                      "right-click \u2192 Paste)"
                    : "Select the box above and copy it (Ctrl+C)";
                  setTimeout(function () {
                    gBtn.textContent = origLabel;
                  }, 6000);
                });
                gBlock.appendChild(gBtn);
              }
              gwrap.appendChild(gBlock);
            });
            rw.appendChild(gwrap);
          }
        }
        if (!regFormLane && ri.registrarAbuse) {
          // Public 1.0.72 release (internal build .73): the
          // "Copy the abuse address" button is REMOVED
          // (queued-registrar-paste-mode.md item 1, Michael's
          // call Nov 8 2026) — the address already shows in
          // this row and is auto-filled into the compose To;
          // the button was a third copy of the same fact.
          rw.appendChild(mkRow("Abuse contact", ri.registrarAbuse));
        }
        if (!regFormLane && a.registrarComplaint) {
          var rTa = h("textarea", { id: "sf-registrar-text" });
          rTa.readOnly = true;
          rTa.value = "To: " + a.registrarComplaint.to +
            "\nSubject: " + a.registrarComplaint.subject +
            "\n\n" + a.registrarComplaint.body;
          rw.appendChild(rTa);
          var rBtn = h("button", { id: "sf-registrar-compose",
            "class": "sf-btn-green" },
            h("span", { "class": "sf-btn-label" },
              "Open in Gmail \u2014 just click Send"));
          badgeTargets.registrar.els.push(rBtn);
          wireCompose(rBtn, a.registrarComplaint, "registrar");
          var rSendAs = sendAsHintEl();
          if (rSendAs) rw.appendChild(rSendAs);
          var rPaste = pasteWarnEl(a.registrarComplaint);
          if (rPaste) rw.appendChild(rPaste);
          rw.appendChild(h("div", { "class": "sf-actions" }, rBtn));
        } else if (!regFormLane && ri.registrarAbuse) {
          rw.appendChild(h("p", { "class": "sf-note" },
            "No pre-written complaint for this registrar \u2014 " +
            "the abuse address above is the desk to write to " +
            "about the domain itself (DNS Abuse: a domain " +
            "registered to run fraud)."));
        }
        rSec.panel.appendChild(rw);
      }
      // Public 1.0.73 release (queued-icann-escalation.md):
      // the ICANN escalation offer for THIS registrar, when
      // its report records cross the lib's trigger. Async
      // and self-contained: it reads the record store,
      // checks the dismissal memory, probes the recorded
      // domains for liveness, and appends its section to
      // the stack only when the kit is honestly offerable.
      if (!a.spoofDomainSuppressed && ri &&
          (ri.registrar || ri.registrarAbuse)) {
        try { renderIcannEscalationOffer(ri); } catch (e) {}
      }
      // v1.0.71 fix: preset the website/registrar badges from
      // stored history. This render runs asynchronously (the
      // domain trace is a network promise), long after the main
      // render's preset callback, so it loads the record itself.
      // Public 1.0.72: linkhost presets here too — its section
      // renders in this same async pass.
      var domainHistStore = saStorageLocal();
      saLoadLaunched(domainHistStore, msgKey, function (rec) {
        if (!rec) return;
        ["website", "registrar", "linkhost"].forEach(function (lane) {
          if (typeof rec[lane] === "number") {
            applyLaunchedBadge(lane, rec[lane]);
          }
        });
      });
    }

    // Public 1.0.73 release (queued-icann-escalation.md):
    // the ICANN escalation kit. Offered in-panel when this
    // message's registrar has collected enough un-actioned
    // reports (lib icannEscalationTrigger: 3+ distinct
    // domains, the oldest 7+ days old) and at least one of
    // the reported sites is still live — a dead site is a
    // registrar (or a host) that acted, and escalating over
    // it would be filing a false premise. The kit is two
    // downloads (the bulk CSV in the exact shape ICANN's
    // form accepted from Michael by hand, and an evidence
    // file) plus the compliance form itself, with the
    // form's front-door selections spelled out. Dismissing
    // parks the offer for this registrar until its count
    // grows past the count at dismissal.
    function renderIcannEscalationOffer(ri) {
      var SA = window.SpamAvenger;
      if (!SA || !SA.icannEscalationTrigger ||
          !SA.icannRegistrarKey) return;
      var key = SA.icannRegistrarKey(ri);
      if (!key) return;
      var store = saStorageLocal();
      if (!store) return;
      store.get(SA_REGISTRAR_REPORTS_KEY, function (res) {
        if (sfCurrentMsgKey !== msgKey) return; // stale render
        var records = (res && res[SA_REGISTRAR_REPORTS_KEY]) || [];
        var trig = SA.icannEscalationTrigger(records, key,
          Date.now());
        if (!trig) return;
        store.get(SA_ICANN_DISMISSED_KEY, function (res2) {
          if (sfCurrentMsgKey !== msgKey) return;
          var dismissed =
            (res2 && res2[SA_ICANN_DISMISSED_KEY]) || {};
          if (typeof dismissed[key] === "number" &&
              trig.count <= dismissed[key]) return;
          var checks = trig.domains.map(function (d) {
            return saProbeSiteHost(d).then(function (r) {
              return (r && r.outcome === "response") ? d : null;
            }).catch(function () { return null; });
          });
          Promise.all(checks).then(function (live) {
            if (sfCurrentMsgKey !== msgKey) return;
            var liveDomains = live.filter(function (d) {
              return !!d;
            });
            if (!liveDomains.length) return;
            var sec = acc.section("sf-sec-icann", "sf-btn-blue",
              "ICANN escalation \u2014 this registrar " +
              "isn't acting");
            stack.appendChild(sec.toggle);
            stack.appendChild(sec.panel);
            var w = h("div", { "class": "sf-complaint" });
            w.appendChild(h("p", { "class": "sf-note" },
              "You've reported " + trig.count + " domains " +
              "to " + (ri.registrar || ri.registrarAbuse) +
              " through Spam Avenger, the oldest filed " +
              saFormatWhen(trig.oldestTs) + ", and " +
              (liveDomains.length === 1
                ? "its site is"
                : liveDomains.length + " of the sites are") +
              " still live. When a registrar doesn't act, " +
              "ICANN Contractual Compliance is the " +
              "escalation. The button below downloads the " +
              "two files the form needs and opens it."));
            w.appendChild(h("p", { "class": "sf-note" },
              h("b", null, "On the ICANN form, choose:"),
              h("br"),
              "Complaint type: the \u201cabuse report " +
              "filed / registrar did not take reasonable " +
              "steps\u201d option \u2014 the form lists it " +
              "as an abuse report the registrar failed to " +
              "act on.", h("br"),
              "Activity types: Spam, Pharmaceutical, and " +
              "Fraudulent / deceptive practices \u2014 tick " +
              "what matches the domains.", h("br"),
              "Complainant: " +
              (signedInAccountName() || "your own name") +
              ", reporting from the email address on this " +
              "account.", h("br"),
              "Attachments: the CSV and the evidence file " +
              "the button downloads."));
            var kitBtn = h("button",
              { "class": "sf-btn-blue", "type": "button" },
              "Download the ICANN files & open the form");
            kitBtn.addEventListener("click", function () {
              saDownloadText("icann-domains.csv",
                SA.buildIcannDomainCsv(liveDomains));
              var ev = SA.buildIcannEvidence(a, {
                registrar: ri.registrar || "",
                registrarAbuse: ri.registrarAbuse || "",
                domains: liveDomains,
                count: trig.count,
                oldestTs: trig.oldestTs
              });
              saDownloadText("icann-evidence.txt", ev || "");
              window.open(ICANN_ESCALATION_URL, "_blank",
                "noopener");
            });
            w.appendChild(h("div", { "class": "sf-actions" },
              kitBtn));
            var dismissBtn = h("button",
              { "class": "sf-btn", "type": "button" },
              "Don't show this for this registrar");
            dismissBtn.addEventListener("click", function () {
              var st = saStorageLocal();
              if (st) {
                st.get(SA_ICANN_DISMISSED_KEY, function (r3) {
                  var dmap =
                    (r3 && r3[SA_ICANN_DISMISSED_KEY]) || {};
                  dmap[key] = trig.count;
                  var payload = {};
                  payload[SA_ICANN_DISMISSED_KEY] = dmap;
                  st.set(payload, function () {});
                });
              }
              try { sec.toggle.remove(); } catch (e) {}
              try { sec.panel.remove(); } catch (e) {}
            });
            w.appendChild(h("div", { "class": "sf-actions" },
              dismissBtn));
            sec.panel.appendChild(w);
          });
        });
      });
    }
    // v1.0.72: lane gating — the live-website checks and
    // real-host discovery that decide which lanes this panel
    // may honestly offer. Runs after the domain trace (it
    // reads the website IP the trace resolved), mutates the
    // analysis (website suppression / origin replacement /
    // link host assembly), and records its verdicts on
    // a.laneGate for applyClassification. Every failure mode
    // resolves to "unknown" verdicts and an untouched
    // analysis — the panel then behaves exactly as before.
    function runLaneGating() {
      var SA = window.SpamAvenger;
      var gate = { senderSite: null, senderSiteRg: null,
        linkSite: null, linkDomain: null };
      a.laneGate = gate;
      if (!SA || !SA.classifySiteProbe) {
        return Promise.resolve(gate);
      }
      var probeCache = {};
      function probe(host) {
        if (!host) return Promise.resolve(null);
        if (!probeCache[host]) {
          probeCache[host] = saProbeSiteHost(host)
            .then(function (p) {
              if (p && p.outcome === "response") return p;
              // The apex often redirects or answers only on
              // www (or the reverse) — try the other spelling
              // before believing a network failure.
              if (host.indexOf("www.") !== 0) {
                return saProbeSiteHost("www." + host)
                  .then(function (p2) {
                    return (p2 && p2.outcome === "response")
                      ? p2 : p;
                  });
              }
              return p;
            });
        }
        return probeCache[host];
      }
      function verdict(domain, knownIp, probeP) {
        if (!domain) return Promise.resolve("unknown");
        var dnsP = SA.domainNoWebsite
          ? SA.domainNoWebsite(domain) : Promise.resolve(null);
        return Promise.all([probeP, dnsP]).then(function (rs) {
          return SA.classifySiteProbe({
            dnsEmpty: rs[1] === true ? true
              : (rs[1] === false ? false : null),
            frontDoor: knownIp ? SA.isFrontDoorIp(knownIp)
              : false,
            probe: rs[0]
          });
        }).catch(function () { return "unknown"; });
      }
      var senderDomain = String(a.senderDomain || "")
        .toLowerCase();
      // Public 1.0.72 release (internal build .73): the
      // REGISTRABLE domain of the From address — the domain
      // the registrar lane complains about and the trigger's
      // MX leg grades. Leg (2) of the spoof suppression
      // (liveness) reads a verdict for THIS domain
      // (gate.senderSiteRg below), not the From host's: a
      // spoofed subdomain has no website of its own, so
      // grading the host let support@verify.colorami.com
      // escape suppression on Nov 8 2026 while the
      // registrar lane aimed a full complaint at
      // colorami.com's registrar. The website lane's own
      // gates keep grading the From host exactly as before;
      // only the suppression trigger's liveness leg moves.
      var senderDomainRg = (SA.registrableDomain
        ? SA.registrableDomain(senderDomain) : "") ||
        senderDomain;
      var linkDomain = SA.primaryLinkDomain
        ? SA.primaryLinkDomain(a) : null;
      var linkHostName = null;
      if (SA.primaryLink && SA.hostOfUrl) {
        linkHostName = SA.hostOfUrl(SA.primaryLink(a) || "") ||
          null;
      }
      gate.linkDomain = linkDomain;
      var senderProbeP = (senderDomain && !a.skipComplaint)
        ? probe(senderDomain) : Promise.resolve(null);
      var senderRgProbeP = (senderDomainRg &&
          senderDomainRg !== senderDomain && !a.skipComplaint)
        ? probe(senderDomainRg) : senderProbeP;
      var linkProbeP = linkHostName ? probe(linkHostName)
        : Promise.resolve(null);
      var linkInfoP = Promise.resolve(null);
      if (linkHostName && SA.websiteHostFor) {
        linkInfoP = SA.websiteHostFor(linkHostName)
          .catch(function () { return null; })
          .then(function (info) {
            if (info || !linkDomain ||
                linkDomain === linkHostName) return info;
            return SA.websiteHostFor(linkDomain)
              .catch(function () { return null; });
          });
      }
      return Promise.all([senderProbeP, linkProbeP, linkInfoP,
          senderRgProbeP])
        .then(function (rs) {
          var linkInfo = rs[2];
          var jobs = [];
          jobs.push(verdict(senderDomain,
            a.websiteHost ? a.websiteHost.ip : null,
            Promise.resolve(rs[0])).then(function (v) {
              gate.senderSite = v;
              // The From host IS the registrable domain:
              // one verdict serves both scopes.
              if (senderDomainRg === senderDomain) {
                gate.senderSiteRg = v;
              }
            }));
          if (senderDomainRg !== senderDomain) {
            jobs.push(verdict(senderDomainRg, null,
              Promise.resolve(rs[3])).then(function (v) {
                gate.senderSiteRg = v;
              }));
          }
          jobs.push(verdict(linkHostName || linkDomain,
            linkInfo ? linkInfo.ip : null,
            Promise.resolve(rs[1])).then(function (v) {
              gate.linkSite = v;
            }));
          return Promise.all(jobs).then(function () {
            return { linkInfo: linkInfo };
          });
        }).then(function (ctx) {
          // --- the sender's own website ---
          var w = a.websiteHost;
          // Public 1.0.72 release (internal build .73): the
          // spoofed-From suppression (lib fromDomainSpoofed,
          // Michael's Nov 8 2026 call) — a LIVE website on
          // the From domain, a message that did not come from
          // that domain's own mail infrastructure, and no
          // link pointing at the domain itself: the domain
          // belongs to somebody else, likely another victim,
          // so BOTH domain lanes close here and
          // renderDomainTraceSections prints the suppression
          // note where they would have stood. The traced
          // facts stay on the analysis as evidence; the mail
          // lane, link lane and every other lane are
          // untouched. The liveness leg is graded INSIDE the
          // lib on gate.senderSiteRg — the registrable
          // domain's verdict — so a spoofed subdomain whose
          // apex runs a live site fires here even though the
          // From host itself has no website (the Nov 8 2026
          // verify.colorami.com escape).
          if (SA.fromDomainSpoofed &&
              SA.fromDomainSpoofed(a, gate)) {
            a.spoofDomainSuppressed = true;
            a.websiteComplaint = null;
            a.registrarComplaint = null;
            return ctx;
          }
          if (gate.senderSite === "nosite" ||
              gate.senderSite === "parked") {
            // Dead or parked: the website-host complaint lane
            // is suppressed outright — no button, no draft —
            // and renderDomainTraceSections prints Michael's
            // explanation sentence instead.
            a.websiteSuppressed = gate.senderSite;
            a.websiteComplaint = null;
            return ctx;
          }
          if (w && w.ip && SA.isFrontDoorIp(w.ip) &&
              gate.senderSite === "live") {
            // A real site behind a front-door proxy: the
            // complaint must reach the company ACTUALLY
            // hosting it. Discover the origin; found → the
            // lane retargets to that host's abuse desk like
            // any other host; not found → the lane turns off
            // with the hidden-host explanation. The front-door
            // company is never named to the user either way.
            return saDiscoverOrigin(w.domain || senderDomain)
              .then(function (originIp) {
                if (!originIp) {
                  a.websiteHostHidden = true;
                  a.websiteComplaint = null;
                  return ctx;
                }
                return SA.websiteHostForIp(
                  w.domain || senderDomain, originIp)
                  .then(function (info) {
                    if (!info) {
                      a.websiteHostHidden = true;
                      a.websiteComplaint = null;
                      return ctx;
                    }
                    if (a.ip && info.ip === a.ip && info.abuse &&
                        a.abuse &&
                        String(info.abuse).toLowerCase() ===
                          String(a.abuse).toLowerCase()) {
                      info = null; // the mail lane's desk again
                    }
                    a.websiteHost = info;
                    a.websiteComplaint = info
                      ? SA.buildHostingComplaint(a) : null;
                    return ctx;
                  });
              });
          }
          return ctx;
        }).then(function (ctx) {
          // --- the link's host ---
          var info = ctx.linkInfo;
          if (!linkDomain || gate.linkSite !== "live" || !info) {
            return gate;
          }
          function finishLink(li) {
            if (!li) return;
            if (a.ip && li.ip === a.ip && li.abuse && a.abuse &&
                String(li.abuse).toLowerCase() ===
                  String(a.abuse).toLowerCase()) {
              return; // the mail lane already lands on this desk
            }
            li.url = SA.primaryLink(a);
            a.linkHost = li;
            a.linkComplaint = SA.buildLinkComplaint(a);
          }
          if (SA.isFrontDoorIp(info.ip)) {
            return saDiscoverOrigin(linkDomain)
              .then(function (originIp) {
                if (!originIp) {
                  a.linkHostHidden = true;
                  return gate;
                }
                return SA.websiteHostForIp(linkDomain, originIp)
                  .then(function (i2) {
                    finishLink(i2);
                    return gate;
                  });
              });
          }
          finishLink(info);
          return gate;
        }).catch(function () { return gate; });
    }

    // v1.0.72: three-way classification drives lane
    // presentation (lib classifyBucket over the header signals
    // plus runLaneGating's site verdicts):
    //   fraud — report lanes lead; the APWG + CISA forward is
    //     offered ONLY in this bucket.
    //   uce — mail-host complaint + FTC lead; no forward.
    //   legit — a real company, merely unwanted: the existing
    //     PID section is promoted to the top of the stack and
    //     opened — it is the primary action for that bucket.
    // Safe Browsing is removed outright when the message's
    // primary link is not a live page (final pass only; an
    // unprobed or unknown link keeps it). Called twice: once
    // on header signals alone (finalPass=false — only the
    // forward row's visibility, which is reversible if gating
    // upgrades the bucket), and again after gating settles
    // (finalPass=true — Safe Browsing removal + PID promotion
    // land here).
    function applyClassification(finalPass) {
      var SA = window.SpamAvenger;
      if (!SA || !SA.classifyBucket) return;
      var bucket = SA.classifyBucket(a, a.laneGate || {});
      a.bucket = bucket;
      if (fwdRow && fwdRow.toggle) {
        var showFwd = bucket === "fraud";
        fwdRow.toggle.style.display = showFwd ? "" : "none";
        if (fwdStatus && fwdStatus.el) {
          fwdStatus.el.style.display = showFwd ? "" : "none";
        }
      }
      if (!finalPass) return;
      if (SA.sbLaneVisible &&
          !SA.sbLaneVisible(a, a.laneGate || {})) {
        if (sbRow && sbRow.toggle) sbRow.toggle.remove();
        if (sbStatus && sbStatus.el) sbStatus.el.remove();
        // Public 1.0.73 release (queued-abuse-note-sb-
        // reference.md): the abuse complaint's blocked note
        // pointed at this lane ("Report the links below via
        // Google Safe Browsing instead") — with the lane
        // itself removed, that pointer dangles. The note's
        // pointer sentence rides in a span marked
        // sf-abuse-sb-fallback at render; remove it here,
        // in the same final pass that removes the lane, so
        // the note stands on the contact fact alone.
        stack.querySelectorAll(".sf-abuse-sb-fallback")
          .forEach(function (el) { el.remove(); });
      }
      if (bucket === "legit") {
        var pidToggle = stack.querySelector("#sf-sec-pid-toggle");
        var pidPanel = stack.querySelector("#sf-sec-pid-panel");
        if (pidToggle && pidPanel &&
            stack.firstChild !== pidToggle) {
          stack.insertBefore(pidToggle, stack.firstChild);
          stack.insertBefore(pidPanel, pidToggle.nextSibling);
        }
        if (pidToggle) {
          var anyOpen = false;
          var panels = stack.querySelectorAll(".sf-acc-panel");
          for (var i = 0; i < panels.length; i++) {
            if (panels[i].style.display !== "none") {
              anyOpen = true;
              break;
            }
          }
          if (!anyOpen) pidToggle.click();
        }
      }
    }

    var tracePromise = Promise.resolve();
    if (window.SpamAvenger.traceSenderDomain && a.senderDomain) {
      try {
        tracePromise = Promise.resolve(
          window.SpamAvenger.traceSenderDomain(a));
      } catch (e) {
        tracePromise = Promise.resolve();
      }
    }
    var traceChain = tracePromise.then(function () {
      if (sfCurrentMsgKey !== msgKey) return null; // stale render
      try { applyClassification(false); } catch (e) {}
      return runLaneGating();
    }).then(function () {
      if (sfCurrentMsgKey !== msgKey) return; // stale render
      try { renderDomainTraceSections(); } catch (e) {}
      try { applyClassification(true); } catch (e) {}
    }, function () {});
    // Public 1.0.72 release (internal build .73): the Show
    // details gate settles with this chain, on success OR
    // failure — renderDomainTraceSections has appended any
    // website / link detail rows by now, so a waiting toggle
    // opens on the complete fact list.
    traceChain.then(settleDetailsTrace, settleDetailsTrace);
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
    function stashThenOpen(url, setStashStatus, lane, extra) {
      return function (ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        var opened = false;
        function open() {
          if (opened) return;
          opened = true;
          window.open(url, "_blank", "noopener");
          // v1.0.66: the form tab actually opened — via the
          // storage-success path, the storage-unavailable
          // fallback, or the safety-net timer, this is the one
          // choke point they all pass through — so the lane
          // counts as launched exactly once.
          if (lane) {
            recordLaunched(lane);
            // Public 1.0.72 release (internal build .73),
            // Michael's Nov 8 2026 catch: FTC and Safe
            // Browsing were the only launched lanes whose
            // status line never said so — it stayed on the
            // pre-open "Report ready" text (v1.0.35-era)
            // while Forward ends at "Launched" and the
            // complaint lanes at "Opened", and a return visit
            // already preset these two lanes to "Launched".
            // One shared `now` for the status line and the
            // badge, matching the complaint lanes' pattern.
            var now = Date.now();
            setStashStatus(saLaunchedText(now));
            // v1.0.66-test2: badge the action-row button
            // in-session, at the same choke point.
            applyLaunchedBadge(lane, now);
          }
        }
        try {
          if (typeof chrome === "undefined" || !chrome.storage ||
              !chrome.storage.local) {
            // open() first, warning second: the warning must
            // stay the final word on this lane's status line
            // (open() writes the Launched line, but a form
            // that opened blank is what the user needs to
            // know). Same ordering as the storage-error paths
            // below.
            open();
            setStashStatus("⚠ Couldn't save the report in this " +
              "browser — opening the form blank");
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
            // v1.0.74 (queued-ftc-guided-picks.md): the
            // message's own date rides the stash — the FTC
            // filler's encounter-date fill ("When did you
            // encounter the scam?") answers with the day
            // the reported message arrived, which only the
            // panel knows.
            date: a.date || "",
            // Public 1.0.72 release (internal build .73):
            // the sextortion flag + demanded wallet ride the
            // stash so reportfill can open the FTC narrative
            // as an extortion report and name the wallet.
            sextortion: !!(a.sextortion && a.sextortion.flagged),
            wallet: (a.sextortion && a.sextortion.wallet) || null,
            // Public 1.0.72 release (internal build .73):
            // the evidence-based spoof verdict (the lib's
            // fromAddressSpoofed: another domain's server
            // sent it AND DKIM never passed aligned for the
            // From domain) — reportfill closes a sextortion
            // narrative with one plain spoof sentence when,
            // and only when, this holds.
            fromSpoofed: !!(window.SpamAvenger &&
              window.SpamAvenger.fromAddressSpoofed &&
              window.SpamAvenger.fromAddressSpoofed(a)),
            // v1.0.78: the GoDaddy form payload (brand,
            // reported domain, description — the lane's
            // v1.0.77 slices) rides the stash only when
            // the launching lane supplied one (extra);
            // every other lane's stash carries null here
            // and reportfill ignores it.
            godaddy: (extra && extra.godaddy) || null,
            savedAt: Date.now()
          } }, function () {
            // v1.0.31: the v1.0.30 callback never checked lastError,
            // so a failed write looked exactly like a saved stash.
            // v1.0.35: the wording is user-facing now — no link
            // counts or storage jargon, just ready / not ready.
            if (chrome.runtime && chrome.runtime.lastError) {
              // Storage failed: open() still runs (a blank
              // form beats a dead button) and the warning is
              // written AFTER it, so the warning — not the
              // Launched line open() sets — is the final word
              // on the status line.
              open();
              setStashStatus("⚠ Couldn't save the report — the " +
                "form will open blank. You can copy the details " +
                "from this panel and paste them in.");
            } else {
              // Stash landed: open() sets the lane's status
              // line to the Launched text itself (public
              // 1.0.72 release, internal build .73 — the
              // v1.0.35-era "Report ready" write that used to
              // stand here is gone; it was never rewritten
              // after the form opened, so the lane never said
              // Launched in-session).
              open();
            }
          });
        } catch (e) {
          open();
          setStashStatus("⚠ Couldn't save the report — " +
            "opening the form blank");
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
    var ftcRow = acc.actionRow("sf-sec-ftc", "sf-btn-blue",
      "Report to FTC",
      stashThenOpen("https://reportfraud.ftc.gov/", ftcStatus.set, "ftc"));
    badgeTargets.ftc = { el: ftcRow.toggle };
    stack.appendChild(ftcStatus.el);
    // v1.0.64 (Michael's call, 2026-10-28): Safe Browsing has no
    // section and no nested button — its panel held nothing but
    // a button repeating the title, a dead click. The row itself
    // launches the lane (stash, then the form opens filled).
    // Its status line lives directly under the row.
    var sbRow = acc.actionRow("sf-sec-sb", "sf-btn-green",
      "Report to Google Safe Browsing",
      stashThenOpen(
        "https://safebrowsing.google.com/safebrowsing/report_phish/",
        sbStatus.set, "sb"));
    badgeTargets.sb = { el: sbRow.toggle };
    stack.appendChild(sbStatus.el);
    // v1.0.64 (Michael's call, 2026-10-28): Forward flattens
    // too — its section held only its button. The one adaptation:
    // that button is a live status surface (Opening\u2026 /
    // addressed / failure states), so the row's label span takes
    // over the job and the row keeps the button's established
    // id, sf-fwd-phish, which gmailForwardPhish looks up.
    var fwdRow = acc.actionRow("sf-sec-fwd", "sf-btn-green",
      "Forward phish to APWG + CISA",
      function () { gmailForwardPhish(); }, "sf-fwd-phish");
    badgeTargets.fwd = { el: fwdRow.toggle };
    // v1.0.66: Forward gets a status line under its row, exactly
    // like FTC / Safe Browsing. The row's own label is a live
    // status surface owned by gmailForwardPhish (addressed /
    // failure states, 12s re-arm), so the persistent launched
    // note cannot live there — it would be eaten by the re-arm.
    var fwdStatus = mkStashStatus("sf-fwd-status");
    stack.appendChild(fwdStatus.el);
    // The Gmail-native lane has no Outlook equivalent; it keeps
    // its own section, fifth in the stack, and exists only in
    // the big-provider case that builds the button.
    if (reportPhishBtn) {
      var googleSec = acc.section("sf-sec-google", "sf-btn-green",
        "Report phishing to Google");
      badgeTargets.google = { el: googleSec.toggle };
      googleSec.panel.appendChild(
        h("div", { "class": "sf-actions" }, reportPhishBtn));
      // v1.0.66: launched-status line for the Google lane,
      // inside its section under the button.
      googleStatusEl = h("p", { "class": "sf-fine sf-status",
        "id": "sf-google-status" }, "");
      googleSec.panel.appendChild(googleStatusEl);
    }
    // v1.0.66: preset every lane's launched indicator from the
    // stored history for THIS message. Async and best-effort:
    // no record (or no storage) leaves the panel exactly as it
    // rendered. saPresetText never overwrites a status a fresh
    // click in this session already wrote, and no lane is ever
    // disabled — re-running a lane stays possible.
    saLoadLaunched(saStorageLocal(), msgKey, function (rec) {
      // `rec` may be null — the presets below all no-op on a
      // missing record, and the Gmail-banner check still runs:
      // Gmail's own state outranks the store.
      function preset(el, lane) {
        if (!el) return;
        var t = saPresetText(el.textContent, rec, lane);
        if (t) el.textContent = t;
      }
      preset(ftcStatus.el, "ftc");
      preset(sbStatus.el, "sb");
      preset(fwdStatus.el, "fwd");
      preset(complaintStatusEl, "complaint");
      preset(googleStatusEl, "google");
      // v1.0.66-test2: badges on the outer controls, alongside
      // the status lines above. badgeTargets is consulted HERE,
      // at callback time — the registry is a live object the
      // rest of this synchronous render keeps filling, and the
      // storage callback only fires once the render has run to
      // completion, so every registered lane's target is present
      // by now. v1.0.66-test4: pid's registered target is its
      // section toggle, badged HERE straight from the stored
      // record — the mirror path for a return visit where the
      // section is never expanded this session, so the badge on
      // the collapsed toggle is the only sign the lane ran. The
      // green demand button itself is built later and presets
      // its own badge (re-mirroring this same timestamp onto
      // the toggle) in renderDemandStep. v1.0.66-test5:
      // complaint's registry entry carries BOTH its inner
      // button and its toggle, so this same pass presets the
      // button's badge and the toggle's mirror from the one
      // stored complaint timestamp.
      if (rec) {
        Object.keys(rec).forEach(function (lane) {
          if (typeof rec[lane] === "number") {
            applyLaunchedBadge(lane, rec[lane]);
          }
        });
      }
      // Gmail's true state: if the open message already carries
      // the "You reported this message as phishing" banner, the
      // Google lane is done whether or not our store knows it —
      // say so, and remember it for next time.
      if (googleStatusEl && (document.body.textContent || "").indexOf(
            "reported this message as phishing") !== -1) {
        googleStatusEl.textContent = "Already reported to Google \u2713";
        recordLaunched("google");
        // The badge title carries the already-reported wording;
        // its text uses the stored launch time when there is
        // one, else a bare check.
        applyLaunchedBadge("google",
          (rec && typeof rec.google === "number") ? rec.google : null,
          true);
      }
    });
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
      // v1.0.66-test4 (Michael's follow-up call after the
      // test3 live test): this blue toggle carries a
      // DISPLAY-ONLY MIRROR of the PID badge. History: test2
      // badged this toggle as the lane's primary mark; test3
      // (Michael's call) removed it — the ✓ belonged on the
      // green "Open in Gmail" action button (sf-demand-open)
      // alone; test4 restores the toggle badge as a mirror of
      // that same badge, so the collapsed section still shows
      // the lane was launched. The mirror is registered here
      // and badged from the stored record by the render-end
      // history callback; the demand step re-mirrors the same
      // timestamp when it presets the green button, and the
      // button's click handler mirrors its click moment onto
      // both. This toggle remains a pure expand/collapse
      // control as a TRIGGER: it only ever DISPLAYS the badge
      // — recording stays exclusively on the green button.
      badgeTargets.pid = { el: pidSec.toggle };
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
        // Public 1.0.72 release (internal build .73): the
        // send-as hint rides this lane too — the demand
        // letter opens in a Gmail compose like every other
        // lane's send, and it should leave from the address
        // the company's mail was sent to (that is the
        // address whose data the letter demands back). The
        // hint names it a letter here, not a complaint.
        var pidSendAs = sendAsHintEl("letter");
        if (pidSendAs) step.appendChild(pidSendAs);
        step.appendChild(h("div", { "class": "sf-actions" }, openBtn));
        // v1.0.66-test3: preset THIS button's launched badge
        // from the stored history. The demand step renders
        // asynchronously (D.loadDetails().then above), possibly
        // AFTER renderResult's own history-load callback already
        // fired. So the check runs here, at build time, keyed by
        // this render's own message key. The panel may have been
        // closed and re-rendered for a different message by the
        // time the storage callback lands — the sfCurrentMsgKey
        // guard drops the stale badge rather than pinning it to
        // a message it doesn't belong to. saBadgeOnElement
        // updates in place, so a record applied twice (this
        // check plus an in-session click) still yields exactly
        // one badge.
        // v1.0.66-test4: the SAME stored timestamp (rec.pid) is
        // also applied to the section toggle — the mirror. The
        // render-end callback may already have badged the
        // toggle from this very record; re-applying the
        // identical value just updates it in place, so the two
        // badges can never show different times.
        saLoadLaunched(saStorageLocal(), msgKey, function (rec) {
          if (sfCurrentMsgKey !== msgKey) return;
          if (rec && typeof rec.pid === "number") {
            saBadgeOnElement(openBtn, "pid", rec.pid, false);
            saBadgeOnElement(pidSec.toggle, "pid", rec.pid, false);
          }
        });
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
          // v1.0.66-test3: the demand compose actually opened
          // (the empty-To early return above never reaches
          // here) — the PID lane was launched. Record it and
          // badge THIS button in-session.
          // v1.0.66-test4: ONE `now` badges both the button and
          // its mirror on the blue section toggle, so the two
          // always show the identical time. Recording still
          // happens ONLY here, on the green button's click —
          // the toggle displays the mirror but never records.
          var now = Date.now();
          recordLaunched("pid");
          saBadgeOnElement(openBtn, "pid", now, false);
          saBadgeOnElement(pidSec.toggle, "pid", now, false);
        });
      }

      D.loadDetails().then(function (det) {
        if (D.detailsComplete(det)) renderDemandStep(det);
        else renderDetailsForm();
      });
    })();
    // Public 1.0.72 release (internal build .73): every
    // synchronous lane is in the stack now — materialize
    // the Blocked lanes group from whatever the mail lane
    // collected (see addBlockedNote) and flip it live, so
    // the async gate notes from renderDomainTraceSections
    // render into it the moment they arrive.
    blockedGroupLive = true;
    renderBlockedGroup();
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
      // Public 1.0.72 release (internal build .73): the
      // own-forward catch. When the header fetch exhausted
      // its retries (the "wouldn't hand over the headers"
      // signature) AND the anchored message is the user's
      // own forward, "Something broke" is a lie — a forward
      // carries no headers Gmail will hand over, so there
      // is nothing to trace. Say that plainly and point at
      // the original message. Any other failure keeps the
      // Something broke text untouched.
      if (msg.indexOf("wouldn't hand over the headers") !== -1 &&
          ownForwardOnPage(messageElById(mid))) {
        panel.appendChild(h("p", { "class": "sf-note" },
          window.SpamAvenger.OWN_FORWARD_EXPLANATION));
        return;
      }
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
