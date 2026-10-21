# Spam Avenger for Gmail — v1.0.51 store submission sheet

Prepared 2026-10-17 (background research, after v1.0.51 was handed to Michael at 23:49 UTC). **Rolls the v1.0.49 sheet forward — nothing here has been submitted. Submission happens only on Michael's word, after his practice reps on v1.0.51.**

## Where things stand — what changed since the v1.0.49 sheet

- **v1.0.49 test FAILED in Michael's hands, usefully:** the PID details form rendered every label as "[object HTMLLabelElement]" (his screenshot, 23:17 UTC). Fields worked; labels did not.
- **v1.0.50 fixed it and Michael verified the full flow live (23:44 UTC screenshots):** labels render as real elements (Name / Email / ZIP / State), ZIP resolved to Colorado on its own, recipient guessed correctly as privacy@civicdialogues.org, and the letter opened in a Gmail compose matching his Mighty Networks template — CPA citation, 45-day clock, Colorado AG escalation. New DOM-render regression test: fails on the old build with his exact bug signature, passes 37/37 on v1.0.50.
- **The Civic Dialogues letter was deliberately NOT sent.** Michael's call (23:47 UTC): "not sent... sitting in an open tab... figured we'd want to test a few times before burning the 'test email'." It is a one-shot demand — **no CPA clock is running, no deadline exists yet.** If/when he sends it, the 45-day written-confirmation deadline starts that day.
- **v1.0.51 is the current dev build** (`spam-avenger-gmail-v1.0.51.zip`, manifest version 1.0.51, built 23:48 UTC): on Michael's design call, the PID section moved to the very bottom of the panel under a divider labeled "A DIFFERENT FIGHT," in its own tinted zone, with explainer copy separating strangers/scammers (report tools above) from companies he once dealt with (deletion demand). Per the build report: letter engine byte-identical to v1.0.50, only content.js, panel.css, and the version number changed; suites green (37 form / 75 letters / 11 analyzer); DOM order verified in the shipped zip.
- **Manifest check (read 2026-10-17):** v1.0.51 permissions are still only `storage`, same 9 host permissions as v1.0.48, gecko ID unchanged (`spam-avenger-gmail@seraphsheriff.github.io`). PID adds **zero** new permissions — Michael's one-addon call (23:12 UTC) holds.
- **Local PRIVACY.md already covers PID** (read 2026-10-17): "Data-deletion demands and 'your details'" section plus a Storage explanation covering both uses.
- **v1.0.48 remains the pending build at both stores:** Chrome item `gbgcemlglaifhnomdpckccijdajghoaf` (owned by spamdodger@gmail.com, auto-publish ON) is "Pending review"; Firefox AMO v1.0.48 is Awaiting Review. v1.0.28 is live on Chrome. The daily review watches are correctly aimed at the v1.0.48 decision — re-aim only after v1.0.51 is actually submitted.

## Remaining gate — practice reps, not the letter

The letter itself is verified (v1.0.50, in his hands). What is NOT yet verified is v1.0.51's new separated layout in real use. Michael's plan: load v1.0.51, draft demands against two or three *other* companies' emails, check the layout and recipient guesses, trash each compose, keep Civic Dialogues unsent. Submission waits on those reps coming back clean — and on his explicit "go."

## Blockers carried forward from the v1.0.49 sheet (still valid)

1. **Chrome upload wall:** Chrome will not accept a new package while v1.0.48 is pending review. AMO accepts a new version anytime. Do not create a second Chrome listing.
2. **Live privacy policy on GitHub:** at the last check (2026-10-17 ~21:55 UTC, for the v1.0.49 sheet) the live policy at https://github.com/SeraphSheriff/spamSentinel/blob/main/spam-avenger-gmail/PRIVACY.md did NOT yet show the deletion-demand section, even though the local PRIVACY.md has it. **That check predates v1.0.50/51 — re-verify before submitting.** Gate: push current source + PRIVACY.md to GitHub BEFORE submitting to either store, then re-open that URL and confirm the "Data-deletion demands" section renders.
3. **Chrome storage justification must be replaced** — the v1.0.48 filing says storage is for "one thing only." Paste-ready replacement (unchanged from the v1.0.49 sheet, still accurate for v1.0.51):

> The storage permission is used for two things, both entirely within the user's own browser (chrome.storage.local) and never transmitted anywhere. (1) When the user clicks the FTC or Google Safe Browsing report buttons, the extension briefly saves that email's case details — its links, claimed sender, subject, and the sending server's IP and hostname — so the report form that opens in a new tab can be pre-filled for the user's review. That copy is erased as soon as the form is filled, and is deleted unused after 30 minutes. (2) The extension can draft a data-deletion demand letter to the company behind an email. For that letter, the user may choose to save their own name, email address, ZIP code, and state in local storage, entered once by the user, used only to fill in deletion-demand letters the user opens, reviews, and sends (or doesn't) themselves. The user can view, change, or clear these details at any time in the extension's popup, and uninstalling the extension removes them. The extension has no server, no accounts, and no analytics; nothing stored is ever sent to the developer or any third party.

## Decision for Michael at "go" time (unchanged)

**Single-purpose line.** Filed: "Trace the true sender of a spam or phishing email in Gmail and draft an abuse complaint." Options: (a) keep it, or (b) broaden to: "Trace the true sender of a spam or phishing email in Gmail, draft abuse complaints and reports about it, and draft data-deletion demands to the companies that email you." (b) is more accurate for the PID build. His call — flag it, don't silently change it.

**Screenshots.** Store screenshots predate the PID section. Submit as-is and refresh later, or refresh from the v1.0.51 panel first (`make_screenshots.py`).

## Submission checklist (when he says go)

- [ ] His v1.0.51 practice reps came back clean (layout + recipient guesses on other companies; all practice composes trashed; Civic Dialogues still unsent unless he chose otherwise).
- [ ] Push v1.0.51 source + updated PRIVACY.md to GitHub; re-open the live PRIVACY.md URL and confirm the "Data-deletion demands" section is there.
- [ ] Firefox AMO: upload `spam-avenger-gmail-v1.0.51.zip` to the existing listing; remote-code answer stays **No**; license MIT; manifest `data_collection_permissions: none` stays accurate.
- [ ] Chrome (once the v1.0.48 review clears the upload wall): upload the same zip to item `gbgcemlglaifhnomdpckccijdajghoaf` under spamdodger@gmail.com; category Tools; auto-publish ON; **replace the storage justification with the text above**; decide the single-purpose line with him.
- [ ] After submission, re-aim both daily review watches at v1.0.51.
- [ ] Update tracking: PID feature item should read v1.0.51 submitted; store-listings item should read v1.0.51 pending, superseding v1.0.48.
- [ ] Verify any "published" claim against the live storefront URL, not dashboard status alone.
