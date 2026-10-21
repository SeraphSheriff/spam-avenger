// Spam Avenger v1.0.60 — Safe Browsing celebration wiring tests.
// Run: node tests/test-reportfill-celebration.js
//
// Defect 2: the FTC guided flow celebrates a confirmed submission
// ("🎉 You did it!", since v1.0.43) but the Safe Browsing flow
// ended at the fill — no watch, no payoff. v1.0.59 added the
// watch, but both of its trigger gates were wrong for Google's
// real page and it never fired in the field: the wording net
// didn't contain the sentence Google actually shows, and the
// form-gone requirement can never hold — Google keeps the form
// on screen and appends a "Status of submission" panel under it
// reading "Submission was successful." v1.0.60 makes the
// confirmation text alone the trigger. reportfill.js is a
// browser content script (chrome.storage + live DOM at load), so
// it can't be executed whole in Node; these are static wiring
// checks on the shipped source PLUS a text-fixture test that
// pulls the real matcher out of the source and runs it against
// the exact text Google showed, and against the unsubmitted form.
"use strict";
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "reportfill.js"), "utf8");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); }
}

const sbStart = src.indexOf("function fillSafeBrowsing");
const ftcStart = src.indexOf("function fillFtc");
ok("both flows present, Safe Browsing before FTC",
  sbStart !== -1 && ftcStart !== -1 && sbStart < ftcStart);
const sb = src.slice(sbStart, ftcStart);
const ftc = src.slice(ftcStart);

ok("FTC flow has the celebration (reference behavior)",
  ftc.indexOf("You did it!") !== -1);
ok("Safe Browsing flow now has the celebration too",
  sb.indexOf("You did it!") !== -1);
ok("celebration text identical in both flows",
  sb.indexOf("You just made the internet a better") !== -1 &&
  ftc.indexOf("You just made the internet a better") !== -1);

ok("submission watch exists in the Safe Browsing flow",
  sb.indexOf("function watchSbSubmit()") !== -1);
ok("watch started from the fill-outcome banner (finishBanner)",
  sb.indexOf('if (eraseMode === "always" || detailsFound) watchSbSubmit();') !== -1);
ok("watch started from the manual hand-off (fillFailed)",
  /function fillFailed\(\) \{[\s\S]*?watchSbSubmit\(\);/.test(sb));
ok("watch starts at most once",
  sb.indexOf("if (sbWatchStarted) return;") !== -1);

// v1.0.60 trigger contract: the confirmation text alone fires
// the celebration — the v1.0.59 form-gone gate is gone (Google
// never removes the form), and the matcher leads with the text
// Google actually shows.
ok("watch check keys on the confirmation text alone",
  sb.indexOf("if (sbSubmissionConfirmed(sbVisibleText())) {") !== -1);
const watchBlock = sb.slice(sb.indexOf("function watchSbSubmit()"),
  sb.indexOf("function fillFailed()"));
ok("no form-gone gate left in the watch",
  watchBlock.indexOf("findUrlField") === -1);
ok("matcher function present (sbSubmissionConfirmed)",
  sb.indexOf("function sbSubmissionConfirmed(text)") !== -1);
ok("wording leads with the observed 'Submission was successful'",
  /SB_CONFIRM_RE = \/submission \(was \|is \)\?successful/.test(sb));
ok("wording still covers submitted/thank-you (extra triggers)",
  /submitted successfully\|thank you\|report \(has been \|was \)\?submitted/.test(sb));
ok("status-panel pairing present ('Status of submission' + success)",
  sb.indexOf("status of submission") !== -1 &&
  /SB_CONFIRM_RE/.test(sb));
// v1.0.62: Google's status panel is div/span markup — the
// h1-h4/p-only census in sbVisibleText never saw its text and
// the v1.0.60 trigger still couldn't fire in the field. The
// collector must also pull the page's rendered text.
const visBlock = sb.slice(sb.indexOf("function sbVisibleText()"),
  sb.indexOf("function watchSbSubmit()"));
ok("v1.0.62: visible-text collector also reads body.innerText",
  visBlock.indexOf("document.body") !== -1 &&
  visBlock.indexOf("innerText") !== -1);
ok("v1.0.62: heading/paragraph census kept as first source",
  visBlock.indexOf('querySelectorAll("h1, h2, h3, h4, p")') !== -1);
ok("watch is time-capped (~15 min, like the FTC watch)",
  sb.indexOf("15 * 60 * 1000") !== -1);

ok("the watch itself never clicks anything",
  watchBlock.indexOf(".click(") === -1);
ok("watch celebrates via the shared banner (Diag.set lead)",
  watchBlock.indexOf('Diag.set("lead"') !== -1 &&
  watchBlock.indexOf("You did it!") !== -1);

// ---------- text-fixture test: the real matcher vs. real text --
// Extract SB_CONFIRM_RE and sbSubmissionConfirmed from the
// shipped source and run them against page-text fixtures —
// first the exact confirmation Google showed on Michael's
// retest (form still present, status panel appended below it).
const reLit = sb.match(/var SB_CONFIRM_RE = (\/.*\/i);/);
const fnSrc = sb.match(/function sbSubmissionConfirmed\(text\) \{[\s\S]*?\n    \}/);
ok("matcher extractable for fixture tests", !!(reLit && fnSrc));
if (reLit && fnSrc) {
  const SB_CONFIRM_RE = eval(reLit[1]);
  const sbSubmissionConfirmed = new Function("SB_CONFIRM_RE",
    "return " + fnSrc[0] + ";")(SB_CONFIRM_RE);
  const t = (s) => sbSubmissionConfirmed(s);
  ok("fixture: observed panel text fires ('Status of submission' / 'Submission was successful.')",
    t("Report a Page to Google Safe Browsing\nStatus of submission\n" +
      "Submission was successful.") === true);
  ok("fixture: bare 'submission was successful' fires, any case",
    t("submission was successful") === true &&
    t("SUBMISSION WAS SUCCESSFUL") === true);
  ok("fixture: status heading + other success wording fires",
    t("Status of submission\nYour report was sent successfully.") === true);
  ok("fixture: thank-you/submitted wording still fires",
    t("Thank you for your report. Your report has been submitted.") === true);
  ok("fixture: the unsubmitted form does NOT fire",
    t("Report a Page to Google Safe Browsing\nReport Type*\n" +
      "URL to report*\nAdditional details\nSubmit") === false);
  ok("fixture: status heading with a failure line does NOT fire",
    t("Status of submission\nSomething went wrong. Please try " +
      "again later.") === false);
  ok("fixture: the fill banner's own lines do NOT fire",
    t("\u2713 Filled in: the phishing link and the details from " +
      "your email.\nGive it a quick review, then click Submit " +
      "when you're ready \u2014 I never submit for you.") === false);
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
