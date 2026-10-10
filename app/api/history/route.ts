import { NextResponse } from "next/server";
import { listRecentLogs } from "@/lib/analysis-log";

export async function GET() {
  try {
    const logs = await listRecentLogs();
    return NextResponse.json({ logs });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 503 });
  }
}
