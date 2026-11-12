# Firestore Indexes

Create this composite index in the Firebase Console (or via `firestore.indexes.json`).

## Search

Merchant search is a prefix query on `merchantNameLower` in the user's offers subcollection. That field is indexed automatically. Expired offers are filtered by the API after the query, so an offer with no `expiresAt` (unknown expiry) is still returned.

The composite index on `merchantNameLower` + `expiresAt` is no longer used by search.

## Chase snapshot

Replacing one card's offers queries `bank` + `cardName` + `phase`. Create that composite index on the `offers` collection group if Firestore asks for it when the first snapshot runs.

### Firebase Console
1. Go to Firestore → Indexes → Composite
2. Collection ID: `offers`
3. Add fields: `bank` (Asc), `cardName` (Asc), `phase` (Asc)
4. Collection scope: **Collection group**

### firestore.indexes.json (alternative)
```json
{
  "indexes": [
    {
      "collectionGroup": "offers",
      "queryScope": "COLLECTION_GROUP",
      "fields": [
        { "fieldPath": "bank",     "order": "ASCENDING" },
        { "fieldPath": "cardName", "order": "ASCENDING" },
        { "fieldPath": "phase",    "order": "ASCENDING" }
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
