# Password Strength Analysis — Hashcat + John the Ripper

A dashboard that scores a password two ways:

1. **Instant heuristic** — [zxcvbn-ts](https://github.com/zxcvbn-ts/zxcvbn) pattern/entropy scoring (no cracking involved).
2. **Real-world attack test** — your own test password is hashed, then **hashcat** and **John the Ripper** actually attempt to crack that hash (dictionary attack, plus a time-boxed brute-force for short passwords), run as local child processes.

> ⚠️ **Use only on passwords you own for testing.** Never paste in a real account's credentials. Nothing you type is persisted — hashes and results exist only for the duration of one request, and temp files are deleted immediately after each run.

## 1. Install the cracking tools (Windows)

Neither tool has an official winget/choco package, so install manually, then
put a thin wrapper `.bat` on `PATH` rather than the install folder itself —
hashcat specifically needs its own folder as the working directory (it loads
`OpenCL\` kernel files via relative paths), so a wrapper that `cd`s there is
more reliable than just adding the folder to `PATH`.

### hashcat
1. Download the latest Windows binary: https://hashcat.net/hashcat/ → get the `.7z` (currently `hashcat-7.1.2.7z`) and extract it (7-Zip, or `winget install 7zip.7zip` first if you don't have an extractor) to e.g. `C:\Program Files\hashcat-7.1.2\hashcat-7.1.2`.
2. Create `%USERPROFILE%\bin\hashcat.bat`:
   ```bat
   @echo off
   set "original_dir=%CD%"
   cd /d "C:\Program Files\hashcat-7.1.2\hashcat-7.1.2"
   .\hashcat.exe %*
   cd /d "%original_dir%"
   ```
3. Add `%USERPROFILE%\bin` to your user `PATH` (System Properties → Environment Variables, or `[Environment]::SetEnvironmentVariable('PATH', $env:PATH + ';' + "$HOME\bin", 'User')` in PowerShell), then open a **new** terminal.
4. Verify: `hashcat --version`

### John the Ripper (Jumbo)
1. Download the Windows build from https://www.openwall.com/john/ (or the GitHub releases at https://github.com/openwall/john) and extract it to e.g. `C:\Program Files\john-1.9.0-jumbo-1-win64`. The binaries live in its `run\` subfolder.
2. Create `%USERPROFILE%\bin\john.bat`:
   ```bat
   @echo off
   "C:\Program Files\john-1.9.0-jumbo-1-win64\john-1.9.0-jumbo-1-win64\run\john.exe" %*
   ```
3. Same `PATH` step as above (shared with hashcat).
4. Verify: `john` (no `--version` flag in Jumbo — running with no args prints the version banner and usage).

If either command isn't found, the dashboard still works — the corresponding attack result will show a "tool error" badge instead of crashing.

> **Already have `npm run dev` running?** PATH changes only apply to *new* processes. Stop the dev server and restart it (new terminal or just re-run `npm run dev`) after adding `%USERPROFILE%\bin` to PATH, otherwise hashcat/John will show as "tool error" even though they're installed correctly.

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

See [ARCHITECTURE.md](./ARCHITECTURE.md) for a full file-by-file and concept-by-concept walkthrough (hashing, zxcvbn heuristic scoring, how hashcat/John are actually invoked, output parsing, error handling, the UI). Short version:

- `lib/hash.ts` + `lib/md4.ts` — hashes the input password (MD5 / SHA-1 / SHA-256 / NTLM).
- `lib/heuristic.ts` — zxcvbn-ts score, independent of any cracking attempt.
- `lib/crack.ts` — spawns `hashcat` (dictionary `-a 0`, then brute-force `-a 3` if the password is ≤7 chars) and `john` (dictionary attack + `--show` cross-check) against the hash, each capped at 20s wall-clock.
- `lib/parseOutput.ts` — pure functions that read hashcat's `-o` outfile and John's `--show` stdout to determine whether the hash was cracked.
- `app/api/analyze/route.ts` — orchestrates the above per submitted password, bounded to 5 passwords/request.
- `data/common-passwords.txt` — 100,000 real-world passwords by frequency ([SecLists](https://github.com/danielmiessler/SecLists)' `xato-net-10-million-passwords-100000.txt`, MIT licensed — see Attribution below), so the dictionary attack reflects actual breach data out of the box. Point `COMMON_PASSWORDS_WORDLIST` in `lib/crack.ts` at an even larger list (e.g. the full `xato-net-10-million-passwords.txt`, or `rockyou.txt`) for more coverage — dictionary attacks stay fast even at this size (hashcat/John are comparing hashes, not doing anything CPU-heavy per word), so the limiting factor is repo size, not runtime.

## Attribution

`data/common-passwords.txt` is sourced from [SecLists](https://github.com/danielmiessler/SecLists) (`Passwords/Common-Credentials/xato-net-10-million-passwords-100000.txt`), MIT licensed, originally compiled by Mark Burnett.

## Safety notes

- All subprocess calls are time-boxed and killed on timeout — a long password won't hang the server.
- Brute-force (`-a 3`) is only attempted for passwords ≤7 characters; anything longer is computationally pointless to brute-force live, so only the heuristic estimate covers it.
- No network calls are made from the backend; everything runs against hashes generated in-memory from your own input.
