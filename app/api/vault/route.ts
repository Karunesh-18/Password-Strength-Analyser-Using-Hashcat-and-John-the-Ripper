import { NextResponse } from "next/server";
import { addEntry, listEntries } from "@/lib/vault";

export async function GET() {
  try {
    const entries = await listEntries();
    return NextResponse.json({ entries });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 503 });
  }
}

export async function POST(request: Request) {
  let body: { label?: unknown; username?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.label !== "string" || body.label.length === 0) {
    return NextResponse.json({ error: "label is required" }, { status: 400 });
  }
  if (typeof body.password !== "string" || body.password.length === 0) {
    return NextResponse.json({ error: "password is required" }, { status: 400 });
  }
  if (body.username !== undefined && typeof body.username !== "string") {
    return NextResponse.json({ error: "username must be a string" }, { status: 400 });
  }

  try {
    const entry = await addEntry({
      label: body.label,
      username: body.username,
      password: body.password,
    });
    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 503 });
  }
}
