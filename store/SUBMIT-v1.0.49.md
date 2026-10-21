# Spam Avenger for Gmail — v1.0.49 store submission sheet

Prepared 2026-10-17 (background research, after the v1.0.49 build landed at 21:03 UTC). **Nothing here has been submitted. Submission happens only on Michael's word, after his Firefox test of the PID letter.**

## Where things stand

- **v1.0.49 zip is built and staged:** `~/workspace/spam-tracker/spam-avenger-gmail/spam-avenger-gmail-v1.0.49.zip`
  - New in 1.0.49: the PID / data-deletion demand feature — panel section "Your data in their hands," one-time name/email/ZIP in `chrome.storage.local` (keys `sa_user_*`), ZIP→state statute table, recipient pre-filled `privacy@<sender domain>` (editable), letter opens in a Gmail compose, never auto-sends. Manifest confirms `lib/demand.js` is loaded and the only permission is still `storage` — no new permissions, no new host access, no new manifest keys.
  - The autofill/report code is byte-identical to v1.0.48 (his tested release build).
  - **Last gate:** Michael's hands-on Firefox test (load temporary add-on → refresh Gmail → fill "Your details" once → draft a demand on a real company email → read the letter in the compose). Handed to him 2026-10-17 21:03 UTC; no test verdict recorded yet.
- **v1.0.48 is the pending build at both stores** (submitted 2026-10-17): Chrome item `gbgcemlglaifhnomdpckccijdajghoaf` (owned by spamdodger@gmail.com, auto-publish ON) is "Pending review"; Firefox AMO v1.0.48 is Awaiting Review. v1.0.28 is the live published Chrome version.
- The two daily review watches (Chrome 06:52, Mozilla 06:00 America/Denver) are worded for the v1.0.48 decision and are still correct for that. They need re-aiming at v1.0.49 only after 1.0.49 is actually submitted.

## Blocker #1 — Chrome upload wall (expected, not new)

Chrome's dashboard will not accept a new package while v1.0.48 is pending review (same wall that blocked v1.0.27 behind v1.0.26 on 2026-10-16). So even on a "go," Chrome likely waits for the v1.0.48 decision; AMO accepts a new version on the existing listing anytime. Do not create a second Chrome listing.

## Blocker #2 — privacy policy on GitHub does NOT yet cover the PID feature (found 2026-10-17, verified live)

- The **local** `PRIVACY.md` (in the 1.0.49 build dir) already has the "Data-deletion demands and 'your details'" section and a Storage explanation covering both uses.
- The **live** policy at the URL Chrome reviewers follow — https://github.com/SeraphSheriff/spamSentinel/blob/main/spam-avenger-gmail/PRIVACY.md — checked 2026-10-17 ~21:55 UTC, still shows only the report-form stash: no deletion-demand section, and its Storage line mentions only the FTC/Safe Browsing pre-fill.
- **Gate:** push the v1.0.49 source (including the updated PRIVACY.md) to GitHub BEFORE submitting to either store, then re-open that URL and confirm the deletion-demand section renders. Submitting first would hand reviewers a policy that doesn't disclose storing the user's name/email/ZIP — exactly the kind of mismatch that draws a rejection.

## The one text that must change at submission — Chrome storage justification

The justification filed for v1.0.48 says storage is used for "one thing only" (the report-fill stash). That is no longer true in 1.0.49. Paste-ready replacement for the Privacy tab's storage justification:

> The storage permission is used for two things, both entirely within the user's own browser (chrome.storage.local) and never transmitted anywhere. (1) When the user clicks the FTC or Google Safe Browsing report buttons, the extension briefly saves that email's case details — its links, claimed sender, subject, and the sending server's IP and hostname — so the report form that opens in a new tab can be pre-filled for the user's review. That copy is erased as soon as the form is filled, and is deleted unused after 30 minutes. (2) The extension can draft a data-deletion demand letter to the company behind an email. For that letter, the user may choose to save their own name, email address, ZIP code, and state in local storage, entered once by the user, used only to fill in deletion-demand letters the user opens, reviews, and sends (or doesn't) themselves. The user can view, change, or clear these details at any time in the extension's popup, and uninstalling the extension removes them. The extension has no server, no accounts, and no analytics; nothing stored is ever sent to the developer or any third party.

All other Privacy-tab answers carry over unchanged from `store/CHROME-SUBMIT.md`: host-permission justifications (mail.google.com, the five RDAP endpoints, dns.google, safebrowsing.google.com, reportfraud.ftc.gov), no user-data collection declaration, no remote code.

## Decision for Michael at "go" time

**Single-purpose line.** The filed single purpose is: "Trace the true sender of a spam or phishing email in Gmail and draft an abuse complaint." The deletion-demand feature arguably stretches past that wording. Options:
- (a) Keep it — the demand is still a draft about an email he received, generated from the same panel; or
- (b) Broaden it to: "Trace the true sender of a spam or phishing email in Gmail, draft abuse complaints and reports about it, and draft data-deletion demands to the companies that email you."
(b) is the more accurate description of 1.0.49; changing it is a one-line edit in the dashboard. His call — flag it, don't silently change it.

**Screenshots.** Store screenshots predate the new panel section. Submit as-is and refresh later, or refresh from the 1.0.49 panel first (`make_screenshots.py`). Same tradeoff as v1.0.43: accuracy vs speed.

## Submission checklist (when he says go)

- [ ] His Firefox test of the PID letter came back clean (wording is his to tune first).
- [ ] Push v1.0.49 source + updated PRIVACY.md to GitHub; re-open the live PRIVACY.md URL and confirm the "Data-deletion demands" section is there.
- [ ] Firefox AMO: upload `spam-avenger-gmail-v1.0.49.zip` to the existing listing; remote-code answer stays **No**; license MIT; manifest `data_collection_permissions: none` stays accurate (saved details never leave the device).
- [ ] Chrome (once the v1.0.48 review clears the upload wall): upload the same zip to item `gbgcemlglaifhnomdpckccijdajghoaf` under spamdodger@gmail.com; category Tools; auto-publish ON; **replace the storage justification with the text above**; decide the single-purpose line with him (above).
- [ ] After submission, re-aim both daily review watches at v1.0.49 (same item IDs, same decision flows).
- [ ] Verify any "published" claim against the live storefront URL, not dashboard status alone.
