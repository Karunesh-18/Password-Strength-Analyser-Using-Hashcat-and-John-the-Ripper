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
            <Badge variant={anyCracked ? "destructive" : "default"}>
              {anyCracked ? "Cracked" : "Held (within time budget)"}
            </Badge>
          </div>
          <CardDescription className="font-mono text-xs break-all">
            {result.algo.toUpperCase()}: {result.hash}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <StrengthMeter score={result.heuristic.score} label={result.heuristic.label} />
          <p className="text-sm text-muted-foreground">
            Estimated offline crack time (heuristic): {result.heuristic.crackTimeDisplay}
          </p>

          <Separator />

          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Real-world attack results</h4>
            {result.attacks.map((attack, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <span>{METHOD_LABEL[attack.method]}</span>
                <span className="flex items-center gap-2">
                  {attack.error ? (
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
            ))}
          </div>

          {result.heuristic.suggestions.length > 0 && (
            <>
              <Separator />
              <div>
                <h4 className="text-sm font-semibold">Suggestions</h4>
                <ul className="mt-1 list-inside list-disc text-sm text-muted-foreground">
                  {result.heuristic.suggestions.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
