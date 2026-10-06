"use client";

import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { StrengthMeter } from "@/components/strength-meter";

type Attack = {
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

export type AnalysisResult = {
  passwordLength: number;
  algo: string;
  hash: string;
  heuristic: {
    score: 0 | 1 | 2 | 3 | 4;
    label: string;
    crackTimeDisplay: string;
    suggestions: string[];
  };
  attacks: Attack[];
  verdict: {
    headline: string;
    suggestions: string[];
  };
};

const METHOD_LABEL: Record<Attack["method"], string> = {
  dictionary: "hashcat — dictionary attack",
  "brute-force": "hashcat — brute-force attack",
  "dictionary-crosscheck": "John the Ripper — dictionary cross-check",
};

export function ResultsCard({ result, index }: { result: AnalysisResult; index: number }) {
  const anyCracked = result.attacks.some((a) => a.cracked);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
    >
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Password #{index + 1}</CardTitle>
            <Badge
              variant={anyCracked ? "destructive" : "default"}
              className="glow-box"
            >
              {anyCracked ? "Cracked" : "Not cracked"}
            </Badge>
          </div>
          <CardDescription className="font-mono text-xs break-all">
            {result.algo.toUpperCase()}: {result.hash}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <StrengthMeter score={result.heuristic.score} label={result.heuristic.label} />

          <p className="text-sm">{result.verdict.headline}</p>

          {result.verdict.suggestions.length > 0 && (
            <ul className="list-inside list-disc text-sm text-muted-foreground">
              {result.verdict.suggestions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}

          <Separator />

          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Attack details</h4>
            {result.attacks.map((attack, i) => (
              <div key={i} className="rounded-md border px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>{METHOD_LABEL[attack.method]}</span>
                  <span className="flex items-center gap-2">
                    {attack.skipped ? (
                      <Badge variant="outline">skipped</Badge>
                    ) : attack.error ? (
                      <Badge variant="outline">tool error</Badge>
                    ) : attack.cracked ? (
                      <Badge variant="destructive">
                        cracked: &quot;{attack.plaintext}&quot; in {(attack.timeMs / 1000).toFixed(1)}s
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        {attack.timedOut ? "not cracked (time budget hit)" : "not cracked"}
                      </Badge>
                    )}
                  </span>
                </div>
                {attack.skipReason && (
                  <p className="mt-1 text-xs text-muted-foreground">{attack.skipReason}</p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
