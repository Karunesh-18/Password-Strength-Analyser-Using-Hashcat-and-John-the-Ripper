import { NextResponse } from "next/server";
import { hashPassword, type HashAlgo } from "@/lib/hash";
import { scorePassword } from "@/lib/heuristic";
import { runCrackers } from "@/lib/crack";
import { buildVerdict } from "@/lib/verdict";

const VALID_ALGOS: HashAlgo[] = ["md5", "sha1", "sha256", "ntlm"];
const MAX_PASSWORDS_PER_REQUEST = 5; // keep total cracking time bounded

export async function POST(request: Request) {
  let body: { passwords?: unknown; algo?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const algo = body.algo;
  if (typeof algo !== "string" || !VALID_ALGOS.includes(algo as HashAlgo)) {
    return NextResponse.json(
      { error: `algo must be one of ${VALID_ALGOS.join(", ")}` },
      { status: 400 }
    );
  }

  const passwords = body.passwords;
  if (
    !Array.isArray(passwords) ||
    passwords.length === 0 ||
    !passwords.every((p) => typeof p === "string" && p.length > 0)
  ) {
    return NextResponse.json(
      { error: "passwords must be a non-empty array of non-empty strings" },
      { status: 400 }
    );
  }
  if (passwords.length > MAX_PASSWORDS_PER_REQUEST) {
    return NextResponse.json(
      { error: `at most ${MAX_PASSWORDS_PER_REQUEST} passwords per request` },
      { status: 400 }
    );
  }

  const results = await Promise.all(
    (passwords as string[]).map(async (password) => {
      const heuristic = scorePassword(password);
      const hash = hashPassword(password, algo as HashAlgo);
      const attacks = await runCrackers(hash, algo as HashAlgo, password.length);
      const verdict = buildVerdict(heuristic, attacks, password.length);
      return {
        passwordLength: password.length,
        algo,
        hash,
        heuristic,
        attacks,
        verdict,
      };
    })
  );

  return NextResponse.json({ results });
}
