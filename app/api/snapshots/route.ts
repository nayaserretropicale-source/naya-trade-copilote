import { NextRequest, NextResponse } from "next/server";
import { recordSnapshot, getSnapshots } from "@/lib/snapshot";
import { getUserPortfolio, unauthorized } from "@/lib/auth";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = await getUserPortfolio(req);
  if (!auth) return unauthorized();
  try { await recordSnapshot(auth.portfolio.id); return NextResponse.json(await getSnapshots(auth.portfolio.id)); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
}

export async function GET(req: NextRequest) {
  const auth = await getUserPortfolio(req);
  if (!auth) return unauthorized();
  try { return NextResponse.json(await getSnapshots(auth.portfolio.id)); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
}
