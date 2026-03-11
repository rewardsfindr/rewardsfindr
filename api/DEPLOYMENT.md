# Cloud Run Deployment Guide

## Projects
- **Dev:** `rewardsfindr-dev`
- **Prod:** `rewardsfindr-prod`

## Prerequisites
1. [Install Google Cloud CLI](https://cloud.google.com/sdk/docs/install)
2. Authenticate: `gcloud auth login`
3. Enable APIs on both projects:
   - Cloud Run API
   - Cloud Build API
   - Secret Manager API

---

## 1. First-Time Setup (run once per project)

### Set project
```bash
# Dev
gcloud config set project rewardsfindr-dev

# Prod
gcloud config set project rewardsfindr-prod
```

### Store secrets in Secret Manager
Run for each project, replacing values accordingly:
```bash
echo -n "your-value" | gcloud secrets create FIREBASE_PROJECT_ID --data-file=-
echo -n "your-value" | gcloud secrets create FIREBASE_CLIENT_EMAIL --data-file=-
echo -n "your-value" | gcloud secrets create FIREBASE_PRIVATE_KEY --data-file=-
echo -n "development" | gcloud secrets create NODE_ENV --data-file=-
echo -n "https://your-allowed-origin.com" | gcloud secrets create ALLOWED_ORIGINS --data-file=-
```

---

## 2. Deploy to Dev
```bash
gcloud config set project rewardsfindr-dev

gcloud run deploy rewardsfindr-api \
  --source ./api \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-secrets=FIREBASE_PROJECT_ID=FIREBASE_PROJECT_ID:latest,FIREBASE_CLIENT_EMAIL=FIREBASE_CLIENT_EMAIL:latest,FIREBASE_PRIVATE_KEY=FIREBASE_PRIVATE_KEY:latest,NODE_ENV=NODE_ENV:latest,ALLOWED_ORIGINS=ALLOWED_ORIGINS:latest
```

## 3. Deploy to Prod
```bash
gcloud config set project rewardsfindr-prod

gcloud run deploy rewardsfindr-api \
  --source ./api \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-secrets=FIREBASE_PROJECT_ID=FIREBASE_PROJECT_ID:latest,FIREBASE_CLIENT_EMAIL=FIREBASE_CLIENT_EMAIL:latest,FIREBASE_PRIVATE_KEY=FIREBASE_PRIVATE_KEY:latest,NODE_ENV=NODE_ENV:latest,ALLOWED_ORIGINS=ALLOWED_ORIGINS:latest
```

---

## 4. Updating a Secret
```bash
echo -n "new-value" | gcloud secrets versions add SECRET_NAME --data-file=-
```

---

## 5. View Logs
```bash
gcloud run services logs read rewardsfindr-api --region us-central1
```

---

## Notes
- Cloud Run sets `PORT` automatically — do not add it as a secret.
- `--source ./api` uses Cloud Build to build the Docker image — no local Docker needed.
- Auto-deploy to dev on push to `main` is handled by `.github/workflows/deploy-dev.yml`.
