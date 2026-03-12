// TEMP SCRIPT — delete after use
// Run: node deleteOffers.js from the api folder
import dotenv from 'dotenv';
dotenv.config();
import admin from 'firebase-admin';

async function main() {
  try {
    console.log('Connecting to Firebase project:', process.env.FIREBASE_PROJECT_ID);

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\r\n/g, '\n').replace(/\\n/g, '\n'),
      }),
    });

    const db = admin.firestore();
    console.log('Fetching all users...');

    const usersSnapshot = await db.collection('users').get();
    console.log(`Found ${usersSnapshot.size} users`);

    let totalDeleted = 0;

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const offersSnapshot = await db.collection('users').doc(userId).collection('offers').get();

      if (offersSnapshot.size === 0) {
        console.log(`User ${userId}: no offers, skipping`);
        continue;
      }

      const docs = offersSnapshot.docs;
      let deleted = 0;
      for (let i = 0; i < docs.length; i += 500) {
        const batch = db.batch();
        docs.slice(i, i + 500).forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        deleted += Math.min(500, docs.length - i);
      }

      console.log(`✅ User ${userId}: deleted ${deleted} offers`);
      totalDeleted += deleted;
    }

    console.log(`\n✅ Done — deleted ${totalDeleted} total offers across all users`);
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

main();
