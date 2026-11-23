/*
 * Spam Avenger for Gmail — report-form filler (v1.0.64)
 *
 * Runs only on the Google Safe Browsing report page, the FTC's
 * ReportFraud wizard, and (since v1.0.78) GoDaddy's phishing
 * report form. When the user clicks "Report to FTC" or
 * "Report to Google Safe Browsing" in the Gmail panel, content.js
 * stashes the case details (phish URLs, sender, subject, sending IP,
 * server) in chrome.storage.local and waits for the write before
 * opening the form. This script reads that stash — only if it is
 * less than 30 minutes old — and pre-fills the form with it.
 *
 * v1.0.30 hardens the Safe Browsing fill (an Angular Material app):
 * longer polling, form-field-container label lookup, and set-verify-
 * retry so a value Angular wipes gets written again.
 *
 * v1.0.31–v1.0.34 the banner was a diagnostic readout ("Spam
 * Avenger fill check") in the top-right corner, reporting each step
 * of the chain live — stash read, URL field hunt, fill
 * verification, details fill — and mirroring it to the console with
 * an [SpamAvenger] prefix, so a failed fill said WHERE it stopped
 * instead of failing silently. It caught real bugs: v1.0.32 (the
 * stash WAS saved and read back fine, but held ZERO urls on
 * multipart spam, fixed in analyze.js — a 0-link stash is valid,
 * fills the details box without a "Phishing URL:" line, and is
 * erased once that fill lands).
 *
 * v1.0.35: the banner is part of the product now. Header is just
 * "Spam Avenger"; the visible lines are plain user language at a
 * readable size — what got filled, a review-before-you-submit
 * reminder, and on the FTC wizard a standing reminder that the
 * Yes/No answers are the user's own. If a fill fails, the banner
 * shows the phishing link as copyable text so the user can paste
 * it in themselves. A × in the corner hides the banner for the
 * page (cosmetic only — the fill/watch logic keeps running). All
 * the old step-by-step diagnostics still go to the console.
 *
 * v1.0.34: on the FTC wizard the banner gains a "→ Guide:" line —
 * plain-language directions for whichever step is on screen (click
 * Report Now, pick "An impersonator", pick Email, think before the
 * payment question, keep clicking Continue until the narrative box
 * lands, then read + Submit). It only points: it still never
 * answers a personal question and never submits.
 *
 * v1.0.37: guide step ORDER fix. The step checks ran payment →
 * contact → category → homepage, and the ReportFraud HOMEPAGE has
 * impersonator-flavored links of its own, so the category check
 * fired while the user was still on the homepage — the guide said
 * "pick 'An impersonator'" before Report Now had ever been
 * clicked. Now the homepage state is detected first and the
 * wizard-step lines (and the impersonator tile auto-click) are
 * gated on the wizard actually having started: its "common
 * problems" category heading or a visible Continue button.
 *
 * v1.0.40: when a fill lands (FTC narrative, or a confirmed Safe
 * Browsing fill), the banner pulses its background dark → green
 * three times over ~1.5 s before settling — a fill can complete
 * while the user is scrolled elsewhere on the form, and a quietly
 * changed banner gets missed. Reduced-motion users get no pulse.
 *
 * v1.0.41: on the FTC pages the banner header reads "Spam
 * Avenger Guide" — that banner IS the trail guide for the
 * wizard walk, and the header should say so. Safe Browsing
 * keeps the plain "Spam Avenger" header: its banner only
 * reports a finished fill, it isn't guiding anything.
 *
 * v1.0.42: with "Guide" in the FTC header, the "→ Guide:"
 * prefix on every guide line was redundant — dropped; the
 * lines are plain sentences now. And the attention pulse is
 * no longer wired to the two fill moments alone: Diag.set()
 * fires attention() whenever the LEAD line actually changes
 * to a new non-empty value (a new wizard step, a fill
 * landing, a warning — whatever the user needs to look at
 * next), so every banner change gets noticed, not just
 * fills. The old explicit call sites are gone — one pulse
 * per genuine change, never two.
 *
 * v1.0.43: the FTC watch no longer ends at the fill. The
 * narrative text is kept in memory (the stash is still erased
 * on the first fill) and the observer keeps running — up to
 * ~15 minutes total — for the post-fill states: the user hits
 * Back and the guide says nothing is lost (refilling the
 * Comments box from memory if the wizard wiped it), the
 * review step points at Submit, and when the FTC's own
 * confirmation text shows ("thank you", a report number) the
 * banner delivers the payoff — "🎉 You did it!" — before the
 * watch stands down. It still never clicks anything past the
 * one pre-fill impersonator tile, and never submits.
 *
 * v1.0.44: the "Went back a step" state false-fired on plain
 * FORWARD walks — forward steps repeat earlier text (and
 * transition frames flash it), and v1.0.43 fired on any single
 * sighting. The post-fill pass now ranks what it sees
 * (homepage 0, category 1, question steps 2, comments 3,
 * review 4, confirmation 5), remembers the highest rank
 * reached since the fill, and calls it "back" only when the
 * current rank sits BELOW that high-water mark on 2
 * consecutive passes. Same rank or higher is never "back",
 * no matter what text is on screen.
 *
 * v1.0.45: v1.0.44 still false-fired when a SECOND walk ran
 * in the same tab — the wizard is a single-page app, so the
 * new walk ran under the old walk's post-fill state and its
 * early steps all read as "backward." Session semantics
 * now: a post-fill pass that lands on the homepage (rank 0)
 * or the category step (rank 1) is a NEW report session —
 * Back moves one step at a time, so reaching 0/1 from the
 * comments step means starting over, and a restart gets the
 * fresh guide, instantly: the watch drops back to pre-fill
 * mode and the coming fill uses the in-memory narrative.
 * The "back" state is also re-keyed on the DOM instead of
 * text ranks: the wizard's "Report details" step is one
 * scrolling page where the questions and the Comments
 * textarea coexist, so a churn pass that drops the textarea
 * from the visible scan made FORWARD clicks read as a step
 * back. Now "back" needs question signals on screen AND no
 * <textarea> anywhere in the DOM (the composite page always
 * carries its node; a genuine standalone questions page has
 * none) AND the last stable state was comments or review,
 * held for 2 consecutive passes.
 *
 * v1.0.47: a second full live walk (submitted by hand, fill
 * never landed) exposed the flip side of the state machine:
 * the wizard's LATE pages failed the "wizard started" test.
 * The final step (contact details + a big Submit button, no
 * Continue) read as "not started" and got the Report Now
 * line, and the confirmation page — reached in pre-fill
 * guide mode, which had no submitted state at all — got it
 * too, so the "🎉 You did it!" payoff never fired. Now the
 * submitted state (the FTC's "Report submitted / Thank you
 * for helping / Report Number" words) is checked FIRST in
 * both modes and stands the watch down; the final step gets
 * its own line ("Last step — hit Submit when you're
 * ready."); and the homepage line needs positive evidence —
 * the hero or a Report Now control, with no wizard progress
 * track on screen — instead of being the default for
 * anything the wizardStarted test can't see. Unrecognized
 * pages fall through to the generic details line.
 *
 * v1.0.59: the Safe Browsing flow gets the FTC flow's payoff.
 * It used to end at the fill — the user reviewed, clicked Submit
 * themselves, and Google's confirmation screen got no reaction,
 * while the FTC walk has celebrated exactly that moment since
 * v1.0.43. Now a confirmed fill starts a submission watch (and
 * so does the hand-off to manual fill after a wipe — a report
 * the user finishes by hand earns it too, the same parity the
 * FTC guide mode got in v1.0.47). The watch is a
 * MutationObserver plus a slow interval, capped at ~15 minutes
 * like the FTC watch: when Google's thanks/submitted wording is
 * on screen AND the report form itself is gone (the SPA swaps
 * one for the other), the banner delivers the same "🎉 You did
 * it!" and stands down. Still NEVER clicks Submit.
 *
 * v1.0.60: the v1.0.59 Safe Browsing watch never fired in the
 * field, and a live retest showed why — BOTH of its gates were
 * wrong for Google's real page. Google does not swap the form
 * out on submit: the form stays fully on screen and a new
 * "Status of submission" panel appears under it, reading
 * "Submission was successful." So the form-gone requirement
 * could never hold, and the old wording net didn't contain
 * that sentence either. The trigger is now Google's
 * confirmation text alone (sbSubmissionConfirmed): the
 * observed "Submission was successful" and its variants, a
 * "Status of submission" heading paired with a success word,
 * and the older thank-you/submitted wording kept as extra
 * triggers. Everything else is unchanged — the identical
 * celebration lines, the ~15-minute cap, never clicking
 * Submit.
 *
 * v1.0.62: the v1.0.60 trigger STILL never fired in the field
 * (retest Oct 20: Google's green "Submission was successful."
 * panel on screen, banner unmoved). The matcher and the arming
 * were both right — the text collector was not: sbVisibleText
 * only read h1–h4 and p elements, and Google builds the status
 * panel out of divs and spans, so the confirmation sentence
 * never reached the matcher. sbVisibleText now also pulls the
 * page's rendered text (body.innerText) as a second source.
 * Nothing else changes.
 *
 * v1.0.78: the GoDaddy lane graduates from kit-only to a real
 * fill. Michael walked the registrar's phishing form live
 * (Nov 23 2026) and the v1.0.77 kit landed the description copy
 * but left the form's other boxes empty — his call: "seems like
 * we can fill in more for the user, and maybe a guide pane."
 * The form is a plain web form, so it gets the FTC treatment:
 * the panel's GoDaddy button stashes the case (with the lane's
 * brand / reported-domain / description payload merged in),
 * this script fills the four fillable boxes on
 * legalportal.godaddy.com, and the banner — header "Spam
 * Avenger Guide", like the FTC's — says what it filled and
 * what it left, and why. The reporter's email comes from the
 * PID lane's saved details (sa_user_email) when the user saved
 * one; without one the box stays empty and the guide says so —
 * an address is never invented. The mobile checkbox and the
 * country select are left exactly as the form presents them.
 * A box the user already filled is never overwritten. Still
 * NEVER clicks Submit.
 *
 * v1.0.79: the GoDaddy lane gets its finish line. Michael's
 * live test of v1.0.78 (Nov 23 2026) filled, he reviewed and
 * submitted himself, and GoDaddy's confirmation page read
 * "Submission Complete / Thank You! Your abuse report has
 * been successfully submitted" with a "DCU Ticket Numbers:"
 * list — one DCU number per submitted URL (11 tickets in
 * his run, DCU102475070 through DCU102475080, the bare
 * domain included) — but the guide pane was still sitting
 * on that page showing the stale fill lines ("Give it a
 * quick review, then click Submit"). His words: "almost
 * perfect.. a hero flash at the end will finish the
 * polish." Now a hero watch runs on the GoDaddy portal
 * from page load (and is re-armed when the fill pass
 * finishes): when GoDaddy's confirmation wording is on
 * screen, the pane swaps — all three lines at once — to a
 * hero finish (filled-green pane, oversized checkmark,
 * "✓ Filed with GoDaddy", the DCU ticket count when the
 * numbers parse), with no submit language anywhere. The
 * fill pass also checks for the confirmation before it
 * writes anything, so a confirmation page never gets fill
 * copy, and the storage callback hands the pane to the
 * watch when the confirmation is already up. The watch
 * never clicks anything.
 *
 * The stash is erased as soon as a form is filled. Nothing is ever
 * transmitted by this script, and it NEVER clicks Submit: the user
 * reviews the filled form and sends the report themselves.
 */
(function () {
  "use strict";

  /* ---------------- banner ---------------- */

  // v1.0.35: a user-facing banner, not a debug readout. Three
  // visible lines under a plain "Spam Avenger" header: a bold lead
  // line (the FTC guide, or what just got filled), plus up to two
  // supporting lines (a reminder, or the failure fallback text).
  // Big, readable type: 16px body, 18px bold lead. The × hides it
  // for this page — cosmetic only; it never stops the fill/watch
  // logic. Internal step detail still goes to the console with an
  // [SpamAvenger] prefix via Diag.debug(). set() takes the slot
  // names "lead", "sub1", "sub2" only — anything else is ignored.
  var Diag = (function () {
    var state = { lead: "", sub1: "", sub2: "" };
    var el = null, headEl = null, leadEl = null, sub1El = null,
      sub2El = null;
    var dismissed = false;
    // v1.0.41: the header line is settable (Diag.setHeader) so
    // the FTC pages can title the banner "Spam Avenger Guide".
    // render() re-applies it, so a watchdog-recreated banner
    // keeps the right header.
    var headerText = "Spam Avenger";
    // v1.0.79: hero mode — the GoDaddy confirmation finish.
    // Once a lane's hero() lands, the pane keeps the filled
    // accent (the pulse's green) as its resting background
    // and the lead line runs oversized, so the finish reads
    // as a finish line, not another instruction block. The
    // watchdog's ensure()/render() re-apply it, so a banner
    // the host page drops and recreates comes back heroic.
    var heroMode = false;

    function log(line) {
      try { console.log("[SpamAvenger] " + line); } catch (e) {}
    }

    function render() {
      if (!el) return;
      if (headEl) headEl.textContent = headerText;
      var pairs = [[leadEl, state.lead], [sub1El, state.sub1],
        [sub2El, state.sub2]];
      for (var i = 0; i < pairs.length; i++) {
        if (!pairs[i][0]) continue;
        pairs[i][0].textContent = pairs[i][1] || "";
        pairs[i][0].style.display = pairs[i][1] ? "" : "none";
      }
    }

    // v1.0.40: when a fill lands, pulse the banner's background
    // dark → green so the change catches the eye — the FTC fill
    // can land while the user is scrolled down at the Comments
    // box, and a quietly changed banner is easy to miss. Three
    // full pulses over ~1.5 s, then it settles back to the normal
    // dark. The watchdog can't stomp this: ensure() on a live
    // banner only calls render() (text lines), never rewrites the
    // banner's own style; the background is toggled with the same
    // !important priority the base style is declared with. If the
    // host page drops the banner mid-pulse, the timer sees the
    // element leave the document and stops — a recreated banner
    // carries the base dark style, which is the settle state.
    // v1.0.42: the trigger moved into set() (see below) — any
    // genuine change of the lead line pulses, fills included.
    var PULSE_DARK = "rgba(17,17,17,0.94)";
    var PULSE_GREEN = "#1e8e3e"; // the panel's action green
    var pulseTimer = null;
    function attention() {
      if (dismissed || !el) return;
      try {
        if (window.matchMedia && window.matchMedia(
            "(prefers-reduced-motion: reduce)").matches) return;
      } catch (e) {}
      if (!document.documentElement ||
          !document.documentElement.contains(el)) return;
      if (pulseTimer) { clearInterval(pulseTimer); pulseTimer = null; }
      var steps = 0;
      el.style.setProperty("background", PULSE_GREEN, "important");
      pulseTimer = setInterval(function () {
        steps++;
        if (!el || dismissed || !document.documentElement ||
            !document.documentElement.contains(el)) {
          clearInterval(pulseTimer); pulseTimer = null;
          return;
        }
        el.style.setProperty("background",
          steps % 2 ? PULSE_DARK : PULSE_GREEN, "important");
        if (steps >= 5) { // 5 toggles = 3 full pulses
          clearInterval(pulseTimer); pulseTimer = null;
          // Ends dark — or, in hero mode, ends on the filled
          // accent: the hero IS the settled state (v1.0.79).
          el.style.setProperty("background",
            heroMode ? PULSE_GREEN : PULSE_DARK, "important");
        }
      }, 250);
    }

    // v1.0.79: the hero look — filled accent background and
    // an oversized lead (the checkmark headline), applied on
    // top of the base banner style with the same !important
    // priority. Called from ensure() both when the banner is
    // (re)created and when a live one is re-rendered, so the
    // hero survives the host page dropping the node.
    function applyHero() {
      if (!heroMode || !el) return;
      el.style.setProperty("background", PULSE_GREEN, "important");
      if (leadEl) {
        leadEl.style.setProperty("font-size", "26px", "important");
        leadEl.style.setProperty("line-height", "1.25", "important");
      }
    }

    function ensure() {
      if (dismissed) return;
      if (el && document.documentElement &&
          document.documentElement.contains(el)) {
        render();
        applyHero();
        return;
      }
      el = document.createElement("div");
      el.id = "spam-avenger-banner";
      el.setAttribute("style",
        "position:fixed !important;top:12px !important;" +
        "right:12px !important;z-index:2147483647 !important;" +
        "background:rgba(17,17,17,0.94) !important;" +
        "color:#fff !important;" +
        "font-family:-apple-system,'Segoe UI',Roboto,Arial," +
        "Helvetica,sans-serif !important;" +
        "font-size:16px !important;line-height:1.45 !important;" +
        "padding:14px 16px !important;border-radius:8px !important;" +
        "pointer-events:auto !important;max-width:420px !important;" +
        "white-space:pre-wrap !important;" +
        "overflow-wrap:break-word !important;" +
        "text-align:left !important;" +
        "box-shadow:0 4px 16px rgba(0,0,0,0.45) !important;");
      var close = document.createElement("button");
      close.type = "button";
      close.textContent = "\u00D7";
      close.setAttribute("aria-label", "Dismiss");
      close.setAttribute("style",
        "position:absolute !important;top:4px !important;" +
        "right:4px !important;width:32px !important;" +
        "height:32px !important;min-width:32px !important;" +
        "min-height:32px !important;padding:0 !important;" +
        "margin:0 !important;background:transparent !important;" +
        "border:none !important;color:#fff !important;" +
        "font-size:20px !important;line-height:32px !important;" +
        "text-align:center !important;cursor:pointer !important;" +
        "font-family:inherit !important;");
      close.addEventListener("click", function () {
        dismissed = true;
        if (el && el.parentNode) el.parentNode.removeChild(el);
        el = null;
      });
      var head = document.createElement("div");
      headEl = head;
      head.textContent = headerText;
      head.setAttribute("style",
        "font-size:18px !important;font-weight:bold !important;" +
        "margin:0 24px 6px 0 !important;");
      leadEl = document.createElement("div");
      leadEl.setAttribute("style",
        "font-size:18px !important;font-weight:bold !important;" +
        "margin:0 0 6px 0 !important;");
      sub1El = document.createElement("div");
      sub1El.setAttribute("style",
        "font-size:16px !important;margin:0 0 6px 0 !important;");
      sub2El = document.createElement("div");
      sub2El.setAttribute("style",
        "font-size:16px !important;margin:0 !important;" +
        "overflow-wrap:anywhere !important;");
      el.appendChild(close);
      el.appendChild(head);
      el.appendChild(leadEl);
      el.appendChild(sub1El);
      el.appendChild(sub2El);
      (document.documentElement || document.body).appendChild(el);
      render();
      applyHero();
    }

    return {
      init: function () {
        ensure();
        log("Spam Avenger banner ready");
        log("page: " + String(location.href).slice(0, 80));
        // The host app may re-render and drop the banner; a slow
        // watchdog keeps it on screen for the page's lifetime
        // (unless the user dismissed it — then it stays gone).
        setInterval(ensure, 2000);
      },
      set: function (key, line) {
        var leadChanged = false;
        if (Object.prototype.hasOwnProperty.call(state, key)) {
          // v1.0.42: a genuine change of the lead line is the
          // moment the user should look at the banner — a new
          // wizard step, a landed fill, a warning. Same value,
          // or clearing the line, is not news: no pulse.
          if (key === "lead" && line && line !== state.lead) {
            leadChanged = true;
          }
          state[key] = line;
        }
        ensure(); // render() puts the new text in place first
        if (leadChanged) attention();
      },
      setHeader: function (text) {
        headerText = text || "Spam Avenger";
        ensure(); // render() inside applies it to a live banner
      },
      // v1.0.79: swap the pane to the hero finish in one
      // move — all three lines replaced together (no stale
      // fill line can linger under the headline), hero mode
      // on so the look changes with the words, then the
      // attention pulse, which now settles on the accent.
      hero: function (lines) {
        heroMode = true;
        state.lead = (lines && lines.lead) || "";
        state.sub1 = (lines && lines.sub1) || "";
        state.sub2 = (lines && lines.sub2) || "";
        ensure(); // render() + applyHero() put it on screen
        attention();
      },
      debug: function (line) { log(line); },
      attention: attention
    };
  })();

  Diag.init();

  // v1.0.79: on GoDaddy's portal the hero watch starts at
  // once — before the stash is even read — so a page that
  // IS the confirmation (a fresh load after the user's own
  // submit, or an in-tab transition that kept this script
  // alive) swaps the pane to the hero finish instead of
  // leaving fill lines standing, and a form page carries
  // the watch from the start. The Guide header goes up
  // with it, so the pane never shows the plain header here.
  if (location.hostname === "legalportal.godaddy.com") {
    Diag.setHeader("Spam Avenger Guide");
    watchGoDaddyHero();
  }

  if (typeof chrome === "undefined" || !chrome.storage ||
      !chrome.storage.local) {
    Diag.debug("stash: READ ERROR: chrome.storage API unavailable " +
      "on this page");
    Diag.set("lead", "\u26A0 I couldn't reach your saved report " +
      "data in this browser.");
    return;
  }

  var MAX_AGE_MS = 30 * 60 * 1000; // ignore stashes older than 30 min

  // v1.0.78: the reporter's saved email lives under the PID
  // lane's storage key — lib/demand.js's DETAIL_KEYS.email,
  // "sa_user_email". demand.js is the single source of truth
  // for the key; it doesn't run on form pages, so the string
  // is named here and pinned against demand.js's source by
  // the v1.0.78 tests.
  var SA_USER_EMAIL_KEY = "sa_user_email";

  chrome.storage.local.get("pendingReport", function (res) {
    if (chrome.runtime && chrome.runtime.lastError) {
      Diag.debug("stash: READ ERROR: " +
        (chrome.runtime.lastError.message || "unknown error"));
      Diag.set("lead", "\u26A0 I couldn't read your saved report " +
        "data.");
      return;
    }
    // v1.0.79: on the GoDaddy portal, a confirmation already
    // on screen outranks everything below — no "no stash" or
    // "stale stash" line may overwrite the hero, and no fill
    // may start. The hero watch owns the pane; return.
    if (location.hostname === "legalportal.godaddy.com" &&
        godaddyConfirmation(godaddyPageText()).confirmed) {
      Diag.debug("stash: GoDaddy confirmation already on " +
        "screen \u2014 hero watch owns the pane");
      watchGoDaddyHero();
      return;
    }
    var stash = res && res.pendingReport;
    if (!stash) {
      Diag.debug("stash: none in storage");
      Diag.set("lead", "Open a phishing email in Gmail and click " +
        "one of the report buttons — I'll fill this form in for " +
        "you.");
      return;
    }
    var ageS = stash.savedAt
      ? Math.max(0, Math.round((Date.now() - stash.savedAt) / 1000))
      : -1;
    if (!stash.savedAt || Date.now() - stash.savedAt > MAX_AGE_MS) {
      Diag.debug("stash: STALE (age " +
        (ageS < 0 ? "?" : ageS) + "s)");
      Diag.set("lead", "That saved report was too old to use. Go " +
        "back to the email in Gmail and click the report button " +
        "again.");
      clearStash();
      return;
    }
    // v1.0.32: a stash with ZERO links is valid, not "none found".
    // Older builds stored urls: [] whenever analyze() couldn't see
    // into the message's MIME parts, and this gate then reported
    // "none found" even though the panel had truthfully said "Case
    // data saved ✓". A 0-link stash still fills the details box
    // (sender, subject, sending IP) — only the URL fill is skipped.
    var nUrls = (stash.urls || []).length;
    if (nUrls) {
      Diag.debug("stash: OK — " + nUrls + " urls, age " + ageS + "s");
    } else {
      Diag.debug("stash: found but 0 links — details only");
    }
    if (location.hostname === "safebrowsing.google.com") {
      fillSafeBrowsing(stash);
    } else if (location.hostname === "reportfraud.ftc.gov") {
      // v1.0.41: on the FTC pages the banner is the trail
      // guide, so its header says "Spam Avenger Guide". Set
      // here, before fillFtc runs, so the banner never shows
      // the plain header on this site.
      Diag.setHeader("Spam Avenger Guide");
      fillFtc(stash);
    } else if (location.hostname === "legalportal.godaddy.com") {
      // v1.0.78: GoDaddy's phishing form is a plain form, so
      // it gets the guide-pane treatment too — the banner is
      // titled "Spam Avenger Guide" here, like the FTC's.
      Diag.setHeader("Spam Avenger Guide");
      // The reporter's email is NOT part of the report
      // stash: it is the PID lane's saved detail, read here
      // in a second, separate get (the pendingReport read
      // above keeps its long-standing shape). A missing key
      // simply means no saved email — fillGoDaddy leaves
      // that box empty and the guide says so.
      var gdFillStarted = false;
      var gdStart = function (em) {
        if (gdFillStarted) return;
        gdFillStarted = true;
        fillGoDaddy(stash, em);
      };
      try {
        chrome.storage.local.get(SA_USER_EMAIL_KEY,
          function (res2) {
            var em = res2 && res2[SA_USER_EMAIL_KEY];
            gdStart(typeof em === "string" ? em : "");
          });
      } catch (e) {
        // Storage threw synchronously: still fill, without
        // an email — the guide names the empty box.
        gdStart("");
      }
    }
  });

  function clearStash() {
    try { chrome.storage.local.remove("pendingReport"); } catch (e) {}
  }

  // Short factual summary for the details/narrative boxes. Extra URLs
  // are dropped first so the text fits maxLen without sawing the
  // primary URL or a sentence in half.
  function detailsText(stash, maxLen) {
    function build(extraUrls) {
      var hasUrls = !!(stash.urls && stash.urls.length);
      var L = [];
      // Public 1.0.72 release (internal build .73): a
      // sextortion stash (the panel flagged the message,
      // Michael's Nov 8 2026 ruling — the FTC lane carries
      // it) opens with what the message actually is, not the
      // phishing line, and names the wallet the payment was
      // demanded to: the wallet is the one piece of evidence
      // an investigator can act on. The URL lines below are
      // unchanged, and a non-sextortion stash's text is
      // byte-identical to before.
      if (stash.sextortion) {
        L.push("I received a sextortion (extortion) email " +
          "demanding payment.");
        if (stash.wallet) {
          L.push("Payment was demanded to this crypto " +
            "wallet: " + stash.wallet);
        }
      } else {
        L.push(hasUrls
          ? "I received a phishing/spam email containing a link to a " +
            "phishing page."
          : "I received a phishing/spam email.");
      }
      // v1.0.32: omit the URL line entirely on a 0-link stash —
      // never print "Phishing URL: undefined".
      if (hasUrls) L.push("Phishing URL: " + stash.urls[0]);
      if (extraUrls.length) {
        L.push("Other links in the message:");
        extraUrls.forEach(function (u) { L.push("- " + u); });
      }
      if (stash.from) L.push("Claimed sender: " + stash.from);
      if (stash.subject) L.push("Subject: " + stash.subject);
      if (stash.ip) {
        L.push("Sending IP: " + stash.ip +
          (stash.server ? " (server: " + stash.server + ")" : ""));
      }
      // Public 1.0.72 release (internal build .73): a
      // sextortion narrative closes with the spoof fact
      // when the EVIDENCE proves it — the stash's
      // fromSpoofed is set only when another domain's
      // server sent the message and DKIM never passed
      // aligned for the From domain (the Nov 8 specimen:
      // From the user's own domain, sent from an unrelated
      // Kenyan server, DKIM missing). The sextortion flag
      // alone is not enough, and a non-sextortion
      // narrative never gets the line.
      if (stash.sextortion && stash.fromSpoofed) {
        L.push("The From address appears spoofed; the " +
          "sending IP is not associated with the claimed " +
          "sender's domain.");
      }
      return L.join("\n");
    }
    var extras = (stash.urls || []).slice(1, 6);
    var text = build(extras);
    while (text.length > maxLen && extras.length) {
      extras.pop();
      text = build(extras);
    }
    if (text.length > maxLen) text = text.slice(0, maxLen);
    return text;
  }

  // Set a field's value the way the page's framework expects: native
  // prototype setter (so React/Angular value trackers notice) plus
  // input/change events.
  function setNativeValue(el, value) {
    var proto = null;
    if (el.tagName === "TEXTAREA") proto = HTMLTextAreaElement.prototype;
    else if (el.tagName === "SELECT") proto = HTMLSelectElement.prototype;
    else proto = HTMLInputElement.prototype;
    var desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function isVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    var r = el.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    var s = window.getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden";
  }

  // Best-effort label for a form control: aria-label, aria-labelledby,
  // an associated <label>, or a label-ish element in a nearby wrapper
  // (Material-style form fields group label + control in one box).
  function controlLabel(el) {
    var t = el.getAttribute && (el.getAttribute("aria-label") || "");
    if (t) return t;
    var lb = el.getAttribute && el.getAttribute("aria-labelledby");
    if (lb) {
      var ref = document.getElementById(lb.split(/\s+/)[0]);
      if (ref) return ref.textContent || "";
    }
    if (el.id) {
      var lab = document.querySelector('label[for="' + el.id + '"]');
      if (lab) return lab.textContent || "";
    }
    var wrap = el.closest && el.closest("label");
    if (wrap) return wrap.textContent || "";
    var node = el;
    for (var i = 0; i < 5 && node && node.parentElement; i++) {
      node = node.parentElement;
      var cand = node.querySelector(
        "label, [class*='label'], [class*='Label']");
      if (cand && cand !== el && !cand.contains(el)) {
        var tx = (cand.textContent || "").trim();
        if (tx && tx.length < 60) return tx;
      }
    }
    return el.getAttribute && (el.getAttribute("placeholder") || "") || "";
  }

  // First visible control of the given tag names whose label matches.
  function findField(tags, labelRe) {
    var els = document.querySelectorAll(tags);
    for (var i = 0; i < els.length; i++) {
      if (isVisible(els[i]) && labelRe.test(controlLabel(els[i]))) {
        return els[i];
      }
    }
    return null;
  }

  // Pick an option in a native <select> or a Material-style custom
  // dropdown: native value-set first, else click the control open and
  // click the option whose visible text matches. Never touches any
  // submit control.
  function trySelectOption(labelRe, optionRe, done) {
    var finished = false;
    function finish(ok) {
      if (!finished) { finished = true; if (done) done(ok); }
    }
    var control = findField(
      "select, [role='combobox'], [role='listbox']", labelRe);
    if (!control) { finish(false); return; }
    if (control.tagName === "SELECT") {
      for (var i = 0; i < control.options.length; i++) {
        if (optionRe.test(control.options[i].textContent || "")) {
          setNativeValue(control, control.options[i].value);
          finish(true);
          return;
        }
      }
      finish(false);
      return;
    }
    // Custom dropdown: open it, then hunt the option list.
    try { control.click(); } catch (e) { finish(false); return; }
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      var opts = document.querySelectorAll(
        "[role='option'], [role='listbox'] *, mat-option, " +
        "[class*='option'], [class*='Option']");
      for (var j = 0; j < opts.length; j++) {
        var tx = (opts[j].textContent || "").trim();
        if (tx && tx.length < 80 && optionRe.test(tx) &&
            isVisible(opts[j])) {
          try { opts[j].click(); } catch (e) {}
          clearInterval(timer);
          finish(true);
          return;
        }
      }
      if (tries >= 10) { clearInterval(timer); finish(false); }
    }, 200);
  }

  /* ---------------- Google Safe Browsing ---------------- */

  // Text of the label inside an Angular Material form-field container
  // (mat-form-field): a <mat-label>, a real <label> (MDC renders the
  // floating label as one), or another label-ish element in the box.
  function containerLabelText(container) {
    var lab = container.querySelector(
      "mat-label, label, [class*='floating-label'], " +
      "[class*='label'], [class*='Label']");
    return lab ? (lab.textContent || "") : "";
  }

  // First control of the given tag inside a form-field container
  // whose label matches labelRe.
  function findInFormField(tag, labelRe) {
    var boxes = document.querySelectorAll(
      "mat-form-field, [class*='form-field'], [class*='formField']");
    for (var i = 0; i < boxes.length; i++) {
      if (!isVisible(boxes[i])) continue;
      if (!labelRe.test(containerLabelText(boxes[i]))) continue;
      var ctl = boxes[i].querySelector(tag);
      if (ctl && isVisible(ctl)) return ctl;
    }
    return null;
  }

  // Which strategy found the URL field on the latest hunt — read by
  // fillSafeBrowsing purely for the diagnostic banner.
  var urlFieldStrategy = "";

  // The "URL to report" input. v1.0.29 looked it up by the input's
  // own label and missed: on this Angular Material page the label
  // lives in the surrounding mat-form-field, not on the input. Try
  // strategies in order until one matches.
  function findUrlField() {
    // (a) input inside the form field labelled "URL to report"
    var f = findInFormField("input", /url to report/i);
    if (f) { urlFieldStrategy = "a"; return f; }
    var inputs = document.querySelectorAll("input");
    var i, el;
    // (b) an input whose own aria-label mentions URL
    for (i = 0; i < inputs.length; i++) {
      el = inputs[i];
      var al = el.getAttribute("aria-label") || "";
      if (al && /url/i.test(al) && isVisible(el) &&
          !el.disabled && !el.readOnly) {
        urlFieldStrategy = "b";
        return el;
      }
    }
    // (c) first visible empty text input that is not part of a
    // select/dropdown widget (Threat Type/Category are mat-selects)
    for (i = 0; i < inputs.length; i++) {
      el = inputs[i];
      var type = (el.getAttribute("type") || "text").toLowerCase();
      if (type !== "text" && type !== "url" && type !== "search") {
        continue;
      }
      if (!isVisible(el) || el.value || el.disabled || el.readOnly) {
        continue;
      }
      if (el.getAttribute("role") === "combobox") continue;
      if (el.closest && el.closest(
          "mat-select, select, [role='combobox'], [role='listbox']")) {
        continue;
      }
      urlFieldStrategy = "c";
      return el;
    }
    return null;
  }

  // Set a value, then re-read it 300 ms later: Angular change
  // detection can wipe a programmatic value it doesn't believe in,
  // so confirm the value stuck and retry — up to 3 attempts total —
  // before reporting done(ok).
  function setVerified(el, value, done) {
    var attempts = 0;
    (function attempt() {
      attempts++;
      try { el.focus(); } catch (e) {}
      setNativeValue(el, value);
      setTimeout(function () {
        if (el.value === value) { done(true); return; }
        if (attempts >= 3) { done(false); return; }
        attempt();
      }, 300);
    })();
  }

  function fillSafeBrowsing(stash) {
    // Shared tail of both paths below: fill the details box, then
    // try the threat dropdowns. eraseMode "always" erases the stash
    // when the tail runs (the URL fill already landed — that was the
    // 1.0.31 behavior); "onDetails" erases only once the details
    // text is confirmed in the box (the 0-link path, where the
    // details fill is all there is).
    function detailsThenSelects(eraseMode) {
      var details = findInFormField("textarea",
          /additional details/i) ||
        findField("textarea", /additional details/i);
      if (!details) { // fallback: the form's visible textarea
        var tas = document.querySelectorAll("textarea");
        for (var k = 0; k < tas.length; k++) {
          if (isVisible(tas[k])) { details = tas[k]; break; }
        }
      }
      // v1.0.35: the user-facing outcome line, once the details
      // step settles. detailsFound = the box is there and holds
      // text (ours, or text that was already in it).
      function finishBanner(detailsFound) {
        if (eraseMode === "onDetails") {
          // 0-link path: the details text was the whole payload.
          if (detailsFound) {
            Diag.set("lead", "\u2713 Filled in: the details from " +
              "your email.");
            Diag.set("sub1", "This email had no link in it, so " +
              "the URL box is still empty — add one yourself or " +
              "close this form.");
          } else {
            Diag.set("lead", "\u26A0 I couldn't fill this form in.");
            Diag.set("sub1", "Go back to the email in Gmail — " +
              "the panel there has the details if you want to " +
              "paste them in.");
          }
        } else if (detailsFound) {
          Diag.set("lead", "\u2713 Filled in: the phishing link " +
            "and the details from your email.");
          Diag.set("sub1", "Give it a quick review, then click " +
            "Submit when you're ready — I never submit for you.");
        } else {
          Diag.set("lead", "\u2713 Filled in: the phishing link " +
            "from your email.");
          Diag.set("sub1", "Give it a quick review, then click " +
            "Submit when you're ready — I never submit for you.");
        }
        Diag.set("sub2", "");
        // v1.0.42: no explicit flash call here anymore — the
        // lead change above pulses the banner centrally in
        // Diag.set(). (v1.0.40 wired attention() to this spot;
        // the lead line changes on every outcome branch, the
        // warning included, which is what Michael wants.)
        // v1.0.59: whenever a fill actually landed (the URL on
        // the "always" path, the details on the 0-link path),
        // start the submission watch so the user's own Submit
        // gets the "🎉 You did it!" payoff when Google confirms.
        if (eraseMode === "always" || detailsFound) watchSbSubmit();
      }
      function selects(erase) {
        // Threat Type (and Category, if offered): phishing /
        // social engineering is the honest bucket for these pages.
        trySelectOption(/threat type/i, /phishing|social engineering/i,
          function () {
            trySelectOption(/threat category/i,
              /phishing|social engineering/i, null);
          });
        if (erase) clearStash();
      }
      if (details && !details.value) {
        Diag.debug("details: found — filling…");
        setVerified(details, detailsText(stash, 800),
          function (dok) {
            Diag.debug(dok
              ? "details: set+verified"
              : "details: set but WIPED (after retries)");
            selects(eraseMode === "always" || dok);
            finishBanner(dok);
          });
      } else if (details) {
        Diag.debug("details: already had text — left alone");
        selects(eraseMode === "always");
        finishBanner(true);
      } else {
        Diag.debug("details: NOT FOUND");
        selects(eraseMode === "always");
        finishBanner(false);
      }
    }

    // v1.0.32: 0-link stash — there is no URL to hunt or fill. Say
    // so on the banner, wait for the form's details box to render,
    // and fill that instead (it still carries sender/subject/IP).
    if (!stash.urls || !stash.urls.length) {
      Diag.debug("url field: no link in case data — details only");
      Diag.set("lead", "Filling in the details from your email…");
      var zeroDeadline = Date.now() + 30000;
      var zeroTimer = setInterval(function () {
        var tas = document.querySelectorAll("textarea");
        var rendered = false;
        for (var k = 0; k < tas.length; k++) {
          if (isVisible(tas[k])) { rendered = true; break; }
        }
        if (rendered) {
          clearInterval(zeroTimer);
          detailsThenSelects("onDetails");
        } else if (Date.now() > zeroDeadline) {
          clearInterval(zeroTimer);
          Diag.debug("details: NOT FOUND after 30s");
          Diag.set("lead", "\u26A0 I couldn't fill this form in.");
          Diag.set("sub1", "The form didn't finish loading — try " +
            "refreshing this page.");
        }
      }, 450);
      return;
    }

    // v1.0.59: the submission watch — the Safe Browsing half of
    // the FTC flow's payoff (v1.0.43). After a fill lands, this
    // watch stays on the page until Google's confirmation
    // shows, then sets the same celebration lines the FTC flow
    // uses — identical text, and the lead change pulses the
    // banner via Diag.set() (v1.0.42), so the look and behavior
    // match. Capped at ~15 minutes like the FTC watch, then
    // stands down quietly. It NEVER clicks Submit: the report
    // goes out only by the user's own click, this only notices
    // that it did.
    // v1.0.60: the trigger is the confirmation TEXT alone.
    // The v1.0.59 watch also required the report form to be
    // gone, on the theory that the SPA swaps the form for a
    // confirmation view — it doesn't. On submit Google keeps
    // the form on screen and appends a "Status of submission"
    // panel under it whose line reads "Submission was
    // successful.", a sentence the old wording net didn't
    // cover either — so the watch could never fire. The
    // matcher below leads with the text Google actually shows.
    var SB_CONFIRM_RE = /submission (was |is )?successful|submitted successfully|thank you|report (has been |was )?submitted|report received/i;
    function sbSubmissionConfirmed(text) {
      if (SB_CONFIRM_RE.test(text)) return true;
      // Google's status panel as a pair: the "Status of
      // submission" heading plus a success word anywhere in
      // the scanned text (its own line, in the observed page).
      // The heading alone says nothing about the outcome, so
      // it can't fire this by itself.
      return /status of submission/i.test(text) &&
        /success/i.test(text);
    }
    var sbWatchStarted = false, sbWatchDone = false;
    function sbVisibleText() {
      var parts = [];
      var els = document.querySelectorAll("h1, h2, h3, h4, p");
      for (var i = 0; i < els.length; i++) {
        if (!isVisible(els[i])) continue;
        var t = (els[i].textContent || "").replace(/\s+/g, " ").trim();
        if (t) parts.push(t);
      }
      // v1.0.62: Google's "Status of submission" panel is
      // div/span markup — neither of its lines lives in an
      // h1–h4 or a p, so the census above never saw the
      // confirmation and the v1.0.60 trigger still couldn't
      // fire (field retest, Oct 20). Add the page's rendered
      // text as a second source: innerText is the browser's
      // own visible-text serialization and carries the panel
      // whatever tags Google wraps it in. Overlap with the
      // census is harmless — the matcher only tests phrases.
      try {
        var bt = document.body && document.body.innerText;
        if (bt) {
          var b = bt.replace(/\s+/g, " ").trim();
          if (b) parts.push(b);
        }
      } catch (e) {}
      return parts.join("\n");
    }
    function watchSbSubmit() {
      if (sbWatchStarted) return;
      sbWatchStarted = true;
      var startedAt = Date.now();
      var sbTimer = null;
      var sbObserver = new MutationObserver(function () { check(); });
      function stopSb() {
        sbWatchDone = true;
        try { sbObserver.disconnect(); } catch (e) {}
        if (sbTimer) { clearInterval(sbTimer); sbTimer = null; }
      }
      function check() {
        if (sbWatchDone) return;
        if (Date.now() - startedAt > 15 * 60 * 1000) {
          Diag.debug("Safe Browsing: submit watch cap reached " +
            "\u2014 standing down");
          stopSb();
          return;
        }
        if (sbSubmissionConfirmed(sbVisibleText())) {
          Diag.set("lead", "\uD83C\uDF89 You did it!");
          Diag.set("sub1", "You just made the internet a better " +
            "place \u2014 every report helps protect the next " +
            "person who gets that email.");
          Diag.set("sub2", "");
          Diag.debug("Safe Browsing: submission confirmed \u2014 " +
            "watch standing down");
          stopSb();
        }
      }
      sbObserver.observe(document.documentElement, {
        childList: true, subtree: true
      });
      sbTimer = setInterval(check, 1000);
      check();
    }

    // v1.0.35: on failure the banner hands the user the link as
    // copyable text, so a form the filler can't drive is still a
    // 30-second manual job instead of a dead end.
    function fillFailed() {
      Diag.set("lead", "\u26A0 I couldn't fill this form in. " +
        "The link from your email is:");
      Diag.set("sub1", stash.urls[0]);
      Diag.set("sub2", "You can copy it into the box yourself.");
      // v1.0.59: the user may still finish this report by hand —
      // if they do, it earns the same payoff (FTC parity).
      watchSbSubmit();
    }

    Diag.debug("url field: searching…");
    Diag.set("lead", "Filling in the report form from your email…");
    var deadline = Date.now() + 30000; // poll up to ~30s for the form
    var timer = setInterval(function () {
      var urlField = findUrlField();
      if (!urlField) {
        if (Date.now() > deadline) {
          clearInterval(timer);
          Diag.debug("url field: NOT FOUND after 30s");
          fillFailed();
        }
        return;
      }
      clearInterval(timer);
      Diag.debug("url field: found via strategy " + urlFieldStrategy);
      Diag.debug("url fill: setting…");
      setVerified(urlField, stash.urls[0], function (ok) {
        if (!ok) {
          Diag.debug("url fill: set but WIPED (after retries)");
          fillFailed();
          return; // no confirmed fill — leave stash to expire
        }
        Diag.debug("url fill: set+verified");
        detailsThenSelects("always");
      });
    }, 450);
  }

  /* Public 1.0.72 release (internal build .73): the FTC
   * category auto-pick state machine — PURE, no DOM. The
   * watcher in fillFtc feeds it one plain view per pass
   * ({ tile: {selected} | null, otherSelected: bool }) and
   * it answers "click" or null. It exists because the
   * v1.0.37 one-shot click lied by omission: categoryTried
   * latched true before the search loop even ran, as soon
   * as the wizardStarted text gate passed — which can
   * happen before the category tiles render — the first
   * text match got one unverified click, and the guide
   * claimed "I already selected it if I could" whether or
   * not anything was selected. Michael's field report
   * (Nov 8 2026): most of the time the tile was NOT
   * selected and he clicked it himself. Now: retry on
   * every pass while the category step is up, latch "done"
   * only when a click of ours verifies as selected in the
   * same breath (afterClick), stand down for good when a
   * selection appears that we didn't verify (the user's
   * own hand — never override it), and give up once the
   * window (Michael's bound: three to five seconds) runs
   * out, so the guide can honestly say it couldn't.
   * guideLine() only ever states what the state proves. */
  var CAT_PICK_WINDOW_MS = 5000;
  // Public 1.0.72 release (internal build .73): the
  // sextortion category config. A sextortion report is
  // not impersonation, so its FTC tile is "Something
  // else" (Michael approved auto-picking it Nov 8 2026,
  // extending the verified impersonator pick). The
  // fallback line is the plain guide line itself: if the
  // pick never verifies inside the window, the banner
  // falls back to guide-only and never claims a pick.
  var SA_FTC_CAT_SOMETHING_ELSE = {
    autoPick: "Something else",
    pickedText: "I selected 'Something else' for you.",
    plain: "Pick 'Something else' \u2014 this one isn't " +
      "impersonating anybody.",
    picked: "I selected 'Something else' for you.",
    failed: "Pick 'Something else' \u2014 this one isn't " +
      "impersonating anybody.",
    titleRe: /something else/i
  };
  function makeCategoryAutoPick(windowMs, config) {
    var cfg = config || {};
    var plainLine = cfg.plain || "Pick 'An impersonator'.";
    var pickedLine = cfg.picked || cfg.pickedText ||
      "I selected 'An impersonator' for you.";
    var failedLine = cfg.failed ||
      "I tried to select 'An impersonator' for you " +
        "and couldn't \u2014 please click it.";
    var state = "waiting"; // waiting | trying | done | failed | user
    var engagedAt = null;
    // v1.0.76: sawOpen records that some stepped view
    // showed the group UNANSWERED (a target exists,
    // nothing selected). It is the only honest line
    // between a selection the USER made and one the
    // FORM rendered: a selection present in the very
    // first view of the group — before the group was
    // ever seen open — predates any interaction this
    // walk could have witnessed, while a selection
    // that appears after an open sighting is a hand
    // at work. Only a correctDefault machine (the
    // payment pick — see fillFtc) may act on that
    // distinction; every other machine keeps the
    // original rule untouched.
    var sawOpen = false;
    return {
      step: function (view, now) {
        if (state === "done" || state === "failed" ||
            state === "user") return null;
        if (view.tile && view.tile.selected) {
          // Selected, and not through a verified click of
          // ours (that latches in afterClick) — the user's
          // own hand. Stand down; never override it.
          state = "user";
          return null;
        }
        if (view.otherSelected) {
          // v1.0.76: a correctDefault machine facing a
          // group it has NEVER seen unanswered treats
          // the standing selection as the form's own
          // rendered default, not the user's answer,
          // and drives the target with the same
          // retry-until-verified discipline as any
          // other pick. Once the group has been seen
          // open, a selection is the user's hand —
          // stand down forever, exactly as before.
          if (cfg.correctDefault && !sawOpen && view.tile) {
            if (engagedAt === null) engagedAt = now;
            if (now - engagedAt >= windowMs) {
              state = "failed";
              return null;
            }
            state = "trying";
            return "click";
          }
          state = "user";
          return null;
        }
        if (view.tile) sawOpen = true;
        if (engagedAt === null) engagedAt = now;
        if (now - engagedAt >= windowMs) {
          state = "failed";
          return null;
        }
        state = "trying";
        return view.tile ? "click" : null;
      },
      // The caller clicks, then IMMEDIATELY re-checks the
      // tile: a selection that verifies in the same breath
      // is ours to claim. One that only shows up on a later
      // pass can't be told apart from the user's own click,
      // so step() credits it to the user instead — the
      // guide never claims a click it can't prove.
      afterClick: function (selectedNow) {
        if (selectedNow && state === "trying") state = "done";
      },
      getState: function () { return state; },
      guideLine: function () {
        if (state === "done")
          return pickedLine;
        if (state === "failed")
          return failedLine;
        return plainLine;
      }
    };
  }

  /* v1.0.74 (queued-ftc-guided-picks.md + queued-ftc-
   * question-autopicks.md, Michael's calls Nov 23 2026):
   * the QUESTION-step auto-picks. For a standard spam/phish
   * report launched from a message, three more of the
   * wizard's answers are known true before the user ever
   * sees the questions, and Michael directed the filler to
   * make them: the payment question ("Did you send the
   * scammer payment of any kind?") is No — the report is
   * about a message that arrived, not a payment that left;
   * how it started is Email — the report was launched from
   * an email; and on the details step, three of the four
   * spam checkboxes (the first two and the last — never
   * the third). A radio question is the category pick's
   * exact shape — one target option, other options the
   * user's own hand might take first — so both question
   * pickers ARE makeCategoryAutoPick machines, differing
   * only in their lines (config) and in the DOM scan that
   * feeds them (fillFtc's scanQuestionView). Every rule
   * carries over untouched: retry-until-verified inside
   * the same ~5-second window, same-breath verification
   * before any claim, stand-down forever for the user's
   * own selections, and a guide line that only states
   * what the machine proved. The payment picker's plain
   * line retires the old G_PAY parenthetical ("Only you
   * can answer this one.") for the auto-pick case — the
   * filler answers this one now; the sextortion path,
   * which never builds these pickers, keeps the coaching
   * line exactly as it was (see fillFtc). */
  var SA_FTC_PAY_NO = {
    plain: "If you didn't pay them anything, pick No.",
    picked: "I selected 'No' for you \u2014 you didn't send " +
      "them any payment.",
    failed: "I tried to select 'No' for you and " +
      "couldn't \u2014 please click it."
  };
  var SA_FTC_START_EMAIL = {
    plain: "This came by email \u2014 pick Email.",
    picked: "I selected 'Email' for you \u2014 this came " +
      "by email.",
    failed: "I tried to select 'Email' for you and " +
      "couldn't \u2014 please click it."
  };

  /* v1.0.74: the spam-checkbox picker — PURE, like the
   * category machine, but multi-target: the details step's
   * spam group is FOUR boxes and Michael's ruling checks
   * three of them (the first two and the last, in the
   * group's own order); the third is never touched. The
   * watcher feeds one view per pass ({ boxes: [checked x4]
   * } in DOM order, or null while the group isn't on
   * screen) and step() answers the indexes to click this
   * pass. Same discipline as the single-target machine:
   * a click counts only when it verifies checked in the
   * same breath (afterClick); ANY box found checked that
   * we didn't click-verify — the third included — means
   * the user is answering this group themselves, and the
   * picker stands down for good and never overrides them;
   * the window is the same ~5 seconds, and expiry with
   * targets unverified is "failed" (the boxes simply stay
   * coaching-only, like every step the filler can't
   * prove). */
  var SPAM_BOX_TARGETS = [0, 1, 3];
  function makeSpamBoxesPick(windowMs) {
    var state = "waiting"; // waiting | trying | done | failed | user
    var engagedAt = null;
    var verified = {}; // index -> true (click-verified)
    // v1.0.76: the target indexes ride in the view
    // (the DOM scan identifies them from the group's
    // REAL label texts — see spamBoxTargets) and latch
    // on the first stepped view that carries them; a
    // view without targets gets the positional ruling
    // (the first two and the last of four).
    var targets = null;
    function allVerified() {
      var t = targets || SPAM_BOX_TARGETS;
      for (var j = 0; j < t.length; j++) {
        if (!verified[t[j]]) return false;
      }
      return true;
    }
    return {
      step: function (view, now) {
        if (state === "done" || state === "failed" ||
            state === "user") return [];
        var boxes = view && view.boxes;
        if (!boxes) return [];
        if (!targets) {
          targets = (view.targets && view.targets.length)
            ? view.targets.slice() : SPAM_BOX_TARGETS.slice();
        }
        for (var k = 0; k < boxes.length; k++) {
          if (boxes[k] && !verified[k]) {
            state = "user";
            return [];
          }
        }
        if (allVerified()) { state = "done"; return []; }
        if (engagedAt === null) engagedAt = now;
        if (now - engagedAt >= windowMs) {
          state = "failed";
          return [];
        }
        state = "trying";
        return targets.filter(function (i) {
          return !boxes[i] && !verified[i];
        });
      },
      afterClick: function (idx, checkedNow) {
        if (checkedNow && state === "trying") {
          verified[idx] = true;
          if (allVerified()) state = "done";
        }
      },
      getState: function () { return state; }
    };
  }

  /* v1.0.76: spamBoxTargets(labels) — PURE: which of
   * the experience group's boxes are Michael's three,
   * judged by the labels' REAL texts. v1.0.74's DOM
   * scan collected a box only when its label mentioned
   * "spam" — a pattern written from Michael's spoken
   * paraphrase of the group ("I am getting spam I
   * cannot opt out of receiving") — but on the live
   * form only two of the four labels contain the word:
   *   1. "I am getting spam e-mails and I want them
   *      to stop"
   *   2. "I cannot opt out of receiving e-mails from
   *      this company"
   *   3. "I received an e-mail that displayed
   *      pornographic images"
   *   4. "I received a spam e-mail with a missing or
   *      misleading subject line or from address"
   * The scan therefore gathered two boxes, the
   * exactly-four guard rejected the group, and the
   * picker was never fed (Michael's field test,
   * Nov 23 2026: all four boxes sat unchecked). The
   * ruling is now textual, not positional: the
   * pornographic box is identified by its own words
   * and excluded; the other three are the targets
   * when at least two of them also match their own
   * positive patterns (getting-spam, opt-out,
   * misleading-subject) — elimination plus positive
   * confirmation. Anything less certain yields null
   * and the caller falls back to the positional
   * ruling only when no pornographic label is
   * present to be endangered by it. */
  function spamBoxTargets(labels) {
    if (!labels || labels.length !== 4) return null;
    var never = -1;
    for (var i = 0; i < labels.length; i++) {
      if (/pornographic/i.test(labels[i] || "")) {
        if (never !== -1) return null;
        never = i;
      }
    }
    if (never === -1) return null;
    var targets = [];
    var positives = 0;
    for (var j = 0; j < labels.length; j++) {
      if (j === never) continue;
      targets.push(j);
      var t = labels[j] || "";
      if (/getting spam|want them to stop/i.test(t) ||
          /cannot opt out|can'?t opt out/i.test(t) ||
          /missing or misleading subject/i.test(t)) {
        positives++;
      }
    }
    return positives >= 2 ? targets : null;
  }

  /* v1.0.75: the question scans' scoping brain — PURE,
   * like the machines above. v1.0.74's DOM scan bound a
   * question's target by climbing from its heading to
   * the first ancestor holding two or more radio inputs
   * and taking the first option inside it whose label
   * matched. On the FTC's real "Report details" step
   * several questions share one page and one wrapper, so
   * the climb landed in the SHARED container, the first
   * "No" inside it belonged to the earlier "fix a
   * problem" question, the picker clicked that radio,
   * the same-breath check verified the WRONG element,
   * and the guide claimed the payment pick while the
   * payment group itself sat untouched (Michael's field
   * test, Nov 23 2026: payment ended on Yes, and "How
   * did it start" — a <select>, not radios — sat on its
   * placeholder). These functions take a flat item list
   * in document order — headings, radios, selects, each
   * a plain descriptor the DOM scan builds (element
   * refs ride along and are ignored here) — and answer
   * in indexes into that same list, so the scoping is
   * provable without a DOM:
   *
   * ftcQuestionView(items, questionRe, optionRe): a
   * question's options are the radios in its REGION —
   * after its heading, before the next question
   * heading — narrowed to the first region radio's name
   * group (native radios in one group share a name,
   * and a name group can never span two questions).
   * The view's tile is the optionRe radio IN THAT
   * GROUP; otherSelected is another radio OF THAT
   * GROUP checked; target is the item index to click.
   * A question absent from the page yields null; a
   * question with no radios in its region yields
   * groupCount 0, and the caller may fall back to tile
   * shapes in an exclusive container, or just coach.
   *
   * ftcSelectView(items, questionRe, optionRe): finds
   * the select carrying the question's label and reads
   * it in the same view language — tile.selected when
   * the target option is already chosen, otherSelected
   * when a real non-target option is chosen (the
   * user's own hand; the machine stands down), and
   * targetValue = the value to set while the select
   * still shows its placeholder. index is the item to
   * drive. No such select yields null. */
  function ftcQuestionView(items, questionRe, optionRe) {
    var h = -1;
    for (var i = 0; i < items.length; i++) {
      if (items[i].kind === "heading" &&
          questionRe.test(items[i].text || "")) {
        h = i;
        break;
      }
    }
    var start, end;
    if (h !== -1) {
      start = h + 1;
      end = items.length;
      for (var j = h + 1; j < items.length; j++) {
        if (items[j].kind === "heading") { end = j; break; }
      }
    } else {
      // v1.0.76: no heading item carries the question —
      // its text may live in an element the item scan
      // doesn't promote to a heading. Fall back to the
      // radios' own group label (the fieldset legend /
      // radiogroup aria text the DOM scan records on
      // each radio): the region runs from the first
      // radio of the matching group to the next
      // heading or the first radio of a different
      // labelled group. This is the same association
      // the select path succeeds through (the control's
      // own label), instead of a second dependence on
      // heading-shaped markup.
      var r = -1;
      for (var g = 0; g < items.length; g++) {
        if (items[g].kind === "radio" &&
            items[g].group &&
            questionRe.test(items[g].group)) {
          r = g;
          break;
        }
      }
      if (r === -1) return null;
      start = r;
      end = items.length;
      for (var e = r + 1; e < items.length; e++) {
        if (items[e].kind === "heading") { end = e; break; }
        if (items[e].kind === "radio" &&
            items[e].group &&
            items[e].group !== items[r].group) {
          end = e;
          break;
        }
      }
    }
    var region = [];
    for (var k = start; k < end; k++) {
      if (items[k].kind === "radio") region.push(k);
    }
    var group = region;
    if (region.length && items[region[0]].name) {
      var nm = items[region[0]].name;
      group = [];
      for (var m = 0; m < items.length; m++) {
        if (items[m].kind === "radio" &&
            items[m].name === nm) group.push(m);
      }
    }
    var view = { tile: null, target: null,
      otherSelected: false, groupCount: group.length };
    for (var n = 0; n < group.length; n++) {
      var it = items[group[n]];
      if (optionRe.test(it.label || "")) {
        if (view.target === null) {
          view.target = group[n];
          view.tile = { selected: !!it.checked };
        } else if (it.checked) {
          view.tile.selected = true;
        }
      } else if (it.checked) {
        view.otherSelected = true;
      }
    }
    return view;
  }
  function ftcSelectView(items, questionRe, optionRe) {
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.kind !== "select") continue;
      if (!questionRe.test(it.label || "")) continue;
      var view = { tile: null, targetValue: null,
        otherSelected: false, index: i };
      var selText = String(it.selectedText || "")
        .replace(/\s+/g, " ").trim();
      if (optionRe.test(selText)) {
        view.tile = { selected: true };
        return view;
      }
      view.tile = { selected: false };
      var placeholder = !selText ||
        /^select\b/i.test(selText) || !it.value;
      if (!placeholder) {
        // A real option that isn't the target: the
        // user's own answer. The machine stands down.
        view.otherSelected = true;
        return view;
      }
      var opts = it.options || [];
      for (var j = 0; j < opts.length; j++) {
        if (optionRe.test(opts[j].text || "")) {
          view.targetValue = opts[j].value;
          break;
        }
      }
      return view;
    }
    return null;
  }

  /* v1.0.74: the two details-step FILLS (not picks — text
   * answers, filled the setNativeValue way and verified by
   * reading the field back, in fillFtc). Their value
   * derivations are pure and live here with the machines:
   *
   * claimedCompany(stash): who the message CLAIMS to be —
   * the From display name, which on an impersonation spam
   * is the impersonated company ("Louis Vuitton <mjf@…>"
   * claims Louis Vuitton). A bare-address From names
   * nobody and yields "" — the scammer-details company
   * box then stays blank, exactly as it does today.
   *
   * encounterDateParts(stash): the reported message's own
   * date (the panel stashes it since v1.0.74), split for
   * the wizard's date box in both shapes a date field
   * takes: ISO for a type=date input, US for a text input.
   * An absent or unparseable date yields null and the box
   * is left alone — the filler never guesses a date. */
  function claimedCompany(stash) {
    var from = String((stash && stash.from) || "");
    var m = from.match(/^\s*"?([^"<@]+?)"?\s*<[^>]+>\s*$/);
    if (!m) return "";
    var name = m[1].replace(/\s+/g, " ").trim();
    if (name.length < 2 || name.length > 60) return "";
    return name;
  }
  function encounterDateParts(stash) {
    var raw = (stash && stash.date) || "";
    if (!raw) return null;
    var d = new Date(raw);
    if (isNaN(d.getTime())) return null;
    function p2(n) { return (n < 10 ? "0" : "") + n; }
    var yyyy = String(d.getFullYear());
    var mm = p2(d.getMonth() + 1);
    var dd = p2(d.getDate());
    return { yyyy: yyyy, mm: mm, dd: dd,
      iso: yyyy + "-" + mm + "-" + dd,
      us: mm + "/" + dd + "/" + yyyy };
  }

  /* v1.0.78: the GoDaddy fill plan — PURE, like the
   * machines above. godaddyPlan(stash, reporterEmail)
   * answers, for each of the walked form's four fillable
   * boxes, the value the filler will write — or null,
   * with the reason the box must stay empty:
   *   email: the reporter's saved address (the PID lane's
   *     sa_user_email — the caller reads storage and
   *     passes it in; this segment never touches
   *     storage). A value that isn't address-shaped is
   *     no address at all: null, "nosaved". An address
   *     is NEVER invented.
   *   brand: who the message claims to be. The stash's
   *     godaddy payload carries the lib's "brand" slice
   *     (the same derivation as claimedCompany above);
   *     claimedCompany is the fallback when a payload
   *     lacks one. A bare-address From names nobody:
   *     null, "nobrand".
   *   urls: the message's links one per line, with the
   *     reported domain riding on its own line when no
   *     link already names it (godaddyUrlText). No links
   *     and no domain: null, "nolinks".
   *   description: the payload's registrarDescription
   *     text. No payload, no fill: null, "nodesc" — the
   *     guide points at the panel's copy box rather than
   *     substituting another lane's narrative.
   * The mobile checkbox and the country select are not
   * in the plan at all: the filler leaves them exactly
   * as the form presents them (the v1.0.77 walk's
   * ruling).
   *
   * godaddyOutcomeLines(plan, outcomes) — PURE: the
   * guide pane's lines from the plan and what the fill
   * pass found. Each outcome is "filled" (written and
   * verified), "already" (the box already held the
   * user's own text — left untouched), "wiped" (the
   * form wouldn't keep the value), "notfound" (no such
   * box on the page), or "skipped" (the plan had
   * nothing for it). */
  function godaddyUrlText(stash) {
    var payload = (stash && stash.godaddy) || {};
    var domain = String(payload.domain || "")
      .replace(/\s+/g, "").toLowerCase();
    var lines = [];
    var urls = (stash && stash.urls) || [];
    for (var i = 0; i < urls.length && lines.length < 10;
         i++) {
      var u = String(urls[i] || "").trim();
      if (u) lines.push(u);
    }
    if (domain) {
      var named = false;
      for (var j = 0; j < lines.length; j++) {
        var host = lines[j].replace(/^https?:\/\//i, "")
          .split(/[\/?#]/)[0].toLowerCase();
        if (host === domain ||
            host.slice(-(domain.length + 1)) ===
              "." + domain ||
            lines[j].toLowerCase() === domain) {
          named = true;
          break;
        }
      }
      if (!named) lines.push(domain);
    }
    return lines.join("\n");
  }
  function godaddyPlan(stash, reporterEmail) {
    var payload = (stash && stash.godaddy) || {};
    var plan = {};
    var em = String(reporterEmail || "").trim();
    plan.email = {
      value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)
        ? em : null,
      why: null
    };
    if (!plan.email.value) plan.email.why = "nosaved";
    var brand = String(payload.brand ||
      claimedCompany(stash || {})).trim();
    plan.brand = { value: brand || null, why: null };
    if (!plan.brand.value) plan.brand.why = "nobrand";
    var urlText = godaddyUrlText(stash || {});
    plan.urls = { value: urlText || null, why: null };
    if (!plan.urls.value) plan.urls.why = "nolinks";
    var desc = String(payload.description || "").trim();
    plan.description = { value: desc || null, why: null };
    if (!plan.description.value) {
      plan.description.why = "nodesc";
    }
    return plan;
  }
  function godaddyOutcomeLines(plan, outcomes) {
    var NAMES = {
      email: "your email address",
      brand: "the impersonated brand",
      urls: "the links",
      description: "the description"
    };
    var ORDER = ["email", "brand", "urls", "description"];
    function joinNames(keys) {
      var ns = keys.map(function (k) { return NAMES[k]; });
      if (ns.length <= 1) return ns.join("");
      return ns.slice(0, -1).join(", ") + " and " +
        ns[ns.length - 1];
    }
    function bare(k) {
      return NAMES[k].replace(/^the /, "");
    }
    var filled = [], already = [], notes = [];
    ORDER.forEach(function (k) {
      if (outcomes[k] === "filled") filled.push(k);
      else if (outcomes[k] === "already") {
        already.push(k);
      }
    });
    var allMissing = ORDER.every(function (k) {
      return outcomes[k] === "notfound";
    });
    if (allMissing) {
      return {
        lead: "\u26A0 I couldn't fill this form in.",
        sub1: "The form didn't load the way I " +
          "expected \u2014 the panel in Gmail has copy " +
          "boxes for every field, if you'd rather " +
          "paste them in.",
        sub2: ""
      };
    }
    ORDER.forEach(function (k) {
      var o = outcomes[k];
      if (o === "skipped") {
        if (k === "email") {
          notes.push("The email box is still empty " +
            "\u2014 I don't have an address saved for " +
            "you, and I never invent one. The address " +
            "you report under goes there.");
        } else if (k === "brand") {
          notes.push("The brand box is empty \u2014 the " +
            "message claimed no company name, so it's " +
            "yours to fill from the message.");
        } else if (k === "urls") {
          notes.push("The link box is empty \u2014 this " +
            "message carried no links I could find.");
        } else if (k === "description") {
          notes.push("The description box is empty " +
            "\u2014 the report text is in the copy box " +
            "in the Gmail panel.");
        }
      } else if (o === "notfound") {
        notes.push("I couldn't find the " + bare(k) +
          " box \u2014 the form may have changed; its " +
          "copy is in the panel in Gmail.");
      } else if (o === "wiped") {
        notes.push("The form wouldn't keep what I " +
          "wrote in the " + bare(k) + " box \u2014 its " +
          "copy is in the panel in Gmail.");
      }
    });
    var lead;
    if (filled.length) {
      lead = "\u2713 I filled in the GoDaddy form for " +
        "you \u2014 " + joinNames(filled) + ".";
      if (already.length) {
        lead += " " + joinNames(already) +
          " already held your text, so I left " +
          (already.length > 1 ? "them" : "it") +
          " alone.";
      }
    } else if (already.length) {
      lead = "The form already had " +
        joinNames(already) +
        " \u2014 I left your text alone.";
    } else {
      lead = "\u26A0 I couldn't fill this form in.";
    }
    return {
      lead: lead,
      sub1: notes.join(" "),
      sub2: (filled.length || already.length)
        ? "Give it a quick review, then click Submit " +
          "when you're ready \u2014 I never submit " +
          "for you."
        : ""
    };
  }

  /* v1.0.79: GoDaddy's confirmation + the hero lines —
   * PURE, like the plan above. godaddyConfirmation(text)
   * answers whether the page text is GoDaddy's
   * submission-complete state and which DCU tickets it
   * carries: the trigger is the wording Michael's live
   * test showed (Nov 23 2026) — the "Submission Complete"
   * heading and/or the sentence "Your abuse report has
   * been successfully submitted" — either one alone is
   * enough, exactly as the page pairs them. The DCU
   * numbers (the "DCU Ticket Numbers:" list, one per
   * reported URL, the bare domain included) are collected
   * in page order, duplicates dropped: a number the page
   * repeats is still one ticket. Nothing else on the
   * form page — its labels, its buttons, or this pane's
   * own fill lines — carries either trigger phrase.
   *
   * godaddyHeroLines(conf) — PURE: the hero finish's
   * three lines. A finish line, not an instruction block:
   * the checkmark headline, the ticket count when the
   * numbers parsed (a plain acceptance line when they
   * didn't), and a closing line. No line tells the user
   * to press anything — by the time these show, there is
   * nothing left to press. */
  function godaddyConfirmation(text) {
    var t = String(text || "");
    var confirmed = /submission complete/i.test(t) ||
      /abuse report has been successfully submitted/i.test(t);
    if (!confirmed) {
      return { confirmed: false, tickets: [], count: 0 };
    }
    var seen = {}, tickets = [];
    var re = /DCU\d+/g, m;
    while ((m = re.exec(t)) !== null) {
      if (!seen[m[0]]) { seen[m[0]] = true; tickets.push(m[0]); }
    }
    return { confirmed: true, tickets: tickets,
      count: tickets.length };
  }
  function godaddyHeroLines(conf) {
    var count = (conf && conf.count) || 0;
    var sub1;
    if (count === 1) {
      sub1 = "GoDaddy opened 1 DCU ticket for your report.";
    } else if (count > 1) {
      sub1 = "GoDaddy opened " + count + " DCU tickets " +
        "for your report \u2014 one for each link and the " +
        "domain itself.";
    } else {
      sub1 = "GoDaddy accepted your abuse report.";
    }
    return {
      lead: "\u2713 Filed with GoDaddy",
      sub1: sub1,
      sub2: "All done \u2014 you can close this tab."
    };
  }

  /* ---------------- FTC ReportFraud wizard ---------------- */

  function fillFtc(stash) {
    Diag.debug("FTC wizard: watching for narrative box…");
    // v1.0.35: a standing reminder under the guide line, on every
    // step until the details land — the Yes/No answers are the
    // user's own statement, and the payment one is the easiest to
    // get wrong by clicking through fast.
    var REMINDER = "Reminder: the Yes/No answers are yours \u2014 " +
      "double-check them before you submit, especially the one " +
      "about sending payment.";
    Diag.set("sub1", REMINDER);
    var filled = false;
    var watchDone = false;
    // Public 1.0.72 release (internal build .73): the
    // category auto-pick state machine (see
    // makeCategoryAutoPick above) replaces the v1.0.37
    // one-shot categoryTried latch.
    var catPick = makeCategoryAutoPick(CAT_PICK_WINDOW_MS);
    // Public 1.0.72 release (internal build .73): the
    // sextortion "Something else" picker — the SAME state
    // machine, window, click+verify, and stand-down rules,
    // aimed at the other tile (Michael approved Nov 8
    // 2026). Its guide line is G_CAT_OTHER, refreshed from
    // this picker after every pass exactly as G_CAT is
    // from catPick; on failure the line falls back to the
    // plain guide text (see SA_FTC_CAT_SOMETHING_ELSE).
    var elsePick = makeCategoryAutoPick(CAT_PICK_WINDOW_MS,
      SA_FTC_CAT_SOMETHING_ELSE);
    // Public 1.0.72 release (internal build .73), tile-
    // finder fix: the picker's terminal state gets ONE
    // diary line per walk. Until now only actual clicks
    // logged, so a picker that armed, found nothing it
    // could claim, and stood down left no trace in the
    // console — the Nov 8 2026 tile failure was invisible
    // in the diary and took a live page capture to prove.
    // Keyed on the picker instance: a session restart
    // builds a fresh machine (see the rank 0/1 reset in
    // postFillPass), which re-arms the line for the new
    // walk.
    var catPickLogged = null;
    function logCatPickTerminal() {
      if (catPickLogged === catPick) return;
      var s = catPick.getState();
      if (s !== "done" && s !== "failed" && s !== "user") {
        return;
      }
      catPickLogged = catPick;
      Diag.debug("FTC wizard: category auto-pick " +
        (s === "done" ? "picked" : "stood down") +
        " \u2014 state=" + s);
    }
    var elsePickLogged = null;
    function logElsePickTerminal() {
      if (elsePickLogged === elsePick) return;
      var s = elsePick.getState();
      if (s !== "done" && s !== "failed" && s !== "user") {
        return;
      }
      elsePickLogged = elsePick;
      Diag.debug("FTC wizard: category auto-pick " +
        (s === "done" ? "picked" : "stood down") +
        " \u2014 state=" + s);
    }

    /* v1.0.74 (queued-ftc-guided-picks.md): the question
     * auto-picks — the payment No and the how-it-started
     * Email (category machines with question configs), the
     * spam-checkbox picker, and the two details-step fills'
     * states. SCOPE GATE (the spec's hard rule): NONE of
     * these exist on the sextortion path — a sextortion
     * report can involve a real payment, so the payment
     * answer is never presumed there; the path keeps its
     * coaching lines and its own something-else picker,
     * untouched. */
    /* v1.0.76: the payment picker is built with
     * correctDefault (see makeCategoryAutoPick): for a
     * report launched from a message, "no payment was
     * sent" is known true, so a Yes the FORM rendered
     * before the walk ever saw the group unanswered is
     * a default to correct, not an answer to respect.
     * A selection appearing after an open sighting is
     * still the user's hand and stands the picker down
     * for good. */
    function newPayPick() {
      var cfg = {};
      for (var key in SA_FTC_PAY_NO) cfg[key] = SA_FTC_PAY_NO[key];
      cfg.correctDefault = true;
      return makeCategoryAutoPick(CAT_PICK_WINDOW_MS, cfg);
    }
    var payPick = stash.sextortion ? null : newPayPick();
    var startPick = stash.sextortion ? null
      : makeCategoryAutoPick(CAT_PICK_WINDOW_MS,
          SA_FTC_START_EMAIL);
    var spamPick = stash.sextortion ? null
      : makeSpamBoxesPick(CAT_PICK_WINDOW_MS);
    var dateFillState = "waiting"; // waiting | done | user
    var companyFillState = "waiting"; // waiting | done | user
    var pickLogged = {};
    function logPickTerminal(name, picker) {
      if (!picker || pickLogged[name] === picker) return;
      var s = picker.getState();
      if (s !== "done" && s !== "failed" && s !== "user")
        return;
      pickLogged[name] = picker;
      Diag.debug("FTC wizard: " + name + " auto-pick " +
        (s === "done" ? "picked" : "stood down") +
        " \u2014 state=" + s);
    }
    var startedAt = Date.now();
    var deadline = startedAt + 10 * 60 * 1000; // pre-fill hunt cap
    // v1.0.43: the watch used to END at the fill. It doesn't
    // anymore — the guide stays with the user through Back
    // presses, the review step, and the submission itself.
    // The whole watch (pre-fill hunt + post-fill states) caps
    // at ~15 minutes from here, then stops quietly.
    var watchEnd = startedAt + 15 * 60 * 1000;
    // v1.0.43: the narrative text, kept in memory at fill
    // time. The stash is still erased on that first fill (as
    // always) — this copy exists because the wizard can wipe
    // the Comments box when the user backs up and returns,
    // and the refill has to come from somewhere.
    var savedNarrative = null;

    /* v1.0.34: the banner becomes a trail guide. The wizard asks a
     * dozen questions only the user can answer; the guide line just
     * points at the right next step for whichever screen is up, so
     * nobody has to guess. It never answers a question itself. */
    // v1.0.42: no "→ Guide:" prefix anymore — the banner
    // header already says "Spam Avenger Guide" (v1.0.41), so
    // each line is just the plain instruction, capitalized.
    var G_HOME = "Click the big Report Now button to start " +
      "your report.";
    // Public 1.0.72 release (internal build .73): the
    // category guide line is STATE-AWARE now — the
    // auto-pick rewrites this var (G_CAT = catPick
    // .guideLine()) as its state resolves, so the line
    // only ever claims a selection the picker verified,
    // and admits it when the retry window runs out. The
    // old hedged line ("I already selected it if I
    // could") is deleted: it claimed effort, proved
    // nothing, and Michael's walks showed the tile
    // usually unselected underneath it.
    var G_CAT = "Pick 'An impersonator'.";
    // Public 1.0.72 release (internal build .73): a
    // sextortion report has no impersonator — nobody is
    // being impersonated — so for a sextortion stash the
    // category line points at "Something else" instead
    // (that is the FTC tile's actual label — the form has
    // no tile labeled "Other"; Michael's field catch,
    // Nov 8 2026). The impersonator tile is never picked
    // for a sextortion stash; instead elsePick auto-picks
    // the "Something else" tile with the same verified
    // machinery (Michael approved Nov 8 2026), and this
    // var is refreshed from elsePick after every pass —
    // the plain guide text below is its starting and
    // fallback state.
    var G_CAT_OTHER = "Pick 'Something else' \u2014 this one isn't " +
      "impersonating anybody.";
    /* v1.0.74: on the standard path these two lines are the
     * question pickers' own guide lines (plain before the
     * pick verifies, "I selected … for you" after, tried-
     * and-couldn't if the window expires) — the pickers
     * answer these two questions now, so the "(Only you
     * can answer this one.)" parenthetical is retired
     * here. The sextortion path has no pickers and keeps
     * both coaching lines exactly as they were. */
    var G_START = stash.sextortion
      ? "This came by email \u2014 pick Email."
      : startPick.guideLine();
    var G_PAY = stash.sextortion
      ? "If you didn't pay them anything, pick No. " +
        "(Only you can answer this one.)"
      : payPick.guideLine();
    var G_DETAILS = "Keep clicking Continue \u2014 I'll drop " +
      "your case details into the big box when it shows up.";
    // v1.0.43: the review step gets its own line, pre- and
    // post-fill — it's the last thing the user sees before
    // the report goes out.
    var G_REVIEW = "Last step \u2014 give it a once-over, " +
      "then hit Submit.";
    // v1.0.47: the wizard's final step — contact details and
    // the big Submit button, no Continue — gets its own line
    // (it used to fall into the homepage branch; see
    // updateGuide).
    var G_SUBMIT = "Last step \u2014 hit Submit when " +
      "you're ready.";
    var guideLine = "";
    function setGuide(line) {
      if (line === guideLine) return;
      guideLine = line;
      Diag.set("lead", line);
    }
    // v1.0.35: once the narrative lands, the guide + reminder are
    // replaced by a confirmation and one last check-your-answers
    // note (this supersedes v1.0.34's G_DONE guide line).
    // v1.0.43: those three lines are now the "filled" post-fill
    // state, applied through showPostState() — at the fill, and
    // again whenever the user is back on the comments step with
    // the text in place.
    // Public 1.0.72 release (internal build .73): the filled
    // line must not claim a phishing link when the stash
    // held zero URLs (the Nov 8 2026 sextortion walk: the
    // banner claimed a link the message never had). With
    // URLs the wording stands; without, it credits the
    // sender details only.
    var FILLED_LEAD = (stash.urls && stash.urls.length)
      ? "\u2713 I filled in the Comments box below " +
        "for you \u2014 the phishing link plus the sender details " +
        "from the email."
      : "\u2713 I filled in the Comments box below " +
        "for you \u2014 the sender details from the email.";
    var FILLED_SUB1 = "That's the evidence the FTC needs, dug " +
      "out of the email so you don't have to hunt for it.";
    var FILLED_SUB2 = "Before you submit: make sure the Yes/No " +
      "answers are right \u2014 they're your words to the FTC.";
    function fillDone() {
      showPostState("filled", FILLED_LEAD, FILLED_SUB1, FILLED_SUB2);
      // v1.0.42: the lead change above pulses the banner via
      // Diag.set() — the fill may have landed while the user
      // was scrolled down at the Comments box, and the pulse
      // is what gets the change noticed.
    }
    // v1.0.47: the payoff, shared by both watch modes. The
    // submitted state used to exist only in the post-fill
    // pass — a walk whose fill never landed reached the
    // FTC's confirmation page in pre-fill guide mode, which
    // had no celebration to give. The watch stands down
    // here; the banner watchdog keeps the banner rendered.
    // (CONGRATS_* are defined with the post-fill texts
    // further down; they're assigned when fillFtc starts,
    // before the watch's first pass.)
    function celebrate() {
      guideLine = CONGRATS_LEAD;
      Diag.set("lead", CONGRATS_LEAD);
      Diag.set("sub1", CONGRATS_SUB1);
      Diag.set("sub2", "");
      Diag.debug("FTC wizard: submission confirmed \u2014 " +
        "watch standing down");
      stopAll();
    }

    // v1.0.43: post-fill banner states, deduped by key. The
    // throttled observer re-evaluates the page constantly; only
    // a genuine state transition should re-set the banner (and
    // pulse it, via the lead change in Diag.set()).
    var postState = "";
    // v1.0.45: lastStableState is the most recent STABLE
    // post-fill state — "filled" (the comments step) or
    // "review" — recorded centrally in showPostState below,
    // before its dedupe check, so it tracks where the user
    // genuinely was even when the banner didn't need to
    // change. The "back" state may only engage out of one of
    // those two states (see postFillPass). Cleared on a
    // session reset.
    var lastStableState = "";
    // backStreak counts consecutive post-fill passes meeting
    // ALL the "back" conditions in postFillPass: the banner
    // only switches once they hold twice in a row, so a
    // single transition frame can't trip it.
    var backStreak = 0;
    function showPostState(key, lead, sub1, sub2) {
      if (key === "filled" || key === "review") {
        lastStableState = key;
      }
      if (postState === key) return;
      postState = key;
      guideLine = "";
      Diag.set("lead", lead);
      Diag.set("sub1", sub1);
      Diag.set("sub2", sub2);
    }
    // Visible text of the page's headings and labels — that's where
    // the wizard puts its questions. (The banner itself is none of
    // these tags, so the guide can't trip over its own words.)
    function guideScanText() {
      var parts = [];
      var els = document.querySelectorAll(
        "h1, h2, h3, h4, legend, label");
      for (var i = 0; i < els.length; i++) {
        if (!isVisible(els[i])) continue;
        var t = (els[i].textContent || "").replace(/\s+/g, " ").trim();
        if (t) parts.push(t);
      }
      return parts.join("\n");
    }
    function anyVisibleText(re, tags) {
      var els = document.querySelectorAll(tags);
      for (var i = 0; i < els.length; i++) {
        if (isVisible(els[i]) &&
            re.test((els[i].textContent || "").trim())) return true;
      }
      return false;
    }
    // Public 1.0.72 release (internal build .73): the
    // auto-pick's eyes. tileSelected() asks whether a tile
    // element is REALLY selected: its radio input checked —
    // the element itself, a label's control, the label's
    // for= target, or an input nested inside it — an
    // aria-checked=true on it or inside it, or a selected
    // class. (The wizard's tiles are USWDS radio tiles: the
    // text lives on the <label>, the truth lives on its
    // input.) scanCategoryView() folds one watcher pass
    // into the plain view the picker consumes: the
    // impersonator tile (matched by its title — see
    // tileTitle below), plus whether any OTHER
    // radio-like tile on the step is already selected —
    // the user's own pick, which the picker stands down
    // for and never overrides.
    function tileSelected(el) {
      if (!el) return false;
      if (el.checked) return true;
      if (el.getAttribute &&
          el.getAttribute("aria-checked") === "true") return true;
      var input = el.control || null;
      if (!input && el.querySelector) {
        input = el.querySelector(
          "input[type='radio'], input[type='checkbox']");
      }
      if (!input && el.htmlFor) {
        try { input = document.getElementById(el.htmlFor); }
        catch (e) {}
      }
      if (input && input.checked) return true;
      if (el.querySelector &&
          el.querySelector("[aria-checked='true']")) return true;
      var cls = (typeof el.className === "string")
        ? el.className : "";
      return /(^|\s)(selected|is-selected)(\s|$)/.test(cls);
    }
    function tileIsRadioLike(el) {
      if (el.tagName === "INPUT" &&
          (el.type === "radio" || el.type === "checkbox")) {
        return true;
      }
      if (el.getAttribute &&
          el.getAttribute("role") === "radio") return true;
      var input = el.control || null;
      if (!input && el.querySelector) {
        input = el.querySelector(
          "input[type='radio'], input[type='checkbox']");
      }
      return !!(input &&
        (input.type === "radio" || input.type === "checkbox"));
    }
    // Public 1.0.72 release (internal build .73), tile-
    // finder fix: a tile is judged by its TITLE, not its
    // whole text. Field capture (Michael, Nov 8 2026):
    // the wizard's "An impersonator" tile is a <label>
    // whose full textContent runs ~76 chars — the title
    // plus the "(ex. fake government, business, love
    // interest, grandchild)" examples the FTC folds into
    // the same label — so the old whole-text ≤40-char
    // rule threw the tile out before the name test ever
    // ran, and the clean title, sitting in a nested span
    // the scan never visits, could not save it. The
    // picker armed, never clicked, and honestly reported
    // failure on the very step it exists for. The title
    // is the element's first rendered line, cut at the
    // "(ex." examples parenthetical; the ≤40-char guard
    // and the impersonat test apply to the title alone,
    // so a big container whose long text merely buries
    // "impersonator" inside it — not as its title — is
    // still rejected exactly as before.
    function tileTitle(el) {
      var tx = String(el.innerText || el.textContent || "")
        .split("\n")[0];
      var cut = tx.search(/\(\s*ex\./i);
      if (cut !== -1) tx = tx.slice(0, cut);
      return tx.replace(/\s+/g, " ").trim();
    }
    function scanCategoryView() {
      var view = { tile: null, tileEl: null, otherSelected: false };
      // The target tile follows the stash: a sextortion
      // report aims at "Something else", everything else
      // at the impersonator tile.
      var targetRe = (typeof stash !== "undefined" &&
          stash && stash.sextortion)
        ? SA_FTC_CAT_SOMETHING_ELSE.titleRe : null;
      var tiles = document.querySelectorAll(
        "button, a, label, [role='radio'], [role='option']");
      for (var i = 0; i < tiles.length; i++) {
        var el = tiles[i];
        if (!isVisible(el)) continue;
        var title = tileTitle(el);
        var isTarget = targetRe
          ? targetRe.test(title)
          : /impersonat/i.test(title);
        if (title && title.length <= 40 && isTarget) {
          if (!view.tile) {
            view.tile = { selected: tileSelected(el) };
            view.tileEl = el;
          } else if (tileSelected(el)) {
            view.tile.selected = true;
          }
        } else if (!view.otherSelected && tileIsRadioLike(el) &&
            tileSelected(el)) {
          view.otherSelected = true;
        }
      }
      return view;
    }

    /* v1.0.75: the question scans — the payment and
     * how-it-started questions, group-scoped. The pure
     * ftcQuestionView/ftcSelectView (above) do the
     * scoping; this layer only builds their item list
     * from the live page and carries out their answers.
     * scanQuestionItems walks the page once, in document
     * order, emitting: question headings (heading-ish
     * elements whose text is question-like — long enough
     * and carrying a "?"), native radios (each resolved
     * to its label for the words and its name for the
     * group), and selects (label, options, current
     * choice). A label only claims a radio when its
     * title is option-short (the ≤40-char convention): a
     * long label is a question heading that happens to
     * point at a control, never an option's name.
     * scanQuestionView reads the view out of the item
     * list; only when a question's region holds NO
     * native radios does it fall back to the tile scan,
     * and then only inside an EXCLUSIVE container —
     * questionContainer now refuses any container that
     * also holds another question's heading, because a
     * bigger ancestor would hold it too (that shared
     * wrapper was the v1.0.74 trap). A question whose
     * options render in some other shape simply yields
     * no target — the machine waits out its window and
     * the step stays coaching-only, like every step the
     * filler can't prove. */
    function scanQuestionItems() {
      var items = [];
      function norm(s) {
        return String(s || "").replace(/\s+/g, " ").trim();
      }
      function questionLike(t) {
        return t.length >= 12 && t.indexOf("?") !== -1;
      }
      function labelControl(lab) {
        var inp = lab.control || (lab.querySelector
          ? lab.querySelector("input[type='radio']")
          : null);
        if (!inp && lab.htmlFor) {
          try {
            var ref = document.getElementById(lab.htmlFor);
            if (ref && ref.type === "radio") inp = ref;
          } catch (e) {}
        }
        return inp;
      }
      // Map each radio input to its label element first:
      // USWDS puts the input and its label side by side
      // in either order, and the label carries the words.
      var labelOf = new Map();
      var usedLabels = [];
      var labels = document.querySelectorAll("label");
      for (var li = 0; li < labels.length; li++) {
        var inp0 = labelControl(labels[li]);
        if (inp0 && !labelOf.has(inp0) &&
            tileTitle(labels[li]).length <= 40) {
          labelOf.set(inp0, labels[li]);
          usedLabels.push(labels[li]);
        }
      }
      var els = document.querySelectorAll(
        "h1, h2, h3, h4, legend, label, " +
        "input[type='radio'], select");
      var seen = [];
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (el.tagName === "SELECT") {
          if (!isVisible(el)) continue;
          var opts = [];
          for (var o = 0; o < el.options.length; o++) {
            opts.push({
              text: norm(el.options[o].textContent),
              value: el.options[o].value });
          }
          var selOpt = el.options[el.selectedIndex];
          items.push({ kind: "select",
            label: norm(controlLabel(el)),
            options: opts,
            selectedText: selOpt
              ? norm(selOpt.textContent) : "",
            value: el.value, el: el });
          continue;
        }
        if (el.tagName === "INPUT") {
          if (seen.indexOf(el) !== -1) continue;
          seen.push(el);
          var labEl = labelOf.get(el) || null;
          if (labEl && !isVisible(labEl)) continue;
          // v1.0.76: the radio's GROUP label — the
          // question as the form itself associates it
          // with the control (fieldset legend, or the
          // radiogroup wrapper's aria label). Recorded
          // on every radio so ftcQuestionView can scope
          // a group even when the question's text never
          // surfaces as a heading item.
          var grp = "";
          var fs = el.closest &&
            el.closest("fieldset, [role='radiogroup']");
          if (fs) {
            var lg = fs.querySelector &&
              fs.querySelector("legend");
            if (lg) grp = norm(lg.textContent);
            if (!grp && fs.getAttribute) {
              var alb = fs.getAttribute("aria-labelledby");
              if (alb) {
                try {
                  var gref = document.getElementById(
                    alb.split(/\s+/)[0]);
                  if (gref) grp = norm(gref.textContent);
                } catch (e) {}
              }
              if (!grp) {
                grp = norm(fs.getAttribute("aria-label") || "");
              }
            }
          }
          items.push({ kind: "radio",
            name: el.name || "",
            group: grp,
            label: labEl ? tileTitle(labEl)
              : norm(el.getAttribute("aria-label") || ""),
            checked: !!el.checked,
            el: labEl || el, input: el });
          continue;
        }
        // Heading-ish elements and labels: a label that
        // claimed a radio was already emitted with it;
        // anything else counts only as a question
        // heading, by its words.
        if (usedLabels.indexOf(el) !== -1) continue;
        if (!isVisible(el)) continue;
        var t = norm(el.textContent);
        if (questionLike(t)) {
          items.push({ kind: "heading", text: t, el: el });
        }
      }
      return items;
    }
    function foreignQuestion(box, ownHead) {
      var heads = box.querySelectorAll(
        "h1, h2, h3, h4, legend, label");
      for (var i = 0; i < heads.length; i++) {
        if (heads[i] === ownHead) continue;
        var t = (heads[i].textContent || "")
          .replace(/\s+/g, " ").trim();
        if (t.length >= 12 && t.indexOf("?") !== -1) {
          return true;
        }
      }
      return false;
    }
    function questionContainer(questionRe) {
      var heads = document.querySelectorAll(
        "h1, h2, h3, h4, legend, label");
      for (var i = 0; i < heads.length; i++) {
        if (!isVisible(heads[i])) continue;
        var t = (heads[i].textContent || "")
          .replace(/\s+/g, " ").trim();
        if (!questionRe.test(t)) continue;
        var node = heads[i];
        for (var up = 0; up < 5 && node; up++) {
          var inputs = node.querySelectorAll
            ? node.querySelectorAll(
                "input[type='radio'], input[type='checkbox']")
            : [];
          if (inputs.length >= 2) {
            // v1.0.75: never hand back a container that
            // also holds another question's heading —
            // climbing higher only holds it too, so the
            // honest answer is no container at all.
            return foreignQuestion(node, heads[i])
              ? null : node;
          }
          node = node.parentElement;
        }
        return null;
      }
      return null;
    }
    function scanQuestionView(questionRe, optionRe) {
      var view = { tile: null, tileEl: null,
        tileInput: null, otherSelected: false };
      var items = scanQuestionItems();
      var res = ftcQuestionView(items, questionRe,
        optionRe);
      if (res) {
        view.tile = res.tile;
        view.otherSelected = res.otherSelected;
        if (res.target !== null) {
          view.tileEl = items[res.target].el;
          view.tileInput = items[res.target].input;
        }
        if (res.groupCount > 0) return view;
      }
      // No native radios in the question's region: the
      // tile-shaped fallback, in an exclusive container
      // only (see questionContainer's v1.0.75 guard).
      var box = questionContainer(questionRe);
      if (!box) return view;
      var els = box.querySelectorAll(
        "button, a, label, [role='radio'], [role='option']");
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (!isVisible(el)) continue;
        var title = tileTitle(el);
        if (title && title.length <= 40 &&
            optionRe.test(title)) {
          if (!view.tile) {
            view.tile = { selected: tileSelected(el) };
            view.tileEl = el;
          } else if (tileSelected(el)) {
            view.tile.selected = true;
          }
        } else if (!view.otherSelected &&
            tileIsRadioLike(el) && tileSelected(el)) {
          view.otherSelected = true;
        }
      }
      return view;
    }
    function runRadioPick(picker, questionRe, optionRe,
        applyLine) {
      var view = scanQuestionView(questionRe, optionRe);
      // Stepped even with no target in view: the question
      // is up (the caller gated on its text) and the
      // option may render late — the machine's window
      // covers exactly that case.
      var action = picker.step(view, Date.now());
      if (action === "click" && view.tileEl) {
        try { view.tileEl.click(); } catch (e) {}
        // v1.0.75: verify against the target group's own
        // input when the scan resolved one. v1.0.74
        // verified the clicked element's selected look,
        // which is exactly how a click on the WRONG
        // group's "No" passed its same-breath check.
        // v1.0.76: verify against a FRESH scan of the
        // group first — a framework that re-renders on
        // click replaces the input node, and the
        // captured node's checked state can lag or lie
        // about the live group. The captured input
        // remains the fallback when the fresh scan
        // finds no tile to read.
        var fresh = scanQuestionView(questionRe, optionRe);
        picker.afterClick(fresh.tile
          ? !!fresh.tile.selected
          : (view.tileInput
            ? !!view.tileInput.checked
            : tileSelected(view.tileEl)));
        Diag.debug("FTC wizard: question auto-pick " +
          "clicked; state=" + picker.getState());
      }
      applyLine(picker.guideLine());
    }

    /* v1.0.75: the how-it-started pick — the real form
     * renders this question as a <select> (placeholder
     * "Select", Email among the options), which the
     * radio picker hunted in vain through all of
     * v1.0.74. When a select carries the question's
     * label, drive IT: setNativeValue to the Email
     * option, then verify the selection stuck by
     * reading the select back, through the same picker
     * machine and the same stand-down rules (a real
     * non-Email choice is the user's own hand). When no
     * select carries the label, fall back to the radio
     * pick — a rendering that uses radios gets exactly
     * the v1.0.74 help, now group-scoped. */
    function runStartPick() {
      var questionRe = /how did it start|how did they contact|how were you contacted/i;
      var optionRe = /^e-?mail$/i;
      var items = scanQuestionItems();
      var res = ftcSelectView(items, questionRe, optionRe);
      if (!res) {
        runRadioPick(startPick, questionRe, optionRe,
          function (line) { G_START = line; });
        logPickTerminal("started", startPick);
        return;
      }
      var view = { tile: res.tile,
        otherSelected: res.otherSelected };
      var action = startPick.step(view, Date.now());
      if (action === "click" &&
          res.targetValue !== null) {
        var sel = items[res.index].el;
        try {
          setNativeValue(sel, res.targetValue);
        } catch (e) {}
        var opt = sel.options[sel.selectedIndex];
        startPick.afterClick(!!opt && optionRe.test(
          (opt.textContent || "")
            .replace(/\s+/g, " ").trim()));
        Diag.debug("FTC wizard: started auto-pick set " +
          "the select; state=" + startPick.getState());
      }
      G_START = startPick.guideLine();
      logPickTerminal("started", startPick);
    }

    /* v1.0.74: the spam-checkbox scan — the details step's
     * four spam boxes, in DOM order. Anything short of
     * exactly four is not the group Michael ruled on, and
     * the picker is never fed a partial or foreign group.
     * v1.0.76: the group is found by its HEADING ("Did
     * you experience any of the following?") and the
     * targets are identified by the boxes' REAL label
     * texts (spamBoxTargets). v1.0.74 collected a box
     * only when its label mentioned "spam" — but on the
     * live form only two of the four labels do (the
     * opt-out and pornographic boxes never say the
     * word), so the scan gathered two boxes, the
     * exactly-four guard rejected the group, and the
     * picker was never fed at all. */
    function experienceScope() {
      var heads = document.querySelectorAll(
        "h1, h2, h3, h4, legend, label, [class*='label']");
      for (var i = 0; i < heads.length; i++) {
        var hd = heads[i];
        if (!isVisible(hd)) continue;
        var t = (hd.textContent || "")
          .replace(/\s+/g, " ").trim();
        if (!/did you experience any of the following/i
            .test(t)) continue;
        var fs = hd.closest && hd.closest("fieldset");
        if (fs) return fs;
        var node = hd;
        for (var up = 0; up < 6 && node; up++) {
          node = node.parentElement;
          if (!node || !node.querySelectorAll) break;
          if (node.querySelectorAll(
              "input[type='checkbox']").length >= 4) {
            return node;
          }
        }
        return null;
      }
      return null;
    }
    function scanSpamBoxes() {
      function norm(s) {
        return String(s || "").replace(/\s+/g, " ").trim();
      }
      var all = [];
      var inputs = document.querySelectorAll(
        "input[type='checkbox']");
      for (var i = 0; i < inputs.length; i++) {
        var inp = inputs[i];
        var lab = null;
        if (inp.id) {
          try {
            lab = document.querySelector(
              'label[for="' + inp.id + '"]');
          } catch (e) {}
        }
        if (!lab && inp.closest) lab = inp.closest("label");
        if (lab && !isVisible(lab)) continue;
        all.push({ el: lab || inp, input: inp,
          label: lab ? norm(lab.textContent)
            : norm(inp.getAttribute("aria-label") || ""),
          checked: !!inp.checked });
      }
      var group = null;
      var scope = experienceScope();
      if (scope) {
        group = all.filter(function (b) {
          return scope.contains(b.input);
        });
      }
      if (!group || group.length !== 4) {
        var union = all.filter(function (b) {
          return /spam|opt out|pornographic|misleading/i
            .test(b.label);
        });
        group = union.length === 4 ? union : null;
      }
      if (!group) return null;
      var labels = group.map(function (b) { return b.label; });
      var targets = spamBoxTargets(labels);
      if (!targets) {
        // Positional fallback (the first two and the
        // last) — only when no pornographic label rides
        // in the group to be endangered by position.
        for (var p = 0; p < labels.length; p++) {
          if (/pornographic/i.test(labels[p])) return null;
        }
        targets = [0, 1, 3];
      }
      return { boxes: group, targets: targets };
    }
    function runSpamBoxes() {
      if (!spamPick) return;
      var found = scanSpamBoxes();
      if (!found) return;
      var boxes = found.boxes;
      var view = { boxes: boxes.map(function (b) {
        return b.checked;
      }), targets: found.targets };
      var toClick = spamPick.step(view, Date.now());
      for (var i = 0; i < toClick.length; i++) {
        var idx = toClick[i];
        try { boxes[idx].el.click(); } catch (e) {}
        spamPick.afterClick(idx,
          !!boxes[idx].input.checked ||
            tileSelected(boxes[idx].el));
      }
      if (toClick.length) {
        Diag.debug("FTC wizard: spam-box auto-pick " +
          "clicked " + toClick.join(",") + "; state=" +
          spamPick.getState());
      }
      logPickTerminal("spam-boxes", spamPick);
    }

    /* v1.0.74: the details-step fills. findLabeledInput is
     * the narrative hunt's discipline narrowed to ONE
     * control: the first visible text-ish control whose
     * label (controlLabel's walk) matches. It is only ever
     * called with the encounter-date and claimed-company
     * patterns — the reporter's own-details section (name,
     * email, age, military status) is never searched for,
     * never filled: Michael weighed pre-filling it from
     * the addon's saved identity and reversed it Nov 23
     * 2026 ("don't bother"). A fill writes through
     * setNativeValue and counts only when the value reads
     * back; a box the user already answered is theirs and
     * is never overwritten. */
    function findLabeledInput(labelRe) {
      var inputs = document.querySelectorAll(
        "input, select, textarea");
      for (var i = 0; i < inputs.length; i++) {
        var el = inputs[i];
        if (!isVisible(el)) continue;
        if (el.tagName === "INPUT" &&
            (el.type === "hidden" || el.type === "radio" ||
             el.type === "checkbox" ||
             el.type === "submit" || el.type === "button" ||
             el.type === "file")) continue;
        if (labelRe.test(controlLabel(el))) return el;
      }
      return null;
    }
    function runDetailFills() {
      if (dateFillState === "waiting") {
        var parts = encounterDateParts(stash);
        if (parts) {
          var dEl = findLabeledInput(
            /when did you encounter|encounter the scam/i);
          if (dEl) {
            var want = dEl.type === "date"
              ? parts.iso : parts.us;
            var cur = String(dEl.value || "").trim();
            if (cur === want) {
              dateFillState = "done";
            } else if (cur) {
              dateFillState = "user";
            } else {
              setNativeValue(dEl, want);
              if (String(dEl.value || "").trim() === want) {
                dateFillState = "done";
                Diag.debug("FTC wizard: encounter date " +
                  "filled \u2014 " + want);
              }
            }
          }
        }
      }
      if (companyFillState === "waiting") {
        var company = claimedCompany(stash);
        if (company) {
          var cEl = findLabeledInput(
            /pretend|impersonat|company or organization/i);
          if (cEl) {
            var curC = String(cEl.value || "").trim();
            if (curC === company) {
              companyFillState = "done";
            } else if (curC) {
              companyFillState = "user";
            } else {
              setNativeValue(cEl, company);
              if (String(cEl.value || "").trim() ===
                  company) {
                companyFillState = "done";
                Diag.debug("FTC wizard: claimed company " +
                  "filled \u2014 " + company);
              }
            }
          }
        }
      }
    }
    /* v1.0.76: the question picks and the details fills
     * as one step, callable from BOTH watch modes.
     * v1.0.74 ran them only inside the pre-fill pass,
     * immediately before the narrative fill — but the
     * narrative lives on the SAME composite "Report
     * details" page as the questions, so the fill
     * landed in the very pass that first stepped the
     * pickers, the watch flipped to post-fill mode, and
     * the pickers' ~5-second retry window collapsed
     * into a single scan: any first-pass miss (a
     * half-rendered step, a group the scan couldn't
     * scope yet, a default the machine stood down for)
     * was permanent for the whole walk. The post-fill
     * pass now keeps stepping them while the composite
     * page is up (see postFillPass), restoring the
     * window the machines were designed around. Each
     * piece still self-gates on its step's own signals,
     * exactly as in the pre-fill pass. */
    function runQuestionPicks() {
      var qText = guideScanText();
      if (!wizardStarted(qText)) return;
      if (payPick &&
          /did you send|did you pay|payment of any kind|how much money/i
            .test(qText)) {
        runRadioPick(payPick,
          /did you send|payment of any kind/i, /^no$/i,
          function (line) { G_PAY = line; });
        logPickTerminal("payment", payPick);
      }
      if (startPick &&
          /how did it start|how did they contact|how were you contacted/i
            .test(qText)) {
        // The started pick drives the question's
        // <select> when it has one (the real form
        // does), falling back to radios.
        runStartPick();
      }
      runSpamBoxes();
      runDetailFills();
    }
    // Has the wizard actually started? Its telltales: the
    // "common problems" category heading, or a visible Continue
    // button (every wizard step carries one). Until one of those
    // is on screen the user is still on the ReportFraud homepage
    // (or an in-between frame of it loading), no matter what else
    // the page contains.
    function wizardStarted(t) {
      return /common problems/i.test(t) ||
        anyVisibleText(/continue/i, "button, a, [role='button']");
    }
    // v1.0.43: visible paragraph text, in addition to the
    // heading/label scan — the FTC's confirmation screen puts
    // its thank-you and report-number lines in body paragraphs,
    // not just headings.
    function paragraphText() {
      var parts = [];
      var els = document.querySelectorAll("p");
      for (var i = 0; i < els.length; i++) {
        if (!isVisible(els[i])) continue;
        var t = (els[i].textContent || "").replace(/\s+/g, " ").trim();
        if (t) parts.push(t);
      }
      return parts.join("\n");
    }
    // The FTC's own words once a report has gone through.
    var CONFIRM_RE = /thank you|has been submitted|report (number|#)|we received your report|submission (received|complete)/i;
    // v1.0.47: the submitted state in the FTC's exact
    // confirmation-page words ("Report submitted! Thank you
    // for helping…", the "Report Number" box) — the check
    // BOTH watch modes share. CONFIRM_RE above remains the
    // post-fill pass's broader net, OR'd in alongside.
    var SUBMITTED_RE = /report submitted|thank you for helping|report number/i;
    function isSubmitted(t, p) {
      return SUBMITTED_RE.test(t) || SUBMITTED_RE.test(p);
    }
    // The earlier-step screens, recognized by their text — the
    // same signals the guide keys on — split by step rank for
    // the v1.0.44 post-fill gating: the category step is rank 1,
    // the question steps (how it started, payment) are rank 2.
    var CATEGORY_RE = /common problems/i;
    var QUESTION_RE = /did you send|did you pay|payment of any kind|how much money|how did it start|how did they contact|how were you contacted/i;
    function hasSubmitControl() {
      return anyVisibleText(/submit/i, "button, a, [role='button']");
    }
    // v1.0.47: the wizard's final step — a control whose text
    // STARTS with "Submit" (the contact page's big "Submit →";
    // anchored so progress labels and stray links don't
    // count) with actual form fields on screen alongside it.
    function submitStepUp() {
      if (!anyVisibleText(/^\s*submit\b/i,
          "button, a, [role='button']")) return false;
      var fields = document.querySelectorAll(
        "input, select, textarea");
      for (var i = 0; i < fields.length; i++) {
        if (isVisible(fields[i])) return true;
      }
      return false;
    }
    // v1.0.47: the wizard's progress track (Start … Submit /
    // Submitted) — positive proof the user is INSIDE the
    // wizard. Looked for on progress-flavored elements and
    // their near ancestors, whose combined text carries both
    // end labels; kept narrow so the scan stays cheap.
    function progressUp() {
      var els = document.querySelectorAll(
        "[role='progressbar'], [class*='progress'], " +
        "[class*='step']");
      for (var i = 0; i < els.length; i++) {
        var node = els[i];
        for (var up = 0; up < 3 && node; up++) {
          var tx = (node.textContent || "")
            .replace(/\s+/g, " ").trim();
          if (tx.length <= 80 && /\bstart\b/i.test(tx) &&
              /\bsubmit/i.test(tx)) return true;
          node = node.parentElement;
        }
      }
      return false;
    }

    function updateGuide() {
      var t = guideScanText();
      // v1.0.47 priority: confirmation → review → submit
      // step → payment → how-it-started → category →
      // homepage → fallback. Two structural breaks with the
      // v1.0.37 homepage-first order:
      //
      // (1) The submitted state is checked FIRST, here in
      // pre-fill mode too — it used to live only in the
      // post-fill pass, so a hand-walked submission (fill
      // never landed) reached the confirmation page with no
      // celebration to give.
      //
      // (2) The homepage line is no longer the fate of
      // anything wizardStarted() can't see. That test is
      // false on the wizard's own late pages — the final
      // step has a Submit button and no Continue — and the
      // old order sent those pages to "Click the big Report
      // Now button." Now Report Now needs POSITIVE
      // evidence: the homepage hero or a Report Now control
      // on screen, AND no wizard progress track up. A page
      // that merely lacks Continue/category signals falls
      // through to the generic details line. The step lines
      // no longer gate on wizardStarted either — except
      // the category line's impersonator-TILE fallback,
      // which still does: the homepage carries
      // impersonator-flavored links of its own (the
      // v1.0.37 trap), and those must never read as the
      // category step. The category HEADING test needs no
      // gate: "common problems" only heads the wizard's
      // first step.
      if (isSubmitted(t, paragraphText())) {
        celebrate();
        return;
      }
      if (/review/i.test(t) && hasSubmitControl()) {
        // The review step — the last screen before the
        // report goes out. Checked before the question
        // lines: a review page repeats the earlier questions
        // and answers, and could trip them.
        setGuide(G_REVIEW);
      } else if (submitStepUp()) {
        // v1.0.47: the final step gets its own line.
        setGuide(G_SUBMIT);
      } else if (/did you send|did you pay|payment of any kind|how much money/i
          .test(t)) {
        setGuide(G_PAY);
      } else if (/how did it start|how did they contact|how were you contacted/i
          .test(t)) {
        setGuide(G_START);
      } else if (/common problems/i.test(t) ||
          (wizardStarted(t) && anyVisibleText(/impersonat/i,
            "button, a, label, [role='radio'], [role='option']"))) {
        setGuide(stash.sextortion ? G_CAT_OTHER : G_CAT);
      } else if ((/report to help fight fraud/i.test(t) ||
          anyVisibleText(/report now/i,
            "button, a, [role='button']")) && !progressUp()) {
        setGuide(G_HOME);
      } else {
        setGuide(G_DETAILS);
      }
    }

    // v1.0.43: the post-fill pass — runs on the same observer
    // after the narrative has landed. Priority: the FTC's
    // confirmation screen first (the payoff), then the comments
    // step (refilling from memory if the wizard wiped the box),
    // then the review step, then an earlier step or the
    // homepage (Back was pressed). Anything else leaves the
    // banner exactly as it stands.
    // v1.0.44: the "back" state is rank-gated (see the header
    // note): each pass ranks what it sees, and "back" requires
    // the current rank to sit below the highest rank reached
    // since the fill, on 2 consecutive passes. Forward motion
    // and flicker can no longer trip it.
    // v1.0.45: between the review branch and the "back" check
    // sits the session reset — rank 0 or 1 in post-fill mode
    // means a new report session, handled instantly (see the
    // header note) — and the "back" check itself is keyed on
    // the DOM (textarea existence), not on text ranks.
    var BACK_LEAD = "Went back a step? No problem \u2014 " +
      "nothing's lost.";
    var BACK_SUB1 = "Your answers and your filled details " +
      "stay put. Just click Continue forward when you're ready.";
    var CONGRATS_LEAD = "\uD83C\uDF89 You did it!";
    var CONGRATS_SUB1 = "You just made the internet a better " +
      "place \u2014 every report helps protect the next person " +
      "who gets that email.";
    function postFillPass() {
      var t = guideScanText();
      // Rank this pass, checking signals in the same priority
      // order as the states below. rank stays null on screens
      // we don't recognize (transition frames, unknown steps):
      // they never touch the banner and they break the
      // backward streak — the condition must HOLD, unbroken,
      // for 2 passes.
      // v1.0.47: the shared submitted check (isSubmitted)
      // OR'd with this pass's broader CONFIRM_RE net.
      var pText = paragraphText();
      var confirm = isSubmitted(t, pText) ||
        CONFIRM_RE.test(t) || CONFIRM_RE.test(pText);
      var box = null;
      var areas = document.querySelectorAll("textarea");
      for (var j = 0; j < areas.length; j++) {
        if (isVisible(areas[j])) { box = areas[j]; break; }
      }
      var reviewUp = /review/i.test(t) && hasSubmitControl();
      var continueUp = anyVisibleText(/continue/i,
        "button, a, [role='button']");
      var rank = null;
      if (confirm) rank = 5;
      else if (box) rank = 3;
      else if (reviewUp) rank = 4;
      else if (CATEGORY_RE.test(t)) rank = 1;
      else if (QUESTION_RE.test(t)) rank = 2;
      else if (!wizardStarted(t) ||
          (!continueUp && /report to help fight fraud/i.test(t))) {
        rank = 0;
      }
      if (confirm) {
        showPostState("done", CONGRATS_LEAD, CONGRATS_SUB1, "");
        Diag.debug("FTC wizard: submission confirmed \u2014 " +
          "watch standing down");
        stopAll();
        return;
      }
      // v1.0.76: the composite "Report details" page
      // holds its questions next to its Comments box —
      // keep stepping the question pickers there, so
      // they get their full retry window instead of the
      // single pre-fill pass (see runQuestionPicks).
      // The discriminator is the v1.0.45 one: the
      // composite page always carries its <textarea>
      // node, while a standalone questions page and the
      // review step (which repeats the question text)
      // carry none — the picks can never fire there.
      if (!stash.sextortion && payPick &&
          document.querySelector("textarea") &&
          QUESTION_RE.test(t)) {
        runQuestionPicks();
      }
      if (box) {
        if (!box.value && savedNarrative) {
          // The wizard wiped the box while the user was off on
          // an earlier step — put the narrative back from the
          // in-memory copy. Only an EMPTY box is refilled:
          // text the user typed or edited is never overwritten.
          setNativeValue(box, savedNarrative);
          Diag.debug("details: refilled from memory after Back");
        }
        backStreak = 0;
        fillDone();
        return;
      }
      if (reviewUp) {
        backStreak = 0;
        showPostState("review", G_REVIEW,
          "Your details are in the Comments section of this " +
          "report.", "");
        return;
      }
      // v1.0.45: session restart. The wizard's Back moves one
      // step at a time, so from the comments step (rank 3+)
      // the user can only land on the homepage (0) or the
      // category step (1) by starting a NEW report — and a
      // fresh walk in the same tab must not inherit this
      // session's post-fill state, or every early step of the
      // new walk reads as "backward" (the v1.0.44 false-fire
      // on plain forward walks). No streak, no debate: drop
      // back to pre-fill guide/hunt mode on the spot. The
      // coming fill uses the in-memory savedNarrative (the
      // stash is long cleared), the category auto-pick
      // re-arms (a fresh state machine, guide line back to
      // the plain instruction) so the new walk gets the
      // same impersonator-tile help as any fresh walk, and
      // the hunt deadline refreshes — the ~15-minute total
      // watch cap still bounds everything.
      if (rank === 0 || rank === 1) {
        filled = false;
        backStreak = 0;
        lastStableState = "";
        postState = "";
        catPick = makeCategoryAutoPick(CAT_PICK_WINDOW_MS);
        G_CAT = catPick.guideLine();
        elsePick = makeCategoryAutoPick(CAT_PICK_WINDOW_MS,
          SA_FTC_CAT_SOMETHING_ELSE);
        G_CAT_OTHER = elsePick.guideLine();
        // v1.0.74: the question pickers and the details
        // fills re-arm on the same reset, for the same
        // reason — the new walk gets the same help as any
        // fresh walk (standard path only; a sextortion
        // stash never built them and doesn't start now).
        if (!stash.sextortion) {
          payPick = newPayPick();
          G_PAY = payPick.guideLine();
          startPick = makeCategoryAutoPick(
            CAT_PICK_WINDOW_MS, SA_FTC_START_EMAIL);
          G_START = startPick.guideLine();
          spamPick = makeSpamBoxesPick(CAT_PICK_WINDOW_MS);
          dateFillState = "waiting";
          companyFillState = "waiting";
        }
        deadline = Date.now() + 10 * 60 * 1000;
        Diag.debug("FTC wizard: restart detected \u2014 back " +
          "to guide mode");
        Diag.set("sub1", REMINDER);
        Diag.set("sub2", "");
        updateGuide();
        return;
      }
      // v1.0.45: the "back" state, keyed on the DOM — not on
      // text ranks. The rank model (v1.0.44) can't tell this
      // wizard's steps apart: its "Report details" step is
      // ONE scrolling page where the question text and the
      // Comments textarea coexist, so any re-render pass that
      // drops the textarea out of the visible scan reads as
      // "questions right after comments" — a fake step back
      // while the user is clicking around going FORWARD.
      // The discriminator is the DOM: the composite details
      // page always carries its <textarea> node, while a
      // genuine standalone questions page has none anywhere.
      // "Back" engages only when ALL of these hold:
      //   (a) question-step signals are on screen;
      //   (b) NO <textarea> exists anywhere in the DOM
      //       (querySelector, regardless of visibility);
      //   (c) the last stable post-fill state was the comments
      //       step ("filled") or the review step ("review");
      //   (d) (a)-(c) hold for 2 consecutive passes.
      // A textarea that exists but fails the visible-comments
      // check above (churn on the composite page) changes
      // NOTHING: the banner stays exactly as it stands and
      // the streak resets. The rank 0/1 reset above is
      // evaluated before this block, so a restart is never
      // blocked by a lingering textarea node; refills still
      // happen only in the comments branch, only into a
      // visible, empty box.
      var anyTextarea = !!document.querySelector("textarea");
      if (anyTextarea || !QUESTION_RE.test(t) ||
          (lastStableState !== "filled" &&
           lastStableState !== "review")) {
        backStreak = 0;
        return;
      }
      backStreak++;
      if (backStreak >= 2) {
        showPostState("back", BACK_LEAD, BACK_SUB1, REMINDER);
      }
    }


    function attempt() {
      if (watchDone) return;
      if (filled) {
        // v1.0.43: post-fill — the watch stays alive (see
        // postFillPass) until the ~15-minute total cap, then
        // stands down quietly, banner untouched.
        if (Date.now() > watchEnd) {
          Diag.debug("FTC wizard: watch cap reached \u2014 " +
            "standing down");
          stopAll();
          return;
        }
        postFillPass();
        return;
      }
      if (Date.now() > deadline) {
        // v1.0.47: even at the buzzer, a submitted report
        // gets its celebration — the confirmation state
        // outranks the not-found warning too.
        if (isSubmitted(guideScanText(), paragraphText())) {
          celebrate();
          return;
        }
        Diag.debug("details: NOT FOUND (wizard watched 10 min)");
        Diag.set("sub1", "\u26A0 I couldn't spot the Comments box. " +
          "If you reach it, you can paste the case details from " +
          "the panel in Gmail.");
        stopAll();
        return;
      }
      updateGuide();
      if (watchDone) return; // updateGuide may have celebrated

      // Best effort: if the first-step category tiles are up
      // and one plainly says "impersonator", pick it — these
      // phish almost always pretend to be a real company or
      // agency.
      // v1.0.37: only once the wizard's category step is
      // actually on screen (the wizardStarted gate, plus the
      // category heading or the tile itself in view) — the
      // homepage has impersonator-flavored links too, and
      // clicking one would yank the user somewhere they
      // didn't ask to go.
      // Public 1.0.72 release (internal build .73): the
      // one-shot click is now the makeCategoryAutoPick
      // state machine (see its note above): this block runs
      // on EVERY pass while the category step is up, feeds
      // the picker the pass's view, clicks when it says
      // "click", and verifies the click in the same breath
      // via afterClick — retries, a ~5-second bound, a
      // stand-down for the user's own picks, and a guide
      // line (G_CAT, refreshed from the picker below) that
      // only states what the picker proved. Never for a
      // sextortion stash — nobody is being impersonated;
      // its category is "Something else" (see G_CAT_OTHER
      // above).
      if (!stash.sextortion) {
        var catText = guideScanText();
        if (wizardStarted(catText)) {
          var catView = scanCategoryView();
          if (CATEGORY_RE.test(catText) || catView.tile) {
            var catAction = catPick.step(catView, Date.now());
            if (catAction === "click" && catView.tileEl) {
              try { catView.tileEl.click(); } catch (e) {}
              catPick.afterClick(tileSelected(catView.tileEl));
              Diag.debug("FTC wizard: category auto-pick " +
                "clicked; state=" + catPick.getState());
            }
            logCatPickTerminal();
            G_CAT = catPick.guideLine();
          }
        }
      } else {
        // Sextortion: the same verified pick, aimed at
        // the "Something else" tile (see elsePick above).
        // G_CAT_OTHER follows the picker after every
        // pass, so the guide claims the pick only once
        // a click of ours verifies, and falls back to
        // the plain guide line if the window runs out.
        var elseText = guideScanText();
        if (wizardStarted(elseText)) {
          var elseView = scanCategoryView();
          if (CATEGORY_RE.test(elseText) || elseView.tile) {
            var elseAction = elsePick.step(elseView, Date.now());
            if (elseAction === "click" && elseView.tileEl) {
              try { elseView.tileEl.click(); } catch (e) {}
              elsePick.afterClick(tileSelected(elseView.tileEl));
              Diag.debug("FTC wizard: category auto-pick " +
                "clicked; state=" + elsePick.getState());
            }
            logElsePickTerminal();
            G_CAT_OTHER = elsePick.guideLine();
          }
        }
      }

      // v1.0.74 (queued-ftc-guided-picks.md): the question
      // auto-picks and the details-step fills, on the
      // standard path only (the pickers don't exist for a
      // sextortion stash — see their declarations). Runs
      // BEFORE the narrative fill below on purpose: the
      // narrative fill ends the pre-fill watch, so the
      // details step's own picks and fills (the spam
      // boxes, the encounter date, the claimed company)
      // must land on this same pass. Each piece self-gates
      // on its step's own signals, exactly like the
      // category pick: the radio pickers step only while
      // their question's text is up; the box picker only
      // ever sees a group of exactly four; the fills only
      // ever touch their two labeled boxes.
      // v1.0.76: "this same pass" proved to be the trap
      // — one pass is one scan, and a miss was forever.
      // The step is extracted (runQuestionPicks) and the
      // post-fill pass keeps stepping it while the
      // composite details page is up.
      if (!stash.sextortion) {
        runQuestionPicks();
      }

      // The must-have: when the wizard reaches its narrative/details
      // step, fill the textarea with the case summary.
      var areas = document.querySelectorAll("textarea");
      for (var j = 0; j < areas.length; j++) {
        if (isVisible(areas[j]) && !areas[j].value) {
          // v1.0.43: keep the exact text in memory BEFORE the
          // stash is erased — the post-fill watch refills from
          // this copy if the wizard wipes the box later.
          // v1.0.45: after a session reset the stash is already
          // gone, so an existing in-memory copy IS the payload
          // (same case, same text) — only compute from the
          // stash when there is no copy yet.
          savedNarrative = savedNarrative ||
            detailsText(stash, 3000);
          setNativeValue(areas[j], savedNarrative);
          filled = true;
          // The fill lands on the comments step: fillDone()
          // (just below) applies the "filled" state, which
          // showPostState records as the stable state the
          // post-fill "back" rule keys on.
          Diag.debug("details: set (narrative filled)");
          fillDone();
          clearStash();
          // NOT stopAll() — v1.0.43 keeps the observer running
          // for the post-fill states (Back, review, submitted).
          return;
        }
      }
    }

    var lastRun = 0;
    var observer = new MutationObserver(function () {
      var now = Date.now();
      if (now - lastRun < 250) return; // wizard pages mutate a lot
      lastRun = now;
      attempt();
    });
    function stopAll() {
      watchDone = true;
      try { observer.disconnect(); } catch (e) {}
    }
    observer.observe(document.documentElement, {
      childList: true, subtree: true
    });
    attempt(); // the step might already be on screen
    setTimeout(stopAll, 15 * 60 * 1000); // the ~15-min total cap
  }

  /* ---------------- GoDaddy phishing form ---------------- */

  // v1.0.78: the fill pass for legalportal.godaddy.com's
  // phishing report — a plain web form, walked live Nov 23
  // 2026. Four boxes are filled, found by their labels (the
  // same findField/controlLabel machinery the other lanes
  // use): "Your Email Address", "Company or Brand Being
  // Impersonated", "URL, Website, or Domain", "Description
  // of Issue". The "Was this viewed from a mobile device?"
  // checkbox and the country select are never queried and
  // never touched — they stay exactly as the form presents
  // them. A box that already holds text is the user's own:
  // it is left alone and reported as such (the same
  // stand-down the FTC detail fills keep). Every write goes
  // through setVerified, so a value the form wipes is
  // retried before it's called failed. The pass NEVER
  // queries a button and never submits: the user reviews
  // the filled form and clicks Submit themselves.

  // v1.0.79: the page's visible text, collected the way
  // the Safe Browsing watch learned to (v1.0.62): a
  // heading/paragraph census PLUS the rendered body text,
  // because GoDaddy's confirmation — heading, thank-you
  // and the DCU list — is div/span markup the census alone
  // can miss. The matcher only tests phrases and DCU
  // numbers, so overlap between the two sources is fine.
  function godaddyPageText() {
    var parts = [];
    var els = document.querySelectorAll("h1, h2, h3, h4, p");
    for (var i = 0; i < els.length; i++) {
      if (!isVisible(els[i])) continue;
      var t = (els[i].textContent || "")
        .replace(/\s+/g, " ").trim();
      if (t) parts.push(t);
    }
    try {
      var bt = document.body && document.body.innerText;
      if (bt) {
        var b = bt.replace(/\s+/g, " ").trim();
        if (b) parts.push(b);
      }
    } catch (e) {}
    return parts.join("\n");
  }

  // v1.0.79: the hero watch — the GoDaddy half of the
  // other lanes' payoff. A MutationObserver plus a slow
  // interval, capped at ~15 minutes like theirs: when
  // GoDaddy's confirmation wording reaches the page (the
  // user's own submit, however it navigates — a reload
  // re-runs this script and the watch's first check sees
  // the page as it stands), the pane swaps to the hero
  // finish via Diag.hero() and the watch stands down.
  // Re-armable: a call after the cap starts a fresh watch,
  // so the fill pass's hand-off is never too late. It
  // NEVER clicks anything: it only notices the report
  // went through.
  var gdHeroWatchStarted = false, gdHeroWatchDone = false;
  function watchGoDaddyHero() {
    if (gdHeroWatchStarted && !gdHeroWatchDone) return;
    gdHeroWatchStarted = true;
    gdHeroWatchDone = false;
    var startedAt = Date.now();
    var gdTimer = null;
    var gdObserver = new MutationObserver(function () { check(); });
    function stopGd() {
      gdHeroWatchDone = true;
      try { gdObserver.disconnect(); } catch (e) {}
      if (gdTimer) { clearInterval(gdTimer); gdTimer = null; }
    }
    function check() {
      if (gdHeroWatchDone) return;
      if (Date.now() - startedAt > 15 * 60 * 1000) {
        Diag.debug("GoDaddy: hero watch cap reached \u2014 " +
          "standing down");
        stopGd();
        return;
      }
      var conf = godaddyConfirmation(godaddyPageText());
      if (conf.confirmed) {
        Diag.hero(godaddyHeroLines(conf));
        Diag.debug("GoDaddy: confirmation detected \u2014 " +
          "hero flash shown (" + conf.count +
          " DCU tickets)");
        stopGd();
      }
    }
    try {
      gdObserver.observe(document.documentElement, {
        childList: true, subtree: true
      });
    } catch (e) {}
    gdTimer = setInterval(check, 1000);
    check();
  }

  function fillGoDaddy(stash, reporterEmail) {
    // v1.0.79: a confirmation already on screen means the
    // report is filed — no fill and no fill copy; the hero
    // watch owns the pane from here.
    if (godaddyConfirmation(godaddyPageText()).confirmed) {
      Diag.debug("GoDaddy: confirmation on screen at fill " +
        "start \u2014 fill standing down");
      watchGoDaddyHero();
      return;
    }
    var plan = godaddyPlan(stash, reporterEmail);
    var FIELDS = [
      { key: "email", tags: "input",
        re: /your email/i },
      { key: "brand", tags: "input",
        re: /impersonat/i },
      { key: "urls", tags: "textarea",
        re: /url, website, or domain/i },
      { key: "description", tags: "textarea",
        re: /description of issue/i }
    ];
    Diag.set("lead", "Filling in the GoDaddy form from " +
      "your email\u2026");
    Diag.debug("GoDaddy: watching for the form\u2026");

    var startedAt = Date.now();
    var filling = false;
    var timer = setInterval(function () {
      if (filling) return;
      // Proceed once every box the plan has a value for is
      // on the page — or when the wait runs out, with
      // whatever the page actually holds.
      var ready = FIELDS.every(function (f) {
        return !plan[f.key].value ||
          !!findField(f.tags, f.re);
      });
      if (!ready && Date.now() - startedAt < 30000) return;
      filling = true;
      clearInterval(timer);
      fillNext(0, {});
    }, 450);

    function fillNext(i, outcomes) {
      if (i >= FIELDS.length) { finishFill(outcomes); return; }
      var f = FIELDS[i];
      if (!plan[f.key].value) {
        outcomes[f.key] = "skipped";
        Diag.debug("GoDaddy: " + f.key + " — nothing " +
          "planned (" + (plan[f.key].why || "?") + ")");
        fillNext(i + 1, outcomes);
        return;
      }
      var el = findField(f.tags, f.re);
      if (!el) {
        outcomes[f.key] = "notfound";
        Diag.debug("GoDaddy: " + f.key + " box not found");
        fillNext(i + 1, outcomes);
        return;
      }
      if (String(el.value || "").trim()) {
        // The user's own text outranks the plan — always.
        outcomes[f.key] = "already";
        Diag.debug("GoDaddy: " + f.key + " already held " +
          "text — left alone");
        fillNext(i + 1, outcomes);
        return;
      }
      setVerified(el, plan[f.key].value, function (ok) {
        outcomes[f.key] = ok ? "filled" : "wiped";
        Diag.debug("GoDaddy: " + f.key + " " +
          (ok ? "filled + verified" : "would not stick"));
        fillNext(i + 1, outcomes);
      });
    }

    function finishFill(outcomes) {
      var anyFilled = FIELDS.some(function (f) {
        return outcomes[f.key] === "filled";
      });
      // The stash is single-use: erase it once a fill has
      // landed, so a later visit to this form doesn't
      // refill it from a stale case.
      if (anyFilled) clearStash();
      var lines = godaddyOutcomeLines(plan, outcomes);
      Diag.set("lead", lines.lead);
      Diag.set("sub1", lines.sub1);
      Diag.set("sub2", lines.sub2);
      Diag.debug("GoDaddy: fill pass done");
      // v1.0.79: hand off to the hero watch — when
      // GoDaddy's confirmation lands in this tab, the pane
      // trades these fill lines for the hero finish.
      watchGoDaddyHero();
    }
  }
})();
