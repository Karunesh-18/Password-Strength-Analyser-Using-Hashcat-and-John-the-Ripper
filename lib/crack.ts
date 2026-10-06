import { spawn } from "child_process";
import { mkdtemp, writeFile, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { HASHCAT_MODE, JOHN_FORMAT, type HashAlgo } from "./hash";
import { parseHashcatOutfile, parseJohnShowOutput } from "./parseOutput";

const SAMPLE_WORDLIST = path.join(process.cwd(), "data", "sample-wordlist.txt");
// ponytail: fixed time caps rather than a configurable job system — fine for
// a single-request, single-user local tool. Raise if real attacks need more.
const DICTIONARY_TIMEOUT_MS = 20_000;
const BRUTE_FORCE_TIMEOUT_MS = 20_000;
const BRUTE_FORCE_MAX_LEN = 7; // longer = not worth a live brute-force attempt

export type AttackOutcome = {
  tool: "hashcat" | "john";
  method: "dictionary" | "brute-force" | "dictionary-crosscheck";
  cracked: boolean;
  plaintext: string | null;
  timedOut: boolean;
  timeMs: number;
  error?: string;
};

/** Runs a command, enforcing a hard timeout by killing the child process. */
function runWithTimeout(
  cmd: string,
  args: string[],
  timeoutMs: number,
  cwd?: string
): Promise<{
  stdout: string;
  stderr: string;
  timedOut: boolean;
  timeMs: number;
  spawnError: string | null;
}> {
  return new Promise((resolve) => {
    const start = Date.now();
    // shell:true is required on Windows so a PATH entry resolving to a .bat
    // wrapper (common for hand-installed CLI tools) actually runs; args here
    // are always our own constants/file paths, never raw user input, so this
    // doesn't reopen the usual shell-injection risk.
    const child = spawn(cmd, args, {
      windowsHide: true,
      shell: process.platform === "win32",
      cwd,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let spawnError: string | null = null;

    const killer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      spawnError = err.message; // e.g. "spawn hashcat ENOENT" — tool not installed/on PATH
    });
    child.on("close", () => {
      clearTimeout(killer);
      // With shell:true, a missing command doesn't fire the 'error' event —
      // cmd.exe itself launches fine, prints "not recognized", and exits.
      // Catch that case explicitly instead of silently reporting "not cracked".
      if (!spawnError && /is not recognized as .* command/i.test(stderr)) {
        spawnError = `${cmd} not found on PATH (is it installed? see README)`;
      }
      resolve({ stdout, stderr, timedOut, timeMs: Date.now() - start, spawnError });
    });
  });
}

/** Runs hashcat dictionary (-a 0) and, for short passwords, brute-force (-a 3) attacks. */
async function runHashcat(
  hash: string,
  algo: HashAlgo,
  workDir: string,
  passwordLength: number
): Promise<AttackOutcome[]> {
  const mode = HASHCAT_MODE[algo];
  const hashFile = path.join(workDir, "hash.txt");
  await writeFile(hashFile, hash + "\n");

  const outcomes: AttackOutcome[] = [];

  // Dictionary attack.
  {
    const outFile = path.join(workDir, "hc-dict-out.txt");
    const { timedOut, timeMs, spawnError } = await runWithTimeout(
      "hashcat",
      [
        "-m", mode, "-a", "0", "--quiet", "--potfile-disable",
        "-o", outFile, hashFile, SAMPLE_WORDLIST,
      ],
      DICTIONARY_TIMEOUT_MS
    );
    const parsed = await readOutfileSafe(outFile);
    outcomes.push({
      tool: "hashcat",
      method: "dictionary",
      cracked: parsed.cracked,
      plaintext: parsed.plaintext,
      timedOut,
      timeMs,
      error: spawnError ?? undefined,
    });
  }

  // Brute-force attack — only attempted for short passwords; otherwise it's
  // not going to finish in any reasonable demo time budget.
  if (passwordLength <= BRUTE_FORCE_MAX_LEN) {
    const outFile = path.join(workDir, "hc-brute-out.txt");
    const mask = "?a".repeat(passwordLength);
    const { timedOut, timeMs, spawnError } = await runWithTimeout(
      "hashcat",
      [
        "-m", mode, "-a", "3", "--quiet", "--potfile-disable",
        "-o", outFile, hashFile, mask,
      ],
      BRUTE_FORCE_TIMEOUT_MS
    );
    const parsed = await readOutfileSafe(outFile);
    outcomes.push({
      tool: "hashcat",
      method: "brute-force",
      cracked: parsed.cracked,
      plaintext: parsed.plaintext,
      timedOut,
      timeMs,
      error: spawnError ?? undefined,
    });
  }

  return outcomes;
}

/** Runs John the Ripper as a dictionary-attack cross-check. */
async function runJohn(
  hash: string,
  algo: HashAlgo,
  workDir: string
): Promise<AttackOutcome> {
  const format = JOHN_FORMAT[algo];
  const hashFile = path.join(workDir, "john-hash.txt");
  await writeFile(hashFile, `testuser:${hash}\n`);

  // cwd: workDir keeps each run's john.rec (crash-recovery) file isolated —
  // without it, concurrent requests all write to the project root and John
  // refuses to start with "Crash recovery file is locked".
  const { timedOut, timeMs, spawnError } = await runWithTimeout(
    "john",
    [`--format=${format}`, `--wordlist=${SAMPLE_WORDLIST}`, hashFile],
    DICTIONARY_TIMEOUT_MS,
    workDir
  );

  const show = await runWithTimeout(
    "john",
    [`--format=${format}`, "--show", hashFile],
    5_000,
    workDir
  );
  const parsed = parseJohnShowOutput(show.stdout);

  return {
    tool: "john",
    method: "dictionary-crosscheck",
    cracked: parsed.cracked,
    plaintext: parsed.plaintext,
    timedOut,
    timeMs,
    // Only a real spawn failure (tool missing) counts as an error — John
    // writes normal progress/status noise to stderr even on a successful run.
    error: spawnError ?? undefined,
  };
}

async function readOutfileSafe(filePath: string) {
  try {
    const content = await readFile(filePath, "utf8");
    return parseHashcatOutfile(content);
  } catch {
    return { cracked: false, plaintext: null };
  }
}

/** Hashes already computed; this runs both tools against one hash and cleans up. */
export async function runCrackers(
  hash: string,
  algo: HashAlgo,
  passwordLength: number
): Promise<AttackOutcome[]> {
  const workDir = await mkdtemp(path.join(tmpdir(), "pw-strength-"));
  try {
    const [hashcatResults, johnResult] = await Promise.all([
      runHashcat(hash, algo, workDir, passwordLength).catch((err) => [
        toolError("hashcat", "dictionary", err),
      ]),
      runJohn(hash, algo, workDir).catch((err) =>
        toolError("john", "dictionary-crosscheck", err)
      ),
    ]);
    return [...hashcatResults, johnResult];
  } finally {
    // Always clean up the temp hash/output files, even on failure.
    await rm(workDir, { recursive: true, force: true });
  }
}

function toolError(
  tool: AttackOutcome["tool"],
  method: AttackOutcome["method"],
  err: unknown
): AttackOutcome {
  return {
    tool,
    method,
    cracked: false,
    plaintext: null,
    timedOut: false,
    timeMs: 0,
    error: err instanceof Error ? err.message : String(err),
  };
}
