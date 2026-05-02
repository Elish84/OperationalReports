import admin from "firebase-admin";
admin.initializeApp();

import { askInsights as askInsightsFlow, ai, embedder, extractRecordText } from './ai.js';
import { onCallGenkit } from 'firebase-functions/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError, onRequest } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';

// Set global options for 2nd Gen functions to match project region
setGlobalOptions({ region: 'me-west1' });

/**
 * Auth helpers
 */
function assertAuthed(auth) {
  if (!auth) {
    throw new HttpsError("unauthenticated", "Login required");
  }
}

async function assertAdmin(uid) {
  const ref = admin.firestore().collection("admins").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("permission-denied", "Not an admin");
  }
}

/**
 * Migration of legacy getStats to v2
 */
export const getStats = onCall(async (request) => {
  assertAuthed(request.auth);
  await assertAdmin(request.auth.uid);

  const data = request.data || {};
  const groupBy = data.groupBy || "type";
  const daysBack = Number(data.daysBack || 30);

  const allowed = new Set(["type", "sector", "role", "name"]);
  if (!allowed.has(groupBy)) {
    throw new HttpsError("invalid-argument", "Bad groupBy");
  }

  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  const q = admin.firestore()
    .collection("reviews")
    .where("createdAt", ">=", since);

  const snap = await q.get();

  const counts = {};
  snap.forEach(doc => {
    const d = doc.data() || {};
    let key = "לא ידוע";
    if (groupBy === "type") key = d.type || "לא ידוע";
    if (groupBy === "sector") key = d.meta?.sector || "לא ידוע";
    if (groupBy === "role") key = d.meta?.role || "לא ידוע";
    if (groupBy === "name") key = d.meta?.name || "לא ידוע";
    counts[key] = (counts[key] || 0) + 1;
  });

  return { counts, total: snap.size, groupBy, daysBack };
});

/**
 * AI Insights Flow exported using Genkit 1.x helper
 */
export const askInsights = onCallGenkit(
  {
    secrets: ["OPENAI_API_KEY"],
  },
  askInsightsFlow
);

/**
 * Background trigger to index reports on creation
 */
export const indexReportOnCreate = onDocumentCreated({
    document: 'reviews/{id}',
    region: 'me-west1',
    secrets: ['OPENAI_API_KEY']
}, async (event) => {
    const data = event.data.data();
    const text = extractRecordText(data);
    if (!text.trim()) return;

    const embeddingResponse = await ai.embed({
        embedder: embedder,
        content: text,
    });
    const embeddingArray = embeddingResponse[0].embedding || embeddingResponse[0].vector;
    
    // CRITICAL: Convert plain array to Firestore Vector type
    const embedding = admin.firestore.FieldValue.vector(embeddingArray);
    
    await event.data.ref.update({ embedding });
});

/**
 * Background trigger to index reports on update
 */
export const indexReportOnUpdate = onDocumentUpdated({
    document: 'reviews/{id}',
    region: 'me-west1',
    secrets: ['OPENAI_API_KEY']
}, async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();

    if (extractRecordText(before) === extractRecordText(after)) return;

    const text = extractRecordText(after);
    if (!text.trim()) return;

    const embeddingResponse = await ai.embed({
        embedder: embedder,
        content: text,
    });
    const embeddingArray = embeddingResponse[0].embedding || embeddingResponse[0].vector;
    
    // CRITICAL: Convert plain array to Firestore Vector type
    const embedding = admin.firestore.FieldValue.vector(embeddingArray);
    
    await event.data.after.ref.update({ embedding });
});

/**
 * [TEMPORARY] Maintenance function to index all existing records.
 */
export const runManualRepair = onRequest({
    region: 'me-west1',
    secrets: ['OPENAI_API_KEY'],
    memory: '1Gi',
    timeoutSeconds: 540
}, async (req, res) => {
    const startAfterId = req.query.startAfter;
    
    try {
        let query = admin.firestore().collection('reviews')
            .orderBy(admin.firestore.FieldPath.documentId())
            .limit(50);

        if (startAfterId) {
            query = query.startAfter(startAfterId);
        }

        const snap = await query.get();

        if (snap.empty) {
            return res.status(200).send("<h1>Success!</h1> No more records to process.");
        }

        let count = 0;
        let lastDocId = "";

        for (const doc of snap.docs) {
            try {
                const data = doc.data();
                const text = extractRecordText(data);
                if (!text.trim()) continue;

                const embeddingResponse = await ai.embed({
                    embedder: embedder,
                    content: text,
                });
                const embeddingArray = embeddingResponse[0].embedding || embeddingResponse[0].vector;
                
                // CRITICAL: Force update to Vector type
                const embedding = admin.firestore.FieldValue.vector(embeddingArray);

                await doc.ref.update({ embedding });
                count++;
                lastDocId = doc.id;
            } catch (innerErr) {
                console.error(`Failed to process document ${doc.id}:`, innerErr);
            }
        }

        // Build the next URL
        const protocol = req.protocol;
        const host = req.get('host');
        const nextUrl = `${protocol}://${host}${req.path}?startAfter=${lastDocId}`;

        res.status(200).send(`
            <h1>Batch Complete!</h1>
            <p>Processed ${count} records in this batch.</p>
            <p>Last processed ID: ${lastDocId}</p>
            <hr>
            <a href="${nextUrl}" style="padding: 15px 30px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; font-size: 20px;">
                לחץ כאן כדי להמשיך ל-50 הרשומות הבאות
            </a>
        `);
      } catch (err) {
        console.error("Batch re-index failed:", err);
        res.status(500).send(`Error: ${err.message}`);
    }
});

/**
 * Unified diagnostic function for AI Insights
 */
export const getAIDiagnostics = onCall(async (request) => {
    assertAuthed(request.auth);
    await assertAdmin(request.auth.uid);

    const snap = await admin.firestore().collection('reviews').get();
    let total = snap.size;
    let withEmbedding = 0;
    let sample = null;

    snap.forEach(doc => {
        const data = doc.data();
        let isVec = false;
        if (data.embedding) {
            if (Array.isArray(data.embedding) && data.embedding.length === 1536) {
                isVec = true;
            } else if (typeof data.embedding.toArray === 'function' && data.embedding.toArray().length === 1536) {
                isVec = true;
            }
        }
        if (isVec) {
            withEmbedding++;
        }
        if (!sample) sample = { id: doc.id, data };
    });

    return {
        total,
        withEmbedding,
        sample: sample ? {
            id: sample.id,
            keys: Object.keys(sample.data),
            hasMeta: !!sample.data.meta,
            metaKeys: sample.data.meta ? Object.keys(sample.data.meta) : [],
            embeddingType: typeof sample.data.embedding,
            isEmbeddingObj: typeof sample.data.embedding === 'object' && sample.data.embedding !== null,
            isVectorValue: sample.data.embedding && typeof sample.data.embedding.toArray === 'function',
            embeddingLength: Array.isArray(sample.data.embedding) ? sample.data.embedding.length : (sample.data.embedding && typeof sample.data.embedding.toArray === 'function' ? sample.data.embedding.toArray().length : null)
        } : null,
        message: withEmbedding === total ? "DATABASE FULLY INDEXED" : `ONLY ${withEmbedding}/${total} INDEXED`
    };
});
