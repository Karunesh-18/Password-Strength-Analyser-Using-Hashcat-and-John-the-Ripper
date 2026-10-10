import { NextResponse } from "next/server";
import { analyzeEntryForReal } from "@/lib/vault";

// Runs a real hashcat/John attack against the entry's password - same
// pipeline /api/analyze uses, just sourced from the vault. Can take up to
// the existing ~40s crack time budget.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const verdict = await analyzeEntryForReal(id);
    return NextResponse.json({ verdict });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 503 });
  }
}
