#!/usr/bin/env -S node --import tsx
/**
 * Terminal counterpart to the web app - same lib/* logic (hash, heuristic
 * score, real hashcat/John attacks, verdict), no server round-trip.
 *
 * Usage:
 *   npm run cli -- "MyP@ssw0rd" "password123"
 *   npm run cli -- --algo ntlm --no-crack "hunter2"
 */
import { hashPassword, type HashAlgo } from "../lib/hash";
import { scorePassword } from "../lib/heuristic";
import { runCrackers } from "../lib/crack";
import { buildVerdict } from "../lib/verdict";

const VALID_ALGOS: HashAlgo[] = ["md5", "sha1", "sha256", "ntlm"];

// ANSI codes matching the web UI's black/green hacker theme.
const GREEN = "\x1b[32m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

function parseArgs(argv: string[]) {
  let algo: HashAlgo = "sha256";
  let crack = true;
  const passwords: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--algo") {
      const value = argv[++i];
      if (!VALID_ALGOS.includes(value as HashAlgo)) {
        throw new Error(`--algo must be one of ${VALID_ALGOS.join(", ")}`);
      }
      algo = value as HashAlgo;
    } else if (arg === "--no-crack") {
      crack = false;
    } else {
      passwords.push(arg);
    }
  }
  return { algo, crack, passwords };
}

async function main() {
  const { algo, crack, passwords } = parseArgs(process.argv.slice(2));

  if (passwords.length === 0) {
    console.error("Usage: npm run cli -- [--algo md5|sha1|sha256|ntlm] [--no-crack] <password> [password...]");
    process.exit(1);
  }

  for (const password of passwords) {
    const heuristic = scorePassword(password);
    const hash = hashPassword(password, algo);

    console.log(`\n${GREEN}${"=".repeat(60)}${RESET}`);
    console.log(`${GREEN}password:${RESET} ${password}`);
    console.log(`${DIM}${algo} hash:${RESET} ${hash}`);
    console.log(
      `${GREEN}heuristic:${RESET} ${heuristic.label} (${heuristic.score + 1}/5) - cracks in ~${heuristic.crackTimeDisplay} (offline, slow hash)`
    );

    if (crack) {
      console.log(`${DIM}running hashcat + John the Ripper...${RESET}`);
      const attacks = await runCrackers(hash, algo, password.length);
      const verdict = buildVerdict(heuristic, attacks, password.length);

      for (const a of attacks) {
        const status = a.skipped
          ? `${DIM}skipped (${a.skipReason})${RESET}`
          : a.cracked
            ? `${RED}CRACKED -> ${a.plaintext}${RESET}`
            : a.timedOut
              ? `${DIM}not cracked (timed out, ${a.timeMs}ms)${RESET}`
              : `${GREEN}not cracked (${a.timeMs}ms)${RESET}`;
        console.log(`  ${a.tool}/${a.method}: ${status}`);
      }

      console.log(`${GREEN}verdict:${RESET} ${verdict.headline}`);
      for (const s of verdict.suggestions) console.log(`  - ${s}`);
    } else {
      for (const s of heuristic.suggestions) console.log(`  - ${s}`);
    }
  }
  console.log();
}

main().catch((err) => {
  console.error(`${RED}error:${RESET} ${err.message}`);
  process.exit(1);
});
