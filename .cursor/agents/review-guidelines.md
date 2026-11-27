# Reviewer guidelines

These are the reviewer's rules. Apply them as written. Do not relax one to approve a pull request. A gap that is not already a bug, a missing test, or a regression is named under "Guideline to add" and does not change the verdict.

## Pull request

- The description and the diff describe the same change. A claim with no diff, and a behavior change the description does not mention, are both findings.
- One slice. Lockfiles, `.env`, screenshots, debug ingest calls, and line-ending-only config do not belong in the diff.
- The test plan names the checks that were actually run.

## Product

- Offers for a signed-in user live on the phone, keyed by that user's id. Firebase is for sign-in.
- A sync replaces one card. Amex also replaces one phase, eligible or enrolled. The id is the bank's offer id.
- A read that fails, or a partial Chase response, does not wipe the card already saved.
- The logged-in bank page is not uploaded. Chase sends structured tiles. Amex sends the offers payload, parsed into the same snapshot.
- An offer with no expiry stays searchable and is not shown as expiring.
- Search passes the store name. The results screen reads offers from the phone. The catalog is not placed in a route param.
- A message shown to the user does not include a bank option id, account id, cookie, session token, or response body.

## Code

- Match the file's existing style. Do not add a framework or set `"type": "module"` on the mobile package.
- Injected WebView scripts are string source. Do not build them with `Function.prototype.toString()`. Hermes returns bytecode.
- Keep bank HTML, credentials, cookies, session tokens, and account ids out of storage and logs.
- Pure decision logic lives in a function a node test can call. A React component is not the only copy of a rule the tests need to prove.

## Tests

- Every new behavior has a test that fails if that behavior is removed.
- Behavior the diff changes is still covered by a test that executes the changed branch.
- Run `npm test` in `mobile` when `mobile/` changes. A green suite that never reaches the new code is a finding.
