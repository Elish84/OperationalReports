import admin from "firebase-admin";
import { genkit } from 'genkit';
import { openAI } from '@genkit-ai/compat-oai/openai';

// Standalone maintenance script to index existing records.
// This script uses Application Default Credentials (ADC).
// Ensure you have run 'gcloud auth application-default login' if running locally.

admin.initializeApp();

const ai = genkit({
  plugins: [
    openAI({ apiKey: process.env.OPENAI_API_KEY }),
  ],
});

const db = admin.firestore();

async function indexAll() {
  console.log("--- Starting full re-indexing ---");
  try {
    const snap = await db.collection("reviews").get();
    console.log(`Found ${snap.size} records in Firestore.`);

    for (const doc of snap.docs) {
      const data = doc.data();
      
      // We skip records that already have embeddings to save costs and time
      if (data.embedding) {
          console.log(`Skipping [${doc.id}] - Already indexed.`);
          continue;
      }

      // Extract text as defined in logic
      const text = [
        data.type,
        data.meta?.sector,
        data.meta?.role,
        data.exerciseDescription,
        data.notes
      ].filter(Boolean).join(' ');

      if (!text.trim()) {
          console.log(`Skipping [${doc.id}] - No indexable text found.`);
          continue;
      }

      try {
        console.log(`Indexing [${doc.id}]...`);
        const embedding = await ai.embed({
          model: 'openai/text-embedding-3-small',
          content: text,
        });

        await doc.ref.update({ embedding });
        console.log(`Successfully indexed [${doc.id}]`);
      } catch (e) {
        console.error(`Error on OpenAI/Firestore update for [${doc.id}]:`, e.message);
      }
    }
    console.log("--- Re-indexing Complete ---");
  } catch (err) {
    console.error("FATAL ERROR:", err.message);
    if (err.message.includes("Could not load the default credentials")) {
        console.log("\nTIP: Please run 'gcloud auth application-default login' first to authenticate.");
    }
  }
}

indexAll();
