import { NextResponse } from "next/server";
import { revealEntry } from "@/lib/vault";

// Decrypts and returns the plaintext once. Never cached, never logged.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const password = await revealEntry(id);
    return NextResponse.json({ password });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 503 });
  }
}
