import dns from "dns";
import { MongoClient, type Db } from "mongodb";

// Node's own DNS resolver (c-ares) sometimes ends up pointed at 127.0.0.1
// on Windows (VPN clients/some network adapters register a stub only the
// OS's own DNS Client service can actually reach), which breaks the SRV
// lookup an `mongodb+srv://` URI needs ("querySrv ECONNREFUSED ...") even
// though the system resolver (nslookup, browsers) works fine. Point Node
// at public resolvers directly so this app's DNS doesn't depend on that.
if (dns.getServers().every((s) => s === "127.0.0.1" || s === "::1")) {
  dns.setServers(["1.1.1.1", "8.8.8.8"]);
}

// Storage is entirely optional: every caller treats a null return as
// "not configured" and degrades gracefully instead of throwing.
const uri = process.env.MONGODB_URI;

// Cache the client on `global` so Next's dev-mode module reloading doesn't
// open a fresh connection on every hot reload.
const globalForMongo = global as unknown as { _mongoClientPromise?: Promise<MongoClient> };

function getClientPromise(): Promise<MongoClient> | null {
  if (!uri) return null;
  if (!globalForMongo._mongoClientPromise) {
    const promise = new MongoClient(uri).connect();
    // A failed connect() must not get cached forever - clear it so the next
    // call retries from scratch instead of replaying the same old rejection
    // on every request until the process restarts.
    promise.catch(() => {
      if (globalForMongo._mongoClientPromise === promise) {
        globalForMongo._mongoClientPromise = undefined;
      }
    });
    globalForMongo._mongoClientPromise = promise;
  }
  return globalForMongo._mongoClientPromise;
}

export async function getDb(): Promise<Db | null> {
  const clientPromise = getClientPromise();
  if (!clientPromise) return null;
  const client = await clientPromise;
  return client.db(); // uses the DB named in the connection string
}
