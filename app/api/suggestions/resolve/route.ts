import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { id, decision } = await req.json();
    if (!id || !["validate", "reject"].includes(decision)) {
      return NextResponse.json({ error: "Requete invalide" }, { status: 400 });
    }

    const { data: sug } = await supabaseAdmin.from("suggestions").select("*").eq("id", id).single();
    if (!sug || sug.status !== "pending") {
      return NextResponse.json({ error: "Suggestion introuvable ou deja traitee" }, { status: 404 });
    }

    if (decision === "reject") {
      await supabaseAdmin.from("suggestions").update({ status: "rejected", resolved_at: new Date().toISOString() }).eq("id", id);
      return NextResponse.json({ ok: true, executed: false });
    }

    if (sug.action !== "buy" || !sug.amount) {
      await supabaseAdmin.from("suggestions").update({ status: "validated", resolved_at: new Date().toISOString() }).eq("id", id);
      return NextResponse.json({ ok: true, executed: false });
    }

    const { data: portfolio } = await supabaseAdmin.from("portfolios").select("*").eq("id", sug.portfolio_id).single();
    if (!portfolio) return NextResponse.json({ error: "Portefeuille introuvable" }, { status: 404 });
    const { data: settings } = await supabaseAdmin.from("settings").select("*").eq("portfolio_id", portfolio.id).single();

    const maxPerTrade = settings?.max_per_trade ?? 50;
    if (settings?.agents_paused) return NextResponse.json({ error: "Coupe-circuit active" }, { status: 403 });

    let amountUsd = Number(sug.amount);
    if (amountUsd > maxPerTrade) amountUsd = maxPerTrade;
    if (amountUsd > portfolio.cash_balance) return NextResponse.json({ error: "Liquidites insuffisantes" }, { status: 400 });

    const token = process.env.FINNHUB_API_KEY;
    const q = await fetch(`https://finnhub.io/api/v1/quote?symbol=${sug.symbol}&token=${token}`, { cache: "no-store" });
    const quote = await q.json();
    const price = quote.c;
    if (!price) return NextResponse.json({ error: "Prix indisponible" }, { status: 404 });

    const quantity = amountUsd / price;

    await supabaseAdmin.from("transactions").insert({
      portfolio_id: portfolio.id, symbol: sug.symbol, side: "buy",
      quantity, price, total: amountUsd, source: "suggestion",
    });

    const { data: existing } = await supabaseAdmin.from("holdings").select("*")
      .eq("portfolio_id", portfolio.id).eq("symbol", sug.symbol).maybeSingle();
    if (existing) {
      const newQty = Number(existing.quantity) + quantity;
      const newAvg = (existing.quantity * existing.avg_price + quantity * price) / newQty;
      await supabaseAdmin.from("holdings").update({ quantity: newQty, avg_price: newAvg, updated_at: new Date().toISOString() }).eq("id", existing.id);
    } else {
      await supabaseAdmin.from("holdings").insert({ portfolio_id: portfolio.id, symbol: sug.symbol, name: sug.name ?? sug.symbol, quantity, avg_price: price });
    }

    await supabaseAdmin.from("portfolios").update({ cash_balance: portfolio.cash_balance - amountUsd }).eq("id", portfolio.id);
    await supabaseAdmin.from("suggestions").update({ status: "validated", resolved_at: new Date().toISOString() }).eq("id", id);

    return NextResponse.json({ ok: true, executed: true });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
