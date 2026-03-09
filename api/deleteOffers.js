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
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });

    const db = admin.firestore();
    console.log('Fetching offers collection...');

    const snapshot = await db.collection('offers').get();
    console.log(`Found ${snapshot.size} docs`);

    if (snapshot.size === 0) {
      console.log('Collection already empty.');
      return;
    }

    // Firestore batch limit is 500 — chunk if needed
    const docs = snapshot.docs;
    let deleted = 0;
    for (let i = 0; i < docs.length; i += 500) {
      const batch = db.batch();
      docs.slice(i, i + 500).forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      deleted += Math.min(500, docs.length - i);
      console.log(`Deleted ${deleted}/${docs.length}...`);
    }

    console.log(`✅ Done — deleted ${deleted} docs from offers collection`);
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

main();
