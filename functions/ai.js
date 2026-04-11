import { genkit, z } from 'genkit';
import { openAI } from '@genkit-ai/compat-oai/openai';
import { enableFirebaseTelemetry } from '@genkit-ai/firebase';

// Initialize Telemetry for Firebase/Google Cloud
enableFirebaseTelemetry();

// Initialize Genkit with OpenAI plugin
export const ai = genkit({
  plugins: [
    openAI(), // Will automatically use OPENAI_API_KEY from environment/secrets
  ],
});

// Correctly define the embedder reference using the plugin's helper
export const embedder = openAI.embedder('text-embedding-3-small');

/**
 * Normalizes a report into a text string for embedding.
 * EXPORTED for reuse in index.js
 */
export function extractRecordText(data) {
  const parts = [];
  if (data.type) parts.push(`סוג: ${data.type}`);
  if (data.meta?.sector) parts.push(`גזרה: ${data.meta.sector}`);
  if (data.meta?.role) parts.push(`תפקיד: ${data.meta.role}`);
  if (data.exerciseDescription) parts.push(`תיאור: ${data.exerciseDescription}`);
  if (data.notes) parts.push(`הערות: ${data.notes}`);
  
  if (data.keep && data.keep.length) parts.push(`נקודות לשימור: ${data.keep.join(", ")}`);
  if (data.improve && data.improve.length) parts.push(`נקודות לשיפור: ${data.improve.join(", ")}`);

  return parts.join("\n");
}

/**
 * Flow to answer questions based on reports.
 */
export const askInsights = ai.defineFlow(
  {
    name: 'askInsights',
    inputSchema: z.object({
      question: z.string(),
      filters: z.object({
        sector: z.string().nullable().optional(),
        type: z.string().nullable().optional(),
        role: z.string().nullable().optional(),
        dateRange: z.object({
          start: z.string().nullable().optional(),
          end: z.string().nullable().optional()
        }).nullable().optional()
      }).nullable().optional()
    }),
    authPolicy: async (auth) => {
      if (!auth) throw new Error('Unauthenticated');
      const adminSDK = (await import('firebase-admin')).default;
      const snap = await adminSDK.firestore().collection("admins").doc(auth.uid).get();
      if (!snap.exists) throw new Error('Permission denied: not an admin');
    },
  },
  async (input) => {
    const { question, filters } = input;
    
    // 1. Generate embedding for query
    const embeddingResponse = await ai.embed({
      embedder: embedder,
      content: question,
    });

    // Genkit 1.x can return vectors in a few ways depending on the plugin.
    // Based on logs, it returns an array of objects with an 'embedding' property.
    let questionVector;
    if (Array.isArray(embeddingResponse)) {
      questionVector = embeddingResponse[0].embedding || embeddingResponse[0].vector;
    } else if (embeddingResponse.values) {
      questionVector = embeddingResponse.values;
    }

    if (!questionVector || questionVector.length < 100) {
      console.error('Unexpected embedding format:', JSON.stringify(embeddingResponse).substring(0, 200));
      throw new Error(`Failed to generate a valid embedding vector. Received dimension: ${questionVector?.length || 0}`);
    }

    console.log(`[Flow] Successfully generated embedding. Dimension: ${questionVector.length}`);

    // 2. Hybrid Retrieval (Filters + Vector)
    const admin = (await import('firebase-admin')).default;
    let query = admin.firestore().collection('reviews');

    // Apply metadata filters if provided
    if (filters?.sector) query = query.where('meta.sector', '==', filters.sector);
    if (filters?.type) query = query.where('type', '==', filters.type);
    if (filters?.role) query = query.where('meta.role', '==', filters.role);
    if (filters?.dateRange?.start) {
        query = query.where('createdAt', '>=', new Date(filters.dateRange.start));
    }

    // Perform Vector Search within pre-filtered results
    // Ensure we pass the raw array (questionVector)
    const vectorQuery = query.findNearest('embedding', admin.firestore.FieldValue.vector(questionVector), {
      limit: 15,
      distanceMeasure: 'COSINE',
    });

    const snap = await vectorQuery.get();
    const records = snap.docs.map(doc => {
      const d = doc.data();
      return {
        id: doc.id,
        date: d.createdAt?.toDate().toISOString().split('T')[0] || 'Unknown',
        type: d.type,
        text: extractRecordText(d)
      };
    });

    if (records.length === 0) {
      return {
        answer: "לא נמצא מספיק מידע להפקת תובנות",
        confidence: "נמוך",
        sources: []
      };
    }

    // 3. LLM Generation with Strict Prompt
    const { text: answer } = await ai.generate({
      model: openAI.model('gpt-4o'),
      prompt: `
      אתה אנליסט מבצעי של גדוד 8109. תפקידך להפיק תובנות מדוחות מבצעיים.
      
      הוראות מחמירות:
      1. ענה אך ורק על בסיס הרשומות המצורפות.
      2. אם אין מספיק מידע כדי לענות בצורה מקצועית, אמור במפורש: "לא נמצא מספיק מידע להפקת תובנות".
      3. אל תמציא עובדות או דמויות.
      4. וודא שהתשובה בעברית תקנית ומקצועית.
      
      לוגיקת תובנות:
      - בצע Clustering (קיבוץ) של בעיות חוזרות על פני רשומות שונות.
      - דרג את התובנות לפי תדירות הופעה והשפעה מבצעית.
      - אל תחזיר סיכומים גנריים.
      
      מבנה התשובה (חובה):
      1. תובנות מרכזיות (3–5 תובנות מנומקות)
      2. דוגמאות מהשטח (ציין תאריכים וסוגי פעילות)
      3. רמת ביטחון (גבוה/בינוני/נמוך)
      
      השאלה: ${question}
      
      הרשומות:
      ${JSON.stringify(records, null, 2)}
      `,
    });

    return {
      answer,
      records: records // For Admin Debug Mode
    };
  }
);
