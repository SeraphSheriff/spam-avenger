# 🛡 Spam Avenger for Thunderbird

One click traces who **really** sent a spam email and writes the abuse complaint for you. Built for people who live in Mozilla Thunderbird.

## The 10-second version

1. Open a spam email in **Mozilla Thunderbird** (v128+ ESR or newer9.
2. Click the red **Spam Avenger** shield button in the message header bar (next to *Reply* and *Forward*).
3. Read who really sent it. Copy the complaint — or open it pre-addressed in a Thunderbird compose window — attach nothing, hit Send.
4. Working multiple lanes on one spammer? Click **Open in tab** in the panel header to keep Spam Avenger open right next to your email tab (it automatically updates as you click through different messages).

No accounts. No passwords. No configuration. Nothing is ever sent automatically — you review and send every complaint yourself.

## Install (2 minutes, one time)

1. Download `spam-avenger-thunderbird.xpi` (do **not** unzip it).
2. Open **Thunderbird** and press `Ctrl+Shift+A` (or click **Tools → Add-ons and Themes**).
3. Click the **gear icon (`#️`)** near the top-right and select **Install Add-on From File...**
4. Select `spam-avenger-thunderbird.xpi` and click **Add**.
5. Open any spam email and click the red **Spam Avenger** shield button in the message header toolbar.

## What it does when you click

- Reads raw RFC-822 headers and source natively via Thunderbird's MailExtension API.
- Traces the `Received` chain to the originating IP, looks up ownership and abuse contacts via RDAP/DNS, and generates pre-formatted complaints with defanged URLs and full header evidence.
- Flags scam indicators (throwaway domains, phishing tactics, gift-card bait) and supports persistent tab mode (`Open in tab`) for multi-message workflows.
- Includes one-click and guided reporting for the FTC, Google Safe Browsing, APWG, CISA, major hyperscalers/registrars, and automated state privacy data-deletion demands.

## Privacy & Limits

- **Privacy:** Runs 100% locally inside Thunderbird. Network lookups are strictly limited to technical queries about the spammer's IP and domain infrastructure.
- +*Limits:** Requires Thunderbird 128.0 ESR or newer (`Manifest V3`), an active message selection, and a resolvable abuse contact.

## Files & Ecosystem

Includes the Manifest V3 configuration (`manifest.json`), UI and popup scripts (`popup.html`, `popup.js`, `content.js`, `panel.css`), analysis and demand libraries (`lib/analyze.js`, `lib/demand.js`, `reportfill.js`), background workers, and icons.

Part of the Spam Avenger family alongside tools for Gmail, local `.eml` files, and cPanel servers. Available free forever at [Thunderbird Add-ons (ATN)](https://addons.thunderbird.net/).
