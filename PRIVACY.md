# Privacy Policy — Spam Avenger for Thunderbird

Last updated: November 2026

## Overview
Spam Avenger for Thunderbird runs 100% locally inside your Mozilla Thunderbird email client. We do not operate any backend servers, analytics, telemetry, user accounts, or tracking. Your emails, contacts, and account credentials are never uploaded, stored externally, or shared with any third party.

## Data Processed Locally
- **Email Headers & Content:** When you click the Spam Avenger button on an email, the add-on reads the active message's raw RFC-822 headers and body locally in memory to identify the originating sending server IP, extract URLs, and draft an abuse complaint or data-deletion demand.
- +*Local Preferences:** Any optional user details you enter for data-deletion demands (such as your name, email address, or ZIP code) and temporary form-fill state are stored exclusively on your device using Thunderbird's local extension storage (`browser.storage.local`).

## External Network Requests
The add-on makes outbound network requests only when you initiate an email trace, and strictly for technical infrastructure lookups about the spammer:
- Public RDAP registries (ARIN, RIPE, APNIC, LACNIC, AFRINIC, rdap.org) and IANA to look up IP ownership and abuse contacts.
- Public DNS over HTTPS (`dns.google`) and Certificate Transparency logs (`crt.sh`) to check domain records.
- Official reporting portals (`reportfraud.ftc.gov`, `safebrowsing.google.com`, `support.google.com`) only when you explicitly click a button to open and pre-fill a report form in a new tab.

## Your Control
No email or report is ever sent automatically. Every complaint opens in a Thunderbird compose window or official web form for you to review and send yourself. You can clear all locally stored preferences at any time by removing the add-on in Thunderbird.
