# Password Strength Analysis — Hashcat + John the Ripper

A dashboard that scores a password two ways:

1. **Instant heuristic** — [zxcvbn-ts](https://github.com/zxcvbn-ts/zxcvbn) pattern/entropy scoring (no cracking involved).
2. **Real-world attack test** — your own test password is hashed, then **hashcat** and **John the Ripper** actually attempt to crack that hash (dictionary attack, plus a time-boxed brute-force for short passwords), run as local child processes.

> ⚠️ **Use only on passwords you own for testing.** Never paste in a real account's credentials. Nothing you type is persisted — hashes and results exist only for the duration of one request, and temp files are deleted immediately after each run.

## 1. Install the cracking tools (Windows)

Neither tool has an official winget/choco package, so install manually:

### hashcat
1. Download the latest Windows binary: https://hashcat.net/hashcat/ → get the `.7z` from the download link (currently `hashcat-7.1.2.7z`).
2. Extract it (7-Zip, or `winget install 7zip.7zip` first if you don't have an extractor).
3. Add the extracted folder (containing `hashcat.exe`) to your `PATH`.
4. Verify: `hashcat --version`

### John the Ripper (Jumbo)
1. Download the Windows build from https://www.openwall.com/john/ (or the GitHub releases at https://github.com/openwall/john).
2. Extract the zip. The binaries live in the `run\` subfolder.
3. Add `run\` to your `PATH` so `john.exe` resolves.
4. Verify: `john --version`

If either command isn't found, the dashboard still works — the corresponding attack result will show a "tool error" badge instead of crashing.

## 2. Run the app

```bash
npm install
npm run dev
```

Open http://localhost:3000, enter one or more test passwords (one per line, max 5), pick a hash algorithm, and click **Analyze**. Each run can take up to ~40 seconds per password (dictionary + brute-force time budgets).

## 3. Run the test suite

```bash
npm test
```

Covers hash correctness (including the hand-rolled MD4 for NTLM, since Node's OpenSSL 3 build dropped MD4 support), hashcat/John output parsing, and heuristic scoring sanity checks.

## How it works

- `lib/hash.ts` — hashes the input password (MD5 / SHA-1 / SHA-256 / NTLM).
- `lib/heuristic.ts` — zxcvbn-ts score, independent of any cracking attempt.
- `lib/crack.ts` — spawns `hashcat` (dictionary `-a 0`, then brute-force `-a 3` if the password is ≤7 chars) and `john` (dictionary attack + `--show` cross-check) against the hash, each capped at 20s wall-clock.
- `lib/parseOutput.ts` — pure functions that read hashcat's `-o` outfile and John's `--show` stdout to determine whether the hash was cracked.
- `app/api/analyze/route.ts` — orchestrates the above per submitted password, bounded to 5 passwords/request.
- `data/sample-wordlist.txt` — a small bundled wordlist (~100 common passwords) so the dictionary attack works out of the box. Point `SAMPLE_WORDLIST` in `lib/crack.ts` at a larger list (e.g. `rockyou.txt`) for more realistic results — don't bundle a multi-hundred-MB wordlist into the repo.

## Safety notes

- All subprocess calls are time-boxed and killed on timeout — a long password won't hang the server.
- Brute-force (`-a 3`) is only attempted for passwords ≤7 characters; anything longer is computationally pointless to brute-force live, so only the heuristic estimate covers it.
- No network calls are made from the backend; everything runs against hashes generated in-memory from your own input.
