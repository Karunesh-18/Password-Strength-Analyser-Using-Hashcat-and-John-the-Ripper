"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Nav } from "@/components/nav";
import { ParticleBackground } from "@/components/particle-background";

type LogEntry = {
  _id: string;
  password: string;
  algo: string;
  heuristic: { score: 0 | 1 | 2 | 3 | 4; label: string };
  verdict: { headline: string };
  attacks: { cracked: boolean }[];
  loggedAt: number;
};

export default function History() {
  const [logs, setLogs] = useState<LogEntry[] | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/history").then(async (res) => {
      const data = await res.json();
      if (!res.ok) {
        setStorageError(data.error ?? "Could not reach the log.");
        return;
      }
      setLogs(data.logs);
    });
  }, []);

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
              analysis_log.exe
            </h1>
            <p className="text-muted-foreground">
              Every password run through the analyzer, persisted when
              storage is configured.
            </p>
          </motion.div>

          {storageError ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
              {storageError}
            </div>
          ) : (
            <div className="space-y-2">
              {logs?.map((log) => {
                const cracked = log.attacks.some((a) => a.cracked);
                return (
                  <div
                    key={log._id}
                    className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm"
                  >
                    <div className="space-y-0.5">
                      <p className="font-mono">{log.password}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(log.loggedAt).toLocaleString()} · {log.algo} ·{" "}
                        {log.heuristic.label}
                      </p>
                    </div>
                    <Badge variant={cracked ? "destructive" : "default"}>
                      {cracked ? "Cracked" : "Not cracked"}
                    </Badge>
                  </div>
                );
              })}
              {logs?.length === 0 && (
                <p className="text-sm text-muted-foreground">No analyses logged yet.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
