# How this works

A plain-language walkthrough of every file, why it exists, and the security
concepts behind it. Read `README.md` first if you just want to run the app —
this doc is for understanding or modifying it.

## The big picture

```
Browser (app/page.tsx)
   │  POST /api/analyze  { passwords: [...], algo: "sha256" }
   ▼
app/api/analyze/route.ts
   │
   ├─► lib/heuristic.ts   → instant score, no cracking (zxcvbn-ts)
   │
   └─► lib/hash.ts        → turn plaintext password into a hash
          │
          ▼
       lib/crack.ts       → spawn real hashcat + john processes against that hash
          │
          ▼
       lib/parseOutput.ts → did they crack it? what was the plaintext?
          │
          ▼
   JSON response ──► components/results-card.tsx (renders it)
```

Nothing is stored anywhere. Each request hashes the password, writes it to a
temp file, runs the attacks, reads the result, deletes the temp file, and
returns JSON. The plaintext password never leaves the request/response cycle.

## The two kinds of "strength" this app measures

**1. Heuristic (instant, no cracking)** — `lib/heuristic.ts`
This is pattern-matching: does the password look like a dictionary word, a
keyboard walk (`qwerty`), a date, a name, `l33t`-speak substitution, etc.?
[zxcvbn](https://github.com/dropbox/zxcvbn) (the algorithm Dropbox open
sourced) estimates how many *guesses* an attacker's cracking software would
need before finding this exact password, then converts that into a 0–4 score
and an estimated crack time. It's instant because it's just pattern analysis
on the string itself — nothing is actually attacked.

**2. Real-world attack result (slow, real cracking)** — `lib/crack.ts`
This is empirical: we actually hash the password and point real cracking
tools at that hash, the same way an attacker would after stealing a password
database. If hashcat or John recovers the plaintext within the time budget,
the password *is* that weak against that specific attack. If they don't,
that only means "not weak enough for the attacks we tried in the time we
gave it" — not an absolute guarantee, which is why both numbers are shown
side by side.

## File-by-file

### `lib/hash.ts`
Turns the plaintext password into a hash, matching one of four algorithms:

| Algo | What it is | Used by |
|---|---|---|
| `md5` | Fast, broken, still everywhere in old systems | legacy web apps |
| `sha1` | Faster than MD5, also broken for this purpose | legacy web apps, old Git |
| `sha256` | Current general-purpose default | most modern apps (though real apps should use bcrypt/argon2, not raw SHA-256 — see note below) |
| `ntlm` | Windows' password hash format (`MD4` of UTF-16LE password) | Windows/Active Directory |

Each one maps to a **hashcat mode number** and a **John "format" name** —
both tools support dozens of hash types and need to be told which one
they're looking at (`HASHCAT_MODE` / `JOHN_FORMAT` exports).

> **Why not bcrypt?** Real applications should never store raw MD5/SHA-256
> password hashes — they're *fast*, which is exactly what makes them easy to
> brute-force. bcrypt/argon2/scrypt are deliberately slow. This tool offers
> the fast algorithms specifically because they're what you'd test *against*
> to see how badly a password fares under a worst-case (fast-hash) attack;
> it's an analysis tool, not a guide for how to store passwords.

### `lib/md4.ts`
NTLM hashing needs MD4. Node 24's OpenSSL build **removed MD4 support** from
`crypto.createHash()` (it throws `unsupported` — MD4 is cryptographically
broken and most platforms dropped it). Since there's no way around that for
NTLM specifically, this file is a small hand-written MD4 implementation
(~50 lines, straight from RFC 1320), verified against the RFC's own test
vectors in `test/parseOutput.test.ts`.

### `lib/heuristic.ts`
Wraps `@zxcvbn-ts/core`. Loads the common + English dictionaries once at
module load, then `scorePassword()` returns:
- `score` (0–4) and a human `label` ("Very Weak" → "Very Strong")
- `guesses` — the raw estimated guess count
- `crackTimeDisplay` — zxcvbn's human-readable estimate assuming an offline
  attacker hashing ~10⁴ guesses/second (a deliberately slow-hash scenario)
- `suggestions` — human feedback like "Add more words that are less common"

### `lib/crack.ts` — the real attack runner
This is the core of the app. For one password's hash, it:

1. **Writes the hash to a temp file** (`fs/promises.mkdtemp`, under the OS
   temp dir — a fresh, unique directory per password, so concurrent requests
   never collide).
2. **Runs hashcat twice:**
   - `-a 0` (**dictionary attack**): try every word in
     `data/sample-wordlist.txt`. This is what catches "did someone just pick
     a common password."
   - `-a 3` (**brute-force / mask attack**): try every possible character
     combination at the password's exact length, using the `?a` charset
     (all printable ASCII). Only attempted if the password is **≤7
     characters** — longer than that and brute-force isn't going to finish
     in any demo-reasonable time (this is exactly why short passwords are
     dangerous and long ones aren't: the search space grows exponentially
     with length).
3. **Runs John the Ripper once**, as a cross-check using the same dictionary
   — if hashcat and John disagree on whether a password cracked, that's a
   sign something is misconfigured (wrong hash mode/format, wrong wordlist
   path, etc.), so running both catches bugs as well as giving a second
   opinion.
4. **Every subprocess call is time-boxed** (`DICTIONARY_TIMEOUT_MS` /
   `BRUTE_FORCE_TIMEOUT_MS`, both 20s) — `runWithTimeout()` kills the child
   process if it doesn't finish in time, so a stubborn attack can't hang the
   server.
5. **Cleans up** the temp directory in a `finally` block, whether the
   attacks succeeded, failed, or threw.

**Why `shell: true` on Windows?** hashcat/John here are installed as `.bat`
wrapper scripts on `PATH` (see README) rather than raw `.exe` files directly
on `PATH`. `child_process.spawn()` without a shell can't execute `.bat`
files on Windows — only `.exe`/`.com` — so `shell: true` is required. The
arguments passed are always our own file paths and fixed flags, never the
user's actual password text, so this doesn't reopen shell-injection risk.

**Why does the error detection look for a specific string?** With
`shell: true`, a missing command doesn't make `spawn()` itself fail — `cmd.exe`
launches successfully, prints `'hashcat' is not recognized as an internal or
external command`, and exits. That's indistinguishable from "ran but didn't
crack it" unless you specifically watch for that message, which is what the
regex check in `runWithTimeout()` does.

### `lib/parseOutput.ts` — pure, unit-tested parsing
Two functions, both pure (no I/O, no subprocess, just string → data), which
is why they're easy to unit test without hashcat/John actually installed:

- `parseHashcatOutfile(content)` — hashcat is run with `-o <file>`; if that
  file has a line, it's `hash:plaintext`. Reading the outfile is far more
  reliable than trying to scrape hashcat's live status display.
- `parseJohnShowOutput(stdout)` — after a crack attempt, we separately run
  `john --show <hashfile>`, which prints `testuser:plaintext` plus a summary
  line like `1 password hash cracked, 0 left`. This function reads that.

### `app/api/analyze/route.ts`
The HTTP boundary. Validates the request body (algo must be one of the four
known ones, 1–5 non-empty password strings), then for each password:
hash it → heuristic-score it → run `runCrackers()` → return everything as
JSON. The 5-password cap keeps total request time (and total CPU burned on
your machine) bounded, since every password runs up to three real attack
processes.

### `data/sample-wordlist.txt`
~100 extremely common passwords (`password123`, `qwerty`, `letmein`, Star
Wars references, etc.) bundled directly in the repo so the dictionary attack
works immediately without downloading anything. For a more realistic test,
point `SAMPLE_WORDLIST` in `lib/crack.ts` at a real wordlist like
[rockyou.txt](https://github.com/brannondorsey/naive-hashcat/releases) — it's
not bundled here because it's hundreds of MB and doesn't belong in git.

### Frontend (`app/page.tsx`, `components/`)
- `app/page.tsx` — the form: a textarea (one password per line), an
  algorithm `<Select>`, and an Analyze button. Calls the API, stores the
  JSON response in state, renders one `ResultsCard` per password.
- `components/results-card.tsx` — per-password breakdown: a "Cracked" /
  "Held" badge, the `StrengthMeter`, the heuristic's estimated crack time,
  one row per real attack (hashcat dictionary, hashcat brute-force, John
  cross-check) each showing cracked/not-cracked/tool-error, and zxcvbn's
  improvement suggestions.
- `components/strength-meter.tsx` — an animated (Framer Motion) colored bar,
  red→green across the 0–4 score range.
- `components/ui/*` — [shadcn/ui](https://ui.shadcn.com) primitives (Button,
  Card, Select, Textarea, Badge, Separator) — unstyled-logic components you
  own and can edit directly, not an installed black-box library.

### `test/parseOutput.test.ts`
Runs with Node's built-in test runner (`node --test`, via `tsx` for
TypeScript). Covers: hashcat outfile parsing (empty / cracked / plaintext
containing a colon), John `--show` parsing (cracked / not cracked), the
heuristic flags a common password as weak and a long random one as strong,
SHA-256 and NTLM hash correctness against known vectors, and the hand-rolled
MD4 against the RFC 1320 test vectors.

## The CLI tools themselves

**hashcat** is a GPU/CPU password-recovery tool — "the world's fastest
password cracker." It supports 300+ hash modes (`-m <number>`, see
`lib/hash.ts`'s `HASHCAT_MODE`) and several attack modes (`-a <number>`):
`0` = dictionary (wordlist), `3` = brute-force/mask, plus others (hybrid,
combinator, rule-based) this app doesn't use.

**John the Ripper** (specifically the "Jumbo" community build, which adds
hundreds of extra hash formats beyond core John) is an older, CPU-focused
cracker with similar dictionary/mask/incremental modes. It's run here purely
as a second opinion / cross-check on hashcat's result — if a password is
genuinely weak, independently confirming it with a second tool rules out a
hashcat-specific misconfiguration being the reason it "cracked."

Both are installed as `.bat` wrapper scripts (see README's install section)
rather than raw `.exe` on `PATH`, because hashcat specifically needs its own
install folder as the working directory to find its `OpenCL\` kernel files
via relative paths.

## Safety model

- **No real credentials, ever.** This is for your own test passwords only —
  there's a banner in the UI reiterating this, and nothing about the design
  assumes or supports pointing it at someone else's data.
- **Nothing persists.** Hash + results live only for one HTTP request; temp
  files are deleted in a `finally` block even on error.
- **Everything is time-boxed.** No subprocess can run longer than its
  timeout, so a long/complex password can't hang the server indefinitely.
- **Brute-force is capped by length**, not just time — for passwords longer
  than 7 characters, exhaustive search isn't attempted at all (it wouldn't
  finish in any reasonable demo window anyway), so the heuristic estimate is
  the only signal for long passwords.
- **No network calls** happen anywhere in the backend — all three "attacks"
  are local child processes against a hash generated in-memory from your own
  input.
