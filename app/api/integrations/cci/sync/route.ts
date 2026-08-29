import { NextResponse } from "next/server";
import { readBearerToken } from "@/lib/cci/auth";
import { CciSyncError, syncCciProducts } from "@/lib/cci/sync-service";
import { SupabaseCciSyncRepository } from "@/lib/cci/supabase-repository";
import { validateCciSyncPayload } from "@/lib/cci/validation";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 2_000_000;

export async function POST(request: Request) {
  const token = readBearerToken(request.headers.get("authorization"));
  if (!token) return NextResponse.json({ error: "Bearer token obrigatório." }, { status: 401 });

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Lote muito grande." }, { status: 413 });
  }

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Lote muito grande." }, { status: 413 });
  }

  let input: unknown;
  try {
    input = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const validation = validateCciSyncPayload(input);
  if (!validation.success) {
    return NextResponse.json({ error: validation.message }, { status: 400 });
  }

  try {
    const summary = await syncCciProducts(token, validation.data, new SupabaseCciSyncRepository());
    return NextResponse.json(summary);
  } catch (error) {
    if (error instanceof CciSyncError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("CCI sync failed", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Não foi possível sincronizar os produtos CCI." }, { status: 500 });
  }
}
