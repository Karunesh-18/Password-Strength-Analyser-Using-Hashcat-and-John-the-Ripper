export type CrackParseResult = {
  cracked: boolean;
  plaintext: string | null;
};

/**
 * hashcat is run with `-o <outfile>` (format "hash:plaintext"). If the
 * outfile has a line, the hash was cracked. Reading the outfile is far more
 * reliable than scraping hashcat's human-formatted status output.
 */
export function parseHashcatOutfile(content: string): CrackParseResult {
  const line = content.split(/\r?\n/).find((l) => l.trim().length > 0);
  if (!line) return { cracked: false, plaintext: null };
  const idx = line.lastIndexOf(":");
  if (idx === -1) return { cracked: false, plaintext: null };
  return { cracked: true, plaintext: line.slice(idx + 1) };
}

/**
 * Parses the stdout of `john --format=<fmt> --show <hashfile>`.
 * Expected shape:
 *   testuser:plaintext
 *
 * 1 password hash cracked, 0 left
 */
export function parseJohnShowOutput(stdout: string): CrackParseResult {
  const lines = stdout.split(/\r?\n/).map((l) => l.trim());
  const summary = lines.find((l) => /password hash(es)? cracked/i.test(l));
  const crackedCount = summary ? parseInt(summary, 10) || 0 : 0;

  if (!summary || crackedCount < 1) {
    return { cracked: false, plaintext: null };
  }

  const credLine = lines.find(
    (l) => l.includes(":") && !/password hash(es)? cracked/i.test(l)
  );
  if (!credLine) return { cracked: true, plaintext: null };

  const idx = credLine.indexOf(":");
  return { cracked: true, plaintext: credLine.slice(idx + 1) };
}
