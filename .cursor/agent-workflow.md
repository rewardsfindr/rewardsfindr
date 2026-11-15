# RewardsFindr agent workflow

One slice at a time. The chat you are in coordinates. It does not redo the specialist's work.

Start an agent by name: `/planner`, `/implementer`, or `/reviewer`. A subagent does not see this chat. Paste the prior agent's written result into the request.

A pull request is merged only after `/reviewer` writes `Approved`. The reviewer does not merge. The chat that opened the pull request does not merge before that verdict.

## Order

1. Planner, when the next slice is not already decided.
2. Researcher, only when a fact outside the repo is missing.
3. Architect, only when the slice changes where data lives, who parses it, or what is stored.
4. Designer, only when the slice is a screen.
5. Implementer, for the one slice the planner named.
6. Reviewer, after a pull request exists.

## Roster

| Agent | Status | Owns | Does not |
| --- | --- | --- | --- |
| Planner | Built. `/planner` | The next slice: decision, done checks, out of scope | Edit files |
| Researcher | Not built | Bank page changes, offer terms, competitor behavior | Edit files or choose the slice |
| Architect | Not built | Data model, sync boundary, storage location | Edit files or redesign screens |
| Designer | Not built | One screen's interaction | Edit code or change the data model |
| Implementer | Built. `/implementer` | One branch and the code for the agreed slice | Add the next idea |
| Reviewer | Built. `/reviewer` | The diff, the pull request description, and the guidelines in `.cursor/agents/review-guidelines.md`. Writes `Approved` or `Changes requested` | Edit the product code, or merge |

## Product constraints every agent keeps

- Offers for a signed-in user live on the phone, keyed by that user's id. Firebase is for sign-in.
- A sync replaces one card. Amex also replaces one phase, eligible or enrolled. The id is the bank's offer id.
- A read that fails does not wipe the card already saved.
- A partial Chase response must not wipe a saved card.
- The logged-in bank page is not uploaded. Chase sends structured tiles. Amex sends the offers payload, parsed into the same snapshot.
- An offer with no expiry stays searchable and is not "expiring soon."
- Search passes only the store name. The results screen reads offers from the phone. The catalog is not placed in a route param.
- A message shown to the user does not include a bank option id, account id, cookie, session token, or response body.
- One pull request per slice.
