# Retire Cloud Run (ops)

Code no longer deploys or runs a RewardsFindr Express API. The `api/` package, `deploy-dev.yml`, and API CI jobs were removed from this repo.

Deleting the GCP resources is **manual** (console or `gcloud`). Do this when you are sure nothing outside this repo still needs the service.

## Service

- Project: the GCP project that hosted `rewardsfindr-api`
- Region: `us-central1`
- Service name: `rewardsfindr-api`

```bash
gcloud run services delete rewardsfindr-api --region us-central1 --project YOUR_PROJECT_ID
```

Or: Cloud Console → Cloud Run → `rewardsfindr-api` → Delete.

## Secrets (optional cleanup)

These were wired into the Cloud Run deploy workflow. Remove them from Secret Manager if unused elsewhere:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `NODE_ENV`
- `ALLOWED_ORIGINS`

Also remove the GitHub Actions secret `GCP_SA_KEY_DEV` if no other workflows need it.

## Rollback note

If you need the old HTTP surface again, restore the pre-removal commit that contained `api/` and `.github/workflows/deploy-dev.yml`, then redeploy. Mobile product use does not depend on that service.
