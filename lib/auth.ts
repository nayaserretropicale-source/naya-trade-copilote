import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function getUserPortfolio(req: NextRequest) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data: userData, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !userData?.user) return null;
  const userId = userData.user.id;
  const { data: portfolio } = await supabaseAdmin.from("portfolios").select("*").eq("user_id", userId).limit(1).maybeSingle();
  if (!portfolio) return null;
  const { data: settings } = await supabaseAdmin.from("settings").select("*").eq("portfolio_id", portfolio.id).maybeSingle();
  return { userId, portfolio, settings };
}

export function unauthorized() {
  return NextResponse.json({ error: "Non connecté" }, { status: 401 });
}
