# RewardsFindr API

Backend API service for the RewardsFindr mobile app and Chrome extension.

## Architecture

This API acts as middleware between the clients (mobile app, Chrome extension) and Firebase:

```
Mobile App / Extension → API → Firebase (Firestore + Auth)
```

## Setup

### 1. Install Dependencies

```bash
cd api
npm install
```

### 2. Get Firebase Service Account Credentials

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project (`rewardsfindr-dev` or `rewardsfindr-prod`)
3. **Project Settings** (gear icon) → **Service Accounts** tab
4. Click **Generate new private key**
5. Download the JSON file

### 3. Configure Environment Variables

Create `.env` file in the `/api` folder:

```bash
cp .env.example .env
```

Fill in the values from your downloaded service account JSON:

```env
FIREBASE_PROJECT_ID=rewardsfindr-dev
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@rewardsfindr-dev.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY_HERE\n-----END PRIVATE KEY-----\n"

PORT=3001
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:8081,exp://localhost:8081
```

⚠️ **Important**: Keep the quotes around `FIREBASE_PRIVATE_KEY` and preserve the `\n` newline characters.

### 4. Run Locally

```bash
npm run dev
```

API will be available at `http://localhost:3001`

## API Endpoints

### Health Check
```
GET /health
```
Returns server status (no auth required).

### Authentication

#### Verify Token
```
POST /api/auth/verify
Content-Type: application/json

{
  "idToken": "<Firebase ID token from Google Sign-In>"
}
```
Exchanges a Google OAuth token for a Firebase custom token. Used by Chrome extension.

### Offers

#### Sync Offers (Protected)
```
POST /api/offers/sync
Authorization: Bearer <Firebase ID token>
Content-Type: application/json

{
  "offers": [
    {
      "merchant": "Target",
      "bank": "chase",
      "cardId": "chase_freedom_flex",
      "amount": 5,
      "expiry": "2026-12-31"
    }
  ]
}
```
Accepts scraped offers from Chrome extension and stores in Firestore.

#### Get User Offers (Protected)
```
GET /api/offers/:userId
Authorization: Bearer <Firebase ID token>
```
Retrieves all synced offers for the authenticated user.

## Environments

### Development
- Uses `rewardsfindr-dev` Firebase project
- Runs on `http://localhost:3001`
- CORS allows `localhost:8081` (Expo dev server)

### Production
- Uses `rewardsfindr-prod` Firebase project
- Deploy to Railway or Render
- CORS configured for production mobile app and extension

## Deployment

### Railway (Recommended)

1. Create account at [railway.app](https://railway.app)
2. New Project → Deploy from GitHub repo
3. Select `rewardsfindr/rewardsfindr` repo
4. Root directory: `/api`
5. Add environment variables from `.env`
6. Deploy

### Render (Free Alternative)

1. Create account at [render.com](https://render.com)
2. New Web Service → Connect GitHub repo
3. Root directory: `api`
4. Build command: `npm install`
5. Start command: `npm start`
6. Add environment variables
7. Deploy

## Security

- All offer sync/read endpoints require Firebase authentication
- Users can only access their own data
- Firebase Admin SDK validates all tokens server-side
- CORS restricted to known origins

## Firestore Data Model

```
/users/{uid}
  └── /offers/{offerId}
       ├── merchant: string
       ├── bank: string
       ├── cardId: string
       ├── amount: number
       ├── expiry: string (ISO date)
       ├── activatedAt: timestamp
       └── source: "extension" | "manual"
```
