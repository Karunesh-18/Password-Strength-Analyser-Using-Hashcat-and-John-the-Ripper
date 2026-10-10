import { getDb } from "./db";

const COLLECTION = "analysis_logs";
const MAX_RECENT = 50;

/**
 * Persists one /api/analyze result when storage is configured. Best-effort:
 * no-ops silently if MONGODB_URI isn't set, and the caller decides what to
 * do if this throws (storage must never break the analyze response).
 */
export async function logAnalysis(result: unknown): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.collection(COLLECTION).insertOne({ ...(result as object), loggedAt: Date.now() });
}

export async function listRecentLogs(limit = MAX_RECENT) {
  const db = await getDb();
  if (!db) throw new Error("Set MONGODB_URI to enable history");
  return db
    .collection(COLLECTION)
    .find()
    .sort({ loggedAt: -1 })
    .limit(limit)
    .toArray();
}
