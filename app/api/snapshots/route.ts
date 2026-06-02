import { NextResponse } from "next/server";
import { recordSnapshot, getSnapshots } from "@/lib/snapshot";

export const maxDuration = 60;

export async function POST() {
  try {
    await recordSnapshot();
    const data = await getSnapshots();
    return NextResponse.json(data);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}

export async function GET() {
  try {
    const data = await getSnapshots();
    return NextResponse.json(data);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
