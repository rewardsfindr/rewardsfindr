# Firestore Indexes

Create this composite index in the Firebase Console (or via `firestore.indexes.json`).

## Required Index

| Collection Group | Field | Order |
|---|---|---|
| `offers` (subcollection under `users/{userId}`) | `merchantNameLower` | Ascending |
| `offers` | `expiresAt` | Ascending |

### Firebase Console
1. Go to Firestore → Indexes → Composite
2. Collection ID: `offers`
3. Add fields: `merchantNameLower` (Asc), `expiresAt` (Asc)
4. Collection scope: **Collection group**

### firestore.indexes.json (alternative)
```json
{
  "indexes": [
    {
      "collectionGroup": "offers",
      "queryScope": "COLLECTION_GROUP",
      "fields": [
        { "fieldPath": "merchantNameLower", "order": "ASCENDING" },
        { "fieldPath": "expiresAt",         "order": "ASCENDING" }
      ]
    }
  ]
}
```

## TTL Policy (Firestore TTL)

Enable TTL on the `offers` subcollection to auto-delete expired documents:
1. Firestore → Data → Select `offers` collection group
2. Set TTL field: `expiresAt`

This auto-purges stale offers without any Cloud Function needed.

## Data Structure

```
/users/{userId}/                     ← one doc per user
  offers/{offerId}                   ← scoped, never cross-user reads
    merchantName:       "Starbucks"
    merchantNameLower:  "starbucks"  ← used for prefix search
    normalizedMerchant: "starbucks"
    cashbackAmount:     4
    cashbackType:       "percent"
    bank:               "chase"
    cardName:           "Sapphire Preferred"
    expiresAt:          Timestamp    ← TTL field
    syncedAt:           Timestamp
```
