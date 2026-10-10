import { ObjectId } from "mongodb";
import { getDb } from "./db";
import { encrypt, decrypt } from "./vault-crypto";
import { scorePassword, type HeuristicResult } from "./heuristic";
import { hashPassword } from "./hash";
import { runCrackers } from "./crack";
import { buildVerdict, type Verdict } from "./verdict";

// ponytail: no per-entry auth / master password — this is a single shared
// vault. Anyone who can reach the app (and whoever configured MONGODB_URI)
// can list/reveal/delete every entry. Fine for a local single-user lab tool;
// add a session gate before exposing this over a network or to more than
// one person.

const COLLECTION = "vault_entries";
const CRACK_ALGO = "sha256" as const; // what a real crack test hashes/attacks against

export type VaultEntry = {
  _id: string;
  label: string;
  username?: string;
  grade: HeuristicResult;
  lastVerdict?: Verdict;
  cracked?: boolean;
  createdAt: number;
};

async function collection() {
  const db = await getDb();
  if (!db) return null;
  return db.collection(COLLECTION);
}

function toPublic(doc: {
  _id: ObjectId;
  label: string;
  username?: string;
  grade: HeuristicResult;
  lastVerdict?: Verdict;
  cracked?: boolean;
  createdAt: number;
}): VaultEntry {
  const { _id, encPassword, ...rest } = doc as typeof doc & { encPassword?: string };
  void encPassword; // never sent to callers
  return { _id: _id.toString(), ...rest };
}

export async function addEntry(input: {
  label: string;
  username?: string;
  password: string;
}): Promise<VaultEntry> {
  const col = await collection();
  if (!col) throw new Error("Set MONGODB_URI to enable the vault");

  const grade = scorePassword(input.password);
  const doc = {
    label: input.label,
    username: input.username,
    encPassword: encrypt(input.password),
    grade,
    createdAt: Date.now(),
  };
  const { insertedId } = await col.insertOne(doc);
  return toPublic({ ...doc, _id: insertedId });
}

export async function listEntries(): Promise<VaultEntry[]> {
  const col = await collection();
  if (!col) throw new Error("Set MONGODB_URI to enable the vault");
  const docs = await col.find().sort({ createdAt: -1 }).toArray();
  return docs.map((d) =>
    toPublic(
      d as unknown as Parameters<typeof toPublic>[0]
    )
  );
}

export async function deleteEntry(id: string): Promise<void> {
  const col = await collection();
  if (!col) throw new Error("Set MONGODB_URI to enable the vault");
  await col.deleteOne({ _id: new ObjectId(id) });
}

/** Decrypts and returns the plaintext once. Server-side only — never cache or log the result. */
export async function revealEntry(id: string): Promise<string> {
  const col = await collection();
  if (!col) throw new Error("Set MONGODB_URI to enable the vault");
  const doc = await col.findOne({ _id: new ObjectId(id) });
  if (!doc) throw new Error("No such vault entry");
  return decrypt(doc.encPassword as string);
}

/** Runs a real hashcat/John attack against the entry's password, like the analyzer page does. */
export async function analyzeEntryForReal(id: string): Promise<Verdict> {
  const col = await collection();
  if (!col) throw new Error("Set MONGODB_URI to enable the vault");
  const doc = await col.findOne({ _id: new ObjectId(id) });
  if (!doc) throw new Error("No such vault entry");

  const password = decrypt(doc.encPassword as string);
  const grade: HeuristicResult = doc.grade;
  const hash = hashPassword(password, CRACK_ALGO);
  const attacks = await runCrackers(hash, CRACK_ALGO, password.length);
  const verdict = buildVerdict(grade, attacks, password.length);

  await col.updateOne(
    { _id: new ObjectId(id) },
    { $set: { lastVerdict: verdict, cracked: attacks.some((a) => a.cracked) } }
  );

  return verdict;
}
