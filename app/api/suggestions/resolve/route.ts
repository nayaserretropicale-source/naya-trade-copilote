import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getUserPortfolio, unauthorized } from "@/lib/auth";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

export async function POST(req: NextRequest) {
  try {
    const auth = await getUserPortfolio(req);
    if (!auth) return unauthorized();
    const { portfolio, settings } = auth;
    const { id, decision } = await req.json();
    if (!id || !["validate", "reject"].includes(decision)) return NextResponse.json({ error: "Requete invalide" }, { status: 400 });

    const { data: sug } = await supabaseAdmin.from("suggestions").select("*").eq("id", id).single();
    if (!sug || sug.status !== "pending") return NextResponse.json({ error: "Suggestion introuvable ou deja traitee" }, { status: 404 });
    if (sug.portfolio_id !== portfolio.id) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });

    if (decision === "reject") {
      await supabaseAdmin.from("suggestions").update({ status: "rejected", resolved_at: new Date().toISOString() }).eq("id", id);
      return NextResponse.json({ ok: true, executed: false });
    }

    const token = process.env.FINNHUB_API_KEY;

    if (sug.action === "buy" && sug.amount) {
      const maxPerTrade = settings?.max_per_trade ?? 50;
      if (settings?.agents_paused) return NextResponse.json({ error: "Coupe-circuit actif" }, { status: 403 });
      const amountUsd = Math.min(Number(sug.amount), maxPerTrade);
      const q = await fetchWithTimeout(`https://finnhub.io/api/v1/quote?symbol=${sug.symbol}&token=${token}`, { cache: "no-store" });
      const quote = await q.json();
      const price = quote.c;
      if (!price) return NextResponse.json({ error: "Prix indisponible" }, { status: 404 });
      const quantity = amountUsd / price;

      const { error } = await supabaseAdmin.rpc("execute_buy", {
        p_portfolio_id: portfolio.id,
        p_symbol: sug.symbol,
        p_name: sug.name ?? sug.symbol,
        p_quantity: quantity,
        p_price: price,
        p_amount: amountUsd,
        p_source: "suggestion",
        p_reason: null,
      });
      if (error) {
        if (error.message?.includes("insufficient_cash")) return NextResponse.json({ error: "Liquidites insuffisantes" }, { status: 400 });
        throw new Error(error.message);
      }
      await supabaseAdmin.from("suggestions").update({ status: "validated", resolved_at: new Date().toISOString() }).eq("id", id);
      return NextResponse.json({ ok: true, executed: true });
    }

    if (sug.action === "sell") {
      const frac = sug.fraction && sug.fraction > 0 && sug.fraction <= 1 ? Number(sug.fraction) : 1;
      const { data: holding } = await supabaseAdmin.from("holdings").select("id,quantity").eq("portfolio_id", portfolio.id).eq("symbol", sug.symbol).maybeSingle();
      if (!holding || holding.quantity <= 0) {
        await supabaseAdmin.from("suggestions").update({ status: "validated", resolved_at: new Date().toISOString() }).eq("id", id);
        return NextResponse.json({ ok: true, executed: false });
      }
      const q = await fetchWithTimeout(`https://finnhub.io/api/v1/quote?symbol=${sug.symbol}&token=${token}`, { cache: "no-store" });
      const quote = await q.json();
      const price = quote.c;
      if (!price) return NextResponse.json({ error: "Prix indisponible" }, { status: 404 });

      const { error } = await supabaseAdmin.rpc("execute_sell", {
        p_portfolio_id: portfolio.id,
        p_symbol: sug.symbol,
        p_fraction: frac,
        p_price: price,
        p_source: "suggestion",
        p_reason: null,
      });
      if (error) {
        if (error.message?.includes("position_not_found")) {
          await supabaseAdmin.from("suggestions").update({ status: "validated", resolved_at: new Date().toISOString() }).eq("id", id);
          return NextResponse.json({ ok: true, executed: false });
        }
        throw new Error(error.message);
      }
      await supabaseAdmin.from("suggestions").update({ status: "validated", resolved_at: new Date().toISOString() }).eq("id", id);
      return NextResponse.json({ ok: true, executed: true });
    }

    await supabaseAdmin.from("suggestions").update({ status: "validated", resolved_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ ok: true, executed: false });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
