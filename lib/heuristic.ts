import { ZxcvbnFactory } from "@zxcvbn-ts/core";
import * as zxcvbnCommonPackage from "@zxcvbn-ts/language-common";
import * as zxcvbnEnPackage from "@zxcvbn-ts/language-en";

const zxcvbn = new ZxcvbnFactory({
  dictionary: {
    ...zxcvbnCommonPackage.dictionary,
    ...zxcvbnEnPackage.dictionary,
  },
  graphs: zxcvbnCommonPackage.adjacencyGraphs,
  translations: zxcvbnEnPackage.translations,
});

export type HeuristicResult = {
  score: 0 | 1 | 2 | 3 | 4;
  label: "Very Weak" | "Weak" | "Fair" | "Strong" | "Very Strong";
  guesses: number;
  crackTimeDisplay: string;
  suggestions: string[];
};

const LABELS = ["Very Weak", "Weak", "Fair", "Strong", "Very Strong"] as const;

// zxcvbn only recognizes a word/name as weak if it's in one of its bundled
// dictionaries (common passwords, English words, mostly Western first
// names) — a name like "Karunesh" isn't in there, so zxcvbn scores it as
// high-entropy random text instead of what it actually is. This catches
// the *shape* instead: a word-like run of letters followed by a short
// (1-4 digit) number, with an optional separator — the single most common
// human password pattern (name/word + birth year/lucky number), and
// exactly what hashcat/John rule-based attacks are built to generate from
// a base wordlist. Independent of whether the letters are a real dictionary
// hit, this shape is never something a password generator would produce,
// so treating it as weak is the safe assumption.
const NAME_PLUS_NUMBER = /^[a-zA-Z]{3,}[-_. ]?\d{1,4}$/;

/** Instant heuristic strength score (entropy/pattern-based, no cracking involved). */
export function scorePassword(password: string): HeuristicResult {
  const result = zxcvbn.check(password);
  let score = result.score;
  const suggestions = [...result.feedback.suggestions];

  if (NAME_PLUS_NUMBER.test(password) && score > 1) {
    score = 1;
    suggestions.unshift(
      "Follows the \"word + short number\" pattern (e.g. a name plus a birth year or lucky number) — one of the most common real-world passwords, and a direct target for rule-based dictionary attacks even when the word itself isn't a known dictionary entry."
    );
  }

  return {
    score,
    label: LABELS[score],
    guesses: result.guesses,
    crackTimeDisplay: result.crackTimes.offlineSlowHashingXPerSecond.display,
    suggestions,
  };
}
