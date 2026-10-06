import type { AttackOutcome } from "./crack";
import type { HeuristicResult } from "./heuristic";

export type Verdict = {
  headline: string;
  suggestions: string[];
};

const TOOL_NAME: Record<AttackOutcome["tool"], string> = {
  hashcat: "hashcat",
  john: "John the Ripper",
};

/**
 * Combines the heuristic score with what actually happened in the real
 * hashcat/John runs into one honest sentence, instead of three disconnected
 * numbers (zxcvbn's theoretical estimate, and each tool's own run time).
 *
 * Deliberately overrides zxcvbn's generic pattern-feedback ("Add more words
 * that are less common") when a real crack happened — that message reads as
 * mild advice when the password was, in fact, just cracked outright.
 */
export function buildVerdict(
  heuristic: HeuristicResult,
  attacks: AttackOutcome[],
  passwordLength: number
): Verdict {
  const cracked = attacks.filter((a) => a.cracked);

  if (cracked.length > 0) {
    const tools = [...new Set(cracked.map((a) => TOOL_NAME[a.tool]))];
    const viaDictionary = cracked.some(
      (a) => a.method === "dictionary" || a.method === "dictionary-crosscheck"
    );
    const viaBruteForce = cracked.some((a) => a.method === "brute-force");
    const fastestMs = Math.min(...cracked.map((a) => a.timeMs));

    const headline = viaDictionary
      ? `Cracked by ${tools.join(" and ")} in ${(fastestMs / 1000).toFixed(1)}s — this exact password is sitting in common password lists, so it's one of the first things any real attacker's dictionary attack tries.`
      : `Cracked by ${tools.join(" and ")} via brute force in ${(fastestMs / 1000).toFixed(1)}s — at ${passwordLength} characters, every combination was exhausted almost immediately.`;

    const suggestions: string[] = [];
    if (viaDictionary) {
      suggestions.push(
        "Stop reusing known/common passwords — pick something a wordlist wouldn't contain, ideally from a password manager's generator."
      );
    }
    if (viaBruteForce) {
      suggestions.push(
        `Go longer: ${passwordLength} characters is short enough to brute-force in seconds. Aim for 14+ characters.`
      );
    }
    return { headline, suggestions };
  }

  // Nothing cracked it for real within the time budget — be explicit that
  // this is a small demo wordlist, not proof the password is actually safe.
  const headline = `Not cracked by our small common-password dictionary or a time-boxed brute-force attempt. The pattern-based model estimates ~${heuristic.crackTimeDisplay} to crack offline — but real attackers run wordlists with billions of entries, so treat "not cracked here" as inconclusive, not safe.`;

  return { headline, suggestions: heuristic.suggestions };
}
