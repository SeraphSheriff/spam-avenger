# Spam Avenger for Gmail — Buttons Audit (v1.0.64)

Michael's ask (Oct 28): with the accordion ported in, which buttons in the
panel are possibly superfluous now? **Report only — the audit itself
removed nothing.** (Two removals landed in v1.0.64 afterward: the PID
registrar-abuse suggestion chip, item 1 of the build order, and the Copy
complaint button — the audit's lead candidate — on Michael's call; see
below. A third post-audit change — the form kit for hyperscaler + OVH
panels — is recorded under "Changed in this build" below.)

Verdicts: **KEEP** = earns its place. **SUPERFLUOUS-CANDIDATE** = Michael's
call; reason given.

## Panel chrome

| Control | What it does | Verdict |
|---|---|---|
| Red shield button | Opens the panel; runs the header analysis | KEEP — the entry point |
| Close ✕ (`.sf-x`) | Closes the panel | KEEP |
| "Show details ▸" toggle | Expands the header/IP/flags info block; sits in its own pinned bar above the stack (Outlook parity: details live outside the accordion) | KEEP |
| Section toggles ×6 (Abuse complaint · FTC · Safe Browsing · Forward · Report phishing to Google · Not Spam but still **unwanted**?) | Expand/collapse each lane; strictly one open at a time | KEEP — this is the new chrome itself |

## Abuse complaint section

| Control | What it does | Verdict |
|---|---|---|
| "Open in Gmail — just click Send" (`#sf-compose`, green) | Opens the complaint addressed + filled in Gmail compose (with the paste-fallback for oversized complaints) | KEEP — the lane's action |
| "Copy complaint — paste it into an email" (`#sf-copy`, orange) | Copies the complaint text for manual pasting into an email | **REMOVED per Michael's call, Oct 28** — this was SUPERFLUOUS-CANDIDATE #1 (Outlook v1.2.1 deleted its twin: the compose button already IS the action, and the textarea stays hand-selectable). Michael's reasoning: real users don't do anything with it; it might only suit very tech-savvy nerds going off-script, and they'd know to copy the text from the ready-to-send panel themselves. The orange legend entry went with it |
| OVHcloud web-form chip (`a.sf-ovh-btn`) | Links to OVH's abuse form when the host is OVHcloud | **SUPERSEDED in this build** — the whole OVH panel is now the form kit (see "Changed in this build"); the kit's Open-the-form button does this chip's job |
| Hyperscaler web-form chip (`a.sf-ovh-btn`, added post-audit Oct 28 with Michael's approval) | Same chip pattern for Google Cloud / AWS / Azure blocks: the emailed complaint stays, the chip links the provider's abuse form/report page | **SUPERSEDED in this build** — hyperscaler panels no longer build the email at all; the form kit replaced complaint + chip (see "Changed in this build") |

## Report sections (FTC · Safe Browsing · Forward · Google)

| Control | What it does | Verdict |
|---|---|---|
| FTC inner button (`#sf-report-ftc`) | Stashes the case, opens reportfraud.ftc.gov for the guided fill; the section's status line reports back into this section | **REMOVED per Michael's call (Oct 28, an hour after the SB flattening)** — same shape as SB: the section held only this button + its status line. The row itself now fires the lane via `actionRow`; the status prints under the row; the walkthrough lives in reportfill's on-site banner (see "Changed in this build") |
| Safe Browsing inner button (`#sf-report-sb`) | Stashes the case, opens Google's report-phish form for the guided fill | **REMOVED per Michael's call (Oct 28, test6 retest)** — the whole section held nothing but this duplicate; the section row itself now fires the lane via the accordion's new `actionRow` (see "Changed in this build"). The label-candidate question below is moot for SB; it still applies to FTC |
| Forward inner button (`#sf-fwd-phish`) | Drives Gmail's Forward and addresses it to APWG + CISA | **FLATTENED per Michael's call (Oct 28)** — the section is gone and the id now sits on the action row itself; the status-surface role survives intact: gmailForwardPhish rewrites the row's `.sf-acc-label` span ("Opening forward…", "Forward addressed…", failure diagnostics) without eating the ↗ glyph (see "Changed in this build") |
| "Report phishing to Google" inner button (`#sf-report-phish`, big-provider panels only) | Walks Gmail's own three-dot menu to the native report dialog | KEEP outright — same status-surface reason ("Opening Gmail's report dialog…", "Already reported ✓", diagnostics) |

**Label candidates (not removals):** the FTC and Safe Browsing inner buttons
repeat their section toggle's label word-for-word ("Report to FTC",
"Report to Google Safe Browsing"). Inside an open section, the button reads
as a second copy of the header the user just clicked. Outlook's pattern
gives the inner button its own action label ("Open the FTC form"). A
relabel ("Open the form — I'll guide you") would make the two-step
(toggle → button) feel like one flow instead of a duplicate.

## PID section — "Not Spam but still unwanted?"

| Control | What it does | Verdict |
|---|---|---|
| "Draft a data-deletion demand" (`#sf-demand-draft`, green) | Toggles the demand step (Send-to field, errand, letter, Open button) open/closed inside the section | **SUPERFLUOUS-CANDIDATE #2** — it is now a second collapse layer inside an already-collapsible accordion section: expand the section, then click again to reach the form. The section toggle could be the reveal (render the step open inside the section). Weaker than #1: Outlook kept its twin, and the toggle does carry the "— opens in Gmail" sub-line beside it |
| "Open <domain>'s website ↗" (`.sf-lookup-btn`) | Opens the sender company's site so the user can find the privacy address it publishes | KEEP — after the v1.0.64 chip removal this is load-bearing: it is the ONLY guidance path to fill Send-to |
| "Preview the letter ▸" toggle | Shows/hides the read-only letter preview | KEEP — small, optional, and the letter is what the user is about to send |
| "Open in Gmail — just click Send" (`#sf-demand-open`, green) | Opens the demand letter in Gmail compose, addressed to the pasted address | KEEP — the lane's action |
| Details-form "Save" (`.sa-df-save`, shared with the toolbar popup) | Saves name/email/state for the letter; validation vets on save | KEEP — shown only when details are missing |

## Removed in this build

- The "Copy complaint — paste it into an email" button (`#sf-copy`), its
  click handler, and the orange legend entry — **per Michael's call,
  Oct 28**, acting on this audit's lead superfluous candidate (see the
  Abuse complaint table above for his reasoning). The complaint textarea
  and the "Open in Gmail — just click Send" path are untouched.

## Changed in this build

- **Form kit replaces email + hint on form-only hosts** — per Michael's
  call, Oct 28: for hyperscaler cloud hosts (Google Cloud / AWS /
  Azure) **and OVHcloud**, the Abuse complaint section no longer builds
  an email complaint at all. Those desks deflect emailed complaints to
  their own abuse form anyway, so the email only handed them the
  excuse; for OVH the change removes the deflection excuse by filing
  through the form from the start. The section is now a yellow
  [now BLUE — see the color entry at the end of this section]
  "Abuse report — use their form" form kit: a prepared evidence block
  (summary paragraph; Source IP; Date/time (UTC); From; Subject;
  ingress Received line; full headers — lib `buildFormEvidence`) to
  paste into the form's details field, plus an
  "Open the \<provider\> abuse form" button. No email text, no
  Open-in-Gmail, no Heads-up chip on those panels. Detection is
  unchanged (lib `hyperscalerOf`; the v1.0.27 OVH contact/org match;
  hyperscaler wins if both ever fire). Normal-host panels keep the
  emailed complaint + Open in Gmail exactly as before.
  Tests: test-hyperscaler-hint.js.
- **Form-kit button now copies + opens** — per Michael's call,
  Oct 28, after his live test on a Google Cloud lure (he asked for
  "a button to do the ctrl-v"): the kit's single button is now
  "Copy evidence & open the \<provider\> abuse form". One click
  selects the evidence box and copies it (execCommand, with an
  async clipboard fallback), flips its label to the paste
  instructions for 6s, and opens the form — the user's only job
  on the form is Ctrl+V. The guidance note says so. This does NOT
  revive the cut orange "Copy complaint" button: that was the
  email lane, where Open in Gmail does the work; the form lane IS
  copy-and-paste, so the copy belongs here, folded into the one
  button instead of a second control. Shipped as test5.
  Tests: test-hyperscaler-hint.js (button assertion updated).
- **Safe Browsing: the row IS the button** — per Michael's call,
  Oct 28, in the test6 retest ("Do we need a nested button for
  google safe browsing?" → his pick: "the section title itself
  launches it"). The SB accordion section and its inner
  `#sf-report-sb` button are gone. makeAccordion gains
  `actionRow(id, toggleClass, label, onFire)`: a row styled like
  a section toggle but wearing a ↗ glyph instead of the ▸ caret,
  firing its handler on click — no expansion, nothing behind it.
  SB's row runs the same stashThenOpen (case stashed, then
  Google's report form opens filled); its status line sits
  directly under the row. This is a deliberate exception to
  the "expanding never fires" accordion contract: the section
  contained literally nothing else. Shipped as test7.
  Tests: test-v1064-accordion-pid.js (order check accepts
  actionRow; sf-report-sb pinned absent).
- **FTC: same flattening** — an hour later Michael asked the
  same question of the FTC section ("do we need the nested
  report to ftc buttons?") and ruled the same way. The FTC
  section and `#sf-report-ftc` are gone; its row is an actionRow
  running the same stashThenOpen to reportfraud.ftc.gov, status
  line under the row. The guided walkthrough was never in the
  panel — it is reportfill.js's banner on the FTC site — so
  nothing was lost. (This supersedes the earlier draft note
  that FTC would keep its two-step.) The remaining two-step
  sections are the ones with real content behind the door: the
  complaint/form kit, Report phishing to Google, and the PID
  demand. Shipped as test8. Tests: test-v1064-accordion-pid.js.
- **Forward: flattened too, status surface and all** — per
  Michael's call, Oct 28 ("same deal with forward to phish").
  The Forward section is gone; `sf-fwd-phish` is now the action
  row's own button id (actionRow gained an optional btnId), and
  actionRow labels ride in a `.sf-acc-label` span.
  gmailForwardPhish's four label writes (Opening…, failure,
  addressed, re-arm restore) go through a setLabel() helper
  that writes the span, so the ↗ glyph survives every state
  change; disabled/re-arm behavior unchanged. Shipped as
  test9. Tests: test-v1064-accordion-pid.js (Forward assertion:
  no section, actionRow + id + setLabel wiring pinned).
- **The "yellow" lanes are BLUE now** — Michael's call,
  Oct 28: the v1.0.63 deep gold #9e6a03 (bought for Chrome
  Auto Dark Mode survival) "looks like a flavor of baby
  diaper shit." He declined the bright-yellow +
  color-scheme-guard route in favor of a different color
  outright: Gmail blue #1a73e8 + white text (hover #1765cc) —
  white on saturated keeps the dark-mode survival, no
  guarding needed. The rename is total so the code doesn't
  lie: `.sf-btn-yellow` → `.sf-btn-blue`, `.sf-dot-yellow` →
  `.sf-dot-blue`, `showYellow` → `showBlue`, legend text and
  popup.html legend updated, the pale note tint #fef7e0 →
  Gmail's pale blue #e8f0fe. Lanes affected: FTC row, the
  complaint/form-kit section + its copy-and-open button, the
  PID section toggle. reportfill.js's on-site guide banners
  were NOT recolored (different surface; bright pale yellow,
  not the gold). Shipped as test10.

## Removed in this build (per the build order, not this audit)

- The PID registrar-abuse suggestion chip ("Registration record lists: … ·
  Use this address"), its RDAP fetch, and the "Looking up the domain's
  registration contact…" status text. A deletion demand goes to the company
  that emailed the user, at the address it publishes — never to a
  registrar's abuse desk.
