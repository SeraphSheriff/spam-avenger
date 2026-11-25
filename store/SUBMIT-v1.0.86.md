# Spam Avenger for Gmail — v1.0.86 store submission sheet

Prepared 2026-11-24. v1.0.86 is a one-bug fix release. Firefox publishes it as 1.0.86 (incrementing from its live 1.0.85), so the internal build number and the Firefox published number agree for once. Chrome is NOT part of this publish: it stays at 1.0.75 (pending review) with 1.0.74 live. The store-number sync (Chrome jumping to meet Firefox's number) is deferred to the next Chrome publish, whenever the owner calls one.

## Where things stand

- **v1.0.86 is built and green:** 51 suites, 1775 tests, 0 failures. Mozilla validator: 0 errors. Package: `spam-avenger-gmail-v1.0.86.zip` (219,005 bytes, 13 files, manifest inside reads 1.0.86).
- **The bug:** the panel crashed with "Something broke: pasteWarnEl is not defined" on any message whose host lane is a hyperscaler form lane with an email door (the AWS Trust & Safety and Alibaba Cloud "Or email it instead" sections). The `pasteWarnEl` helper was defined inside the domain-trace rendering function, but the email-door call site lives outside that scope, so the call threw and the whole panel died. The owner hit it live on Nov 24, 2026.
- **The fix:** the helper's definition (with its comment block) moved to the top of the panel's main render function, where all four call sites can reach it. The call sites and the helper's behavior are unchanged.
- **Regression coverage:** a new suite (tests/test-v1086-pastewarn-scope.js) brace-maps the real function scopes in content.js and asserts the definition sits where every call site can reach it, and evals the moved helper against stubs to prove its behavior is identical. It failed on the pre-fix source with exactly the scope failure and passes on the fixed source.

## Submission status

- **Firefox AMO:** v1.0.86 submitted Nov 24, 2026 (the increment from live 1.0.85).
- **Chrome Web Store:** not part of this publish. No v1.0.86 package was submitted; the store still carries 1.0.74 live with 1.0.75 pending review (verified on the dashboard Nov 24, 2026).
- **GitHub:** this push (v1.0.86 source, tests, and this note).

## Notes

- The code in this release is identical in behavior to internal v1.0.84 (published as Chrome 1.0.75 / Firefox 1.0.85) apart from the scope fix, the version pins, and the new regression suite.
