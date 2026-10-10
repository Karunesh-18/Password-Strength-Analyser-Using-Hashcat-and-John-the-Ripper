import { spawn } from "child_process";
import { mkdtemp, writeFile, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { HASHCAT_MODE, JOHN_FORMAT, type HashAlgo } from "./hash";
import { parseHashcatOutfile, parseJohnShowOutput } from "./parseOutput";

// 100k real-world passwords by frequency (SecLists' xato-net-10-million-
// passwords-100000.txt, MIT licensed) — see README for attribution. Override
// with WORDLIST_PATH (e.g. a local rockyou.txt) for a bigger dictionary;
// dictionary attacks stay fast even at that size since hashcat/John are just
// comparing hashes, not doing anything CPU-heavy per word.
const COMMON_PASSWORDS_WORDLIST =
  process.env.WORDLIST_PATH ||
  path.join(process.cwd(), "data", "common-passwords.txt");
// ponytail: fixed time caps rather than a configurable job system — fine for
// a single-request, single-user local tool. Raise if real attacks need more.
const DICTIONARY_TIMEOUT_MS = 20_000;
const BRUTE_FORCE_TIMEOUT_MS = 20_000;
const BRUTE_FORCE_MAX_LEN = 7; // longer = not worth a live brute-force attempt

// ponytail: global lock around hashcat invocations. hashcat processes race
// for the same GPU device and intermittently fail with "Already an instance
// ... running" when several launch within microseconds of each other (e.g.
// one request analyzing multiple passwords via Promise.all) — even with
// unique --session names. Since they'd all serialize on the GPU anyway,
// queuing them app-side avoids the race instead of fighting it. John runs
// on CPU and isn't affected, so it stays concurrent. Upgrade to a real job
// queue if this ever needs to run multiple hashcat jobs truly in parallel
// (e.g. multiple GPUs).
let hashcatQueue: Promise<unknown> = Promise.resolve();
function runHashcatSerialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = hashcatQueue.then(fn, fn);
  hashcatQueue = run.catch(() => {});
  return run;
}

export type AttackOutcome = {
  tool: "hashcat" | "john";
  method: "dictionary" | "brute-force" | "dictionary-crosscheck";
  cracked: boolean;
  plaintext: string | null;
  timedOut: boolean;
  timeMs: number;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
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
      } else if (!spawnError && /already an instance .* running/i.test(stdout + stderr)) {
        // hashcat refuses to run twice under the same --session name at once.
        spawnError = `${cmd} refused to start: another instance was already running (session name collision)`;
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

  // hashcat refuses to run two instances under the same session name at
  // once ("Already an instance ... running"). Its session/lock file lives
  // relative to its own install dir (see hashcat.bat), not our per-request
  // workDir, so concurrent passwords in one request — or concurrent
  // requests — collide unless each gets a name unique to this run.
  // path.basename(workDir) is already unique (mkdtemp), so reuse it.
  const sessionId = path.basename(workDir);

  const outcomes: AttackOutcome[] = [];

  // Dictionary attack.
  {
    const outFile = path.join(workDir, "hc-dict-out.txt");
    const { timedOut, timeMs, spawnError } = await runHashcatSerialized(() =>
      runWithTimeout(
        "hashcat",
        [
          "-m", mode, "-a", "0", "--quiet", "--potfile-disable",
          "--session", `${sessionId}-dict`,
          "-o", outFile, hashFile, COMMON_PASSWORDS_WORDLIST,
        ],
        DICTIONARY_TIMEOUT_MS
      )
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
    const { timedOut, timeMs, spawnError } = await runHashcatSerialized(() =>
      runWithTimeout(
        "hashcat",
        [
          "-m", mode, "-a", "3", "--quiet", "--potfile-disable",
          "--session", `${sessionId}-brute`,
          "-o", outFile, hashFile, mask,
        ],
        BRUTE_FORCE_TIMEOUT_MS
      )
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
  } else {
    // Surface *why* brute-force didn't run, instead of silently omitting
    // the row — keyspace grows exponentially with length (95^N for the
    // full printable-ASCII charset), so beyond BRUTE_FORCE_MAX_LEN it's
    // not a matter of "slower," it's not finishing in any practical time.
    const keyspaceExponent = Math.round(passwordLength * Math.log10(95));
    outcomes.push({
      tool: "hashcat",
      method: "brute-force",
      cracked: false,
      plaintext: null,
      timedOut: false,
      timeMs: 0,
      skipped: true,
      skipReason: `Skipped — at ${passwordLength} characters the keyspace is ~10^${keyspaceExponent} combinations, far beyond what's feasible to exhaust live (brute-force only runs for passwords ≤${BRUTE_FORCE_MAX_LEN} characters here).`,
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
    [`--format=${format}`, `--wordlist=${COMMON_PASSWORDS_WORDLIST}`, hashFile],
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
