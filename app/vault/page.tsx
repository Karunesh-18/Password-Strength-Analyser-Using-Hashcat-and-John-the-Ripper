"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Nav } from "@/components/nav";
import { StrengthMeter } from "@/components/strength-meter";
import { ParticleBackground } from "@/components/particle-background";
import type { VaultEntry } from "@/lib/vault";

export default function Vault() {
  const [entries, setEntries] = useState<VaultEntry[] | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/vault");
    const data = await res.json();
    if (!res.ok) {
      setStorageError(data.error ?? "Could not reach the vault.");
      return;
    }
    setStorageError(null);
    setEntries(data.entries);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd() {
    if (!label || !password) {
      setError("Label and password are required.");
      return;
    }
    setError(null);
    const res = await fetch("/api/vault", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, username: username || undefined, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not save entry.");
      return;
    }
    setLabel("");
    setUsername("");
    setPassword("");
    load();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/vault/${id}`, { method: "DELETE" });
    load();
  }

  async function handleReveal(id: string) {
    const res = await fetch(`/api/vault/${id}/reveal`, { method: "POST" });
    const data = await res.json();
    if (res.ok) setRevealed((prev) => ({ ...prev, [id]: data.password }));
  }

  async function handleCopy(id: string) {
    let plain = revealed[id];
    if (!plain) {
      const res = await fetch(`/api/vault/${id}/reveal`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) return;
      plain = data.password;
    }
    await navigator.clipboard.writeText(plain);
  }

  async function handleTest(id: string) {
    setTesting(id);
    await fetch(`/api/vault/${id}/analyze`, { method: "POST" });
    await load();
    setTesting(null);
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
              password_vault.exe
            </h1>
            <p className="text-muted-foreground">
              Stores real passwords encrypted at rest (AES-256-GCM) and grades
              every one — unlike a plain password manager, you can also throw
              a real hashcat/John attack at any saved entry on demand.
            </p>
          </motion.div>

          {storageError ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
              {storageError}
            </div>
          ) : (
            <>
              <div className="space-y-3 rounded-lg border bg-card p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Input
                    placeholder="Label (e.g. GitHub)"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                  />
                  <Input
                    placeholder="Username (optional)"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                  <Input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button onClick={handleAdd} className="glow-box">
                  Save to vault
                </Button>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>

              <div className="space-y-4">
                {entries?.map((entry) => (
                  <div key={entry._id} className="space-y-3 rounded-lg border bg-card p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{entry.label}</p>
                        {entry.username && (
                          <p className="text-sm text-muted-foreground">{entry.username}</p>
                        )}
                      </div>
                      {entry.cracked !== undefined && (
                        <Badge variant={entry.cracked ? "destructive" : "default"} className="glow-box">
                          {entry.cracked ? "Cracked" : "Survived real attack"}
                        </Badge>
                      )}
                    </div>

                    <StrengthMeter score={entry.grade.score} label={entry.grade.label} />

                    <div className="flex items-center gap-2">
                      <code className="flex-1 rounded-md bg-muted px-3 py-2 font-mono text-sm">
                        {revealed[entry._id] ?? "•".repeat(12)}
                      </code>
                      <Button variant="outline" size="sm" onClick={() => handleReveal(entry._id)}>
                        Reveal
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleCopy(entry._id)}>
                        Copy
                      </Button>
                    </div>

                    {entry.lastVerdict && (
                      <p className="text-sm text-muted-foreground">{entry.lastVerdict.headline}</p>
                    )}

                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleTest(entry._id)}
                        disabled={testing === entry._id}
                      >
                        {testing === entry._id ? "Running real attack…" : "Run real crack test"}
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(entry._id)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
                {entries?.length === 0 && (
                  <p className="text-sm text-muted-foreground">No entries yet.</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
