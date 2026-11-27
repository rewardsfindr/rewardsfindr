# Retire Cloud Run & unused GitHub deployments (ops)

Code no longer deploys or runs a RewardsFindr Express API. The `api/` package, `deploy-dev.yml`, and API CI jobs were removed from this repo (PR #86).

This monorepo also must **not** expect Vercel / GitHub Environment deploys. Marketing stays on [`rewardsfindr-web`](https://github.com/rewardsfindr/rewardsfindr-web) → rewardsfindr.com. PRs here only need CI (mobile tests).

Deleting GCP resources remains **manual** (console). Agents cannot delete Environments with the integration token.

## Why PRs showed “No deployments”

GitHub previously had Environments named **Preview** and **Production** on this repo (created by past `vercel[bot]` deployments). While those Environments existed, the PR sidebar showed Deployments even though nothing deployed anymore — hence “This branch has not been deployed / No deployments.”

There is no required status check named Deploy, no `vercel.json`, and no Cloud Run workflow left in `.github/workflows/`.

## Environments cleanup (done 2026-11-26)

**Preview** and **Production** were deleted from **Settings → Environments**. New PRs should no longer show an empty Deployments expectation.

If those Environments reappear (e.g. a stray Vercel link recreates them):

1. Open **Settings → Environments**:  
   https://github.com/rewardsfindr/rewardsfindr/settings/environments
2. Delete **Preview** and **Production** again.

Optional follow-ups (still open):

1. In the Vercel dashboard, unlink / remove any project that still points at **`rewardsfindr/rewardsfindr`**. Keep the project for **`rewardsfindr-web`** unchanged.
2. Optional follow-up PR: remove root `.vercelignore` only after Vercel is fully disconnected from this repo (it currently ignores all paths so a stray link cannot rebuild).

Historical `vercel[bot]` deployment *records* may still appear in the Deployments API; that does not mean Environments need deleting again.

## GCP service (optional)

- Project: the GCP project that hosted `rewardsfindr-api`
- Region: `us-central1`
- Service name: `rewardsfindr-api`

```bash
gcloud run services delete rewardsfindr-api --region us-central1 --project YOUR_PROJECT_ID
```

Or: Cloud Console → Cloud Run → `rewardsfindr-api` → Delete.

## Secrets (optional cleanup)

These were wired into the old Cloud Run deploy workflow. Remove them from Secret Manager if unused elsewhere:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `NODE_ENV`
- `ALLOWED_ORIGINS`

Also remove the GitHub Actions secret `GCP_SA_KEY_DEV` if no other workflows need it.

## Rollback note

If you need the old HTTP surface again, restore the pre-removal commit that contained `api/` and `.github/workflows/deploy-dev.yml`, then redeploy. Mobile product use does not depend on that service.
