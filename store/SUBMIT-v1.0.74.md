# Spam Avenger for Gmail — v1.0.74 store submission sheet

Prepared 2026-11-23. v1.0.74 is the next number in the published sequence after v1.0.73 (the development line ran through internal builds 1.0.74–1.0.79; the owner directed that the finished build publish as 1.0.74 so the public sequence has no gaps). v1.0.73 was submitted to the stores but never committed to this repo; this commit brings the repo fully current in one step.

## Where things stand

- **v1.0.74 is built and green:** 45 suites, 1573 tests, 0 failures. Package: `spam-avenger-gmail-v1.0.74.zip` (13 files, manifest inside reads 1.0.74).
- **FTC lane fixes:** the payment question pick is scoped to its own question group and verified against it (earlier builds could bind the wrong "No" radio on the shared page); the "How did it start" dropdown is driven and read back; the spam-experience boxes are picked by their real labels (three of the four, excluding the pornographic-images box); the encounter date and the impersonated company (from the sender's display name) are filled. No reporter-details filler was built — the FTC's optional details section asks for more than the extension should collect.
- **GoDaddy lane:** the lane links straight to the phishing report form (legalportal.godaddy.com/abuse/phishing), skipping the category page. The form is auto-filled with a guide pane: reporter email (from the address saved for data-deletion letters, never invented), the impersonated brand, the URL box (links one per line, reported domain on its own line), and the complaint description. The mobile checkbox and country selector are left alone, fields the user already filled are never overwritten, and the extension never submits. On GoDaddy's "Submission Complete" page the pane swaps to a hero flash — "Filed with GoDaddy" — with the DCU ticket count read off the page (the owner's live test opened 11 tickets, DCU102475070–DCU102475080).
- **Four new form lanes:** Newfold, BrandFocus, eNom, and GoDaddy join the guided form kits (the desks whose abuse mailboxes deflect to web forms). Field guides for Newfold, BrandFocus, and eNom are provisional; GoDaddy's is walked and auto-fills.
- **AWS email door:** one-click complaint email to trustandsafety@support.aws.com alongside the existing form lane. The owner filed by email on Nov 23, 2026 and AWS acknowledged with a case number.
- **Google sign-in note:** the government-form guide now states no Google account is needed to file, and to ignore the support page's Sign in button.

## Submission status

- **Chrome Web Store:** v1.0.74 uploaded and submitted Nov 23, 2026 — status "Pending review", auto-publish on. Live version remains 1.0.73 until review passes.
- **Firefox AMO:** submission in progress Nov 23, 2026.
- **GitHub:** this push (v1.0.74 source, tests, and this note).

## Notes

- The form-lane count after this release is 10 company form desks (Google Cloud, AWS, Microsoft Azure, OVHcloud, JulyName, Wanshang, Newfold, BrandFocus, eNom, GoDaddy), not counting FTC / government forms.
- The owner's form-deflection X thread is drafted and held at his direction; it is not part of this release.
