# CLI command reference

Terminal counterpart to the web app (`app/page.tsx`) — same `lib/hash.ts`,
`lib/heuristic.ts`, `lib/crack.ts`, `lib/verdict.ts` pipeline, no server
round-trip. Storage (vault/history) is web-only; the CLI never touches Mongo.

## Usage

```bash
npm run cli -- [--algo md5|sha1|sha256|ntlm] [--no-crack] <password> [password...]
```

Everything after `--` is passed straight to `cli/analyze.ts`.

## Flags

| Flag | Default | Description |
|---|---|---|
| `--algo <md5\|sha1\|sha256\|ntlm>` | `sha256` | Which algorithm to hash each password with before attacking it. |
| `--no-crack` | off | Skip the real hashcat/John attack entirely — print only the instant heuristic score and its suggestions. Fast (no subprocess spawns), useful when hashcat/John aren't installed. |

Any other argument is treated as a password to analyze. Pass multiple
passwords to run them all in one invocation, each printed as its own block.

## Examples

Score + real-attack one password (default algorithm, `sha256`):
```bash
npm run cli -- "hunter2"
```

Several passwords at once, hashed as NTLM:
```bash
npm run cli -- --algo ntlm "hunter2" "Tr0ub4dor&3" "correct horse battery staple"
```

Heuristic-only, no hashcat/John spawned (useful without the tools installed, or for a quick check):
```bash
npm run cli -- --no-crack "P@ssw0rd123"
```

## Output

For each password:
- the password, its hash, and the heuristic label/score/estimated crack time.
- with cracking enabled: one line per attack attempt (`hashcat`/`john`,
  `dictionary`/`brute-force`), whether it cracked it, timed out, or was
  skipped (e.g. brute-force skipped for passwords >7 chars — not worth
  attempting live), then the combined verdict sentence and its suggestions.
- with `--no-crack`: just the heuristic's own suggestions.

Colors mirror the web UI's theme: green for headers/safe outcomes, red for a
successful crack, dim gray for skipped/informational lines.

## Exit codes

- `0` — ran successfully (regardless of whether any password was cracked —
  that's a result, not a tool failure).
- `1` — bad usage (no passwords given, invalid `--algo` value) or an
  unhandled error; message printed to stderr.

## Requirements

Same as the web app's attack path — see the root [README.md](../README.md)
for installing `hashcat` and `john` on `PATH`. Without them, use `--no-crack`,
or expect "tool error" lines in the attack output.
