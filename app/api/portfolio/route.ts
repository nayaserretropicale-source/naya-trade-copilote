import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getUserPortfolio, unauthorized } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await getUserPortfolio(req);
  if (!auth) return unauthorized();
  const { portfolio, settings } = auth;
  const { data: holdings } = await supabaseAdmin.from("holdings").select("*").eq("portfolio_id", portfolio.id);
  return NextResponse.json({ portfolio, settings, holdings: holdings ?? [] });
}
