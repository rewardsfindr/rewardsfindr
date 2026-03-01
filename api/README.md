# RewardsFindr API

Express REST API for RewardsFindr mobile and web apps.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Get Firebase service account key:**
   - Go to Firebase Console → Project Settings → Service Accounts
   - Click "Generate new private key"
   - Save as `api/serviceAccountKey.json`
   - This file is gitignored for security

3. **Start the server:**
   ```bash
   npm run dev
   ```

## Endpoints

### GET /api/health
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-02-28T..."
}
```

### GET /api/search?q=storename
Search for best credit cards for a store.

**Example:**
```bash
curl http://localhost:3001/api/search?q=amazon
```

**Response:**
```json
{
  "store": "Amazon",
  "category": "shopping",
  "quality": "exact",
  "cards": [...]
}
```

### POST /api/offers/sync
Sync offers from Chrome extension to Firestore.

**Headers:**
- `Authorization: Bearer <firebase-id-token>`
- `Content-Type: application/json`

**Body:**
```json
{
  "offers": [
    {
      "merchantName": "Starbucks",
      "cashbackAmount": 5,
      "cashbackType": "percent",
      "category": "dining",
      "isActivated": false
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "synced": 68,
  "skipped": 0,
  "total": 68
}
```

## Development

```bash
npm run dev  # Start with nodemon (auto-restart)
```
