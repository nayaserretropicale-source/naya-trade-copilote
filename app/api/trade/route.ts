import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const symbol = String(body.symbol ?? "").toUpperCase().trim();
    const amountXof = Number(body.amountXof);

    if (!symbol || !amountXof || amountXof <= 0) {
      return NextResponse.json({ error: "Symbole ou montant invalide" }, { status: 400 });
    }

    // 1. Portefeuille + réglages
    const { data: portfolio } = await supabaseAdmin
      .from("portfolios").select("*").limit(1).single();
    if (!portfolio) {
      return NextResponse.json({ error: "Portefeuille introuvable" }, { status: 404 });
    }
    const { data: settings } = await supabaseAdmin
      .from("settings").select("*").eq("portfolio_id", portfolio.id).single();

    const rate = settings?.usd_to_xof ?? 600;
    const maxPerTrade = settings?.max_per_trade ?? 50;
    const paused = settings?.agents_paused ?? false;
    const amountUsd = amountXof / rate;

    // 2. Garde-fous
    if (paused) {
      return NextResponse.json({ error: "Coupe-circuit activé — trading en pause" }, { status: 403 });
    }
    if (amountUsd > maxPerTrade) {
      const maxXof = Math.round(maxPerTrade * rate).toLocaleString("fr-FR");
      return NextResponse.json({ error: `Au-dessus du plafond (${maxXof} FCFA max par opération)` }, { status: 400 });
    }
    if (amountUsd > portfolio.cash_balance) {
      return NextResponse.json({ error: "Liquidités insuffisantes" }, { status: 400 });
    }

    // 3. Prix réel via Finnhub
    const token = process.env.FINNHUB_API_KEY;
    const q = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${token}`, { cache: "no-store" });
    const quote = await q.json();
    const price = quote.c;
    if (!price) {
      return NextResponse.json({ error: "Symbole introuvable sur le marché" }, { status: 404 });
    }

    // 4. Quantité (fractions autorisées en simulation)
    const quantity = amountUsd / price;

    // 5. Journal de la transaction
    await supabaseAdmin.from("transactions").insert({
      portfolio_id: portfolio.id,
      symbol, side: "buy", quantity, price, total: amountUsd, source: "manual",
    });

    // 6. Mise à jour de la position (prix d'achat moyen)
    const { data: existing } = await supabaseAdmin
      .from("holdings").select("*")
      .eq("portfolio_id", portfolio.id).eq("symbol", symbol).maybeSingle();

    if (existing) {
      const newQty = Number(existing.quantity) + quantity;
      const newAvg = (existing.quantity * existing.avg_price + quantity * price) / newQty;
      await supabaseAdmin.from("holdings")
        .update({ quantity: newQty, avg_price: newAvg, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await supabaseAdmin.from("holdings").insert({
        portfolio_id: portfolio.id, symbol, name: symbol, quantity, avg_price: price,
      });
    }

    // 7. Débit des liquidités
    const newCash = portfolio.cash_balance - amountUsd;
    await supabaseAdmin.from("portfolios").update({ cash_balance: newCash }).eq("id", portfolio.id);

    return NextResponse.json({ ok: true, symbol, price, quantity, newCash });
  } catch {
    return NextResponse.json({ error: "Erreur pendant l'achat" }, { status: 500 });
  }
}
