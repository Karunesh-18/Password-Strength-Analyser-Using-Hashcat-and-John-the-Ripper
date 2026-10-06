import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHashcatOutfile, parseJohnShowOutput } from "../lib/parseOutput";
import { scorePassword } from "../lib/heuristic";
import { hashPassword } from "../lib/hash";
import { md4 } from "../lib/md4";
import { buildVerdict } from "../lib/verdict";
import type { AttackOutcome } from "../lib/crack";

test("parseHashcatOutfile: empty content means not cracked", () => {
  assert.deepEqual(parseHashcatOutfile(""), { cracked: false, plaintext: null });
});

test("parseHashcatOutfile: hash:plaintext line means cracked", () => {
  assert.deepEqual(parseHashcatOutfile("5f4dcc3b5aa765d61d8327deb882cf99:password\n"), {
    cracked: true,
    plaintext: "password",
  });
});

test("parseHashcatOutfile: plaintext containing a colon keeps only the last field as the split point", () => {
  assert.deepEqual(parseHashcatOutfile("deadbeef:pass:word"), {
    cracked: true,
    plaintext: "word",
  });
});

test("parseJohnShowOutput: no cracked-count line means not cracked", () => {
  assert.deepEqual(parseJohnShowOutput("0 password hashes cracked, 1 left\n"), {
    cracked: false,
    plaintext: null,
  });
});

test("parseJohnShowOutput: cracked line + credential line", () => {
  const stdout = "testuser:password123\n\n1 password hash cracked, 0 left\n";
  assert.deepEqual(parseJohnShowOutput(stdout), {
    cracked: true,
    plaintext: "password123",
  });
});

test("scorePassword: flags a common password as weak", () => {
  const result = scorePassword("password123");
  assert.ok(result.score <= 1, `expected weak score, got ${result.score}`);
});

test("scorePassword: flags a long random passphrase as strong", () => {
  const result = scorePassword("Tr0ut!Marble$Kettle#92Zebra");
  assert.ok(result.score >= 3, `expected strong score, got ${result.score}`);
});

test("scorePassword: catches 'name + short number' even when the name isn't in zxcvbn's dictionary", () => {
  const result = scorePassword("Karunesh_13");
  assert.ok(result.score <= 1, `expected weak score, got ${result.score}`);
  assert.match(result.suggestions[0], /word \+ short number/);
});

test("scorePassword: 'name + short number' pattern also catches no-separator and lowercase forms", () => {
  assert.ok(scorePassword("Jordan99").score <= 1);
  assert.ok(scorePassword("rosebud7").score <= 1);
});

test("hashPassword: sha256 matches a known vector", () => {
  assert.equal(
    hashPassword("password", "sha256"),
    "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8"
  );
});

test("md4: matches RFC 1320 test vectors", () => {
  assert.equal(md4(Buffer.from("")).toString("hex"), "31d6cfe0d16ae931b73c59d7e0c089c0");
  assert.equal(md4(Buffer.from("abc")).toString("hex"), "a448017aaf21d8525fc10ae87aa6729d");
});

test("hashPassword: ntlm matches a known vector for 'password'", () => {
  // Well-known NTLM hash of "password".
  assert.equal(
    hashPassword("password", "ntlm"),
    "8846f7eaee8fb117ad06bdd830b7586c"
  );
});

function attack(overrides: Partial<AttackOutcome>): AttackOutcome {
  return {
    tool: "hashcat",
    method: "dictionary",
    cracked: false,
    plaintext: null,
    timedOut: false,
    timeMs: 100,
    ...overrides,
  };
}

const heuristic = {
  score: 0 as const,
  label: "Very Weak" as const,
  guesses: 100,
  crackTimeDisplay: "less than a second",
  suggestions: ["Add more words that are less common."],
};

test("buildVerdict: dictionary crack overrides the generic heuristic suggestion", () => {
  const verdict = buildVerdict(
    heuristic,
    [attack({ cracked: true, plaintext: "password", timeMs: 200 })],
    8
  );
  assert.match(verdict.headline, /Cracked by hashcat/);
  assert.match(verdict.headline, /common password lists/);
  assert.ok(
    !verdict.suggestions.includes("Add more words that are less common."),
    "should not fall back to the vague zxcvbn suggestion once a real crack happened"
  );
});

test("buildVerdict: brute-force crack calls out the password length", () => {
  const verdict = buildVerdict(
    heuristic,
    [attack({ tool: "hashcat", method: "brute-force", cracked: true, timeMs: 3000 })],
    5
  );
  assert.match(verdict.headline, /brute force/);
  assert.match(verdict.suggestions[0], /5 characters/);
});

test("buildVerdict: nothing cracked falls back to the heuristic estimate, with a caveat", () => {
  const verdict = buildVerdict(
    heuristic,
    [attack({ cracked: false }), attack({ tool: "john", method: "dictionary-crosscheck" })],
    20
  );
  assert.match(verdict.headline, /Not cracked/);
  assert.match(verdict.headline, /less than a second/);
  assert.match(verdict.headline, /inconclusive/);
  assert.deepEqual(verdict.suggestions, heuristic.suggestions);
});
