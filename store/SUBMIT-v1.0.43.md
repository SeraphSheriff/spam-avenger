# Spam Avenger for Gmail — v1.0.43 store submission roadmap

Prepared 2026-10-17 (background research). **Submission happens only on Michael's word — nothing here has been submitted.**

## Where things stand

- **v1.0.43 zip is built and staged:** `~/workspace/spam-tracker/spam-avenger-gmail/spam-avenger-gmail-v1.0.43.zip`
  - v1.0.43 = v1.0.41 polish (FTC banner header "Spam Avenger Guide", plain-language banner, green pulse) + guide lines without the "→ Guide:" prefix, pulse on any main-line change, and the FTC endgame: Back-button reassurance + silent refill of a wiped Comments box (never overwrites user edits), review-step line, and the confirmation-page celebration line.
  - Michael's verdict on v1.0.41 (2026-10-17): "Everything else works well!" v1.0.43's own test pass (Back → forward → Submit) was handed to him 2026-10-17 ~11:54 MDT and is the last gate before a "go."
- **v1.0.28 is still the in-review build at both stores** (submitted 2026-10-16, fresh listings after the Spamfighter→Spam Avenger rebrand):
  - Chrome Web Store item `gbgcemlglaifhnomdpckccijdajghoaf`, owned by **spamdodger@gmail.com** (SeraphSheriff@gmail.com is NOT a registered Chrome developer), auto-publish ON.
  - Firefox AMO listing, gecko ID `spam-avenger-gmail@seraphsheriff.github.io`, MIT license.
  - Daily review watches are live for both stores and will report the decision the day it lands; they are correctly aimed at the new Spam Avenger listings (verified 2026-10-17).

## The one real blocker (Chrome)

Chrome's dashboard **will not accept a new package while v1.0.28 is pending review** — learned 2026-10-16, when v1.0.26's pending review blocked the v1.0.27 upload. So on a "go" today:

- **Chrome:** the upload likely bounces until the v1.0.28 review resolves. Known-good path: wait for the review decision (the daily watch reports it), then upload v1.0.43 as an update to item `gbgcemlglaifhnomdpckccijdajghoaf`, settings unchanged, auto-publish stays ON. Do not create a second listing.
- **Firefox AMO:** a new version upload to the existing listing is the expected path, but whether AMO accepts it while v1.0.28 is still awaiting review must be confirmed in the AMO UI at submission time — not verified in advance.

## Decisions for Michael at "go" time

1. **Screenshots:** the store screenshots in `store/` predate the v1.0.3x panel (collapsed "Show details ▸", button-color legend, renamed complaint buttons, guided FTC banner). Options: (a) submit v1.0.43 with the existing screenshots — core flow is unchanged — and refresh later via `make_screenshots.py`; or (b) refresh screenshots from the v1.0.43 panel first, then submit. (b) is more accurate for Joe User; (a) is faster.
2. **Timing on Chrome:** submit to AMO as soon as he says go and let Chrome follow when the v1.0.28 review clears, or hold both until Chrome opens up.

## Submission checklist (when he says go)

- [ ] Confirm his v1.0.43 FTC test pass came back clean (Back/forward/Submit celebration).
- [ ] Ask which account context applies if any email must be sent (rule: always ask which Gmail — never assume).
- [ ] Firefox AMO: upload `spam-avenger-gmail-v1.0.43.zip` to the existing Spam Avenger listing; remote-code answer stays **No**; license MIT; no new manifest/platform keys.
- [ ] Chrome (once uploads reopen): upload the same zip to item `gbgcemlglaifhnomdpckccijdajghoaf` under spamdodger@gmail.com; category Tools; auto-publish ON; privacy answers unchanged from `store/CHROME-SUBMIT.md` (single purpose, host-permission justifications, no user-data collection, no remote code).
- [ ] After submission, re-aim the two daily review watches at v1.0.43 (same item IDs) so the decision still gets reported.
- [ ] Verify any "published" claim against the live storefront URL, not dashboard status alone.
