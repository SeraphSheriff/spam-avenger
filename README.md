# 🛡️ Spam Avenger for Gmail

One click traces who **really** sent a spam email and writes the abuse
complaint for you. The companion to [Spamfighter](https://github.com/SeraphSheriff/spamSentinel/tree/main/spamfighter) for
people who live in Gmail.

## The 10-second version

1. Open a spam email in Gmail (desktop Chrome, Edge, or Brave).
2. Click the red shield button (bottom-right corner).
3. Read who really sent it. Copy the complaint — or open it pre-addressed
   in Gmail — attach nothing, hit send.

No accounts. No passwords. No configuration. Nothing is ever sent
automatically — you review and send every complaint yourself.

## Install (2 minutes, one time)

1. Download `spam-avenger-gmail.zip` and **unzip** it into a folder.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Turn on **Developer mode** (toggle, top-right).
4. Click **Load unpacked** and select the unzipped folder.
5. Open Gmail. Open any spam email. Click the red shield.

That's it. The button only appears when you're looking at an email.

## What it does when you click

- Reads the email's full headers (the "show original" view you're
  already logged into — no extra permissions needed).
- Walks the Received chain to the **originating IP** — the server that
  actually pushed the send button. The "From" address is makeup; the IP
  is the face underneath.
- Looks up who owns that IP and finds their **abuse contact**.
- Writes a ready-to-send complaint naming the IP, the claimed sender,
  the subject, the links, the **full headers as evidence**, and the
  message body — desks like AWS Trust & Safety bounce complaints that
  offer headers "on request," so they're attached up front. (The
  cryptographic signature blocks — ARC/DKIM — are left out: kilobytes
  of base64 no desk can act on. The routing chain and authentication
  verdicts are all there.) The links
  are **defanged** (`hxxps://example[.]com/...`) — a complaint quoting
  live phishing links scores as spam at the receiving desk's filter
  and can be eaten (or get the sender listed) before a human sees it;
  defanging is the abuse community's standard way to share bad links
  safely, and the complaint says how to read them.
- Flags the usual scam tells: throwaway `.shop`-style domains, links
  that go somewhere different from the sender, pressure tactics,
  "verify your account" phishing, gift-card bait, unfilled `{{date}}`
  phish-kit placeholders.
- Two one-click actions for real phish: **Report phishing to Google**
  walks Gmail's own report flow (and detects already-reported messages
  instead of opening a dead menu); **Forward phish to APWG + CISA**
  opens Gmail's forward with the phish attached, addressed to
  reportphishing@apwg.org and contact@cisa.dhs.gov — you review and send.
- Knows which hosts ignore emailed complaints: if the sending host
  is OVHcloud or a hyperscaler cloud (Google Cloud, AWS, Azure), the
  panel skips the email entirely and shows a **form kit** instead —
  everything the host's abuse form asks for, prepared in one
  paste-ready evidence block (summary, source IP, date, the full
  headers), plus a button that opens the form, e.g.
  [OVHcloud's](https://www.ovhcloud.com/en/abuse/). Filing through
  the form from the start removes the desk's "use our form"
  deflection — and saves you finding out by autoresponder.

It will **not** generate a complaint against the big mailbox providers'
own servers (Google, Microsoft, Yahoo, etc.) — their IPs show up in
headers for your own mail too, and reporting them would hit the wrong
target. It tells you when that's the case.

One exception, in the same Report Abuse lane (v1.0.67): if a message
was sent by a **real Microsoft 365 account** — it arrived through
Microsoft's Outlook protection servers (`*.outbound.protection.outlook.com`)
and SPF, DKIM, and DMARC all pass for the sender's domain, so the
account is real, not spoofed — the abuse complaint switches its
target. Instead of a host complaint against Microsoft's shared IP
(a complaint about Microsoft, to Microsoft, that goes nowhere), the
report goes to Microsoft's phishing desk
(phish@office365.microsoft.com) and reports the **account itself**:
sender account, sending server, the authentication verdicts, and
the full headers in the body. (Microsoft's filters reject raw .eml
attachments and the compose can't attach one anyway — headers in
the body are the evidence that survives.) Same lane, same flow:
you review it and click Send, like every complaint.

Follow-up (v1.0.68): the details panel matches the switch. In
this case the abuse contact shown is the phishing desk, and the
"From address is makeup" note flips — the account itself is the
face, the IP is just Microsoft's shared mail truck. And when
DNS confirms the sender's domain runs no website at all (no A
or AAAA records for the domain or its www host, checked with
the same DNS lookups the panel already makes), the note and
the report both say so: a domain that exists only to send
mail. On any DNS error or uncertainty, nothing is claimed.

Follow-up (v1.0.69): the form kits stop handing you one
paste for every form. The Azure kit gets the treatment
Michael asked for after testing the Outlook build on an
Azure-hosted spam whose panel only offered the email. The
MSRC link now carries its picks with it
(https://msrc.microsoft.com/report/abuse?ThreatType=IpAddress&IncidentType=Spam)
and the kit shows that link as a link, with one factual
line: this host takes abuse reports through its web form;
the form is where a case gets opened. The evidence block
mirrors the emailed complaint's facts — the server name and
the defanged links join the source IP, date, From, Subject,
and the full headers, under the same caps — and a **Copy
the details for the form** button copies it for filing the
form by hand.

The Google Cloud, AWS, and OVHcloud forms don't share
that shape — each splits the report across its own boxes —
so their kits now walk the form field by field. Each step
names the form's box, gives a one-line instruction, and
carries its own Copy button with exactly the slice that
box wants: Google's "Abuse details" block is sized to the
form's 1,000-character cap with the full headers routed to
its logs upload instead; AWS gets an incident block (type,
ISO date/time, time zone, source IP) plus log extracts and
the message's URLs; OVHcloud gets the location IP, a
facts-only description (OVHcloud forwards the description
to the service owner, so it carries no personal
information), and the logs separately. Steps whose slice
can't be built — no URLs for a URL box — are skipped
rather than shown empty. The forms' name and email boxes
are the reporter's own: the kits say so and never prepare
them.

Follow-up (v1.0.70): the Azure kit joins the field-by-field
lanes, mapped from the MSRC form as it actually is —
Michael filed it by hand and screenshotted both steps.
The form has two text boxes on two different steps. The
Contact Information step's "Additional information" box
caps at 15,000 characters, and the v1.0.69 details block
fits it (his paste used about 9,200), so the block stays
as that box's step, unchanged. The Report Details step
splits the rest up: the source IP gets its own box, the
incident date and time go into date/time/time-zone
pickers, and the "Report notes" box caps at 2,000
characters — so the notes step carries a short slice
instead: the narrative, the message facts, and the
defanged links, with no headers (they ride in Additional
information). The kit walks the four boxes in the form's
order, one copy button each.

Follow-up (v1.0.70): the panel traces the sender's domain
the way the RrSG's ACID tool splits a case — because a fraud
operation is three rented services, and the complaint above
only reaches the one that sent the mail. Two more lanes
appear under it once the lookups land. **Website host**: the
From domain's A record (CNAMEs followed) names the server
its website sits on; that IP's ownership record names the
hoster, and the lane carries a hosting complaint — you host
the website for a domain running a fraud operation, here is
the domain, the address it resolves to, and the day that
was checked; investigate and suspend hosting. If the
website sits on a form-only host (a hyperscaler cloud or
OVHcloud), the lane shows that host's form kit instead,
with evidence worded for a website. **Registrar**: the
domain's own registration record names the registrar and
its abuse contact, shows the registration date next to the
message's arrival — a domain registered within 30 days
before the message landed gets flagged in plain words as
the fresh-domain fraud tell — and names the registrant when
the record doesn't hide them. A DNS Abuse complaint to the
registrar's desk rides along: the domain itself as fraud
infrastructure, registered on this date, sending fraud
within days. Both lanes use public records only (DNS and
RDAP, the same sources as the mail trace), both stay silent
when the records don't answer, and neither appears for the
big mailbox providers' own domains — a Gmail sender's
website host and registrar are corporate noise next to the
Report lane's advice.

- **Your data in their hands**: one more panel action drafts a formal
  data-deletion demand to the sender's company — delete everything,
  opt me out of sale/sharing/tracking, purge backups, make your
  processors delete too, and confirm in writing within 45 days or cite
  the exact law that lets you keep it. It cites your state's privacy
  act (Colorado, California, Texas, Virginia, Connecticut, Oregon,
  Montana) where one grants a deletion right, and your ZIP — asked
  once, stored only in your browser — picks the right law. The letter
  opens in your Gmail for review, like the complaint; you send it.

## Privacy

Everything runs inside your browser. The only network requests are
lookups **about the spammer** — RDAP ownership records and reverse
DNS for the sending IP, and public DNS and domain-registration
records for the sender's domain. Your emails, your address book, and
your Gmail account are never touched, uploaded, or sent anywhere.

## Limits (honest ones)

- Desktop Gmail on the web only. Browser buttons can't run inside the
  Gmail phone app — phone users should use the classic Spamfighter tool.
- Needs the email open in the reading pane (works on single messages;
  on long threads it analyzes the first message).
- If the spammer's IP has no published abuse contact, there's nobody
  to complain to — the panel says so and points you at Google Safe
  Browsing instead.

## Files

- `manifest.json` — extension manifest (Manifest V3)
- `content.js` — Gmail button, header fetching, results panel
- `panel.css` — button + panel styling
- `popup.html` — toolbar-icon help popup
- `lib/analyze.js` — the analysis engine (header parsing, RDAP, complaint
  builder). Also runnable under Node for tests.
- `lib/demand.js` — the data-deletion demand generator (letter builder,
  ZIP→state→statute table, shared "your details" form). Also runnable
  under Node for tests.
- `icons/` — shield icons

## For the curious

Same fight, three weapons:

| | Spamfighter | Spam Avenger for Gmail | spamSentinel |
|---|---|---|---|
| Who | Anyone with a PC | Gmail users | cPanel server owners |
| How | Save .eml files, double-click | One click in Gmail | Automatic server-side |

Built October 2026. Free forever. If it helps you punish a spammer,
that's the whole point.

## ⭐ Rate it

If Spam Avenger helps you, please leave a rating or review on
[Firefox Add-ons](https://addons.mozilla.org/addon/spam-avenger-for-gmail/).
It helps other people find it, and word of mouth is the only
advertising this add-on has.
