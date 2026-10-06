"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ResultsCard, type AnalysisResult } from "@/components/results-card";
import { ParticleBackground } from "@/components/particle-background";

const ALGOS = [
  { value: "sha256", label: "SHA-256" },
  { value: "md5", label: "MD5" },
  { value: "sha1", label: "SHA-1" },
  { value: "ntlm", label: "NTLM" },
] as const;

export default function Home() {
  const [input, setInput] = useState("");
  const [algo, setAlgo] = useState<string>("sha256");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<AnalysisResult[] | null>(null);

  async function handleAnalyze() {
    const passwords = input
      .split("\n")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    if (passwords.length === 0) {
      setError("Enter at least one password to test.");
      return;
    }

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passwords, algo }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Analysis failed.");
      } else {
        setResults(data.results);
      }
    } catch {
      setError("Could not reach the analysis API.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <ParticleBackground />
      <div className="min-h-screen bg-zinc-50 px-4 py-10 dark:bg-black sm:px-8">
        <div className="mx-auto max-w-3xl space-y-8">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-2"
          >
            <h1 className="text-3xl font-bold tracking-tight">
              Password Strength Analysis
            </h1>
            <p className="text-muted-foreground">
              Hashes your input and runs real hashcat + John the Ripper dictionary
              / brute-force attacks (time-boxed) alongside an instant heuristic
              score.
            </p>
            <p className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-700 dark:text-yellow-400">
              ⚠️ Only enter passwords you own for testing — never real account
              credentials belonging to someone else. Nothing is stored.
            </p>
          </motion.div>

          <div className="space-y-3 rounded-lg border bg-background p-4">
            <label className="text-sm font-medium" htmlFor="passwords">
              Test passwords (one per line, up to 5)
            </label>
            <Textarea
              id="passwords"
              placeholder={"password123\nMyS3cur3P@ssphrase!"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={5}
            />
            <div className="flex items-center gap-3">
              <Select value={algo} onValueChange={(v) => v && setAlgo(v)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALGOS.map((a) => (
                    <SelectItem key={a.value} value={a.value}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleAnalyze} disabled={loading}>
                {loading ? "Analyzing… (may take up to ~40s)" : "Analyze"}
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          {results && (
            <div className="space-y-4">
              {results.map((r, i) => (
                <ResultsCard key={i} result={r} index={i} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
