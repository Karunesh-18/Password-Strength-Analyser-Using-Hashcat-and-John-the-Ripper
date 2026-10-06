import crypto from "crypto";
import { md4 } from "./md4";

export type HashAlgo = "md5" | "sha1" | "sha256" | "ntlm";

// hashcat/John mode numbers for each algorithm (used when invoking the CLIs).
export const HASHCAT_MODE: Record<HashAlgo, string> = {
  md5: "0",
  sha1: "100",
  sha256: "1400",
  ntlm: "1000",
};

export const JOHN_FORMAT: Record<HashAlgo, string> = {
  md5: "raw-md5",
  sha1: "raw-sha1",
  sha256: "raw-sha256",
  ntlm: "nt",
};

/** Hash a plaintext password with the chosen algorithm, hex-encoded. */
export function hashPassword(password: string, algo: HashAlgo): string {
  if (algo === "ntlm") {
    // NTLM = MD4 of the UTF-16LE encoded password.
    // Node's OpenSSL 3 build removed MD4 from crypto.createHash, so this
    // uses the small MD4 implementation in ./md4 instead.
    return md4(Buffer.from(password, "utf16le")).toString("hex");
  }
  return crypto.createHash(algo).update(password, "utf8").digest("hex");
}
