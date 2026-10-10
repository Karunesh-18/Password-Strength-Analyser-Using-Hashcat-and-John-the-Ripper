"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Nav } from "@/components/nav";
import { StrengthMeter } from "@/components/strength-meter";
import { ParticleBackground } from "@/components/particle-background";
import { scorePassword } from "@/lib/heuristic";

const CHARSETS = {
  lower: "abcdefghijklmnopqrstuvwxyz",
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  digits: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{};:,.<>?",
} as const;

type SetKey = keyof typeof CHARSETS;

function generatePassword(length: number, sets: SetKey[]): string {
  const pool = sets.map((s) => CHARSETS[s]).join("");
  if (!pool) return "";
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, (b) => pool[b % pool.length]).join("");
}

export default function Generator() {
  const [length, setLength] = useState(16);
  const [sets, setSets] = useState<SetKey[]>(["lower", "upper", "digits", "symbols"]);
  const [password, setPassword] = useState("");
  const [copied, setCopied] = useState(false);

  const heuristic = useMemo(
    () => (password ? scorePassword(password) : null),
    [password]
  );

  function toggleSet(key: SetKey) {
    setSets((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  function handleGenerate() {
    setPassword(generatePassword(length, sets));
    setCopied(false);
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(password);
    setCopied(true);
  }

  return (
    <>
      <ParticleBackground />
      <div className="relative min-h-screen px-4 py-10 sm:px-8">
        <div className="mx-auto max-w-3xl space-y-8">
          <Nav />
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-2"
          >
            <h1 className="glow-text text-3xl font-bold tracking-tight text-primary">
              password_gen.exe
            </h1>
            <p className="text-muted-foreground">
              Generates a random password locally using the browser&apos;s
              CSPRNG. Nothing is sent anywhere.
            </p>
          </motion.div>

          <div className="space-y-4 rounded-lg border bg-card p-4">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium" htmlFor="length">
                Length
              </label>
              <Input
                id="length"
                type="number"
                min={4}
                max={128}
                value={length}
                onChange={(e) =>
                  setLength(
                    Math.min(128, Math.max(4, Number(e.target.value) || 0))
                  )
                }
                className="w-24"
              />
            </div>

            <div className="flex flex-wrap gap-4 text-sm">
              {(Object.keys(CHARSETS) as SetKey[]).map((key) => (
                <label key={key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={sets.includes(key)}
                    onChange={() => toggleSet(key)}
                    className="accent-primary"
                  />
                  {key}
                </label>
              ))}
            </div>

            <Button onClick={handleGenerate} disabled={sets.length === 0} className="glow-box">
              Generate
            </Button>
            {sets.length === 0 && (
              <p className="text-sm text-destructive">
                Pick at least one character set.
              </p>
            )}
          </div>

          {password && (
            <div className="space-y-4 rounded-lg border bg-card p-4">
              <div className="flex items-center gap-3">
                <code className="glow-text flex-1 overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-primary">
                  {password}
                </code>
                <Button variant="outline" onClick={handleCopy}>
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              {heuristic && (
                <StrengthMeter score={heuristic.score} label={heuristic.label} />
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
