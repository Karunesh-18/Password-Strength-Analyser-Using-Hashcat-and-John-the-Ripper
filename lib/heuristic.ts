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

/** Instant heuristic strength score (entropy/pattern-based, no cracking involved). */
export function scorePassword(password: string): HeuristicResult {
  const result = zxcvbn.check(password);
  return {
    score: result.score,
    label: LABELS[result.score],
    guesses: result.guesses,
    crackTimeDisplay: result.crackTimes.offlineSlowHashingXPerSecond.display,
    suggestions: result.feedback.suggestions,
  };
}
