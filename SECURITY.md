# Security Policy

Spam Avenger is a security tool, so I take reports about its own
security seriously.

## Supported Versions

Only the latest published version receives security fixes. The add-on
updates through the Firefox and Chrome stores, so if you are running
the current store version, you are covered. Older versions are not
patched — update instead.

## Reporting a Vulnerability

Please do NOT open a public issue for a security problem. A public
post about a hole in an anti-phishing tool just advertises it.

Report privately, either way:

- GitHub: use the "Report a vulnerability" button under this repo's
  Security tab, or
- Email: SeraphSheriff@gmail.com

Include what you found, what version you are running, and the steps
to reproduce it if you have them.

## What to Expect

I read every report myself. Expect a first reply within 7 days, and
sooner for anything serious. If the report checks out, I will fix it,
ship the fix through the stores, and credit you in the release notes
unless you would rather stay anonymous.

Please give me a reasonable chance to ship a fix before publishing
details yourself. I will not sit on a confirmed problem, and I will
tell you straight if I think a report does not hold up, and why.

## Scope

In scope: anything where the add-on itself could expose a user, act
on the wrong target, or be manipulated by a crafted email — for
example, spoofed headers producing a wrong accusation, data leaving
the browser that should not, or page content breaking the panel's
safety boundaries.

Out of scope: spam or phishing emails themselves (the add-on gives
you the buttons to report those), and vulnerabilities in Gmail,
Firefox, or Chrome — report those to Google or Mozilla.
