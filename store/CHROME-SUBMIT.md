# Chrome Web Store submission walkthrough — Spam Avenger for Gmail v1.0.24

**Status when this was written (Oct 15, 2026 ~3:00 PM MDT):** $5 paid, account set up, SeraphSheriff@gmail.com being created as the public contact email. The zip is staged at `~/workspace/spam-tracker/spam-avenger-gmail/spam-avenger-gmail-v1.0.24.zip`.

The listing copy (name, descriptions, category, screenshots, promo tile, privacy URL) is already drafted in `~/workspace/spam-tracker/spam-avenger-gmail/store/LISTING.md`. This sheet covers **only what LISTING.md doesn't** — the Privacy tab, the Distribution tab, and the account-verification gotcha.

## Privacy tab (the one that trips people up)

**Single purpose** (one sentence, required):

> Trace the true sender of a spam or phishing email in Gmail and draft an abuse complaint.

**Permission justifications** — Chrome requires a written justification for every host permission. Paste these:

- `mail.google.com` — "Displays the red shield button in Gmail and reads the full headers of the message you click on, to trace the originating IP. No other websites are accessed."
- `rdap.arin.net`, `rdap.db.ripe.net`, `rdap.apnic.net`, `rdap.lacnic.net`, `rdap.afrinic.net` — "Look up public registration records for the originating IP to identify the network owner and their published abuse contact. Queries concern the spammer's infrastructure only — never the user's."
- `dns.google` — "Reverse-DNS lookup of the originating IP (the sending server's public hostname)."

**Data usage** — declare that the extension does **not** collect user data. Grounds: no accounts, no analytics, no telemetry; the only network requests are the public-record lookups above about the *spammer's* IP. The full privacy policy is at `https://github.com/SeraphSheriff/spam-avenger/blob/main/PRIVACY.md` (verified live).

**Remote code** — none. All JavaScript ships inside the package; there is no build step and no downloaded code.

## Distribution tab

- Visibility: **Public**
- Regions: all (default)
- Pricing: **Free**

## Account verification (don't skip)

The publisher contact email (**SeraphSheriff@gmail.com**) gets a verification email from Google. **Publishing stays blocked until that link is clicked.** Check the new inbox (or its forward) after submitting and click it.

## After you hit Submit

- New-developer reviews usually take a few days, occasionally up to a week+. Nothing to do but wait — the Mozilla track runs independent, no conflict.
- The screenshots are launch-ready (1280x800). One known polish gap: screenshot-2 predates the two action buttons ("Report phishing to Google" / "Forward phish to APWG + CISA"). It's fine for launch — refresh it later with `make_screenshots.py`.
